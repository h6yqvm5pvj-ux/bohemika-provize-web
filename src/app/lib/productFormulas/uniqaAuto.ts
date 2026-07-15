import {
  type Position,
  type CommissionResultDTO,
  type CommissionResultItemDTO,
  type PaymentFrequency,
} from "../../types/domain";
import { normalizeIsoDay, pct, periodsPerYear } from "./shared";
import { cppAutoCoefficient } from "./cppAuto";

// ---------- UNIQA Auto ----------

export const UNIQA_AUTO_EARLY_HISTORICAL_VALID_FROM = "2023-02-01";
export const UNIQA_AUTO_HISTORICAL_VALID_FROM = "2024-05-01";
export const UNIQA_AUTO_CURRENT_VALID_FROM = "2026-04-01";

export function isUniqaAutoEarlyHistoricalPeriod(
  contractSignedDateIso: string | null | undefined
): boolean {
  const signedDateIso = normalizeIsoDay(contractSignedDateIso);
  if (!signedDateIso) return false;
  return (
    signedDateIso >= UNIQA_AUTO_EARLY_HISTORICAL_VALID_FROM &&
    signedDateIso < UNIQA_AUTO_HISTORICAL_VALID_FROM
  );
}

function isUniqaAutoLaterHistoricalPeriod(
  contractSignedDateIso: string | null | undefined
): boolean {
  const signedDateIso = normalizeIsoDay(contractSignedDateIso);
  if (!signedDateIso) return false;
  return (
    signedDateIso >= UNIQA_AUTO_HISTORICAL_VALID_FROM &&
    signedDateIso < UNIQA_AUTO_CURRENT_VALID_FROM
  );
}

export function isUniqaAutoHistoricalPeriod(
  contractSignedDateIso: string | null | undefined
): boolean {
  const signedDateIso = normalizeIsoDay(contractSignedDateIso);
  if (!signedDateIso) return false;
  return (
    signedDateIso >= UNIQA_AUTO_EARLY_HISTORICAL_VALID_FROM &&
    signedDateIso < UNIQA_AUTO_CURRENT_VALID_FROM
  );
}

function uniqaAutoLaterHistoricalCoefficient(position: Position): number {
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

export function uniqaAutoEarlyAcquisitionCoefficient(position: Position): number {
  switch (position) {
    case "poradce1":
      return pct(3.92);
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
      return pct(11.06);
    case "manazer10":
      return pct(11.9);
  }
}

export function uniqaAutoEarlySubsequentCoefficient(position: Position): number {
  switch (position) {
    case "poradce1":
      return pct(3.46);
    case "poradce2":
      return pct(3.87);
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

export function uniqaAutoImmediateCoefficient(
  position: Position,
  contractSignedDateIso?: string | null
): number {
  if (isUniqaAutoEarlyHistoricalPeriod(contractSignedDateIso)) {
    return uniqaAutoEarlyAcquisitionCoefficient(position);
  }
  if (isUniqaAutoLaterHistoricalPeriod(contractSignedDateIso)) {
    return uniqaAutoLaterHistoricalCoefficient(position);
  }
  return cppAutoCoefficient(position);
}

export function uniqaAutoSubsequentCoefficient(
  position: Position,
  contractSignedDateIso?: string | null
): number {
  if (isUniqaAutoEarlyHistoricalPeriod(contractSignedDateIso)) {
    return uniqaAutoEarlySubsequentCoefficient(position);
  }
  if (isUniqaAutoLaterHistoricalPeriod(contractSignedDateIso)) {
    return uniqaAutoLaterHistoricalCoefficient(position);
  }
  return uniqaAutoImmediateCoefficient(position, contractSignedDateIso);
}

export function uniqaAutoCoefficient(
  position: Position,
  contractSignedDateIso?: string | null
): number {
  return uniqaAutoImmediateCoefficient(position, contractSignedDateIso);
}

export function calculateUniqaAuto(
  amount: number,
  frequency: PaymentFrequency,
  position: Position,
  contractSignedDateIso?: string | null
): CommissionResultDTO {
  if (isUniqaAutoEarlyHistoricalPeriod(contractSignedDateIso)) {
    const immediate = amount * uniqaAutoImmediateCoefficient(position, contractSignedDateIso);
    const subsequent = amount * uniqaAutoSubsequentCoefficient(position, contractSignedDateIso);
    const annualTotal = immediate * periodsPerYear(frequency);

    const items: CommissionResultItemDTO[] = [
      { title: "🚙 Okamžitá provize", amount: immediate, code: "A101" },
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

  const coef = uniqaAutoImmediateCoefficient(position, contractSignedDateIso);
  const subsequentCoef = uniqaAutoSubsequentCoefficient(position, contractSignedDateIso);
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
