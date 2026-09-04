import { FieldValue } from "firebase-admin/firestore";
import { NextResponse, type NextRequest } from "next/server";

import {
  requireAdvisorAuthedRateLimited,
  withRateLimitHeaders,
} from "@/lib/server/apiEntryGuard";
import { adminDb } from "@/lib/server/firebaseAdmin";
import {
  deleteMailboxStorageObjects,
  parseMailboxAttachmentCleanupCandidate,
  type MailboxAttachmentCleanupCandidate,
  type MailboxStorageObject,
} from "@/lib/server/mailboxAttachmentStorage";
import { decryptMailboxJson } from "@/lib/server/mailboxEncryption";
import { mailboxConversationId } from "@/lib/server/mailboxConversation";

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
const MAILBOX_SNOOZE_MAX_MS = 90 * 24 * 60 * 60 * 1000;

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

const parseSnoozeUntilMs = (value: unknown, nowMs: number): number | null => {
  const ms = toMillis(value);
  if (!ms || !Number.isFinite(ms)) return null;
  const safe = Math.round(ms);
  if (safe <= nowMs) return null;
  if (safe > nowMs + MAILBOX_SNOOZE_MAX_MS) return null;
  return safe;
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
    delete safeRow.encryption;
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
  const snoozedUntilMs =
    (typeof data.snoozedUntilMs === "number" && Number.isFinite(data.snoozedUntilMs)
      ? Math.round(data.snoozedUntilMs)
      : null) ?? toMillis(data.snoozedUntil);
  const snoozedAtMs =
    (typeof data.snoozedAtMs === "number" && Number.isFinite(data.snoozedAtMs)
      ? Math.round(data.snoozedAtMs)
      : null) ?? toMillis(data.snoozedAt);
  const archivedAtMs =
    (typeof data.archivedAtMs === "number" && Number.isFinite(data.archivedAtMs)
      ? Math.round(data.archivedAtMs)
      : null) ?? toMillis(data.archivedAt);

  const metadataRaw = data.metadata;
  const metadata =
    metadataRaw && typeof metadataRaw === "object" && !Array.isArray(metadataRaw)
      ? (metadataRaw as Record<string, unknown>)
      : null;
  const metadataMessageId = normalizeText(metadata?.messageId);
  let normalizedMetadata = normalizeAttachmentUrls(
    metadata,
    metadataMessageId || docSnap.id
  );
  if (
    normalizeText(data.type) === "direct_message" &&
    normalizedMetadata?.tipsterTip !== true &&
    !normalizeText(normalizedMetadata?.conversationId)
  ) {
    const senderEmail = normalizeMailboxEmail(normalizedMetadata?.senderEmail);
    const recipientEmail = normalizeMailboxEmail(normalizedMetadata?.recipientEmail);
    if (senderEmail && recipientEmail && senderEmail !== recipientEmail) {
      normalizedMetadata = {
        ...normalizedMetadata,
        conversationId: mailboxConversationId(senderEmail, recipientEmail),
      };
    }
  }
  let title = normalizeText(data.title) || "Bohemka.App";
  let body = normalizeText(data.body) || "Máš novou zprávu.";

  if (data.encryptedContent != null) {
    try {
      const decrypted = decryptMailboxJson<Record<string, unknown>>(
        data.encryptedContent,
        `message:${metadataMessageId || docSnap.id}`
      );
      const subject = normalizeText(decrypted.subject);
      const messageText = normalizeText(decrypted.messageText);
      title = subject || "Zpráva";
      body = messageText || "Příloha bez textu.";
      normalizedMetadata = {
        ...(normalizedMetadata ?? {}),
        messageText,
        encrypted: true,
      };
    } catch (error) {
      console.error("Mailbox message decryption failed.", {
        mailboxDocumentId: docSnap.id,
        error: error instanceof Error ? error.message : "unknown error",
      });
      title = "Šifrovaná zpráva";
      body = "Obsah zprávy se nepodařilo bezpečně načíst.";
      normalizedMetadata = {
        ...(normalizedMetadata ?? {}),
        messageText: "",
        encrypted: true,
        encryptionUnavailable: true,
      };
    }
  }

  return {
    id: docSnap.id,
    type: normalizeText(data.type) || "generic",
    title,
    body,
    deepLink: normalizeText(data.deepLink) || "/nastaveni",
    read: data.read === true,
    createdAtMs,
    readAtMs,
    snoozedUntilMs,
    snoozedAtMs,
    archivedAtMs,
    metadata: normalizedMetadata,
  };
};

const getMailboxCollection = (email: string) =>
  adminDb!.collection("usersPrivate").doc(email).collection("mailbox");

