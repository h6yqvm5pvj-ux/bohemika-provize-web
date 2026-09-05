import { CASHFLOW_PRODUCTS_BY_FILTER } from "./helpers";
import type { CashflowItem, ProductFilter } from "./types";

export const MONTH_SECTION_LABELS = {
  life: "Životní pojištění",
  property: "Majetek a odpovědnost",
  entrepreneurs: "Podnikatele",
  travel: "Cestovní pojištění",
  gold: "Zlato",
  foreigners: "Cizinci",
  auto: "Auta",
  tip: "TIP provize",
  subscription: "Předplatné",
  other: "Ostatní",
} as const;

export type MonthSectionId = keyof typeof MONTH_SECTION_LABELS;

export type CashflowSectionGroup = {
  id: string;
  leadItem: CashflowItem;
  items: CashflowItem[];
  amount: number;
};

type MonthSection<T extends CashflowSectionGroup> = {
  id: MonthSectionId;
  label: string;
  groups: T[];
  itemCount: number;
  total: number;
};

function sectionForItem(item: CashflowItem): MonthSectionId {
  const product = item.productKey;
  if (item.isSubscriptionPayment || product === "subscription") return "subscription";
  if (item.isTipPayout) return "tip";
  if (product === "unknown") return "other";

  // Business liability also matches the property filter. Give it exactly one section.
  const priority: Exclude<ProductFilter, "all" | "tip" | "subscription">[] = [
    "entrepreneurs", "life", "property", "travel", "gold", "foreigners", "auto",
  ];
  return priority.find((category) => CASHFLOW_PRODUCTS_BY_FILTER[category].includes(product)) ?? "other";
}

export function buildCashflowMonthSections<T extends CashflowSectionGroup>(groups: T[]): MonthSection<T>[] {
  const sections = new Map<MonthSectionId, MonthSection<T>>();
  for (const group of groups) {
    const id = sectionForItem(group.leadItem);
    const section = sections.get(id) ?? {
      id, label: MONTH_SECTION_LABELS[id], groups: [], itemCount: 0, total: 0,
    };
    section.groups.push(group);
    section.itemCount += group.items.length;
    section.total += group.amount;
    sections.set(id, section);
  }
  return (Object.keys(MONTH_SECTION_LABELS) as MonthSectionId[])
    .flatMap((id) => {
      const section = sections.get(id);
      return section ? [section] : [];
    });
}
