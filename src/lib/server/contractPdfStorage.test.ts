import { Readable } from "node:stream";

import { beforeEach, describe, expect, it, vi } from "vitest";

const storageMocks = vi.hoisted(() => ({
  getStorage: vi.fn(),
}));

vi.mock("firebase-admin/storage", () => ({
  getStorage: storageMocks.getStorage,
}));

import {
  createContractPdfAttachmentReadStream,
  type StoredContractPdfAttachment,
} from "./contractPdfStorage";

const attachment = (sizeBytes: number): StoredContractPdfAttachment => ({
  kind: "contractPdf",
  bucketName: "bohemikasmlouvy.firebasestorage.app",
  storagePath: "contract-pdfs/user/entry/smlouva.pdf",
  originalName: "smlouva.pdf",
  contentType: "application/pdf",
  sizeBytes,
  sha256: "a".repeat(64),
  uploadedAtMs: Date.now(),
  uploadedBy: "poradce@example.com",
});

describe("createContractPdfAttachmentReadStream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("vrátí velké PDF jako stream bez načtení celého souboru do odpovědi", async () => {
    const bytes = Buffer.alloc(6 * 1024 * 1024, 7);
    const createReadStream = vi.fn(() => Readable.from(bytes));
    const getMetadata = vi.fn().mockResolvedValue([{ size: String(bytes.length) }]);
    const file = vi.fn(() => ({ getMetadata, createReadStream }));
    const bucket = vi.fn(() => ({ file }));
    storageMocks.getStorage.mockReturnValue({ bucket });

    const result = await createContractPdfAttachmentReadStream(
      attachment(bytes.length)
    );

    expect(result.sizeBytes).toBe(bytes.length);
    expect(createReadStream).toHaveBeenCalledOnce();

    const chunks: Buffer[] = [];
    for await (const chunk of result.stream) {
      chunks.push(Buffer.from(chunk));
    }
    const streamedBytes = Buffer.concat(chunks);
    expect(streamedBytes).toHaveLength(bytes.length);
    expect(streamedBytes[0]).toBe(7);
    expect(streamedBytes.at(-1)).toBe(7);
  });
});
