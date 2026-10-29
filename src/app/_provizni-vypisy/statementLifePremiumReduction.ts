import {
  ANNUAL_PREMIUM_TOLERANCE,
  addMonthsToLocalDate,
  classifyLifeSplitCommissionCode,
  normalizeCommissionTitle,
  parseLocalDate,
  parsePeriodEndDate,
  resolveStatementProduct,
} from "./statementParsing";
import { systemContractAnnualPremiumBase, systemContractIsEndorsement } from "./statementSystemContracts";
import type { LifePremiumChangeSummary, LifeSplitContractPreview, MatchedSystemContract } from "./statementTypes";

export type LifePremiumReductionReference = {
  change: LifePremiumChangeSummary;
  originalAnnualPremium: number;
  annualPremium: number;
};

/** A comparison-only projection; never changes the original contract or saved payouts. */
export function lifeSplitPremiumReductionReview(
  contract: LifeSplitContractPreview,
  systemContract: MatchedSystemContract | null,
  statementPeriod?: string | null
): { systemContract: MatchedSystemContract; reference: LifePremiumReductionReference } | null {
  if (!systemContract || systemContract.productKey !== "neon" ||
    resolveStatementProduct(contract.productCode).productKey !== "neon" ||
    systemContractIsEndorsement(systemContract) || systemContract.isRefresh ||
    systemContract.refreshCommissionBase || systemContract.requiresStatementRefresh ||
    contract.rows.length === 0) return null;

  const originalAnnualPremium = systemContractAnnualPremiumBase(systemContract);
  const start = parseLocalDate(systemContract.policyStartDate);
  const periodEnd = parsePeriodEndDate(statementPeriod);
  if (!originalAnnualPremium || !start || !periodEnd) return null;

  const endorsements = (systemContract.lifePremiumChanges ?? []).filter(change => change.entryType === "endorsement");
  const changes = endorsements.flatMap(change => {
    // Only an explicit effective date can establish which premium applied to a payout.
    const effectiveDate = parseLocalDate(change.policyStartDate);
    const annualPremium = Number(change.annualPremium);
    if (!effectiveDate ||
      !Number.isFinite(annualPremium) || annualPremium <= 0) return [];
    const day = new Date(effectiveDate.getFullYear(), effectiveDate.getMonth(), effectiveDate.getDate(), 12).getTime();
    return [{ change, annualPremium, day }];
  }).sort((left, right) => right.day - left.day);
  if (changes.length !== endorsements.length) return null;

  const references = contract.rows.map(row => {
    const kind = classifyLifeSplitCommissionCode(row.type).kind;
    if (kind !== "b3601" && kind !== "b4801") return null;
    const due = addMonthsToLocalDate(start, kind === "b3601" ? 36 : 48);
    const cutoff = Math.min(due.getTime(), periodEnd.getTime());
    const applicable = changes.filter(item => item.day >= start.getTime() && item.day <= cutoff);
    const latest = applicable[0];
    // Mixed increases and decreases need allocation between the original and its additions.
    if (applicable.some(item => !Number.isFinite(Number(item.change.previousAnnualPremium)) ||
      Number(item.change.previousAnnualPremium) < item.annualPremium - ANNUAL_PREMIUM_TOLERANCE)) return null;
    // Conflicting changes on the same day require manual review.
    if (!latest || applicable.some(item => item.day === latest.day &&
      Math.abs(item.annualPremium - latest.annualPremium) > ANNUAL_PREMIUM_TOLERANCE)) return null;
    const previousAnnualPremium = Number(latest.change.previousAnnualPremium);
    if (!Number.isFinite(previousAnnualPremium) || previousAnnualPremium <= 0 ||
      latest.annualPremium >= previousAnnualPremium - ANNUAL_PREMIUM_TOLERANCE ||
      latest.annualPremium >= originalAnnualPremium - ANNUAL_PREMIUM_TOLERANCE) return null;
    return latest;
  });

  const reference = references[0];
  // A single comparison base cannot represent payouts under different endorsements.
  if (!reference || references.some(item => !item || item.change.id !== reference.change.id)) return null;
  const ratio = reference.annualPremium / originalAnnualPremium;
  return {
    reference: { change: reference.change, annualPremium: reference.annualPremium, originalAnnualPremium },
    systemContract: {
      ...systemContract,
      calculationInputAmount: reference.annualPremium / 12,
      // An older endorsement with the same base as the statement must not explain
      // a discrepancy against the endorsement that actually applies to this payout.
      lifePremiumChanges: [reference.change],
      items: systemContract.items?.map(item => {
        const title = normalizeCommissionTitle(item.title);
        const isDeferred = item.code === "B3601" || item.code === "B4801" ||
          (!title.includes("50") && (title.includes("b3601") || title.includes("b36") ||
            title.includes("b4801") || title.includes("b48") ||
            title.includes("po 3 letech") || title.includes("po 4 letech")));
        // Keep the original position, coefficients and commission mode. The endorsement's
        // negative adjustment is not the expected amount of the original deferred payout.
        return isDeferred ? { ...item, amount: Math.round(item.amount * ratio * 100) / 100 } : item;
      }),
    },
  };
}
