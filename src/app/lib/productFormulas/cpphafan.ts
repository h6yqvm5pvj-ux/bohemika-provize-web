import {
  type Position,
  type CommissionResultDTO,
  type CommissionResultItemDTO,
  type PaymentFrequency,
} from "../../types/domain";
import { pct, periodsPerYear } from "./shared";

// ---------- ČPP HAFAN ----------

export function cppHafanImmediateCoefficient(position: Position): number {
  switch (position) {
    // Poradci 1–10
    case "poradce1":
      return pct(8.0);
    case "poradce2":
      return pct(8.0);
    case "poradce3":
      return pct(8.0);
    case "poradce4":
      return pct(10.4);
    case "poradce5":
      return pct(10.6);
    case "poradce6":
      return pct(10.8);
    case "poradce7":
      return pct(11.2);
    case "poradce8":
      return pct(11.6);
    case "poradce9":
      return pct(11.8);
    case "poradce10":
      return pct(11.9);
    // Manažeři 4–10
    case "manazer4":
      return pct(11.0);
    case "manazer5":
      return pct(11.2);
    case "manazer6":
      return pct(12.0);
    case "manazer7":
      return pct(12.7);
    case "manazer8":
      return pct(12.8);
    case "manazer9":
      return pct(12.9);
    case "manazer10":
      return pct(13.0);
  }
}

export function cppHafanSubsequentCoefficient(position: Position): number {
  switch (position) {
    // Poradci 1–10
    case "poradce1":
      return pct(4.0);
    case "poradce2":
      return pct(4.0);
    case "poradce3":
      return pct(4.0);
    case "poradce4":
      return pct(5.2);
    case "poradce5":
      return pct(5.3);
    case "poradce6":
      return pct(5.4);
    case "poradce7":
      return pct(5.6);
    case "poradce8":
      return pct(5.8);
    case "poradce9":
      return pct(5.9);
    case "poradce10":
      return pct(5.95);
    // Manažeři 4–10
    case "manazer4":
      return pct(5.5);
    case "manazer5":
      return pct(5.6);
    case "manazer6":
      return pct(6.0);
    case "manazer7":
      return pct(6.35);
    case "manazer8":
      return pct(6.4);
    case "manazer9":
      return pct(6.45);
    case "manazer10":
      return pct(6.5);
  }
}

export function calculateCppHafan(
  amount: number,
  frequency: PaymentFrequency,
  position: Position
): CommissionResultDTO {
  const coefImmediate = cppHafanImmediateCoefficient(position);
  const coefSub = cppHafanSubsequentCoefficient(position);

  const perPaymentImmediate = amount * coefImmediate;
  const perPaymentSub = amount * coefSub;
  const paymentsPerYear = periodsPerYear(frequency);

  const annualImmediate = perPaymentImmediate * paymentsPerYear;
  const annualSub = perPaymentSub * paymentsPerYear;

  const items: CommissionResultItemDTO[] = [
    { title: "💸 Okamžitá provize (z platby)", amount: perPaymentImmediate },
    { title: "🔁 Následná provize (z platby)", amount: perPaymentSub },
    {
      title: "📅 Okamžitá provize za rok",
      amount: annualImmediate,
      note: `×${paymentsPerYear} plateb/rok`,
    },
    {
      title: "📅 Následná provize za rok",
      amount: annualSub,
      note: `×${paymentsPerYear} plateb/rok`,
    },
  ];

  const total = annualImmediate + annualSub;
  return { items, total };
}
