import { calculateDisabilityPension, parsePensionNumber, type IncomeMode, type MinimumMode } from "./pensionCalculation";

export type PensionFormState = { income: string; years: string; incomeMode: IncomeMode; minimumMode: MinimumMode | "" };
export const EMPTY_PENSION_FORM: PensionFormState = { income: "", years: "", incomeMode: "gross", minimumMode: "" };

export function evaluatePensionForm(form: PensionFormState, clientAge?: number) {
  const income = parsePensionNumber(form.income), years = parsePensionNumber(form.years);
  const incomeError = form.income.trim() && (income === null || income > 10_000_000)
    ? "Zadej částku od 0 do 10 000 000 Kč." : "";
  const yearsError = form.years.trim() && (years === null || !Number.isInteger(years) || years > 60)
    ? "Zadej počet celých let od 0 do 60." : "";
  const minimumError = form.minimumMode === "insured15" && years !== null && years < 15
    ? "Pro tuto volbu musí celková započtená doba obsahovat alespoň 15 let pojištění."
    : form.minimumMode === "under28" && clientAge !== undefined && clientAge >= 28
      ? `Klient má ${clientAge} let. Zvýšené minimum pro mladší 28 let nelze použít. Vyber jiný režim minima.` : "";
  const result = income !== null && years !== null && form.minimumMode !== "" && !incomeError && !yearsError && !minimumError
    ? calculateDisabilityPension({ monthlyIncome: income, creditedYears: years, minimumMode: form.minimumMode }) : null;
  return { result, incomeError, yearsError, minimumError };
}
