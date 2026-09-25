import type { Product } from "@/app/types/domain";
import { isAutoProduct, isLifeProduct } from "@/app/lib/productCatalog";

const normalizedCommissionCode = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

export const baseCommissionCodeForPayoutComparison = (
  value: unknown
): string => {
  const code = normalizedCommissionCode(value);
  const closingRoleMatch = code.match(/^(?:APZ|AP|AZ)(\d+)$/);
  return closingRoleMatch ? `A${closingRoleMatch[1]}` : code;
};

const NEON_REFRESH_STATEMENT_PRODUCT_CODES = new Set([
  "CPP_NEONRF",
  "CPP_NRF_LF",
  "CPP_NRF_IN",
]);

export const isNeonRefreshStatementProductCode = (value: unknown): boolean =>
  NEON_REFRESH_STATEMENT_PRODUCT_CODES.has(normalizedCommissionCode(value));

export const isNeonStatementProductCode = (value: unknown): boolean =>
  isNeonRefreshStatementProductCode(value) ||
  ["CPP_N_LIFE", "CPP_NEON", "CPP_N_RISK"].includes(normalizedCommissionCode(value));

/** REFRESH uses the risk A101/B0301 base. A201 and subsequent investment
 * commissions must never supply it, even when they are the only rows present.
 * Allow the same 12 Kč annual rounding tolerance as statement reconciliation.
 */
export const neonRefreshRiskAnnualPremiumBase = (
  rows: ReadonlyArray<{ commissionCode: unknown; baseAmount: unknown }>
): number | null => {
  const bases = rows
    .map((row) => ({
      code: baseCommissionCodeForPayoutComparison(row.commissionCode),
      base: Math.round(Number(row.baseAmount) * 100) / 100,
    }))
    .filter(({ code, base }) => ["A101", "B0301"].includes(code) && Number.isFinite(base) && base > 0)
    // The browser and server can parse rows in different orders. Prefer A101
    // and resolve harmless rounding differences deterministically.
    .sort((a, b) => a.code.localeCompare(b.code) || a.base - b.base)
    .map(({ base }) => base);
  const first = bases[0];
  if (first == null || bases.some((base) => Math.abs(base - first) > 12)) return null;
  return first;
};

/**
 * Only the initial A commission for auto insurance can safely compare the
 * contract base with the statement base. Anniversary B commissions may use a
 * legitimately increased or decreased premium base.
 */
export const isFirstYearAutoACommissionPayout = ({
  product,
  commissionCode,
}: {
  product: Product | null | undefined;
  commissionCode: unknown;
}): boolean => {
  if (!isAutoProduct(product)) return false;

  const comparableCode = baseCommissionCodeForPayoutComparison(commissionCode);

  return /^A\d+$/.test(comparableCode) || /^AC\d+$/.test(comparableCode);
};

/**
 * ČPP Životní pojištění NEON reports A201 as the investment-life component. Its premium base
 * is intentionally different from the base of the regular A101 commission.
 */
export const isNeonInvestmentLifeA201Payout = ({
  product,
  commissionCode,
}: {
  product: Product | null | undefined;
  commissionCode: unknown;
}): boolean => {
  if (product !== "neon") return false;

  const comparableCode = baseCommissionCodeForPayoutComparison(commissionCode);

  return comparableCode === "A201";
};

export const isLifeSubsequentCommissionPayout = ({
  product,
  commissionCode,
}: {
  product: Product | null | undefined;
  commissionCode: unknown;
}): boolean =>
  isLifeProduct(product) &&
  /^B1\d+(?:-B1\d+)?$/.test(baseCommissionCodeForPayoutComparison(commissionCode));

const positiveAmount = (value: unknown): number | null => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
};

export const lifeRiskAnnualPremiumBase = (contract: {
  refreshCommissionBase?: { calculationMonthlyPremium?: number | null } | null;
  calculationInputAmount?: number | null;
  inputAmount?: number | null;
} | null | undefined): number | null => {
  // A renovation in the guarantee period with no increase has a real zero base.
  if (contract?.refreshCommissionBase?.calculationMonthlyPremium === 0) return 0;
  const monthly = positiveAmount(contract?.refreshCommissionBase?.calculationMonthlyPremium) ??
    positiveAmount(contract?.calculationInputAmount) ?? positiveAmount(contract?.inputAmount);
  return monthly == null ? null : Math.round(monthly * 12 * 100) / 100;
};
