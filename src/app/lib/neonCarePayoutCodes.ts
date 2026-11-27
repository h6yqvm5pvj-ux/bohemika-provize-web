import type { CommissionCodeContract, CommissionCodeReceipt } from "./commissionPayoutCodeAdjustment";
import { autoCommissionReceiptMonth } from "./autoSubsequentInstallmentCoverage";
import { estimatePayoutDate } from "./commissionPayoutDate";
import { calendarDate } from "./calendarDates";
import { endorsementCommissionDay } from "./endorsementCommissionPlan";

type Slot = { code: string; closingMonth: number };
type Row = { payout: CommissionCodeReceipt; source: string; code: string; year: number | null; target?: string };
const normalizedCode = (code: unknown) => typeof code === "string" ? code.trim().toUpperCase() : "";
const sourceCode = (payout: CommissionCodeReceipt) => normalizedCode(payout?.statementCode ?? payout?.code);
const writerOf = (payout: CommissionCodeReceipt) => typeof payout?.writtenBy === "string" ? payout.writtenBy.trim().toLowerCase() : "";
const positivePayment = (payout: CommissionCodeReceipt) => Number.isFinite(payout.amount) && (payout.amount ?? 0) > 0 &&
  (!payout.status || payout.status === "paid" || payout.status === "difference") && payout.differenceReason !== "storno";

/** Cashflow and receipt matching use the same dates. Each care year is paid after it closes. */
export function neonCareInstallments(start: Date, duration: number | null | undefined, inherited: boolean) {
  const anniversary = (years: number, clamp: boolean) => {
    const year = start.getFullYear() + years;
    const month = start.getMonth();
    const day = clamp ? Math.min(start.getDate(), calendarDate(start, year, month + 1, 0).getDate()) : start.getDate();
    return calendarDate(start, year, month, day);
  };
  const installments = [];
  for (let year = 5; year <= 10 && year - 1 <= (duration ?? 10); year++) {
    const close = anniversary(year, inherited);
    installments.push({ code: `B${196 + year}`, period: anniversary(year - 1, true), close, due: estimatePayoutDate(close) });
  }
  return installments;
}

const localDay = (day: string) => {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date);
};

function careSlots(entry: CommissionCodeContract) {
  const slots = new Map<number, Slot>();
  const start = endorsementCommissionDay(entry.policyStartDate);
  if (!start || entry.entryType === "endorsement" || (entry.rootContractEntryId && entry.parentContractEntryId) ||
      !Array.isArray(entry.items) || !entry.items.some(item => item && (item.code === "B201-B206" ||
        (!item.code && /(?:pečovatelská|následná).*5.*10/i.test(item.title))))) return slots;
  const end = endorsementCommissionDay(entry.policyEndDate);
  const endPayout = end && estimatePayoutDate(localDay(end));
  const inherited = entry.acquisitionType === "inherited";
  const transferDay = endorsementCommissionDay(entry.transferEffectiveDate);
  const transfer = transferDay && localDay(transferDay);
  for (const { code, period, close, due } of neonCareInstallments(localDay(start), entry.durationYears, inherited)) {
    if ((endPayout && due > endPayout) || (inherited && (!transfer || period < transfer))) continue;
    slots.set(due.getFullYear(), { code, closingMonth: close.getFullYear() * 12 + close.getMonth() + 1 });
  }
  return slots;
}

/** Project one authorized contract ledger. Statement dates and amounts stay on their original receipts. */
export function createNeonCareCodeProjection(entry: CommissionCodeContract, evidence: readonly CommissionCodeReceipt[]) {
  const unchanged = <T extends CommissionCodeReceipt>(payout: T) => payout;
  if (!evidence.some(payout => !payout?.statementCode && /^B20[1-7]$/.test(sourceCode(payout)))) return unchanged;
  const slots = careSlots(entry);
  if (!slots.size) return unchanged;
  const byWriter = new Map<string, Row[]>();
  const corrections = new Map<string, { code: string; year: number }>();
  const receiptKey = (payout: CommissionCodeReceipt) => JSON.stringify([writerOf(payout), payout.statementId,
    payout.key, sourceCode(payout), autoCommissionReceiptMonth(payout), payout.amount]);
  for (const payout of evidence) {
    const source = sourceCode(payout);
    const writer = writerOf(payout);
    if (!writer || !/^B20[1-7]$/.test(source)) continue;
    const month = autoCommissionReceiptMonth(payout);
    const year = month == null ? null : Math.floor((month - 1) / 12);
    const slot = year == null ? undefined : slots.get(year);
    const code = normalizedCode(payout.code);
    const target = !payout.statementCode && positivePayment(payout) && slot && slot.code !== code &&
      month != null && month >= slot.closingMonth && month < slot.closingMonth + 12 ? slot.code : undefined;
    const rows = byWriter.get(writer) ?? [];
    rows.push({ payout, source, code, year, target });
    byWriter.set(writer, rows);
  }
  for (const rows of byWriter.values()) {
    const countByYear = new Map<number, number>();
    const reversedCodes = new Set<string>();
    for (const row of rows) {
      if (!positivePayment(row.payout)) reversedCodes.add(row.source);
      else if (row.year != null) countByYear.set(row.year, (countByYear.get(row.year) ?? 0) + 1);
    }
    for (const row of rows) {
      if (row.year == null || countByYear.get(row.year) !== 1 || reversedCodes.has(row.source)) row.target = undefined;
    }
    // A blocked move keeps its original slot, which can block its neighbour in turn.
    let changed: boolean;
    do {
      changed = false;
      const occupied = new Set(rows.filter(row => !row.target).map(row => row.code));
      for (const row of rows) {
        if (!row.target || row.year == null) continue;
        // A late B201 can still settle B201. Move an older printed code forward
        // only if a separate payment already covers its original scheduled year.
        const unsupportedLate = row.source < row.target && !rows.some(previous => previous.year != null &&
          slots.get(previous.year)?.code === row.source && (previous.target ?? previous.code) === row.source &&
          positivePayment(previous.payout) && !reversedCodes.has(previous.source));
        const previousYear = row.year - 1;
        // B207 sits outside the six contractual codes. Require the preceding
        // B206 → B205 payment before accepting it as the end of a shifted series.
        const unsupportedLast = row.source === "B207" && (row.target !== "B206" ||
          !rows.some(previous => previous.year === previousYear && previous.source === "B206" &&
            (previous.target ?? previous.code) === "B205" && positivePayment(previous.payout)));
        if (occupied.has(row.target) || unsupportedLast || unsupportedLate) {
          row.target = undefined;
          changed = true;
        }
      }
    } while (changed);
    for (const row of rows) {
      if (row.target && row.year != null) corrections.set(receiptKey(row.payout), { code: row.target, year: row.year });
    }
  }
  return <T extends CommissionCodeReceipt>(payout: T): T => {
    if (!corrections.size || !payout || payout.statementCode || !positivePayment(payout)) return payout;
    const match = corrections.get(receiptKey(payout));
    return match ? { ...payout, code: match.code, statementCode: payout.code,
      commissionCodeCorrectionNote: `Kód výpisu ${sourceCode(payout)} → ${match.code} podle plánované výplaty pečovatelské provize v roce ${match.year}.` } : payout;
  };
}
