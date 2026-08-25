import { PRODUCT_CATALOG } from "@/app/lib/productCatalog";
import type { CommissionResultItemDTO, Product } from "@/app/types/domain";

import type {
  CommissionCodeRule,
  CommissionRow,
  ContractStatusRule,
  DeductionCommissionRow,
  GeneralCommissionKind,
  LifeSplitCommissionKind,
  LifeSplitContractPreview,
  ManagerCommissionAdvisor,
  ManagerCommissionRow,
  OtherPayment,
  OtherProductContractPreview,
  ParsedStatement,
  StatementFileRead,
  StatementHeader,
  StatementProductMeta,
  StornoCommissionRow,
} from "./statementTypes";
import {
  DEFAULT_STATEMENT_PRODUCT_MAPPING_INDEX,
  createStatementProductMappingIndex,
  inferStatementProductCategory,
  shouldUseAnnualPremiumBase,
  statementProductCategoryLabel,
  type StatementProductMapEntry,
  type StatementProductMappingIndex,
} from "./statementProductMap";

const normalizeText = (value: string | null | undefined): string =>
  String(value ?? "").replace(/\s+/g, " ").trim();

const normalizeProductCode = (value: string | null | undefined): string =>
  normalizeText(value).toUpperCase();

const normalizeContractNumberForMatch = (value: string | null | undefined): string =>
  normalizeText(value).replace(/\s+/g, "").toUpperCase();

let activeStatementProductMappingIndex: StatementProductMappingIndex =
  DEFAULT_STATEMENT_PRODUCT_MAPPING_INDEX;

const INVESTMENT_SECTION_PRODUCT_CODES =
  DEFAULT_STATEMENT_PRODUCT_MAPPING_INDEX.investmentSectionCodes;

const statementProductMappingIndexFromInput = (
  input?: StatementProductMappingIndex | StatementProductMapEntry[] | null
): StatementProductMappingIndex => {
  if (!input) return activeStatementProductMappingIndex;
  if (Array.isArray(input)) return createStatementProductMappingIndex(input);
  return input;
};

const setActiveStatementProductMapping = (
  entries?: StatementProductMappingIndex | StatementProductMapEntry[] | null
): StatementProductMappingIndex => {
  activeStatementProductMappingIndex = entries
    ? statementProductMappingIndexFromInput(entries)
    : DEFAULT_STATEMENT_PRODUCT_MAPPING_INDEX;
  return activeStatementProductMappingIndex;
};

const resetActiveStatementProductMapping = (): StatementProductMappingIndex => {
  activeStatementProductMappingIndex = DEFAULT_STATEMENT_PRODUCT_MAPPING_INDEX;
  return activeStatementProductMappingIndex;
};

const isLifeSplitProductCode = (
  product: string | null | undefined,
  mappingIndex?: StatementProductMappingIndex | null
): boolean =>
  (mappingIndex ?? activeStatementProductMappingIndex).lifeSplitCodes.has(
    normalizeProductCode(product)
  );

const isInvestmentSectionProductCode = (
  product: string | null | undefined,
  mappingIndex?: StatementProductMappingIndex | null
): boolean =>
  (mappingIndex ?? activeStatementProductMappingIndex).investmentSectionCodes.has(
    normalizeProductCode(product)
  );

const hasSjednatelExtranetFromDetailLink = (
  product: string | null | undefined
): boolean => {
  const productCode = normalizeProductCode(product);
  return productCode.startsWith("CPP") || productCode.startsWith("UNIQA");
};

const usesB36CodeForProduct = (product: string | null | undefined): boolean => {
  const productCode = normalizeProductCode(product);
  return (
    productCode === "KOOP_FLEXI" ||
    productCode === "BHMK_PILLOW_UR_NM" ||
    /PILLOW.*(?:UR|NM)/.test(productCode)
  );
};

const b36HalfLabelForProduct = (product: string): string =>
  usesB36CodeForProduct(product) ? "50% z B36" : "50% z B3601";

const b36DeferredCodeForProduct = (product: string): string =>
  usesB36CodeForProduct(product) ? "B36" : "B3601";

const COMMISSION_AMOUNT_TOLERANCE = 10;
const MANAGER_COMMISSION_AMOUNT_TOLERANCE = 10;
const ANNUAL_PREMIUM_TOLERANCE = 12;
const MONEY_MATCH_TOLERANCE = 0.01;
const AUTO_PREMIUM_ANNIVERSARY_TOLERANCE_MONTHS = 2;

const normalizeCommissionTitle = (value: string | null | undefined): string =>
  normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{Letter}\p{Number}%]+/gu, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const resolveStatementProduct = (
  product: string,
  mappingIndex?: StatementProductMappingIndex | null
): StatementProductMeta => {
  const rawCode = normalizeProductCode(product) || "NEZNAMY_PRODUKT";
  const known = (mappingIndex ?? activeStatementProductMappingIndex).products[rawCode];
  const category = known?.category ?? inferStatementProductCategory(rawCode);

  return {
    rawCode,
    label: known?.label ?? rawCode,
    productKey: known?.productKey ?? null,
    category,
    usesAnnualPremiumBase: shouldUseAnnualPremiumBase(known, category),
    note: known?.note ?? undefined,
  };
};

