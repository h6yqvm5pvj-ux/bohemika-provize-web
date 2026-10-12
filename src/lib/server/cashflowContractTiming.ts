import type { CashflowContractTimingPhase } from "@/app/cashflow/candidateCheckProtocol";

/** Trusted server-only observer; never receives identities, requests or records. */
export type CashflowContractTimingObserver = (phase: CashflowContractTimingPhase, durationMs: number) => void;

export async function measureCashflowContractPhase<T>(
  observer: CashflowContractTimingObserver | undefined,
  phase: CashflowContractTimingPhase,
  work: () => T | Promise<T>
): Promise<T> {
  if (!observer) return work();
  const started = performance.now();
  try {
    return await work();
  } finally {
    try { observer(phase, Math.max(0, performance.now() - started)); }
    catch { /* Optional telemetry cannot change results or conceal authorization errors. */ }
  }
}
