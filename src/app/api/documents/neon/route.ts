import { NextResponse, type NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  requireAdvisorAuthedRateLimited,
  withRateLimitHeaders,
} from "@/lib/server/apiEntryGuard";

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
const NEON_DOCUMENT_RATE_LIMIT = 120;
const NEON_DOCUMENT_RATE_LIMIT_WINDOW_MS = 60_000;

function parsePeriod(value: string | null): NeonPeriod | null {
  return value === "2019" || value === "2024" ? value : null;
}

function parseRole(value: string | null): NeonRole | null {
  return value === "poradce" || value === "manazer" ? value : null;
}

function parseType(value: string | null): NeonDocumentType | null {
  return value === "pdf" || value === "preview" ? value : null;
}

function contentDisposition(fileName: string, shouldDownload: boolean): string {
  const fallback = fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "document";
  return `${shouldDownload ? "attachment" : "inline"}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(
    fileName
  )}`;
}

export async function GET(req: NextRequest) {
  const guard = await requireAdvisorAuthedRateLimited(req, {
    namespace: "api:documents:neon:get",
    limit: NEON_DOCUMENT_RATE_LIMIT,
    windowMs: NEON_DOCUMENT_RATE_LIMIT_WINDOW_MS,
  });
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const period = parsePeriod(url.searchParams.get("period"));
  const type = parseType(url.searchParams.get("type"));
  const role = parseRole(url.searchParams.get("role"));
  const shouldDownload = url.searchParams.get("download") === "1";

  if (!period || !type) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Missing or invalid query (period/type)." },
        { status: 400 }
      ),
      guard.ctx
    );
  }

  if (type === "preview" && !role) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Missing or invalid role for preview." },
        { status: 400 }
      ),
      guard.ctx
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
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Soubor nebyl nalezen." },
        { status: 404 }
      ),
      guard.ctx
    );
  }

  const ext = fileName.toLowerCase().endsWith(".pdf") ? ".pdf" : ".jpg";
  const contentType = MIME_BY_EXT[ext] ?? "application/octet-stream";

  return withRateLimitHeaders(
    new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Disposition": contentDisposition(fileName, shouldDownload),
      },
    }),
    guard.ctx
  );
}
