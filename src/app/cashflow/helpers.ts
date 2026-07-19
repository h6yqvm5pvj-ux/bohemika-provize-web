import type {
  CommissionResultItemDTO,
  PaymentFrequency,
  Product,
} from "../types/domain";
import {
  productLabel as productLabelFromCatalog,
} from "@/app/lib/productCatalog";
import type {
  CashflowCommissionStatementSummary,
  CashflowItem,
  MonthGroup,
  ProductFilter,
  YearGroup,
} from "./types";
import { formatMoney, toDate } from "@/app/lib/formatters";
export { formatMoney, toDate };

export const CASHFLOW_PRODUCTS_BY_FILTER: Record<
  Exclude<ProductFilter, "all" | "tip">,
  readonly Product[]
> = {
  life: ["neon", "flexi", "maximaMaxEfekt", "pillowInjury"],
  auto: [
    "cppAuto",
    "slaviaauto",
    "slaviaflotila",
    "allianzAuto",
    "csobAuto",
    "uniqaAuto",
    "uniqaflotila",
    "pillowAuto",
    "kooperativaAuto",
    "koopflotila",
  ],
  property: [
    "domex",
    "cpphafan",
    "pillowmajetek",
    "koopmajetekobcan",
    "koopfit",
    "koopodzam",
    "kooppmop",
    "maxdomov",
    "allianzmujdomov",
  ],
  entrepreneurs: ["cppsimplex", "cppPPRs", "cppPPRbez", "kooppmop"],
  travel: ["cppcestovko", "axacestovko", "koopcestovko"],
  foreigners: ["maxcizinkomplex"],
  gold: ["comfortcc"],
};

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

export const STORNO_FUND_RATE = 0.15;
export const STORNO_EXEMPT_PRODUCT: Product = "comfortcc";

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
  if (productFilter === "tip") return false;
  if (!product) return false;
  if (productFilter === "all") return true;
  return CASHFLOW_PRODUCTS_BY_FILTER[productFilter].includes(product);
}

export function cashflowDisplayProductRank(item: CashflowItem): number {
  const product = item.productKey === "unknown" ? undefined : item.productKey;
  if (!product) return 2;
  if (CASHFLOW_PRODUCTS_BY_FILTER.life.includes(product)) return 0;
  if (CASHFLOW_PRODUCTS_BY_FILTER.auto.includes(product)) return 1;
  return 2;
}

export function cashflowDisplaySourceRank(item: CashflowItem): number {
  return item.source === "manager" || item.isManagerOverride ? 1 : 0;
}

export function compareCashflowItemsForDisplay(
  a: CashflowItem,
  b: CashflowItem
): number {
  const sourceRankDiff =
    cashflowDisplaySourceRank(a) - cashflowDisplaySourceRank(b);
  if (sourceRankDiff !== 0) return sourceRankDiff;

  const productRankDiff =
    cashflowDisplayProductRank(a) - cashflowDisplayProductRank(b);
  if (productRankDiff !== 0) return productRankDiff;

  const dateDiff = a.date.getTime() - b.date.getTime();
  if (dateDiff !== 0) return dateDiff;

  const productDiff = productLabel(a.productKey).localeCompare(
    productLabel(b.productKey),
    "cs"
  );
  if (productDiff !== 0) return productDiff;

  const clientDiff = (a.clientName ?? "").localeCompare(b.clientName ?? "", "cs");
  if (clientDiff !== 0) return clientDiff;

  const contractDiff = (a.contractNumber ?? "").localeCompare(
    b.contractNumber ?? "",
    "cs"
  );
  if (contractDiff !== 0) return contractDiff;

  return a.id.localeCompare(b.id, "cs");
}

