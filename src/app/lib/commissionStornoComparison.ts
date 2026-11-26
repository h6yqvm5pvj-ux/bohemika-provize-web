import { baseCommissionCodeForPayoutComparison, isFirstYearAutoACommissionPayout } from "./commissionPayoutRules";
import { commissionPeriodAfterMonths, commissionPeriodForCode } from "./commissionPeriodForCode";
import { commissionStatementDay, contractStornoDeductionKind, isStornoPayoutRecord } from "./commissionReceipts";
import { endorsementCommissionDay } from "./endorsementCommissionPlan";
import { lifeIncreaseItemCode, normalizeLifeCommissionItemCode } from "./lifePremiumIncrease";
import { nonLifeCommissionStornoEstimate } from "./nonLifeCommissionStorno";
import { isLifeProduct } from "./productCatalog";
import type { PaymentFrequencyContract } from "./autoPaymentFrequency";
import type { CommissionResultItemDTO, Product } from "@/app/types/domain";

type Receipt = Parameters<typeof commissionStatementDay>[0] & {
  statementNumber?: string | null;
  writtenAtMs?: number | null;
  detail?: string | null;
  title?: string | null;
  correction?: boolean;
  basePremiumPeriod?: "annual";
};

export type CommissionStornoEntry = PaymentFrequencyContract & {
  id: string;
  entryType?: string | null;
  rootContractEntryId?: string | null;
  isRefresh?: boolean | null;
  contractSignedDate?: unknown;
  policyEndDate?: unknown;
  durationYears?: number | null;
  durationMonths?: number | null;
  commissionPayouts?: readonly Receipt[] | null;
  items?: readonly CommissionResultItemDTO[] | null;
  managerOverrides?: readonly { email?: string | null; items?: readonly CommissionResultItemDTO[] | null }[] | null;
};

type StatementDeductions = {
  id?: string | null;
  number?: string | null;
  period?: string | null;
  day: string;
  rows: readonly { code: string; amount: number; correction?: boolean }[];
};

export type CommissionStornoRow = {
  code: string;
  paid: number | null;
  includesPayoutWithoutPriorDate?: true;
  estimated: number | null;
  usingNewerTerms?: true;
  deducted: number | null;
  difference: number | null;
};

type NeonStornoTerms = {
  start: string;
  effective: string;
  atStart: boolean;
  withinFirstTwoMonths: boolean;
  usePaidBasis: boolean;
};

// Bohemika's cppneon2019.pdf and cppneon2024.pdf both document recurring
// storno. Page 3 of the 2024 LIFE addendum shows 60/60 on the paid amount.
const NEON_STORNO_TERMS_FROM = "2019-10-01";
const NEON_LIFE_PAID_STORNO_BASIS_FROM = "2024-07-01";
const ACQUISITION_LIFE_CODES = new Set(["A101", "A201", "B0301", "B3601", "B4801", "B3601_HALF"]);
const norm = (value: unknown) => typeof value === "string" ? value.trim().toLowerCase() : "";

export function commissionStornoCode(value: unknown, product?: Product | null): string {
  const code = baseCommissionCodeForPayoutComparison(value, product);
  if (!isLifeProduct(product)) return code;
  if (["B36_HALF", "B036_HALF"].includes(code)) return "B3601_HALF";
  if (code === "B301") return "B0301";
  if (["NB36", "NB036"].includes(code)) return "NB3601";
  if (["NB48", "NB048"].includes(code)) return "NB4801";
  return normalizeLifeCommissionItemCode(code);
}

function monthsStarted(start: string, end: string): number {
  const [startYear, startMonth] = start.split("-").map(Number);
  const [endYear, endMonth] = end.split("-").map(Number);
  const months = (endYear - startYear) * 12 + endMonth - startMonth;
  const anniversary = commissionPeriodAfterMonths(start, months);
  return anniversary && end > anniversary ? months + 1 : months;
}

function neonStornoTerms(entry: CommissionStornoEntry, effective: string): NeonStornoTerms | null {
  const start = endorsementCommissionDay(entry.policyStartDate);
  if (!start || effective < start || entry.isRefresh) return null;
  const signed = endorsementCommissionDay(entry.contractSignedDate) ?? start;
  if (signed < NEON_STORNO_TERMS_FROM) return null;
  const earlyBoundary = commissionPeriodAfterMonths(start, 2);
  // Both NEON addenda define the earlier of the paid-through and effective
  // dates. Only the effective date is available for a contract estimate.
  return {
    start,
    effective,
    atStart: effective === start,
    withinFirstTwoMonths: earlyBoundary !== null && effective <= earlyBoundary,
    usePaidBasis: signed >= NEON_LIFE_PAID_STORNO_BASIS_FROM,
  };
}

