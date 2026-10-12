import type { CashflowShadowResult } from "./shadowProtocol";

export type CashflowCandidateCheckResult = {
  ok: true;
  status: "match" | "mismatch" | "miss" | "skipped";
  itemsMatch?: boolean;
  monthsMatch?: boolean;
  reason?: "disabled" | "time_zone" | "stale_context" | "different_inputs" | "unavailable";
};

const checkReasons = new Set(["disabled", "time_zone", "stale_context", "different_inputs", "unavailable"]);
const shadowReasons = new Set([...checkReasons, "incomplete_inputs", "resource_limit"]);
const candidates = new Set(["verified", "not_stored", "revision_changed", "storage_mismatch"]);

const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

function comparisonMatchesStatus(value: Record<string, unknown>): boolean {
  return typeof value.itemsMatch === "boolean" && typeof value.monthsMatch === "boolean" &&
    (value.status === "match" ? value.itemsMatch && value.monthsMatch : !(value.itemsMatch && value.monthsMatch));
}

/** Reject inconsistent comparisons and discard every unrecognized field. */
export function parseCashflowShadowResult(value: unknown): CashflowShadowResult | null {
  const result = object(value);
  if (!result || result.ok !== true) return null;
  if (result.status === "skipped") {
    if (typeof result.reason !== "string" || !shadowReasons.has(result.reason) || result.candidate != null) return null;
    return { ok: true, status: "skipped", reason: result.reason as CashflowShadowResult["reason"] };
  }
  if (typeof result.status !== "string" || !["match", "mismatch"].includes(result.status) || !comparisonMatchesStatus(result)) return null;
  if (result.candidate !== undefined && (typeof result.candidate !== "string" || !candidates.has(result.candidate))) return null;
  if (result.candidate === "verified" && result.status !== "match") return null;
  return {
    ok: true,
    status: result.status as "match" | "mismatch",
    itemsMatch: result.itemsMatch as boolean,
    monthsMatch: result.monthsMatch as boolean,
    ...(result.candidate !== undefined ? { candidate: result.candidate as CashflowShadowResult["candidate"] } : {}),
  };
}

export function parseCashflowCandidateCheckResult(value: unknown): CashflowCandidateCheckResult | null {
  const result = object(value);
  if (!result || result.ok !== true) return null;
  if (result.status === "miss") return { ok: true, status: "miss" };
  if (result.status === "skipped") {
    if (typeof result.reason !== "string" || !checkReasons.has(result.reason)) return null;
    return { ok: true, status: "skipped", reason: result.reason as CashflowCandidateCheckResult["reason"] };
  }
  if (typeof result.status !== "string" || !["match", "mismatch"].includes(result.status) || !comparisonMatchesStatus(result)) return null;
  return {
    ok: true,
    status: result.status as "match" | "mismatch",
    itemsMatch: result.itemsMatch as boolean,
    monthsMatch: result.monthsMatch as boolean,
  };
}

export const CASHFLOW_CONTRACT_TIMING_PHASES = [
  "identity", "team_context", "subscription", "count", "entries", "response",
] as const;
export type CashflowContractTimingPhase = typeof CASHFLOW_CONTRACT_TIMING_PHASES[number];

export const CASHFLOW_INPUT_TIMING_NAMES = [
  "cashflow_inputs_profile", "cashflow_inputs_own_contracts", "cashflow_inputs_team_contracts",
  "cashflow_inputs_tips", "cashflow_inputs_subscriptions", "cashflow_inputs_statements",
  "cashflow_inputs_own_contracts_identity", "cashflow_inputs_own_contracts_team_context",
  "cashflow_inputs_own_contracts_subscription", "cashflow_inputs_own_contracts_count",
  "cashflow_inputs_own_contracts_entries", "cashflow_inputs_own_contracts_response",
  "cashflow_inputs_team_contracts_identity", "cashflow_inputs_team_contracts_team_context",
  "cashflow_inputs_team_contracts_subscription", "cashflow_inputs_team_contracts_count",
  "cashflow_inputs_team_contracts_entries", "cashflow_inputs_team_contracts_response",
] as const;
export type CashflowInputTimingName = typeof CASHFLOW_INPUT_TIMING_NAMES[number];
const timingNames = ["cashflow_total", "cashflow_auth", "cashflow_inputs", "cashflow_compute", "cashflow_hash", "cashflow_storage",
  ...CASHFLOW_INPUT_TIMING_NAMES] as const;
export type CashflowServerTiming = Partial<Record<typeof timingNames[number], number>>;

/** Only numerical duration aggregates may reach diagnostic session storage. */
export function parseCashflowServerTiming(header: string | null): CashflowServerTiming {
  const timings: CashflowServerTiming = {};
  if (!header || header.length > 8192) return timings;
  const seen = new Set<string>();
  for (const metric of header.split(",")) {
    const [rawName, ...parameters] = metric.split(";");
    const name = rawName.trim() as typeof timingNames[number];
    if (!timingNames.includes(name)) continue;
    if (seen.has(name)) { delete timings[name]; continue; }
    seen.add(name);
    const durations = parameters.map(parameter => parameter.trim()).filter(parameter => parameter.startsWith("dur="));
    if (durations.length !== 1 || !/^dur=(?:\d+(?:\.\d+)?|\.\d+)$/.test(durations[0])) continue;
    const value = Number(durations[0].slice(4));
    if (Number.isFinite(value) && value >= 0 && value <= 3_600_000) timings[name] = value;
  }
  return timings;
}
