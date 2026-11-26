import { hasPendingFlexiRenovationBase } from "@/app/lib/flexiRenovation";
import type { Product } from "@/app/types/domain";
import { isAutoProduct, isLifeProduct } from "@/app/lib/productCatalog";
import { neonFullPremiumMonthlyBase, type NeonCorrection } from "@/app/lib/neonCorrection";

/** A real payment above a known positive expectation is not an underpayment. */
export const isHigherCommissionPayout = ({ amount, expectedAmount, tolerance }: {
  amount: number;
  expectedAmount: number | null | undefined;
  tolerance: number;
}): boolean => typeof expectedAmount === "number" && Number.isFinite(expectedAmount) && expectedAmount > 0 &&
  Number.isFinite(amount) && Number.isFinite(tolerance) && tolerance >= 0 && amount - expectedAmount > tolerance;

const normalizedCommissionCode = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

export const baseCommissionCodeForPayoutComparison = (
  value: unknown,
  product?: Product | null,
): string => {
  const code = normalizedCommissionCode(value);
  // Kooperativa Auto reports the same subsequent installment as C1xx in
  // statements and B1xx in the contractual plan. Keep this product-specific:
  // C codes from other insurers do not necessarily have the same meaning.
  if (product === "kooperativaAuto" && /^C1\d{2,}$/.test(code)) return `B${code.slice(1)}`;
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
}): boolean => {
  const code = baseCommissionCodeForPayoutComparison(commissionCode);
  return isLifeProduct(product) && (/^B1\d+(?:-B1\d+)?$/.test(code) ||
    (product === "neon" && /^B20[1-6]$/.test(code)));
};

const positiveAmount = (value: unknown): number | null => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
};

/** Older calculations can use full premium when the statement corroborates it. */
export function neonRefreshCarePayoutBase(contract: {
  productKey?: string | null;
  isRefresh?: boolean | null;
  inputAmount?: number | null;
  calculationInputAmount?: number | null;
  neonRefreshCareAnnualPremium?: number | null;
  refreshCommissionBase?: { calculationMonthlyPremium?: number | null; calculationAnnualPremium?: number | null } | null;
} | null | undefined, row: {
  productCode: unknown;
  commissionCode: unknown;
  baseAmount: unknown;
  commission: number;
  status?: string;
}) {
  if (contract?.productKey !== "neon" || contract.isRefresh !== true || row.status === "storno" || !positiveAmount(row.commission) ||
      !isNeonStatementProductCode(row.productCode) || !/^B20[1-6]$/.test(baseCommissionCodeForPayoutComparison(row.commissionCode))) return null;

  const storedAnnual = positiveAmount(contract.neonRefreshCareAnnualPremium);
  if (storedAnnual != null) return { monthly: storedAnnual / 12, annual: storedAnnual, multiplier: 1 };

  const monthly = positiveAmount(contract.inputAmount);
  const refresh = contract.refreshCommissionBase;
  const refreshMonthly = positiveAmount(refresh?.calculationMonthlyPremium) ?? positiveAmount(contract.calculationInputAmount);
  const refreshAnnual = positiveAmount(refresh?.calculationAnnualPremium) ?? (refreshMonthly == null ? null : refreshMonthly * 12);
  const statement = positiveAmount(row.baseAmount);
  if (monthly == null || refreshAnnual == null || statement == null) return null;
  const annualCents = Math.round(monthly * 1200);
  if (!Number.isSafeInteger(annualCents) || !Number.isFinite(refreshAnnual) ||
      annualCents <= 0 || Math.round(statement * 100) !== annualCents) return null;
  const annual = annualCents / 100;
  return { monthly, annual, multiplier: annual / refreshAnnual };
}

export const lifeRiskAnnualPremiumBase = (contract: {
  productKey?: string | null;
  commissionCalculationStatus?: string | null;
  refreshCommissionBase?: { calculationMonthlyPremium?: number | null } | null;
  calculationInputAmount?: number | null;
  inputAmount?: number | null;
  neonCorrection?: NeonCorrection | null;
} | null | undefined, payoutPeriod?: unknown): number | null => {
  if (hasPendingFlexiRenovationBase(contract)) return null;
  // A renovation in the guarantee period with no increase has a real zero base.
  if (contract?.refreshCommissionBase?.calculationMonthlyPremium === 0) return 0;
  const neonMonthly = neonFullPremiumMonthlyBase(contract, payoutPeriod);
  const monthly = positiveAmount(contract?.refreshCommissionBase?.calculationMonthlyPremium) ??
    positiveAmount(neonMonthly) ?? positiveAmount(contract?.calculationInputAmount) ?? positiveAmount(contract?.inputAmount);
  return monthly == null ? null : Math.round(monthly * 12 * 100) / 100;
};
