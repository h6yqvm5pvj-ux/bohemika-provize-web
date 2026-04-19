import {
  type Position,
  type CommissionResultDTO,
  type CommissionResultItemDTO,
  type PaymentFrequency,
} from "../../types/domain";
import { pct, periodsPerYear } from "./shared";

// ---------- ČPP Simplex ----------

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

export function calculateCppSimplex(
  amount: number,
  frequency: PaymentFrequency,
  position: Position
): CommissionResultDTO {
  const coef = cppSimplexCoefficient(position);
  const perPayment = amount * coef;
  const annualTotal = perPayment * periodsPerYear(frequency);

  const items: CommissionResultItemDTO[] = [
    { title: "🏠 Okamžitá provize", amount: perPayment },
    { title: "📅 Provize za rok", amount: annualTotal },
  ];

  return { items, total: annualTotal };
}


