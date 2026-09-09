import { hasSmallLifeSubsequentBase } from "@/app/lib/commissionPayoutRules";
import { lifeSplitAnnualPremiumBase, resolveStatementProduct } from "./statementParsing";
import type { CommissionRow, LifeSplitContractPreview } from "./statementTypes";

export const lifeSplitComparisonScope = (
  sourceContract: LifeSplitContractPreview,
  riskAnnualBase: number | null | undefined
): { contract: LifeSplitContractPreview; excludedRows: CommissionRow[] } => {
  const excludedRows: CommissionRow[] = [];
  const rows = sourceContract.rows.filter((row) => {
    const excluded = hasSmallLifeSubsequentBase({
      product: resolveStatementProduct(row.product).productKey,
      commissionCode: row.type,
      statementAnnualBase: row.base,
      riskAnnualBase,
    });
    if (excluded) excludedRows.push(row);
    return !excluded;
  });
  return {
    contract: excludedRows.length === 0 ? sourceContract : {
      ...sourceContract,
      rows,
      annualPremium: lifeSplitAnnualPremiumBase(rows),
    },
    excludedRows,
  };
};
