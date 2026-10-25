import { afterEach, describe, expect, it, vi } from "vitest";
import { makeWorkerFixture } from "../../../scripts/cashflow-worker/fixtures";
import { computeCashflow } from "@/app/cashflow/computeCashflow";
import { applyStatementMissingPayoutShifts, applyStatementPayoutTotalsToMonths, calculateNetCashflow, calculateStornoFund,
  groupItemsByMonth, statementMonthKey } from "@/app/cashflow/helpers";
import type { CashflowDataset } from "@/app/cashflow/cashflowWorker.types";
import type { CashflowCommissionStatementSummary } from "@/app/cashflow/types";
import { computeExpectedPayout, expectedPayoutFromStatements } from "./expectedPayout";
import { calculateExpectedPayout } from "./expectedPayout.client";

// Frozen reference from ExpectedPayoutWidget before moving it to a worker.
function originalWidget(dataset: CashflowDataset) {
  const items = computeCashflow(dataset.snapshot, { scopeFilter: "combined", productFilter: "all", asOf: dataset.asOf });
  const statements: Record<string, CashflowCommissionStatementSummary[]> = {};
  dataset.statements.forEach(statement => {
    const key = statementMonthKey(statement);
    if (key) statements[key] = [...(statements[key] ?? []), statement];
  });
  const reconciledItems = applyStatementMissingPayoutShifts({ cashflowItems: items, statementsByMonthKey: statements, enabled: true });
  const monthGroups = applyStatementPayoutTotalsToMonths({ monthGroups: groupItemsByMonth(reconciledItems), statementsByMonthKey: statements, enabled: true });
  const group = monthGroups.find(month => month.key === `${dataset.asOf.getFullYear()}-${dataset.asOf.getMonth() + 1}`);
  if (!group) return { grossAmount: 0, stornoFundAmount: 0, netAmount: 0 };
  if (group.totalSource === "paid") return { grossAmount: group.total, stornoFundAmount: 0, netAmount: group.total };
  const stornoFundAmount = calculateStornoFund(group.items);
  return { grossAmount: group.total, stornoFundAmount, netAmount: calculateNetCashflow(group.total, stornoFundAmount) };
}
const asOf = new Date(2026, 8, 27, 12);
const fixture = (count = 12): CashflowDataset => ({ ...makeWorkerFixture(count, asOf), asOf });
function port() {
  const listeners = new Map<string, Set<EventListener>>();
  return {
    postMessage: vi.fn(), terminate: vi.fn(),
    addEventListener: (name: string, fn: EventListener) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name)!.add(fn); },
    removeEventListener: (name: string, fn: EventListener) => listeners.get(name)?.delete(fn),
    send: (data: unknown) => listeners.get("message")?.forEach(fn => fn({ data } as MessageEvent)),
    fail: () => listeners.get("error")?.forEach(fn => fn(new Event("error"))),
  };
}
afterEach(() => vi.useRealTimers());

describe("expected payout equivalence", () => {
  it.each([12, 200, 1000])("matches the previous widget for %i contracts with older instalments, TIP and statements", count => {
    const dataset = fixture(count);
    const before = structuredClone(dataset);
    expect(computeExpectedPayout(dataset)).toEqual(originalWidget(dataset));
    expect(dataset).toEqual(before);
  });
  it("honors the paid current-month statement without deducting the reserve twice", () => {
    const dataset = fixture();
    dataset.statements = [{ ...dataset.statements[0], payoutMonthKey: "2026-9", payoutTotal: 4321 }];
    const actual = computeExpectedPayout(dataset);
    expect(actual).toEqual(originalWidget(dataset));
    expect(actual).toEqual({ grossAmount: 4321, stornoFundAmount: 0, netAmount: 4321 });
  });
  it("preserves old contracts that still generate today's payout", () => {
    const dataset = fixture(); dataset.statements = []; dataset.snapshot.tipPayouts = [];
    expect(dataset.snapshot.ownEntries.every(entry => (entry.contractSignedDate as Date).getMonth() !== asOf.getMonth())).toBe(true);
    expect(computeExpectedPayout(dataset).grossAmount).toBeGreaterThan(0);
  });
  it("supports December/January and an empty portfolio", () => {
    const dataset = fixture(); dataset.asOf = new Date(2027, 0, 1);
    expect(computeExpectedPayout(dataset)).toEqual(originalWidget(dataset));
    dataset.snapshot.ownEntries = []; dataset.snapshot.teamEntriesRaw = []; dataset.snapshot.tipPayouts = []; dataset.statements = [];
    expect(computeExpectedPayout(dataset)).toEqual({ grossAmount: 0, stornoFundAmount: 0, netAmount: 0 });
  });
});

