import { NextResponse, type NextRequest } from "next/server";
import type { MultiFactorInfo, UserRecord } from "firebase-admin/auth";

import { isAdminPanelEmail } from "@/lib/adminAccess";
import { adminAuth, adminDb } from "@/lib/server/firebaseAdmin";
import { getAdvisorAccessError } from "@/lib/server/advisorSetupGuard";
import { getLoginAttemptLockoutError } from "@/lib/server/loginAttemptLockout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AUTH_LIST_USERS_LIMIT = 1000;

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

async function getAuthContext(req: NextRequest) {
  if (!adminAuth || !adminDb) {
    return { error: "Server není správně nakonfigurován (Firebase Admin).", status: 500 } as const;
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  if (!token) {
    return { error: "Missing bearer token", status: 401 } as const;
  }

  let decoded: Awaited<ReturnType<typeof adminAuth.verifyIdToken>>;
  try {
    decoded = await adminAuth.verifyIdToken(token, true);
  } catch (err: any) {
    const code = err?.code || "auth/invalid-token";
    const message = err?.message || "Invalid or expired token";
    return { error: `Invalid or expired token (${code}): ${message}`, status: 401 } as const;
  }

  const email = normalizeEmail(decoded.email);
  if (!email || !EMAIL_RE.test(email)) {
    return { error: "User e-mail missing in token", status: 401 } as const;
  }

  const lockout = getLoginAttemptLockoutError(req, email);
  if (lockout) return lockout;

  const setupError = await getAdvisorAccessError({ email, uid: decoded.uid });
  if (setupError) return setupError;

  if (!isAdminPanelEmail(email)) {
    return { error: "Nemáš oprávnění zobrazit zabezpečení účtů.", status: 403 } as const;
  }

  return { adminEmail: email } as const;
}

async function listAllAuthUsers(): Promise<UserRecord[]> {
  if (!adminAuth) return [];

  const users: UserRecord[] = [];
  let pageToken: string | undefined;

  do {
    const page = await adminAuth.listUsers(AUTH_LIST_USERS_LIMIT, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);

  return users;
}

async function loadProfileSummaries() {
  if (!adminDb) return new Map<string, Record<string, unknown>>();

  const [usersSnap, privateSnap] = await Promise.all([
    adminDb.collection("users").get(),
    adminDb.collection("usersPrivate").get(),
  ]);
  const byEmail = new Map<string, Record<string, unknown>>();

  const mergeProfile = (email: string, data: Record<string, unknown>) => {
    if (!email || !EMAIL_RE.test(email)) return;
    byEmail.set(email, {
      ...(byEmail.get(email) ?? {}),
      ...data,
    });
  };

  usersSnap.docs.forEach((docSnap) => {
    const data = (docSnap.data() as Record<string, unknown> | undefined) ?? {};
    const email = normalizeEmail(data.email) || normalizeEmail(docSnap.id);
    mergeProfile(email, data);
  });

  privateSnap.docs.forEach((docSnap) => {
    const data = (docSnap.data() as Record<string, unknown> | undefined) ?? {};
    const email = normalizeEmail(data.email) || normalizeEmail(docSnap.id);
    mergeProfile(email, data);
  });

  return byEmail;
}

function serializeFactor(factor: MultiFactorInfo) {
  const maybePhone = factor as MultiFactorInfo & { phoneNumber?: string };
  return {
    uid: factor.uid,
    factorId: factor.factorId,
    displayName: factor.displayName ?? null,
    enrollmentTime: factor.enrollmentTime ?? null,
    phoneNumber: typeof maybePhone.phoneNumber === "string" ? maybePhone.phoneNumber : null,
  };
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if ("error" in ctx) {
      const response = NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
      if ("retryAfterSeconds" in ctx) {
        response.headers.set("Retry-After", String(ctx.retryAfterSeconds));
      }
      return response;
    }

    const [authUsers, profilesByEmail] = await Promise.all([
      listAllAuthUsers(),
      loadProfileSummaries(),
    ]);

    const users = authUsers
      .map((authUser) => {
        const email = normalizeEmail(authUser.email);
        if (!email || !EMAIL_RE.test(email)) return null;

        const profile = profilesByEmail.get(email) ?? {};
        const enrolledFactors = authUser.multiFactor?.enrolledFactors ?? [];
        const factors = enrolledFactors.map(serializeFactor);
        const hasTotp = factors.some((factor) => factor.factorId === "totp");
        const hasPhone = factors.some((factor) => factor.factorId === "phone");
        const fullName =
          normalizeText(profile.fullName) ||
          normalizeText(profile.name) ||
          normalizeText(authUser.displayName) ||
          null;

        return {
          uid: authUser.uid,
          email,
          fullName,
          position: normalizeText(profile.position) || null,
          accountType:
            normalizeText(profile.accountType) ||
            normalizeText(profile.userRole) ||
            null,
          disabled: authUser.disabled,
          emailVerified: authUser.emailVerified,
          createdAt: authUser.metadata.creationTime || null,
          lastSignInAt: authUser.metadata.lastSignInTime || null,
          lastRefreshAt: authUser.metadata.lastRefreshTime || null,
          mfa: {
            enabled: factors.length > 0,
            factorCount: factors.length,
            hasTotp,
            hasPhone,
            factors,
          },
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .sort((a, b) => {
        if (Number(a.mfa.enabled) !== Number(b.mfa.enabled)) {
          return Number(b.mfa.enabled) - Number(a.mfa.enabled);
        }
        const aName = a.fullName || a.email;
        const bName = b.fullName || b.email;
        return aName.localeCompare(bName, "cs");
      });

    const response = NextResponse.json({
      ok: true,
      users,
      summary: {
        total: users.length,
        enabled: users.filter((user) => user.mfa.enabled).length,
        disabled: users.filter((user) => !user.mfa.enabled).length,
        emailVerified: users.filter((user) => user.emailVerified).length,
      },
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error("GET /api/admin/security selhalo:", error);
    return NextResponse.json(
      { ok: false, error: "Nepodařilo se načíst zabezpečení uživatelů." },
      { status: 500 }
    );
  }
}
