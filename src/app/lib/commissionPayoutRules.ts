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
]);

export const isNeonRefreshStatementProductCode = (value: unknown): boolean =>
  NEON_REFRESH_STATEMENT_PRODUCT_CODES.has(normalizedCommissionCode(value));

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
 * ČPP ŽP NEON reports A201 as the investment-life component. Its premium base
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

export const LIFE_SUBSEQUENT_MIN_BASE_RATIO = 0.25;

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
  const monthly = positiveAmount(contract?.refreshCommissionBase?.calculationMonthlyPremium) ??
    positiveAmount(contract?.calculationInputAmount) ?? positiveAmount(contract?.inputAmount);
  return monthly == null ? null : Math.round(monthly * 12 * 100) / 100;
};

/** B1 codes are shared by risk and investment components. A much smaller
 * annual base is excluded from risk comparisons, without asserting its type.
 * The 25% boundary is inclusive for comparisons; missing bases never exclude.
 */
export const hasSmallLifeSubsequentBase = ({
  product,
  commissionCode,
  statementAnnualBase,
  riskAnnualBase,
}: {
  product: Product | null | undefined;
  commissionCode: unknown;
  statementAnnualBase: unknown;
  riskAnnualBase: unknown;
}): boolean => {
  if (!isLifeSubsequentCommissionPayout({ product, commissionCode })) return false;
  const statementBase = positiveAmount(statementAnnualBase);
  const riskBase = positiveAmount(riskAnnualBase);
  return statementBase != null && riskBase != null &&
    statementBase < riskBase * LIFE_SUBSEQUENT_MIN_BASE_RATIO;
};

export const payoutHasSmallLifeSubsequentBase = ({
  product,
  payout,
  riskAnnualBase,
}: {
  product: Product | null | undefined;
  payout: {
    code?: string | null;
    statementBaseAmount?: number | null;
    systemBaseAmount?: number | null;
    detail?: string | null;
  };
  riskAnnualBase?: number | null;
}): boolean => {
  // Older records stored the statement base only in this generated detail.
  // Do not infer a premium base from the paid/expected commission ratio.
  const legacyBase = payout.detail?.match(/Základna výpisu\s+(\d[\d\s.,]*)\s*Kč/i)?.[1];
  const statementBase = payout.statementBaseAmount ??
    (legacyBase ? Number(legacyBase.replace(/\s/g, "").replace(",", ".")) : null);
  return hasSmallLifeSubsequentBase({
    product,
    commissionCode: payout.code,
    statementAnnualBase: statementBase,
    riskAnnualBase: payout.systemBaseAmount ?? riskAnnualBase,
  });
};
