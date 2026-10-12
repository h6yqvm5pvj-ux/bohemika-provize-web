import type { CashflowComputationOptions, CashflowSnapshot } from "@/app/cashflow/computeCashflow";
import type { EntryDoc } from "@/app/cashflow/types";
import type { CashflowServerResourceLimit } from "@/app/cashflow/cashflowServerProtocol";
import { toDate } from "@/app/lib/formatters";
import { monthsBetweenPayments } from "@/app/cashflow/generator";
import { CASHFLOW_FORECAST_YEARS, INTELLIGENT_PREDICTION_CONFIG, matchesProductFilter, normalizeContractNumberSearch } from "@/app/cashflow/helpers";
import { isSubscriptionCashflowOwner } from "@/app/cashflow/subscriptionCashflow";

const MAX_ESTIMATED_OUTPUT_ITEMS = 25_000;
const MAX_PAYOUT_MATCH_WORK = 2_000_000;
const MAX_NESTED_ROWS = 10_000;
const MAX_COMMISSION_PARTS = 128;
const MAX_PAYOUTS_PER_ENTRY = 500;
const MAX_MANAGERS_PER_ENTRY = 20;
const LIFE_PRODUCTS = new Set(["neon", "flexi", "maximaMaxEfekt", "pillowInjury"]);
const ANNUAL_PRODUCTS = new Set(["allianzAuto", "pillowAuto", "uniqaAuto", "uniqaflotila", "pillowmajetek", "allianzmujdomov"]);
const PAYMENT_PRODUCTS = new Set([
  "domex", "domexneuron", "cppbytex", "cpphafan", "koopmajetekobcan", "koopfit", "koopodzam", "kooppmop",
  "cppPPRbez", "cppsimplex", "cppPPRs", "zamex", "maxdomov",
  "cppAuto", "slaviaauto", "slaviaflotila", "csobAuto", "kooperativaAuto", "koopflotila",
]);

function boundedArray(value: unknown, limit: number): unknown[] | null {
  if (value == null) return [];
  return Array.isArray(value) && value.length <= limit ? value : null;
}

/** Upper bound for the reviewed generator branches, before statement payouts
 * and life reviews. Unknown products retain the old monthly/parts estimate.
 * months already includes three months of inclusive/date-offset padding.
 */
export function estimateCashflowShadowScheduleItems(entry: EntryDoc, months: number, parts: number): number {
  if (entry.productKey === "neon") return parts + 12;
  if (entry.productKey === "pillowInjury") return parts + 2;
  if (entry.productKey === "flexi") return parts + 2 + Math.ceil(months / 12);
  if (entry.productKey === "maximaMaxEfekt") return 3 + Math.ceil(months / 12);
  if (ANNUAL_PRODUCTS.has(entry.productKey ?? "")) return 1 + Math.ceil(months / 12);
  if (PAYMENT_PRODUCTS.has(entry.productKey ?? "")) return Math.ceil(months / monthsBetweenPayments(entry.frequencyRaw));
  return months * parts + 16;
}

/** Bound the actual life-review formula schedules, assuming the first review is
 * due today and all amounts are positive. Each formula has at most three
 * immediate parts plus payouts after three/four years and its product-specific
 * annual tail. Pillow's existing prediction also retains its total row as an
 * immediate item. Ignoring the payout-month offset includes the horizon endpoint.
 * Manager differences and shorter durations can only remove these items.
 */
export function estimateCashflowShadowLifeReviewItems(entry: EntryDoc, scheduledItems: number): number {
  if (!LIFE_PRODUCTS.has(entry.productKey ?? "")) return 0;
  let itemsPerCandidate = 0;
  const maxIterations = Math.ceil(CASHFLOW_FORECAST_YEARS / 2);
  for (let review = 0; review < maxIterations; review++) {
    const years = Math.floor(CASHFLOW_FORECAST_YEARS - review * INTELLIGENT_PREDICTION_CONFIG.lifeReviewIntervalYears);
    if (years < 0) break;
    itemsPerCandidate += (entry.productKey === "pillowInjury" ? 4 : 3) + Number(years >= 3) + Number(years >= 4);
    if (entry.productKey === "neon") {
      itemsPerCandidate += Math.min(4, years) + Math.max(0, Math.min(9, years) - 3);
    } else if (entry.productKey === "flexi") {
      itemsPerCandidate += Math.max(0, years - 5);
    } else if (entry.productKey === "maximaMaxEfekt") {
      itemsPerCandidate += Math.max(0, years - 4);
    }
  }
  // Normal entries share one candidate key across their generated items. Legacy
  // empty original IDs can instead fall back to each individual item ID.
  const grouped = [entry.rootContractEntryId, entry.originalEntryId ?? entry.id,
    normalizeContractNumberSearch(entry.contractNumber)].some(value => typeof value === "string" && Boolean(value.trim()));
  return itemsPerCandidate * (grouped ? 1 : scheduledItems);
}

