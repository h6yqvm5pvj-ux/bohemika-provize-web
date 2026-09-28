import "../../../tests/helpers/privateEncryptionTestKey";
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { encryptPrivateFile, decryptPrivateFile } from "./privateStorage";
const mocks = vi.hoisted(() => ({ getStorage: vi.fn(), save: vi.fn(), download: vi.fn() }));
vi.mock("firebase-admin/storage", () => ({ getStorage: mocks.getStorage }));
import { createContractPdfAttachmentReadStream, uploadContractPdfAttachment, type StoredContractPdfAttachment } from "./contractPdfStorage";
const bucketName = "synthetic.firebasestorage.app";
const path = "contract-pdfs/owner/entry/file.pdf";
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const attachment = (bytes: Buffer): StoredContractPdfAttachment => ({
  kind: "contractPdf", bucketName, storagePath: path, originalName: "file.pdf", contentType: "application/pdf",
  sizeBytes: bytes.length, sha256: hash(bytes), uploadedAtMs: 100, uploadedBy: "synthetic@example.test",
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", bucketName);
  mocks.getStorage.mockReturnValue({ bucket: () => ({ name: bucketName, file: () => ({ save: mocks.save, download: mocks.download }) }) });
});
describe("private PDF storage", () => {
  it("authenticates a large encrypted PDF before returning its original bytes and length", async () => {
    const bytes = Buffer.alloc(6 * 1024 * 1024, 7);
    bytes.write("%PDF-1.7\n");
    mocks.download.mockResolvedValue([encryptPrivateFile(bytes, bucketName, path)]);
    const result = await createContractPdfAttachmentReadStream(attachment(bytes));
    const chunks: Buffer[] = [];
    for await (const chunk of result.stream) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).equals(bytes)).toBe(true);
    expect(result.sizeBytes).toBe(bytes.length);
  });
  it("does not return a stream for damaged ciphertext or a substituted PDF", async () => {
    const bytes = Buffer.from("%PDF-1.7\nprivate-content");
    const encrypted = encryptPrivateFile(bytes, bucketName, path);
    encrypted[encrypted.length - 1] ^= 1;
    mocks.download.mockResolvedValueOnce([encrypted]);
    await expect(createContractPdfAttachmentReadStream(attachment(bytes))).rejects.toThrow();
    mocks.download.mockResolvedValueOnce([Buffer.from("%PDF-1.7\nanother-contract")]);
    await expect(createContractPdfAttachmentReadStream(attachment(bytes))).rejects.toThrow("integrity");
  });
  it("uploads only ciphertext and returns original attachment metadata", async () => {
    const bytes = Buffer.from("%PDF-1.7\nsynthetic-private-customer");
    const file = new File([bytes], "contract.pdf", { type: "application/pdf" });
    const result = await uploadContractPdfAttachment({ file, ownerEmail: "owner@example.test", entryId: "entry", uploaderEmail: "owner@example.test" });
    expect(mocks.save).toHaveBeenCalledOnce();
    const [stored, options] = mocks.save.mock.calls[0];
    expect(stored.includes(Buffer.from("synthetic-private-customer"))).toBe(false);
    expect(decryptPrivateFile(stored, bucketName, result.storagePath)).toEqual(bytes);
    expect(options.contentType).toBe("application/octet-stream");
    expect(JSON.stringify(options)).not.toContain("firebaseStorageDownloadTokens");
    expect(result.sizeBytes).toBe(bytes.length);
    expect(result.sha256).toBe(hash(bytes));
  });
  it("continues to authenticate legacy PDFs during migration", async () => {
    const bytes = Buffer.from("%PDF-1.7\nlegacy");
    mocks.download.mockResolvedValue([bytes]);
    expect((await createContractPdfAttachmentReadStream(attachment(bytes))).sizeBytes).toBe(bytes.length);
  });
});
