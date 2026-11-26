import type { PaymentFrequency, Product } from "@/app/types/domain";
import { isAutoProduct, isFrequencyAutoPayoutProduct } from "./productCatalog";
import { endorsementCommissionDay } from "./endorsementCommissionPlan";
import { periodsPerYear } from "./productFormulas/shared";

export type PaymentFrequencyChange = { effectiveDate: string; frequency: PaymentFrequency; annualPremium?: number; baseAnnualPremium?: number; endorsementId?: string };
export type PaymentFrequencyContract = {
  productKey?: Product | null;
  frequencyRaw?: PaymentFrequency | string | null;
  policyStartDate?: unknown;
  paymentFrequencyChanges?: PaymentFrequencyChange[] | null;
};
export const MAX_PAYMENT_FREQUENCY_CHANGES = 50;
const frequencies: PaymentFrequency[] = ["monthly", "quarterly", "semiannual", "annual"];
const monthlyProducts = new Set<Product>(["pillowAuto", "kooperativaAuto", "koopflotila", "allianzAuto", "slaviaflotila"]);

export function autoPaymentFrequencies(product?: Product | null): PaymentFrequency[] {
  if (!isAutoProduct(product) || product === "cppAutoVozikZdarma") return [];
  return monthlyProducts.has(product!) ? [...frequencies] : frequencies.slice(1);
}

export function contractPaymentFrequencies(product?: Product | null): PaymentFrequency[] {
  return product === "cppPPRs" ? frequencies.slice(1) : autoPaymentFrequencies(product);
}

export function hasDatedCommissionSchedule(product?: Product | null): boolean {
  return product === "cppPPRs" || (isFrequencyAutoPayoutProduct(product) && product !== "uniqaAuto" && product !== "uniqaflotila");
}

export function normalizePaymentFrequencyChanges(value: unknown): PaymentFrequencyChange[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > MAX_PAYMENT_FREQUENCY_CHANGES) throw new Error("Neplatná historie frekvencí.");
  let previous = "";
  return value.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item) ||
      typeof item.effectiveDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(item.effectiveDate) ||
      endorsementCommissionDay(item.effectiveDate) !== item.effectiveDate || item.effectiveDate < "1900-01-01" || item.effectiveDate > "2199-12-31" ||
      item.effectiveDate <= previous || !frequencies.includes(item.frequency)) throw new Error("Neplatná historie frekvencí.");
    previous = item.effectiveDate;
    if (item.annualPremium !== undefined && (!Number.isFinite(item.annualPremium) || item.annualPremium <= 0 || item.annualPremium > 1e9 ||
      !Number.isFinite(item.baseAnnualPremium) || item.baseAnnualPremium <= 0)) throw new Error("Neplatná historie pojistného.");
    return { effectiveDate: item.effectiveDate, frequency: item.frequency,
      ...(item.annualPremium !== undefined ? { annualPremium: item.annualPremium, baseAnnualPremium: item.baseAnnualPremium } : {}),
      ...(typeof item.endorsementId === "string" ? { endorsementId: item.endorsementId } : {}) };
  });
}

export function paymentFrequencyAtDate(contract: PaymentFrequencyContract, day: string): PaymentFrequency | null {
  let frequency = frequencies.includes(contract.frequencyRaw as PaymentFrequency) ? contract.frequencyRaw as PaymentFrequency : null;
  for (const change of normalizePaymentFrequencyChanges(contract.paymentFrequencyChanges)) {
    if (change.effectiveDate > day) break;
    frequency = change.frequency;
  }
  return frequency;
}

/** Keep the original annual commission base; distribute it over the effective payment count. */
export function autoFrequencyCommissionMultiplier(contract: PaymentFrequencyContract, day: string): number {
  if (!contract.paymentFrequencyChanges?.length || !contract.productKey ||
    !hasDatedCommissionSchedule(contract.productKey)) return 1;
  const effective = paymentFrequencyAtDate(contract, day);
  const original = contract.frequencyRaw as PaymentFrequency;
  if (!effective || !frequencies.includes(original)) return 1;
  return periodsPerYear(original) / periodsPerYear(effective);
}

function afterMonths(day: string, months: number): string {
  const [year, month, date] = day.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  target.setUTCDate(Math.min(date, new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()));
  return target.toISOString().slice(0, 10);
}

