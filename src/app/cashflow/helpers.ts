import type {
  CommissionMode,
  CommissionResultItemDTO,
  PaymentFrequency,
  Position,
  Product,
} from "../types/domain";
import {
  isAutoProduct,
  isLifeProduct,
  isPropertyProduct,
  productLabel as productLabelFromCatalog,
} from "@/app/lib/productCatalog";
import {
  calculateFlexi,
  calculateMaxEfekt,
  calculateNeon,
  calculatePillowInjury,
  normalizeNeonDurationYears,
} from "@/app/lib/productFormulas";
import { calculateNeonRefreshCommissionBase } from "@/app/lib/productFormulas/neon";
import type {
  CashflowCommissionStatementSummary,
  CashflowItem,
  CashflowProductKey,
  MonthGroup,
  ProductFilter,
  YearGroup,
} from "./types";
import { formatMoney, toDate } from "@/app/lib/formatters";
export { formatMoney, toDate };

export const CASHFLOW_PRODUCTS_BY_FILTER: Record<
  Exclude<ProductFilter, "all" | "tip" | "subscription">,
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
    "zamex",
    "cppbytex",
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
export const CASHFLOW_FORECAST_YEARS = 10;

export const INTELLIGENT_PREDICTION_CONFIG = {
  autoAnnualIncreaseRate: 0.075,
  autoMarketRangeMin: 0.05,
  autoMarketRangeMax: 0.1,
  propertyReviewIntervalYears: 3,
  propertyReviewIncreaseRate: 0.12,
  propertyAnnualPlanningRate: 0.04,
  lifeReviewIntervalYears: 3,
  lifeAnnualNeedGrowthRate: 0.06,
  lifeMinMonthlyIncrease: 200,
  lifeDefaultMonthlyIncrease: 300,
  lifeMaxMonthlyIncrease: 500,
  lifeAcceptanceProbability: 0.55,
} as const;

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

export function productLabel(p?: CashflowProductKey): string {
  if (p === "subscription") return "Platba předplatného";
  if (!p) return "Neznámý produkt";
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
  product: Product | "subscription" | undefined,
  productFilter: ProductFilter
): boolean {
  if (productFilter === "tip") return false;
  if (!product) return false;
  if (productFilter === "all") return true;
  if (productFilter === "subscription") return product === "subscription";
  if (product === "subscription") return false;
  return CASHFLOW_PRODUCTS_BY_FILTER[productFilter].includes(product);
}

