import { TZDateMini } from "@date-fns/tz/date/mini";
import { generateCashflow } from "@/app/cashflow/generator";
import { applyAutoCommissionForecasts } from "@/app/cashflow/autoCommissionForecast";
import { CASHFLOW_FORECAST_YEARS } from "@/app/cashflow/helpers";
import type { EntryDoc } from "@/app/cashflow/types";
import type { Product } from "@/app/types/domain";
import { calendarDate, withDateCalendar, type CalendarDateFactory } from "@/app/lib/calendarDates";
import { endorsementCommissionDay } from "@/app/lib/endorsementCommissionPlan";
import { commissionPeriodAfterMonths } from "@/app/lib/commissionPeriodForCode";
import { baseCommissionCodeForPayoutComparison } from "@/app/lib/commissionPayoutRules";
import { calculateContractStornoRows, connectedContractFamily } from "@/app/lib/commissionStornoAudit";
import { toDate } from "@/app/lib/formatters";
import { productCategory } from "@/app/lib/productCatalog";
import type { ContractCommissionPayout, ContractDoc } from "./contractDetailTypes";

export type ContractFinancialOverviewModel = {
  recipient: "own" | "manager" | "unavailable";
  paidAmount: number;
  payoutCount: number;
  expectedAmount: number | null;
  nextPayout: { date: Date; amount: number; count: number } | null;
  periodFrom: string;
  /** Exclusive end of the twelve-calendar-month forecast. */
  periodUntil: string;
  entriesCount: number;
};

type Input = {
  contract: ContractDoc;
  timeline: ContractDoc[];
  ownerEmail: string | null;
  viewerEmail: string | null;
  asOf: Date;
};
type PaidInput = Omit<Input, "asOf">;

const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const email = (value: unknown) => text(value).toLowerCase();
const cents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const commissionCode = (value: unknown, product?: Product) => {
  const code = baseCommissionCodeForPayoutComparison(value, product);
  return code === "B301" ? "B0301" : code;
};

/** Attach the policy calendar to generated dates without changing global Date
 * or depending on the browser/server host timezone. */
function pragueCalendar(value: Date): Date {
  const zone = "Europe/Prague";
  const factory: CalendarDateFactory = {
    from(input) {
      if (typeof input === "string") {
        const local = input.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/);
        if (local) return new TZDateMini(Number(local[1]), Number(local[2]) - 1, Number(local[3]),
          Number(local[4]), Number(local[5]), Number(local[6] ?? 0), Number((local[7] ?? "0").padEnd(3, "0")), zone);
        return new TZDateMini(input, zone);
      }
      return new TZDateMini(input instanceof Date ? input.getTime() : input, zone);
    },
    local: (year, month, day, hours, minutes, seconds, milliseconds) =>
      new TZDateMini(year, month, day, hours, minutes, seconds, milliseconds, zone),
  };
  return withDateCalendar(value, factory);
}

function actualPayoutAmount(payout: ContractCommissionPayout): number | null {
  if (typeof payout.amount !== "number" || !Number.isFinite(payout.amount) || payout.amount === 0 ||
    !["", "paid", "difference", "storno"].includes(text(payout.status).toLowerCase())) return null;
  return text(payout.status).toLowerCase() === "storno" || payout.differenceReason === "storno"
    ? -Math.abs(payout.amount) : payout.amount;
}

function payoutIdentity(payout: ContractCommissionPayout): string | null {
  const key = text(payout.key);
  if (!key) return null;
  // Only an explicit source key permits deduplication. Similar amounts, dates
  // or titles are not evidence that two insurance instalments are one receipt.
  return JSON.stringify([key, text(payout.statementCode ?? payout.code).toUpperCase(), payout.statementId ?? payout.statementNumber ?? null,
    payout.statementPeriod ?? null, payout.payoutMonthKey ?? null, email(payout.writtenBy)]);
}

const netRecordedAmount = (payouts: ContractCommissionPayout[]): number =>
  payouts.reduce((sum, payout) => sum + Math.round((actualPayoutAmount(payout) ?? 0) * 100), 0) / 100;

