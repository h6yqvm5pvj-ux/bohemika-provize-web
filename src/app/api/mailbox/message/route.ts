import { FieldValue } from "firebase-admin/firestore";
import { NextResponse, type NextRequest } from "next/server";

import { requireAuthedRateLimited, withRateLimitHeaders } from "@/lib/server/apiEntryGuard";
import { adminDb } from "@/lib/server/firebaseAdmin";
import {
  deleteMailboxStorageObjects,
  parseMailboxAttachmentCleanupCandidate,
} from "@/lib/server/mailboxAttachmentStorage";
import { decryptMailboxJson, encryptMailboxJson } from "@/lib/server/mailboxEncryption";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MESSAGE_ACTION_RATE_LIMIT = 120;
const MESSAGE_ACTION_RATE_LIMIT_WINDOW_MS = 60_000;
const MESSAGE_TEXT_MAX_LEN = 4_000;
const MESSAGE_DOC_ID_MAX_LEN = 240;
const MESSAGE_REMINDER_MAX_MS = 90 * 24 * 60 * 60 * 1000;
const REACTION_EMOJIS = new Set(["👍", "❤️", "😂", "🎉", "😮", "🙏"]);

type StoredReaction = {
  emoji: string;
  userEmails: string[];
};

type MessageIdentity = {
  direction: "sent" | "received";
  senderEmail: string;
  recipientEmail: string;
  messageId: string;
  pairedMailboxId: string;
  conversationId: string;
  metadata: Record<string, unknown>;
  participantEmails: string[];
  groupConversation: boolean;
};

type LoadedMessagePair = {
  localRef: FirebaseFirestore.DocumentReference;
  localData: Record<string, unknown>;
  localIdentity: MessageIdentity;
  copyRefs: FirebaseFirestore.DocumentReference[];
};

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const normalizeEmail = (value: unknown): string => normalizeText(value).toLowerCase();

const parseDocumentId = (value: unknown): string => {
  const id = normalizeText(value);
  if (!id || id.length > MESSAGE_DOC_ID_MAX_LEN || id.includes("/")) return "";
  return id;
};

const metadataFromData = (data: Record<string, unknown>): Record<string, unknown> | null => {
  const metadata = data.metadata;
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : null;
};

const identityFromData = (
  data: Record<string, unknown>,
  mailboxOwnerEmail: string
): MessageIdentity | null => {
  if (normalizeText(data.type) !== "direct_message") return null;
  const metadata = metadataFromData(data);
  if (!metadata || metadata.tipsterTip === true) return null;
  const senderEmail = normalizeEmail(metadata.senderEmail);
  const recipientEmail = normalizeEmail(metadata.recipientEmail);
  const direction = normalizeText(metadata.mailboxDirection);
  const groupConversation = metadata.groupConversation === true;
  const participantEmails = groupConversation && Array.isArray(metadata.participantEmails)
    ? [...new Set(metadata.participantEmails.map(normalizeEmail).filter(Boolean))]
    : [senderEmail, recipientEmail].filter(Boolean);
  if (
    !senderEmail ||
    (!groupConversation && (!recipientEmail || senderEmail === recipientEmail)) ||
    !participantEmails.includes(mailboxOwnerEmail) ||
    !participantEmails.includes(senderEmail) ||
    (direction !== "sent" && direction !== "received")
  ) {
    return null;
  }
  if (
    (direction === "sent" && mailboxOwnerEmail !== senderEmail) ||
    (direction === "received" &&
      (groupConversation
        ? mailboxOwnerEmail === senderEmail
        : mailboxOwnerEmail !== recipientEmail))
  ) {
    return null;
  }
  return {
    direction,
    senderEmail,
    recipientEmail,
    messageId: normalizeText(metadata.messageId),
    pairedMailboxId: normalizeText(metadata.pairedMailboxId),
    conversationId: normalizeText(metadata.conversationId),
    metadata,
    participantEmails,
    groupConversation,
  };
};

const identitiesMatch = (first: MessageIdentity, second: MessageIdentity): boolean =>
  first.senderEmail === second.senderEmail &&
  first.recipientEmail === second.recipientEmail &&
  first.messageId === second.messageId &&
  first.direction !== second.direction &&
  first.conversationId === second.conversationId;

