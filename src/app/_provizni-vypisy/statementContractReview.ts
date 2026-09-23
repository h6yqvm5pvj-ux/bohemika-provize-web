import { ANNUAL_PREMIUM_TOLERANCE } from "./statementParsing";
import type { CommissionAmountComparison } from "./statementTypes";

export function statementContractIsVerified({
  matched,
  comparisons,
  baseComparisons = [],
  hasWarnings,
}: {
  matched: boolean;
  comparisons: Pick<CommissionAmountComparison, "status">[];
  baseComparisons?: { annualDifference: number }[];
  hasWarnings: boolean;
}): boolean {
  return matched && !hasWarnings && comparisons.length > 0 &&
    comparisons.every(comparison => comparison.status === "ok") &&
    baseComparisons.every(comparison =>
      Number.isFinite(comparison.annualDifference) &&
      Math.abs(comparison.annualDifference) <= ANNUAL_PREMIUM_TOLERANCE
    );
}
