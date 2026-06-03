import { NextResponse, type NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  requireAuthedRateLimited,
  withRateLimitHeaders,
} from "@/lib/server/apiEntryGuard";

export const runtime = "nodejs";

const DOCUMENT_RATE_LIMIT = 120;
const DOCUMENT_RATE_LIMIT_WINDOW_MS = 60_000;

type DocumentMeta = {
  fileName: string;
  contentType: string;
};

const DOCUMENTS: Record<string, DocumentMeta> = {
  "cpp-storno-dohodou": {
    fileName: "zpneonstornodohodou.pdf",
    contentType: "application/pdf",
  },
  "cpp-vypoved-zp": {
    fileName: "Výpověď_PS_ŽP_062023.pdf",
    contentType: "application/pdf",
  },
  "cpp-vypoved-zp-zadanky": {
    fileName: "ŽP DOKUMENTY Žádanky Výpověď_PS_ŽP_062023.pdf",
    contentType: "application/pdf",
  },
  "generali-nezivot": {
    fileName: "generalinezivot.pdf",
    contentType: "application/pdf",
  },
  "koop-vypoved": {
    fileName: "koopvypoved.pdf",
    contentType: "application/pdf",
  },
  "max-denni-cpp": {
    fileName: "maxdenni.jpg",
    contentType: "image/jpeg",
  },
  "koop-prijem": {
    fileName: "koopprijem.jpg",
    contentType: "image/jpeg",
  },
  "metlife-vypoved": {
    fileName: "metlifevypoved.pdf",
    contentType: "application/pdf",
  },
};

const normalizeDocumentId = (value: string | null): string =>
  (value ?? "").trim().toLowerCase();

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
  const guard = await requireAuthedRateLimited(req, {
    namespace: "api:documents:file:get",
    limit: DOCUMENT_RATE_LIMIT,
    windowMs: DOCUMENT_RATE_LIMIT_WINDOW_MS,
  });
  if (!guard.ok) return guard.response;

  const id = normalizeDocumentId(req.nextUrl.searchParams.get("id"));
  const meta = DOCUMENTS[id];
  if (!meta) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Dokument nebyl nalezen." },
        { status: 404 }
      ),
      guard.ctx
    );
  }

  const shouldDownload = req.nextUrl.searchParams.get("download") === "1";
  const filePath = join(process.cwd(), "private", "dokumenty", meta.fileName);

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

  return withRateLimitHeaders(
    new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": meta.contentType,
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Disposition": contentDisposition(meta.fileName, shouldDownload),
      },
    }),
    guard.ctx
  );
}
