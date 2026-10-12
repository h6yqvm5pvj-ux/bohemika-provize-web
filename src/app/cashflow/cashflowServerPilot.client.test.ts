import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCashflowServerPilotClient } from "./cashflowServerPilot.client";
import { CASHFLOW_SERVER_PILOT_VERSION } from "./cashflowServerProtocol";
import { createCashflowModel } from "./cashflowModel";
import { serializeCashflowSnapshot } from "./cashflowSnapshotWire";
import type { CashflowDataset } from "./cashflowWorker.types";
import type { CashflowViewOptions } from "./buildCashflowView";

const options: CashflowViewOptions = { scopeFilter: "own", productFilter: "all", tipsterMode: false,
  showPastYears: true, intelligentPredictionEnabled: false, contractNumberQuery: "" };
const dataset = (): CashflowDataset => ({
  asOf: new Date(2026, 9, 8), statements: [],
  snapshot: { email: "advisor@example.test", myPosition: "poradce3", myCommissionMode: "standard", hasAnyTeam: false,
    ownEntries: [{ id: "synthetic", productKey: "neon", userEmail: "advisor@example.test",
      // The advance December first-day start produces the December detail exercised below.
      contractNumber: "123456", clientName: "Synthetic client", policyStartDate: new Date(2026, 11, 1), contractSignedDate: new Date(2026, 9, 8),
      items: [{ title: "Okamžitá provize", code: "A101", amount: 1000 }] }],
    teamEntriesRaw: [], tipPayouts: [], subscriptionPayments: [],
  },
});

function fixture() {
  const input = dataset();
  const model = createCashflowModel(input);
  const local = { executionPath: "fallback" as const,
    view: vi.fn(async (options: CashflowViewOptions) => model.view(options)),
    month: vi.fn(async (key: string) => model.month(key)),
    verification: vi.fn(() => model.verification!()), dispose: vi.fn(() => model.dispose()),
  };
  const createLocal = vi.fn((fresh: CashflowDataset) => {
    const model = createCashflowModel(fresh);
    return { executionPath: "fallback" as const,
      view: vi.fn(async (selected: CashflowViewOptions) => model.view(selected)),
      month: vi.fn(async (key: string) => model.month(key)),
      verification: vi.fn(() => model.verification!()), dispose: vi.fn(() => model.dispose()),
    };
  });
  const request = vi.fn<typeof fetch>(async (_url, init) => {
    const raw = JSON.parse(init!.body as string);
    const responseModel = createCashflowModel({ ...input, asOf: new Date(raw.asOfMs) });
    try {
      const overview = responseModel.view(raw.options);
      const verification = await responseModel.verification!();
      const context = { ok: true, version: CASHFLOW_SERVER_PILOT_VERSION, kind: raw.kind, ...verification };
      if (raw.kind === "view") return Response.json({ ...context, overview });
      const month = responseModel.month(raw.monthKey);
      return Response.json({ ...context, monthKey: raw.monthKey, payload: serializeCashflowSnapshot({ items: [], months: month ? [month] : [] }) });
    } finally { responseModel.dispose(); }
  });
  const getToken = vi.fn(async () => "synthetic-test-token");
  const measure = vi.fn();
  const create = (timeoutMs?: number) => createCashflowServerPilotClient({ dataset: input, local, createLocal, getToken, request, measure, timeoutMs });
  return { input, model, local, createLocal, request, getToken, measure, create };
}
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
};
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(dataset().asOf); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const measurement = async (f: ReturnType<typeof fixture>, count = 1) => {
  await vi.waitFor(() => expect(f.measure).toHaveBeenCalledTimes(count));
  return f.measure.mock.calls[count - 1][0];
};
const comparedView = async (f: ReturnType<typeof fixture>, client: ReturnType<typeof f.create>) => {
  const overview = await client.view(options);
  await measurement(f);
  return overview;
};
const prepareVerification = async (f: ReturnType<typeof fixture>) => {
  const overview = f.model.view(options);
  const verification = await f.model.verification!();
  f.local.verification.mockResolvedValue(verification);
  return Response.json({ ok: true, version: CASHFLOW_SERVER_PILOT_VERSION, kind: "view", ...verification, overview });
};