const loadMessagePair = async (
  mailboxOwnerEmail: string,
  localDocumentId: string
): Promise<LoadedMessagePair | null> => {
  if (!adminDb) return null;
  const localRef = adminDb
    .collection("usersPrivate")
    .doc(mailboxOwnerEmail)
    .collection("mailbox")
    .doc(localDocumentId);
  const localSnapshot = await localRef.get();
  if (!localSnapshot.exists) return null;
  const localData = (localSnapshot.data() ?? {}) as Record<string, unknown>;
  const localIdentity = identityFromData(localData, mailboxOwnerEmail);
  if (!localIdentity?.messageId) return null;

  if (localIdentity.groupConversation) {
    if (!localIdentity.conversationId) return null;
    const conversationSnapshot = await adminDb
      .collection("usersPrivate")
      .doc(mailboxOwnerEmail)
      .collection("mailboxConversations")
      .doc(localIdentity.conversationId)
      .get();
    const conversationData = (conversationSnapshot.data() ?? {}) as Record<string, unknown>;
    if (!conversationSnapshot.exists || conversationData.active === false) return null;
    const activeParticipantEmails = Array.isArray(conversationData.participantEmails)
      ? [...new Set(conversationData.participantEmails.map(normalizeEmail).filter(Boolean))]
      : localIdentity.participantEmails;
    if (!activeParticipantEmails.includes(mailboxOwnerEmail)) return null;
    localIdentity.participantEmails = activeParticipantEmails;
    const snapshots = await Promise.all(
      localIdentity.participantEmails.map((email) =>
        adminDb!
          .collection("usersPrivate")
          .doc(email)
          .collection("mailbox")
          .doc(localIdentity.messageId)
          .get()
      )
    );
    const validSnapshots = snapshots.filter((snapshot) => {
      if (!snapshot.exists) return false;
      const ownerEmail = normalizeEmail(snapshot.ref.parent.parent?.id);
      const identity = identityFromData(
        (snapshot.data() ?? {}) as Record<string, unknown>,
        ownerEmail
      );
      return Boolean(
        identity &&
        identity.messageId === localIdentity.messageId &&
        identity.conversationId === localIdentity.conversationId
      );
    });
    if (!validSnapshots.some((snapshot) => snapshot.ref.path === localRef.path)) return null;
    const copyRefs = validSnapshots.map((snapshot) => snapshot.ref);
    return {
      localRef,
      localData,
      localIdentity,
      copyRefs,
    };
  }

  const pairedOwnerEmail =
    localIdentity.direction === "sent"
      ? localIdentity.recipientEmail
      : localIdentity.senderEmail;
  const pairedMailbox = adminDb
    .collection("usersPrivate")
    .doc(pairedOwnerEmail)
    .collection("mailbox");

  if (localIdentity.pairedMailboxId) {
    const directRef = pairedMailbox.doc(localIdentity.pairedMailboxId);
    const directSnapshot = await directRef.get();
    if (directSnapshot.exists) {
      const directData = (directSnapshot.data() ?? {}) as Record<string, unknown>;
      const directIdentity = identityFromData(directData, pairedOwnerEmail);
      if (directIdentity && identitiesMatch(localIdentity, directIdentity)) {
        return {
          localRef,
          localData,
          localIdentity,
          copyRefs: [localRef, directRef],
        };
      }
    }
  }

  const fallbackSnapshot = await pairedMailbox
    .where("metadata.messageId", "==", localIdentity.messageId)
    .limit(4)
    .get();
  const fallbackDocument = fallbackSnapshot.docs.find((snapshot) => {
    const data = (snapshot.data() ?? {}) as Record<string, unknown>;
    const identity = identityFromData(data, pairedOwnerEmail);
    return identity ? identitiesMatch(localIdentity, identity) : false;
  });
  if (!fallbackDocument) return null;

  return {
    localRef,
    localData,
    localIdentity,
    copyRefs: [localRef, fallbackDocument.ref],
  };
};

const parseStoredReactions = (
  value: unknown,
  participants: Set<string>
): StoredReaction[] => {
  if (!Array.isArray(value)) return [];
  const byEmoji = new Map<string, Set<string>>();
  value.forEach((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return;
    const row = entry as Record<string, unknown>;
    const emoji = normalizeText(row.emoji);
    if (!REACTION_EMOJIS.has(emoji) || !Array.isArray(row.userEmails)) return;
    const users = byEmoji.get(emoji) ?? new Set<string>();
    row.userEmails.forEach((email) => {
      const normalized = normalizeEmail(email);
      if (participants.has(normalized)) users.add(normalized);
    });
    if (users.size > 0) byEmoji.set(emoji, users);
  });
  return [...byEmoji.entries()].map(([emoji, userEmails]) => ({
    emoji,
    userEmails: [...userEmails],
  }));
};

