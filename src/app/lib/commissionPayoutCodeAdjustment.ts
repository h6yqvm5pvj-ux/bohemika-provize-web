import type { CommissionResultItemDTO, Product } from "@/app/types/domain";
import { confirmedQuarterlyProjection, type ConfirmedInstallmentSplit, type ConfirmedQuarterlyRule } from "./confirmedQuarterlyInstallments";
import { kooperativaRenewalChronology } from "./kooperativaRenewalChronology";
import { baseCommissionCodeForPayoutComparison } from "./commissionPayoutRules";
import { endorsementCommissionDay } from "./endorsementCommissionPlan";
import { isAutoProduct, isLifeProduct, isRecordOnlyProduct } from "./productCatalog";
import { isSeparatedPeriodCommissionProduct } from "./separatedPeriodCommissions";
import { autoCommissionReceiptMonth, semiannualAutoInstallmentCoverage, type AutoCommissionReceipt } from "./autoSubsequentInstallmentCoverage";
import { createNeonCareCodeProjection } from "./neonCarePayoutCodes";

/** Explicitly confirmed for one contract and one recipient. */
export type CommissionPayoutCodeAdjustment = {
  writtenBy: string;
  confirmedAtMs: number;
} & (
  | { kind: "cpp-auto-annual-sequence-offset"; fromPayoutMonthKey: string }
  | { kind: "cpp-auto-quarterly-sequence-offset"; sourceStatementIds: readonly string[] }
  | ConfirmedQuarterlyRule
  | { kind: "cpp-pprs-acquisition-a201"; statementId: string; payoutKey: string }
);
export type AdjustedCommissionPayout = {
  confirmedInstallmentSplit?: ConfirmedInstallmentSplit;
  statementCode?: string | null;
  commissionCodeCorrectionNote?: string;
  basePremiumPeriod?: "annual";
};
export type CommissionCodeContract = {
  productKey?: Product | null;
  frequencyRaw?: string | null;
  policyStartDate?: unknown;
  entryType?: string | null;
  rootContractEntryId?: string | null;
  parentContractEntryId?: string | null;
  durationYears?: number | null;
  acquisitionType?: string | null;
  transferEffectiveDate?: string | null;
  paymentFrequencyChanges?: readonly unknown[] | null;
  inputAmount?: number | null;
  signedAnnualPremiumOverride?: number | null;
  policyEndDate?: unknown;
  items?: CommissionResultItemDTO[] | null;
  commissionPayoutCodeAdjustment?: unknown;
};
export type CommissionCodeReceipt = AdjustedCommissionPayout & AutoCommissionReceipt & {
  key?: string | null;
  statementId?: string | null;
  writtenBy?: string | null;
};

const email = (value: unknown) => typeof value === "string" ? value.trim().toLowerCase() : "";
const month = (value: unknown): number | null => {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{1,2})$/.exec(value);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) return null;
  return Number(match[1]) * 12 + Number(match[2]) - 1;
};
const rawCode = (receipt: CommissionCodeReceipt) =>
  String(receipt.statementCode ?? receipt.code ?? "").trim().toUpperCase().replace(/\s+/g, "");
const isFirstRenewalCode = (code: string) => /^A(?:C)?(?:102|2)$/.test(code);
const subsequentIndex = (code: string) => {
  const match = /^B(?:C)?(1\d{2}|[1-9])$/.exec(code);
  if (!match) return 0;
  const index = Number(match[1]);
  return index >= 100 ? index - 100 : index;
};

export function hasAnnualCommissionCodeSchedule(entry: CommissionCodeContract): boolean {
  const product = entry.productKey;
  return entry.frequencyRaw === "annual" && entry.entryType !== "endorsement" && !entry.paymentFrequencyChanges?.length &&
    !isLifeProduct(product) && !isRecordOnlyProduct(product) &&
    (isAutoProduct(product) || isSeparatedPeriodCommissionProduct(product));
}

export function annualFirstRenewalCommissionCode(entry: CommissionCodeContract, code: string): "B101" | null {
  return hasAnnualCommissionCodeSchedule(entry) && isFirstRenewalCode(baseCommissionCodeForPayoutComparison(code, entry.productKey))
    ? "B101" : null;
}

