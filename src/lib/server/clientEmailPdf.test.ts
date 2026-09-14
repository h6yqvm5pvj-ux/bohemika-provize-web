import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoredContractPdfAttachment } from "./contractPdfStorage";

const mocks = vi.hoisted(() => ({ download: vi.fn(), getDocument: vi.fn(), getPage: vi.fn(), destroy: vi.fn(), content: vi.fn() }));
vi.mock("./contractPdfStorage", () => ({ CONTRACT_PDF_MAX_BYTES: 12 * 1024 * 1024, downloadContractPdfAttachment: mocks.download }));
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({ getDocument: mocks.getDocument }));
import { readClientEmailFromStoredPdf } from "./clientEmailPdf";

const bytes = Buffer.from("%PDF-test");
const attachment = { sha256: createHash("sha256").update(bytes).digest("hex") } as StoredContractPdfAttachment;
const item = (str: string, x: number, y: number, width: number) => ({ str, width, transform: [1, 0, 0, 1, x, y] });
beforeEach(() => {
  vi.resetAllMocks(); mocks.download.mockResolvedValue(bytes);
  mocks.content.mockResolvedValue({ items: [
    item("Pojist", 0, 100, 25), item("ník", 25, 100, 15),
    item("Petr", 0, 90, 20), item("Novák", 25, 90, 25),
    item("E-mail:", 0, 80, 25), item("petr@", 30, 80, 25), item("example.test", 55, 80, 50),
  ] });
  mocks.getPage.mockResolvedValue({ getTextContent: mocks.content, cleanup: vi.fn() });
  mocks.getDocument.mockReturnValue({ promise: Promise.resolve({ numPages: 1, getPage: mocks.getPage }), destroy: mocks.destroy });
});

describe("reading stored PDF emails", () => {
  it("joins split glyphs using their positions and releases the PDF afterwards", async () => {
    expect(await readClientEmailFromStoredPdf(attachment, "Bc. Petr Novák")).toEqual({ status: "found", email: "petr@example.test" });
    expect(mocks.getDocument).toHaveBeenCalledWith(expect.objectContaining({ isEvalSupported: false }));
    expect(mocks.destroy).toHaveBeenCalledOnce();
  });
  it("rejects bytes that do not match the attachment's recorded hash", async () => {
    mocks.download.mockResolvedValue(Buffer.from("different"));
    await expect(readClientEmailFromStoredPdf(attachment, "Petr Novák")).rejects.toThrow("integrity");
    expect(mocks.getDocument).not.toHaveBeenCalled();
  });
  it("releases the document after a text-reading failure", async () => {
    mocks.content.mockRejectedValue(new Error("unreadable"));
    await expect(readClientEmailFromStoredPdf(attachment, "Petr Novák")).rejects.toThrow("unreadable");
    expect(mocks.destroy).toHaveBeenCalledOnce();
  });
  it("limits page processing and does not infer an email from a scan", async () => {
    mocks.getDocument.mockReturnValue({ promise: Promise.resolve({ numPages: 300, getPage: mocks.getPage }), destroy: mocks.destroy });
    mocks.content.mockResolvedValue({ items: [] });
    expect(await readClientEmailFromStoredPdf(attachment, "Petr Novák")).toEqual({ status: "not-found", email: null });
    expect(mocks.getPage).toHaveBeenCalledTimes(8);
  });
});
