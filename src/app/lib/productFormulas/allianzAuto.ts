import {
  type Position,
  type CommissionResultDTO,
  type CommissionResultItemDTO,
  type PaymentFrequency,
} from "../../types/domain";
import { pct, periodsPerYear } from "./shared";
import { cppAutoCoefficient } from "./cppAuto";

// ---------- Allianz Auto ----------

export const ALLIANZ_AUTO_HISTORICAL_VALID_FROM = "2019-08-01";
export const ALLIANZ_AUTO_CURRENT_VALID_FROM = "2026-04-01";

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeIsoDay(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!ISO_DAY_RE.test(normalized)) return null;
  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (date.toISOString().slice(0, 10) !== normalized) return null;
  return normalized;
}

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

function allianzAutoHistoricalCoefficient(position: Position): number {
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

export function allianzAutoCoefficient(
  position: Position,
  contractSignedDateIso?: string | null
): number {
  if (isAllianzAutoHistoricalPeriod(contractSignedDateIso)) {
    return allianzAutoHistoricalCoefficient(position);
  }
  return cppAutoCoefficient(position);
}

export function calculateAllianzAuto(
  amount: number,
  frequency: PaymentFrequency,
  position: Position,
  contractSignedDateIso?: string | null
): CommissionResultDTO {
  const annual = amount * periodsPerYear(frequency);
  const coef = allianzAutoCoefficient(position, contractSignedDateIso);
  const immediate = annual * coef;

  const items: CommissionResultItemDTO[] = [
    { title: "📅 Okamžitá provize", amount: immediate },
  ];
  return { items, total: immediate };
}