describe("background server comparison with the original displayed result", () => {
  it.each([6 * 60_000, -6 * 60_000, 24 * 60 * 60_000])("rebuilds both model and request context after the clock moves by %s ms", async elapsed => {
    const f = fixture(); const client = f.create(); await comparedView(f, client);
    const before = JSON.stringify(f.input);
    const now = f.input.asOf.getTime() + elapsed;
    vi.setSystemTime(now);
    const selected = { ...options, scopeFilter: "combined" as const };
    const actual = await client.view(selected);
    expect(f.createLocal).toHaveBeenCalledOnce();
    const fresh = f.createLocal.mock.calls[0][0];
    expect(fresh.asOf.getTime()).toBe(now);
    expect(fresh.snapshot).toBe(f.input.snapshot);
    expect(fresh.statements).toBe(f.input.statements);
    expect(f.local.dispose).toHaveBeenCalledOnce();
    const model = createCashflowModel(fresh);
    expect(actual).toEqual(model.view(selected));
    expect((await measurement(f, 2)).status).toBe("match");
    expect(JSON.parse(f.request.mock.calls[1][1]!.body as string).asOfMs).toBe(now);
    expect(await client.month("2026-12")).toEqual(model.month("2026-12"));
    expect((await measurement(f, 3)).status).toBe("match");
    expect(JSON.stringify(f.input)).toBe(before);
    client.dispose(); model.dispose();
    expect(f.createLocal.mock.results[0].value.dispose).toHaveBeenCalledOnce();
  });
  it("reuses fresh model caches and renews before the complete comparison could exceed five minutes", async () => {
    const f = fixture(); const client = f.create(); await comparedView(f, client);
    vi.setSystemTime(f.input.asOf.getTime() + 4 * 60_000);
    await client.view({ ...options, productFilter: "auto" }); await measurement(f, 2);
    expect(f.createLocal).not.toHaveBeenCalled();
    expect(f.local.dispose).not.toHaveBeenCalled();
    vi.setSystemTime(f.input.asOf.getTime() + 4.5 * 60_000);
    await client.view(options); await measurement(f, 3);
    expect(f.createLocal).toHaveBeenCalledOnce();
    expect(f.measure.mock.calls[2][0].status).toBe("match"); client.dispose();
  });
  it("renews after midnight even when less than five minutes elapsed", async () => {
    const f = fixture();
    f.input.asOf.setHours(23, 59, 0, 0);
    vi.setSystemTime(f.input.asOf);
    const client = f.create(); await comparedView(f, client);
    vi.setSystemTime(f.input.asOf.getTime() + 120_000);
    await client.view(options); await measurement(f, 2);
    expect(f.createLocal).toHaveBeenCalledOnce();
    expect(f.createLocal.mock.calls[0][0].asOf.getDate()).toBe(9);
    expect(f.measure.mock.calls[1][0].status).toBe("match"); client.dispose();
  });
  it("recalculates the year-dependent horizon instead of merely sending a new timestamp", async () => {
    const f = fixture(); const client = f.create();
    const previous = await comparedView(f, client);
    vi.setSystemTime(new Date(2027, 0, 1, 0, 1));
    const actual = await client.view({ ...options, showPastYears: false });
    const fresh = createCashflowModel({ ...f.input, asOf: new Date() });
    const expected = fresh.view({ ...options, showPastYears: false });
    expect(actual).toEqual(expected);
    expect(actual).not.toEqual(previous);
    expect((await measurement(f, 2)).status).toBe("match");
    client.dispose(); fresh.dispose();
  });
  it("rebuilds the reference when the browser time zone changes", async () => {
    const f = fixture();
    const resolved = Intl.DateTimeFormat().resolvedOptions();
    const zone = vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({ ...resolved, timeZone: "Europe/Prague" });
    const client = f.create(); await comparedView(f, client);
    zone.mockReturnValue({ ...resolved, timeZone: "America/New_York" });
    await client.view(options);
    expect((await measurement(f, 2)).status).toBe("match");
    expect(f.createLocal).toHaveBeenCalledOnce();
    expect(JSON.parse(f.request.mock.calls[1][1]!.body as string).timeZone).toBe("America/New_York"); client.dispose();
  });
  it("does not relabel a displayed detail with a fresh date after its overview expires", async () => {
    const f = fixture(); const client = f.create(); await comparedView(f, client);
    const expected = f.model.month("2026-12");
    vi.setSystemTime(f.input.asOf.getTime() + 6 * 60_000);
    expect(await client.month("2026-12")).toBe(expected);
    expect((await measurement(f, 2))).toMatchObject({ kind: "month", status: "unavailable", reason: "stale_context" });
    expect(f.request).toHaveBeenCalledOnce();
    expect(f.createLocal).not.toHaveBeenCalled();
    await client.view(options);
    expect((await measurement(f, 3)).status).toBe("match"); client.dispose();
  });
  it("does not submit a stale context when authentication resumes after a suspended tab", async () => {
    const f = fixture(); const late = deferred<string>(); f.getToken.mockImplementationOnce(() => late.promise);
    const client = f.create(); await client.view(options);
    await vi.waitFor(() => expect(f.getToken).toHaveBeenCalledOnce());
    vi.setSystemTime(f.input.asOf.getTime() + 6 * 60_000);
    late.resolve("synthetic-token");
    expect((await measurement(f))).toMatchObject({ status: "unavailable", reason: "stale_context" });
    expect(f.request).not.toHaveBeenCalled();
    await client.view(options); expect((await measurement(f, 2)).status).toBe("match"); client.dispose();
  });
  it("cancels a late old comparison when renewing the model for a new filter", async () => {
    const f = fixture(); const late = deferred<Response>(); f.request.mockImplementationOnce(() => late.promise);
    const client = f.create(); await client.view(options);
    await vi.waitFor(() => expect(f.request).toHaveBeenCalledOnce());
    vi.setSystemTime(f.input.asOf.getTime() + 6 * 60_000);
    await client.view({ ...options, productFilter: "auto" });
    expect((await measurement(f)).status).toBe("match");
    expect(f.request.mock.calls[0][1]!.signal!.aborted).toBe(true);
    late.resolve(Response.json({ private: "old response" }));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(f.measure).toHaveBeenCalledOnce();
    expect(f.createLocal).toHaveBeenCalledOnce(); client.dispose();
  });
  it("returns the original before hashing/auth, then verifies full overview and restored detail", async () => {
    const f = fixture(); const client = f.create();
    const overview = await client.view(options);
    expect(overview).toBe(await f.local.view.mock.results[0].value);
    expect(f.local.verification).not.toHaveBeenCalled();
    expect(f.getToken).not.toHaveBeenCalled();
    expect(f.request).not.toHaveBeenCalled();
    expect((await measurement(f)).status).toBe("match");
    const detail = await client.month(overview.months[0].key);
    expect(detail).toBe(await f.local.month.mock.results[0].value);
    expect(detail!.items[0].date).toBeInstanceOf(Date);
    expect((await measurement(f, 2)).status).toBe("match");
    expect(f.request).toHaveBeenCalledTimes(2);
    expect(f.request.mock.calls[0][0]).toBe("/api/cashflow/view");
    const raw = JSON.parse(f.request.mock.calls[0][1]!.body as string);
    expect(Object.keys(raw).sort()).toEqual(["asOfMs", "inputHash", "kind", "options", "timeZone", "version"]);
    expect(JSON.stringify(raw)).not.toMatch(/advisor@example|Synthetic client|synthetic-test-token/);
    expect(f.request.mock.calls[0][1]!.headers).toMatchObject({ Authorization: "Bearer synthetic-test-token" });
    client.dispose();
  });
  it("handles a missing month without creating a zero-valued replacement", async () => {
    const f = fixture(); const client = f.create(); await comparedView(f, client);
    expect(await client.month("2001-1")).toBeNull();
    expect((await measurement(f, 2)).status).toBe("match");
    client.dispose();
  });
  it.each(["monthsHash", "overview", "inputHash", "version", "kind"])("rejects %s disagreement even if totals agree", async field => {
    const f = fixture(); const original = f.request.getMockImplementation()!;
    f.request.mockImplementation(async (...args) => {
      const raw = await (await original(...args)).json();
      if (field === "overview") raw.overview.months[0].label = "Wrong month label";
      else raw[field] = "invalid";
      return Response.json(raw);
    });
    const client = f.create();
    expect(await comparedView(f, client)).toBe(await f.local.view.mock.results[0].value);
    await client.month("2026-12");
    expect(f.request).toHaveBeenCalledTimes(1);
    expect(f.measure.mock.calls[0][0].status).not.toBe("match");
    client.dispose();
  });
  it.each(["amount", "ownerEmail", "date", "monthKey", "monthsHash"])("invalidates month comparison when %s changes", async field => {
    const f = fixture(); const original = f.request.getMockImplementation()!;
    f.request.mockImplementation(async (...args) => {
      const raw = await (await original(...args)).json();
      if (raw.kind === "month") {
        if (field === "monthKey" || field === "monthsHash") raw[field] = "wrong";
        else raw.payload.months[0].items[0][field] = field === "amount" ? 999 : field === "date" ? "invalid" : "other@example.test";
      }
      return Response.json(raw);
    });
    const client = f.create(); await comparedView(f, client);
    expect(await client.month("2026-12")).toBe(await f.local.month.mock.results[0].value);
    expect((await measurement(f, 2)).status).toBe("mismatch");
    await client.month("2026-12");
    expect(f.request).toHaveBeenCalledTimes(2);
    client.dispose();
  });
  it.each([401, 403, 409, 429, 503])("preserves the reference after server status %s", async status => {
    const f = fixture(); f.request.mockResolvedValue(new Response("Sensitive upstream details", { status }));
    const client = f.create();
    expect(await comparedView(f, client)).toBe(await f.local.view.mock.results[0].value);
    expect(JSON.stringify(f.measure.mock.calls)).not.toMatch(/Sensitive|advisor@example|token/);
    expect(Object.keys(f.measure.mock.calls[0][0]).sort()).toEqual([
      "httpStatus", "kind", "reason", "referenceMs", "requestMs", "serverTimingMs", "status",
    ]);
    client.dispose();
  });
  it.each(["time_zone", "different_inputs", "incomplete_inputs", "resource_limit", "stale_context", "timeout"])(
    "records only safe %s diagnostic fields", async reason => {
      const f = fixture();
      f.request.mockResolvedValue(Response.json({ ok: false, reason, error: "private upstream details", email: "private@example.test" }, {
        status: 503, headers: { "Server-Timing": "cashflow_inputs;dur=4.25, private_phase;dur=12" },
      }));
      const client = f.create();
      expect(await comparedView(f, client)).toBe(await f.local.view.mock.results[0].value);
      expect(f.measure.mock.calls[0][0]).toMatchObject({ status: "unavailable", reason, httpStatus: 503,
        serverTimingMs: { cashflow_inputs: 4.25 } });
      expect(JSON.stringify(f.measure.mock.calls)).not.toMatch(/private|upstream|email/);
      client.dispose();
    });
  it("ignores arbitrary server reason strings", async () => {
    const f = fixture();
    f.request.mockResolvedValue(Response.json({ reason: "private@example.test", error: "private-token" }, { status: 503 }));
    const client = f.create(); await comparedView(f, client);
    expect(f.measure.mock.calls[0][0].reason).toBe("http");
    expect(JSON.stringify(f.measure.mock.calls)).not.toContain("private"); client.dispose();
  });
  it.each(["input_requests", "source_rows", "output_estimate", "payout_matching", "nested_rows",
    "entry_shape", "date_range", "duration", "reference_time"])("records the fixed resource code %s while preserving the reference", async resourceLimit => {
    const f = fixture();
    f.request.mockResolvedValue(Response.json({ reason: "resource_limit", resourceLimit,
      error: "private upstream details", entry: { email: "private@example.test", amount: 987654321 } }, { status: 503 }));
    const client = f.create();
    expect(await comparedView(f, client)).toBe(await f.local.view.mock.results[0].value);
    expect(f.measure.mock.calls[0][0]).toMatchObject({ status: "unavailable", reason: "resource_limit", resourceLimit, httpStatus: 503 });
    expect(Object.keys(f.measure.mock.calls[0][0]).sort()).toEqual([
      "httpStatus", "kind", "reason", "referenceMs", "requestMs", "resourceLimit", "serverTimingMs", "status",
    ]);
    expect(JSON.stringify(f.measure.mock.calls)).not.toMatch(/private|987654321|amount|email/);
    client.dispose();
  });
  it.each(["private@example.test", "__proto__", null, 1, {}, ["output_estimate"]])("discards unrecognized resource details (%j)", async resourceLimit => {
    const f = fixture();
    f.request.mockResolvedValue(Response.json({ reason: "resource_limit", resourceLimit }, { status: 503 }));
    const client = f.create(); await comparedView(f, client);
    expect(f.measure.mock.calls[0][0].resourceLimit).toBeUndefined();
    expect(f.measure.mock.calls[0][0].reason).toBe("resource_limit");
    client.dispose();
  });
  it("does not accept a resource code attached to an unrelated error", async () => {
    const f = fixture();
    f.request.mockResolvedValue(Response.json({ reason: "timeout", resourceLimit: "output_estimate" }, { status: 503 }));
    const client = f.create(); await comparedView(f, client);
    expect(f.measure.mock.calls[0][0].resourceLimit).toBeUndefined(); client.dispose();
  });
  it.each(["token", "network", "json", "verification"])("isolates a %s failure from the display", async phase => {
    const f = fixture();
    if (phase === "token") f.getToken.mockRejectedValue(new Error("Private token failure"));
    if (phase === "network") f.request.mockRejectedValue(new Error("Private network failure"));
    if (phase === "json") f.request.mockResolvedValue(new Response("{"));
    if (phase === "verification") f.local.verification.mockRejectedValue(new Error("Private hash failure"));
    const client = f.create();
    expect(await comparedView(f, client)).toBe(await f.local.view.mock.results[0].value);
    expect(f.measure.mock.calls[0][0].status).toBe("unavailable");
    expect(JSON.stringify(f.measure.mock.calls)).not.toContain("Private"); client.dispose();
  });
  it.each(["verification", "token", "request", "response"] as const)("bounds stalled %s without delaying the displayed result", async phase => {
    const f = fixture(); await prepareVerification(f);
    vi.useFakeTimers();
    const stalled = () => new Promise<never>(() => undefined);
    if (phase === "verification") f.local.verification.mockImplementation(stalled);
    if (phase === "token") f.getToken.mockImplementation(stalled);
    if (phase === "request") f.request.mockImplementation(stalled);
    if (phase === "response") {
      const response = Response.json({}, { headers: { "Server-Timing": "cashflow_auth;dur=3, private;dur=99" } });
      vi.spyOn(response, "json").mockImplementation(stalled); f.request.mockResolvedValue(response);
    }
    const client = f.create(20);
    const result = await client.view(options);
    expect(result).toBe(await f.local.view.mock.results[0].value);
    expect(f.measure).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(20);
    expect(f.measure.mock.calls[0][0]).toMatchObject({ status: "unavailable", reason: "timeout", timeoutPhase: phase });
    if (phase === "response") expect(f.measure.mock.calls[0][0]).toMatchObject({ httpStatus: 200, serverTimingMs: { cashflow_auth: 3 } });
    expect(JSON.stringify(f.measure.mock.calls)).not.toMatch(/private|advisor@example|Synthetic client|contractNumber|amount/);
    expect(vi.getTimerCount()).toBe(0); client.dispose();
  });
  it("can confirm a response after eight seconds while the original has already returned", async () => {
    const f = fixture(); const response = await prepareVerification(f);
    const late = deferred<Response>(); f.request.mockImplementation(() => late.promise);
    vi.useFakeTimers();
    const client = f.create();
    const original = await client.view(options);
    expect(original).toBe(await f.local.view.mock.results[0].value);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(9_000);
    expect(f.measure).not.toHaveBeenCalled();
    expect(f.request.mock.calls[0][1]!.signal!.aborted).toBe(false);
    late.resolve(response);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.measure.mock.calls[0][0].status).toBe("match");
    expect(vi.getTimerCount()).toBe(0); client.dispose();
  });
  it("cancels a queued comparison before hashing or sending any request", async () => {
    const f = fixture(); vi.useFakeTimers(); const client = f.create();
    await client.view(options); client.dispose(); client.dispose();
    await vi.runAllTimersAsync();
    expect(f.local.verification).not.toHaveBeenCalled(); expect(f.request).not.toHaveBeenCalled();
    expect(f.measure).not.toHaveBeenCalled(); expect(f.local.dispose).toHaveBeenCalledTimes(1);
  });
  it("ignores a late server response after filters change, including a fetch that ignores abort", async () => {
    const f = fixture(); const late = deferred<Response>(); f.request.mockImplementationOnce(() => late.promise);
    const client = f.create(); const first = await client.view(options);
    await vi.waitFor(() => expect(f.request).toHaveBeenCalledTimes(1));
    const latest = await client.view({ ...options, productFilter: "auto" });
    expect(latest.months).toEqual([]); expect(first.months.length).toBeGreaterThan(0);
    expect(f.request.mock.calls[0][1]!.signal!.aborted).toBe(true);
    await measurement(f);
    late.resolve(Response.json({ ok: true, overview: { private: "old data" } }));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(f.measure).toHaveBeenCalledTimes(1); expect(f.measure.mock.calls[0][0].status).toBe("match");
    // A stale response must not erase the latest verified selection.
    await client.month("2026-12"); expect((await measurement(f, 2)).status).toBe("match"); client.dispose();
  });
  it.each(["verification", "token"])("ignores a late %s before it can submit an old request", async phase => {
    const f = fixture(); const response = await prepareVerification(f);
    const verification = await response.json();
    const late = deferred<never>();
    if (phase === "verification") f.local.verification.mockImplementationOnce(() => late.promise);
    else f.getToken.mockImplementationOnce(() => late.promise);
    const client = f.create(); await client.view(options);
    await vi.waitFor(() => expect(phase === "verification" ? f.local.verification : f.getToken).toHaveBeenCalledTimes(1));
    await client.view({ ...options, productFilter: "auto" }); await measurement(f);
    late.resolve((phase === "verification" ? verification : "synthetic-late-token") as never);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(f.request).toHaveBeenCalledTimes(1); expect(f.measure).toHaveBeenCalledTimes(1); client.dispose();
  });
  it("supersedes a detail comparison without invalidating the latest selection", async () => {
    const f = fixture(); const client = f.create(); await comparedView(f, client);
    const late = deferred<Response>(); f.request.mockImplementationOnce(() => late.promise);
    const first = await client.month("2026-12");
    await vi.waitFor(() => expect(f.request).toHaveBeenCalledTimes(2));
    expect(await client.month("2026-12")).toEqual(first);
    expect((await measurement(f, 2)).status).toBe("match");
    late.resolve(Response.json({ ok: true, payload: "private outdated detail" }));
    await new Promise(resolve => setTimeout(resolve, 0));
    await client.month("2026-12"); expect((await measurement(f, 3)).status).toBe("match");
    expect(f.request).toHaveBeenCalledTimes(4); client.dispose();
  });
  it.each(["view", "month"])("suppresses pending %s comparison on disposal", async kind => {
    const f = fixture(); const client = f.create();
    if (kind === "month") await comparedView(f, client);
    f.request.mockImplementation(() => new Promise(() => undefined));
    if (kind === "view") await client.view(options); else await client.month("2026-12");
    await vi.waitFor(() => expect(f.request).toHaveBeenCalledTimes(kind === "view" ? 1 : 2));
    client.dispose(); client.dispose();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(f.measure).toHaveBeenCalledTimes(kind === "view" ? 0 : 1);
    expect(f.local.dispose).toHaveBeenCalledTimes(1);
    await expect(client.view(options)).rejects.toMatchObject({ name: "AbortError" });
    await expect(client.month("2026-12")).rejects.toMatchObject({ name: "AbortError" });
  });
  it("rejects a late original calculation after filters change", async () => {
    const f = fixture(); const late = deferred<Awaited<ReturnType<typeof f.local.view>>>();
    f.local.view.mockImplementationOnce(() => late.promise);
    const client = f.create(); const old = client.view(options).catch(error => error);
    const latest = await client.view({ ...options, productFilter: "auto" });
    late.resolve(latest); expect((await old).name).toBe("AbortError");
    await measurement(f); expect(f.request).toHaveBeenCalledTimes(1); client.dispose();
  });
  it("does not compare a detail before the complete overview has matched", async () => {
    const f = fixture(); const client = f.create(); await client.view(options);
    expect(await client.month("2026-12")).toBe(await f.local.month.mock.results[0].value);
    await measurement(f); expect(f.request).toHaveBeenCalledTimes(1); client.dispose();
  });
  it("preserves an original calculation failure instead of fabricating data", async () => {
    const f = fixture(); f.local.view.mockRejectedValue(new Error("Original unavailable"));
    const client = f.create(); await expect(client.view(options)).rejects.toThrow("Original unavailable");
    expect(f.request).not.toHaveBeenCalled(); expect(f.measure).not.toHaveBeenCalled(); client.dispose();
  });
  it("ignores a failing diagnostic callback", async () => {
    const f = fixture(); f.measure.mockImplementation(() => { throw new Error("Storage unavailable"); });
    const client = f.create(); expect(await comparedView(f, client)).toBe(await f.local.view.mock.results[0].value); client.dispose();
  });
  it("records bounded server phases without identifiers or amounts", async () => {
    const f = fixture(); const original = f.request.getMockImplementation()!;
    f.request.mockImplementation(async (...args) => {
      const response = await original(...args);
      response.headers.set("Server-Timing", "cashflow_auth;dur=1.25, cashflow_compute;dur=2.5, cashflow_inputs_own_contracts;dur=4;desc=private, cashflow_inputs_team_contracts;dur=6, cashflow_inputs_own_contracts_identity;dur=1, cashflow_inputs_team_contracts_entries;dur=5;desc=private, cashflow_inputs_team_contracts_unknown;dur=2, private_account;dur=123, cashflow_inputs_unknown;dur=7");
      return response;
    });
    const client = f.create(); await comparedView(f, client);
    const result = f.measure.mock.calls[0][0];
    expect(result.referenceMs).toBeGreaterThanOrEqual(0);
    expect(result.serverTimingMs).toEqual({ cashflow_auth: 1.25, cashflow_compute: 2.5,
      cashflow_inputs_own_contracts: 4, cashflow_inputs_team_contracts: 6,
      cashflow_inputs_own_contracts_identity: 1, cashflow_inputs_team_contracts_entries: 5 });
    expect(JSON.stringify(result)).not.toMatch(/account|advisor@example|Synthetic client|token|amount|contractNumber/); client.dispose();
  });
});
