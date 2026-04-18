import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/server/firebaseAdmin";
import { applyRateLimitHeaders, consumeRateLimit } from "@/lib/server/rateLimit";

export const runtime = "nodejs";
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
      decoded = await adminAuth.verifyIdToken(token);
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

    const rateLimitResult = consumeRateLimit({
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

    const link = await adminAuth.generateEmailVerificationLink(email);
    return NextResponse.json({ ok: true, link });
  } catch (error) {
    console.error("email-verification-link error", error);
    return NextResponse.json(
      { ok: false, error: "Nepodařilo se vygenerovat ověřovací odkaz." },
      { status: 500 }
    );
  }
}