/**
 * Resource gate for the optional server shadow only, never a business-data filter.
 *
 * Bound reviewed generator schedules from the earliest source date to the
 * ten-year horizon. Annual, payment-frequency and fixed life schedules use their
 * own upper bounds; unknown products retain the old monthly/parts bound. Count
 * team rows twice (own and override paths can both include them), include every
 * statement-only payout and bound life reviews by their formula schedules when
 * prediction is on.
 * Each subscription row gets 1 actual + 120 forecasts. Bounds are not truncation.
 * A validated view selection can narrow generation paths; without it, legacy
 * callers keep the whole-portfolio estimate. All source shape/date/nesting
 * checks remain independent of selection, as does the caller's full input hash.
 *
 * The 25k output estimate is supplemented by bounds on payout matching work,
 * nested arrays and dates/durations: a small number of corrupt historical rows
 * must not cause unbounded synchronous loops. Exceeding any bound skips the
 * diagnostic comparison; callers keep the existing browser calculation.
 */
export function cashflowShadowBudgetFailure(snapshot: CashflowSnapshot, asOf: Date, includeLifeReviews = true,
  selection?: Omit<CashflowComputationOptions, "asOf">): CashflowServerResourceLimit | null {
  const asOfMs = asOf.getTime();
  if (!Number.isFinite(asOfMs) || asOf.getFullYear() < 2000 || asOf.getFullYear() > 2200) return "reference_time";
  const horizonMonth = (asOf.getFullYear() + 10) * 12 + asOf.getMonth();
  const maxDateYear = asOf.getFullYear() + 100;
  if (!Array.isArray(snapshot.tipPayouts) || !Array.isArray(snapshot.subscriptionPayments)) return "output_estimate";
  if (!Array.isArray(snapshot.ownEntries) || !Array.isArray(snapshot.teamEntriesRaw)) return "entry_shape";
  const includeTips = !selection || selection.tipsterMode || selection.productFilter === "tip" ||
    (selection.productFilter === "all" && selection.scopeFilter !== "team");
  const includeSubscriptions = !selection || (isSubscriptionCashflowOwner(snapshot.email) && !selection.tipsterMode &&
    selection.scopeFilter !== "team" && ["all", "subscription"].includes(selection.productFilter));
  let estimatedOutputItems = (includeTips ? snapshot.tipPayouts.length : 0) +
    (includeSubscriptions ? snapshot.subscriptionPayments.length * 121 : 0);
  let payoutMatchWork = 0;
  let nestedRows = 0;
  if (estimatedOutputItems > MAX_ESTIMATED_OUTPUT_ITEMS) return "output_estimate";
  if (snapshot.ownEntries.length + snapshot.teamEntriesRaw.length > MAX_ESTIMATED_OUTPUT_ITEMS) return "source_rows";
  if (selection && snapshot.ownEntries.length + snapshot.teamEntriesRaw.length +
    snapshot.tipPayouts.length + snapshot.subscriptionPayments.length > MAX_ESTIMATED_OUTPUT_ITEMS) return "source_rows";

  const entryFailure = (entry: EntryDoc, fromTeam: boolean): CashflowServerResourceLimit | null => {
    if (!entry || typeof entry !== "object") return "entry_shape";
    if (entry.durationYears != null && (
      typeof entry.durationYears !== "number" || !Number.isFinite(entry.durationYears) ||
      entry.durationYears < 0 || entry.durationYears > 100
    )) return "duration";
    if (entry.durationMonths != null && (
      typeof entry.durationMonths !== "number" || !Number.isFinite(entry.durationMonths) ||
      entry.durationMonths < 0 || entry.durationMonths > 1_200
    )) return "duration";

    let earliestMonth = asOf.getFullYear() * 12 + asOf.getMonth();
    for (const field of ["policyStartDate", "contractSignedDate", "createdAt", "policyEndDate", "stornoDate", "transferEffectiveDate"] as const) {
      const value = entry[field];
      if (value == null) continue;
      const date = toDate(value, { calendar: asOf });
      if (!date || !Number.isFinite(date.getTime()) || date.getFullYear() < 1900 || date.getFullYear() > maxDateYear) return "date_range";
      if (field === "policyStartDate" || field === "contractSignedDate" || field === "createdAt") {
        earliestMonth = Math.min(earliestMonth, date.getFullYear() * 12 + date.getMonth());
      }
    }

    const items = boundedArray(entry.items, MAX_COMMISSION_PARTS);
    const payouts = boundedArray(entry.commissionPayouts, MAX_PAYOUTS_PER_ENTRY);
    const overrides = boundedArray(entry.managerOverrides, MAX_MANAGERS_PER_ENTRY);
    const managers = boundedArray(entry.managerChain, MAX_MANAGERS_PER_ENTRY);
    const matches = boundedArray(entry.cashflowPayoutMatches, MAX_PAYOUTS_PER_ENTRY);
    if (!items || !payouts || !overrides || !managers || !matches) return "entry_shape";
    nestedRows += items.length + payouts.length + overrides.length + managers.length + matches.length;
    let parts = Math.max(1, items.length);
    for (const override of overrides) {
      if (!override || typeof override !== "object") return "entry_shape";
      const overrideItems = boundedArray((override as { items?: unknown }).items, MAX_COMMISSION_PARTS);
      if (!overrideItems) return "entry_shape";
      nestedRows += overrideItems.length;
      parts = Math.max(parts, overrideItems.length);
    }
    if (nestedRows > MAX_NESTED_ROWS) return "nested_rows";

    // Three additional months cover inclusive endpoints and payout-date offsets.
    const months = horizonMonth - earliestMonth + 3;
    const scheduledItems = estimateCashflowShadowScheduleItems(entry, months, parts);
    // computeCashflow selects scope/products before generation. Only those paths
    // expand, but every source row above is still validated and hashed by callers.
    // Search and history filters run later, so they cannot reduce this budget.
    let multiplicity = fromTeam ? 2 : 1;
    let extraReviews = includeLifeReviews ? multiplicity * estimateCashflowShadowLifeReviewItems(entry, scheduledItems) : 0;
    if (selection) {
      const selected = !selection.tipsterMode && selection.productFilter !== "tip" &&
        (selection.productFilter === "all" || matchesProductFilter(entry.productKey, selection.productFilter));
      const ownPath = selected && selection.scopeFilter !== "team" &&
        typeof entry.userEmail === "string" && entry.userEmail.trim().toLowerCase() === snapshot.email;
      const managerPath = selected && fromTeam && selection.scopeFilter !== "own" && overrides.some(override =>
        typeof (override as { email?: unknown }).email === "string" &&
        (override as { email: string }).email.toLowerCase() === snapshot.email);
      multiplicity = Number(ownPath) + Number(managerPath);
      extraReviews = includeLifeReviews ?
        Number(ownPath) * estimateCashflowShadowLifeReviewItems(entry, scheduledItems) +
        Number(managerPath) * estimateCashflowShadowLifeReviewItems({ ...entry, originalEntryId: entry.id,
          id: `${entry.id}-override` }, scheduledItems) : 0;
    }
    const expansion = multiplicity * (scheduledItems + payouts.length) + extraReviews;
    estimatedOutputItems += expansion;
    // The generator scans and ranks historical payouts for each forecast item.
    payoutMatchWork += expansion * (1 + payouts.length + matches.length) +
      multiplicity * matches.length * (matches.length + payouts.length);
    if (!(estimatedOutputItems <= MAX_ESTIMATED_OUTPUT_ITEMS)) return "output_estimate";
    if (!(payoutMatchWork <= MAX_PAYOUT_MATCH_WORK)) return "payout_matching";
    return null;
  };

  try {
    let failure: CashflowServerResourceLimit | null = null;
    const check = (entry: EntryDoc, fromTeam: boolean) => {
      failure = entryFailure(entry, fromTeam);
      return failure === null;
    };
    if (!snapshot.ownEntries.every(entry => check(entry, false))) return failure;
    snapshot.teamEntriesRaw.every(entry => check(entry, true));
    return failure;
  } catch {
    // Unexpected legacy field shapes cannot authorize an expensive computation.
    return "entry_shape";
  }
}

export function isCashflowShadowWithinBudget(snapshot: CashflowSnapshot, asOf: Date, includeLifeReviews = true,
  selection?: Omit<CashflowComputationOptions, "asOf">): boolean {
  return cashflowShadowBudgetFailure(snapshot, asOf, includeLifeReviews, selection) === null;
}
