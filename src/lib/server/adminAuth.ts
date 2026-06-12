import { NextResponse } from "next/server";

import {
  adminRoleAtLeast,
  getFallbackAdminRole,
  normalizeAdminRole,
  type AdminRole,
} from "@/lib/adminAccess";
import { getAdvisorAccessError } from "@/lib/server/advisorSetupGuard";
import { adminAuth } from "@/lib/server/firebaseAdmin";
import { getLoginAttemptLockoutError } from "@/lib/server/loginAttemptLockout";

export type AdminAuthContext = {
  adminEmail: string;
  adminUid: string;
  adminRole: AdminRole;
  decoded: Awaited<ReturnType<NonNullable<typeof adminAuth>["verifyIdToken"]>>;
};

type AdminAuthError = {
  error: string;
  status: number;
  missing?: string[];
  retryAfterSeconds?: number;
};

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const readBearerToken = (req: Request): string => {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return "";
  return authHeader.slice(7).trim();
};

const resolveAdminRole = (
  email: string,
  decoded: Record<string, unknown>
): AdminRole | null => {
  if (decoded.admin === true) {
    return normalizeAdminRole(decoded.adminRole) ?? "admin";
  }
  return getFallbackAdminRole(email);
};

export async function getAdminAuthContext(
  req: Request,
  {
    minimumRole = "admin",
    actionLabel = "tuto admin akci",
  }: {
    minimumRole?: AdminRole;
    actionLabel?: string;
  } = {}
): Promise<AdminAuthContext | AdminAuthError> {
  if (!adminAuth) {
    return {
      error: "Server není správně nakonfigurován (Firebase Admin).",
      status: 500,
    };
  }

  const token = readBearerToken(req);
  if (!token) {
    return { error: "Missing bearer token", status: 401 };
  }

  let decoded: AdminAuthContext["decoded"];
  try {
    decoded = await adminAuth.verifyIdToken(token, true);
  } catch (err: any) {
    const code = err?.code || "auth/invalid-token";
    const message = err?.message || "Invalid or expired token";
    return {
      error: `Invalid or expired token (${code}): ${message}`,
      status: 401,
    };
  }

  const email = normalizeEmail(decoded.email);
  const uid = String(decoded.uid ?? "").trim();
  if (!email || !uid) {
    return { error: "User identity missing in token", status: 401 };
  }

  const lockout = getLoginAttemptLockoutError(req, email);
  if (lockout) return lockout;

  const setupError = await getAdvisorAccessError({ email, uid });
  if (setupError) return setupError;

  const role = resolveAdminRole(email, decoded as Record<string, unknown>);
  if (!role || !adminRoleAtLeast(role, minimumRole)) {
    return {
      error: `Nemáš oprávnění provést ${actionLabel}.`,
      status: 403,
    };
  }

  return {
    adminEmail: email,
    adminUid: uid,
    adminRole: role,
    decoded,
  };
}

export const adminAuthErrorResponse = (ctx: AdminAuthError): NextResponse => {
  const response = NextResponse.json(
    { ok: false, error: ctx.error, missingSetup: ctx.missing },
    { status: ctx.status }
  );
  if (typeof ctx.retryAfterSeconds === "number") {
    response.headers.set("Retry-After", String(ctx.retryAfterSeconds));
  }
  return response;
};
