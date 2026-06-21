import { NextResponse, type NextRequest } from "next/server";

import { adminAuth, adminDb } from "@/lib/server/firebaseAdmin";
import {
  advisorSetupError,
  checkAdvisorSetup,
} from "@/lib/server/advisorSetupGuard";
import { getLoginAttemptLockoutError } from "@/lib/server/loginAttemptLockout";
import { applyRateLimitHeaders, consumeRateLimit } from "@/lib/server/rateLimit";

export const runtime = "nodejs";

const LOOKUP_RATE_LIMIT = 180;
const LOOKUP_RATE_WINDOW_MS = 60_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type UserAccountType = "advisor" | "tipster";

type UserLookupSuccess = {
  ok: true;
  exists: boolean;
  email: string | null;
  name: string | null;
  accountType: UserAccountType | null;
};

type UserLookupError = {
  ok: false;
  error: string;
};

type UserCandidate = {
  docId: string;
  email: string;
  name: string | null;
  accountType: UserAccountType;
};

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeOptionalName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 200) : null;
}

function resolveAccountType(raw: Record<string, unknown>): UserAccountType {
  const value =
    typeof raw.accountType === "string"
      ? raw.accountType
      : typeof raw.userRole === "string"
        ? raw.userRole
        : "";
  return value.trim().toLowerCase() === "tipster" ? "tipster" : "advisor";
}

function getBearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
}

function pickBetterCandidate(
  current: UserCandidate,
  next: UserCandidate,
  lookupEmail: string
): UserCandidate {
  const currentCanonical = current.docId.toLowerCase() === lookupEmail ? 0 : 1;
  const nextCanonical = next.docId.toLowerCase() === lookupEmail ? 0 : 1;
  if (currentCanonical !== nextCanonical) {
    return currentCanonical < nextCanonical ? current : next;
  }

  const currentHasName = current.name ? 0 : 1;
  const nextHasName = next.name ? 0 : 1;
  if (currentHasName !== nextHasName) {
    return currentHasName < nextHasName ? current : next;
  }

  return current.docId.localeCompare(next.docId, "cs") <= 0 ? current : next;
}

function candidateFromRaw(
  docId: string,
  raw: Record<string, unknown> | null
): UserCandidate | null {
  if (!raw) return null;
  const email = normalizeEmail(raw.email) || normalizeEmail(docId);
  if (!email) return null;

  return {
    docId,
    email,
    name:
      normalizeOptionalName(raw.fullName) ||
      normalizeOptionalName(raw.name) ||
      null,
    accountType: resolveAccountType(raw),
  };
}

async function findUserByEmail(email: string): Promise<UserCandidate | null> {
  if (!adminDb) return null;
  const usersCol = adminDb.collection("users");
  const candidates = new Map<string, UserCandidate>();

  const directSnap = await usersCol.doc(email).get();
  if (directSnap.exists) {
    const candidate = candidateFromRaw(
      directSnap.id,
      (directSnap.data() as Record<string, unknown> | undefined) ?? null
    );
    if (candidate) {
      candidates.set(candidate.docId, candidate);
    }
  }

  const byEmailSnap = await usersCol.where("email", "==", email).limit(5).get();
  byEmailSnap.docs.forEach((docSnap) => {
    const candidate = candidateFromRaw(
      docSnap.id,
      (docSnap.data() as Record<string, unknown> | undefined) ?? null
    );
    if (candidate) {
      candidates.set(candidate.docId, candidate);
    }
  });

  let best: UserCandidate | null = null;
  candidates.forEach((candidate) => {
    best = best ? pickBetterCandidate(best, candidate, email) : candidate;
  });
  return best;
}

export async function GET(req: NextRequest) {
  try {
    if (!adminAuth || !adminDb) {
      return NextResponse.json(
        { ok: false, error: "Server není správně nakonfigurován." } satisfies UserLookupError,
        { status: 500 }
      );
    }

    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json(
        { ok: false, error: "Missing bearer token" } satisfies UserLookupError,
        { status: 401 }
      );
    }

    let decoded: Awaited<ReturnType<typeof adminAuth.verifyIdToken>>;
    try {
      decoded = await adminAuth.verifyIdToken(token, true);
    } catch (err: any) {
      const code = err?.code || "auth/invalid-token";
      const message = err?.message || "Invalid or expired token";
      return NextResponse.json(
        {
          ok: false,
          error: `Invalid or expired token (${code}): ${message}`,
        } satisfies UserLookupError,
        { status: 401 }
      );
    }

    const requesterEmail = normalizeEmail(decoded.email);
    if (!requesterEmail) {
      return NextResponse.json(
        { ok: false, error: "User e-mail missing in token" } satisfies UserLookupError,
        { status: 401 }
      );
    }
    const lockout = await getLoginAttemptLockoutError(req, requesterEmail);
    if (lockout) {
      const response = NextResponse.json(
        { ok: false, error: lockout.error } satisfies UserLookupError,
        { status: lockout.status }
      );
      response.headers.set("Retry-After", String(lockout.retryAfterSeconds));
      return response;
    }
    const setup = await checkAdvisorSetup({ email: requesterEmail, uid: decoded.uid });
    if (setup.accountType === "advisor" && setup.missing.length > 0) {
      const setupError = advisorSetupError(setup.missing);
      return NextResponse.json(
        { ok: false, error: setupError.error } satisfies UserLookupError,
        { status: setupError.status }
      );
    }

    const rateLimitResult = await consumeRateLimit({
      namespace: "api:user:lookup",
      key: requesterEmail,
      limit: LOOKUP_RATE_LIMIT,
      windowMs: LOOKUP_RATE_WINDOW_MS,
    });
    if (!rateLimitResult.allowed) {
      const response = NextResponse.json(
        { ok: false, error: "Příliš mnoho požadavků. Zkus to prosím za chvíli." },
        { status: 429 }
      );
      applyRateLimitHeaders(response.headers, rateLimitResult);
      return response;
    }

    const lookupEmail = normalizeEmail(req.nextUrl.searchParams.get("email"));
    if (!lookupEmail || !EMAIL_RE.test(lookupEmail)) {
      const response = NextResponse.json(
        { ok: false, error: "Parametr email má neplatný formát." } satisfies UserLookupError,
        { status: 400 }
      );
      applyRateLimitHeaders(response.headers, rateLimitResult);
      return response;
    }

    if (setup.accountType === "tipster") {
      const allowedEmails = new Set(
        [
          normalizeEmail(setup.profile?.tipRecipientEmail),
          normalizeEmail(setup.profile?.managerEmail),
        ].filter(Boolean)
      );
      if (!allowedEmails.has(lookupEmail)) {
        const response = NextResponse.json(
          { ok: false, error: "Tipařské účty nemají oprávnění prohledávat uživatelský adresář." } satisfies UserLookupError,
          { status: 403 }
        );
        applyRateLimitHeaders(response.headers, rateLimitResult);
        return response;
      }
    }

    const found = await findUserByEmail(lookupEmail);
    const response = NextResponse.json({
      ok: true,
      exists: Boolean(found),
      email: found?.email ?? null,
      name: found?.name ?? null,
      accountType: found?.accountType ?? null,
    } satisfies UserLookupSuccess);
    applyRateLimitHeaders(response.headers, rateLimitResult);
    return response;
  } catch (err) {
    console.error("GET /api/user/lookup failed", err);
    return NextResponse.json(
      { ok: false, error: "Nepodařilo se ověřit uživatele." } satisfies UserLookupError,
      { status: 500 }
    );
  }
}
