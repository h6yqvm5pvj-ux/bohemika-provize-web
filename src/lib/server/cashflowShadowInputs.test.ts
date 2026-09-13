import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SUBSCRIPTION_CASHFLOW_OWNER_EMAIL } from "@/app/cashflow/subscriptionCashflow";
import { loadCashflowShadowInputs } from "./cashflowShadowInputs";

const handlers = vi.hoisted(() => ({
  profile: vi.fn<(request: NextRequest) => Promise<Response>>(),
  contracts: vi.fn<(request: NextRequest, options?: { freshCashflowContext?: boolean }) => Promise<Response>>(),
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

afterEach(() => vi.useRealTimers());

describe("cashflow shadow independent inputs", () => {
  it("passes fresh context only as a trusted server option, never from the request", async () => {
    const req = request();
    req.headers.set("x-cashflow-fresh-context", "true");
    await loadCashflowShadowInputs(req);
    expect(handlers.contracts.mock.calls[0][1]).toEqual({ freshCashflowContext: false });
    handlers.contracts.mockClear();
    await loadCashflowShadowInputs(req, { freshCashflowContext: true });
    expect(handlers.contracts.mock.calls[0][1]).toEqual({ freshCashflowContext: true });
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
    const { snapshot } = await loadCashflowShadowInputs(request());
    expect(snapshot.ownEntries.map(entry => entry.id)).toEqual(["shared", "second"]);
    expect(snapshot.teamEntriesRaw[0].userEmail).toBe("team@example.test");
    expect(snapshot.hasAnyTeam).toBe(true);
    expect(snapshot.tipPayouts).toEqual([{ id: "a", amount: 1 }, { id: "b", amount: 2 }]);
    expect(handlers.contracts).toHaveBeenCalledTimes(3);
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