describe("expected payout from paid statements", () => {
  const statement = (
    id: string,
    payoutTotal: unknown,
    extra: Partial<CashflowCommissionStatementSummary> = {}
  ): CashflowCommissionStatementSummary => ({
    id,
    fileName: `${id}.pdf`,
    statementNumber: null,
    statementDate: null,
    period: null,
    advisorNumber: null,
    periodStartMs: null,
    periodEndMs: null,
    statementDateMs: null,
    payoutMonthKey: "2026-9",
    paidContractNumbers: [],
    paidCommissionKeys: [],
    commissionTotal: 0,
    payoutTotal: payoutTotal as number,
    otherPaymentsTotal: 0,
    managerCommissionTotal: 0,
    createdAtMs: null,
    updatedAtMs: null,
    ...extra,
  });

  it.each([0, -123.45, 4321])("preserves the paid total %s without applying a reserve", payoutTotal => {
    const dataset = fixture();
    dataset.statements = [statement("current", payoutTotal)];

    expect(expectedPayoutFromStatements(dataset.statements, dataset.asOf)).toEqual({
      grossAmount: payoutTotal, stornoFundAmount: 0, netAmount: payoutTotal,
    });
    expect(expectedPayoutFromStatements(dataset.statements, dataset.asOf)).toEqual(originalWidget(dataset));
  });

  it("creates the same paid result with no contracts, tips or subscriptions", () => {
    const dataset = fixture();
    dataset.snapshot.ownEntries = [];
    dataset.snapshot.teamEntriesRaw = [];
    dataset.snapshot.tipPayouts = [];
    dataset.snapshot.subscriptionPayments = [];
    dataset.statements = [statement("current", 250)];

    expect(expectedPayoutFromStatements(dataset.statements, dataset.asOf)).toEqual(originalWidget(dataset));
    expect(expectedPayoutFromStatements(dataset.statements, dataset.asOf)?.grossAmount).toBe(250);
  });

  it("uses finite numeric totals and the existing sum rounding", () => {
    const dataset = fixture();
    dataset.statements = [
      statement("missing", null), statement("string", "900"), statement("nan", NaN),
      statement("infinite", Infinity), statement("positive", 100.005), statement("negative", -20.001),
    ];

    expect(expectedPayoutFromStatements(dataset.statements, dataset.asOf)).toEqual({
      grossAmount: 80, stornoFundAmount: 0, netAmount: 80,
    });
    expect(expectedPayoutFromStatements(dataset.statements, dataset.asOf)).toEqual(originalWidget(dataset));
  });

  it("falls back when the current month has no finite statement total", () => {
    expect(expectedPayoutFromStatements([], asOf)).toBeNull();
    expect(expectedPayoutFromStatements([
      statement("previous", 100, { payoutMonthKey: "2026-8" }),
      statement("future", 200, { payoutMonthKey: "2026-10" }),
      statement("current", undefined),
    ], asOf)).toBeNull();
  });

  it.each([null, undefined, NaN, Infinity, -Infinity, "900"])("does not treat an invalid total %s as a paid month", payoutTotal => {
    expect(expectedPayoutFromStatements([statement("invalid", payoutTotal)], asOf)).toBeNull();
  });

  it("deduplicates current-month imports by identity and recency", () => {
    const dataset = fixture();
    const identity = { statementNumber: "  VÝPIS  12 ", period: "srpen", advisorNumber: "A1" };
    dataset.statements = [
      statement("old", 10, { ...identity, updatedAtMs: 1 }),
      statement("new", 20, { ...identity, statementNumber: "výpis 12", updatedAtMs: 2 }),
      statement("separate", 30),
    ];

    expect(expectedPayoutFromStatements(dataset.statements, dataset.asOf)?.grossAmount).toBe(50);
    expect(expectedPayoutFromStatements(dataset.statements, dataset.asOf)).toEqual(originalWidget(dataset));
  });

  it("does not resurrect an older duplicate total removed by the newest import", () => {
    const identity = { statementNumber: "same", period: "srpen" };
    expect(expectedPayoutFromStatements([
      statement("old", 100, { ...identity, updatedAtMs: 1 }),
      statement("new", null, { ...identity, updatedAtMs: 2 }),
    ], asOf)).toBeNull();
  });

  it("groups by month before deduplication and keeps noncanonical month aliases separate", () => {
    const dataset = fixture();
    const identity = { statementNumber: "same", period: "srpen" };
    dataset.statements = [
      statement("current", 100, { ...identity, updatedAtMs: 1 }),
      statement("padded", 900, { ...identity, payoutMonthKey: "2026-09", updatedAtMs: 2 }),
      statement("future", 800, { ...identity, payoutMonthKey: "2026-10", updatedAtMs: 3 }),
    ];

    expect(expectedPayoutFromStatements(dataset.statements, dataset.asOf)?.grossAmount).toBe(100);
    expect(expectedPayoutFromStatements(dataset.statements, dataset.asOf)).toEqual(originalWidget(dataset));
  });

  it("retains the UTC statement-date and period-end fallback month semantics", () => {
    const dataset = fixture();
    dataset.statements = [
      statement("date", 10, { payoutMonthKey: null, statementDateMs: Date.UTC(2026, 8, 1) }),
      statement("period", 20, { payoutMonthKey: null, periodEndMs: Date.UTC(2026, 7, 31, 23) }),
      statement("start", 30, { payoutMonthKey: null, periodStartMs: Date.UTC(2026, 8, 1) }),
    ];

    expect(expectedPayoutFromStatements(dataset.statements, dataset.asOf)?.grossAmount).toBe(60);
    expect(expectedPayoutFromStatements(dataset.statements, dataset.asOf)).toEqual(originalWidget(dataset));
  });

  it("selects the current local calendar month across December and January", () => {
    const dataset = fixture();
    dataset.asOf = new Date(2027, 0, 1);
    dataset.statements = [statement("december", 10, { payoutMonthKey: "2026-12" }),
      statement("january", 20, { payoutMonthKey: "2027-1" })];

    expect(expectedPayoutFromStatements(dataset.statements, dataset.asOf)?.grossAmount).toBe(20);
    expect(expectedPayoutFromStatements(dataset.statements, dataset.asOf)).toEqual(originalWidget(dataset));
  });
});

