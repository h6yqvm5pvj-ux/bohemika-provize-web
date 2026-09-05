import type { CashflowSectionGroup } from "./monthSections";
import type { CashflowItem } from "./types";

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
