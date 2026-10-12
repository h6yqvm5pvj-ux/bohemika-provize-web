import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SUBSCRIPTION_CASHFLOW_OWNER_EMAIL } from "@/app/cashflow/subscriptionCashflow";
import { CASHFLOW_CONTRACTS_PAGE_SIZE } from "@/app/lib/cashflowPagination";
import { CASHFLOW_CONTRACT_TIMING_PHASES, type CashflowContractTimingPhase } from "@/app/cashflow/candidateCheckProtocol";
import type { CashflowContractTimingObserver } from "./cashflowContractTiming";
import { loadCashflowShadowInputs } from "./cashflowShadowInputs";

const handlers = vi.hoisted(() => ({
  profile: vi.fn<(request: NextRequest) => Promise<Response>>(),
  contracts: vi.fn<(request: NextRequest, options?: { freshCashflowContext?: boolean; onCashflowTiming?: CashflowContractTimingObserver; onCashflowTeamReady?: (ownTotalCount: number) => void }) => Promise<Response>>(),
  tips: vi.fn<(request: NextRequest) => Promise<Response>>(),
  subscriptions: vi.fn<(request: NextRequest) => Promise<Response>>(),
  statements: vi.fn<(request: NextRequest) => Promise<Response>>(),
}));

vi.mock("@/app/api/user/profile/route", () => ({ GET: handlers.profile }));
vi.mock("@/app/api/contracts/_lib/contractsApi", () => ({ handleContractsList: handlers.contracts }));
vi.mock("@/app/api/tip-payouts/list/route", () => ({ GET: handlers.tips }));
vi.mock("@/app/api/subscription-payments/list/route", () => ({ GET: handlers.subscriptions }));
vi.mock("@/app/api/commission-statements/route", () => ({ GET: handlers.statements }));

const json = (body: unknown, status = 200) => Promise.resolve(Response.json(body, { status }));
const profile = (email = "viewer@example.test", data: Record<string, unknown> = {}) => ({
  ok: true, hasProfile: true, email, profile: { accountType: "advisor", ...data },
});
const contracts = (items: Record<string, unknown>[] = [], extra: Record<string, unknown> = {}) => ({
  ok: true, contracts: items, totalCount: items.length, hasMore: false,
  nextCursorToken: null, nextCursor: null, position: "poradce", commissionMode: "standard",
  hasTeam: false, teamEmails: [], ...extra,
});
const tips = (items: Record<string, unknown>[] = [], extra: Record<string, unknown> = {}) => ({
  ok: true, payouts: items, hasMore: false, nextCursorToken: null, ...extra,
});
const statements = (extra: Record<string, unknown> = {}) => ({
  ok: true, items: [], hasMore: false, processingComplete: true, ...extra,
});
const request = (signal?: AbortSignal) => new NextRequest("https://example.test/api/cashflow/shadow?targetEmail=untrusted@example.test", {
  method: "POST", headers: { authorization: "Bearer actor-token", cookie: "impersonation=verified-cookie" }, signal,
});
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};