describe("payout worker lifecycle", () => {
  it("returns compact totals and terminates the worker", async () => {
    const worker = port(); const dataset = fixture();
    const pending = calculateExpectedPayout(dataset, new AbortController().signal, () => worker);
    const result = computeExpectedPayout(dataset);
    worker.send({ ok: true, result });
    expect(await pending).toEqual(result); expect(worker.terminate).toHaveBeenCalledOnce();
  });
  it("cancels work and discards late results", async () => {
    const worker = port(); const controller = new AbortController();
    const pending = calculateExpectedPayout(fixture(), controller.signal, () => worker);
    controller.abort(); worker.send({ ok: true, result: { grossAmount: 999, stornoFundAmount: 0, netAmount: 999 } });
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
  it("does not start an already cancelled request", async () => {
    const controller = new AbortController(); controller.abort(); const factory = vi.fn();
    await expect(calculateExpectedPayout(fixture(), controller.signal, factory)).rejects.toMatchObject({ name: "AbortError" });
    expect(factory).not.toHaveBeenCalled();
  });
  it.each(["unavailable", "crash", "invalid", "timeout"])("uses the same arithmetic after worker %s", async mode => {
    vi.useFakeTimers();
    const worker = port(); const dataset = fixture();
    const pending = calculateExpectedPayout(dataset, new AbortController().signal, () => {
      if (mode === "unavailable") throw new Error("Worker blocked"); return worker;
    });
    if (mode === "crash") worker.fail();
    if (mode === "invalid") worker.send({ ok: true, result: { grossAmount: NaN } });
    if (mode === "timeout") await vi.advanceTimersByTimeAsync(8000);
    expect(await pending).toEqual(originalWidget(dataset));
  });
});
