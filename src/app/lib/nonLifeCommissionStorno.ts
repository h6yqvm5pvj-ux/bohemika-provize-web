import { hasDatedCommissionSchedule, type PaymentFrequencyContract } from "./autoPaymentFrequency";
import { commissionPeriodAfterMonths, commissionPeriodForCode } from "./commissionPeriodForCode";
import { endorsementCommissionDay } from "./endorsementCommissionPlan";
import { isAnnualAutoPayoutProduct, isFrequencyAutoPayoutProduct } from "./productCatalog";
import { installmentCommissionScheduleFromCode } from "./productFormulas/autoCommission";
import { ALLIANZ_AUTO_HISTORICAL_VALID_FROM } from "./productFormulas/allianzAuto";
import { isAnnualSeparatedPeriodProduct, isPerPaymentSeparatedPeriodProduct } from "./separatedPeriodCommissions";
import type { Product } from "@/app/types/domain";

// Bohemika product addenda in public/provize tie the refund to unused
// premium. Apply each rule from the effective date of its documented terms.
const UNEARNED_PREMIUM_TERMS: Partial<Record<Product, string>> = {
  cppAuto: "2026-04-01",
  allianzAuto: "2026-04-01",
  kooperativaAuto: "2026-04-01",
  slaviaauto: "2026-04-01",
  uniqaAuto: "2026-04-01",
  csobAuto: "2026-04-01",
  pillowAuto: "2026-04-01",
  koopflotila: "2026-04-01",
  slaviaflotila: "2025-08-01",
  uniqaflotila: "2024-05-01",
  cppbytex: "2020-04-01",
  cppsimplex: "2021-09-01",
  domex: "2023-06-01",
  domexneuron: "2026-09-01",
  zamex: "2023-04-15",
  kooppmop: "2021-08-01",
  pillowmajetek: "2023-10-01",
};

const TERM_FREQUENCIES = new Set(["monthly", "quarterly", "semiannual", "annual"]);
const DAY_MS = 86_400_000;

function remainingPeriodShare(from: string, until: string, day: string): number | null {
  if (until <= from) return null;
  if (day <= from) return 1;
  if (day >= until) return 0;
  const first = Date.parse(from);
  const last = Date.parse(until);
  return (last - Date.parse(day)) / (last - first);
}

type StornoEntry = PaymentFrequencyContract & { contractSignedDate?: unknown; policyEndDate?: unknown; entryType?: string | null };
type PremiumBasis = "annual" | "period" | "mixed";

export function nonLifeCommissionStornoEstimate(
  entry: StornoEntry, start: string, code: string, day: string, premiumBasis: PremiumBasis,
) {
  const product = entry.productKey;
  const signed = endorsementCommissionDay(entry.contractSignedDate) ?? start;
  const home = product === "allianzmujdomov" && signed >= "2020-06-01";
  const validFrom = product ? UNEARNED_PREMIUM_TERMS[product] : undefined;
  // For Allianz contracts from its historical rate schedule that ended after
  // the new terms began, use the documented day-based method as a scenario.
  const usingNewerTerms = product === "allianzAuto" && validFrom !== undefined &&
    signed >= ALLIANZ_AUTO_HISTORICAL_VALID_FROM && signed < validFrom && day >= validFrom;
  if (entry.entryType === "endorsement") return null;
  const hasApplicableTerms = home || usingNewerTerms || (validFrom !== undefined && signed >= validFrom);
  const share = nonLifeCommissionStornoShare(entry, start, code, day, premiumBasis, home, hasApplicableTerms);
  return share === null ? null : { share, usingNewerTerms };
}

function nonLifeCommissionStornoShare(
  entry: StornoEntry, start: string, code: string, day: string, premiumBasis: PremiumBasis, home: boolean,
  hasApplicableTerms: boolean,
): number | null {
  const product = entry.productKey;

  const annualPayouts = home || product === "uniqaAuto" || product === "uniqaflotila" ||
    isAnnualAutoPayoutProduct(product) || isAnnualSeparatedPeriodProduct(product);
  const installmentBasis = !annualPayouts && premiumBasis === "period" &&
    (isFrequencyAutoPayoutProduct(product) || isPerPaymentSeparatedPeriodProduct(product));
  if (!hasApplicableTerms && !installmentBasis) return null;

  const schedule = installmentCommissionScheduleFromCode(code, annualPayouts ? "annual" : entry.frequencyRaw);
  if (!schedule) return null;
  if (home) {
    const firstAnniversary = commissionPeriodAfterMonths(start, 12);
    if (!firstAnniversary) return null;
    if (schedule.phase === "initial") {
      const secondAnniversary = commissionPeriodAfterMonths(start, 24);
      if (!secondAnniversary || schedule.paymentIndex !== 1) return null;
      return day < firstAnniversary ? 1 : day < secondAnniversary ? 0.4 : 0;
    }
    const end = endorsementCommissionDay(entry.policyEndDate);
    if (end && end > start && end <= firstAnniversary) {
      // For coverage issued for at most one year, the addendum pays a
      // one-off renewal commission for the original policy period.
      return schedule.paymentIndex === 1 ? remainingPeriodShare(start, end, day) : null;
    }
  }
  const earlyBoundary = schedule.phase === "initial" ? commissionPeriodAfterMonths(start, 2) : null;
  const withinFirstTwoMonths = earlyBoundary !== null && day <= earlyBoundary;
  if (hasApplicableTerms && withinFirstTwoMonths) return 1;

  if ((!annualPayouts && !TERM_FREQUENCIES.has(entry.frequencyRaw ?? "")) || premiumBasis === "mixed") return null;
  const contract = annualPayouts ? { ...entry, frequencyRaw: "annual", paymentFrequencyChanges: null } : entry;
  const prefix = schedule.phase === "initial" ? "A" : "B";
  const current = `${prefix}${100 + schedule.paymentIndex}`;
  const next = `${prefix}${101 + schedule.paymentIndex}`;
  const useDatedSchedule = Boolean(contract.paymentFrequencyChanges?.length && hasDatedCommissionSchedule(product));
  let from: string | null;
  let until: string | null;
  try {
    if (!annualPayouts && premiumBasis === "annual" && contract.frequencyRaw === "semiannual" && !useDatedSchedule) {
      // A verified annual base spans the first year or both halves of the
      // renewal year, even when reported under the second installment's code.
      from = schedule.phase === "initial" ? start
        : commissionPeriodForCode(contract, `B${101 + 2 * Math.floor((schedule.paymentIndex - 1) / 2)}`);
      until = commissionPeriodAfterMonths(from, 12);
    } else {
      if (!annualPayouts && premiumBasis === "annual" && contract.frequencyRaw !== "annual") return null;
      from = commissionPeriodForCode(contract, current);
      until = commissionPeriodForCode(contract, next) ??
        (schedule.phase === "initial" ? commissionPeriodForCode(contract, "B101") : null);
    }
  } catch {
    // An invalid legacy payment-frequency history cannot establish coverage.
    return null;
  }
  if (!from || !until || Date.parse(until) - Date.parse(from) > 366 * DAY_MS) return null;
  // Historical installments can be estimated from their own coverage. Annual
  // payouts and bundles still need the applicable product terms.
  const fullYearEnd = commissionPeriodAfterMonths(from, 12);
  if (!hasApplicableTerms && (!fullYearEnd || until >= fullYearEnd)) return null;
  // The contract ledger provides the commissioned period. Estimate unused
  // premium by days because the eventual insurer refund is statement data.
  return withinFirstTwoMonths ? 1 : remainingPeriodShare(from, until, day);
}
