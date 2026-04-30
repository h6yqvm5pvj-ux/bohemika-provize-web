import { type CommissionMode, type Position, type Product } from "../../types/domain";
import { normalizeTitleForCompare } from "./contractDetailHelpers";
import { type ContractDoc } from "./contractDetailTypes";

export const LIFE_PRODUCT_KEYS = new Set<Product>([
  "neon",
  "flexi",
  "maximaMaxEfekt",
  "pillowInjury",
]);

export const ALLIANZ_PAYMENT_CHECK_URL =
  "https://www.allianz.cz/cs_CZ/apps/zaplacenost-pojistky.html";
export const SLAVIA_PAYMENT_CHECK_URL = "https://www.slavia-pojistovna.cz/over-ps/";
export const CPP_PAYMENT_CHECK_URL =
  "https://insure.cpp.cz/GolemWEB/B2C/www/mobily/m_smlv_login.xhtml#kotva";
export const KOOPERATIVA_PAYMENT_CHECK_URL =
  "https://insure.koop.cz/GolemWEB/B2C/www/mobily/m_smlv_login.xhtml";
export const CPP_PAYMENT_CHECK_PRODUCTS = new Set<Product>([
  "neon",
  "zamex",
  "domex",
  "cpphafan",
  "cppsimplex",
  "cppAuto",
  "cppPPRs",
  "cppPPRbez",
  "cppcestovko",
]);
export const KOOPERATIVA_PAYMENT_CHECK_PRODUCTS = new Set<Product>([
  "flexi",
  "koopmajetekobcan",
  "kooperativaAuto",
  "koopcestovko",
]);

export type ContractsApiError = Error & { status?: number };

export type ContractsApiResponseBase = {
  ok?: boolean;
  error?: string;
};

type ContractOwnerMetaApi = {
  position?: Position | null;
  managerEmail?: string | null;
  managerPosition?: Position | null;
  currentChainEmails?: string[];
};

export type ContractDetailApiResponse = ContractsApiResponseBase & {
  mode?: "detail";
  position?: Position | null;
  hasTeam?: boolean;
  teamEmails?: string[];
  contract?: ContractDoc;
  timeline?: ContractDoc[];
  ownerMeta?: ContractOwnerMetaApi | null;
};

type NeonImmediateBreakdownPart = {
  label: string;
  amount: number;
};

export type NeonImmediateBreakdown = {
  position: Position;
  totalCoefficient: number;
  a101Coefficient: number;
  b0301Coefficient: number;
  b3601HalfCoefficient: number;
  includeB3601: boolean;
  parts: NeonImmediateBreakdownPart[];
  total: number;
};

const NEON_IMMEDIATE_TOTAL_COEFFICIENTS: Record<Position, number> = {
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

const NEON_IMMEDIATE_B0301_COEFFICIENTS: Record<Position, number> = {
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

const NEON_IMMEDIATE_B3601_HALF_COEFFICIENTS: Record<Position, number> = {
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

const roundToCents = (value: number): number => Math.round(value * 100) / 100;
const toCents = (value: number): number => Math.round(value * 100);
const fromCents = (value: number): number => value / 100;

export const toCommissionMode = (value: unknown): CommissionMode | null =>
  value === "accelerated" || value === "standard" ? value : null;

const isAcceleratedMode = (mode: CommissionMode | null | undefined): boolean =>
  mode === "accelerated";

export const isImmediateCommissionTitle = (title: string): boolean =>
  normalizeTitleForCompare(title).includes("okamžitá provize");

export const hasNeonImmediateCoefficient = (
  position: Position | null | undefined
): position is Position =>
  !!position &&
  Number.isFinite(NEON_IMMEDIATE_TOTAL_COEFFICIENTS[position]) &&
  Number.isFinite(NEON_IMMEDIATE_B0301_COEFFICIENTS[position]) &&
  Number.isFinite(NEON_IMMEDIATE_B3601_HALF_COEFFICIENTS[position]);

export const buildNeonImmediateBreakdown = (
  amount: number,
  position: Position | null | undefined,
  mode: CommissionMode | null | undefined
): NeonImmediateBreakdown | null => {
  if (!hasNeonImmediateCoefficient(position)) return null;

  const includeB3601 = isAcceleratedMode(mode);
  const totalCoefficient = NEON_IMMEDIATE_TOTAL_COEFFICIENTS[position];
  const b0301Coefficient = NEON_IMMEDIATE_B0301_COEFFICIENTS[position];
  const b3601HalfCoefficient = includeB3601
    ? NEON_IMMEDIATE_B3601_HALF_COEFFICIENTS[position]
    : 0;
  const a101Coefficient =
    totalCoefficient - b0301Coefficient - b3601HalfCoefficient;
  if (!Number.isFinite(totalCoefficient) || totalCoefficient <= 0) return null;
  if (!Number.isFinite(b0301Coefficient) || b0301Coefficient < 0) return null;
  if (!Number.isFinite(b3601HalfCoefficient) || b3601HalfCoefficient < 0) return null;
  if (a101Coefficient < -0.000001) return null;

  const total = Number(amount);
  if (!Number.isFinite(total) || total <= 0) return null;

  const baseAmount = total / totalCoefficient;
  const partDefs: { label: string; raw: number }[] = [
    { label: "Provize 101A", raw: baseAmount * Math.max(0, a101Coefficient) },
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
