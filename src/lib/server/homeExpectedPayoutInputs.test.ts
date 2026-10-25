import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthorizedContractsContext } from "@/app/api/contracts/_lib/contractsApi";
import type { CashflowCommissionStatementSummary } from "@/app/cashflow/types";
import { CashflowShadowInputsError } from "./cashflowShadowInputs";
import { loadExpectedPayoutInputs, loadExpectedPayoutStatements } from "./homeExpectedPayoutInputs";

const handlers = vi.hoisted(() => ({
  profile: vi.fn(), contracts: vi.fn(), tips: vi.fn(), subscriptions: vi.fn(), statements: vi.fn(),
}));
vi.mock("@/app/api/user/profile/route", () => ({ GET: handlers.profile }));
vi.mock("@/app/api/contracts/_lib/contractsApi", () => ({ handleContractsList: handlers.contracts }));
vi.mock("@/app/api/tip-payouts/list/route", () => ({ GET: handlers.tips }));
vi.mock("@/app/api/subscription-payments/list/route", () => ({ GET: handlers.subscriptions }));
vi.mock("@/app/api/commission-statements/route", () => ({ GET: handlers.statements }));

const email = "viewer@example.test";
const context = { email, uid: "synthetic-uid", accountType: "advisor" as const };
const request = (signal?: AbortSignal) => new NextRequest("https://example.test/api/contracts/expected-payout?targetEmail=foreign@example.test&role=admin", {
  method: "POST", headers: { authorization: "Bearer synthetic-token", "x-bohemika-impersonate-email": email }, signal,
});
const json = (data: unknown, status = 200) => Promise.resolve(Response.json(data, { status }));
const list = (contracts: Record<string, unknown>[] = [], extra: Record<string, unknown> = {}) => ({
  ok: true, contracts, totalCount: contracts.length, hasMore: false, hasTeam: false, teamEmails: [],
  position: "poradce3", commissionMode: "standard", ...extra,
});
const statementResponse = (extra: Record<string, unknown> = {}) => ({
  ok: true, items: [], hasMore: false, processingComplete: true, ...extra,
});
const authorized = () => ({ ok: true, ctx: { ...context } }) as AuthorizedContractsContext;

beforeEach(() => {
  vi.resetAllMocks();
  handlers.contracts.mockImplementation(() => json(list()));
  handlers.tips.mockImplementation(() => json({ ok: true, payouts: [], hasMore: false }));
  handlers.statements.mockImplementation(() => json(statementResponse()));
});
afterEach(() => vi.useRealTimers());

