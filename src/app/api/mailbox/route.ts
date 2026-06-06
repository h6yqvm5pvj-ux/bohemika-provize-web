import { FieldValue } from "firebase-admin/firestore";
import { NextResponse, type NextRequest } from "next/server";

import {
  requireAdvisorAuthedRateLimited,
  withRateLimitHeaders,
} from "@/lib/server/apiEntryGuard";
import { adminDb } from "@/lib/server/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAILBOX_GET_RATE_LIMIT = 180;
const MAILBOX_GET_RATE_LIMIT_WINDOW_MS = 60_000;
const MAILBOX_PATCH_RATE_LIMIT = 90;
const MAILBOX_PATCH_RATE_LIMIT_WINDOW_MS = 60_000;
const MAILBOX_DELETE_RATE_LIMIT = 90;
const MAILBOX_DELETE_RATE_LIMIT_WINDOW_MS = 60_000;

const MAILBOX_LIST_DEFAULT_LIMIT = 60;
const MAILBOX_LIST_MAX_LIMIT = 180;
const MAILBOX_MARK_MAX_IDS = 200;
const MAILBOX_MARK_ALL_BATCH_SIZE = 250;

type FirestoreTimestamp = {
  seconds: number;
  nanoseconds: number;
  toDate?: () => Date;
};

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const toMillis = (value: unknown): number | null => {
  if (!value) return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === "object") {
    const ts = value as FirestoreTimestamp;
    if (typeof ts.toDate === "function") {
      const ms = ts.toDate().getTime();
      return Number.isFinite(ms) ? ms : null;
    }
    if (
      typeof ts.seconds === "number" &&
      Number.isFinite(ts.seconds) &&
      typeof ts.nanoseconds === "number" &&
      Number.isFinite(ts.nanoseconds)
    ) {
      return ts.seconds * 1000 + Math.floor(ts.nanoseconds / 1_000_000);
    }
  }
  return null;
};

const parseLimit = (value: string | null): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return MAILBOX_LIST_DEFAULT_LIMIT;
  const safe = Math.floor(parsed);
  return Math.min(MAILBOX_LIST_MAX_LIMIT, Math.max(1, safe));
};

const parseIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const out = new Set<string>();
  value.forEach((raw) => {
    if (typeof raw !== "string") return;
    const id = raw.trim();
    if (!id) return;
    if (id.length > 240) return;
    out.add(id);
  });
  return [...out].slice(0, MAILBOX_MARK_MAX_IDS);
};

const buildMailboxAttachmentApiUrl = (messageId: string, attachmentId: string): string => {
  const params = new URLSearchParams({
    messageId,
    attachmentId,
  });
  return `/api/mailbox/attachment?${params.toString()}`;
};

const normalizeAttachmentUrls = (
  metadata: Record<string, unknown> | null,
  messageId: string
): Record<string, unknown> | null => {
  if (!metadata || !Array.isArray(metadata.attachments)) return metadata;
  const attachments = metadata.attachments.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
    const row = entry as Record<string, unknown>;
    const attachmentId = normalizeText(row.id);
    if (!attachmentId) return row;
    const safeRow: Record<string, unknown> = {
      ...row,
      url: buildMailboxAttachmentApiUrl(messageId, attachmentId),
    };
    delete safeRow.path;
    delete safeRow.bucketName;
    return {
      ...safeRow,
    };
  });
  return {
    ...metadata,
    attachments,
  };
};

const parseMailboxDoc = (
  docSnap: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>
) => {
  const data = (docSnap.data() ?? {}) as Record<string, unknown>;
  const createdAtMs =
    (typeof data.createdAtMs === "number" && Number.isFinite(data.createdAtMs)
      ? Math.round(data.createdAtMs)
      : null) ?? toMillis(data.createdAt);
  const readAtMs =
    (typeof data.readAtMs === "number" && Number.isFinite(data.readAtMs)
      ? Math.round(data.readAtMs)
      : null) ?? toMillis(data.readAt);

  const metadataRaw = data.metadata;
  const metadata =
    metadataRaw && typeof metadataRaw === "object" && !Array.isArray(metadataRaw)
      ? (metadataRaw as Record<string, unknown>)
      : null;
  const metadataMessageId = normalizeText(metadata?.messageId);
  const normalizedMetadata = normalizeAttachmentUrls(metadata, metadataMessageId || docSnap.id);

  return {
    id: docSnap.id,
    type: normalizeText(data.type) || "generic",
    title: normalizeText(data.title) || "Bohemka.App",
    body: normalizeText(data.body) || "Máš novou zprávu.",
    deepLink: normalizeText(data.deepLink) || "/nastaveni",
    read: data.read === true,
    createdAtMs,
    readAtMs,
    metadata: normalizedMetadata,
  };
};

const getMailboxCollection = (email: string) =>
  adminDb!.collection("usersPrivate").doc(email).collection("mailbox");

const getUnreadCount = async (email: string): Promise<number> => {
  const unreadSnap = await getMailboxCollection(email).where("read", "==", false).get();
  return unreadSnap.size;
};

