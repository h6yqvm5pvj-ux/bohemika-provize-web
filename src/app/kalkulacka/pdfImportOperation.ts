export const PDF_PRODUCT_DETECTION_TIMEOUT_MS = 8_000;
export const PDF_DATA_IMPORT_TIMEOUT_MS = 15_000;
const PDF_IMPORT_TIMEOUT_ERROR_NAME = "PdfImportTimeoutError";

export const isPdfImportTimeoutError = (error: unknown): boolean =>
  error instanceof Error && error.name === PDF_IMPORT_TIMEOUT_ERROR_NAME;

/** A deadline owns an AbortSignal so timing out also stops the PDF/OCR worker. */
export async function withPdfImportTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
  isOcrActive?: () => boolean,
  parentSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectFailure!: (error: Error) => void;
  const failure = new Promise<never>((_, reject) => { rejectFailure = reject; });
  const abort = () => {
    rejectFailure(new DOMException("Načítání PDF bylo zrušeno.", "AbortError"));
    controller.abort();
  };
  const timeout = () => {
    const error = new Error(timeoutMessage);
    error.name = PDF_IMPORT_TIMEOUT_ERROR_NAME;
    rejectFailure(error);
    controller.abort();
  };
  if (parentSignal?.aborted) throw new DOMException("Načítání PDF bylo zrušeno.", "AbortError");
  parentSignal?.addEventListener("abort", abort, { once: true });
  timer = setTimeout(() => {
    if (isOcrActive?.()) timer = setTimeout(timeout, Math.max(1, 120_000 - timeoutMs));
    else timeout();
  }, timeoutMs);
  try {
    return await Promise.race([operation(controller.signal), failure]);
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener("abort", abort);
    controller.abort();
  }
}
