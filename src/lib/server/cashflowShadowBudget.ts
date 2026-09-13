import type { CashflowSnapshot } from "@/app/cashflow/computeCashflow";
import type { EntryDoc } from "@/app/cashflow/types";
import { toDate } from "@/app/lib/formatters";

const MAX_ESTIMATED_OUTPUT_ITEMS = 25_000;
const MAX_PAYOUT_MATCH_WORK = 2_000_000;
const MAX_NESTED_ROWS = 10_000;
const MAX_COMMISSION_PARTS = 128;
const MAX_PAYOUTS_PER_ENTRY = 500;
const MAX_MANAGERS_PER_ENTRY = 20;
const LIFE_PRODUCTS = new Set(["neon", "flexi", "maximaMaxEfekt", "pillowInjury"]);

function boundedArray(value: unknown, limit: number): unknown[] | null {
  if (value == null) return [];
  return Array.isArray(value) && value.length <= limit ? value : null;
}

/**
 * Resource gate for the optional server shadow only, never a business-data filter.
 *
 * Estimate every contract at monthly frequency from its earliest source date to
 * the ten-year horizon, multiplied by its largest commission-parts array. Count
 * team rows twice (own and override paths can both include them), allow 100 extra
 * life-review items and 16 fixed items per generated entry, and include every
 * statement-only payout. Each subscription row gets 1 actual + 120 forecasts.
 *
 * The 25k output estimate is supplemented by bounds on payout matching work,
 * nested arrays and dates/durations: a small number of corrupt historical rows
 * must not cause unbounded synchronous loops. Exceeding any bound skips the
 * diagnostic comparison; callers keep the existing browser calculation.
 */
export function isCashflowShadowWithinBudget(snapshot: CashflowSnapshot, asOf: Date): boolean {
  const asOfMs = asOf.getTime();
  if (!Number.isFinite(asOfMs) || asOf.getFullYear() < 2000 || asOf.getFullYear() > 2200) return false;
  const horizonMonth = (asOf.getFullYear() + 10) * 12 + asOf.getMonth();
  const maxDateYear = asOf.getFullYear() + 100;
  let estimatedOutputItems = snapshot.tipPayouts.length + snapshot.subscriptionPayments.length * 121;
  let payoutMatchWork = 0;
  let nestedRows = 0;
  if (estimatedOutputItems > MAX_ESTIMATED_OUTPUT_ITEMS) return false;
  if (snapshot.ownEntries.length + snapshot.teamEntriesRaw.length > MAX_ESTIMATED_OUTPUT_ITEMS) return false;

  const entryWithinBudget = (entry: EntryDoc, multiplicity: number): boolean => {
    if (!entry || typeof entry !== "object") return false;
    if (entry.durationYears != null && (
      typeof entry.durationYears !== "number" || !Number.isFinite(entry.durationYears) ||
      entry.durationYears < 0 || entry.durationYears > 100
    )) return false;
    if (entry.durationMonths != null && (
      typeof entry.durationMonths !== "number" || !Number.isFinite(entry.durationMonths) ||
      entry.durationMonths < 0 || entry.durationMonths > 1_200
    )) return false;

    let earliestMonth = asOf.getFullYear() * 12 + asOf.getMonth();
    for (const field of ["policyStartDate", "contractSignedDate", "createdAt", "policyEndDate", "stornoDate", "transferEffectiveDate"] as const) {
      const value = entry[field];
      if (value == null) continue;
      const date = toDate(value);
      if (!date || !Number.isFinite(date.getTime()) || date.getFullYear() < 1900 || date.getFullYear() > maxDateYear) return false;
      if (field === "policyStartDate" || field === "contractSignedDate" || field === "createdAt") {
        earliestMonth = Math.min(earliestMonth, date.getFullYear() * 12 + date.getMonth());
      }
    }

    const items = boundedArray(entry.items, MAX_COMMISSION_PARTS);
    const payouts = boundedArray(entry.commissionPayouts, MAX_PAYOUTS_PER_ENTRY);
    const overrides = boundedArray(entry.managerOverrides, MAX_MANAGERS_PER_ENTRY);
    const managers = boundedArray(entry.managerChain, MAX_MANAGERS_PER_ENTRY);
    if (!items || !payouts || !overrides || !managers) return false;
    nestedRows += items.length + payouts.length + overrides.length + managers.length;
    let parts = Math.max(1, items.length);
    for (const override of overrides) {
      if (!override || typeof override !== "object") return false;
      const overrideItems = boundedArray((override as { items?: unknown }).items, MAX_COMMISSION_PARTS);
      if (!overrideItems) return false;
      nestedRows += overrideItems.length;
      parts = Math.max(parts, overrideItems.length);
    }
    if (nestedRows > MAX_NESTED_ROWS) return false;

    // Three additional months cover inclusive endpoints and payout-date offsets.
    const months = horizonMonth - earliestMonth + 3;
    const extraReviews = LIFE_PRODUCTS.has(entry.productKey ?? "") ? 100 : 0;
    const expansion = multiplicity * (months * parts + payouts.length + extraReviews + 16);
    estimatedOutputItems += expansion;
    // The generator scans and ranks historical payouts for each forecast item.
    payoutMatchWork += expansion * (1 + payouts.length);
    return estimatedOutputItems <= MAX_ESTIMATED_OUTPUT_ITEMS && payoutMatchWork <= MAX_PAYOUT_MATCH_WORK;
  };

  try {
    return snapshot.ownEntries.every(entry => entryWithinBudget(entry, 1)) &&
      snapshot.teamEntriesRaw.every(entry => entryWithinBudget(entry, 2));
  } catch {
    // Unexpected legacy field shapes cannot authorize an expensive computation.
    return false;
  }
}