describe("home expected payout source loading", () => {
  it("loads only complete statements for the fast path through the protected handler", async () => {
    const statements = [{ id: "statement", payoutTotal: 0, payoutMonthKey: "2026-10" }];
    handlers.statements.mockImplementation(() => json(statementResponse({ items: statements })));
    const onSourceTiming = vi.fn();
    expect(await loadExpectedPayoutStatements(request(), { onSourceTiming })).toEqual(statements);
    expect(handlers.statements).toHaveBeenCalledOnce();
    const inner = handlers.statements.mock.calls[0][0] as NextRequest;
    expect(inner.method).toBe("GET");
    expect(inner.nextUrl.pathname).toBe("/api/commission-statements");
    expect(Object.fromEntries(inner.nextUrl.searchParams)).toEqual({ shape: "cashflow", limit: "240" });
    expect(inner.headers.get("authorization")).toBe("Bearer synthetic-token");
    expect(inner.headers.get("x-bohemika-impersonate-email")).toBe(email);
    for (const handler of [handlers.profile, handlers.contracts, handlers.tips, handlers.subscriptions]) expect(handler).not.toHaveBeenCalled();
    expect(onSourceTiming).toHaveBeenCalledWith("cashflow_inputs_statements", expect.any(Number));
  });

  it.each([
    { hasMore: true }, { processingComplete: false }, { items: [{ id: "" }] },
    { items: Array.from({ length: 241 }, (_, id) => ({ id: String(id) })) }, { items: [null] },
  ])("rejects incomplete statement inputs: %j", async invalid => {
    handlers.statements.mockImplementation(() => json(statementResponse(invalid)));
    await expect(loadExpectedPayoutStatements(request())).rejects.toMatchObject({ code: "incomplete" });
  });

  it.each([401, 403, 429])("keeps the protected statement handler's %i denial", async status => {
    handlers.statements.mockImplementation(() => json({ ok: false }, status));
    await expect(loadExpectedPayoutStatements(request())).rejects.toMatchObject({ status });
  });

  it("reuses verified context and statements while loading every other protected source", async () => {
    const guard = authorized();
    const statements = [{ id: "statement", payoutTotal: 12 }] as CashflowCommissionStatementSummary[];
    handlers.contracts.mockImplementation((req: NextRequest) => json(list([
      { id: req.nextUrl.searchParams.get("scope"), adviserEmail: req.nextUrl.searchParams.get("scope") === "team" ? "team@example.test" : email },
    ], { hasTeam: true, teamEmails: ["team@example.test"] })));
    const result = await loadExpectedPayoutInputs(request(), context, statements, { authorizedContext: guard });
    expect(result.effectiveEmail).toBe(email);
    expect(result.snapshot.email).toBe(email);
    expect(result.snapshot.ownEntries.map(item => item.id)).toEqual(["my"]);
    expect(result.snapshot.teamEntriesRaw.map(item => item.id)).toEqual(["team"]);
    expect(result.statements).toEqual(statements);
    expect(handlers.profile).not.toHaveBeenCalled();
    expect(handlers.statements).not.toHaveBeenCalled();
    expect(handlers.subscriptions).not.toHaveBeenCalled();
    expect(handlers.tips).toHaveBeenCalledOnce();
    for (const [inner, options] of handlers.contracts.mock.calls) {
      expect(options).toMatchObject({ freshCashflowContext: true, authorizedContext: guard });
      expect((inner as NextRequest).headers.get("authorization")).toBe("Bearer synthetic-token");
      expect((inner as NextRequest).nextUrl.searchParams.get("targetEmail")).toBeNull();
    }
  });

  it.each(["email", "uid", "accountType"])("rejects a mismatched verified %s before portfolio reads", async field => {
    const guard = authorized();
    Object.assign(guard.ctx, { [field]: field === "accountType" ? "tipster" : "foreign@example.test" });
    await expect(loadExpectedPayoutInputs(request(), context, [], { authorizedContext: guard }))
      .rejects.toMatchObject({ code: "forbidden", status: 403 });
    for (const handler of Object.values(handlers)) expect(handler).not.toHaveBeenCalled();
  });

  it("accepts a complete portfolio above the diagnostic 5,000-row limit", async () => {
    handlers.contracts.mockImplementation((req: NextRequest) => {
      const offset = Number(req.nextUrl.searchParams.get("cursor") ?? 0);
      const contracts = Array.from({ length: 500 }, (_, index) => ({ id: String(offset + index), adviserEmail: email }));
      return json(list(contracts, { totalCount: 5_500, hasMore: offset < 5_000, nextCursorToken: String(offset + 500) }));
    });
    const result = await loadExpectedPayoutInputs(request(), context, []);
    expect(result.snapshot.ownEntries).toHaveLength(5_500);
    expect(handlers.contracts).toHaveBeenCalledTimes(11);
  });

  it("rejects oversized or truncated portfolios rather than returning partial totals", async () => {
    handlers.contracts.mockImplementation(() => json(list([], { totalCount: 20_001 })));
    await expect(loadExpectedPayoutInputs(request(), context, [])).rejects.toMatchObject({ code: "limit" });
    handlers.contracts.mockImplementation(() => json(list([], { totalCount: 1 })));
    await expect(loadExpectedPayoutInputs(request(), context, [])).rejects.toMatchObject({ code: "incomplete" });
  });

  it("preserves source authorization failure even with a verified outer context", async () => {
    handlers.contracts.mockImplementation(() => json({ ok: false }, 403));
    const pending = loadExpectedPayoutInputs(request(), context, [], { authorizedContext: authorized() });
    await expect(pending).rejects.toBeInstanceOf(CashflowShadowInputsError);
    await expect(pending).rejects.toMatchObject({ code: "forbidden", status: 403 });
  });

  it("aborts pending source handlers and reports the fixed production timeout", async () => {
    vi.useFakeTimers();
    handlers.contracts.mockImplementation(() => new Promise(() => {}));
    const pending = loadExpectedPayoutInputs(request(), context, []);
    const rejected = expect(pending).rejects.toMatchObject({ code: "timeout", status: 504 });
    await vi.advanceTimersByTimeAsync(45_000);
    await rejected;
    const inner = handlers.contracts.mock.calls[0][0] as NextRequest;
    expect(inner.signal.aborted).toBe(true);
  });

  it("does not start any data source for an already cancelled request", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(loadExpectedPayoutInputs(request(controller.signal), context, [])).rejects.toMatchObject({ code: "aborted" });
    for (const handler of Object.values(handlers)) expect(handler).not.toHaveBeenCalled();
  });
});
