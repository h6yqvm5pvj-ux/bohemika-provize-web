import {
  type Position,
  type CommissionResultDTO,
  type CommissionResultItemDTO,
  type PaymentFrequency,
} from "../../types/domain";
import { commissionInstallmentCodeRange, pct, periodsPerYear } from "./shared";

// ---------- ČPP BYTEX PLUS ----------

export const CPP_BYTEX_COEFFICIENT_VALID_FROM = "2020-04-01";
export const CPP_BYTEX_SUBSEQUENT_PAYOUT_YEARS = 4;

export function cppBytexImmediateCoefficient(position: Position): number {
  switch (position) {
    case "poradce1":
      return pct(10.53);
    case "poradce2":
      return pct(11.76);
    case "poradce3":
      return pct(12.77);
    case "poradce4":
      return pct(15.94);
    case "poradce5":
      return pct(17.92);
    case "poradce6":
      return pct(19.15);
    case "poradce7":
      return pct(21.39);
    case "poradce8":
      return pct(22.67);
    case "poradce9":
      return pct(23.63);
    case "poradce10":
      return pct(24.3);
    case "manazer4":
      return pct(19.15);
    case "manazer5":
      return pct(21.39);
    case "manazer6":
      return pct(23.48);
    case "manazer7":
      return pct(25.34);
    case "manazer8":
      return pct(27.77);
    case "manazer9":
      return pct(29.68);
    case "manazer10":
      return pct(31.92);
  }
}

export function cppBytexSubsequentCoefficient(position: Position): number {
  switch (position) {
    case "poradce1":
      return pct(2.63);
    case "poradce2":
      return pct(2.94);
    case "poradce3":
      return pct(3.12);
    case "poradce4":
      return pct(3.98);
    case "poradce5":
      return pct(4.48);
    case "poradce6":
      return pct(4.79);
    case "poradce7":
      return pct(5.35);
    case "poradce8":
      return pct(5.67);
    case "poradce9":
      return pct(5.91);
    case "poradce10":
      return pct(6.08);
    case "manazer4":
      return pct(4.79);
    case "manazer5":
      return pct(5.35);
    case "manazer6":
      return pct(5.87);
    case "manazer7":
      return pct(6.38);
    case "manazer8":
      return pct(6.94);
    case "manazer9":
      return pct(7.42);
    case "manazer10":
      return pct(7.98);
  }
}

export function cppBytexSubsequentPayoutYears(): number {
  return CPP_BYTEX_SUBSEQUENT_PAYOUT_YEARS;
}

export function calculateCppBytex(
  amount: number,
  frequency: PaymentFrequency,
  position: Position
): CommissionResultDTO {
  const immediateCoefficient = cppBytexImmediateCoefficient(position);
  const subsequentCoefficient = cppBytexSubsequentCoefficient(position);
  const paymentsPerYear = periodsPerYear(frequency);

  const immediatePerPayment = amount * immediateCoefficient;
  const subsequentPerPayment = amount * subsequentCoefficient;
  const immediateAnnual = immediatePerPayment * paymentsPerYear;
  const subsequentAnnual = subsequentPerPayment * paymentsPerYear;

  const items: CommissionResultItemDTO[] = [
    {
      title: "💸 Okamžitá (získatelská) provize (z platby)",
      amount: immediatePerPayment,
      code: commissionInstallmentCodeRange("A", frequency),
    },
    {
      title: "🔁 Následná provize (z platby)",
      amount: subsequentPerPayment,
      code: commissionInstallmentCodeRange("B", frequency),
      note: "Vyplácí se maximálně 4 roky.",
      excludeFromTotal: true,
    },
    {
      title: "📅 Okamžitá (získatelská) provize za rok",
      amount: immediateAnnual,
      note: `×${paymentsPerYear} plateb/rok`,
    },
    {
      title: "📅 Následná provize za rok",
      amount: subsequentAnnual,
      note: `×${paymentsPerYear} plateb/rok, maximálně 4 roky`,
      excludeFromTotal: true,
    },
  ];

  return { items, total: immediateAnnual };
}
