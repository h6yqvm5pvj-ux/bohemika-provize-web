import { describe, expect, it } from "vitest";
import { commissionAuditSummaryForContract } from "./commissionAudit";

describe("life payout audit by annual base", () => {
  it("ignores an old small-base mismatch but keeps a real B101 risk underpayment", () => {
    const summary = commissionAuditSummaryForContract({
      productKey: "neon", position: "manazer4", inputAmount: 1657,
      commissionPayouts: [
        { key: "investment", code: "B101", status: "difference", amount: 2.38, expectedAmount: 78.74, difference: -76.36, detail: "Základna výpisu 600,00 Kč." },
        { key: "risk", code: "B101", status: "difference", amount: 30, expectedAmount: 78.74, difference: -48.74, statementBaseAmount: 19_884, systemBaseAmount: 19_884 },
      ],
    }, { mode: "difference", now: new Date("2026-09-09T12:00:00Z") });
    expect(summary.differenceCount).toBe(1);
    expect(summary.items[0]).toMatchObject({ code: "B101", amount: 30, difference: -48.74 });
  });
});
