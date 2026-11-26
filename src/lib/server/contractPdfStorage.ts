import { encryptPrivateFile, decryptPrivateFile } from "./privateStorage";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { Readable } from "node:stream";

import { getStorage } from "firebase-admin/storage";
import { businessLookupToken } from "./businessDataEncryption";

export const CONTRACT_PDF_MAX_BYTES = 12 * 1024 * 1024;
const MAX_ENCRYPTED_CONTRACT_PDF_BYTES = CONTRACT_PDF_MAX_BYTES + 8 * 1024;

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
  contractNumberFingerprint?: string;
  contractNumberBindingVersion?: 1;
};

export type PublicContractPdfAttachment = Omit<
  StoredContractPdfAttachment,
  "bucketName" | "storagePath" | "contractNumberFingerprint" | "contractNumberBindingVersion"
> & {
  hasFile: true;
  contractNumberBindingStatus: "verified" | "legacy" | "mismatch" | "unverified";
};

export type ContractPdfAttachmentReadStream = {
  stream: Readable;
  sizeBytes: number;
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

/** Uses the same whitespace and case normalization as contract-number indexes. */
export function contractPdfNumberFingerprint(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, "").trim().toLowerCase();
  if (!normalized || normalized.length > 160) return null;
  return businessLookupToken("contract-pdf-number-binding", normalized);
}

export function contractPdfNumberBindingStatus(
  attachmentValue: unknown,
  contractNumber: unknown,
): "verified" | "legacy" | "mismatch" | "unverified" {
  const attachment = normalizeStoredContractPdfAttachment(attachmentValue);
  if (!attachment) return "unverified";
  if (!attachment.contractNumberFingerprint) return "legacy";
  const expected = contractPdfNumberFingerprint(contractNumber);
  if (!expected) return "mismatch";
  const actualBytes = Buffer.from(attachment.contractNumberFingerprint, "hex");
  const expectedBytes = Buffer.from(expected, "hex");
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) return "mismatch";
  const pathBound = attachment.storagePath.split("/").includes(`contract-${expected}`);
  if (!pathBound && attachment.contractNumberBindingVersion !== 1) return "mismatch";
  return "verified";
}

export function buildContractPdfStoredFileName({
  entryType,
  contractNumberFingerprint,
}: {
  entryType?: string | null;
  contractNumberFingerprint?: string | null;
}): string {
  const prefix = entryType === "endorsement" ? "dodatek" : "ps";
  const safeFingerprint = normalizeText(contractNumberFingerprint).toLowerCase();
  const contractSegment = /^[a-f0-9]{64}$/.test(safeFingerprint) ? safeFingerprint.slice(0, 16) : "smlouva";
  const suffix = randomUUID().replace(/-/g, "").slice(0, 8);
  return sanitizeContractPdfFileName(`${prefix}-${contractSegment}-${suffix}.pdf`);
}

function looksLikePdf(bytes: Buffer): boolean {
  if (bytes.length < 8) return false;
  return bytes.subarray(0, Math.min(bytes.length, 1024)).toString("latin1").includes("%PDF-");
}

function readStoredPdfWithLimit(file: { createReadStream: () => Readable }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const stream = file.createReadStream();
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;
    const finish = (error?: Error, result?: Buffer) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        for (const chunk of chunks) chunk.fill(0);
        reject(error);
      } else resolve(result ?? Buffer.alloc(0));
    };
    const timer = setTimeout(() => stream.destroy(new Error("Storage read timed out.")), 90_000);
    stream.on("data", (chunk: Buffer | Uint8Array) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += bytes.length;
      if (total > MAX_ENCRYPTED_CONTRACT_PDF_BYTES) {
        stream.destroy(new Error("Stored PDF is too large."));
        return;
      }
      chunks.push(bytes);
    });
    stream.once("error", error => finish(error));
    stream.once("end", () => {
      const result = Buffer.concat(chunks);
      for (const chunk of chunks) chunk.fill(0);
      finish(undefined, result);
    });
  });
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
  const contractNumberFingerprint = normalizeText(row.contractNumberFingerprint).toLowerCase();
  const bindingVersion = row.contractNumberBindingVersion;
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
  if (contractNumberFingerprint && !/^[a-f0-9]{64}$/.test(contractNumberFingerprint)) return null;
  if (bindingVersion != null && bindingVersion !== 1 && bindingVersion !== "1") return null;

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
    ...(contractNumberFingerprint ? { contractNumberFingerprint } : {}),
    ...(bindingVersion != null ? { contractNumberBindingVersion: 1 as const } : {}),
  };
}

