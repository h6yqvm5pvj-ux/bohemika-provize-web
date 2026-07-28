import {
  type Product,
  type Position,
  type PaymentFrequency,
  type CommissionMode,
  type CommissionResultItemDTO,
} from "../types/domain";
import { formatMoney, toDate } from "@/app/lib/formatters";
import {
  isAnnualAutoPayoutProduct as isAnnualAutoPayoutProductFromCatalog,
  isAutoProduct as isAutoProductFromCatalog,
  isFrequencyAutoPayoutProduct as isFrequencyAutoPayoutProductFromCatalog,
  productInstitutionId as productInstitutionIdFromCatalog,
  productInstitutionLabel as productInstitutionLabelFromCatalog,
  productInstitutionLogo as productInstitutionLogoFromCatalog,
  productLabel as productLabelFromCatalog,
} from "@/app/lib/productCatalog";
import {
  institutionLogoFrameClass,
  institutionLogoImageClass,
} from "@/app/lib/institutionLogoDisplay";

export const POSITION_ORDER: Position[] = [
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
];

const ORIGINAL_REPLACEMENT_PRODUCTS = new Set<Product>(["neon", "domex", "cppAuto"]);
const POLICY_END_DATE_PRODUCTS = new Set<Product>([
  "cppcestovko",
  "axacestovko",
  "koopcestovko",
]);

export function supportsOriginalContractReplacement(product: Product): boolean {
  return ORIGINAL_REPLACEMENT_PRODUCTS.has(product);
}

export function supportsPolicyEndDate(product: Product): boolean {
  return POLICY_END_DATE_PRODUCTS.has(product);
}

export function originalReplacementLabel(product: Product): string {
  return product === "neon" ? "Refresh" : "Náhrada";
}

