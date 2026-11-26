import type { Product } from "@/app/types/domain";
import type { AutoCommissionReceipt } from "./autoSubsequentInstallmentCoverage";
import { baseCommissionCodeForPayoutComparison } from "./commissionPayoutRules";

type Payout = AutoCommissionReceipt & { statementId?: string | null; writtenBy?: string | null };

export type CommissionStatementPayoutRow = {
  contractNumber: string;
  productKey: Product;
  source: "own" | "manager";
  code: string;
  amount: number;
  sourceBaseAmount?: number | null;
};

type Statement = {
  id: string;
  payoutMonthKey: string | null;
  statementDate: string | null;
  period: string | null;
};

type Evidence = {
  statement: Statement;
  sourceBaseAmount?: number | null;
};

export const isExactAutoSubsequentStatementCode = (code: string) => /^B1(?!00)\d{2}$/.test(code);
export const isAutoAcquisitionInstallmentStatementCode = (code: string) =>
  /^AC?(?:10[1-9]|11[0-2]|[1-9]|1[0-2])$/.test(code);

const positive = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const evidenceKey = (statementId: string, contract: string, product: Product,
  source: CommissionStatementPayoutRow["source"], code: string, amount: number) =>
  JSON.stringify([statementId, contract, product, source, code, Math.round(amount * 100)]);

export function indexCommissionStatementPayouts<T extends Statement>(
  statements: readonly T[],
  rowsForStatement: (statement: T) => readonly CommissionStatementPayoutRow[] | undefined,
) {
  const evidence = new Map<string, Evidence | null>();
  for (const statement of statements) {
    for (const row of rowsForStatement(statement) ?? []) {
      const number = row.contractNumber.replace(/\D/g, "");
      const code = baseCommissionCodeForPayoutComparison(row.code, row.productKey);
      if (!number || !code || !positive(row.amount)) continue;
      const key = evidenceKey(statement.id, number, row.productKey, row.source, code, row.amount);
      // A receipt can only borrow metadata from an unambiguous statement row.
      evidence.set(key, evidence.has(key) ? null : { statement, sourceBaseAmount: row.sourceBaseAmount });
    }
  }
  return evidence;
}

export function enrichCommissionStatementPayouts<T extends Payout>(
  payouts: T[],
  evidence: ReadonlyMap<string, Evidence | null>,
  scope: { contractNumber?: string | null; productKey: Product; source: CommissionStatementPayoutRow["source"]; viewerEmail: string },
): T[] {
  const number = scope.contractNumber?.replace(/\D/g, "");
  const viewer = scope.viewerEmail.trim().toLowerCase();
  if (!number || !viewer || !evidence.size) return payouts;
  let changed = false;
  const enriched = payouts.map(payout => {
    if (!payout.statementId || payout.writtenBy?.trim().toLowerCase() !== viewer ||
        payout.status === "storno" || !positive(payout.amount)) return payout;
    const code = baseCommissionCodeForPayoutComparison(payout.statementCode ?? payout.code, scope.productKey);
    const match = evidence.get(evidenceKey(payout.statementId, number, scope.productKey, scope.source, code, payout.amount));
    if (!match) return payout;
    const { statement } = match;
    const sourceBaseAmount = payout.sourceBaseAmount ??
      (positive(match.sourceBaseAmount) ? match.sourceBaseAmount : payout.sourceBaseAmount);
    const payoutMonthKey = payout.payoutMonthKey ?? statement.payoutMonthKey;
    const statementDate = payout.statementDate ?? statement.statementDate;
    const statementPeriod = payout.statementPeriod ?? statement.period;
    if (sourceBaseAmount === payout.sourceBaseAmount && payoutMonthKey === payout.payoutMonthKey &&
        statementDate === payout.statementDate && statementPeriod === payout.statementPeriod) return payout;
    changed = true;
    return { ...payout, sourceBaseAmount, payoutMonthKey, statementDate, statementPeriod };
  });
  return changed ? enriched : payouts;
}
