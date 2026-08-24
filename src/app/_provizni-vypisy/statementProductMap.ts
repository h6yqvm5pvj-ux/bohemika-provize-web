import { PRODUCT_CATALOG } from "@/app/lib/productCatalog";
import type { Product } from "@/app/types/domain";

import type { StatementProductCategory } from "./statementTypes";

export type StatementProductBaseRule = "auto" | "annual" | "statement";

export type StatementProductMapSource = "default" | "override" | "custom";

export type StatementProductMapEntry = {
  code: string;
  label: string | null;
  productKey: Product | null;
  category: StatementProductCategory;
  baseRule: StatementProductBaseRule;
  isLifeSplit: boolean;
  isInvestmentSection: boolean;
  note: string | null;
  source?: StatementProductMapSource;
  updatedAtMs?: number | null;
  updatedBy?: string | null;
};

export type StatementProductMappingIndex = {
  entries: StatementProductMapEntry[];
  products: Record<string, StatementProductMapEntry>;
  lifeSplitCodes: ReadonlySet<string>;
  investmentSectionCodes: ReadonlySet<string>;
};

type StatementProductMapRawEntry = Partial<
  Omit<StatementProductMapEntry, "productKey">
> & {
  code?: unknown;
  product?: unknown;
  productKey?: unknown;
  usesAnnualPremiumBase?: unknown;
  lifeSplit?: unknown;
  investmentSection?: unknown;
  isLifeSplit?: unknown;
  isInvestmentSection?: unknown;
};

const hasCatalogProduct = (value: string): value is Product =>
  Object.prototype.hasOwnProperty.call(PRODUCT_CATALOG, value);

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";

export const normalizeStatementProductMapCode = (value: unknown): string =>
  normalizeText(value).toUpperCase();

export const STATEMENT_PRODUCT_CATEGORY_OPTIONS: Array<{
  value: StatementProductCategory;
  label: string;
}> = [
  { value: "life", label: "Životní pojištění" },
  { value: "auto", label: "Auta" },
  { value: "property", label: "Majetek a odpovědnost" },
  { value: "business", label: "Podnikatelé" },
  { value: "travel", label: "Cestovní pojištění" },
  { value: "foreigners", label: "Cizinci" },
  { value: "comfort", label: "Comfort" },
  { value: "investment", label: "Investice" },
  { value: "unknown", label: "Nezařazeno" },
];

export const STATEMENT_PRODUCT_BASE_RULE_OPTIONS: Array<{
  value: StatementProductBaseRule;
  label: string;
}> = [
  { value: "auto", label: "Dle kategorie" },
  { value: "annual", label: "Roční základna" },
  { value: "statement", label: "Základna z výpisu" },
];

export const statementProductCategoryLabel = (
  category: StatementProductCategory
): string =>
  STATEMENT_PRODUCT_CATEGORY_OPTIONS.find((option) => option.value === category)?.label ??
  "Nezařazeno";

export const statementProductBaseRuleLabel = (
  baseRule: StatementProductBaseRule
): string =>
  STATEMENT_PRODUCT_BASE_RULE_OPTIONS.find((option) => option.value === baseRule)
    ?.label ?? "Dle kategorie";

export const inferStatementProductCategory = (
  rawCode: string
): StatementProductCategory => {
  if (/^(?:TU_|INVESTIKA|EFEKTIKA|CON_|COLOS_)/.test(rawCode)) return "investment";
  if (/FLEXI|NEON|N_LIFE|N_RISK|PRANI|PILLOW.*(?:UR|NM)/.test(rawCode)) {
    return "life";
  }
  if (/AUTO|AU_|ACP|PIL_AUTO|MOJEAUT|AUTOZ|NAMIRU/.test(rawCode)) return "auto";
  if (/SIMPLE|PPR|PPD|KP_/.test(rawCode)) return "business";
  if (/DOM|BYTEX|ZAMEX|HAFAN|OBCAN|OD_ZAM/.test(rawCode)) return "property";
  if (/CIZIN/.test(rawCode)) return "foreigners";
  if (/CEST|_CS/.test(rawCode)) return "travel";
  if (/COMFORT|CC/.test(rawCode)) return "comfort";
  return "unknown";
};

const statementCategoryForProductKey = (
  productKey: Product | null
): StatementProductCategory | null => {
  if (!productKey) return null;
  if (productKey === "maxcizinkomplex") return "foreigners";
  return PRODUCT_CATALOG[productKey]?.category ?? null;
};

const normalizeProductKey = (value: unknown): Product | null => {
  const normalized = normalizeText(value);
  return normalized && hasCatalogProduct(normalized) ? normalized : null;
};

