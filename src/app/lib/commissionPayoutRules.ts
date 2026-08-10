import type { Product } from "@/app/types/domain";

const normalizedCommissionCode = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

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
