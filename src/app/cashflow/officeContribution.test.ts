import { describe, expect, it } from "vitest";
import { buildCashflowView, type CashflowViewOptions } from "./buildCashflowView";
import { computeCashflow, type CashflowSnapshot } from "./computeCashflow";
import { createCashflowModel } from "./cashflowModel";
import { calculateStornoFund } from "./helpers";
import { applyOfficeContributionStatements } from "./officeContribution";
import { buildCashflowMonthSections } from "./monthSections";
import { parseCashflowSnapshot, serializeCashflowSnapshot } from "./cashflowSnapshotWire";
import type { CashflowCommissionStatementSummary } from "./types";

const asOf = new Date(2026, 10, 18, 12);
const options: CashflowViewOptions = { scopeFilter: "combined", productFilter: "all", tipsterMode: false,
  showPastYears: true, intelligentPredictionEnabled: true, contractNumberQuery: "" };
const snapshot = (enabled = false): CashflowSnapshot => ({ email: "advisor@example.test", myPosition: null,
  myCommissionMode: null, hasAnyTeam: false, ownEntries: [], teamEntriesRaw: [], tipPayouts: [],
  subscriptionPayments: [], ...(enabled ? { officeContributionEnabled: true } : {}) });
const statement = (overrides: Partial<CashflowCommissionStatementSummary> = {}): CashflowCommissionStatementSummary => ({
  id: "statement", fileName: "synthetic.html", statementNumber: "1", statementDate: "25.11.2026", period: "10/2026",
  advisorNumber: null, periodStartMs: null, periodEndMs: null, statementDateMs: null, payoutMonthKey: "2026-11",
  paidContractNumbers: [], paidCommissionKeys: [], commissionTotal: 5000, otherPaymentsTotal: 10000,
  officeContributionTotal: 10000, payoutTotal: 15000, managerCommissionTotal: 0, createdAtMs: 1, updatedAtMs: 1, ...overrides,
});
const items = (enabled = false) => computeCashflow(snapshot(enabled), { ...options, asOf });

describe("office contribution cashflow", () => {
  it("defaults off, and forecasts a fixed monthly amount only after the owner opts in", () => {
    expect(items()).toEqual([]);
    const forecast = items(true);
    expect(forecast).toHaveLength(121);
    expect(forecast[0]).toMatchObject({ date: new Date(2026, 10, 1), amount: 10000,
      payoutStatus: "predicted", isOfficeContribution: true, entryId: null, contractNumber: null });
    expect(forecast.every(item => item.amount === 10000 && item.payoutStatus === "predicted")).toBe(true);
    expect(calculateStornoFund(forecast)).toBe(0);
    expect(items()).toEqual([]); // No preference/forecast leaks to another dataset.
  });

  it("shows actual receipts with the setting off, without adding money already in the statement again", () => {
    const [month] = buildCashflowView(items(), [statement()], options, asOf);
    expect(month).toMatchObject({ total: 15000, statementPayoutTotal: 15000, predictedTotal: 0, totalSource: "paid" });
    expect(month.extraPayoutTotal).toBeUndefined();
    expect(month.items).toHaveLength(1);
    expect(month.items[0]).toMatchObject({ amount: 10000, payoutStatus: "paid", isStatementOnly: true });
    const item = month.items[0];
    expect(buildCashflowMonthSections([{ id: item.id, leadItem: item, items: [item], amount: item.amount }])[0])
      .toMatchObject({ id: "office", label: "Ostatní platby", total: 10000 });
  });

  it("replaces forecasts with exact receipts and keeps a missing contribution out of a settled month", () => {
    const months = buildCashflowView(items(true), [statement({ officeContributionTotal: 8000, payoutTotal: 13000 }),
      statement({ id: "december", statementNumber: "2", payoutMonthKey: "2026-12", officeContributionTotal: undefined, payoutTotal: 5000 })], options, asOf);
    expect(months[0]).toMatchObject({ total: 13000, predictedTotal: 0 });
    expect(months[0].items).toHaveLength(1);
    expect(months[0].items[0].amount).toBe(8000);
    expect(months[1]).toMatchObject({ total: 5000, items: [] });
    expect(months[2]).toMatchObject({ key: "2027-1", total: 10000, predictedTotal: 10000, totalSource: "predicted" });
  });

  it.each([{ scopeFilter: "team" as const }, { productFilter: "life" as const }, { tipsterMode: true }])(
    "excludes the contribution from unrelated views %j", patch => {
      const selected = { ...options, ...patch };
      const raw = computeCashflow(snapshot(true), { ...selected, asOf });
      expect(buildCashflowView(raw, [statement()], selected, asOf)).toEqual([]);
    });

  it("keeps own receipts visible while contract search and shifted-only views omit them", () => {
    expect(buildCashflowView(items(), [statement()], { ...options, scopeFilter: "own" }, asOf)[0].total).toBe(10000);
    expect(buildCashflowView(items(true), [statement()], { ...options, contractNumberQuery: "123456" }, asOf)).toEqual([]);
    expect(buildCashflowView(items(true), [statement()], { ...options, shiftedOnly: true }, asOf)).toEqual([]);
  });

  it("deduplicates reimported statements, handles padded months and is safe to apply twice", () => {
    const statements = [statement({ id: "old" }), statement({ id: "latest", updatedAtMs: 2, officeContributionTotal: 9000, payoutMonthKey: "2026-11" })];
    const result = applyOfficeContributionStatements(items(true), statements, options, asOf);
    expect(result.filter(item => item.payoutStatus === "paid")).toHaveLength(1);
    expect(applyOfficeContributionStatements(result, statements, options, asOf)).toEqual(result);
    const february = statement({ payoutMonthKey: "2027-02" });
    const monthItems = applyOfficeContributionStatements(items(true), [february], options, asOf)
      .filter(item => item.date.getFullYear() === 2027 && item.date.getMonth() === 1);
    expect(monthItems).toHaveLength(1);
    expect(monthItems[0].payoutStatus).toBe("paid");
  });

  it("adds independent rewards separately and preserves the worker, reference and wire results", () => {
    const source = { ...snapshot(true), extraPayouts: [{ id: "bonus", title: "Odměna", amountCzk: 2000, payoutMonthKey: "2026-11", status: "paid" as const }] };
    const raw = computeCashflow(source, { ...options, asOf });
    const months = buildCashflowView(raw, [statement()], options, asOf);
    expect(months[0]).toMatchObject({ total: 17000, extraPayoutTotal: 2000 });
    const model = createCashflowModel({ snapshot: source, statements: [statement()], asOf });
    try {
      for (const selection of [options, { ...options, scopeFilter: "own" as const }, { ...options, intelligentPredictionEnabled: false }]) {
        const result = model.view(selection);
        expect(result.months.map(month => model.month(month.key))).toEqual(buildCashflowView(raw, [statement()], selection, asOf));
      }
    } finally { model.dispose(); }
    const payload = { items: raw, months };
    expect(parseCashflowSnapshot(JSON.parse(JSON.stringify(serializeCashflowSnapshot(payload))))).toEqual(payload);
  });
});
