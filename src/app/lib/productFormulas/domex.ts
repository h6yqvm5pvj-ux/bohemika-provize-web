import {
  type Position,
  type CommissionResultDTO,
  type CommissionResultItemDTO,
  type PaymentFrequency,
} from "../../types/domain";
import { commissionInstallmentCodeRange, normalizeIsoDay, pct, periodsPerYear } from "./shared";

// ---------- DOMEX ----------

export const DOMEX_EARLY_HISTORICAL_VALID_FROM = "2017-06-01";
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

const DOMEX_EARLY_HISTORICAL_IMMEDIATE_COEFFICIENTS: Record<Position, number> = {
  poradce1: pct(16),
  poradce2: pct(16),
  poradce3: pct(16),
  poradce4: pct(20.8),
  poradce5: pct(21.2),
  poradce6: pct(21.6),
  poradce7: pct(22.4),
  poradce8: pct(23.2),
  poradce9: pct(23.6),
  poradce10: pct(23.8),
  manazer4: pct(22),
  manazer5: pct(22.8),
  manazer6: pct(24),
  manazer7: pct(25.4),
  manazer8: pct(25.6),
  manazer9: pct(25.8),
  manazer10: pct(26),
};

const DOMEX_EARLY_HISTORICAL_SUBSEQUENT_COEFFICIENTS: Record<Position, number> = {
  poradce1: pct(3),
  poradce2: pct(3),
  poradce3: pct(3),
  poradce4: pct(5.2),
  poradce5: pct(5.3),
  poradce6: pct(5.4),
  poradce7: pct(5.6),
  poradce8: pct(5.8),
  poradce9: pct(5.9),
  poradce10: pct(5.95),
  manazer4: pct(5.5),
  manazer5: pct(5.6),
  manazer6: pct(6),
  manazer7: pct(6.35),
  manazer8: pct(6.4),
  manazer9: pct(6.45),
  manazer10: pct(6.5),
};

const DOMEX_HISTORICAL_IMMEDIATE_COEFFICIENTS = DOMEX_CURRENT_IMMEDIATE_COEFFICIENTS;
const DOMEX_HISTORICAL_SUBSEQUENT_COEFFICIENTS = DOMEX_CURRENT_SUBSEQUENT_COEFFICIENTS;

export function isDomexEarlyHistoricalPeriod(contractSignedDateIso?: string | null): boolean {
  const isoDay = normalizeIsoDay(contractSignedDateIso);
  return (
    isoDay != null &&
    isoDay >= DOMEX_EARLY_HISTORICAL_VALID_FROM &&
    isoDay < DOMEX_HISTORICAL_VALID_FROM
  );
}

function isDomexLaterHistoricalPeriod(contractSignedDateIso?: string | null): boolean {
  const isoDay = normalizeIsoDay(contractSignedDateIso);
  return (
    isoDay != null &&
    isoDay >= DOMEX_HISTORICAL_VALID_FROM &&
    isoDay < DOMEX_CURRENT_VALID_FROM
  );
}

export function isDomexHistoricalPeriod(contractSignedDateIso?: string | null): boolean {
  const isoDay = normalizeIsoDay(contractSignedDateIso);
  return (
    isoDay != null &&
    isoDay >= DOMEX_EARLY_HISTORICAL_VALID_FROM &&
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
  const coefficients = isDomexEarlyHistoricalPeriod(contractSignedDateIso)
    ? DOMEX_EARLY_HISTORICAL_IMMEDIATE_COEFFICIENTS
    : isDomexLaterHistoricalPeriod(contractSignedDateIso)
      ? DOMEX_HISTORICAL_IMMEDIATE_COEFFICIENTS
      : DOMEX_CURRENT_IMMEDIATE_COEFFICIENTS;
  return coefficients[position];
}

export function domexSubsequentCoefficient(
  position: Position,
  contractSignedDateIso?: string | null
): number {
  const coefficients = isDomexEarlyHistoricalPeriod(contractSignedDateIso)
    ? DOMEX_EARLY_HISTORICAL_SUBSEQUENT_COEFFICIENTS
    : isDomexLaterHistoricalPeriod(contractSignedDateIso)
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
  const multiplier = periodsPerYear(frequency);

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
      ...(historical ? { note: "Vyplácí se maximálně 4 roky." } : {}),
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
