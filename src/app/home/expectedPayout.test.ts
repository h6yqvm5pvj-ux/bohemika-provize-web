import { afterEach, describe, expect, it, vi } from "vitest";
import { makeWorkerFixture } from "../../../scripts/cashflow-worker/fixtures";
import { computeCashflow } from "@/app/cashflow/computeCashflow";
import { applyStatementMissingPayoutShifts, applyStatementPayoutTotalsToMonths, calculateNetCashflow, calculateStornoFund,
  groupItemsByMonth, statementMonthKey } from "@/app/cashflow/helpers";
import type { CashflowDataset } from "@/app/cashflow/cashflowWorker.types";
import type { CashflowCommissionStatementSummary } from "@/app/cashflow/types";
import { computeExpectedPayout } from "./expectedPayout";
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
