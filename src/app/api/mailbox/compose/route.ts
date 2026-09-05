import { randomUUID } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { NextResponse, type NextRequest } from "next/server";

import { requireAuthedRateLimited, withRateLimitHeaders } from "@/lib/server/apiEntryGuard";
import { checkAdvisorSetup } from "@/lib/server/advisorSetupGuard";
import { adminDb, adminMessaging } from "@/lib/server/firebaseAdmin";
import {
  deleteMailboxStorageObjects,
  resolveConfiguredMailboxStorageBuckets,
} from "@/lib/server/mailboxAttachmentStorage";
import {
  encryptMailboxBytes,
  encryptMailboxJson,
  type MailboxEncryptionEnvelope,
} from "@/lib/server/mailboxEncryption";
import { mailboxConversationId } from "@/lib/server/mailboxConversation";
import { collectPushTokens } from "@/lib/server/pushTokens";
import {
  prepareSafeUserAttachmentFile,
  type PreparedSafeUserAttachmentFile,
} from "@/lib/server/safeUserAttachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAILBOX_COMPOSE_RATE_LIMIT = 40;
const MAILBOX_COMPOSE_RATE_LIMIT_WINDOW_MS = 60_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CLIENT_REQUEST_ID_RE = /^[A-Za-z0-9_-]{16,100}$/;
const GROUP_CONVERSATION_ID_RE = /^group_[A-Za-z0-9_-]{10,100}$/;

const SUBJECT_MAX_LEN = 160;
const MESSAGE_MAX_LEN = 4000;
const FILES_MAX_COUNT = 6;
const FILE_MAX_SIZE_BYTES = 20 * 1024 * 1024;
const FILE_TOTAL_MAX_BYTES = FILES_MAX_COUNT * FILE_MAX_SIZE_BYTES;
const CLIENT_METADATA_JSON_MAX_LEN = 12_000;
const TIP_SNAPSHOT_JSON_MAX_LEN = 24_000;
const TIP_FIELD_MAX_COUNT = 40;
const TIP_FIELD_LABEL_MAX_LEN = 90;
const TIP_FIELD_VALUE_MAX_LEN = 1200;
const MAILBOX_PUSH_MAX_TOKENS_PER_USER = 8;
const MAILBOX_PUSH_MAX_TOKENS_PER_MULTICAST = 500;
const GROUP_MAX_PARTICIPANTS = 12;
const GROUP_NAME_MAX_LEN = 80;

type MailboxAttachment = {
  id: string;
  name: string;
  url: string;
  contentType: string;
  sizeBytes: number;
  path: string;
  bucketName?: string;
  encryption: MailboxEncryptionEnvelope;
};

type PublicMailboxAttachment = Omit<
  MailboxAttachment,
  "path" | "bucketName" | "encryption"
>;

type TipSnapshotField = {
  label: string;
  value: string;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const parseRecipientEmails = (form: FormData): string[] => {
  const rawJson = normalizeText(form.get("recipientEmailsJson"));
  const candidates: unknown[] = [];
  if (rawJson) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      throw new Error("Seznam příjemců není platný.");
    }
    if (!Array.isArray(parsed)) throw new Error("Seznam příjemců není platný.");
    candidates.push(...parsed);
  } else {
    candidates.push(form.get("recipientEmail"));
  }
  return [...new Set(candidates.map(normalizeEmail).filter(Boolean))];
};

const parseClientMetadata = (value: unknown): Record<string, unknown> => {
  const raw = normalizeText(value);
  if (!raw) return {};
  if (raw.length > CLIENT_METADATA_JSON_MAX_LEN) {
    throw new Error("Metadata zprávy jsou příliš velká.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Metadata zprávy nejsou platný JSON.");
  }
  if (!isPlainObject(parsed)) return {};

  const tipProduct = normalizeText(parsed.tipProduct).slice(0, 40);
  const tipProductLabel = normalizeText(parsed.tipProductLabel).slice(0, 80);
  const clientMetadata: Record<string, unknown> = {};
  if (parsed.tipsterTip === true) clientMetadata.tipsterTip = true;
  if (tipProduct) clientMetadata.tipProduct = tipProduct;
  if (tipProductLabel) clientMetadata.tipProductLabel = tipProductLabel;
  return clientMetadata;
};

const parseTipSnapshot = (value: unknown): { fields: TipSnapshotField[] } | null => {
  const raw = normalizeText(value);
  if (!raw) return null;
  if (raw.length > TIP_SNAPSHOT_JSON_MAX_LEN) {
    throw new Error("Data tipu jsou příliš velká.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Data tipu nejsou platný JSON.");
  }

  const fieldsRaw = Array.isArray(parsed)
    ? parsed
    : isPlainObject(parsed) && Array.isArray(parsed.fields)
      ? parsed.fields
      : [];

  const fields = fieldsRaw
    .map((entry) => {
      if (!isPlainObject(entry)) return null;
      const label = normalizeText(entry.label).slice(0, TIP_FIELD_LABEL_MAX_LEN);
      const value = normalizeText(entry.value).slice(0, TIP_FIELD_VALUE_MAX_LEN);
      if (!label || !value) return null;
      return { label, value } satisfies TipSnapshotField;
    })
    .filter((entry): entry is TipSnapshotField => entry !== null)
    .slice(0, TIP_FIELD_MAX_COUNT);

  return { fields };
};

const toPublicAttachments = (
  attachments: MailboxAttachment[]
): PublicMailboxAttachment[] =>
  attachments.map(({ id, name, url, contentType, sizeBytes }) => ({
    id,
    name,
    url,
    contentType,
    sizeBytes,
  }));

