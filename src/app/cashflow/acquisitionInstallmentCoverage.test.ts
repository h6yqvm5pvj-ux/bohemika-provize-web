import { describe, expect, it } from "vitest";
import { generateCashflow } from "./generator";
import { computeCashflow, type CashflowSnapshot } from "./computeCashflow";
import type { CashflowCommissionStatementSummary, EntryDoc } from "./types";
import { parseCashflowSnapshot, serializeCashflowSnapshot } from "./cashflowSnapshotWire";
const viewer = "adviser@example.test";
const fixture = (): EntryDoc => ({ id: "synthetic", userEmail: viewer, source: "own", productKey: "zamex", frequencyRaw: "quarterly",
  policyStartDate: "2025-01-01", contractSignedDate: "2024-12-01",
  items: [{ title: "Okamžitá provize", code: "A101-A104", amount: 135.8 }],
  commissionPayouts: [
    { key: "one", code: "A101", amount: 135.8, status: "paid", payoutMonthKey: "2025-1", writtenBy: viewer },
    { key: "two", code: "A102", amount: 271.59, status: "difference", differenceReason: "commission_amount_mismatch", payoutMonthKey: "2025-4", writtenBy: viewer, statementNumber: "SYNTHETIC" },
    { key: "three", code: "A103", amount: 135.8, status: "paid", payoutMonthKey: "2025-7", writtenBy: viewer },
  ],
});
const generate = (entries: EntryDoc[], email = viewer) => generateCashflow(entries, 2, email, new Date(2025, 0, 1));
describe("cashflow for combined acquisition installments", () => {
  it("settles the missing A104 in the actual payment month without duplicating income", () => {
    const rows = generate([fixture()]).filter(item => item.commissionCode?.startsWith("A"));
    expect(rows).toHaveLength(4);
    expect(rows.every(item => item.payoutStatus === "paid")).toBe(true);
    expect(rows.find(item => item.commissionCode === "A104")).toMatchObject({ amount: 135.79, commissionStatementNumber: "SYNTHETIC", installmentCoverageNote: expect.stringContaining("A102") });
    expect(rows.find(item => item.commissionCode === "A104")?.date.getMonth()).toBe(3);
    expect(rows.reduce((sum, item) => sum + Math.round(item.amount * 100), 0)).toBe(54319);
    const wire = serializeCashflowSnapshot({ items: rows, months: [] });
    expect(parseCashflowSnapshot(wire)?.items.find(item => item.commissionCode === "A104")?.installmentCoverageNote).toBeDefined();
  });
  it("does not borrow from another contract, owner or viewer", () => {
    const entry = fixture(); entry.commissionPayouts = entry.commissionPayouts!.slice(0, 1);
    const other = { ...fixture(), id: "other", userEmail: "other@example.test" };
    expect(generate([entry, other]).find(item => item.entryId === "synthetic" && item.commissionCode === "A104")?.payoutStatus).not.toBe("paid");
    expect(generate([fixture()], "other@example.test").some(item => item.installmentCoverageNote)).toBe(false);
    expect(generate([fixture()], "").some(item => item.installmentCoverageNote)).toBe(false);
  });
  it("retains a real outstanding installment and does not mutate inputs", () => {
    const entry = fixture(); entry.commissionPayouts![1].amount = 135.8;
    const before = structuredClone(entry);
    expect(generate([entry]).find(item => item.commissionCode === "A104")?.payoutStatus).not.toBe("paid");
    expect(entry).toEqual(before);
  });

  it("uses the doubled quarterly base and posts the real cash once when A103 covers A104", () => {
    const contract: EntryDoc = { ...fixture(), productKey: "cppAuto", inputAmount: 1100, contractNumber: "123456789",
      policyStartDate: "2024-06-06", contractSignedDate: "2024-06-06",
      items: [{ title: "Okamžitá provize", code: "A101-A104", amount: 124.32 }],
      commissionPayouts: [
        { key: "first", code: "A101", amount: 123.2, status: "paid", payoutMonthKey: "2024-7", sourceBaseAmount: 1100, writtenBy: viewer },
        { key: "second", code: "A102", amount: 124.32, status: "paid", payoutMonthKey: "2024-11", sourceBaseAmount: 1110, writtenBy: viewer },
        { key: "combined", code: "APZ103", amount: 248.64, status: "difference", differenceReason: "premium_base_mismatch",
          payoutMonthKey: "2025-5", expectedAmount: 124.32, systemBaseAmount: 1100, statementId: "combined", statementNumber: "TEST", writtenBy: viewer },
      ] };
    const snapshot: CashflowSnapshot = { email: viewer, myPosition: null, myCommissionMode: null,
      hasAnyTeam: false, ownEntries: [contract], teamEntriesRaw: [], tipPayouts: [], subscriptionPayments: [] };
    const statement: CashflowCommissionStatementSummary = { id: "combined", fileName: "statement.html", statementNumber: "TEST",
      statementDate: null, period: "04/2025", advisorNumber: null, periodStartMs: null, periodEndMs: null, statementDateMs: null,
      payoutMonthKey: "2025-5", paidContractNumbers: ["123456789"], paidCommissionKeys: ["123456789:APZ103"],
      paidAutoInstallments: [{ contractNumber: "123456789", productKey: "cppAuto", source: "own",
        code: "APZ103", amount: 248.64, sourceBaseAmount: 2220 }],
      commissionTotal: 248.64, payoutTotal: 248.64, otherPaymentsTotal: 0, managerCommissionTotal: 0, createdAtMs: null, updatedAtMs: null };
    const items = (statements: CashflowCommissionStatementSummary[]) => computeCashflow(snapshot, {
      scopeFilter: "combined", productFilter: "all", asOf: new Date(2026, 10, 23), statements,
    }).filter(item => /^A10[1-4]$/.test(item.commissionCode ?? ""));

    expect(items([]).find(item => item.commissionCode === "A104")?.payoutStatus).not.toBe("paid");
    const rows = items([statement]);
    expect(rows).toHaveLength(4);
    expect(rows.every(item => item.payoutStatus === "paid")).toBe(true);
    expect(rows.filter(item => item.date.getTime() === new Date(2025, 4, 25).getTime())).toEqual([
      expect.objectContaining({ commissionCode: "A103", amount: 124.32, commissionStatementNumber: "TEST" }),
      expect.objectContaining({ commissionCode: "A104", amount: 124.32, commissionStatementNumber: "TEST" }),
    ]);
    expect(rows.reduce((sum, item) => sum + Math.round(item.amount * 100), 0)).toBe(49616);
  });
});