function stableSerializeForIdempotency(value: unknown): string {
  if (value == null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerializeForIdempotency(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const row = value as Record<string, unknown>;
    const keys = Object.keys(row).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${stableSerializeForIdempotency(row[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(String(value));
}

function hashFnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function buildContractsCreateIdempotencyKey(entry: Record<string, unknown>): string {
  const stable = stableSerializeForIdempotency(entry);
  const forward = hashFnv1a32(stable);
  const backward = hashFnv1a32(stable.split("").reverse().join(""));
  return `contracts-create:v1:${forward}${backward}`;
}

export function formatMoneyResult(value: number | undefined | null): string {
  return formatMoney(value, {
    minFractionDigits: 2,
    maxFractionDigits: 2,
  });
}

export const paymentsPerYear = (frequency: PaymentFrequency) =>
  frequency === "monthly"
    ? 12
    : frequency === "quarterly"
      ? 4
      : frequency === "semiannual"
        ? 2
        : 1;

export const frequencyLabel = (frequency: PaymentFrequency) => {
  switch (frequency) {
    case "monthly":
      return "měsíční";
    case "quarterly":
      return "čtvrtletní";
    case "semiannual":
      return "pololetní";
    case "annual":
      return "roční";
  }
};

export const productLabel = (product: Product | null) =>
  productLabelFromCatalog(product, product ?? "—");

export const normalizeEmailValue = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

export const normalizeSearchTextValue = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

export const simpleNameFromEmail = (email: string): string => {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[.\-_]/).filter(Boolean);
  if (parts.length === 0) return email;
  return parts
    .map((part) =>
      part.length > 0
        ? `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`
        : part
    )
    .join(" ");
};

export const entryPathFromContractOwner = (
  ownerEmail: unknown,
  entryId: unknown
): string => {
  const owner = normalizeEmailValue(ownerEmail);
  const id = typeof entryId === "string" ? entryId.trim() : "";
  if (!owner || !id) return "";
  return `users/${owner}/entries/${id}`;
};

export const currentIsoDay = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(now.getDate()).padStart(2, "0")}`;
};

export type PositionTimelineEntry = {
  id: string;
  position: Position;
  validFrom: string;
  validTo: string | null;
};

export type ManagerChainSnapshotEntry = {
  email: string | null;
  position: Position | null;
  commissionMode: CommissionMode | null;
};

export const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const MIN_REASONABLE_CONTRACT_YEAR = 2000;
export const MAX_REASONABLE_CONTRACT_YEAR = 2100;
export const MAX_POLICY_START_AFTER_SIGNED_DAYS = 365;

export type ContractDateIssue = {
  severity: "error" | "warning";
  message: string;
};

export function isIsoDay(value: string): boolean {
  if (!ISO_DAY_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00`);
  return !Number.isNaN(d.getTime());
}

export function parseIsoDayUtc(value: string): Date | null {
  const normalized = value.trim();
  if (!ISO_DAY_RE.test(normalized)) return null;
  const d = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  if (d.toISOString().slice(0, 10) !== normalized) return null;
  return d;
}

export function collectContractDateIssues(
  signedDateIsoRaw: string,
  policyStartDateIsoRaw: string,
  policyEndDateIsoRaw: string
): ContractDateIssue[] {
  const signedDateIso = signedDateIsoRaw.trim();
  const policyStartDateIso = policyStartDateIsoRaw.trim();
  const policyEndDateIso = policyEndDateIsoRaw.trim();
  const issues: ContractDateIssue[] = [];

  const signedDate = signedDateIso ? parseIsoDayUtc(signedDateIso) : null;
  const policyStartDate = policyStartDateIso ? parseIsoDayUtc(policyStartDateIso) : null;
  const policyEndDate = policyEndDateIso ? parseIsoDayUtc(policyEndDateIso) : null;

  if (signedDateIso && !signedDate) {
    issues.push({
      severity: "error",
      message: "Datum sjednání má neplatný formát.",
    });
  }

  if (policyStartDateIso && !policyStartDate) {
    issues.push({
      severity: "error",
      message: "Datum počátku má neplatný formát.",
    });
  }
  if (policyEndDateIso && !policyEndDate) {
    issues.push({
      severity: "error",
      message: "Datum pojištění do má neplatný formát.",
    });
  }

  if (signedDate) {
    const signedYear = signedDate.getUTCFullYear();
    if (
      signedYear < MIN_REASONABLE_CONTRACT_YEAR ||
      signedYear > MAX_REASONABLE_CONTRACT_YEAR
    ) {
      issues.push({
        severity: "error",
        message: `Datum sjednání má podezřelý rok ${signedYear}.`,
      });
    }
  }

  if (policyStartDate) {
    const startYear = policyStartDate.getUTCFullYear();
    if (
      startYear < MIN_REASONABLE_CONTRACT_YEAR ||
      startYear > MAX_REASONABLE_CONTRACT_YEAR
    ) {
      issues.push({
        severity: "error",
        message: `Datum počátku má podezřelý rok ${startYear}.`,
      });
    }
  }
  if (policyEndDate) {
    const endYear = policyEndDate.getUTCFullYear();
    if (
      endYear < MIN_REASONABLE_CONTRACT_YEAR ||
      endYear > MAX_REASONABLE_CONTRACT_YEAR
    ) {
      issues.push({
        severity: "error",
        message: `Datum pojištění do má podezřelý rok ${endYear}.`,
      });
    }
  }

  if (signedDate && policyStartDate) {
    const diffDays = Math.round(
      (policyStartDate.getTime() - signedDate.getTime()) / 86400000
    );

    if (diffDays < 0) {
      issues.push({
        severity: "error",
        message: "Datum počátku nesmí být před datem sjednání.",
      });
    }

    if (diffDays > MAX_POLICY_START_AFTER_SIGNED_DAYS) {
      issues.push({
        severity: "warning",
        message: `Počátek je ${diffDays} dní po sjednání (zkontroluj, jestli je to záměr).`,
      });
    }
  }
  if (policyStartDate && policyEndDate) {
    const diffDays = Math.round(
      (policyEndDate.getTime() - policyStartDate.getTime()) / 86400000
    );
    if (diffDays < 0) {
      issues.push({
        severity: "error",
        message: "Datum pojištění do nesmí být před datem počátku.",
      });
    }
  }

  return issues;
}

export function parsePositionTimeline(raw: unknown): PositionTimelineEntry[] {
  if (!Array.isArray(raw)) return [];

  const rows: PositionTimelineEntry[] = [];
  raw.forEach((item, index) => {
    if (!item || typeof item !== "object") return;
    const row = item as Record<string, unknown>;
    const position = row.position as Position;
    if (!POSITION_ORDER.includes(position)) return;

    const validFrom = typeof row.validFrom === "string" ? row.validFrom.trim() : "";
    const validToRaw = typeof row.validTo === "string" ? row.validTo.trim() : "";
    const validTo = validToRaw || null;
    if (!isIsoDay(validFrom)) return;
    if (validTo && !isIsoDay(validTo)) return;
    if (validTo && validTo < validFrom) return;

    rows.push({
      id:
        typeof row.id === "string" && row.id.trim().length > 0
          ? row.id.trim()
          : `timeline_${index}`,
      position,
      validFrom,
      validTo,
    });
  });

  rows.sort((a, b) => {
    if (a.validFrom !== b.validFrom) return a.validFrom.localeCompare(b.validFrom);
    const aTo = a.validTo ?? "9999-12-31";
    const bTo = b.validTo ?? "9999-12-31";
    return aTo.localeCompare(bTo);
  });

  return rows;
}

export function resolvePositionTimelineMatch(
  signedDate: string,
  timeline: PositionTimelineEntry[]
): PositionTimelineEntry | null {
  if (!isIsoDay(signedDate) || timeline.length === 0) return null;

  const candidates = timeline.filter((row) => {
    if (row.validFrom > signedDate) return false;
    // validTo je hranice intervalu (nevčetně), aby řádky mohly navazovat stejným datem
    if (row.validTo && signedDate >= row.validTo) return false;
    return true;
  });
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (a.validFrom !== b.validFrom) return b.validFrom.localeCompare(a.validFrom);
    const aTo = a.validTo ?? "9999-12-31";
    const bTo = b.validTo ?? "9999-12-31";
    return bTo.localeCompare(aTo);
  });

  return candidates[0] ?? null;
}