export function buildContractPaidCommissionTotal(input: PaidInput): number | null {
  const owner = email(input.ownerEmail);
  const viewer = email(input.viewerEmail);
  const family = connectedContractFamily(input);
  if (!viewer || !family.length) return null;
  if (input.contract.entryType === "endorsement" && !family.some(entry =>
    entry.id === input.contract.rootContractEntryId && entry.entryType !== "endorsement")) return null;
  const payouts = recordedPayouts(family, owner, viewer);
  const isRecipient = viewer === owner || payouts.length > 0 || family.some(entry =>
    entry.managerOverrides?.some(override => email(override.email) === viewer));
  return isRecipient ? netRecordedAmount(payouts) : null;
}

export function buildContractStornoComparison(input: PaidInput, stornoDate: unknown) {
  const { contract, ownerEmail, viewerEmail } = input;
  const family = connectedContractFamily(input);
  const policy = contract.entryType === "endorsement" ? family.find(entry => entry.id === contract.rootContractEntryId) : contract;
  if (!policy) return [];
  const rows = calculateContractStornoRows(family, ownerEmail, viewerEmail, stornoDate);
  const category = productCategory(policy.productKey);
  if ((category === "auto" || category === "property" || category === "travel") && rows.length > 0 &&
    rows.every(row => row.estimated === 0 && row.deducted === null)) {
    const start = endorsementCommissionDay(policy.policyStartDate);
    const effective = endorsementCommissionDay(stornoDate);
    if (start && effective) {
      const years = Number(effective.slice(0, 4)) - Number(start.slice(0, 4));
      if (years > 0 && commissionPeriodAfterMonths(start, years * 12) === effective) return null;
    }
  }
  return rows;
}

function recordedPayouts(entries: ContractDoc[], owner: string, viewer: string): ContractCommissionPayout[] {
  const identified = new Map<string, ContractCommissionPayout>();
  const withoutKey: ContractCommissionPayout[] = [];
  for (const entry of entries) {
    for (const payout of entry.commissionPayouts ?? []) {
      const writer = email(payout.writtenBy);
      if ((writer ? writer !== viewer : viewer !== owner) || actualPayoutAmount(payout) === null) continue;
      const identity = payoutIdentity(payout);
      if (!identity) withoutKey.push(payout);
      else {
        const previous = identified.get(identity);
        if (!previous || (payout.writtenAtMs ?? 0) >= (previous.writtenAtMs ?? 0)) identified.set(identity, payout);
      }
    }
  }
  return [...identified.values(), ...withoutKey];
}

function hasForecastBasis(entry: EntryDoc): boolean {
  return Boolean(entry.productKey && [entry.policyStartDate, entry.contractSignedDate, entry.createdAt]
    .some(value => { const date = toDate(value); return date && Number.isFinite(date.getTime()); }) &&
    (entry.items ?? []).some(item => typeof item.amount === "number" && Number.isFinite(item.amount) &&
      text(item.code).toUpperCase() !== "TOTAL" && !/celkem/i.test(item.title)));
}

/** A local read-only view of the same original schedules used by cashflow.
 * Recorded payments and projected future amounts remain separate. */
