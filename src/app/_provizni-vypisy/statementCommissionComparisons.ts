import { COMMISSION_AMOUNT_TOLERANCE, normalizeStatementCommissionCode } from "./statementParsing";
import type { CommissionAmountComparison, CommissionAmountComparisonStatus, CommissionRow } from "./statementTypes";
import { baseCommissionCodeForPayoutComparison, isHigherCommissionPayout } from "@/app/lib/commissionPayoutRules";
import { autoSubsequentCoefficientForProduct, isAutoSubsequentCommissionCode } from "@/app/lib/productFormulas/autoCommission";
import type { Position, Product } from "@/app/types/domain";

/** Use the same per-payment base and product-specific code aliases as payout import. */
export const autoSubsequentExpectedAmountForRow = (
  productKey: Product,
  position: Position,
  signedDateIso: string | null,
  row: CommissionRow
): number | null => {
  const code = baseCommissionCodeForPayoutComparison(row.type, productKey);
  if (!isAutoSubsequentCommissionCode(code)) return null;
  const rowBase = Number(row.base);
  if (!Number.isFinite(rowBase) || rowBase <= 0) return null;
  const coefficient = autoSubsequentCoefficientForProduct(productKey, position, signedDateIso);
  return coefficient == null ? null : Math.round(rowBase * coefficient * 100) / 100;
};

export const isHigherStatementCommission = (comparison: { status: CommissionAmountComparisonStatus; expectedAmount?: number; statementAmount?: number; acceptHigherCommission?: boolean }): boolean =>
  comparison.acceptHigherCommission !== false && comparison.status === "diff" && isHigherCommissionPayout({ amount: comparison.statementAmount ?? Number.NaN,
    expectedAmount: comparison.expectedAmount, tolerance: COMMISSION_AMOUNT_TOLERANCE });

export const isAmountComparisonExplainedByAutoPremiumChange = (
  comparison: CommissionAmountComparison,
  premiumChange: { annualDifference: number } | null
): boolean => Boolean(
  premiumChange &&
  // A row-base calculation already accounts for the premium change.
  !comparison.usesStatementPremiumBase &&
  comparison.status === "diff" &&
  ((premiumChange.annualDifference > COMMISSION_AMOUNT_TOLERANCE &&
    comparison.difference > COMMISSION_AMOUNT_TOLERANCE) ||
    (premiumChange.annualDifference < -COMMISSION_AMOUNT_TOLERANCE &&
    comparison.difference < -COMMISSION_AMOUNT_TOLERANCE))
);

export const STATEMENT_AMOUNT_PRESENCE_TOLERANCE = 0.005;

export const hasStatementAmountForComparison = (amount: number): boolean =>
  Number.isFinite(amount) && Math.abs(amount) >= STATEMENT_AMOUNT_PRESENCE_TOLERANCE;

export const comparisonStatus = (
  statementAmount: number,
  expectedAmount: number,
  tolerance = COMMISSION_AMOUNT_TOLERANCE
): CommissionAmountComparisonStatus => {
  if (Math.abs(statementAmount - expectedAmount) <= tolerance) return "ok";
  if (!hasStatementAmountForComparison(statementAmount) && hasStatementAmountForComparison(expectedAmount)) return "missing_statement";
  if (!hasStatementAmountForComparison(expectedAmount) && hasStatementAmountForComparison(statementAmount)) return "missing_expected";
  return "diff";
};

/** Mirror payout import: ignore an incorrect duplicate when the same code has a matching payout. */
export function statementAmountForSinglePayout(rows: CommissionRow[], expectedAmount: number): number {
  const total = rows.reduce((sum, row) => sum + row.commission, 0);
  if (rows.length < 2 || !Number.isFinite(expectedAmount) || expectedAmount <= 0 ||
      rows.some(row => !Number.isFinite(row.commission) || row.commission <= 0) ||
      new Set(rows.map(row => normalizeStatementCommissionCode(row.type))).size !== 1) return total;

  const matching = rows.filter(row => Math.abs(row.commission - expectedAmount) <= COMMISSION_AMOUNT_TOLERANCE);
  // Preserve unresolved differences and genuine repeated payments/corrections.
  if (matching.length === 0 || matching.length === rows.length) return total;
  return matching.reduce((sum, row) => sum + row.commission, 0);
}

/** Different codes identify separate payouts; repeated rows of one code stay together. */
export function statementCommissionGroups(rows: CommissionRow[]): { code: string; rows: CommissionRow[] }[] {
  const groups = new Map<string, CommissionRow[]>();
  for (const row of rows) {
    const code = normalizeStatementCommissionCode(row.type);
    const group = groups.get(code);
    if (group) group.push(row);
    else groups.set(code, [row]);
  }
  return [...groups].map(([code, rows]) => ({ code, rows }));
}

export function buildStatementCodeComparisons({ rows, keyPrefix, expectedForRows }: {
  rows: CommissionRow[];
  keyPrefix: string;
  expectedForRows: (rows: CommissionRow[]) => { amount: number; periods?: number; detailLines?: string[]; acceptHigherCommission?: boolean; usesStatementPremiumBase?: boolean };
}): CommissionAmountComparison[] {
  return statementCommissionGroups(rows)
    .filter(group => group.rows.some(row => hasStatementAmountForComparison(row.commission)))
    .map(({ code, rows }) => {
      const statementAmount = rows.reduce((sum, row) => sum + row.commission, 0);
      const expected = expectedForRows(rows);
      return {
        key: `${keyPrefix}-${code}`,
        label: expected.periods ? `${code} (${expected.periods} období)` : code,
        statementAmount,
        expectedAmount: expected.amount,
        difference: statementAmount - expected.amount,
        status: comparisonStatus(statementAmount, expected.amount),
        detailLines: expected.detailLines,
        ...(expected.acceptHigherCommission === undefined ? {} : { acceptHigherCommission: expected.acceptHigherCommission }),
        ...(expected.usesStatementPremiumBase === undefined ? {} : { usesStatementPremiumBase: expected.usesStatementPremiumBase }),
      };
    });
}
