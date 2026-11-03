import { describe, expect, it } from "vitest";
import { normalizeCashflowExtraPayouts, CASHFLOW_EXTRA_PAYOUTS_MAX, type CashflowExtraPayout } from "./extraPayouts";
import { computeCashflow, type CashflowSnapshot } from "./computeCashflow";
import { buildCashflowView, type CashflowViewOptions } from "./buildCashflowView";
import { createCashflowModel } from "./cashflowModel";
import { parseCashflowSnapshot, serializeCashflowSnapshot, CASHFLOW_SNAPSHOT_WIRE_VERSION } from "./cashflowSnapshotWire";
import { applyIntelligentCashflowPrediction, applyStatementMissingPayoutShifts, calculateStornoFund, groupItemsByMonth } from "./helpers";
import { cashflowMonthSourceLabel, formatCashflowGroupCount, formatCashflowItemCount, paidSubscriptionAmount } from "./cashflowLabels";
import type { CashflowCommissionStatementSummary, CashflowItem } from "./types";

const asOf = new Date(2026, 10, 2, 12);
const payout: CashflowExtraPayout = { id: "synthetic-bonus", title: "Mimořádná odměna", amountCzk: 75000, payoutMonthKey: "2026-02", status: "paid" };
const snapshot = (extraPayouts: CashflowExtraPayout[] = [payout]): CashflowSnapshot => ({
  email: "recipient@example.test", myPosition: null, myCommissionMode: null, hasAnyTeam: false,
  ownEntries: [], teamEntriesRaw: [], tipPayouts: [], subscriptionPayments: [], extraPayouts,
});
const options: CashflowViewOptions = {
  scopeFilter: "combined", productFilter: "all", tipsterMode: false,
  showPastYears: true, intelligentPredictionEnabled: true, contractNumberQuery: "",
};
const statement: CashflowCommissionStatementSummary = {
  id: "synthetic-statement", fileName: "synthetic.html", statementNumber: "1",
  statementDate: "25.02.2026", period: "02/2026", advisorNumber: null,
  periodStartMs: null, periodEndMs: null, statementDateMs: null, payoutMonthKey: "2026-2",
  paidContractNumbers: [], paidCommissionKeys: [], commissionTotal: 1200,
  payoutTotal: 1200, otherPaymentsTotal: 0, managerCommissionTotal: 0, createdAtMs: 1, updatedAtMs: 1,
};
const receiptItems = () => computeCashflow(snapshot(), { ...options, asOf });

