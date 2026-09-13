import { afterEach, describe, expect, it, vi } from "vitest";

import { buildCashflowView, type CashflowViewOptions } from "./buildCashflowView";
import type { CashflowCommissionStatementSummary, CashflowItem } from "./types";

const options: CashflowViewOptions = {
  scopeFilter: "combined",
  productFilter: "all",
  tipsterMode: false,
  showPastYears: false,
  intelligentPredictionEnabled: false,
  contractNumberQuery: "",
};
const asOf = new Date(2026, 8, 12, 12);

const item = (patch: Partial<CashflowItem> = {}): CashflowItem => ({
  id: "commission-1",
  date: new Date(2026, 8, 25),
  amount: 1000,
  productKey: "cppAuto",
  source: "own",
  contractNumber: "00012345",
  ownerEmail: "advisor@example.com",
  entryId: "contract-1",
  commissionCode: "A101",
  payoutStatus: "predicted",
  ...patch,
});

const statement = (
  patch: Partial<CashflowCommissionStatementSummary> = {},
): CashflowCommissionStatementSummary => ({
  id: "statement-1",
  fileName: "statement-1.html",
  statementNumber: "1",
  statementDate: "24.09.2026",
  period: "08/2026",
  advisorNumber: null,
  periodStartMs: Date.UTC(2026, 7, 1),
  periodEndMs: Date.UTC(2026, 7, 31),
  statementDateMs: Date.UTC(2026, 8, 24),
  payoutMonthKey: "2026-9",
  paidContractNumbers: ["00012345"],
  paidCommissionKeys: ["00012345:A101"],
  commissionTotal: 750,
  payoutTotal: 750,
  otherPaymentsTotal: 0,
  managerCommissionTotal: 0,
  createdAtMs: 1,
  updatedAtMs: 1,
  ...patch,
});

afterEach(() => vi.useRealTimers());

