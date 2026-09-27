import { computeExpectedPayout } from "./expectedPayout";
import type { CashflowDataset } from "@/app/cashflow/cashflowWorker.types";

self.addEventListener("message", ({ data }: MessageEvent<CashflowDataset>) => {
  try { self.postMessage({ ok: true, result: computeExpectedPayout(data) }); }
  catch { self.postMessage({ ok: false }); }
});