export function toPublicContractPdfAttachment(
  value: unknown,
  contractNumber?: unknown,
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
    contractNumberBindingStatus: contractPdfNumberBindingStatus(attachment, contractNumber),
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
  contractNumberFingerprint,
  originalName,
  uploaderEmail,
  sha256,
}: {
  bucketName: string;
  bytes: Buffer;
  ownerEmail: string;
  entryId: string;
  contractNumberFingerprint: string;
  originalName: string;
  uploaderEmail: string;
  sha256: string;
}): Promise<StoredContractPdfAttachment> {
  const bucket = getStorage().bucket(bucketName);
  const safeOriginalName = sanitizeContractPdfFileName(originalName);
  const objectPath = [
    "contract-pdfs",
    ownerStorageHash(ownerEmail),
    `contract-${contractNumberFingerprint}`,
    sanitizeStorageSegment(entryId),
    `${Date.now()}-${randomUUID()}-${safeOriginalName}`,
  ].join("/");

  await bucket.file(objectPath).save(encryptPrivateFile(bytes, bucket.name, objectPath), {
    resumable: false,
    contentType: "application/octet-stream",
    metadata: {
      cacheControl: "private, no-store, max-age=0",
      contentDisposition: contractPdfContentDisposition(safeOriginalName, false),
      metadata: {
        originalName: safeOriginalName,
        uploadedBy: uploaderEmail,
        sha256,
        contractNumberFingerprint,
        contractNumberBindingVersion: "1",
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
    contractNumberFingerprint,
    contractNumberBindingVersion: 1,
  };
}

export async function uploadContractPdfAttachment({
  file,
  ownerEmail,
  entryId,
  contractNumber,
  uploaderEmail,
  storedFileName,
}: {
  file: File;
  ownerEmail: string;
  entryId: string;
  contractNumber: string;
  uploaderEmail: string;
  storedFileName?: string | null;
}): Promise<StoredContractPdfAttachment> {
  const uploadedOriginalName = normalizeText(file.name) || "smlouva.pdf";
  const originalName = normalizeText(storedFileName) || uploadedOriginalName;
  const contractNumberFingerprint = contractPdfNumberFingerprint(contractNumber);
  if (!contractNumberFingerprint) throw new Error("Číslo smlouvy chybí nebo není platné.");
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
  if (!uploadedOriginalName.toLowerCase().endsWith(".pdf")) {
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
        contractNumberFingerprint,
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

export async function strengthenExistingContractPdfBinding({
  attachment: attachmentValue,
  contractNumber,
  preserveExistingBinding = false,
}: {
  attachment: unknown;
  contractNumber: string;
  preserveExistingBinding?: boolean;
}): Promise<StoredContractPdfAttachment> {
  const attachment = normalizeStoredContractPdfAttachment(attachmentValue);
  if (!attachment) throw new Error("PDF metadata is invalid.");
  const fingerprint = contractPdfNumberFingerprint(contractNumber);
  if (!fingerprint) throw new Error("Contract number is missing or invalid.");

  let lastError: unknown = null;
  for (const bucketName of resolveStorageBucketCandidates(attachment.bucketName)) {
    try {
      const bucket = getStorage().bucket(bucketName);
      const file = bucket.file(attachment.storagePath);
      const [metadata] = await file.getMetadata();
      const customMetadata = metadata.metadata && typeof metadata.metadata === "object"
        ? metadata.metadata as Record<string, string>
        : {};
      if (customMetadata.sha256 && customMetadata.sha256.toLowerCase() !== attachment.sha256) {
        throw new Error("Stored PDF metadata digest does not match.");
      }
      let target = file;
      if (preserveExistingBinding) {
        if (customMetadata.contractNumberFingerprint && customMetadata.contractNumberFingerprint !== fingerprint) {
          throw new Error("Stored PDF is bound to a different contract number.");
        }
        if (!metadata.generation || !metadata.metageneration) throw new Error("Storage object version is unavailable.");
        target = bucket.file(attachment.storagePath, { preconditionOpts: {
          ifGenerationMatch: metadata.generation,
          ifMetagenerationMatch: metadata.metageneration,
        } });
      }
      await target.setMetadata({ metadata: {
        ...customMetadata,
        contractNumberFingerprint: fingerprint,
        contractNumberBindingVersion: "1",
      } });
      return { ...attachment, contractNumberFingerprint: fingerprint, contractNumberBindingVersion: 1 };
    } catch (error) {
      lastError = error;
      if (!isStorageNotFoundError(error)) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Storage bucket is unavailable.");
}

export async function verifyContractPdfStorageObject(
  attachmentValue: unknown,
  { requireBinding = false }: { requireBinding?: boolean } = {},
): Promise<void> {
  const attachment = normalizeStoredContractPdfAttachment(attachmentValue);
  if (!attachment) throw new Error("PDF metadata is invalid.");
  let lastError: unknown = null;
  for (const bucketName of resolveStorageBucketCandidates(attachment.bucketName)) {
    try {
      const [metadata] = await getStorage().bucket(bucketName).file(attachment.storagePath).getMetadata();
      const storedSha = metadata.metadata?.sha256;
      if (typeof storedSha === "string" && storedSha.toLowerCase() !== attachment.sha256) {
        throw new Error("Stored PDF metadata digest does not match.");
      }
      const storedFingerprint = metadata.metadata?.contractNumberFingerprint;
      if (storedFingerprint && attachment.contractNumberFingerprint && storedFingerprint !== attachment.contractNumberFingerprint) {
        throw new Error("Stored PDF is bound to a different contract number.");
      }
      if (requireBinding && (!attachment.contractNumberFingerprint || storedFingerprint !== attachment.contractNumberFingerprint ||
        metadata.metadata?.contractNumberBindingVersion !== "1")) {
        throw new Error("Stored PDF binding is missing.");
      }
      return;
    } catch (error) {
      lastError = error;
      if (!isStorageNotFoundError(error)) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Storage bucket is unavailable.");
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
      const encrypted = await readStoredPdfWithLimit(
        getStorage().bucket(bucketName).file(attachment.storagePath)
      );
      let plaintext: Buffer | null = null;
      try {
        plaintext = decryptPrivateFile(encrypted, bucketName, attachment.storagePath);
        if (!looksLikePdf(plaintext) || createHash("sha256").update(plaintext).digest("hex") !== attachment.sha256) {
          plaintext.fill(0);
          throw new Error("Invalid stored PDF integrity");
        }
        return plaintext;
      } finally {
        encrypted.fill(0);
      }
    } catch (error) {
      lastError = error;
      if (!isStorageNotFoundError(error)) throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("PDF nebylo nalezeno.");
}

export async function createContractPdfAttachmentReadStream(
  attachment: StoredContractPdfAttachment
): Promise<ContractPdfAttachmentReadStream> {
  const bytes = await downloadContractPdfAttachment(attachment);
  return { stream: Readable.from([bytes]), sizeBytes: bytes.length };
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
