import "../../../tests/helpers/privateEncryptionTestKey";
import { createHash } from "node:crypto";
import { PassThrough } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { encryptPrivateFile, decryptPrivateFile } from "./privateStorage";
const mocks = vi.hoisted(() => ({ getStorage: vi.fn(), save: vi.fn(), download: vi.fn(), metadata: vi.fn(), setMetadata: vi.fn() }));
vi.mock("firebase-admin/storage", () => ({ getStorage: mocks.getStorage }));
import { buildContractPdfStoredFileName, contractPdfNumberBindingStatus, contractPdfNumberFingerprint, createContractPdfAttachmentReadStream, normalizeStoredContractPdfAttachment, strengthenExistingContractPdfBinding, toPublicContractPdfAttachment, uploadContractPdfAttachment, verifyContractPdfStorageObject, type StoredContractPdfAttachment } from "./contractPdfStorage";
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
  vi.stubEnv("BUSINESS_DATA_INDEX_KEY", Buffer.alloc(32, 83).toString("base64"));
  mocks.metadata.mockResolvedValue([{ metadata: {} }]);
  mocks.setMetadata.mockResolvedValue(undefined);
  mocks.getStorage.mockReturnValue({ bucket: () => ({ name: bucketName, file: () => ({
    save: mocks.save,
    download: mocks.download,
    createReadStream: () => {
      const stream = new PassThrough();
      Promise.resolve(mocks.download()).then(([bytes]) => stream.end(bytes)).catch(error => stream.destroy(error));
      return stream;
    },
    getMetadata: mocks.metadata,
    setMetadata: mocks.setMetadata,
  }) }) });
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
    const result = await uploadContractPdfAttachment({ file, ownerEmail: "owner@example.test", entryId: "entry", contractNumber: "  A 123  ", uploaderEmail: "owner@example.test" });
    expect(mocks.save).toHaveBeenCalledOnce();
    const [stored, options] = mocks.save.mock.calls[0];
    expect(stored.includes(Buffer.from("synthetic-private-customer"))).toBe(false);
    expect(decryptPrivateFile(stored, bucketName, result.storagePath)).toEqual(bytes);
    expect(options.contentType).toBe("application/octet-stream");
    expect(result.contractNumberFingerprint).toBe(contractPdfNumberFingerprint("A123"));
    expect(result.storagePath.split("/")).toContain(`contract-${result.contractNumberFingerprint}`);
    expect(options.metadata.metadata.contractNumberFingerprint).toBe(result.contractNumberFingerprint);
    expect(JSON.stringify(options)).not.toContain("firebaseStorageDownloadTokens");
    expect(result.sizeBytes).toBe(bytes.length);
    expect(result.sha256).toBe(hash(bytes));
  });
  it("continues to authenticate legacy PDFs during migration", async () => {
    const bytes = Buffer.from("%PDF-1.7\nlegacy");
    mocks.download.mockResolvedValue([bytes]);
    expect((await createContractPdfAttachmentReadStream(attachment(bytes))).sizeBytes).toBe(bytes.length);
  });

  it("binds a PDF to a normalized contract number and detects a mismatch or tampered path", () => {
    const fp = contractPdfNumberFingerprint("  AB 123 ");
    const bound = { ...attachment(Buffer.from("%PDF-1.7\ncontract")), contractNumberFingerprint: fp,
      storagePath: `contract-pdfs/owner/contract-${fp}/entry/file.pdf` };
    expect(contractPdfNumberFingerprint("ab123")).toBe(fp);
    expect(contractPdfNumberBindingStatus(bound, "AB123")).toBe("verified");
    expect(contractPdfNumberBindingStatus(bound, "OTHER-123")).toBe("mismatch");
    expect(contractPdfNumberBindingStatus({ ...bound, storagePath: "contract-pdfs/owner/entry/file.pdf" }, "AB123")).toBe("mismatch");
    expect(contractPdfNumberBindingStatus({ ...bound, storagePath: "contract-pdfs/owner/entry/file.pdf", contractNumberBindingVersion: 1 }, "AB123")).toBe("verified");
    expect(contractPdfNumberBindingStatus(attachment(Buffer.from("%PDF-1.7\nlegacy")), "AB123")).toBe("legacy");
  });

  it("uses only the keyed fingerprint in generated Storage filenames", () => {
    const fp = contractPdfNumberFingerprint("POLICY-123");
    const name = buildContractPdfStoredFileName({ entryType: "contract", contractNumberFingerprint: fp });
    expect(name).toContain(fp?.slice(0, 16) ?? "missing");
    expect(name).not.toContain("POLICY-123");
  });

  it("adds a keyed binding to a verified historical PDF without moving or deleting the object", async () => {
    const bytes = Buffer.from("%PDF-1.7\nhistorical-pdf");
    const previous = { ...attachment(bytes), storagePath: "contract-pdfs/owner/entry/old.pdf" };
    mocks.download.mockResolvedValue([encryptPrivateFile(bytes, bucketName, previous.storagePath)]);
    const rebound = await strengthenExistingContractPdfBinding({
      attachment: previous,
      contractNumber: "POLICY 123",
    });
    expect(rebound.contractNumberFingerprint).toBe(contractPdfNumberFingerprint("POLICY123"));
    expect(rebound.contractNumberBindingVersion).toBe(1);
    expect(rebound.storagePath).toBe(previous.storagePath);
    expect(rebound.uploadedAtMs).toBe(previous.uploadedAtMs);
    expect(mocks.setMetadata).toHaveBeenCalledWith({ metadata: expect.objectContaining({
      contractNumberFingerprint: rebound.contractNumberFingerprint,
      contractNumberBindingVersion: "1",
    }) });
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("preserves existing Storage bindings during bulk repair and checks the written version", async () => {
    const previous = attachment(Buffer.from("%PDF-1.7\nscanned-policy"));
    const fingerprint = contractPdfNumberFingerprint("POLICY123")!;
    const expected = { ...previous, contractNumberFingerprint: fingerprint };
    mocks.metadata.mockResolvedValueOnce([{ metadata: { contractNumberFingerprint: "b".repeat(64) } }]);
    await expect(strengthenExistingContractPdfBinding({
      attachment: previous,
      contractNumber: "POLICY123",
      preserveExistingBinding: true,
    })).rejects.toThrow("different contract number");
    expect(mocks.setMetadata).not.toHaveBeenCalled();

    await expect(verifyContractPdfStorageObject(expected, { requireBinding: true })).rejects.toThrow("binding is missing");
    mocks.metadata.mockResolvedValueOnce([{ metadata: {
      contractNumberFingerprint: fingerprint,
      contractNumberBindingVersion: "1",
      sha256: previous.sha256,
    } }]);
    await expect(verifyContractPdfStorageObject(expected, { requireBinding: true })).resolves.toBeUndefined();
  });

  it("rejects malformed binding fingerprints and never exposes valid fingerprints publicly", () => {
    const bytes = Buffer.from("%PDF-1.7\ncontract");
    const fp = contractPdfNumberFingerprint("AB123");
    const bound = { ...attachment(bytes), contractNumberFingerprint: fp,
      storagePath: `contract-pdfs/owner/contract-${fp}/entry/file.pdf` };
    expect(normalizeStoredContractPdfAttachment({ ...bound, contractNumberFingerprint: "not-a-hash" })).toBeNull();
    const publicAttachment = toPublicContractPdfAttachment(bound, "AB123");
    expect(publicAttachment?.contractNumberBindingStatus).toBe("verified");
    expect(publicAttachment).not.toHaveProperty("contractNumberFingerprint");
  });
});
