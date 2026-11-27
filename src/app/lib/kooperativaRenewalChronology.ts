import { autoFrequencyCommissionPeriods, normalizePaymentFrequencyChanges, type FrequencyCommissionPeriod } from "./autoPaymentFrequency";
import { autoCommissionReceiptMonth } from "./autoSubsequentInstallmentCoverage";
import { endorsementCommissionDay } from "./endorsementCommissionPlan";
import type { CommissionCodeContract, CommissionCodeReceipt } from "./commissionPayoutCodeAdjustment";
import { statementOrderDate } from "./statementProcessingOrder";

type Period = FrequencyCommissionPeriod;
const originalCode = (row: CommissionCodeReceipt) => (row.statementCode ?? row.code ?? "").trim().toUpperCase();
const recipient = (row: CommissionCodeReceipt) => row.writtenBy?.trim().toLowerCase() ?? "";
const reversed = (row: CommissionCodeReceipt) => row.status === "storno" || (row.amount ?? 0) < 0;
const periodMonth = (slot: Period) => Number(slot.period.slice(0, 4)) * 12 + Number(slot.period.slice(5, 7));

function statementMonth(row: CommissionCodeReceipt) {
  if (!row.statementPeriod) return autoCommissionReceiptMonth(row);
  const end = statementOrderDate({ period: row.statementPeriod });
  if (end === null) return null;
  const date = new Date(end);
  return date.getUTCFullYear() * 12 + date.getUTCMonth() + 1;
}

/** Reconcile renewal receipts against a single policy calendar, independently for each recipient. */
export function kooperativaRenewalChronology(contract: CommissionCodeContract, evidence: readonly CommissionCodeReceipt[]) {
  const rows = evidence.flatMap(row => {
    const raw = originalCode(row);
    const month = statementMonth(row);
    const writer = recipient(row);
    if (!/^[BC]1\d{2,}$/.test(raw) || month === null || !writer || !Number.isFinite(row.amount) || !row.amount) return [];
    return [{ raw, nominal: "B" + raw.slice(1), month, writer, row }];
  });
  if (rows.length < 2) return;
  const latest = Math.max(...rows.map(row => row.month)) + 2;
  const until = new Date(Date.UTC(Math.floor((latest - 1) / 12), (latest - 1) % 12 + 1, 0)).toISOString().slice(0, 10);
  const end = endorsementCommissionDay(contract.policyEndDate);
  let schedule: Period[];
  try {
    schedule = autoFrequencyCommissionPeriods({ ...contract, paymentFrequencyChanges: normalizePaymentFrequencyChanges(contract.paymentFrequencyChanges) }, end && end < until ? end : until);
  } catch {
    // A legacy contract can have an incomplete frequency history.
    return;
  }
  const nearby = new Map<number, { distance: number; slot: Period | null }>();
  for (const [index, slot] of schedule.entries()) {
    const month = periodMonth(slot);
    const tolerance = slot.frequency === "monthly" ? 0 : 1;
    const next = schedule[index + 1];
    // Two months after a half-year installment can still be closer to it than to the next one.
    const lateLimit = slot.frequency === "semiannual" && (!next || periodMonth(next) - month > 4) ? 2 : tolerance;
    for (let offset = -tolerance; offset <= lateLimit; offset++) {
      const distance = Math.abs(offset);
      const previous = nearby.get(month + offset);
      if (!previous || distance < previous.distance) nearby.set(month + offset, { distance, slot });
      else if (distance === previous.distance) nearby.set(month + offset, { distance, slot: null });
    }
  }
  const key = (writer: string, raw: string, month: number) => JSON.stringify([writer, raw, month]);
  const byWriter = new Map<string, Map<string, typeof rows>>();
  for (const item of rows) {
    const match = nearby.get(item.month);
    if (!match?.slot?.code.startsWith("B") || reversed(item.row) ||
      ((match.slot.frequency === "monthly" || match.distance === 2) && !item.row.statementPeriod)) continue;
    const slot = match.slot;
    const periods = byWriter.get(item.writer) ?? new Map<string, typeof rows>();
    const payments = periods.get(slot.code) ?? [];
    payments.push(item);
    periods.set(slot.code, payments);
    byWriter.set(item.writer, periods);
  }
  const moves = new Map<string, Period>();
  for (const [writer, periods] of byWriter) {
    const settled = new Set<string>();
    for (const slot of schedule) {
      const group = periods.get(slot.code);
      if (!group) continue;
      // Multiple rows may legitimately belong to one period. Do not move competing codes into it.
      if (group.some(item => item.nominal === slot.code)) { settled.add(slot.code); continue; }
      const [first] = group;
      const previous = "B" + (Number(slot.code.slice(1)) - 1);
      const nominalSettled = settled.has(first.nominal);
      const previousSettled = settled.has(previous);
      if (group.some(item => item.raw !== first.raw) || !(nominalSettled || previousSettled)) continue;
      for (const item of group) {
        // For a late restart require both the already-covered code and the preceding installment.
        if (item.month === periodMonth(slot) + 2 && !(nominalSettled && previousSettled)) continue;
        moves.set(key(writer, item.raw, item.month), slot);
        settled.add(slot.code);
      }
    }
  }
  if (!moves.size) return;
  const corrections = new Map<string, Period>();
  for (const item of rows.filter(item => reversed(item.row))) {
    const candidates = rows.filter(other => !reversed(other.row) && other.writer === item.writer && other.raw === item.raw &&
      other.month <= item.month && Math.round(other.row.amount! * 100) === Math.round(Math.abs(item.row.amount!) * 100));
    const original = candidates[0];
    const target = original && moves.get(key(original.writer, original.raw, original.month));
    if (target && candidates.every(other => moves.get(key(other.writer, other.raw, other.month)) === target)) {
      corrections.set(JSON.stringify([key(item.writer, item.raw, item.month), Math.abs(item.row.amount!)]), target);
    }
  }
  return <T extends CommissionCodeReceipt>(row: T) => {
    if (row.statementCode) return;
    const month = statementMonth(row);
    if (month === null) return;
    const raw = originalCode(row);
    const identity = key(recipient(row), raw, month);
    const reversal = reversed(row);
    const slot = reversal ? corrections.get(JSON.stringify([identity, Math.abs(row.amount ?? 0)])) : moves.get(identity);
    if (slot && !reversal && month === periodMonth(slot) + 2 && !row.statementPeriod) return;
    if (slot) return { ...row, code: slot.code, statementCode: row.code,
      commissionCodeCorrectionNote: `Kód výpisu ${raw} → ${slot.code}. Podle pořadí výpisů patří ke splátce od ${slot.period.split("-").reverse().join(".")}.` };
  };
}
