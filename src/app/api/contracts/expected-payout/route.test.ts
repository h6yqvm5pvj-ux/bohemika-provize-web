import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeWorkerFixture } from "../../../../../scripts/cashflow-worker/fixtures";
import { computeExpectedPayout } from "@/app/home/expectedPayout";
import { cashflowCalendarDate } from "@/lib/server/cashflowCalendar";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), statements: vi.fn(), inputs: vi.fn(), budget: vi.fn() }));
vi.mock("../_lib/contractsApi", () => ({ requireContractsEntryGuard: mocks.guard }));
vi.mock("@/lib/server/homeExpectedPayoutInputs", () => ({
  loadExpectedPayoutStatements: mocks.statements, loadExpectedPayoutInputs: mocks.inputs,
}));
vi.mock("@/lib/server/cashflowShadowBudget", () => ({ cashflowShadowBudgetFailure: mocks.budget }));
import { CashflowShadowInputsError } from "@/lib/server/cashflowShadowInputs";
import { GET } from "./route";

const now = Date.UTC(2026, 8, 27, 12);
const email = "advisor@example.test";
let fixture = makeWorkerFixture(12, new Date(now));
const request = (query = "timeZone=UTC", signal?: AbortSignal) => new NextRequest(
  `https://example.test/api/contracts/expected-payout?${query}`,
  { headers: { Authorization: "Bearer synthetic-token" }, signal },
);
const guard = () => ({
  ok: true, ctx: { email, uid: "verified-uid", accountType: "advisor" },
  withRateLimit: (response: NextResponse) => { response.headers.set("X-RateLimit-Limit", "12"); return response; },
});
const inputs = () => ({ ...fixture, effectiveEmail: email, tipsterMode: false });

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  fixture = makeWorkerFixture(12, new Date(now));
  mocks.guard.mockResolvedValue(guard());
  mocks.statements.mockResolvedValue([]);
  mocks.inputs.mockImplementation(async () => inputs());
  mocks.budget.mockReturnValue(null);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("home expected payout summary", () => {
  it.each([4321, 0, -120.5])("skips all portfolio reads when complete statements supply %s", async amount => {
    mocks.statements.mockResolvedValue([{ id: "paid-current", payoutMonthKey: "2026-9", payoutTotal: amount }]);
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, monthKey: "2026-9", updatedAt: now,
      payout: { grossAmount: amount, stornoFundAmount: 0, netAmount: amount } });
    expect(mocks.statements).toHaveBeenCalledOnce();
    expect(mocks.inputs).not.toHaveBeenCalled();
    expect(mocks.budget).not.toHaveBeenCalled();
  });

  it.each([12, 200])("returns the unchanged full calculation for %s contracts and older instalments", async count => {
    fixture = makeWorkerFixture(count, new Date(now));
    fixture.statements = [];
    const before = structuredClone(fixture);
    const response = await GET(request());
    const actual = await response.json();
    const expected = computeExpectedPayout({ ...fixture, asOf: cashflowCalendarDate(now, "UTC")! });

    expect(response.status).toBe(200);
    expect(actual.payout).toEqual(expected);
    expect(actual.payout.grossAmount).toBeGreaterThan(0);
    expect(Object.keys(actual).sort()).toEqual(["monthKey", "ok", "payout", "updatedAt"]);
    expect(JSON.stringify(actual)).not.toMatch(/advisor@example|member-|contract-|Syntetický|synthetic-token/);
    expect(fixture).toEqual(before);
    expect(mocks.budget).toHaveBeenCalledWith(fixture.snapshot, expect.any(Date), false,
      { scopeFilter: "combined", productFilter: "all", tipsterMode: false });
    expect(mocks.inputs).toHaveBeenCalledWith(expect.any(NextRequest),
      { email, uid: "verified-uid", accountType: "advisor" }, [], expect.objectContaining({ authorizedContext: expect.objectContaining({ ok: true }) }));
    expect(mocks.guard).toHaveBeenCalledWith(expect.any(NextRequest), expect.objectContaining({ limit: 12 }), { freshCashflowContext: true });
    expect(response.headers.get("Cache-Control")).toContain("private, no-store");
    expect(response.headers.get("Vary")).toContain("Authorization");
    expect(response.headers.get("Server-Timing")).toContain("cashflow_compute");
    expect(response.headers.get("X-RateLimit-Limit")).toBe("12");
  });

  it("uses each browser calendar at the month boundary without changing the server time zone", async () => {
    vi.setSystemTime(Date.UTC(2026, 9, 1, 0, 30));
    const originalTZ = process.env.TZ;
    mocks.statements.mockResolvedValue([
      { id: "september", payoutMonthKey: "2026-9", payoutTotal: 10 },
      { id: "october", payoutMonthKey: "2026-10", payoutTotal: 20 },
    ]);
    const responses = await Promise.all([
      GET(request("timeZone=America%2FNew_York")), GET(request("timeZone=Asia%2FTokyo")),
    ]);
    expect(await responses[0].json()).toMatchObject({ monthKey: "2026-9", payout: { netAmount: 10 } });
    expect(await responses[1].json()).toMatchObject({ monthKey: "2026-10", payout: { netAmount: 20 } });
    expect(process.env.TZ).toBe(originalTZ);
    expect(mocks.inputs).not.toHaveBeenCalled();
  });

  it.each([401, 403, 429])("denies %s before any financial data is read and masks upstream errors", async status => {
    mocks.guard.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "synthetic internal path /private/test and stack" },
      { status, headers: { "Retry-After": "60", "X-RateLimit-Limit": "12" } }) });
    const response = await GET(request());
    expect(response.status).toBe(status);
    expect(await response.text()).not.toMatch(/private|stack|synthetic|client_calculation_required/);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(mocks.statements).not.toHaveBeenCalled();
    expect(mocks.inputs).not.toHaveBeenCalled();
  });

  it.each(["", "timeZone=invalid-zone", "timeZone=UTC&timeZone=Europe%2FPrague",
    "timeZone=UTC&ownerEmail=other%40example.test", "timeZone=UTC&role=admin", `timeZone=${"x".repeat(101)}`])(
    "rejects manipulated or invalid parameters: %s", async query => {
      expect((await GET(request(query))).status).toBe(400);
      expect(mocks.statements).not.toHaveBeenCalled();
      expect(mocks.inputs).not.toHaveBeenCalled();
    },
  );

  it("rejects non-advisor accounts without returning another account's payout", async () => {
    mocks.guard.mockResolvedValue({ ...guard(), ctx: { ...guard().ctx, accountType: "tipster" } });
    expect((await GET(request())).status).toBe(403);
    expect(mocks.statements).not.toHaveBeenCalled();
  });

  it.each(["effectiveEmail", "snapshotEmail", "tipsterMode"])("rejects mismatched server source context: %s", async change => {
    const source = inputs();
    if (change === "effectiveEmail") source.effectiveEmail = "another@example.test";
    if (change === "snapshotEmail") source.snapshot.email = "another@example.test";
    if (change === "tipsterMode") source.tipsterMode = true;
    mocks.inputs.mockResolvedValue(source);
    const response = await GET(request());
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain("payout");
    expect(mocks.budget).not.toHaveBeenCalled();
  });

  it.each(["incomplete", "upstream_failed"] as const)("does not report false zero for %s inputs", async code => {
    mocks.statements.mockRejectedValue(new CashflowShadowInputsError(code));
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: expect.any(String) });
    expect(mocks.inputs).not.toHaveBeenCalled();
  });

  it.each(["limit", "timeout"] as const)("retains the existing browser calculation on a server %s", async code => {
    mocks.inputs.mockRejectedValue(new CashflowShadowInputsError(code));
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, code: "client_calculation_required" });
  });

  it("returns a fallback before starting an oversized synchronous calculation", async () => {
    mocks.budget.mockReturnValue("output_estimate");
    const response = await GET(request());
    expect(await response.json()).toMatchObject({ ok: false, code: "client_calculation_required" });
    expect(response.headers.get("Server-Timing")).not.toContain("cashflow_compute");
  });

  it("bounds statement matching before reading contracts, without truncating financial results", async () => {
    mocks.statements.mockResolvedValue([{ id: "historical", payoutMonthKey: "2026-8",
      paidContractNumbers: Array(100_001).fill("synthetic-contract") }]);
    const response = await GET(request());
    expect(await response.json()).toMatchObject({ ok: false, code: "client_calculation_required" });
    expect(mocks.inputs).not.toHaveBeenCalled();
  });

  it("does not require statement matching budgets when a paid current-month total suffices", async () => {
    mocks.statements.mockResolvedValue([{ id: "current", payoutMonthKey: "2026-9", payoutTotal: 42,
      paidContractNumbers: Array(100_001).fill("synthetic-contract") }]);
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, payout: { netAmount: 42 } });
    expect(mocks.inputs).not.toHaveBeenCalled();
  });

  it("allows legacy browser date handling when a server calendar cannot interpret a legacy field", async () => {
    mocks.budget.mockImplementation(() => { throw new Error("Unsupported cashflow date format"); });
    const response = await GET(request());
    expect(await response.json()).toMatchObject({ ok: false, code: "client_calculation_required" });
  });

  it("ignores cancelled requests and never starts portfolio reads after cancellation", async () => {
    const controller = new AbortController();
    mocks.statements.mockImplementation(async () => { controller.abort(); return []; });
    expect((await GET(request("timeZone=UTC", controller.signal))).status).toBe(499);
    expect(mocks.inputs).not.toHaveBeenCalled();
  });

  it("rejects results whose calendar day changed while data was loading", async () => {
    mocks.statements.mockImplementation(async () => {
      vi.setSystemTime(now + 86_400_000);
      return [{ id: "paid-current", payoutMonthKey: "2026-9", payoutTotal: 100 }];
    });
    const response = await GET(request());
    expect(response.status).toBe(409);
    expect(await response.text()).not.toContain("netAmount");
  });

  it("rejects non-finite totals instead of serializing a misleading null amount", async () => {
    mocks.statements.mockResolvedValue([
      { id: "large-a", payoutMonthKey: "2026-9", payoutTotal: Number.MAX_VALUE },
      { id: "large-b", payoutMonthKey: "2026-9", payoutTotal: Number.MAX_VALUE },
    ]);
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: expect.any(String) });
  });
});