const parseOptionalMoney = (value: string | null | undefined): number | null => {
  const normalized = String(value ?? "")
    .replace(/Kč/gi, "")
    .replace(/[−–]/g, "-")
    .replace(/\s/g, "")
    .replace(",", ".")
    .trim();
  if (!/\d/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseMoney = (value: string | null | undefined): number =>
  parseOptionalMoney(value) ?? 0;

const formatMoney = (value: number): string =>
  value.toLocaleString("cs-CZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatWholeMoney = (value: number): string =>
  value.toLocaleString("cs-CZ", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

const formatSystemDate = (value: number | string | null | undefined): string => {
  if (value == null || value === "") return "—";
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const paymentsPerYearForFrequency = (frequency: string | null | undefined): number => {
  switch (normalizeCommissionTitle(frequency)) {
    case "monthly":
    case "mesicne":
    case "mesicni":
      return 12;
    case "quarterly":
    case "ctvrtletne":
    case "ctvrtletni":
      return 4;
    case "semiannual":
    case "semi annual":
    case "pololetne":
    case "pololetni":
      return 2;
    case "annual":
    case "rocne":
    case "rocni":
    default:
      return 1;
  }
};

const statementPaymentBundleCount = ({
  statementBase,
  systemPaymentBase,
  statementCommission,
  expectedCommissionPerPayment,
  systemFrequency,
  baseTolerance = 1,
  commissionTolerance = 1,
}: {
  statementBase: number;
  systemPaymentBase: number;
  statementCommission: number;
  expectedCommissionPerPayment: number;
  systemFrequency: string | null | undefined;
  baseTolerance?: number;
  commissionTolerance?: number;
}): number | null => {
  const paymentsPerYear = paymentsPerYearForFrequency(systemFrequency);
  if (paymentsPerYear <= 1) return null;

  const values = [
    statementBase,
    systemPaymentBase,
    statementCommission,
    expectedCommissionPerPayment,
  ];
  if (values.some((value) => !Number.isFinite(value) || value <= 0)) return null;

  const paymentCount = Math.round(statementBase / systemPaymentBase);
  if (paymentCount < 2 || paymentCount > paymentsPerYear) return null;
  if (
    Math.abs(statementBase - systemPaymentBase * paymentCount) >
    Math.max(0, baseTolerance)
  ) {
    return null;
  }

  const expectedCommission = expectedCommissionPerPayment * paymentCount;
  if (
    Math.abs(statementCommission - expectedCommission) >
    Math.max(0, commissionTolerance)
  ) {
    return null;
  }

  return paymentCount;
};

const managerCommissionRowIdentity = (row: ManagerCommissionRow): string => {
  const sourceKey = normalizeText(row.sourceKey);
  if (sourceKey) return sourceKey;

  const numberPart = (value: number): string =>
    Number.isFinite(value) ? value.toFixed(2) : "unknown";
  return [
    normalizeText(row.id),
    normalizeContractNumberForMatch(row.contractNumber),
    normalizeProductCode(row.product),
    normalizeText(row.type).toUpperCase(),
    numberPart(row.base),
    numberPart(row.commission),
    numberPart(row.reserveFund),
    normalizeText(row.career),
    row.isStorno ? "storno" : "commission",
  ].join(":");
};

type StatementPremiumBasePeriod = "annual" | "payment";

const resolveStatementPremiumBasePeriod = ({
  product,
  statementBase,
  systemPaymentBase,
  systemFrequency,
  fallbackPeriod,
  mappingIndex,
}: {
  product: string;
  statementBase: number;
  systemPaymentBase: number;
  systemFrequency: string | null | undefined;
  fallbackPeriod?: StatementPremiumBasePeriod;
  mappingIndex?: StatementProductMappingIndex | null;
}): StatementPremiumBasePeriod => {
  const resolvedMapping = statementProductMappingIndexFromInput(mappingIndex);
  const rawCode = normalizeProductCode(product) || "NEZNAMY_PRODUKT";
  const configuredProduct = resolvedMapping.products[rawCode];
  const productMeta = resolveStatementProduct(product, resolvedMapping);

  if (configuredProduct?.baseRule === "annual") return "annual";
  if (configuredProduct?.baseRule === "statement") return "payment";

  const fallback =
    fallbackPeriod ?? (productMeta.usesAnnualPremiumBase ? "annual" : "payment");
  if (productMeta.category !== "auto") return fallback;

  const base = Number(statementBase);
  const paymentBase = Number(systemPaymentBase);
  const paymentsPerYear = paymentsPerYearForFrequency(systemFrequency);
  if (
    !Number.isFinite(base) ||
    base <= 0 ||
    !Number.isFinite(paymentBase) ||
    paymentBase <= 0 ||
    paymentsPerYear <= 1
  ) {
    return fallback;
  }

  const paymentDifference = Math.abs(base - paymentBase);
  const annualDifference = Math.abs(base - paymentBase * paymentsPerYear);
  return annualDifference <= paymentDifference ? "annual" : "payment";
};

const usesIndependentStatementCommissionBase = (
  product: string | null | undefined,
  mappingIndex?: StatementProductMappingIndex | null
): boolean => {
  const productKey = resolveStatementProduct(product ?? "", mappingIndex).productKey;
  return productKey === "pillowmajetek";
};

const paymentFrequencyLabel = (frequency: string | null | undefined): string => {
  switch (normalizeCommissionTitle(frequency)) {
    case "monthly":
    case "mesicne":
    case "mesicni":
      return "měsíčně";
    case "quarterly":
    case "ctvrtletne":
    case "ctvrtletni":
      return "čtvrtletně";
    case "semiannual":
    case "semi annual":
    case "pololetne":
    case "pololetni":
      return "pololetně";
    case "annual":
    case "rocne":
    case "rocni":
      return "ročně";
    default:
      return "bez frekvence";
  }
};

const paymentAmountWithFrequencyLabel = (
  amount: number,
  frequency: string | null | undefined
): string => {
  const frequencyLabel = paymentFrequencyLabel(frequency);
  return frequencyLabel === "bez frekvence"
    ? `${formatWholeMoney(amount)} Kč`
    : `${formatWholeMoney(amount)} Kč ${frequencyLabel}`;
};

const parseLocalDate = (
  value: number | string | Date | null | undefined
): Date | null => {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const normalized = normalizeText(value);
  const czechDate = normalized.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  if (czechDate) {
    const day = Number(czechDate[1]);
    const month = Number(czechDate[2]);
    const year = Number(czechDate[3]);
    if (day > 0 && month > 0 && month <= 12 && year > 1900) {
      return new Date(year, month - 1, day, 12);
    }
  }

  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
};

const parsePeriodEndDate = (period: string | null | undefined): Date | null => {
  const matches = [...normalizeText(period).matchAll(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/g)];
  const last = matches.at(-1);
  if (!last) return null;
  return parseLocalDate(last[0]);
};

const parsePeriodStartDate = (period: string | null | undefined): Date | null => {
  const matches = [...normalizeText(period).matchAll(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/g)];
  const first = matches[0];
  if (!first) return null;
  return parseLocalDate(first[0]);
};

const monthKeyFromDate = (date: Date | null | undefined): string | null => {
  if (!date || Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

const monthKeyFromStatementPeriod = (period: string | null | undefined): string | null =>
  monthKeyFromDate(parsePeriodEndDate(period));

const monthKeyIndex = (monthKey: string | null | undefined): number | null => {
  const match = normalizeText(monthKey).match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null;
  }
  return year * 12 + (month - 1);
};

const monthKeyFromIndex = (index: number): string => {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
};

const addMonthsToMonthKey = (
  monthKey: string | null | undefined,
  delta: number
): string | null => {
  const index = monthKeyIndex(monthKey);
  return index == null ? null : monthKeyFromIndex(index + delta);
};

const formatMonthKey = (monthKey: string | null | undefined): string => {
  const match = normalizeText(monthKey).match(/^(\d{4})-(\d{2})$/);
  return match ? `${match[2]}/${match[1]}` : "—";
};

const addYearsToLocalDate = (date: Date, years: number): Date =>
  new Date(date.getFullYear() + years, date.getMonth(), date.getDate(), 12);

const addMonthsToLocalDate = (date: Date, months: number): Date => {
  const firstOfTargetMonth = new Date(date.getFullYear(), date.getMonth() + months, 1, 12);
  const lastDayOfTargetMonth = new Date(
    firstOfTargetMonth.getFullYear(),
    firstOfTargetMonth.getMonth() + 1,
    0
  ).getDate();
  return new Date(
    firstOfTargetMonth.getFullYear(),
    firstOfTargetMonth.getMonth(),
    Math.min(date.getDate(), lastDayOfTargetMonth),
    12
  );
};

const formatLocalDate = (date: Date | null | undefined): string =>
  date
    ? date.toLocaleDateString("cs-CZ", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "—";

const toDateInputValue = (date: Date | null | undefined): string => {
  if (!date || Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const productLabelFromKey = (productKey: Product | null | undefined): string =>
  productKey ? PRODUCT_CATALOG[productKey]?.label ?? productKey : "—";

const normalizeStatementCommissionCode = (value: string | null | undefined): string =>
  String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");

const baseCommissionCodeForStatementComparison = (
  value: string | null | undefined
): string => {
  const code = normalizeStatementCommissionCode(value);
  const closingRoleMatch = code.match(/^(?:APZ|AP|AZ)(\d+)$/);
  return closingRoleMatch ? `A${closingRoleMatch[1]}` : code;
};

const managerCommissionCodeForSystemItems = (
  value: string | null | undefined
): string => {
  const code = normalizeStatementCommissionCode(value);
  if (/^NB\d+/.test(code)) return "B0301";
  if (/^NV(?:PZ?|Z)?\d+/.test(code)) return "A101";
  return baseCommissionCodeForStatementComparison(code);
};

const commissionCodeAliasesForPayoutHistory = (
  value: string | null | undefined
): string[] => {
  const code = normalizeStatementCommissionCode(value);
  if (!code) return [];

  const aliases = new Set<string>();
  const addAlias = (alias: string) => {
    const normalized = normalizeStatementCommissionCode(alias);
    if (!normalized) return;
    aliases.add(normalized);
    aliases.add(normalized.replace(/[_-]/g, ""));
  };

  addAlias(code);
  const comparableSystemCode = managerCommissionCodeForSystemItems(code);
  if (comparableSystemCode !== code) addAlias(comparableSystemCode);

  const compact = code.replace(/[_-]/g, "");
  const installmentRangeMatch = code.match(/^([AB])(\d{3})-\1(\d{3})$/);
  if (installmentRangeMatch) {
    const prefix = installmentRangeMatch[1] ?? "";
    const start = Number(installmentRangeMatch[2]);
    const end = Number(installmentRangeMatch[3]);
    if (
      prefix &&
      Number.isInteger(start) &&
      Number.isInteger(end) &&
      end >= start &&
      end - start <= 24
    ) {
      for (let item = start; item <= end; item += 1) {
        addAlias(`${prefix}${String(item).padStart(3, "0")}`);
      }
    }
  }

  if (compact === "B36HALF" || compact === "B036HALF" || compact === "B3601HALF") {
    ["B36_HALF", "B036_HALF", "B3601_HALF"].forEach(addAlias);
  } else if (compact === "B36" || compact === "B036" || compact === "B3601") {
    ["B36", "B036", "B3601"].forEach(addAlias);
  } else if (compact === "B48" || compact === "B048" || compact === "B4801") {
    ["B48", "B048", "B4801"].forEach(addAlias);
  } else if (compact === "B101B104") {
    ["B101-B104", "B101", "B102", "B103", "B104"].forEach(addAlias);
  } else if (compact === "B201B206") {
    ["B201-B206", "B201", "B202", "B203", "B204", "B205", "B206"].forEach(addAlias);
  } else if (/^B20[1-6]$/.test(compact)) {
    addAlias("B201-B206");
  }

  const closingRoleMatch = compact.match(/^(?:APZ|AP|AZ)(\d+)$/);
  if (closingRoleMatch) addAlias(`A${closingRoleMatch[1]}`);

  return [...aliases];
};

/**
 * Výpisy označují provizi z dodatku kódy NV/NB, zatímco výpočet dodatku
 * ukládá stejné složky pod původními kódy A101/B0301. Porovnáváme proto
 * konkrétní kódy z řádků výpisu, ne obecný text "navýšení" v názvu položky.
 */
const expectedPremiumIncreaseAmountFromItems = (
  items: CommissionResultItemDTO[] | null | undefined,
  rows: Array<Pick<CommissionRow, "type">>
): number => {
  const expectedCodes = new Set(
    rows
      .map((row) => managerCommissionCodeForSystemItems(row.type))
      .filter(Boolean)
  );
  const comparableItems = (items ?? []).filter((item) => {
    const code = normalizeStatementCommissionCode(item.code);
    const title = normalizeCommissionTitle(item.title);
    return code !== "TOTAL" && title !== "celkem" && title !== "celkova provize";
  });

  return [...expectedCodes].reduce((sum, expectedCode) => {
    const exactMatches = comparableItems.filter(
      (item) => baseCommissionCodeForStatementComparison(item.code) === expectedCode
    );
    const matches =
      exactMatches.length > 0
        ? exactMatches
        : comparableItems.filter((item) =>
            normalizeCommissionTitle(item.title).includes(
              normalizeCommissionTitle(expectedCode)
            )
          );
    return (
      sum +
      matches.reduce(
        (itemSum, item) =>
          itemSum + (Number.isFinite(Number(item.amount)) ? Number(item.amount) : 0),
        0
      )
    );
  }, 0);
};

const isNeonInitialCommissionCode = (value: string | null | undefined): boolean => {
  const code = baseCommissionCodeForStatementComparison(value);
  return code === "A101" || code === "B0301";
};

const isLifePremiumIncreaseCommissionCode = (
  code: string | null | undefined
): boolean => {
  const cleanCode = normalizeStatementCommissionCode(code);
  return /^(?:NV(?:PZ?|Z)?|NB)\d+/.test(cleanCode);
};

const classifyLifeSplitCommissionCode = (
  code: string
): { kind: LifeSplitCommissionKind; label: string } => {
  const cleanCode = normalizeStatementCommissionCode(code);
  const comparableCode = baseCommissionCodeForStatementComparison(cleanCode);

  if (isLifePremiumIncreaseCommissionCode(cleanCode)) {
    return { kind: "increase", label: "Provize za navýšení smlouvy" };
  }
  if (comparableCode === "A101") {
    return {
      kind: "a101",
      label:
        cleanCode === "A101"
          ? "Provize A101"
          : `Provize ${cleanCode} (A101 - rozdělená role sjednatele)`,
    };
  }
  if (comparableCode === "B0301") return { kind: "b0301", label: "Provize B0301" };
  if (cleanCode === "B3601" || cleanCode === "B36" || cleanCode === "B036") {
    return { kind: "b3601", label: `Provize ${cleanCode}` };
  }
  if (cleanCode === "B4801" || cleanCode === "B48" || cleanCode === "B048") {
    return { kind: "b4801", label: `Provize ${cleanCode}` };
  }
  if (/^B10[1-4]$/.test(cleanCode)) {
    return { kind: "subsequent", label: `Následná provize ${cleanCode}` };
  }
  if (/^B20[1-6]$/.test(cleanCode)) {
    return { kind: "care", label: `Pečovatelská provize ${cleanCode}` };
  }
  if (cleanCode === "ATP101") return { kind: "tip", label: "Provize z TIPU" };
  return { kind: "unknown", label: `Nezařazený kód ${cleanCode || "-"}` };
};

const classifyGeneralCommissionCode = (
  product: string,
  code: string
): { kind: GeneralCommissionKind; label: string } => {
  const cleanCode = code.trim().toUpperCase();
  const cleanProduct = product.trim().toUpperCase();

  if (!cleanCode) return { kind: "unknown", label: "Nezařazený kód" };
  if (cleanCode === "ATP101") return { kind: "tip", label: "Provize z TIPU" };
  if (cleanProduct.startsWith("TU_")) {
    return {
      kind: "troyOunce",
      label: "Troyská unce - význam kódu závisí na variantě produktu",
    };
  }
  if (cleanCode === "KOMP") return { kind: "compensation", label: "Kompenzační provize" };
  if (cleanCode === "PK") return { kind: "office", label: "Prémie na kancelář" };
  if (cleanCode === "POK") return { kind: "penalty", label: "Pokuta" };
  if (/^PVYP[12]$/.test(cleanCode)) {
    return { kind: "gradual", label: "Provize s postupným vyplácením" };
  }
  if (isLifePremiumIncreaseCommissionCode(cleanCode)) {
    return { kind: "increase", label: "Provize za navýšení smlouvy" };
  }
  if (/^(?:APZ|AP|AZ)\d+/.test(cleanCode)) {
    return { kind: "closing", label: "Provize za uzavření - rozdělená role sjednatele" };
  }
  if (/^AC\d+/.test(cleanCode)) {
    return { kind: "closing", label: "Provize za uzavření - auta" };
  }
  if (/^A\d+/.test(cleanCode)) {
    return { kind: "closing", label: "Provize za uzavření smlouvy" };
  }
  if (/^(?:CPZ|CP|CZ)\d+/.test(cleanCode)) {
    return { kind: "unexpected", label: "Neočekávaná provize - rozdělená role sjednatele" };
  }
  if (/^C\d+/.test(cleanCode)) {
    return { kind: "unexpected", label: "Neočekávaná provize" };
  }
  if (/^BC\d+/.test(cleanCode)) {
    return { kind: "subsequent", label: "Následná provize - auta" };
  }
  if (/^(?:B30|B70|B03|B36|B036|B42|B48|B048)\d*$/.test(cleanCode)) {
    return { kind: "installment", label: "Splátka provize" };
  }
  if (/^B\d+/.test(cleanCode)) {
    return { kind: "subsequent", label: "Následná provize" };
  }

  return { kind: "unknown", label: `Nezařazený kód ${cleanCode}` };
};

const COMMISSION_CODE_RULES: CommissionCodeRule[] = [
  {
    codes: "A1-9",
    label: "Provize za uzavření smlouvy",
    category: "closing",
    note: "Ve výpisu se běžně používá i delší tvar, například A101.",
    matchers: [/^A\d+$/],
  },
  {
    codes: "AC1",
    label: "Provize za uzavření smlouvy - auta",
    category: "closing",
    matchers: [/^AC\d+$/],
  },
  {
    codes: "AP1",
    label:
      "Provize za uzavření - výplata pro sjednatele na pozici uzavírající, liší-li se od získatele",
    category: "closingRole",
    matchers: [/^AP\d+$/],
  },
  {
    codes: "APZ1",
    label:
      "Provize za uzavření - výplata pro sjednatele na pozici uzavírající, neliší-li se od získatele",
    category: "closingRole",
    matchers: [/^APZ\d+$/],
  },
  {
    codes: "AZ1",
    label:
      "Provize za uzavření - výplata pro sjednatele na pozici získatele, liší-li se od uzavírajícího",
    category: "closingRole",
    matchers: [/^AZ\d+$/],
  },
  {
    codes: "ATP101",
    label: "Provize z TIPU",
    category: "tip",
    note: "Páruje se přes TIP vazbu, ne jako vlastní sjednaná smlouva.",
    matchers: [/^ATP101$/],
  },
  {
    codes: "B1",
    label: "Následná provize od 2. roku dále nebo splátka 30 % po 2 měsících",
    category: "subsequent",
    matchers: [/^B1$/, /^B10\d*$/],
  },
  {
    codes: "B2",
    label: "Následná provize od dalšího roku dále nebo splátka 70 % po 2 letech",
    category: "subsequent",
    matchers: [/^B2$/, /^B20\d*$/],
  },
  {
    codes: "B3-9",
    label: "Následná provize",
    category: "subsequent",
    matchers: [/^B[3-9]$/, /^B[3-9]01$/],
  },
  {
    codes: "B0301",
    label: "Provize B0301 / karta klienta",
    category: "installment",
    matchers: [/^B0301$/],
  },
  {
    codes: "B30",
    label: "2. splátka provize pro smlouvy od 1.9.2014",
    category: "installment",
    matchers: [/^B30\d*$/],
  },
  {
    codes: "B70",
    label: "3. splátka provize pro smlouvy od 1.9.2014",
    category: "installment",
    matchers: [/^B70\d*$/],
  },
  {
    codes: "B03",
    label: "2. splátka provize pro smlouvy od 1.12.2016",
    category: "installment",
    matchers: [/^B03\d*$/],
  },
  {
    codes: "B36",
    label: "3. splátka provize pro smlouvy od 1.12.2016",
    category: "installment",
    matchers: [/^B36\d*$/, /^B036\d*$/],
  },
  {
    codes: "B42",
    label: "4. splátka provize pro smlouvy od 1.12.2016",
    category: "installment",
    matchers: [/^B42\d*$/],
  },
  {
    codes: "BC1",
    label: "Následná provize - auta",
    category: "subsequent",
    matchers: [/^BC\d+$/],
  },
  {
    codes: "C1",
    label: "Neočekávaná provize",
    category: "unexpected",
    matchers: [/^C\d+$/],
  },
  {
    codes: "CP1",
    label:
      "Neočekávaná provize - výplata pro sjednatele na pozici uzavírající, liší-li se od získatele",
    category: "unexpected",
    matchers: [/^CP\d+$/],
  },
  {
    codes: "CPZ1",
    label:
      "Neočekávaná provize - výplata pro sjednatele na pozici uzavírající, neliší-li se od získatele",
    category: "unexpected",
    matchers: [/^CPZ\d+$/],
  },
  {
    codes: "CZ1",
    label:
      "Neočekávaná provize - výplata pro sjednatele na pozici získatele, liší-li se od uzavírajícího",
    category: "unexpected",
    matchers: [/^CZ\d+$/],
  },
  {
    codes: "KOMP",
    label: "Kompenzační provize - Refresh",
    category: "adjustment",
    matchers: [/^KOMP$/],
  },
  {
    codes: "NV1-3 / NB",
    label: "Provize za navýšení smlouvy",
    category: "increase",
    note: "NB se ve výpisech používá jako varianta kódu navýšení.",
    matchers: [/^NV[1-3]$/, /^NB\d*$/],
  },
  {
    codes: "NVP1-3",
    label:
      "Provize za navýšení - výplata pro sjednatele na pozici uzavírající, liší-li se od získatele",
    category: "increase",
    matchers: [/^NVP[1-3]$/],
  },
  {
    codes: "NVPZ1-3",
    label:
      "Provize za navýšení - výplata pro sjednatele na pozici uzavírající, neliší-li se od získatele",
    category: "increase",
    matchers: [/^NVPZ[1-3]$/],
  },
  {
    codes: "NVZ1-3",
    label:
      "Provize za navýšení - výplata pro sjednatele na pozici získatele, liší-li se od uzavírajícího",
    category: "increase",
    matchers: [/^NVZ[1-3]$/],
  },
  {
    codes: "PK",
    label: "Prémie na kancelář",
    category: "office",
    matchers: [/^PK$/],
  },
  {
    codes: "POK",
    label: "Pokuta",
    category: "office",
    matchers: [/^POK$/],
  },
  {
    codes: "PVYP1",
    label: "Provize s postupným vyplácením",
    category: "other",
    matchers: [/^PVYP1$/],
  },
  {
    codes: "PVYP2",
    label: "Provize s postupným vyplácením - jen produkt Exclusive",
    category: "other",
    matchers: [/^PVYP2$/],
  },
];

const TROY_OUNCE_COMMISSION_CODE_RULES: CommissionCodeRule[] = [
  {
    codes: "A1",
    label: "TU_JN - za nákup; TU_ZP - z poplatku, Přednostní; TU_ZS - z poplatku",
    category: "troyOunce",
    matchers: [/^A1$/],
  },
  {
    codes: "A2",
    label: "TU_JN - přirážka zprostředkovatele; TU_ZP - z měsíční splátky, Poměrně",
    category: "troyOunce",
    matchers: [/^A2$/],
  },
  {
    codes: "A3",
    label:
      "TU_ZP - z poplatku nebo měsíční splátky, Postupně; TU_ZP - přirážka zprostředkovatele",
    category: "troyOunce",
    matchers: [/^A3$/],
  },
  {
    codes: "B1",
    label: "TU_ZS - přirážka zprostředkovatele",
    category: "troyOunce",
    matchers: [/^B1$/],
  },
];

const classifyContractStatusCode = (
  code: string
): Pick<ContractStatusRule, "category" | "importDecision"> => {
  if (code === "A001") {
    return {
      category: "active",
      importDecision: "Lze párovat jako běžnou aktivní smlouvu.",
    };
  }
  if (code.startsWith("C") || code.startsWith("N")) {
    return {
      category: "pending",
      importDecision: "Nová nebo čekající smlouva. Před automatickým uložením ověřit stav.",
    };
  }
  if (code === "H001") {
    return {
      category: "matured",
      importDecision: "Dožitá smlouva. Nepárovat jako novou sjednávací provizi.",
    };
  }
  if (code === "Q001") {
    return {
      category: "transferred",
      importDecision: "Převedená smlouva. Vyžaduje kontrolu vlastníka a původu provize.",
    };
  }
  if (code.startsWith("S")) {
    return {
      category: "storno",
      importDecision: "Storno. Ukládat jako storno/korekci, ne jako běžné vyplacení.",
    };
  }
  if (code.startsWith("X")) {
    return {
      category: "invalid",
      importDecision: "Chybná nebo nerealizovaná smlouva. Blokovat automatické uložení.",
    };
  }
  return {
    category: "unknown",
    importDecision: "Neznámý stav. Ruční kontrola.",
  };
};

const extractHeader = (html: string, doc: Document): StatementHeader => {
  const plainText = normalizeText(doc.body.textContent);

  return {
    advisorNumber: plainText.match(/Číslo poradce:\s*([0-9]+)/i)?.[1] ?? null,
    period:
      plainText.match(
        /Období:\s*([0-9]{2}\.[0-9]{2}\.[0-9]{4}\s*-\s*[0-9]{2}\.[0-9]{2}\.[0-9]{4})/i
      )?.[1] ?? null,
    statementNumber: plainText.match(/Číslo výpisu:\s*([0-9]+)/i)?.[1] ?? null,
    statementDate: html.match(/ze dne\s+([0-9]{2}\.[0-9]{2}\.[0-9]{4})/i)?.[1] ?? null,
  };
};

const rowCells = (row: HTMLTableRowElement): string[] =>
  Array.from(row.cells).map((cell) => normalizeText(cell.textContent));

const isHtmlTableElement = (element: Element): element is HTMLTableElement =>
  element.tagName.toLowerCase() === "table";

const directTableChildren = (section: Element): HTMLTableElement[] =>
  Array.from(section.children).filter(isHtmlTableElement);

const directTableAfterBoldHeading = (
  section: Element,
  heading: string
): HTMLTableElement | null => {
  const normalizedHeading = normalizeText(heading).toUpperCase();
  let seenHeading = false;

  for (const child of Array.from(section.children)) {
    if (
      child.tagName.toLowerCase() === "b" &&
      normalizeText(child.textContent).toUpperCase() === normalizedHeading
    ) {
      seenHeading = true;
      continue;
    }

    if (seenHeading && isHtmlTableElement(child)) return child;
  }

  return null;
};

const normalizeExternalHref = (href: string | null | undefined): string | null => {
  const cleanHref = normalizeText(href);
  if (!cleanHref || cleanHref.toLowerCase().startsWith("javascript:")) return null;

  try {
    return new URL(cleanHref, "https://sjednatel.bohemiaservis.cz/").toString();
  } catch {
    return cleanHref;
  }
};

const contractDetailUrlFromRow = (row: HTMLTableRowElement): string | null =>
  normalizeExternalHref(
    row.cells[0]?.querySelector<HTMLAnchorElement>("a[href]")?.getAttribute("href")
  );

const parseContractStatusRules = (doc: Document): ContractStatusRule[] => {
  const section = doc.getElementById("kody_stavu_smluv");
  if (!section) return [];

  return Array.from(section.querySelectorAll("tr"))
    .map(rowCells)
    .filter((cells) => /^[A-Z][A-Z0-9]{3,5}$/.test((cells[0] ?? "").trim()))
    .map((cells) => {
      const code = (cells[0] ?? "").trim();
      return {
        code,
        label: cells[1] ?? "",
        ...classifyContractStatusCode(code),
      };
    });
};

const parseCommissionRows = (doc: Document): CommissionRow[] => {
  const section = doc.getElementById("provize");
  if (!section) return [];
  const table = directTableChildren(section)[0];
  if (!table) return [];

  return Array.from(table.tBodies[0]?.rows ?? [])
    .map((row) => ({ cells: rowCells(row), detailUrl: contractDetailUrlFromRow(row) }))
    .filter(({ cells }) => /^\d+$/.test(cells[0] ?? "") && cells.length >= 14)
    .map(({ cells, detailUrl }) => {
      const type = (cells[7] ?? "").trim().toUpperCase();
      const lifeSplitClassification = classifyLifeSplitCommissionCode(type);

      return {
        id: cells[0] ?? "",
        detailUrl,
        contractNumber: cells[1] ?? "",
        signedAt: cells[2] ?? "",
        validFrom: cells[3] ?? "",
        client: cells[4] ?? "",
        role: cells[5] ?? "",
        product: (cells[6] ?? "").trim(),
        type,
        base: parseMoney(cells[8]),
        percent: cells[10] ?? "",
        career: cells[11] ?? "",
        commission: parseMoney(cells[12]),
        reserveFund: parseMoney(cells[13]),
        lifeSplitKind: lifeSplitClassification.kind,
        lifeSplitLabel: lifeSplitClassification.label,
      };
    });
};

const parseDeductionRows = (doc: Document): DeductionCommissionRow[] => {
  const section = doc.getElementById("odecty");
  const table = section ? directTableChildren(section)[0] : null;
  if (!table) return [];

  return Array.from(table.tBodies[0]?.rows ?? [])
    .map((row) => ({ cells: rowCells(row), detailUrl: contractDetailUrlFromRow(row) }))
    .filter(({ cells }) => /^\d+$/.test(cells[0] ?? "") && cells.length >= 13)
    .map(({ cells, detailUrl }) => ({
      id: cells[0] ?? "",
      detailUrl,
      contractNumber: cells[1] ?? "",
      signedAt: cells[2] ?? "",
      client: cells[3] ?? "",
      role: cells[4] ?? "",
      product: (cells[5] ?? "").trim(),
      type: (cells[6] ?? "").trim().toUpperCase(),
      base: parseMoney(cells[7]),
      percent: cells[9] ?? "",
      career: cells[10] ?? "",
      commission: parseMoney(cells[11]),
      reserveFund: parseMoney(cells[12]),
    }))
    .filter((row) => row.contractNumber.length > 0);
};

const moneyAmountsMatch = (left: number, right: number): boolean =>
  Math.abs(left - right) <= MONEY_MATCH_TOLERANCE;

const normalizedRowText = (value: string | null | undefined): string =>
  normalizeText(value).toUpperCase().replace(/\s+/g, "");

const deductionOffsetsCommissionRow = (
  row: CommissionRow,
  deduction: DeductionCommissionRow
): boolean =>
  row.commission > 0 &&
  deduction.commission < 0 &&
  normalizedRowText(row.contractNumber) === normalizedRowText(deduction.contractNumber) &&
  normalizedRowText(row.product) === normalizedRowText(deduction.product) &&
  normalizedRowText(row.type) === normalizedRowText(deduction.type) &&
  normalizedRowText(row.career) === normalizedRowText(deduction.career) &&
  normalizedRowText(row.percent) === normalizedRowText(deduction.percent) &&
  moneyAmountsMatch(row.base, deduction.base) &&
  moneyAmountsMatch(row.commission, Math.abs(deduction.commission)) &&
  moneyAmountsMatch(row.reserveFund, Math.abs(deduction.reserveFund));

const filterCommissionRowsOffsetByDeductions = (
  commissionRows: CommissionRow[],
  deductionRows: DeductionCommissionRow[]
): CommissionRow[] => {
  if (deductionRows.length === 0) return commissionRows;

  const usedDeductionIndexes = new Set<number>();
  return commissionRows.filter((row) => {
    const matchIndex = deductionRows.findIndex(
      (deduction, index) =>
        !usedDeductionIndexes.has(index) && deductionOffsetsCommissionRow(row, deduction)
    );
    if (matchIndex < 0) return true;

    usedDeductionIndexes.add(matchIndex);
    return false;
  });
};

const commissionRowCorrectionKey = (
  statementKey: string,
  row: Pick<
    CommissionRow,
    | "id"
    | "contractNumber"
    | "product"
    | "type"
    | "base"
    | "percent"
    | "career"
    | "commission"
    | "reserveFund"
  >
): string =>
  [
    statementKey,
    row.id,
    normalizedRowText(row.contractNumber),
    normalizedRowText(row.product),
    normalizedRowText(row.type),
    row.base,
    normalizedRowText(row.percent),
    normalizedRowText(row.career),
    row.commission,
    row.reserveFund,
  ].join("|");

const commissionRowCanReplaceDeduction = (
  row: CommissionRow,
  deduction: DeductionCommissionRow
): boolean =>
  row.commission > 0 &&
  normalizedRowText(row.contractNumber) === normalizedRowText(deduction.contractNumber) &&
  normalizedRowText(row.product) === normalizedRowText(deduction.product) &&
  normalizedRowText(row.type) === normalizedRowText(deduction.type) &&
  moneyAmountsMatch(row.base, deduction.base) &&
  !deductionOffsetsCommissionRow(row, deduction);

const statementCorrectionSortValue = (
  statement: ParsedStatement,
  index: number
): number => {
  const periodEnd = parsePeriodEndDate(statement.header.period)?.getTime();
  if (periodEnd != null && Number.isFinite(periodEnd)) return periodEnd;
  const statementDate = parseLocalDate(statement.header.statementDate)?.getTime();
  if (statementDate != null && Number.isFinite(statementDate)) return statementDate;
  const statementNumber = Number(statement.header.statementNumber);
  if (Number.isFinite(statementNumber)) return statementNumber;
  return index;
};

const parseStatementPayoutTotal = (doc: Document): number | null => {
  for (const table of Array.from(doc.querySelectorAll("table"))) {
    const rows = Array.from(table.rows).map(rowCells);
    const headerCells = rows.find((cells) => {
      const normalizedCells = cells.map(normalizeCommissionTitle);
      return (
        normalizedCells.includes("provizni narok") &&
        normalizedCells.includes("k vyplate")
      );
    });
    if (!headerCells) continue;

    const payoutColumnIndex = headerCells.findIndex(
      (cell) => normalizeCommissionTitle(cell) === "k vyplate"
    );
    if (payoutColumnIndex < 0) continue;

    for (const cells of [...rows].reverse()) {
      const totalLabelIndex = cells.findIndex(
        (cell) => normalizeCommissionTitle(cell) === "celkem"
      );
      if (totalLabelIndex < 0) continue;

      const payoutTotal = parseOptionalMoney(cells[payoutColumnIndex]);
      if (payoutTotal != null) return payoutTotal;

      const fallbackTotal = [...cells]
        .reverse()
        .map((cell) => parseOptionalMoney(cell))
        .find((value) => value != null);
      if (fallbackTotal != null) return fallbackTotal;
    }
  }

  return null;
};

const parseStornoRows = (doc: Document): StornoCommissionRow[] => {
  const explicitSection = doc.getElementById("storna");
  const provizeSection = doc.getElementById("provize");
  const table =
    explicitSection && isHtmlTableElement(explicitSection)
      ? explicitSection
      : explicitSection?.querySelector<HTMLTableElement>("table") ??
        (provizeSection ? directTableAfterBoldHeading(provizeSection, "STORNA") : null);
  if (!table) return [];

  return Array.from(table.tBodies[0]?.rows ?? [])
    .map((row) => ({ cells: rowCells(row), detailUrl: contractDetailUrlFromRow(row) }))
    .filter(({ cells }) => /^\d+$/.test(cells[0] ?? "") && cells.length >= 14)
    .map(({ cells, detailUrl }) => ({
      id: cells[0] ?? "",
      detailUrl,
      contractNumber: cells[1] ?? "",
      signedAt: cells[2] ?? "",
      client: cells[3] ?? "",
      role: cells[4] ?? "",
      product: (cells[5] ?? "").trim(),
      type: (cells[6] ?? "").trim().toUpperCase(),
      statusCode: (cells[7] ?? "").trim().toUpperCase(),
      base: parseMoney(cells[8]),
      percent: cells[10] ?? "",
      career: cells[11] ?? "",
      commission: parseMoney(cells[12]),
      reserveFund: parseMoney(cells[13]),
    }))
    .filter((row) => row.contractNumber.length > 0);
};

const parseOtherPayments = (doc: Document): OtherPayment[] => {
  const section = doc.getElementById("ostatni_platby");
  if (!section) return [];

  return Array.from(section.querySelectorAll("tr"))
    .map(rowCells)
    .filter((cells) => {
      const description = cells[0] ?? "";
      return (
        cells.length >= 2 &&
        !/^Popis$/i.test(description) &&
        !/^Počet položek:/i.test(description)
      );
    })
    .map((cells) => {
      const description = cells[0] ?? "";
      const amount = parseMoney(cells[1]);
      return {
        description,
        contractNumber: description.match(/smlouvy\s+(\d+)/i)?.[1] ?? null,
        amount,
        isB36Half: /50\s*%[\s\S]*(?:provize\s*)?B(?:036|36|3601)\b/i.test(description),
        isStorno: /^Storno/i.test(description),
      };
    });
};

const parseManagerCommissionRows = (
  table: HTMLTableElement,
  rowKind: "commission" | "deduction" | "storno",
  sourcePrefix: string
): ManagerCommissionRow[] =>
  Array.from(table.tBodies[0]?.rows ?? [])
    .map((row, rowIndex) => ({
      cells: rowCells(row),
      detailUrl: contractDetailUrlFromRow(row),
      sourceKey: `${sourcePrefix}:${rowIndex}`,
    }))
    .filter(({ cells }) => /^\d+$/.test(cells[0] ?? "") && cells.length >= 13)
    .map(({ cells, detailUrl, sourceKey }) => ({
      sourceKey,
      id: cells[0] ?? "",
      detailUrl,
      contractNumber: cells[1] ?? "",
      signedAt: cells[2] ?? "",
      client: cells[3] ?? "",
      role: cells[4] ?? "",
      product: (cells[5] ?? "").trim(),
      type: (cells[6] ?? "").trim().toUpperCase(),
      base: parseMoney(cells[7]),
      percent: cells[9] ?? "",
      career: cells[10] ?? "",
      commission: parseMoney(cells[11]),
      reserveFund: parseMoney(cells[12]),
      isStorno: rowKind === "storno",
      isDeduction: rowKind === "deduction",
    }))
    .filter((row) => row.contractNumber.length > 0);

const managerDeductionOffsetsCommissionRow = (
  row: ManagerCommissionRow,
  deduction: ManagerCommissionRow
): boolean =>
  row.commission > 0 &&
  !row.isStorno &&
  !row.isDeduction &&
  deduction.commission < 0 &&
  Boolean(deduction.isDeduction) &&
  normalizedRowText(row.contractNumber) === normalizedRowText(deduction.contractNumber) &&
  normalizedRowText(row.product) === normalizedRowText(deduction.product) &&
  normalizedRowText(row.type) === normalizedRowText(deduction.type) &&
  normalizedRowText(row.career) === normalizedRowText(deduction.career) &&
  normalizedRowText(row.percent) === normalizedRowText(deduction.percent) &&
  moneyAmountsMatch(row.base, deduction.base) &&
  moneyAmountsMatch(row.commission, Math.abs(deduction.commission)) &&
  moneyAmountsMatch(row.reserveFund, Math.abs(deduction.reserveFund));

const filterManagerCommissionRowsOffsetByDeductions = (
  rows: ManagerCommissionRow[]
): ManagerCommissionRow[] => {
  const deductionIndexes = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.isDeduction && row.commission < 0);
  if (deductionIndexes.length === 0) return rows;

  const usedDeductionIndexes = new Set<number>();
  const offsetCommissionIndexes = new Set<number>();
  rows.forEach((row, rowIndex) => {
    const match = deductionIndexes.find(
      ({ row: deduction, index }) =>
        !usedDeductionIndexes.has(index) &&
        managerDeductionOffsetsCommissionRow(row, deduction)
    );
    if (!match) return;
    offsetCommissionIndexes.add(rowIndex);
    usedDeductionIndexes.add(match.index);
  });

  return rows.filter(
    (_, index) =>
      !offsetCommissionIndexes.has(index) && !usedDeductionIndexes.has(index)
  );
};

const parseManagerCommissions = (doc: Document): ManagerCommissionAdvisor[] => {
  const section = doc.getElementById("manazer");
  const table = section?.querySelector("table");
  const tbody = table?.tBodies[0];
  if (!tbody) return [];

  const directRows = Array.from(tbody.rows);
  const advisors: ManagerCommissionAdvisor[] = [];

  for (const row of directRows) {
    if (row.classList.contains("toggle")) continue;
    const cells = rowCells(row);
    const advisorNumber = cells[0]?.match(/\d{6,}/)?.[0] ?? "";
    if (!advisorNumber || cells.length < 8) continue;

    const detailId = row.querySelector("a")?.getAttribute("href")?.match(/manazer\d+/)?.[0] ?? "";
    const detailRow = detailId
      ? (doc.getElementById(detailId) as HTMLTableRowElement | null)
      : null;
    const detailCell = detailRow?.cells[0];
    const rows: ManagerCommissionRow[] = [];
    let detailTableKind: "commission" | "deduction" | "storno" = "commission";
    let detailTableIndex = 0;

    for (const child of Array.from(detailCell?.children ?? [])) {
      if (child.tagName === "B") {
        const heading = normalizeCommissionTitle(child.textContent);
        if (heading.includes("storna")) detailTableKind = "storno";
        else if (heading.includes("odecty")) detailTableKind = "deduction";
        else if (heading.includes("provize")) detailTableKind = "commission";
      }

      if (child.tagName === "TABLE") {
        rows.push(
          ...parseManagerCommissionRows(
            child as HTMLTableElement,
            detailTableKind,
            `${advisorNumber}:${detailTableIndex}`
          )
        );
        detailTableIndex += 1;
      }
    }

    advisors.push({
      advisorNumber,
      advisorName: cells[1] ?? "",
      position: cells[2] ?? "",
      contractCount: Number.parseInt((cells[3] ?? "0").replace(/\D/g, ""), 10) || 0,
      commission: parseMoney(cells[4]),
      stornos: parseMoney(cells[5]),
      deductions: parseMoney(cells[6]),
      reserveFund: parseMoney(cells[7]),
      rows: filterManagerCommissionRowsOffsetByDeductions(rows),
    });
  }

  return advisors;
};

const buildLifeSplitContracts = (
  commissionRows: CommissionRow[],
  otherPayments: OtherPayment[],
  mappingIndex: StatementProductMappingIndex
): LifeSplitContractPreview[] => {
  const grouped = new Map<string, LifeSplitContractPreview>();
  const splitRows = commissionRows.filter((row) =>
    isLifeSplitProductCode(row.product, mappingIndex)
  );

  for (const row of splitRows) {
    const product = resolveStatementProduct(row.product, mappingIndex);
    const key = `${product.rawCode}:${row.contractNumber || row.id}`;
    const existing =
      grouped.get(key) ??
      ({
        productCode: product.rawCode,
        productLabel: product.label,
        contractNumber: row.contractNumber,
        client: row.client,
        signedAt: row.signedAt,
        validFrom: row.validFrom,
        annualPremium: row.base,
        rows: [],
        b36Payments: [],
      } satisfies LifeSplitContractPreview);

    existing.rows.push(row);
    if (!existing.annualPremium && row.base) existing.annualPremium = row.base;
    grouped.set(key, existing);
  }

  const keysByContractNumber = [...grouped.entries()].reduce<Record<string, string[]>>(
    (groups, [key, contract]) => {
      if (!contract.contractNumber) return groups;
      groups[contract.contractNumber] = [...(groups[contract.contractNumber] ?? []), key];
      return groups;
    },
    {}
  );

  for (const payment of otherPayments) {
    if (payment.isStorno) continue;
    if (!payment.isB36Half) continue;
    const contractNumber = payment.contractNumber;
    if (!contractNumber) continue;

    for (const key of keysByContractNumber[contractNumber] ?? []) {
      grouped.get(key)?.b36Payments.push(payment);
    }
  }

  return [...grouped.values()].sort((a, b) =>
    a.contractNumber.localeCompare(b.contractNumber, "cs") ||
    a.productLabel.localeCompare(b.productLabel, "cs")
  );
};

const buildOtherProductContracts = (
  commissionRows: CommissionRow[],
  otherPayments: OtherPayment[],
  mappingIndex: StatementProductMappingIndex
): OtherProductContractPreview[] => {
  const grouped = new Map<string, OtherProductContractPreview>();
  const rows = commissionRows.filter(
    (row) => !isLifeSplitProductCode(row.product, mappingIndex)
  );

  for (const row of rows) {
    const key = row.contractNumber || row.id;
    const existing =
      grouped.get(key) ??
      ({
        key,
        contractNumber: row.contractNumber,
        client: row.client,
        signedAt: row.signedAt,
        validFrom: row.validFrom,
        rows: [],
        b36Payments: [],
      } satisfies OtherProductContractPreview);

    existing.rows.push(row);
    grouped.set(key, existing);
  }

  for (const payment of otherPayments) {
    if (payment.isStorno) continue;
    if (!payment.isB36Half || !payment.contractNumber) continue;

    const existing = grouped.get(payment.contractNumber);
    if (!existing) continue;

    existing.b36Payments.push(payment);
  }

  return [...grouped.values()].sort((a, b) => {
    return a.contractNumber.localeCompare(b.contractNumber, "cs");
  });
};

const findUnmatchedB36Payments = (
  commissionRows: CommissionRow[],
  otherPayments: OtherPayment[]
): OtherPayment[] => {
  const contractNumbersInRows = new Set(commissionRows.map((row) => row.contractNumber));
  const pairedB36Indexes = b36OffsetPairIndexes(otherPayments);

  return otherPayments.filter(
    (payment, index) =>
      payment.isB36Half &&
      !payment.isStorno &&
      payment.amount > COMMISSION_AMOUNT_TOLERANCE &&
      !pairedB36Indexes.has(index) &&
      (!payment.contractNumber || !contractNumbersInRows.has(payment.contractNumber))
  );
};

type ParseStatementOptions = {
  productMap?: StatementProductMappingIndex | StatementProductMapEntry[] | null;
};

const parseStatementHtml = (
  html: string,
  fileName: string,
  options?: ParseStatementOptions
): ParsedStatement => {
  const mappingIndex = statementProductMappingIndexFromInput(options?.productMap);
  const doc = new DOMParser().parseFromString(html, "text/html");
  const payoutTotal = parseStatementPayoutTotal(doc);
  const rawCommissionRows = parseCommissionRows(doc);
  const deductionRows = parseDeductionRows(doc);
  const commissionRows = filterCommissionRowsOffsetByDeductions(
    rawCommissionRows,
    deductionRows
  );
  const stornoRows = parseStornoRows(doc);
  const otherPayments = parseOtherPayments(doc);
  const contractStatusRules = parseContractStatusRules(doc);
  const managerCommissions = parseManagerCommissions(doc);
  const lifeSplitContracts = buildLifeSplitContracts(
    commissionRows,
    otherPayments,
    mappingIndex
  );
  const otherProductContracts = buildOtherProductContracts(
    commissionRows,
    otherPayments,
    mappingIndex
  );
  const unmatchedB36Payments = findUnmatchedB36Payments(commissionRows, otherPayments);
  const parseWarnings: string[] = [];

  if (!doc.getElementById("provize")) {
    parseWarnings.push("Ve výpisu nebyla nalezena sekce Záloha za smlouvy.");
  }
  if (!doc.getElementById("kody_stavu_smluv")) {
    parseWarnings.push("Ve výpisu nebyla nalezena legenda kódů stavů smluv.");
  }

  return {
    fileName,
    header: extractHeader(html, doc),
    payoutTotal,
    commissionRows,
    deductionRows,
    stornoRows,
    otherPayments,
    contractStatusRules,
    managerCommissions,
    lifeSplitContracts,
    otherProductContracts,
    unmatchedB36Payments,
    parseWarnings,
  };
};

const readStatementFile = async (
  file: File,
  options?: ParseStatementOptions
): Promise<StatementFileRead> => {
  const buffer = await file.arrayBuffer();
  const html = new TextDecoder("iso-8859-2").decode(buffer);
  return {
    html,
    statement: parseStatementHtml(html, file.name, options),
  };
};

const b36PaymentPairKey = (payment: OtherPayment): string | null => {
  if (!payment.isB36Half || !payment.contractNumber) return null;
  const amount = Math.round(Math.abs(payment.amount) * 100) / 100;
  if (amount <= COMMISSION_AMOUNT_TOLERANCE) return null;
  return `${payment.contractNumber}:${amount.toFixed(2)}`;
};

const b36OffsetPairIndexes = (payments: OtherPayment[]): Set<number> => {
  const positiveByKey = new Map<string, number[]>();
  const paired = new Set<number>();

  payments.forEach((payment, index) => {
    if (payment.amount <= COMMISSION_AMOUNT_TOLERANCE) return;
    const key = b36PaymentPairKey(payment);
    if (!key) return;
    positiveByKey.set(key, [...(positiveByKey.get(key) ?? []), index]);
  });

  payments.forEach((payment, index) => {
    if (payment.amount >= -COMMISSION_AMOUNT_TOLERANCE) return;
    const key = b36PaymentPairKey(payment);
    if (!key) return;
    const positives = positiveByKey.get(key) ?? [];
    const positiveIndex = positives.find((candidate) => !paired.has(candidate));
    if (positiveIndex == null) return;
    paired.add(positiveIndex);
    paired.add(index);
  });

  return paired;
};

const b36PaidPaymentAmounts = (payments: OtherPayment[]): number[] =>
  payments
    .filter((payment) => payment.isB36Half && payment.amount > COMMISSION_AMOUNT_TOLERANCE)
    .map((payment) => payment.amount);

const sumPayments = (payments: OtherPayment[]): number =>
  Math.round(payments.reduce((sum, payment) => sum + payment.amount, 0) * 100) / 100;

const closestB36PaidAmount = (
  payments: OtherPayment[],
  expectedAmount: number
): number | null => {
  const amounts = b36PaidPaymentAmounts(payments);
  if (amounts.length === 0) return null;
  return amounts.reduce((closest, amount) =>
    Math.abs(amount - expectedAmount) < Math.abs(closest - expectedAmount)
      ? amount
      : closest
  );
};

const b36StatementAmountForReview = (
  payments: OtherPayment[],
  expectedAmount: number
): number => {
  const closest = closestB36PaidAmount(payments, expectedAmount);
  if (closest != null) return closest;
  return sumPayments(payments);
};

export {
  ANNUAL_PREMIUM_TOLERANCE,
  AUTO_PREMIUM_ANNIVERSARY_TOLERANCE_MONTHS,
  COMMISSION_AMOUNT_TOLERANCE,
  COMMISSION_CODE_RULES,
  INVESTMENT_SECTION_PRODUCT_CODES,
  MANAGER_COMMISSION_AMOUNT_TOLERANCE,
  TROY_OUNCE_COMMISSION_CODE_RULES,
  addMonthsToLocalDate,
  addMonthsToMonthKey,
  addYearsToLocalDate,
  b36DeferredCodeForProduct,
  b36HalfLabelForProduct,
  b36OffsetPairIndexes,
  b36PaidPaymentAmounts,
  b36StatementAmountForReview,
  baseCommissionCodeForStatementComparison,
  classifyGeneralCommissionCode,
  classifyLifeSplitCommissionCode,
  closestB36PaidAmount,
  commissionRowCanReplaceDeduction,
  commissionRowCorrectionKey,
  commissionCodeAliasesForPayoutHistory,
  deductionOffsetsCommissionRow,
  filterCommissionRowsOffsetByDeductions,
  filterManagerCommissionRowsOffsetByDeductions,
  formatLocalDate,
  formatMoney,
  formatMonthKey,
  formatSystemDate,
  formatWholeMoney,
  hasSjednatelExtranetFromDetailLink,
  expectedPremiumIncreaseAmountFromItems,
  isInvestmentSectionProductCode,
  isLifePremiumIncreaseCommissionCode,
  isLifeSplitProductCode,
  isNeonInitialCommissionCode,
  monthKeyFromDate,
  monthKeyFromIndex,
  monthKeyFromStatementPeriod,
  monthKeyIndex,
  managerCommissionCodeForSystemItems,
  managerCommissionRowIdentity,
  normalizeCommissionTitle,
  normalizeContractNumberForMatch,
  normalizeExternalHref,
  normalizeProductCode,
  normalizeStatementCommissionCode,
  normalizeText,
  normalizedRowText,
  parseLocalDate,
  parseMoney,
  parseOptionalMoney,
  parsePeriodEndDate,
  parsePeriodStartDate,
  parseStatementHtml,
  paymentAmountWithFrequencyLabel,
  paymentFrequencyLabel,
  paymentsPerYearForFrequency,
  productLabelFromKey,
  readStatementFile,
  resetActiveStatementProductMapping,
  resolveStatementProduct,
  resolveStatementPremiumBasePeriod,
  setActiveStatementProductMapping,
  statementCorrectionSortValue,
  statementPaymentBundleCount,
  statementProductCategoryLabel,
  toDateInputValue,
  usesB36CodeForProduct,
  usesIndependentStatementCommissionBase,
};
