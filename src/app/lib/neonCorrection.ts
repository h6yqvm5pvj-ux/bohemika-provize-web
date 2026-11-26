import { endorsementCommissionDay } from "./endorsementCommissionPlan";

export type NeonCorrection = {
  annualAmount: number;
};

const NEON_FULL_PREMIUM_FROM_MONTH = "2022-01";

export function canSetNeonCorrection(contract: {
  productKey?: string | null;
  entryType?: string | null;
  parentContractEntryId?: string | null;
  contractSignedDate?: unknown;
  isRefresh?: boolean | null;
  refreshCommissionBase?: unknown;
  requiresStatementRefresh?: boolean | null;
} | null | undefined): boolean {
  if (!contract || contract.productKey !== "neon" || contract.isRefresh || contract.refreshCommissionBase ||
      contract.requiresStatementRefresh || contract.parentContractEntryId || (contract.entryType != null && contract.entryType !== "contract")) return false;
  const signed = endorsementCommissionDay(contract.contractSignedDate);
  return signed != null && signed.slice(0, 7) < NEON_FULL_PREMIUM_FROM_MONTH;
}

const MAX_ANNUAL_PREMIUM_CENTS = 100_000_000_000;
export const NEON_FULL_PREMIUM_ANNUAL_TOLERANCE = 20;

export function neonCorrectedAnnualBase(monthlyPremium: unknown, annualCorrection: unknown): number | null {
  if (typeof monthlyPremium !== "number" || typeof annualCorrection !== "number") return null;
  const monthlyCents = Math.round(monthlyPremium * 100);
  const correctionCents = Math.round(annualCorrection * 100);
  const annualCents = monthlyCents * 12;
  if (!Number.isSafeInteger(annualCents) || !Number.isSafeInteger(correctionCents) ||
      monthlyPremium !== monthlyCents / 100 || annualCorrection !== correctionCents / 100 ||
      correctionCents <= 0 || annualCents <= correctionCents || annualCents > MAX_ANNUAL_PREMIUM_CENTS) return null;
  return (annualCents - correctionCents) / 100;
}

type NeonCorrectionContract = {
  productKey?: string | null;
  inputAmount?: number | null;
  neonCorrection?: NeonCorrection | null;
  calculationInputAmount?: number | null;
};

const isNeonCorrectionMonth = (value: unknown): value is string =>
  typeof value === "string" && /^(?:19|20|21)\d{2}-(?:0[1-9]|1[0-2])$/.test(value);

/** Cashflow dates are payment dates. A planned payment refers to the preceding statement month. */
export function neonExpectedStatementMonth(payoutDate: Date): string {
  const month = payoutDate.getMonth();
  return `${payoutDate.getFullYear() - (month === 0 ? 1 : 0)}-${String(month || 12).padStart(2, "0")}`;
}

export function neonFullPremiumMonthlyBase(contract: NeonCorrectionContract | null | undefined, period: unknown): number | undefined {
  if (contract?.productKey !== "neon" || !contract.neonCorrection) return undefined;
  const czechEnd = typeof period === "string" ? period.match(/(?:^|\D)(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\s*$/) : null;
  const day = czechEnd ? `${czechEnd[3]}-${czechEnd[2].padStart(2, "0")}-${czechEnd[1].padStart(2, "0")}` : period;
  const month = isNeonCorrectionMonth(day) ? day : endorsementCommissionDay(day)?.slice(0, 7);
  const monthly = contract.inputAmount;
  return month && month >= NEON_FULL_PREMIUM_FROM_MONTH && typeof monthly === "number" && Number.isFinite(monthly) && monthly > 0
    ? monthly : undefined;
}

export function neonCorrectionPayoutAmount(contract: NeonCorrectionContract, amount: number, period: unknown): number {
  const full = neonFullPremiumMonthlyBase(contract, period);
  const reduced = contract.calculationInputAmount;
  return full != null && typeof reduced === "number" && Number.isFinite(reduced) && reduced > 0
    ? Math.round(amount * full / reduced * 100) / 100 : amount;
}
