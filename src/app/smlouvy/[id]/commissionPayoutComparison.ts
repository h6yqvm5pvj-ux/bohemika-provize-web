import { activePayoutRecordsAfterFullStornos, contractStornoDeductionKind, isStornoPayoutRecord } from "@/app/lib/commissionReceipts";
import { endorsementCommissionDay } from "@/app/lib/endorsementCommissionPlan";
import type { Product } from "@/app/types/domain";
import type { ContractCommissionPayout } from "./contractDetailTypes";

export type CommissionPayoutComparison = {
  title: string;
  code: string;
  expected: number | null;
  position: string | null;
  note?: string;
  records: ContractCommissionPayout[];
};

export const payoutCents = (record: ContractCommissionPayout): number => {
  if (typeof record.amount !== "number" || !Number.isFinite(record.amount) ||
    !["", "paid", "difference", "storno"].includes((record.status ?? "").trim().toLowerCase())) return 0;
  const amount = Math.round(Math.abs(record.amount) * 100);
  return isStornoPayoutRecord(record) ? -amount : amount;
};

export function summarizeCommissionPayouts(
  plans: CommissionPayoutComparison[], payouts: Iterable<ContractCommissionPayout>, product?: Product,
  cancellation?: { effectiveDate?: unknown },
) {
  const records = [...new Set(payouts)].filter(record => payoutCents(record) !== 0);
  const recorded = new Set(records);
  const stornoDay = endorsementCommissionDay(cancellation?.effectiveDate);
  const deductions = new Map<ContractCommissionPayout, "storno" | "undated">();
  if (cancellation) {
    for (const record of records) {
      const kind = contractStornoDeductionKind(record, stornoDay);
      if (kind) deductions.set(record, kind);
    }
  }
  const amounts = (records: ContractCommissionPayout[]) => {
    let paid = 0;
    let storno = 0;
    let hasUndatedDeduction = false;
    let hasPayment = false;
    for (const record of records) {
      const cents = payoutCents(record);
      const deduction = deductions.get(record);
      paid += cents;
      if (deduction) storno += cents;
      hasUndatedDeduction ||= deduction === "undated";
      hasPayment ||= cents > 0;
    }
    return { paid, paidBeforeStorno: paid - storno, storno, hasPayment, hasUndatedDeduction };
  };
  const matches = new Map<ContractCommissionPayout, number>();
  for (const plan of plans) {
    for (const record of new Set(plan.records)) matches.set(record, (matches.get(record) ?? 0) + 1);
  }
  const assigned = new Set<ContractCommissionPayout>();
  const rows = plans.flatMap(row => {
    const records = [...new Set(row.records)].filter(record => recorded.has(record));
    // An ambiguous alias is insufficient to associate a payment with a planned component.
    if (!records.length || records.some(record => matches.get(record) !== 1)) return [];
    records.forEach(record => assigned.add(record));
    const active = activePayoutRecordsAfterFullStornos(records.filter(record => !deductions.has(record)), product);
    const payout = amounts(records);
    const plannedDeduction = row.expected !== null && row.expected < 0 && payout.paidBeforeStorno < 0;
    const expected = (!payout.hasPayment && !plannedDeduction) || row.expected === null || !Number.isFinite(row.expected) ? null
      : active.length === 0 ? 0 : Math.round(row.expected * 100);
    return [{ ...row, expected, ...payout, records }];
  });
  for (const record of records) {
    if (assigned.has(record)) continue;
    rows.push({
      title: deductions.has(record) ? "Odúčtování bez spárovaného plánu" : "Výplata bez spárovaného plánu",
      code: record.statementCode || record.code || "",
      expected: null, ...amounts([record]), position: null, records: [record],
    });
  }

  const totals = rows.reduce((totals, row) => {
    if (row.expected === null) {
      totals.uncompared += row.paid;
      totals.uncomparedCount += 1;
    } else {
      totals.expected += row.expected;
      const compared = cancellation ? row.paidBeforeStorno : row.paid;
      totals.compared += compared;
      // An undated reversal cannot establish a mismatch with the plan.
      if (!row.hasUndatedDeduction) {
        totals.above += Math.max(0, compared - row.expected);
        totals.below += Math.max(0, row.expected - compared);
      }
    }
    return totals;
  }, { expected: 0, compared: 0, above: 0, below: 0, uncompared: 0, uncomparedCount: 0 });
  return { rows, ...totals, ...amounts(records), isCancelled: Boolean(cancellation) };
}