beforeEach(() => {
  vi.resetAllMocks();
  handlers.profile.mockImplementation(() => json(profile()));
  handlers.contracts.mockImplementation(() => json(contracts()));
  handlers.tips.mockImplementation(() => json(tips()));
  handlers.subscriptions.mockImplementation(() => json({ ok: true, payments: [], hasMore: false }));
  handlers.statements.mockImplementation(() => json(statements()));
});

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("cashflow shadow independent inputs", () => {
  it("preserves every input and handler request when source timing is enabled", async () => {
    const original = await loadCashflowShadowInputs(request(), { freshCashflowContext: true });
    const trace = () => Object.values(handlers).map(handler => handler.mock.calls.map(([req, options]) =>
      ({ url: req.url, method: req.method, headers: [...req.headers], freshCashflowContext: options?.freshCashflowContext })));
    const originalTrace = trace();
    Object.values(handlers).forEach(handler => handler.mockClear());
    const onSourceTiming = vi.fn();
    const measured = await loadCashflowShadowInputs(request(), { freshCashflowContext: true, onSourceTiming });
    expect(measured).toEqual(original);
    expect(trace()).toEqual(originalTrace);
    expect(handlers.contracts.mock.calls[0][1]?.onCashflowTiming).toBeTypeOf("function");
    expect(onSourceTiming.mock.calls.map(([name]) => name).sort()).toEqual([
      "cashflow_inputs_profile", "cashflow_inputs_own_contracts", "cashflow_inputs_tips", "cashflow_inputs_statements",
    ].sort());
    for (const call of onSourceTiming.mock.calls) {
      expect(call).toHaveLength(2);
      expect(Number.isFinite(call[1]) && call[1] >= 0).toBe(true);
    }
    expect(JSON.stringify(onSourceTiming.mock.calls)).not.toMatch(/viewer@example|actor-token|cookie|impersonation|targetEmail/);
  });
  it("forwards only bounded fixed inner phases under the trusted own/team source", async () => {
    handlers.contracts.mockImplementation((_req, options) => {
      for (const phase of CASHFLOW_CONTRACT_TIMING_PHASES) options?.onCashflowTiming?.(phase, 2);
      options?.onCashflowTiming?.("private@example.test;desc=secret" as CashflowContractTimingPhase, 2);
      for (const invalid of [-1, NaN, Infinity, 3_600_001]) options?.onCashflowTiming?.("entries", invalid);
      return json(contracts([], { hasTeam: true }));
    });
    const onSourceTiming = vi.fn();
    await loadCashflowShadowInputs(request(), { freshCashflowContext: true, onSourceTiming });
    for (const source of ["own_contracts", "team_contracts"]) {
      for (const phase of CASHFLOW_CONTRACT_TIMING_PHASES) {
        expect(onSourceTiming).toHaveBeenCalledWith(`cashflow_inputs_${source}_${phase}`, 2);
      }
    }
    expect(onSourceTiming.mock.calls).toHaveLength(17); // 12 phases + 5 source reads.
    expect(JSON.stringify(onSourceTiming.mock.calls)).not.toMatch(/example.test|secret|actor-token/);
  });
  it("preserves an inner authorization denial even if forwarding the phase throws", async () => {
    handlers.contracts.mockImplementation((_req, options) => {
      options?.onCashflowTiming?.("identity", 1);
      return json({ ok: false }, 403);
    });
    await expect(loadCashflowShadowInputs(request(), { onSourceTiming: () => { throw new Error("observer"); } }))
      .rejects.toMatchObject({ code: "forbidden", status: 403 });
  });
  it("keeps independent sources concurrent and measures sequential own/team reads separately", async () => {
    let time = 0;
    vi.spyOn(performance, "now").mockImplementation(() => time);
    handlers.profile.mockImplementation(() => { time = 5; return json(profile()); });
    const own = deferred<Response>(), team = deferred<Response>(), tip = deferred<Response>(), statement = deferred<Response>();
    handlers.contracts.mockImplementation(req => req.nextUrl.searchParams.get("scope") === "my" ? own.promise : team.promise);
    handlers.tips.mockReturnValue(tip.promise);
    handlers.statements.mockReturnValue(statement.promise);
    const onSourceTiming = vi.fn();
    const result = loadCashflowShadowInputs(request(), { onSourceTiming });
    await vi.waitFor(() => expect(handlers.statements).toHaveBeenCalledTimes(1));
    expect(handlers.contracts).toHaveBeenCalledTimes(1);
    expect(handlers.tips).toHaveBeenCalledTimes(1);
    time = 12; tip.resolve(Response.json(tips()));
    await vi.waitFor(() => expect(onSourceTiming).toHaveBeenCalledWith("cashflow_inputs_tips", 7));
    time = 20; statement.resolve(Response.json(statements()));
    await vi.waitFor(() => expect(onSourceTiming).toHaveBeenCalledWith("cashflow_inputs_statements", 15));
    time = 30; own.resolve(Response.json(contracts([], { hasTeam: true })));
    await vi.waitFor(() => expect(handlers.contracts).toHaveBeenCalledTimes(2));
    time = 40; team.resolve(Response.json(contracts()));
    await result;
    expect(onSourceTiming).toHaveBeenCalledWith("cashflow_inputs_profile", 5);
    expect(onSourceTiming).toHaveBeenCalledWith("cashflow_inputs_own_contracts", 25);
    expect(onSourceTiming).toHaveBeenCalledWith("cashflow_inputs_team_contracts", 10);
    expect(handlers.subscriptions).not.toHaveBeenCalled();
  });
  it("overlaps team loading with pending own entries only after a trusted fresh hint", async () => {
    const own = deferred<Response>(), team = deferred<Response>();
    handlers.contracts.mockImplementation((req, options) => {
      expect(options?.freshCashflowContext).toBe(true);
      if (req.nextUrl.searchParams.get("scope") === "my") {
        options?.onCashflowTeamReady?.(1);
        options?.onCashflowTeamReady?.(1); // A repeated hint cannot start another team read.
        return own.promise;
      }
      expect(options?.onCashflowTeamReady).toBeUndefined();
      return team.promise;
    });
    const result = loadCashflowShadowInputs(request(), { freshCashflowContext: true });
    let settled = false;
    void result.then(() => { settled = true; });
    await vi.waitFor(() => expect(handlers.contracts).toHaveBeenCalledTimes(2));
    team.resolve(Response.json(contracts([{ id: "team", adviserEmail: "team@example.test" }], { hasTeam: true })));
    await Promise.resolve();
    expect(settled).toBe(false);
    own.resolve(Response.json(contracts([{ id: "own" }], { hasTeam: true })));
    const loaded = await result;
    expect(loaded.snapshot.ownEntries.map(row => row.id)).toEqual(["own"]);
    expect(loaded.snapshot.teamEntriesRaw.map(row => row.id)).toEqual(["team"]);
    expect(loaded.snapshot.hasAnyTeam).toBe(true);
    expect(handlers.contracts).toHaveBeenCalledTimes(2);
  });
  it.each([-1, NaN, Infinity, 5001])("does not start early team reads for an invalid own count %s", async count => {
    const own = deferred<Response>();
    handlers.contracts.mockImplementation((req, options) => {
      if (req.nextUrl.searchParams.get("scope") === "my") {
        options?.onCashflowTeamReady?.(count);
        return own.promise;
      }
      return json(contracts());
    });
    const result = loadCashflowShadowInputs(request(), { freshCashflowContext: true });
    await vi.waitFor(() => expect(handlers.contracts).toHaveBeenCalledTimes(1));
    expect(handlers.contracts.mock.calls[0][1]?.onCashflowTeamReady).toBeTypeOf("function");
    expect(handlers.contracts).toHaveBeenCalledTimes(1);
    own.resolve(Response.json(contracts([], { hasTeam: true })));
    await result;
    expect(handlers.contracts).toHaveBeenCalledTimes(2); // Original fallback after complete own response.
  });
  it("ignores profile and client team hints and keeps no-team portfolios unchanged", async () => {
    handlers.profile.mockImplementation(() => json({ ...profile(), hasTeam: true }));
    const req = request();
    req.headers.set("x-cashflow-team-ready", "1");
    await loadCashflowShadowInputs(req, { freshCashflowContext: true });
    expect(handlers.contracts).toHaveBeenCalledTimes(1);
    expect(handlers.contracts.mock.calls[0][0].nextUrl.searchParams.get("scope")).toBe("my");
    expect(handlers.contracts.mock.calls[0][0].nextUrl.searchParams.has("targetEmail")).toBe(false);
  });
  it.each([401, 403, 429, 503])("propagates an early team denial %i after own loading finishes", async status => {
    const own = deferred<Response>();
    handlers.contracts.mockImplementation((req, options) => {
      if (req.nextUrl.searchParams.get("scope") === "my") {
        options?.onCashflowTeamReady?.(0);
        return own.promise;
      }
      return json({ ok: false }, status);
    });
    const result = loadCashflowShadowInputs(request(), { freshCashflowContext: true });
    const rejected = expect(result).rejects.toMatchObject({
      code: status === 401 ? "unauthorized" : status === 403 ? "forbidden" : "upstream_failed", status,
    });
    await vi.waitFor(() => expect(handlers.contracts).toHaveBeenCalledTimes(2));
    own.resolve(Response.json(contracts([], { hasTeam: true })));
    await rejected;
  });
  it("does not attach the scheduling hint to later own pages or any team page", async () => {
    handlers.contracts.mockImplementation((req, options) => {
      const scope = req.nextUrl.searchParams.get("scope"), cursor = req.nextUrl.searchParams.get("cursor");
      if (scope === "my" && !cursor) {
        options?.onCashflowTeamReady?.(2);
        return json(contracts([{ id: "one" }], { totalCount: 2, hasMore: true, nextCursorToken: "two", hasTeam: true }));
      }
      expect(options?.onCashflowTeamReady).toBeUndefined();
      return json(contracts(scope === "my" ? [{ id: "two" }] : [], { totalCount: scope === "my" ? null : 0 }));
    });
    const result = await loadCashflowShadowInputs(request(), { freshCashflowContext: true });
    expect(result.snapshot.ownEntries.map(row => row.id)).toEqual(["one", "two"]);
    expect(handlers.contracts).toHaveBeenCalledTimes(3);
  });
  it("keeps own failure precedence when the early team has already failed", async () => {
    const own = deferred<Response>();
    handlers.contracts.mockImplementation((req, options) => {
      if (req.nextUrl.searchParams.get("scope") === "my") {
        options?.onCashflowTeamReady?.(0);
        return own.promise;
      }
      return json({ ok: false }, 403);
    });
    const result = loadCashflowShadowInputs(request(), { freshCashflowContext: true });
    const rejected = expect(result).rejects.toMatchObject({ code: "unauthorized", status: 401 });
    await vi.waitFor(() => expect(handlers.contracts).toHaveBeenCalledTimes(2));
    own.resolve(Response.json({ ok: false }, { status: 401 }));
    await rejected;
  });
  it("retains a single shared request budget across concurrent duplicate pages", async () => {
    handlers.contracts.mockImplementation((req, options) => {
      const page = Number(req.nextUrl.searchParams.get("cursor") ?? 0);
      if (req.nextUrl.searchParams.get("scope") === "my" && page === 0) options?.onCashflowTeamReady?.(1);
      return json(contracts([{ id: "duplicate" }], {
        totalCount: page ? null : 1, hasTeam: true, hasMore: page < 40, nextCursorToken: page < 40 ? String(page + 1) : null,
      }));
    });
    await expect(loadCashflowShadowInputs(request(), { freshCashflowContext: true })).rejects.toMatchObject({ code: "limit" });
    const started = Object.values(handlers).reduce((count, handler) => count + handler.mock.calls.length, 0);
    expect(started).toBe(50);
    expect(handlers.contracts.mock.calls.every(([req]) => req.signal.aborted)).toBe(true);
  });
  it.each(["my", "team"] as const)("rejects revoked access on a later concurrent %s page", async deniedScope => {
    handlers.contracts.mockImplementation((req, options) => {
      const scope = req.nextUrl.searchParams.get("scope"), cursor = req.nextUrl.searchParams.get("cursor");
      expect(options?.freshCashflowContext).toBe(true);
      if (scope === "my" && !cursor) options?.onCashflowTeamReady?.(2);
      if (scope === deniedScope && cursor) return json({ ok: false }, 403);
      return json(contracts([{ id: cursor ? "two" : "one" }], {
        totalCount: cursor ? null : 2, hasTeam: true, hasMore: !cursor, nextCursorToken: cursor ? null : "two",
      }));
    });
    await expect(loadCashflowShadowInputs(request(), { freshCashflowContext: true })).rejects.toMatchObject({ code: "forbidden", status: 403 });
  });
  it("cancels both concurrent scopes without returning a partial portfolio", async () => {
    const controller = new AbortController();
    let hint!: (count: number) => void;
    handlers.contracts.mockImplementation((req, options) => {
      if (req.nextUrl.searchParams.get("scope") === "my") hint = options!.onCashflowTeamReady!;
      return new Promise(() => undefined);
    });
    const result = loadCashflowShadowInputs(request(controller.signal), { freshCashflowContext: true });
    const rejected = expect(result).rejects.toMatchObject({ code: "aborted", status: 499 });
    await vi.waitFor(() => expect(handlers.contracts).toHaveBeenCalledTimes(1));
    hint(0);
    await vi.waitFor(() => expect(handlers.contracts).toHaveBeenCalledTimes(2));
    controller.abort();
    await rejected;
    expect(handlers.contracts.mock.calls.every(([req]) => req.signal.aborted)).toBe(true);
    hint(0);
    expect(handlers.contracts).toHaveBeenCalledTimes(2);
  });
  it("keeps the duration cap with both concurrent scopes pending", async () => {
    vi.useFakeTimers();
    handlers.contracts.mockImplementation((req, options) => {
      if (req.nextUrl.searchParams.get("scope") === "my") options?.onCashflowTeamReady?.(0);
      return new Promise(() => undefined);
    });
    const result = loadCashflowShadowInputs(request(), { freshCashflowContext: true });
    const rejected = expect(result).rejects.toMatchObject({ code: "timeout", status: 504 });
    await vi.advanceTimersByTimeAsync(20_000);
    await rejected;
    expect(handlers.contracts).toHaveBeenCalledTimes(2);
    expect(handlers.contracts.mock.calls.every(([req]) => req.signal.aborted)).toBe(true);
  });
  it("cannot change successful loading or hide authorization errors when the observer fails", async () => {
    const onSourceTiming = vi.fn(() => { throw new Error("private observer error"); });
    await expect(loadCashflowShadowInputs(request(), { onSourceTiming })).resolves.toMatchObject({ effectiveEmail: "viewer@example.test" });
    handlers.contracts.mockImplementation(() => json({ ok: false, error: "private" }, 403));
    await expect(loadCashflowShadowInputs(request(), { onSourceTiming })).rejects.toMatchObject({
      code: "forbidden", status: 403, message: "Cashflow shadow inputs are unavailable.",
    });
  });
  it("does not enable portfolio reads or timings before authorization succeeds", async () => {
    const onSourceTiming = vi.fn();
    await expect(loadCashflowShadowInputs(request(), { authorizeEmail: () => false, onSourceTiming })).rejects.toMatchObject({ code: "not_allowed" });
    expect(onSourceTiming.mock.calls.map(([name]) => name)).toEqual(["cashflow_inputs_profile"]);
    expect(handlers.contracts).not.toHaveBeenCalled();
    expect(handlers.tips).not.toHaveBeenCalled();
    expect(handlers.statements).not.toHaveBeenCalled();
  });
  it("reports a timed-out source while preserving cancellation and the duration cap", async () => {
    vi.useFakeTimers();
    handlers.profile.mockReturnValue(new Promise(() => undefined));
    const onSourceTiming = vi.fn();
    const result = loadCashflowShadowInputs(request(), { onSourceTiming });
    const rejected = expect(result).rejects.toMatchObject({ code: "timeout", status: 504 });
    await vi.advanceTimersByTimeAsync(20_000);
    await rejected;
    expect(onSourceTiming.mock.calls.map(([name]) => name)).toEqual(["cashflow_inputs_profile"]);
    expect(handlers.profile.mock.calls[0][0].signal.aborted).toBe(true);
    expect(handlers.contracts).not.toHaveBeenCalled();
  });
  it("passes fresh context only as a trusted server option, never from the request", async () => {
    const req = request();
    req.headers.set("x-cashflow-fresh-context", "true");
    await loadCashflowShadowInputs(req);
    expect(handlers.contracts.mock.calls[0][1]).toEqual({ freshCashflowContext: false });
    handlers.contracts.mockClear();
    await loadCashflowShadowInputs(req, { freshCashflowContext: true });
    expect(handlers.contracts.mock.calls[0][1]).toEqual({
      freshCashflowContext: true, onCashflowTeamReady: expect.any(Function),
    });
  });

  it("preserves authentication and impersonation through direct handlers and normalizes portfolio owners", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    handlers.profile.mockImplementation(() => json(profile(" Viewer@Example.Test ")));
    handlers.contracts.mockImplementation(() => json(contracts([
      { id: " one ", userEmail: "ignored@example.test", adviserEmail: " OWNER@Example.Test ", inputAmount: 123 },
    ])));
    const result = await loadCashflowShadowInputs(request());
    expect(result.effectiveEmail).toBe("viewer@example.test");
    expect(result.snapshot).toMatchObject({
      email: "viewer@example.test", myPosition: "poradce", myCommissionMode: "standard",
      hasAnyTeam: false, ownEntries: [{ id: "one", userEmail: "owner@example.test", inputAmount: 123 }],
      teamEntriesRaw: [], tipPayouts: [], subscriptionPayments: [],
    });
    for (const handler of [handlers.profile, handlers.contracts, handlers.tips, handlers.statements]) {
      const child = handler.mock.calls[0][0];
      expect(child.method).toBe("GET");
      expect(child.nextUrl.origin).toBe("http://cashflow-shadow.internal");
      expect(child.headers.get("authorization")).toBe("Bearer actor-token");
      expect(child.headers.get("cookie")).toBe("impersonation=verified-cookie");
      expect(child.nextUrl.searchParams.has("targetEmail")).toBe(false);
    }
    expect(handlers.contracts.mock.calls[0][0].nextUrl.searchParams.get("shape")).toBe("cashflow");
    expect(handlers.subscriptions).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });

  it("waits for authenticated asynchronous authorization before any expensive reads", async () => {
    const allowed = deferred<boolean>();
    const authorizeEmail = vi.fn(() => allowed.promise);
    const result = loadCashflowShadowInputs(request(), { authorizeEmail });
    await vi.waitFor(() => expect(authorizeEmail).toHaveBeenCalledWith("viewer@example.test"));
    expect(handlers.contracts).not.toHaveBeenCalled();
    expect(handlers.tips).not.toHaveBeenCalled();
    expect(handlers.statements).not.toHaveBeenCalled();
    allowed.resolve(false);
    await expect(result).rejects.toMatchObject({ code: "not_allowed", status: 403 });
    expect(handlers.contracts).not.toHaveBeenCalled();
  });

  it("propagates a controlled authorization rejection before portfolio loading", async () => {
    const denied = new Error("rate limited");
    await expect(loadCashflowShadowInputs(request(), { authorizeEmail: async () => { throw denied; } })).rejects.toBe(denied);
    expect(handlers.contracts).not.toHaveBeenCalled();
  });

  it.each([401, 403, 429])("does not downgrade a profile %i into successful empty data", async status => {
    handlers.profile.mockImplementation(() => json({ ok: false, error: "sensitive backend text" }, status));
    await expect(loadCashflowShadowInputs(request())).rejects.toMatchObject({ status, message: "Cashflow shadow inputs are unavailable." });
    expect(handlers.contracts).not.toHaveBeenCalled();
  });

  it("rejects a missing profile before authorizing portfolio access", async () => {
    handlers.profile.mockImplementation(() => json({ ...profile(), hasProfile: false }));
    const authorizeEmail = vi.fn(() => true);
    await expect(loadCashflowShadowInputs(request(), { authorizeEmail })).rejects.toMatchObject({ code: "incomplete" });
    expect(authorizeEmail).not.toHaveBeenCalled();
    expect(handlers.contracts).not.toHaveBeenCalled();
  });

  it("collects all pages with owner-aware deduplication and follows team hints", async () => {
    handlers.contracts.mockImplementation(child => {
      const scope = child.nextUrl.searchParams.get("scope");
      const cursor = child.nextUrl.searchParams.get("cursor");
      if (scope === "team") return json(contracts([{ id: "shared", adviserEmail: "team@example.test" }]));
      if (cursor === "page-2") return json(contracts([{ id: "shared" }, { id: "second" }], { totalCount: null }));
      return json(contracts([{ id: "shared" }], { totalCount: 2, hasMore: true, nextCursorToken: "page-2", hasTeam: false, teamEmails: ["team@example.test"] }));
    });
    handlers.tips.mockImplementation(child => child.nextUrl.searchParams.get("cursor") === "23"
      ? json(tips([{ id: "a", amount: 1 }, { id: "b", amount: 2 }]))
      : json(tips([{ id: "a", amount: 1 }], { hasMore: true, nextCursor: 23 })));
    const onSourceTiming = vi.fn();
    const { snapshot } = await loadCashflowShadowInputs(request(), { onSourceTiming });
    expect(onSourceTiming.mock.calls.filter(([name]) => name === "cashflow_inputs_own_contracts")).toHaveLength(2);
    expect(onSourceTiming.mock.calls.filter(([name]) => name === "cashflow_inputs_team_contracts")).toHaveLength(1);
    expect(onSourceTiming.mock.calls.filter(([name]) => name === "cashflow_inputs_tips")).toHaveLength(2);
    expect(snapshot.ownEntries.map(entry => entry.id)).toEqual(["shared", "second"]);
    expect(snapshot.teamEntriesRaw[0].userEmail).toBe("team@example.test");
    expect(snapshot.hasAnyTeam).toBe(true);
    expect(snapshot.tipPayouts).toEqual([{ id: "a", amount: 1 }, { id: "b", amount: 2 }]);
    expect(handlers.contracts).toHaveBeenCalledTimes(3);
  });

  it("loads complete portfolios in the same 500-row pages as the cashflow API with fresh authorization on every page", async () => {
    const own = Array.from({ length: 1001 }, (_, i) => ({ id: String(i), inputAmount: i, userEmail: " Viewer@Example.Test " }));
    const team = Array.from({ length: 501 }, (_, i) => ({ id: String(i), inputAmount: i, adviserEmail: " Team@Example.Test " }));
    handlers.contracts.mockImplementation((child, options) => {
      expect(options?.freshCashflowContext).toBe(true);
      const firstOwnPage = child.nextUrl.searchParams.get("scope") === "my" && !child.nextUrl.searchParams.has("cursor");
      expect(options?.onCashflowTeamReady).toEqual(firstOwnPage ? expect.any(Function) : undefined);
      expect(child.headers.get("authorization")).toBe("Bearer actor-token");
      expect(child.headers.get("cookie")).toBe("impersonation=verified-cookie");
      expect(child.nextUrl.searchParams.get("shape")).toBe("cashflow");
      expect(child.nextUrl.searchParams.get("limit")).toBe(String(CASHFLOW_CONTRACTS_PAGE_SIZE));
      const source = child.nextUrl.searchParams.get("scope") === "team" ? team : own;
      const offset = Number(child.nextUrl.searchParams.get("cursor") ?? 0);
      const next = offset + CASHFLOW_CONTRACTS_PAGE_SIZE;
      return json(contracts(source.slice(offset, next), {
        totalCount: offset ? null : source.length, hasTeam: true, teamEmails: ["team@example.test"],
        hasMore: next < source.length, nextCursorToken: next < source.length ? String(next) : null,
      }));
    });
    const result = await loadCashflowShadowInputs(request(), { freshCashflowContext: true });
    expect(CASHFLOW_CONTRACTS_PAGE_SIZE).toBe(500);
    expect(result.snapshot.ownEntries).toEqual(own.map(item => ({ ...item, userEmail: "viewer@example.test" })));
    expect(result.snapshot.teamEntriesRaw).toEqual(team.map(item => ({ ...item, userEmail: "team@example.test" })));
    expect(result.snapshot.hasAnyTeam).toBe(true);
    expect(handlers.contracts).toHaveBeenCalledTimes(5);
  });

  it.each(["my", "team"] as const)("rejects revoked access on a later %s page without returning earlier authorized rows", async scope => {
    handlers.contracts.mockImplementation(child => {
      const currentScope = child.nextUrl.searchParams.get("scope");
      if (currentScope !== scope) return json(contracts([], { hasTeam: true }));
      if (child.nextUrl.searchParams.has("cursor")) return json({ ok: false, error: "private backend reason" }, 403);
      return json(contracts(Array.from({ length: 500 }, (_, i) => ({ id: String(i) })), {
        totalCount: 501, hasTeam: true, hasMore: true, nextCursorToken: "remaining",
      }));
    });
    await expect(loadCashflowShadowInputs(request(), { freshCashflowContext: true })).rejects.toMatchObject({
      code: "forbidden", status: 403, message: "Cashflow shadow inputs are unavailable.",
    });
    expect(handlers.contracts.mock.calls.every(([, options]) => options?.freshCashflowContext === true)).toBe(true);
  });

  it("rejects a response larger than the existing API page cap", async () => {
    handlers.contracts.mockImplementation(() => json(contracts(Array.from({ length: 501 }, (_, i) => ({ id: String(i) })))));
    await expect(loadCashflowShadowInputs(request())).rejects.toMatchObject({ code: "incomplete" });
    expect(handlers.contracts).toHaveBeenCalledOnce();
  });

  it("rejects an oversized declared portfolio before requesting more pages", async () => {
    handlers.contracts.mockImplementation(() => json(contracts([], { totalCount: 5001, hasMore: true, nextCursorToken: "next" })));
    await expect(loadCashflowShadowInputs(request())).rejects.toMatchObject({ code: "limit" });
    expect(handlers.contracts).toHaveBeenCalledOnce();
  });

  it.each([[2500, false], [2501, false], [2500, true], [2501, true]] as const)("keeps the combined own/team bound with %i team rows and fresh context %s", async (teamCount, freshCashflowContext) => {
    handlers.contracts.mockImplementation((child, options) => {
      if (child.nextUrl.searchParams.get("scope") === "my" && !child.nextUrl.searchParams.has("cursor")) options?.onCashflowTeamReady?.(2500);
      const totalCount = child.nextUrl.searchParams.get("scope") === "team" ? teamCount : 2500;
      const offset = Number(child.nextUrl.searchParams.get("cursor") ?? 0);
      const next = Math.min(offset + 500, totalCount);
      return json(contracts(Array.from({ length: next - offset }, (_, i) => ({ id: String(offset + i) })), {
        totalCount: offset ? null : totalCount, hasTeam: true,
        hasMore: next < totalCount, nextCursorToken: next < totalCount ? String(next) : null,
      }));
    });
    const result = loadCashflowShadowInputs(request(), { freshCashflowContext });
    if (teamCount === 2500) {
      const { snapshot } = await result;
      expect(snapshot.ownEntries).toHaveLength(2500);
      expect(snapshot.teamEntriesRaw).toHaveLength(2500);
      expect(handlers.contracts).toHaveBeenCalledTimes(10);
    } else {
      await expect(result).rejects.toMatchObject({ code: "limit" });
      expect(handlers.contracts).toHaveBeenCalledTimes(6);
    }
  });

  it("counts duplicate source rows against the aggregate contract bound", async () => {
    let page = 0;
    handlers.contracts.mockImplementation(() => json(contracts(Array.from({ length: 500 }, (_, i) => ({ id: String(i) })), {
      totalCount: 501, hasMore: true, nextCursorToken: String(++page),
    })));
    await expect(loadCashflowShadowInputs(request())).rejects.toMatchObject({ code: "limit" });
    expect(handlers.contracts).toHaveBeenCalledTimes(11);
  });

  it("loads only TIP payouts and statements for the profile's tipster mode", async () => {
    handlers.profile.mockImplementation(() => json(profile(SUBSCRIPTION_CASHFLOW_OWNER_EMAIL, { accountType: null, userRole: " TIPSTER " })));
    handlers.tips.mockImplementation(() => json(tips([{ id: "tip", amount: 250 }])));
    const result = await loadCashflowShadowInputs(request());
    expect(result.tipsterMode).toBe(true);
    expect(result.snapshot).toMatchObject({ myPosition: null, hasAnyTeam: false, ownEntries: [], teamEntriesRaw: [], tipPayouts: [{ id: "tip", amount: 250 }] });
    expect(handlers.contracts).not.toHaveBeenCalled();
    expect(handlers.subscriptions).not.toHaveBeenCalled();
    expect(handlers.statements).toHaveBeenCalledOnce();
  });

  it("includes eligible subscription payments but rejects their unpageable limit", async () => {
    handlers.profile.mockImplementation(() => json(profile(SUBSCRIPTION_CASHFLOW_OWNER_EMAIL)));
    handlers.subscriptions.mockImplementationOnce(() => json({ ok: true, payments: [{ id: "payment", amountCzk: 350 }], hasMore: false }));
    expect((await loadCashflowShadowInputs(request())).snapshot.subscriptionPayments).toEqual([{ id: "payment", amountCzk: 350 }]);
    expect(handlers.subscriptions.mock.calls[0][0].nextUrl.searchParams.get("limit")).toBe("5000");
    handlers.subscriptions.mockImplementation(() => json({ ok: true, payments: [], hasMore: true }));
    await expect(loadCashflowShadowInputs(request())).rejects.toMatchObject({ code: "incomplete" });
  });

  it.each([
    { totalCount: 2 },
    { totalCount: null },
    { hasMore: true, nextCursorToken: null },
    { hasMore: undefined },
    { contracts: undefined },
  ])("rejects incomplete contracts: %j", async extra => {
    handlers.contracts.mockImplementation(() => json(contracts([{ id: "one" }], extra)));
    await expect(loadCashflowShadowInputs(request())).rejects.toMatchObject({ code: "incomplete" });
  });

  it("rejects repeated pagination cursors instead of accepting a partial portfolio", async () => {
    handlers.contracts.mockImplementation(() => json(contracts([{ id: "one" }], { totalCount: 2, hasMore: true, nextCursorToken: "same" })));
    await expect(loadCashflowShadowInputs(request())).rejects.toMatchObject({ code: "incomplete" });
    expect(handlers.contracts).toHaveBeenCalledTimes(2);
  });

  it("rejects a team authorization change rather than silently dropping team cashflow", async () => {
    handlers.contracts.mockImplementation(child => child.nextUrl.searchParams.get("scope") === "team"
      ? json({ ok: false }, 403)
      : json(contracts([], { hasTeam: true })));
    await expect(loadCashflowShadowInputs(request())).rejects.toMatchObject({ code: "forbidden" });
  });

  it.each(["tips", "subscriptions", "statements"] as const)("fails on %s errors even when the client would have continued", async source => {
    handlers.profile.mockImplementation(() => json(profile(SUBSCRIPTION_CASHFLOW_OWNER_EMAIL)));
    handlers[source].mockImplementation(() => json({ ok: false }, 500));
    await expect(loadCashflowShadowInputs(request())).rejects.toMatchObject({ code: "upstream_failed" });
  });

  it.each([{ hasMore: true }, { hasMore: undefined }, { processingComplete: false }, { processingComplete: undefined }])("rejects statements with uncertain completeness or an incomplete import: %j", async extra => {
    handlers.statements.mockImplementation(() => json(statements(extra)));
    await expect(loadCashflowShadowInputs(request())).rejects.toMatchObject({ code: "incomplete" });
  });

  it("deduplicates statements by the same identity and recency as the browser", async () => {
    const common = { statementNumber: "42", advisorNumber: "7", fileName: "statement", period: "09/2026" };
    handlers.statements.mockImplementation(() => json(statements({ items: [
      { ...common, id: "old", updatedAtMs: 1 }, { ...common, id: "new", updatedAtMs: 2 },
    ] })));
    expect((await loadCashflowShadowInputs(request())).statements.map(item => item.id)).toEqual(["new"]);
  });

  it("caps total requests even when every page advertises a new cursor", async () => {
    let count = 0;
    handlers.tips.mockImplementation(() => json(tips([{ id: String(++count) }], { hasMore: true, nextCursorToken: String(count) })));
    await expect(loadCashflowShadowInputs(request())).rejects.toMatchObject({ code: "limit" });
    const calls = Object.values(handlers).reduce((sum, handler) => sum + handler.mock.calls.length, 0);
    expect(calls).toBe(50);
  });

  it("starts no handler for an already aborted caller", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(loadCashflowShadowInputs(request(controller.signal))).rejects.toMatchObject({ code: "aborted" });
    expect(handlers.profile).not.toHaveBeenCalled();
  });

  it("bounds a stalled handler and aborts its request without exposing a partial result", async () => {
    vi.useFakeTimers();
    handlers.profile.mockImplementation(() => new Promise(() => undefined));
    const result = loadCashflowShadowInputs(request());
    const rejected = expect(result).rejects.toMatchObject({ code: "timeout", status: 504 });
    await vi.advanceTimersByTimeAsync(20_000);
    await rejected;
    expect(handlers.profile.mock.calls[0][0].signal.aborted).toBe(true);
    expect(handlers.contracts).not.toHaveBeenCalled();
  });

  it("aborts in-flight input reads when the caller disconnects", async () => {
    const controller = new AbortController();
    handlers.contracts.mockImplementation(() => new Promise(() => undefined));
    const result = loadCashflowShadowInputs(request(controller.signal));
    await vi.waitFor(() => expect(handlers.contracts).toHaveBeenCalledOnce());
    const rejected = expect(result).rejects.toMatchObject({ code: "aborted" });
    controller.abort();
    await rejected;
    expect(handlers.contracts.mock.calls[0][0].signal.aborted).toBe(true);
  });

  it("stops sibling pagination after another required source fails", async () => {
    const pending = deferred<Response>();
    handlers.contracts.mockImplementation(() => pending.promise);
    handlers.tips.mockImplementation(() => json({ ok: false }, 500));
    await expect(loadCashflowShadowInputs(request())).rejects.toMatchObject({ code: "upstream_failed" });
    expect(handlers.contracts.mock.calls[0][0].signal.aborted).toBe(true);
    pending.resolve(Response.json(contracts([{ id: "one" }], { totalCount: 2, hasMore: true, nextCursorToken: "next" })));
    await Promise.resolve();
    await Promise.resolve();
    expect(handlers.contracts).toHaveBeenCalledOnce();
  });
});