const guardRequest = (req: NextRequest, action: string) =>
  requireAuthedRateLimited(req, {
    namespace: `api:mailbox:message:${action}`,
    limit: MESSAGE_ACTION_RATE_LIMIT,
    windowMs: MESSAGE_ACTION_RATE_LIMIT_WINDOW_MS,
    allowImpersonation: true,
  });

const unavailableResponse = (ctx: Parameters<typeof withRateLimitHeaders>[1]) =>
  withRateLimitHeaders(
    NextResponse.json(
      { ok: false, error: "Zprávu nebo její párovou kopii se nepodařilo najít." },
      { status: 404 }
    ),
    ctx
  );

export async function POST(req: NextRequest) {
  const guard = await guardRequest(req, "reaction");
  if (!guard.ok) return guard.response;
  const { ctx } = guard;
  if (!adminDb) {
    return withRateLimitHeaders(
      NextResponse.json({ ok: false, error: "Server není správně nakonfigurován." }, { status: 500 }),
      ctx
    );
  }

  const body = (await req.json().catch(() => null)) as
    | { id?: unknown; emoji?: unknown }
    | null;
  const id = parseDocumentId(body?.id);
  const emoji = normalizeText(body?.emoji);
  if (!id || !REACTION_EMOJIS.has(emoji)) {
    return withRateLimitHeaders(
      NextResponse.json({ ok: false, error: "Neplatná reakce." }, { status: 400 }),
      ctx
    );
  }

  try {
    const pair = await loadMessagePair(ctx.email, id);
    if (!pair) return unavailableResponse(ctx);
    const participants = new Set(pair.localIdentity.participantEmails);
    const reactions = await adminDb.runTransaction(async (transaction) => {
      const snapshots = await Promise.all(
        pair.copyRefs.map((ref) => transaction.get(ref))
      );
      const localSnapshot = snapshots.find(
        (snapshot) => snapshot.ref.path === pair.localRef.path
      );
      if (!localSnapshot?.exists || snapshots.some((snapshot) => !snapshot.exists)) {
        throw new Error("message-pair-missing");
      }
      const latestData = (localSnapshot.data() ?? {}) as Record<string, unknown>;
      const latestIdentity = identityFromData(latestData, ctx.email);
      if (!latestIdentity) throw new Error("message-identity-invalid");
      const current = parseStoredReactions(latestIdentity.metadata.reactions, participants);
      const target = current.find((reaction) => reaction.emoji === emoji);
      const reacted = target?.userEmails.includes(ctx.email) === true;
      const next = current
        .map((reaction) =>
          reaction.emoji === emoji
            ? {
                ...reaction,
                userEmails: reacted
                  ? reaction.userEmails.filter((email) => email !== ctx.email)
                  : [...reaction.userEmails, ctx.email],
              }
            : reaction
        )
        .filter((reaction) => reaction.userEmails.length > 0);
      if (!target && !reacted) next.push({ emoji, userEmails: [ctx.email] });

      const nowMs = Date.now();
      const update = {
        "metadata.reactions": next,
        "metadata.reactionsUpdatedAtMs": nowMs,
        "metadata.reactionsUpdatedAt": FieldValue.serverTimestamp(),
      };
      pair.copyRefs.forEach((ref) => transaction.update(ref, update));
      return next;
    });

    return withRateLimitHeaders(NextResponse.json({ ok: true, reactions }), ctx);
  } catch (error) {
    console.error("Mailbox message reaction failed:", error);
    return withRateLimitHeaders(
      NextResponse.json({ ok: false, error: "Reakci se nepodařilo uložit." }, { status: 500 }),
      ctx
    );
  }
}