function neonStornoEstimate(entry: CommissionStornoEntry, terms: NeonStornoTerms, code: string, paid: number): number | null {
  if (code === "A201") return null;
  if (terms.atStart) return paid;
  const isAmendment = entry.entryType === "endorsement";
  if (!isAmendment && /^B(?:10[1-4]|20[1-6])$/.test(code)) {
    const from = commissionPeriodForCode({ productKey: "neon", policyStartDate: terms.start }, code);
    return from ? proratedLifeRefund(paid, from, terms.effective, 12) : null;
  }
  const planCode = isAmendment ? lifeIncreaseItemCode(code) : code;
  if (isAmendment && planCode === "A101" && !/^NV(?:PZ?|Z)?101$/.test(code)) return null;
  if (!planCode || !ACQUISITION_LIFE_CODES.has(planCode)) return null;
  // The internal estimate returns the full acquisition payout for early terminations.
  if (terms.withinFirstTwoMonths) return paid;
  return proratedLifeRefund(paid, terms.start, terms.effective, 60);
}

function proratedLifeRefund(paid: number, start: string, effective: string, term: number) {
  const elapsed = Math.min(term, Math.max(0, monthsStarted(start, effective)));
  return Math.round(paid * (term - elapsed) / term);
}

function flexiAcquisitionRefund(policy: CommissionStornoEntry, component: string | null, effective: string, paid: number) {
  const start = endorsementCommissionDay(policy.policyStartDate);
  if (!start || effective < start || !component || !ACQUISITION_LIFE_CODES.has(component)) return null;
  const earlyBoundary = commissionPeriodAfterMonths(start, 2);
  if (earlyBoundary && effective <= earlyBoundary) return paid;

  const end = endorsementCommissionDay(policy.policyEndDate);
  // A policy end date on or before storno may reflect the termination itself.
  const agreedDuration = policy.durationMonths ?? (policy.durationYears ? Math.round(policy.durationYears * 12) : null);
  const duration = agreedDuration ?? (end && end > effective ? monthsStarted(start, end) : 60);
  if (!Number.isSafeInteger(duration) || duration <= 0) return null;
  return proratedLifeRefund(paid, start, effective, Math.min(duration, 60));
}

function lifeMonths(entry: CommissionStornoEntry, start: string, stornoDay: string) {
  const end = endorsementCommissionDay(entry.policyEndDate);
  const duration = end && end > start ? monthsStarted(start, end)
    : entry.durationMonths ?? (entry.durationYears ? Math.round(entry.durationYears * 12) : 60);
  if (!Number.isSafeInteger(duration) || duration <= 0) return null;
  const term = Math.min(duration, 60);
  return Math.min(monthsStarted(start, stornoDay), term) / term;
}

function receiptRows(entry: CommissionStornoEntry, viewer: string, statement?: StatementDeductions) {
  const unique = new Map<string, Receipt>();
  const legacy: Receipt[] = [];
  for (const payout of entry.commissionPayouts ?? []) {
    if (norm(payout.writtenBy) !== viewer || !["", "paid", "difference", "storno"].includes(norm(payout.status))) continue;
    if (!payout.key || !payout.statementId) {
      legacy.push(payout);
      continue;
    }
    const identity = JSON.stringify([payout.statementId, payout.key]);
    const previous = unique.get(identity);
    if (!previous || (payout.writtenAtMs ?? 0) >= (previous.writtenAtMs ?? 0)) unique.set(identity, payout);
  }
  const receipts = [...unique.values(), ...legacy];
  if (!statement) return receipts;
  const storedDeductions = receipts.filter(payout => isStornoPayoutRecord(payout) && (
    (statement.id && payout.statementId === statement.id) ||
    (statement.number && statement.period && norm(payout.statementNumber) === norm(statement.number) &&
      norm(payout.statementPeriod) === norm(statement.period))
  ));
  const storedCodes = new Set(storedDeductions.map(payout =>
    commissionStornoCode(payout.statementCode || payout.code, entry.productKey)));
  // Keep saved amounts and code mappings when reopening an imported statement.
  const newRows = statement.rows.filter(row => !storedCodes.has(row.code));
  return [...receipts, ...newRows.map((row): Receipt => ({
    code: row.code, amount: row.amount, status: "storno", statementDate: statement.day, correction: row.correction,
  }))];
}

