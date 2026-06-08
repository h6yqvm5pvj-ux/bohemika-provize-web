import { NextResponse } from "next/server";

import { adminAuth } from "@/lib/server/firebaseAdmin";
import { getLoginAttemptLockoutError } from "@/lib/server/loginAttemptLockout";
import { applyRateLimitHeaders, consumeRateLimit } from "@/lib/server/rateLimit";

export const runtime = "nodejs";

const CONFIRM_EMAIL_FOR_MFA_RATE_LIMIT = 6;
const CONFIRM_EMAIL_FOR_MFA_RATE_LIMIT_WINDOW_MS = 60_000;
const RECENT_AUTH_MAX_AGE_MS = 10 * 60_000;

type ApiError = {
  ok: false;
  error: string;
};

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token || null;
}

const jsonError = (error: string, status: number) =>
  NextResponse.json({ ok: false, error } satisfies ApiError, { status });

export async function POST(req: Request) {
  try {
    if (!adminAuth) {
      return jsonError("Server není nakonfigurovaný (Firebase Admin).", 500);
    }

    const token = getBearerToken(req);
    if (!token) {
      return jsonError("Missing bearer token", 401);
    }

    let decoded: Awaited<ReturnType<typeof adminAuth.verifyIdToken>>;
    try {
      decoded = await adminAuth.verifyIdToken(token, true);
    } catch {
      return jsonError("Invalid or expired token", 401);
    }

    const email = normalizeEmail(decoded.email);
    if (!email) {
      return jsonError("User email missing in token", 400);
    }

    const lockout = getLoginAttemptLockoutError(req, email);
    if (lockout) {
      const response = jsonError(lockout.error, lockout.status);
      response.headers.set("Retry-After", String(lockout.retryAfterSeconds));
      return response;
    }

    const rateLimitResult = await consumeRateLimit({
      namespace: "api:confirm-email-for-mfa:post",
      key: email,
      limit: CONFIRM_EMAIL_FOR_MFA_RATE_LIMIT,
      windowMs: CONFIRM_EMAIL_FOR_MFA_RATE_LIMIT_WINDOW_MS,
    });
    if (!rateLimitResult.allowed) {
      const response = jsonError("Příliš mnoho požadavků. Zkus to prosím za chvíli.", 429);
      applyRateLimitHeaders(response.headers, rateLimitResult);
      return response;
    }

    const authTimeSeconds =
      typeof decoded.auth_time === "number" && Number.isFinite(decoded.auth_time)
        ? decoded.auth_time
        : 0;
    const authAgeMs = authTimeSeconds > 0 ? Date.now() - authTimeSeconds * 1000 : Infinity;
    if (authAgeMs > RECENT_AUTH_MAX_AGE_MS) {
      const response = jsonError("Pro zapnutí 2FA zadej aktuální heslo znovu.", 403);
      applyRateLimitHeaders(response.headers, rateLimitResult);
      return response;
    }

    const authUser = await adminAuth.getUser(decoded.uid);
    if (authUser.disabled) {
      const response = jsonError("Účet je deaktivovaný.", 403);
      applyRateLimitHeaders(response.headers, rateLimitResult);
      return response;
    }
    if (normalizeEmail(authUser.email) !== email) {
      const response = jsonError("Token neodpovídá e-mailu účtu.", 403);
      applyRateLimitHeaders(response.headers, rateLimitResult);
      return response;
    }

    if (!authUser.emailVerified) {
      await adminAuth.updateUser(decoded.uid, { emailVerified: true });
    }

    const response = NextResponse.json({
      ok: true,
      emailVerified: true,
      alreadyVerified: authUser.emailVerified,
    });
    applyRateLimitHeaders(response.headers, rateLimitResult);
    return response;
  } catch (error) {
    console.error("confirm-email-for-mfa error", error);
    return jsonError("Nepodařilo se potvrdit e-mail pro zapnutí 2FA.", 500);
  }
}
