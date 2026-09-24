import { isNeonStatementProductCode, neonRefreshRiskAnnualPremiumBase } from "@/app/lib/commissionPayoutRules";
import type { CommissionRow, MatchedSystemContract } from "./statementTypes";

export type RefreshBaseStatus = "confirmed" | "calculated" | "waiting";

const storedRiskAnnual = (contract: MatchedSystemContract): number | null => {
  const annual = Number(contract.refreshCommissionBase?.calculationAnnualPremium) || Number(contract.calculationInputAmount) * 12;
  return Number.isFinite(annual) && annual > 0 ? annual : null;
};

export function neonRefreshBaseStatus(contract: MatchedSystemContract | null): RefreshBaseStatus | null {
  if (contract?.productKey !== "neon" || contract.isRefresh !== true) return null;
  if (storedRiskAnnual(contract) == null) return "waiting";
  if (contract.commissionBaseSource === "commission_statement" ||
      contract.commissionCalculationStatus === "statement_resolved_refresh_base" ||
      contract.commissionCalculationStatus === "statement_resolved_refresh_missing_original") return "confirmed";
  if (contract.requiresStatementRefresh || contract.refreshOriginalMissingInSystem ||
      contract.commissionCalculationStatus === "provisional_refresh_missing_original") return "waiting";
  return contract.refreshOriginalContractNumber &&
    Number(contract.refreshCommissionBase?.calculationAnnualPremium) > 0 ? "calculated" : "waiting";
}

export function neonRefreshBaseReview(contract: MatchedSystemContract | null, rows: ReadonlyArray<CommissionRow>) {
  const status = neonRefreshBaseStatus(contract);
  if (!status || !contract) return null;
  return {
    status,
    label: status === "confirmed" ? "Riziková základna potvrzena" :
      status === "calculated" ? "Základna z původní smlouvy" : "Čeká na potvrzení základny",
    annual: storedRiskAnnual(contract),
    statementNumber: contract.refreshStatementResolvedStatementNumber ?? null,
    statementDate: contract.refreshStatementResolvedStatementDate ?? null,
    statementRiskAnnual: neonRefreshRiskAnnualPremiumBase(rows
      .filter(row => row.commission > 0 && isNeonStatementProductCode(row.product))
      .map(row => ({commissionCode: row.type, baseAmount: row.base}))),
  };
}

export type RefreshBaseReview = ReturnType<typeof neonRefreshBaseReview>;