describe("server cashflow view preserves the displayed calculation", () => {
  it("carries unpaid December commission into January before hiding past years", () => {
    const oldDate = new Date(2025, 11, 25);
    const months = buildCashflowView([
      item({ date: oldDate }),
    ], [
      statement({
        payoutMonthKey: "2025-12",
        period: "11/2025",
        paidContractNumbers: ["99999"],
        paidCommissionKeys: ["99999:A101"],
      }),
    ], options, asOf);

    expect(months).toHaveLength(1);
    expect(months[0]).toMatchObject({
      key: "2026-1", total: 1000, totalSource: "predicted", statementPayoutTotal: null,
    });
    expect(months[0].items[0]).toMatchObject({
      date: new Date(2026, 0, 25), originalDate: oldDate,
      payoutStatus: "shifted", missedStatementPeriods: ["11/2025"],
    });
  });

  it("uses actual statement totals while preserving commission estimates and statement-only months", () => {
    const months = buildCashflowView([item()], [
      statement(),
      statement({ id: "statement-2", statementNumber: "2", payoutMonthKey: "2026-10", payoutTotal: 325 }),
    ], options, asOf);

    expect(months.map(month => ({
      key: month.key, total: month.total, predictedTotal: month.predictedTotal,
      totalSource: month.totalSource, count: month.items.length,
    }))).toEqual([
      { key: "2026-9", total: 750, predictedTotal: 1000, totalSource: "paid", count: 1 },
      { key: "2026-10", total: 325, predictedTotal: 0, totalSource: "paid", count: 0 },
    ]);
    expect(months[0].items[0].payoutStatus).toBe("paid");
  });

  it.each<Partial<CashflowViewOptions>>([
    { scopeFilter: "own" },
    { scopeFilter: "team" },
    { productFilter: "auto" },
    { productFilter: "life" },
    { productFilter: "tip" },
    { productFilter: "subscription" },
    { tipsterMode: true },
    { contractNumberQuery: "12345" },
  ])("keeps already filtered items and excludes whole-account statement totals for %j", patch => {
    // Scope/product selection happens in computeCashflow. The view must neither
    // add whole-account statement-only months nor shift these selected items.
    const selected = item();
    const months = buildCashflowView([selected], [
      statement({ paidContractNumbers: ["99999"], paidCommissionKeys: ["99999:A101"] }),
      statement({ id: "statement-2", statementNumber: "2", payoutMonthKey: "2026-10" }),
    ], { ...options, ...patch }, asOf);

    expect(months).toHaveLength(1);
    expect(months[0]).toMatchObject({
      key: "2026-9", total: 1000, totalSource: "predicted", statementPayoutTotal: null,
    });
    expect(months[0].items).toEqual([selected]);
  });

  it("searches historical contract payments even when past years are hidden", () => {
    const old = item({ id: "old", date: new Date(2024, 11, 25), amount: 300 });
    const current = item({ id: "current", amount: 700 });
    const other = item({ id: "other", contractNumber: "99999", amount: 900 });
    const months = buildCashflowView([old, current, other], [statement()], {
      ...options, contractNumberQuery: "12 345",
    }, asOf);

    expect(months.map(month => [month.key, month.total, month.totalSource])).toEqual([
      ["2024-12", 300, "predicted"], ["2026-9", 700, "predicted"],
    ]);
    expect(months.flatMap(month => month.items.map(row => row.id))).toEqual(["old", "current"]);
  });

  it("uses asOf for year boundaries and retains older statement-only months only when requested", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2035, 0, 1));
    const data = [item({ date: new Date(2025, 11, 25) }), item({ id: "new", date: new Date(2026, 0, 25) })];
    const statements = [statement({ payoutMonthKey: "2024-6", payoutTotal: 80 })];

    expect(buildCashflowView(data, statements, options, new Date(2026, 0, 1)).map(month => month.key))
      .toEqual(["2026-1"]);
    expect(buildCashflowView(data, statements, { ...options, showPastYears: true }, asOf).map(month => month.key))
      .toEqual(["2024-6", "2025-12", "2026-1"]);
  });

  it("anchors optional prediction to asOf and keeps paid payouts unchanged", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2035, 0, 1));
    const future = item({ date: new Date(2027, 6, 25), policyStartDate: new Date(2026, 6, 1), frequency: "annual" });
    const paid = item({ ...future, id: "paid", payoutStatus: "paid" });
    const predictionOptions = { ...options, scopeFilter: "own" as const, intelligentPredictionEnabled: true };
    const months = buildCashflowView([future, paid], [], predictionOptions, new Date(2026, 6, 24));
    const predictedRow = months.flatMap(month => month.items).find(row => row.id === future.id);

    expect(predictedRow).toMatchObject({ amount: 1075, predictionAdjustment: { kind: "autoPremiumGrowth", steps: 1 } });
    expect(months[0].items.find(row => row.id === "paid")?.amount).toBe(1000);
    for (const patch of [{ intelligentPredictionEnabled: false }, { tipsterMode: true }]) {
      const unchanged = buildCashflowView([future], [], { ...predictionOptions, ...patch }, new Date(2026, 6, 24));
      expect(unchanged[0].items[0].amount).toBe(1000);
      expect(unchanged[0].items[0].predictionAdjustment).toBeUndefined();
    }
  });

  it("does not mutate source items, dates, statements or options during reconciliation and sorting", () => {
    const inputs = [item({ id: "later", date: new Date(2026, 8, 26) }), item()];
    const statements = [
      statement({ id: "late-statement", statementDate: "26.09.2026", paidContractNumbers: ["99999"] }),
      statement({ id: "early-statement", statementDate: "24.09.2026", paidContractNumbers: ["99999"] }),
    ];
    const before = structuredClone({ inputs, statements, options, asOf });
    Object.freeze(inputs);
    Object.freeze(statements);
    inputs.forEach(Object.freeze);
    statements.forEach(Object.freeze);

    buildCashflowView(inputs, statements, options, asOf);

    expect({ inputs, statements, options, asOf }).toEqual(before);
  });
});