export function buildContractFinancialOverview(input: Input): ContractFinancialOverviewModel {
  const { contract, asOf } = input;
  const periodFrom = endorsementCommissionDay(asOf) ?? "";
  const periodUntil = commissionPeriodAfterMonths(periodFrom, 12) ?? "";
  const empty: ContractFinancialOverviewModel = { recipient: "unavailable", paidAmount: 0, payoutCount: 0,
    expectedAmount: null, nextPayout: null, periodFrom, periodUntil, entriesCount: 0 };
  const owner = email(input.ownerEmail);
  const viewer = email(input.viewerEmail);
  const family = connectedContractFamily(input);
  if (!viewer || !owner || !family.length || !periodFrom || !periodUntil) return empty;
  const own = owner === viewer;
  const payouts = recordedPayouts(family, owner, viewer);
  const timeline: EntryDoc[] = family.map(entry => ({ ...entry, userEmail: owner,
    // Legacy receipts are already recorded actuals even without a status. Use
    // normalized local copies so cashflow cannot forecast those same receipts.
    commissionPayouts: recordedPayouts([entry], owner, viewer).map(payout => {
      const amount = actualPayoutAmount(payout)!;
      return { ...payout, amount, status: amount < 0 ? "storno" : text(payout.status).toLowerCase() || "paid" };
    }),
  }));
  const forecastEntries = timeline.flatMap((entry): EntryDoc[] => {
    if (own) return [{ ...entry, source: "own" }];
    const overrides = (entry.managerOverrides ?? []).filter(override => email(override.email) === viewer);
    if (overrides.length !== 1) return [];
    return [{ ...entry, originalEntryId: entry.id, id: `${entry.id}-overview-override`,
      items: overrides[0].items, source: "manager" }];
  });
  const hasBasis = forecastEntries.some(hasForecastBasis);
  const model: ContractFinancialOverviewModel = { ...empty, entriesCount: family.length,
    recipient: own ? "own" : forecastEntries.length || payouts.length ? "manager" : "unavailable",
    paidAmount: netRecordedAmount(payouts),
    payoutCount: payouts.length };
  if (contract.entryType === "endorsement" && !family.some(entry => entry.id === contract.rootContractEntryId &&
    entry.entryType !== "endorsement")) return model;
  const incomplete = forecastEntries.some(entry => {
    if (hasForecastBasis(entry)) return false;
    const previous = entry.previousInputAmount;
    const next = entry.newInputAmount ?? entry.effectiveInputAmount;
    // An ordinary premium decrease legitimately has no separate commission.
    return !(entry.entryType === "endorsement" && endorsementCommissionDay(entry.policyStartDate) &&
      typeof previous === "number" && Number.isFinite(previous) && previous > 0 &&
      typeof next === "number" && Number.isFinite(next) && next >= 0 && next < previous);
  });
  if (!hasBasis || incomplete) return model;
  const calendar = pragueCalendar(asOf);
  const day = calendarDate(calendar, calendar.getFullYear(), calendar.getMonth(), calendar.getDate());
  const forecast = applyAutoCommissionForecasts(
    generateCashflow(forecastEntries.filter(hasForecastBasis), CASHFLOW_FORECAST_YEARS, viewer, day, timeline), forecastEntries, viewer)
    .filter(item => {
      const date = endorsementCommissionDay(item.date);
      return item.payoutStatus !== "paid" && !item.isStatementOnly && date && date >= periodFrom &&
        Number.isFinite(item.amount);
    });
  const unplacedReceipt = timeline.some(entry => {
    const pending = forecast.filter(item => item.entryId === entry.id);
    if (!pending.length) return false;
    return (entry.commissionPayouts ?? []).some(payout => {
      const code = commissionCode(payout.code, entry.productKey);
      if (!code) return true;
      const matching = pending.filter(item => [item.commissionCode, ...(item.commissionCodeAliases ?? [])]
        .some(value => commissionCode(value, entry.productKey) === code));
      if (!matching.length) return false;
      const month = text(payout.payoutMonthKey).match(/^(\d{4})-(\d{1,2})$/);
      const usableMonth = month && Number(month[1]) >= 1000 && Number(month[2]) >= 1 && Number(month[2]) <= 12;
      // A receipt with no usable month cannot be settled by the generator.
      // Recorded deductions also cannot settle a still-pending negative plan;
      // show an unknown forecast rather than count either amount twice.
      return !usableMonth || (Number(payout.amount) < 0 && matching.some(item => item.amount < 0));
    });
  });
  if (unplacedReceipt) return model;
  model.expectedAmount = cents(forecast.filter(item => endorsementCommissionDay(item.date)! < periodUntil)
    .reduce((sum, item) => sum + item.amount, 0));
  const days = new Map<string, { date: Date; amount: number; count: number }>();
  for (const item of forecast) {
    const key = endorsementCommissionDay(item.date)!;
    const group = days.get(key) ?? { date: new Date(item.date.getTime()), amount: 0, count: 0 };
    group.amount += item.amount;
    group.count++;
    days.set(key, group);
  }
  const next = [...days.values()].find(group => cents(group.amount) !== 0);
  if (next) model.nextPayout = { ...next, amount: cents(next.amount) };
  return model;
}
