import type { Product } from "@/app/types/domain";

const normalizedCommissionCode = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

const NEON_REFRESH_STATEMENT_PRODUCT_CODES = new Set([
  "CPP_NEONRF",
  "CPP_NRF_LF",
]);

export const isNeonRefreshStatementProductCode = (value: unknown): boolean =>
  NEON_REFRESH_STATEMENT_PRODUCT_CODES.has(normalizedCommissionCode(value));

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

  const code = normalizedCommissionCode(commissionCode);
  const closingRoleMatch = code.match(/^(?:APZ|AP|AZ)(\d+)$/);
  const comparableCode = closingRoleMatch ? `A${closingRoleMatch[1]}` : code;

  return comparableCode === "A201";
};
