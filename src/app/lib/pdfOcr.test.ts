// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractOcrLinesFromPdf } from "./pdfOcr";

const mocks = vi.hoisted(() => ({
  createWorker: vi.fn(), recognize: vi.fn(), parameters: vi.fn(), terminate: vi.fn(),
  getDocument: vi.fn(), getPage: vi.fn(), render: vi.fn(), destroy: vi.fn(), cleanup: vi.fn(), viewport: vi.fn(),
}));
vi.mock("tesseract.js", () => ({ createWorker: mocks.createWorker, PSM: { AUTO: "3", SINGLE_BLOCK: "6" } }));
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({ GlobalWorkerOptions: {}, getDocument: mocks.getDocument }));
const worker = { recognize: mocks.recognize, setParameters: mocks.parameters, terminate: mocks.terminate };
const file = () => ({ arrayBuffer: async () => new ArrayBuffer(4) }) as File;
let canvases: HTMLCanvasElement[];

beforeEach(() => {
  vi.useFakeTimers(); vi.resetAllMocks(); canvases = [];
  const createElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag, options) => {
    const element = createElement(tag, options);
    if (tag === "canvas") {
      const canvas = element as HTMLCanvasElement;
      vi.spyOn(canvas, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
      canvases.push(canvas);
    }
    return element;
  });
  mocks.createWorker.mockResolvedValue(worker);
  mocks.parameters.mockResolvedValue({}); mocks.terminate.mockResolvedValue(undefined);
  mocks.destroy.mockResolvedValue(undefined);
  mocks.viewport.mockImplementation(({ scale }) => ({ width: 600 * scale, height: 800 * scale }));
  mocks.render.mockReturnValue({ promise: Promise.resolve() });
  mocks.getPage.mockResolvedValue({ getViewport: mocks.viewport, render: mocks.render, cleanup: mocks.cleanup });
  mocks.getDocument.mockReturnValue({ promise: Promise.resolve({ numPages: 2, getPage: mocks.getPage }), destroy: mocks.destroy });
  mocks.recognize.mockResolvedValue({ data: { text: " Synthetic  text\n", blocks: [{ paragraphs: [{ lines: [{ words: [{ text: "Synthetic", bbox: { x0: 26, y0: 52, x1: 78, y1: 78 } }] }] }] }] } });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("PDF OCR processing and cleanup", () => {
  it("recognizes each page once with one worker and preserves PDF coordinates", async () => {
    const result = await extractOcrLinesFromPdf(file());
    expect(mocks.createWorker).toHaveBeenCalledOnce();
    expect(mocks.createWorker.mock.calls[0][2]).toMatchObject({ corePath: "/ocr", workerPath: "/ocr/worker.min.js?v=7.0.0-ocr2", langPath: "/ocr/lang", workerBlobURL: false });
    expect(mocks.recognize).toHaveBeenCalledTimes(2);
    expect(result.lines).toEqual(["Synthetic text", "Synthetic text"]);
    expect(result.pages[0].words[0]).toEqual({ text: "Synthetic", x: 10, y: 20, width: 20, height: 10 });
    expect(mocks.terminate).toHaveBeenCalledOnce(); expect(mocks.destroy).toHaveBeenCalledOnce();
    expect(canvases.every(canvas => canvas.width === 0 && canvas.height === 0)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("caps oversized scans before allocating a canvas", async () => {
    mocks.viewport.mockImplementation(({ scale }) => ({ width: 6000 * scale, height: 9000 * scale }));
    mocks.recognize.mockImplementation(async (canvas) => {
      expect(canvas.width).toBeLessThanOrEqual(4096);
      expect(canvas.height).toBeLessThanOrEqual(4096);
      expect(canvas.width * canvas.height).toBeLessThan(4_010_000);
      return { data: { text: "", blocks: [] } };
    });
    await extractOcrLinesFromPdf(file(), { maxPages: 1, scale: 10 });
    expect(mocks.recognize).toHaveBeenCalledOnce();
  });

  it("cleans the document when worker initialization rejects", async () => {
    mocks.createWorker.mockRejectedValue(new Error("Worker unavailable"));
    await expect(extractOcrLinesFromPdf(file())).rejects.toThrow("Worker unavailable");
    expect(mocks.destroy).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects worker error callbacks even if Tesseract leaves its startup promise pending", async () => {
    mocks.createWorker.mockImplementation((_languages, _oem, options) => {
      queueMicrotask(() => options.errorHandler("Cannot load language data"));
      return new Promise(() => {});
    });
    await expect(extractOcrLinesFromPdf(file())).rejects.toThrow("Rozpoznávání skenu");
    expect(mocks.destroy).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds startup and terminates a worker that arrives after timeout", async () => {
    const pending = Promise.withResolvers<typeof worker>();
    mocks.createWorker.mockReturnValue(pending.promise);
    const assertion = expect(extractOcrLinesFromPdf(file())).rejects.toMatchObject({ name: "PdfImportTimeoutError" });
    await vi.waitFor(() => expect(mocks.createWorker).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(30_000); await assertion;
    expect(mocks.destroy).toHaveBeenCalledOnce();
    pending.resolve(worker);
    await vi.waitFor(() => expect(mocks.terminate).toHaveBeenCalledOnce());
    expect(mocks.recognize).not.toHaveBeenCalled();
  });

  it("stops a hung recognition and suppresses late progress after the timeout", async () => {
    mocks.recognize.mockReturnValue(new Promise(() => {}));
    const progress = vi.fn();
    const assertion = expect(extractOcrLinesFromPdf(file(), { onProgress: progress })).rejects.toMatchObject({ name: "PdfImportTimeoutError" });
    await vi.waitFor(() => expect(mocks.recognize).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(90_000); await assertion;
    expect(mocks.terminate).toHaveBeenCalledOnce(); expect(mocks.destroy).toHaveBeenCalledOnce();
    progress.mockClear();
    mocks.createWorker.mock.calls[0][2].logger({ status: "recognizing text", progress: 1 });
    expect(progress).not.toHaveBeenCalled();
    expect(canvases[0].width).toBe(0);
  });

  it("cleans canvas, page, worker and document when rendering fails", async () => {
    mocks.render.mockImplementation(() => ({ promise: Promise.reject(new Error("Broken page")) }));
    await expect(extractOcrLinesFromPdf(file())).rejects.toThrow("Broken page");
    expect(mocks.cleanup).toHaveBeenCalledOnce(); expect(mocks.terminate).toHaveBeenCalledOnce();
    expect(mocks.destroy).toHaveBeenCalledOnce(); expect(canvases[0].width).toBe(0);
  });

  it("cancels a running OCR operation", async () => {
    const controller = new AbortController();
    mocks.recognize.mockReturnValue(new Promise(() => {}));
    const assertion = expect(extractOcrLinesFromPdf(file(), { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(mocks.recognize).toHaveBeenCalledOnce());
    controller.abort(); await assertion;
    expect(mocks.terminate).toHaveBeenCalledOnce(); expect(mocks.destroy).toHaveBeenCalledOnce();
  });
});