export const resolveCurrentPositionTimelineRow = (
  timeline: PositionTimelineEntry[]
): PositionTimelineEntry | null => {
  if (timeline.length === 0) return null;
  return (
    resolvePositionTimelineMatch(currentIsoDay(), timeline) ??
    timeline.find((row) => !row.validTo) ??
    timeline[timeline.length - 1] ??
    null
  );
};

export function ensureManagerChainWithDirectManager(
  chain: ManagerChainSnapshotEntry[],
  managerEmail: string | null | undefined,
  managerPosition: Position | null,
  managerMode: CommissionMode | null
): ManagerChainSnapshotEntry[] {
  if (chain.length > 0) return chain;
  const normalizedEmail = (managerEmail ?? "").trim().toLowerCase();
  if (!normalizedEmail) return chain;
  return [
    {
      email: normalizedEmail,
      position: managerPosition ?? null,
      commissionMode: managerMode ?? null,
    },
  ];
}

export function hasResolvedTopManagerPosition(
  chain: ManagerChainSnapshotEntry[],
  managerEmail: string | null | undefined
): boolean {
  const normalizedEmail = (managerEmail ?? "").trim().toLowerCase();
  if (!normalizedEmail) return true;

  const directManager =
    chain.find((row) => (row.email ?? "").trim().toLowerCase() === normalizedEmail) ??
    chain[0] ??
    null;

  return Boolean(directManager?.position);
}

export function formatIsoDay(value: string | null): string {
  if (!value || !isIsoDay(value)) return "—";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("cs-CZ");
}

export function allowedPositionsForUser(base: Position | null): Position[] {
  if (!base) return POSITION_ORDER;

  const idx = POSITION_ORDER.indexOf(base);
  if (idx === -1) return POSITION_ORDER;

  if (base.startsWith("poradce")) {
    // Poradce → jen poradci až do své úrovně
    return POSITION_ORDER.filter(
      (p) => p.startsWith("poradce") && POSITION_ORDER.indexOf(p) <= idx
    );
  }

  // Manažer → poradci 1..level a manažeři 4..level
  const level = Number(base.replace("manazer", ""));
  return POSITION_ORDER.filter((p) => {
    if (p.startsWith("poradce")) {
      const lv = Number(p.replace("poradce", ""));
      return lv <= level;
    }
    if (p.startsWith("manazer")) {
      const lv = Number(p.replace("manazer", ""));
      return lv <= level;
    }
    return false;
  });
}

