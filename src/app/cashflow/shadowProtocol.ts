import type { CashflowViewOptions } from "./buildCashflowView";

export const CASHFLOW_SHADOW_VERSION = "cashflow-shadow-v2";
export const CASHFLOW_SHADOW_MAX_INPUT_BYTES = 16 * 1024 * 1024;
export const CASHFLOW_SHADOW_MAX_AGE_MS = 5 * 60 * 1000;
export const CASHFLOW_SHADOW_MAX_ITEMS = 25_000;

export function isCashflowShadowContextCurrent(asOfMs: number, nowMs = Date.now()): boolean {
  if (!Number.isFinite(asOfMs) || Math.abs(nowMs - asOfMs) > CASHFLOW_SHADOW_MAX_AGE_MS) return false;
  const asOf = new Date(asOfMs);
  const now = new Date(nowMs);
  return asOf.getFullYear() === now.getFullYear() && asOf.getMonth() === now.getMonth() && asOf.getDate() === now.getDate();
}

export type CashflowShadowRequest = {
  version: typeof CASHFLOW_SHADOW_VERSION;
  asOfMs: number;
  timeZone: string;
  inputHash: string;
  itemsHash: string;
  monthsHash: string;
  options: CashflowViewOptions;
};

export type CashflowShadowResult = {
  ok: true;
  status: "match" | "mismatch" | "skipped";
  reason?: "disabled" | "time_zone" | "stale_context" | "different_inputs" | "incomplete_inputs" | "unavailable" | "resource_limit";
  itemsMatch?: boolean;
  monthsMatch?: boolean;
  /** Diagnostic persistence check only; never permission to serve cached amounts. */
  candidate?: "verified" | "not_stored" | "revision_changed" | "storage_mismatch";
};

const productFilters = new Set([
  "pension", "all", "tip", "subscription", "life", "auto", "property",
  "entrepreneurs", "travel", "foreigners", "gold",
]);
const hashPattern = /^[a-f0-9]{64}$/;

export function parseCashflowShadowRequest(value: unknown): CashflowShadowRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const request = value as Record<string, unknown>;
  const rawOptions = request.options;
  if (!rawOptions || typeof rawOptions !== "object" || Array.isArray(rawOptions)) return null;
  const options = rawOptions as Record<string, unknown>;
  if (
    request.version !== CASHFLOW_SHADOW_VERSION ||
    typeof request.asOfMs !== "number" || !Number.isSafeInteger(request.asOfMs) ||
    request.asOfMs <= 0 || !Number.isFinite(new Date(request.asOfMs).getTime()) ||
    typeof request.timeZone !== "string" || request.timeZone.length > 100 ||
    !request.timeZone ||
    ![request.inputHash, request.itemsHash, request.monthsHash].every(
      (hash) => typeof hash === "string" && hashPattern.test(hash),
    ) ||
    typeof options.scopeFilter !== "string" || !["combined", "own", "team"].includes(options.scopeFilter) ||
    typeof options.productFilter !== "string" || !productFilters.has(options.productFilter) ||
    typeof options.tipsterMode !== "boolean" ||
    typeof options.showPastYears !== "boolean" ||
    typeof options.intelligentPredictionEnabled !== "boolean" ||
    typeof options.contractNumberQuery !== "string" || options.contractNumberQuery.length > 128
  ) return null;
  // Whitelist fields; never accept client identities or calculation inputs.
  return {
    version: CASHFLOW_SHADOW_VERSION,
    asOfMs: request.asOfMs,
    timeZone: request.timeZone,
    inputHash: request.inputHash as string,
    itemsHash: request.itemsHash as string,
    monthsHash: request.monthsHash as string,
    options: {
      scopeFilter: options.scopeFilter as CashflowViewOptions["scopeFilter"],
      productFilter: options.productFilter as CashflowViewOptions["productFilter"],
      tipsterMode: options.tipsterMode,
      showPastYears: options.showPastYears,
      intelligentPredictionEnabled: options.intelligentPredictionEnabled,
      contractNumberQuery: options.contractNumberQuery,
    },
  };
}

// Deterministic JSON across browser and Node, retaining order, duplicates,
// amounts and all provenance. Invalid numbers must never hash as a valid null.
export function cashflowCanonicalJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (item instanceof Date) {
      if (!Number.isFinite(item.getTime())) throw new Error("Invalid cashflow date");
      return item.toISOString();
    }
    if (typeof item === "number" && !Number.isFinite(item)) throw new Error("Invalid cashflow number");
    if (item === null || typeof item !== "object") {
      if (["function", "symbol", "bigint"].includes(typeof item)) throw new Error("Invalid cashflow value");
      return item;
    }
    if (Array.isArray(item)) return item.map(normalize);
    return Object.fromEntries(Object.keys(item).sort().map(
      (key) => [key, normalize((item as Record<string, unknown>)[key])],
    ));
  };
  const json = JSON.stringify(normalize(value));
  if (json === undefined) throw new Error("Missing cashflow input");
  return json;
}

export async function hashCashflowValue(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(cashflowCanonicalJson(value));
  if (bytes.length > CASHFLOW_SHADOW_MAX_INPUT_BYTES) throw new Error("Cashflow shadow input too large");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
