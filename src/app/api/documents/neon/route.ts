import { NextResponse, type NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { adminAuth } from "@/lib/server/firebaseAdmin";

export const runtime = "nodejs";

type NeonPeriod = "2019" | "2024";
type NeonRole = "poradce" | "manazer";
type NeonDocumentType = "pdf" | "preview";

const PDF_BY_PERIOD: Record<NeonPeriod, string> = {
  "2019": "cppneon2019.pdf",
  "2024": "cppneon2024.pdf",
};

const PREVIEW_BY_PERIOD_ROLE: Record<NeonPeriod, Record<NeonRole, string>> = {
  "2019": {
    poradce: "neon2019poradce.jpg",
    manazer: "neon2019manazer.jpg",
  },
  "2024": {
    poradce: "neon2024poradce.jpg",
    manazer: "neon2024manazer.jpg",
  },
};

const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
};

function getBearerToken(req: NextRequest): string {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return "";
  return authHeader.slice(7).trim();
}

function parsePeriod(value: string | null): NeonPeriod | null {
  return value === "2019" || value === "2024" ? value : null;
}

function parseRole(value: string | null): NeonRole | null {
  return value === "poradce" || value === "manazer" ? value : null;
}

function parseType(value: string | null): NeonDocumentType | null {
  return value === "pdf" || value === "preview" ? value : null;
}

export async function GET(req: NextRequest) {
  if (!adminAuth) {
    return NextResponse.json(
      { ok: false, error: "Server není správně nakonfigurován (Firebase Admin)." },
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

  try {
    await adminAuth.verifyIdToken(token, true);
  } catch (err: any) {
    const code = err?.code || "auth/invalid-token";
    const message = err?.message || "Invalid or expired token";
    return NextResponse.json(
      { ok: false, error: `Invalid or expired token (${code}): ${message}` },
      { status: 401 }
    );
  }

  const url = new URL(req.url);
  const period = parsePeriod(url.searchParams.get("period"));
  const type = parseType(url.searchParams.get("type"));
  const role = parseRole(url.searchParams.get("role"));
  const shouldDownload = url.searchParams.get("download") === "1";

  if (!period || !type) {
    return NextResponse.json(
      { ok: false, error: "Missing or invalid query (period/type)." },
      { status: 400 }
    );
  }

  if (type === "preview" && !role) {
    return NextResponse.json(
      { ok: false, error: "Missing or invalid role for preview." },
      { status: 400 }
    );
  }

  const fileName =
    type === "pdf"
      ? PDF_BY_PERIOD[period]
      : PREVIEW_BY_PERIOD_ROLE[period][role as NeonRole];
  const filePath = join(process.cwd(), "private", "dokumenty", fileName);

  let buffer: Buffer;
  try {
    buffer = await readFile(filePath);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Soubor nebyl nalezen." },
      { status: 404 }
    );
  }

  const ext = fileName.toLowerCase().endsWith(".pdf") ? ".pdf" : ".jpg";
  const contentType = MIME_BY_EXT[ext] ?? "application/octet-stream";

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(buffer.length),
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Disposition": `${shouldDownload ? "attachment" : "inline"}; filename="${fileName}"`,
    },
  });
}
