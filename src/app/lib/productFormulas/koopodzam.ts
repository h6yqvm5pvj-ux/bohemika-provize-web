import {
  type Position,
  type CommissionResultDTO,
  type CommissionResultItemDTO,
  type PaymentFrequency,
} from "../../types/domain";
import { commissionInstallmentCodeRange, pct, periodsPerYear } from "./shared";

// ---------- Kooperativa Pojištění odpovědnosti zaměstnance ----------

export function koopOdzamCoefficient(position: Position): number {
  switch (position) {
    // Poradci 1-10
    case "poradce1":
      return pct(3.24);
    case "poradce2":
      return pct(3.53);
    case "poradce3":
      return pct(3.82);
    case "poradce4":
      return pct(4.1);
    case "poradce5":
      return pct(4.39);
    case "poradce6":
      return pct(4.68);
    case "poradce7":
      return pct(5.83);
    case "poradce8":
      return pct(6.12);
    case "poradce9":
      return pct(6.41);
    case "poradce10":
      return pct(6.7);
    // Manazeri 4-10
    case "manazer4":
      return pct(5.83);
    case "manazer5":
      return pct(6.12);
    case "manazer6":
      return pct(6.41);
    case "manazer7":
      return pct(6.7);
    case "manazer8":
      return pct(6.98);
    case "manazer9":
      return pct(7.27);
    case "manazer10":
      return pct(7.56);
  }
}

export const koopOdzamImmediateCoefficient = koopOdzamCoefficient;
export const koopOdzamSubsequentCoefficient = koopOdzamCoefficient;

export function calculateKoopOdzam(
  amount: number,
  frequency: PaymentFrequency,
  position: Position
): CommissionResultDTO {
  const coefficient = koopOdzamCoefficient(position);
  const perPaymentImmediate = amount * coefficient;
  const perPaymentSubsequent = amount * coefficient;
  const paymentsPerYear = periodsPerYear(frequency);

  const annualImmediate = perPaymentImmediate * paymentsPerYear;
  const annualSubsequent = perPaymentSubsequent * paymentsPerYear;

  const items: CommissionResultItemDTO[] = [
    {
      title: "💸 Okamžitá provize (z platby)",
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