type CodeAmounts = {
  paid: number; deducted: number; hasDeduction: boolean; uncertain: boolean;
  hasAnnualPayment: boolean; hasPeriodPayment: boolean;
  neonInvestment: boolean; fullDeferredRefund: boolean; includesPayoutWithoutPriorDate: boolean;
};

function isDeferredCommissionCancelledBeforeDue(entry: CommissionStornoEntry, policy: CommissionStornoEntry | undefined, code: string, day: string) {
  const product = entry.productKey;
  if (!policy || (product !== "flexi" && product !== "neon") || policy.productKey !== product || policy.isRefresh) return false;
  const component = entry.entryType === "endorsement" ? lifeIncreaseItemCode(code) : code;
  if (component !== "B3601" && component !== "B4801") return false;
  const start = endorsementCommissionDay(policy.policyStartDate);
  if (!start || day < start) return false;
  const due = commissionPeriodForCode(policy, component);
  return due !== null && day < due;
}

function entryRows(entry: CommissionStornoEntry, viewer: string, owner: string, day: string,
  policy: CommissionStornoEntry | undefined, terms: NeonStornoTerms | null, statement?: StatementDeductions) {
  const start = endorsementCommissionDay(entry.policyStartDate);
  const product = entry.productKey;
  const groups = new Map<string, CodeAmounts>();
  for (const receipt of receiptRows(entry, viewer, statement)) {
    const amount = typeof receipt.amount === "number" ? Math.round(Math.abs(receipt.amount) * 100) : 0;
    if (!Number.isSafeInteger(amount) || amount <= 0) continue;
    const code = commissionStornoCode(receipt.code || receipt.statementCode, product);
    const group = groups.get(code) ?? {
      paid: 0, deducted: 0, hasDeduction: false, uncertain: false, hasAnnualPayment: false, hasPeriodPayment: false, neonInvestment: false,
      fullDeferredRefund: isDeferredCommissionCancelledBeforeDue(entry, policy, code, day),
      includesPayoutWithoutPriorDate: false,
    };
    // An exact statement date can establish a payment before storno even when
    // the reporting period closes after the effective date.
    const receiptDay = (group.fullDeferredRefund ? commissionStatementDay({ statementDate: receipt.statementDate }) : null) ??
      commissionStatementDay(receipt);
    const isStorno = isStornoPayoutRecord(receipt);
    const correction = receipt.correction || receipt.detail?.startsWith("Součást opravného výpisu");
    // An ended policy cannot earn a future deferred commission. Include the
    // booked payment and its corrections even if the statement comes later.
    const countsTowardFullDeferredRefund = group.fullDeferredRefund && (!isStorno || correction);
    if (contractStornoDeductionKind(receipt, day, receiptDay) === "storno") {
      group.deducted += amount;
      group.hasDeduction = true;
    } else if (countsTowardFullDeferredRefund || (receiptDay && (receiptDay < day || (terms?.atStart && (!isStorno || correction))))) {
      group.paid += isStorno ? -amount : amount;
      if (!isStorno) {
        group.includesPayoutWithoutPriorDate ||= group.fullDeferredRefund && (!receiptDay || receiptDay >= day);
        if (receipt.basePremiumPeriod === "annual") group.hasAnnualPayment = true;
        else group.hasPeriodPayment = true;
        if (/^CPP_(?:N_INVS|NRF_IN)\b/i.test(receipt.title ?? "")) group.neonInvestment = true;
      }
    } else if (!isStorno || !receiptDay) {
      // Receipts without a date and payments issued from the storno date may
      // affect the amount already paid. They require manual reconciliation.
      group.uncertain = true;
    }
    groups.set(code, group);
  }

  const overrides = (entry.managerOverrides ?? []).filter(override => norm(override.email) === viewer);
  const items = viewer === owner ? entry.items : overrides.length === 1 ? overrides[0].items : null;
  return [...groups].flatMap(([code, group]): CommissionStornoRow[] => {
    if (group.paid <= 0 && !group.hasDeduction && !group.uncertain) return [];
    let estimated: number | null = null;
    let usingNewerTerms = false;
    if (code && !group.uncertain && group.paid > 0 && (group.fullDeferredRefund || terms?.atStart || (start && start <= day))) {
      const earlyBoundary = commissionPeriodAfterMonths(start, 2);
      const neonRecurring = /^B(?:10[1-4]|20[1-6])$/.test(code);
      if (group.fullDeferredRefund) {
        estimated = group.paid;
      } else if (product === "flexi" && policy?.productKey === "flexi") {
        const component = entry.entryType === "endorsement" ? lifeIncreaseItemCode(code) : code;
        estimated = flexiAcquisitionRefund(policy, component, day, group.paid);
      } else if (terms && (terms.usePaidBasis || terms.withinFirstTwoMonths || neonRecurring || code === "A201" || group.neonInvestment)) {
        if (!group.neonInvestment) estimated = neonStornoEstimate(entry, terms, code, group.paid);
      } else if (earlyBoundary && day <= earlyBoundary && isFirstYearAutoACommissionPayout({ product, commissionCode: code })) {
        estimated = group.paid;
      } else if (start && product !== "pillowInjury" && isLifeProduct(product)) {
        const planCode = entry.entryType === "endorsement" ? lifeIncreaseItemCode(code) : code;
        if (planCode && ACQUISITION_LIFE_CODES.has(planCode)) {
          const elapsedShare = terms ? Math.min(60, Math.max(0, monthsStarted(terms.start, terms.effective))) / 60
            : lifeMonths(entry, start, day);
          const planned = (items ?? []).filter(item => !item.excludeFromTotal &&
            commissionStornoCode(item.code, product) === planCode);
          if (elapsedShare !== null && planned.length === 1 &&
              Number.isFinite(planned[0].amount) && planned[0].amount > 0) {
            const earned = Math.round(planned[0].amount * 100 * elapsedShare);
            estimated = elapsedShare === 1 ? 0 : Math.max(0, group.paid - earned);
          }
        }
      } else if (start) {
        const basis = group.hasAnnualPayment ? (group.hasPeriodPayment ? "mixed" : "annual") : "period";
        const estimate = nonLifeCommissionStornoEstimate(entry, start, code, day, basis);
        if (estimate) {
          estimated = Math.round(group.paid * estimate.share);
          usingNewerTerms = estimate.usingNewerTerms;
        }
      }
    }
    const paid = group.uncertain || group.paid <= 0 ? null : group.paid;
    return [{ code, paid, estimated,
      ...(paid !== null && group.includesPayoutWithoutPriorDate ? { includesPayoutWithoutPriorDate: true } : {}),
      ...(usingNewerTerms ? { usingNewerTerms: true } : {}),
      deducted: group.hasDeduction ? group.deducted : null, difference: estimated === null || !group.hasDeduction
        ? null : group.deducted - estimated }];
  });
}

