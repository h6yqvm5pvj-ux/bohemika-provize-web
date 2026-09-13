import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { createCashflowWorkerClient, type CashflowWorkerPort, type CashflowWorkerRequest } from "./cashflowWorker.client";
import type { CashflowDataset, CashflowModel, CashflowOverview } from "./cashflowWorker.types";
import type { CashflowViewOptions } from "./buildCashflowView";
import type { MonthGroup } from "./types";

const moduleMocks = vi.hoisted(() => ({ createModel: vi.fn() }));
vi.mock("./cashflowModel", () => ({ createCashflowModel: moduleMocks.createModel }));

const dataset = (): CashflowDataset => ({
  snapshot: { email: "advisor@example.test", myPosition: null, myCommissionMode: null,
    hasAnyTeam: false, ownEntries: [], teamEntriesRaw: [], tipPayouts: [], subscriptionPayments: [] },
  statements: [], asOf: new Date("2026-09-12T12:00:00Z"),
});
const options = (query = ""): CashflowViewOptions => ({ scopeFilter: "combined", productFilter: "all",
  tipsterMode: false, showPastYears: false, intelligentPredictionEnabled: false, contractNumberQuery: query });
const overview = (): CashflowOverview => ({ months: [], contractSearchStats: { itemCount: 0, contractCount: 0, summary: null } });
const month = (key = "2026-9"): MonthGroup => ({ key, year: 2026, monthIndex: 8, label: "září",
  total: 1, predictedTotal: 1, totalSource: "predicted", statementPayoutTotal: null,
  items: [{ id: "item", entryId: "entry", ownerEmail: "advisor@example.test", productKey: "cppAuto", amount: 1, date: new Date("2026-09-25T12:00:00Z") }] });

function fakeWorker() {
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  return {
    postMessage: vi.fn<(request: CashflowWorkerRequest) => void>(), terminate: vi.fn(),
    addEventListener: vi.fn((name: string, listener: (event: unknown) => void) => {
      const group = listeners.get(name) ?? new Set(); group.add(listener); listeners.set(name, group);
    }),
    removeEventListener: vi.fn((name: string, listener: (event: unknown) => void) => { listeners.get(name)?.delete(listener); }),
    emit(name: string, data?: unknown) {
      const event = { data, preventDefault: vi.fn() };
      [...(listeners.get(name) ?? [])].forEach(listener => listener(event));
      return event;
    },
  };
}
function fixture(timeoutMs?: number) {
  const worker = fakeWorker();
  const source = dataset();
  const model = { view: vi.fn<CashflowModel["view"]>(() => overview()), month: vi.fn<CashflowModel["month"]>(() => month()), dispose: vi.fn() };
  const createWorker = vi.fn(() => worker as unknown as CashflowWorkerPort);
  const createFallbackModel = vi.fn<(dataset: CashflowDataset) => CashflowModel | Promise<CashflowModel>>(() => model);
  const client = createCashflowWorkerClient({ dataset: source, createWorker, createFallbackModel, timeoutMs });
  const init = () => worker.emit("message", { kind: "init", id: 0, ok: true });
  const respond = (result: CashflowOverview | MonthGroup | null = overview()) => {
    const request = worker.postMessage.mock.calls.at(-1)![0];
    worker.emit("message", { ...request, dataset: undefined, options: undefined, ok: true, result });
  };
  return { worker, source, model, createWorker, createFallbackModel, client, init, respond };
}

beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("persistent cashflow worker client", () => {
  it("initializes one immutable dataset and sends only options or month keys afterward", async () => {
    expectTypeOf<Worker>().toExtend<CashflowWorkerPort>();
    const f = fixture();
    expect(f.client.executionPath).toBe("pending");
    expect(f.createWorker).not.toHaveBeenCalled();
    const result = f.client.view(options());
    expect(f.worker.postMessage).toHaveBeenCalledExactlyOnceWith({ kind: "init", id: 0, dataset: f.source });
    f.init();
    expect(f.worker.postMessage.mock.calls[1][0]).toEqual({ kind: "view", id: 1, revision: 1, options: options() });
    const summary = overview(); f.respond(summary);
    expect(await result).toBe(summary);
    const detail = f.client.month("2026-9");
    expect(f.worker.postMessage.mock.calls[2][0]).toEqual({ kind: "month", id: 2, revision: 1, key: "2026-9" });
    const fullMonth = month(); f.respond(fullMonth);
    expect(await detail).toBe(fullMonth);
    expect(fullMonth.items[0].date).toBeInstanceOf(Date);
    const next = f.client.view(options("123")); f.respond(); await next;
    expect(f.worker.postMessage.mock.calls.filter(([request]) => request.kind === "init")).toHaveLength(1);
    expect(f.createWorker).toHaveBeenCalledTimes(1);
    expect(f.createFallbackModel).not.toHaveBeenCalled();
    expect(f.client.executionPath).toBe("worker");
    expect(vi.getTimerCount()).toBe(0);
    f.client.dispose();
  });

  it("coalesces 100 changes during initialization to one final view", async () => {
    const f = fixture();
    const results = Array.from({ length: 100 }, (_, index) => f.client.view(options(String(index))).catch(error => error));
    expect(f.worker.postMessage).toHaveBeenCalledTimes(1);
    f.init();
    expect(f.worker.postMessage).toHaveBeenCalledTimes(2);
    expect(f.worker.postMessage.mock.calls[1][0]).toMatchObject({ kind: "view", id: 100, revision: 100, options: options("99") });
    f.respond();
    const values = await Promise.all(results);
    expect(values.slice(0, 99).every(value => value.name === "AbortError")).toBe(true);
    expect(values[99]).toEqual(overview());
    f.client.dispose();
  });

  it("keeps only the latest queued view while active work finishes", async () => {
    const f = fixture();
    const first = f.client.view(options()).catch(error => error); f.init();
    const skipped = f.client.view(options("skipped")).catch(error => error);
    const newest = f.client.view(options("newest"));
    expect((await first).name).toBe("AbortError");
    expect((await skipped).name).toBe("AbortError");
    expect(f.worker.postMessage).toHaveBeenCalledTimes(2);
    f.worker.emit("message", { kind: "view", id: 1, revision: 1, ok: true, result: overview() });
    expect(f.worker.postMessage.mock.calls[2][0]).toMatchObject({ id: 3, options: options("newest") });
    f.worker.emit("message", { kind: "view", id: 1, revision: 1, ok: false });
    expect(f.createFallbackModel).not.toHaveBeenCalled();
    f.respond(); expect(await newest).toEqual(overview());
    f.client.dispose();
  });

  it("rejects month requests before the latest view finishes", async () => {
    const f = fixture();
    await expect(f.client.month("2026-9")).rejects.toMatchObject({ name: "AbortError" });
    const ready = f.client.view(options()); f.init();
    await expect(f.client.month("2026-9")).rejects.toMatchObject({ name: "AbortError" });
    f.respond(); await ready;
    const next = f.client.view(options("new"));
    await expect(f.client.month("2026-9")).rejects.toMatchObject({ name: "AbortError" });
    f.respond(); await next;
    f.client.dispose();
  });

  it("invalidates an in-flight month and rejects stale detail after a filter change", async () => {
    const f = fixture();
    const ready = f.client.view(options()); f.init(); f.respond(); await ready;
    const oldMonth = f.client.month("2026-9").catch(error => error);
    const changed = f.client.view(options("new"));
    expect((await oldMonth).name).toBe("AbortError");
    f.worker.emit("message", { kind: "month", id: 2, revision: 1, ok: true, result: month() });
    expect(f.worker.postMessage.mock.calls.at(-1)![0]).toMatchObject({ kind: "view", revision: 2 });
    f.respond(); await changed;
    const latest = f.client.month("2026-10"); f.respond(null);
    expect(await latest).toBeNull();
    f.client.dispose();
  });

  it("coalesces successive month requests without queueing every detail", async () => {
    const f = fixture();
    const ready = f.client.view(options()); f.init(); f.respond(); await ready;
    const first = f.client.month("2026-9").catch(error => error);
    const skipped = f.client.month("2026-10").catch(error => error);
    const newest = f.client.month("2026-11");
    expect((await first).name).toBe("AbortError"); expect((await skipped).name).toBe("AbortError");
    expect(f.worker.postMessage).toHaveBeenCalledTimes(3);
    f.worker.emit("message", { kind: "month", id: 2, revision: 1, ok: true, result: month() });
    expect(f.worker.postMessage.mock.calls.at(-1)![0]).toMatchObject({ kind: "month", key: "2026-11" });
    f.respond(month("2026-11")); expect((await newest)?.key).toBe("2026-11");
    f.client.dispose();
  });

  it.each(["error", "messageerror", "init-timeout", "job-timeout", "response-failure", "malformed"])("falls back only to the latest view after %s", async kind => {
    const f = fixture(100);
    const old = f.client.view(options()).catch(error => error);
    if (kind !== "init-timeout") f.init();
    const latestOptions = options("latest");
    const latest = f.client.view(latestOptions);
    if (kind.endsWith("timeout")) vi.advanceTimersByTime(100);
    else if (kind === "malformed") f.worker.emit("message", null);
    else if (kind === "response-failure") f.worker.emit("message", { kind: "view", id: 1, ok: false });
    else expect(f.worker.emit(kind).preventDefault).toHaveBeenCalledOnce();
    expect((await old).name).toBe("AbortError"); expect(await latest).toEqual(overview());
    expect(f.createFallbackModel).toHaveBeenCalledExactlyOnceWith(f.source);
    expect(f.model.view).toHaveBeenCalledExactlyOnceWith(latestOptions);
    expect(f.worker.terminate).toHaveBeenCalledTimes(1);
    expect(f.client.executionPath).toBe("fallback");
    expect(vi.getTimerCount()).toBe(0);
    f.client.dispose(); expect(f.model.dispose).toHaveBeenCalledTimes(1);
  });

  it("rebuilds the correct view before serving an on-demand month through fallback", async () => {
    const f = fixture();
    const selected = options("specific");
    const ready = f.client.view(selected); f.init(); f.respond(); await ready;
    const detail = f.client.month("2026-9");
    f.worker.emit("message", { kind: "month", id: 2, revision: 100, ok: true, result: month() });
    expect(await detail).toEqual(month());
    expect(f.model.view).toHaveBeenCalledExactlyOnceWith(selected);
    expect(f.model.month).toHaveBeenCalledExactlyOnceWith("2026-9");
    const nextDetail = await f.client.month("2026-9"); expect(nextDetail).toEqual(month());
    expect(f.model.view).toHaveBeenCalledTimes(1);
    f.client.dispose();
  });

  it("uses an eight-second default timeout for an unresponsive worker", async () => {
    const f = fixture();
    const pending = f.client.view(options());
    vi.advanceTimersByTime(7_999);
    expect(f.createFallbackModel).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(await pending).toEqual(overview());
    expect(f.client.executionPath).toBe("fallback");
    f.client.dispose();
  });

  it.each(["factory", "postMessage", "listeners"])("handles unavailable workers and CSP/setup errors at %s without logging payloads", async kind => {
    const f = fixture();
    const fail = () => { throw new Error("Private contents"); };
    if (kind === "factory") f.createWorker.mockImplementation(fail);
    else if (kind === "postMessage") f.worker.postMessage.mockImplementation(fail);
    else f.worker.addEventListener.mockImplementation(fail);
    expect(await f.client.view(options())).toEqual(overview());
    expect(f.client.executionPath).toBe("fallback");
    expect(f.createFallbackModel).toHaveBeenCalledTimes(1);
    f.client.dispose();
  });

  it("loads the default fallback lazily if Worker is unavailable", async () => {
    const f = fixture();
    vi.stubGlobal("Worker", undefined);
    moduleMocks.createModel.mockReturnValue(f.model);
    const client = createCashflowWorkerClient({ dataset: f.source });
    expect(moduleMocks.createModel).not.toHaveBeenCalled();
    expect(await client.view(options())).toEqual(overview());
    expect(moduleMocks.createModel).toHaveBeenCalledExactlyOnceWith(f.source);
    client.dispose();
  });

  it("coalesces changes while the fallback module is loading", async () => {
    const f = fixture();
    const loading = Promise.withResolvers<CashflowModel>();
    f.createWorker.mockImplementation(() => { throw new Error("Unavailable"); });
    f.createFallbackModel.mockReturnValue(loading.promise);
    const old = f.client.view(options()).catch(error => error);
    await Promise.resolve();
    const latest = f.client.view(options("latest"));
    loading.resolve(f.model);
    expect((await old).name).toBe("AbortError"); expect(await latest).toEqual(overview());
    expect(f.model.view).toHaveBeenCalledExactlyOnceWith(options("latest"));
    f.client.dispose();
  });

  it("sanitizes model errors and keeps details unavailable after a failed view", async () => {
    const f = fixture();
    f.createWorker.mockImplementation(() => { throw new Error("Unavailable"); });
    f.model.view.mockImplementation(() => { throw new Error("Private financial contents"); });
    await expect(f.client.view(options())).rejects.toThrow("Cashflow calculation failed");
    await expect(f.client.month("2026-9")).rejects.toMatchObject({ name: "AbortError" });
    f.client.dispose();
  });

  it("disposes queued and active work and ignores late responses without starting fallback", async () => {
    const f = fixture();
    const first = f.client.view(options()).catch(error => error); f.init();
    const next = f.client.view(options("next")).catch(error => error);
    f.client.dispose(); f.client.dispose();
    expect((await first).name).toBe("AbortError"); expect((await next).name).toBe("AbortError");
    expect(f.worker.postMessage.mock.calls.at(-1)![0]).toEqual({ kind: "dispose" });
    expect(f.worker.terminate).toHaveBeenCalledTimes(1);
    expect(f.worker.removeEventListener).toHaveBeenCalledTimes(3);
    f.worker.emit("message", { kind: "view", id: 1, revision: 1, ok: true, result: overview() });
    f.worker.emit("error"); vi.advanceTimersByTime(60_000);
    expect(f.createFallbackModel).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(f.client.executionPath).toBe("disposed");
    await expect(f.client.view(options())).rejects.toMatchObject({ name: "AbortError" });
    await expect(f.client.month("2026-9")).rejects.toMatchObject({ name: "AbortError" });
  });

  it("disposes a model that finishes loading after its client has been discarded", async () => {
    const f = fixture();
    const loading = Promise.withResolvers<CashflowModel>();
    f.createWorker.mockImplementation(() => { throw new Error("Unavailable"); });
    f.createFallbackModel.mockReturnValue(loading.promise);
    const pending = f.client.view(options()).catch(error => error);
    await Promise.resolve(); f.client.dispose(); loading.resolve(f.model);
    expect((await pending).name).toBe("AbortError");
    await vi.waitFor(() => expect(f.model.dispose).toHaveBeenCalledTimes(1));
    expect(f.model.view).not.toHaveBeenCalled();
  });

  it.each([null, [], {}, { kind: "view", id: "1" }, { kind: "view", id: 100 },
    { kind: "view", id: 1, revision: 1, ok: true, result: { months: "invalid" } }])("recovers from unknown or malformed worker responses: %j", response => {
    const f = fixture();
    const pending = f.client.view(options()); f.init();
    f.worker.emit("message", response);
    return pending.then(result => {
      expect(result).toEqual(overview()); expect(f.client.executionPath).toBe("fallback"); f.client.dispose();
    });
  });

  it("rejects a wrong-month response and obtains the exact requested key from the reference model", async () => {
    const f = fixture();
    const ready = f.client.view(options()); f.init(); f.respond(); await ready;
    const pending = f.client.month("2026-9");
    f.respond(month("2030-1"));
    expect((await pending)?.key).toBe("2026-9");
    expect(f.model.month).toHaveBeenCalledExactlyOnceWith("2026-9"); f.client.dispose();
  });

  it("disposes before initialization without touching worker or fallback factories", async () => {
    const f = fixture(); f.client.dispose();
    await expect(f.client.view(options())).rejects.toMatchObject({ name: "AbortError" });
    expect(f.createWorker).not.toHaveBeenCalled(); expect(f.createFallbackModel).not.toHaveBeenCalled();
  });
});

