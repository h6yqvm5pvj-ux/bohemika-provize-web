import { toDate } from "@/app/lib/formatters";
import { isInheritedContract } from "@/app/lib/inheritedContracts";
import { contractLifecycleStatus } from "@/app/lib/contractLifecycle";
import { isLifeProduct, productCategory, productInstitutionLabel } from "@/app/lib/productCatalog";
import type { Product, PaymentFrequency } from "@/app/types/domain";
import type { AggregateMetrics, Category, ContractStats } from "@/app/api/team-overview/teamOverview.types";

const BUSINESS_PRODUCTS = new Set<Product>([
  "cppsimplex",
  "kooppmop",
  "cppPPRs",
  "cppPPRbez",
]);


function paymentsPerYear(freq?: PaymentFrequency | null): number {
  switch (freq) {
    case "monthly":
      return 12;
    case "quarterly":
      return 4;
    case "semiannual":
      return 2;
    default:
      return 1;
  }
}

export function categorizeProduct(p?: Product | null): Category {
  if (p && BUSINESS_PRODUCTS.has(p)) {
    return "business";
  }
  if (p === "maxcizinkomplex") {
    return "foreigners";
  }

  switch (productCategory(p)) {
    case "life":
      return "life";
    case "auto":
      return "auto";
    case "property":
      return "property";
    case "travel":
      return "travel";
    case "comfort":
      return "comfort";
    default:
      return "other";
  }
}

