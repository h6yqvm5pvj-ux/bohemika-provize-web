import {
  type Position,
  type CommissionResultDTO,
  type CommissionResultItemDTO,
  type PaymentFrequency,
} from "../../types/domain";
import { periodsPerYear } from "./shared";

// ---------- MAXDOMOV ----------

export function maxdomovImmediateCoefficient(position: Position): number {
  switch (position) {
    // Poradci 1–10
    case "poradce1":
      return 11.54;
    case "poradce2":
      return 12.89;
    case "poradce3":
      return 14.0;
    case "poradce4":
      return 17.48;
    case "poradce5":
      return 19.65;
    case "poradce6":
      return 21.0;
    case "poradce7":
      return 23.46;
    case "poradce8":
      return 24.86;
    case "poradce9":
      return 25.91;
    case "poradce10":
      return 26.65;
    // Manažeři
    case "manazer4":
      return 21.0;
    case "manazer5":
      return 23.46;
    case "manazer6":
      return 25.74;
    case "manazer7":
      return 28.0;
    case "manazer8":
      return 30.46;
    case "manazer9":
      return 32.54;
    case "manazer10":
      return 35.0;
  }
}

export function maxdomovSubsequentCoefficient(position: Position): number {
  switch (position) {
    // Poradci 1–10
    case "poradce1":
      return 3.46;
    case "poradce2":
      return 3.87;
    case "poradce3":
      return 4.2;
    case "poradce4":
      return 5.24;
    case "poradce5":
      return 5.89;
    case "poradce6":
      return 6.3;
    case "poradce7":
      return 7.04;
    case "poradce8":
      return 7.46;
    case "poradce9":
      return 7.77;
    case "poradce10":
      return 7.99;
    // Manažeři
    case "manazer4":
      return 6.3;
    case "manazer5":
      return 7.04;
    case "manazer6":
      return 7.72;
    case "manazer7":
      return 8.4;
    case "manazer8":
      return 9.14;
    case "manazer9":
      return 9.76;
    case "manazer10":
      return 10.5;
  }
}

export function calculateMaxdomov(
  amount: number,
  frequency: PaymentFrequency,
  position: Position
): CommissionResultDTO {
  const kZ = maxdomovImmediateCoefficient(position) / 100;
  const kN = maxdomovSubsequentCoefficient(position) / 100;

  const perPaymentImmediate = amount * kZ;
  const perPaymentSubsequent = amount * kN;

  const paymentsPerYear = periodsPerYear(frequency);

  const annualImmediate = perPaymentImmediate * paymentsPerYear;
  const annualSubsequent = perPaymentSubsequent * paymentsPerYear;

  const items: CommissionResultItemDTO[] = [
    {
      title: "💸 Okamžitá provize (z platby)",
      amount: perPaymentImmediate,
    },
    {
      title: "📅 Získatelská za rok",
      amount: annualImmediate,
    },
    {
      title: "🔁 Následná provize (z platby)",
      amount: perPaymentSubsequent,
    },
  ];

  const total = annualImmediate + annualSubsequent;
  return { items, total };
}


