import { describe, expect, it } from "vitest";
import { calculateFlexiRenovationBase } from "./flexiRenovation";
import { calculateFlexi } from "./productFormulas/flexi";
import { lifeRiskAnnualPremiumBase } from "./commissionPayoutRules";

describe("FLEXI renovation", () => {
  it("keeps the full premium separate from the half-original plus increase commission base", () => {
    const base = calculateFlexiRenovationBase({ originalMonthlyPremium: 1_000, premiumIncreaseMonthly: 500, guaranteeStatus: "outside" });
    expect(base).toMatchObject({ newMonthlyPremium: 1_500, calculationMonthlyPremium: 1_000,
      originalAnnualPremium: 12_000, premiumIncreaseAnnual: 6_000, calculationAnnualPremium: 12_000, provisional: false });
  });

  it.each(["standard", "accelerated"] as const)("applies the ordinary %s schedule and coefficients to both components", mode => {
    const base = calculateFlexiRenovationBase({ originalMonthlyPremium: 1_000, premiumIncreaseMonthly: 500, guaranteeStatus: "outside" })!;
    for (const position of ["poradce1", "poradce4", "manazer4", "manazer8"] as const) {
      const actual = calculateFlexi(base.calculationMonthlyPremium, position, mode, 30);
      const original = calculateFlexi(1_000, position, mode, 30);
      const increase = calculateFlexi(500, position, mode, 30);
      actual.items.forEach((item, index) => {
        expect(item.code).toBe(original.items[index].code);
        // Installments are individually rounded by the existing FLEXI formula.
        expect(Math.abs(item.amount - (original.items[index].amount * 0.5 + increase.items[index].amount))).toBeLessThanOrEqual(0.01);
      });
      expect(actual.total).toBeCloseTo(original.total * 0.5 + increase.total, 2);
    }
  });

  it("marks unverified eligibility as provisional", () => {
    expect(calculateFlexiRenovationBase({ originalMonthlyPremium: 1_000, premiumIncreaseMonthly: 0, guaranteeStatus: "unknown" }))
      .toMatchObject({ calculationMonthlyPremium: 500, provisional: true });
  });

  it("uses only the increase during the guarantee period, including a real zero base", () => {
    expect(calculateFlexiRenovationBase({ originalMonthlyPremium: 1_000, premiumIncreaseMonthly: 500, guaranteeStatus: "inside" }))
      .toMatchObject({ calculationMonthlyPremium: 500, originalCommissionRatio: 0, provisional: true });
    const base = calculateFlexiRenovationBase({ originalMonthlyPremium: 1_000, premiumIncreaseMonthly: 0, guaranteeStatus: "inside" })!;
    expect(base.calculationMonthlyPremium).toBe(0);
    expect(calculateFlexi(0, "poradce1").total).toBe(0);
    expect(lifeRiskAnnualPremiumBase({ refreshCommissionBase: base, calculationInputAmount: 0, inputAmount: 1_000 })).toBe(0);
  });

  it.each([[0, 100], [-1, 100], [1_000, -1], [Number.NaN, 0], [1_000, Infinity], [Number.MAX_VALUE, 0]])(
    "rejects invalid monetary values (%s, %s)", (originalMonthlyPremium, premiumIncreaseMonthly) => {
      expect(calculateFlexiRenovationBase({ originalMonthlyPremium, premiumIncreaseMonthly, guaranteeStatus: "outside" })).toBeNull();
    },
  );
});