export function sortCashflowItemsForDisplay(
  items: CashflowItem[]
): CashflowItem[] {
  return [...items].sort(compareCashflowItemsForDisplay);
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

export function filterPastStatementMonths(
  statementsByMonthKey: Record<string, CashflowCommissionStatementSummary[]>,
  showPastYears: boolean
): Record<string, CashflowCommissionStatementSummary[]> {
  if (showPastYears) return statementsByMonthKey;

  const now = new Date();
  const startYear = now.getFullYear();
  const startMonthIndex = now.getMonth();
  const filtered: Record<string, CashflowCommissionStatementSummary[]> = {};

  for (const [key, statements] of Object.entries(statementsByMonthKey)) {
    const match = key.match(/^(\d{4})-(\d{1,2})$/);
    if (!match) continue;

    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    if (!Number.isInteger(year) || !Number.isInteger(monthIndex)) continue;
    if (monthIndex < 0 || monthIndex > 11) continue;
    if (year < startYear || (year === startYear && monthIndex < startMonthIndex)) continue;

    filtered[key] = statements;
  }

  return filtered;
}

export function normalizeContractNumberSearch(value?: string | null): string {
  return (value ?? "").replace(/[^a-z0-9]+/gi, "").trim().toLowerCase();
}

const monthKeyFromDate = (date: Date): string =>
  `${date.getFullYear()}-${date.getMonth() + 1}`;

export const statementMonthKey = (
  statement: CashflowCommissionStatementSummary
): string | null => {
  if (statement.payoutMonthKey) return statement.payoutMonthKey;

  const sourceMs =
    statement.statementDateMs ??
    (statement.periodEndMs != null
      ? Date.UTC(
          new Date(statement.periodEndMs).getUTCFullYear(),
          new Date(statement.periodEndMs).getUTCMonth() + 1,
          1
        )
      : statement.periodStartMs);
  if (sourceMs == null) return null;

  const date = new Date(sourceMs);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}`;
};

const addMonths = (date: Date, months: number): Date =>
  new Date(date.getFullYear(), date.getMonth() + months, date.getDate());

const monthSerial = (date: Date): number =>
  date.getFullYear() * 12 + date.getMonth();

const isStornoStatus = (status: CashflowItem["contractStatus"]): boolean => {
  const normalized = String(status ?? "").trim().toLowerCase();
  return (
    normalized === "storno" ||
    normalized === "stornovana" ||
    normalized === "stornována"
  );
};

const isOnOrAfterStornoMonth = (item: CashflowItem, date: Date): boolean => {
  if (!isStornoStatus(item.contractStatus)) return false;
  const stornoDate = toDate(item.stornoDate);
  if (!stornoDate) return false;
  return monthSerial(date) >= monthSerial(stornoDate);
};

export function filterItemsByContractNumber(
  cashflowItems: CashflowItem[],
  contractNumberQuery: string
): CashflowItem[] {
  const normalizedQuery = normalizeContractNumberSearch(contractNumberQuery);
  if (!normalizedQuery) return cashflowItems;

  const looseQuery = normalizedQuery.replace(/^0+/, "");
  return cashflowItems.filter((item) => {
    const normalizedContractNumber = normalizeContractNumberSearch(item.contractNumber);
    if (!normalizedContractNumber) return false;
    if (normalizedContractNumber.includes(normalizedQuery)) return true;

    const looseContractNumber = normalizedContractNumber.replace(/^0+/, "");
    return Boolean(looseQuery) && looseContractNumber.includes(looseQuery);
  });
}

const paidContractSetForStatements = (
  statements: CashflowCommissionStatementSummary[] | undefined
): Set<string> => {
  const paidContracts = new Set<string>();
  for (const statement of statements ?? []) {
    for (const contractNumber of statement.paidContractNumbers ?? []) {
      const normalized = normalizeContractNumberSearch(contractNumber);
      if (normalized) paidContracts.add(normalized);
    }
  }
  return paidContracts;
};

const paidCommissionKeySetForStatements = (
  statements: CashflowCommissionStatementSummary[] | undefined
): Set<string> => {
  const paidCommissionKeys = new Set<string>();
  for (const statement of statements ?? []) {
    for (const key of statement.paidCommissionKeys ?? []) {
      const normalized = key.trim().toUpperCase();
      if (normalized) paidCommissionKeys.add(normalized);
    }
  }
  return paidCommissionKeys;
};

const commissionCodesForItem = (item: CashflowItem): string[] => {
  const codes = new Set<string>();
  if (item.commissionCode) codes.add(item.commissionCode);
  for (const alias of item.commissionCodeAliases ?? []) codes.add(alias);
  return [...codes]
    .map((code) => code.trim().toUpperCase().replace(/\s+/g, ""))
    .filter(Boolean);
};

const hasPaidCommissionForItem = ({
  item,
  normalizedContractNumber,
  paidContracts,
  paidCommissionKeys,
}: {
  item: CashflowItem;
  normalizedContractNumber: string;
  paidContracts: Set<string>;
  paidCommissionKeys: Set<string>;
}): boolean => {
  const commissionCodes = commissionCodesForItem(item);
  const hasAnyPaidCodeForContract = [...paidCommissionKeys].some((key) =>
    key.startsWith(`${normalizedContractNumber.toUpperCase()}:`)
  );
  if (hasAnyPaidCodeForContract) {
    if (commissionCodes.length === 0) {
      return item.productKey === "comfortcc" && paidContracts.has(normalizedContractNumber);
    }

    return commissionCodes.some((code) =>
      paidCommissionKeys.has(`${normalizedContractNumber.toUpperCase()}:${code}`)
    );
  }

  return paidContracts.has(normalizedContractNumber);
};

const statementPeriodLabels = (
  statements: CashflowCommissionStatementSummary[] | undefined
): string[] =>
  [...new Set((statements ?? []).map((statement) => statement.period).filter(Boolean) as string[])];

export function applyStatementMissingPayoutShifts({
  cashflowItems,
  statementsByMonthKey,
  enabled,
}: {
  cashflowItems: CashflowItem[];
  statementsByMonthKey: Record<string, CashflowCommissionStatementSummary[]>;
  enabled: boolean;
}): CashflowItem[] {
  if (!enabled) return cashflowItems;

  return cashflowItems.flatMap((item): CashflowItem[] => {
    if (item.isTipPayout) return [item];
    if (item.payoutStatus === "paid") return [item];

    const normalizedContractNumber = normalizeContractNumberSearch(item.contractNumber);
    if (!normalizedContractNumber) return [{ ...item, payoutStatus: "predicted" }];

    let date = item.date;
    let shifted = false;
    const missedStatementPeriods: string[] = [];

    for (let guard = 0; guard < 24; guard += 1) {
      if (isOnOrAfterStornoMonth(item, date)) return [];

      const monthKey = monthKeyFromDate(date);
      const statements = statementsByMonthKey[monthKey];
      if (!statements || statements.length === 0) {
        return [{
          ...item,
          id: shifted ? `${item.id}-shifted-${monthKey}` : item.id,
          date,
          payoutStatus: shifted ? "shifted" : "predicted",
          originalDate: shifted ? item.date : null,
          missedStatementPeriods,
        }];
      }

      const paidContracts = paidContractSetForStatements(statements);
      const paidCommissionKeys = paidCommissionKeySetForStatements(statements);
      if (paidContracts.size === 0) {
        return [{
          ...item,
          id: shifted ? `${item.id}-shifted-${monthKey}` : item.id,
          date,
          payoutStatus: shifted ? "shifted" : "predicted",
          originalDate: shifted ? item.date : null,
          missedStatementPeriods,
        }];
      }

      if (
        hasPaidCommissionForItem({
          item,
          normalizedContractNumber,
          paidContracts,
          paidCommissionKeys,
        })
      ) {
        return [{
          ...item,
          id: shifted ? `${item.id}-paid-shifted-${monthKey}` : item.id,
          date,
          payoutStatus: "paid",
          originalDate: shifted ? item.date : null,
          missedStatementPeriods,
        }];
      }

      missedStatementPeriods.push(...statementPeriodLabels(statements));
      date = addMonths(date, 1);
      shifted = true;
    }

    const fallbackMonthKey = monthKeyFromDate(date);
    if (isOnOrAfterStornoMonth(item, date)) return [];

    return [{
      ...item,
      id: `${item.id}-shifted-${fallbackMonthKey}`,
      date,
      payoutStatus: "shifted",
      originalDate: item.date,
      missedStatementPeriods,
    }];
  });
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
        predictedTotal: 0,
        totalSource: "predicted",
        statementPayoutTotal: null,
        items: [],
      });
    }

    const group = map.get(key)!;
    group.total += item.amount;
    group.predictedTotal += item.isStatementOnly
      ? 0
      : item.predictedAmount ?? item.amount;
    group.items.push(item);
  }

  const groups = Array.from(map.values());
  groups.forEach((group) =>
    group.items.sort(compareCashflowItemsForDisplay)
  );

  groups.sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.monthIndex - b.monthIndex;
  });

  return groups;
}

export function statementPayoutTotal(
  statements: CashflowCommissionStatementSummary[] | undefined
): number | null {
  const values = (statements ?? [])
    .map((statement) => statement.payoutTotal)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) * 100) / 100;
}

const monthGroupMetaFromKey = (
  key: string
): Pick<MonthGroup, "year" | "monthIndex" | "label"> | null => {
  const match = key.match(/^(\d{4})-(\d{1,2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month)) return null;
  if (month < 1 || month > 12) return null;
  const monthIndex = month - 1;
  return {
    year,
    monthIndex,
    label: `${MONTH_LABELS[monthIndex]} ${year}`,
  };
};

export function applyStatementPayoutTotalsToMonths({
  monthGroups,
  statementsByMonthKey,
  enabled,
}: {
  monthGroups: MonthGroup[];
  statementsByMonthKey: Record<string, CashflowCommissionStatementSummary[]>;
  enabled: boolean;
}): MonthGroup[] {
  if (!enabled) return monthGroups;

  const adjustedMonths: MonthGroup[] = monthGroups.map((month) => {
    const payoutTotal = statementPayoutTotal(statementsByMonthKey[month.key]);
    if (payoutTotal == null) return month;

    return {
      ...month,
      total: payoutTotal,
      totalSource: "paid",
      statementPayoutTotal: payoutTotal,
    };
  });

  const existingMonthKeys = new Set(adjustedMonths.map((month) => month.key));
  for (const [key, statements] of Object.entries(statementsByMonthKey)) {
    if (existingMonthKeys.has(key)) continue;

    const payoutTotal = statementPayoutTotal(statements);
    const meta = monthGroupMetaFromKey(key);
    if (payoutTotal == null || !meta) continue;

    adjustedMonths.push({
      key,
      ...meta,
      total: payoutTotal,
      predictedTotal: 0,
      totalSource: "paid",
      statementPayoutTotal: payoutTotal,
      items: [],
    });
  }

  adjustedMonths.sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.monthIndex - b.monthIndex;
  });

  return adjustedMonths;
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

export function calculateStornoFund(items: CashflowItem[]): number {
  return items.reduce((sum, item) => {
    if (item.productKey === STORNO_EXEMPT_PRODUCT) return sum;
    const amount = Number(item.amount);
    if (!Number.isFinite(amount)) return sum;
    return sum + amount * STORNO_FUND_RATE;
  }, 0);
}

export function calculateNetCashflow(grossAmount: number, stornoFund: number): number {
  return grossAmount - stornoFund;
}
