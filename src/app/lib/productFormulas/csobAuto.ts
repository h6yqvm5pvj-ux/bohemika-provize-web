import {
  type Position,
  type CommissionResultDTO,
  type CommissionResultItemDTO,
  type PaymentFrequency,
} from "../../types/domain";
import { normalizeIsoDay, pct, periodsPerYear } from "./shared";
import { cppAutoCoefficient } from "./cppAuto";
import { uniqaAutoEarlySubsequentCoefficient } from "./uniqaAuto";

// ---------- ČSOB Auto ----------

export const CSOB_AUTO_HISTORICAL_VALID_FROM = "2024-05-01";
export const CSOB_AUTO_CURRENT_VALID_FROM = "2026-04-01";

export function isCsobAutoHistoricalPeriod(
  contractSignedDateIso: string | null | undefined
): boolean {
  const signedDateIso = normalizeIsoDay(contractSignedDateIso);
  if (!signedDateIso) return false;
  return (
    signedDateIso >= CSOB_AUTO_HISTORICAL_VALID_FROM &&
    signedDateIso < CSOB_AUTO_CURRENT_VALID_FROM
  );
}

function csobAutoHistoricalCoefficient(position: Position): number {
  switch (position) {
    case "poradce1":
      return pct(3.93);
    case "poradce2":
      return pct(4.38);
    case "poradce3":
      return pct(4.76);
    case "poradce4":
      return pct(5.94);
    case "poradce5":
      return pct(6.68);
    case "poradce6":
      return pct(7.14);
    case "poradce7":
      return pct(7.98);
    case "poradce8":
      return pct(8.45);
    case "poradce9":
      return pct(8.81);
    case "poradce10":
      return pct(9.06);
    case "manazer4":
      return pct(7.14);
    case "manazer5":
      return pct(7.98);
    case "manazer6":
      return pct(8.75);
    case "manazer7":
      return pct(9.52);
    case "manazer8":
      return pct(10.36);
    case "manazer9":
      return pct(11.07);
    case "manazer10":
      return pct(11.9);
  }
}

export function csobAutoCoefficient(
  position: Position,
  contractSignedDateIso?: string | null
): number {
  if (isCsobAutoHistoricalPeriod(contractSignedDateIso)) {
    return csobAutoHistoricalCoefficient(position);
  }
  return cppAutoCoefficient(position);
}

export function csobAutoSubsequentCoefficient(
  position: Position,
  contractSignedDateIso?: string | null
): number {
  return isCsobAutoHistoricalPeriod(contractSignedDateIso)
    ? uniqaAutoEarlySubsequentCoefficient(position)
    : csobAutoCoefficient(position, contractSignedDateIso);
}

export function calculateCsobAuto(
  amount: number,
  frequency: PaymentFrequency,
  position: Position,
  contractSignedDateIso?: string | null
): CommissionResultDTO {
  const coef = csobAutoCoefficient(position, contractSignedDateIso);
  const subsequentCoef = csobAutoSubsequentCoefficient(position, contractSignedDateIso);
  const perPayment = amount * coef;
  const subsequent = amount * subsequentCoef;
  const annualTotal = perPayment * periodsPerYear(frequency);

  const items: CommissionResultItemDTO[] = [
    { title: "🚙 Okamžitá provize", amount: perPayment, code: "A101" },
    {
      title: "🔁 Následná provize",
      amount: subsequent,
      code: "B101",
      excludeFromTotal: true,
    },
    { title: "📅 Provize za rok", amount: annualTotal },
  ];
  return { items, total: annualTotal };
}