describe("cashflow worker entry protocol", () => {
  async function entry() {
    vi.resetModules();
    const f = fixture();
    let listener: (event: { data: unknown }) => void;
    const scope = {
      addEventListener: vi.fn((_type: string, callback: typeof listener) => { listener = callback; }),
      postMessage: vi.fn(), close: vi.fn(),
    };
    vi.stubGlobal("self", scope);
    moduleMocks.createModel.mockReturnValue(f.model);
    await import("./cashflow.worker");
    return { ...f, scope, send: (data: unknown) => listener({ data }) };
  }

  it("retains its model once and validates view revision before returning month details", async () => {
    const f = await entry();
    f.send({ kind: "init", id: 0, dataset: f.source });
    expect(moduleMocks.createModel).toHaveBeenCalledExactlyOnceWith(f.source);
    expect(f.scope.postMessage).toHaveBeenLastCalledWith({ kind: "init", id: 0, ok: true });
    f.send({ kind: "view", id: 1, revision: 1, options: options() });
    expect(f.scope.postMessage).toHaveBeenLastCalledWith({ kind: "view", id: 1, revision: 1, ok: true, result: overview() });
    f.send({ kind: "month", id: 2, revision: 1, key: "2026-9" });
    expect(f.scope.postMessage).toHaveBeenLastCalledWith({ kind: "month", id: 2, revision: 1, ok: true, result: month() });
    f.send({ kind: "view", id: 3, revision: 2, options: options("filtered") });
    f.send({ kind: "month", id: 4, revision: 1, key: "2026-9" });
    expect(f.scope.postMessage).toHaveBeenLastCalledWith({ kind: "month", id: 4, ok: false });
    expect(f.model.month).toHaveBeenCalledTimes(1);
    f.send({ kind: "dispose" });
    expect(f.model.dispose).toHaveBeenCalledTimes(1); expect(f.scope.close).toHaveBeenCalledTimes(1);
  });

  it("rejects duplicate initialization and sanitizes calculation failures", async () => {
    const f = await entry();
    f.send({ kind: "month", id: 1, revision: 0, key: "2026-9" });
    expect(f.scope.postMessage).toHaveBeenLastCalledWith({ kind: "month", id: 1, ok: false });
    f.send({ kind: "init", id: 0, dataset: f.source });
    f.send({ kind: "init", id: 0, dataset: f.source });
    expect(f.scope.postMessage).toHaveBeenLastCalledWith({ kind: "init", id: 0, ok: false });
    f.model.view.mockImplementation(() => { throw new Error("Private financial data"); });
    f.send({ kind: "view", id: 2, revision: 1, options: options() });
    expect(f.scope.postMessage).toHaveBeenLastCalledWith({ kind: "view", id: 2, ok: false });
    expect(JSON.stringify(f.scope.postMessage.mock.calls)).not.toContain("Private");
  });

  it.each([null, [], {}, { kind: "Private contents" }])("returns a fixed failure for malformed input: %j", async request => {
    const f = await entry(); f.send(request);
    expect(f.scope.postMessage).toHaveBeenLastCalledWith({ kind: "invalid", id: -1, ok: false });
  });
});
