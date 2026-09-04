import { createHash, randomUUID } from "node:crypto";

import { getStorage } from "firebase-admin/storage";

import {
  isStorageNotFoundError,
  resolveStorageBucketCandidates,
} from "./contractPdfStorage";
import { detectSafeUserAttachment } from "./safeUserAttachments";

export const USER_REQUEST_SCREENSHOT_MAX_BYTES = 8 * 1024 * 1024;
export const USER_REQUEST_SCREENSHOT_MAX_FILES = 4;

export type UserRequestScreenshotContentType = "image/png" | "image/jpeg";

export type StoredUserRequestScreenshot = {
  kind: "userRequestScreenshot";
  id: string;
  bucketName: string;
  storagePath: string;
  originalName: string;
  contentType: UserRequestScreenshotContentType;
  sizeBytes: number;
  sha256: string;
  uploadedAtMs: number;
  uploadedBy: string;
};

export type PublicUserRequestScreenshot = Omit<
  StoredUserRequestScreenshot,
  "bucketName" | "storagePath"
> & {
  hasFile: true;
};

export type PreparedUserRequestScreenshot = {
  bytes: Buffer;
  originalName: string;
  contentType: UserRequestScreenshotContentType;
  sha256: string;
};

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const isScreenshotContentType = (
  value: string
): value is UserRequestScreenshotContentType =>
  value === "image/png" || value === "image/jpeg";

const canonicalExtension = (contentType: UserRequestScreenshotContentType): string =>
  contentType === "image/png" ? ".png" : ".jpg";

export function sanitizeUserRequestScreenshotName({
  fileName,
  contentType,
}: {
  fileName: string;
  contentType: UserRequestScreenshotContentType;
}): string {
  const extension = canonicalExtension(contentType);
  const baseName =
    normalizeText(fileName)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\.[A-Za-z0-9]{1,8}$/u, "")
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || "screenshot";
  return `${baseName}${extension}`;
}

export async function prepareUserRequestScreenshotFile(
  file: File
): Promise<
  | { ok: true; screenshot: PreparedUserRequestScreenshot }
  | { ok: false; error: string }
> {
  const originalName = normalizeText(file.name) || "screenshot";
  if (file.size <= 0) {
    return { ok: false, error: "Screenshot je prázdný." };
  }
  if (file.size > USER_REQUEST_SCREENSHOT_MAX_BYTES) {
    return { ok: false, error: "Screenshot je příliš velký (maximum je 8 MB)." };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const detected = detectSafeUserAttachment({
    bytes,
    fileName: originalName,
    declaredContentType: file.type,
  });
  if (!detected || !isScreenshotContentType(detected.contentType)) {
    return {
      ok: false,
      error: "Screenshot musí být skutečný obrázek ve formátu PNG, JPG nebo JPEG.",
    };
  }

  return {
    ok: true,
    screenshot: {
      bytes,
      originalName: sanitizeUserRequestScreenshotName({
        fileName: originalName,
        contentType: detected.contentType,
      }),
      contentType: detected.contentType,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    },
  };
}

export function normalizeStoredUserRequestScreenshot(
  value: unknown
): StoredUserRequestScreenshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const kind = normalizeText(row.kind);
  const id = normalizeText(row.id);
  const bucketName = normalizeText(row.bucketName);
  const storagePath = normalizeText(row.storagePath);
  const originalName = normalizeText(row.originalName);
  const contentType = normalizeText(row.contentType).toLowerCase();
  const sha256 = normalizeText(row.sha256).toLowerCase();
  const uploadedBy = normalizeText(row.uploadedBy).toLowerCase();
  const sizeBytes = Number(row.sizeBytes);
  const uploadedAtMs = Number(row.uploadedAtMs);

  if (kind !== "userRequestScreenshot" || !id) return null;
  if (!bucketName || !storagePath || !originalName) return null;
  if (!isScreenshotContentType(contentType)) return null;
  if (
    !Number.isFinite(sizeBytes) ||
    sizeBytes <= 0 ||
    sizeBytes > USER_REQUEST_SCREENSHOT_MAX_BYTES
  ) {
    return null;
  }
  if (!Number.isFinite(uploadedAtMs) || uploadedAtMs <= 0) return null;
  if (!/^[a-f0-9]{64}$/.test(sha256)) return null;

  return {
    kind: "userRequestScreenshot",
    id,
    bucketName,
    storagePath,
    originalName,
    contentType,
    sizeBytes: Math.floor(sizeBytes),
    sha256,
    uploadedAtMs: Math.floor(uploadedAtMs),
    uploadedBy,
  };
}

