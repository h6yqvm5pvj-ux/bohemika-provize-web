import type { User } from "firebase/auth";
import type { CashflowSnapshot } from "./computeCashflow";
import type { CashflowViewOptions } from "./buildCashflowView";
import type { CashflowCommissionStatementSummary, CashflowItem, MonthGroup } from "./types";
import {
  parseCashflowCandidateCheckResult,
  parseCashflowServerTiming,
  parseCashflowShadowResult,
  type CashflowCandidateCheckResult,
  type CashflowServerTiming,
} from "./candidateCheckProtocol";
import {
  CASHFLOW_SHADOW_VERSION,
  CASHFLOW_SHADOW_MAX_AGE_MS,
  CASHFLOW_SHADOW_MAX_ITEMS,
  isCashflowShadowContextCurrent,
  hashCashflowValue,
  type CashflowShadowRequest,
  type CashflowShadowResult,
} from "./shadowProtocol";

const lastAttempts = new Map<string, number>();

type RequestMeasurement = { requestMs: number; serverTimingMs: CashflowServerTiming };
type DiagnosticSummary = {
  version: typeof CASHFLOW_SHADOW_VERSION;
  shadow: RequestMeasurement & Pick<CashflowShadowResult, "status" | "candidate" | "reason">;
  check?: RequestMeasurement & Pick<CashflowCandidateCheckResult, "status" | "reason">;
};

const requestMeasurement = (response: Response, startedAt: number): RequestMeasurement => ({
  requestMs: Math.max(0, Math.round((performance.now() - startedAt) * 1000) / 1000),
  serverTimingMs: parseCashflowServerTiming(response.headers.get("Server-Timing")),
});

function saveDiagnosticSummary(summary: DiagnosticSummary): void {
  try { sessionStorage.setItem("cashflow_shadow_last_result", JSON.stringify(summary)); }
  catch { /* Diagnostics must remain optional when browser storage is unavailable. */ }
}

export async function reportCashflowShadow({
  user, snapshot, statements, items, months, options, asOf, signal,
}: {
  user: User;
  snapshot: CashflowSnapshot;
  statements: CashflowCommissionStatementSummary[];
  items: CashflowItem[];
  months: MonthGroup[];
  options: CashflowViewOptions;
  asOf: Date;
  signal: AbortSignal;
}): Promise<CashflowShadowResult | null> {
  const accountUid = user.uid;
  const accountEmail = snapshot.email;
  const asOfMs = asOf.getTime();
  const unavailable = () => signal.aborted || document.visibilityState !== "visible" ||
    user.uid !== accountUid || snapshot.email !== accountEmail ||
    accountEmail !== user.email?.trim().toLowerCase() || asOf.getTime() !== asOfMs ||
    !isCashflowShadowContextCurrent(asOfMs);
  // The first browser pilot verifies the signed-in account only. The global
  // impersonation transport does not enable this diagnostic POST route.
  if (unavailable() || items.length > CASHFLOW_SHADOW_MAX_ITEMS) return null;
  const key = `${user.uid}:${snapshot.email}`;
  const now = Date.now();
  if (now - (lastAttempts.get(key) ?? -Infinity) < CASHFLOW_SHADOW_MAX_AGE_MS) return null;
  // Bound both local hashing and server rereads even when navigating/filtering.
  for (const [oldKey, time] of lastAttempts) {
    if (now - time >= CASHFLOW_SHADOW_MAX_AGE_MS) lastAttempts.delete(oldKey);
  }
  lastAttempts.set(key, now);

  try {
    const [inputHash, itemsHash, monthsHash] = await Promise.all([
      hashCashflowValue({ snapshot, statements }), hashCashflowValue(items), hashCashflowValue(months),
    ]);
    if (unavailable()) return null;
    const body: CashflowShadowRequest = {
      version: CASHFLOW_SHADOW_VERSION,
      asOfMs,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      inputHash, itemsHash, monthsHash, options,
    };
    // Both diagnostic calls use the exact same context and fingerprints.
    const serializedBody = JSON.stringify(body);
    const request = async (path: string, refreshToken = false) => {
      if (unavailable()) return null;
      const token = await user.getIdToken(refreshToken);
      // Token acquisition can outlive navigation, tab visibility or context.
      if (unavailable()) return null;
      return fetch(path, {
        method: "POST", body: serializedBody, signal, cache: "no-store",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
    };
    const shadowStartedAt = performance.now();
    let response = await request("/api/cashflow/shadow");
    if (response?.status === 401) response = await request("/api/cashflow/shadow", true);
    if (!response?.ok) return null;
    const result = parseCashflowShadowResult(await response.json());
    if (!result || unavailable()) return null;
    const summary: DiagnosticSummary = {
      version: CASHFLOW_SHADOW_VERSION,
      shadow: {
        status: result.status,
        ...(result.candidate !== undefined ? { candidate: result.candidate } : {}),
        ...(result.reason !== undefined ? { reason: result.reason } : {}),
        ...requestMeasurement(response, shadowStartedAt),
      },
    };
    if (result.status === "match" && result.candidate === "verified") {
      try {
        const checkStartedAt = performance.now();
        const checkResponse = await request("/api/cashflow/candidate-check");
        if (checkResponse?.ok) {
          const check = parseCashflowCandidateCheckResult(await checkResponse.json());
          if (check && !unavailable()) summary.check = {
            status: check.status,
            ...(check.reason !== undefined ? { reason: check.reason } : {}),
            ...requestMeasurement(checkResponse, checkStartedAt),
          };
        }
      } catch { /* One optional replay: no retries and no calculation fallback. */ }
    }
    if (unavailable()) return null;
    saveDiagnosticSummary(summary);
    return result;
  } catch {
    return null;
  }
}