export async function PATCH(req: NextRequest) {
  const guard = await guardRequest(req, "edit");
  if (!guard.ok) return guard.response;
  const { ctx } = guard;
  if (!adminDb) {
    return withRateLimitHeaders(
      NextResponse.json({ ok: false, error: "Server není správně nakonfigurován." }, { status: 500 }),
      ctx
    );
  }

  const body = (await req.json().catch(() => null)) as
    | {
        id?: unknown;
        text?: unknown;
        action?: unknown;
        pinned?: unknown;
        remindAtMs?: unknown;
      }
    | null;
  const id = parseDocumentId(body?.id);
  const action = normalizeText(body?.action) || "edit";
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, MESSAGE_TEXT_MAX_LEN) : "";
  if (!id) {
    return withRateLimitHeaders(
      NextResponse.json({ ok: false, error: "Neplatná zpráva." }, { status: 400 }),
      ctx
    );
  }

  try {
    const pair = await loadMessagePair(ctx.email, id);
    if (!pair) return unavailableResponse(ctx);

    if (action === "pin") {
      if (typeof body?.pinned !== "boolean") {
        return withRateLimitHeaders(
          NextResponse.json({ ok: false, error: "Neplatný stav připnutí." }, { status: 400 }),
          ctx
        );
      }
      const pinnedAtMs = body.pinned ? Date.now() : null;
      await pair.localRef.update(
        body.pinned
          ? {
              pinnedAtMs,
              pinnedAt: FieldValue.serverTimestamp(),
            }
          : {
              pinnedAtMs: FieldValue.delete(),
              pinnedAt: FieldValue.delete(),
            }
      );
      return withRateLimitHeaders(
        NextResponse.json({ ok: true, pinnedAtMs }),
        ctx
      );
    }

    if (action === "reminder") {
      if (
        pair.localIdentity.direction !== "sent" ||
        pair.localIdentity.senderEmail !== ctx.email
      ) {
        return withRateLimitHeaders(
          NextResponse.json(
            { ok: false, error: "Připomenutí lze nastavit pouze u vlastní zprávy." },
            { status: 403 }
          ),
          ctx
        );
      }
      const conversationId = normalizeText(pair.localIdentity.metadata.conversationId);
      if (!conversationId) {
        return withRateLimitHeaders(
          NextResponse.json({ ok: false, error: "Zpráva nemá platnou konverzaci." }, { status: 400 }),
          ctx
        );
      }
      const requestedAtMs = Number(body?.remindAtMs);
      const clearing = body?.remindAtMs === null;
      const nowMs = Date.now();
      const remindAtMs =
        !clearing && Number.isFinite(requestedAtMs)
          ? Math.round(requestedAtMs)
          : null;
      if (
        !clearing &&
        (!remindAtMs || remindAtMs <= nowMs || remindAtMs > nowMs + MESSAGE_REMINDER_MAX_MS)
      ) {
        return withRateLimitHeaders(
          NextResponse.json({ ok: false, error: "Neplatný čas připomenutí." }, { status: 400 }),
          ctx
        );
      }

      const conversationRef = adminDb
        .collection("usersPrivate")
        .doc(ctx.email)
        .collection("mailboxConversations")
        .doc(conversationId);
      await adminDb.runTransaction(async (transaction) => {
        const conversationSnapshot = await transaction.get(conversationRef);
        const conversationData = (conversationSnapshot.data() ?? {}) as Record<string, unknown>;
        const previousMessageId = parseDocumentId(
          conversationData.pendingReplyReminderMessageId
        );
        if (previousMessageId && previousMessageId !== id) {
          transaction.set(
            pair.localRef.parent.doc(previousMessageId),
            {
              replyReminderAtMs: FieldValue.delete(),
              replyReminderAt: FieldValue.delete(),
              replyReminderSetAtMs: FieldValue.delete(),
              replyReminderSetAt: FieldValue.delete(),
            },
            { merge: true }
          );
        }
        transaction.update(
          pair.localRef,
          clearing
            ? {
                replyReminderAtMs: FieldValue.delete(),
                replyReminderAt: FieldValue.delete(),
                replyReminderSetAtMs: FieldValue.delete(),
                replyReminderSetAt: FieldValue.delete(),
              }
            : {
                replyReminderAtMs: remindAtMs,
                replyReminderAt: new Date(remindAtMs!),
                replyReminderSetAtMs: nowMs,
                replyReminderSetAt: FieldValue.serverTimestamp(),
                replyReminderLastStatus: FieldValue.delete(),
                replyReminderLastError: FieldValue.delete(),
              }
        );
        transaction.set(
          conversationRef,
          clearing
            ? {
                pendingReplyReminderMessageId: FieldValue.delete(),
                pendingReplyReminderAtMs: FieldValue.delete(),
              }
            : {
                conversationId,
                pendingReplyReminderMessageId: id,
                pendingReplyReminderAtMs: remindAtMs,
              },
          { merge: true }
        );
      });
      return withRateLimitHeaders(
        NextResponse.json({
          ok: true,
          replyReminderAtMs: clearing ? null : remindAtMs,
          replyReminderSetAtMs: clearing ? null : nowMs,
        }),
        ctx
      );
    }

    if (action !== "edit") {
      return withRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Neplatná akce se zprávou." }, { status: 400 }),
        ctx
      );
    }
    if (
      pair.localIdentity.direction !== "sent" ||
      pair.localIdentity.senderEmail !== ctx.email
    ) {
      return withRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Upravit můžeš pouze vlastní zprávu." }, { status: 403 }),
        ctx
      );
    }
    const hasAttachments = Array.isArray(pair.localIdentity.metadata.attachments) &&
      pair.localIdentity.metadata.attachments.length > 0;
    if (!text && !hasAttachments) {
      return withRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Text zprávy nemůže být prázdný." }, { status: 400 }),
        ctx
      );
    }

    const nowMs = Date.now();
    const commonUpdate: Record<string, unknown> = {
      "metadata.editedAtMs": nowMs,
      "metadata.editedAt": FieldValue.serverTimestamp(),
    };
    if (pair.localData.encryptedContent != null) {
      const decrypted = decryptMailboxJson<Record<string, unknown>>(
        pair.localData.encryptedContent,
        `message:${pair.localIdentity.messageId}`
      );
      const subject = normalizeText(decrypted.subject) || "Zpráva";
      commonUpdate.encryptedContent = encryptMailboxJson(
        { subject, messageText: text },
        `message:${pair.localIdentity.messageId}`
      );
    } else {
      commonUpdate.body = text || "Příloha bez textu.";
      commonUpdate["metadata.messageText"] = text;
    }

    const batch = adminDb.batch();
    pair.copyRefs.forEach((ref) => batch.update(ref, commonUpdate));
    await batch.commit();

    return withRateLimitHeaders(
      NextResponse.json({ ok: true, text, editedAtMs: nowMs }),
      ctx
    );
  } catch (error) {
    console.error("Mailbox message edit failed:", error);
    return withRateLimitHeaders(
      NextResponse.json({ ok: false, error: "Zprávu se nepodařilo upravit." }, { status: 500 }),
      ctx
    );
  }
}

