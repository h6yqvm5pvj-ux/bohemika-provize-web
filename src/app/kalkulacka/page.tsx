// src/app/kalkulacka/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  BarChart3,
  CheckCircle2,
  FileText,
  Package,
  RefreshCcw,
  Repeat2,
  Sigma,
  SlidersHorizontal,
} from "lucide-react";
import { auth, db } from "../firebase";
import { onAuthStateChanged, type User } from "firebase/auth";

import {
  type Product,
  type Position,
  type PaymentFrequency,
  type CommissionMode,
  type CommissionResultItemDTO,
} from "../types/domain";

import {
  calculateNeon,
  calculateFlexi,
  calculateMaxEfekt,
  calculatePillowInjury,
  calculateDomex,
  calculateKoopMajetekObcan,
  calculateMaxdomov,
  calculateCppAuto,
  calculateSlaviaAuto,
  calculateCppPPRbez,
  calculateCppPPRs,
  calculateCppSimplex,
  calculateAllianzAuto,
  calculateCsobAuto,
  calculateUniqaAuto,
  calculatePillowAuto,
  calculateKooperativaAuto,
  calculateZamex,
  calculateCppCestovko,
  calculateAxaCestovko,
  calculateComfortCC,
  SUPPORTED_PRODUCTS,
  getCoefficientSummary,
} from "../lib/productFormulas";
import { totalWithMultipliers } from "../lib/commissionTotals";
import { parseCppAutoPdf } from "../lib/parseCppAutoPdf";
import { parseNeonPdf } from "../lib/parseNeonPdf";
import { parseFlexiPdf } from "../lib/parseFlexiPdf";
import { parseDomexPdf } from "../lib/parseDomexPdf";
import { parseComfortPdf } from "../lib/parseComfortPdf";
import {
  LIFE_PRODUCTS as LIFE_PRODUCTS_LIST,
  PRODUCT_OPTIONS,
  isAutoProduct as isAutoProductFromCatalog,
  productIcon as productIconFromCatalog,
  productLabel as productLabelFromCatalog,
} from "@/app/lib/productCatalog";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { AppLayout } from "@/components/AppLayout";
import { formatMoney, positionLabel, toDate } from "@/app/lib/formatters";
import SplitTitle from "../pomucky/plan-produkce/SplitTitle";

// ---------- Pomocné ----------

const LIFE_PRODUCTS = LIFE_PRODUCTS_LIST;
const SETTINGS_KEYS = {
  position: "settings.position",
  mode: "settings.mode",
  tipsterMode: "settings.tipsterMode",
  tipsterPercent: "settings.tipsterPercent",
};
const TIPSTER_PERCENT_PRESETS = [10, 20, 30, 40, 50, 75, 100];
const AUTO_TERMS_PREVIEW_BY_PRODUCT: Partial<Record<Product, string>> = {
  cppAuto: "/provize/cppauto.jpg",
  slaviaauto: "/provize/slaviaauto.jpg",
  allianzAuto: "/provize/allianzauto.jpg",
  csobAuto: "/provize/csobauto.jpg",
  uniqaAuto: "/provize/uniqaauto.jpg",
  uniqaflotila: "/provize/uniqaflotila.jpg",
  pillowAuto: "/provize/pillowauto.jpg",
  kooperativaAuto: "/provize/koopauto.jpg",
};

function formatCoefficientNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString("cs-CZ", { maximumFractionDigits: 6 });
}

function formatMoneyResult(value: number | undefined | null): string {
  return formatMoney(value, {
    minFractionDigits: 2,
    maxFractionDigits: 2,
  });
}

const paymentsPerYear = (f: PaymentFrequency) =>
  f === "monthly" ? 12 : f === "quarterly" ? 4 : f === "semiannual" ? 2 : 1;

