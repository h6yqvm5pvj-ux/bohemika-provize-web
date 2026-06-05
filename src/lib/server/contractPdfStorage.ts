import { createHash, randomUUID } from "node:crypto";

import { getStorage } from "firebase-admin/storage";

export const CONTRACT_PDF_MAX_BYTES = 12 * 1024 * 1024;

export type StoredContractPdfAttachment = {
  kind: "contractPdf";
  bucketName: string;
  storagePath: string;
  originalName: string;
  contentType: "application/pdf";
  sizeBytes: number;
  sha256: string;
  uploadedAtMs: number;
  uploadedBy: string;
};

export type PublicContractPdfAttachment = Omit<
  StoredContractPdfAttachment,
  "bucketName" | "storagePath"
> & {
  hasFile: true;
};

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const normalizeBucketName = (value: string): string =>
  value.trim().replace(/^gs:\/\//i, "").replace(/\/+$/, "");

export function resolveStorageBucketCandidates(
  preferredBucketName?: string | null
): string[] {
  const candidates: string[] = [];
  const append = (value: string | null | undefined) => {
    if (!value) return;
    const normalized = normalizeBucketName(value);
    if (!normalized || candidates.includes(normalized)) return;
    candidates.push(normalized);
  };

  append(preferredBucketName);
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
}

export function isStorageNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const row = error as {
    code?: number | string;
    statusCode?: number;
    message?: string;
  };
  const code = typeof row.code === "string" ? Number(row.code) : row.code;
  if (code === 404 || row.statusCode === 404) return true;
  const message = typeof row.message === "string" ? row.message.toLowerCase() : "";
  return (
    (message.includes("bucket") && message.includes("does not exist")) ||
    message.includes("no such object") ||
    message.includes("not found")
  );
}

export function sanitizeContractPdfFileName(value: string): string {
  const stripped =
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w.\-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 140) || "smlouva.pdf";
  return stripped.toLowerCase().endsWith(".pdf") ? stripped : `${stripped}.pdf`;
}

const sanitizeStorageSegment = (value: string): string =>
  value
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 140) || "entry";

const ownerStorageHash = (ownerEmail: string): string =>
  createHash("sha256").update(ownerEmail.trim().toLowerCase()).digest("hex").slice(0, 32);

function looksLikePdf(bytes: Buffer): boolean {
  if (bytes.length < 8) return false;
  return bytes.subarray(0, Math.min(bytes.length, 1024)).toString("latin1").includes("%PDF-");
}

export function normalizeStoredContractPdfAttachment(
  value: unknown
): StoredContractPdfAttachment | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const kind = normalizeText(row.kind);
  const bucketName = normalizeText(row.bucketName);
  const storagePath = normalizeText(row.storagePath);
  const originalName = normalizeText(row.originalName);
  const contentType = normalizeText(row.contentType).toLowerCase();
  const sha256 = normalizeText(row.sha256);
  const uploadedBy = normalizeText(row.uploadedBy).toLowerCase();
  const sizeBytes = Number(row.sizeBytes);
  const uploadedAtMs = Number(row.uploadedAtMs);

  if (kind !== "contractPdf") return null;
  if (!bucketName || !storagePath || !originalName) return null;
  if (contentType !== "application/pdf") return null;
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > CONTRACT_PDF_MAX_BYTES) {
    return null;
  }
  if (!Number.isFinite(uploadedAtMs) || uploadedAtMs <= 0) return null;
  if (!/^[a-f0-9]{64}$/i.test(sha256)) return null;

  return {
    kind: "contractPdf",
    bucketName,
    storagePath,
    originalName,
    contentType: "application/pdf",
    sizeBytes: Math.floor(sizeBytes),
    sha256: sha256.toLowerCase(),
    uploadedAtMs: Math.floor(uploadedAtMs),
    uploadedBy,
  };
}

export function toPublicContractPdfAttachment(
  value: unknown
): PublicContractPdfAttachment | null {
  const attachment = normalizeStoredContractPdfAttachment(value);
  if (!attachment) return null;
  return {
    kind: attachment.kind,
    hasFile: true,
    originalName: attachment.originalName,
    contentType: attachment.contentType,
    sizeBytes: attachment.sizeBytes,
    sha256: attachment.sha256,
    uploadedAtMs: attachment.uploadedAtMs,
    uploadedBy: attachment.uploadedBy,
  };
}

