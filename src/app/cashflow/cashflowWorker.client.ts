import type { CashflowViewOptions } from "./buildCashflowView";
import type { CashflowDataset, CashflowModel, CashflowOverview } from "./cashflowWorker.types";
import type { MonthGroup } from "./types";

export type CashflowWorkerPort = Pick<Worker, "postMessage" | "addEventListener" | "removeEventListener" | "terminate">;
export type CashflowWorkerRequest =
  | { kind: "init"; id: 0; dataset: CashflowDataset }
  | { kind: "view"; id: number; revision: number; options: CashflowViewOptions }
  | { kind: "month"; id: number; revision: number; key: string }
  | { kind: "dispose" };
export type CashflowWorkerResponse =
  | { kind: "init"; id: 0; ok: true }
  | { kind: "view"; id: number; revision: number; ok: true; result: CashflowOverview }
  | { kind: "month"; id: number; revision: number; ok: true; result: MonthGroup | null }
  | { kind: string; id: number; ok: false };
export type CashflowWorkerClient = {
  view(options: CashflowViewOptions): Promise<CashflowOverview>;
  /** Only valid after the most recently requested view has completed. */
  month(key: string): Promise<MonthGroup | null>;
  dispose(): void;
  readonly executionPath: "pending" | "worker" | "fallback" | "disposed";
};

type Job = {
  id: number;
  revision: number;
  cancelled: boolean;
  options: CashflowViewOptions;
  reject(error: Error): void;
} & (
  | { kind: "view"; resolve(result: CashflowOverview): void }
  | { kind: "month"; key: string; resolve(result: MonthGroup | null): void }
);
type Active = Job | { kind: "init"; id: 0 };

const abortError = () => new DOMException("Cashflow request was cancelled", "AbortError");
const defaultFactory = () => new Worker(new URL("./cashflow.worker.ts", import.meta.url), { type: "module" });
const defaultFallback = async (dataset: CashflowDataset) =>
  (await import("./cashflowModel")).createCashflowModel(dataset);