export type FrequencyCommissionPeriod = { code: string; period: string; frequency: PaymentFrequency };

/** Preserve the original schedule and code sequence; each change starts a new payment period. */
export function autoFrequencyCommissionPeriods(contract: PaymentFrequencyContract, until: string): FrequencyCommissionPeriod[] {
  const start = endorsementCommissionDay(contract.policyStartDate);
  if (!start || !hasDatedCommissionSchedule(contract.productKey)) return [];
  const initial = paymentFrequencyAtDate({ ...contract, paymentFrequencyChanges: [] }, start);
  if (!initial) return [];
  const changes = normalizePaymentFrequencyChanges(contract.paymentFrequencyChanges);
  if (changes.some(change => change.effectiveDate <= start)) throw new Error("Změna musí následovat po počátku smlouvy.");
  const anniversary = afterMonths(start, 12);
  const frequencyChanges = changes.filter((change, index) => change.frequency !== (index ? changes[index - 1].frequency : initial));
  // KOMPLEX keeps the original acquisition installments. The new frequency
  // applies to subsequent installments, starting at the first anniversary.
  const renewalFrequency = frequencyChanges.findLast(change => change.effectiveDate <= anniversary)?.frequency ?? initial;
  const segments = [{ effectiveDate: start, frequency: initial }, ...(contract.productKey === "cppPPRs"
    ? [...(renewalFrequency !== initial ? [{ effectiveDate: anniversary, frequency: renewalFrequency }] : []),
      ...frequencyChanges.filter(change => change.effectiveDate > anniversary)]
    : frequencyChanges)];
  let initialIndex = 0;
  let subsequentIndex = 0;
  const result: FrequencyCommissionPeriod[] = [];
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    const next = segments[index + 1]?.effectiveDate;
    const step = segment.frequency === "monthly" ? 1 : segment.frequency === "quarterly" ? 3 : segment.frequency === "semiannual" ? 6 : 12;
    // The supported date range has at most 3,600 monthly installments per segment.
    for (let offset = 0; offset <= 3600; offset += step) {
      const period = afterMonths(segment.effectiveDate, offset);
      if (period > until || (next && period >= next)) break;
      const subsequent = period >= anniversary;
      const sequence = subsequent ? ++subsequentIndex : ++initialIndex;
      result.push({ code: `${subsequent ? "B" : "A"}${100 + sequence}`, period, frequency: segment.frequency });
    }
  }
  return result;
}

/** Annual premium at a commissioned date, independent of the payment frequency. */
export function autoAnnualPremiumAtDate(contract: PaymentFrequencyContract & { inputAmount?: number | null; signedAnnualPremiumOverride?: number | null }, day: string): number | null {
  const changes = normalizePaymentFrequencyChanges(contract.paymentFrequencyChanges);
  const count = contract.frequencyRaw === "monthly" ? 12 : contract.frequencyRaw === "quarterly" ? 4 : contract.frequencyRaw === "semiannual" ? 2 : 1;
  const original = changes.find(change => change.baseAnnualPremium != null)?.baseAnnualPremium ?? contract.signedAnnualPremiumOverride ??
    (typeof contract.inputAmount === "number" ? contract.inputAmount * (isFrequencyAutoPayoutProduct(contract.productKey) || contract.productKey === "cppPPRs" ? count : 1) : null);
  let premium = original;
  for (const change of changes) {
    if (change.effectiveDate > day) break;
    if (change.annualPremium != null) premium = change.annualPremium;
  }
  return premium != null && Number.isFinite(premium) && premium > 0 ? premium : null;
}

/** Apply the dated premium and payment count to a stored KOMPLEX renewal item. */
export function cppKomplexRenewalCommissionMultiplier(contract: Parameters<typeof autoAnnualPremiumAtDate>[0], day: string): number {
  const start = endorsementCommissionDay(contract.policyStartDate);
  if (contract.productKey !== "cppPPRs" || !start || !contract.paymentFrequencyChanges?.length) return 1;
  const base = autoAnnualPremiumAtDate(contract, start);
  const current = autoAnnualPremiumAtDate(contract, day);
  return base != null && current != null ? current / base * autoFrequencyCommissionMultiplier(contract, day) : 1;
}