export function productInstitutionLogo(product: Product): string {
  return productInstitutionLogoFromCatalog(product) ?? "/icons/produkt.png";
}

export function productInstitutionLabel(product: Product): string {
  return productInstitutionLabelFromCatalog(product, "Pojišťovna") ?? "Pojišťovna";
}

export function productLogoFrameClass(product: Product): string {
  return institutionLogoFrameClass(productInstitutionIdFromCatalog(product), "card");
}

export function productLogoScaleClass(product: Product): string {
  return institutionLogoImageClass(productInstitutionIdFromCatalog(product));
}

export function isAutoProduct(product: Product | null): product is Product {
  return Boolean(product) && isAutoProductFromCatalog(product);
}

export function isAnnualAutoPayoutProduct(product: Product | null): product is Product {
  return Boolean(product) && isAnnualAutoPayoutProductFromCatalog(product);
}

export function isFrequencyAutoPayoutProduct(product: Product | null): product is Product {
  return Boolean(product) && isFrequencyAutoPayoutProductFromCatalog(product);
}

export function shouldShowDuration(product: Product): boolean {
  return product === "neon" || product === "flexi" || product === "maximaMaxEfekt";
}

export function shouldShowDurationMonths(product: Product): boolean {
  return product === "maxcizinkomplex";
}

export function durationRange(product: Product): [number, number] {
  switch (product) {
    case "neon":
      return [1, 99];
    case "flexi":
      return [1, 80];
    case "maximaMaxEfekt":
      return [1, 80];
    default:
      return [1, 1];
  }
}

export function durationFallback(product: Product): number {
  switch (product) {
    case "neon":
      return 15;
    case "flexi":
      return 30;
    case "maximaMaxEfekt":
      return 30;
    default:
      return 1;
  }
}

export function normalizedDurationYears(
  product: Product,
  years: number | null | undefined
): number {
  const [min, max] = durationRange(product);
  const raw = typeof years === "number" && Number.isFinite(years) ? years : durationFallback(product);
  const wholeYears = Math.floor(raw);
  return Math.min(max, Math.max(min, wholeYears));
}

export function durationMonthsRange(product: Product): [number, number] {
  switch (product) {
    case "maxcizinkomplex":
      return [1, 240];
    default:
      return [1, 1];
  }
}

export function durationMonthsFallback(product: Product): number {
  switch (product) {
    case "maxcizinkomplex":
      return 12;
    default:
      return 1;
  }
}

export function normalizedDurationMonths(
  product: Product,
  months: number | null | undefined
): number {
  const [min, max] = durationMonthsRange(product);
  const raw =
    typeof months === "number" && Number.isFinite(months)
      ? months
      : durationMonthsFallback(product);
  const wholeMonths = Math.floor(raw);
  return Math.min(max, Math.max(min, wholeMonths));
}

export function allowedFrequencies(product: Product): PaymentFrequency[] {
  switch (product) {
    case "neon":
    case "flexi":
    case "pillowInjury":
    case "maximaMaxEfekt":
      return ["monthly"];
    case "domex":
    case "cpphafan":
      return ["quarterly", "semiannual", "annual"];
    case "pillowmajetek":
      return ["monthly", "quarterly", "semiannual", "annual"];
    case "koopmajetekobcan":
    case "koopfit":
    case "koopodzam":
    case "kooppmop":
      return ["monthly", "quarterly", "semiannual", "annual"];
    case "pillowAuto":
    case "maxdomov":
    case "allianzmujdomov":
    case "kooperativaAuto":
    case "koopflotila":
    case "allianzAuto":
    case "slaviaflotila":
      return ["monthly", "quarterly", "semiannual", "annual"];
    case "cppAuto":
    case "slaviaauto":
    case "csobAuto":
    case "uniqaAuto":
    case "uniqaflotila":
    case "zamex":
    case "cppsimplex":
    case "cppPPRbez":
    case "cppPPRs":
      return ["quarterly", "semiannual", "annual"];
    case "cppcestovko":
    case "axacestovko":
    case "koopcestovko":
    case "maxcizinkomplex":
    case "comfortcc":
      return ["annual"];
  }
}

