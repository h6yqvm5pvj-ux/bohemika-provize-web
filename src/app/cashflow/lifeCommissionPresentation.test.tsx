// @vitest-environment happy-dom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { commissionLabelForItem } from "./commissionPresentation";
import { CashflowCommissionCard } from "./components/CashflowCommissionCard";
import { buildCashflowView } from "./buildCashflowView";
import { generateCashflow } from "./generator";
import { applyStatementMissingPayoutShifts } from "./helpers";
import { parseCashflowSnapshot, serializeCashflowSnapshot } from "./cashflowSnapshotWire";
import type { CashflowCommissionStatementSummary, CashflowItem, EntryDoc } from "./types";

const entry: EntryDoc = {
  id: "synthetic-neon", userEmail: "adviser@example.test", productKey: "neon",
  policyStartDate: "2021-06-01", contractSignedDate: "2021-05-20", durationYears: 10,
  items: [
    { title: "Následná provize (2.–5. rok)", amount: 16.63, code: "B101-B104" },
    { title: "Pečovatelská provize (5.–10. rok)", amount: 116.42, code: "B201-B206" },
  ],
};
const rows = generateCashflow([entry], 12, entry.userEmail!, new Date(2021, 4, 1));
const care = rows.filter(row => row.commissionCode === "B201-B206");

