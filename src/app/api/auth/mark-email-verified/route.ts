import { NextResponse } from "next/server";

import { isAdminPanelEmail } from "@/lib/adminAccess";
import { getAdvisorSetupError } from "@/lib/server/advisorSetupGuard";
import { adminAuth } from "@/lib/server/firebaseAdmin";
import { getLoginAttemptLockoutError } from "@/lib/server/loginAttemptLockout";
import { applyRateLimitHeaders, consumeRateLimit } from "@/lib/server/rateLimit";

export const runtime = "nodejs";

const MARK_EMAIL_VERIFIED_RATE_LIMIT = 5;
const MARK_EMAIL_VERIFIED_WINDOW_MS = 60_000;

type MarkEmailVerifiedBody = {
  targetUid?: unknown;
  targetEmail?: unknown;
};

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token || null;
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value: unknown): string {
  return normalizeText(value).toLowerCase();
}

export async function POST(req: Request) {
  try {
    if (!adminAuth) {
      return NextResponse.json(
        { ok: false, error: "Server není nakonfigurovaný (Firebase Admin)." },
        { status: 500 }
      );
    }

    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json(
        { ok: false, error: "Missing bearer token" },
        { status: 401 }
      );
    }

    let decoded: Awaited<ReturnType<typeof adminAuth.verifyIdToken>>;
    try {
      decoded = await adminAuth.verifyIdToken(token, true);
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid or expired token" },
        { status: 401 }
      );
    }

    const adminUid = normalizeText(decoded.uid);
    const adminEmail = normalizeEmail(decoded.email);
    if (!adminUid || !adminEmail) {
      return NextResponse.json(
        { ok: false, error: "User identity missing in token" },
        { status: 400 }
      );
    }
    const lockout = getLoginAttemptLockoutError(req, adminEmail);
    if (lockout) {
      const response = NextResponse.json(
        { ok: false, error: lockout.error },
        { status: lockout.status }
      );
      response.headers.set("Retry-After", String(lockout.retryAfterSeconds));
      return response;
    }

    if (!isAdminPanelEmail(adminEmail)) {
      return NextResponse.json(
        { ok: false, error: "Nemáš oprávnění ručně označit e-mail jako ověřený." },
        { status: 403 }
      );
    }

    const setupError = await getAdvisorSetupError({ email: adminEmail, uid: adminUid });
    if (setupError) {
      return NextResponse.json(
        { ok: false, error: setupError.error, missingSetup: setupError.missing },
        { status: setupError.status }
      );
    }

    const rateLimitResult = await consumeRateLimit({
      namespace: "api:mark-email-verified:post",
      key: adminUid,
      limit: MARK_EMAIL_VERIFIED_RATE_LIMIT,
      windowMs: MARK_EMAIL_VERIFIED_WINDOW_MS,
    });
    if (!rateLimitResult.allowed) {
      const response = NextResponse.json(
        { ok: false, error: "Příliš mnoho požadavků. Zkus to prosím za chvíli." },
        { status: 429 }
      );
      applyRateLimitHeaders(response.headers, rateLimitResult);
      return response;
    }

    const body = ((await req.json().catch(() => null)) ?? {}) as MarkEmailVerifiedBody;
    const targetUidRaw = normalizeText(body.targetUid);
    const targetEmail = normalizeEmail(body.targetEmail);

    let targetUid = targetUidRaw;
    if (!targetUid && targetEmail) {
      const targetUser = await adminAuth.getUserByEmail(targetEmail).catch(() => null);
      targetUid = targetUser?.uid ?? "";
    }

    if (!targetUid) {
      return NextResponse.json(
        { ok: false, error: "Chybí targetUid nebo targetEmail." },
        { status: 400 }
      );
    }

    const targetUser = await adminAuth.getUser(targetUid).catch(() => null);
    if (!targetUser) {
      return NextResponse.json(
        { ok: false, error: "Cílový uživatel nebyl nalezen." },
        { status: 404 }
      );
    }

    if (!targetUser.emailVerified) {
      await adminAuth.updateUser(targetUid, { emailVerified: true });
    }

    const response = NextResponse.json({
      ok: true,
      emailVerified: true,
      targetUid,
      targetEmail: targetUser.email ?? targetEmail,
    });
    applyRateLimitHeaders(response.headers, rateLimitResult);
    return response;
  } catch (error) {
    console.error("mark-email-verified error", error);
    return NextResponse.json(
      { ok: false, error: "Nepodařilo se označit e-mail jako ověřený." },
      { status: 500 }
    );
  }
}