export function titleForFrequency(f: PaymentFrequency): string {
  switch (f) {
    case "monthly":
      return "Měsíční";
    case "quarterly":
      return "Čtvrtletní";
    case "semiannual":
      return "Pololetní";
    case "annual":
      return "Roční";
  }
}

export function defaultFrequencyText(product: Product): string {
  switch (product) {
    case "neon":
    case "flexi":
    case "pillowInjury":
    case "maximaMaxEfekt":
      return "Frekvence: měsíční";
    case "cppcestovko":
    case "axacestovko":
    case "koopcestovko":
    case "maxcizinkomplex":
    case "comfortcc":
      return "Frekvence: jednorázově";
    default:
      return "";
  }
}

export function placeholderForAmount(
  product: Product,
  freq: PaymentFrequency
): string {
  if (product === "comfortcc") {
    return "Zadejte výši poplatku / platby";
  }
  if (
    product === "cppcestovko" ||
    product === "axacestovko" ||
    product === "koopcestovko" ||
    product === "maxcizinkomplex"
  ) {
    return "Zadejte jednorázové pojistné";
  }
  if (
    product === "neon" ||
    product === "flexi" ||
    product === "pillowInjury" ||
    product === "maximaMaxEfekt"
  ) {
    return "Zadejte měsíční částku";
  }
  const allowed = allowedFrequencies(product);
  if (allowed.length > 1 && freq !== "annual") {
    return "Zadejte částku za platbu";
  }
  return "Zadejte roční částku";
}

export function durationTooltip(
  product: Product,
  neonHistoricalBySignedDate: boolean
): string | null {
  if (product === "neon") {
    if (neonHistoricalBySignedDate) {
      return "Uživatel musí zadat celkovou dobu trvání smlouvy. U NEON smluv sjednaných od 01.10.2019 do 30.06.2024 se pro výpočet provize používá maximálně 20 let. V tomto období se nepoužívá režim zrychlený/běžný.";
    }
    return "Uživatel musí zadat celkovou dobu trvání smlouvy. U NEON se od 01.07.2024 pro výpočet provize používá maximálně 15 let (pokud je doba kratší, použije se skutečná hodnota). Pro starší období 01.10.2019–30.06.2024 je limit 20 let.";
  }
  if (product === "flexi") {
    return "Uživatel musí zadat celkovou dobu trvání smlouvy v letech (např. do roku 2050). Následná provize od 6. roku se počítá ročně do konce zadané doby.";
  }
  if (product === "maximaMaxEfekt") {
    return "U MAXEFEKT 5/7 zadej celkovou dobu trvání smlouvy. Následná provize od 5. roku se počítá ročně až do konce zadané doby trvání.";
  }
  return null;
}

export function parseNumber(text: string): number {
  if (!text) return 0;
  const value = parseFloat(text.replace(",", "."));
  return Number.isNaN(value) ? 0 : value;
}

