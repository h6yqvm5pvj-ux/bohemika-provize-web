import {
  type Position,
  type CommissionResultDTO,
  type CommissionResultItemDTO,
  type PaymentFrequency,
} from "../../types/domain";
import { pct, periodsPerYear } from "./shared";

export const ALLIANZ_MUJ_DOMOV_COEFFICIENT_VALID_FROM = "2020-06-01";

// ---------- Allianz MůjDomov ----------

export function allianzMujDomovImmediateCoefficient(position: Position): number {
  switch (position) {
    // Poradci 1–10
    case "poradce1":
      return pct(10.39);
    case "poradce2":
      return pct(11.61);
    case "poradce3":
      return pct(12.6);
    case "poradce4":
      return pct(15.73);
    case "poradce5":
      return pct(17.68);
    case "poradce6":
      return pct(18.9);
    case "poradce7":
      return pct(21.11);
    case "poradce8":
      return pct(22.37);
    case "poradce9":
      return pct(23.32);
    case "poradce10":
      return pct(23.98);
    // Manažeři 4–10
    case "manazer4":
      return pct(18.9);
    case "manazer5":
      return pct(21.11);
    case "manazer6":
      return pct(23.17);
    case "manazer7":
      return pct(25.2);
    case "manazer8":
      return pct(27.41);
    case "manazer9":
      return pct(29.29);
    case "manazer10":
      return pct(31.5);
  }
}

export function allianzMujDomovSubsequentCoefficient(position: Position): number {
  switch (position) {
    // Poradci 1–10
    case "poradce1":
      return pct(3.46);
    case "poradce2":
      return pct(3.87);
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

export function calculateAllianzMujDomov(
  amount: number,
  frequency: PaymentFrequency,
  position: Position
): CommissionResultDTO {
  const annualPremium = amount * periodsPerYear(frequency);
  const immediate = annualPremium * allianzMujDomovImmediateCoefficient(position);
  const subsequent = annualPremium * allianzMujDomovSubsequentCoefficient(position);

  const items: CommissionResultItemDTO[] = [
    { title: "💸 Okamžitá provize", amount: immediate },
    { title: "🔁 Následná provize", amount: subsequent },
  ];

  return {
    items,
    total: immediate + subsequent,
  };
}
