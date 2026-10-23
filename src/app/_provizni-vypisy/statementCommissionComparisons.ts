import { COMMISSION_AMOUNT_TOLERANCE, normalizeStatementCommissionCode } from "./statementParsing";
import type { CommissionAmountComparison, CommissionAmountComparisonStatus, CommissionRow } from "./statementTypes";

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
  expectedForRows: (rows: CommissionRow[]) => { amount: number; periods?: number; detailLines?: string[] };
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
      };
    });
}
