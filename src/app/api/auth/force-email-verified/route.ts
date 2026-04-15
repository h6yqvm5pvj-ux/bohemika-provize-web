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

    const uid = decoded.uid?.trim();
    if (!uid) {
      return NextResponse.json(
        { ok: false, error: "Missing user uid in token" },
        { status: 400 }
      );
    }

    await adminAuth.updateUser(uid, { emailVerified: true });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("force-email-verified error", error);
    return NextResponse.json(
      { ok: false, error: "Nepodařilo se interně ověřit e-mail." },
      { status: 500 }
    );
  }
}