export function clampTipsterPercent(value: number): number {
  if (!Number.isFinite(value)) return 100;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function clampTipContractPercent(value: number): number {
  if (!Number.isFinite(value)) return 50;
  const rounded = Math.round(value / 5) * 5;
  return Math.min(95, Math.max(5, rounded));
}

export function roundToCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

export const SUPPORTED_LABEL =
  "Tento produkt zatím není na webu dopočítaný – aktuálně počítáme všechny produkty kromě Comfort Commodity.";

export function paymentBasedTotals(
  items: CommissionResultItemDTO[],
  multiplier: number
): { immediate: number; subsequent: number } {
  let immediate = 0;
  let subsequent = 0;

  items.forEach((it) => {
    const t = (it.title ?? "").toLowerCase();
    if (t.includes("okamžitá")) {
      immediate += it.amount ?? 0;
    } else if (t.includes("následná")) {
      subsequent += it.amount ?? 0;
    }
  });

  return {
    immediate: immediate * multiplier,
    subsequent: subsequent * multiplier,
  };
}

export function cleanResultTitle(title: string): string {
  const match = title.match(/[\p{L}\p{N}]/u);
  if (!match) return title.trim();
  return title.slice(title.indexOf(match[0])).trim();
}

export function normalizeResultTitleForCompare(title: string): string {
  return cleanResultTitle(title)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function resultIconForTitle(title: string): string | null {
  const t = cleanResultTitle(title).toLowerCase();

  if (
    t.startsWith("okamžitá provize") ||
    t.startsWith("získatelská provize") ||
    t.startsWith("provize a101") ||
    t.startsWith("provize b0301") ||
    t.startsWith("provize 50% z b3601") ||
    t.startsWith("provize 50% z b36")
  ) {
    return "/icons/penize2.webp";
  }

  if (t.includes("po 3 letech") || t.includes("po 4 letech")) {
    return "/icons/kalendar.webp";
  }

  if (t.startsWith("následná provize") || t.startsWith("pečovatelská provize")) {
    return "/icons/nasledna.webp";
  }

  return null;
}

export function isImmediateCommissionTitle(title: string): boolean {
  const t = normalizeResultTitleForCompare(title);
  return (
    t.includes("okamzita provize") ||
    t.includes("ziskatelska provize") ||
    t.includes("provize a101") ||
    t.includes("provize b0301") ||
    t.includes("provize 50% z b3601") ||
    t.includes("provize 50% z b36")
  );
}

export function isImmediateAnnualFirstYearTitle(title: string): boolean {
  const t = normalizeResultTitleForCompare(title);
  if (!t.includes("za rok")) return false;
  if (t.includes("nasledna")) return false;
  return true;
}

export function computeImmediateCommissionFirstYearTotal(items: CommissionResultItemDTO[]): number {
  if (!Array.isArray(items) || items.length === 0) return 0;

  const annualImmediate = items.reduce((sum, item) => {
    if (!isImmediateAnnualFirstYearTitle(item.title ?? "")) return sum;
    return sum + (item.amount ?? 0);
  }, 0);
  if (annualImmediate > 0) {
    return annualImmediate;
  }

  return items.reduce((sum, item) => {
    if (!isImmediateCommissionTitle(item.title ?? "")) return sum;
    return sum + (item.amount ?? 0);
  }, 0);
}

export type ContractEntryType = "contract" | "endorsement";
export type EndorsementChangeType = "increase" | "decrease" | "same";

export type EndorsementSourceEntry = {
  id: string;
  path: string;
  productKey: Product | null;
  rootContractEntryId: string | null;
  effectiveInputAmount: number;
  policyStartDate: Date | null;
  contractSignedDate: Date | null;
  createdAt: Date | null;
};

export type EndorsementDraft = {
  productKey: Product;
  contractNumber: string;
  contractSignedDate: string;
  sourceEntryId: string;
  sourceEntryPath: string;
  rootContractEntryId: string;
  position: Position;
  commissionMode: CommissionMode;
  durationYears: number | null;
  durationMonths: number | null;
  previousPremiumAmount: number;
  newPremiumAmount: number;
  deltaAmount: number;
  calculationAmount: number;
  changeType: EndorsementChangeType;
  items: CommissionResultItemDTO[];
  total: number;
};

export function toNonNegativeNumber(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, num);
}

export function compareSourceEntriesByRecency(
  a: EndorsementSourceEntry,
  b: EndorsementSourceEntry
): number {
  const createdDiff = (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0);
  if (createdDiff !== 0) return createdDiff;

  const signedDiff =
    (b.contractSignedDate?.getTime() ?? 0) - (a.contractSignedDate?.getTime() ?? 0);
  if (signedDiff !== 0) return signedDiff;

  const policyDiff =
    (b.policyStartDate?.getTime() ?? 0) - (a.policyStartDate?.getTime() ?? 0);
  if (policyDiff !== 0) return policyDiff;

  return b.id.localeCompare(a.id);
}

export function resolveEffectivePremium(data: any): number {
  return toNonNegativeNumber(
    data?.effectiveInputAmount ?? data?.newInputAmount ?? data?.inputAmount
  );
}

export function normalizeClientNameForDuplicate(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeClientNameForSystemMatch(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function normalizeContractEntryType(value: unknown): ContractEntryType {
  if (typeof value !== "string") return "contract";
  const normalized = value.trim().toLowerCase();
  return normalized === "endorsement" ? "endorsement" : "contract";
}

export function isoDayFromUnknown(value: unknown): string | null {
  const d = toDate(value);
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}