export function cashflowDisplayProductRank(item: CashflowItem): number {
  const product =
    item.productKey === "unknown" || item.productKey === "subscription"
      ? undefined
      : item.productKey;
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

const monthDistance = (from: Date, to: Date): number =>
  monthSerial(to) - monthSerial(from);

const currentMonthStart = (today: Date): Date =>
  new Date(today.getFullYear(), today.getMonth(), 1);

const roundCashflowAmount = (amount: number): number => Math.round(amount);

const predictionProduct = (item: CashflowItem): Product | null => {
  if (item.productKey === "unknown" || item.productKey === "subscription") return null;
  return item.productKey;
};

const isPredictionEligibleItem = (item: CashflowItem, today: Date): boolean => {
  if (item.isTipPayout || item.isSubscriptionPayment || item.isStatementOnly) return false;
  if (item.payoutStatus === "paid") return false;
  if (!Number.isFinite(item.amount) || item.amount <= 0) return false;
  return monthDistance(currentMonthStart(today), item.date) >= 0;
};

const compoundMultiplier = (rate: number, steps: number): number =>
  Math.pow(1 + rate, Math.max(0, steps));

const PREDICTION_POSITIONS = new Set<Position>([
  "poradce1",
  "poradce2",
  "poradce3",
  "poradce4",
  "poradce5",
  "poradce6",
  "poradce7",
  "poradce8",
  "poradce9",
  "poradce10",
  "manazer4",
  "manazer5",
  "manazer6",
  "manazer7",
  "manazer8",
  "manazer9",
  "manazer10",
]);

const LIFE_REVIEW_PRODUCTS = new Set<Product>([
  "neon",
  "flexi",
  "maximaMaxEfekt",
  "pillowInjury",
]);

type LifeReviewCandidate = {
  key: string;
  item: CashflowItem;
  product: Product;
  baseDate: Date;
  currentMonthlyPremium: number;
  stornoBaseMonthlyPremium: number;
  position: Position;
  baselinePosition: Position | null;
  commissionMode: CommissionMode;
  durationYears: number | null;
};

const normalizePredictionPosition = (
  value: Position | null | undefined
): Position | null => {
  if (!value) return null;
  return PREDICTION_POSITIONS.has(value) ? value : null;
};

const normalizePredictionCommissionMode = (
  value: CommissionMode | null | undefined
): CommissionMode =>
  value === "accelerated" || value === "standard" ? value : "standard";

const clampNumber = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const roundToNearest = (value: number, step: number): number =>
  Math.round(value / step) * step;

const addYears = (date: Date, years: number): Date =>
  new Date(date.getFullYear() + years, date.getMonth(), date.getDate());

const validDate = (date: Date | null | undefined): Date | null =>
  date && !Number.isNaN(date.getTime()) ? date : null;

const dateToIsoDay = (date: Date | null | undefined): string | null => {
  if (!date || Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const estimateLifePayoutDate = (
  policyStart: Date,
  agreementDate: Date | null | undefined = policyStart,
  cutoffDay = 25,
  payoutDay = 25
): Date => {
  const dayForCutoff = agreementDate ? agreementDate.getDate() : policyStart.getDate();
  if (dayForCutoff > cutoffDay) {
    return new Date(policyStart.getFullYear(), policyStart.getMonth() + 2, payoutDay);
  }
  return new Date(policyStart.getFullYear(), policyStart.getMonth() + 1, payoutDay);
};

const nextLifeReviewDate = (
  baseDate: Date,
  today: Date,
  reviewIndex: number
): Date => {
  const intervalYears = INTELLIGENT_PREDICTION_CONFIG.lifeReviewIntervalYears;
  const firstDueDate = addYears(baseDate, intervalYears);
  const firstReviewDate = firstDueDate <= today ? today : firstDueDate;
  return addYears(firstReviewDate, (reviewIndex - 1) * intervalYears);
};

const estimatedLifeMonthlyIncrease = (monthlyPremium: number): number => {
  const intervalYears = INTELLIGENT_PREDICTION_CONFIG.lifeReviewIntervalYears;
  const growthDelta =
    monthlyPremium *
    (compoundMultiplier(
      INTELLIGENT_PREDICTION_CONFIG.lifeAnnualNeedGrowthRate,
      intervalYears
    ) - 1);
  const roundedDelta =
    roundToNearest(growthDelta, 50) ||
    INTELLIGENT_PREDICTION_CONFIG.lifeDefaultMonthlyIncrease;

  return clampNumber(
    roundedDelta,
    INTELLIGENT_PREDICTION_CONFIG.lifeMinMonthlyIncrease,
    INTELLIGENT_PREDICTION_CONFIG.lifeMaxMonthlyIncrease
  );
};

const normalizedCommissionCode = (code: string | null | undefined): string | null => {
  const normalized = String(code ?? "").trim().toUpperCase().replace(/\s+/g, "");
  return normalized && normalized !== "TOTAL" ? normalized : null;
};

const commissionItemDiffKey = (item: CommissionResultItemDTO): string => {
  const code = normalizedCommissionCode(item.code);
  if (code) return code;
  return normalizeTitleKey(item.title ?? "");
};

const diffCommissionItems = (
  managerItems: CommissionResultItemDTO[],
  baselineItems: CommissionResultItemDTO[]
): CommissionResultItemDTO[] => {
  const managerMap = new Map<string, CommissionResultItemDTO>();
  stripTotalRows(managerItems).forEach((item) => {
    const key = commissionItemDiffKey(item);
    const prev = managerMap.get(key);
    managerMap.set(key, {
      title: item.title ?? prev?.title ?? key,
      amount: (prev?.amount ?? 0) + (item.amount ?? 0),
      code: item.code ?? prev?.code ?? null,
      ...(item.note || prev?.note ? { note: item.note ?? prev?.note } : {}),
      ...(item.excludeFromTotal || prev?.excludeFromTotal
        ? { excludeFromTotal: true }
        : {}),
    });
  });

  const out: CommissionResultItemDTO[] = [];
  stripTotalRows(baselineItems).forEach((item) => {
    const key = commissionItemDiffKey(item);
    const managerItem = managerMap.get(key);
    const remaining = (managerItem?.amount ?? 0) - (item.amount ?? 0);
    if (remaining > 0) {
      out.push({
        title: managerItem?.title ?? item.title,
        amount: remaining,
        code: managerItem?.code ?? item.code ?? null,
        ...(managerItem?.note || item.note
          ? { note: managerItem?.note ?? item.note }
          : {}),
        ...(managerItem?.excludeFromTotal || item.excludeFromTotal
          ? { excludeFromTotal: true }
          : {}),
      });
    }
    managerMap.delete(key);
  });

  managerMap.forEach((item) => {
    if ((item.amount ?? 0) > 0) out.push(item);
  });

  return out;
};

const lifeFormulaItems = ({
  product,
  monthlyBase,
  position,
  commissionMode,
  durationYears,
  signedDateIso,
}: {
  product: Product;
  monthlyBase: number;
  position: Position;
  commissionMode: CommissionMode;
  durationYears: number | null;
  signedDateIso: string | null;
}): CommissionResultItemDTO[] => {
  switch (product) {
    case "neon": {
      const years = normalizeNeonDurationYears(durationYears ?? 15, signedDateIso);
      return calculateNeon(monthlyBase, position, years, commissionMode, signedDateIso).items;
    }
    case "flexi":
      return calculateFlexi(
        monthlyBase,
        position,
        commissionMode,
        Math.max(1, Math.floor(durationYears ?? 6))
      ).items;
    case "maximaMaxEfekt":
      return calculateMaxEfekt(
        monthlyBase,
        Math.max(1, Math.floor(durationYears ?? 30)),
        position,
        commissionMode,
        signedDateIso
      ).items;
    case "pillowInjury":
      return calculatePillowInjury(monthlyBase, position, commissionMode).items;
    default:
      return [];
  }
};

const candidateLifeGroupKey = (item: CashflowItem, product: Product): string | null => {
  const ownerKey = item.ownerEmail ?? item.source ?? "owner";
  const contractKey =
    item.rootContractEntryId ||
    item.entryId ||
    normalizeContractNumberSearch(item.contractNumber) ||
    item.id;
  if (!contractKey) return null;
  return `${item.source ?? "own"}|${ownerKey}|${product}|${contractKey}`;
};

const shouldPreferLifeCandidate = (
  next: LifeReviewCandidate,
  current: LifeReviewCandidate
): boolean => {
  const dateDiff = next.baseDate.getTime() - current.baseDate.getTime();
  if (dateDiff !== 0) return dateDiff > 0;
  if (next.currentMonthlyPremium !== current.currentMonthlyPremium) {
    return next.currentMonthlyPremium > current.currentMonthlyPremium;
  }
  return next.item.id.localeCompare(current.item.id, "cs") > 0;
};

const collectLifeReviewCandidates = (
  cashflowItems: CashflowItem[]
): LifeReviewCandidate[] => {
  const candidates = new Map<string, LifeReviewCandidate>();

  for (const item of cashflowItems) {
    if (item.isTipPayout || item.isSubscriptionPayment || item.isStatementOnly) continue;
    if (isStornoStatus(item.contractStatus)) continue;

    const product = predictionProduct(item);
    if (!product || !isLifeProduct(product) || !LIFE_REVIEW_PRODUCTS.has(product)) continue;

    const currentMonthlyPremium = Number(item.currentMonthlyPremium ?? item.inputAmount);
    if (!Number.isFinite(currentMonthlyPremium) || currentMonthlyPremium <= 0) continue;
    const stornoBaseMonthlyPremium = Number(
      item.lifeStornoBaseMonthlyPremium ?? currentMonthlyPremium
    );

    const position = normalizePredictionPosition(item.predictionPosition);
    if (!position) continue;

    const baselinePosition = normalizePredictionPosition(item.predictionBaselinePosition);
    if ((item.source === "manager" || item.isManagerOverride) && !baselinePosition) continue;

    const baseDate = validDate(
      item.lifeRevisionBaseDate ?? item.contractSignedDate ?? item.policyStartDate
    );
    if (!baseDate) continue;

    const key = candidateLifeGroupKey(item, product);
    if (!key) continue;

    const candidate: LifeReviewCandidate = {
      key,
      item,
      product,
      baseDate,
      currentMonthlyPremium,
      stornoBaseMonthlyPremium:
        Number.isFinite(stornoBaseMonthlyPremium) && stornoBaseMonthlyPremium > 0
          ? stornoBaseMonthlyPremium
          : currentMonthlyPremium,
      position,
      baselinePosition,
      commissionMode: normalizePredictionCommissionMode(item.predictionCommissionMode),
      durationYears:
        typeof item.durationYears === "number" && Number.isFinite(item.durationYears)
          ? item.durationYears
          : null,
    };
    const current = candidates.get(key);
    if (!current || shouldPreferLifeCandidate(candidate, current)) {
      candidates.set(key, candidate);
    }
  }

  return [...candidates.values()];
};

const scheduleLifeFormulaItemDates = ({
  formulaItem,
  reviewDate,
  horizonEnd,
  durationYears,
}: {
  formulaItem: CommissionResultItemDTO;
  reviewDate: Date;
  horizonEnd: Date;
  durationYears: number | null;
}): Date[] => {
  const title = (formulaItem.title ?? "").toLowerCase();
  const key = normalizeTitleKey(title);
  const dates: Date[] = [];
  const pushReviewYear = (years: number) => {
    const date = estimateLifePayoutDate(addYears(reviewDate, years), reviewDate);
    if (date <= horizonEnd) dates.push(date);
  };

  if (key === "po3") {
    pushReviewYear(3);
  } else if (key === "po4") {
    pushReviewYear(4);
  } else if (key === "nasl25") {
    const maxYears = Math.max(1, Math.floor(durationYears ?? 10));
    for (let year = 1; year <= 4 && year <= maxYears; year += 1) {
      pushReviewYear(year);
    }
  } else if (key === "nasl510") {
    const maxYears = Math.max(1, Math.floor(durationYears ?? 10));
    for (let year = 4; year <= 9 && year <= maxYears; year += 1) {
      pushReviewYear(year);
    }
  } else if (key === "nasl6plus") {
    const maxYears = Math.max(1, Math.floor(durationYears ?? 6));
    for (let year = 6; year <= maxYears; year += 1) {
      pushReviewYear(year);
    }
  } else if (title.includes("od 5. roku")) {
    const maxYears = Math.max(1, Math.floor(durationYears ?? 30));
    for (let year = 5; year <= maxYears; year += 1) {
      pushReviewYear(year);
    }
  } else {
    const date = estimateLifePayoutDate(reviewDate, reviewDate);
    if (date <= horizonEnd) dates.push(date);
  }

  return dates;
};

const lifeReviewCommissionItems = ({
  candidate,
  calculationMonthlyPremium,
  reviewDateIso,
}: {
  candidate: LifeReviewCandidate;
  calculationMonthlyPremium: number;
  reviewDateIso: string | null;
}): CommissionResultItemDTO[] => {
  const managerItems = lifeFormulaItems({
    product: candidate.product,
    monthlyBase: calculationMonthlyPremium,
    position: candidate.position,
    commissionMode: candidate.commissionMode,
    durationYears: candidate.durationYears,
    signedDateIso: reviewDateIso,
  });

  if (!(candidate.item.source === "manager" || candidate.item.isManagerOverride)) {
    return stripTotalRows(managerItems);
  }

  if (!candidate.baselinePosition) return [];
  const baselineItems = lifeFormulaItems({
    product: candidate.product,
    monthlyBase: calculationMonthlyPremium,
    position: candidate.baselinePosition,
    commissionMode: candidate.commissionMode,
    durationYears: candidate.durationYears,
    signedDateIso: reviewDateIso,
  });

  return diffCommissionItems(managerItems, baselineItems);
};

const buildLifeReviewCashflowItems = (
  cashflowItems: CashflowItem[],
  today: Date
): CashflowItem[] => {
  const horizonEnd = new Date(
    today.getFullYear() + CASHFLOW_FORECAST_YEARS,
    today.getMonth(),
    today.getDate()
  );
  const candidates = collectLifeReviewCandidates(cashflowItems);
  const out: CashflowItem[] = [];

  candidates.forEach((candidate) => {
    let projectedMonthlyPremium = candidate.currentMonthlyPremium;
    let projectedStornoBaseMonthlyPremium = candidate.stornoBaseMonthlyPremium;
    let reviewBaseDate = candidate.baseDate;
    const maxIterations = Math.ceil(CASHFLOW_FORECAST_YEARS / 2);

    for (let reviewIndex = 1; reviewIndex <= maxIterations; reviewIndex += 1) {
      const reviewDate = nextLifeReviewDate(reviewBaseDate, today, 1);
      if (reviewDate > horizonEnd) break;

      const monthlyDelta = estimatedLifeMonthlyIncrease(projectedMonthlyPremium);
      const newMonthlyPremium = projectedMonthlyPremium + monthlyDelta;
      const reviewDateIso = dateToIsoDay(reviewDate);
      const reviewBaseIso = dateToIsoDay(reviewBaseDate);
      const neonRefreshBase =
        candidate.product === "neon"
          ? calculateNeonRefreshCommissionBase({
              newMonthlyPremium,
              originalMonthlyPremium: projectedMonthlyPremium,
              stornoBaseMonthlyPremium: projectedStornoBaseMonthlyPremium,
              originalStornoStartDateIso: reviewBaseIso,
              refreshPolicyStartDateIso: reviewDateIso,
            })
          : null;
      const calculationMonthlyPremium =
        candidate.product === "neon"
          ? neonRefreshBase?.calculationMonthlyPremium ?? monthlyDelta
          : monthlyDelta;
      const formulaItems = lifeReviewCommissionItems({
        candidate,
        calculationMonthlyPremium,
        reviewDateIso,
      });
      const durationYears =
        candidate.product === "neon"
          ? normalizeNeonDurationYears(candidate.durationYears ?? 15, reviewDateIso)
          : candidate.product === "flexi"
          ? Math.max(1, Math.floor(candidate.durationYears ?? 6))
          : candidate.product === "maximaMaxEfekt"
          ? Math.max(1, Math.floor(candidate.durationYears ?? 30))
          : candidate.durationYears;

      formulaItems.forEach((formulaItem, formulaIndex) => {
        const grossAmount = Number(formulaItem.amount ?? 0);
        if (!Number.isFinite(grossAmount) || grossAmount <= 0) return;
        const payoutDates = scheduleLifeFormulaItemDates({
          formulaItem,
          reviewDate,
          horizonEnd,
          durationYears,
        });

        payoutDates.forEach((payoutDate, payoutIndex) => {
          if (monthDistance(currentMonthStart(today), payoutDate) < 0) return;
          const adjustedAmount = roundCashflowAmount(
            grossAmount * INTELLIGENT_PREDICTION_CONFIG.lifeAcceptanceProbability
          );
          if (adjustedAmount <= 0) return;
          const code = normalizedCommissionCode(formulaItem.code);
          const reviewDateKey = reviewDateIso ?? String(reviewDate.getTime());
          const sourceLabel =
            candidate.item.source === "manager" || candidate.item.isManagerOverride
              ? "Manažerská"
              : "Vlastní";
          const commissionLabel =
            formulaItem.title?.replace(/^[^\p{L}\p{N}]+/u, "").trim() ||
            "Predikovaná revize ŽP";

          out.push({
            ...candidate.item,
            id: `${candidate.key}-life-review-${reviewDateKey}-${code ?? formulaIndex}-${payoutIndex}`,
            date: payoutDate,
            amount: adjustedAmount,
            note: `${sourceLabel} · predikovaná revize ŽP`,
            currentMonthlyPremium: newMonthlyPremium,
            payoutStatus: "predicted",
            predictedAmount: adjustedAmount,
            isStatementOnly: false,
            commissionPayoutKey: null,
            commissionStatementNumber: null,
            commissionStatementPeriod: null,
            originalDate: null,
            commissionCode: code,
            commissionCodeAliases: code ? [code] : [],
            commissionLabel,
            predictionAdjustment: {
              kind: "lifePremiumReview",
              baseAmount: roundCashflowAmount(grossAmount),
              adjustedAmount,
              multiplier: INTELLIGENT_PREDICTION_CONFIG.lifeAcceptanceProbability,
              steps: reviewIndex,
              label: `Život revize +${formatMoney(monthlyDelta)}/měs.`,
              reason:
                candidate.product === "neon"
                  ? "Predikovaná revize životní smlouvy počítá ČPP NEON podle refresh základny a aktuální pozice při úpravě."
                  : "Predikovaná revize životní smlouvy počítá provizi pouze z navýšení měsíčního pojistného a aktuální pozice při úpravě.",
              premiumDeltaMonthly: monthlyDelta,
              calculationMonthlyPremium,
              grossPotentialAmount: roundCashflowAmount(grossAmount),
              acceptanceProbability:
                INTELLIGENT_PREDICTION_CONFIG.lifeAcceptanceProbability,
              reviewDate: reviewDateIso ?? undefined,
              position: candidate.position,
            },
          });
        });
      });

      projectedMonthlyPremium = newMonthlyPremium;
      projectedStornoBaseMonthlyPremium = calculationMonthlyPremium;
      reviewBaseDate = reviewDate;
    }
  });

  return out;
};

const propertyReviewSteps = (item: CashflowItem, today: Date): number => {
  const monthsAhead = monthDistance(currentMonthStart(today), item.date);
  const policyStart = item.policyStartDate ?? null;
  const reviewIntervalMonths =
    INTELLIGENT_PREDICTION_CONFIG.propertyReviewIntervalYears * 12;

  if (!policyStart || Number.isNaN(policyStart.getTime())) {
    return Math.floor(Math.max(0, monthsAhead) / reviewIntervalMonths);
  }

  const policyAgeAtPayout = monthDistance(policyStart, item.date);
  if (policyAgeAtPayout < 24) return 0;

  return Math.floor((policyAgeAtPayout - 24) / reviewIntervalMonths) + 1;
};

export function applyIntelligentCashflowPrediction({
  cashflowItems,
  enabled,
  today = new Date(),
}: {
  cashflowItems: CashflowItem[];
  enabled: boolean;
  today?: Date;
}): CashflowItem[] {
  if (!enabled) return cashflowItems;

  const startOfCurrentMonth = currentMonthStart(today);

  const adjustedItems: CashflowItem[] = cashflowItems.map((item): CashflowItem => {
    if (!isPredictionEligibleItem(item, today)) return item;

    const product = predictionProduct(item);
    if (!product) return item;

    if (isAutoProduct(product)) {
      const yearsAhead = Math.floor(
        Math.max(0, monthDistance(startOfCurrentMonth, item.date)) / 12
      );
      if (yearsAhead <= 0) return item;

      const multiplier = compoundMultiplier(
        INTELLIGENT_PREDICTION_CONFIG.autoAnnualIncreaseRate,
        yearsAhead
      );
      const adjustedAmount = roundCashflowAmount(item.amount * multiplier);
      if (adjustedAmount === item.amount) return item;

      return {
        ...item,
        amount: adjustedAmount,
        predictionAdjustment: {
          kind: "autoPremiumGrowth",
          baseAmount: item.amount,
          adjustedAmount,
          multiplier,
          steps: yearsAhead,
          label: `Auto +${
            Math.round(INTELLIGENT_PREDICTION_CONFIG.autoAnnualIncreaseRate * 1000) / 10
          } % ročně`,
          reason:
            "Budoucí auto cashflow je navýšené podle středového scénáře očekávaného růstu pojistného.",
        },
      };
    }

    if (isPropertyProduct(product)) {
      const steps = propertyReviewSteps(item, today);
      if (steps <= 0) return item;

      const multiplier = compoundMultiplier(
        INTELLIGENT_PREDICTION_CONFIG.propertyReviewIncreaseRate,
        steps
      );
      const adjustedAmount = roundCashflowAmount(item.amount * multiplier);
      if (adjustedAmount === item.amount) return item;

      return {
        ...item,
        amount: adjustedAmount,
        predictionAdjustment: {
          kind: "propertyRevaluation",
          baseAmount: item.amount,
          adjustedAmount,
          multiplier,
          steps,
          label: `Majetek revize +${Math.round(
            INTELLIGENT_PREDICTION_CONFIG.propertyReviewIncreaseRate * 100
          )} %`,
          reason:
            "Majetkové cashflow počítá s obchodní revizí pojistných částek v pravidelném tříletém cyklu.",
        },
      };
    }

    return item;
  });

  return [...adjustedItems, ...buildLifeReviewCashflowItems(adjustedItems, today)];
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
    if (item.isTipPayout || item.isSubscriptionPayment) return [item];
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
  const values = dedupeCashflowCommissionStatements(statements ?? [])
    .map((statement) => statement.payoutTotal)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) * 100) / 100;
}

const normalizeStatementIdentityPart = (value: unknown): string =>
  String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("cs-CZ");

const cashflowStatementIdentityKey = (
  statement: CashflowCommissionStatementSummary
): string => {
  const number = normalizeStatementIdentityPart(statement.statementNumber);
  const period = normalizeStatementIdentityPart(statement.period);
  const date = normalizeStatementIdentityPart(statement.statementDate);
  const advisor = normalizeStatementIdentityPart(statement.advisorNumber);
  if (number && (period || date)) {
    return `statement:${number}|${period}|${date}|${advisor}`;
  }
  return `id:${normalizeStatementIdentityPart(statement.id)}`;
};

const cashflowStatementRecency = (
  statement: CashflowCommissionStatementSummary
): number => statement.updatedAtMs ?? statement.createdAtMs ?? 0;

export function dedupeCashflowCommissionStatements(
  statements: CashflowCommissionStatementSummary[]
): CashflowCommissionStatementSummary[] {
  const byIdentity = new Map<string, CashflowCommissionStatementSummary>();
  const order: string[] = [];

  for (const statement of statements) {
    const identity = cashflowStatementIdentityKey(statement);
    const current = byIdentity.get(identity);
    if (!current) {
      byIdentity.set(identity, statement);
      order.push(identity);
      continue;
    }
    if (cashflowStatementRecency(statement) > cashflowStatementRecency(current)) {
      byIdentity.set(identity, statement);
    }
  }

  return order
    .map((identity) => byIdentity.get(identity))
    .filter((statement): statement is CashflowCommissionStatementSummary => Boolean(statement));
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
    if (item.isSubscriptionPayment) return sum;
    if (item.productKey === STORNO_EXEMPT_PRODUCT) return sum;
    const amount = Number(item.amount);
    if (!Number.isFinite(amount)) return sum;
    return sum + amount * STORNO_FUND_RATE;
  }, 0);
}

export function calculateNetCashflow(grossAmount: number, stornoFund: number): number {
  return grossAmount - stornoFund;
}
