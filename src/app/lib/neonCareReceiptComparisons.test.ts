import { describe, expect, it } from "vitest";
import { projectNeonCareReceiptComparisons } from "./neonCareReceiptComparisons";

const owner = "advisor@example.test";
const manager = "manager@example.test";
const care = { code: "B201-B206", title: "Pečovatelská provize", amount: 153.336 };
const root = {
  id: "root", productKey: "neon" as const, entryType: "contract", userEmail: owner, items: [care],
  policyStartDate: "2018-07-01", inputAmount: 1_000, calculationInputAmount: 1_000,
  managerOverrides: [{ email: manager, items: [{ ...care, amount: 64 }] }],
};
const reduction = {
  id: "change", productKey: "neon" as const, entryType: "endorsement", userEmail: owner,
  rootContractEntryId: root.id, parentContractEntryId: root.id, policyStartDate: "2022-07-01",
  previousInputAmount: 1_000, newInputAmount: 800,
};
const receipt = {
  code: "B201", statementCode: "B202", statementId: "summer", statementDate: "2023-08-01",
  writtenBy: owner, amount: 122.67, expectedAmount: 153.34, status: "difference",
  differenceReason: "commission_amount_mismatch", difference: -30.67, detail: "Old comparison", systemBaseAmount: 12_000,
};
type Entry = Parameters<typeof projectNeonCareReceiptComparisons>[0][number];
type Receipt = NonNullable<Entry["commissionPayouts"]>[number];
function project(rows: Receipt[], contract: Entry = root, change: Entry = reduction) {
  return projectNeonCareReceiptComparisons([{ ...contract, commissionPayouts: rows }, change])[0].commissionPayouts!;
}

describe("NEON care commissions booked before a premium decrease was entered", () => {
  it("uses the original recipient's rate, keeps the statement evidence and still reports a real shortfall", () => {
    const managerReceipt = { ...receipt, writtenBy: manager, expectedAmount: 64, amount: 30 };
    const entries = [{ ...root, commissionPayouts: [receipt, managerReceipt] }, reduction];
    const corrected = projectNeonCareReceiptComparisons(entries);
    expect(corrected[0]).toMatchObject({ commissionPayouts: [
      { ...receipt, expectedAmount: 122.67, difference: 0, status: "paid", differenceReason: null, detail: null },
      { ...managerReceipt, expectedAmount: 51.2, difference: -21.2, status: "difference", detail: null },
    ] });
    expect(projectNeonCareReceiptComparisons(corrected)[0]).toBe(corrected[0]);
    expect(receipt.expectedAmount).toBe(153.34);
  });

  it("applies an amendment partway through a care year only when the statement supports its effective premium", () => {
    const midYear = { ...reduction, policyStartDate: "2022-10-10" };
    const beforeChange = { ...receipt, statementDate: "2022-09-30", sourceBaseAmount: 9_600 };
    const withBase = { ...receipt, statementBaseAmount: 9_600 };
    const conflicting = { ...receipt, statementBaseAmount: 12_000 };
    const nextYear = { ...receipt, code: "B202" };
    const result = project([beforeChange, receipt, withBase, conflicting, nextYear], root, midYear);
    expect(result[0]).toBe(beforeChange);
    expect(result[1]).toBe(receipt);
    expect(result[2].expectedAmount).toBe(122.67);
    expect(result[3]).toBe(conflicting);
    expect(result[4].expectedAmount).toBe(122.67);
  });

  it("keeps other commissions, specific booked expectations, reversals and unrelated discrepancies intact", () => {
    const rows = [
      { ...receipt, code: "B101" }, { ...receipt, expectedAmount: 150 },
      { ...receipt, amount: -receipt.amount, status: "storno" }, { ...receipt, differenceReason: "career_mismatch" },
      { ...receipt, differenceReason: null }, { ...receipt, detail: "Součást opravného výpisu" },
      { ...receipt, writtenBy: "someone-else@example.test" }, { ...receipt, statementBaseAmount: 12_000 },
    ];
    project(rows).forEach((row, i) => expect(row).toBe(rows[i]));
    expect(project([receipt], { ...root, isRefresh: true })[0]).toBe(receipt);
    expect(project([receipt], root, { ...reduction, userEmail: manager })[0]).toBe(receipt);
    expect(project([receipt], root, { ...reduction, previousInputAmount: 900 })[0]).toBe(receipt);
  });
});