export async function DELETE(req: NextRequest) {
  const guard = await guardRequest(req, "delete");
  if (!guard.ok) return guard.response;
  const { ctx } = guard;
  if (!adminDb) {
    return withRateLimitHeaders(
      NextResponse.json({ ok: false, error: "Server není správně nakonfigurován." }, { status: 500 }),
      ctx
    );
  }

  const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
  const id = parseDocumentId(body?.id);
  if (!id) {
    return withRateLimitHeaders(
      NextResponse.json({ ok: false, error: "Neplatná zpráva." }, { status: 400 }),
      ctx
    );
  }

  try {
    const pair = await loadMessagePair(ctx.email, id);
    if (!pair) return unavailableResponse(ctx);
    if (
      pair.localIdentity.direction !== "sent" ||
      pair.localIdentity.senderEmail !== ctx.email
    ) {
      return withRateLimitHeaders(
        NextResponse.json({ ok: false, error: "Smazat můžeš pouze vlastní zprávu." }, { status: 403 }),
        ctx
      );
    }

    const cleanupCandidate = parseMailboxAttachmentCleanupCandidate(
      pair.localIdentity.metadata,
      ctx.email
    );
    const batch = adminDb.batch();
    pair.copyRefs.forEach((ref) => batch.delete(ref));
    await batch.commit();

    if (cleanupCandidate) {
      const cleanup = await deleteMailboxStorageObjects(cleanupCandidate.storageObjects);
      if (cleanup.failed > 0) {
        console.error("Mailbox message attachment cleanup was incomplete:", cleanup);
      }
    }

    return withRateLimitHeaders(
      NextResponse.json({ ok: true, deleted: pair.copyRefs.length }),
      ctx
    );
  } catch (error) {
    console.error("Mailbox own message delete failed:", error);
    return withRateLimitHeaders(
      NextResponse.json({ ok: false, error: "Zprávu se nepodařilo smazat." }, { status: 500 }),
      ctx
    );
  }
}
