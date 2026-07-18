import {
  type Position,
  type CommissionResultDTO,
  type CommissionResultItemDTO,
  type PaymentFrequency,
} from "../../types/domain";
import { commissionInstallmentCodeRange } from "./shared";

// ---------- DOMEX ----------

export const DOMEX_HISTORICAL_VALID_FROM = "2023-06-01";
export const DOMEX_CURRENT_VALID_FROM = "2024-09-01";
export const DOMEX_HISTORICAL_SUBSEQUENT_PAYOUT_YEARS = 4;

const DOMEX_CURRENT_IMMEDIATE_COEFFICIENTS: Record<Position, number> = {
  poradce1: 0.1108,
  poradce2: 0.1238,
  poradce3: 0.1344,
  poradce4: 0.1678,
  poradce5: 0.1886,
  poradce6: 0.2016,
  poradce7: 0.2252,
  poradce8: 0.2386,
  poradce9: 0.2488,
  poradce10: 0.2558,
  manazer4: 0.2016,
  manazer5: 0.2252,
  manazer6: 0.2471,
  manazer7: 0.2688,
  manazer8: 0.2924,
  manazer9: 0.3123,
  manazer10: 0.336,
};

const DOMEX_CURRENT_SUBSEQUENT_COEFFICIENTS: Record<Position, number> = {
  poradce1: 0.0278,
  poradce2: 0.0309,
  poradce3: 0.0336,
  poradce4: 0.0419,
  poradce5: 0.0472,
  poradce6: 0.0504,
  poradce7: 0.0563,
  poradce8: 0.0597,
  poradce9: 0.0622,
  poradce10: 0.064,
  manazer4: 0.0504,
  manazer5: 0.0563,
  manazer6: 0.0618,
  manazer7: 0.0672,
  manazer8: 0.0731,
  manazer9: 0.0781,
  manazer10: 0.084,
};

const DOMEX_HISTORICAL_IMMEDIATE_COEFFICIENTS = DOMEX_CURRENT_IMMEDIATE_COEFFICIENTS;
const DOMEX_HISTORICAL_SUBSEQUENT_COEFFICIENTS = DOMEX_CURRENT_SUBSEQUENT_COEFFICIENTS;

function normalizeIsoDay(value?: string | null): string | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

export function isDomexHistoricalPeriod(contractSignedDateIso?: string | null): boolean {
  const isoDay = normalizeIsoDay(contractSignedDateIso);
  return (
    isoDay != null &&
    isoDay >= DOMEX_HISTORICAL_VALID_FROM &&
    isoDay < DOMEX_CURRENT_VALID_FROM
  );
}

export function domexSubsequentPayoutYears(
  contractSignedDateIso?: string | null
): number | null {
  return isDomexHistoricalPeriod(contractSignedDateIso)
    ? DOMEX_HISTORICAL_SUBSEQUENT_PAYOUT_YEARS
    : null;
}

export function domexCoefficient(
  position: Position,
  contractSignedDateIso?: string | null
): number {
  const coefficients = isDomexHistoricalPeriod(contractSignedDateIso)
    ? DOMEX_HISTORICAL_IMMEDIATE_COEFFICIENTS
    : DOMEX_CURRENT_IMMEDIATE_COEFFICIENTS;
  return coefficients[position];
}

export function domexSubsequentCoefficient(
  position: Position,
  contractSignedDateIso?: string | null
): number {
  const coefficients = isDomexHistoricalPeriod(contractSignedDateIso)
    ? DOMEX_HISTORICAL_SUBSEQUENT_COEFFICIENTS
    : DOMEX_CURRENT_SUBSEQUENT_COEFFICIENTS;
  return coefficients[position];
}

export function calculateDomex(
  amount: number,
  frequency: PaymentFrequency,
  position: Position,
  contractSignedDateIso?: string | null
): CommissionResultDTO {
  const coef = domexCoefficient(position, contractSignedDateIso);
  const coefSub = domexSubsequentCoefficient(position, contractSignedDateIso);
  const historical = isDomexHistoricalPeriod(contractSignedDateIso);

  // ČPP vyplácí provizi dle platby, částka v kalkulačce je částka platby
  const multiplier =
    frequency === "monthly"
      ? 12
      : frequency === "quarterly"
      ? 4
      : frequency === "semiannual"
      ? 2
      : 1;

  const okamzitaPlatba = amount * coef;
  const naslednaPlatba = amount * coefSub;

  const okamzitaRok = okamzitaPlatba * multiplier;
  const naslednaRok = naslednaPlatba * multiplier;

  const items: CommissionResultItemDTO[] = [
    {
      title: "💸 Okamžitá provize (z platby)",
      amount: okamzitaPlatba,
      code: commissionInstallmentCodeRange("A", frequency),
    },
    {
      title: "🔁 Následná provize (z platby)",
      amount: naslednaPlatba,
      code: commissionInstallmentCodeRange("B", frequency),
      note: historical ? "Vyplácí se maximálně 4 roky." : undefined,
      excludeFromTotal: true,
    },
    {
      title: "📅 Okamžitá provize za rok",
      amount: okamzitaRok,
      note: `×${multiplier} plateb/rok`,
    },
    {
      title: "📅 Následná provize za rok",
      amount: naslednaRok,
      note: historical
        ? `×${multiplier} plateb/rok, maximálně 4 roky`
        : `×${multiplier} plateb/rok`,
      excludeFromTotal: true,
    },
  ];

  const total = okamzitaRok;
  return { items, total };
}
