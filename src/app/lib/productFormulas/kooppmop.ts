import {
  type Position,
  type CommissionResultDTO,
  type CommissionResultItemDTO,
  type PaymentFrequency,
} from "../../types/domain";
import { commissionInstallmentCodeRange, pct, periodsPerYear } from "./shared";

// ---------- Kooperativa Pojištění majetku a odpovědnosti podnikatelů ----------

export const KOOP_PMOP_COEFFICIENT_VALID_FROM = "2021-08-01";

export function koopPmopCoefficient(position: Position): number {
  switch (position) {
    // Poradci 1-10
    case "poradce1":
      return pct(4.16);
    case "poradce2":
      return pct(4.64);
    case "poradce3":
      return pct(5.04);
    case "poradce4":
      return pct(6.29);
    case "poradce5":
      return pct(7.07);
    case "poradce6":
      return pct(7.56);
    case "poradce7":
      return pct(8.44);
    case "poradce8":
      return pct(8.95);
    case "poradce9":
      return pct(9.33);
    case "poradce10":
      return pct(9.59);
    // Manazeri 4-10
    case "manazer4":
      return pct(7.56);
    case "manazer5":
      return pct(8.44);
    case "manazer6":
      return pct(9.27);
    case "manazer7":
      return pct(10.08);
    case "manazer8":
      return pct(10.96);
    case "manazer9":
      return pct(11.72);
    case "manazer10":
      return pct(12.6);
  }
}

export const koopPmopImmediateCoefficient = koopPmopCoefficient;
export const koopPmopSubsequentCoefficient = koopPmopCoefficient;

export function calculateKoopPmop(
  amount: number,
  frequency: PaymentFrequency,
  position: Position
): CommissionResultDTO {
  const coefficient = koopPmopCoefficient(position);
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
