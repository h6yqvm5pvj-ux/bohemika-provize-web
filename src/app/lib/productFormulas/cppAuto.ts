import {
  type Position,
  type CommissionResultDTO,
  type CommissionResultItemDTO,
  type PaymentFrequency,
} from "../../types/domain";
import { periodsPerYear } from "./shared";

// ---------- ČPP Auto ----------

export function cppAutoCoefficient(position: Position): number {
  switch (position) {
    // Poradci 1–10
    case "poradce1":
    case "poradce2":
    case "poradce3":
      return 0.08;
    case "poradce4":
      return 0.104;
    case "poradce5":
      return 0.106;
    case "poradce6":
      return 0.108;
    case "poradce7":
      return 0.112;
    case "poradce8":
      return 0.116;
    case "poradce9":
      return 0.118;
    case "poradce10":
      return 0.119;
    // Manažeři 4–10
    case "manazer4":
      return 0.11;
    case "manazer5":
      return 0.112;
    case "manazer6":
      return 0.12;
    case "manazer7":
      return 0.127;
    case "manazer8":
      return 0.128;
    case "manazer9":
      return 0.129;
    case "manazer10":
      return 0.13;
  }
}

export function calculateCppAuto(
  amount: number,
  frequency: PaymentFrequency,
  position: Position
): CommissionResultDTO {
  const coef = cppAutoCoefficient(position);
  const perPayment = amount * coef;
  const annualTotal = perPayment * periodsPerYear(frequency);

  const items: CommissionResultItemDTO[] = [
    { title: "🚗 Okamžitá provize", amount: perPayment },
    { title: "📅 Provize za rok", amount: annualTotal },
  ];
  return { items, total: annualTotal };
}