export async function GET(req: NextRequest) {
  const guard = await requireAdvisorAuthedRateLimited(req, {
    namespace: "api:mailbox:get",
    limit: MAILBOX_GET_RATE_LIMIT,
    windowMs: MAILBOX_GET_RATE_LIMIT_WINDOW_MS,
  });
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  if (!adminDb) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Server není správně nakonfigurován (Firebase Admin)." },
        { status: 500 }
      ),
      ctx
    );
  }

  try {
    const countOnly = req.nextUrl.searchParams.get("countOnly") === "1";
    const limit = parseLimit(req.nextUrl.searchParams.get("limit"));

    const unreadCount = await getUnreadCount(ctx.email);
    if (countOnly) {
      return withRateLimitHeaders(
        NextResponse.json({ ok: true, unreadCount }),
        ctx
      );
    }

    const itemsSnap = await getMailboxCollection(ctx.email)
      .orderBy("createdAtMs", "desc")
      .limit(limit)
      .get();

    const items = itemsSnap.docs.map((docSnap) => parseMailboxDoc(docSnap));

    return withRateLimitHeaders(
      NextResponse.json({ ok: true, unreadCount, items }),
      ctx
    );
  } catch (error) {
    console.error("Mailbox GET failed:", error);
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Nepodařilo se načíst poštu." },
        { status: 500 }
      ),
      ctx
    );
  }
}

export async function PATCH(req: NextRequest) {
  const guard = await requireAdvisorAuthedRateLimited(req, {
    namespace: "api:mailbox:patch",
    limit: MAILBOX_PATCH_RATE_LIMIT,
    windowMs: MAILBOX_PATCH_RATE_LIMIT_WINDOW_MS,
  });
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  if (!adminDb) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Server není správně nakonfigurován (Firebase Admin)." },
        { status: 500 }
      ),
      ctx
    );
  }

  const body = (await req.json().catch(() => null)) as
    | {
        ids?: unknown;
        markAllRead?: unknown;
      }
    | null;

  const markAllRead = body?.markAllRead === true;
  const ids = parseIds(body?.ids);

  if (!markAllRead && ids.length === 0) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Nebyly předány žádné zprávy k označení." },
        { status: 400 }
      ),
      ctx
    );
  }

  try {
    const mailboxCol = getMailboxCollection(ctx.email);
    const nowMs = Date.now();
    let updated = 0;

    if (markAllRead) {
      while (true) {
        const unreadSnap = await mailboxCol
          .where("read", "==", false)
          .limit(MAILBOX_MARK_ALL_BATCH_SIZE)
          .get();
        if (unreadSnap.empty) break;

        const batch = adminDb.batch();
        unreadSnap.docs.forEach((docSnap) => {
          batch.update(docSnap.ref, {
            read: true,
            readAtMs: nowMs,
            readAt: FieldValue.serverTimestamp(),
          });
          updated += 1;
        });
        await batch.commit();

        if (unreadSnap.size < MAILBOX_MARK_ALL_BATCH_SIZE) break;
      }
    } else {
      const batch = adminDb.batch();
      ids.forEach((id) => {
        const ref = mailboxCol.doc(id);
        batch.set(
          ref,
          {
            read: true,
            readAtMs: nowMs,
            readAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      });
      await batch.commit();
      updated = ids.length;
    }

    const unreadCount = await getUnreadCount(ctx.email);

    return withRateLimitHeaders(
      NextResponse.json({ ok: true, updated, unreadCount }),
      ctx
    );
  } catch (error) {
    console.error("Mailbox PATCH failed:", error);
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Nepodařilo se upravit stav pošty." },
        { status: 500 }
      ),
      ctx
    );
  }
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAdvisorAuthedRateLimited(req, {
    namespace: "api:mailbox:delete",
    limit: MAILBOX_DELETE_RATE_LIMIT,
    windowMs: MAILBOX_DELETE_RATE_LIMIT_WINDOW_MS,
  });
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  if (!adminDb) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Server není správně nakonfigurován (Firebase Admin)." },
        { status: 500 }
      ),
      ctx
    );
  }

  const body = (await req.json().catch(() => null)) as
    | {
        ids?: unknown;
      }
    | null;

  const ids = parseIds(body?.ids);
  if (ids.length === 0) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Nebyly předány žádné zprávy ke smazání." },
        { status: 400 }
      ),
      ctx
    );
  }

  try {
    const mailboxCol = getMailboxCollection(ctx.email);
    const batch = adminDb.batch();
    ids.forEach((id) => {
      batch.delete(mailboxCol.doc(id));
    });
    await batch.commit();

    const unreadCount = await getUnreadCount(ctx.email);
    return withRateLimitHeaders(
      NextResponse.json({
        ok: true,
        deleted: ids.length,
        unreadCount,
      }),
      ctx
    );
  } catch (error) {
    console.error("Mailbox DELETE failed:", error);
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Nepodařilo se smazat zprávy v poště." },
        { status: 500 }
      ),
      ctx
    );
  }
}
