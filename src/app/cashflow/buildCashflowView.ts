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
import { isShiftedCashflowPayout } from "./commissionPresentation";

export type CashflowViewOptions = {
  scopeFilter: ScopeFilter;
  productFilter: ProductFilter;
  tipsterMode: boolean;
  showPastYears: boolean;
  intelligentPredictionEnabled: boolean;
  contractNumberQuery: string;
  shiftedOnly?: boolean;
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
  const shiftedOnly = options.shiftedOnly === true;
  const useStatementTotals = !shiftedOnly && !options.tipsterMode && !searching &&
    options.scopeFilter === "combined" && options.productFilter === "all";
  const reconcileStatements = useStatementTotals || (!options.tipsterMode && shiftedOnly);
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
  const beforeSearch = reconcileStatements || searching
    ? items
    : filterPastItems(items, options.showPastYears, asOf);
  const filtered = filterItemsByContractNumber(beforeSearch, options.contractNumberQuery);
  const reconciled = applyStatementMissingPayoutShifts({
    cashflowItems: filtered, statementsByMonthKey: statementsByMonth, enabled: reconcileStatements,
  });
  const predicted = applyIntelligentCashflowPrediction({
    cashflowItems: reconciled,
    enabled: options.intelligentPredictionEnabled && !options.tipsterMode,
    today: asOf,
  });
  const periodItems = searching ? predicted : filterPastItems(predicted, options.showPastYears, asOf);
  const visibleItems = shiftedOnly ? periodItems.filter(isShiftedCashflowPayout) : periodItems;
  return applyStatementPayoutTotalsToMonths({
    monthGroups: groupItemsByMonth(visibleItems),
    statementsByMonthKey: searching
      ? statementsByMonth
      : filterPastStatementMonths(statementsByMonth, options.showPastYears, asOf),
    enabled: useStatementTotals,
  });
}
