import { projectAcquisitionInstallmentReceipts } from "@/app/lib/acquisitionInstallmentCoverage";
import { isFrequencyAutoPayoutProduct } from "@/app/lib/productCatalog";
import { isPerPaymentSeparatedPeriodProduct } from "@/app/lib/separatedPeriodCommissions";
import { periodsPerYear } from "@/app/lib/productFormulas/shared";
import type { CashflowItem, EntryDoc } from "./types";

/** Called separately for each authorized entry and viewer, before statement shifting. */
export function coverAcquisitionCashflowInstallments(items: CashflowItem[], entry: EntryDoc): CashflowItem[] {
  if (entry.entryType === "endorsement" || entry.paymentFrequencyChanges?.length || !entry.frequencyRaw ||
    !(isFrequencyAutoPayoutProduct(entry.productKey) || isPerPaymentSeparatedPeriodProduct(entry.productKey))) return items;
  const plans = items.filter(item => !item.isStatementOnly && /^A1\d{2}$/.test(item.commissionCode ?? ""));
  if (plans.length !== periodsPerYear(entry.frequencyRaw)) return items;
  const schedule = plans.map(item => ({ code: item.commissionCode!, codes: [item.commissionCode!, ...(item.commissionCodeAliases ?? [])],
    amount: item.predictedAmount ?? item.amount, commissionPeriod: item.commissionPeriodStart }))
    .sort((left, right) => left.code.localeCompare(right.code));
  const payoutsByKey = new Map((entry.commissionPayouts ?? []).flatMap(payout =>
    payout.key ? [[payout.key, payout] as const] : []));
  const receipts = items.flatMap((item, index) => {
    if (item.payoutStatus !== "paid") return [];
    const payout = item.commissionPayoutKey ? payoutsByKey.get(item.commissionPayoutKey) : undefined;
    return [{
      ...payout, index, key: item.commissionPayoutKey, code: item.commissionCode, amount: item.amount,
      status: item.amount <= 0 ? "storno" : payout?.status ?? "paid",
    }];
  });
  const projected = projectAcquisitionInstallmentReceipts(receipts, schedule);
  if (projected === receipts) return items;
  const result = [...items];
  for (const receipt of projected) {
    if (!receipt.installmentCoverageNote) continue;
    const source = items[receipt.index];
    const targetIndex = items.findIndex(item => plans.includes(item) && item.commissionCode === receipt.code);
    if (targetIndex < 0) return items;
    const target = items[targetIndex];
    result[targetIndex] = {
      ...target, amount: receipt.amount, date: source.date, payoutStatus: "paid",
      predictedAmount: target.predictedAmount ?? target.amount,
      originalDate: target.originalDate ?? target.date,
      commissionPayoutKey: receipt.key,
      commissionStatementNumber: source.commissionStatementNumber,
      commissionStatementPeriod: source.commissionStatementPeriod,
      installmentCoverageNote: receipt.installmentCoverageNote,
    };
  }
  return result;
}