export function toPublicUserRequestScreenshot(
  value: unknown
): PublicUserRequestScreenshot | null {
  const screenshot = normalizeStoredUserRequestScreenshot(value);
  if (!screenshot) return null;
  return {
    kind: screenshot.kind,
    id: screenshot.id,
    hasFile: true,
    originalName: screenshot.originalName,
    contentType: screenshot.contentType,
    sizeBytes: screenshot.sizeBytes,
    sha256: screenshot.sha256,
    uploadedAtMs: screenshot.uploadedAtMs,
    uploadedBy: screenshot.uploadedBy,
  };
}

export function normalizeStoredUserRequestScreenshots(
  value: unknown
): StoredUserRequestScreenshot[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value
    .map((item) => normalizeStoredUserRequestScreenshot(item))
    .filter((item): item is StoredUserRequestScreenshot => {
      if (!item || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .slice(0, USER_REQUEST_SCREENSHOT_MAX_FILES);
}

const storageOwnerHash = (email: string): string =>
  createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 32);

export async function uploadUserRequestScreenshot({
  screenshot,
  requestId,
  uploaderEmail,
}: {
  screenshot: PreparedUserRequestScreenshot;
  requestId: string;
  uploaderEmail: string;
}): Promise<StoredUserRequestScreenshot> {
  const bucketCandidates = resolveStorageBucketCandidates();
  if (bucketCandidates.length === 0) {
    throw new Error("Storage bucket není nakonfigurován.");
  }

  const storagePath = [
    "user-request-screenshots",
    storageOwnerHash(uploaderEmail),
    requestId.replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 120),
    `${Date.now()}-${randomUUID()}-${screenshot.originalName}`,
  ].join("/");
  const screenshotId = randomUUID();
  let lastError: unknown = null;

  for (const bucketName of bucketCandidates) {
    try {
      const bucket = getStorage().bucket(bucketName);
      await bucket.file(storagePath).save(screenshot.bytes, {
        resumable: false,
        contentType: screenshot.contentType,
        metadata: {
          cacheControl: "private, no-store, max-age=0",
          metadata: {
            originalName: screenshot.originalName,
            uploadedBy: uploaderEmail,
            sha256: screenshot.sha256,
          },
        },
      });
      return {
        kind: "userRequestScreenshot",
        id: screenshotId,
        bucketName: bucket.name,
        storagePath,
        originalName: screenshot.originalName,
        contentType: screenshot.contentType,
        sizeBytes: screenshot.bytes.length,
        sha256: screenshot.sha256,
        uploadedAtMs: Date.now(),
        uploadedBy: uploaderEmail.trim().toLowerCase(),
      };
    } catch (error) {
      lastError = error;
      if (!isStorageNotFoundError(error)) break;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Screenshot se nepodařilo uložit.");
}

export async function downloadUserRequestScreenshot(
  screenshot: StoredUserRequestScreenshot
): Promise<Buffer> {
  let lastError: unknown = null;
  for (const bucketName of resolveStorageBucketCandidates(screenshot.bucketName)) {
    try {
      const [bytes] = await getStorage()
        .bucket(bucketName)
        .file(screenshot.storagePath)
        .download();
      return bytes;
    } catch (error) {
      lastError = error;
      if (!isStorageNotFoundError(error)) break;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Screenshot nebyl nalezen.");
}

export async function deleteUserRequestScreenshot(
  value: unknown
): Promise<void> {
  const screenshot = normalizeStoredUserRequestScreenshot(value);
  if (!screenshot) return;

  let lastError: unknown = null;
  for (const bucketName of resolveStorageBucketCandidates(screenshot.bucketName)) {
    try {
      await getStorage()
        .bucket(bucketName)
        .file(screenshot.storagePath)
        .delete({ ignoreNotFound: true });
      return;
    } catch (error) {
      lastError = error;
      if (!isStorageNotFoundError(error)) break;
    }
  }
  if (lastError && !isStorageNotFoundError(lastError)) throw lastError;
}

export function userRequestScreenshotContentDisposition(
  fileName: string,
  shouldDownload = false
): string {
  const safeName = normalizeText(fileName) || "screenshot";
  const fallback =
    safeName
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w.\-]+/g, "_")
      .replace(/^_+|_+$/g, "") || "screenshot";
  return `${shouldDownload ? "attachment" : "inline"}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(safeName)}`;
}
