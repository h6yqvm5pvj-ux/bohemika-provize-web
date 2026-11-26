import { describe, expect, it } from "vitest";
import { summarizeCommissionPayouts, type CommissionPayoutComparison } from "./commissionPayoutComparison";

describe("commission payout comparison", () => {
  it("compares only paid components and keeps unidentified receipts outside the ratio", () => {
    const base = { code: "A101", amount: 70 };
    const supplement = { code: "NV101", amount: 50 };
    const unknown = { code: "B999", amount: 38 };
    const pending = { code: "B3601", amount: 90, status: "pending" };
    const plans: CommissionPayoutComparison[] = [
      { title: "A101", code: "A101", expected: 100, position: null, records: [base, supplement] },
      { title: "B3601", code: "B3601", expected: 900, position: null, records: [pending] },
    ];
    expect(summarizeCommissionPayouts(plans, [base, supplement, supplement, pending, unknown], "neon")).toMatchObject({
      expected: 10000, paid: 15800, compared: 12000, above: 2000, below: 0, uncompared: 3800, uncomparedCount: 1,
    });
  });

  it("nets reversals and leaves ambiguous matches out of the expected amount", () => {
    const payment = { code: "A101", amount: 100 };
    const reversed = { code: "A101", amount: 100, status: "storno" };
    const paidAgain = { code: "A101", amount: 81 };
    const other = { code: "B3601", amount: 65 };
    const base: CommissionPayoutComparison = { title: "A101", code: "A101", expected: 100, position: null, records: [payment, reversed, paidAgain] };
    const ambiguous: CommissionPayoutComparison = { title: "B3601", code: "B3601", expected: 70, position: null, records: [other] };
    expect(summarizeCommissionPayouts([base], [payment, reversed, paidAgain], "neon")).toMatchObject({
      expected: 10000, paid: 8100, compared: 8100, below: 1900,
    });
    expect(summarizeCommissionPayouts([base, ambiguous, { ...ambiguous }], [payment, reversed, other], "neon")).toMatchObject({
      expected: 0, paid: 6500, compared: 0, above: 0, below: 0, uncompared: 6500, uncomparedCount: 1,
    });
  });

  it("reconciles the original payout before applying the contract deduction", () => {
    const wrongPayout = { code: "A101", amount: 70, statementDate: "2026-03-02" };
    const correction = { code: "A101", amount: -70, statementDate: "2026-08-02", detail: "Součást opravného výpisu" };
    const correctedPayout = { code: "A101", amount: 100, statementDate: "2026-08-02" };
    const storno = { code: "A101", amount: -100, statementDate: "2026-08-04" };
    const records = [wrongPayout, correction, correctedPayout, storno];
    const plan = { title: "A101", code: "A101", expected: 100, position: null, records };
    const summary = summarizeCommissionPayouts([plan], records, "allianzAuto", { effectiveDate: "2026-07-01" });
    expect(summary).toMatchObject({
      isCancelled: true, expected: 10_000, paidBeforeStorno: 10_000, storno: -10_000, paid: 0, above: 0, below: 0,
      rows: [{ expected: 10_000, paidBeforeStorno: 10_000, storno: -10_000, paid: 0 }],
    });
  });

  it("keeps a real payout difference and discloses reversals without a dated link", () => {
    const payment = { code: "A101", amount: 80, statementDate: "2026-01-31" };
    const storno = { code: "A101", amount: -35, statementDate: "2026-07-31" };
    const undated = { code: "B101", amount: -20 };
    const plans = [
      { title: "A101", code: "A101", expected: 100, position: null, records: [payment, storno] },
      { title: "B101", code: "B101", expected: 30, position: null, records: [undated] },
    ];
    expect(summarizeCommissionPayouts(plans, [payment, storno, undated], "allianzAuto", { effectiveDate: "2026-07-23" }))
      .toMatchObject({
        expected: 10_000, paidBeforeStorno: 8_000, storno: -5_500, paid: 2_500, below: 2_000, hasUndatedDeduction: true,
        rows: [
          { paidBeforeStorno: 8_000, storno: -3_500, hasUndatedDeduction: false },
          { expected: null, hasPayment: false, storno: -2_000, hasUndatedDeduction: true },
        ],
      });
  });
});
