import { describe, expect, it } from "vitest";
import { generateCashflow } from "@/app/cashflow/generator";
import type { EntryDoc } from "@/app/cashflow/types";
import { createCommissionCodeProjection, projectConfirmedCommissionCodes } from "./commissionPayoutCodeAdjustment";
import { splitConfirmedOpeningReceipt, type ConfirmedQuarterlyRule } from "./confirmedQuarterlyInstallments";

const writer = "advisor@example.test";
const rows = ["A101", "B101", "B102", "B103", "B104", "B105", "B106"].map((code, i) => ({
  code, key: `key-${i}`, statementId: `statement-${i}`, writtenBy: writer,
  status: i ? "paid" : "difference", amount: [113.57, 61.23, 61.23, 61.23, 61.23, 49.25, 49.25][i],
  payoutMonthKey: ["2024-6","2024-8","2024-10","2025-1","2025-4","2025-8","2025-10"][i],
}));
const sources = rows.map((r, i) => ({ statementId: r.statementId, payoutKey: r.key, amountCents: Math.round(r.amount * 100),
  dueDate: ["2023-12-10","2024-06-01","2024-09-01","2024-12-01","2025-03-01","2025-06-01","2025-09-01"][i] }));
const rule: ConfirmedQuarterlyRule = { kind: "cpp-auto-quarterly-combined-start", writtenBy: writer, confirmedAtMs: 1,
  opening: { ...sources[0], secondCents: 6123, secondDueDate: "2024-03-01" }, following: sources.slice(1) };
const entry: EntryDoc = { id: "synthetic", source: "own", userEmail: writer, entryType: "contract", frequencyRaw: "quarterly", productKey: "cppAuto",
  policyStartDate: "2023-12-10", contractSignedDate: "2023-12-09", inputAmount: 500,
  items: [{ code: "A101", title: "Okamžitá provize", amount: 52.34 }, { code: "B101", title: "Následná provize", amount: 52.34 }],
  paymentFrequencyChanges: [{ effectiveDate: "2024-03-01", frequency: "quarterly", baseAnnualPremium: 2000, annualPremium: 2400 }],
  commissionPayouts: rows, commissionPayoutCodeAdjustment: rule };
const codes = ["A101","A102","A103","A104","B101","B102","B103","B104"];
const amounts = [52.34,61.23,61.23,61.23,61.23,61.23,49.25,49.25];

describe("confirmed quarterly receipts with a combined first payment", () => {
  it("keeps seven source receipts and allocates eight installments without creating money", () => {
    const raw = structuredClone(rows);
    const ledger = projectConfirmedCommissionCodes(entry, rows);
    expect(ledger).toHaveLength(7);
    expect(ledger.map(r => r.amount)).toEqual(rows.map(r => r.amount));
    expect(projectConfirmedCommissionCodes(entry, ledger)).toEqual(ledger);
    const plan = splitConfirmedOpeningReceipt(ledger);
    expect(plan.map(r => r.code)).toEqual(codes);
    expect(plan.map(r => r.amount)).toEqual(amounts);
    expect(plan.map(r => r.statementCode)).toEqual(["A101","A101",...rows.slice(1).map(r => r.code)]);
    expect(new Set(plan.map(r => r.key)).size).toBe(8);
    expect(splitConfirmedOpeningReceipt(plan)).toEqual(plan);
    expect(rows).toEqual(raw);
  });
  it("uses both parts in cashflow after authorization, including from the server-projected inputs", () => {
    const safe = { ...entry, commissionPayoutCodeAdjustment: undefined, commissionPayouts: projectConfirmedCommissionCodes(entry, rows) };
    for (const contract of [entry, safe]) {
      const paid = generateCashflow([contract], 1, writer, new Date(2025,10,24)).filter(item => item.payoutStatus === "paid");
      expect(paid.map(r => [r.commissionCode,r.amount])).toEqual(codes.map((code,i) => [code,amounts[i]]));
      expect(generateCashflow([contract], 1, "other@example.test", new Date(2025,10,24)).some(r => r.payoutStatus === "paid")).toBe(false);
    }
  });
  it("requires a confirmed source, writer and amount and leaves new or reversed receipts alone", () => {
    const project = createCommissionCodeProjection(entry, rows);
    for (const patch of [{ key: "another" }, { amount: 999 }, { statementId: "other" }, { writtenBy: "other@example.test" }, { status: "storno" }, { code: "B107" }]) {
      const other = { ...rows[1], ...patch };
      expect(project(other)).toBe(other);
    }
    expect(project({ code: "B101", statementId: sources[1].statementId, writtenBy: writer }).code).toBe("A103");
    expect(createCommissionCodeProjection(entry, [])({ code: "B101", statementId: sources[1].statementId, writtenBy: writer }).code).toBe("B101");
    const ambiguous = createCommissionCodeProjection(entry, [...rows, { ...rows[1], key: "another-receipt" }]);
    expect(ambiguous({ code: "B101", statementId: sources[1].statementId, writtenBy: writer }).code).toBe("B101");
    for (const patch of [{ commissionPayoutCodeAdjustment: undefined }, { productKey: "domex" as const }, { entryType: "endorsement" }]) {
      expect(projectConfirmedCommissionCodes({ ...entry, ...patch }, rows)).toEqual(rows);
    }
  });
});