// Allow a statement to precede or follow the mapped anniversary, but require
// it to be closer to that anniversary than to either adjacent policy year.
const fitsAnnualPeriod = (paidMonth: number, startMonth: number, years: number) =>
  Math.abs(paidMonth - startMonth - years * 12) < 6;

function createSemiannualCodeProjection(entry: CommissionCodeContract, evidence: readonly CommissionCodeReceipt[]) {
  const byWriter = new Map<string, CommissionCodeReceipt[]>();
  for (const receipt of evidence) {
    const writer = email(receipt.writtenBy);
    if (!writer) continue;
    const rows = byWriter.get(writer) ?? [];
    rows.push(receipt);
    byWriter.set(writer, rows);
  }
  const planned = entry.items?.find(item => /^B(?:C)?(?:101|1)$/.test(item.code ?? ""))?.amount;
  const corrections = new Map<string, { code: string; amount: number }>();
  const combinedPayments = new Map<string, number>();
  const key = (writer: string, receipt: CommissionCodeReceipt) =>
    JSON.stringify([writer, rawCode(receipt), autoCommissionReceiptMonth(receipt)]);
  for (const [writer, rows] of byWriter) {
    const { combined, reassigned } = semiannualAutoInstallmentCoverage(entry, rows, planned);
    if (combined) combinedPayments.set(key(writer, combined), combined.amount!);
    for (const [receipt, code] of reassigned) corrections.set(key(writer, receipt), { code, amount: receipt.amount! });
  }
  return <T extends CommissionCodeReceipt>(receipt: T): T & AdjustedCommissionPayout => {
    if (receipt.status === "storno" || (receipt.amount ?? 0) < 0) return receipt;
    const identity = key(email(receipt.writtenBy), receipt);
    if (receipt.amount != null && combinedPayments.get(identity) === receipt.amount && receipt.basePremiumPeriod !== "annual") {
      return { ...receipt, basePremiumPeriod: "annual" };
    }
    if (receipt.statementCode) return receipt;
    const correction = corrections.get(identity);
    if (!correction || (receipt.amount != null && Math.round(receipt.amount * 100) !== Math.round(correction.amount * 100))) return receipt;
    return { ...receipt, code: correction.code, statementCode: receipt.code,
      commissionCodeCorrectionNote: `Kód výpisu ${rawCode(receipt)} → ${correction.code} podle období pololetní splátky.` };
  };
}

export function createCommissionCodeProjection(entry: CommissionCodeContract, evidence: readonly CommissionCodeReceipt[]) {
  const fallback = createStandardCommissionCodeProjection(entry, evidence);
  if (entry.productKey !== "kooperativaAuto" || entry.entryType === "endorsement") return fallback;
  const chronology = kooperativaRenewalChronology(entry, evidence);
  if (!chronology) return fallback;
  return <T extends CommissionCodeReceipt>(receipt: T) => {
    const standard = fallback(receipt);
    if (entry.frequencyRaw === "semiannual" && standard !== receipt) return standard;
    return chronology(receipt) ?? standard;
  };
}

