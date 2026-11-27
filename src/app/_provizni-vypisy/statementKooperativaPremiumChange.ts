import { autoAnnualPremiumAtDate } from "@/app/lib/autoPaymentFrequency";
import { baseCommissionCodeForPayoutComparison } from "@/app/lib/commissionPayoutRules";
import { kooperativaAutoRenewalPremium } from "@/app/lib/kooperativaAutoRenewalPremium";
import { createCommissionCodeProjection } from "@/app/lib/commissionPayoutCodeAdjustment";
import { isKooperativaAutoRenewalStatementRow, parseLocalDate, parsePeriodEndDate } from "./statementParsing";
import { statementCareerPositionFromValue, systemContractPosition } from "./statementSystemContracts";
import type { MatchedSystemContract, OtherProductContractPreview } from "./statementTypes";

const positive = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

export function statementKooperativaPremiumChange(
  contract: OtherProductContractPreview,
  systemContract: MatchedSystemContract | null,
  statementPeriod?: string | null,
) {
  if (systemContract?.productKey !== "kooperativaAuto") return null;
  const position = systemContractPosition(systemContract);
  if (!position) return null;
  const renewalRows = contract.rows.filter(isKooperativaAutoRenewalStatementRow);
  const codeCounts = new Map<string, number>();
  const receipt = (row: typeof renewalRows[number]) => ({ code: row.type, amount: row.commission, statementPeriod, writtenBy: systemContract.adviserEmail });
  const project = createCommissionCodeProjection(systemContract, [...(systemContract.commissionPayouts ?? []), ...renewalRows.map(receipt)]);
  const payoutCode = (row: typeof renewalRows[number]) => baseCommissionCodeForPayoutComparison(project(receipt(row)).code, systemContract.productKey);
  for (const row of renewalRows) {
    const code = payoutCode(row);
    codeCounts.set(code, (codeCounts.get(code) ?? 0) + 1);
  }
  const statementEnd = parsePeriodEndDate(statementPeriod);
  const renewals = renewalRows.flatMap(row => {
    const code = payoutCode(row);
    if (codeCounts.get(code) !== 1) return [];
    const career = statementCareerPositionFromValue(row.career);
    if (career && career.position !== position) return [];
    const premium = kooperativaAutoRenewalPremium(systemContract, { commissionCode: code, commission: row.commission }, position);
    const date = premium && parseLocalDate(premium.anniversaryDate);
    return premium && date && (!statementEnd || date <= statementEnd) ? [premium] : [];
  }).sort((a, b) => b.anniversaryDate.localeCompare(a.anniversaryDate));
  const selected = renewals[0];
  if (!selected) return null;

  const history = (systemContract.premiumStatementHistory ?? []).filter(entry =>
    entry.source !== "manager" && (entry.premiumKind === "auto_initial" || entry.premiumKind === "auto_change") &&
    entry.anniversaryDate && entry.anniversaryDate <= selected.anniversaryDate);
  const savedChange = history.find(entry => entry.anniversaryDate === selected.anniversaryDate &&
    positive(entry.previousAnnualPremium) && positive(entry.newAnnualPremium) &&
    Math.abs(entry.newAnnualPremium - selected.annualPremium) <= 0.01);
  const priorHistory = history.filter(entry => entry.anniversaryDate! < selected.anniversaryDate && positive(entry.newAnnualPremium))
    .sort((a, b) => b.anniversaryDate!.localeCompare(a.anniversaryDate!))[0];
  const previousStatement = renewals[1];
  const previousAnnualPremium = savedChange?.previousAnnualPremium ??
    (previousStatement && (!priorHistory || previousStatement.anniversaryDate >= priorHistory.anniversaryDate!)
      ? previousStatement.annualPremium : priorHistory?.newAnnualPremium) ??
    autoAnnualPremiumAtDate(systemContract, selected.anniversaryDate);
  if (!positive(previousAnnualPremium)) return null;

  return { ...selected, previousAnnualPremium };
}
