import { NextResponse } from "next/server";

import { adminAuth } from "@/lib/server/firebaseAdmin";
import { applyRateLimitHeaders, consumeRateLimit } from "@/lib/server/rateLimit";

export const runtime = "nodejs";

const MARK_EMAIL_VERIFIED_RATE_LIMIT = 5;
const MARK_EMAIL_VERIFIED_WINDOW_MS = 60_000;

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

    const uid = decoded.uid?.trim();
    const email = decoded.email?.trim().toLowerCase();
    if (!uid || !email) {
      return NextResponse.json(
        { ok: false, error: "User identity missing in token" },
        { status: 400 }
      );
    }

    const rateLimitResult = await consumeRateLimit({
      namespace: "api:mark-email-verified:post",
      key: uid,
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

    if (decoded.email_verified !== true) {
      await adminAuth.updateUser(uid, { emailVerified: true });
    }

    const response = NextResponse.json({ ok: true, emailVerified: true });
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
