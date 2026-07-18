import {
  type Position,
  type CommissionResultDTO,
  type CommissionResultItemDTO,
  type PaymentFrequency,
} from "../../types/domain";
import { normalizeIsoDay, periodsPerYear } from "./shared";
import { cppAutoCoefficient } from "./cppAuto";
import { historicalAutoCoefficient } from "./historicalAutoCoefficient";

// ---------- Allianz Auto ----------

export const ALLIANZ_AUTO_HISTORICAL_VALID_FROM = "2019-08-01";
export const ALLIANZ_AUTO_CURRENT_VALID_FROM = "2026-04-01";

export function isAllianzAutoHistoricalPeriod(
  contractSignedDateIso: string | null | undefined
): boolean {
  const signedDateIso = normalizeIsoDay(contractSignedDateIso);
  if (!signedDateIso) return false;
  return (
    signedDateIso >= ALLIANZ_AUTO_HISTORICAL_VALID_FROM &&
    signedDateIso < ALLIANZ_AUTO_CURRENT_VALID_FROM
  );
}

export function allianzAutoCoefficient(
  position: Position,
  contractSignedDateIso?: string | null
): number {
  if (isAllianzAutoHistoricalPeriod(contractSignedDateIso)) {
    return historicalAutoCoefficient(position);
  }
  return cppAutoCoefficient(position);
}

export function allianzAutoSubsequentCoefficient(
  position: Position,
  contractSignedDateIso?: string | null
): number {
  // Allianz historical terms list acquisition and subsequent commission as
  // identical percentages.
  return allianzAutoCoefficient(position, contractSignedDateIso);
}

export function calculateAllianzAuto(
  amount: number,
  frequency: PaymentFrequency,
  position: Position,
  contractSignedDateIso?: string | null
): CommissionResultDTO {
  const annualPremium = amount * periodsPerYear(frequency);
  const coef = allianzAutoCoefficient(position, contractSignedDateIso);
  const subsequentCoef = allianzAutoSubsequentCoefficient(position, contractSignedDateIso);
  const immediate = annualPremium * coef;
  const subsequent = annualPremium * subsequentCoef;

  const items: CommissionResultItemDTO[] = [
    { title: "📅 Okamžitá provize", amount: immediate, code: "A101" },
    {
      title: "🔁 Následná provize",
      amount: subsequent,
      code: "B101",
      excludeFromTotal: true,
    },
  ];
  return { items, total: immediate };
}
