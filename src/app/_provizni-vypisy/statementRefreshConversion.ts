import { statementDiscrepancyKey } from "./statementDiscrepancies";
import { isNeonRefreshStatementProductCode, neonRefreshRiskAnnualPremiumBase } from "@/app/lib/commissionPayoutRules";
import type { CommissionRow, ManualNeonRefreshConversionTarget, StatementFileRead } from "./statementTypes";

export const statementNeonRefreshRiskAnnualBase = (rows: readonly CommissionRow[]) =>
  neonRefreshRiskAnnualPremiumBase(rows
    .filter((row) => isNeonRefreshStatementProductCode(row.product))
    .map((row) => ({ commissionCode: row.type, baseAmount: row.base })));

export function buildNeonRefreshConversionRequest(
  target: ManualNeonRefreshConversionTarget,
  files: readonly StatementFileRead[]
) {
  const ownerEmail = target.contract.adviserEmail?.trim().toLowerCase();
  const entryId = target.contract.id?.trim();
  if (!ownerEmail || !entryId) {
    throw new Error("Spárovaná smlouva nemá dostatek údajů pro přepočet základny.");
  }
  const file = target.statementId ? null : files.find(
    (item) => statementDiscrepancyKey(item.statement) === target.statementKey
  );
  if (!target.statementId && !file?.html) {
    throw new Error("Zdrojový výpis není k dispozici. Načti jej prosím znovu.");
  }
  return {
    action: target.intent === "confirm-base"
      ? "confirm-neon-refresh-base"
      : "convert-neon-refresh-from-statement",
    ownerEmail,
    entryId,
    contractNumber: target.contractNumber,
    ...(target.statementId
      ? { statementId: target.statementId }
      : { html: file!.html, header: file!.statement.header }),
  };
}
