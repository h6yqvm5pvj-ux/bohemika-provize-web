export type FlexiRenovationGuaranteeStatus = "unknown" | "outside" | "inside";

export type FlexiRenovationInput = {
  originalMonthlyPremium: number;
  premiumIncreaseMonthly: number;
  guaranteeStatus: FlexiRenovationGuaranteeStatus;
};

const money = (value: number) => Math.round(value * 100) / 100;

/** Unknown eligibility includes an estimated 50% bonus; compensation during guarantee is not estimated. */
export function calculateFlexiRenovationBase(input: FlexiRenovationInput) {
  const { originalMonthlyPremium, premiumIncreaseMonthly, guaranteeStatus } = input;
  if (
    !Number.isFinite(originalMonthlyPremium) || originalMonthlyPremium <= 0 ||
    !Number.isFinite(premiumIncreaseMonthly) || premiumIncreaseMonthly < 0 ||
    !["unknown", "outside", "inside"].includes(guaranteeStatus)
  ) return null;

  const original = money(originalMonthlyPremium);
  const increase = money(premiumIncreaseMonthly);
  const originalCommissionRatio = guaranteeStatus === "inside" ? 0 : 0.5;
  const newMonthlyPremium = money(original + increase);
  const calculationMonthlyPremium = money(original * originalCommissionRatio + increase);
  if (!Number.isFinite(newMonthlyPremium * 12) || original <= 0) return null;

  return {
    productKey: "flexi" as const,
    method: "koop_flexi_renovation" as const,
    guaranteeStatus,
    originalCommissionRatio,
    provisional: guaranteeStatus !== "outside",
    originalMonthlyPremium: original,
    originalAnnualPremium: money(original * 12),
    premiumIncreaseMonthly: increase,
    premiumIncreaseAnnual: money(increase * 12),
    newMonthlyPremium,
    newAnnualPremium: money(newMonthlyPremium * 12),
    calculationMonthlyPremium,
    calculationAnnualPremium: money(calculationMonthlyPremium * 12),
  };
}

export type FlexiRenovationBase = NonNullable<ReturnType<typeof calculateFlexiRenovationBase>>;
