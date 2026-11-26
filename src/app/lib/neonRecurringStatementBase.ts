import { commissionPeriodAfterMonths, commissionPeriodForCode } from "./commissionPeriodForCode";
import { baseCommissionCodeForPayoutComparison } from "./commissionPayoutRules";
import { endorsementCommissionDay } from "./endorsementCommissionPlan";

export const isNeonRecurringStatementCode = (code: unknown): boolean =>
  /^B(?:10[1-4]|20[1-6])$/.test(baseCommissionCodeForPayoutComparison(code));

export const matchesNeonRecurringStatementBase = (statementAnnual: unknown, reducedAnnual: number): boolean =>
  typeof statementAnnual === "number" && statementAnnual > 0 && reducedAnnual > 0 &&
  Math.abs(statementAnnual - reducedAnnual) <= 12;

/** A recurring B payout can use a verified amendment during its insurance year.
 * The statement cannot prove a change later than the report or the next anniversary. */
export function neonRecurringStatementPeriod(policyStart: unknown, code: unknown, statementEnd: unknown) {
  if (!isNeonRecurringStatementCode(code)) return null;
  const start = endorsementCommissionDay(policyStart);
  const reportEnd = endorsementCommissionDay(statementEnd);
  if (!start || !reportEnd) return null;
  const due = commissionPeriodForCode({ productKey: "neon", policyStartDate: start }, code);
  if (!due || reportEnd < due) return null;
  const yearsToNextAnniversary = Number(due.slice(0, 4)) - Number(start.slice(0, 4)) + 1;
  const nextAnniversary = commissionPeriodAfterMonths(start, yearsToNextAnniversary * 12);
  if (!nextAnniversary) return null;
  const end = new Date(`${nextAnniversary}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  const yearEnd = end.toISOString().slice(0, 10);
  return { due, cutoff: reportEnd < yearEnd ? reportEnd : yearEnd };
}

export function matchingNeonRecurringStatementPremium<T extends { annualPremium: number }>(
  period: NonNullable<ReturnType<typeof neonRecurringStatementPeriod>>,
  statementAnnual: unknown,
  premiumAt: (day: string) => T | null,
): T | null {
  for (const day of new Set([period.cutoff, period.due])) {
    const premium = premiumAt(day);
    if (premium && matchesNeonRecurringStatementBase(statementAnnual, premium.annualPremium)) return premium;
  }
  return null;
}
