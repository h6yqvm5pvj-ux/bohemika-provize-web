import type { IncomeMode, PensionResult } from "../invalidni-duchod/pensionCalculation";

/** A state pension estimate shown separately from the private coverage variants. */
export type DisabilityPensionPlan = {
  result: PensionResult;
  incomeMode: IncomeMode;
};

export function calculateInvalidityCover(income: number, expenses: number, months: number, ratio: number) {
  const basis = Math.max(0, income, expenses);
  const monthlyNeed = Math.round(basis * ratio);
  return { ratio, monthlyNeed, lumpWithoutDebt: monthlyNeed * Math.max(0, months) };
}
