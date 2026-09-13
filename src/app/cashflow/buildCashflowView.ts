import {
  applyIntelligentCashflowPrediction,
  applyStatementMissingPayoutShifts,
  applyStatementPayoutTotalsToMonths,
  filterItemsByContractNumber,
  filterPastItems,
  filterPastStatementMonths,
  groupItemsByMonth,
  normalizeContractNumberSearch,
  statementMonthKey,
} from "./helpers";
import type {
  CashflowCommissionStatementSummary,
  CashflowItem,
  MonthGroup,
  ProductFilter,
  ScopeFilter,
} from "./types";

export type CashflowViewOptions = {
  scopeFilter: ScopeFilter;
  productFilter: ProductFilter;
  tipsterMode: boolean;
  showPastYears: boolean;
  intelligentPredictionEnabled: boolean;
  contractNumberQuery: string;
};

// Mirrors the page's existing composition, using the same business helpers.
// Kept off the display path so shadow comparison also detects composition drift.
export function buildCashflowView(
  items: CashflowItem[],
  statements: CashflowCommissionStatementSummary[],
  options: CashflowViewOptions,
  asOf: Date,
): MonthGroup[] {
  const searching = normalizeContractNumberSearch(options.contractNumberQuery).length > 0;
  const useStatementTotals = !options.tipsterMode && !searching &&
    options.scopeFilter === "combined" && options.productFilter === "all";
  const statementsByMonth: Record<string, CashflowCommissionStatementSummary[]> = {};
  for (const statement of statements) {
    const key = statementMonthKey(statement);
    if (key) (statementsByMonth[key] ??= []).push(statement);
  }
  for (const month of Object.values(statementsByMonth)) {
    month.sort((a, b) => (a.statementDate ?? a.fileName).localeCompare(
      b.statementDate ?? b.fileName, "cs",
    ));
  }
  const beforeSearch = useStatementTotals || searching
    ? items
    : filterPastItems(items, options.showPastYears, asOf);
  const filtered = filterItemsByContractNumber(beforeSearch, options.contractNumberQuery);
  const reconciled = applyStatementMissingPayoutShifts({
    cashflowItems: filtered, statementsByMonthKey: statementsByMonth, enabled: useStatementTotals,
  });
  const predicted = applyIntelligentCashflowPrediction({
    cashflowItems: reconciled,
    enabled: options.intelligentPredictionEnabled && !options.tipsterMode,
    today: asOf,
  });
  return applyStatementPayoutTotalsToMonths({
    monthGroups: groupItemsByMonth(searching ? predicted : filterPastItems(predicted, options.showPastYears, asOf)),
    statementsByMonthKey: searching
      ? statementsByMonth
      : filterPastStatementMonths(statementsByMonth, options.showPastYears, asOf),
    enabled: useStatementTotals,
  });
}
