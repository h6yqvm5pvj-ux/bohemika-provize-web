import {
  CASHFLOW_SHADOW_VERSION,
  parseCashflowShadowRequest,
} from "./shadowProtocol";
import type { CashflowViewOptions } from "./buildCashflowView";

export const CASHFLOW_SERVER_PILOT_VERSION = "cashflow-server-pilot-v1";
const unusedHash = "0".repeat(64);

const fallbackReasons = ["time_zone", "stale_context", "different_inputs", "incomplete_inputs",
  "resource_limit", "cancelled", "unavailable", "http", "timeout", "verification",
  "invalid_response", "different_result"] as const;
export type CashflowServerFallbackReason = typeof fallbackReasons[number];

const resourceLimits = ["input_requests", "source_rows", "output_estimate", "payout_matching",
  "nested_rows", "entry_shape", "date_range", "duration", "reference_time"] as const;
export type CashflowServerResourceLimit = typeof resourceLimits[number];

/** A fixed code only: no source fields, identifiers or rejected values. */
export function parseCashflowServerResourceLimit(value: unknown): CashflowServerResourceLimit | null {
  return typeof value === "string" && resourceLimits.includes(value as CashflowServerResourceLimit)
    ? value as CashflowServerResourceLimit : null;
}

/** Diagnostic codes only: never copy an upstream message into client storage. */
export function parseCashflowServerFallbackReason(value: unknown): CashflowServerFallbackReason | null {
  return typeof value === "string" && fallbackReasons.includes(value as CashflowServerFallbackReason)
    ? value as CashflowServerFallbackReason : null;
}

export type CashflowServerRequest = {
  version: typeof CASHFLOW_SERVER_PILOT_VERSION;
  kind: "view" | "month";
  asOfMs: number;
  timeZone: string;
  options: CashflowViewOptions;
  /** Expected source fingerprint for this pilot, never an authorization credential. */
  inputHash: string;
  monthKey?: string;
};

export function parseCashflowServerRequest(value: unknown): CashflowServerRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.version !== CASHFLOW_SERVER_PILOT_VERSION || (raw.kind !== "view" && raw.kind !== "month")) return null;
  // Reuse the existing reviewed date/options/hash validator. The server accepts
  // no portfolio, account identity, role or client-calculated amounts.
  const validated = parseCashflowShadowRequest({
    version: CASHFLOW_SHADOW_VERSION, asOfMs: raw.asOfMs, timeZone: raw.timeZone,
    options: raw.options, inputHash: raw.inputHash, itemsHash: unusedHash, monthsHash: unusedHash,
  });
  if (!validated) return null;
  if (raw.kind === "month" && (typeof raw.monthKey !== "string" || !/^\d{4}-(?:0?[1-9]|1[0-2])$/.test(raw.monthKey))) return null;
  return {
    version: CASHFLOW_SERVER_PILOT_VERSION, kind: raw.kind as "view" | "month",
    asOfMs: validated.asOfMs, timeZone: validated.timeZone, options: validated.options,
    inputHash: validated.inputHash,
    ...(raw.kind === "month" ? { monthKey: raw.monthKey as string } : {}),
  };
}
