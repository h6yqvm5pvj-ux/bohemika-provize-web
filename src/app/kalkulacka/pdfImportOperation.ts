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
    error.name = "PdfImportTimeoutError";
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
