import type { CommissionResultItemDTO } from "../types/domain";
import { commissionStatementDay, COMMISSION_PAYOUT_AMOUNT_TOLERANCE } from "./commissionReceipts";
import { createEndorsementCommissionPlan, type EndorsementCommissionPlanEntry } from "./endorsementCommissionPlan";
import { matchingNeonRecurringStatementPremium, neonRecurringStatementPeriod } from "./neonRecurringStatementBase";
import { payoutExceptionStatementMonth, payoutPositionException, payoutPositionExceptionItems } from "./payoutPositionException";

type Receipt = Parameters<typeof commissionStatementDay>[0] & {
  difference?: number | null; detail?: string | null;
};
type Entry = EndorsementCommissionPlanEntry & Parameters<typeof payoutPositionExceptionItems>[0] & {
  managerOverrides?: { email?: string | null; items?: CommissionResultItemDTO[] | null }[] | null;
  commissionPayouts?: Receipt[] | null;
};
const email = (value?: string | null) => value?.trim().toLowerCase();
const cents = (value: number) => Math.round(value * 100);

/** Older imports stored a comparison against the original premium, before the amendment existed in the app. */
function compareCareReceipt(entry: Entry, receipt: Receipt, plan: ReturnType<typeof createEndorsementCommissionPlan>): Receipt {
  if (!/^B20[1-6]$/.test(receipt.code ?? "") || !receipt.writtenBy || !receipt.statementId ||
      (receipt.status !== "paid" && receipt.status !== "difference") ||
      ((receipt.status === "difference" || receipt.differenceReason) && receipt.differenceReason !== "commission_amount_mismatch") ||
      receipt.detail?.startsWith("Součást opravného výpisu") ||
      !(typeof receipt.amount === "number" && receipt.amount > 0 && Number.isFinite(receipt.amount)) ||
      !(typeof receipt.expectedAmount === "number" && receipt.expectedAmount > 0 && Number.isFinite(receipt.expectedAmount))) return receipt;
  const period = neonRecurringStatementPeriod(entry.policyStartDate, receipt.code, commissionStatementDay(receipt));
  if (!period) return receipt;
  const premiumAt = (day: string) => {
    const premium = plan.neonRecurringPremium(entry, day);
    return premium && { ...premium, annualPremium: premium.monthlyPremium * 12 };
  };
  // An explicitly reported base can establish a change within this insurance year.
  // Without one, only changes already effective at the start of the year apply.
  const statementBase = receipt.sourceBaseAmount ?? receipt.statementBaseAmount;
  const premium = statementBase == null ? premiumAt(period.due)
    : matchingNeonRecurringStatementPremium(period, statementBase, premiumAt);
  if (!premium || premium.monthlyPremium >= premium.originalMonthlyPremium) return receipt;

  const writer = email(receipt.writtenBy);
  const own = writer === email(entry.userEmail ?? entry.adviserEmail);
  const month = payoutExceptionStatementMonth(receipt.statementPeriod, receipt.payoutMonthKey ?? null);
  let items = entry.items;
  if (!own) items = entry.managerOverrides?.find(override => email(override.email) === writer)?.items;
  else if (payoutPositionException(entry, month)) items = payoutPositionExceptionItems(entry, { keepUnmatched: false });
  const care = items?.filter(item => item.code === "B201-B206" || (!item.code && /(?:pečovatelská|následná).*5.*10/i.test(item.title)));
  if (care?.length !== 1 || !Number.isFinite(care[0].amount) || cents(care[0].amount) !== cents(receipt.expectedAmount)) return receipt;
  const expected = cents(care[0].amount * (premium.monthlyPremium / premium.originalMonthlyPremium));
  if (expected === cents(receipt.expectedAmount)) return receipt;
  const difference = cents(receipt.amount) - expected;
  const underpaid = difference < -cents(COMMISSION_PAYOUT_AMOUNT_TOLERANCE);
  return { ...receipt, expectedAmount: expected / 100,
    difference: difference / 100, status: underpaid ? "difference" : "paid",
    differenceReason: underpaid ? "commission_amount_mismatch" : null, detail: null };
}

export function projectNeonCareReceiptComparisons<T extends Entry>(entries: T[]): T[] {
  if (!entries.some(entry => entry.productKey === "neon" && entry.entryType === "endorsement")) return entries;
  const plan = createEndorsementCommissionPlan(entries);
  return entries.map(entry => {
    const records = entry.commissionPayouts;
    if (entry.productKey !== "neon" || entry.entryType === "endorsement" || !records?.length) return entry;
    const projected = records.map(receipt => compareCareReceipt(entry, receipt, plan));
    return projected.some((receipt, i) => receipt !== records[i]) ? { ...entry, commissionPayouts: projected } : entry;
  });
}
