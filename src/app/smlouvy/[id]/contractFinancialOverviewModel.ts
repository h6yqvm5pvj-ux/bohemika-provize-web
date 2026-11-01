import { TZDateMini } from "@date-fns/tz/date/mini";
import { generateCashflow } from "@/app/cashflow/generator";
import { CASHFLOW_FORECAST_YEARS } from "@/app/cashflow/helpers";
import type { EntryDoc } from "@/app/cashflow/types";
import type { Product } from "@/app/types/domain";
import { calendarDate, withDateCalendar, type CalendarDateFactory } from "@/app/lib/calendarDates";
import { endorsementCommissionDay } from "@/app/lib/endorsementCommissionPlan";
import { commissionPeriodAfterMonths } from "@/app/lib/commissionPeriodForCode";
import { baseCommissionCodeForPayoutComparison } from "@/app/lib/commissionPayoutRules";
import { toDate } from "@/app/lib/formatters";
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

const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const email = (value: unknown) => text(value).toLowerCase();
const cents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const commissionCode = (value: unknown, product?: Product) => {
  const code = baseCommissionCodeForPayoutComparison(value, product);
  return code === "B301" ? "B0301" : code;
};

/** Own and manager snapshots are already authorized by the detail endpoint.
 * Restrict the summary further to the displayed, explicitly linked family. */
function familyEntries({ contract, timeline, ownerEmail }: Input): ContractDoc[] {
  const owner = email(ownerEmail);
  if (!owner || !contract.id || (contract.userEmail && email(contract.userEmail) !== owner)) return [];
  const rootId = contract.entryType === "endorsement" ? text(contract.rootContractEntryId) : contract.id;
  const entries = new Map<string, ContractDoc>();
  for (const entry of timeline) {
    if (!entry.id || entry.productKey !== contract.productKey ||
      (entry.userEmail && email(entry.userEmail) !== owner)) continue;
    if (text(contract.contractNumber) && text(entry.contractNumber) &&
      text(contract.contractNumber).replace(/\s+/g, "") !== text(entry.contractNumber).replace(/\s+/g, "")) continue;
    if (entry.entryType === "endorsement"
      ? entry.rootContractEntryId !== rootId || !entry.parentContractEntryId || entry.parentContractEntryId === entry.id
      : entry.id !== rootId) continue;
    // Duplicate IDs cannot contribute commission or payment twice. The main
    // snapshot below is authoritative after a successful edit.
    if (!entries.has(entry.id)) entries.set(entry.id, entry);
  }
  entries.set(contract.id, contract);
  const reachable = new Set(entries.has(rootId) ? [rootId] : [contract.id]);
  const children = new Map<string, string[]>();
  for (const entry of entries.values()) {
    if (entry.entryType !== "endorsement" || !entry.parentContractEntryId) continue;
    const siblings = children.get(entry.parentContractEntryId) ?? [];
    siblings.push(entry.id);
    children.set(entry.parentContractEntryId, siblings);
  }
  const queue = [...reachable];
  for (let index = 0; index < queue.length; index++) {
    for (const id of children.get(queue[index]) ?? []) {
      if (reachable.has(id)) continue;
      reachable.add(id);
      queue.push(id);
    }
  }
  return [...entries.values()].filter(entry => reachable.has(entry.id));
}

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
  return JSON.stringify([key, text(payout.code).toUpperCase(), payout.statementId ?? payout.statementNumber ?? null,
    payout.statementPeriod ?? null, payout.payoutMonthKey ?? null, email(payout.writtenBy)]);
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
  const family = familyEntries(input);
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
    paidAmount: cents(payouts.reduce((sum, payout) => sum + (actualPayoutAmount(payout) ?? 0), 0)),
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
  const forecast = generateCashflow(forecastEntries.filter(hasForecastBasis), CASHFLOW_FORECAST_YEARS, viewer, day, timeline)
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
