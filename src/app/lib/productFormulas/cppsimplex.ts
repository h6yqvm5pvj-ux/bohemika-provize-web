import {
  type Position,
  type CommissionResultDTO,
  type CommissionResultItemDTO,
  type PaymentFrequency,
} from "../../types/domain";
import { commissionInstallmentCodeRange, pct, periodsPerYear } from "./shared";

// ---------- ČPP Simplex ----------

export const CPP_SIMPLEX_COEFFICIENT_VALID_FROM = "2021-09-01";

export function cppSimplexCoefficient(position: Position): number {
  switch (position) {
    // Poradci 1–10
    case "poradce1":
      return pct(4.62);
    case "poradce2":
      return pct(5.16);
    case "poradce3":
      return pct(5.6);
    case "poradce4":
      return pct(6.99);
    case "poradce5":
      return pct(7.86);
    case "poradce6":
      return pct(8.4);
    case "poradce7":
      return pct(9.38);
    case "poradce8":
      return pct(9.94);
    case "poradce9":
      return pct(10.36);
    case "poradce10":
      return pct(10.66);
    // Manažeři 4–10
    case "manazer4":
      return pct(8.4);
    case "manazer5":
      return pct(9.4);
    case "manazer6":
      return pct(10);
    case "manazer7":
      return pct(11);
    case "manazer8":
      return pct(12);
    case "manazer9":
      return pct(13);
    case "manazer10":
      return pct(14);
  }
}

export function cppSimplexImmediateCoefficient(position: Position): number {
  return cppSimplexCoefficient(position);
}

export function cppSimplexSubsequentCoefficient(position: Position): number {
  return cppSimplexCoefficient(position);
}

export function calculateCppSimplex(
  amount: number,
  frequency: PaymentFrequency,
  position: Position
): CommissionResultDTO {
  const coef = cppSimplexCoefficient(position);
  const perPaymentImmediate = amount * coef;
  const perPaymentSubsequent = amount * coef;
  const paymentsPerYear = periodsPerYear(frequency);
  const annualImmediate = perPaymentImmediate * paymentsPerYear;
  const annualSubsequent = perPaymentSubsequent * paymentsPerYear;

  const items: CommissionResultItemDTO[] = [
    {
      title: "🏠 Okamžitá provize (z platby)",
      amount: perPaymentImmediate,
      code: commissionInstallmentCodeRange("A", frequency),
    },
    {
      title: "🔁 Následná provize (z platby)",
      amount: perPaymentSubsequent,
      code: commissionInstallmentCodeRange("B", frequency),
      excludeFromTotal: true,
    },
    {
      title: "📅 Okamžitá provize za rok",
      amount: annualImmediate,
      note: `×${paymentsPerYear} plateb/rok`,
    },
    {
      title: "📅 Následná provize za rok",
      amount: annualSubsequent,
      note: `×${paymentsPerYear} plateb/rok`,
      excludeFromTotal: true,
    },
  ];

  return { items, total: annualImmediate };
}