const nameFromEmail = (email: string): string => {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[.\-_]/).filter(Boolean);
  if (!parts.length) return email;
  return parts
    .map((part) =>
      part.length > 0
        ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
        : part
    )
    .join(" ");
};

const pickDisplayName = (raw: Record<string, unknown> | null, email: string): string => {
  if (!raw) return nameFromEmail(email);
  const fullName = normalizeText(raw.fullName);
  if (fullName) return fullName;
  const name = normalizeText(raw.name);
  if (name) return name;
  return nameFromEmail(email);
};

const sanitizeFileName = (value: string): string => {
  const normalized = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  const stripped = normalized
    .replace(/[^\p{L}\p{N}._ -]/gu, "-")
    .replace(/[-_]{2,}/g, "-")
    .replace(/\s+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "");
  return stripped.slice(0, 120) || "priloha";
};

const isBucketMissingError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const row = error as {
    code?: number | string;
    statusCode?: number;
    message?: string;
  };
  const code = typeof row.code === "string" ? Number(row.code) : row.code;
  if (code === 404 || row.statusCode === 404) return true;
  const message = typeof row.message === "string" ? row.message.toLowerCase() : "";
  return message.includes("bucket") && message.includes("does not exist");
};

const buildMailboxAttachmentApiUrl = (messageId: string, attachmentId: string): string => {
  const params = new URLSearchParams({
    messageId,
    attachmentId,
  });
  return `/api/mailbox/attachment?${params.toString()}`;
};

const uploadAttachmentsToBucket = async ({
  bucketName,
  messageId,
  files,
  uploaderEmail,
}: {
  bucketName: string;
  messageId: string;
  files: PreparedSafeUserAttachmentFile[];
  uploaderEmail: string;
}): Promise<MailboxAttachment[]> => {
  const storage = getStorage();
  const bucket = storage.bucket(bucketName);
  const attachments: MailboxAttachment[] = [];
  const uploadPrefix = `mailbox/${messageId}`;

  try {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      if (!file) continue;
      const contentType = file.contentType;
      const originalName = sanitizeFileName(normalizeText(file.file.name) || "priloha");
      const attachmentId = randomUUID();
      const bytes = file.bytes;
      const encrypted = encryptMailboxBytes(
        bytes,
        `attachment:${messageId}:${attachmentId}`
      );
      const objectPath = `${uploadPrefix}/${Date.now()}-${index}-${attachmentId}.enc`;

      await bucket.file(objectPath).save(encrypted.bytes, {
        resumable: false,
        contentType: "application/octet-stream",
        metadata: {
          cacheControl: "private, no-store, max-age=0",
          metadata: {
            uploadedBy: uploaderEmail,
            encrypted: "true",
            encryptionKeyId: encrypted.encryption.keyId,
          },
        },
      });

      attachments.push({
        id: attachmentId,
        name: normalizeText(file.file.name) || originalName,
        url: buildMailboxAttachmentApiUrl(messageId, attachmentId),
        contentType,
        sizeBytes: bytes.length,
        path: objectPath,
        bucketName: bucket.name,
        encryption: encrypted.encryption,
      });
    }
  } catch (error) {
    const cleanup = await deleteMailboxStorageObjects(
      attachments.map(({ path, bucketName }) => ({ messageId, path, bucketName }))
    );
    if (cleanup.failed > 0) {
      console.error("Mailbox compose partial upload rollback failed.", cleanup);
    }
    throw error;
  }

  return attachments;
};

