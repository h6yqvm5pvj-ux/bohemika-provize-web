import { autoAnnualPremiumAtDate, autoFrequencyCommissionPeriods, cppKomplexRenewalCommissionMultiplier, hasDatedCommissionSchedule, paymentFrequencyAtDate, type PaymentFrequencyChange } from "./autoPaymentFrequency";
import type { PaymentFrequency, Product } from "@/app/types/domain";
import { endorsementCommissionDay } from "./endorsementCommissionPlan";
import { baseCommissionCodeForPayoutComparison } from "./commissionPayoutRules";
import { isAutoProduct, isFrequencyAutoPayoutProduct, isLifeProduct } from "./productCatalog";
import { isAnnualSeparatedPeriodProduct, isPerPaymentSeparatedPeriodProduct } from "./separatedPeriodCommissions";
import { installmentCommissionScheduleFromCode } from "./productFormulas/autoCommission";
import { MAX_CIZIN_KOMPLEX_IMMEDIATE_CODE } from "./productFormulas/maxcizinkomplex";
import { periodsPerYear } from "./productFormulas/shared";

/** Policy anniversaries retain their day, clamped for February and shorter months. */
export function commissionPeriodAfterMonths(policyStartDate: unknown, months: number): string | null {
  const start = endorsementCommissionDay(policyStartDate);
  if (!start || !Number.isSafeInteger(months) || months < 0 || months > 12_000) return null;
  const [year, month, day] = start.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return endorsementCommissionDay(target.toISOString().slice(0, 10));
}

/**
 * Resolve an unambiguous entitlement period from a contractual commission code.
 * Statement/payout dates never substitute for the period being commissioned.
 */
export function commissionPeriodForCode(entry: {
  productKey?: Product | null;
  frequencyRaw?: PaymentFrequency | string | null;
  policyStartDate?: unknown;
  paymentFrequencyChanges?: PaymentFrequencyChange[] | null;
}, value: unknown): string | null {
  const code = baseCommissionCodeForPayoutComparison(value, entry.productKey);
  const product = entry.productKey;
  const at = (months: number) => commissionPeriodAfterMonths(entry.policyStartDate, months);
  if (!product || !code || code.includes("-")) return null;
  if (entry.paymentFrequencyChanges?.length && hasDatedCommissionSchedule(product)) {
    const horizon = commissionPeriodAfterMonths(entry.policyStartDate, 1200);
    const shortCode = code.match(/^(A|AC|B|BC)([1-9]\d?)$/);
    const target = shortCode ? `${shortCode[1][0]}${100 + Number(shortCode[2])}` : code;
    return horizon ? autoFrequencyCommissionPeriods(entry, horizon).find(period => period.code === target)?.period ?? null : null;
  }
  if (isLifeProduct(product)) {
    if (["A101", "B0301", "B36_HALF", "B036_HALF", "B3601_HALF"].includes(code)) return at(0);
    if (["B36", "B036", "B3601"].includes(code)) return at(36);
    if (["B48", "B048", "B4801"].includes(code)) return at(48);
    const subsequent = code.match(/^B([12])(\d{2})$/);
    if (!subsequent) return null;
    const index = Number(subsequent[2]);
    if (index < 1) return null;
    if (product === "neon") {
      if (subsequent[1] === "1" && index <= 4) return at(index * 12);
      if (subsequent[1] === "2" && index <= 6) return at((index + 3) * 12);
      return null;
    }
    if (product === "flexi") return at((index + 5) * 12);
    if (product === "maximaMaxEfekt" && subsequent[1] === "1") return at((index + 4) * 12);
    return null;
  }

  // UNIQA's existing cashflow plan pays these rows annually even when the
  // premium is collected more often. Retain that schedule during repricing.
  const annualAutoSchedule = product === "uniqaAuto" || product === "uniqaflotila";
  const perPayment = !annualAutoSchedule &&
    (isFrequencyAutoPayoutProduct(product) || isPerPaymentSeparatedPeriodProduct(product));
  if (isAutoProduct(product) || isAnnualSeparatedPeriodProduct(product) || perPayment) {
    if (perPayment && !["monthly", "quarterly", "semiannual", "annual"].includes(entry.frequencyRaw ?? "")) return null;
    const schedule = installmentCommissionScheduleFromCode(code, perPayment ? entry.frequencyRaw : "annual");
    if (!schedule) return null;
    if (schedule.phase === "initial" && schedule.paymentIndex > schedule.paymentsPerYear) return null;
    return at((schedule.phase === "subsequent" ? 12 : 0) +
      (schedule.paymentIndex - 1) * (12 / schedule.paymentsPerYear));
  }
  if (product === "maxcizinkomplex" && code === MAX_CIZIN_KOMPLEX_IMMEDIATE_CODE) return at(0);
  return code === "A101" && ["cppcestovko", "axacestovko", "koopcestovko", "maxcizinkomplex"].includes(product)
    ? at(0) : null;
}

/** The original contract owns the renewal. Its dated change supplies the terms. */
export function cppKomplexRenewalTerms(entry: Parameters<typeof autoAnnualPremiumAtDate>[0], value: unknown) {
  if (entry.productKey !== "cppPPRs" || !entry.paymentFrequencyChanges?.length) return null;
  const code = baseCommissionCodeForPayoutComparison(value, entry.productKey).replace(/^BC/, "B");
  if (!/^B\d+$/.test(code)) return null;
  const period = commissionPeriodForCode(entry, code);
  if (!period) return null;
  const frequency = paymentFrequencyAtDate(entry, period);
  const annualPremium = autoAnnualPremiumAtDate(entry, period);
  if (!frequency || annualPremium == null) return null;
  const change = entry.paymentFrequencyChanges.findLast(item => item.effectiveDate <= period);
  return { period, frequency, annualPremium, paymentPremium: annualPremium / periodsPerYear(frequency),
    multiplier: cppKomplexRenewalCommissionMultiplier(entry, period), change };
}
