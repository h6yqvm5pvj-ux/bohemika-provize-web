import { getStorage } from "firebase-admin/storage";

const MAILBOX_MESSAGE_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/;

export type MailboxStorageObject = {
  messageId: string;
  path: string;
  bucketName?: string;
};

export type MailboxAttachmentCleanupCandidate = {
  messageId: string;
  participantEmails: string[];
  storageObjects: MailboxStorageObject[];
};

export type MailboxStorageCleanupResult = {
  requested: number;
  attempted: number;
  failed: number;
};

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const normalizeEmail = (value: unknown): string => normalizeText(value).toLowerCase();

const normalizeBucketName = (value: string): string =>
  value.trim().replace(/^gs:\/\//i, "").replace(/\/+$/, "");

const appendBucketCandidate = (
  bucketNames: string[],
  value: string | null | undefined
) => {
  if (!value) return;
  const normalized = normalizeBucketName(value);
  if (!normalized || bucketNames.includes(normalized)) return;
  bucketNames.push(normalized);
};

export function resolveConfiguredMailboxStorageBuckets(): string[] {
  const buckets: string[] = [];
  appendBucketCandidate(buckets, process.env.FIREBASE_STORAGE_BUCKET);
  appendBucketCandidate(buckets, process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);

  const configured = buckets[0] ?? "";
  if (configured.endsWith(".firebasestorage.app")) {
    appendBucketCandidate(
      buckets,
      configured.replace(/\.firebasestorage\.app$/i, ".appspot.com")
    );
  } else if (configured.endsWith(".appspot.com")) {
    appendBucketCandidate(
      buckets,
      configured.replace(/\.appspot\.com$/i, ".firebasestorage.app")
    );
  }

  const projectId =
    process.env.FIREBASE_ADMIN_PROJECT_ID?.trim() ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ||
    "";
  if (projectId) {
    appendBucketCandidate(buckets, `${projectId}.appspot.com`);
    appendBucketCandidate(buckets, `${projectId}.firebasestorage.app`);
  }

  return buckets;
}

export function isSafeMailboxStoragePath(path: string, messageId: string): boolean {
  if (!MAILBOX_MESSAGE_ID_RE.test(messageId)) return false;
  if (path.length > 1024 || !path.startsWith(`mailbox/${messageId}/`)) return false;

  const suffix = path.slice(`mailbox/${messageId}/`.length);
  if (!suffix || suffix.includes("//")) return false;
  return suffix.split("/").every((segment) => segment !== "." && segment !== "..");
}

export function parseMailboxAttachmentCleanupCandidate(
  metadata: unknown,
  mailboxOwnerEmail: string
): MailboxAttachmentCleanupCandidate | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const row = metadata as Record<string, unknown>;
  const messageId = normalizeText(row.messageId);
  if (!MAILBOX_MESSAGE_ID_RE.test(messageId)) return null;

  const participantEmails = [row.senderEmail, row.recipientEmail]
    .map(normalizeEmail)
    .filter((email) => email.length <= 320 && EMAIL_RE.test(email));
  const uniqueParticipantEmails = [...new Set(participantEmails)];
  const normalizedOwnerEmail = normalizeEmail(mailboxOwnerEmail);
  if (
    uniqueParticipantEmails.length !== 2 ||
    !uniqueParticipantEmails.includes(normalizedOwnerEmail)
  ) {
    return null;
  }

  if (!Array.isArray(row.attachments)) return null;
  const storageObjects = row.attachments
    .map((value): MailboxStorageObject | null => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return null;
      const attachment = value as Record<string, unknown>;
      const path = normalizeText(attachment.path);
      if (!isSafeMailboxStoragePath(path, messageId)) return null;
      const bucketName = normalizeText(attachment.bucketName);
      return {
        messageId,
        path,
        bucketName: bucketName || undefined,
      };
    })
    .filter((value): value is MailboxStorageObject => value !== null);

  if (storageObjects.length === 0) return null;
  return {
    messageId,
    participantEmails: uniqueParticipantEmails,
    storageObjects,
  };
}

export async function deleteMailboxStorageObjects(
  storageObjects: MailboxStorageObject[]
): Promise<MailboxStorageCleanupResult> {
  const configuredBuckets = resolveConfiguredMailboxStorageBuckets();
  const allowedBuckets = new Set(configuredBuckets);
  const targets = new Map<string, { bucketName: string; path: string }>();

  storageObjects.forEach((storageObject) => {
    if (!isSafeMailboxStoragePath(storageObject.path, storageObject.messageId)) return;
    const preferredBucket = storageObject.bucketName
      ? normalizeBucketName(storageObject.bucketName)
      : "";
    const bucketNames = preferredBucket
      ? allowedBuckets.has(preferredBucket)
        ? [preferredBucket]
        : []
      : configuredBuckets;

    bucketNames.forEach((bucketName) => {
      targets.set(`${bucketName}\n${storageObject.path}`, {
        bucketName,
        path: storageObject.path,
      });
    });
  });

  const outcomes = await Promise.allSettled(
    [...targets.values()].map(async ({ bucketName, path }) =>
      getStorage().bucket(bucketName).file(path).delete({ ignoreNotFound: true })
    )
  );

  return {
    requested: storageObjects.length,
    attempted: targets.size,
    failed: outcomes.filter((outcome) => outcome.status === "rejected").length,
  };
}
