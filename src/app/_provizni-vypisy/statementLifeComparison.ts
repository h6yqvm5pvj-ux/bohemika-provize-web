import { isFlexiIncreaseWithoutBase, matchingFlexiIncreaseCommission } from "@/app/lib/lifeStatementMatching";
import { neonFullPremiumMonthlyBase } from "@/app/lib/neonCorrection";
import { neonRefreshCarePayoutBase } from "@/app/lib/commissionPayoutRules";
import { classifyLifeSplitCommissionCode, monthKeyFromStatementPeriod, resolveStatementProduct } from "./statementParsing";
import { statementCommissionGroups } from "./statementCommissionComparisons";
import type { CommissionAmountComparison, CommissionRow, LifeSplitContractPreview, MatchedSystemContract } from "./statementTypes";

export function lifeStatementCommissionsMatch(rows: readonly CommissionRow[], comparisons: readonly CommissionAmountComparison[]): boolean {
  return comparisons.length > 0 && comparisons.every(comparison => comparison.status === "ok") &&
    !rows.some(row => row.lifeSplitKind === "unknown" && row.commission > 0);
}

export function lifeSplitFlexiIncreaseRowsWithoutBase(contract: LifeSplitContractPreview) {
  const product = resolveStatementProduct(contract.productCode).productKey;
  return contract.rows.filter(row => row.lifeSplitKind === "increase").map(row => ({
    commissionCode: row.type, baseAmount: row.base, commission: row.commission,
    validFrom: row.validFrom, signedAt: row.signedAt,
  })).filter(row => isFlexiIncreaseWithoutBase(product, row));
}

export function lifeSplitFlexiIncreaseComparisons(contract: LifeSplitContractPreview, systemContract: MatchedSystemContract) {
  const rows = lifeSplitFlexiIncreaseRowsWithoutBase(contract);
  if (rows.length !== contract.rows.filter(row => row.lifeSplitKind === "increase").length) return [];
  return rows.flatMap(row => {
    const expectedAmount = matchingFlexiIncreaseCommission(systemContract, row);
    if (expectedAmount == null) return [];
    return [{
      key: `increase-${row.commissionCode}`, label: row.commissionCode, requiredNow: false,
      hasStatementRows: true, statementAmount: row.commission, expectedAmount,
    }];
  });
}

export function lifeSplitFlexiIncreaseStatus(contract: LifeSplitContractPreview, comparisons: CommissionAmountComparison[]) {
  const rows = lifeSplitFlexiIncreaseRowsWithoutBase(contract);
  if (rows.length === 0) return null;
  return rows.every(row => comparisons.some(comparison =>
    comparison.key === `increase-${row.commissionCode}` && comparison.status === "ok"))
    ? "matched" : "pending";
}

/** Different bases belong to specific payout rows, not to the whole contract. */
type LifeSplitBaseComparisonSource = { key: string; label: string; base: number; systemMonthlyPremiumOverride?: number };
type LifeStatementBaseContract = Pick<MatchedSystemContract,
  "productKey" | "inputAmount" | "neonCorrection" | "isRefresh" | "calculationInputAmount" |
  "refreshCommissionBase" | "neonRefreshCareAnnualPremium">;

export function neonRefreshCareStatementBase(contract: LifeStatementBaseContract | null | undefined, row: {
  product: string; type: string; base: number; commission: number; isStorno?: boolean;
}) {
  return neonRefreshCarePayoutBase(contract, {
    productCode: row.product, commissionCode: row.type, baseAmount: row.base,
    commission: row.commission, status: row.isStorno ? "storno" : undefined,
  });
}

export const lifeSplitBaseComparisonSources = (
  contract: LifeSplitContractPreview,
  systemContract?: LifeStatementBaseContract | null,
  statementPeriod?: string | null,
): LifeSplitBaseComparisonSource[] => {
  const rows = contract.rows.filter(row => Number.isFinite(row.base) && row.base > 0 &&
    classifyLifeSplitCommissionCode(row.type).kind !== "unknown");
  const systemMonthlyPremiumOverride = neonFullPremiumMonthlyBase(systemContract, monthKeyFromStatementPeriod(statementPeriod));
  const sources = rows.map((row, index) => ({
    key: `life-premium-base-${row.id}-${index}`,
    label: `Základna ${row.type}`,
    base: row.base,
    systemMonthlyPremiumOverride: neonRefreshCareStatementBase(systemContract, row)?.monthly ?? systemMonthlyPremiumOverride,
  }));
  const hasDifferentBases = rows.some(row => Math.abs(row.base - rows[0].base) > 0.01);
  if (systemContract?.neonCorrection || hasDifferentBases || sources.some(source => source.systemMonthlyPremiumOverride != null)) return sources;
  const codes = [...new Set(rows.map(row => row.type))];
  const onlyLaterCommissions = rows.length > 0 && rows.every(row =>
    ["subsequent", "care", "b3601", "b4801"].includes(classifyLifeSplitCommissionCode(row.type).kind));
  return contract.annualPremium > 0
    ? [{ key: "life-premium-base", label: onlyLaterCommissions ? `Základna ${codes.join(", ")}` : "Základna pojistného", base: contract.annualPremium }]
    : [];
};

/** B101, B102, etc. are separate payouts, each with its own expected amount. */
export const lifeSplitCommissionGroups = (
  contract: LifeSplitContractPreview,
  kind: "subsequent" | "care"
): { code: string; rows: CommissionRow[] }[] =>
  statementCommissionGroups(contract.rows.filter(row => row.lifeSplitKind === kind));
