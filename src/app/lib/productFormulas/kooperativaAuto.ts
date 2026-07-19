import {
  type Position,
  type CommissionResultDTO,
  type CommissionResultItemDTO,
  type PaymentFrequency,
} from "../../types/domain";
import { normalizeIsoDay, periodsPerYear } from "./shared";
import { cppAutoCoefficient } from "./cppAuto";
import { historicalAutoCoefficient } from "./historicalAutoCoefficient";

// ---------- Kooperativa Auto ----------

export const KOOPERATIVA_AUTO_HISTORICAL_VALID_FROM = "2021-07-01";
export const KOOPERATIVA_AUTO_CURRENT_VALID_FROM = "2026-04-01";
export const KOOP_FLOTILA_COEFFICIENT_VALID_FROM = "2026-04-01";

export function isKooperativaAutoHistoricalPeriod(
  contractSignedDateIso: string | null | undefined
): boolean {
  const signedDateIso = normalizeIsoDay(contractSignedDateIso);
  if (!signedDateIso) return false;
  return (
    signedDateIso >= KOOPERATIVA_AUTO_HISTORICAL_VALID_FROM &&
    signedDateIso < KOOPERATIVA_AUTO_CURRENT_VALID_FROM
  );
}

export function kooperativaAutoCoefficient(
  position: Position,
  contractSignedDateIso?: string | null
): number {
  if (isKooperativaAutoHistoricalPeriod(contractSignedDateIso)) {
    return historicalAutoCoefficient(position);
  }
  return cppAutoCoefficient(position, contractSignedDateIso);
}

export function kooperativaAutoSubsequentCoefficient(
  position: Position,
  contractSignedDateIso?: string | null
): number {
  return kooperativaAutoCoefficient(position, contractSignedDateIso);
}

export function calculateKooperativaAuto(
  amount: number,
  frequency: PaymentFrequency,
  position: Position,
  contractSignedDateIso?: string | null
): CommissionResultDTO {
  const coef = kooperativaAutoCoefficient(position, contractSignedDateIso);
  const subsequentCoef = kooperativaAutoSubsequentCoefficient(
    position,
    contractSignedDateIso
  );
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
    { title: "Celkem za rok", amount: annualTotal },
  ];

  return { items, total: annualTotal };
}

export function koopFlotilaCoefficient(position: Position): number {
  switch (position) {
    case "poradce1":
    case "poradce2":
    case "poradce3":
      return 0.08;
    case "poradce4":
      return 0.104;
    case "poradce5":
      return 0.106;
    case "poradce6":
      return 0.108;
    case "poradce7":
      return 0.112;
    case "poradce8":
      return 0.116;
    case "poradce9":
      return 0.118;
    case "poradce10":
      return 0.119;
    case "manazer4":
      return 0.11;
    case "manazer5":
      return 0.112;
    case "manazer6":
      return 0.12;
    case "manazer7":
      return 0.127;
    case "manazer8":
      return 0.128;
    case "manazer9":
      return 0.129;
    case "manazer10":
      return 0.13;
  }
}

export function koopFlotilaSubsequentCoefficient(position: Position): number {
  return koopFlotilaCoefficient(position);
}

export function calculateKoopFlotila(
  amount: number,
  frequency: PaymentFrequency,
  position: Position
): CommissionResultDTO {
  const coef = koopFlotilaCoefficient(position);
  const subsequentCoef = koopFlotilaSubsequentCoefficient(position);
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
    { title: "Celkem za rok", amount: annualTotal },
  ];

  return { items, total: annualTotal };
}
