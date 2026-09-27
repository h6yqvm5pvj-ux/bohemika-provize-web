import type { CashflowDataset } from "@/app/cashflow/cashflowWorker.types";
import type { ExpectedPayout } from "./expectedPayout";

const defaultFactory = () => new Worker(new URL("./expectedPayout.worker.ts", import.meta.url), { type: "module" });
type Port = Pick<Worker, "postMessage" | "addEventListener" | "removeEventListener" | "terminate">;

/** Transfer only three totals back to the UI; disposing a request also stops its worker. */
export function calculateExpectedPayout(dataset: CashflowDataset, signal: AbortSignal, createWorker: () => Port = defaultFactory): Promise<ExpectedPayout> {
  return new Promise((resolve, reject) => {
    let worker: Port | null = null;
    let finished = false;
    let fallback = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stopWorker = () => {
      clearTimeout(timer);
      if (!worker) return;
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      worker.removeEventListener("messageerror", onError);
      worker.terminate();
      worker = null;
    };
    const finish = (result?: ExpectedPayout, error?: unknown) => {
      if (finished) return;
      finished = true;
      stopWorker();
      signal.removeEventListener("abort", onAbort);
      if (error) reject(error); else resolve(result!);
    };
    function onAbort() { finish(undefined, new DOMException("Výpočet byl zrušen.", "AbortError")); }
    function onError(event?: Event) {
      event?.preventDefault?.();
      if (finished || fallback) return;
      fallback = true;
      stopWorker();
      void import("./expectedPayout").then(({ computeExpectedPayout }) => {
        if (!finished) finish(computeExpectedPayout(dataset));
      }).catch(error => finish(undefined, error));
    }
    function onMessage(event: MessageEvent) {
      if (finished || fallback) return;
      const result = event.data?.result;
      if (event.data?.ok !== true || !result || ![result.grossAmount, result.stornoFundAmount, result.netAmount].every(Number.isFinite)) {
        onError(); return;
      }
      finish(result);
    }
    if (signal.aborted) { onAbort(); return; }
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      worker = createWorker();
      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", onError);
      worker.addEventListener("messageerror", onError);
      timer = setTimeout(onError, 8_000);
      worker.postMessage(dataset);
    } catch { onError(); }
  });
}
