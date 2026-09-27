import { computeCashflow } from "@/app/cashflow/computeCashflow";
import type { CashflowDataset } from "@/app/cashflow/cashflowWorker.types";
import type { CashflowCommissionStatementSummary } from "@/app/cashflow/types";
import { applyStatementMissingPayoutShifts, applyStatementPayoutTotalsToMonths, calculateNetCashflow,
  calculateStornoFund, groupItemsByMonth, statementMonthKey } from "@/app/cashflow/helpers";

export type ExpectedPayout = { grossAmount: number; stornoFundAmount: number; netAmount: number };

/** Exactly the home's existing calculation, evaluated once after both sources
 * arrive. History remains necessary for older instalments and statement shifts. */
export function computeExpectedPayout({ snapshot, statements, asOf }: CashflowDataset): ExpectedPayout {
  const cashflowItems = computeCashflow(snapshot, { scopeFilter: "combined", productFilter: "all", asOf });
  const statementsByMonthKey: Record<string, CashflowCommissionStatementSummary[]> = {};
  for (const statement of statements) {
    const key = statementMonthKey(statement);
    if (key) (statementsByMonthKey[key] ??= []).push(statement);
  }
  const reconciled = applyStatementMissingPayoutShifts({ cashflowItems, statementsByMonthKey, enabled: true });
  const months = applyStatementPayoutTotalsToMonths({ monthGroups: groupItemsByMonth(reconciled), statementsByMonthKey, enabled: true });
  const current = months.find(month => month.key === `${asOf.getFullYear()}-${asOf.getMonth() + 1}`);
  if (!current) return { grossAmount: 0, stornoFundAmount: 0, netAmount: 0 };
  const grossAmount = current.total;
  const stornoFundAmount = current.totalSource === "paid" ? 0 : calculateStornoFund(current.items);
  return { grossAmount, stornoFundAmount, netAmount: current.totalSource === "paid" ? grossAmount : calculateNetCashflow(grossAmount, stornoFundAmount) };
}