function createStandardCommissionCodeProjection(entry: CommissionCodeContract, evidence: readonly CommissionCodeReceipt[]) {
  const unchanged = <T extends CommissionCodeReceipt>(receipt: T): T & AdjustedCommissionPayout => receipt;
  if (entry.productKey === "neon") return createNeonCareCodeProjection(entry, evidence);
  if (entry.frequencyRaw === "semiannual") return createSemiannualCodeProjection(entry, evidence);
  const rule = entry.commissionPayoutCodeAdjustment as CommissionPayoutCodeAdjustment | null | undefined;
  if (rule?.kind === "cpp-auto-quarterly-combined-start" && entry.productKey === "cppAuto" &&
      entry.frequencyRaw === "quarterly" && entry.entryType !== "endorsement" &&
      email(rule.writtenBy) && Number.isFinite(rule.confirmedAtMs) && rule.confirmedAtMs > 0) {
    return confirmedQuarterlyProjection(rule, evidence);
  }
  if (entry.frequencyRaw === "quarterly" && entry.productKey === "cppAuto" &&
      entry.entryType !== "endorsement" && rule?.kind === "cpp-auto-quarterly-sequence-offset" &&
      email(rule.writtenBy) && typeof rule.confirmedAtMs === "number" && rule.confirmedAtMs > 0 &&
      Number.isFinite(rule.confirmedAtMs) && Array.isArray(rule.sourceStatementIds)) {
    const writer = email(rule.writtenBy);
    const sourceStatementIds = rule.sourceStatementIds;
    return <T extends CommissionCodeReceipt>(receipt: T): T & AdjustedCommissionPayout => {
      if (receipt.statementCode || !receipt.statementId || email(receipt.writtenBy) !== writer) return receipt;
      const code = rawCode(receipt);
      const index = subsequentIndex(baseCommissionCodeForPayoutComparison(code, entry.productKey));
      if (index <= 0 || sourceStatementIds[index - 1] !== receipt.statementId) return receipt;
      // The first three B codes were used for the remaining first-year quarters.
      const corrected = index <= 3 ? `A${101 + index}` : `B${97 + index}`;
      return { ...receipt, code: corrected, statementCode: receipt.code,
        commissionCodeCorrectionNote: `Kód výpisu ${code} → ${corrected} podle období čtvrtletní splátky.` };
    };
  }
  const confirmedAcquisition = entry.productKey === "cppPPRs" && entry.frequencyRaw === "annual" &&
    entry.entryType !== "endorsement" && rule?.kind === "cpp-pprs-acquisition-a201" &&
    email(rule.writtenBy) && typeof rule.confirmedAtMs === "number" && Number.isFinite(rule.confirmedAtMs) && rule.confirmedAtMs > 0 &&
    typeof rule.statementId === "string" && /^[\w-]{1,100}$/.test(rule.statementId) &&
    typeof rule.payoutKey === "string" && /^[\w-]{1,100}$/.test(rule.payoutKey)
    ? rule : null;
  const projectAcquisition = <T extends CommissionCodeReceipt>(receipt: T): T & AdjustedCommissionPayout => {
    if (!confirmedAcquisition || receipt.statementCode || email(receipt.writtenBy) !== email(confirmedAcquisition.writtenBy) ||
      receipt.statementId !== confirmedAcquisition.statementId || receipt.key !== confirmedAcquisition.payoutKey ||
      rawCode(receipt) !== "A201" || (receipt.status !== "paid" && receipt.status !== "difference") ||
      typeof receipt.amount !== "number" || !Number.isFinite(receipt.amount) || receipt.amount <= 0) return receipt;
    return { ...receipt, code: "A101", statementCode: receipt.code,
      commissionCodeCorrectionNote: "Výplata A201 z výpisu je přiřazena ke vznikové provizi A101." };
  };
  if (!hasAnnualCommissionCodeSchedule(entry)) return confirmedAcquisition ? projectAcquisition : unchanged;

  const confirmedMonth = entry.productKey === "cppAuto" && rule?.kind === "cpp-auto-annual-sequence-offset" &&
    email(rule.writtenBy) && typeof rule.confirmedAtMs === "number" && Number.isFinite(rule.confirmedAtMs) && rule.confirmedAtMs > 0
    ? month(rule.fromPayoutMonthKey) : null;
  const startMonth = month(endorsementCommissionDay(entry.policyStartDate)?.slice(0, 7));
  const firstRenewals = new Map<string, number>();
  const firstRenewalAmounts = new Map<string, number>();
  const namedRenewals = new Map<string, Set<number>>();
  const settled = evidence.filter(receipt => typeof receipt.amount === "number" && Number.isFinite(receipt.amount) &&
    receipt.amount > 0 && receipt.status !== "storno");

  if (startMonth != null) {
    for (const receipt of settled) {
      const writer = email(receipt.writtenBy);
      const paidMonth = month(receipt.payoutMonthKey);
      if (!writer || paidMonth == null) continue;
      const code = baseCommissionCodeForPayoutComparison(rawCode(receipt), entry.productKey);
      if (isFirstRenewalCode(code) && fitsAnnualPeriod(paidMonth, startMonth, 1)) {
        firstRenewals.set(writer, Math.min(paidMonth, firstRenewals.get(writer) ?? paidMonth));
        firstRenewalAmounts.set(writer, (firstRenewalAmounts.get(writer) ?? 0) + receipt.amount!);
      }
      const namedYear = subsequentIndex(code);
      if (namedYear > 0 && fitsAnnualPeriod(paidMonth, startMonth, namedYear)) {
        const years = namedRenewals.get(writer) ?? new Set<number>();
        years.add(namedYear);
        namedRenewals.set(writer, years);
      }
    }
  }

  for (const receipt of evidence) {
    const writer = email(receipt.writtenBy);
    const amount = receipt.amount;
    if (!firstRenewals.has(writer) || typeof amount !== "number" || !Number.isFinite(amount) ||
      (receipt.status !== "storno" && amount >= 0)) continue;
    const code = baseCommissionCodeForPayoutComparison(rawCode(receipt), entry.productKey);
    if (isFirstRenewalCode(code)) {
      firstRenewalAmounts.set(writer, (firstRenewalAmounts.get(writer) ?? 0) - Math.abs(amount));
    }
  }

  const shiftSubsequent = (writer: string, code: string, paidMonth: number | null) => {
    const index = subsequentIndex(code);
    const firstRenewal = firstRenewals.get(writer);
    return startMonth != null && paidMonth != null && firstRenewal != null && (firstRenewalAmounts.get(writer) ?? 0) > 0.005 && paidMonth > firstRenewal &&
      index > 0 && index < 99 && fitsAnnualPeriod(paidMonth, startMonth, index + 1) &&
      !namedRenewals.get(writer)?.has(index + 1);
  };

  const shiftedPayments = new Set<string>();
  const regularPayments = new Set<string>();
  for (const receipt of settled) {
    const writer = email(receipt.writtenBy);
    const code = baseCommissionCodeForPayoutComparison(rawCode(receipt), entry.productKey);
    if (!writer || !subsequentIndex(code)) continue;
    const key = JSON.stringify([writer, code]);
    (shiftSubsequent(writer, code, month(receipt.payoutMonthKey)) ? shiftedPayments : regularPayments).add(key);
  }

  return <T extends CommissionCodeReceipt>(receipt: T): T & AdjustedCommissionPayout => {
    const acquisition = projectAcquisition(receipt);
    if (acquisition !== receipt) return acquisition;
    // API projections can pass through the generator again.
    const writer = email(receipt.writtenBy);
    if (receipt.statementCode || !writer) return receipt;
    const paidMonth = month(receipt.payoutMonthKey);
    const code = rawCode(receipt);
    const comparable = baseCommissionCodeForPayoutComparison(code, entry.productKey);
    const index = subsequentIndex(comparable);
    const confirmed = confirmedMonth != null && writer === email(rule?.writtenBy) && paidMonth != null && paidMonth >= confirmedMonth;
    const reversed = receipt.status === "storno" || (receipt.amount ?? 0) < 0;
    const seriesKey = JSON.stringify([writer, comparable]);
    // A later reversal follows the matching positive payment when the same
    // original code does not also represent a regular payment.
    const shift = reversed
      ? shiftedPayments.has(seriesKey) && !regularPayments.has(seriesKey)
      : shiftSubsequent(writer, comparable, paidMonth);
    const corrected = annualFirstRenewalCommissionCode(entry, code) ??
      (index > 0 && index < 99 && (confirmed || shift) ? `B${101 + index}` : null);
    if (!corrected) return receipt;
    return {
      ...receipt,
      code: corrected,
      statementCode: receipt.code,
      commissionCodeCorrectionNote: `Oprava kódu výpisu ${code} → ${corrected}. Přiřazeno podle ročního provizního rozpisu smlouvy.`,
    };
  };
}

export function projectConfirmedCommissionCodes<T extends CommissionCodeReceipt>(
  entry: CommissionCodeContract, payouts: T[],
): (T & AdjustedCommissionPayout)[] {
  if (entry.productKey !== "neon" && entry.productKey !== "kooperativaAuto" && entry.frequencyRaw !== "semiannual" && !hasAnnualCommissionCodeSchedule(entry) &&
      !((entry.frequencyRaw === "quarterly" || entry.productKey === "cppPPRs") && entry.commissionPayoutCodeAdjustment)) return payouts;
  const project = createCommissionCodeProjection(entry, payouts);
  const projected = payouts.map(project);
  return projected.some((payout, index) => payout !== payouts[index]) ? projected : payouts;
}
