import { NextResponse } from "next/server";
import { FirebaseAuthEmailError, sendFirebaseAuthEmail } from "@/lib/server/firebaseAuthEmail";
import { safeAuthEmailErrorCode } from "@/lib/authEmailMessages";
import { adminAuth } from "@/lib/server/firebaseAdmin";
import { getLoginAttemptLockoutError } from "@/lib/server/loginAttemptLockout";
import { applyRateLimitHeaders, consumeRateLimit } from "@/lib/server/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 60;
const EMAIL_VERIFICATION_RATE_LIMIT = 3;
const EMAIL_VERIFICATION_RATE_LIMIT_WINDOW_MS = 60_000;

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token || null;
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

    const email = decoded.email?.trim().toLowerCase();
    if (!email) {
      return NextResponse.json(
        { ok: false, error: "User email missing in token" },
        { status: 400 }
      );
    }
    const lockout = await getLoginAttemptLockoutError(req, email);
    if (lockout) {
      const response = NextResponse.json(
        { ok: false, error: lockout.error },
        { status: lockout.status }
      );
      response.headers.set("Retry-After", String(lockout.retryAfterSeconds));
      return response;
    }

    const rateLimitResult = await consumeRateLimit({
      namespace: "api:email-verification-link:post",
      key: email,
      limit: EMAIL_VERIFICATION_RATE_LIMIT,
      windowMs: EMAIL_VERIFICATION_RATE_LIMIT_WINDOW_MS,
    });
    if (!rateLimitResult.allowed) {
      const response = NextResponse.json(
        { ok: false, error: "Příliš mnoho požadavků. Zkus to prosím za chvíli." },
        { status: 429 }
      );
      applyRateLimitHeaders(response.headers, rateLimitResult);
      return response;
    }

    const authUser = await adminAuth.getUser(decoded.uid);
    if (authUser.disabled || authUser.email?.trim().toLowerCase() !== email) {
      return NextResponse.json(
        { ok: false, error: "Účet není dostupný. Přihlas se znovu." },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      );
    }
    if (authUser.emailVerified) {
      return NextResponse.json({ ok: true, alreadyVerified: true }, {
        headers: { "Cache-Control": "no-store" },
      });
    }
    await sendFirebaseAuthEmail({ requestType: "VERIFY_EMAIL", email });

    const response = NextResponse.json({ ok: true, sent: true }, { headers: { "Cache-Control": "no-store" } });
    applyRateLimitHeaders(response.headers, rateLimitResult);
    return response;
  } catch (error) {
    console.error("email-verification-link error", safeAuthEmailErrorCode(error));
    return NextResponse.json(
      { ok: false, code: safeAuthEmailErrorCode(error), error: error instanceof FirebaseAuthEmailError ? error.message : "Nepodařilo se odeslat ověřovací e-mail." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
