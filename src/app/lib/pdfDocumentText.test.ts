// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readPdfText, ocrPageToTextPage } from "./pdfDocumentText";
import { detectProductFromPdf } from "./detectProductFromPdf";
import { parseContractPdfByProduct } from "../kalkulacka/calculatorPdfImport";
import type { PdfOcrPage } from "./pdfOcr";

const mocks = vi.hoisted(() => ({
  pages: [] as string[][], getDocument: vi.fn(), getPage: vi.fn(), getText: vi.fn(),
  destroy: vi.fn(), cleanup: vi.fn(), ocr: vi.fn(),
}));
vi.mock("./pdfOcr", () => ({ extractOcrLinesFromPdf: mocks.ocr }));
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({ GlobalWorkerOptions: {}, getDocument: mocks.getDocument,
  OPS: { paintImageXObject: 85, paintInlineImageXObject: 86, paintImageXObjectRepeat: 88, paintInlineImageXObjectGroup: 87 },
}));
const file = () => ({ arrayBuffer: vi.fn(async () => new ArrayBuffer(4)) }) as unknown as File;
const scannedPage = (lines: string[]): PdfOcrPage => ({
  text: lines.join("\n"),
  words: lines.map((text, index) => ({ text, x: 30, y: 30 + index * 18, width: text.length * 5, height: 10 })),
});
const flexi = ["Kooperativa pojišťovna", "Rizikové životní pojištění FLEXI", "Číslo pojistné smlouvy", "1400000001", "Titul, jméno, příjmení", "Jana Testovací", "Částka k úhradě", "704 Kč", "Počátek pojištění", "01.10.2026"];
beforeEach(() => {
  vi.resetAllMocks();
  mocks.pages = [flexi];
  mocks.destroy.mockResolvedValue(undefined);
  mocks.getText.mockImplementation(async (number: number) => ({ items: mocks.pages[number - 1].map((str, index) => ({
    str, transform: [1, 0, 0, 10, 30, 800 - index * 18], width: str.length * 5, height: 10,
  })) }));
  mocks.getPage.mockImplementation(async (number: number) => ({
    getTextContent: () => mocks.getText(number), getViewport: () => ({ width: 595, height: 842 }), cleanup: mocks.cleanup,
  }));
  mocks.getDocument.mockImplementation(() => ({
    promise: Promise.resolve({ numPages: mocks.pages.length, getPage: mocks.getPage }), destroy: mocks.destroy,
  }));
  mocks.ocr.mockImplementation(async (_file, options) => ({ pages: options.pageNumbers.map(() => scannedPage(flexi)) }));
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("shared PDF text and scan reading", () => {
  it("opens and extracts a native PDF once across detection and product import", async () => {
    const upload = file();
    await expect(detectProductFromPdf(upload)).resolves.toMatchObject({ product: "flexi", confidence: "high" });
    await expect(parseContractPdfByProduct("flexi", upload)).resolves.toMatchObject({ contractNumber: "1400000001", clientName: "Jana Testovací", amount: 704 });
    expect(mocks.getDocument).toHaveBeenCalledOnce();
    expect(mocks.getText).toHaveBeenCalledOnce();
    expect(upload.arrayBuffer).toHaveBeenCalledOnce();
    expect(mocks.destroy).toHaveBeenCalledOnce();
    expect(mocks.ocr).not.toHaveBeenCalled();
  });

  it("detects and imports a FLEXI scan with one OCR pass and an explicit review warning", async () => {
    mocks.pages = [[]];
    const upload = file();
    await expect(detectProductFromPdf(upload)).resolves.toMatchObject({ product: "flexi", confidence: "medium" });
    const parsed = await parseContractPdfByProduct("flexi", upload);
    expect(parsed).toMatchObject({ clientName: "Jana Testovací", contractNumber: "1400000001", amount: 704, ocrTextUsed: true });
    expect(parsed?.pdfImportWarnings.join(" ")).toContain("Zkontroluj číslo smlouvy");
    expect(mocks.ocr).toHaveBeenCalledOnce();
  });

  it("recognizes a NEON scan through the same OCR path", async () => {
    mocks.pages = [[]];
    mocks.ocr.mockResolvedValue({ pages: [scannedPage(["Česká podnikatelská pojišťovna, a. s.", "ŽIVOTNÍ POJIŠTĚNÍ NEON", "Číslo pojistné smlouvy", "7500000001"])] });
    const upload = file();
    await expect(detectProductFromPdf(upload)).resolves.toMatchObject({ product: "neon", confidence: "medium" });
    await expect(parseContractPdfByProduct("neon", upload)).resolves.toMatchObject({ contractNumber: "7500000001", ocrTextUsed: true });
    expect(mocks.ocr).toHaveBeenCalledOnce();
  });

  it("OCRs only the missing text pages and preserves native items and page order", async () => {
    mocks.pages = [flexi, [], flexi];
    const upload = file();
    const native = await readPdfText(upload);
    const mixed = await readPdfText(upload, { allowOcr: true });
    expect(mocks.ocr.mock.calls[0][1].pageNumbers).toEqual([2]);
    expect(mixed.pages[0]).toBe(native.pages[0]);
    expect(mixed.pages[2]).toBe(native.pages[2]);
    expect(mixed.pages[1].items.some(item => item.str === "1400000001")).toBe(true);
    expect(mocks.getText).toHaveBeenCalledTimes(3);
  });

  it("never supplies cached scan text to a text-only import", async () => {
    mocks.pages = [[]];
    const upload = file();
    await readPdfText(upload, { allowOcr: true });
    const native = await readPdfText(upload, { allowOcr: false });
    expect(native.ocrTextUsed).toBe(false);
    expect(native.pages[0].items).toEqual([]);
    expect(mocks.getDocument).toHaveBeenCalledOnce();
  });

  it("does not OCR short native text or empty pages without a raster image", async () => {
    mocks.pages = [["Podpis"], []];
    mocks.getPage.mockImplementation(async (number: number) => ({
      getTextContent: () => mocks.getText(number), getViewport: () => ({ width: 595, height: 842 }),
      getOperatorList: async () => ({ fnArray: [] }), cleanup: mocks.cleanup,
    }));
    await expect(readPdfText(file(), { allowOcr: true })).resolves.toMatchObject({ ocrTextUsed: false });
    expect(mocks.ocr).not.toHaveBeenCalled();
  });

  it("recognizes sparse pages with raster images as OCR candidates", async () => {
    mocks.pages = [["Footer"]];
    mocks.getPage.mockImplementation(async (number: number) => ({
      getTextContent: () => mocks.getText(number), getViewport: () => ({ width: 595, height: 842 }),
      getOperatorList: async () => ({ fnArray: [85] }), cleanup: mocks.cleanup,
    }));
    await expect(readPdfText(file(), { allowOcr: true })).resolves.toMatchObject({ ocrTextUsed: true });
    expect(mocks.ocr).toHaveBeenCalledOnce();
  });

  it("retries failed OCR without repeating successful native text extraction", async () => {
    mocks.pages = [[]];
    mocks.ocr.mockRejectedValueOnce(new Error("Worker failed"));
    const upload = file();
    await expect(readPdfText(upload, { allowOcr: true })).rejects.toThrow("Worker failed");
    await expect(readPdfText(upload, { allowOcr: true })).resolves.toMatchObject({ ocrTextUsed: true });
    expect(mocks.getDocument).toHaveBeenCalledOnce();
    expect(mocks.ocr).toHaveBeenCalledTimes(2);
  });

  it("keeps text-only reads independent from ongoing OCR", async () => {
    mocks.pages = [[]];
    const deferred = Promise.withResolvers<{ pages: PdfOcrPage[] }>();
    mocks.ocr.mockReturnValue(deferred.promise);
    const upload = file();
    const scanned = readPdfText(upload, { allowOcr: true });
    await vi.waitFor(() => expect(mocks.ocr).toHaveBeenCalledOnce());
    await expect(readPdfText(upload)).resolves.toMatchObject({ ocrTextUsed: false });
    deferred.resolve({ pages: [scannedPage(flexi)] });
    await expect(scanned).resolves.toMatchObject({ ocrTextUsed: true });
  });

  it("caps OCR work and reports unread pages instead of silently dropping them", async () => {
    mocks.pages = Array.from({ length: 14 }, () => []);
    const result = await readPdfText(file(), { allowOcr: true });
    expect(mocks.ocr.mock.calls[0][1].pageNumbers).toHaveLength(12);
    expect(result.pages).toHaveLength(14);
    expect(result.warnings.join(" ")).toContain("12 z 14");
  });

  it("does not replace existing text with a worse OCR result", async () => {
    mocks.pages = [["1400000001"]];
    mocks.ocr.mockResolvedValue({ pages: [scannedPage(["?"])] });
    const result = await readPdfText(file(), { allowOcr: true });
    expect(result.pages[0].items[0].str).toBe("1400000001");
    expect(result.ocrTextUsed).toBe(false);
    expect(result.warnings).toHaveLength(1);
  });

  it("shares pending reads, while cancellation of one caller leaves the other intact", async () => {
    const deferred = Promise.withResolvers<{ items: [] }>();
    mocks.getText.mockReturnValue(deferred.promise);
    const upload = file();
    const controller = new AbortController();
    const first = readPdfText(upload, { signal: controller.signal });
    const rejected = expect(first).rejects.toMatchObject({ name: "AbortError" });
    const second = readPdfText(upload);
    await vi.waitFor(() => expect(mocks.getText).toHaveBeenCalledOnce());
    controller.abort();
    await rejected;
    expect(mocks.destroy).not.toHaveBeenCalled();
    deferred.resolve({ items: [] });
    await expect(second).resolves.toMatchObject({ pages: [{ items: [] }] });
    expect(mocks.destroy).toHaveBeenCalledOnce();
  });

  it("destroys a cancelled document and permits a clean retry of the same file", async () => {
    mocks.getText.mockReturnValueOnce(new Promise(() => {}));
    const upload = file();
    const controller = new AbortController();
    const rejected = expect(readPdfText(upload, { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(mocks.getText).toHaveBeenCalledOnce());
    controller.abort(); await rejected;
    await vi.waitFor(() => expect(mocks.destroy).toHaveBeenCalledOnce());
    await expect(readPdfText(upload)).resolves.toMatchObject({ ocrTextUsed: false });
    expect(mocks.getDocument).toHaveBeenCalledTimes(2);
  });

  it("forwards cancellation to OCR and stops forwarding late progress", async () => {
    mocks.pages = [[]];
    mocks.ocr.mockImplementation((_file, options) => new Promise((_, reject) => {
      options.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));
    const controller = new AbortController();
    const onOcrProgress = vi.fn();
    const rejected = expect(readPdfText(file(), { allowOcr: true, signal: controller.signal, onOcrProgress })).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(mocks.ocr).toHaveBeenCalledOnce());
    const options = mocks.ocr.mock.calls[0][1];
    controller.abort(); await rejected;
    expect(options.signal.aborted).toBe(true);
    options.onProgress({ page: 1, totalPages: 1, progress: 1, status: "late" });
    expect(onOcrProgress).not.toHaveBeenCalled();
  });

  it("releases a stalled native reader when its own deadline expires", async () => {
    vi.useFakeTimers();
    mocks.getText.mockReturnValue(new Promise(() => {}));
    const rejected = expect(readPdfText(file())).rejects.toMatchObject({ name: "PdfImportTimeoutError" });
    await vi.waitFor(() => expect(mocks.getText).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(15_000); await rejected;
    expect(mocks.destroy).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves leading zeroes, label boundaries and coordinates in OCR text", () => {
    const words = [
      { text: "Číslo", x: 10, y: 20, width: 20, height: 10 },
      { text: "smlouvy:", x: 33, y: 20, width: 40, height: 10 },
      { text: "0012345678", x: 77, y: 20, width: 60, height: 10 },
    ];
    const page = ocrPageToTextPage({ words, text: "" }, { items: [], width: 595, height: 842 });
    expect(page.items.map(item => item.str)).toEqual(["Číslo smlouvy:", "0012345678"]);
    expect(page.items[1].transform.slice(4)).toEqual([77, 812]);
    expect(page.ocrWords).toBe(words);
  });

  it("keeps dates and their labels on the same row despite different OCR glyph heights", () => {
    const page = ocrPageToTextPage({ text: "", words: [
      { text: "Počátek pojištění:", x: 30, y: 20, width: 100, height: 13 },
      { text: "01.10.2026", x: 140, y: 20, width: 60, height: 10 },
      { text: "Konec pojištění:", x: 30, y: 45, width: 100, height: 13 },
      { text: "30.09.2027", x: 140, y: 45, width: 60, height: 10 },
    ] }, { items: [], width: 595, height: 842 });
    expect(page.items[0].transform[5]).toBe(page.items[1].transform[5]);
    expect(page.items[2].transform[5]).toBe(page.items[3].transform[5]);
    expect(page.items[0].transform[5]).toBeGreaterThan(page.items[2].transform[5]);
  });
});
