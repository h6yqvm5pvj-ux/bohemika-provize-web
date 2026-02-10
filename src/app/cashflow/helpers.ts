import type {
  CommissionResultItemDTO,
  PaymentFrequency,
  Product,
} from "../types/domain";
import type {
  CashflowItem,
  FirestoreTimestamp,
  MonthGroup,
  ProductFilter,
  YearGroup,
} from "./types";

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

export function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;

  if (typeof value === "string") {
    const trimmed = value.trim();
    const cz = trimmed.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
    if (cz) {
      const day = Number(cz[1]);
      const month = Number(cz[2]);
      const year = Number(cz[3]);
      const d = new Date(year, month - 1, day);
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "seconds" in value &&
    typeof (value as FirestoreTimestamp).seconds === "number"
  ) {
    const v = value as FirestoreTimestamp;
    const ms =
      v.seconds * 1000 + Math.floor((v.nanoseconds ?? 0) / 1_000_000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(value as string | number | Date);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatMoney(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value)) return "0 Kč";
  return (
    value.toLocaleString("cs-CZ", {
      maximumFractionDigits: 0,
    }) + " Kč"
  );
}

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
  switch (p) {
    case "neon":
      return "ČPP ŽP NEON";
    case "flexi":
      return "Kooperativa ŽP FLEXI";
    case "maximaMaxEfekt":
      return "MAXIMA ŽP MaxEfekt";
    case "pillowInjury":
      return "Pillow Úraz / Nemoc";
    case "zamex":
      return "ČPP ZAMEX";
    case "domex":
      return "ČPP DOMEX";
    case "cppPPRbez":
      return "ČPP Pojištění majetku a odpovědnosti podnikatelů";
    case "maxdomov":
      return "Maxima MAXDOMOV";
    case "cppAuto":
      return "ČPP Auto";
    case "cppsimplex":
      return "ČPP Simplex";
    case "cppPPRs":
      return "ČPP Pojištění majetku a odpovědnosti podnikatelů – ÚPIS";
    case "allianzAuto":
      return "Allianz Auto";
    case "csobAuto":
      return "ČSOB Auto";
    case "uniqaAuto":
      return "UNIQA Auto";
    case "pillowAuto":
      return "Pillow Auto";
    case "kooperativaAuto":
      return "Kooperativa Auto";
    case "cppcestovko":
      return "ČPP Cestovko";
    case "axacestovko":
      return "AXA Cestovko";
    case "comfortcc":
      return "Comfort Commodity";
    default:
      return "Neznámý produkt";
  }
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
    return (
      product === "neon" ||
      product === "flexi" ||
      product === "maximaMaxEfekt" ||
      product === "pillowInjury"
    );
  }
  if (productFilter === "auto") {
    return (
      product === "cppAuto" ||
      product === "allianzAuto" ||
      product === "csobAuto" ||
      product === "uniqaAuto" ||
      product === "pillowAuto" ||
      product === "kooperativaAuto"
    );
  }
  if (productFilter === "property") {
    return (
      product === "domex" ||
      product === "maxdomov" ||
      product === "cppsimplex" ||
      product === "cppPPRs" ||
      product === "cppPPRbez" ||
      product === "cppcestovko" ||
      product === "axacestovko" ||
      product === "zamex"
    );
  }
  if (productFilter === "other") {
    return !(
      product === "neon" ||
      product === "flexi" ||
      product === "maximaMaxEfekt" ||
      product === "pillowInjury"
    );
  }
  if (productFilter === "gold") {
    return product === "comfortcc";
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
