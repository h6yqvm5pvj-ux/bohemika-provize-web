import { createCommissionCodeProjection, hasAnnualCommissionCodeSchedule, type CommissionCodeContract, type CommissionCodeReceipt } from "./commissionPayoutCodeAdjustment";
import { commissionPeriodAfterMonths, commissionPeriodForCode } from "./commissionPeriodForCode";
import { anniversaryNumberFromInstallmentCommissionCode, installmentPaymentsPerYear } from "./productFormulas/autoCommission";

type CodeProjection = ReturnType<typeof createCommissionCodeProjection>;
export type PremiumCodeProjection = { resolvedCommissionCode?: string; commissionCodeCorrectionNote?: string };
type Source = PremiumCodeProjection & { commissionCode?: string | null; statementId?: string | null; statementDate?: string | null; statementPeriod?: string | null; payoutMonthKey?: string | null; writtenBy?: string | null; statementOwnerEmail?: string | null };
function codeReceipt(source: Source): CommissionCodeReceipt {
  const date = typeof source.statementDate === "string" && source.statementDate.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
  return {
    code: source.commissionCode,
    statementId: source.statementId,
    writtenBy: source.writtenBy ?? source.statementOwnerEmail,
    statementDate: source.statementDate,
    statementPeriod: source.statementPeriod,
    payoutMonthKey: source.payoutMonthKey ?? (date ? `${date[3]}-${Number(date[2])}` : null),
  };
}

export function premiumCodeProjection(entry: CommissionCodeContract, source: Source, project: CodeProjection = createCommissionCodeProjection(entry, [])): PremiumCodeProjection {
  if (source.resolvedCommissionCode) return { resolvedCommissionCode: source.resolvedCommissionCode, commissionCodeCorrectionNote: source.commissionCodeCorrectionNote };
  const projected = project(codeReceipt(source));
  return projected.statementCode ? { resolvedCommissionCode: projected.code!, commissionCodeCorrectionNote: projected.commissionCodeCorrectionNote } : {};
}

/** Match an already authorized receipt to its immutable statement row. No date-based inference. */
export function premiumCodeProjectionFromReceipts(source: { commissionCode?: string | null; statementId?: string | null; source?: string }, viewer: string | undefined, payouts: readonly (CommissionCodeReceipt & {
  code?: string | null; statementId?: string | null; writtenBy?: string | null;
})[]): PremiumCodeProjection {
  if (!source.statementId || !viewer || source.source !== "own") return {};
  const matches = payouts.filter(payout => payout.statementId === source.statementId && payout.statementCode === source.commissionCode && payout.writtenBy?.trim().toLowerCase() === viewer.trim().toLowerCase());
  const codes = new Set(matches.map(payout => payout.code));
  return matches.length && codes.size === 1 ? { resolvedCommissionCode: matches[0].code!, commissionCodeCorrectionNote: matches[0].commissionCodeCorrectionNote } : {};
}

type History = Source & {
  premiumKind?: string | null; source?: string | null; anniversaryNumber?: number | null; anniversaryDate?: string | null;
  newAnnualPremium?: number | null; newPremium?: number | null; previousAnnualPremium?: number | null;
  previousPremium?: number | null; differenceAnnual?: number | null; difference?: number | null;
};
export type PremiumCodeReceipt = CommissionCodeReceipt & { statementBaseAmount?: number | null; sourceBaseAmount?: number | null };
const positive = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;

