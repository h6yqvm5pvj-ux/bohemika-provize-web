import type { CommissionResultItemDTO, Position } from "@/app/types/domain";
import { autoAnnualPremiumAtDate, normalizePaymentFrequencyChanges, paymentFrequencyAtDate, type PaymentFrequencyContract } from "./autoPaymentFrequency";
import { baseCommissionCodeForPayoutComparison } from "./commissionPayoutRules";
import { commissionPeriodAfterMonths, commissionPeriodForCode } from "./commissionPeriodForCode";
import { endorsementCommissionDay } from "./endorsementCommissionPlan";
import { isAnnualAutoPayoutProduct, isAutoProduct } from "./productCatalog";
import { autoSubsequentCoefficientForProduct, installmentCommissionScheduleFromCode, installmentPaymentsPerYear } from "./productFormulas/autoCommission";
import { defaultCoefficientSetForProduct, normalizeCommissionCoefficientSet, signedDateForCoefficientSetOverride } from "./productFormulas/coefficientSets";
import { semiannualAutoInstallmentCoverage, type AutoCommissionReceipt } from "./autoSubsequentInstallmentCoverage";

export const AUTO_COMMISSION_FORECAST_VARIATION = 0.08;
type Contract = PaymentFrequencyContract & {
  inputAmount?: number | null;
  signedAnnualPremiumOverride?: number | null;
  entryType?: string | null;
  policyEndDate?: unknown;
  items?: CommissionResultItemDTO[] | null;
  originalPosition?: Position | null;
  position?: Position | null;
  contractSignedDate?: unknown;
  commissionCoefficientSetOverride?: unknown;
  source?: "own" | "manager";
};
const money = (amount: number) => Math.round(amount * 100) / 100;

export type AutoCommissionForecast = {
  amount: number;
  minimum: number;
  maximum: number;
  basisAmount: number;
  basisPeriod: string | null;
} & (
  | { basis: "initial" | "receipt"; isConfirmedPolicyYear: boolean }
  | { basis: "premiumChange"; isConfirmedPolicyYear: false; position: Position }
);

export function autoCommissionPolicyYear(contract: PaymentFrequencyContract, period: string): number | null {
  const start = endorsementCommissionDay(contract.policyStartDate);
  if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(period) || period < start) return null;
  const elapsedYears = Number(period.slice(0, 4)) - Number(start.slice(0, 4));
  const anniversary = commissionPeriodAfterMonths(start, elapsedYears * 12);
  return anniversary ? elapsedYears + 1 - Number(period < anniversary) : null;
}

function commissionPayments(contract: PaymentFrequencyContract, period: string): number {
  if (isAnnualAutoPayoutProduct(contract.productKey) || ["uniqaAuto", "uniqaflotila"].includes(contract.productKey ?? "")) return 1;
  return installmentPaymentsPerYear(paymentFrequencyAtDate(contract, period));
}