describe("administrator-recorded extra cashflow receipts", () => {
  it("normalizes only valid paid receipts, deduplicates ids and strips audit fields", () => {
    const result = normalizeCashflowExtraPayouts([
      { ...payout, title: "  Mimořádná odměna  ", createdBy: "admin@example.test", internalReason: "private" },
      { ...payout, amountCzk: 3 },
      { ...payout, id: "cents", amountCzk: 123.45 },
      { ...payout, id: "unpaid", status: "predicted" },
    ]);
    expect(result).toEqual([payout, { ...payout, id: "cents", amountCzk: 123.45 }]);
  });

  it.each([
    { amountCzk: -1 }, { amountCzk: 0 }, { amountCzk: Infinity }, { amountCzk: NaN },
    { amountCzk: "75000" }, { amountCzk: 1.001 }, { amountCzk: 100_000_001 },
    { id: "" }, { id: "bad/id" }, { title: "" }, { title: "x".repeat(161) },
    { payoutMonthKey: "2026-13" }, { payoutMonthKey: "2026-2" }, { payoutMonthKey: "2026-00" },
  ])("rejects invalid financial or period data %j", patch => {
    expect(normalizeCashflowExtraPayouts([{ ...payout, ...patch }])).toEqual([]);
  });

  it("rejects malformed or oversized input without partial ledger truncation", () => {
    expect(normalizeCashflowExtraPayouts(null)).toEqual([]);
    expect(normalizeCashflowExtraPayouts({ ...payout })).toEqual([]);
    expect(normalizeCashflowExtraPayouts(Array.from({ length: CASHFLOW_EXTRA_PAYOUTS_MAX + 1 }, (_, index) => ({ ...payout, id: `bonus-${index}` })))).toEqual([]);
  });

  it("creates exactly one paid month-bucket receipt without a contract or recurring forecast", () => {
    const source = snapshot();
    const before = structuredClone(source);
    const items = computeCashflow(source, { ...options, asOf });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "extra-payout-synthetic-bonus", amount: 75000, productKey: "unknown", isExtraPayout: true,
      payoutStatus: "paid", predictedAmount: 0, entryId: null, contractNumber: null, clientName: null,
      commissionLabel: "Mimořádná odměna", date: new Date(2026, 1, 1),
    });
    expect(source).toEqual(before);
    expect(formatCashflowItemCount(items)).toBe("1 odměna");
    expect(formatCashflowGroupCount([{ id: "bonus", leadItem: items[0], items, amount: 75000 }])).toBe("1 odměna");
  });

  it.each([
    { scopeFilter: "team" as const }, { productFilter: "life" as const },
    { productFilter: "subscription" as const }, { tipsterMode: true },
  ])("excludes own extra receipts from unrelated views %j", patch => {
    expect(computeCashflow(snapshot(), { ...options, ...patch, asOf })).toEqual([]);
  });

  it("retains the receipt in the own scope", () => {
    expect(computeCashflow(snapshot(), { ...options, scopeFilter: "own", asOf })).toHaveLength(1);
  });

  it("adds the whole receipt to a settled statement and never calls it subscription income", () => {
    const baseline = buildCashflowView([], [statement], options, asOf)[0];
    const [month] = buildCashflowView(receiptItems(), [statement], options, asOf);
    expect(month.total - baseline.total).toBe(75000);
    expect(month).toMatchObject({ key: "2026-2", total: 76200, predictedTotal: 0, extraPayoutTotal: 75000, statementPayoutTotal: 1200, totalSource: "paid" });
    expect(paidSubscriptionAmount(month)).toBe(0);
    expect(cashflowMonthSourceLabel(month)).toBe("Výpis + odměna");
  });

  it("keeps subscription receipts and unpaid subscription forecasts distinct from the bonus", () => {
    const bonus = receiptItems()[0];
    const receipt: CashflowItem = { ...bonus, id: "subscription", amount: 350, predictedAmount: 350, isExtraPayout: undefined, isSubscriptionPayment: true, productKey: "subscription" };
    const forecast: CashflowItem = { ...receipt, id: "future-subscription", amount: 900, payoutStatus: "predicted" };
    const [month] = buildCashflowView([bonus, receipt, forecast], [statement], options, asOf);
    expect(month.total).toBe(76550);
    expect(paidSubscriptionAmount(month)).toBe(350);
    expect(cashflowMonthSourceLabel(month)).toBe("Výpis + předplatné + odměna");
    const [withoutStatement] = groupItemsByMonth([bonus, receipt, forecast]);
    expect(withoutStatement.total).toBe(75350);
    expect(paidSubscriptionAmount(withoutStatement)).toBe(350);
  });

  it("records actual income without a statement while excluding unpaid commissions from received money", () => {
    const bonus = receiptItems()[0];
    const predicted: CashflowItem = { ...bonus, id: "unpaid-commission", amount: 1000, predictedAmount: 1000, isExtraPayout: undefined, payoutStatus: "predicted" };
    const [month] = buildCashflowView([bonus, predicted], [], options, asOf);
    expect(month).toMatchObject({ total: 75000, extraPayoutTotal: 75000, totalSource: "paid", predictedTotal: 1000, statementPayoutTotal: null });
  });

  it("does not deduct a storno fund, shift or predict another occurrence of the receipt", () => {
    const items = receiptItems();
    expect(calculateStornoFund(items)).toBe(0);
    const shifted = applyStatementMissingPayoutShifts({ cashflowItems: items, statementsByMonthKey: { "2026-2": [statement] }, enabled: true });
    expect(shifted).toEqual(items);
    expect(shifted[0]).toBe(items[0]);
    expect(applyIntelligentCashflowPrediction({ cashflowItems: shifted, enabled: true, today: asOf })).toEqual(items);
  });

  it("preserves exact receipt metadata through the versioned server codec", () => {
    const items = receiptItems();
    const months = buildCashflowView(items, [statement], options, asOf);
    const wire = serializeCashflowSnapshot({ items, months });
    expect(CASHFLOW_SNAPSHOT_WIRE_VERSION).toBe("cashflow-snapshot-wire-v5");
    expect(parseCashflowSnapshot(JSON.parse(JSON.stringify(wire)))).toEqual({ items, months });
  });

  it("keeps the cached model and stateless shared calculation equal across audience filters", () => {
    const input = { snapshot: snapshot(), statements: [statement], asOf };
    const model = createCashflowModel(input);
    try {
      for (const patch of [{}, { scopeFilter: "own" as const }, { scopeFilter: "team" as const }, { productFilter: "life" as const }, { contractNumberQuery: "unrelated" }]) {
        const viewOptions = { ...options, ...patch };
        const reference = buildCashflowView(computeCashflow(input.snapshot, { ...viewOptions, asOf }), input.statements, viewOptions, asOf);
        const actual = model.view(viewOptions);
        expect(actual.months.map(month => model.month(month.key))).toEqual(reference);
      }
    } finally { model.dispose(); }
  });
});