/** Recompute derived periods and deltas, retaining original source codes and all stored evidence. */
export function projectConfirmedPremiumHistory<T extends History>(entry: CommissionCodeContract, history: T[], payouts: readonly PremiumCodeReceipt[] = []): (T & PremiumCodeProjection)[] {
  if (entry.frequencyRaw === "semiannual" ||
      (entry.frequencyRaw === "quarterly" && entry.commissionPayoutCodeAdjustment)) {
    const paymentsPerYear = installmentPaymentsPerYear(entry.frequencyRaw);
    const project = createCommissionCodeProjection(entry, payouts);
    const corrected = new Set<string>();
    const projected = history.flatMap(record => {
      if (record.premiumKind !== "auto_change") return [record];
      const projection = premiumCodeProjection(entry, { ...record, resolvedCommissionCode: undefined }, project);
      if (!projection.resolvedCommissionCode) return [record];
      const date = commissionPeriodForCode({ ...entry, paymentFrequencyChanges: undefined }, projection.resolvedCommissionCode);
      const anniversaryNumber = anniversaryNumberFromInstallmentCommissionCode(projection.resolvedCommissionCode, entry.frequencyRaw);
      if (date && anniversaryNumber != null) {
        corrected.add(JSON.stringify([record.writtenBy, date]));
        return [{ ...record, ...projection, anniversaryDate: date, anniversaryNumber }];
      }
      // A relinked installment outside the policy anniversary is not a renewal.
      return [];
    });
    if (!corrected.size) return projected.length === history.length ? history : projected;
    return projected.map(record => {
      if (!record.resolvedCommissionCode || !corrected.has(JSON.stringify([record.writtenBy, record.anniversaryDate]))) return record;
      const prior = [...new Set(projected.filter(candidate => candidate.writtenBy === record.writtenBy &&
        candidate.anniversaryNumber === (record.anniversaryNumber ?? 0) - 1)
        .flatMap(candidate => positive(candidate.newAnnualPremium) ?? []))];
      const previousAnnualPremium = prior.length === 1 ? prior[0] : null;
      const annual = positive(record.newAnnualPremium);
      const differenceAnnual = previousAnnualPremium != null && annual != null ? Math.round((annual - previousAnnualPremium) * 100) / 100 : null;
      return { ...record, previousAnnualPremium, differenceAnnual,
        previousPremium: previousAnnualPremium == null ? null : Math.round(previousAnnualPremium * 100 / paymentsPerYear) / 100,
        difference: differenceAnnual == null ? null : Math.round(differenceAnnual * 100 / paymentsPerYear) / 100 };
    });
  }
  if (!hasAnnualCommissionCodeSchedule(entry)) return history;
  const hasFirstRenewalCode = (code: unknown) => /^A(?:C|PZ|P|Z)?(?:102|2)$/i.test(String(code ?? "").trim());
  const writersWithFirstRenewalReceipts = new Set(payouts
    .filter(payout => hasFirstRenewalCode(payout.statementCode ?? payout.code))
    .map(payout => payout.writtenBy?.trim().toLowerCase()));
  const project = createCommissionCodeProjection(entry, [
    ...payouts,
    ...history.filter(record => hasFirstRenewalCode(record.commissionCode) &&
      !writersWithFirstRenewalReceipts.has(record.writtenBy?.trim().toLowerCase()))
      .map(record => ({ ...codeReceipt(record), amount: positive(record.newAnnualPremium) ?? positive(record.newPremium) })),
  ]);
  const start = commissionPeriodForCode({ ...entry, paymentFrequencyChanges: undefined }, "A101");
  if (!start) return history;
  const projected = history.map(record => {
    const projection = premiumCodeProjection(entry, record, project);
    if (!projection.resolvedCommissionCode) return record;
    const period = commissionPeriodForCode({ ...entry, paymentFrequencyChanges: undefined }, projection.resolvedCommissionCode);
    if (!period) return record;
    return { ...record, ...projection, premiumKind: "auto_change", anniversaryDate: period,
      anniversaryNumber: Number(period.slice(0, 4)) - Number(start.slice(0, 4)) };
  });
  if (!projected.some((record, index) => record !== history[index])) return history;
  const premiumAt = premiumEvidenceByPeriod(entry, projected, payouts, project);
  return projected.map(record => {
    if (!record.resolvedCommissionCode || !record.anniversaryDate) return record;
    const previousPeriod = commissionPeriodAfterMonths(entry.policyStartDate, ((record.anniversaryNumber ?? 0) - 1) * 12);
    const previousPremium = premiumAt(record.writtenBy, previousPeriod);
    const annual = positive(record.newAnnualPremium) ?? positive(record.newPremium);
    const difference = previousPremium != null && annual != null ? Math.round((annual - previousPremium) * 100) / 100 : null;
    return { ...record, previousAnnualPremium: previousPremium, previousPremium, differenceAnnual: difference, difference };
  });
}


/** Compare the exact prior anniversary only, scoped to the same receipt writer. */
export function premiumEvidenceByPeriod(
  entry: CommissionCodeContract, history: readonly History[], payouts: readonly PremiumCodeReceipt[],
  project: CodeProjection,
) {
  const evidence = new Map<string, Set<number>>();
  const key = (writer: string, period: string) => JSON.stringify([writer.trim().toLowerCase(), period]);
  function add(writer: string | null | undefined, period: string | null | undefined, amount: number | null) {
    if (!writer || !period || amount == null) return;
    const identity = key(writer, period);
    const values = evidence.get(identity) ?? new Set<number>();
    values.add(amount);
    evidence.set(identity, values);
  }
  for (const record of history) {
    add(record.writtenBy, record.anniversaryDate, positive(record.newAnnualPremium) ?? positive(record.newPremium));
  }
  for (const receipt of payouts) {
    if (!(receipt.amount != null && receipt.amount > 0) || receipt.status === "storno") continue;
    const amount = positive(receipt.statementBaseAmount) ?? positive(receipt.sourceBaseAmount);
    if (amount == null) continue;
    const period = commissionPeriodForCode({ ...entry, paymentFrequencyChanges: undefined }, project(receipt).code);
    add(receipt.writtenBy, period, amount);
  }
  return (writer: string | null | undefined, period: string | null) => {
    const values = writer && period ? evidence.get(key(writer, period)) : null;
    return values?.size === 1 ? [...values][0] : null;
  };
}
