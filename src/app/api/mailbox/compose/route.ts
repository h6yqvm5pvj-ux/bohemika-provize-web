import { randomUUID } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { NextResponse, type NextRequest } from "next/server";

import { requireAuthedRateLimited, withRateLimitHeaders } from "@/lib/server/apiEntryGuard";
import { checkAdvisorSetup } from "@/lib/server/advisorSetupGuard";
import { adminDb, adminMessaging } from "@/lib/server/firebaseAdmin";
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

type MailboxAttachment = {
  id: string;
  name: string;
  url: string;
  contentType: string;
  sizeBytes: number;
  path: string;
  bucketName?: string;
};

type PublicMailboxAttachment = Omit<MailboxAttachment, "path" | "bucketName">;

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

const normalizeBucketName = (value: string): string =>
  value.trim().replace(/^gs:\/\//i, "").replace(/\/+$/, "");

const resolveStorageBucketCandidates = (): string[] => {
  const candidates: string[] = [];
  const append = (value: string | null | undefined) => {
    if (!value) return;
    const normalized = normalizeBucketName(value);
    if (!normalized) return;
    if (!candidates.includes(normalized)) {
      candidates.push(normalized);
    }
  };

  append(process.env.FIREBASE_STORAGE_BUCKET);
  append(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);

  const explicit = candidates[0] ?? "";
  if (explicit.endsWith(".firebasestorage.app")) {
    append(explicit.replace(/\.firebasestorage\.app$/i, ".appspot.com"));
  } else if (explicit.endsWith(".appspot.com")) {
    append(explicit.replace(/\.appspot\.com$/i, ".firebasestorage.app"));
  }

  const projectId =
    process.env.FIREBASE_ADMIN_PROJECT_ID?.trim() ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ||
    "";
  if (projectId) {
    append(`${projectId}.appspot.com`);
    append(`${projectId}.firebasestorage.app`);
  }

  return candidates;
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

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    if (!file) continue;
    const contentType = file.contentType;
    const originalName = sanitizeFileName(normalizeText(file.file.name) || "priloha");
    const objectPath = `${uploadPrefix}/${Date.now()}-${index}-${originalName}`;
    const attachmentId = randomUUID();
    const bytes = file.bytes;

    await bucket.file(objectPath).save(bytes, {
      resumable: false,
      contentType,
      metadata: {
        metadata: {
          originalName,
          uploadedBy: uploaderEmail,
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
    });
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
  const bucketCandidates = resolveStorageBucketCandidates();
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
        subject: subject.slice(0, 120),
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

export async function POST(req: NextRequest) {
  const guard = await requireAuthedRateLimited(req, {
    namespace: "api:mailbox:compose:post",
    limit: MAILBOX_COMPOSE_RATE_LIMIT,
    windowMs: MAILBOX_COMPOSE_RATE_LIMIT_WINDOW_MS,
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

  const recipientEmail = normalizeEmail(form.get("recipientEmail"));
  const subject = normalizeText(form.get("subject")).slice(0, SUBJECT_MAX_LEN);
  const messageText = normalizeText(form.get("text")).slice(0, MESSAGE_MAX_LEN);
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

  if (!recipientEmail || !EMAIL_RE.test(recipientEmail)) {
    return withRateLimitHeaders(
      NextResponse.json({ ok: false, error: "Vyber platného příjemce." }, { status: 400 }),
      ctx
    );
  }
  if (recipientEmail === ctx.email) {
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
    if (clientMetadata.tipsterTip !== true || !allowedRecipients.has(recipientEmail)) {
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
    const createdAtMs = Date.now();
    const messageId = randomUUID();
    const attachments = await uploadAttachmentsToStorage({
      messageId,
      files: preparedFiles,
      uploaderEmail: ctx.email,
    });
    const publicAttachments = toPublicAttachments(attachments);

    const messagePreview = messageText || "Příloha bez textu.";

    const recipientRef = adminDb
      .collection("usersPrivate")
      .doc(recipient.email)
      .collection("mailbox")
      .doc();
    const senderRef = adminDb
      .collection("usersPrivate")
      .doc(ctx.email)
      .collection("mailbox")
      .doc();
    const tipRef =
      clientMetadata.tipsterTip === true
        ? adminDb
            .collection("usersPrivate")
            .doc(ctx.email)
            .collection("tipsterTips")
            .doc()
        : null;
    const recipientDeepLink = tipRef ? `/tipy/${encodeURIComponent(recipientRef.id)}` : "/posta";
    const senderDeepLink = tipRef ? `/tipy/${encodeURIComponent(tipRef.id)}` : "/posta";

    const commonMetadata = {
      ...clientMetadata,
      messageId,
      senderEmail: ctx.email,
      senderName,
      recipientEmail: recipient.email,
      recipientName: recipient.name,
      tipId: tipRef?.id ?? null,
      messageText,
      attachmentCount: attachments.length,
      attachments,
    };

    const batch = adminDb.batch();
    batch.set(recipientRef, {
      recipientEmail: recipient.email,
      type: "direct_message",
      title: subject,
      body: messagePreview,
      deepLink: recipientDeepLink,
      read: false,
      readAtMs: null,
      readAt: null,
      createdAtMs,
      createdAt: FieldValue.serverTimestamp(),
      metadata: {
        ...commonMetadata,
        mailboxDirection: "received",
      },
    });
    batch.set(senderRef, {
      recipientEmail: ctx.email,
      type: "direct_message",
      title: subject,
      body: messagePreview,
      deepLink: senderDeepLink,
      read: true,
      readAtMs: createdAtMs,
      readAt: FieldValue.serverTimestamp(),
      createdAtMs,
      createdAt: FieldValue.serverTimestamp(),
      metadata: {
        ...commonMetadata,
        mailboxDirection: "sent",
      },
    });
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
      }),
      ctx
    );
  } catch (error) {
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
