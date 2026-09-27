import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withPdfImportTimeout } from "./pdfImportOperation";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
describe("PDF import deadlines", () => {
  it("aborts the underlying reader when the deadline expires", async () => {
    let signal!: AbortSignal;
    const pending = withPdfImportTimeout(s => { signal = s; return new Promise(() => {}); }, 8000, "Too slow");
    const rejected = expect(pending).rejects.toMatchObject({ name: "PdfImportTimeoutError", message: "Too slow" });
    await vi.advanceTimersByTimeAsync(8000); await rejected;
    expect(signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("allows OCR more time but still cancels it at the final deadline", async () => {
    let signal!: AbortSignal;
    const pending = withPdfImportTimeout(s => { signal = s; return new Promise(() => {}); }, 8000, "OCR too slow", () => true);
    const rejected = expect(pending).rejects.toMatchObject({ name: "PdfImportTimeoutError" });
    await vi.advanceTimersByTimeAsync(8000);
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(112000); await rejected;
    expect(signal.aborted).toBe(true);
  });
  it("cancels immediately when the import is replaced or the page unmounts", async () => {
    const controller = new AbortController();
    let signal!: AbortSignal;
    const pending = withPdfImportTimeout(s => { signal = s; return new Promise(() => {}); }, 8000, "Too slow", undefined, controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    controller.abort(); await rejected;
    expect(signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("does not start an already cancelled import", async () => {
    const operation = vi.fn();
    await expect(withPdfImportTimeout(operation, 8000, "Too slow", undefined, AbortSignal.abort())).rejects.toMatchObject({ name: "AbortError" });
    expect(operation).not.toHaveBeenCalled();
  });
  it("clears deadlines after successful completion", async () => {
    await expect(withPdfImportTimeout(async () => "done", 8000, "Too slow")).resolves.toBe("done");
    expect(vi.getTimerCount()).toBe(0);
  });
});
