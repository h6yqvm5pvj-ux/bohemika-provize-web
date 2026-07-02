import {
  type Position,
  type CommissionResultDTO,
  type CommissionResultItemDTO,
  type PaymentFrequency,
} from "../../types/domain";
import { normalizeIsoDay, periodsPerYear } from "./shared";
import { cppAutoCoefficient } from "./cppAuto";
import { historicalAutoCoefficient } from "./historicalAutoCoefficient";

// ---------- Pillow Auto ----------

export const PILLOW_AUTO_HISTORICAL_VALID_FROM = "2023-10-01";
export const PILLOW_AUTO_CURRENT_VALID_FROM = "2026-04-01";

export function isPillowAutoHistoricalPeriod(
  contractSignedDateIso: string | null | undefined
): boolean {
  const signedDateIso = normalizeIsoDay(contractSignedDateIso);
  if (!signedDateIso) return false;
  return (
    signedDateIso >= PILLOW_AUTO_HISTORICAL_VALID_FROM &&
    signedDateIso < PILLOW_AUTO_CURRENT_VALID_FROM
  );
}

export function pillowAutoCoefficient(
  position: Position,
  contractSignedDateIso?: string | null
): number {
  if (isPillowAutoHistoricalPeriod(contractSignedDateIso)) {
    return historicalAutoCoefficient(position);
  }
  return cppAutoCoefficient(position);
}

export function calculatePillowAuto(
  amount: number,
  frequency: PaymentFrequency,
  position: Position,
  contractSignedDateIso?: string | null
): CommissionResultDTO {
  const coef = pillowAutoCoefficient(position, contractSignedDateIso);
  const perPayment = amount * coef;
  const annualTotal = perPayment * periodsPerYear(frequency);

  const items: CommissionResultItemDTO[] = [
    { title: "📅 Okamžitá provize", amount: annualTotal },
  ];
  return { items, total: annualTotal };
}

