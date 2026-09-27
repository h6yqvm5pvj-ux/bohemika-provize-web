export const HOME_PERFORMANCE_STAGES = ["production", "productionTip", "leaderboard", "payoutInputs", "payoutCalculation", "payout"] as const;
export type HomePerformanceStage = typeof HOME_PERFORMANCE_STAGES[number];
export type HomePerformanceSample = {
  stage: HomePerformanceStage;
  durationMs: number;
  outcome: "success" | "error" | "cancelled";
  device: "mobile" | "desktop";
};

/** Fixed schema: no URLs, account identifiers, amounts or arbitrary error text. */
export function parseHomePerformance(value: unknown): HomePerformanceSample[] | null {
  if (!value || typeof value !== "object") return null;
  const body = value as { version?: unknown; samples?: unknown };
  if (body.version !== 1 || !Array.isArray(body.samples) || body.samples.length < 1 || body.samples.length > 20) return null;
  const samples: HomePerformanceSample[] = [];
  for (const raw of body.samples) {
    if (!raw || typeof raw !== "object" || Object.keys(raw).some(key => !["stage", "durationMs", "outcome", "device"].includes(key))) return null;
    const sample = raw as HomePerformanceSample;
    if (!HOME_PERFORMANCE_STAGES.includes(sample.stage) || !Number.isSafeInteger(sample.durationMs)
      || sample.durationMs < 0 || sample.durationMs > 180_000 || !["success", "error", "cancelled"].includes(sample.outcome)
      || !["mobile", "desktop"].includes(sample.device)) return null;
    samples.push({ stage: sample.stage, durationMs: sample.durationMs, outcome: sample.outcome, device: sample.device });
  }
  return samples;
}
