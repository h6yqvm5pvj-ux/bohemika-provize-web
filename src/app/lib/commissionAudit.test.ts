import { describe, expect, it } from "vitest";
import { commissionAuditSummaryForContract } from "./commissionAudit";

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
  it("includes C102 differences in the subsequent filter and retains the source code", () => {
    const payout = { key: "C102-underpayment", code: "C102", status: "difference" as const,
      amount: 80, expectedAmount: 100, difference: -20, writtenBy: "owner@example.test" };
    const summary = commissionAuditSummaryForContract({
      productKey: "kooperativaAuto", commissionPayouts: [payout],
    }, { mode: "difference", codeFilter: "subsequent" });
    expect(summary.differenceCount).toBe(1);
    expect(summary.items).toEqual([expect.objectContaining({ code: "C102", amount: 80, difference: -20 })]);
    expect(commissionAuditSummaryForContract({
      productKey: "cppAuto", commissionPayouts: [payout],
    }, { mode: "difference", codeFilter: "subsequent" }).items).toEqual([]);
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
