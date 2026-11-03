import type { CashflowSectionGroup } from "./monthSections";
import type { CashflowItem, MonthGroup } from "./types";

type MonthTotals = Pick<MonthGroup, "total" | "totalSource" | "statementPayoutTotal" | "extraPayoutTotal"> & { items?: CashflowItem[] };

/** The overview omits items, so derive the receipt supplement from its totals. */
export function paidSubscriptionAmount(month: MonthTotals): number {
  if (month.totalSource !== "paid") return 0;
  if (month.statementPayoutTotal != null) {
    return Math.round((month.total - month.statementPayoutTotal - (month.extraPayoutTotal ?? 0)) * 100) / 100;
  }
  return Math.round((month.items ?? []).reduce((sum, item) =>
    isSubscription(item) && item.payoutStatus === "paid" ? sum + item.amount : sum, 0) * 100) / 100;
}

export function cashflowMonthSourceLabel(month: MonthTotals): string {
  if (month.totalSource !== "paid") return "Předpoklad";
  if ((month.extraPayoutTotal ?? 0) !== 0) {
    if (month.statementPayoutTotal == null) return "Včetně odměny";
    return paidSubscriptionAmount(month) !== 0 ? "Výpis + předplatné + odměna" : "Výpis + odměna";
  }
  return paidSubscriptionAmount(month) !== 0 ? "Výpis + předplatné" : "Dle výpisu";
}

function formatCount(count: number, singular: string, few: string, many: string): string {
  return `${count} ${count === 1 ? singular : count >= 2 && count <= 4 ? few : many}`;
}

function isSubscription(item: CashflowItem): boolean {
  return item.isSubscriptionPayment === true || item.productKey === "subscription";
}

export function formatCashflowItemCount(items: CashflowItem[]): string {
  const payments = items.filter(isSubscription).length;
  const extras = items.filter(item => item.isExtraPayout && !isSubscription(item)).length;
  const commissions = items.length - payments - extras;
  return [
    commissions > 0 ? formatCount(commissions, "provize", "provize", "provizí") : null,
    payments > 0 ? formatCount(payments, "platba", "platby", "plateb") : null,
    extras > 0 ? formatCount(extras, "odměna", "odměny", "odměn") : null,
  ].filter(Boolean).join(" · ") || "0 provizí";
}

export function formatCashflowGroupCount(groups: CashflowSectionGroup[]): string {
  const contracts = new Set(groups
    .filter(({ leadItem }) => !leadItem.isTipPayout && !leadItem.isExtraPayout && !isSubscription(leadItem))
    .map(group => group.contractGroupId ?? group.id)).size;
  return [
    contracts > 0 ? formatCount(contracts, "smlouva", "smlouvy", "smluv") : null,
    formatCashflowItemCount(groups.flatMap((group) => group.items)),
  ].filter(Boolean).join(" · ");
}
