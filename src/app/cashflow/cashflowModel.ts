import { computeCashflow, type CashflowSnapshot } from "./computeCashflow";
import type { CashflowViewOptions } from "./buildCashflowView";
import { formatCashflowItemCount } from "./cashflowLabels";
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
import type { CashflowCommissionStatementSummary, CashflowItem, MonthGroup } from "./types";
import type {
  CashflowContractSearchStats, CashflowDataset, CashflowModel, CashflowOverview,
} from "./cashflowWorker.types";

export type {
  CashflowContractSearchStats, CashflowContractSearchSummary, CashflowDataset,
  CashflowModel, CashflowMonthOverview, CashflowOverview,
} from "./cashflowWorker.types";

type StatementsByMonth = Record<string, CashflowCommissionStatementSummary[]>;

/**
 * One immutable source dataset and one last result per page calculation stage.
 * Callers replace/dispose this model after source data, account or date changes.
 * No persistence, shared account cache or change to commission calculations.
 */
export function createCashflowModel(initialDataset: CashflowDataset): CashflowModel {
  if (!(initialDataset.asOf instanceof Date) || !Number.isFinite(initialDataset.asOf.getTime())) {
    throw new Error("Cashflow dataset requires a valid calculation date");
  }
  let dataset: CashflowDataset | null = { ...initialDataset, asOf: new Date(initialDataset.asOf) };
  let currentMonths: MonthGroup[] | null = null;
  const clearCaches: Array<() => void> = [];

  const memo = <Args extends unknown[], Result>(calculate: (...args: Args) => Result) => {
    let cached: { args: Args; value: Result } | undefined;
    clearCaches.push(() => { cached = undefined; });
    return (...args: Args): Result => {
      if (cached && args.length === cached.args.length && args.every((value, index) => Object.is(value, cached!.args[index]))) {
        return cached.value;
      }
      const value = calculate(...args);
      cached = { args, value };
      return value;
    };
  };

  const itemsForScope = memo((
    snapshot: CashflowSnapshot,
    scopeFilter: CashflowViewOptions["scopeFilter"],
    productFilter: CashflowViewOptions["productFilter"],
    tipsterMode: boolean,
    asOf: Date,
  ) => computeCashflow(snapshot, { scopeFilter, productFilter, tipsterMode, asOf }));

  const groupStatements = memo((statements: CashflowCommissionStatementSummary[]) => {
    const map: StatementsByMonth = {};
    for (const statement of statements) {
      const key = statementMonthKey(statement);
      if (key) (map[key] ??= []).push(statement);
    }
    Object.values(map).forEach(items => items.sort((left, right) =>
      (left.statementDate ?? left.fileName).localeCompare(right.statementDate ?? right.fileName, "cs")));
    return map;
  });

  // Dependencies mirror the original page useMemo chain. In particular,
  // typing a query, toggling history or prediction reuses generated items.
  const beforeReconciliation = memo((items: CashflowItem[], searching: boolean, showPastYears: boolean, statementTotals: boolean, asOf: Date) =>
    statementTotals || searching ? items : filterPastItems(items, showPastYears, asOf));
  const searchItems = memo((items: CashflowItem[], query: string) => filterItemsByContractNumber(items, query));
  const searchStats = memo((searching: boolean, items: CashflowItem[]): CashflowContractSearchStats => {
    if (!searching) return { itemCount: 0, contractCount: 0, summary: null };
    const contracts = new Map<string, CashflowItem>();
    items.forEach(item => {
      const number = normalizeContractNumberSearch(item.contractNumber);
      if (number && !contracts.has(number)) contracts.set(number, item);
    });
    const summary = contracts.size === 1 ? Array.from(contracts.values())[0] : null;
    return {
      itemCount: items.length,
      contractCount: contracts.size,
      summary: summary ? {
        productKey: summary.productKey,
        clientName: summary.clientName ?? null,
        inputAmount: summary.inputAmount ?? null,
        frequency: summary.frequency ?? null,
        contractStatus: summary.contractStatus ?? null,
      } : null,
    };
  });
  const periodStatements = memo((searching: boolean, showPastYears: boolean, statements: StatementsByMonth, asOf: Date) =>
    searching ? statements : filterPastStatementMonths(statements, showPastYears, asOf));
  const reconcile = memo((items: CashflowItem[], statements: StatementsByMonth, enabled: boolean) =>
    applyStatementMissingPayoutShifts({ cashflowItems: items, statementsByMonthKey: statements, enabled }));
  const predict = memo((items: CashflowItem[], enabled: boolean, tipsterMode: boolean, asOf: Date) =>
    applyIntelligentCashflowPrediction({ cashflowItems: items, enabled: enabled && !tipsterMode, today: asOf }));
  const periodItems = memo((searching: boolean, items: CashflowItem[], showPastYears: boolean, asOf: Date) =>
    searching ? items : filterPastItems(items, showPastYears, asOf));
  const groupItems = memo((items: CashflowItem[]) => groupItemsByMonth(items));
  const statementTotals = memo((months: MonthGroup[], statements: StatementsByMonth, enabled: boolean) =>
    applyStatementPayoutTotalsToMonths({ monthGroups: months, statementsByMonthKey: statements, enabled }));
  const overview = memo((months: MonthGroup[], contractSearchStats: CashflowContractSearchStats): CashflowOverview => ({
    months: months.map(({ items, ...month }) => ({ ...month, itemCountLabel: formatCashflowItemCount(items) })),
    contractSearchStats,
  }));

  return {
    view(options) {
      if (!dataset) throw new Error("Cashflow model has been disposed");
      // A failed request must never leave the previous view available as current.
      currentMonths = null;
      const { snapshot, statements, asOf } = dataset;
      const { scopeFilter, productFilter, tipsterMode, showPastYears, intelligentPredictionEnabled, contractNumberQuery } = options;
      const searching = normalizeContractNumberSearch(contractNumberQuery).length > 0;
      const useStatementTotals = !tipsterMode && !searching && scopeFilter === "combined" && productFilter === "all";
      const items = itemsForScope(snapshot, scopeFilter, productFilter, tipsterMode, asOf);
      const byMonth = groupStatements(statements);
      const beforeSearch = beforeReconciliation(items, searching, showPastYears, useStatementTotals, asOf);
      const filtered = searchItems(beforeSearch, contractNumberQuery);
      const stats = searchStats(searching, filtered);
      const includedStatements = periodStatements(searching, showPastYears, byMonth, asOf);
      const reconciled = reconcile(filtered, byMonth, useStatementTotals);
      const predicted = predict(reconciled, intelligentPredictionEnabled, tipsterMode, asOf);
      const includedItems = periodItems(searching, predicted, showPastYears, asOf);
      const months = statementTotals(groupItems(includedItems), includedStatements, useStatementTotals);
      const result = overview(months, stats);
      currentMonths = months;
      return result;
    },
    month(key) {
      return currentMonths?.find(month => month.key === key) ?? null;
    },
    dispose() {
      dataset = null;
      currentMonths = null;
      clearCaches.forEach(clear => clear());
    },
  };
}
