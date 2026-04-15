import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/server/firebaseAdmin";

export const runtime = "nodejs";

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
