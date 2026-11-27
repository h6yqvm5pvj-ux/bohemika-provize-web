import { autoAnnualPremiumAtDate, type PaymentFrequencyContract } from "./autoPaymentFrequency";
import { commissionPeriodForCode } from "./commissionPeriodForCode";
import { baseCommissionCodeForPayoutComparison } from "./commissionPayoutRules";
import { endorsementCommissionDay } from "./endorsementCommissionPlan";
import { isFrequencyAutoPayoutProduct } from "./productCatalog";
import { installmentCommissionScheduleFromCode } from "./productFormulas/autoCommission";

export type AutoCommissionReceipt = {
  code?: string | null;
  statementCode?: string | null;
  statementDate?: string | null;
  statementPeriod?: string | null;
  amount?: number | null;
  status?: string | null;
  payoutMonthKey?: string | null;
  sourceBaseAmount?: number | null;
  statementBaseAmount?: number | null;
  expectedAmount?: number | null;
  differenceReason?: string | null;
};

type Contract = Omit<PaymentFrequencyContract, "paymentFrequencyChanges"> & { paymentFrequencyChanges?: readonly unknown[] | null;
  inputAmount?: number | null; signedAnnualPremiumOverride?: number | null; entryType?: string | null; policyEndDate?: unknown };
const cents = (value: number) => Math.round(value * 100);
const positive = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
const baseOf = (receipt: AutoCommissionReceipt) => receipt.sourceBaseAmount ?? receipt.statementBaseAmount;
const isReversal = (receipt: AutoCommissionReceipt) => receipt.status === "storno" || (receipt.amount ?? 0) < 0;
const within = (value: number, reference: number, margin: number) => Math.abs(value - reference) <= Math.max(0.02, reference * margin);
const originalCode = (receipt: AutoCommissionReceipt, contract: Contract) =>
  baseCommissionCodeForPayoutComparison(receipt.statementCode ?? receipt.code, contract.productKey);
const scheduledPeriod = (contract: Contract, code: string) => commissionPeriodForCode({ ...contract, paymentFrequencyChanges: null }, code);

function monthNumber(key: string | null | undefined): number | null {
  const match = /^(\d{4})-(\d{1,2})$/.exec(key ?? "");
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) return null;
  return Number(match[1]) * 12 + Number(match[2]);
}

