import {
  type Position,
  type CommissionMode,
  type NeonCoefficientSet,
  type CommissionResultDTO,
  type CommissionResultItemDTO,
} from "../../types/domain";

// ---------- NEON ----------

type NeonK = {
  okamzita: number;
  po3: number;
  po4: number;
  n2to5: number;
  n5to10: number;
};

type NeonImmediateBreakdownPart = {
  label: string;
  amount: number;
};

export type NeonImmediateBreakdown = {
  position: Position;
  isHistorical: boolean;
  totalCoefficient: number;
  a101Coefficient: number;
  b0301Coefficient: number;
  b3601HalfCoefficient: number;
  includeB3601: boolean;
  parts: NeonImmediateBreakdownPart[];
  total: number;
};

export const NEON_HISTORICAL_VALID_FROM = "2019-10-01";
export const NEON_CURRENT_VALID_FROM = "2024-07-01";
export const NEON_HISTORICAL_MAX_YEARS = 20;
export const NEON_CURRENT_MAX_YEARS = 15;
export const NEON_REFRESH_STORNO_MONTHS = 60;

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

function parseIsoDayUtc(value: string | null | undefined): Date | null {
  const normalized = normalizeIsoDay(value);
  if (!normalized) return null;
  const date = new Date(`${normalized}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

const normalizeNeonCoefficientSet = (
  value: NeonCoefficientSet | null | undefined
): NeonCoefficientSet | null =>
  value === "historical" || value === "current" ? value : null;

const usesHistoricalNeonCoefficientSet = (
  contractSignedDateIso: string | null | undefined,
  coefficientSetOverride?: NeonCoefficientSet | null
): boolean => {
  const override = normalizeNeonCoefficientSet(coefficientSetOverride);
  if (override) return override === "historical";
  return isNeonHistoricalPeriod(contractSignedDateIso);
};

function completedCalendarMonthsBetween(
  fromIso: string | null | undefined,
  toIso: string | null | undefined
): number | null {
  const from = parseIsoDayUtc(fromIso);
  const to = parseIsoDayUtc(toIso);
  if (!from || !to) return null;
  if (to.getTime() <= from.getTime()) return 0;

  let months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (to.getUTCMonth() - from.getUTCMonth());
  if (to.getUTCDate() < from.getUTCDate()) {
    months -= 1;
  }
  return Math.max(0, months);
}

export type NeonRefreshCommissionBase = {
  newMonthlyPremium: number;
  originalMonthlyPremium: number;
  calculationMonthlyPremium: number;
  calculationAnnualPremium: number;
  elapsedMonths: number;
  remainingMonths: number;
  earnedRatio: number;
  remainingRatio: number;
  premiumIncreaseMonthly: number;
  premiumIncreaseAnnual: number;
  stornoBaseMonthlyPremium: number;
  stornoBaseAnnualPremium: number;
  stornedOriginalMonthlyPremium: number;
  stornedOriginalAnnualPremium: number;
};

export function calculateNeonRefreshCommissionBase({
  newMonthlyPremium,
  originalMonthlyPremium,
  stornoBaseMonthlyPremium,
  originalStornoStartDateIso,
  refreshPolicyStartDateIso,
  stornoMonths = NEON_REFRESH_STORNO_MONTHS,
}: {
  newMonthlyPremium: number | null | undefined;
  originalMonthlyPremium: number | null | undefined;
  stornoBaseMonthlyPremium?: number | null | undefined;
  originalStornoStartDateIso: string | null | undefined;
  refreshPolicyStartDateIso: string | null | undefined;
  stornoMonths?: number;
}): NeonRefreshCommissionBase | null {
  const safeNew = Number(newMonthlyPremium);
  const safeOriginal = Number(originalMonthlyPremium);
  const safeStornoBase =
    stornoBaseMonthlyPremium == null
      ? safeOriginal
      : Number(stornoBaseMonthlyPremium);
  const safeStornoMonths = Math.max(1, Math.floor(Number(stornoMonths)));
  if (
    !Number.isFinite(safeNew) ||
    safeNew <= 0 ||
    !Number.isFinite(safeOriginal) ||
    safeOriginal <= 0 ||
    !Number.isFinite(safeStornoBase) ||
    safeStornoBase <= 0 ||
    !Number.isFinite(safeStornoMonths)
  ) {
    return null;
  }

  const elapsed = completedCalendarMonthsBetween(
    originalStornoStartDateIso,
    refreshPolicyStartDateIso
  );
  if (elapsed == null) return null;

  const elapsedMonths = Math.min(safeStornoMonths, Math.max(0, elapsed));
  const remainingMonths = Math.max(0, safeStornoMonths - elapsedMonths);
  const earnedRatio = elapsedMonths / safeStornoMonths;
  const remainingRatio = remainingMonths / safeStornoMonths;
  const premiumIncreaseMonthly = safeNew - safeOriginal;
  const stornedOriginalMonthlyPremium = safeStornoBase * remainingRatio;
  const calculationMonthlyPremium = Math.max(
    0,
    premiumIncreaseMonthly + stornedOriginalMonthlyPremium
  );
  const calculationAnnualPremium = roundToCents(calculationMonthlyPremium * 12);

  return {
    newMonthlyPremium: roundToCents(safeNew),
    originalMonthlyPremium: roundToCents(safeOriginal),
    calculationMonthlyPremium: calculationAnnualPremium / 12,
    calculationAnnualPremium,
    elapsedMonths,
    remainingMonths,
    earnedRatio,
    remainingRatio,
    premiumIncreaseMonthly: roundToCents(premiumIncreaseMonthly),
    premiumIncreaseAnnual: roundToCents(premiumIncreaseMonthly * 12),
    stornoBaseMonthlyPremium: roundToCents(safeStornoBase),
    stornoBaseAnnualPremium: roundToCents(safeStornoBase * 12),
    stornedOriginalMonthlyPremium: roundToCents(stornedOriginalMonthlyPremium),
    stornedOriginalAnnualPremium: roundToCents(stornedOriginalMonthlyPremium * 12),
  };
}

export const NEON_IMMEDIATE_A101_COEFFICIENTS: Record<Position, number> = {
  poradce1: 1.2,
  poradce2: 1.38,
  poradce3: 1.502,
  poradce4: 2.16,
  poradce5: 2.4,
  poradce6: 2.58,
  poradce7: 2.702,
  poradce8: 2.881,
  poradce9: 3.002,
  poradce10: 3.122,
  manazer4: 2.404,
  manazer5: 2.683,
  manazer6: 2.962,
  manazer7: 3.243,
  manazer8: 3.522,
  manazer9: 3.802,
  manazer10: 4.083,
};

export const NEON_IMMEDIATE_B0301_COEFFICIENTS: Record<Position, number> = {
  poradce1: 0.444,
  poradce2: 0.489,
  poradce3: 0.533,
  poradce4: 0.622,
  poradce5: 0.645,
  poradce6: 0.665,
  poradce7: 0.687,
  poradce8: 0.71,
  poradce9: 0.73,
  poradce10: 0.752,
  manazer4: 0.633,
  manazer5: 0.69,
  manazer6: 0.747,
  manazer7: 0.807,
  manazer8: 0.863,
  manazer9: 0.92,
  manazer10: 0.987,
};

export const NEON_IMMEDIATE_B3601_HALF_COEFFICIENTS: Record<Position, number> = {
  poradce1: 0.4445,
  poradce2: 0.489,
  poradce3: 0.5335,
  poradce4: 0.689,
  poradce5: 0.761,
  poradce6: 0.8,
  poradce7: 0.8385,
  poradce8: 0.877,
  poradce9: 0.9165,
  poradce10: 0.955,
  manazer4: 0.7575,
  manazer5: 0.8395,
  manazer6: 0.9205,
  manazer7: 1.0015,
  manazer8: 1.083,
  manazer9: 1.1635,
  manazer10: 1.2445,
};

export const NEON_HISTORICAL_IMMEDIATE_A101_COEFFICIENTS: Record<Position, number> = {
  poradce1: 0.891,
  poradce2: 1.025,
  poradce3: 1.115,
  poradce4: 1.604,
  poradce5: 1.782,
  poradce6: 1.916,
  poradce7: 2.006,
  poradce8: 2.139,
  poradce9: 2.229,
  poradce10: 2.318,
  manazer4: 1.782,
  manazer5: 1.992,
  manazer6: 2.199,
  manazer7: 2.408,
  manazer8: 2.615,
  manazer9: 2.823,
  manazer10: 3.032,
};

export const NEON_HISTORICAL_IMMEDIATE_B0301_COEFFICIENTS: Record<Position, number> = {
  poradce1: 0.33,
  poradce2: 0.363,
  poradce3: 0.396,
  poradce4: 0.462,
  poradce5: 0.479,
  poradce6: 0.494,
  poradce7: 0.51,
  poradce8: 0.527,
  poradce9: 0.542,
  poradce10: 0.558,
  manazer4: 0.47,
  manazer5: 0.512,
  manazer6: 0.555,
  manazer7: 0.599,
  manazer8: 0.641,
  manazer9: 0.683,
  manazer10: 0.726,
};

const roundToCents = (value: number): number => Math.round(value * 100) / 100;
const toCents = (value: number): number => Math.round(value * 100);
const fromCents = (value: number): number => value / 100;

const isAcceleratedMode = (mode: CommissionMode | null | undefined): boolean =>
  mode === "accelerated";

export const hasNeonImmediateCoefficient = (
  position: Position | null | undefined
): position is Position =>
  !!position &&
  Number.isFinite(NEON_IMMEDIATE_A101_COEFFICIENTS[position]) &&
  Number.isFinite(NEON_IMMEDIATE_B0301_COEFFICIENTS[position]) &&
  Number.isFinite(NEON_IMMEDIATE_B3601_HALF_COEFFICIENTS[position]);

export type NeonImmediateCoefficientParts = {
  isHistorical: boolean;
  includeB3601: boolean;
  totalCoefficient: number;
  a101Coefficient: number;
  b0301Coefficient: number;
  b3601HalfCoefficient: number;
};

export const neonImmediateCoefficientParts = (
  position: Position | null | undefined,
  mode: CommissionMode | null | undefined,
  contractSignedDateIso?: string | null,
  coefficientSetOverride?: NeonCoefficientSet | null
): NeonImmediateCoefficientParts | null => {
  if (!position) return null;
  const historical = usesHistoricalNeonCoefficientSet(
    contractSignedDateIso,
    coefficientSetOverride
  );
  const a101Coefficient = historical
    ? NEON_HISTORICAL_IMMEDIATE_A101_COEFFICIENTS[position]
    : NEON_IMMEDIATE_A101_COEFFICIENTS[position];
  const b0301Coefficient = historical
    ? NEON_HISTORICAL_IMMEDIATE_B0301_COEFFICIENTS[position]
    : NEON_IMMEDIATE_B0301_COEFFICIENTS[position];
  const includeB3601 = !historical && isAcceleratedMode(mode);
  const b3601HalfCoefficient = includeB3601
    ? NEON_IMMEDIATE_B3601_HALF_COEFFICIENTS[position]
    : 0;
  const totalCoefficient =
    a101Coefficient + b0301Coefficient + b3601HalfCoefficient;

  if (!Number.isFinite(totalCoefficient) || totalCoefficient <= 0) return null;
  if (!Number.isFinite(a101Coefficient) || a101Coefficient < 0) return null;
  if (!Number.isFinite(b0301Coefficient) || b0301Coefficient < 0) return null;
  if (!Number.isFinite(b3601HalfCoefficient) || b3601HalfCoefficient < 0) return null;

  return {
    isHistorical: historical,
    includeB3601,
    totalCoefficient,
    a101Coefficient,
    b0301Coefficient,
    b3601HalfCoefficient,
  };
};

export const buildNeonImmediateBreakdown = (
  amount: number,
  position: Position | null | undefined,
  mode: CommissionMode | null | undefined,
  contractSignedDateIso?: string | null,
  coefficientSetOverride?: NeonCoefficientSet | null
): NeonImmediateBreakdown | null => {
  const coefficients = neonImmediateCoefficientParts(
    position,
    mode,
    contractSignedDateIso,
    coefficientSetOverride
  );
  if (!coefficients || !position) return null;
  const {
    isHistorical,
    includeB3601,
    totalCoefficient,
    a101Coefficient,
    b0301Coefficient,
    b3601HalfCoefficient,
  } = coefficients;

  const total = Number(amount);
  if (!Number.isFinite(total) || total <= 0) return null;

  const baseAmount = total / totalCoefficient;
  const partDefs: { label: string; raw: number }[] = [
    { label: "Provize A101", raw: baseAmount * a101Coefficient },
    { label: "Provize B0301", raw: baseAmount * b0301Coefficient },
    ...(includeB3601
      ? [
          {
            label: "Provize 50% z B3601",
            raw: baseAmount * b3601HalfCoefficient,
          },
        ]
      : []),
  ];
  if (partDefs.length === 0) return null;

  const partCents = partDefs.map((part) => ({
    label: part.label,
    cents: Math.max(0, toCents(part.raw)),
  }));
  const totalCents = toCents(total);
  const lastIdx = partCents.length - 1;
  const roundedSumCents = partCents.reduce((sum, part) => sum + part.cents, 0);
  partCents[lastIdx].cents += totalCents - roundedSumCents;

  if (partCents[lastIdx].cents < 0) {
    let deficit = -partCents[lastIdx].cents;
    partCents[lastIdx].cents = 0;
    for (let idx = lastIdx - 1; idx >= 0 && deficit > 0; idx -= 1) {
      const reduceBy = Math.min(partCents[idx].cents, deficit);
      partCents[idx].cents -= reduceBy;
      deficit -= reduceBy;
    }
    if (deficit > 0) return null;
  }

  return {
    position,
    isHistorical,
    totalCoefficient,
    a101Coefficient: Math.max(0, a101Coefficient),
    b0301Coefficient,
    b3601HalfCoefficient,
    includeB3601,
    total,
    parts: partCents.map((part) => ({
      label: part.label,
      amount: roundToCents(fromCents(part.cents)),
    })),
  };
};

const neonImmediateItems = (
  amount: number,
  position: Position,
  mode: CommissionMode,
  contractSignedDateIso?: string | null,
  coefficientSetOverride?: NeonCoefficientSet | null
): CommissionResultItemDTO[] => {
  const breakdown = buildNeonImmediateBreakdown(
    amount,
    position,
    mode,
    contractSignedDateIso,
    coefficientSetOverride
  );
  if (!breakdown) return [{ title: "💸 Okamžitá provize", amount, code: "A101" }];

  return breakdown.parts.map((part) => ({
    title: `💸 ${part.label}`,
    amount: part.amount,
    code:
      part.label === "Provize A101"
        ? "A101"
        : part.label === "Provize B0301"
          ? "B0301"
          : part.label.includes("B3601")
            ? "B3601_HALF"
            : null,
    ...(part.label === "Provize B0301"
      ? {
          note: "Pro okamžité vyplacení podmíněno zpracováním karty klienta dle podmínek!",
        }
      : {}),
  }));
};

export function isNeonHistoricalPeriod(
  contractSignedDateIso: string | null | undefined
): boolean {
  const signedDateIso = normalizeIsoDay(contractSignedDateIso);
  if (!signedDateIso) return false;
  return (
    signedDateIso >= NEON_HISTORICAL_VALID_FROM &&
    signedDateIso < NEON_CURRENT_VALID_FROM
  );
}

export function neonMaxDurationYears(
  contractSignedDateIso: string | null | undefined,
  coefficientSetOverride?: NeonCoefficientSet | null
): number {
  return usesHistoricalNeonCoefficientSet(contractSignedDateIso, coefficientSetOverride)
    ? NEON_HISTORICAL_MAX_YEARS
    : NEON_CURRENT_MAX_YEARS;
}

export function normalizeNeonDurationYears(
  years: number | null | undefined,
  contractSignedDateIso: string | null | undefined,
  coefficientSetOverride?: NeonCoefficientSet | null
): number {
  const maxYears = neonMaxDurationYears(contractSignedDateIso, coefficientSetOverride);
  const raw =
    typeof years === "number" && Number.isFinite(years) ? years : maxYears;
  const wholeYears = Math.floor(raw);
  return Math.min(maxYears, Math.max(1, wholeYears));
}

export function neonCoefficients(
  position: Position,
  mode: CommissionMode,
  contractSignedDateIso?: string | null,
  coefficientSetOverride?: NeonCoefficientSet | null
): NeonK {
  if (usesHistoricalNeonCoefficientSet(contractSignedDateIso, coefficientSetOverride)) {
    switch (position) {
      // Poradci 1–10
      case "poradce1":
        return {
          okamzita: 0.01221,
          po3: 0.0066,
          po4: 0.00099,
          n2to5: 0.00218,
          n5to10: 0.01524,
        };
      case "poradce2":
        return {
          okamzita: 0.01388,
          po3: 0.00726,
          po4: 0.00114,
          n2to5: 0.00243,
          n5to10: 0.01702,
        };
      case "poradce3":
        return {
          okamzita: 0.01511,
          po3: 0.00792,
          po4: 0.00125,
          n2to5: 0.00264,
          n5to10: 0.01848,
        };
      case "poradce4":
        return {
          okamzita: 0.02066,
          po3: 0.01023,
          po4: 0.00179,
          n2to5: 0.0033,
          n5to10: 0.02307,
        };
      case "poradce5":
        return {
          okamzita: 0.02261,
          po3: 0.0113,
          po4: 0.00198,
          n2to5: 0.00371,
          n5to10: 0.02594,
        };
      case "poradce6":
        return {
          okamzita: 0.0241,
          po3: 0.01188,
          po4: 0.00213,
          n2to5: 0.00396,
          n5to10: 0.02772,
        };
      case "poradce7":
        return {
          okamzita: 0.02516,
          po3: 0.01245,
          po4: 0.00224,
          n2to5: 0.00442,
          n5to10: 0.03096,
        };
      case "poradce8":
        return {
          okamzita: 0.02666,
          po3: 0.01302,
          po4: 0.00237,
          n2to5: 0.00469,
          n5to10: 0.03281,
        };
      case "poradce9":
        return {
          okamzita: 0.02771,
          po3: 0.01361,
          po4: 0.00248,
          n2to5: 0.00489,
          n5to10: 0.0342,
        };
      case "poradce10":
        return {
          okamzita: 0.02876,
          po3: 0.01418,
          po4: 0.00258,
          n2to5: 0.00503,
          n5to10: 0.03518,
        };
      // Manažeři 4–10
      case "manazer4":
        return {
          okamzita: 0.02252,
          po3: 0.01125,
          po4: 0.00198,
          n2to5: 0.00396,
          n5to10: 0.02772,
        };
      case "manazer5":
        return {
          okamzita: 0.02504,
          po3: 0.01247,
          po4: 0.00222,
          n2to5: 0.00442,
          n5to10: 0.03096,
        };
      case "manazer6":
        return {
          okamzita: 0.02754,
          po3: 0.01367,
          po4: 0.00245,
          n2to5: 0.00485,
          n5to10: 0.03398,
        };
      case "manazer7":
        return {
          okamzita: 0.03007,
          po3: 0.01487,
          po4: 0.00267,
          n2to5: 0.00528,
          n5to10: 0.03696,
        };
      case "manazer8":
        return {
          okamzita: 0.03256,
          po3: 0.01608,
          po4: 0.00291,
          n2to5: 0.00574,
          n5to10: 0.0402,
        };
      case "manazer9":
        return {
          okamzita: 0.03506,
          po3: 0.01728,
          po4: 0.00314,
          n2to5: 0.00614,
          n5to10: 0.04296,
        };
      case "manazer10":
        return {
          okamzita: 0.03758,
          po3: 0.01848,
          po4: 0.00338,
          n2to5: 0.0066,
          n5to10: 0.0462,
        };
    }
  }

  if (mode === "accelerated") {
    switch (position) {
      // Poradci 1–10
      case "poradce1":
        return {
          okamzita: 0.020885,
          po3: 0.004445,
          po4: 0.00133,
          n2to5: 0.00218,
          n5to10: 0.01524,
        };
      case "poradce2":
        return {
          okamzita: 0.02385,
          po3: 0.00489,
          po4: 0.00154,
          n2to5: 0.00243,
          n5to10: 0.01702,
        };
      case "poradce3":
        return {
          okamzita: 0.025685,
          po3: 0.005335,
          po4: 0.00168,
          n2to5: 0.00264,
          n5to10: 0.01848,
        };
      case "poradce4":
        return {
          okamzita: 0.03471,
          po3: 0.00689,
          po4: 0.00241,
          n2to5: 0.0033,
          n5to10: 0.02307,
        };
      case "poradce5":
        return {
          okamzita: 0.03806,
          po3: 0.00761,
          po4: 0.00267,
          n2to5: 0.00371,
          n5to10: 0.02594,
        };
      case "poradce6":
        return {
          okamzita: 0.04045,
          po3: 0.008,
          po4: 0.00287,
          n2to5: 0.00396,
          n5to10: 0.02772,
        };
      case "poradce7":
        return {
          okamzita: 0.042275,
          po3: 0.008385,
          po4: 0.00302,
          n2to5: 0.00442,
          n5to10: 0.03096,
        };
      case "poradce8":
        return {
          okamzita: 0.04468,
          po3: 0.00877,
          po4: 0.00319,
          n2to5: 0.00469,
          n5to10: 0.03281,
        };
      case "poradce9":
        return {
          okamzita: 0.046485,
          po3: 0.009165,
          po4: 0.00334,
          n2to5: 0.00489,
          n5to10: 0.0342,
        };
      case "poradce10":
        return {
          okamzita: 0.04829,
          po3: 0.00955,
          po4: 0.00347,
          n2to5: 0.00503,
          n5to10: 0.03518,
        };
      // Manažeři 4–10
      case "manazer4":
        return {
          okamzita: 0.037945,
          po3: 0.007575,
          po4: 0.00267,
          n2to5: 0.00396,
          n5to10: 0.02772,
        };
      case "manazer5":
        return {
          okamzita: 0.042125,
          po3: 0.008395,
          po4: 0.00299,
          n2to5: 0.00442,
          n5to10: 0.03096,
        };
      case "manazer6":
        return {
          okamzita: 0.046295,
          po3: 0.009205,
          po4: 0.0033,
          n2to5: 0.00485,
          n5to10: 0.03398,
        };
      case "manazer7":
        return {
          okamzita: 0.050515,
          po3: 0.010015,
          po4: 0.0036,
          n2to5: 0.00528,
          n5to10: 0.03696,
        };
      case "manazer8":
        return {
          okamzita: 0.05468,
          po3: 0.01083,
          po4: 0.00392,
          n2to5: 0.00574,
          n5to10: 0.0402,
        };
      case "manazer9":
        return {
          okamzita: 0.058855,
          po3: 0.011633,
          po4: 0.00423,
          n2to5: 0.00614,
          n5to10: 0.04296,
        };
      case "manazer10":
        return {
          okamzita: 0.063134,
          po3: 0.012445,
          po4: 0.00455,
          n2to5: 0.0066,
          n5to10: 0.0462,
        };
    }
  } else {
    // standard režim
    switch (position) {
      // Poradci 1–10
      case "poradce1":
        return {
          okamzita: 0.01644,
          po3: 0.00889,
          po4: 0.00133,
          n2to5: 0.00218,
          n5to10: 0.01524,
        };
      case "poradce2":
        return {
          okamzita: 0.01869,
          po3: 0.00978,
          po4: 0.00154,
          n2to5: 0.00243,
          n5to10: 0.01702,
        };
      case "poradce3":
        return {
          okamzita: 0.02035,
          po3: 0.01067,
          po4: 0.00168,
          n2to5: 0.00264,
          n5to10: 0.01848,
        };
      case "poradce4":
        return {
          okamzita: 0.02782,
          po3: 0.01378,
          po4: 0.00241,
          n2to5: 0.0033,
          n5to10: 0.02307,
        };
      case "poradce5":
        return {
          okamzita: 0.03045,
          po3: 0.01522,
          po4: 0.00267,
          n2to5: 0.00371,
          n5to10: 0.02594,
        };
      case "poradce6":
        return {
          okamzita: 0.03245,
          po3: 0.016,
          po4: 0.00287,
          n2to5: 0.00396,
          n5to10: 0.02772,
        };
      case "poradce7":
        return {
          okamzita: 0.03389,
          po3: 0.01677,
          po4: 0.00302,
          n2to5: 0.00442,
          n5to10: 0.03096,
        };
      case "poradce8":
        return {
          okamzita: 0.03591,
          po3: 0.01754,
          po4: 0.00319,
          n2to5: 0.00469,
          n5to10: 0.03281,
        };
      case "poradce9":
        return {
          okamzita: 0.03732,
          po3: 0.01833,
          po4: 0.00334,
          n2to5: 0.00489,
          n5to10: 0.0342,
        };
      case "poradce10":
        return {
          okamzita: 0.03874,
          po3: 0.0191,
          po4: 0.00347,
          n2to5: 0.00503,
          n5to10: 0.03518,
        };
      // Manažeři 4–10
      case "manazer4":
        return {
          okamzita: 0.03037,
          po3: 0.01515,
          po4: 0.00267,
          n2to5: 0.00396,
          n5to10: 0.02772,
        };
      case "manazer5":
        return {
          okamzita: 0.03373,
          po3: 0.01679,
          po4: 0.00299,
          n2to5: 0.00442,
          n5to10: 0.03096,
        };
      case "manazer6":
        return {
          okamzita: 0.03709,
          po3: 0.01841,
          po4: 0.0033,
          n2to5: 0.00485,
          n5to10: 0.03398,
        };
      case "manazer7":
        return {
          okamzita: 0.0405,
          po3: 0.02003,
          po4: 0.0036,
          n2to5: 0.00528,
          n5to10: 0.03696,
        };
      case "manazer8":
        return {
          okamzita: 0.04385,
          po3: 0.02166,
          po4: 0.00392,
          n2to5: 0.00574,
          n5to10: 0.0402,
        };
      case "manazer9":
        return {
          okamzita: 0.04722,
          po3: 0.02327,
          po4: 0.00423,
          n2to5: 0.00614,
          n5to10: 0.04296,
        };
      case "manazer10":
        return {
          okamzita: 0.05061,
          po3: 0.02489,
          po4: 0.00455,
          n2to5: 0.0066,
          n5to10: 0.0462,
        };
    }
  }
}

// NEON – veřejná funkce
export function calculateNeon(
  monthly: number,
  position: Position,
  years: number | null | undefined = null,
  mode: CommissionMode = "accelerated",
  contractSignedDateIso?: string | null,
  coefficientSetOverride?: NeonCoefficientSet | null
): CommissionResultDTO {
  const effectiveMode = usesHistoricalNeonCoefficientSet(
    contractSignedDateIso,
    coefficientSetOverride
  )
    ? "standard"
    : mode;
  const k = neonCoefficients(
    position,
    effectiveMode,
    contractSignedDateIso,
    coefficientSetOverride
  );
  const y = normalizeNeonDurationYears(
    years,
    contractSignedDateIso,
    coefficientSetOverride
  );
  const annual = monthly * 12;

  const okamzita = annual * y * k.okamzita;
  const po3 = annual * y * k.po3;
  const po4 = annual * y * k.po4;
  const nasl25 = annual * k.n2to5;
  const nasl510 = annual * k.n5to10;

  const total = okamzita + po3 + po4 + nasl25 * 4 + nasl510 * 6;

  const items: CommissionResultItemDTO[] = [
    ...neonImmediateItems(
      okamzita,
      position,
      effectiveMode,
      contractSignedDateIso,
      coefficientSetOverride
    ),
    { title: "📅 Provize po 3 letech", amount: po3, code: "B3601" },
    { title: "📅 Provize po 4 letech", amount: po4, code: "B4801" },
    { title: "🔁 Následná provize (2.–5. rok)", amount: nasl25, code: "B101-B104" },
    { title: "🔁 Pečovatelská provize (5.–10. rok)", amount: nasl510, code: "B201-B206" },
    { title: "💰 Celkem", amount: total, code: "TOTAL" },
  ];

  return { items, total };
}
