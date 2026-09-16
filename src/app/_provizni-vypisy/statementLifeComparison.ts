import { classifyLifeSplitCommissionCode, normalizeStatementCommissionCode } from "./statementParsing";
import type { CommissionRow, LifeSplitContractPreview } from "./statementTypes";

/** Different bases belong to specific payout rows, not to the whole contract. */
export const lifeSplitBaseComparisonSources = (contract: LifeSplitContractPreview) => {
  const rows = contract.rows.filter(row => Number.isFinite(row.base) && row.base > 0 &&
    classifyLifeSplitCommissionCode(row.type).kind !== "unknown");
  const hasDifferentBases = rows.some(row => Math.abs(row.base - rows[0].base) > 0.01);
  const codes = [...new Set(rows.map(row => row.type))];
  const onlyLaterCommissions = rows.length > 0 && rows.every(row =>
    ["subsequent", "care", "b3601", "b4801"].includes(classifyLifeSplitCommissionCode(row.type).kind));
  if (!hasDifferentBases) return contract.annualPremium > 0
    ? [{ key: "life-premium-base", label: onlyLaterCommissions ? `Základna ${codes.join(", ")}` : "Základna pojistného", base: contract.annualPremium }]
    : [];
  return rows.map((row, index) => ({
    key: `life-premium-base-${row.id}-${index}`,
    label: `Základna ${row.type}`,
    base: row.base,
  }));
};

/** B101, B102, etc. are separate payouts, each with its own expected amount. */
export const lifeSplitCommissionGroups = (
  contract: LifeSplitContractPreview,
  kind: "subsequent" | "care"
): { code: string; rows: CommissionRow[] }[] => {
  const groups = new Map<string, CommissionRow[]>();
  for (const row of contract.rows) {
    if (row.lifeSplitKind !== kind) continue;
    const code = normalizeStatementCommissionCode(row.type);
    groups.set(code, [...(groups.get(code) ?? []), row]);
  }
  return [...groups].map(([code, rows]) => ({ code, rows }));
};