type MailboxReadReceiptCandidate = {
  messageId: string;
  senderEmail: string;
  pairedMailboxId: string;
};

const normalizeMailboxEmail = (value: unknown): string =>
  normalizeText(value).toLowerCase();

const readReceiptCandidateFromSnapshot = (
  docSnap: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>,
  recipientEmail: string
): MailboxReadReceiptCandidate | null => {
  if (!docSnap.exists) return null;
  const data = (docSnap.data() ?? {}) as Record<string, unknown>;
  if (normalizeText(data.type) !== "direct_message") return null;
  const metadataRaw = data.metadata;
  if (!metadataRaw || typeof metadataRaw !== "object" || Array.isArray(metadataRaw)) {
    return null;
  }
  const metadata = metadataRaw as Record<string, unknown>;
  if (normalizeText(metadata.mailboxDirection) !== "received") return null;
  const storedRecipientEmail = normalizeMailboxEmail(metadata.recipientEmail);
  if (storedRecipientEmail && storedRecipientEmail !== recipientEmail) return null;
  const senderEmail = normalizeMailboxEmail(metadata.senderEmail);
  const messageId = normalizeText(metadata.messageId);
  if (!senderEmail || senderEmail === recipientEmail || !messageId) return null;
  return {
    messageId,
    senderEmail,
    pairedMailboxId: normalizeText(metadata.pairedMailboxId),
  };
};

