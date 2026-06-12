import { NextResponse, type NextRequest } from "next/server";

import { buildMailboxPreviewHtml } from "@/app/posta/postaPreview";
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

const isValidPayloadId = (value: string): boolean =>
  value.length >= 8 && value.length <= 200 && /^[A-Za-z0-9_-]+$/.test(value);

const structuredMetadataFromPayload = (
  data: Record<string, unknown>
): Record<string, unknown> | null => {
  const snapshot =
    data.snapshot && typeof data.snapshot === "object" && !Array.isArray(data.snapshot)
      ? (data.snapshot as Record<string, unknown>)
      : null;
  if (!snapshot) return null;

  return {
    ...snapshot,
    senderEmail: normalizeText(data.senderEmail).toLowerCase(),
    senderName: normalizeText(data.senderName),
    recipientEmail: normalizeText(data.recipientEmail).toLowerCase(),
    recipientName: normalizeText(data.recipientName),
    noteText: normalizeText(data.noteText),
  };
};

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

    const metadata = structuredMetadataFromPayload(data);
    const html = metadata
      ? buildMailboxPreviewHtml({
          id: payloadId,
          type,
          title: "Sdílený export produkce",
          body: "",
          deepLink: "/pomucky/export-produkce",
          read: true,
          createdAtMs:
            typeof data.createdAtMs === "number" && Number.isFinite(data.createdAtMs)
              ? data.createdAtMs
              : null,
          readAtMs: null,
          metadata,
        })
      : null;

    if (!html?.trim()) {
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
