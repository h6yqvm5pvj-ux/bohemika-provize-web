import type {
  CommissionResultItemDTO,
  PaymentFrequency,
  Product,
} from "../types/domain";
import {
  hasProductGroup,
  isComfortProduct,
  isLifeProduct,
  productLabel as productLabelFromCatalog,
} from "@/app/lib/productCatalog";
import type {
  CashflowItem,
  MonthGroup,
  ProductFilter,
  YearGroup,
} from "./types";
import { formatMoney, toDate } from "@/app/lib/formatters";
export { formatMoney, toDate };

const MONTH_LABELS = [
  "leden",
  "únor",
  "březen",
  "duben",
  "květen",
  "červen",
  "červenec",
  "srpen",
  "září",
  "říjen",
  "listopad",
  "prosinec",
];

export function monthLabelFromDate(d: Date): string {
  return `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`;
}

export function frequencyText(f?: PaymentFrequency | null): string {
  switch (f) {
    case "monthly":
      return "měsíčně";
    case "quarterly":
      return "čtvrtletně";
    case "semiannual":
      return "pololetně";
    case "annual":
      return "ročně";
    default:
      return "—";
  }
}

export function productLabel(p?: Product | "unknown"): string {
  if (p === "unknown") return "Neznámý produkt";
  return productLabelFromCatalog(p, "Neznámý produkt");
}

export function normalizeTitleKey(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("z platby")) return `payment-${t}`;
  if (t.includes("za rok")) return `annual-${t}`;
  if (t.includes("okamžitá")) return "immediate";
  if (t.includes("po 3")) return "po3";
  if (t.includes("po 4")) return "po4";
  if (t.includes("2.–5.")) return "nasl25";
  if (t.includes("5.–10.")) return "nasl510";
  if (t.includes("od 6.")) return "nasl6plus";
  if (t.includes("z platby")) return "subsequentByPayment";
  return t;
}

export function stripTotalRows(
  items: CommissionResultItemDTO[] = []
): CommissionResultItemDTO[] {
  return items.filter(
    (it) => !normalizeTitleKey(it.title ?? "").includes("celkem")
  );
}

export function matchesProductFilter(
  product: Product | undefined,
  productFilter: ProductFilter
): boolean {
  if (!product) return false;
  if (productFilter === "all") return true;
  if (productFilter === "life") {
    return isLifeProduct(product);
  }
  if (productFilter === "auto") {
    return hasProductGroup(product, "auto");
  }
  if (productFilter === "property") {
    return (
      hasProductGroup(product, "property") ||
      hasProductGroup(product, "travel") ||
      hasProductGroup(product, "liability")
    );
  }
  if (productFilter === "other") {
    return !isLifeProduct(product);
  }
  if (productFilter === "gold") {
    return isComfortProduct(product);
  }
  return true;
}

export function filterPastItems(
  cashflowItems: CashflowItem[],
  showPastYears: boolean
): CashflowItem[] {
  if (showPastYears) return cashflowItems;
  const now = new Date();
  const startCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  return cashflowItems.filter((item) => item.date >= startCurrentMonth);
}

export function groupItemsByMonth(
  filteredCashflowItems: CashflowItem[]
): MonthGroup[] {
  if (filteredCashflowItems.length === 0) return [];

  const map = new Map<string, MonthGroup>();

  for (const item of filteredCashflowItems) {
    const d = item.date;
    const year = d.getFullYear();
    const monthIndex = d.getMonth();
    const key = `${year}-${monthIndex + 1}`;
    const label = monthLabelFromDate(d);

    if (!map.has(key)) {
      map.set(key, {
        key,
        year,
        monthIndex,
        label,
        total: 0,
        items: [],
      });
    }

    const group = map.get(key)!;
    group.total += item.amount;
    group.items.push(item);
  }

  const groups = Array.from(map.values());
  groups.forEach((group) =>
    group.items.sort((a, b) => a.date.getTime() - b.date.getTime())
  );

  groups.sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.monthIndex - b.monthIndex;
  });

  return groups;
}

export function groupMonthsByYear(monthGroups: MonthGroup[]): YearGroup[] {
  if (monthGroups.length === 0) return [];

  const yearMap = new Map<number, YearGroup>();

  for (const month of monthGroups) {
    if (!yearMap.has(month.year)) {
      yearMap.set(month.year, {
        year: month.year,
        total: 0,
        months: [],
      });
    }

    const yearGroup = yearMap.get(month.year)!;
    yearGroup.total += month.total;
    yearGroup.months.push(month);
  }

  const years = Array.from(yearMap.values());
  years.forEach((yearGroup) =>
    yearGroup.months.sort((a, b) => a.monthIndex - b.monthIndex)
  );
  years.sort((a, b) => a.year - b.year);

  return years;
}