describe("specific life commission labels in cashflow", () => {
  it.each(Array.from({ length: 6 }, (_, index) => index))("identifies care installment %s from its contractual period", index => {
    expect(commissionLabelForItem(care[index])).toBe(`Pečovatelská provize (B20${index + 1} · ${index + 5}. rok)`);
  });

  it("forecasts NEON care annually after each completed care year", () => {
    expect(care.map(row => row.date)).toEqual(
      Array.from({ length: 6 }, (_, index) => new Date(2026 + index, 6, 25))
    );
    expect(care[0].commissionPeriodStart).toBe("2025-06-01");
  });

  it("keeps shifted care receipts in their actual payout month and the next care year open", () => {
    const policy = { ...entry, policyStartDate: "2018-02-01", source: "own" as const, contractNumber: "1234567890",
      commissionPayouts: [
        { code: "B202", key: "care-a", amount: 110, status: "difference", payoutMonthKey: "2023-11", writtenBy: entry.userEmail },
        { code: "B203", key: "care-b", amount: 110, status: "difference", statementDate: "25.03.2024", writtenBy: entry.userEmail },
      ] };
    const items = generateCashflow([policy], 10, policy.userEmail!, new Date(2023, 0, 1));
    const [first, second, next] = items.filter(item => item.commissionCode === "B201-B206");
    expect(items.filter(item => item.commissionPayoutKey)).toHaveLength(2);
    expect(first).toMatchObject({ date: new Date(2023, 10, 25), commissionPeriodStart: "2022-02-01",
      statementCode: "B202", payoutStatus: "paid", amount: 110, commissionPayoutKey: "care-a" });
    expect(second).toMatchObject({ date: new Date(2024, 2, 25), commissionPeriodStart: "2023-02-01",
      statementCode: "B203", payoutStatus: "paid", amount: 110, commissionPayoutKey: "care-b" });
    expect(commissionLabelForItem(next)).toContain("B203");
    expect(next.commissionPayoutKey).toBeNull();
    expect(parseCashflowSnapshot(serializeCashflowSnapshot({ items, months: [] }))?.items).toEqual(items);

    const statement: CashflowCommissionStatementSummary = {
      id: "test", fileName: "test.html", statementDate: null, period: null, advisorNumber: null, statementNumber: null,
      periodStartMs: null, periodEndMs: null, statementDateMs: null, payoutMonthKey: "2024-3",
      paidContractNumbers: [policy.contractNumber], paidCommissionKeys: [`${policy.contractNumber}:B203`],
      commissionTotal: 110, payoutTotal: 110, otherPaymentsTotal: 0, managerCommissionTotal: 0, createdAtMs: 1, updatedAtMs: 1,
    };
    const reconciled = applyStatementMissingPayoutShifts({ enabled: true, statementsByMonthKey: { "2024-3": [statement] },
      cashflowItems: [second, { ...next, date: second.date }] });
    expect(reconciled.map(item => item.payoutStatus)).toEqual(["paid", "shifted"]);
  });

  it("keeps a June B201 receipt in 2026 and forecasts B202 in 2027 through month reconciliation", () => {
    const asOf = new Date(2026, 10, 25);
    const paidEntry: EntryDoc = { ...entry, contractNumber: "1234567890", source: "own",
      commissionPayouts: [{
        key: "care-1", code: "B201", amount: 116.42, status: "paid", payoutMonthKey: "2026-6",
        statementPeriod: "01.05.2026 - 31.05.2026", writtenBy: entry.userEmail,
      }],
    };
    const statements: CashflowCommissionStatementSummary[] = [6, 7, 8, 9, 10].map(month => ({
      id: `statement-${month}`, fileName: `${month}.html`, payoutMonthKey: `2026-${month}`,
      statementNumber: String(month), statementDate: null, period: null, advisorNumber: null,
      periodStartMs: null, periodEndMs: null, statementDateMs: null,
      paidContractNumbers: [month === 6 ? paidEntry.contractNumber! : "2222222222"],
      paidCommissionKeys: [month === 6 ? `${paidEntry.contractNumber}:B201` : "2222222222:A101"],
      commissionTotal: 116.42, payoutTotal: 116.42, otherPaymentsTotal: 0, managerCommissionTotal: 0,
      createdAtMs: 1, updatedAtMs: 1,
    }));
    const months = buildCashflowView(generateCashflow([paidEntry], 3, entry.userEmail!, asOf), statements, {
      scopeFilter: "combined", productFilter: "all", tipsterMode: false,
      showPastYears: false, intelligentPredictionEnabled: false, contractNumberQuery: "",
    }, asOf);
    const projectedCare = months.flatMap(month => month.items).filter(row => row.commissionCode === "B201-B206");
    const source = projectedCare.find(row => commissionLabelForItem(row)?.includes("B201"));
    const next = projectedCare.find(row => commissionLabelForItem(row)?.includes("B202"));
    expect(source).toMatchObject({ date: new Date(2026, 5, 25), payoutStatus: "paid", commissionPayoutKey: "care-1" });
    expect(next).toMatchObject({ date: new Date(2027, 6, 25), payoutStatus: "predicted", originalDate: null });
    expect(projectedCare.filter(row => row.date.getFullYear() === 2026)).toEqual([source]);
  });

  it.each(Array.from({ length: 4 }, (_, index) => index))("identifies subsequent installment %s from its contractual period", index => {
    const subsequent = rows.filter(row => row.commissionCode === "B101-B104");
    expect(commissionLabelForItem(subsequent[index])).toBe(`Následná provize (B10${index + 1} · ${index + 2}. rok)`);
  });

  it("keeps the exact code and policy year when payment shifts into a later year", () => {
    const item: CashflowItem = { ...care[1], originalDate: care[1].date, date: new Date(2028, 10, 25), payoutStatus: "shifted" };
    expect(commissionLabelForItem(item)).toBe("Pečovatelská provize (B202 · 6. rok)");
  });

  it("shows the exact installment directly in the rendered commission breakdown", () => {
    const item = care[1];
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(<CashflowCommissionCard group={{
      id: "synthetic-group", leadItem: item, items: [item], amount: item.amount,
      stornoFundAmount: item.amount * 0.15, netAmount: item.amount * 0.85,
    }} />);
    expect(container.querySelector("tbody th")?.textContent).toContain("Pečovatelská provize (B202 · 6. rok)");
    expect(container.textContent).not.toContain("B201-B206");
  });

  it("also specifies existing exact life codes", () => {
    expect(commissionLabelForItem({ ...care[1], commissionCode: "B202" })).toBe("Pečovatelská provize (B202 · 6. rok)");
  });

  it("uses the product's period rules for FLEXI", () => {
    expect(commissionLabelForItem({ ...care[1], productKey: "flexi", commissionPeriodStart: "2028-06-01" }))
      .toBe("Následná provize (B202 · 8. rok)");
  });

  it.each([
    { commissionPeriodStart: null },
    { commissionPeriodStart: "2026-02-31" },
    { commissionPeriodStart: "2035-06-01" },
    { policyStartDate: null },
    { policyStartDate: new Date(Number.NaN) },
    { productKey: "unknown" as const },
  ])("does not guess an installment when its period cannot be resolved: %o", overrides => {
    expect(commissionLabelForItem({ ...care[1], ...overrides })).toBe("Následná provize (B201-B206)");
  });

  it("does not mutate financial or matching data while formatting the label", () => {
    const item = { ...care[1], payoutStatus: "shifted" as const };
    const before = JSON.stringify(item);
    commissionLabelForItem(item);
    expect(JSON.stringify(item)).toBe(before);
  });
});
