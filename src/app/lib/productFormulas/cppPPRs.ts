import {
  type Position,
  type CommissionResultDTO,
  type CommissionResultItemDTO,
  type PaymentFrequency,
} from "../../types/domain";
import { commissionInstallmentCodeRange, pct, periodsPerYear } from "./shared";

// ---------- ČPP Pojištění majetku a odpovědnosti podnikatelů (ÚPIS) ----------

export const CPP_PPRS_COEFFICIENT_VALID_FROM = "2023-06-01";

export function cppPPRsCoefficient(position: Position): number {
  switch (position) {
    // Poradci 1–10
    case "poradce1":
      return pct(3.46);
    case "poradce2":
      return pct(3.67);
    case "poradce3":
      return pct(4.2);
    case "poradce4":
      return pct(5.24);
    case "poradce5":
      return pct(5.89);
    case "poradce6":
      return pct(6.3);
    case "poradce7":
      return pct(7.04);
    case "poradce8":
      return pct(7.46);
    case "poradce9":
      return pct(7.77);
    case "poradce10":
      return pct(7.99);
    // Manažeři 4–10
    case "manazer4":
      return pct(6.3);
    case "manazer5":
      return pct(7.04);
    case "manazer6":
      return pct(7.72);
    case "manazer7":
      return pct(8.4);
    case "manazer8":
      return pct(9.14);
    case "manazer9":
      return pct(9.76);
    case "manazer10":
      return pct(10.5);
  }
}

export function cppPPRsImmediateCoefficient(position: Position): number {
  return cppPPRsCoefficient(position);
}

export function cppPPRsSubsequentCoefficient(position: Position): number {
  return cppPPRsCoefficient(position);
}

export function calculateCppPPRs(
  amount: number,
  frequency: PaymentFrequency,
  position: Position
): CommissionResultDTO {
  const coef = cppPPRsCoefficient(position);
  const perPaymentImmediate = amount * coef;
  const perPaymentSubsequent = amount * coef;
  const paymentsPerYear = periodsPerYear(frequency);
  const annualImmediate = perPaymentImmediate * paymentsPerYear;
  const annualSubsequent = perPaymentSubsequent * paymentsPerYear;

  const items: CommissionResultItemDTO[] = [
    {
      title: "💼 Okamžitá provize (z platby)",
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
