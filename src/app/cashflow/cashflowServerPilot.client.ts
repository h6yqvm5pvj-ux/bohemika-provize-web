import type { CashflowWorkerClient } from "./cashflowWorker.client";
import type { CashflowDataset, CashflowVerification } from "./cashflowWorker.types";
import type { CashflowViewOptions } from "./buildCashflowView";
import { CASHFLOW_SERVER_PILOT_VERSION, parseCashflowServerFallbackReason, parseCashflowServerResourceLimit, type CashflowServerFallbackReason, type CashflowServerRequest, type CashflowServerResourceLimit } from "./cashflowServerProtocol";
import { parseCashflowSnapshot } from "./cashflowSnapshotWire";
import { CASHFLOW_SHADOW_MAX_AGE_MS, cashflowCanonicalJson, isCashflowShadowContextCurrent } from "./shadowProtocol";
import { parseCashflowServerTiming, type CashflowServerTiming } from "./candidateCheckProtocol";

export type CashflowServerPilotMeasurement = {
  kind: "view" | "month";
  status: "match" | "mismatch" | "unavailable";
  requestMs: number;
  referenceMs: number;
  serverTimingMs: CashflowServerTiming;
  reason?: CashflowServerFallbackReason;
  httpStatus?: number;
  timeoutPhase?: "verification" | "token" | "request" | "response";
  resourceLimit?: CashflowServerResourceLimit;
};

class PilotUnavailable extends Error {
  constructor(readonly reason: CashflowServerFallbackReason, readonly httpStatus?: number,
    readonly serverTimingMs: CashflowServerTiming = {},
    readonly timeoutPhase?: CashflowServerPilotMeasurement["timeoutPhase"],
    readonly resourceLimit?: CashflowServerResourceLimit) { super("Cashflow server unavailable"); }
}

function recordMeasurement(value: CashflowServerPilotMeasurement) {
  try { sessionStorage.setItem("cashflow_server_pilot_last_result", JSON.stringify(value)); }
  catch { /* Diagnostic storage must not affect the displayed result. */ }
}

const aborted = () => new DOMException("Cashflow selection changed", "AbortError");
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * Read-only comparison in the background. The original result is displayed as
 * soon as it is ready. A match requires the complete reference, including the
 * worker hash of every month/item; it never publishes unverified server values.
 */