export function annualPremiumFromEntry(data: Record<string, unknown>, category: Category): number {
  const raw = Number(data?.inputAmount ?? 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  const product = data?.productKey as Product | undefined;
  if (isLifeProduct(product)) return raw * 12;
  if (category === "comfort") return raw;
  return raw * paymentsPerYear((data?.frequencyRaw ?? "annual") as PaymentFrequency);
}

function addAggregateContract(
  metrics: AggregateMetrics,
  annualPremium: number,
  monthlyPremium: number
): void {
  metrics.contracts += 1;
  metrics.annualPremium += annualPremium;
  metrics.monthlyPremium += monthlyPremium;
}

function emptyCategoryCounts(): Record<Category, number> {
  return {
    life: 0,
    auto: 0,
    property: 0,
    business: 0,
    travel: 0,
    foreigners: 0,
    comfort: 0,
    other: 0,
  };
}

function emptyCategoryMetrics(): Record<Category, AggregateMetrics> {
  return {
    life: { contracts: 0, annualPremium: 0, monthlyPremium: 0 },
    auto: { contracts: 0, annualPremium: 0, monthlyPremium: 0 },
    property: { contracts: 0, annualPremium: 0, monthlyPremium: 0 },
    business: { contracts: 0, annualPremium: 0, monthlyPremium: 0 },
    travel: { contracts: 0, annualPremium: 0, monthlyPremium: 0 },
    foreigners: { contracts: 0, annualPremium: 0, monthlyPremium: 0 },
    comfort: { contracts: 0, annualPremium: 0, monthlyPremium: 0 },
    other: { contracts: 0, annualPremium: 0, monthlyPremium: 0 },
  };
}

function emptyAggregateMetrics(): AggregateMetrics {
  return { contracts: 0, annualPremium: 0, monthlyPremium: 0 };
}

function emptyInstitutionByCategory(): Record<Category, Record<string, AggregateMetrics>> {
  return {
    life: {},
    auto: {},
    property: {},
    business: {},
    travel: {},
    foreigners: {},
    comfort: {},
    other: {},
  };
}

export function emptyContractStats(): ContractStats {
  return {
    total: 0,
    month: 0,
    previousMonth: 0,
    previousMonthToDate: 0,
    monthMetrics: emptyAggregateMetrics(),
    previousMonthMetrics: emptyAggregateMetrics(),
    previousMonthToDateMetrics: emptyAggregateMetrics(),
    monthCategoryMetrics: emptyCategoryMetrics(),
    categories: emptyCategoryCounts(),
    categoryMetrics: emptyCategoryMetrics(),
    institutionMetrics: {},
    institutionByCategory: emptyInstitutionByCategory(),
  };
}


export function currentYearMonth(now: Date): string {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

export function previousYearMonth(now: Date): string {
  return currentYearMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
}

export function previousMonthToDateEnd(now: Date): number {
  const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousYear = previousMonth.getFullYear();
  const previousMonthIndex = previousMonth.getMonth();
  const lastDay = new Date(previousYear, previousMonthIndex + 1, 0).getDate();
  return new Date(
    previousYear,
    previousMonthIndex,
    Math.min(now.getDate(), lastDay),
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
    now.getMilliseconds()
  ).getTime();
}


export function accumulateContractEntry({
  stats,
  ownerEmail,
  data,
  previousMonthStart,
  previousMonthToDateEndMs,
  monthStart,
  currentMonthToDateEnd,
}: {
  stats: Record<string, ContractStats>;
  ownerEmail: string;
  data: Record<string, unknown>;
  previousMonthStart: number;
  previousMonthToDateEndMs: number;
  monthStart: number;
  currentMonthToDateEnd: number;
}) {
  const current = stats[ownerEmail] ?? emptyContractStats();
  current.total += 1;

  const category = categorizeProduct(data.productKey as Product | undefined);
  current.categories[category] = (current.categories[category] ?? 0) + 1;

  const annualPremium = annualPremiumFromEntry(data, category);
  const monthlyPremium = annualPremium / 12;

  const byCategory = current.categoryMetrics[category] ?? {
    contracts: 0,
    annualPremium: 0,
    monthlyPremium: 0,
  };
  byCategory.contracts += 1;
  byCategory.annualPremium += annualPremium;
  byCategory.monthlyPremium += monthlyPremium;
  current.categoryMetrics[category] = byCategory;

  const institution =
    productInstitutionLabel(data.productKey as Product | undefined, "Ostatní") ?? "Ostatní";
  const byInstitution = current.institutionMetrics[institution] ?? {
    contracts: 0,
    annualPremium: 0,
    monthlyPremium: 0,
  };
  byInstitution.contracts += 1;
  byInstitution.annualPremium += annualPremium;
  byInstitution.monthlyPremium += monthlyPremium;
  current.institutionMetrics[institution] = byInstitution;

  const byInstitutionForCategory = current.institutionByCategory[category][institution] ?? {
    contracts: 0,
    annualPremium: 0,
    monthlyPremium: 0,
  };
  byInstitutionForCategory.contracts += 1;
  byInstitutionForCategory.annualPremium += annualPremium;
  byInstitutionForCategory.monthlyPremium += monthlyPremium;
  current.institutionByCategory[category][institution] = byInstitutionForCategory;

  const signed = isInheritedContract(data) ? null : toDate(data.contractSignedDate ?? data.createdAt);
  const ts = signed?.getTime();
  if (ts != null && ts >= monthStart && ts <= currentMonthToDateEnd) {
    current.month += 1;
    addAggregateContract(current.monthMetrics, annualPremium, monthlyPremium);
    addAggregateContract(
      current.monthCategoryMetrics[category],
      annualPremium,
      monthlyPremium
    );
  } else if (ts != null && ts >= previousMonthStart && ts < monthStart) {
    current.previousMonth += 1;
    addAggregateContract(current.previousMonthMetrics, annualPremium, monthlyPremium);
    if (ts <= previousMonthToDateEndMs) {
      current.previousMonthToDate += 1;
      addAggregateContract(
        current.previousMonthToDateMetrics,
        annualPremium,
        monthlyPremium
      );
    }
  }

  stats[ownerEmail] = current;
}

export function consumeOwnerEntry({
  stats,
  activeStats,
  ownerSet,
  data,
  ownerEmailRaw,
  entryId,
  seen,
  now,
  previousMonthStart,
  previousMonthToDateEndMs,
  monthStart,
  currentMonthToDateEnd,
}: {
  stats: Record<string, ContractStats>;
  activeStats: Record<string, ContractStats>;
  ownerSet: Set<string>;
  data: Record<string, unknown>;
  ownerEmailRaw: string | null | undefined;
  entryId: string;
  seen: Set<string>;
  now: Date;
  previousMonthStart: number;
  previousMonthToDateEndMs: number;
  monthStart: number;
  currentMonthToDateEnd: number;
}) {
  const ownerEmail = ((data.userEmail as string | undefined) ?? ownerEmailRaw ?? "").trim().toLowerCase();
  if (!ownerEmail || !ownerSet.has(ownerEmail)) return;

  const key = `${ownerEmail}___${entryId}`;
  if (seen.has(key)) return;
  seen.add(key);

  const options = {
    ownerEmail,
    data,
    previousMonthStart,
    previousMonthToDateEndMs,
    monthStart,
    currentMonthToDateEnd,
  };
  accumulateContractEntry({ stats, ...options });
  if (contractLifecycleStatus(data, now) === "active") {
    accumulateContractEntry({ stats: activeStats, ...options });
  }
}

