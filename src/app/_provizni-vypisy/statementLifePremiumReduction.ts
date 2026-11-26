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
import { endorsementCommissionDay } from "@/app/lib/endorsementCommissionPlan";
import { isNeonRecurringStatementCode, matchesNeonRecurringStatementBase, matchingNeonRecurringStatementPremium, neonRecurringStatementPeriod } from "@/app/lib/neonRecurringStatementBase";

export type LifePremiumEndorsementReference = {
  change: LifePremiumChangeSummary;
  originalAnnualPremium: number;
  annualPremium: number;
  recurring: boolean;
};

/** A comparison-only projection; never changes the original contract or saved payouts. */
export function lifeSplitPremiumEndorsementReview(
  contract: LifeSplitContractPreview,
  systemContract: MatchedSystemContract | null,
  statementPeriod?: string | null
): { systemContract: MatchedSystemContract; reference: LifePremiumEndorsementReference } | null {
  if (!systemContract || systemContract.productKey !== "neon" ||
    resolveStatementProduct(contract.productCode).productKey !== "neon" ||
    systemContractIsEndorsement(systemContract) || systemContract.isRefresh ||
    systemContract.refreshCommissionBase || systemContract.requiresStatementRefresh ||
    contract.rows.length === 0) return null;

  const signedPremium = systemContract.neonCorrection ? systemContract.inputAmount : null;
  const originalAnnualPremium = signedPremium ? signedPremium * 12 : systemContractAnnualPremiumBase(systemContract);
  const start = parseLocalDate(systemContract.policyStartDate);
  const startDay = endorsementCommissionDay(start);
  const periodEnd = endorsementCommissionDay(parsePeriodEndDate(statementPeriod));
  if (!originalAnnualPremium || !start || !startDay || !periodEnd) return null;

  const endorsements = (systemContract.lifePremiumChanges ?? []).filter(change => change.entryType === "endorsement");
  const changes = endorsements.flatMap(change => {
    // Only an explicit effective date can establish which premium applied to a payout.
    const day = endorsementCommissionDay(change.policyStartDate);
    const annualPremium = Number(change.annualPremium);
    if (!day || !Number.isFinite(annualPremium) || annualPremium <= 0) return [];
    return [{ change, annualPremium, day }];
  }).sort((left, right) => right.day.localeCompare(left.day));
  if (changes.length !== endorsements.length) return null;

  const recurringPremiumAt = (cutoff: string) => {
    if (systemContract.neonCorrection) return null;
    const applicable = changes.filter(item => item.day >= startDay && item.day <= cutoff).reverse();
    let previous = originalAnnualPremium;
    let lastDay: string | null = null;
    let hadIncrease = false;
    for (const item of applicable) {
      if (item.day === lastDay || Math.abs(Number(item.change.previousAnnualPremium) - previous) > 0.12 ||
        !Number(item.change.previousAnnualPremium)) return null;
      hadIncrease ||= item.annualPremium > previous;
      previous = item.annualPremium;
      lastDay = item.day;
    }
    const latest = applicable.at(-1);
    return latest && hadIncrease ? { ...latest, recurring: true } : null;
  };

  const reductionAt = (cutoff: string) => {
    const applicable = changes.filter(item => item.day >= startDay && item.day <= cutoff);
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
    return { ...latest, recurring: false };
  };

  const references = contract.rows.map(row => {
    const kind = classifyLifeSplitCommissionCode(row.type).kind;
    if (kind === "b3601" || kind === "b4801") {
      const due = endorsementCommissionDay(addMonthsToLocalDate(start, kind === "b3601" ? 36 : 48));
      return due ? reductionAt(due < periodEnd ? due : periodEnd) : null;
    }
    if (!isNeonRecurringStatementCode(row.type) || row.commission <= 0) return null;
    const period = neonRecurringStatementPeriod(start, row.type, periodEnd);
    if (!period) return null;
    const amendedPremium = matchingNeonRecurringStatementPremium(period, row.base, recurringPremiumAt);
    if (amendedPremium) return amendedPremium;
    const latest = reductionAt(period.cutoff);
    return latest && matchesNeonRecurringStatementBase(row.base, latest.annualPremium)
      ? latest
      : reductionAt(period.due);
  });

  const reference = references[0];
  // A single comparison base cannot represent payouts under different endorsements.
  if (!reference || references.some(item => !item || item.change.id !== reference.change.id)) return null;
  const ratio = reference.annualPremium / originalAnnualPremium;
  const includesSubsequent = contract.rows.some(row => classifyLifeSplitCommissionCode(row.type).kind === "subsequent");
  const includesCare = contract.rows.some(row => classifyLifeSplitCommissionCode(row.type).kind === "care");
  return {
    reference: {
      change: reference.change, annualPremium: reference.annualPremium,
      originalAnnualPremium, recurring: reference.recurring,
    },
    systemContract: {
      ...systemContract,
      ...(systemContract.neonCorrection ? {
        inputAmount: reference.annualPremium / 12,
        calculationInputAmount: (systemContract.calculationInputAmount ?? 0) * ratio,
      } : { calculationInputAmount: reference.annualPremium / 12 }),
      // An older endorsement with the same base as the statement must not explain
      // a discrepancy against the endorsement that actually applies to this payout.
      lifePremiumChanges: [reference.change],
      items: systemContract.items?.map(item => {
        const title = normalizeCommissionTitle(item.title);
        const isDeferred = item.code === "B3601" || item.code === "B4801" ||
          (!title.includes("50") && (title.includes("b3601") || title.includes("b36") ||
            title.includes("b4801") || title.includes("b48") ||
            title.includes("po 3 letech") || title.includes("po 4 letech")));
        const isSubsequent = includesSubsequent && (/^B10[1-4](?:-B104)?$/.test(item.code ?? "") ||
          (title.includes("nasledna") && title.includes("2 5")));
        const isCare = includesCare && (/^B20[1-6](?:-B206)?$/.test(item.code ?? "") ||
          title.includes("pecovatelska") || (title.includes("nasledna") && title.includes("5 10")));
        // Keep the original position, coefficients and commission mode. The endorsement's
        // negative adjustment is not the expected amount of the original deferred payout.
        return (!reference.recurring && isDeferred) || isSubsequent || isCare
          ? { ...item, amount: Math.round(item.amount * ratio * 100) / 100 } : item;
      }),
    },
  };
}