export function autoCommissionReceiptMonth(receipt: AutoCommissionReceipt | null | undefined): number | null {
  const paidMonth = monthNumber(receipt?.payoutMonthKey);
  if (paidMonth != null) return paidMonth;
  const statementDate = typeof receipt?.statementDate === "string" ? receipt.statementDate.trim() : "";
  const dated = /^(?:\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/.exec(statementDate);
  if (dated) return monthNumber(`${dated[2]}-${dated[1]}`);
  const isoDate = /^(\d{4}-\d{2})-\d{2}$/.exec(statementDate);
  if (isoDate) return monthNumber(isoDate[1]);
  const periodEnd = /-\s*\d{1,2}\.\s*(\d{1,2})\.\s*(\d{4})\s*$/.exec(receipt?.statementPeriod ?? "");
  const periodMonth = periodEnd ? monthNumber(`${periodEnd[2]}-${periodEnd[1]}`) : null;
  return periodMonth == null ? null : periodMonth + 1;
}

// Undefined means there is no surviving payment. Null means the evidence is ambiguous.
function effectiveReceipt(rows: AutoCommissionReceipt[]): AutoCommissionReceipt | null | undefined {
  const payments = rows.filter(row => !isReversal(row));
  for (const reversal of rows.filter(isReversal)) {
    const reversalMonth = autoCommissionReceiptMonth(reversal);
    const matches = payments.filter(payment => {
      const paidMonth = autoCommissionReceiptMonth(payment);
      return reversalMonth != null && paidMonth != null && paidMonth <= reversalMonth &&
        cents(payment.amount!) === cents(Math.abs(reversal.amount!));
    });
    if (matches.length !== 1) return null;
    payments.splice(payments.indexOf(matches[0]), 1);
  }
  if (!payments.length) return undefined;
  const payment = payments.length === 1 ? payments[0] : null;
  if (!payment || payment.differenceReason === "career_mismatch" || payment.differenceReason === "premium_base_mismatch" ||
    (positive(payment.expectedAmount) && payment.amount! < payment.expectedAmount - 10)) return null;
  return payment;
}

const isNearInstallment = (receipt: AutoCommissionReceipt | null | undefined, period: string | null, earlyMonths = 0): boolean => {
  const paidMonth = autoCommissionReceiptMonth(receipt);
  const periodMonth = monthNumber(period?.slice(0, 7));
  return paidMonth != null && periodMonth != null && paidMonth >= periodMonth - earlyMonths && paidMonth <= periodMonth + 2;
};

const supportsSemiannualCoverage = (contract: Contract) =>
  contract.frequencyRaw === "semiannual" && contract.entryType !== "endorsement" && !contract.paymentFrequencyChanges?.length &&
  isFrequencyAutoPayoutProduct(contract.productKey) && contract.productKey !== "uniqaAuto" && contract.productKey !== "uniqaflotila";

/** An even B code can carry the whole year's base when its payout also matches two installments. */
export function combinedSemiannualAutoPremium(
  contract: Contract, receipt: AutoCommissionReceipt, evidence: readonly AutoCommissionReceipt[], plannedSingle?: number,
) {
  if (!supportsSemiannualCoverage(contract) || !positive(receipt.amount) || isReversal(receipt)) return null;
  const code = originalCode(receipt, contract);
  if (!/^B1(?!00)\d{2}$/.test(code)) return null;
  const index = Number(code.slice(1)) - 100;
  const base = baseOf(receipt);
  const period = scheduledPeriod(contract, code);
  const paidMonth = autoCommissionReceiptMonth(receipt);
  if (index % 2 !== 0 || !positive(base) || !isNearInstallment(receipt, period)) return null;
  const firstCode = `B${99 + index}`;
  const anniversaryDate = scheduledPeriod(contract, firstCode);
  if (!anniversaryDate) return null;
  const matchedPriorPayment = evidence.some(payment => {
    const previousMonth = autoCommissionReceiptMonth(payment);
    const previousBase = baseOf(payment);
    const previousCode = originalCode(payment, contract);
    const acquisition = /^A10[12]$/.test(previousCode);
    return (previousCode === firstCode || acquisition) &&
      !isReversal(payment) && positive(payment.amount) && positive(previousBase) &&
      previousMonth != null && paidMonth != null && previousMonth <= paidMonth && paidMonth - previousMonth <= (acquisition ? 18 : 12) &&
      within(base, previousBase * 2, 0.02) && within(receipt.amount!, payment.amount * 2, 0.08);
  });
  const annualPremium = autoAnnualPremiumAtDate({ ...contract, paymentFrequencyChanges: null }, anniversaryDate);
  const matchesContract = positive(annualPremium) && positive(plannedSingle) &&
    within(base, annualPremium, 0.02) && within(receipt.amount, plannedSingle * 2, 0.08);
  return matchedPriorPayment || matchesContract ? { firstCode, anniversaryDate, anniversaryNumber: index / 2 } : null;
}

/** Reconcile counts over one authorized receipt ledger. The original payment stays with its statement code and month. */
export function semiannualAutoInstallmentCoverage(contract: Contract, receipts: readonly AutoCommissionReceipt[], plannedSingle?: number) {
  const empty = { combined: null, combinedWithCode: null, coveredCode: null, reassigned: new Map<AutoCommissionReceipt, string>() };
  if (!supportsSemiannualCoverage(contract)) return empty;

  const byIndex = new Map<number, AutoCommissionReceipt[]>();
  const acquisition: AutoCommissionReceipt[] = [];
  for (const receipt of receipts) {
    const code = originalCode(receipt, contract);
    const schedule = installmentCommissionScheduleFromCode(code, "semiannual");
    if (/^B1\d{2}-/.test(code)) return empty;
    if (schedule?.phase === "initial") acquisition.push(receipt);
    if (schedule?.phase !== "subsequent") continue;
    if (!/^B1(?!00)\d{2}$/.test(code)) return empty;
    if (!Number.isFinite(receipt.amount) || !receipt.amount || !["", "paid", "difference", "storno"].includes(receipt.status ?? "")) return empty;
    const index = schedule.paymentIndex;
    const group = byIndex.get(index) ?? [];
    group.push(receipt);
    byIndex.set(index, group);
  }

  const effective = new Map([...byIndex].map(([index, rows]) => [index, effectiveReceipt(rows)]));
  const combinedPayments = [...effective].flatMap(([index, receipt]) => {
    if (!receipt) return [];
    const premium = combinedSemiannualAutoPremium(contract, receipt, [...(byIndex.get(index - 1) ?? []), ...acquisition], plannedSingle);
    return premium ? [{ index, receipt, firstCode: premium.firstCode }] : [];
  });
  if (combinedPayments.length !== 1) return empty;
  const { index: combinedIndex, receipt: combined, firstCode } = combinedPayments[0];
  const unassigned = { ...empty, combined };
  const firstPayment = effective.get(combinedIndex - 1);
  if (firstPayment === undefined) {
    return { ...unassigned, combinedWithCode: firstCode, coveredCode: firstCode };
  }

  const followingCode = `B${101 + combinedIndex}`;
  if (!firstPayment || !isNearInstallment(firstPayment, scheduledPeriod(contract, followingCode))) return unassigned;
  const countsForBothPeriods = { ...unassigned, combinedWithCode: firstCode };
  const second = effective.get(combinedIndex + 1);
  const secondCode = `B${102 + combinedIndex}`;
  if (!positive(firstPayment.amount) || !second || !positive(second.amount) ||
    !within(second.amount, firstPayment.amount, 0.01) || !isNearInstallment(second, scheduledPeriod(contract, secondCode))) return countsForBothPeriods;

  // The same amount in the two following half years establishes the offset.
  // Only continue through a chronological, consecutive suffix without collisions.
  const reassigned = new Map([[firstPayment, followingCode]]);
  const last = Math.max(...byIndex.keys());
  const policyEnd = endorsementCommissionDay(contract.policyEndDate);
  let priorMonth = autoCommissionReceiptMonth(firstPayment)!;
  for (let index = combinedIndex + 1; index <= last; index++) {
    // A skipped source code can end the offset without colliding with any of
    // the installments already assigned. Later exact codes keep their place.
    if (!byIndex.has(index)) break;
    const receipt = effective.get(index);
    const paidMonth = autoCommissionReceiptMonth(receipt);
    const code = `B${101 + index}`;
    const period = scheduledPeriod(contract, code);
    const earlyMonths = index % 2 === 0 ? 2 : 0;
    if (!receipt || paidMonth == null || paidMonth <= priorMonth || !period || (policyEnd && period > policyEnd) || !isNearInstallment(receipt, period, earlyMonths)) return countsForBothPeriods;
    if (earlyMonths === 0 && index > combinedIndex + 1) {
      const precedingAmount = effective.get(index - 1)?.amount;
      if (!positive(precedingAmount) || !positive(receipt.amount) || !within(receipt.amount, precedingAmount, 0.01)) return countsForBothPeriods;
    }
    reassigned.set(receipt, code);
    priorMonth = paidMonth;
  }
  return { ...countsForBothPeriods, coveredCode: firstCode, reassigned };
}
