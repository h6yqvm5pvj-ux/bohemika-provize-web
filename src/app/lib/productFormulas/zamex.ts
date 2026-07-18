import {
  type Position,
  type CommissionResultDTO,
  type CommissionResultItemDTO,
  type PaymentFrequency,
} from "../../types/domain";
import { commissionInstallmentCodeRange, periodsPerYear } from "./shared";

// ---------- ČPP ZAMEX ----------

export const ZAMEX_COEFFICIENT_VALID_FROM = "2023-04-15";

export function zamexCoefficient(position: Position): number {
  switch (position) {
    // Poradci 1–10
    case "poradce1":
      return 0.0346;
    case "poradce2":
      return 0.0387;
    case "poradce3":
      return 0.042;
    case "poradce4":
      return 0.0524;
    case "poradce5":
      return 0.0589;
    case "poradce6":
      return 0.063;
    case "poradce7":
      return 0.0704;
    case "poradce8":
      return 0.0746;
    case "poradce9":
      return 0.0777;
    case "poradce10":
      return 0.0799;
    // Manažeři 4–10
    case "manazer4":
      return 0.063;
    case "manazer5":
      return 0.0704;
    case "manazer6":
      return 0.0772;
    case "manazer7":
      return 0.084;
    case "manazer8":
      return 0.0914;
    case "manazer9":
      return 0.0976;
    case "manazer10":
      return 0.105;
  }
}

export function calculateZamex(
  amount: number,
  frequency: PaymentFrequency,
  position: Position
): CommissionResultDTO {
  const coef = zamexCoefficient(position);
  const perPaymentImmediate = amount * coef;
  const perPaymentSubsequent = amount * coef;
  const paymentsPerYear = periodsPerYear(frequency);
  const annualImmediate = perPaymentImmediate * paymentsPerYear;
  const annualSubsequent = perPaymentSubsequent * paymentsPerYear;

  const items: CommissionResultItemDTO[] = [
    {
      title: "🧑‍🔧 Okamžitá (získatelská) provize (z platby)",
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
      title: "📅 Okamžitá (získatelská) provize za rok",
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