const normalizeCategory = (
  value: unknown,
  fallback: StatementProductCategory
): StatementProductCategory => {
  const normalized = normalizeText(value) as StatementProductCategory;
  return STATEMENT_PRODUCT_CATEGORY_OPTIONS.some((option) => option.value === normalized)
    ? normalized
    : fallback;
};

const normalizeBaseRule = (
  value: unknown,
  usesAnnualPremiumBase: unknown
): StatementProductBaseRule => {
  const normalized = normalizeText(value);
  if (
    normalized === "auto" ||
    normalized === "annual" ||
    normalized === "statement"
  ) {
    return normalized;
  }
  if (typeof usesAnnualPremiumBase === "boolean") {
    return usesAnnualPremiumBase ? "annual" : "statement";
  }
  return "auto";
};

const normalizeSource = (
  value: unknown
): StatementProductMapSource | undefined => {
  const normalized = normalizeText(value);
  if (normalized === "default" || normalized === "override" || normalized === "custom") {
    return normalized;
  }
  return undefined;
};

const normalizeOptionalNumber = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
};

export const normalizeStatementProductMapEntry = (
  raw: StatementProductMapRawEntry,
  source?: StatementProductMapSource
): StatementProductMapEntry | null => {
  const code = normalizeStatementProductMapCode(raw.code);
  if (!code) return null;

  const productKey = normalizeProductKey(raw.productKey ?? raw.product);
  const catalogMeta = productKey ? PRODUCT_CATALOG[productKey] : null;
  const inferredCategory =
    statementCategoryForProductKey(productKey) ?? inferStatementProductCategory(code);
  const category = normalizeCategory(raw.category, inferredCategory);
  const label =
    normalizeText(raw.label) ||
    catalogMeta?.label ||
    code;

  return {
    code,
    label,
    productKey,
    category,
    baseRule: normalizeBaseRule(raw.baseRule, raw.usesAnnualPremiumBase),
    isLifeSplit: raw.isLifeSplit === true || raw.lifeSplit === true,
    isInvestmentSection:
      raw.isInvestmentSection === true || raw.investmentSection === true,
    note: normalizeText(raw.note) || null,
    source: source ?? normalizeSource(raw.source),
    updatedAtMs: normalizeOptionalNumber(raw.updatedAtMs),
    updatedBy: normalizeText(raw.updatedBy) || null,
  };
};

const defaultEntry = (
  raw: StatementProductMapRawEntry
): StatementProductMapEntry => {
  const normalized = normalizeStatementProductMapEntry(raw, "default");
  if (!normalized) {
    throw new Error("Defaultní produktová mapa obsahuje řádek bez kódu.");
  }
  return normalized;
};

