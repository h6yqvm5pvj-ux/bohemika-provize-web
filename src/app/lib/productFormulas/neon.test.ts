import { describe, expect, it } from "vitest";

import {
  buildNeonImmediateBreakdown,
  calculateNeon,
  calculateNeonDecreaseStornoBase,
  calculateNeonRefreshCommissionBase,
  isNeonHistoricalPeriod,
  neonMaxDurationYears,
  normalizeNeonDurationYears,
} from "./neon";

describe("NEON commission formulas", () => {
  it("keeps the historical coefficient boundary at 2024-07-01", () => {
    expect(isNeonHistoricalPeriod("2019-10-01")).toBe(true);
    expect(isNeonHistoricalPeriod("2024-06-30")).toBe(true);
    expect(isNeonHistoricalPeriod("2024-07-01")).toBe(false);
    expect(isNeonHistoricalPeriod("invalid")).toBe(false);
  });

  it("clamps duration by historical and current coefficient set", () => {
    expect(neonMaxDurationYears("2024-06-30")).toBe(20);
    expect(neonMaxDurationYears("2024-07-01")).toBe(15);
    expect(normalizeNeonDurationYears(25, "2024-06-30")).toBe(20);
    expect(normalizeNeonDurationYears(25, "2024-07-01")).toBe(15);
    expect(normalizeNeonDurationYears(0, "2024-07-01")).toBe(1);
  });

  it("splits current accelerated immediate commission into A101, B0301 and half B3601", () => {
    const breakdown = buildNeonImmediateBreakdown(
      3759.3,
      "poradce1",
      "accelerated",
      "2024-07-01"
    );

    expect(breakdown).toMatchObject({
      includeB3601: true,
      totalCoefficient: 2.0885,
    });
    expect(breakdown?.parts).toEqual([
      { label: "Provize A101", amount: 2160 },
      { label: "Provize B0301", amount: 799.2 },
      { label: "Provize 50% z B3601", amount: 800.1 },
    ]);
  });

  it("uses current accelerated totals for a 15 year advisor contract", () => {
    const result = calculateNeon(
      1000,
      "poradce1",
      15,
      "accelerated",
      "2024-07-01"
    );

    expect(result.total).toBeCloseTo(6000.72, 2);
    expect(result.items.map((item) => item.code)).toEqual([
      "A101",
      "B0301",
      "B3601_HALF",
      "B3601",
      "B4801",
      "B101-B104",
      "B201-B206",
      "TOTAL",
    ]);
  });

  it("uses historical coefficients and disables accelerated B3601 split before July 2024", () => {
    const result = calculateNeon(
      1000,
      "poradce1",
      25,
      "accelerated",
      "2024-06-30"
    );

    expect(result.total).toBeCloseTo(5953.92, 2);
    expect(result.items.map((item) => item.code)).toEqual([
      "A101",
      "B0301",
      "B3601",
      "B4801",
      "B101-B104",
      "B201-B206",
      "TOTAL",
    ]);
  });

  it("calculates refresh base from remaining storno months before month 60", () => {
    const result = calculateNeonRefreshCommissionBase({
      newMonthlyPremium: 1500,
      originalMonthlyPremium: 1000,
      originalStornoStartDateIso: "2020-01-01",
      refreshPolicyStartDateIso: "2022-07-01",
    });

    expect(result).toMatchObject({
      calculationMethod: "storno_60_60",
      elapsedMonths: 30,
      remainingMonths: 30,
      calculationMonthlyPremium: 1000,
      calculationAnnualPremium: 12000,
      stornedOriginalMonthlyPremium: 500,
    });
  });

  it("calculates decrease storno base from remaining 60 month liability", () => {
    const result = calculateNeonDecreaseStornoBase({
      previousMonthlyPremium: 1500,
      newMonthlyPremium: 550,
      originalStornoStartDateIso: "2020-12-01",
      endorsementPolicyStartDateIso: "2022-12-01",
    });

    expect(result).toMatchObject({
      previousMonthlyPremium: 1500,
      newMonthlyPremium: 550,
      premiumDecreaseMonthly: 950,
      calculationMonthlyPremium: 570,
      elapsedMonths: 24,
      remainingMonths: 36,
      remainingRatio: 0.6,
    });
  });

  it("calculates refresh base from motivational premium after month 60", () => {
    const result = calculateNeonRefreshCommissionBase({
      newMonthlyPremium: 1500,
      originalMonthlyPremium: 1000,
      stornoBaseMonthlyPremium: 1000,
      originalStornoStartDateIso: "2020-01-01",
      refreshPolicyStartDateIso: "2025-01-01",
    });

    expect(result).toMatchObject({
      calculationMethod: "motivational_48_percent",
      elapsedMonths: 60,
      remainingMonths: 0,
      motivationalMonthlyPremium: 480,
      calculationMonthlyPremium: 980,
      calculationAnnualPremium: 11760,
    });
  });
});