export function contractPdfContentDisposition(
  fileName: string,
  shouldDownload: boolean
): string {
  const safeFileName = sanitizeContractPdfFileName(fileName);
  const fallback =
    safeFileName
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w.\-]+/g, "_")
      .replace(/^_+|_+$/g, "") || "smlouva.pdf";
  return `${shouldDownload ? "attachment" : "inline"}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(
    safeFileName
  )}`;
}

async function uploadContractPdfToBucket({
  bucketName,
  bytes,
  ownerEmail,
  entryId,
  originalName,
  uploaderEmail,
  sha256,
}: {
  bucketName: string;
  bytes: Buffer;
  ownerEmail: string;
  entryId: string;
  originalName: string;
  uploaderEmail: string;
  sha256: string;
}): Promise<StoredContractPdfAttachment> {
  const bucket = getStorage().bucket(bucketName);
  const safeOriginalName = sanitizeContractPdfFileName(originalName);
  const objectPath = [
    "contract-pdfs",
    ownerStorageHash(ownerEmail),
    sanitizeStorageSegment(entryId),
    `${Date.now()}-${randomUUID()}-${safeOriginalName}`,
  ].join("/");

  await bucket.file(objectPath).save(bytes, {
    resumable: false,
    contentType: "application/pdf",
    metadata: {
      cacheControl: "private, no-store, max-age=0",
      contentDisposition: contractPdfContentDisposition(safeOriginalName, false),
      metadata: {
        originalName: safeOriginalName,
        uploadedBy: uploaderEmail,
        sha256,
      },
    },
  });

  return {
    kind: "contractPdf",
    bucketName: bucket.name,
    storagePath: objectPath,
    originalName: safeOriginalName,
    contentType: "application/pdf",
    sizeBytes: bytes.length,
    sha256,
    uploadedAtMs: Date.now(),
    uploadedBy: uploaderEmail,
  };
}

export async function uploadContractPdfAttachment({
  file,
  ownerEmail,
  entryId,
  uploaderEmail,
}: {
  file: File;
  ownerEmail: string;
  entryId: string;
  uploaderEmail: string;
}): Promise<StoredContractPdfAttachment> {
  const originalName = normalizeText(file.name) || "smlouva.pdf";
  const contentType = normalizeText(file.type).toLowerCase();
  if (file.size <= 0) {
    throw new Error("PDF soubor je prázdný.");
  }
  if (file.size > CONTRACT_PDF_MAX_BYTES) {
    throw new Error("PDF je příliš velké. Maximální velikost je 12 MB.");
  }
  if (
    contentType &&
    contentType !== "application/pdf" &&
    contentType !== "application/x-pdf"
  ) {
    throw new Error("Příloha musí být PDF soubor.");
  }
  if (!originalName.toLowerCase().endsWith(".pdf")) {
    throw new Error("Příloha musí mít příponu .pdf.");
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!looksLikePdf(bytes)) {
    throw new Error("Soubor nevypadá jako platné PDF.");
  }

  const bucketCandidates = resolveStorageBucketCandidates();
  if (!bucketCandidates.length) {
    throw new Error("Storage bucket není nakonfigurován.");
  }

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  let lastError: unknown = null;
  for (const bucketName of bucketCandidates) {
    try {
      return await uploadContractPdfToBucket({
        bucketName,
        bytes,
        ownerEmail,
        entryId,
        originalName,
        uploaderEmail,
        sha256,
      });
    } catch (error) {
      lastError = error;
      if (!isStorageNotFoundError(error)) throw error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Nepodařilo se nahrát PDF do Storage.");
}

export async function downloadContractPdfAttachment(
  attachment: StoredContractPdfAttachment
): Promise<Buffer> {
  const bucketCandidates = resolveStorageBucketCandidates(attachment.bucketName);
  if (!bucketCandidates.length) {
    throw new Error("Storage bucket není nakonfigurován.");
  }

  let lastError: unknown = null;
  for (const bucketName of bucketCandidates) {
    try {
      const [bytes] = await getStorage()
        .bucket(bucketName)
        .file(attachment.storagePath)
        .download();
      return bytes;
    } catch (error) {
      lastError = error;
      if (!isStorageNotFoundError(error)) throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("PDF nebylo nalezeno.");
}

export async function deleteContractPdfAttachment(
  attachment: StoredContractPdfAttachment
): Promise<void> {
  const bucketCandidates = resolveStorageBucketCandidates(attachment.bucketName);
  for (const bucketName of bucketCandidates) {
    try {
      await getStorage()
        .bucket(bucketName)
        .file(attachment.storagePath)
        .delete({ ignoreNotFound: true });
      return;
    } catch (error) {
      if (!isStorageNotFoundError(error)) throw error;
    }
  }
}
