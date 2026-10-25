import type { CashflowSectionGroup } from "./monthSections";
import type { CashflowItem, MonthGroup } from "./types";

type MonthTotals = Pick<MonthGroup, "total" | "totalSource" | "statementPayoutTotal">;

/** The overview omits items, so derive the receipt supplement from its totals. */
export function paidSubscriptionAmount(month: MonthTotals): number {
  return month.totalSource === "paid" && month.statementPayoutTotal != null
    ? Math.round((month.total - month.statementPayoutTotal) * 100) / 100 : 0;
}

export function cashflowMonthSourceLabel(month: MonthTotals): string {
  if (month.totalSource !== "paid") return "Předpoklad";
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
  const commissions = items.length - payments;
  return [
    commissions > 0 ? formatCount(commissions, "provize", "provize", "provizí") : null,
    payments > 0 ? formatCount(payments, "platba", "platby", "plateb") : null,
  ].filter(Boolean).join(" · ") || "0 provizí";
}

export function formatCashflowGroupCount(groups: CashflowSectionGroup[]): string {
  const contracts = groups.filter(({ leadItem }) => !leadItem.isTipPayout && !isSubscription(leadItem)).length;
  return [
    contracts > 0 ? formatCount(contracts, "smlouva", "smlouvy", "smluv") : null,
    formatCashflowItemCount(groups.flatMap((group) => group.items)),
  ].filter(Boolean).join(" · ");
}
