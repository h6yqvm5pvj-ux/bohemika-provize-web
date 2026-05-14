import { NextResponse, type NextRequest } from "next/server";

import { requireAuthedRateLimited, withRateLimitHeaders } from "@/lib/server/apiEntryGuard";
import { adminDb } from "@/lib/server/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAILBOX_SHARED_PREVIEW_RATE_LIMIT = 120;
const MAILBOX_SHARED_PREVIEW_RATE_LIMIT_WINDOW_MS = 60_000;

type SharedPreviewSuccess = {
  ok: true;
  html: string;
};

type SharedPreviewError = {
  ok: false;
  error: string;
};

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const parseNonNegativeInt = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return Math.max(0, Math.floor(parsed));
  }
  return 0;
};

const isValidPayloadId = (value: string): boolean =>
  value.length >= 8 && value.length <= 200 && /^[A-Za-z0-9_-]+$/.test(value);

export async function GET(req: NextRequest) {
  const guard = await requireAuthedRateLimited(req, {
    namespace: "api:mailbox:shared-preview:get",
    limit: MAILBOX_SHARED_PREVIEW_RATE_LIMIT,
    windowMs: MAILBOX_SHARED_PREVIEW_RATE_LIMIT_WINDOW_MS,
  });
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  if (!adminDb) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Server není správně nakonfigurován (Firebase Admin)." } satisfies SharedPreviewError,
        { status: 500 }
      ),
      ctx
    );
  }

  const payloadId = normalizeText(req.nextUrl.searchParams.get("payloadId"));
  if (!isValidPayloadId(payloadId)) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Neplatný identifikátor náhledu." } satisfies SharedPreviewError,
        { status: 400 }
      ),
      ctx
    );
  }

  try {
    const docSnap = await adminDb.collection("mailboxSharedPayloads").doc(payloadId).get();
    if (!docSnap.exists) {
      return withRateLimitHeaders(
        NextResponse.json(
          { ok: false, error: "Sdílený náhled nebyl nalezen." } satisfies SharedPreviewError,
          { status: 404 }
        ),
        ctx
      );
    }

    const data = (docSnap.data() as Record<string, unknown> | undefined) ?? {};
    const type = normalizeText(data.type);
    const recipientEmail = normalizeText(data.recipientEmail).toLowerCase();
    const senderEmail = normalizeText(data.senderEmail).toLowerCase();

    if (
      !recipientEmail ||
      (recipientEmail !== ctx.email && (!senderEmail || senderEmail !== ctx.email))
    ) {
      return withRateLimitHeaders(
        NextResponse.json(
          { ok: false, error: "Na tento náhled nemáš oprávnění." } satisfies SharedPreviewError,
          { status: 403 }
        ),
        ctx
      );
    }

    if (type !== "production_export_share") {
      return withRateLimitHeaders(
        NextResponse.json(
          { ok: false, error: "Sdílený náhled není dostupný." } satisfies SharedPreviewError,
          { status: 404 }
        ),
        ctx
      );
    }

    const inlineHtml = typeof data.html === "string" ? data.html : "";
    let html = inlineHtml;

    if (!html.trim()) {
      const storageType = normalizeText(data.htmlStorage).toLowerCase();
      if (storageType === "chunked") {
        const expectedChunkCount = parseNonNegativeInt(data.htmlChunkCount);
        const chunkSnap = await docSnap.ref.collection("chunks").get();
        if (expectedChunkCount > 0 && chunkSnap.docs.length < expectedChunkCount) {
          return withRateLimitHeaders(
            NextResponse.json(
              { ok: false, error: "Sdílený náhled zatím není kompletní." } satisfies SharedPreviewError,
              { status: 503 }
            ),
            ctx
          );
        }
        html = chunkSnap.docs
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((chunkDoc) => {
            const chunkData = chunkDoc.data() as Record<string, unknown>;
            return typeof chunkData.htmlChunk === "string" ? chunkData.htmlChunk : "";
          })
          .join("");
      }
    }

    if (!html.trim()) {
      return withRateLimitHeaders(
        NextResponse.json(
          { ok: false, error: "Sdílený náhled není dostupný." } satisfies SharedPreviewError,
          { status: 404 }
        ),
        ctx
      );
    }

    return withRateLimitHeaders(
      NextResponse.json({ ok: true, html } satisfies SharedPreviewSuccess),
      ctx
    );
  } catch (error) {
    console.error("GET /api/mailbox/shared-preview failed", error);
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Sdílený náhled se nepodařilo načíst." } satisfies SharedPreviewError,
        { status: 500 }
      ),
      ctx
    );
  }
}
