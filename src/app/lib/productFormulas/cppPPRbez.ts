import {
  type Position,
  type CommissionResultDTO,
  type CommissionResultItemDTO,
  type PaymentFrequency,
} from "../../types/domain";
import { commissionInstallmentCodeRange, pct, periodsPerYear } from "./shared";

// ---------- ČPP Pojištění majetku a odpovědnosti podnikatelů (bez ÚPIS) ----------

export const CPP_PPR_BEZ_COEFFICIENT_VALID_FROM = "2023-06-01";

export function cppPPRbezImmediateCoefficient(position: Position): number {
  switch (position) {
    // Poradci 1–10
    case "poradce1":
      return pct(10.39);
    case "poradce2":
      return pct(11.6);
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
      return pct(22.71);
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

export function cppPPRbezSubsequentCoefficient(position: Position): number {
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

export function calculateCppPPRbez(
  amount: number,
  frequency: PaymentFrequency,
  position: Position
): CommissionResultDTO {
  const coefImmediate = cppPPRbezImmediateCoefficient(position);
  const coefSub = cppPPRbezSubsequentCoefficient(position);

  const perPaymentImmediate = amount * coefImmediate;
  const perPaymentSub = amount * coefSub;
  const paymentsPerYear = periodsPerYear(frequency);

  const annualImmediate = perPaymentImmediate * paymentsPerYear;
  const annualSub = perPaymentSub * paymentsPerYear;

  const items: CommissionResultItemDTO[] = [
    {
      title: "💸 Okamžitá (získatelská) provize (z platby)",
      amount: perPaymentImmediate,
      code: commissionInstallmentCodeRange("A", frequency),
    },
    {
      title: "🔁 Následná provize (z platby)",
      amount: perPaymentSub,
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
      amount: annualSub,
      note: `×${paymentsPerYear} plateb/rok`,
      excludeFromTotal: true,
    },
  ];

  const total = annualImmediate;
  return { items, total };
}