const propagateMailboxReadReceipts = async (
  candidatesRaw: MailboxReadReceiptCandidate[],
  recipientEmail: string,
  readAtMs: number
) => {
  if (!adminDb || candidatesRaw.length === 0) return;
  const candidates = [
    ...new Map(
      candidatesRaw.map((candidate) => [
        `${candidate.senderEmail}\n${candidate.messageId}`,
        candidate,
      ])
    ).values(),
  ];

  const targetSnapshots = await Promise.all(
    candidates.map(async (candidate) => {
      if (candidate.pairedMailboxId) {
        const directSnapshot = await getMailboxCollection(candidate.senderEmail)
          .doc(candidate.pairedMailboxId)
          .get();
        if (directSnapshot.exists) return [directSnapshot];
      }
      const fallbackSnapshot = await getMailboxCollection(candidate.senderEmail)
        .where("metadata.messageId", "==", candidate.messageId)
        .limit(4)
        .get();
      return fallbackSnapshot.docs;
    })
  );

  const targetRefs = new Map<string, FirebaseFirestore.DocumentReference>();
  targetSnapshots.forEach((snapshots, candidateIndex) => {
    const candidate = candidates[candidateIndex];
    if (!candidate) return;
    snapshots.forEach((snapshot) => {
      const data = (snapshot.data() ?? {}) as Record<string, unknown>;
      const metadataRaw = data.metadata;
      if (!metadataRaw || typeof metadataRaw !== "object" || Array.isArray(metadataRaw)) return;
      const metadata = metadataRaw as Record<string, unknown>;
      if (normalizeText(metadata.messageId) !== candidate.messageId) return;
      if (normalizeText(metadata.mailboxDirection) !== "sent") return;
      if (normalizeMailboxEmail(metadata.recipientEmail) !== recipientEmail) return;
      const existingReadAtMs = toMillis(metadata.recipientReadAtMs);
      if (existingReadAtMs) return;
      targetRefs.set(snapshot.ref.path, snapshot.ref);
    });
  });

  const refs = [...targetRefs.values()];
  for (let offset = 0; offset < refs.length; offset += 400) {
    const batch = adminDb.batch();
    refs.slice(offset, offset + 400).forEach((ref) => {
      batch.update(ref, {
        "metadata.recipientReadAtMs": readAtMs,
        "metadata.recipientReadAt": FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
  }
};

const cleanupDeletedMailboxAttachments = async (
  candidates: MailboxAttachmentCleanupCandidate[]
) => {
  const byMessageId = new Map<
    string,
    { participantEmails: Set<string>; storageObjects: Map<string, MailboxStorageObject> }
  >();

  candidates.forEach((candidate) => {
    const group = byMessageId.get(candidate.messageId) ?? {
      participantEmails: new Set<string>(),
      storageObjects: new Map<string, MailboxStorageObject>(),
    };
    candidate.participantEmails.forEach((email) => group.participantEmails.add(email));
    candidate.storageObjects.forEach((storageObject) => {
      group.storageObjects.set(
        `${storageObject.bucketName ?? ""}\n${storageObject.path}`,
        storageObject
      );
    });
    byMessageId.set(candidate.messageId, group);
  });

  const groups = [...byMessageId.entries()];
  const unreferencedObjects: MailboxStorageObject[] = [];
  let skippedReferenced = 0;
  let skippedUnverified = 0;

  for (let offset = 0; offset < groups.length; offset += 20) {
    const chunk = groups.slice(offset, offset + 20);
    const results = await Promise.all(
      chunk.map(async ([messageId, group]) => {
        const referenceChecks = await Promise.allSettled(
          [...group.participantEmails].map((email) =>
            getMailboxCollection(email)
              .where("metadata.messageId", "==", messageId)
              .limit(1)
              .get()
          )
        );
        if (referenceChecks.some((result) => result.status === "rejected")) {
          return { kind: "unverified" as const, storageObjects: [] };
        }
        const remainsReferenced = referenceChecks.some(
          (result) => result.status === "fulfilled" && !result.value.empty
        );
        return {
          kind: remainsReferenced ? ("referenced" as const) : ("unreferenced" as const),
          storageObjects: remainsReferenced ? [] : [...group.storageObjects.values()],
        };
      })
    );

    results.forEach((result) => {
      if (result.kind === "referenced") skippedReferenced += 1;
      if (result.kind === "unverified") skippedUnverified += 1;
      unreferencedObjects.push(...result.storageObjects);
    });
  }

  const storage = await deleteMailboxStorageObjects(unreferencedObjects);
  return {
    ...storage,
    skippedReferenced,
    skippedUnverified,
  };
};

const getUnreadCount = async (email: string): Promise<number> => {
  const nowMs = Date.now();
  const unreadSnap = await getMailboxCollection(email).where("read", "==", false).get();
  return unreadSnap.docs.filter((docSnap) => {
    const data = (docSnap.data() ?? {}) as Record<string, unknown>;
    const archivedAtMs =
      (typeof data.archivedAtMs === "number" && Number.isFinite(data.archivedAtMs)
        ? Math.round(data.archivedAtMs)
        : null) ?? toMillis(data.archivedAt);
    if (archivedAtMs) return false;

    const snoozedUntilMs =
      (typeof data.snoozedUntilMs === "number" && Number.isFinite(data.snoozedUntilMs)
        ? Math.round(data.snoozedUntilMs)
        : null) ?? toMillis(data.snoozedUntil);
    return !snoozedUntilMs || snoozedUntilMs <= nowMs;
  }).length;
};

export async function GET(req: NextRequest) {
  const guard = await requireAdvisorAuthedRateLimited(req, {
    namespace: "api:mailbox:get",
    limit: MAILBOX_GET_RATE_LIMIT,
    windowMs: MAILBOX_GET_RATE_LIMIT_WINDOW_MS,
    allowImpersonation: true,
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
    allowImpersonation: true,
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
        snoozeUntilMs?: unknown;
        clearSnooze?: unknown;
        archived?: unknown;
      }
    | null;

  const markAllRead = body?.markAllRead === true;
  const clearSnooze = body?.clearSnooze === true;
  const hasSnoozeUpdate = clearSnooze || body?.snoozeUntilMs !== undefined;
  const hasArchiveUpdate = typeof body?.archived === "boolean";
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

  if (markAllRead && (hasSnoozeUpdate || hasArchiveUpdate)) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Archivaci ani odložení nelze kombinovat s označením vše přečteno." },
        { status: 400 }
      ),
      ctx
    );
  }

  if (hasSnoozeUpdate && hasArchiveUpdate) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Archivaci nelze kombinovat s odložením zprávy." },
        { status: 400 }
      ),
      ctx
    );
  }

  try {
    const mailboxCol = getMailboxCollection(ctx.email);
    const nowMs = Date.now();
    let updated = 0;
    const readReceiptCandidates: MailboxReadReceiptCandidate[] = [];
    const snoozeUntilMs = hasSnoozeUpdate && !clearSnooze
      ? parseSnoozeUntilMs(body?.snoozeUntilMs, nowMs)
      : null;

    if (hasSnoozeUpdate && !clearSnooze && !snoozeUntilMs) {
      return withRateLimitHeaders(
        NextResponse.json(
          { ok: false, error: "Neplatný čas odložení zprávy." },
          { status: 400 }
        ),
        ctx
      );
    }

    if (markAllRead) {
      while (true) {
        const unreadSnap = await mailboxCol
          .where("read", "==", false)
          .limit(MAILBOX_MARK_ALL_BATCH_SIZE)
          .get();
        if (unreadSnap.empty) break;

        const batch = adminDb.batch();
        unreadSnap.docs.forEach((docSnap) => {
          const receiptCandidate = readReceiptCandidateFromSnapshot(docSnap, ctx.email);
          if (receiptCandidate) readReceiptCandidates.push(receiptCandidate);
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
    } else if (hasArchiveUpdate) {
      const archive = body?.archived === true;
      const batch = adminDb.batch();
      ids.forEach((id) => {
        const ref = mailboxCol.doc(id);
        batch.set(
          ref,
          archive
            ? {
                archivedAtMs: nowMs,
                archivedAt: FieldValue.serverTimestamp(),
                snoozedUntilMs: FieldValue.delete(),
                snoozedUntil: FieldValue.delete(),
                snoozedAtMs: FieldValue.delete(),
                snoozedAt: FieldValue.delete(),
                snoozeReminderProcessingAtMs: FieldValue.delete(),
                snoozeReminderProcessingAt: FieldValue.delete(),
                snoozeReminderClaimId: FieldValue.delete(),
              }
            : {
                archivedAtMs: FieldValue.delete(),
                archivedAt: FieldValue.delete(),
              },
          { merge: true }
        );
      });
      await batch.commit();
      updated = ids.length;
    } else if (hasSnoozeUpdate) {
      const batch = adminDb.batch();
      ids.forEach((id) => {
        const ref = mailboxCol.doc(id);
        batch.set(
          ref,
          clearSnooze
            ? {
                snoozedUntilMs: FieldValue.delete(),
                snoozedUntil: FieldValue.delete(),
                snoozedAtMs: FieldValue.delete(),
                snoozedAt: FieldValue.delete(),
                snoozeReminderProcessingAtMs: FieldValue.delete(),
                snoozeReminderProcessingAt: FieldValue.delete(),
                snoozeReminderClaimId: FieldValue.delete(),
              }
            : {
                snoozedUntilMs: snoozeUntilMs,
                snoozedUntil: new Date(snoozeUntilMs!),
                snoozedAtMs: nowMs,
                snoozedAt: FieldValue.serverTimestamp(),
                snoozeReminderSentAtMs: FieldValue.delete(),
                snoozeReminderSentAt: FieldValue.delete(),
                snoozeReminderSkippedAtMs: FieldValue.delete(),
                snoozeReminderSkippedAt: FieldValue.delete(),
                snoozeReminderProcessingAtMs: FieldValue.delete(),
                snoozeReminderProcessingAt: FieldValue.delete(),
                snoozeReminderClaimId: FieldValue.delete(),
                snoozeReminderLastError: FieldValue.delete(),
                snoozeReminderLastStatus: FieldValue.delete(),
              },
          { merge: true }
        );
      });
      await batch.commit();
      updated = ids.length;
    } else {
      const snapshots = await Promise.all(ids.map((id) => mailboxCol.doc(id).get()));
      const batch = adminDb.batch();
      snapshots.forEach((snapshot) => {
        if (!snapshot.exists) return;
        const receiptCandidate = readReceiptCandidateFromSnapshot(snapshot, ctx.email);
        if (receiptCandidate) readReceiptCandidates.push(receiptCandidate);
        const data = (snapshot.data() ?? {}) as Record<string, unknown>;
        if (data.read === true) return;
        batch.update(snapshot.ref, {
          read: true,
          readAtMs: nowMs,
          readAt: FieldValue.serverTimestamp(),
        });
        updated += 1;
      });
      if (updated > 0) await batch.commit();
    }

    try {
      await propagateMailboxReadReceipts(readReceiptCandidates, ctx.email, nowMs);
    } catch (receiptError) {
      console.error("Mailbox read-receipt propagation failed:", receiptError);
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
    allowImpersonation: true,
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
    const documentRefs = ids.map((id) => mailboxCol.doc(id));
    const documentSnapshots = await Promise.all(documentRefs.map((ref) => ref.get()));
    const attachmentCleanupCandidates = documentSnapshots
      .map((snapshot) => {
        const data = (snapshot.data() ?? {}) as Record<string, unknown>;
        return parseMailboxAttachmentCleanupCandidate(data.metadata, ctx.email);
      })
      .filter(
        (candidate): candidate is MailboxAttachmentCleanupCandidate => candidate !== null
      );
    const batch = adminDb.batch();
    documentRefs.forEach((ref) => {
      batch.delete(ref);
    });
    await batch.commit();

    try {
      const cleanup = await cleanupDeletedMailboxAttachments(
        attachmentCleanupCandidates
      );
      if (cleanup.failed > 0 || cleanup.skippedUnverified > 0) {
        console.error("Mailbox DELETE attachment cleanup was incomplete.", cleanup);
      }
    } catch (cleanupError) {
      console.error("Mailbox DELETE attachment cleanup failed.", cleanupError);
    }

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