export const DEFAULT_STATEMENT_PRODUCT_MAP_ENTRIES: StatementProductMapEntry[] = [
  defaultEntry({
    code: "CPP_N_LIFE",
    productKey: "neon",
    baseRule: "annual",
    isLifeSplit: true,
  }),
  defaultEntry({
    code: "CPP_NEON",
    productKey: "neon",
    label: "ČPP ŽP NEON",
    baseRule: "annual",
    isLifeSplit: true,
  }),
  defaultEntry({
    code: "CPP_NRF_LF",
    productKey: "neon",
    label: "ČPP ŽP NEON",
    baseRule: "annual",
    isLifeSplit: true,
  }),
  defaultEntry({
    code: "CPP_NEONRF",
    productKey: "neon",
    label: "ČPP ŽP NEON RF",
    baseRule: "annual",
    isLifeSplit: true,
  }),
  defaultEntry({
    code: "CPP_N_RISK",
    productKey: "neon",
    label: "ČPP ŽP NEON RISK",
    baseRule: "annual",
    isLifeSplit: true,
  }),
  defaultEntry({
    code: "KOOP_FLEXI",
    productKey: "flexi",
    baseRule: "annual",
    isLifeSplit: true,
    note: "Životní pojištění. Pokud výpis uvádí základnu, bereme ji jako roční pojistné. V testovaném lednu ale KOOP_FLEXI posílá základnu 0, takže měsíční pojistné doplníme až ze spárované smlouvy.",
  }),
  defaultEntry({
    code: "BHMK_PILLOW_UR_NM",
    productKey: "pillowInjury",
    label: "Pillow Úraz / Nemoc",
    category: "life",
    baseRule: "annual",
    isLifeSplit: true,
  }),
  defaultEntry({ code: "CPP_DOMX", productKey: "domex" }),
  defaultEntry({ code: "CPP_DOMX+2", productKey: "domex" }),
  defaultEntry({
    code: "CPP_DOMEX+",
    productKey: "domex",
    label: "ČPP DOMEX",
    category: "property",
  }),
  defaultEntry({
    code: "CPP_BYTEX+",
    productKey: "cppbytex",
    label: "ČPP BYTEX PLUS",
    category: "property",
  }),
  defaultEntry({
    code: "CPP_BYTEX",
    productKey: "cppbytex",
    label: "ČPP BYTEX",
    category: "property",
  }),
  defaultEntry({
    code: "CPP_ZAMEX",
    productKey: "zamex",
    label: "ČPP ZAMEX",
    category: "property",
  }),
  defaultEntry({
    code: "CPP_SIMPLE",
    productKey: "cppsimplex",
    category: "business",
  }),
  defaultEntry({ code: "CPP_HAFAN", productKey: "cpphafan" }),
  defaultEntry({
    code: "PIL_MAJ",
    productKey: "pillowmajetek",
    label: "Pillow Majetek",
    category: "property",
    baseRule: "annual",
  }),
  defaultEntry({
    code: "CPP_KP_III",
    label: "ČPP KOMPLEX",
    category: "business",
  }),
  defaultEntry({
    code: "CPP_PPD",
    label: "ČPP PPD",
    category: "business",
  }),
  defaultEntry({
    code: "CPP_PPR",
    productKey: "cppPPRbez",
    label: "ČPP PPR",
    category: "business",
  }),
  defaultEntry({ code: "CPP_ACPIII", productKey: "cppAuto" }),
  defaultEntry({ code: "CPP_ACPIV", productKey: "cppAuto" }),
  defaultEntry({ code: "CPP_ACPIVZ", productKey: "cppAuto" }),
  defaultEntry({ code: "ALLMOJEAUT", productKey: "allianzAuto" }),
  defaultEntry({
    code: "ČSOBP_AU_Z",
    productKey: "csobAuto",
    baseRule: "annual",
  }),
  defaultEntry({
    code: "CSOBP_AU_Z",
    productKey: "csobAuto",
    baseRule: "annual",
  }),
  defaultEntry({
    code: "SOBP_AU_Z",
    productKey: "csobAuto",
    label: "ČSOB Auto",
    category: "auto",
    baseRule: "annual",
  }),
  defaultEntry({ code: "UNIQA_AUTO", productKey: "uniqaAuto" }),
  defaultEntry({ code: "PIL_AUTOZ", productKey: "pillowAuto" }),
  defaultEntry({ code: "SLA_AUTO", productKey: "slaviaauto" }),
  defaultEntry({ code: "SLA_AUTOZ", productKey: "slaviaauto" }),
  defaultEntry({ code: "KOO_NAMIRU", productKey: "kooperativaAuto" }),
  defaultEntry({ code: "KOO_OBCAN", productKey: "koopmajetekobcan" }),
  defaultEntry({
    code: "KOO_OD_ZAM",
    productKey: "koopodzam",
    label: "Kooperativa odpovědnost zaměstnance",
    category: "property",
  }),
  defaultEntry({
    code: "KOO_PRANI",
    label: "Kooperativa Přání",
    category: "life",
  }),
  defaultEntry({
    code: "KOOP_PMOP",
    productKey: "kooppmop",
    label: "Kooperativa PMOP",
    category: "property",
  }),
  defaultEntry({
    code: "KOO_PMOP",
    productKey: "kooppmop",
    label: "Kooperativa PMOP",
    category: "property",
  }),
  defaultEntry({
    code: "MAX_CIZIN",
    productKey: "maxcizinkomplex",
    category: "foreigners",
  }),
  defaultEntry({
    code: "MAX_DOM3",
    productKey: "maxdomov",
    label: "Maxima MAXDOMOV",
    category: "property",
  }),
  defaultEntry({
    code: "MAX_DOM4",
    productKey: "maxdomov",
    label: "Maxima MAXDOMOV",
    category: "property",
  }),
  defaultEntry({
    code: "CPP_CS_Z",
    productKey: "cppcestovko",
    label: "ČPP Cestovní pojištění",
    category: "travel",
  }),
  defaultEntry({
    code: "AXA_CS",
    productKey: "axacestovko",
    label: "AXA Cestovní pojištění",
    category: "travel",
  }),
  defaultEntry({
    code: "AXA_CS_Z",
    productKey: "axacestovko",
    label: "AXA Cestovní pojištění",
    category: "travel",
  }),
  defaultEntry({
    code: "INVESTIKA",
    label: "Investika",
    category: "investment",
    isInvestmentSection: true,
  }),
  defaultEntry({
    code: "EFEKTIKA",
    label: "Efektika",
    category: "investment",
    isInvestmentSection: true,
  }),
  defaultEntry({
    code: "MONETIKA",
    label: "Monetika",
    category: "investment",
    isInvestmentSection: true,
  }),
  defaultEntry({
    code: "CON_INV2_C",
    label: "Conseq investice",
    category: "investment",
    isInvestmentSection: true,
  }),
  defaultEntry({
    code: "COLOS_NEMO",
    label: "COLOS_NEMO",
    category: "investment",
    isInvestmentSection: true,
  }),
  defaultEntry({
    code: "TU_ZLATO",
    label: "Troyská unce - zlato",
    category: "investment",
    note: "U Troyské unce se význam kódů A/B liší podle varianty produktu.",
  }),
  defaultEntry({
    code: "TU_ESHOPJN",
    label: "Troyská unce - nákup",
    category: "investment",
    note: "U Troyské unce se význam kódů A/B liší podle varianty produktu.",
  }),
  defaultEntry({
    code: "TU_ZP",
    label: "Troyská unce - z poplatku",
    category: "investment",
    note: "U Troyské unce se význam kódů A/B liší podle varianty produktu.",
  }),
].sort((a, b) => a.code.localeCompare(b.code, "cs"));

