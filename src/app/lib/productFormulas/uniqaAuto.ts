import {
  type Position,
  type CommissionResultDTO,
  type CommissionResultItemDTO,
  type PaymentFrequency,
} from "../../types/domain";
import { normalizeIsoDay, pct, periodsPerYear } from "./shared";
import { cppAutoCoefficient } from "./cppAuto";

// ---------- UNIQA Auto ----------

export const UNIQA_AUTO_HISTORICAL_VALID_FROM = "2024-05-01";
export const UNIQA_AUTO_CURRENT_VALID_FROM = "2026-04-01";

export function isUniqaAutoHistoricalPeriod(
  contractSignedDateIso: string | null | undefined
): boolean {
  const signedDateIso = normalizeIsoDay(contractSignedDateIso);
  if (!signedDateIso) return false;
  return (
    signedDateIso >= UNIQA_AUTO_HISTORICAL_VALID_FROM &&
    signedDateIso < UNIQA_AUTO_CURRENT_VALID_FROM
  );
}

function uniqaAutoHistoricalCoefficient(position: Position): number {
  switch (position) {
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
      return pct(9.6);
    case "manazer4":
      return pct(7.56);
    case "manazer5":
      return pct(8.77);
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

export function uniqaAutoCoefficient(
  position: Position,
  contractSignedDateIso?: string | null
): number {
  if (isUniqaAutoHistoricalPeriod(contractSignedDateIso)) {
    return uniqaAutoHistoricalCoefficient(position);
  }
  return cppAutoCoefficient(position);
}

export function calculateUniqaAuto(
  amount: number,
  frequency: PaymentFrequency,
  position: Position,
  contractSignedDateIso?: string | null
): CommissionResultDTO {
  const coef = uniqaAutoCoefficient(position, contractSignedDateIso);
  const perPayment = amount * coef;
  const annualTotal = perPayment * periodsPerYear(frequency);

  const items: CommissionResultItemDTO[] = [
    { title: "🚙 Okamžitá provize", amount: perPayment },
    { title: "📅 Provize za rok", amount: annualTotal },
  ];
  return { items, total: annualTotal };
}

