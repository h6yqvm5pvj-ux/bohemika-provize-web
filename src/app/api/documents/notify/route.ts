import { NextResponse, type NextRequest } from "next/server";

import {
  getToolDocumentSectionHref,
  isToolDocumentSection,
  type ToolDocumentSection,
} from "@/app/lib/toolDocuments";
import {
  requireAdvisorAuthedRateLimited,
  withRateLimitHeaders,
} from "@/lib/server/apiEntryGuard";
import {
  BROADCAST_EMOJI_MAX_LEN,
  BROADCAST_MESSAGE_MAX_LEN,
  BROADCAST_TITLE_MAX_LEN,
  sendAdminBroadcastNow,
} from "@/lib/server/adminBroadcastNotifications";
import { adminDb, adminMessaging } from "@/lib/server/firebaseAdmin";
import {
  canManageToolDocuments,
  loadStoredToolDocument,
  safeToolDocumentId,
} from "@/lib/server/toolDocuments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DOCUMENT_NOTIFY_RATE_LIMIT = 20;
const DOCUMENT_NOTIFY_WINDOW_MS = 60_000;

type ApiError = { ok: false; error: string };

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";

const normalizeEmoji = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return Array.from(value.trim().replace(/\s+/g, "")).slice(0, BROADCAST_EMOJI_MAX_LEN).join("");
};

const responseError = (
  message: string,
  status: number,
  ctx: Parameters<typeof withRateLimitHeaders>[1]
) =>
  withRateLimitHeaders(
    NextResponse.json({ ok: false, error: message } satisfies ApiError, { status }),
    ctx
  );

export async function POST(req: NextRequest) {
  const guard = await requireAdvisorAuthedRateLimited(req, {
    namespace: "api:documents:notify:post",
    limit: DOCUMENT_NOTIFY_RATE_LIMIT,
    windowMs: DOCUMENT_NOTIFY_WINDOW_MS,
  });
  if (!guard.ok) return guard.response;

  if (!adminDb || !adminMessaging) {
    return responseError(
      "Server není správně nakonfigurován (Firebase Messaging).",
      500,
      guard.ctx
    );
  }

  const canManage = await canManageToolDocuments({
    email: guard.ctx.email,
    uid: guard.ctx.uid,
    decoded: guard.ctx.decoded as Record<string, unknown>,
  });
  if (!canManage) {
    return responseError(
      "Notifikaci k dokumentu může odeslat jen specialista nebo admin.",
      403,
      guard.ctx
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return responseError("Neplatný payload.", 400, guard.ctx);
  }
  const raw = body as Record<string, unknown>;

  const id = safeToolDocumentId(raw.id);
  const section = normalizeText(raw.section);
  if (!id || !isToolDocumentSection(section)) {
    return responseError("Chybí ID nebo sekce dokumentu.", 400, guard.ctx);
  }

  const existing = await loadStoredToolDocument(id);
  const existingSection =
    existing.publicDoc?.section ??
    (typeof existing.stored?.section === "string" ? existing.stored.section : null) ??
    existing.fallback?.section ??
    null;
  if (!existing.publicDoc || existingSection !== section) {
    return responseError("Dokument nebyl nalezen.", 404, guard.ctx);
  }

  const sectionHref = getToolDocumentSectionHref(section as ToolDocumentSection);
  if (!sectionHref) {
    return responseError("Pro sekci dokumentu neumím sestavit odkaz.", 400, guard.ctx);
  }

  const title = normalizeText(raw.title).slice(0, BROADCAST_TITLE_MAX_LEN);
  const message = normalizeText(raw.message).slice(0, BROADCAST_MESSAGE_MAX_LEN);
  const emoji = normalizeEmoji(raw.emoji) || "📄";
  if (!title || !message) {
    return responseError("Vyplň nadpis i popisek notifikace.", 400, guard.ctx);
  }

  const targetPath = `${sectionHref}?document=${encodeURIComponent(id)}&source=document-notification`;
  const result = await sendAdminBroadcastNow(
    {
      emoji,
      title,
      message,
      targetPath,
      targetMode: "group",
      recipientEmail: null,
      recipientGroup: "advisors",
      scheduledAtIso: null,
      scheduledAtMs: null,
    },
    {
      adminEmail: guard.ctx.email,
      adminUid: guard.ctx.uid,
    },
    req
  );

  if (!result.ok) {
    return withRateLimitHeaders(
      NextResponse.json(
        {
          ok: false,
          error: result.error || "Notifikaci k dokumentu se nepodařilo odeslat.",
          sent: result.sent,
          failed: result.failed,
          matchedUsers: result.matchedUsers,
          recipients: result.recipients,
        },
        { status: result.statusCode ?? 502 }
      ),
      guard.ctx
    );
  }

  return withRateLimitHeaders(
    NextResponse.json({
      ok: true,
      targetPath,
      sent: result.sent,
      failed: result.failed,
      matchedUsers: result.matchedUsers,
      recipients: result.recipients,
      uniqueTokens: result.uniqueTokens,
    }),
    guard.ctx
  );
}