const frequencyLabel = (f: PaymentFrequency) => {
  switch (f) {
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

const REPLACEMENT_ELIGIBLE_PRODUCTS: Product[] = [
  "zamex",
  "domex",
  "koopmajetekobcan",
  "cppPPRbez",
  "maxdomov",
  "cppsimplex",
  "cppAuto",
  "slaviaauto",
  "allianzAuto",
  "csobAuto",
  "uniqaAuto",
  "uniqaflotila",
  "pillowAuto",
  "kooperativaAuto",
];

type ContractsApiResponse = {
  ok?: boolean;
  error?: string;
  contracts?: { clientName?: string | null }[];
};

type ContractsMutationResponse = {
  ok?: boolean;
  error?: string;
  [key: string]: unknown;
};

async function requestContractsMutationWithAuth({
  user,
  path,
  method,
  payload,
}: {
  user: User;
  path: string;
  method: "PATCH" | "DELETE";
  payload: unknown;
}): Promise<{
  response: Response;
  data: ContractsMutationResponse | null;
}> {
  let token = await user.getIdToken();
  const request = async (idToken: string) =>
    fetch(path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(payload),
    });

  let response = await request(token);
  if (response.status === 401) {
    token = await user.getIdToken(true);
    response = await request(token);
  }

  const raw = await response.text();
  let data: ContractsMutationResponse | null = null;
  if (raw) {
    try {
      data = JSON.parse(raw) as ContractsMutationResponse;
    } catch {
      data = null;
    }
  }

  return { response, data };
}

function getContractsMutationError({
  response,
  data,
  fallback,
}: {
  response: Response;
  data: ContractsMutationResponse | null;
  fallback: string;
}): string | null {
  if (!response.ok) {
    const apiError =
      data && data.ok === false && typeof data.error === "string" && data.error.trim()
        ? data.error.trim()
        : "";
    return apiError || `${fallback} (HTTP ${response.status}).`;
  }
  if (data && data.ok === false) {
    return typeof data.error === "string" && data.error.trim()
      ? data.error.trim()
      : fallback;
  }
  return null;
}

const productLabel = (p: Product | null) =>
  productLabelFromCatalog(p, p ?? "—");

const POSITION_ORDER: Position[] = [
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

type PositionTimelineEntry = {
  id: string;
  position: Position;
  validFrom: string;
  validTo: string | null;
};

type ManagerChainSnapshotEntry = {
  email: string | null;
  position: Position | null;
  commissionMode: CommissionMode | null;
};

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MIN_REASONABLE_CONTRACT_YEAR = 2000;
const MAX_REASONABLE_CONTRACT_YEAR = 2100;
const MAX_POLICY_START_AFTER_SIGNED_DAYS = 365;

type ContractDateIssue = {
  severity: "error" | "warning";
  message: string;
};

function isIsoDay(value: string): boolean {
  if (!ISO_DAY_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00`);
  return !Number.isNaN(d.getTime());
}

function parseIsoDayUtc(value: string): Date | null {
  const normalized = value.trim();
  if (!ISO_DAY_RE.test(normalized)) return null;
  const d = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  if (d.toISOString().slice(0, 10) !== normalized) return null;
  return d;
}

function collectContractDateIssues(
  signedDateIsoRaw: string,
  policyStartDateIsoRaw: string
): ContractDateIssue[] {
  const signedDateIso = signedDateIsoRaw.trim();
  const policyStartDateIso = policyStartDateIsoRaw.trim();
  const issues: ContractDateIssue[] = [];

  const signedDate = signedDateIso ? parseIsoDayUtc(signedDateIso) : null;
  const policyStartDate = policyStartDateIso ? parseIsoDayUtc(policyStartDateIso) : null;

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

  return issues;
}

function parsePositionTimeline(raw: unknown): PositionTimelineEntry[] {
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

function resolvePositionTimelineMatch(
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

function resolvePositionForSignedDate(
  userData: any,
  signedDateIso: string | null,
  fallbackPosition: Position | null
): Position | null {
  const timeline = parsePositionTimeline(userData?.positionTimeline);
  const timelineMatch =
    signedDateIso && isIsoDay(signedDateIso)
      ? resolvePositionTimelineMatch(signedDateIso, timeline)
      : null;

  return (
    (timelineMatch?.position as Position | undefined) ??
    (userData?.position as Position | undefined) ??
    fallbackPosition ??
    null
  );
}

async function buildManagerChainSnapshotForSignedDate(
  directManagerEmailRaw: string | null | undefined,
  signedDateIso: string | null
): Promise<ManagerChainSnapshotEntry[]> {
  const directManagerEmail = (directManagerEmailRaw ?? "").trim().toLowerCase();
  if (!directManagerEmail) return [];

  const chain: ManagerChainSnapshotEntry[] = [];
  const visited = new Set<string>();
  let currentEmail: string | null = directManagerEmail;
  let depth = 0;

  while (currentEmail && depth < 9 && !visited.has(currentEmail)) {
    visited.add(currentEmail);

    const snap = await getDoc(doc(db, "users", currentEmail));
    if (!snap.exists()) break;

    const data = snap.data() as any;
    const resolvedPosition = resolvePositionForSignedDate(data, signedDateIso, null);
    const resolvedMode = (data?.commissionMode as CommissionMode | undefined) ?? null;

    chain.push({
      email: currentEmail,
      position: resolvedPosition,
      commissionMode: resolvedMode,
    });

    currentEmail =
      ((data?.managerEmail as string | undefined) ?? "").trim().toLowerCase() || null;
    depth += 1;
  }

  return chain;
}

function ensureManagerChainWithDirectManager(
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

function formatIsoDay(value: string | null): string {
  if (!value || !isIsoDay(value)) return "—";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("cs-CZ");
}

function normalizeTitleKey(title: string): string {
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

function stripTotalRows(items: CommissionResultItemDTO[] = []): CommissionResultItemDTO[] {
  return items.filter((it) => !normalizeTitleKey(it.title ?? "").includes("celkem"));
}

function allowedPositionsForUser(base: Position | null): Position[] {
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

function productIcon(product: Product): string {
  return productIconFromCatalog(product);
}

function isAutoProduct(product: Product | null): product is Product {
  return Boolean(product) && isAutoProductFromCatalog(product);
}

function shouldShowDuration(product: Product): boolean {
  return product === "neon" || product === "flexi" || product === "maximaMaxEfekt";
}

function durationRange(product: Product): [number, number] {
  switch (product) {
    case "neon":
      return [1, 99];
    case "flexi":
      return [1, 80];
    case "maximaMaxEfekt":
      return [1, 20];
    default:
      return [1, 1];
  }
}

function durationFallback(product: Product): number {
  switch (product) {
    case "neon":
      return 15;
    case "flexi":
      return 30;
    case "maximaMaxEfekt":
      return 20;
    default:
      return 1;
  }
}

function normalizedDurationYears(
  product: Product,
  years: number | null | undefined
): number {
  const [min, max] = durationRange(product);
  const raw = typeof years === "number" && Number.isFinite(years) ? years : durationFallback(product);
  const wholeYears = Math.floor(raw);
  return Math.min(max, Math.max(min, wholeYears));
}

function allowedFrequencies(product: Product): PaymentFrequency[] {
  switch (product) {
    case "neon":
    case "flexi":
    case "pillowInjury":
    case "maximaMaxEfekt":
      return ["monthly"];
    case "domex":
      return ["quarterly", "semiannual", "annual"];
    case "koopmajetekobcan":
      return ["monthly", "quarterly", "semiannual", "annual"];
    case "pillowAuto":
    case "maxdomov":
    case "kooperativaAuto":
    case "allianzAuto":
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
    case "comfortcc":
      return ["annual"];
  }
}

function titleForFrequency(f: PaymentFrequency): string {
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

function defaultFrequencyText(product: Product): string {
  switch (product) {
    case "neon":
    case "flexi":
    case "pillowInjury":
    case "maximaMaxEfekt":
      return "Frekvence: měsíční";
    case "cppcestovko":
    case "axacestovko":
    case "comfortcc":
      return "Frekvence: jednorázově";
    default:
      return "";
  }
}

function placeholderForAmount(
  product: Product,
  freq: PaymentFrequency
): string {
  if (product === "comfortcc") {
    return "Zadejte výši poplatku / platby";
  }
  if (product === "cppcestovko" || product === "axacestovko") {
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

function durationTooltip(product: Product): string | null {
  if (product === "neon") {
    return "Zadej celkovou dobu trvání smlouvy v letech. Pro výpočet provize se u NEON automaticky použije maximálně 15 let (pokud je doba kratší, použije se skutečná hodnota).";
  }
  if (product === "flexi") {
    return "Zadej dobu trvání smlouvy v letech (např. do roku 2050). Následná provize od 6. roku se počítá ročně do konce zadané doby.";
  }
  if (product === "maximaMaxEfekt") {
    return "Zadej dobu trvání smlouvy, maximálně však 20 let. Pokud je smlouva uzavřena na déle než 20 let, zadej 20.";
  }
  return null;
}

function parseNumber(text: string): number {
  if (!text) return 0;
  const value = parseFloat(text.replace(",", "."));
  return Number.isNaN(value) ? 0 : value;
}

function clampTipsterPercent(value: number): number {
  if (!Number.isFinite(value)) return 100;
  return Math.min(100, Math.max(0, Math.round(value)));
}

const SUPPORTED_LABEL =
  "Tento produkt zatím není na webu dopočítaný – aktuálně počítáme všechny produkty kromě Comfort Commodity.";

function paymentBasedTotals(
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

function cleanResultTitle(title: string): string {
  const match = title.match(/[\p{L}\p{N}]/u);
  if (!match) return title.trim();
  return title.slice(title.indexOf(match[0])).trim();
}

function resultIconForTitle(title: string): string | null {
  const t = cleanResultTitle(title).toLowerCase();

  if (t.startsWith("okamžitá provize") || t.startsWith("získatelská provize")) {
    return "/icons/penize2.png";
  }

  if (t.includes("po 3 letech") || t.includes("po 4 letech")) {
    return "/icons/kalendar.png";
  }

  if (t.startsWith("následná provize")) {
    return "/icons/nasledna.png";
  }

  return null;
}

function isImmediateCommissionTitle(title: string): boolean {
  const t = cleanResultTitle(title).toLowerCase();
  return t.includes("okamžitá provize") || t.includes("získatelská provize");
}

type ContractEntryType = "contract" | "endorsement";
type EndorsementChangeType = "increase" | "decrease" | "same";

type EndorsementSourceEntry = {
  id: string;
  path: string;
  productKey: Product | null;
  rootContractEntryId: string | null;
  effectiveInputAmount: number;
  policyStartDate: Date | null;
  contractSignedDate: Date | null;
  createdAt: Date | null;
};

type EndorsementDraft = {
  productKey: Product;
  contractNumber: string;
  sourceEntryId: string;
  sourceEntryPath: string;
  rootContractEntryId: string;
  previousPremiumAmount: number;
  newPremiumAmount: number;
  deltaAmount: number;
  calculationAmount: number;
  changeType: EndorsementChangeType;
  items: CommissionResultItemDTO[];
  total: number;
};

function toNonNegativeNumber(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, num);
}

function compareSourceEntriesByRecency(
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

function resolveEffectivePremium(data: any): number {
  return toNonNegativeNumber(
    data?.effectiveInputAmount ?? data?.newInputAmount ?? data?.inputAmount
  );
}

function normalizeClientNameForDuplicate(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeContractEntryType(value: unknown): ContractEntryType {
  if (typeof value !== "string") return "contract";
  const normalized = value.trim().toLowerCase();
  return normalized === "endorsement" ? "endorsement" : "contract";
}

function isoDayFromUnknown(value: unknown): string | null {
  const d = toDate(value);
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

// ---------- Kalkulačka ----------

export default function CalculatorPage() {
  const [user, setUser] = useState<User | null>(null);

  const [product, setProduct] = useState<Product>("neon");
  const [productOpen, setProductOpen] = useState(false);
  const [position, setPosition] = useState<Position>("manazer7");
  const [mode, setMode] = useState<CommissionMode>("accelerated");
  const [frequency, setFrequency] = useState<PaymentFrequency>("monthly");
  const [durationYears, setDurationYears] = useState<number | null>(null);
  const [amountText, setAmountText] = useState<string>("");
  const [tipsterModeEnabled, setTipsterModeEnabled] = useState(false);
  const [tipsterPercent, setTipsterPercent] = useState(100);
  const [tipsterPercentPanelOpen, setTipsterPercentPanelOpen] = useState(false);
  const [comfortGradual, setComfortGradual] = useState<boolean>(false);
  const [comfortPaymentText, setComfortPaymentText] = useState<string>("");
  const [comfortTargetAmountText, setComfortTargetAmountText] = useState<string>("");

  const [clientName, setClientName] = useState<string>("");
  const [clientSuggestions, setClientSuggestions] = useState<string[]>([]);
  const [clientSuggestionsOpen, setClientSuggestionsOpen] = useState(false);
  const [contractSignedDate, setContractSignedDate] = useState<string>("");
  const [policyStartDate, setPolicyStartDate] = useState<string>("");
  const [contractNumber, setContractNumber] = useState<string>("");
  const [refreshOriginalOpen, setRefreshOriginalOpen] = useState(false);
  const [originalContractNumber, setOriginalContractNumber] = useState<string>("");
  const [replacementOpen, setReplacementOpen] = useState(false);
  const [replacementContractNumber, setReplacementContractNumber] = useState<string>("");
  const [durationHelpOpen, setDurationHelpOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pdfImporting, setPdfImporting] = useState(false);
  const [pdfImportStatus, setPdfImportStatus] = useState<string | null>(null);
  const [pdfImportError, setPdfImportError] = useState<string | null>(null);

  const [items, setItems] = useState<CommissionResultItemDTO[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [unsupported, setUnsupported] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [duplicateModal, setDuplicateModal] = useState<{
    mode: "overwrite" | "saveAnyway";
    description: string;
    contractNumber: string | null;
    count: number;
    entries: { id: string; path: string; contractNumber: string | null }[];
  } | null>(null);
  const [endorsementDraft, setEndorsementDraft] = useState<EndorsementDraft | null>(null);
  const [saveSuccessFlash, setSaveSuccessFlash] = useState<{
    contractNumber: string | null;
    clientName: string | null;
  } | null>(null);

  const contractDateIssues = useMemo(
    () => collectContractDateIssues(contractSignedDate, policyStartDate),
    [contractSignedDate, policyStartDate]
  );
  const contractDateErrors = useMemo(
    () => contractDateIssues.filter((issue) => issue.severity === "error"),
    [contractDateIssues]
  );
  const contractDateWarnings = useMemo(
    () => contractDateIssues.filter((issue) => issue.severity === "warning"),
    [contractDateIssues]
  );

  const validateContractDatesBeforeSave = (): boolean => {
    if (contractDateErrors.length > 0) {
      const msg = `Zkontroluj datumy: ${contractDateErrors
        .map((issue) => issue.message)
        .join(" ")}`;
      setSaveMessage(msg);
      setValidationError(msg);
      return false;
    }

    if (contractDateWarnings.length === 0) return true;
    if (typeof window === "undefined") return true;

    const warningText = contractDateWarnings
      .map((issue) => `• ${issue.message}`)
      .join("\n");
    const proceed = window.confirm(
      `Pozor, datumy vypadají neobvykle:\n${warningText}\n\nChceš i přesto uložit?`
    );
    if (!proceed) {
      setSaveMessage("Uložení zrušeno. Zkontroluj datumy.");
      return false;
    }

    return true;
  };

  const paymentBasedTotalsMemo = useMemo(() => {
    if (
      (product !== "domex" &&
        product !== "koopmajetekobcan" &&
        product !== "maxdomov") ||
      items.length === 0
    ) {
      return null;
    }
    const multiplier = paymentsPerYear(frequency);
    return paymentBasedTotals(items, multiplier);
  }, [product, items, frequency]);

  const immediateCommissionTotal = useMemo(
    () =>
      items.reduce((sum, item) => {
        if (!isImmediateCommissionTitle(item.title)) return sum;
        return sum + (item.amount ?? 0);
      }, 0),
    [items]
  );
  const tipsterImmediateCommission = useMemo(
    () => immediateCommissionTotal * (tipsterPercent / 100),
    [immediateCommissionTotal, tipsterPercent]
  );
  const comfortPayoutCount = useMemo(() => {
    if (product !== "comfortcc" || !comfortGradual) return null;
    const payment = parseNumber(comfortPaymentText);
    const targetAmount = parseNumber(comfortTargetAmountText);
    if (payment <= 0 || targetAmount <= 0) return null;
    return Math.max(1, Math.ceil(targetAmount / payment));
  }, [product, comfortGradual, comfortPaymentText, comfortTargetAmountText]);

  type ManagerOverrideSnapshot = {
    email: string | null;
    position: Position | null;
    commissionMode: CommissionMode | null;
    items: CommissionResultItemDTO[];
    total: number;
  };

  const [managerEmailSnapshot, setManagerEmailSnapshot] = useState<string | null>(null);
  const [managerPositionSnapshot, setManagerPositionSnapshot] = useState<Position | null>(null);
  const [managerModeSnapshot, setManagerModeSnapshot] = useState<CommissionMode | null>(null);
  const [managerChainSnapshot, setManagerChainSnapshot] = useState<
    ManagerChainSnapshotEntry[]
  >([]);
  const [userCommissionMode, setUserCommissionMode] = useState<CommissionMode | null>(null);
  const [baseUserPosition, setBaseUserPosition] = useState<Position | null>(null);
  const [positionTimeline, setPositionTimeline] = useState<PositionTimelineEntry[]>([]);
  const [timelineMatchedPosition, setTimelineMatchedPosition] = useState<{
    position: Position;
    validFrom: string;
    validTo: string | null;
    unavailable: boolean;
  } | null>(null);
  const [showCoefModal, setShowCoefModal] = useState(false);
  const isLifeProduct = useMemo(() => LIFE_PRODUCTS.includes(product), [product]);
  const replacementEligible = useMemo(
    () => REPLACEMENT_ELIGIBLE_PRODUCTS.includes(product),
    [product]
  );
  const canImportFromPdf = useMemo(
    () =>
      !tipsterModeEnabled &&
      (product === "cppAuto" ||
        product === "neon" ||
        product === "flexi" ||
        product === "domex" ||
        product === "comfortcc"),
    [product, tipsterModeEnabled]
  );

  const coefList = useMemo(
    () => getCoefficientSummary(product ?? null, position ?? null, mode ?? null),
    [product, position, mode]
  );
  const coefExplanation = useMemo(() => {
    if (!product) return "";
    const payLabel = frequencyLabel(frequency);
    const payPerYear = paymentsPerYear(frequency);
    switch (product) {
      case "neon":
        return "Výpočet: měsíční pojistné × 12 × doba trvání × koeficient. Následné provize jsou roční: roční pojistné × koeficient (2.–5. rok a 5.–10. rok).";
      case "flexi":
        return "Výpočet: roční pojistné (měsíční × 12) × koeficient/100 pro okamžitou/po 3/po 4 letech. Následná: roční pojistné × koeficient ročně od 6. roku do konce zadané doby.";
      case "maximaMaxEfekt":
        return "Výpočet: roční pojistné × doba trvání × koeficient pro okamžitou/po 3/po 4 letech. Následná: roční pojistné × koeficient ročně od 5. roku.";
      case "pillowInjury":
        return "Výpočet: roční pojistné (měsíční × 12) × koeficient/100 pro jednotlivé položky.";
      case "domex":
      case "koopmajetekobcan":
        return `Výpočet: platba (${payLabel}) × koeficient. Roční verze násobí počet plateb/rok (${payPerYear}).`;
      case "maxdomov":
        return `Výpočet: platba (${payLabel}) × koeficient (získatelská i následná). Roční částka = × počet plateb (${payPerYear}).`;
      case "cppAuto":
      case "slaviaauto":
      case "cppsimplex":
      case "allianzAuto":
      case "csobAuto":
      case "uniqaAuto":
      case "uniqaflotila":
      case "pillowAuto":
      case "kooperativaAuto":
      case "zamex":
        return `Výpočet: platba (${payLabel}) × koeficient; roční částka = × počet plateb (${payPerYear}).`;
      case "cppPPRbez":
      case "cppPPRs":
        return `Výpočet: platba (${payLabel}) × koeficient (získatelská / následná). Roční varianta = × počet plateb (${payPerYear}).`;
      case "cppcestovko":
      case "axacestovko":
        return "Výpočet: pojistné × koeficient (jednorázově).";
      case "comfortcc":
        return "Výpočet: následná provize z platby = pravidelná platba × koeficient. U postupného poplatku je tato částka započtená i do okamžité provize. Pokud zadáš cílovou částku, Celkem dopočítá celý součet za všechny výplaty následné.";
      default:
        return "";
    }
  }, [product, frequency]);
  const autoTermsPreviewUrl = useMemo(() => {
    if (!product) return null;
    return AUTO_TERMS_PREVIEW_BY_PRODUCT[product] ?? null;
  }, [product]);
  const showAutoTermsPreview = Boolean(autoTermsPreviewUrl);
  const filteredClientSuggestions = useMemo(() => {
    const q = clientName.trim().toLowerCase();
    if (!q) return [];
    return clientSuggestions
      .filter((n) => n.toLowerCase().includes(q))
      .slice(0, 6);
  }, [clientName, clientSuggestions]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const fetchClientNames = async () => {
      if (!user?.email) {
        setClientSuggestions([]);
        return;
      }

      try {
        let bearerToken = await user.getIdToken();
        const requestWithToken = async (token: string) =>
          fetch("/api/contracts/list?scope=my&limit=200", {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
          });

        let res = await requestWithToken(bearerToken);
        if (res.status === 401) {
          bearerToken = await user.getIdToken(true);
          res = await requestWithToken(bearerToken);
        }

        const payload = (await res.json()) as ContractsApiResponse;
        if (!res.ok || payload?.ok === false) {
          throw new Error(payload?.error || "Nepodařilo se načíst smlouvy.");
        }

        const names = (payload.contracts ?? [])
          .map((d) => d.clientName as string | undefined)
          .filter((n) => typeof n === "string" && n.trim().length > 0)
          .map((n) => n!.trim());
        const unique = Array.from(new Set(names));
        setClientSuggestions(unique);
      } catch (err) {
        console.error("Failed to load client name suggestions", err);
      }
    };

    fetchClientNames();
  }, [user]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const storedPosition = window.localStorage.getItem(
      SETTINGS_KEYS.position
    ) as Position | null;
    if (storedPosition) {
      setPosition(storedPosition);
      setBaseUserPosition(storedPosition);
    }

    const storedMode = window.localStorage.getItem(
      SETTINGS_KEYS.mode
    ) as CommissionMode | null;
    if (storedMode) {
      setMode(storedMode);
    }

    const storedTipsterMode = window.localStorage.getItem(SETTINGS_KEYS.tipsterMode);
    if (storedTipsterMode === "1" || storedTipsterMode === "0") {
      setTipsterModeEnabled(storedTipsterMode === "1");
    }

    const storedTipsterPercent = window.localStorage.getItem(SETTINGS_KEYS.tipsterPercent);
    const tipsterPercentValue = storedTipsterPercent
      ? Number(storedTipsterPercent)
      : 100;
    if (Number.isFinite(tipsterPercentValue)) {
      setTipsterPercent(clampTipsterPercent(tipsterPercentValue));
    }
  }, []);

  useEffect(() => {
    const loadUserPosition = async () => {
      if (!user?.email) return;
      try {
        const readUserDoc = async (docId: string) => {
          const userRef = doc(db, "users", docId);
          try {
            return await getDocFromServer(userRef);
          } catch {
            return await getDoc(userRef);
          }
        };

        const emailRaw = user.email;
        const email = emailRaw.toLowerCase();
        const userRef = doc(db, "users", email);
        const userSnap = await readUserDoc(email);
        let data = userSnap.data() as any;

        if (emailRaw !== email) {
          const rawSnap = await readUserDoc(emailRaw);
          const rawData = rawSnap.exists() ? (rawSnap.data() as any) : null;

          if (!userSnap.exists() && rawData) {
            data = rawData;
            try {
              await setDoc(userRef, rawData, { merge: true });
            } catch (migrationError) {
              console.warn("Failed to migrate legacy user doc ID", migrationError);
            }
          } else if (data && rawData) {
            const normalizedTimeline = parsePositionTimeline(data.positionTimeline);
            const rawTimeline = parsePositionTimeline(rawData.positionTimeline);
            if (normalizedTimeline.length === 0 && rawTimeline.length > 0) {
              data = {
                ...data,
                positionTimeline: rawData.positionTimeline,
              };
              try {
                await setDoc(
                  userRef,
                  { positionTimeline: rawData.positionTimeline },
                  { merge: true }
                );
              } catch (timelineSyncError) {
                console.warn(
                  "Failed to sync legacy position timeline to lowercase user doc",
                  timelineSyncError
                );
              }
            }
          }
        }

        const parsedPositionTimeline = parsePositionTimeline(data?.positionTimeline);
        setPositionTimeline(parsedPositionTimeline);
        const pos = (data?.position as Position | undefined) ?? null;
        if (pos) {
          setPosition(pos);
          setBaseUserPosition(pos);
          if (typeof window !== "undefined") {
            window.localStorage.setItem(SETTINGS_KEYS.position, pos);
          }
        }

        const mgrEmail = (data?.managerEmail as string | undefined)?.toLowerCase() ?? null;
        setManagerEmailSnapshot(mgrEmail ?? null);
        const userMode = (data?.commissionMode as CommissionMode | undefined) ?? null;
        if (userMode) {
          setUserCommissionMode(userMode);
          setMode(userMode);
          if (typeof window !== "undefined") {
            window.localStorage.setItem(SETTINGS_KEYS.mode, userMode);
          }
        }

        const tipsterModeValue =
          typeof data?.tipsterCollaborationMode === "boolean"
            ? data.tipsterCollaborationMode
            : null;
        if (tipsterModeValue !== null) {
          setTipsterModeEnabled(tipsterModeValue);
          if (typeof window !== "undefined") {
            window.localStorage.setItem(
              SETTINGS_KEYS.tipsterMode,
              tipsterModeValue ? "1" : "0"
            );
          }
        }

        const tipsterPercentValue =
          typeof data?.tipsterCommissionPercent === "number"
            ? clampTipsterPercent(data.tipsterCommissionPercent)
            : null;
        if (tipsterPercentValue !== null) {
          setTipsterPercent(tipsterPercentValue);
          if (typeof window !== "undefined") {
            window.localStorage.setItem(
              SETTINGS_KEYS.tipsterPercent,
              String(tipsterPercentValue)
            );
          }
        }

        const chain: ManagerChainSnapshotEntry[] = [];

        if (mgrEmail) {
          try {
            const mgrSnap = await getDoc(doc(db, "users", mgrEmail));
            if (mgrSnap.exists()) {
              const mgrData = mgrSnap.data() as any;
              const mgrPos = (mgrData.position as Position | undefined) ?? null;
              const mgrMode = (mgrData.commissionMode as CommissionMode | undefined) ?? null;
              setManagerPositionSnapshot(mgrPos);
              setManagerModeSnapshot(mgrMode ?? null);

              chain.push({
                email: mgrEmail,
                position: mgrPos,
                commissionMode: mgrMode ?? null,
              });

              // projít hierarchii výš (max 9 úrovní, proti cyklům)
              let currentEmail = (mgrData.managerEmail as string | undefined)?.toLowerCase() ?? null;
              let depth = 0;
              const visited = new Set<string>();
              visited.add(mgrEmail);
              while (currentEmail && depth < 9 && !visited.has(currentEmail)) {
                visited.add(currentEmail);
                const upperSnap = await getDoc(doc(db, "users", currentEmail));
                if (!upperSnap.exists()) break;
                const upperData = upperSnap.data() as any;
                const upperPos = (upperData.position as Position | undefined) ?? null;
                const upperMode =
                  (upperData.commissionMode as CommissionMode | undefined) ?? null;
                chain.push({
                  email: currentEmail,
                  position: upperPos,
                  commissionMode: upperMode,
                });
                currentEmail =
                  (upperData.managerEmail as string | undefined)?.toLowerCase() ?? null;
                depth += 1;
              }
            }
          } catch (mgrErr) {
            console.error("Failed to load manager snapshot", mgrErr);
          }
        }

        setManagerChainSnapshot(chain);
      } catch (err) {
        console.error("Failed to load user position", err);
        setPositionTimeline([]);
      }
    };

    loadUserPosition();
  }, [user]);

  useEffect(() => {
    if (!contractSignedDate.trim() || positionTimeline.length === 0) {
      setTimelineMatchedPosition(null);
      return;
    }

    const match = resolvePositionTimelineMatch(contractSignedDate.trim(), positionTimeline);
    if (!match) {
      setTimelineMatchedPosition(null);
      return;
    }

    const allowed = baseUserPosition
      ? allowedPositionsForUser(baseUserPosition)
      : POSITION_ORDER;
    const unavailable = !allowed.includes(match.position);

    setTimelineMatchedPosition({
      position: match.position,
      validFrom: match.validFrom,
      validTo: match.validTo,
      unavailable,
    });

    if (!unavailable) {
      setPosition((prev) => (prev === match.position ? prev : match.position));
    }
  }, [contractSignedDate, positionTimeline, baseUserPosition]);

  useEffect(() => {
    const allowed = allowedFrequencies(product);
    if (!allowed.includes(frequency)) {
      setFrequency(allowed[0]);
    }

    if (product !== "comfortcc") {
      setComfortGradual(false);
      setComfortPaymentText("");
      setComfortTargetAmountText("");
    }

    const [min, max] = durationRange(product);
    if (durationYears == null) {
      if (product === "neon") return;
      setDurationYears(durationFallback(product));
      return;
    }
    if (durationYears < min || durationYears > max) {
      setDurationYears(Math.min(max, Math.max(min, durationYears)));
    }

    // pokud uživatel má zrychlený režim, dovolíme přepnout pro konkrétní smlouvu
    // defaultně zůstává nastavený režim z profilu (mode)
  }, [product, frequency, durationYears]);

  // Výchozí hodnota doby trvání po změně produktu
  useEffect(() => {
    if (product === "neon") {
      setDurationYears(null);
    }
    if (product === "maximaMaxEfekt") {
      setDurationYears(20);
    }
  }, [product]);

  useEffect(() => {
    if (!replacementEligible) {
      setReplacementOpen(false);
      setReplacementContractNumber("");
    }
  }, [product, replacementEligible]);

  useEffect(() => {
    // pokud uživatel začal doplňovat chybějící pole, postupně čistíme chyby
    setMissingFields((prev) =>
      prev.filter((key) => {
        if (key === "částku") return parseNumber(amountText) <= 0;
        if (key === "jméno klienta") return !clientName.trim();
        if (key === "číslo smlouvy") return !contractNumber.trim();
        if (key === "datum sjednání") return !contractSignedDate.trim();
        if (key === "datum počátku") return !policyStartDate.trim();
        if (key === "pravidelnou platbu") return product === "comfortcc" && comfortGradual && parseNumber(comfortPaymentText) <= 0;
        return true;
      })
    );
  }, [amountText, clientName, contractNumber, contractSignedDate, policyStartDate, comfortPaymentText, product, comfortGradual]);

  useEffect(() => {
    if (!tipsterModeEnabled) {
      setTipsterPercentPanelOpen(false);
    }
  }, [tipsterModeEnabled]);

  const setTipsterPercentDraft = (value: number): number => {
    const next = clampTipsterPercent(value);
    setTipsterPercent(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SETTINGS_KEYS.tipsterPercent, String(next));
    }
    return next;
  };

  const persistTipsterPercent = async (value: number) => {
    const next = setTipsterPercentDraft(value);

    const email = (user?.email ?? "").trim().toLowerCase();
    if (!email) return;

    try {
      await setDoc(
        doc(db, "users", email),
        { tipsterCommissionPercent: next },
        { merge: true }
      );
    } catch (err) {
      console.error("Failed to persist tipster percent", err);
    }
  };

  const handlePdfImport = async (file: File | null) => {
    if (!file) return;
    setPdfImporting(true);
    setPdfImportError(null);
    setPdfImportStatus("Načítám PDF…");
    try {
      let parsed:
        | Awaited<ReturnType<typeof parseCppAutoPdf>>
        | Awaited<ReturnType<typeof parseNeonPdf>>
        | Awaited<ReturnType<typeof parseFlexiPdf>>
        | Awaited<ReturnType<typeof parseDomexPdf>>
        | Awaited<ReturnType<typeof parseComfortPdf>>
        | null = null;

      if (product === "cppAuto") {
        parsed = await parseCppAutoPdf(file);
      } else if (product === "neon") {
        parsed = await parseNeonPdf(file);
      } else if (product === "flexi") {
        parsed = await parseFlexiPdf(file);
      } else if (product === "domex") {
        parsed = await parseDomexPdf(file);
      } else if (product === "comfortcc") {
        parsed = await parseComfortPdf(file);
      } else {
        setPdfImportError(
          "Načítání z PDF je teď dostupné jen pro ČPP Auto, ČPP ŽP NEON, Kooperativa ŽP FLEXI, ČPP DOMEX a Comfort Commodity."
        );
        setPdfImportStatus(null);
        return;
      }

      if (!parsed) {
        setPdfImportStatus("PDF se nepodařilo přečíst.");
        return;
      }
      let applied = 0;

      if (parsed.contractNumber) {
        setContractNumber(parsed.contractNumber);
        applied += 1;
      }
      if (parsed.clientName) {
        setClientName(parsed.clientName);
        applied += 1;
      }
      if (parsed.policyStartDate) {
        setPolicyStartDate(parsed.policyStartDate);
        applied += 1;
      }
      if (parsed.contractSignedDate) {
        setContractSignedDate(parsed.contractSignedDate);
        applied += 1;
      }
      if (typeof parsed.amount === "number") {
        setAmountText(String(parsed.amount));
        applied += 1;
      }
      if ("comfortPayment" in parsed && typeof parsed.comfortPayment === "number") {
        setComfortPaymentText(String(parsed.comfortPayment));
        applied += 1;
      }
      if (parsed.frequency) {
        const allowedForProduct = allowedFrequencies(product);
        if (allowedForProduct.includes(parsed.frequency)) {
          setFrequency(parsed.frequency);
        }
      }
      if ("durationYears" in parsed && typeof parsed.durationYears === "number") {
        const [min, max] = durationRange(product);
        const yrs = Math.min(max, Math.max(min, parsed.durationYears));
        setDurationYears(yrs);
        applied += 1;
      }

      setPdfImportStatus(
        applied > 0
          ? `Načteno z PDF (${applied} polí). Zkontroluj prosím.`
          : "V PDF se nenašla čitelná data, doplň ručně."
      );
    } catch (err) {
      console.error("PDF import selhal", err);
      setPdfImportError("PDF se nepodařilo přečíst. Zkus prosím zadat ručně.");
      setPdfImportStatus(null);
    } finally {
      setPdfImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const recalc = () => {
    const val = parseNumber(amountText);
    const comfortPayment = parseNumber(comfortPaymentText);
    const comfortTargetAmount = parseNumber(comfortTargetAmountText);

    if (val <= 0) {
      setItems([]);
      setTotal(0);
      setUnsupported(false);
      return;
    }

    if (product === "neon") {
      const y = Math.min(15, normalizedDurationYears("neon", durationYears));
      const dto = calculateNeon(val, position, y, mode);
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "flexi") {
      const y = normalizedDurationYears("flexi", durationYears);
      const dto = calculateFlexi(val, position, mode, y);
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "maximaMaxEfekt") {
      const y = normalizedDurationYears("maximaMaxEfekt", durationYears);
      const dto = calculateMaxEfekt(val, y, position, mode);
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "pillowInjury") {
      const dto = calculatePillowInjury(val, position, mode);
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "domex" || product === "koopmajetekobcan") {
      const dto =
        product === "domex"
          ? calculateDomex(val, frequency, position)
          : calculateKoopMajetekObcan(val, frequency, position);
      const filtered = dto.items.filter((i) =>
        (i.title ?? "").toLowerCase().includes("(z platby)")
      );
      const totals = paymentBasedTotals(filtered, paymentsPerYear(frequency));
      setItems(filtered);
      setTotal(totals.immediate + totals.subsequent);
      setUnsupported(false);
      return;
    }

    if (product === "maxdomov") {
      const dto = calculateMaxdomov(val, frequency, position);
      const filtered = dto.items.filter((i) =>
        (i.title ?? "").toLowerCase().includes("(z platby)")
      );
      const totals = paymentBasedTotals(filtered, paymentsPerYear(frequency));
      setItems(filtered);
      setTotal(totals.immediate + totals.subsequent);
      setUnsupported(false);
      return;
    }

    if (product === "cppAuto") {
      const dto = calculateCppAuto(val, frequency, position);
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "slaviaauto") {
      const dto = calculateSlaviaAuto(val, frequency, position);
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "cppsimplex") {
      const dto = calculateCppSimplex(val, frequency, position);
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "cppPPRbez") {
      const dto = calculateCppPPRbez(val, frequency, position);
      const filtered = dto.items.filter((i) =>
        (i.title ?? "").toLowerCase().includes("(z platby)")
      );
      const sum = filtered.reduce((s, i) => s + (i.amount ?? 0), 0);
      setItems(filtered);
      setTotal(sum);
      setUnsupported(false);
      return;
    }

    if (product === "cppPPRs") {
      const dto = calculateCppPPRs(val, frequency, position);
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "allianzAuto") {
      const dto = calculateAllianzAuto(val, frequency, position);
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "csobAuto") {
      const dto = calculateCsobAuto(val, frequency, position);
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "uniqaAuto" || product === "uniqaflotila") {
      const dto = calculateUniqaAuto(val, frequency, position);
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "pillowAuto") {
      const dto = calculatePillowAuto(val, frequency, position);
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "kooperativaAuto") {
      const dto = calculateKooperativaAuto(val, frequency, position);
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "zamex") {
      const dto = calculateZamex(val, frequency, position);
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "cppcestovko") {
      const dto = calculateCppCestovko(val, position);
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "axacestovko") {
      const dto = calculateAxaCestovko(val, position);
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    if (product === "comfortcc") {
      const dto = calculateComfortCC({
        fee: val,
        payment: comfortPayment,
        targetAmount: comfortGradual ? comfortTargetAmount : 0,
        isSavings: comfortGradual,
        isGradualFee: comfortGradual,
        position,
      });
      setItems(dto.items);
      setTotal(dto.total);
      setUnsupported(false);
      return;
    }

    setItems([]);
    setTotal(0);
    setUnsupported(true);
  };

  useEffect(() => {
    recalc();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product, position, mode, frequency, durationYears, amountText, comfortGradual, comfortPaymentText, comfortTargetAmountText]);

  useEffect(() => {
    if (product !== "neon") {
      setRefreshOriginalOpen(false);
      setOriginalContractNumber("");
    }
  }, [product]);

  useEffect(() => {
    setDurationHelpOpen(false);
  }, [product]);

  useEffect(() => {
    if (!endorsementDraft) return;
    if (!isLifeProduct || endorsementDraft.productKey !== product) {
      setEndorsementDraft(null);
    }
  }, [endorsementDraft, isLifeProduct, product]);

  const syncEntryIndexesBestEffort = async (ownerEmail: string, entryId: string) => {
    if (!user) return;
    try {
      const { response, data } = await requestContractsMutationWithAuth({
        user,
        path: "/api/contracts/sync-entry-index",
        method: "PATCH",
        payload: { ownerEmail, entryId },
      });
      const apiError = getContractsMutationError({
        response,
        data,
        fallback: "Synchronizace indexu smlouvy selhala.",
      });
      if (apiError) {
        throw new Error(apiError);
      }
    } catch (err) {
      console.warn(
        `Best-effort synchronizace indexu pro ${ownerEmail}/${entryId} selhala:`,
        err
      );
    }
  };

  const handlePrepareEndorsement = async () => {
    if (!user) return;

    if (tipsterModeEnabled) {
      setSaveMessage("V režimu TIPAŘSKÉ spolupráce se smlouvy neukládají.");
      return;
    }

    if (!isLifeProduct) {
      setValidationError("Změnu zatím umíme jen pro ŽP produkty.");
      return;
    }

    const trimmedContractNumber = contractNumber.trim();
    const newPremiumAmount = parseNumber(amountText);

    const missing: string[] = [];
    if (!trimmedContractNumber) missing.push("číslo smlouvy");
    if (newPremiumAmount <= 0) missing.push("částku");

    if (missing.length > 0) {
      const msg = `Pro změnu doplň: ${missing.join(", ")}.`;
      setSaveMessage(msg);
      setValidationError(msg);
      setMissingFields((prev) => Array.from(new Set([...prev, ...missing])));
      return;
    }

    try {
      const email = (user.email ?? "").toLowerCase();
      const userRef = doc(db, "users", email);
      const entriesRef = collection(userRef, "entries");
      const contractSnap = await getDocs(
        query(entriesRef, where("contractNumber", "==", trimmedContractNumber))
      );

      if (contractSnap.empty) {
        setValidationError(
          `Smlouvu č. ${trimmedContractNumber} jsem nenašel. Nejdřív musí být uložená jako původní smlouva.`
        );
        return;
      }

      const productMatches: EndorsementSourceEntry[] = contractSnap.docs
        .map((entryDoc) => {
          const data = entryDoc.data() as any;
          return {
            id: entryDoc.id,
            path: entryDoc.ref.path,
            productKey: (data?.productKey as Product | undefined) ?? null,
            rootContractEntryId:
              (data?.rootContractEntryId as string | undefined) ?? null,
            effectiveInputAmount: resolveEffectivePremium(data),
            policyStartDate: toDate(data?.policyStartDate),
            contractSignedDate: toDate(data?.contractSignedDate),
            createdAt: toDate(data?.createdAt),
          };
        })
        .filter((entry) => entry.productKey === product);

      if (productMatches.length === 0) {
        setValidationError(
          `Pro smlouvu č. ${trimmedContractNumber} není uložený produkt ${productLabel(product)}.`
        );
        return;
      }

      productMatches.sort(compareSourceEntriesByRecency);

      const latestEntry = productMatches[0];
      const previousPremiumAmount = latestEntry.effectiveInputAmount;
      const deltaAmount = newPremiumAmount - previousPremiumAmount;

      if (Math.abs(deltaAmount) < 0.01) {
        setValidationError(
          `Nové pojistné je stejné jako poslední uložená hodnota (${formatMoney(previousPremiumAmount)}).`
        );
        return;
      }

      const changeType: EndorsementChangeType =
        deltaAmount > 0 ? "increase" : deltaAmount < 0 ? "decrease" : "same";
      const calculationAmount = deltaAmount > 0 ? deltaAmount : 0;

      let endorsementItems: CommissionResultItemDTO[] = [];
      let endorsementTotal = 0;
      if (calculationAmount > 0) {
        const result = computeItemsForPositionAndMode(position, mode, calculationAmount);
        endorsementItems = result?.items ?? [];
        endorsementTotal = result?.total ?? 0;
      }

      setEndorsementDraft({
        productKey: product,
        contractNumber: trimmedContractNumber,
        sourceEntryId: latestEntry.id,
        sourceEntryPath: latestEntry.path,
        rootContractEntryId: latestEntry.rootContractEntryId ?? latestEntry.id,
        previousPremiumAmount,
        newPremiumAmount,
        deltaAmount,
        calculationAmount,
        changeType,
        items: endorsementItems,
        total: endorsementTotal,
      });
      setValidationError(null);
      setSaveMessage(null);
    } catch (error) {
      console.error("Chyba při přípravě dodatku", error);
      setValidationError("Nepodařilo se připravit změnu smlouvy. Zkus to prosím znovu.");
    }
  };

  const handleSaveEndorsement = async () => {
    if (!user || !endorsementDraft) return;

    if (tipsterModeEnabled) {
      setSaveMessage("V režimu TIPAŘSKÉ spolupráce se smlouvy neukládají.");
      return;
    }

    const missing: string[] = [];
    if (!clientName.trim()) missing.push("jméno klienta");
    if (!contractNumber.trim()) missing.push("číslo smlouvy");
    if (!contractSignedDate.trim()) missing.push("datum sjednání");
    if (!policyStartDate.trim()) missing.push("datum počátku");

    if (missing.length > 0) {
      const msg = `Doplň: ${missing.join(", ")}.`;
      setSaveMessage(msg);
      setValidationError(msg);
      setMissingFields((prev) => Array.from(new Set([...prev, ...missing])));
      return;
    }
    if (!validateContractDatesBeforeSave()) return;

    const trimmedContractNumber = contractNumber.trim();
    if (endorsementDraft.productKey !== product) {
      setValidationError(
        "Produkt se od otevření okna změnil. Klikni prosím na Změna znovu."
      );
      setEndorsementDraft(null);
      return;
    }

    if (trimmedContractNumber !== endorsementDraft.contractNumber) {
      setValidationError(
        "Číslo smlouvy se od otevření okna změnilo. Klikni prosím na Změna znovu."
      );
      setEndorsementDraft(null);
      return;
    }

    const currentPremiumAmount = parseNumber(amountText);
    if (Math.abs(currentPremiumAmount - endorsementDraft.newPremiumAmount) > 0.01) {
      setValidationError(
        "Částka se od otevření okna změnila. Klikni prosím na Změna znovu."
      );
      setEndorsementDraft(null);
      return;
    }

    setSaving(true);
    setSaveMessage(null);
    setValidationError(null);
    setMissingFields([]);

    const email = (user.email ?? "").toLowerCase();
    const uid = user.uid ?? null;
    const userRef = doc(db, "users", email);
    const entriesRef = collection(userRef, "entries");

    try {
      const signed =
        contractSignedDate.trim().length > 0
          ? new Date(contractSignedDate)
          : null;
      const signedDateIso = contractSignedDate.trim() || null;
      const start =
        policyStartDate.trim().length > 0 ? new Date(policyStartDate) : null;

      let mgrEmail = managerEmailSnapshot;
      let mgrPos = managerPositionSnapshot;
      let mgrMode = managerModeSnapshot;
      let managerChainForSave: ManagerChainSnapshotEntry[] = managerChainSnapshot;
      let overridesForChain: ManagerOverrideSnapshot[] = [];
      try {
        const userSnap = await getDoc(userRef);
        const data = userSnap.data() as any;
        mgrEmail =
          (data?.managerEmail as string | undefined)?.toLowerCase() ??
          mgrEmail ??
          null;
        if (mgrEmail) {
          const resolvedChain = await buildManagerChainSnapshotForSignedDate(
            mgrEmail,
            signedDateIso
          );
          if (resolvedChain.length > 0) {
            managerChainForSave = resolvedChain;
          }
        }
        if (managerChainForSave.length > 0) {
          mgrPos = managerChainForSave[0]?.position ?? mgrPos ?? null;
          mgrMode = managerChainForSave[0]?.commissionMode ?? mgrMode ?? null;
        }
      } catch (snapshotErr) {
        console.error("Failed to snapshot manager info", snapshotErr);
      }

      managerChainForSave = ensureManagerChainWithDirectManager(
        managerChainForSave,
        mgrEmail,
        mgrPos ?? null,
        mgrMode ?? null
      );

      const diffs: ManagerOverrideSnapshot[] = [];
      let childPositionForBaseline: Position | null = position;

      managerChainForSave.forEach((mgr) => {
        if (!mgr.position) return;
        const mgrCommissionMode = mgr.commissionMode ?? mode;

        const mgrRes = computeItemsForPositionAndMode(
          mgr.position,
          mgrCommissionMode,
          endorsementDraft.calculationAmount
        );
        const baselineRes = childPositionForBaseline
          ? computeItemsForPositionAndMode(
              childPositionForBaseline,
              mgrCommissionMode,
              endorsementDraft.calculationAmount
            )
          : null;

        if (!mgrRes || !baselineRes) {
          childPositionForBaseline = mgr.position;
          return;
        }

        const mgrItems = stripTotalRows(mgrRes.items);
        const baselineItems = stripTotalRows(baselineRes.items);

        const mgrMap = new Map<string, { title: string; amount: number }>();
        mgrItems.forEach((it) => {
          const key = normalizeTitleKey(it.title ?? "");
          const prev = mgrMap.get(key);
          mgrMap.set(key, {
            title: it.title ?? prev?.title ?? key,
            amount: (prev?.amount ?? 0) + (it.amount ?? 0),
          });
        });

        const diffItems: CommissionResultItemDTO[] = [];

        baselineItems.forEach((it) => {
          const key = normalizeTitleKey(it.title ?? "");
          const mgrVal = mgrMap.get(key);
          const mgrAmt = mgrVal?.amount ?? 0;
          const subAmt = it.amount ?? 0;
          const rem = mgrAmt - subAmt;
          if (rem > 0) {
            diffItems.push({ title: mgrVal?.title ?? it.title, amount: rem });
          }
          mgrMap.delete(key);
        });

        mgrMap.forEach((val) => {
          if (val.amount > 0) {
            diffItems.push({ title: val.title, amount: val.amount });
          }
        });

        const diffTotal = totalWithMultipliers(diffItems);

        if (diffItems.length > 0 && diffTotal > 0) {
          diffs.push({
            email: mgr.email ?? null,
            position: mgr.position,
            commissionMode: mgrCommissionMode,
            items: diffItems,
            total: diffTotal,
          });
        }

        childPositionForBaseline = mgr.position;
      });

      overridesForChain = diffs;

      const allowedEmails = (() => {
        const s = new Set<string>();
        const push = (val: string | null | undefined) => {
          const v = (val ?? "").trim().toLowerCase();
          if (v) s.add(v);
        };

        push(email);
        push(mgrEmail);
        managerChainForSave.forEach((mgr) => push(mgr.email));
        overridesForChain.forEach((ov) =>
          push(ov.email as string | null | undefined)
        );

        return Array.from(s);
      })();

      const savedEndorsementRef = await addDoc(entriesRef, {
        productKey: endorsementDraft.productKey,
        entryType: "endorsement" as ContractEntryType,
        rootContractEntryId: endorsementDraft.rootContractEntryId,
        parentContractEntryId: endorsementDraft.sourceEntryId,
        parentContractEntryPath: endorsementDraft.sourceEntryPath,
        createdAt: serverTimestamp(),
        position,
        commissionMode: mode,
        inputAmount: endorsementDraft.calculationAmount,
        calculationInputAmount: endorsementDraft.calculationAmount,
        previousInputAmount: endorsementDraft.previousPremiumAmount,
        newInputAmount: endorsementDraft.newPremiumAmount,
        effectiveInputAmount: endorsementDraft.newPremiumAmount,
        premiumDelta: endorsementDraft.deltaAmount,
        premiumIncreaseAmount:
          endorsementDraft.deltaAmount > 0 ? endorsementDraft.deltaAmount : 0,
        premiumDecreaseAmount:
          endorsementDraft.deltaAmount < 0 ? Math.abs(endorsementDraft.deltaAmount) : 0,
        changeType: endorsementDraft.changeType,
        frequencyRaw: frequency,
        items: endorsementDraft.items,
        total: endorsementDraft.total,
        result: {
          items: endorsementDraft.items,
          total: endorsementDraft.total,
        },
        clientName: clientName || null,
        userId: uid,
        contractSignedDate: signed,
        policyStartDate: start,
        durationYears: shouldShowDuration(endorsementDraft.productKey) ? durationYears : null,
        userEmail: email,
        contractNumber: endorsementDraft.contractNumber,
        paid: false,
        managerEmailSnapshot: mgrEmail ?? null,
        managerPositionSnapshot: mgrPos ?? null,
        managerModeSnapshot: mgrMode ?? null,
        managerChain: managerChainForSave,
        managerOverrides: overridesForChain,
        allowedEmails,
      });
      await syncEntryIndexesBestEffort(email, savedEndorsementRef.id);

      if (typeof window !== "undefined") {
        try {
          sessionStorage.removeItem("contracts_cache_v2");
          localStorage.setItem("contracts_last_updated", String(Date.now()));
          window.dispatchEvent(new Event("contracts:updated"));
        } catch {
          // best effort cache invalidation
        }
      }

      setSaveMessage(
        endorsementDraft.changeType === "increase"
          ? "Dodatek byl uložen mezi sepsané."
          : "Dodatek (ponížení) byl uložen. Provize je zatím 0 Kč."
      );
      setSaveSuccessFlash({
        contractNumber: endorsementDraft.contractNumber,
        clientName: clientName.trim() || null,
      });
      setEndorsementDraft(null);
    } catch (error) {
      console.error("Chyba při ukládání dodatku", error);
      setSaveMessage(
        "Nepodařilo se uložit dodatek. Zkus to prosím za chvíli znovu."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSaveContract = async (skipDuplicateCheck = false) => {
    if (!user) return;

    if (tipsterModeEnabled) {
      setSaveMessage("V režimu TIPAŘSKÉ spolupráce se smlouvy neukládají.");
      return;
    }

    const value = parseNumber(amountText);
    const comfortPayment = parseNumber(comfortPaymentText);
    const comfortTargetAmount = parseNumber(comfortTargetAmountText);
    const missing: string[] = [];
    if (value <= 0) missing.push("částku");
    if (!clientName.trim()) missing.push("jméno klienta");
    if (!contractNumber.trim()) missing.push("číslo smlouvy");
    if (!contractSignedDate.trim()) missing.push("datum sjednání");
    if (!policyStartDate.trim()) missing.push("datum počátku");
    if (product === "comfortcc" && comfortGradual && comfortPayment <= 0) {
      missing.push("pravidelnou platbu");
    }

    if (missing.length > 0 || items.length === 0) {
      const msg =
        items.length === 0 && missing.length === 0
          ? "Doplň částku a produkt, aby šlo uložit."
          : `Doplň: ${missing.join(", ")}.`;
      setSaveMessage(msg);
      setValidationError(msg);
      setMissingFields(missing);
      return;
    }
    if (!validateContractDatesBeforeSave()) return;

    const email = (user.email ?? "").toLowerCase();
    const uid = user.uid ?? null;
    const userRef = doc(db, "users", email);
    const entriesRef = collection(userRef, "entries");

    // kontrola duplicitního čísla smlouvy
    const trimmedContractNumber = contractNumber.trim();
    const trimmedClientName = clientName.trim();
    const signedDateIsoDay = contractSignedDate.trim();
    const trimmedOriginalContractNumber = originalContractNumber.trim();
    const trimmedReplacementContractNumber = replacementContractNumber.trim();
    const shouldRefreshOriginalNeon =
      product === "neon" &&
      refreshOriginalOpen &&
      trimmedOriginalContractNumber.length > 0;
    const shouldReplacementStorno =
      replacementEligible &&
      replacementOpen &&
      trimmedReplacementContractNumber.length > 0;

    if (product === "neon" && refreshOriginalOpen && !trimmedOriginalContractNumber) {
      const msg = "Pro refresh doplň číslo původní smlouvy.";
      setSaveMessage(msg);
      setValidationError(msg);
      return;
    }
    if (replacementEligible && replacementOpen && !trimmedReplacementContractNumber) {
      const msg = "Pro náhradu doplň číslo původní smlouvy.";
      setSaveMessage(msg);
      setValidationError(msg);
      return;
    }

    if (!skipDuplicateCheck) {
      try {
        if (trimmedContractNumber) {
          const dupSnap = await getDocs(
            query(entriesRef, where("contractNumber", "==", trimmedContractNumber))
          );
          if (!dupSnap.empty) {
            const entries = dupSnap.docs.map((d) => ({
              id: d.id,
              path: d.ref.path,
              contractNumber: trimmedContractNumber,
            }));
            setDuplicateModal({
              mode: "overwrite",
              description: `Smlouva s číslem ${trimmedContractNumber} už existuje (${dupSnap.size}×).`,
              contractNumber: trimmedContractNumber,
              count: dupSnap.size,
              entries,
            });
            setSaving(false);
            return;
          }
        }

        const normalizedClientName = normalizeClientNameForDuplicate(trimmedClientName);
        if (product && signedDateIsoDay && normalizedClientName) {
          const productSnap = await getDocs(
            query(entriesRef, where("productKey", "==", product))
          );
          const similarEntries = productSnap.docs.filter((docSnap) => {
            const data = docSnap.data() as any;
            if (normalizeContractEntryType(data?.entryType) !== "contract") return false;
            const clientNameNormalized = normalizeClientNameForDuplicate(data?.clientName);
            if (clientNameNormalized !== normalizedClientName) return false;
            const entrySignedDay = isoDayFromUnknown(data?.contractSignedDate);
            return entrySignedDay === signedDateIsoDay;
          });

          if (similarEntries.length > 0) {
            const entries = similarEntries.map((d) => {
              const data = d.data() as any;
              const existingNumber =
                typeof data?.contractNumber === "string"
                  ? data.contractNumber.trim()
                  : null;
              return {
                id: d.id,
                path: d.ref.path,
                contractNumber: existingNumber || null,
              };
            });
            const displayDate = formatIsoDay(signedDateIsoDay);
            setDuplicateModal({
              mode: "saveAnyway",
              description: `Pro klienta ${trimmedClientName} už existuje produkt ${productLabel(
                product
              )} se stejným datem sjednání ${displayDate} (${similarEntries.length}×).`,
              contractNumber: trimmedContractNumber || null,
              count: similarEntries.length,
              entries,
            });
            setSaving(false);
            return;
          }
        }
      } catch (dupErr) {
        console.error("Kontrola duplicitních smluv selhala", dupErr);
      }
    }

    setSaving(true);
    setSaveMessage(null);
    setValidationError(null);
    setMissingFields([]);

    try {
      const signed =
        contractSignedDate.trim().length > 0
          ? new Date(contractSignedDate)
          : null;
      const signedDateIso = contractSignedDate.trim() || null;
      const start =
        policyStartDate.trim().length > 0 ? new Date(policyStartDate) : null;

      // Snapshot chainu nadřízených k datu sjednání (timeline) – uložíme k záznamu
      let mgrEmail = managerEmailSnapshot;
      let mgrPos = managerPositionSnapshot;
      let mgrMode = managerModeSnapshot;
      let managerChainForSave: ManagerChainSnapshotEntry[] = managerChainSnapshot;
      let overridesForChain: ManagerOverrideSnapshot[] = [];
      try {
        const userSnap = await getDoc(userRef);
        const data = userSnap.data() as any;
        mgrEmail =
          (data?.managerEmail as string | undefined)?.toLowerCase() ??
          mgrEmail ??
          null;
        if (mgrEmail) {
          const resolvedChain = await buildManagerChainSnapshotForSignedDate(
            mgrEmail,
            signedDateIso
          );
          if (resolvedChain.length > 0) {
            managerChainForSave = resolvedChain;
          }
        }
        if (managerChainForSave.length > 0) {
          mgrPos = managerChainForSave[0]?.position ?? mgrPos ?? null;
          mgrMode = managerChainForSave[0]?.commissionMode ?? mgrMode ?? null;
        }
      } catch (snapshotErr) {
        console.error("Failed to snapshot manager info", snapshotErr);
      }

      managerChainForSave = ensureManagerChainWithDirectManager(
        managerChainForSave,
        mgrEmail,
        mgrPos ?? null,
        mgrMode ?? null
      );

      // předpočítej meziprovize pro celý chain (od poradce výš)
      const diffs: ManagerOverrideSnapshot[] = [];
      let childPositionForBaseline: Position | null = position;

      managerChainForSave.forEach((mgr) => {
        if (!mgr.position) return;
        const mgrMode = mgr.commissionMode ?? mode;

        // Výsledek aktuálního manažera v jeho režimu
        const mgrRes = computeItemsForPositionAndMode(mgr.position, mgrMode);
        // Baseline: podřízený (poradce nebo nižší manažer) spočítaný ve stejném režimu, i když má zrychlený
        const baselineRes = childPositionForBaseline
          ? computeItemsForPositionAndMode(childPositionForBaseline, mgrMode)
          : null;

        if (!mgrRes || !baselineRes) {
          childPositionForBaseline = mgr.position;
          return;
        }

        const mgrItems = stripTotalRows(mgrRes.items);
        const baselineItems = stripTotalRows(baselineRes.items);

        const mgrMap = new Map<string, { title: string; amount: number }>();
        mgrItems.forEach((it) => {
          const key = normalizeTitleKey(it.title ?? "");
          const prev = mgrMap.get(key);
          mgrMap.set(key, {
            title: it.title ?? prev?.title ?? key,
            amount: (prev?.amount ?? 0) + (it.amount ?? 0),
          });
        });

        const diffItems: CommissionResultItemDTO[] = [];

        baselineItems.forEach((it) => {
          const key = normalizeTitleKey(it.title ?? "");
          const mgrVal = mgrMap.get(key);
          const mgrAmt = mgrVal?.amount ?? 0;
          const subAmt = it.amount ?? 0;
          const rem = mgrAmt - subAmt;
          if (rem > 0) {
            diffItems.push({ title: mgrVal?.title ?? it.title, amount: rem });
          }
          mgrMap.delete(key);
        });

        mgrMap.forEach((val) => {
          if (val.amount > 0) {
            diffItems.push({ title: val.title, amount: val.amount });
          }
        });

        const diffTotal = totalWithMultipliers(diffItems);

        if (diffItems.length > 0 && diffTotal > 0) {
          diffs.push({
            email: mgr.email ?? null,
            position: mgr.position,
            commissionMode: mgrMode,
            items: diffItems,
            total: diffTotal,
          });
        }

        // podřízený pro další iteraci je aktuální manažer
        childPositionForBaseline = mgr.position;
      });

      overridesForChain = diffs;

      const allowedEmails = (() => {
        const s = new Set<string>();
        const push = (val: string | null | undefined) => {
          const v = (val ?? "").trim().toLowerCase();
          if (v) s.add(v);
        };

        push(email);
        push(mgrEmail);
        managerChainForSave.forEach((mgr) => push(mgr.email));
        overridesForChain.forEach((ov) => push(ov.email as string | null | undefined));

        return Array.from(s);
      })();

      const savedContractRef = await addDoc(entriesRef, {
        productKey: product,
        entryType: "contract" as ContractEntryType,
        createdAt: serverTimestamp(),
        position,
        commissionMode: mode,
        inputAmount: product === "comfortcc" ? value : value,
        effectiveInputAmount: value,
        comfortPayment:
          product === "comfortcc" && comfortPayment > 0 ? comfortPayment : null,
        comfortGradual: product === "comfortcc" ? comfortGradual : null,
        comfortTargetAmount:
          product === "comfortcc" && comfortGradual && comfortTargetAmount > 0
            ? comfortTargetAmount
            : null,
        frequencyRaw: frequency,

        // 🔹 Hlavní data výsledku – stejně jako v mobilní appce
        items,
        total,

        // 🔹 Zároveň necháváme i původní objekt result
        result: {
          items,
          total,
        },

        clientName: clientName || null,
        userId: uid,
        contractSignedDate: signed,
        policyStartDate: start,
        durationYears: shouldShowDuration(product) ? durationYears : null,
        userEmail: email,
        contractNumber: trimmedContractNumber || null,
        paid: false,
        managerEmailSnapshot: mgrEmail ?? null,
        managerPositionSnapshot: mgrPos ?? null,
        managerModeSnapshot: mgrMode ?? null,
        managerChain: managerChainForSave,
        managerOverrides: overridesForChain,
        allowedEmails,
      });
      await syncEntryIndexesBestEffort(email, savedContractRef.id);

      let refreshStornoFailed = false;
      let refreshStornoUpdated = 0;
      if (shouldRefreshOriginalNeon) {
        const stornoDate = start ?? new Date();
        const refreshSignedDate = signed ?? new Date();
        try {
          const token = await user.getIdToken();
          const refreshRes = await fetch("/api/contracts/refresh-neon-storno", {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              originalContractNumber: trimmedOriginalContractNumber,
              newEntryId: savedContractRef.id,
              stornoDateMs: stornoDate.getTime(),
              refreshSignedDateMs: refreshSignedDate.getTime(),
            }),
          });
          const refreshRaw = await refreshRes.text();
          let refreshData:
            | { ok: true; updated?: number }
            | { ok: false; error?: string }
            | null = null;
          if (refreshRaw) {
            try {
              refreshData = JSON.parse(refreshRaw) as
                | { ok: true; updated?: number }
                | { ok: false; error?: string };
            } catch {
              refreshData = null;
            }
          }

          if (!refreshRes.ok) {
            const apiError =
              refreshData && refreshData.ok === false
                ? refreshData.error
                : null;
            throw new Error(
              apiError ||
                `Refresh storno selhalo (HTTP ${refreshRes.status}).`
            );
          }

          if (!refreshData || refreshData.ok !== true) {
            const apiError =
              refreshData && refreshData.ok === false
                ? refreshData.error
                : null;
            throw new Error(apiError || "Refresh storno se nepodařilo uložit.");
          }

          refreshStornoUpdated = Number(refreshData.updated ?? 0);
        } catch (refreshUpdateErr) {
          refreshStornoFailed = true;
          console.warn(
            "Označení původní NEON smlouvy jako stornované selhalo",
            refreshUpdateErr
          );
        }
      }
      let replacementStornoFailed = false;
      let replacementStornoUpdated = 0;
      if (shouldReplacementStorno) {
        const stornoDate = start ?? new Date();
        const replacementSignedDate = signed ?? new Date();
        try {
          const token = await user.getIdToken();
          const replacementRes = await fetch("/api/contracts/replacement-storno", {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              originalContractNumber: trimmedReplacementContractNumber,
              newEntryId: savedContractRef.id,
              stornoDateMs: stornoDate.getTime(),
              replacementSignedDateMs: replacementSignedDate.getTime(),
            }),
          });
          const replacementRaw = await replacementRes.text();
          let replacementData:
            | { ok: true; updated?: number }
            | { ok: false; error?: string }
            | null = null;
          if (replacementRaw) {
            try {
              replacementData = JSON.parse(replacementRaw) as
                | { ok: true; updated?: number }
                | { ok: false; error?: string };
            } catch {
              replacementData = null;
            }
          }

          if (!replacementRes.ok) {
            const apiError =
              replacementData && replacementData.ok === false
                ? replacementData.error
                : null;
            throw new Error(
              apiError ||
                `Náhrada storno selhala (HTTP ${replacementRes.status}).`
            );
          }

          if (!replacementData || replacementData.ok !== true) {
            const apiError =
              replacementData && replacementData.ok === false
                ? replacementData.error
                : null;
            throw new Error(apiError || "Náhradu storna se nepodařilo uložit.");
          }

          replacementStornoUpdated = Number(replacementData.updated ?? 0);
        } catch (replacementErr) {
          replacementStornoFailed = true;
          console.warn("Označení nahrazované smlouvy jako stornované selhalo", replacementErr);
        }
      }

      if (typeof window !== "undefined") {
        try {
          sessionStorage.removeItem("contracts_cache_v2");
          localStorage.setItem("contracts_last_updated", String(Date.now()));
          window.dispatchEvent(new Event("contracts:updated"));
        } catch {
          // best effort cache invalidation
        }
      }

      if (shouldRefreshOriginalNeon) {
        const stornoDateLabel =
          start && Number.isFinite(start.getTime())
            ? start.toLocaleDateString("cs-CZ")
            : policyStartDate.trim();
        if (refreshStornoFailed) {
          setSaveMessage(
            "Smlouva byla uložena, ale původní smlouvu se nepodařilo označit jako stornovanou."
          );
        } else if (refreshStornoUpdated > 0) {
          setSaveMessage(
            `Smlouva byla uložena. Původní smlouva (${trimmedOriginalContractNumber}) byla označena jako stornovaná k ${stornoDateLabel}.`
          );
        } else {
          setSaveMessage(
            `Smlouva byla uložena. Původní smlouva (${trimmedOriginalContractNumber}) nebyla nalezena k označení storna.`
          );
        }
      } else if (shouldReplacementStorno) {
        const stornoDateLabel =
          start && Number.isFinite(start.getTime())
            ? start.toLocaleDateString("cs-CZ")
            : policyStartDate.trim();
        if (replacementStornoFailed) {
          setSaveMessage(
            "Smlouva byla uložena, ale původní smlouvu se nepodařilo označit jako stornovanou."
          );
        } else if (replacementStornoUpdated > 0) {
          setSaveMessage(
            `Smlouva byla uložena. Nahrazovaná smlouva (${trimmedReplacementContractNumber}) byla označena jako stornovaná k ${stornoDateLabel}.`
          );
        } else {
          setSaveMessage(
            `Smlouva byla uložena. Nahrazovaná smlouva (${trimmedReplacementContractNumber}) nebyla nalezena k označení storna.`
          );
        }
      } else {
        setSaveMessage("Smlouva byla uložena mezi sepsané.");
      }
      setSaveSuccessFlash({
        contractNumber: contractNumber.trim() || null,
        clientName: clientName.trim() || null,
      });
      setOriginalContractNumber("");
      setRefreshOriginalOpen(false);
      setReplacementContractNumber("");
      setReplacementOpen(false);
    } catch (error) {
      console.error("Chyba při ukládání smlouvy", error);
      setSaveMessage(
        "Nepodařilo se uložit smlouvu. Zkus to prosím za chvíli znovu."
      );
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!saveSuccessFlash) return;
    const t = window.setTimeout(() => setSaveSuccessFlash(null), 3200);
    return () => window.clearTimeout(t);
  }, [saveSuccessFlash]);

  if (!user) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-black font-mono text-slate-50">
        <div className="fixed inset-0 -z-10 bg-black" />

        <div className="relative flex min-h-screen items-center justify-center px-4">
          <div className="bg-slate-950/90 border border-slate-300 rounded-2xl shadow-[0_24px_80px_rgba(0,0,0,0.9)] backdrop-blur-2xl p-6 w-full max-w-md space-y-4 text-center">
            <p className="text-sm text-slate-200">
              Pro používání kalkulačky se prosím nejdřív přihlas na domovské
              stránce.
            </p>
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-xl bg-white text-slate-900 px-4 py-2 text-sm font-medium hover:bg-slate-100"
            >
              Zpět na přihlášení
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const allowed = allowedFrequencies(product);
  const hasFrequencyPicker = allowed.length > 1;
  const currentProduct = PRODUCT_OPTIONS.find((p) => p.id === product)!;
  const durationHelp = durationTooltip(product);
  const canChooseMode = isLifeProduct && userCommissionMode === "accelerated";

  const computeItemsForPositionAndMode = (
    pos: Position | null,
    customMode?: CommissionMode | null,
    amountOverride?: number | null
  ): { items: CommissionResultItemDTO[]; total: number } | null => {
    if (!pos) return null;
    const val =
      amountOverride == null ? parseNumber(amountText) : toNonNegativeNumber(amountOverride);
    const freq = frequency;
    const years = durationYears;
    const usedMode = (customMode ?? mode) as CommissionMode;

    switch (product) {
      case "neon": {
        const y = Math.min(15, normalizedDurationYears("neon", years));
        return calculateNeon(val, pos, y, usedMode);
      }
      case "flexi":
      {
        const y = normalizedDurationYears("flexi", years);
        return calculateFlexi(val, pos, usedMode, y);
      }
      case "maximaMaxEfekt": {
        const y = normalizedDurationYears("maximaMaxEfekt", years);
        return calculateMaxEfekt(val, y, pos, usedMode);
      }
      case "pillowInjury":
        return calculatePillowInjury(val, pos, usedMode);
      case "domex":
      case "koopmajetekobcan": {
        const dto =
          product === "domex"
            ? calculateDomex(val, freq, pos)
            : calculateKoopMajetekObcan(val, freq, pos);
        const filtered = dto.items.filter((i) =>
          (i.title ?? "").toLowerCase().includes("(z platby)")
        );
        const totals = paymentBasedTotals(filtered, paymentsPerYear(freq));
        return { items: filtered, total: totals.immediate + totals.subsequent };
      }
      case "maxdomov": {
        const dto = calculateMaxdomov(val, freq, pos);
        const filtered = dto.items.filter((i) =>
          (i.title ?? "").toLowerCase().includes("(z platby)")
        );
        const totals = paymentBasedTotals(filtered, paymentsPerYear(freq));
        return { items: filtered, total: totals.immediate + totals.subsequent };
      }
      case "cppAuto":
        return calculateCppAuto(val, freq, pos);
      case "slaviaauto":
        return calculateSlaviaAuto(val, freq, pos);
      case "cppPPRbez": {
        const dto = calculateCppPPRbez(val, freq, pos);
        const filtered = dto.items.filter((i) =>
          (i.title ?? "").toLowerCase().includes("(z platby)")
        );
        const sum = filtered.reduce((s, i) => s + (i.amount ?? 0), 0);
        return { items: filtered, total: sum };
      }
      case "cppPPRs":
        return calculateCppPPRs(val, freq, pos);
      case "allianzAuto":
        return calculateAllianzAuto(val, freq, pos);
      case "csobAuto":
        return calculateCsobAuto(val, freq, pos);
      case "uniqaAuto":
      case "uniqaflotila":
        return calculateUniqaAuto(val, freq, pos);
      case "pillowAuto":
        return calculatePillowAuto(val, freq, pos);
      case "kooperativaAuto":
        return calculateKooperativaAuto(val, freq, pos);
      case "zamex":
        return calculateZamex(val, freq, pos);
      case "cppcestovko":
        return calculateCppCestovko(val, pos);
      case "axacestovko":
        return calculateAxaCestovko(val, pos);
      case "comfortcc":
        return calculateComfortCC({
          fee: val,
          payment: parseNumber(comfortPaymentText),
          targetAmount: comfortGradual ? parseNumber(comfortTargetAmountText) : 0,
          isSavings: comfortGradual,
          isGradualFee: comfortGradual,
          position: pos,
        });
      default:
        return null;
    }
  };

  return (
    <AppLayout active="calc">
      <div className="w-full bg-white px-3 py-6 sm:px-4 sm:py-8 lg:px-8">
      <div className="mx-auto w-full max-w-6xl font-mono text-slate-900">
      {saveSuccessFlash && (
        <div
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 pointer-events-none"
        >
          <div className="relative flex items-center gap-3 rounded-2xl border border-slate-300 bg-white px-4 py-3 shadow-[0_20px_60px_rgba(15,23,42,0.18)]">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-white">
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="h-5 w-5"
              >
                <path
                  fill="currentColor"
                  d="M9.5 15.6 6.4 12.5a1 1 0 0 0-1.4 1.4l3.8 3.8a1 1 0 0 0 1.45-.05l8-9a1 1 0 1 0-1.5-1.3l-7.25 8.2Z"
                />
              </svg>
            </div>
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-slate-900">Sepsáno!</p>
              <p className="text-[11px] text-slate-600">
                {saveSuccessFlash.clientName || "Uloženo mezi sepsané"}
                {saveSuccessFlash.contractNumber
                  ? ` • č. ${saveSuccessFlash.contractNumber}`
                  : ""}
              </p>
            </div>
          </div>
        </div>
      )}
      {validationError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setValidationError(null)}
          />
          <div className="relative w-full max-w-sm rounded-2xl border border-slate-300 bg-white shadow-[0_20px_70px_rgba(0,0,0,0.35)] p-5 space-y-4">
            <div className="text-sm text-slate-900">
              {validationError}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setValidationError(null)}
                className="rounded-full border border-slate-900 bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
      {duplicateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setDuplicateModal(null)}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-slate-300 bg-white shadow-[0_20px_70px_rgba(0,0,0,0.35)] p-5 space-y-4">
            <div className="text-sm text-slate-900 space-y-2">
              <p>{duplicateModal.description}</p>
              <p>
                {duplicateModal.mode === "overwrite"
                  ? "Můžeš ji přepsat, nebo akci zrušit."
                  : "Může jít o duplicitu. Můžeš pokračovat uložením, nebo akci zrušit."}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setDuplicateModal(null)}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-900 hover:bg-slate-100 transition"
              >
                Zrušit
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!user || !duplicateModal) return;
                  const modal = duplicateModal;
                  setDuplicateModal(null);
                  try {
                    if (modal.mode === "overwrite") {
                      const ownerEmail = (user.email ?? "").trim().toLowerCase();
                      if (!ownerEmail) {
                        throw new Error("Chybí přihlášený e-mail uživatele.");
                      }
                      const entriesToDelete = modal.entries
                        .map((entry) => ({
                          ownerEmail,
                          entryId: entry.id,
                        }))
                        .filter((entry) => entry.entryId.trim().length > 0);
                      if (entriesToDelete.length > 0) {
                        const { response, data } = await requestContractsMutationWithAuth({
                          user,
                          path: "/api/contracts/bulk-delete",
                          method: "DELETE",
                          payload: { entries: entriesToDelete },
                        });
                        const apiError = getContractsMutationError({
                          response,
                          data,
                          fallback: "Smazání původních smluv selhalo.",
                        });
                        if (apiError) {
                          throw new Error(apiError);
                        }
                      }
                    }
                    // ulož znovu bez další kontroly duplicit
                    await handleSaveContract(true);
                  } catch (err) {
                    console.error("Přepsání smlouvy selhalo", err);
                    setSaveMessage("Přepsání smlouvy se nepodařilo. Zkus to znovu.");
                    setSaving(false);
                  }
                }}
                className="rounded-full border border-slate-900 bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition"
              >
                {duplicateModal.mode === "overwrite" ? "Přepsat" : "Uložit i tak"}
              </button>
            </div>
          </div>
        </div>
      )}
      {endorsementDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setEndorsementDraft(null)}
          />
          <div className="relative w-full max-w-lg rounded-2xl border border-slate-300 bg-white shadow-[0_20px_70px_rgba(0,0,0,0.35)] p-5 space-y-4">
            <div className="space-y-2 text-sm text-slate-900">
              <p>
                Připravena změna ke smlouvě <strong>{endorsementDraft.contractNumber}</strong>.
              </p>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 space-y-1.5 text-sm">
                <p className="flex items-center justify-between gap-3">
                  <span className="text-slate-600">Původní pojistné</span>
                  <span className="font-semibold text-slate-900">
                    {formatMoney(endorsementDraft.previousPremiumAmount)}
                  </span>
                </p>
                <p className="flex items-center justify-between gap-3">
                  <span className="text-slate-600">Nové pojistné</span>
                  <span className="font-semibold text-slate-900">
                    {formatMoney(endorsementDraft.newPremiumAmount)}
                  </span>
                </p>
                <p className="flex items-center justify-between gap-3">
                  <span className="text-slate-600">
                    {endorsementDraft.changeType === "increase"
                      ? "Navýšení"
                      : endorsementDraft.changeType === "decrease"
                        ? "Ponížení"
                        : "Rozdíl"}
                  </span>
                  <span
                    className={`font-semibold ${
                      endorsementDraft.deltaAmount >= 0
                        ? "text-emerald-700"
                        : "text-rose-700"
                    }`}
                  >
                    {endorsementDraft.deltaAmount >= 0 ? "+" : "−"}
                    {formatMoney(Math.abs(endorsementDraft.deltaAmount))}
                  </span>
                </p>
                <p className="flex items-center justify-between gap-3 border-t border-slate-200 pt-2">
                  <span className="text-slate-600">Provize k dodatku</span>
                  <span className="font-semibold text-slate-900">
                    {formatMoney(endorsementDraft.total)}
                  </span>
                </p>
              </div>
              {endorsementDraft.changeType === "decrease" && (
                <p className="text-xs text-amber-700">
                  Ponížení zatím neřešíme výpočtem. Dodatek se uloží s provizí 0 Kč.
                </p>
              )}
              <p className="text-xs text-slate-500">
                Dodatek bude uložen zvlášť a navázán na původní smlouvu.
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setEndorsementDraft(null)}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-900 hover:bg-slate-100 transition"
              >
                Zrušit
              </button>
              <button
                type="button"
                onClick={handleSaveEndorsement}
                disabled={saving}
                className="rounded-full border border-slate-900 bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Ukládám…" : "Uložit změnu"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* vnější glassy box je pryč – jen čistý container */}
      <div className="w-full max-w-6xl space-y-6">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <SplitTitle
            text={tipsterModeEnabled ? "Kalkulačka - TIPAŘ" : "Kalkulačka provizí"}
            className="!text-slate-900"
          />
        </header>

        <div className="grid gap-6 items-start lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-6 w-full lg:max-w-3xl">
            {/* Produkt + PDF import */}
            <section className={`w-full space-y-3 ${canImportFromPdf ? "md:max-w-xl" : ""}`}>
              <div className="space-y-1">
                <label className="block text-sm font-medium mb-1">
                  <span className="inline-flex items-center gap-1.5">
                    <Package size={14} strokeWidth={2} className="text-slate-600" aria-hidden="true" />
                    <span>Produkt</span>
                  </span>
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setProductOpen((v) => !v)}
                    className="flex w-full items-center justify-between rounded-xl border border-slate-300 bg-white text-slate-900 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
                  >
                    <span className="flex items-center gap-3">
                      <div className="relative h-7 w-7 sm:h-8 sm:w-8 flex-shrink-0">
                        <Image
                          src={productIcon(product)}
                          alt=""
                          fill
                          className="object-contain"
                        />
                      </div>
                      <span className="font-medium">{currentProduct.label}</span>
                    </span>
                    <span className="ml-3 text-xs text-slate-400">
                      {productOpen ? "▲" : "▼"}
                    </span>
                  </button>

                  {productOpen && (
                    <div className="absolute z-30 mt-2 w-full rounded-2xl border border-slate-300 bg-white backdrop-blur-2xl shadow-[0_20px_80px_rgba(0,0,0,0.9)] max-h-80 overflow-y-auto p-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {PRODUCT_OPTIONS.map((p) => {
                        const isActive = p.id === product;
                        const iconSrc = productIcon(p.id);
                        const unsupportedText = SUPPORTED_PRODUCTS.includes(p.id)
                          ? null
                          : "zatím bez výpočtu";

                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setProduct(p.id);
                              setProductOpen(false);
                            }}
                            className={`flex h-full w-full items-center justify-between gap-3 rounded-xl border border-slate-300 px-3 py-2.5 text-left text-sm transition ${
                              isActive
                                ? "bg-slate-900 text-white"
                                : "text-slate-900 hover:bg-slate-100"
                            }`}
                          >
                            <span className="flex items-center gap-3">
                              <div className="relative h-7 w-7 sm:h-8 sm:w-8 flex-shrink-0">
                                <Image
                                  src={iconSrc}
                                  alt=""
                                  fill
                                  className="object-contain"
                                />
                              </div>
                              <span>{p.label}</span>
                            </span>
                            {unsupportedText && (
                              <span className="ml-2 rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800">
                                {unsupportedText}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {canImportFromPdf && (
                <div className="space-y-2">
                  <div className="ui-card ui-card-quiet flex h-full items-center justify-between gap-3 rounded-xl bg-white px-3 py-2.5">
                    <div className="text-sm font-semibold text-slate-900">
                      Nahraj smlouvu PDF pro načtení údajů.
                    </div>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={pdfImporting}
                      className="ui-btn-primary ui-focus inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        className="h-4 w-4"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M14 3v5h5"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M8.5 16h7M8.5 12.5h3.8"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        />
                      </svg>
                      {pdfImporting ? "Načítám…" : "Nahrát PDF"}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      onChange={(e) => handlePdfImport(e.target.files?.[0] ?? null)}
                    />
                  </div>
                  {pdfImportStatus && (
                    <p className="text-[12px] text-slate-700">{pdfImportStatus}</p>
                  )}
                  {pdfImportError && (
                    <p className="text-[12px] text-rose-700">{pdfImportError}</p>
                  )}
                </div>
              )}
            </section>

            {/* Doba trvání + frekvence */}
            <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {shouldShowDuration(product) && (
                <div className="space-y-1">
                  <label className="block text-sm font-medium">
                    <span className="inline-flex items-center gap-2">
                      Doba trvání smlouvy
                      {durationHelp && (
                        <button
                          type="button"
                          onClick={() => setDurationHelpOpen((prev) => !prev)}
                          className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-900 hover:bg-slate-100 transition"
                          aria-expanded={durationHelpOpen}
                          aria-label="Zobrazit nápovědu k době trvání smlouvy"
                        >
                          Info
                        </button>
                      )}
                    </span>
                  </label>
                  {durationHelp && durationHelpOpen && (
                    <p className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-700">
                      {durationHelp}
                    </p>
                  )}
                  <input
                    type="number"
                    className="w-full rounded-xl border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
                    value={durationYears ?? ""}
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      if (!raw) {
                        setDurationYears(null);
                        return;
                      }
                      const parsed = Number(raw);
                      if (!Number.isFinite(parsed)) {
                        setDurationYears(null);
                        return;
                      }
                      const [min, max] = durationRange(product);
                      setDurationYears(Math.min(max, Math.max(min, Math.floor(parsed))));
                    }}
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="block text-sm font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    <SlidersHorizontal size={14} strokeWidth={2} className="text-slate-600" aria-hidden="true" />
                    <span>Parametry platby</span>
                  </span>
                </label>
                {hasFrequencyPicker ? (
                  <select
                    className="w-full rounded-xl border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
                    value={frequency}
                    onChange={(e) =>
                      setFrequency(e.target.value as PaymentFrequency)
                    }
                  >
                    {allowed.map((f) => (
                      <option key={f} value={f}>
                        {titleForFrequency(f)}
                      </option>
                    ))}
                  </select>
                ) : !LIFE_PRODUCTS.includes(product) ? (
                  <p className="text-sm text-slate-700">
                    {defaultFrequencyText(product)}
                  </p>
                ) : null}
              </div>
            </section>

            {/* Comfort Commodity – toggle poplatku */}
            {product === "comfortcc" && (
              <section className="space-y-2">
                <div className="text-sm font-medium">Comfort Commodity</div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <div className="text-[12px] uppercase tracking-wide text-slate-400 mb-1">
                      Poplatek
                    </div>
                    <div className="ui-chip-group">
                      <button
                        type="button"
                        onClick={() => setComfortGradual(false)}
                        className={`ui-chip ui-focus px-3 py-1.5 text-sm ${
                          !comfortGradual
                            ? "ui-chip-active"
                            : ""
                        }`}
                      >
                        Jednorázový poplatek
                      </button>
                      <button
                        type="button"
                        onClick={() => setComfortGradual(true)}
                        className={`ui-chip ui-focus px-3 py-1.5 text-sm ${
                          comfortGradual
                            ? "ui-chip-active"
                            : ""
                        }`}
                      >
                        Postupný poplatek
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Poplatky / částka */}
            <section className="space-y-3">
              <div className="space-y-1">
                <label className="block text-sm font-medium">
                  {product === "comfortcc"
                    ? comfortGradual
                      ? "1% z Poplatku v 1. platbě"
                      : "Poplatek (zde se určuje provize z poplatku klienta)"
                    : "Částka"}
                </label>
                <input
                  type="number"
                  className={`w-full rounded-xl border bg-white text-slate-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 ${
                    missingFields.includes("částku") ? "border-rose-400/70" : "border-slate-300"
                  }`}
                  value={amountText}
                  onChange={(e) => setAmountText(e.target.value)}
                  placeholder={
                    product === "comfortcc"
                      ? "Zadejte poplatek"
                      : placeholderForAmount(product, frequency)
                  }
                />
              </div>

              {product === "comfortcc" && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="block text-sm font-medium">
                      Pravidelná platba
                    </label>
                    <input
                      type="number"
                      className="w-full rounded-xl border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
                      value={comfortPaymentText}
                      onChange={(e) => setComfortPaymentText(e.target.value)}
                      placeholder="Zadejte pravidelnou platbu"
                    />
                  </div>

                  {comfortGradual && (
                    <div className="space-y-1">
                      <label className="block text-sm font-medium">
                        Cílová částka (volitelné)
                      </label>
                      <input
                        type="number"
                        className="w-full rounded-xl border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
                        value={comfortTargetAmountText}
                        onChange={(e) => setComfortTargetAmountText(e.target.value)}
                        placeholder="Např. 200000"
                      />
                      {comfortPayoutCount && (
                        <p className="text-xs text-slate-600">
                          Následná provize z platby bude vyplacena celkem {comfortPayoutCount}x.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {!tipsterModeEnabled && isLifeProduct && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {product === "neon" && (
                      <button
                        type="button"
                        onClick={() => setRefreshOriginalOpen((v) => !v)}
                        className="ui-btn-primary ui-focus inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm"
                      >
                        <RefreshCcw size={14} strokeWidth={2} className="shrink-0" aria-hidden="true" />
                        Refresh smlouvy
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        void handlePrepareEndorsement();
                      }}
                      className="ui-btn-primary ui-focus inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm"
                    >
                      <Repeat2 size={14} strokeWidth={2} className="shrink-0" aria-hidden="true" />
                      Změna
                    </button>
                    {product === "neon" && refreshOriginalOpen && (
                      <input
                        type="text"
                        autoComplete="off"
                        inputMode="numeric"
                        placeholder="Číslo původní smlouvy"
                        value={originalContractNumber}
                        onChange={(e) => setOriginalContractNumber(e.target.value)}
                        className="flex-1 min-w-[220px] rounded-full border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
                      />
                    )}
                  </div>
                  {product === "neon" && refreshOriginalOpen && (
                    <p className="text-[11px] text-slate-600">
                      Při uložení označíme původní smlouvu jako stornovanou k datu počátku nové smlouvy.
                    </p>
                  )}
                  <p className="text-[11px] text-slate-600">
                    Změna vytvoří dodatek k existující ŽP smlouvě. Navýšení se zprovizuje jen z rozdílu, ponížení je zatím 0 Kč.
                  </p>
                </div>
              )}

              {!tipsterModeEnabled && replacementEligible && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setReplacementOpen((v) => !v)}
                      className="ui-btn-primary ui-focus inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm"
                    >
                      <Repeat2 size={14} strokeWidth={2} className="shrink-0" aria-hidden="true" />
                      Náhrada smlouvy
                    </button>
                    {replacementOpen && (
                      <input
                        type="text"
                        autoComplete="off"
                        inputMode="numeric"
                        placeholder="Číslo nahrazované smlouvy"
                        value={replacementContractNumber}
                        onChange={(e) => setReplacementContractNumber(e.target.value)}
                        className="flex-1 min-w-[220px] rounded-full border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
                      />
                    )}
                  </div>
                  {replacementOpen && (
                    <p className="text-[11px] text-slate-600">
                      Při uložení označíme nahrazovanou smlouvu jako stornovanou k datu počátku nové smlouvy.
                    </p>
                  )}
                </div>
              )}
            </section>

            {/* Detaily smlouvy */}
            {!tipsterModeEnabled && (
            <section className="space-y-3">
              <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                <FileText size={14} strokeWidth={2} className="text-slate-600" aria-hidden="true" />
                <span>Detaily smlouvy</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium">
                Jméno a příjmení klienta
              </label>
              <div className="relative">
                <input
                  type="text"
                  className={`w-full rounded-xl border bg-white text-slate-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 ${
                    missingFields.includes("jméno klienta") ? "border-rose-400/70" : "border-slate-300"
                  }`}
                  value={clientName}
                  onChange={(e) => {
                    setClientName(e.target.value);
                    setClientSuggestionsOpen(true);
                  }}
                  placeholder="Např. Jan Novák"
                  autoComplete="off"
                  onFocus={() => setClientSuggestionsOpen(true)}
                  onBlur={() => setTimeout(() => setClientSuggestionsOpen(false), 100)}
                />
                {filteredClientSuggestions.length > 0 && clientSuggestionsOpen && (
                  <div className="absolute z-30 mt-1 w-full rounded-xl border border-slate-300 bg-white backdrop-blur-2xl shadow-[0_14px_40px_rgba(0,0,0,0.7)] overflow-hidden">
                    {filteredClientSuggestions.map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => {
                          setClientName(name);
                          setMissingFields((prev) => prev.filter((k) => k !== "jméno klienta"));
                          setClientSuggestionsOpen(false);
                        }}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-slate-900 hover:bg-slate-100"
                      >
                        <span>{name}</span>
                        <span className="text-xs text-slate-400">vložit</span>
                      </button>
                        ))}
                      </div>
                    )}
                </div>
            </div>

                <div className="space-y-1">
                <label className="block text-sm font-medium">
                  Datum sjednání smlouvy
                </label>
                <input
                  type="date"
                  className={`w-full rounded-xl border bg-white text-slate-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 ${
                    missingFields.includes("datum sjednání") ? "border-rose-400/70" : "border-slate-300"
                  }`}
                  value={contractSignedDate}
                  onChange={(e) => setContractSignedDate(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-medium">
                  Číslo smlouvy
                </label>
                <input
                  type="text"
                  className={`w-full rounded-xl border bg-white text-slate-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 ${
                    missingFields.includes("číslo smlouvy") ? "border-rose-400/70" : "border-slate-300"
                  }`}
                  value={contractNumber}
                  onChange={(e) => setContractNumber(e.target.value)}
                  placeholder=""
                />
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-medium">
                  Datum počátku smlouvy
                </label>
                <input
                  type="date"
                  className={`w-full rounded-xl border bg-white text-slate-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 ${
                    missingFields.includes("datum počátku") ? "border-rose-400/70" : "border-slate-300"
                  }`}
                  value={policyStartDate}
                  onChange={(e) => setPolicyStartDate(e.target.value)}
                />
                {contractDateErrors.length > 0 && (
                  <p className="text-[11px] text-rose-700">
                    {contractDateErrors.map((issue) => issue.message).join(" ")}
                  </p>
                )}
                {contractDateWarnings.length > 0 && contractDateErrors.length === 0 && (
                  <p className="text-[11px] text-amber-700">
                    {contractDateWarnings.map((issue) => issue.message).join(" ")}
                  </p>
                )}
              </div>
            </div>
            </section>
            )}

            {/* Pozice a režim pro tuto smlouvu */}
            {!tipsterModeEnabled && (
              <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-sm font-medium">
                    Sjednána jako (pozice)
                  </label>
                  <select
                    className="w-full rounded-xl border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
                    value={position}
                    onChange={(e) => setPosition(e.target.value as Position)}
                  >
                    {allowedPositionsForUser(baseUserPosition ?? position).map((p) => (
                      <option key={p} value={p}>
                        {positionLabel(p)}
                      </option>
                    ))}
                  </select>
                  {contractSignedDate.trim() && positionTimeline.length > 0 && (
                    <p
                      className={`text-[11px] ${
                        timelineMatchedPosition?.unavailable
                          ? "text-amber-700"
                          : "text-slate-500"
                      }`}
                    >
                      {timelineMatchedPosition
                        ? timelineMatchedPosition.unavailable
                          ? `Timeline pro ${formatIsoDay(
                              contractSignedDate.trim()
                            )} ukazuje pozici ${positionLabel(
                              timelineMatchedPosition.position
                            )}, ale není v povoleném rozsahu tvé aktuální role.`
                          : `Pozice byla předvyplněná z timeline: ${positionLabel(
                              timelineMatchedPosition.position
                            )} (${formatIsoDay(timelineMatchedPosition.validFrom)} - ${
                              timelineMatchedPosition.validTo
                                ? formatIsoDay(timelineMatchedPosition.validTo)
                                : "otevřeno"
                            }).`
                        : "Pro zadané datum sjednání nemáš v timeline nastavenou pozici."}
                    </p>
                  )}
                </div>

                {canChooseMode && (
                  <div className="space-y-1">
                    <label className="block text-sm font-medium">
                      Režim provize
                    </label>
                    <select
                      className="w-full rounded-xl border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
                      value={mode}
                      onChange={(e) => setMode(e.target.value as CommissionMode)}
                    >
                      <option value="accelerated">Zrychlený</option>
                      <option value="standard">Běžný</option>
                    </select>
                    <p className="text-[11px] text-slate-400">
                      Předvyplněno tvým režimem, ale můžeš přepnout pro tuto konkrétní smlouvu.
                    </p>
                  </div>
                )}
              </section>
            )}
          </div>

          {/* Výsledky + tlačítko Sepsáno */}
          <section className="ui-card rounded-3xl bg-white px-5 py-4 space-y-3 h-full overflow-hidden">
            <div className="flex items-center justify-between gap-3">
              <h2 className="inline-flex items-center gap-1.5 text-lg font-semibold text-slate-900">
                <BarChart3 size={18} strokeWidth={2} className="text-slate-700" aria-hidden="true" />
                <span>Výsledky</span>
              </h2>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowCoefModal(true)}
                  disabled={unsupported}
                  className={`ui-btn-primary ui-focus inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs sm:text-sm ${
                    unsupported ? "opacity-60 cursor-not-allowed" : ""
                  }`}
                >
                  <Sigma size={14} strokeWidth={2} className="shrink-0" aria-hidden="true" />
                  Zobrazit koeficienty
                </button>

                {tipsterModeEnabled && (
                  <button
                    type="button"
                    onClick={() => setTipsterPercentPanelOpen((prev) => !prev)}
                    className="ui-btn-primary ui-focus inline-flex items-center rounded-xl px-3 py-2 text-sm"
                    aria-pressed={tipsterPercentPanelOpen}
                    aria-label="Nastavit procenta pro tipaře"
                  >
                    %
                  </button>
                )}

                {!tipsterModeEnabled && (
                  <button
                    type="button"
                    onClick={() => handleSaveContract()}
                    disabled={
                      saving || items.length === 0 || parseNumber(amountText) <= 0
                    }
                    className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-700 bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <CheckCircle2 size={16} strokeWidth={2} className="shrink-0" aria-hidden="true" />
                    {saving ? "Ukládám…" : "Sepsáno"}
                  </button>
                )}
              </div>
            </div>

            {tipsterModeEnabled && tipsterPercentPanelOpen && (
              <div className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <label className="block text-xs uppercase tracking-wide text-slate-600">
                    Zobrazované procento provize
                  </label>
                  <span className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-sm font-bold text-slate-900">
                    {tipsterPercent} %
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void persistTipsterPercent(tipsterPercent - 5)}
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-900 hover:bg-slate-100 transition"
                    aria-label="Snížit o 5 procentních bodů"
                  >
                    −5
                  </button>

                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={tipsterPercent}
                    onChange={(e) =>
                      setTipsterPercentDraft(Number(e.target.value) || 0)
                    }
                    onPointerUp={(e) =>
                      void persistTipsterPercent(Number(e.currentTarget.value) || 0)
                    }
                    onKeyUp={(e) => {
                      if (e.key.startsWith("Arrow") || e.key === "Home" || e.key === "End") {
                        void persistTipsterPercent(Number((e.currentTarget as HTMLInputElement).value) || 0);
                      }
                    }}
                    className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-slate-900"
                    aria-label="Nastavit procento tipařské provize"
                  />

                  <button
                    type="button"
                    onClick={() => void persistTipsterPercent(tipsterPercent + 5)}
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-900 hover:bg-slate-100 transition"
                    aria-label="Zvýšit o 5 procentních bodů"
                  >
                    +5
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {TIPSTER_PERCENT_PRESETS.map((preset) => {
                    const active = preset === tipsterPercent;
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => void persistTipsterPercent(preset)}
                        className={`ui-chip ui-focus rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                          active
                            ? "ui-chip-active"
                            : "border-slate-300 bg-white text-slate-900 hover:bg-slate-100"
                        }`}
                      >
                        {preset} %
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] text-slate-600">Rozsah 0–100 %</p>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={tipsterPercent}
                    onChange={(e) =>
                      setTipsterPercentDraft(Number(e.target.value) || 0)
                    }
                    onBlur={() => void persistTipsterPercent(tipsterPercent)}
                    className="w-20 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
                  />
                </div>
              </div>
            )}

            {saveMessage && (
              <p className="text-xs text-slate-600">{saveMessage}</p>
            )}

            {unsupported && (
              <p className="text-sm text-amber-800 bg-amber-100 border border-amber-300 rounded-xl px-3 py-2">
                {SUPPORTED_LABEL}
              </p>
            )}

            {!unsupported && items.length === 0 && (
              <p className="text-sm text-slate-600">
                Zadej částku a produkt, hned vypočítáme jednotlivé provize.
              </p>
            )}

            {items.length > 0 && !unsupported && (() => {
              if (tipsterModeEnabled) {
                return (
                  <div className="space-y-2">
                    <div className="flex items-baseline justify-between gap-3 border-b border-slate-200 py-1.5">
                      <span className="flex items-center gap-3 text-sm text-slate-900">
                        <span className="relative h-5 w-5 sm:h-6 sm:w-6 flex-shrink-0">
                          <Image
                            src="/icons/penize2.png"
                            alt=""
                            fill
                            className="object-contain"
                          />
                        </span>
                        <span>Okamžitá provize ({tipsterPercent} %)</span>
                      </span>
                      <span className="text-lg sm:text-2xl font-semibold text-slate-900">
                        {formatMoneyResult(tipsterImmediateCommission)}
                      </span>
                    </div>

                    <div className="pt-2 flex items-center justify-between">
                      <span className="font-semibold text-slate-900">Celkem</span>
                      <span className="text-2xl sm:text-3xl font-bold text-slate-900">
                        {formatMoneyResult(tipsterImmediateCommission)}
                      </span>
                    </div>
                  </div>
                );
              }

              const displayItems = items.filter((item) => {
                const t = cleanResultTitle(item.title).toLowerCase();
                return !(
                  t === "celkem" ||
                  t.startsWith("celková provize")
                );
              });

              return (
                <div className="space-y-2">
                  {displayItems.map((item, idx) => {
                    const iconSrc = resultIconForTitle(item.title);
                    const title = cleanResultTitle(item.title);

                    return (
                      <div
                        key={idx}
                        className="flex items-baseline justify-between gap-3 border-b last:border-b-0 border-slate-200 py-1.5"
                      >
                        <span className="flex items-center gap-3 text-sm text-slate-900">
                          {iconSrc && (
                            <div className="relative h-5 w-5 sm:h-6 sm:w-6 flex-shrink-0">
                              <Image
                                src={iconSrc}
                                alt=""
                                fill
                                className="object-contain"
                              />
                            </div>
                          )}
                          <span>{title}</span>
                        </span>
                        <span className="text-lg sm:text-2xl font-semibold text-slate-900">
                          {formatMoneyResult(item.amount)}
                        </span>
                      </div>
                    );
                  })}

                  <div className="pt-2 flex items-center justify-between">
                    {(product === "domex" ||
                      product === "koopmajetekobcan" ||
                      product === "maxdomov") &&
                    paymentBasedTotalsMemo ? (
                      <div className="w-full space-y-1 text-slate-900">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">Celkem v 1. roce</span>
                          <span className="text-2xl sm:text-3xl font-bold text-slate-900">
                            {formatMoneyResult(paymentBasedTotalsMemo.immediate)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">Celkem ročně následně</span>
                          <span className="text-2xl sm:text-3xl font-bold text-slate-900">
                            {formatMoneyResult(paymentBasedTotalsMemo.subsequent)}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <>
                        <span className="font-semibold text-slate-900">Celkem</span>
                        <span className="text-2xl sm:text-3xl font-bold text-slate-900">
                          {formatMoneyResult(total)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              );
            })()}
          </section>
        </div>
      </div>

      {showCoefModal && (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto px-4 py-6">
          <button
            type="button"
            className="absolute inset-0 h-full w-full bg-black/70 backdrop-blur-sm"
            aria-label="Zavřít koeficienty"
            onClick={() => setShowCoefModal(false)}
          />
          <div
            className={`relative z-50 w-full max-h-[calc(100vh-3rem)] overflow-y-auto rounded-2xl border border-slate-300 bg-white p-6 shadow-2xl shadow-black/30 ${
              showAutoTermsPreview ? "max-w-5xl" : "max-w-md"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Koeficienty</h3>
                <p className="mt-1 text-sm text-slate-600">
                  {product ? productLabel(product) : "—"} · pozice {positionLabel(position)} · režim {mode}
                </p>
                {coefExplanation && (
                  <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                    {coefExplanation}
                  </p>
                )}
                {product && (product === "neon" || product === "flexi" || product === "maximaMaxEfekt" || product === "pillowInjury") && (
                  <p className="mt-2 text-xs font-semibold text-rose-700">
                    UPOZORNĚNÍ: Výpočet okamžité provize počítá s tím, že je zpracována karta klienta dle podmínek!
                  </p>
                )}
                {product === "neon" && (
                  <p className="mt-1 text-xs font-semibold text-rose-700">
                    Aktuální koeficienty – platnost od 01.07.2024
                  </p>
                )}
                {product && isAutoProduct(product) && (
                  <p className="mt-1 text-xs font-semibold text-rose-700">
                    Provizní podmínky aktuální od 01.04.2026
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowCoefModal(false)}
                className="rounded-full px-2 text-slate-500 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                aria-label="Zavřít"
              >
                ×
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {coefList.length > 0 ? (
                coefList.map((c, idx) => (
                  <div
                    key={`${c.label}-${idx}`}
                    className="flex items-center justify-between rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                  >
                    <span className="text-slate-600">{c.label}</span>
                    <span className="font-semibold">{formatCoefficientNumber(c.value)}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-600">
                  Pro tento produkt nebo pozici nemám koeficienty k zobrazení.
                </p>
              )}
            </div>

            {showAutoTermsPreview && autoTermsPreviewUrl && (
              <div className="mt-4 rounded-xl border border-slate-300 bg-slate-50 p-2 sm:p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                    Provizní podmínky {product ? productLabel(product) : "Auto"} (náhled)
                  </p>
                  <a
                    href={autoTermsPreviewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-slate-700 underline underline-offset-2 hover:text-slate-900"
                  >
                    Otevřít v nové kartě
                  </a>
                </div>
                <div className="h-[62vh] min-h-[460px] overflow-auto rounded-lg border border-slate-300 bg-slate-100 p-2">
                  <Image
                    src={autoTermsPreviewUrl}
                    alt={`Provizní podmínky ${product ? productLabel(product) : "Auto"}`}
                    width={1600}
                    height={2400}
                    className="mx-auto h-auto w-full rounded-md"
                    sizes="(max-width: 1024px) 100vw, 1200px"
                    priority
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      </div>
      </div>
    </AppLayout>
  );
}