/** One immutable dataset per client; replace and dispose it when sources change. */
export function createCashflowWorkerClient({ dataset, createWorker = defaultFactory,
  createFallbackModel = defaultFallback, timeoutMs = 8_000 }: {
  dataset: CashflowDataset;
  createWorker?: () => CashflowWorkerPort;
  createFallbackModel?: (dataset: CashflowDataset) => CashflowModel | Promise<CashflowModel>;
  timeoutMs?: number;
}): CashflowWorkerClient {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) {
    throw new RangeError("Invalid worker timeout");
  }
  let path: CashflowWorkerClient["executionPath"] = "pending";
  let worker: CashflowWorkerPort | null = null;
  let active: Active | null = null;
  let queued: Job | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let sequence = 0;
  let revision = 0;
  let readyRevision = 0;
  let latestOptions: CashflowViewOptions | null = null;
  let fallbackModel: CashflowModel | null = null;
  let fallbackLoading: Promise<CashflowModel> | null = null;
  let fallbackRevision = 0;

  const clearTimer = () => { if (timer !== null) clearTimeout(timer); timer = null; };
  const cancel = (job: Active | null) => {
    if (!job || job.kind === "init" || job.cancelled) return;
    job.cancelled = true;
    job.reject(abortError());
  };
  const current = (job: Job) => path !== "disposed" && !job.cancelled && job.revision === revision;
  const stopWorker = () => {
    const previous = worker;
    worker = null;
    clearTimer();
    if (!previous) return;
    try { previous.removeEventListener("message", onMessage); } catch { /* Best effort cleanup. */ }
    try { previous.removeEventListener("error", onFailure); } catch { /* Best effort cleanup. */ }
    try { previous.removeEventListener("messageerror", onFailure); } catch { /* Best effort cleanup. */ }
    try { previous.postMessage({ kind: "dispose" } satisfies CashflowWorkerRequest); } catch { /* Best effort cleanup. */ }
    try { previous.terminate(); } catch { /* Termination still attempted after protocol failure. */ }
  };
  const disposeModel = (model: CashflowModel) => { try { model.dispose(); } catch { /* No payload logging. */ } };
  const loadFallback = () => {
    if (!fallbackLoading) {
      fallbackLoading = Promise.resolve().then(() => createFallbackModel(dataset)).then(model => {
        if (path === "disposed") { disposeModel(model); throw abortError(); }
        fallbackModel = model;
        return model;
      });
    }
    return fallbackLoading;
  };
  const finishFallback = async (job: Job) => {
    try {
      const model = await loadFallback();
      if (!current(job)) return;
      if (job.kind === "view") {
        const result = model.view(job.options);
        fallbackRevision = job.revision;
        if (current(job)) { readyRevision = job.revision; job.resolve(result); }
      } else {
        // A worker may fail while opening a month after its view succeeded.
        if (fallbackRevision !== job.revision) {
          model.view(job.options);
          fallbackRevision = job.revision;
        }
        if (!current(job)) return;
        const result = model.month(job.key);
        if (current(job)) job.resolve(result);
      }
    } catch {
      if (current(job)) job.reject(new Error("Cashflow calculation failed"));
    } finally {
      if (active === job) active = null;
      drain();
    }
  };
  function onFailure(event?: Event) {
    event?.preventDefault?.();
    if (path === "disposed" || path === "fallback") return;
    path = "fallback";
    stopWorker();
    if (!queued && active?.kind !== "init" && active) queued = active;
    active = null;
    drain();
  }
  function onMessage(event: MessageEvent<unknown>) {
    if (path !== "worker" || !active) return;
    const raw = event.data;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) { onFailure(); return; }
    const response = raw as Record<string, unknown>;
    if (typeof response.id !== "number" || !Number.isSafeInteger(response.id) || response.id < 0 || response.id > active.id) {
      onFailure(); return;
    }
    if (response.id < active.id) return;
    if (response.kind !== active.kind || response.ok !== true) { onFailure(); return; }
    if (active.kind !== "init" && response.revision !== active.revision) { onFailure(); return; }
    if (active.kind === "view") {
      const result = response.result as CashflowOverview | null;
      if (!result || !Array.isArray(result.months) || !result.contractSearchStats ||
        typeof result.contractSearchStats.itemCount !== "number" || typeof result.contractSearchStats.contractCount !== "number") {
        onFailure(); return;
      }
      if (current(active)) { readyRevision = active.revision; active.resolve(result); }
    } else if (active.kind === "month") {
      const result = response.result as MonthGroup | null;
      if (result !== null && (!result || result.key !== active.key || !Array.isArray(result.items))) { onFailure(); return; }
      if (current(active) && readyRevision === active.revision) active.resolve(result);
    }
    clearTimer();
    active = null;
    drain();
  }
  const send = (request: Exclude<CashflowWorkerRequest, { kind: "dispose" }>) => {
    timer = setTimeout(() => { if (active?.id === request.id) onFailure(); }, timeoutMs);
    try { worker!.postMessage(request); } catch { onFailure(); }
  };
  function drain() {
    if (path === "disposed" || active || !queued) return;
    if (path === "pending") {
      try {
        worker = createWorker();
        worker.addEventListener("message", onMessage);
        worker.addEventListener("error", onFailure);
        worker.addEventListener("messageerror", onFailure);
        path = "worker";
        active = { kind: "init", id: 0 };
        send({ kind: "init", id: 0, dataset });
      } catch { onFailure(); }
      return;
    }
    const job = queued;
    queued = null;
    if (!current(job)) { drain(); return; }
    active = job;
    if (path === "fallback") { void finishFallback(job); return; }
    send(job.kind === "view"
      ? { kind: "view", id: job.id, revision: job.revision, options: job.options }
      : { kind: "month", id: job.id, revision: job.revision, key: job.key });
  }
  const enqueue = (job: Job) => {
    cancel(active);
    cancel(queued);
    queued = job;
    drain();
  };

  return {
    get executionPath() { return path; },
    view(options) {
      if (path === "disposed") return Promise.reject(abortError());
      revision += 1;
      readyRevision = 0;
      latestOptions = { ...options };
      return new Promise((resolve, reject) => enqueue({ kind: "view", id: ++sequence,
        revision, options: latestOptions!, cancelled: false, resolve, reject }));
    },
    month(key) {
      if (path === "disposed" || !latestOptions || readyRevision !== revision) return Promise.reject(abortError());
      return new Promise((resolve, reject) => enqueue({ kind: "month", id: ++sequence,
        revision, options: latestOptions!, key, cancelled: false, resolve, reject }));
    },
    dispose() {
      if (path === "disposed") return;
      path = "disposed";
      cancel(active);
      cancel(queued);
      active = queued = null;
      stopWorker();
      if (fallbackModel) { disposeModel(fallbackModel); fallbackModel = null; }
    },
  };
}