const uploadAttachmentsToStorage = async ({
  messageId,
  files,
  uploaderEmail,
}: {
  messageId: string;
  files: PreparedSafeUserAttachmentFile[];
  uploaderEmail: string;
}): Promise<MailboxAttachment[]> => {
  if (!files.length) return [];
  const bucketCandidates = resolveConfiguredMailboxStorageBuckets();
  if (!bucketCandidates.length) {
    throw new Error("Storage bucket není nakonfigurován.");
  }

  let lastError: unknown = null;
  for (const bucketName of bucketCandidates) {
    try {
      return await uploadAttachmentsToBucket({
        bucketName,
        messageId,
        files,
        uploaderEmail,
      });
    } catch (error) {
      lastError = error;
      if (!isBucketMissingError(error)) {
        throw error;
      }
      console.warn("Mailbox compose upload bucket not found, trying fallback bucket.", {
        bucketName,
      });
    }
  }

  if (isBucketMissingError(lastError)) {
    throw new Error(
      `Storage bucket neexistuje. Zkontroluj FIREBASE_STORAGE_BUCKET (zkoušeno: ${bucketCandidates.join(
        ", "
      )}).`
    );
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Nepodařilo se nahrát přílohy do Storage.");
};

const loadUserByEmail = async (
  email: string
): Promise<{ email: string; name: string } | null> => {
  if (!adminDb) return null;
  const usersCol = adminDb.collection("users");

  const directSnap = await usersCol.doc(email).get();
  if (directSnap.exists) {
    const data = (directSnap.data() as Record<string, unknown> | undefined) ?? {};
    return { email, name: pickDisplayName(data, email) };
  }

  const byEmailSnap = await usersCol.where("email", "==", email).limit(1).get();
  if (!byEmailSnap.empty) {
    const first = byEmailSnap.docs[0];
    const data = (first?.data() as Record<string, unknown> | undefined) ?? {};
    const resolvedEmail = normalizeEmail(data.email) || normalizeEmail(first?.id) || email;
    return {
      email: resolvedEmail,
      name: pickDisplayName(data, resolvedEmail),
    };
  }

  return null;
};

const isMailboxPushEnabled = (profile: Record<string, unknown>): boolean => {
  const settingsRaw = isPlainObject(profile.notificationSettings)
    ? profile.notificationSettings
    : null;
  if (!settingsRaw) return true;
  const channelsRaw = isPlainObject(settingsRaw.channels) ? settingsRaw.channels : null;
  const pushRaw = channelsRaw?.push;
  return typeof pushRaw === "boolean" ? pushRaw : true;
};

const loadMailboxPushTokens = async (recipientEmail: string): Promise<string[]> => {
  if (!adminDb) return [];
  const [publicSnap, privateSnap] = await Promise.all([
    adminDb.collection("users").doc(recipientEmail).get(),
    adminDb.collection("usersPrivate").doc(recipientEmail).get(),
  ]);

  const mergedProfile = {
    ...((publicSnap.data() as Record<string, unknown> | undefined) ?? {}),
    ...((privateSnap.data() as Record<string, unknown> | undefined) ?? {}),
  };

  if (!isMailboxPushEnabled(mergedProfile)) return [];
  return collectPushTokens(mergedProfile).slice(0, MAILBOX_PUSH_MAX_TOKENS_PER_USER);
};

const sendDirectMessagePushNotification = async ({
  req,
  recipientEmail,
  recipientMessageId,
  senderEmail,
  senderName,
  subject,
  isTipsterTip,
}: {
  req: NextRequest;
  recipientEmail: string;
  recipientMessageId: string;
  senderEmail: string;
  senderName: string;
  subject: string;
  isTipsterTip?: boolean;
}): Promise<void> => {
  if (!adminMessaging) return;

  const tokens = await loadMailboxPushTokens(recipientEmail);
  if (tokens.length === 0) return;

  const actorName = normalizeText(senderName) || nameFromEmail(senderEmail);
  const notificationTitle = isTipsterTip ? `Nový TIP od ${actorName}` : "Nová zpráva v poště";
  const body = isTipsterTip ? subject || "Přišel nový tip." : `${actorName} ti posílá zprávu! 📩`;
  const deepLink = isTipsterTip
    ? `/tipy/${encodeURIComponent(recipientMessageId)}`
    : `/posta?messageId=${encodeURIComponent(recipientMessageId)}`;
  const baseUrl = `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  const webPushLink = `${baseUrl}${deepLink}`;
  const createdAtIso = new Date().toISOString();

  for (let i = 0; i < tokens.length; i += MAILBOX_PUSH_MAX_TOKENS_PER_MULTICAST) {
    const chunk = tokens.slice(i, i + MAILBOX_PUSH_MAX_TOKENS_PER_MULTICAST);
    if (chunk.length === 0) continue;

    await adminMessaging.sendEachForMulticast({
      tokens: chunk,
      notification: {
        title: notificationTitle,
        body,
      },
      data: {
        type: isTipsterTip ? "tipster_tip" : "direct_message",
        messageId: recipientMessageId,
        senderEmail: normalizeEmail(senderEmail),
        senderName: actorName,
        subject: isTipsterTip ? subject.slice(0, 120) : "",
        createdAt: createdAtIso,
        deepLink,
      },
      webpush: {
        fcmOptions: {
          link: webPushLink,
        },
        notification: {
          icon: "/pwa/icon-192.png",
          badge: "/pwa/icon-192.png",
          tag: isTipsterTip
            ? `bohemika-tipster-tip-${recipientMessageId}`
            : `bohemika-mailbox-direct-message-${recipientMessageId}`,
          requireInteraction: false,
        },
      },
    });
  }
};

const resolveSenderName = async (senderEmail: string, senderUid: string): Promise<string> => {
  if (!adminDb) return nameFromEmail(senderEmail);
  const usersCol = adminDb.collection("users");

  const directSnap = await usersCol.doc(senderEmail).get();
  if (directSnap.exists) {
    const name = pickDisplayName(
      (directSnap.data() as Record<string, unknown> | undefined) ?? null,
      senderEmail
    );
    if (name) return name;
  }

  const byEmailSnap = await usersCol.where("email", "==", senderEmail).limit(1).get();
  if (!byEmailSnap.empty) {
    const name = pickDisplayName(
      (byEmailSnap.docs[0]?.data() as Record<string, unknown> | undefined) ?? null,
      senderEmail
    );
    if (name) return name;
  }

  if (senderUid) {
    const byUidSnap = await usersCol.where("userId", "==", senderUid).limit(1).get();
    if (!byUidSnap.empty) {
      const name = pickDisplayName(
        (byUidSnap.docs[0]?.data() as Record<string, unknown> | undefined) ?? null,
        senderEmail
      );
      if (name) return name;
    }
  }

  return nameFromEmail(senderEmail);
};

async function composeGroupMessage({
  req,
  senderEmail,
  senderUid,
  recipientEmails,
  requestedConversationId,
  requestedGroupName,
  subject,
  messageText,
  clientRequestId,
  files,
}: {
  req: NextRequest;
  senderEmail: string;
  senderUid: string;
  recipientEmails: string[];
  requestedConversationId: string;
  requestedGroupName: string;
  subject: string;
  messageText: string;
  clientRequestId: string;
  files: PreparedSafeUserAttachmentFile[];
}) {
  if (!adminDb) throw new Error("Firebase Admin není nakonfigurován.");
  if (recipientEmails.length < 2) throw new Error("Skupina vyžaduje alespoň dva příjemce.");

  const loadedRecipients = await Promise.all(
    recipientEmails.map((email) => loadUserByEmail(email))
  );
  if (loadedRecipients.some((recipient) => recipient === null)) {
    throw new Error("Některý příjemce nebyl v systému nalezen.");
  }
  const recipients = loadedRecipients.filter(
    (recipient): recipient is { email: string; name: string } => recipient !== null
  );
  const senderName = await resolveSenderName(senderEmail, senderUid);
  const participants = [{ email: senderEmail, name: senderName }, ...recipients];
  const participantEmails = participants.map((participant) => participant.email);
  let conversationId = requestedConversationId;
  let groupName = requestedGroupName || subject;
  let groupOwnerEmail = senderEmail;

  if (conversationId) {
    if (!GROUP_CONVERSATION_ID_RE.test(conversationId)) {
      throw new Error("Neplatná skupinová konverzace.");
    }
    const conversationSnapshot = await adminDb
      .collection("usersPrivate")
      .doc(senderEmail)
      .collection("mailboxConversations")
      .doc(conversationId)
      .get();
    const conversationData = (conversationSnapshot.data() ?? {}) as Record<string, unknown>;
    if (conversationData.active === false) {
      throw new Error("Už nejsi členem této skupiny.");
    }
    const storedParticipantEmails = Array.isArray(conversationData.participantEmails)
      ? conversationData.participantEmails.map(normalizeEmail).filter(Boolean)
      : [];
    const storedParticipants = [...storedParticipantEmails].sort();
    const requestedParticipants = [...participantEmails].sort();
    if (
      !conversationSnapshot.exists ||
      storedParticipants.length !== requestedParticipants.length ||
      storedParticipants.some((email, index) => email !== requestedParticipants[index])
    ) {
      throw new Error("Účastníci skupinové konverzace nesouhlasí.");
    }
    groupName = normalizeText(conversationData.groupName) || groupName;
    groupOwnerEmail =
      normalizeEmail(conversationData.groupOwnerEmail) ||
      normalizeEmail(conversationData.createdByEmail) ||
      storedParticipantEmails[0] ||
      senderEmail;
  } else {
    conversationId = `group_${randomUUID()}`;
  }
  groupName = groupName.slice(0, GROUP_NAME_MAX_LEN) || "Skupinová konverzace";

  const messageId = clientRequestId || randomUUID();
  const senderMailbox = adminDb
    .collection("usersPrivate")
    .doc(senderEmail)
    .collection("mailbox");
  const existingSenderSnapshot = clientRequestId
    ? await senderMailbox.doc(messageId).get()
    : null;
  if (existingSenderSnapshot?.exists) {
    const existingData = (existingSenderSnapshot.data() ?? {}) as Record<string, unknown>;
    const metadata = isPlainObject(existingData.metadata) ? existingData.metadata : {};
    const storedRecipients = Array.isArray(metadata.recipientEmails)
      ? metadata.recipientEmails.map(normalizeEmail).filter(Boolean).sort()
      : [];
    const requestedRecipients = [...recipientEmails].sort();
    if (
      storedRecipients.length !== requestedRecipients.length ||
      storedRecipients.some((email, index) => email !== requestedRecipients[index])
    ) {
      throw new Error("Tento požadavek už byl použit pro jiné příjemce.");
    }
    const storedAttachments = Array.isArray(metadata.attachments) ? metadata.attachments : [];
    return {
      ok: true,
      recipientEmail: recipients[0]?.email,
      recipientName: recipients[0]?.name,
      recipientEmails,
      groupName: normalizeText(metadata.groupName) || groupName,
      attachments: storedAttachments.length,
      attachmentItems: toPublicAttachments(storedAttachments as MailboxAttachment[]),
      messageId: normalizeText(metadata.messageId) || messageId,
      recipientMailboxId: messageId,
      senderMailboxId: existingSenderSnapshot.id,
      conversationId: normalizeText(metadata.conversationId) || conversationId,
      deliveredAtMs:
        typeof metadata.deliveredAtMs === "number" && Number.isFinite(metadata.deliveredAtMs)
          ? metadata.deliveredAtMs
          : Date.now(),
    };
  }

  let attachments: MailboxAttachment[] = [];
  let committed = false;
  try {
    attachments = await uploadAttachmentsToStorage({
      messageId,
      files,
      uploaderEmail: senderEmail,
    });
    const publicAttachments = toPublicAttachments(attachments);
    const encryptedContent = encryptMailboxJson(
      { subject, messageText },
      `message:${messageId}`
    );
    const createdAtMs = Date.now();
    const mailboxRefs = new Map(
      participants.map((participant) => [
        participant.email,
        adminDb!
          .collection("usersPrivate")
          .doc(participant.email)
          .collection("mailbox")
          .doc(messageId),
      ])
    );
    const recipientConversationSnapshots = await Promise.all(
      recipients.map(async (recipient) => {
        const ref = adminDb!
          .collection("usersPrivate")
          .doc(recipient.email)
          .collection("mailboxConversations")
          .doc(conversationId);
        return { recipient, ref, snapshot: await ref.get() };
      })
    );
    const commonMetadata = {
      messageId,
      ...(clientRequestId ? { clientRequestId } : {}),
      conversationId,
      groupConversation: true,
      groupName,
      groupOwnerEmail,
      senderEmail,
      senderName,
      recipientEmail: recipients[0]?.email ?? "",
      recipientName: recipients[0]?.name ?? "",
      recipientEmails,
      participants,
      participantEmails,
      attachmentCount: attachments.length,
      attachments,
      deliveredAtMs: createdAtMs,
      encryptedContentVersion: encryptedContent.version,
    };
    const batch = adminDb.batch();
    participants.forEach((participant) => {
      const senderCopy = participant.email === senderEmail;
      batch.set(mailboxRefs.get(participant.email)!, {
        recipientEmail: participant.email,
        type: "direct_message",
        title: "Šifrovaná zpráva",
        body: "Nová šifrovaná zpráva.",
        encryptedContent,
        deepLink: "/posta",
        read: senderCopy,
        readAtMs: senderCopy ? createdAtMs : null,
        readAt: senderCopy ? FieldValue.serverTimestamp() : null,
        createdAtMs,
        createdAt: FieldValue.serverTimestamp(),
        metadata: {
          ...commonMetadata,
          mailboxOwnerEmail: participant.email,
          mailboxDirection: senderCopy ? "sent" : "received",
        },
      });
      batch.set(
        adminDb!
          .collection("usersPrivate")
          .doc(participant.email)
          .collection("mailboxConversations")
          .doc(conversationId),
        {
          conversationId,
          groupConversation: true,
          groupName,
          groupOwnerEmail,
          participants,
          participantEmails,
          active: true,
          ...(requestedConversationId
            ? {}
            : {
                createdByEmail: senderEmail,
                createdAtMs,
                createdAt: FieldValue.serverTimestamp(),
              }),
          lastMessageId: messageId,
          lastMessageAtMs: createdAtMs,
          lastMessageAt: FieldValue.serverTimestamp(),
          lastSenderEmail: senderEmail,
        },
        { merge: true }
      );
    });
    recipientConversationSnapshots.forEach(({ recipient, ref, snapshot }) => {
      const data = (snapshot.data() ?? {}) as Record<string, unknown>;
      const pendingMessageId = normalizeText(data.pendingReplyReminderMessageId);
      if (!pendingMessageId || pendingMessageId.includes("/")) return;
      batch.set(
        adminDb!
          .collection("usersPrivate")
          .doc(recipient.email)
          .collection("mailbox")
          .doc(pendingMessageId),
        {
          replyReminderAtMs: FieldValue.delete(),
          replyReminderAt: FieldValue.delete(),
          replyReminderSetAtMs: FieldValue.delete(),
          replyReminderSetAt: FieldValue.delete(),
          replyReminderResolvedAtMs: createdAtMs,
          replyReminderResolvedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      batch.set(
        ref,
        {
          pendingReplyReminderMessageId: FieldValue.delete(),
          pendingReplyReminderAtMs: FieldValue.delete(),
        },
        { merge: true }
      );
    });
    await batch.commit();
    committed = true;

    const pushResults = await Promise.allSettled(
      recipientConversationSnapshots
        .filter(({ snapshot }) => {
          const data = (snapshot.data() ?? {}) as Record<string, unknown>;
          return data.active !== false && data.muted !== true;
        })
        .map(({ recipient }) =>
          sendDirectMessagePushNotification({
            req,
            recipientEmail: recipient.email,
            recipientMessageId: messageId,
            senderEmail,
            senderName,
            subject,
          })
        )
    );
    pushResults.forEach((result) => {
      if (result.status === "rejected") {
        console.warn("Mailbox group push notification failed:", result.reason);
      }
    });
    return {
      ok: true,
      recipientEmail: recipients[0]?.email,
      recipientName: recipients[0]?.name,
      recipientEmails,
      groupName,
      attachments: attachments.length,
      attachmentItems: publicAttachments,
      messageId,
      recipientMailboxId: messageId,
      senderMailboxId: messageId,
      conversationId,
      deliveredAtMs: createdAtMs,
    };
  } catch (error) {
    if (!committed && attachments.length > 0) {
      await deleteMailboxStorageObjects(
        attachments.map(({ path, bucketName }) => ({ messageId, path, bucketName }))
      ).catch(() => undefined);
    }
    throw error;
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireAuthedRateLimited(req, {
    namespace: "api:mailbox:compose:post",
    limit: MAILBOX_COMPOSE_RATE_LIMIT,
    windowMs: MAILBOX_COMPOSE_RATE_LIMIT_WINDOW_MS,
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

  let form: FormData;
  let uploadedAttachments: MailboxAttachment[] = [];
  let uploadedMessageId = "";
  let mailboxDocumentPaths: string[] = [];

  try {
    form = await req.formData();
  } catch {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Neplatný formát požadavku." },
        { status: 400 }
      ),
      ctx
    );
  }

  let recipientEmails: string[];
  try {
    recipientEmails = parseRecipientEmails(form);
  } catch (error) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : "Neplatní příjemci." },
        { status: 400 }
      ),
      ctx
    );
  }
  const recipientEmail = recipientEmails[0] ?? "";
  const requestedConversationId = normalizeText(form.get("conversationId"));
  const requestedGroupName = normalizeText(form.get("groupName")).slice(0, GROUP_NAME_MAX_LEN);
  const subject = normalizeText(form.get("subject")).slice(0, SUBJECT_MAX_LEN);
  const messageText = normalizeText(form.get("text")).slice(0, MESSAGE_MAX_LEN);
  const clientRequestId = normalizeText(form.get("clientRequestId"));
  if (clientRequestId && !CLIENT_REQUEST_ID_RE.test(clientRequestId)) {
    return withRateLimitHeaders(
      NextResponse.json({ ok: false, error: "Neplatný identifikátor požadavku." }, { status: 400 }),
      ctx
    );
  }
  let clientMetadata: Record<string, unknown>;
  try {
    clientMetadata = parseClientMetadata(form.get("metadataJson"));
  } catch (error) {
    return withRateLimitHeaders(
      NextResponse.json(
        {
          ok: false,
          error: error instanceof Error ? error.message : "Neplatná metadata zprávy.",
        },
        { status: 400 }
      ),
      ctx
    );
  }
  let tipSnapshot: { fields: TipSnapshotField[] } | null = null;
  if (clientMetadata.tipsterTip === true) {
    try {
      tipSnapshot = parseTipSnapshot(form.get("tipSnapshotJson"));
    } catch (error) {
      return withRateLimitHeaders(
        NextResponse.json(
          {
            ok: false,
            error: error instanceof Error ? error.message : "Neplatná data tipu.",
          },
          { status: 400 }
        ),
        ctx
      );
    }
  }

  if (
    recipientEmails.length === 0 ||
    recipientEmails.some((email) => !EMAIL_RE.test(email)) ||
    recipientEmails.length >= GROUP_MAX_PARTICIPANTS
  ) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: `Vyber 1 až ${GROUP_MAX_PARTICIPANTS - 1} platných příjemců.` },
        { status: 400 }
      ),
      ctx
    );
  }
  if (recipientEmails.includes(ctx.email)) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Zprávu není možné poslat sobě." },
        { status: 400 }
      ),
      ctx
    );
  }

  const senderSetup = await checkAdvisorSetup({ email: ctx.email, uid: ctx.uid });
  if (senderSetup.accountType === "tipster") {
    const allowedRecipients = new Set(
      [
        normalizeEmail(senderSetup.profile?.tipRecipientEmail),
        normalizeEmail(senderSetup.profile?.managerEmail),
      ].filter(Boolean)
    );
    if (
      clientMetadata.tipsterTip !== true ||
      recipientEmails.length !== 1 ||
      !allowedRecipients.has(recipientEmails[0] ?? "")
    ) {
      return withRateLimitHeaders(
        NextResponse.json(
          {
            ok: false,
            error: "Tipařské účty mohou odesílat jen tipy svému přiřazenému příjemci.",
          },
          { status: 403 }
        ),
        ctx
      );
    }
  }

  if (!subject) {
    return withRateLimitHeaders(
      NextResponse.json({ ok: false, error: "Předmět je povinný." }, { status: 400 }),
      ctx
    );
  }

  const filesRaw = form.getAll("files");
  const files = filesRaw.filter((entry): entry is File => entry instanceof File);
  if (files.length > FILES_MAX_COUNT) {
    return withRateLimitHeaders(
      NextResponse.json(
        {
          ok: false,
          error: `Můžeš přiložit maximálně ${FILES_MAX_COUNT} souborů.`,
        },
        { status: 400 }
      ),
      ctx
    );
  }

  let totalBytes = 0;
  const preparedFiles: PreparedSafeUserAttachmentFile[] = [];
  for (const file of files) {
    const name = normalizeText(file.name);
    if (!name) {
      return withRateLimitHeaders(
        NextResponse.json(
          { ok: false, error: "Soubor bez názvu nelze přiložit." },
          { status: 400 }
        ),
        ctx
      );
    }
    if (file.size <= 0) {
      return withRateLimitHeaders(
        NextResponse.json(
          { ok: false, error: `Soubor ${name} je prázdný.` },
          { status: 400 }
        ),
        ctx
      );
    }
    if (file.size > FILE_MAX_SIZE_BYTES) {
      return withRateLimitHeaders(
        NextResponse.json(
          {
            ok: false,
            error: `Soubor ${name} je příliš velký (max ${Math.floor(
              FILE_MAX_SIZE_BYTES / (1024 * 1024)
            )} MB).`,
          },
          { status: 400 }
        ),
        ctx
      );
    }
    totalBytes += file.size;
    const prepared = await prepareSafeUserAttachmentFile(file);
    if (!prepared.ok) {
      return withRateLimitHeaders(
        NextResponse.json(
          { ok: false, error: `Soubor ${name} není podporovaný. ${prepared.error}` },
          { status: 400 }
        ),
        ctx
      );
    }
    preparedFiles.push(prepared.file);
  }
  if (totalBytes > FILE_TOTAL_MAX_BYTES) {
    return withRateLimitHeaders(
      NextResponse.json(
        {
          ok: false,
          error: `Celková velikost příloh je příliš vysoká (max ${Math.floor(
            FILE_TOTAL_MAX_BYTES / (1024 * 1024)
          )} MB).`,
        },
        { status: 400 }
      ),
      ctx
    );
  }

  if (!messageText && files.length === 0) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Doplň text zprávy nebo přilož soubor." },
        { status: 400 }
      ),
      ctx
    );
  }

  const groupRequest =
    recipientEmails.length > 1 || GROUP_CONVERSATION_ID_RE.test(requestedConversationId);
  if (groupRequest) {
    try {
      const payload = await composeGroupMessage({
        req,
        senderEmail: ctx.email,
        senderUid: ctx.uid,
        recipientEmails,
        requestedConversationId,
        requestedGroupName,
        subject,
        messageText,
        clientRequestId,
        files: preparedFiles,
      });
      return withRateLimitHeaders(NextResponse.json(payload), ctx);
    } catch (error) {
      console.error("POST /api/mailbox/compose group failed", error);
      return withRateLimitHeaders(
        NextResponse.json(
          {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "Skupinovou zprávu se nepodařilo odeslat.",
          },
          { status: 400 }
        ),
        ctx
      );
    }
  }

  try {
    const recipient = await loadUserByEmail(recipientEmail);
    if (!recipient) {
      return withRateLimitHeaders(
        NextResponse.json(
          { ok: false, error: "Příjemce nebyl v systému nalezen." },
          { status: 404 }
        ),
        ctx
      );
    }

    const senderName = await resolveSenderName(ctx.email, ctx.uid);
    if (clientRequestId) {
      const existingSenderSnapshot = await adminDb
        .collection("usersPrivate")
        .doc(ctx.email)
        .collection("mailbox")
        .doc(clientRequestId)
        .get();
      if (existingSenderSnapshot.exists) {
        const existingData = (existingSenderSnapshot.data() ?? {}) as Record<string, unknown>;
        const existingMetadataRaw = existingData.metadata;
        const existingMetadata =
          existingMetadataRaw &&
          typeof existingMetadataRaw === "object" &&
          !Array.isArray(existingMetadataRaw)
            ? (existingMetadataRaw as Record<string, unknown>)
            : {};
        const storedRecipientEmail = normalizeEmail(existingMetadata.recipientEmail);
        if (storedRecipientEmail && storedRecipientEmail !== recipient.email) {
          return withRateLimitHeaders(
            NextResponse.json(
              { ok: false, error: "Tento požadavek už byl použit pro jiného příjemce." },
              { status: 409 }
            ),
            ctx
          );
        }
        const storedAttachments = Array.isArray(existingMetadata.attachments)
          ? existingMetadata.attachments
          : [];
        const storedDeliveredAtMs =
          typeof existingMetadata.deliveredAtMs === "number" &&
          Number.isFinite(existingMetadata.deliveredAtMs)
            ? existingMetadata.deliveredAtMs
            : typeof existingData.createdAtMs === "number" && Number.isFinite(existingData.createdAtMs)
              ? existingData.createdAtMs
              : Date.now();
        return withRateLimitHeaders(
          NextResponse.json({
            ok: true,
            recipientEmail: recipient.email,
            recipientName: recipient.name,
            attachments: storedAttachments.length,
            attachmentItems: toPublicAttachments(storedAttachments as MailboxAttachment[]),
            messageId: normalizeText(existingMetadata.messageId) || clientRequestId,
            recipientMailboxId: normalizeText(existingMetadata.pairedMailboxId) || clientRequestId,
            senderMailboxId: existingSenderSnapshot.id,
            tipId: normalizeText(existingMetadata.tipId) || null,
            conversationId: normalizeText(existingMetadata.conversationId) || null,
            deliveredAtMs: storedDeliveredAtMs,
          }),
          ctx
        );
      }
    }
    const createdAtMs = Date.now();
    const messageId = clientRequestId || randomUUID();
    uploadedMessageId = messageId;
    const isTipsterTip = clientMetadata.tipsterTip === true;
    const conversationId = isTipsterTip
      ? null
      : mailboxConversationId(ctx.email, recipient.email);
    const encryptedContent = isTipsterTip
      ? null
      : encryptMailboxJson(
          { subject, messageText },
          `message:${messageId}`
        );
    const attachments = await uploadAttachmentsToStorage({
      messageId,
      files: preparedFiles,
      uploaderEmail: ctx.email,
    });
    uploadedAttachments = attachments;
    const publicAttachments = toPublicAttachments(attachments);
    const messagePreview = messageText || "Příloha bez textu.";

    const recipientMailbox = adminDb
      .collection("usersPrivate")
      .doc(recipient.email)
      .collection("mailbox");
    const senderMailbox = adminDb
      .collection("usersPrivate")
      .doc(ctx.email)
      .collection("mailbox");
    const recipientRef = clientRequestId
      ? recipientMailbox.doc(clientRequestId)
      : recipientMailbox.doc();
    const senderRef = clientRequestId
      ? senderMailbox.doc(clientRequestId)
      : senderMailbox.doc();
    const recipientConversationRef = conversationId
      ? adminDb
          .collection("usersPrivate")
          .doc(recipient.email)
          .collection("mailboxConversations")
          .doc(conversationId)
      : null;
    const senderConversationRef = conversationId
      ? adminDb
          .collection("usersPrivate")
          .doc(ctx.email)
          .collection("mailboxConversations")
          .doc(conversationId)
      : null;
    const tipRef =
      clientMetadata.tipsterTip === true
        ? adminDb
            .collection("usersPrivate")
            .doc(ctx.email)
            .collection("tipsterTips")
            .doc()
        : null;
    mailboxDocumentPaths = [recipientRef.path, senderRef.path];
    const recipientDeepLink = tipRef ? `/tipy/${encodeURIComponent(recipientRef.id)}` : "/posta";
    const senderDeepLink = tipRef ? `/tipy/${encodeURIComponent(tipRef.id)}` : "/posta";

    const commonMetadata = {
      ...clientMetadata,
      messageId,
      ...(clientRequestId ? { clientRequestId } : {}),
      ...(conversationId ? { conversationId } : {}),
      senderEmail: ctx.email,
      senderName,
      recipientEmail: recipient.email,
      recipientName: recipient.name,
      tipId: tipRef?.id ?? null,
      attachmentCount: attachments.length,
      attachments,
      deliveredAtMs: createdAtMs,
      ...(isTipsterTip
        ? { messageText }
        : { encryptedContentVersion: encryptedContent?.version ?? 1 }),
    };

    const recipientConversationSnapshot = recipientConversationRef
      ? await recipientConversationRef.get()
      : null;

    const batch = adminDb.batch();
    batch.set(recipientRef, {
      recipientEmail: recipient.email,
      type: "direct_message",
      title: isTipsterTip ? subject : "Šifrovaná zpráva",
      body: isTipsterTip ? messagePreview : "Nová šifrovaná zpráva.",
      ...(encryptedContent ? { encryptedContent } : {}),
      deepLink: recipientDeepLink,
      read: false,
      readAtMs: null,
      readAt: null,
      createdAtMs,
      createdAt: FieldValue.serverTimestamp(),
      metadata: {
        ...commonMetadata,
        mailboxDirection: "received",
        pairedMailboxId: senderRef.id,
      },
    });
    batch.set(senderRef, {
      recipientEmail: ctx.email,
      type: "direct_message",
      title: isTipsterTip ? subject : "Šifrovaná zpráva",
      body: isTipsterTip ? messagePreview : "Nová šifrovaná zpráva.",
      ...(encryptedContent ? { encryptedContent } : {}),
      deepLink: senderDeepLink,
      read: true,
      readAtMs: createdAtMs,
      readAt: FieldValue.serverTimestamp(),
      createdAtMs,
      createdAt: FieldValue.serverTimestamp(),
      metadata: {
        ...commonMetadata,
        mailboxDirection: "sent",
        pairedMailboxId: recipientRef.id,
      },
    });
    if (recipientConversationRef && senderConversationRef && conversationId) {
      batch.set(
        recipientConversationRef,
        {
          conversationId,
          counterpartEmail: ctx.email,
          counterpartName: senderName,
          lastMessageId: messageId,
          lastMessageAtMs: createdAtMs,
          lastMessageAt: FieldValue.serverTimestamp(),
          lastSenderEmail: ctx.email,
        },
        { merge: true }
      );
      batch.set(
        senderConversationRef,
        {
          conversationId,
          counterpartEmail: recipient.email,
          counterpartName: recipient.name,
          lastMessageId: messageId,
          lastMessageAtMs: createdAtMs,
          lastMessageAt: FieldValue.serverTimestamp(),
          lastSenderEmail: ctx.email,
        },
        { merge: true }
      );
      const recipientConversationData =
        (recipientConversationSnapshot?.data() ?? {}) as Record<string, unknown>;
      const pendingReplyReminderMessageId = normalizeText(
        recipientConversationData.pendingReplyReminderMessageId
      );
      if (pendingReplyReminderMessageId && !pendingReplyReminderMessageId.includes("/")) {
        batch.set(
          recipientMailbox.doc(pendingReplyReminderMessageId),
          {
            replyReminderAtMs: FieldValue.delete(),
            replyReminderAt: FieldValue.delete(),
            replyReminderSetAtMs: FieldValue.delete(),
            replyReminderSetAt: FieldValue.delete(),
            replyReminderResolvedAtMs: createdAtMs,
            replyReminderResolvedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        batch.set(
          recipientConversationRef,
          {
            pendingReplyReminderMessageId: FieldValue.delete(),
            pendingReplyReminderAtMs: FieldValue.delete(),
          },
          { merge: true }
        );
      }
    }
    if (tipRef) {
      batch.set(tipRef, {
        tipsterEmail: ctx.email,
        tipsterName: senderName,
        recipientEmail: recipient.email,
        recipientName: recipient.name,
        product: normalizeText(clientMetadata.tipProduct) || "other",
        productLabel: normalizeText(clientMetadata.tipProductLabel) || subject,
        title: subject,
        messageText,
        fields: tipSnapshot?.fields ?? [],
        attachments: publicAttachments,
        attachmentCount: publicAttachments.length,
        status: "pending",
        mailboxMessageId: messageId,
        recipientMailboxId: recipientRef.id,
        senderMailboxId: senderRef.id,
        createdAtMs,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();

    try {
      await sendDirectMessagePushNotification({
        req,
        recipientEmail: recipient.email,
        recipientMessageId: recipientRef.id,
        senderEmail: ctx.email,
        senderName,
        subject,
        isTipsterTip: clientMetadata.tipsterTip === true,
      });
    } catch (pushError) {
      console.warn("Mailbox direct message push notification failed:", pushError);
    }

    return withRateLimitHeaders(
      NextResponse.json({
        ok: true,
        recipientEmail: recipient.email,
        recipientName: recipient.name,
        attachments: attachments.length,
        attachmentItems: publicAttachments,
        messageId,
        recipientMailboxId: recipientRef.id,
        senderMailboxId: senderRef.id,
        tipId: tipRef?.id ?? null,
        conversationId,
        deliveredAtMs: createdAtMs,
      }),
      ctx
    );
  } catch (error) {
    if (uploadedAttachments.length > 0) {
      let shouldRollbackUploads = mailboxDocumentPaths.length === 0;
      if (mailboxDocumentPaths.length > 0) {
        try {
          const snapshots = await Promise.all(
            mailboxDocumentPaths.map((path) => adminDb!.doc(path).get())
          );
          shouldRollbackUploads = snapshots.every((snapshot) => !snapshot.exists);
        } catch (verificationError) {
          shouldRollbackUploads = false;
          console.error(
            "Mailbox compose could not verify whether failed message was committed; uploaded files were preserved.",
            verificationError
          );
        }
      }

      if (shouldRollbackUploads) {
        const cleanup = await deleteMailboxStorageObjects(
          uploadedAttachments.map(({ path, bucketName }) => ({
            messageId: uploadedMessageId,
            path,
            bucketName,
          }))
        );
        if (cleanup.failed > 0) {
          console.error("Mailbox compose upload rollback failed.", cleanup);
        }
      }
    }
    console.error("POST /api/mailbox/compose failed", error);
    return withRateLimitHeaders(
      NextResponse.json(
        {
          ok: false,
          error:
            error instanceof Error && error.message
              ? error.message
              : "Zprávu se nepodařilo odeslat.",
        },
        { status: 500 }
      ),
      ctx
    );
  }
}