export const normalizeStatementProductMapEntries = (
  entries: unknown
): StatementProductMapEntry[] => {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry) =>
      entry && typeof entry === "object"
        ? normalizeStatementProductMapEntry(entry as StatementProductMapRawEntry)
        : null
    )
    .filter((entry): entry is StatementProductMapEntry => Boolean(entry))
    .sort((a, b) => a.code.localeCompare(b.code, "cs"));
};

export const mergeStatementProductMapEntries = (
  overrideEntries: unknown
): StatementProductMapEntry[] => {
  const merged = new Map<string, StatementProductMapEntry>();

  for (const entry of DEFAULT_STATEMENT_PRODUCT_MAP_ENTRIES) {
    merged.set(entry.code, { ...entry, source: "default" });
  }

  for (const entry of normalizeStatementProductMapEntries(overrideEntries)) {
    merged.set(entry.code, {
      ...entry,
      source: merged.has(entry.code) ? "override" : "custom",
    });
  }

  return [...merged.values()].sort((a, b) => a.code.localeCompare(b.code, "cs"));
};

const comparableStatementProductMapEntry = (entry: StatementProductMapEntry) => ({
  code: entry.code,
  label: entry.label ?? null,
  productKey: entry.productKey ?? null,
  category: entry.category,
  baseRule: entry.baseRule,
  isLifeSplit: entry.isLifeSplit,
  isInvestmentSection: entry.isInvestmentSection,
  note: entry.note ?? null,
});

export const statementProductMapEntryEquals = (
  first: StatementProductMapEntry,
  second: StatementProductMapEntry
): boolean =>
  JSON.stringify(comparableStatementProductMapEntry(first)) ===
  JSON.stringify(comparableStatementProductMapEntry(second));

export const extractStatementProductMapOverrides = (
  entries: unknown,
  updatedBy?: string | null,
  updatedAtMs = Date.now()
): StatementProductMapEntry[] => {
  const defaults = new Map(
    DEFAULT_STATEMENT_PRODUCT_MAP_ENTRIES.map((entry) => [entry.code, entry])
  );
  return normalizeStatementProductMapEntries(entries)
    .filter((entry) => {
      const defaultEntryForCode = defaults.get(entry.code);
      return !defaultEntryForCode || !statementProductMapEntryEquals(entry, defaultEntryForCode);
    })
    .map((entry) => ({
      ...entry,
      source: defaults.has(entry.code) ? "override" : "custom",
      updatedBy: normalizeText(updatedBy) || entry.updatedBy || null,
      updatedAtMs,
    }));
};

export const createStatementProductMappingIndex = (
  entries?: unknown
): StatementProductMappingIndex => {
  const mergedEntries = mergeStatementProductMapEntries(entries ?? []);
  const products = Object.fromEntries(
    mergedEntries.map((entry) => [entry.code, entry])
  ) as Record<string, StatementProductMapEntry>;

  return {
    entries: mergedEntries,
    products,
    lifeSplitCodes: new Set(
      mergedEntries.filter((entry) => entry.isLifeSplit).map((entry) => entry.code)
    ),
    investmentSectionCodes: new Set(
      mergedEntries
        .filter((entry) => entry.isInvestmentSection)
        .map((entry) => entry.code)
    ),
  };
};

export const DEFAULT_STATEMENT_PRODUCT_MAPPING_INDEX =
  createStatementProductMappingIndex();

export const shouldUseAnnualPremiumBase = (
  entry: StatementProductMapEntry | null | undefined,
  category: StatementProductCategory
): boolean => {
  if (entry?.baseRule === "annual") return true;
  if (entry?.baseRule === "statement") return false;
  return category === "life";
};
