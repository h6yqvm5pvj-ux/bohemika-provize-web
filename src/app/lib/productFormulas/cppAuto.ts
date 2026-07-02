import {
  type Position,
  type CommissionResultDTO,
  type CommissionResultItemDTO,
  type PaymentFrequency,
} from "../../types/domain";
import { normalizeIsoDay, periodsPerYear } from "./shared";

// ---------- ČPP Auto ----------

export const CPP_AUTO_HISTORICAL_VALID_FROM = "2020-08-01";
export const CPP_AUTO_CURRENT_VALID_FROM = "2026-04-01";

export function isCppAutoHistoricalPeriod(
  contractSignedDateIso: string | null | undefined
): boolean {
  const signedDateIso = normalizeIsoDay(contractSignedDateIso);
  if (!signedDateIso) return false;
  return (
    signedDateIso >= CPP_AUTO_HISTORICAL_VALID_FROM &&
    signedDateIso < CPP_AUTO_CURRENT_VALID_FROM
  );
}

export function cppAutoCoefficient(
  position: Position,
  contractSignedDateIso?: string | null
): number {
  void contractSignedDateIso;
  switch (position) {
    // Poradci 1–10
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
    // Manažeři 4–10
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

export function calculateCppAuto(
  amount: number,
  frequency: PaymentFrequency,
  position: Position,
  contractSignedDateIso?: string | null
): CommissionResultDTO {
  const coef = cppAutoCoefficient(position, contractSignedDateIso);
  const perPayment = amount * coef;
  const annualTotal = perPayment * periodsPerYear(frequency);

  const items: CommissionResultItemDTO[] = [
    { title: "🚗 Okamžitá provize", amount: perPayment },
    { title: "📅 Provize za rok", amount: annualTotal },
  ];
  return { items, total: annualTotal };
}