/** A read projection over receipts already scoped to one contract and recipient. */
export function createAutoCommissionForecast(contract: Contract, receipts: readonly AutoCommissionReceipt[], initialAmount?: number) {
  const start = endorsementCommissionDay(contract.policyStartDate);
  const coverage = semiannualAutoInstallmentCoverage(contract, receipts, initialAmount);
  const combinedCode = baseCommissionCodeForPayoutComparison(coverage.combined?.code, contract.productKey);
  const grouped = new Map<string, { code: string; period: string | null; index: number; cents: number }>();
  if (isAutoProduct(contract.productKey)) for (const receipt of receipts) {
    const code = baseCommissionCodeForPayoutComparison(receipt.code, contract.productKey);
    const schedule = installmentCommissionScheduleFromCode(code, "annual");
    const amount = receipt.amount;
    if (!schedule || schedule.phase !== "subsequent" || typeof amount !== "number" || !Number.isFinite(amount)) continue;
    const group = grouped.get(code) ?? { code, period: commissionPeriodForCode(contract, code), index: schedule.paymentIndex, cents: 0 };
    // Corrections belong to the commissioned period, not their later statement date.
    group.cents += Math.round((receipt.status === "storno" ? -Math.abs(amount) : amount) * 100);
    grouped.set(code, group);
  }
  const paid = [...grouped.values()].filter(group => group.cents > 0).sort((a, b) => a.index - b.index);
  const latest = paid.at(-1);
  const latestYear = latest?.period ? autoCommissionPolicyYear(contract, latest.period) : null;
  const knownYear = latestYear ?? (latest ? Math.floor((latest.index - 1) / commissionPayments(contract, start ?? "1900-01-01")) + 2 : 1);
  const acquisition = contract.items?.find(item => /^A(?:C)?(?:101|1)$/.test(String(item.code ?? "").trim().toUpperCase()) && Number.isFinite(item.amount) && item.amount > 0);
  const premiumChanges = normalizePaymentFrequencyChanges(contract.paymentFrequencyChanges).flatMap(change =>
    change.annualPremium == null ? [] : [{ effectiveDate: change.effectiveDate, annualPremium: change.annualPremium }]);
  const position = contract.originalPosition ?? contract.position;
  let contractualRate: number | null = null;
  if (premiumChanges.length && position && contract.source !== "manager" && contract.entryType !== "endorsement") {
    const coefficientDate = signedDateForCoefficientSetOverride({
      product: contract.productKey,
      contractSignedDateIso: endorsementCommissionDay(contract.contractSignedDate),
      coefficientSetOverride: normalizeCommissionCoefficientSet(contract.commissionCoefficientSetOverride),
    });
    // ČPP Auto uses the same rate table across signing dates.
    if (coefficientDate || contract.productKey === "cppAuto" || defaultCoefficientSetForProduct(contract.productKey, null) === null) {
      const rate = autoSubsequentCoefficientForProduct(contract.productKey, position, coefficientDate);
      if (rate != null && Number.isFinite(rate)) contractualRate = rate;
    }
  }
  const premiumChangeAt = (period: string) =>
    premiumChanges.findLast(change => change.effectiveDate <= period);
  const base = premiumChanges.length ? initialAmount ?? acquisition?.amount : acquisition?.amount ?? initialAmount;
  const initialAnnual = typeof base === "number" && Number.isFinite(base) && base > 0
    ? money(base) * commissionPayments(contract, start ?? "1900-01-01") : null;

  return {
    coverage,
    knownPolicyYear: knownYear,
    inForecastYear(period: string): boolean {
      const year = autoCommissionPolicyYear(contract, period);
      if (year === null || year < Math.max(2, knownYear)) return false;
      if (year <= knownYear + 1) return true;
      const premiumChange = premiumChangeAt(period);
      return contractualRate != null && premiumChange != null &&
        year === autoCommissionPolicyYear(contract, premiumChange.effectiveDate);
    },
    forPeriod(code: string, period: string): AutoCommissionForecast | null {
      const normalized = baseCommissionCodeForPayoutComparison(code, contract.productKey);
      const schedule = installmentCommissionScheduleFromCode(normalized, "annual");
      if (!schedule || schedule.phase !== "subsequent") return null;
      const premiumChange = premiumChangeAt(period);
      if (premiumChange && position && contractualRate != null) {
        const amount = money(premiumChange.annualPremium * contractualRate / commissionPayments(contract, period));
        return {
          amount, minimum: amount, maximum: amount,
          basisAmount: premiumChange.annualPremium, basisPeriod: premiumChange.effectiveDate,
          basis: "premiumChange", isConfirmedPolicyYear: false, position,
        };
      }
      const previous = paid.findLast(group => group.index < schedule.paymentIndex);
      const previousAmount = previous ? money(previous.cents / (previous.code === combinedCode ? 200 : 100)) : null;
      const annualBase = previous && previousAmount != null
        ? money(previousAmount * commissionPayments(contract, previous.period ?? start ?? period))
        : initialAnnual;
      if (annualBase == null) return null;
      const basisPeriod = previous?.period ?? start;
      const basisPremium = basisPeriod ? autoAnnualPremiumAtDate(contract, basisPeriod) : null;
      const targetPremium = autoAnnualPremiumAtDate(contract, period);
      const premiumRatio = basisPremium && targetPremium ? targetPremium / basisPremium : 1;
      const amount = money(annualBase * premiumRatio / commissionPayments(contract, period));
      const policyYear = autoCommissionPolicyYear(contract, period);
      const isConfirmedPolicyYear = policyYear != null && previous?.period != null &&
        autoCommissionPolicyYear(contract, previous.period) === policyYear;
      const variation = isConfirmedPolicyYear ? 0 : AUTO_COMMISSION_FORECAST_VARIATION;
      return {
        amount, minimum: money(amount * (1 - variation)), maximum: money(amount * (1 + variation)),
        basisAmount: previousAmount ?? money(base!), basisPeriod: previous?.period ?? start,
        basis: previous ? "receipt" : "initial", isConfirmedPolicyYear,
      };
    },
  };
}