export function createCashflowServerPilotClient({ dataset, local, createLocal, getToken, request = fetch,
  measure = recordMeasurement, timeoutMs = 25_000 }: {
  dataset: CashflowDataset;
  local: CashflowWorkerClient;
  createLocal: (dataset: CashflowDataset) => CashflowWorkerClient;
  getToken: () => Promise<string>;
  request?: typeof fetch;
  measure?: (value: CashflowServerPilotMeasurement) => void;
  timeoutMs?: number;
}): CashflowWorkerClient {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60_000) throw new RangeError("Invalid pilot timeout");
  let revision = 0;
  let disposed = false;
  const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
  type Context = { dataset: CashflowDataset; local: CashflowWorkerClient; timeZone: string };
  let context: Context = { dataset, local, timeZone: timeZone() };
  const contextCurrent = (value: Context, nowMs = Date.now()) =>
    value.timeZone === timeZone() && isCashflowShadowContextCurrent(value.dataset.asOf.getTime(), nowMs);
  const refreshContext = () => {
    const nowMs = Date.now();
    // Leave time for local calculation and the complete background deadline.
    // Renew the model too: changing only the outgoing timestamp would compare
    // results computed for different dates (especially across midnight).
    if (contextCurrent(context, nowMs) &&
      Math.abs(nowMs - context.dataset.asOf.getTime()) <= CASHFLOW_SHADOW_MAX_AGE_MS - timeoutMs - 10_000) return;
    const refreshed = { ...dataset, asOf: new Date(nowMs) };
    const next = { dataset: refreshed, local: createLocal(refreshed), timeZone: timeZone() };
    context.local.dispose();
    context = next;
  };
  type Job = {
    revision: number;
    controller: AbortController;
    scheduled: ReturnType<typeof setTimeout> | null;
    phase: NonNullable<CashflowServerPilotMeasurement["timeoutPhase"]>;
    serverTimingMs: CashflowServerTiming;
    httpStatus?: number;
  };
  let comparison: Job | null = null;
  let selected: { revision: number; options: CashflowViewOptions; verification: CashflowVerification } | null = null;
  const current = (expected: number) => !disposed && expected === revision;
  const checkCurrent = (expected: number) => { if (!current(expected)) throw aborted(); };
  const jobCurrent = (job: Job) => current(job.revision) && comparison === job;
  const checkJob = (job: Job) => { if (!jobCurrent(job) || job.controller.signal.aborted) throw aborted(); };
  const cancelComparison = () => {
    const previous = comparison;
    comparison = null;
    if (!previous) return;
    if (previous.scheduled !== null) clearTimeout(previous.scheduled);
    previous.controller.abort();
  };
  const report = (kind: CashflowServerRequest["kind"], status: CashflowServerPilotMeasurement["status"], start: number,
    referenceMs: number, serverTimingMs: CashflowServerTiming = {}, reason?: CashflowServerFallbackReason, httpStatus?: number,
    timeoutPhase?: CashflowServerPilotMeasurement["timeoutPhase"], resourceLimit?: CashflowServerResourceLimit) => {
    try { measure({ kind, status, requestMs: Math.max(0, performance.now() - start), referenceMs, serverTimingMs,
      ...(reason ? { reason } : {}), ...(httpStatus ? { httpStatus } : {}), ...(timeoutPhase ? { timeoutPhase } : {}),
      ...(reason === "resource_limit" && resourceLimit ? { resourceLimit } : {}) }); }
    catch { /* No telemetry failure may replace the reference result. */ }
  };
  const reportFailure = (kind: CashflowServerRequest["kind"], error: unknown, start: number, referenceMs: number) => {
    const failure = error instanceof PilotUnavailable ? error : new PilotUnavailable("unavailable");
    report(kind, "unavailable", start, referenceMs, failure.serverTimingMs, failure.reason, failure.httpStatus, failure.timeoutPhase, failure.resourceLimit);
  };
  const startComparison = (expected: number, kind: CashflowServerRequest["kind"], referenceMs: number,
    work: (job: Job, start: number) => Promise<void>) => {
    cancelComparison();
    const job: Job = { revision: expected, controller: new AbortController(), scheduled: null,
      phase: kind === "view" ? "verification" : "token", serverTimingMs: {} };
    comparison = job;
    // Let the reference promise settle before even starting hashing or auth.
    job.scheduled = setTimeout(() => {
      job.scheduled = null;
      if (!jobCurrent(job)) return;
      const start = performance.now();
      let timedOut = false;
      const stopped = new Promise<never>((_resolve, reject) => {
        job.controller.signal.addEventListener("abort", () => reject(timedOut
          ? new PilotUnavailable("timeout", job.httpStatus, job.serverTimingMs, job.phase) : aborted()), { once: true });
      });
      const timer = setTimeout(() => { timedOut = true; job.controller.abort(); }, timeoutMs);
      void (async () => {
        try { await Promise.race([work(job, start), stopped]); }
        catch (error) {
          if (!jobCurrent(job)) return;
          if (kind === "month") selected = null;
          reportFailure(kind, error, start, referenceMs);
        } finally {
          clearTimeout(timer);
          if (comparison === job) comparison = null;
          job.controller.abort();
        }
      })();
    }, 0);
  };
  const read = async (body: CashflowServerRequest, job: Job, referenceContext: Context): Promise<{ value: Record<string, unknown>; serverTimingMs: CashflowServerTiming }> => {
    checkJob(job);
    if (!contextCurrent(referenceContext)) throw new PilotUnavailable("stale_context");
    job.phase = "token";
    const token = await getToken();
    checkJob(job);
    if (!contextCurrent(referenceContext)) throw new PilotUnavailable("stale_context");
    if (!token) throw aborted();
    job.phase = "request";
    const response = await request("/api/cashflow/view", {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: job.controller.signal, cache: "no-store",
    });
    checkJob(job);
    job.phase = "response";
    const serverTimingMs = parseCashflowServerTiming(response.headers.get("Server-Timing"));
    job.serverTimingMs = serverTimingMs;
    job.httpStatus = response.status;
    const value: unknown = await response.json().catch(() => null);
    checkJob(job);
    if (!response.ok) {
      const reason = (object(value) && parseCashflowServerFallbackReason(value.reason)) || "http";
      const resourceLimit = reason === "resource_limit" && object(value)
        ? parseCashflowServerResourceLimit(value.resourceLimit) ?? undefined : undefined;
      throw new PilotUnavailable(reason, response.status, serverTimingMs, undefined, resourceLimit);
    }
    if (!object(value) || value.ok !== true || value.version !== CASHFLOW_SERVER_PILOT_VERSION ||
      value.kind !== body.kind || value.inputHash !== body.inputHash) throw new PilotUnavailable("invalid_response", response.status, serverTimingMs);
    return { value, serverTimingMs };
  };
  const bodyFor = (referenceContext: Context, kind: CashflowServerRequest["kind"], options: CashflowViewOptions, verification: CashflowVerification, monthKey?: string): CashflowServerRequest => ({
    version: CASHFLOW_SERVER_PILOT_VERSION, kind, options,
    asOfMs: referenceContext.dataset.asOf.getTime(), timeZone: referenceContext.timeZone,
    inputHash: verification.inputHash, ...(monthKey ? { monthKey } : {}),
  });

  return {
    get executionPath() { return disposed ? "disposed" : context.local.executionPath; },
    async view(options) {
      if (disposed) throw aborted();
      const expected = ++revision;
      selected = null;
      cancelComparison();
      refreshContext();
      const referenceContext = context;
      const copiedOptions = { ...options };
      // Failure of the reference itself follows the existing UI error path.
      const referenceStart = performance.now();
      const reference = await referenceContext.local.view(copiedOptions);
      const referenceMs = Math.max(0, performance.now() - referenceStart);
      checkCurrent(expected);
      startComparison(expected, "view", referenceMs, async (job, start) => {
        if (!referenceContext.local.verification) throw new PilotUnavailable("verification");
        const verification = await referenceContext.local.verification().catch(() => { throw new PilotUnavailable("verification"); });
        checkJob(job);
        const { value, serverTimingMs } = await read(bodyFor(referenceContext, "view", copiedOptions, verification), job, referenceContext);
        checkJob(job);
        if (value.monthsHash !== verification.monthsHash ||
          cashflowCanonicalJson(value.overview) !== cashflowCanonicalJson(reference)) {
          report("view", "mismatch", start, referenceMs, serverTimingMs, "different_result");
          return;
        }
        selected = { revision: expected, options: copiedOptions, verification };
        report("view", "match", start, referenceMs, serverTimingMs);
      });
      return reference;
    },
    async month(key) {
      if (disposed) throw aborted();
      const expected = revision;
      const selection = selected;
      // A detail belongs to the displayed overview. Never silently replace its
      // model/date; an expired comparison remains unavailable until a new view.
      const referenceContext = context;
      const referenceStart = performance.now();
      const reference = await referenceContext.local.month(key);
      const referenceMs = Math.max(0, performance.now() - referenceStart);
      checkCurrent(expected);
      if (!selection || selection.revision !== expected) return reference;
      startComparison(expected, "month", referenceMs, async (job, start) => {
        const { value, serverTimingMs } = await read(bodyFor(referenceContext, "month", selection.options, selection.verification, key), job, referenceContext);
        checkJob(job);
        const parsed = parseCashflowSnapshot(value.payload);
        const month = parsed?.months[0] ?? null;
        if (!parsed || parsed.items.length !== 0 || parsed.months.length > 1 || value.monthKey !== key ||
          (month && month.key !== key) || value.monthsHash !== selection.verification.monthsHash ||
          cashflowCanonicalJson(month) !== cashflowCanonicalJson(reference)) {
          selected = null;
          report("month", "mismatch", start, referenceMs, serverTimingMs, "different_result");
          return;
        }
        report("month", "match", start, referenceMs, serverTimingMs);
      });
      return reference;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      selected = null;
      cancelComparison();
      context.local.dispose();
    },
  };
}