export function buildCommissionStornoComparison({
  entries, ownerEmail, viewerEmail, stornoDate, statement,
}: {
  entries: readonly CommissionStornoEntry[];
  ownerEmail?: string | null;
  viewerEmail?: string | null;
  stornoDate: unknown;
  statement?: StatementDeductions;
}): CommissionStornoRow[] {
  const viewer = norm(viewerEmail);
  const owner = norm(ownerEmail);
  const day = endorsementCommissionDay(stornoDate);
  if (!viewer || !owner || !day || (statement && (entries.length !== 1 || viewer !== owner || statement.day < day))) return [];
  const rows = new Map<string, CommissionStornoRow>();
  const policies = new Map(entries.filter(entry => entry.entryType !== "endorsement").map(entry => [entry.id, entry]));
  const neonRoots = new Map([...policies.values()].filter(entry => entry.productKey === "neon")
    .map(entry => [entry.id, neonStornoTerms(entry, day)]));
  const add = (left: number | null, right: number | null) => left === null || right === null ? null : left + right;
  for (const entry of entries) {
    const rootId = entry.entryType === "endorsement" ? entry.rootContractEntryId : entry.id;
    const terms = entry.productKey === "neon" && rootId ? neonRoots.get(rootId) ?? null : null;
    for (const row of entryRows(entry, viewer, owner, day, rootId ? policies.get(rootId) : undefined, terms, statement)) {
      const previous = rows.get(row.code);
      if (!previous) rows.set(row.code, row);
      else {
        const estimated = add(previous.estimated, row.estimated);
        const paid = add(previous.paid, row.paid);
        const deducted = previous.deducted === null && row.deducted === null ? null : (previous.deducted ?? 0) + (row.deducted ?? 0);
        rows.set(row.code, { code: row.code, paid, estimated, deducted,
          ...(paid !== null && (previous.includesPayoutWithoutPriorDate || row.includesPayoutWithoutPriorDate) ? { includesPayoutWithoutPriorDate: true } : {}),
          ...(estimated !== null && (previous.usingNewerTerms || row.usingNewerTerms) ? { usingNewerTerms: true } : {}),
          difference: estimated === null || deducted === null ? null : deducted - estimated });
      }
    }
  }
  return [...rows.values()].sort((a, b) => a.code.localeCompare(b.code, "cs", { numeric: true }));
}
