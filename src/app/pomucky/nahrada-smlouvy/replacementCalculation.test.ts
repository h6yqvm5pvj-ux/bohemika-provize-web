import { describe, expect, it } from "vitest";

import { calculateReplacement } from "./replacementCalculation";

describe("calculateReplacement", () => {
  it("matches the supplied annual-premium example", () => {
    const result = calculateReplacement({
      originalStartDate: "2025-03-25",
      replacementStartDate: "2025-08-18",
      referenceDate: "2026-08-28",
      originalPremium: 18_158,
      originalFrequency: "annual",
      replacementPremium: 13_383,
      replacementFrequency: "annual",
    });

    expect(result).toMatchObject({
      ok: true,
      originalEndDate: "2025-08-17",
      originalNextPaymentDate: "2027-03-25",
      replacementNextPaymentDate: "2027-08-18",
      paymentShiftDays: 146,
      paidPeriodStartDate: "2025-03-25",
      paidPeriodEndDate: "2026-03-24",
      nominalElapsedDays: 144,
      nominalPeriodDays: 360,
      transferredPremium: 10_895,
      balance: 2_488,
      balanceType: "surcharge",
    });
  });

  it("uses only the currently paid quarterly period", () => {
    const result = calculateReplacement({
      originalStartDate: "2025-01-15",
      replacementStartDate: "2025-02-15",
      referenceDate: "2025-02-15",
      originalPremium: 3_000,
      originalFrequency: "quarterly",
      replacementPremium: 1_500,
      replacementFrequency: "monthly",
    });

    expect(result).toMatchObject({
      ok: true,
      originalNextPaymentDate: "2025-04-15",
      replacementNextPaymentDate: "2025-03-15",
      paymentShiftDays: -31,
      paidPeriodStartDate: "2025-01-15",
      paidPeriodEndDate: "2025-04-14",
      nominalElapsedDays: 30,
      nominalPeriodDays: 90,
      transferredPremium: 2_000,
      balance: -500,
      balanceType: "overpayment",
    });
  });

  it.each([
    ["monthly", "2026-09-25", "2026-09-18", -7],
    ["quarterly", "2026-09-25", "2026-11-18", 54],
    ["semiannual", "2026-09-25", "2027-02-18", 146],
    ["annual", "2027-03-25", "2027-08-18", 146],
  ] as const)(
    "finds the next %s payments from the current date",
    (frequency, originalNextPaymentDate, replacementNextPaymentDate, paymentShiftDays) => {
      const result = calculateReplacement({
        originalStartDate: "2025-03-25",
        replacementStartDate: "2025-08-18",
        referenceDate: "2026-08-28",
        originalPremium: 18_158,
        originalFrequency: frequency,
        replacementPremium: 13_383,
        replacementFrequency: frequency,
      });

      expect(result).toMatchObject({
        ok: true,
        originalNextPaymentDate,
        replacementNextPaymentDate,
        paymentShiftDays,
      });
    }
  );

  it.each([
    ["monthly", 0],
    ["quarterly", 800],
    ["semiannual", 1_000],
    ["annual", 1_100],
  ] as const)(
    "repeats %s installments across annual contract anniversaries",
    (frequency, expectedTransfer) => {
      const result = calculateReplacement({
        originalStartDate: "2024-01-10",
        replacementStartDate: "2025-02-10",
        referenceDate: "2025-02-10",
        originalPremium: 1_200,
        originalFrequency: frequency,
        replacementPremium: 1_300,
        replacementFrequency: frequency,
      });

      expect(result).toMatchObject({
        ok: true,
        transferredPremium: expectedTransfer,
        balance: 1_300 - expectedTransfer,
      });
    }
  );

  it("returns no transfer on the next payment boundary", () => {
    const result = calculateReplacement({
      originalStartDate: "2024-04-10",
      replacementStartDate: "2025-04-10",
      referenceDate: "2025-04-10",
      originalPremium: 12_000,
      originalFrequency: "annual",
      replacementPremium: 10_000,
      replacementFrequency: "annual",
    });

    expect(result).toMatchObject({
      ok: true,
      paidPeriodStartDate: "2024-04-10",
      paidPeriodEndDate: "2025-04-09",
      unusedShare: 0,
      transferredPremium: 0,
      balance: 10_000,
      originalNextPaymentDate: "2026-04-10",
      replacementNextPaymentDate: "2026-04-10",
      paymentShiftDays: 0,
    });
  });

  it("transfers the whole installment when both contracts start together", () => {
    const result = calculateReplacement({
      originalStartDate: "2025-06-01",
      replacementStartDate: "2025-06-01",
      referenceDate: "2025-06-01",
      originalPremium: 1_200,
      originalFrequency: "monthly",
      replacementPremium: 1_000,
      replacementFrequency: "monthly",
    });

    expect(result).toMatchObject({
      ok: true,
      unusedShare: 1,
      transferredPremium: 1_200,
      balance: -200,
      balanceType: "overpayment",
    });
  });

  it("rejects a replacement beginning before the original contract", () => {
    expect(
      calculateReplacement({
        originalStartDate: "2025-06-01",
        replacementStartDate: "2025-05-31",
        referenceDate: "2025-06-01",
        originalPremium: 1_200,
        originalFrequency: "monthly",
        replacementPremium: 1_000,
        replacementFrequency: "monthly",
      })
    ).toEqual({ ok: false, error: "replacement-before-original" });
  });
});
