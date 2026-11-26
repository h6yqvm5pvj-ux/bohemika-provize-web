import { describe, expect, it } from "vitest";
import { commissionAuditSummaryForContract } from "./commissionAudit";
import type { CommissionAuditContract } from "./commissionAudit";

describe("combined auto acquisition payments in the portfolio audit", () => {
  const owner = "owner@example.test";
  const contract: CommissionAuditContract = {
    id: "synthetic", productKey: "cppAuto", frequencyRaw: "quarterly", userEmail: owner,
    policyStartDate: "2025-01-15", contractSignedDate: "2025-01-15",
    items: [{ code: "A101-A104", title: "Okamžitá provize", amount: 124.32 }],
    commissionPayouts: [
      { key: "first", code: "A101", status: "paid", amount: 124.32, payoutMonthKey: "2025-2", writtenBy: owner },
      { key: "bundle", code: "A103", status: "difference", differenceReason: "premium_base_mismatch", amount: 248.64,
        sourceBaseAmount: 2220, systemBaseAmount: 1110, expectedAmount: 124.32, payoutMonthKey: "2025-8", writtenBy: owner },
    ],
  };
  const options = { mode: "all" as const, now: new Date(2025, 11, 1, 12) };

  it("removes the covered A102 and the explained difference while leaving the overdue A104 visible", () => {
    const audit = commissionAuditSummaryForContract(contract, options);
    expect(audit.items).toEqual([expect.objectContaining({ code: "A104", status: "overdue" })]);
    expect(audit.differenceCount).toBe(0);
  });

  it("keeps a genuine difference that belongs to a different receipt", () => {
    const audit = commissionAuditSummaryForContract({ ...contract, commissionPayouts: [
      ...contract.commissionPayouts!,
      { key: "separate", code: "A104", status: "difference", differenceReason: "premium_base_mismatch", amount: 80,
        sourceBaseAmount: 700, systemBaseAmount: 1110, expectedAmount: 124.32, payoutMonthKey: "2025-11", writtenBy: owner },
    ] }, options);
    expect(audit.items).toEqual([expect.objectContaining({ code: "A104", status: "difference", amount: 80 })]);
  });
});

describe("life payout audit by annual base", () => {
  it("reports both small-base and regular B101 underpayments", () => {
    const summary = commissionAuditSummaryForContract({
      productKey: "neon", position: "manazer4", inputAmount: 1657,
      commissionPayouts: [
        { key: "small-base", code: "B101", status: "difference", amount: 2.38, expectedAmount: 78.74, difference: -76.36, detail: "Základna výpisu 600,00 Kč." },
        { key: "risk", code: "B101", status: "difference", amount: 30, expectedAmount: 78.74, difference: -48.74, statementBaseAmount: 19_884, systemBaseAmount: 19_884 },
      ],
    }, { mode: "difference", now: new Date("2026-09-09T12:00:00Z") });
    expect(summary.differenceCount).toBe(2);
    expect(summary.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "B101", amount: 2.38, difference: -76.36 }),
      expect.objectContaining({ code: "B101", amount: 30, difference: -48.74 }),
    ]));
  });
});


describe("Kooperativa Auto subsequent C payout audit", () => {
  it("does not treat renewal estimates as known amounts for discrepancy checks", () => {
    const payout = { key: "C102-underpayment", code: "C102", status: "difference" as const,
      amount: 80, expectedAmount: 100, difference: -20, writtenBy: "owner@example.test" };
    const summary = commissionAuditSummaryForContract({
      productKey: "kooperativaAuto", commissionPayouts: [payout],
    }, { mode: "difference", codeFilter: "subsequent" });
    expect(summary.differenceCount).toBe(0);
    expect(summary.items).toEqual([]);
    expect(commissionAuditSummaryForContract({
      productKey: "cppAuto", commissionPayouts: [payout],
    }, { mode: "difference", codeFilter: "subsequent" }).items).toEqual([]);
  });

  it("retains an unresolved career mismatch on a renewal receipt", () => {
    expect(commissionAuditSummaryForContract({
      productKey: "kooperativaAuto", position: "poradce7",
      commissionPayouts: [{ code: "C102", amount: 80, status: "difference", career: "6", differenceReason: "career_mismatch" }],
    }, { mode: "career_mismatch", codeFilter: "subsequent" }).careerMismatchCount).toBe(1);
  });

  it("resolves a C102 career mismatch with its B102 correction and corrected payment", () => {
    const summary = commissionAuditSummaryForContract({
      productKey: "kooperativaAuto", position: "poradce7",
      commissionPayouts: [
        { key: "mismatch", code: "C102", status: "difference", amount: 80, expectedAmount: 100,
          career: "6", differenceReason: "career_mismatch", writtenBy: "owner@example.test", statementChronologyMs: 1 },
        { key: "correction", code: "B102", status: "storno", amount: -80,
          writtenBy: "owner@example.test", statementChronologyMs: 2 },
        { key: "fixed", code: "B102", status: "paid", amount: 100,
          career: "7", writtenBy: "owner@example.test", statementChronologyMs: 3 },
      ],
    }, { mode: "career_mismatch", codeFilter: "subsequent" });
    expect(summary.items).toEqual([]);
  });
});
