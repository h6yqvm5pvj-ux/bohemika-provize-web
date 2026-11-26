import { ANNUAL_PREMIUM_TOLERANCE } from "./statementParsing";
import type { CommissionAmountComparison } from "./statementTypes";
import { isHigherStatementCommission } from "./statementCommissionComparisons";

export function statementPremiumBaseWithinTolerance(comparison: { annualDifference: number; annualTolerance?: number }): boolean {
  return Number.isFinite(comparison.annualDifference) &&
    Math.abs(comparison.annualDifference) <= (comparison.annualTolerance ?? ANNUAL_PREMIUM_TOLERANCE);
}

export type StatementReviewStatus = "commission-error" | "issues" | "increase" | "decrease" | "higher" | "ok" | "commission-ok" | "corrected" | "review" | "unpaired";
export type StatementContractReview = {
  status: StatementReviewStatus;
  verified: boolean;
  premiumChange?: "increase" | "decrease";
  hasCommissionError: boolean;
  hasHigherCommission: boolean;
  summary: { label: string; tone: "ok" | "warn" | "info" | "error"; trend?: "increase" | "decrease" };
};

export function statementContractReview({ unpaired, issueCount, premiumChange, corrected = false, baseMismatchIsInformational = false, ...checks }: Omit<Parameters<typeof statementContractIsVerified>[0], "comparisons"> & {
  comparisons: (Pick<CommissionAmountComparison, "status"> & Partial<Pick<CommissionAmountComparison, "expectedAmount" | "statementAmount" | "acceptHigherCommission">>)[];
  unpaired: boolean;
  issueCount: number;
  premiumChange?: "increase" | "decrease";
  corrected?: boolean;
  baseMismatchIsInformational?: boolean;
}): StatementContractReview {
  const hasCommissionError = checks.comparisons.some(item => item.status !== "ok" && !isHigherStatementCommission(item));
  const hasHigherCommission = checks.comparisons.some(isHigherStatementCommission);
  const canVerify = !unpaired && !corrected && issueCount === 0 && !premiumChange;
  const verified = canVerify && statementContractIsVerified(checks);
  const commissionVerified = canVerify && !verified && baseMismatchIsInformational &&
    checks.baseComparisons?.some(base => Number.isFinite(base.annualDifference) && !statementPremiumBaseWithinTolerance(base)) &&
    statementContractIsVerified({ ...checks, baseComparisons: [] });
  const status: StatementReviewStatus = unpaired ? "unpaired" : hasCommissionError ? "commission-error" :
    issueCount > 0 ? "issues" : corrected ? "corrected" : premiumChange ??
      (hasHigherCommission && !checks.hasWarnings ? "higher" : verified ? "ok" : commissionVerified ? "commission-ok" : "review");
  const summaries: Record<StatementReviewStatus, StatementContractReview["summary"]> = {
    "commission-error": { label: "Špatná provize", tone: "error" },
    issues: { label: "K prověření", tone: "warn" },
    increase: { label: "Pojistné navýšeno", tone: "ok", trend: "increase" },
    decrease: { label: "Pojistné poníženo", tone: "warn", trend: "decrease" },
    higher: { label: "Vyšší provize", tone: "ok", trend: "increase" },
    ok: { label: "Vše sedí", tone: "ok" },
    "commission-ok": { label: "Provize sedí", tone: "ok" },
    corrected: { label: "Opraveno navazujícím výpisem", tone: "ok" },
    review: { label: "Detail kontroly", tone: "info" },
    unpaired: { label: "Bez propojení", tone: "info" },
  };
  return { status, verified, premiumChange, hasCommissionError, hasHigherCommission, summary: summaries[status] };
}

export function statementContractIsVerified({
  matched,
  comparisons,
  baseComparisons = [],
  hasWarnings,
}: {
  matched: boolean;
  comparisons: Pick<CommissionAmountComparison, "status">[];
  baseComparisons?: Parameters<typeof statementPremiumBaseWithinTolerance>[0][];
  hasWarnings: boolean;
}): boolean {
  return matched && !hasWarnings && comparisons.length > 0 &&
    comparisons.every(comparison => comparison.status === "ok") &&
    baseComparisons.every(statementPremiumBaseWithinTolerance);
}
