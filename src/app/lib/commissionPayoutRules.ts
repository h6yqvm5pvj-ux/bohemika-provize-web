import type { Product } from "@/app/types/domain";
import { isAutoProduct } from "@/app/lib/productCatalog";

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
