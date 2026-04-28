// src/app/kalkulacka/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  BarChart3,
  CheckCircle2,
  Download,
  FileText,
  Package,
  RefreshCcw,
  Repeat2,
  Search,
  Sigma,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { auth, db } from "../firebase";
import { onAuthStateChanged, type User } from "firebase/auth";

import {
  type Product,
  type Position,
  type PaymentFrequency,
  type CommissionMode,
  type CommissionResultItemDTO,
  type MaxCizinKomplexVariant,
} from "../types/domain";

import {
  calculateNeon,
  calculateFlexi,
  calculateMaxEfekt,
  calculateMaxCizinKomplex,
  calculatePillowInjury,
  calculateDomex,
  calculateCppHafan,
  calculatePillowMajetek,
  calculateKoopMajetekObcan,
  calculateMaxdomov,
  calculateCppAuto,
  calculateSlaviaAuto,
  calculateCppPPRbez,
  calculateCppPPRs,
  calculateCppSimplex,
  calculateAllianzAuto,
  calculateAllianzMujDomov,
  calculateCsobAuto,
  calculateUniqaAuto,
  calculatePillowAuto,
  calculateKooperativaAuto,
  calculateZamex,
  calculateCppCestovko,
  calculateAxaCestovko,
  calculateKoopCestovko,
  calculateComfortCC,
  SUPPORTED_PRODUCTS,
  getCoefficientSummary,
  isNeonHistoricalPeriod,
} from "../lib/productFormulas";
import { parseCppAutoPdf } from "../lib/parseCppAutoPdf";
import { parseSlaviaAutoPdf } from "../lib/parseSlaviaAutoPdf";
import { parseNeonPdf } from "../lib/parseNeonPdf";
import { parseFlexiPdf } from "../lib/parseFlexiPdf";
import { parseDomexPdf } from "../lib/parseDomexPdf";
import { parseComfortPdf } from "../lib/parseComfortPdf";
import { parseMaxCizinKomplexPdf } from "../lib/parseMaxCizinKomplexPdf";
import { parseKooperativaAutoPdf } from "../lib/parseKooperativaAutoPdf";
import { parseAllianzAutoPdf } from "../lib/parseAllianzAutoPdf";
import { parsePillowAutoPdf } from "../lib/parsePillowAutoPdf";
import { parseCsobAutoPdf } from "../lib/parseCsobAutoPdf";
import { parseCppCestovkoPdf } from "../lib/parseCppCestovkoPdf";
import { detectProductFromPdf } from "../lib/detectProductFromPdf";
import {
  LIFE_PRODUCTS as LIFE_PRODUCTS_LIST,
  PRODUCT_OPTIONS,
  isAutoProduct as isAutoProductFromCatalog,
  productInstitutionId as productInstitutionIdFromCatalog,
  productInstitutionLabel as productInstitutionLabelFromCatalog,
  productInstitutionLogo as productInstitutionLogoFromCatalog,
  productLabel as productLabelFromCatalog,
} from "@/app/lib/productCatalog";
import {
  institutionLogoFrameClass,
  institutionLogoImageClass,
} from "@/app/lib/institutionLogoDisplay";
import {
  collection,
  doc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { AppLayout } from "@/components/AppLayout";
import { formatMoney, positionLabel, toDate } from "@/app/lib/formatters";
import SplitTitle from "../pomucky/plan-produkce/SplitTitle";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";

// ---------- Pomocné ----------

const LIFE_PRODUCTS = LIFE_PRODUCTS_LIST;
const SETTINGS_KEYS = {
  position: "settings.position",
  mode: "settings.mode",
  tipsterMode: "settings.tipsterMode",
  tipsterPercent: "settings.tipsterPercent",
};
const TIPSTER_PERCENT_PRESETS = [10, 20, 30, 40, 50, 75, 100];
const TIP_CONTRACT_PERCENT_OPTIONS = Array.from({ length: 19 }, (_, idx) => (idx + 1) * 5);
const EMAIL_LOOKUP_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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
const MAX_CIZIN_KOMPLEX_VARIANT_OPTIONS: {
  id: MaxCizinKomplexVariant;
  label: string;
}[] = [
  { id: "exclusiveStandard", label: "EXCLUSIVE / STANDARD" },
  { id: "premium", label: "PREMIUM" },
];

type NeonCoefficientView = "current" | "historical";

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

type ProductPickerSectionKey =
  | "life"
  | "property"
  | "auto"
  | "entrepreneurs"
  | "travel"
  | "foreigners"
  | "investments"
  | "gold";

type ProductPickerColumn = {
  key: ProductPickerSectionKey;
  title: string;
  products: Product[];
  emptyText?: string;
};

const PRODUCT_PICKER_COLUMNS: ProductPickerColumn[] = [
  {
    key: "life",
    title: "Život",
    products: ["neon", "flexi", "maximaMaxEfekt", "pillowInjury"],
  },
  {
    key: "property",
    title: "Majetek",
    products: [
      "domex",
      "cpphafan",
      "pillowmajetek",
      "koopmajetekobcan",
      "maxdomov",
      "allianzmujdomov",
    ],
  },
  {
    key: "auto",
    title: "Auto",
    products: [
      "cppAuto",
      "slaviaauto",
      "allianzAuto",
      "csobAuto",
      "uniqaAuto",
      "uniqaflotila",
      "pillowAuto",
      "kooperativaAuto",
    ],
  },
  {
    key: "entrepreneurs",
    title: "Podnikatele",
    products: ["zamex", "cppPPRbez", "cppPPRs", "cppsimplex"],
  },
  {
    key: "travel",
    title: "Cestovko",
    products: ["cppcestovko", "axacestovko", "koopcestovko"],
  },
  {
    key: "foreigners",
    title: "Cizinci",
    products: ["maxcizinkomplex"],
  },
  {
    key: "investments",
    title: "Investice",
    products: [],
    emptyText: "Zatím bez produktů.",
  },
  {
    key: "gold",
    title: "Zlato",
    products: ["comfortcc"],
  },
];

const PRODUCT_PICKER_COLUMN_BY_KEY = new Map<ProductPickerSectionKey, ProductPickerColumn>(
  PRODUCT_PICKER_COLUMNS.map((column) => [column.key, column] as const)
);

function productPickerSectionForProduct(product: Product): ProductPickerSectionKey {
  for (const column of PRODUCT_PICKER_COLUMNS) {
    if (column.products.includes(product)) return column.key;
  }
  return "life";
}

function normalizeProductPickerSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const PRODUCT_OPTION_BY_ID = new Map<Product, { id: Product; label: string }>(
  PRODUCT_OPTIONS.map((option) => [option.id, option] as const)
);

type ContractsApiResponse = {
  ok?: boolean;
  error?: string;
  contracts?: { clientName?: string | null }[];
};

type ContractsFindApiResponse = {
  ok?: boolean;
  error?: string;
  contracts?: Array<{
    id?: string;
    contractNumber?: string | null;
  }>;
};

type ContractsMutationResponse = {
  ok?: boolean;
  error?: string;
  [key: string]: unknown;
};

type TipsterLookupApiResponse = {
  ok?: boolean;
  exists?: boolean;
  email?: string | null;
  name?: string | null;
  error?: string;
};

type TipsterLookupState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "found"; email: string; name: string | null }
  | { status: "notFound" }
  | { status: "error"; message: string };

type TipContractConfig = {
  tipsterEmail: string | null;
  tipsterName: string | null;
  tipsterPercent: number;
};

type ContractNumberLiveCheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "ok" }
  | { status: "duplicate"; count: number }
  | { status: "error" };

type ManagerSnapshotApiChainEntry = {
  email?: string | null;
  position?: Position | null;
  commissionMode?: CommissionMode | null;
};

type ManagerSnapshotApiResponse = {
  ok?: boolean;
  error?: string;
  ownerEmail?: string | null;
  managerEmail?: string | null;
  managerPosition?: Position | null;
  managerMode?: CommissionMode | null;
  managerChain?: ManagerSnapshotApiChainEntry[];
};

async function requestContractsMutationWithAuth({
  user,
  path,
  method,
  payload,
}: {
  user: User;
  path: string;
  method: "POST" | "PATCH" | "DELETE";
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

async function requestBlobWithAuth({
  user,
  path,
}: {
  user: User;
  path: string;
}): Promise<Response> {
  let token = await user.getIdToken();
  const request = async (idToken: string) =>
    fetch(path, {
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
      cache: "no-store",
    });

  let response = await request(token);
  if (response.status === 401) {
    token = await user.getIdToken(true);
    response = await request(token);
  }

  return response;
}

function normalizeManagerChainFromApi(
  rawChain: ManagerSnapshotApiChainEntry[] | null | undefined
): ManagerChainSnapshotEntry[] {
  if (!Array.isArray(rawChain)) return [];
  return rawChain.map((row) => {
    const email =
      typeof row?.email === "string" && row.email.trim().length > 0
        ? row.email.trim().toLowerCase()
        : null;
    const position = POSITION_ORDER.includes(row?.position as Position)
      ? (row?.position as Position)
      : null;
    const commissionMode =
      row?.commissionMode === "accelerated" || row?.commissionMode === "standard"
        ? row.commissionMode
        : null;

    return {
      email,
      position,
      commissionMode,
    };
  });
}

async function requestManagerSnapshotWithAuth({
  user,
  signedDateIso,
}: {
  user: User;
  signedDateIso: string | null;
}): Promise<{
  managerEmail: string | null;
  managerPosition: Position | null;
  managerMode: CommissionMode | null;
  managerChain: ManagerChainSnapshotEntry[];
}> {
  let token = await user.getIdToken();
  const requestBody = JSON.stringify({ signedDateIso: signedDateIso ?? null });

  const request = async (idToken: string) =>
    fetch("/api/manager-snapshot", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      cache: "no-store",
      body: requestBody,
    });

  let response = await request(token);
  if (response.status === 401) {
    token = await user.getIdToken(true);
    response = await request(token);
  }

  const payload = (await response.json().catch(() => null)) as ManagerSnapshotApiResponse | null;
  const apiError =
    payload?.ok === false && typeof payload.error === "string" ? payload.error.trim() : "";
  if (!response.ok || payload?.ok === false) {
    throw new Error(
      apiError || `Nepodařilo se načíst manager snapshot (HTTP ${response.status}).`
    );
  }

  const managerEmail =
    typeof payload?.managerEmail === "string" && payload.managerEmail.trim().length > 0
      ? payload.managerEmail.trim().toLowerCase()
      : null;
  const managerPosition = POSITION_ORDER.includes(payload?.managerPosition as Position)
    ? (payload?.managerPosition as Position)
    : null;
  const managerMode =
    payload?.managerMode === "accelerated" || payload?.managerMode === "standard"
      ? payload.managerMode
      : null;

  const managerChain = normalizeManagerChainFromApi(payload?.managerChain);

  return {
    managerEmail,
    managerPosition,
    managerMode,
    managerChain,
  };
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

function hasResolvedTopManagerPosition(
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

function formatIsoDay(value: string | null): string {
  if (!value || !isIsoDay(value)) return "—";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("cs-CZ");
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

function productInstitutionLogo(product: Product): string {
  return productInstitutionLogoFromCatalog(product) ?? "/icons/produkt.png";
}

function productInstitutionLabel(product: Product): string {
  return productInstitutionLabelFromCatalog(product, "Pojišťovna") ?? "Pojišťovna";
}

function productLogoFrameClass(product: Product): string {
  return institutionLogoFrameClass(productInstitutionIdFromCatalog(product), "card");
}

function productLogoScaleClass(product: Product): string {
  return institutionLogoImageClass(productInstitutionIdFromCatalog(product));
}

function isAutoProduct(product: Product | null): product is Product {
  return Boolean(product) && isAutoProductFromCatalog(product);
}

function shouldShowDuration(product: Product): boolean {
  return product === "neon" || product === "flexi" || product === "maximaMaxEfekt";
}

function shouldShowDurationMonths(product: Product): boolean {
  return product === "maxcizinkomplex";
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

function durationMonthsRange(product: Product): [number, number] {
  switch (product) {
    case "maxcizinkomplex":
      return [1, 240];
    default:
      return [1, 1];
  }
}

function durationMonthsFallback(product: Product): number {
  switch (product) {
    case "maxcizinkomplex":
      return 12;
    default:
      return 1;
  }
}

function normalizedDurationMonths(
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

function allowedFrequencies(product: Product): PaymentFrequency[] {
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
      return ["monthly", "quarterly", "semiannual", "annual"];
    case "pillowAuto":
    case "maxdomov":
    case "allianzmujdomov":
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
    case "koopcestovko":
    case "maxcizinkomplex":
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
    case "koopcestovko":
    case "maxcizinkomplex":
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

function durationTooltip(
  product: Product,
  neonHistoricalBySignedDate: boolean
): string | null {
  if (product === "neon") {
    if (neonHistoricalBySignedDate) {
      return "U NEON smluv sjednaných od 01.10.2019 do 30.06.2024 se pro výpočet provize používá maximálně 20 let. V tomto období se nepoužívá režim zrychlený/běžný.";
    }
    return "U NEON se od 01.07.2024 pro výpočet provize používá maximálně 15 let (pokud je doba kratší, použije se skutečná hodnota). Pro starší období 01.10.2019–30.06.2024 je limit 20 let.";
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

function clampTipContractPercent(value: number): number {
  if (!Number.isFinite(value)) return 50;
  const rounded = Math.round(value / 5) * 5;
  return Math.min(95, Math.max(5, rounded));
}

function roundToCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
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

function normalizeResultTitleForCompare(title: string): string {
  return cleanResultTitle(title)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
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
  const t = normalizeResultTitleForCompare(title);
  return t.includes("okamzita provize") || t.includes("ziskatelska provize");
}

function isImmediateAnnualFirstYearTitle(title: string): boolean {
  const t = normalizeResultTitleForCompare(title);
  if (!t.includes("za rok")) return false;
  if (t.includes("nasledna")) return false;
  return true;
}

function computeImmediateCommissionFirstYearTotal(items: CommissionResultItemDTO[]): number {
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

function normalizeClientNameForSystemMatch(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
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
  const [productPickerSection, setProductPickerSection] = useState<ProductPickerSectionKey>(() =>
    productPickerSectionForProduct("neon")
  );
  const [productSearchText, setProductSearchText] = useState("");
  const [position, setPosition] = useState<Position>("manazer7");
  const [mode, setMode] = useState<CommissionMode>("accelerated");
  const [frequency, setFrequency] = useState<PaymentFrequency>("monthly");
  const [durationYears, setDurationYears] = useState<number | null>(null);
  const [durationMonths, setDurationMonths] = useState<number | null>(null);
  const [maxCizinKomplexVariant, setMaxCizinKomplexVariant] =
    useState<MaxCizinKomplexVariant>("exclusiveStandard");
  const [amountText, setAmountText] = useState<string>("");
  const [tipsterModeEnabled, setTipsterModeEnabled] = useState(false);
  const [tipsterPercent, setTipsterPercent] = useState(100);
  const [tipsterPercentPanelOpen, setTipsterPercentPanelOpen] = useState(false);
  const [tipContractModalOpen, setTipContractModalOpen] = useState(false);
  const [tipContractDraftEmail, setTipContractDraftEmail] = useState("");
  const [tipContractDraftPercent, setTipContractDraftPercent] = useState(50);
  const [tipContractLookupState, setTipContractLookupState] = useState<TipsterLookupState>({
    status: "idle",
  });
  const [tipContractConfig, setTipContractConfig] = useState<TipContractConfig | null>(null);
  const [comfortGradual, setComfortGradual] = useState<boolean>(false);
  const [comfortPaymentText, setComfortPaymentText] = useState<string>("");
  const [comfortTargetAmountText, setComfortTargetAmountText] = useState<string>("");

  const [clientName, setClientName] = useState<string>("");
  const [clientSuggestions, setClientSuggestions] = useState<string[]>([]);
  const [clientSuggestionsOpen, setClientSuggestionsOpen] = useState(false);
  const [contractSignedDate, setContractSignedDate] = useState<string>("");
  const [policyStartDate, setPolicyStartDate] = useState<string>("");
  const [policyEndDate, setPolicyEndDate] = useState<string>("");
  const [contractNumber, setContractNumber] = useState<string>("");
  const [autoCarMake, setAutoCarMake] = useState<string>("");
  const [autoCarPlate, setAutoCarPlate] = useState<string>("");
  const [autoCarVin, setAutoCarVin] = useState<string>("");
  const [autoCarTp, setAutoCarTp] = useState<string>("");
  const [autoCarOrv, setAutoCarOrv] = useState<string>("");
  const [autoCarAnnualMileage, setAutoCarAnnualMileage] = useState<string>("");
  const [autoCarAllianzScope, setAutoCarAllianzScope] = useState<string>("");
  const [autoCarLiabilityLimit, setAutoCarLiabilityLimit] = useState<number | null>(null);
  const [autoCarHullSumInsured, setAutoCarHullSumInsured] = useState<number | null>(null);
  const [autoCarHullSumInsuredText, setAutoCarHullSumInsuredText] = useState<string>("");
  const [autoCarHullDeductible, setAutoCarHullDeductible] = useState<number | null>(null);
  const [autoCarHullDeductibleText, setAutoCarHullDeductibleText] = useState<string>("");
  const [autoCarHullRiskAccident, setAutoCarHullRiskAccident] = useState(false);
  const [autoCarHullRiskTheft, setAutoCarHullRiskTheft] = useState(false);
  const [autoCarHullRiskNatural, setAutoCarHullRiskNatural] = useState(false);
  const [autoCarHullRiskVandalism, setAutoCarHullRiskVandalism] = useState(false);
  const [autoCarHullRiskAnimalCollision, setAutoCarHullRiskAnimalCollision] = useState(false);
  const [autoCarAssistancePlan, setAutoCarAssistancePlan] = useState<string>("");
  const [autoCarAddonEso, setAutoCarAddonEso] = useState(false);
  const [autoCarAddonGlass, setAutoCarAddonGlass] = useState(false);
  const [autoCarAddonAnimalCollision, setAutoCarAddonAnimalCollision] = useState(false);
  const [autoCarAddonAnimalDamage, setAutoCarAddonAnimalDamage] = useState(false);
  const [autoCarAddonVandalism, setAutoCarAddonVandalism] = useState(false);
  const [autoCarAddonTheft, setAutoCarAddonTheft] = useState(false);
  const [autoCarAddonNatural, setAutoCarAddonNatural] = useState(false);
  const [autoCarAddonGap, setAutoCarAddonGap] = useState(false);
  const [autoCarAddonFireExplosion, setAutoCarAddonFireExplosion] = useState(false);
  const [autoCarAddonLegalAdvice, setAutoCarAddonLegalAdvice] = useState(false);
  const [autoCarAddonReplacementCar, setAutoCarAddonReplacementCar] = useState(false);
  const [autoCarAddonLuggage, setAutoCarAddonLuggage] = useState(false);
  const [autoCarAddonTransportedGoods, setAutoCarAddonTransportedGoods] = useState(false);
  const [autoCarAddonPothole, setAutoCarAddonPothole] = useState(false);
  const [autoCarAddonNonFaultAccident, setAutoCarAddonNonFaultAccident] = useState(false);
  const [autoCarAddonKeyLossTheft, setAutoCarAddonKeyLossTheft] = useState(false);
  const [domexAddress, setDomexAddress] = useState<string>("");
  const [domexPropertyType, setDomexPropertyType] = useState<string>("");
  const [domexPropertyCoverage, setDomexPropertyCoverage] = useState<string>("");
  const [domexPropertySumInsured, setDomexPropertySumInsured] = useState<number | null>(null);
  const [domexPropertyDeductible, setDomexPropertyDeductible] = useState<number | null>(null);
  const [domexHouseholdType, setDomexHouseholdType] = useState<string>("");
  const [domexHouseholdCoverage, setDomexHouseholdCoverage] = useState<string>("");
  const [domexHouseholdSumInsured, setDomexHouseholdSumInsured] = useState<number | null>(null);
  const [domexHouseholdDeductible, setDomexHouseholdDeductible] = useState<number | null>(null);
  const [domexLiabilitySumInsured, setDomexLiabilitySumInsured] = useState<number | null>(null);
  const [domexLiabilityDeductible, setDomexLiabilityDeductible] = useState<number | null>(null);
  const [domexLiabilityMobile, setDomexLiabilityMobile] = useState(false);
  const [domexLiabilityTenant, setDomexLiabilityTenant] = useState(false);
  const [domexLiabilityLandlord, setDomexLiabilityLandlord] = useState(false);
  const [domexAssistancePlus, setDomexAssistancePlus] = useState(false);
  const [refreshOriginalOpen, setRefreshOriginalOpen] = useState(false);
  const [durationHelpOpen, setDurationHelpOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pdfImporting, setPdfImporting] = useState(false);
  const [pdfImportStatus, setPdfImportStatus] = useState<string | null>(null);
  const [pdfImportError, setPdfImportError] = useState<string | null>(null);
  const [pdfClientNameLoaded, setPdfClientNameLoaded] = useState(false);
  const [pdfMatchedClientName, setPdfMatchedClientName] = useState(false);
  const [pdfDropActive, setPdfDropActive] = useState(false);
  const pdfDragCounterRef = useRef(0);

  const [items, setItems] = useState<CommissionResultItemDTO[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [unsupported, setUnsupported] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [contractNumberLiveCheck, setContractNumberLiveCheck] =
    useState<ContractNumberLiveCheckState>({ status: "idle" });
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
  const [lastSavedContractRef, setLastSavedContractRef] = useState<{
    ownerEmail: string;
    entryId: string;
  } | null>(null);

  const contractDateIssues = useMemo(
    () => collectContractDateIssues(contractSignedDate, policyStartDate, policyEndDate),
    [contractSignedDate, policyStartDate, policyEndDate]
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
  const tipContractImmediateGrossFirstYear = useMemo(
    () => computeImmediateCommissionFirstYearTotal(items),
    [items]
  );
  const tipContractTipsterAmountFirstYear = useMemo(() => {
    if (!tipContractConfig) return 0;
    return roundToCents(
      tipContractImmediateGrossFirstYear * (tipContractConfig.tipsterPercent / 100)
    );
  }, [tipContractConfig, tipContractImmediateGrossFirstYear]);
  const tipContractImmediateNetFirstYear = useMemo(() => {
    if (!tipContractConfig) return 0;
    return roundToCents(
      tipContractImmediateGrossFirstYear - tipContractTipsterAmountFirstYear
    );
  }, [
    tipContractConfig,
    tipContractImmediateGrossFirstYear,
    tipContractTipsterAmountFirstYear,
  ]);
  const tipContractTotalNet = useMemo(() => {
    if (!tipContractConfig) return total;
    return roundToCents(Math.max(0, total - tipContractTipsterAmountFirstYear));
  }, [tipContractConfig, tipContractTipsterAmountFirstYear, total]);
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
  const [neonCoefficientView, setNeonCoefficientView] =
    useState<NeonCoefficientView>("current");
  const [neonPreviewBlobUrl, setNeonPreviewBlobUrl] = useState<string | null>(null);
  const neonPreviewObjectUrlRef = useRef<string | null>(null);
  const [neonPreviewLoading, setNeonPreviewLoading] = useState(false);
  const [neonPreviewError, setNeonPreviewError] = useState<string | null>(null);
  const [neonDocAction, setNeonDocAction] = useState<"download" | "open" | null>(null);
  const isLifeProduct = useMemo(() => LIFE_PRODUCTS.includes(product), [product]);
  const contractSignedDateForNeon = useMemo(() => {
    const signedDate = contractSignedDate.trim();
    return isIsoDay(signedDate) ? signedDate : null;
  }, [contractSignedDate]);
  const isNeonHistoricalBySignedDate = useMemo(
    () =>
      product === "neon" && isNeonHistoricalPeriod(contractSignedDateForNeon),
    [product, contractSignedDateForNeon]
  );
  const neonCoefficientDateForView = useMemo(() => {
    if (neonCoefficientView === "historical") return "2024-06-30";
    return "2024-07-01";
  }, [neonCoefficientView]);
  const isNeonHistoricalInCoefModal = useMemo(
    () => product === "neon" && neonCoefficientView === "historical",
    [product, neonCoefficientView]
  );
  const neonImmediatePayoutInfo = useMemo(() => {
    if (product !== "neon") return null;
    if (isNeonHistoricalInCoefModal) {
      return "Okamžitá provize je součet 1. provize a 2. provize po 3 měsících (Při zpracování karty klienta je provize po 3 měsících vyplacena současně s 1. provizí).";
    }
    if (mode === "accelerated") {
      return "Okamžitá provize je součet 1. provize a 2. provize po 3 měsících a 50 % z 3. provize po 36 měsících (Při zpracování karty klienta je provize po 3 měsících vyplacena současně s 1. provizí).";
    }
    return "Okamžitá provize je součet 1. provize a 2. provize po 3 měsících (Při zpracování karty klienta je provize po 3 měsících vyplacena současně s 1. provizí).";
  }, [product, isNeonHistoricalInCoefModal, mode]);
  const canImportFromPdf = useMemo(
    () =>
      !tipsterModeEnabled &&
      (product === "cppAuto" ||
        product === "slaviaauto" ||
        product === "allianzAuto" ||
        product === "csobAuto" ||
        product === "pillowAuto" ||
        product === "kooperativaAuto" ||
        product === "cppcestovko" ||
        product === "neon" ||
        product === "flexi" ||
        product === "domex" ||
        product === "maxcizinkomplex" ||
        product === "comfortcc"),
    [product, tipsterModeEnabled]
  );

  const coefList = useMemo(
    () =>
      getCoefficientSummary(
        product ?? null,
        position ?? null,
        mode ?? null,
        maxCizinKomplexVariant,
        product === "neon" ? neonCoefficientDateForView : contractSignedDateForNeon
      ),
    [
      product,
      position,
      mode,
      maxCizinKomplexVariant,
      contractSignedDateForNeon,
      neonCoefficientDateForView,
    ]
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
      case "maxcizinkomplex":
        return `Výpočet: jednorázové pojistné × koeficient (${maxCizinKomplexVariant === "premium" ? "PREMIUM" : "EXCLUSIVE / STANDARD"}). Provize je vyplacena pouze 1×.`;
      case "pillowInjury":
        return "Výpočet: roční pojistné (měsíční × 12) × koeficient/100 pro jednotlivé položky.";
      case "domex":
      case "cpphafan":
      case "koopmajetekobcan":
        return `Výpočet: platba (${payLabel}) × koeficient. Roční verze násobí počet plateb/rok (${payPerYear}).`;
      case "pillowmajetek":
        return `Výpočet: částka za zvolenou frekvenci (${payLabel}) se přepočte na roční pojistné (${payPerYear}×) a z něj se počítá okamžitá i následná provize. Koeficienty platné od 01.10.2023.`;
      case "maxdomov":
        return `Výpočet: platba (${payLabel}) × koeficient (získatelská i následná). Roční částka = × počet plateb (${payPerYear}).`;
      case "allianzmujdomov":
        return `Výpočet: částka za zvolenou frekvenci (${payLabel}) se přepočte na roční pojistné (${payPerYear}×) a z něj se počítá okamžitá i následná provize. Koeficienty platné od 01.06.2020.`;
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
      case "koopcestovko":
        return "Výpočet: pojistné × koeficient (jednorázově).";
      case "comfortcc":
        return "Výpočet: následná provize z platby = pravidelná platba × koeficient. U postupného poplatku je tato částka započtená i do okamžité provize. Pokud zadáš cílovou částku, Celkem dopočítá celý součet za všechny výplaty následné.";
      default:
        return "";
    }
  }, [product, frequency, maxCizinKomplexVariant]);
  const autoTermsPreviewUrl = useMemo(() => {
    if (!product) return null;
    return AUTO_TERMS_PREVIEW_BY_PRODUCT[product] ?? null;
  }, [product]);
  const showAutoTermsPreview = Boolean(autoTermsPreviewUrl);
  const neonPeriod = neonCoefficientView === "historical" ? "2019" : "2024";
  const neonPreviewRole: "poradce" | "manazer" = (baseUserPosition ?? position).startsWith(
    "poradce"
  )
    ? "poradce"
    : "manazer";
  const neonTermsPreviewUrl =
    product === "neon"
      ? `/api/documents/neon?type=pdf&period=${neonPeriod}`
      : null;
  const neonPreviewImageUrl =
    product === "neon"
      ? `/api/documents/neon?type=preview&period=${neonPeriod}&role=${neonPreviewRole}`
      : null;
  const showNeonTermsPreview = product === "neon";
  const handleNeonDocumentAction = async (action: "download" | "open") => {
    if (!user || !neonTermsPreviewUrl) return;

    let openedWindow: Window | null = null;
    if (action === "open") {
      openedWindow = window.open("", "_blank", "noopener,noreferrer");
      if (!openedWindow) {
        setNeonPreviewError("Prohlížeč zablokoval otevření nové karty s PDF.");
        return;
      }
      try {
        openedWindow.document.title = "Načítám provizní podmínky...";
        openedWindow.document.body.style.fontFamily = "monospace";
        openedWindow.document.body.style.padding = "24px";
        openedWindow.document.body.textContent = "Načítám provizní podmínky...";
      } catch {
        // best effort
      }
    }

    setNeonDocAction(action);
    setNeonPreviewError(null);
    try {
      const path =
        action === "download" ? `${neonTermsPreviewUrl}&download=1` : neonTermsPreviewUrl;
      const response = await requestBlobWithAuth({
        user,
        path,
      });
      if (!response.ok) {
        throw new Error(`Nepodařilo se načíst PDF (${response.status}).`);
      }

      const pdfBlob = await response.blob();
      const blobUrl = URL.createObjectURL(pdfBlob);
      if (action === "download") {
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = `cppneon${neonPeriod}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1200);
      } else {
        if (!openedWindow || openedWindow.closed) {
          URL.revokeObjectURL(blobUrl);
          throw new Error("Nepodařilo se otevřít kartu s PDF.");
        }
        openedWindow.location.href = blobUrl;
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
      }
    } catch (err) {
      if (openedWindow && !openedWindow.closed) {
        openedWindow.close();
      }
      const errorMessage =
        err instanceof Error && err.message.trim().length > 0
          ? err.message.trim()
          : "Nepodařilo se načíst provizní podmínky.";
      setNeonPreviewError(errorMessage);
    } finally {
      setNeonDocAction(null);
    }
  };
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
    if (!pdfClientNameLoaded) {
      setPdfMatchedClientName(false);
      return;
    }

    const normalizedClientName = normalizeClientNameForSystemMatch(clientName);
    if (!normalizedClientName) {
      setPdfMatchedClientName(false);
      return;
    }

    const matched = clientSuggestions.some(
      (name) => normalizeClientNameForSystemMatch(name) === normalizedClientName
    );
    setPdfMatchedClientName(matched);
  }, [pdfClientNameLoaded, clientName, clientSuggestions]);

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
        const payload = await fetchAuthedJsonOrThrow<{
          ok?: boolean;
          profile?: Record<string, unknown>;
        }>(user, "/api/user/profile", { method: "GET" });
        const data = (payload?.profile ?? {}) as any;

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

        let mgrEmail = (data?.managerEmail as string | undefined)?.toLowerCase() ?? null;
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

        let chain: ManagerChainSnapshotEntry[] = [];
        try {
          const snapshot = await requestManagerSnapshotWithAuth({
            user,
            signedDateIso: null,
          });
          const snapshotManagerEmail = snapshot.managerEmail ?? null;
          if (snapshotManagerEmail) {
            setManagerEmailSnapshot(snapshotManagerEmail);
            mgrEmail = snapshotManagerEmail;
          }
          setManagerPositionSnapshot(snapshot.managerPosition ?? null);
          setManagerModeSnapshot(snapshot.managerMode ?? null);
          chain = snapshot.managerChain;
        } catch (mgrErr) {
          console.error("Failed to load manager snapshot", mgrErr);
          setManagerPositionSnapshot(null);
          setManagerModeSnapshot(null);
        }

        if (chain.length === 0 && mgrEmail) {
          chain = ensureManagerChainWithDirectManager(chain, mgrEmail, null, null);
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

    if (shouldShowDurationMonths(product)) {
      if (durationMonths == null) {
        setDurationMonths(durationMonthsFallback(product));
        return;
      }
      const [minMonths, maxMonths] = durationMonthsRange(product);
      if (durationMonths < minMonths || durationMonths > maxMonths) {
        setDurationMonths(Math.min(maxMonths, Math.max(minMonths, durationMonths)));
      }
    } else if (durationMonths != null) {
      setDurationMonths(null);
    }

    // pokud uživatel má zrychlený režim, dovolíme přepnout pro konkrétní smlouvu
    // defaultně zůstává nastavený režim z profilu (mode)
  }, [product, frequency, durationYears, durationMonths]);

  // Výchozí hodnota doby trvání po změně produktu
  useEffect(() => {
    if (product === "neon") {
      setDurationYears(null);
    }
    if (product === "maximaMaxEfekt") {
      setDurationYears(20);
    }
    if (product === "maxcizinkomplex") {
      setDurationMonths(12);
      setMaxCizinKomplexVariant("exclusiveStandard");
    }
  }, [product]);

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
        if (key === "dobu trvání v měsících") {
          return (
            product === "maxcizinkomplex" &&
            (durationMonths == null || normalizedDurationMonths(product, durationMonths) <= 0)
          );
        }
        return true;
      })
    );
  }, [
    amountText,
    clientName,
    contractNumber,
    contractSignedDate,
    policyStartDate,
    comfortPaymentText,
    product,
    comfortGradual,
    durationMonths,
  ]);

  useEffect(() => {
    if (!tipsterModeEnabled) {
      setTipsterPercentPanelOpen(false);
    }
  }, [tipsterModeEnabled]);

  useEffect(() => {
    if (tipsterModeEnabled) {
      setTipContractModalOpen(false);
    }
  }, [tipsterModeEnabled]);

  useEffect(() => {
    if (!tipContractModalOpen) return;

    const normalizedEmail = tipContractDraftEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      setTipContractLookupState({ status: "idle" });
      return;
    }
    if (!EMAIL_LOOKUP_RE.test(normalizedEmail)) {
      setTipContractLookupState({ status: "idle" });
      return;
    }
    if (!user) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setTipContractLookupState({ status: "checking" });
      try {
        const payload = await fetchAuthedJsonOrThrow<TipsterLookupApiResponse>(
          user,
          `/api/user/lookup?email=${encodeURIComponent(normalizedEmail)}`,
          { method: "GET" }
        );
        if (cancelled) return;

        if (payload?.exists && typeof payload.email === "string" && payload.email.trim()) {
          setTipContractLookupState({
            status: "found",
            email: payload.email.trim().toLowerCase(),
            name:
              typeof payload.name === "string" && payload.name.trim()
                ? payload.name.trim()
                : null,
          });
          return;
        }

        setTipContractLookupState({ status: "notFound" });
      } catch (lookupErr) {
        if (cancelled) return;
        const message =
          lookupErr instanceof Error && lookupErr.message.trim()
            ? lookupErr.message.trim()
            : "Ověření tipaře se nepodařilo.";
        setTipContractLookupState({ status: "error", message });
      }
    }, 320);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [tipContractModalOpen, tipContractDraftEmail, user]);

  useEffect(() => {
    if (
      product !== "cppAuto" &&
      product !== "slaviaauto" &&
      product !== "kooperativaAuto"
    ) {
      setAutoCarMake("");
      setAutoCarPlate("");
      setAutoCarVin("");
      setAutoCarTp("");
      setAutoCarOrv("");
      setAutoCarAnnualMileage("");
      setAutoCarAllianzScope("");
      setAutoCarLiabilityLimit(null);
      setAutoCarHullSumInsured(null);
      setAutoCarHullSumInsuredText("");
      setAutoCarHullDeductible(null);
      setAutoCarHullDeductibleText("");
      setAutoCarHullRiskAccident(false);
      setAutoCarHullRiskTheft(false);
      setAutoCarHullRiskNatural(false);
      setAutoCarHullRiskVandalism(false);
      setAutoCarHullRiskAnimalCollision(false);
      setAutoCarAssistancePlan("");
      setAutoCarAddonEso(false);
      setAutoCarAddonGlass(false);
      setAutoCarAddonAnimalCollision(false);
      setAutoCarAddonAnimalDamage(false);
      setAutoCarAddonVandalism(false);
      setAutoCarAddonTheft(false);
      setAutoCarAddonNatural(false);
      setAutoCarAddonGap(false);
      setAutoCarAddonFireExplosion(false);
      setAutoCarAddonLegalAdvice(false);
      setAutoCarAddonReplacementCar(false);
      setAutoCarAddonLuggage(false);
      setAutoCarAddonTransportedGoods(false);
      setAutoCarAddonPothole(false);
      setAutoCarAddonNonFaultAccident(false);
      setAutoCarAddonKeyLossTheft(false);
    }
  }, [product]);

  useEffect(() => {
    if (product !== "domex") {
      setDomexAddress("");
      setDomexPropertyType("");
      setDomexPropertyCoverage("");
      setDomexPropertySumInsured(null);
      setDomexPropertyDeductible(null);
      setDomexHouseholdType("");
      setDomexHouseholdCoverage("");
      setDomexHouseholdSumInsured(null);
      setDomexHouseholdDeductible(null);
      setDomexLiabilitySumInsured(null);
      setDomexLiabilityDeductible(null);
      setDomexLiabilityMobile(false);
      setDomexLiabilityTenant(false);
      setDomexLiabilityLandlord(false);
      setDomexAssistancePlus(false);
    }
  }, [product]);

  useEffect(() => {
    const trimmedContractNumber = contractNumber.trim();
    if (!user || !trimmedContractNumber || trimmedContractNumber.length < 3 || endorsementDraft) {
      setContractNumberLiveCheck({ status: "idle" });
      return;
    }

    let canceled = false;
    const timer = window.setTimeout(async () => {
      setContractNumberLiveCheck({ status: "checking" });
      try {
        const params = new URLSearchParams({
          scope: "my",
          q: trimmedContractNumber,
        });
        const payload = await fetchAuthedJsonOrThrow<ContractsFindApiResponse>(
          user,
          `/api/contracts/find?${params.toString()}`
        );
        if (canceled) return;

        if (payload.ok === false) {
          setContractNumberLiveCheck({ status: "error" });
          return;
        }

        const dupCount = Array.isArray(payload.contracts) ? payload.contracts.length : 0;
        if (dupCount > 0) {
          setContractNumberLiveCheck({
            status: "duplicate",
            count: dupCount,
          });
          return;
        }
        setContractNumberLiveCheck({ status: "ok" });
      } catch (err) {
        console.warn("Live kontrola duplicitního čísla smlouvy selhala", err);
        if (!canceled) setContractNumberLiveCheck({ status: "error" });
      }
    }, 350);

    return () => {
      canceled = true;
      window.clearTimeout(timer);
    };
  }, [user, contractNumber, endorsementDraft]);

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

    if (!user) return;

    try {
      await fetchAuthedJsonOrThrow(user, "/api/user/profile", {
        method: "PATCH",
        body: JSON.stringify({ tipsterCommissionPercent: next }),
      });
    } catch (err) {
      console.error("Failed to persist tipster percent", err);
    }
  };

  const openTipContractModal = () => {
    setTipContractDraftPercent(tipContractConfig?.tipsterPercent ?? 50);
    setTipContractDraftEmail(tipContractConfig?.tipsterEmail ?? "");
    if (tipContractConfig?.tipsterEmail) {
      setTipContractLookupState({
        status: "found",
        email: tipContractConfig.tipsterEmail,
        name: tipContractConfig.tipsterName ?? null,
      });
    } else {
      setTipContractLookupState({ status: "idle" });
    }
    setTipContractModalOpen(true);
  };

  const applyTipContractSettings = () => {
    const normalizedDraftEmail = tipContractDraftEmail.trim().toLowerCase();
    const nextPercent = clampTipContractPercent(tipContractDraftPercent);
    if (!normalizedDraftEmail) {
      if (typeof window !== "undefined") {
        const confirmed = window.confirm(
          "Opravdu chcete uložit tip bez označení Tipaře?"
        );
        if (!confirmed) return;
      }

      setTipContractConfig({
        tipsterEmail: null,
        tipsterName: null,
        tipsterPercent: nextPercent,
      });
      setTipContractModalOpen(false);
      setSaveMessage(`Smlouva z TIPU: ${nextPercent} % bez označení tipaře.`);
      return;
    }

    if (
      tipContractLookupState.status !== "found" ||
      tipContractLookupState.email !== normalizedDraftEmail
    ) {
      setSaveMessage("Nejdřív vyber tipaře, který v systému existuje.");
      return;
    }

    const nextEmail = normalizedDraftEmail;
    setTipContractConfig({
      tipsterEmail: nextEmail,
      tipsterName: tipContractLookupState.name ?? null,
      tipsterPercent: nextPercent,
    });
    setTipContractModalOpen(false);
    setSaveMessage(
      `Smlouva z TIPU: ${nextPercent} % pro tipaře (${tipContractLookupState.name ?? nextEmail}).`
    );
  };

  const clearTipContractSettings = () => {
    setTipContractConfig(null);
    setTipContractModalOpen(false);
    setTipContractDraftEmail("");
    setTipContractDraftPercent(50);
    setTipContractLookupState({ status: "idle" });
    setSaveMessage("Smlouva z TIPU byla vypnutá.");
  };

  const looksLikeMaxCizinKomplexPdf = (
    parsed:
      | Awaited<ReturnType<typeof parseMaxCizinKomplexPdf>>
      | null
      | undefined
  ): boolean => {
    if (!parsed) return false;
    return Boolean(
      parsed.maxCizinKomplexVariant ||
        (typeof parsed.durationMonths === "number" && parsed.durationMonths > 0) ||
        typeof parsed.amount === "number" ||
        parsed.policyStartDate ||
        parsed.contractSignedDate
    );
  };

  const showMaxCizinKomplexHint = () => {
    setPdfImportError(
      "PDF vypadá jako MAXIMA Cizinci. V poli Produkt vyber sekci Cizinci -> MAXIMA Komplexní zdravotní pojištění cizinců a nahraj PDF znovu."
    );
    setPdfImportStatus(null);
  };

  const handlePdfImport = async (file: File | null) => {
    if (!file) return;
    setPdfImporting(true);
    setPdfImportError(null);
    setPdfImportStatus("Načítám PDF…");
    setPdfClientNameLoaded(false);
    setPdfMatchedClientName(false);
    let importProduct: Product = product;
    try {
      const detected = await detectProductFromPdf(file);
      if (detected && detected.product !== product) {
        importProduct = detected.product;
        setProduct(detected.product);
        setProductPickerSection(productPickerSectionForProduct(detected.product));
        setPdfImportStatus(`Rozpoznán produkt: ${productLabel(detected.product)}. Načítám data…`);
      }
    } catch (detectErr) {
      console.warn("Auto-detekce produktu z PDF selhala", detectErr);
    }
    if (
      importProduct === "cppAuto" ||
      importProduct === "slaviaauto" ||
      importProduct === "allianzAuto" ||
      importProduct === "csobAuto" ||
      importProduct === "pillowAuto" ||
      importProduct === "kooperativaAuto"
    ) {
      setAutoCarMake("");
      setAutoCarPlate("");
      setAutoCarVin("");
      setAutoCarTp("");
      setAutoCarOrv("");
      setAutoCarAnnualMileage("");
      setAutoCarAllianzScope("");
      setAutoCarLiabilityLimit(null);
      setAutoCarHullSumInsured(null);
      setAutoCarHullSumInsuredText("");
      setAutoCarHullDeductible(null);
      setAutoCarHullDeductibleText("");
      setAutoCarHullRiskAccident(false);
      setAutoCarHullRiskTheft(false);
      setAutoCarHullRiskNatural(false);
      setAutoCarHullRiskVandalism(false);
      setAutoCarHullRiskAnimalCollision(false);
      setAutoCarAssistancePlan("");
      setAutoCarAddonEso(false);
      setAutoCarAddonGlass(false);
      setAutoCarAddonAnimalCollision(false);
      setAutoCarAddonAnimalDamage(false);
      setAutoCarAddonVandalism(false);
      setAutoCarAddonTheft(false);
      setAutoCarAddonNatural(false);
      setAutoCarAddonGap(false);
      setAutoCarAddonFireExplosion(false);
      setAutoCarAddonLegalAdvice(false);
      setAutoCarAddonReplacementCar(false);
      setAutoCarAddonLuggage(false);
      setAutoCarAddonTransportedGoods(false);
      setAutoCarAddonPothole(false);
      setAutoCarAddonNonFaultAccident(false);
      setAutoCarAddonKeyLossTheft(false);
    }
    if (importProduct === "domex") {
      setDomexAddress("");
      setDomexPropertyType("");
      setDomexPropertyCoverage("");
      setDomexPropertySumInsured(null);
      setDomexPropertyDeductible(null);
      setDomexHouseholdType("");
      setDomexHouseholdCoverage("");
      setDomexHouseholdSumInsured(null);
      setDomexHouseholdDeductible(null);
      setDomexLiabilitySumInsured(null);
      setDomexLiabilityDeductible(null);
      setDomexLiabilityMobile(false);
      setDomexLiabilityTenant(false);
      setDomexLiabilityLandlord(false);
      setDomexAssistancePlus(false);
    }
    try {
      let parsed:
        | Awaited<ReturnType<typeof parseCppAutoPdf>>
        | Awaited<ReturnType<typeof parseSlaviaAutoPdf>>
        | Awaited<ReturnType<typeof parseNeonPdf>>
        | Awaited<ReturnType<typeof parseFlexiPdf>>
        | Awaited<ReturnType<typeof parseDomexPdf>>
        | Awaited<ReturnType<typeof parseMaxCizinKomplexPdf>>
        | Awaited<ReturnType<typeof parseComfortPdf>>
        | Awaited<ReturnType<typeof parseKooperativaAutoPdf>>
        | Awaited<ReturnType<typeof parseAllianzAutoPdf>>
        | Awaited<ReturnType<typeof parsePillowAutoPdf>>
        | Awaited<ReturnType<typeof parseCsobAutoPdf>>
        | Awaited<ReturnType<typeof parseCppCestovkoPdf>>
        | null = null;

      if (importProduct === "cppAuto") {
        parsed = await parseCppAutoPdf(file);
      } else if (importProduct === "slaviaauto") {
        parsed = await parseSlaviaAutoPdf(file);
      } else if (importProduct === "allianzAuto") {
        parsed = await parseAllianzAutoPdf(file);
      } else if (importProduct === "csobAuto") {
        parsed = await parseCsobAutoPdf(file);
      } else if (importProduct === "pillowAuto") {
        parsed = await parsePillowAutoPdf(file);
      } else if (importProduct === "kooperativaAuto") {
        parsed = await parseKooperativaAutoPdf(file);
      } else if (importProduct === "neon") {
        parsed = await parseNeonPdf(file);
      } else if (importProduct === "flexi") {
        parsed = await parseFlexiPdf(file);
      } else if (importProduct === "domex") {
        parsed = await parseDomexPdf(file);
      } else if (importProduct === "maxcizinkomplex") {
        parsed = await parseMaxCizinKomplexPdf(file);
      } else if (importProduct === "comfortcc") {
        parsed = await parseComfortPdf(file);
      } else if (importProduct === "cppcestovko") {
        parsed = await parseCppCestovkoPdf(file);
      } else {
        setPdfImportError(
          "Načítání z PDF je teď dostupné jen pro ČPP Auto, SLAVIA Auto, Allianz Auto, ČSOB Auto, Pillow Auto, Kooperativa Auto, ČPP Cestovko, ČPP ŽP NEON, Kooperativa ŽP FLEXI, ČPP DOMEX, MAXIMA Cizinci a Comfort Commodity."
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
        setPdfClientNameLoaded(true);
        applied += 1;
      }
      if (parsed.policyStartDate) {
        setPolicyStartDate(parsed.policyStartDate);
        applied += 1;
      }
      if ("policyEndDate" in parsed && typeof parsed.policyEndDate === "string") {
        setPolicyEndDate(parsed.policyEndDate);
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
        const allowedForProduct = allowedFrequencies(importProduct);
        if (allowedForProduct.includes(parsed.frequency)) {
          setFrequency(parsed.frequency);
        }
      }
      if ("domexAddress" in parsed) {
        const address = typeof parsed.domexAddress === "string" ? parsed.domexAddress.trim() : "";
        setDomexAddress(address);
        if (address) applied += 1;
      }
      if ("domexPropertyType" in parsed) {
        const propertyType =
          typeof parsed.domexPropertyType === "string" ? parsed.domexPropertyType.trim() : "";
        setDomexPropertyType(propertyType);
        if (propertyType) applied += 1;
      }
      if ("domexPropertyCoverage" in parsed) {
        const propertyCoverage =
          typeof parsed.domexPropertyCoverage === "string"
            ? parsed.domexPropertyCoverage.trim()
            : "";
        setDomexPropertyCoverage(propertyCoverage);
        if (propertyCoverage) applied += 1;
      }
      if ("domexPropertySumInsured" in parsed) {
        const sumInsured =
          typeof parsed.domexPropertySumInsured === "number" &&
          Number.isFinite(parsed.domexPropertySumInsured)
            ? Math.round(parsed.domexPropertySumInsured)
            : null;
        setDomexPropertySumInsured(sumInsured);
        if (sumInsured != null) applied += 1;
      }
      if ("domexPropertyDeductible" in parsed) {
        const deductible =
          typeof parsed.domexPropertyDeductible === "number" &&
          Number.isFinite(parsed.domexPropertyDeductible)
            ? Math.round(parsed.domexPropertyDeductible)
            : null;
        setDomexPropertyDeductible(deductible);
        if (deductible != null) applied += 1;
      }
      if ("domexHouseholdType" in parsed) {
        const householdType =
          typeof parsed.domexHouseholdType === "string" ? parsed.domexHouseholdType.trim() : "";
        setDomexHouseholdType(householdType);
        if (householdType) applied += 1;
      }
      if ("domexHouseholdCoverage" in parsed) {
        const householdCoverage =
          typeof parsed.domexHouseholdCoverage === "string"
            ? parsed.domexHouseholdCoverage.trim()
            : "";
        setDomexHouseholdCoverage(householdCoverage);
        if (householdCoverage) applied += 1;
      }
      if ("domexHouseholdSumInsured" in parsed) {
        const householdSumInsured =
          typeof parsed.domexHouseholdSumInsured === "number" &&
          Number.isFinite(parsed.domexHouseholdSumInsured)
            ? Math.round(parsed.domexHouseholdSumInsured)
            : null;
        setDomexHouseholdSumInsured(householdSumInsured);
        if (householdSumInsured != null) applied += 1;
      }
      if ("domexHouseholdDeductible" in parsed) {
        const householdDeductible =
          typeof parsed.domexHouseholdDeductible === "number" &&
          Number.isFinite(parsed.domexHouseholdDeductible)
            ? Math.round(parsed.domexHouseholdDeductible)
            : null;
        setDomexHouseholdDeductible(householdDeductible);
        if (householdDeductible != null) applied += 1;
      }
      if ("domexLiabilitySumInsured" in parsed) {
        const liabilitySumInsured =
          typeof parsed.domexLiabilitySumInsured === "number" &&
          Number.isFinite(parsed.domexLiabilitySumInsured)
            ? Math.round(parsed.domexLiabilitySumInsured)
            : null;
        setDomexLiabilitySumInsured(liabilitySumInsured);
        if (liabilitySumInsured != null) applied += 1;
      }
      if ("domexLiabilityDeductible" in parsed) {
        const liabilityDeductible =
          typeof parsed.domexLiabilityDeductible === "number" &&
          Number.isFinite(parsed.domexLiabilityDeductible)
            ? Math.round(parsed.domexLiabilityDeductible)
            : null;
        setDomexLiabilityDeductible(liabilityDeductible);
        if (liabilityDeductible != null) applied += 1;
      }
      if ("domexLiabilityMobile" in parsed) {
        const hasAddon = parsed.domexLiabilityMobile === true;
        setDomexLiabilityMobile(hasAddon);
        if (hasAddon) applied += 1;
      }
      if ("domexLiabilityTenant" in parsed) {
        const hasAddon = parsed.domexLiabilityTenant === true;
        setDomexLiabilityTenant(hasAddon);
        if (hasAddon) applied += 1;
      }
      if ("domexLiabilityLandlord" in parsed) {
        const hasAddon = parsed.domexLiabilityLandlord === true;
        setDomexLiabilityLandlord(hasAddon);
        if (hasAddon) applied += 1;
      }
      if ("domexAssistancePlus" in parsed) {
        const hasAssistance = parsed.domexAssistancePlus === true;
        setDomexAssistancePlus(hasAssistance);
        if (hasAssistance) applied += 1;
      }
      if ("durationYears" in parsed && typeof parsed.durationYears === "number") {
        const [min, max] = durationRange(importProduct);
        const yrs = Math.min(max, Math.max(min, parsed.durationYears));
        setDurationYears(yrs);
        applied += 1;
      }
      if ("durationMonths" in parsed && typeof parsed.durationMonths === "number") {
        setDurationMonths(normalizedDurationMonths(importProduct, parsed.durationMonths));
        applied += 1;
      }
      if (
        "maxCizinKomplexVariant" in parsed &&
        (parsed.maxCizinKomplexVariant === "exclusiveStandard" ||
          parsed.maxCizinKomplexVariant === "premium")
      ) {
        setMaxCizinKomplexVariant(parsed.maxCizinKomplexVariant);
        applied += 1;
      }
      if ("carMake" in parsed) {
        const carMake = typeof parsed.carMake === "string" ? parsed.carMake.trim() : "";
        setAutoCarMake(carMake);
        if (carMake) applied += 1;
      }
      if ("carPlate" in parsed) {
        const plate = typeof parsed.carPlate === "string" ? parsed.carPlate.trim() : "";
        setAutoCarPlate(plate);
        if (plate) applied += 1;
      }
      if ("carVin" in parsed) {
        const vin = typeof parsed.carVin === "string" ? parsed.carVin.trim() : "";
        setAutoCarVin(vin);
        if (vin) applied += 1;
      }
      if ("carTp" in parsed) {
        const tp = typeof parsed.carTp === "string" ? parsed.carTp.trim() : "";
        setAutoCarTp(tp);
        if (tp) applied += 1;
      }
      if ("carOrv" in parsed) {
        const orv = typeof parsed.carOrv === "string" ? parsed.carOrv.trim() : "";
        setAutoCarOrv(orv);
        if (orv) applied += 1;
      }
      if ("carAnnualMileage" in parsed) {
        const annualMileage =
          typeof parsed.carAnnualMileage === "string"
            ? parsed.carAnnualMileage.trim()
            : "";
        setAutoCarAnnualMileage(annualMileage);
        if (annualMileage) applied += 1;
      }
      if ("carAllianzScope" in parsed) {
        const scope =
          typeof parsed.carAllianzScope === "string"
            ? parsed.carAllianzScope.trim()
            : "";
        setAutoCarAllianzScope(scope);
        if (scope) applied += 1;
      }
      if ("carLiabilityLimit" in parsed) {
        const liabilityLimit =
          typeof parsed.carLiabilityLimit === "number" &&
          Number.isFinite(parsed.carLiabilityLimit)
            ? Math.round(parsed.carLiabilityLimit)
            : null;
        setAutoCarLiabilityLimit(liabilityLimit);
        if (liabilityLimit != null) applied += 1;
      }
      if ("carHullSumInsured" in parsed) {
        const hullSumInsured =
          typeof parsed.carHullSumInsured === "number" &&
          Number.isFinite(parsed.carHullSumInsured)
            ? Math.round(parsed.carHullSumInsured)
            : null;
        setAutoCarHullSumInsured(hullSumInsured);
        if (hullSumInsured != null) applied += 1;
      }
      if ("carHullSumInsuredText" in parsed) {
        const hullSumInsuredText =
          typeof parsed.carHullSumInsuredText === "string"
            ? parsed.carHullSumInsuredText.trim()
            : "";
        setAutoCarHullSumInsuredText(hullSumInsuredText);
        if (hullSumInsuredText) {
          setAutoCarHullSumInsured(null);
          applied += 1;
        }
      }
      if ("carHullDeductible" in parsed) {
        const hullDeductible =
          typeof parsed.carHullDeductible === "number" &&
          Number.isFinite(parsed.carHullDeductible)
            ? Math.round(parsed.carHullDeductible)
            : null;
        setAutoCarHullDeductible(hullDeductible);
        if (hullDeductible != null) applied += 1;
      }
      if ("carHullDeductibleText" in parsed) {
        const hullDeductibleText =
          typeof parsed.carHullDeductibleText === "string"
            ? parsed.carHullDeductibleText.trim()
            : "";
        setAutoCarHullDeductibleText(hullDeductibleText);
        if (hullDeductibleText) applied += 1;
      }
      if ("carHullRiskAccident" in parsed) {
        const risk = parsed.carHullRiskAccident === true;
        setAutoCarHullRiskAccident(risk);
        if (risk) applied += 1;
      }
      if ("carHullRiskTheft" in parsed) {
        const risk = parsed.carHullRiskTheft === true;
        setAutoCarHullRiskTheft(risk);
        if (risk) applied += 1;
      }
      if ("carHullRiskNatural" in parsed) {
        const risk = parsed.carHullRiskNatural === true;
        setAutoCarHullRiskNatural(risk);
        if (risk) applied += 1;
      }
      if ("carHullRiskVandalism" in parsed) {
        const risk = parsed.carHullRiskVandalism === true;
        setAutoCarHullRiskVandalism(risk);
        if (risk) applied += 1;
      }
      if ("carHullRiskAnimalCollision" in parsed) {
        const risk = parsed.carHullRiskAnimalCollision === true;
        setAutoCarHullRiskAnimalCollision(risk);
        if (risk) applied += 1;
      }
      if ("carAssistancePlan" in parsed) {
        const assistance =
          typeof parsed.carAssistancePlan === "string"
            ? parsed.carAssistancePlan.trim()
            : "";
        setAutoCarAssistancePlan(assistance);
        if (assistance) applied += 1;
      }
      if ("carAddonEso" in parsed) {
        const addon = parsed.carAddonEso === true;
        setAutoCarAddonEso(addon);
        if (addon) applied += 1;
      }
      if ("carAddonGlass" in parsed) {
        const addon = parsed.carAddonGlass === true;
        setAutoCarAddonGlass(addon);
        if (addon) applied += 1;
      }
      if ("carAddonAnimalCollision" in parsed) {
        const addon = parsed.carAddonAnimalCollision === true;
        setAutoCarAddonAnimalCollision(addon);
        if (addon) applied += 1;
      }
      if ("carAddonAnimalDamage" in parsed) {
        const addon = parsed.carAddonAnimalDamage === true;
        setAutoCarAddonAnimalDamage(addon);
        if (addon) applied += 1;
      }
      if ("carAddonVandalism" in parsed) {
        const addon = parsed.carAddonVandalism === true;
        setAutoCarAddonVandalism(addon);
        if (addon) applied += 1;
      }
      if ("carAddonTheft" in parsed) {
        const addon = parsed.carAddonTheft === true;
        setAutoCarAddonTheft(addon);
        if (addon) applied += 1;
      }
      if ("carAddonNatural" in parsed) {
        const addon = parsed.carAddonNatural === true;
        setAutoCarAddonNatural(addon);
        if (addon) applied += 1;
      }
      if ("carAddonGap" in parsed) {
        const addon = parsed.carAddonGap === true;
        setAutoCarAddonGap(addon);
        if (addon) applied += 1;
      }
      if ("carAddonFireExplosion" in parsed) {
        const addon = parsed.carAddonFireExplosion === true;
        setAutoCarAddonFireExplosion(addon);
        if (addon) applied += 1;
      }
      if ("carAddonLegalAdvice" in parsed) {
        const addon = parsed.carAddonLegalAdvice === true;
        setAutoCarAddonLegalAdvice(addon);
        if (addon) applied += 1;
      }
      if ("carAddonReplacementCar" in parsed) {
        const addon = parsed.carAddonReplacementCar === true;
        setAutoCarAddonReplacementCar(addon);
        if (addon) applied += 1;
      }
      if ("carAddonLuggage" in parsed) {
        const addon = parsed.carAddonLuggage === true;
        setAutoCarAddonLuggage(addon);
        if (addon) applied += 1;
      }
      if ("carAddonTransportedGoods" in parsed) {
        const addon = parsed.carAddonTransportedGoods === true;
        setAutoCarAddonTransportedGoods(addon);
        if (addon) applied += 1;
      }
      if ("carAddonPothole" in parsed) {
        const addon = parsed.carAddonPothole === true;
        setAutoCarAddonPothole(addon);
        if (addon) applied += 1;
      }
      if ("carAddonNonFaultAccident" in parsed) {
        const addon = parsed.carAddonNonFaultAccident === true;
        setAutoCarAddonNonFaultAccident(addon);
        if (addon) applied += 1;
      }
      if ("carAddonKeyLossTheft" in parsed) {
        const addon = parsed.carAddonKeyLossTheft === true;
        setAutoCarAddonKeyLossTheft(addon);
        if (addon) applied += 1;
      }

      if (applied === 0 && importProduct !== "maxcizinkomplex") {
        try {
          const maxCizinParsed = await parseMaxCizinKomplexPdf(file);
          if (looksLikeMaxCizinKomplexPdf(maxCizinParsed)) {
            showMaxCizinKomplexHint();
            return;
          }
        } catch {
          // ignore fallback detection error
        }
      }

      setPdfImportStatus(
        applied > 0
          ? `Načteno z PDF (${applied} polí). Zkontroluj prosím.`
          : "V PDF se nenašla čitelná data, doplň ručně."
      );
    } catch (err) {
      console.error("PDF import selhal", err);
      if (importProduct !== "maxcizinkomplex") {
        try {
          const maxCizinParsed = await parseMaxCizinKomplexPdf(file);
          if (looksLikeMaxCizinKomplexPdf(maxCizinParsed)) {
            showMaxCizinKomplexHint();
            return;
          }
        } catch {
          // ignore fallback detection error
        }
      }
      setPdfImportError("PDF se nepodařilo přečíst. Zkus prosím zadat ručně.");
      setPdfImportStatus(null);
    } finally {
      setPdfImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const resetPdfDropState = () => {
    pdfDragCounterRef.current = 0;
    setPdfDropActive(false);
  };

  const handlePdfDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    pdfDragCounterRef.current += 1;
    setPdfDropActive(true);
  };

  const handlePdfDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  };

  const handlePdfDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    pdfDragCounterRef.current = Math.max(0, pdfDragCounterRef.current - 1);
    if (pdfDragCounterRef.current === 0) {
      setPdfDropActive(false);
    }
  };

  const handlePdfDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    resetPdfDropState();

    if (pdfImporting) return;

    const file =
      Array.from(e.dataTransfer?.files ?? []).find(
        (candidate) =>
          candidate.type === "application/pdf" ||
          candidate.name.toLowerCase().endsWith(".pdf")
      ) ?? null;

    if (!file) {
      setPdfImportError("Přetáhni prosím PDF soubor.");
      setPdfImportStatus(null);
      return;
    }

    void handlePdfImport(file);
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
      const dto = calculateNeon(
        val,
        position,
        durationYears,
        mode,
        contractSignedDateForNeon
      );
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

    if (product === "maxcizinkomplex") {
      const dto = calculateMaxCizinKomplex(val, position, maxCizinKomplexVariant);
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

    if (
      product === "domex" ||
      product === "cpphafan" ||
      product === "koopmajetekobcan"
    ) {
      const dto =
        product === "domex"
          ? calculateDomex(val, frequency, position)
          : product === "cpphafan"
          ? calculateCppHafan(val, frequency, position)
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

    if (product === "pillowmajetek") {
      const dto = calculatePillowMajetek(val, frequency, position);
      setItems(dto.items);
      setTotal(dto.total);
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

    if (product === "allianzmujdomov") {
      const dto = calculateAllianzMujDomov(val, frequency, position);
      setItems(dto.items);
      setTotal(dto.total);
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

    if (product === "koopcestovko") {
      const dto = calculateKoopCestovko(val, position);
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
  }, [
    product,
    position,
    mode,
    frequency,
    durationYears,
    amountText,
    comfortGradual,
    comfortPaymentText,
    comfortTargetAmountText,
    maxCizinKomplexVariant,
  ]);

  useEffect(() => {
    if (product !== "neon") {
      setRefreshOriginalOpen(false);
    }
    if (product !== "cppcestovko") {
      setPolicyEndDate("");
    }
  }, [product]);

  useEffect(() => {
    if (!productOpen) return;
    setProductPickerSection(productPickerSectionForProduct(product));
    setProductSearchText("");
  }, [productOpen, product]);

  useEffect(() => {
    if (!productOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setProductOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [productOpen]);

  useEffect(() => {
    setDurationHelpOpen(false);
  }, [product]);

  useEffect(() => {
    if (!endorsementDraft) return;
    if (!isLifeProduct || endorsementDraft.productKey !== product) {
      setEndorsementDraft(null);
    }
  }, [endorsementDraft, isLifeProduct, product]);

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
    setLastSavedContractRef(null);

    try {
      const signedDateIso = contractSignedDate.trim() || null;

      let mgrEmail = managerEmailSnapshot;
      let mgrPos = managerPositionSnapshot;
      let mgrMode = managerModeSnapshot;
      let managerChainForSave: ManagerChainSnapshotEntry[] = managerChainSnapshot;
      try {
        const snapshot = await requestManagerSnapshotWithAuth({
          user,
          signedDateIso,
        });
        mgrEmail = snapshot.managerEmail ?? mgrEmail ?? null;
        mgrPos = snapshot.managerPosition ?? mgrPos ?? null;
        mgrMode = snapshot.managerMode ?? mgrMode ?? null;
        if (snapshot.managerChain.length > 0) {
          managerChainForSave = snapshot.managerChain;
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

      if (!hasResolvedTopManagerPosition(managerChainForSave, mgrEmail)) {
        const msg =
          "Nepodařilo se načíst pozici nadřízeného. Dodatek teď neuložím, aby nechyběla meziprovize.";
        setValidationError(msg);
        setSaveMessage(msg);
        return;
      }

      const { response, data } = await requestContractsMutationWithAuth({
        user,
        path: "/api/contracts",
        method: "POST",
        payload: {
          entry: {
            productKey: endorsementDraft.productKey,
            entryType: "endorsement" as ContractEntryType,
            rootContractEntryId: endorsementDraft.rootContractEntryId,
            parentContractEntryId: endorsementDraft.sourceEntryId,
            parentContractEntryPath: endorsementDraft.sourceEntryPath,
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
            clientName: clientName || null,
            contractSignedDate: contractSignedDate.trim(),
            policyStartDate: policyStartDate.trim(),
            policyEndDate: policyEndDate.trim() || null,
            durationYears: shouldShowDuration(endorsementDraft.productKey)
              ? durationYears
              : null,
            durationMonths: shouldShowDurationMonths(endorsementDraft.productKey)
              ? normalizedDurationMonths(endorsementDraft.productKey, durationMonths)
              : null,
            maxCizinKomplexVariant:
              endorsementDraft.productKey === "maxcizinkomplex"
                ? maxCizinKomplexVariant
                : null,
            contractNumber: endorsementDraft.contractNumber,
          },
        },
      });
      const apiError = getContractsMutationError({
        response,
        data,
        fallback: "Uložení dodatku selhalo.",
      });
      if (apiError) {
        setSaveMessage(apiError);
        return;
      }

      const createdEntryId =
        typeof data?.entryId === "string" ? data.entryId.trim() : "";
      const ownerEmail = (user.email ?? "").trim().toLowerCase();
      if (createdEntryId && ownerEmail) {
        setLastSavedContractRef({
          ownerEmail,
          entryId: createdEntryId,
        });
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
      const errorMessage =
        error instanceof Error && error.message.trim().length > 0
          ? error.message.trim()
          : "Nepodařilo se uložit dodatek. Zkus to prosím za chvíli znovu.";
      console.error("Chyba při ukládání dodatku:", errorMessage);
      setSaveMessage(errorMessage);
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
    if (
      product === "maxcizinkomplex" &&
      (durationMonths == null || normalizedDurationMonths(product, durationMonths) <= 0)
    ) {
      missing.push("dobu trvání v měsících");
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
    const userRef = doc(db, "users", email);
    const entriesRef = collection(userRef, "entries");

    // kontrola duplicitního čísla smlouvy
    const trimmedContractNumber = contractNumber.trim();
    const trimmedClientName = clientName.trim();
    const signedDateIsoDay = contractSignedDate.trim();
    const shouldRefreshOriginalNeon =
      product === "neon" &&
      refreshOriginalOpen;

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
        console.warn("Kontrola duplicitních smluv selhala, pokračuji bez ní", dupErr);
      }
    }

    setSaving(true);
    setSaveMessage(null);
    setValidationError(null);
    setMissingFields([]);
    setLastSavedContractRef(null);

    try {
      const signedDateIso = contractSignedDate.trim() || null;

      // Snapshot chainu nadřízených k datu sjednání (timeline) – uložíme k záznamu
      let mgrEmail = managerEmailSnapshot;
      let mgrPos = managerPositionSnapshot;
      let mgrMode = managerModeSnapshot;
      let managerChainForSave: ManagerChainSnapshotEntry[] = managerChainSnapshot;
      try {
        const snapshot = await requestManagerSnapshotWithAuth({
          user,
          signedDateIso,
        });
        mgrEmail = snapshot.managerEmail ?? mgrEmail ?? null;
        mgrPos = snapshot.managerPosition ?? mgrPos ?? null;
        mgrMode = snapshot.managerMode ?? mgrMode ?? null;
        if (snapshot.managerChain.length > 0) {
          managerChainForSave = snapshot.managerChain;
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

      if (!hasResolvedTopManagerPosition(managerChainForSave, mgrEmail)) {
        const msg =
          "Nepodařilo se načíst pozici nadřízeného. Smlouvu teď neuložím, aby nechyběla meziprovize.";
        setValidationError(msg);
        setSaveMessage(msg);
        return;
      }

      const { response, data } = await requestContractsMutationWithAuth({
        user,
        path: "/api/contracts",
        method: "POST",
        payload: {
          entry: {
            productKey: product,
            entryType: "contract" as ContractEntryType,
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
            clientName: clientName || null,
            contractSignedDate: contractSignedDate.trim(),
            policyStartDate: policyStartDate.trim(),
            policyEndDate: policyEndDate.trim() || null,
            durationYears: shouldShowDuration(product) ? durationYears : null,
            durationMonths:
              shouldShowDurationMonths(product) ? normalizedDurationMonths(product, durationMonths) : null,
            maxCizinKomplexVariant:
              product === "maxcizinkomplex" ? maxCizinKomplexVariant : null,
            contractNumber: trimmedContractNumber || null,
            tipContractTipsterEmail: tipContractConfig?.tipsterEmail ?? null,
            tipContractTipsterPercent: tipContractConfig?.tipsterPercent ?? null,
            carMake:
              product === "cppAuto" ||
              product === "slaviaauto" ||
              product === "kooperativaAuto" ||
              product === "allianzAuto" ||
              product === "csobAuto" ||
              product === "pillowAuto"
                ? autoCarMake.trim() || null
                : null,
            carPlate:
              product === "cppAuto" ||
              product === "slaviaauto" ||
              product === "kooperativaAuto" ||
              product === "allianzAuto" ||
              product === "csobAuto" ||
              product === "pillowAuto"
                ? autoCarPlate.trim() || null
                : null,
            carVin:
              product === "cppAuto" ||
              product === "slaviaauto" ||
              product === "kooperativaAuto" ||
              product === "allianzAuto" ||
              product === "csobAuto" ||
              product === "pillowAuto"
                ? autoCarVin.trim() || null
                : null,
            carTp: product === "slaviaauto" ? autoCarTp.trim() || null : null,
            carOrv:
              product === "cppAuto" ||
              product === "slaviaauto" ||
              product === "kooperativaAuto" ||
              product === "allianzAuto" ||
              product === "csobAuto" ||
              product === "pillowAuto"
                ? autoCarOrv.trim() || null
                : null,
            carAnnualMileage:
              product === "allianzAuto" || product === "pillowAuto"
                ? autoCarAnnualMileage.trim() || null
                : null,
            carAllianzScope:
              product === "allianzAuto" ? autoCarAllianzScope.trim() || null : null,
            carLiabilityLimit:
              product === "cppAuto" ||
              product === "slaviaauto" ||
              product === "kooperativaAuto" ||
              product === "allianzAuto" ||
              product === "csobAuto" ||
              product === "pillowAuto"
                ? autoCarLiabilityLimit
                : null,
            carHullSumInsured:
              product === "kooperativaAuto" ||
              product === "pillowAuto" ||
              product === "csobAuto"
                ? autoCarHullSumInsured
                : null,
            carHullSumInsuredText:
              product === "pillowAuto" ? autoCarHullSumInsuredText.trim() || null : null,
            carHullDeductible:
              product === "kooperativaAuto" ||
              product === "cppAuto" ||
              product === "allianzAuto" ||
              product === "csobAuto" ||
              product === "pillowAuto"
                ? autoCarHullDeductible
                : null,
            carHullDeductibleText:
              product === "kooperativaAuto" ||
              product === "cppAuto" ||
              product === "allianzAuto" ||
              product === "csobAuto" ||
              product === "pillowAuto"
                ? autoCarHullDeductibleText.trim() || null
                : null,
            carHullRiskAccident:
              product === "kooperativaAuto" ||
              product === "cppAuto" ||
              product === "allianzAuto" ||
              product === "pillowAuto"
                ? autoCarHullRiskAccident
                : null,
            carHullRiskTheft:
              product === "kooperativaAuto" ||
              product === "cppAuto" ||
              product === "allianzAuto" ||
              product === "pillowAuto"
                ? autoCarHullRiskTheft
                : null,
            carHullRiskNatural:
              product === "kooperativaAuto" ||
              product === "cppAuto" ||
              product === "allianzAuto" ||
              product === "pillowAuto"
                ? autoCarHullRiskNatural
                : null,
            carHullRiskVandalism:
              product === "kooperativaAuto" ||
              product === "cppAuto" ||
              product === "allianzAuto" ||
              product === "pillowAuto"
                ? autoCarHullRiskVandalism
                : null,
            carHullRiskAnimalCollision:
              product === "kooperativaAuto" ||
              product === "cppAuto" ||
              product === "allianzAuto" ||
              product === "pillowAuto"
                ? autoCarHullRiskAnimalCollision
                : null,
            carAssistancePlan:
              product === "kooperativaAuto" ||
              product === "cppAuto" ||
              product === "allianzAuto" ||
              product === "csobAuto" ||
              product === "pillowAuto"
                ? autoCarAssistancePlan.trim() || null
                : null,
            carAddonEso: product === "cppAuto" ? autoCarAddonEso : null,
            carAddonGlass:
              product === "cppAuto" ||
              product === "slaviaauto" ||
              product === "kooperativaAuto" ||
              product === "allianzAuto" ||
              product === "csobAuto" ||
              product === "pillowAuto"
                ? autoCarAddonGlass
                : null,
            carAddonAnimalCollision:
              product === "slaviaauto" ? autoCarAddonAnimalCollision : null,
            carAddonAnimalDamage:
              product === "slaviaauto" ||
              product === "kooperativaAuto" ||
              product === "allianzAuto"
                ? autoCarAddonAnimalDamage
                : null,
            carAddonVandalism:
              product === "slaviaauto" || product === "allianzAuto"
                ? autoCarAddonVandalism
                : null,
            carAddonTheft: product === "allianzAuto" ? autoCarAddonTheft : null,
            carAddonNatural:
              product === "kooperativaAuto" || product === "allianzAuto"
                ? autoCarAddonNatural
                : null,
            carAddonGap: product === "allianzAuto" ? autoCarAddonGap : null,
            carAddonFireExplosion:
              product === "allianzAuto" ? autoCarAddonFireExplosion : null,
            carAddonLegalAdvice:
              product === "allianzAuto" ? autoCarAddonLegalAdvice : null,
            carAddonReplacementCar:
              product === "kooperativaAuto" ? autoCarAddonReplacementCar : null,
            carAddonLuggage:
              product === "kooperativaAuto" ? autoCarAddonLuggage : null,
            carAddonTransportedGoods:
              product === "kooperativaAuto" ? autoCarAddonTransportedGoods : null,
            carAddonPothole:
              product === "kooperativaAuto" ? autoCarAddonPothole : null,
            carAddonNonFaultAccident:
              product === "kooperativaAuto" || product === "pillowAuto"
                ? autoCarAddonNonFaultAccident
                : null,
            carAddonKeyLossTheft:
              product === "slaviaauto" ? autoCarAddonKeyLossTheft : null,
            domexDetail:
              product === "domex"
                ? {
                    address: domexAddress.trim() || null,
                    propertyType: domexPropertyType.trim() || null,
                    propertyCoverage: domexPropertyCoverage.trim() || null,
                    sumInsured: domexPropertySumInsured,
                    deductible: domexPropertyDeductible,
                    householdType: domexHouseholdType.trim() || null,
                    householdCoverage: domexHouseholdCoverage.trim() || null,
                    householdSumInsured: domexHouseholdSumInsured,
                    householdDeductible: domexHouseholdDeductible,
                    outbuildingSumInsured: null,
                    liabilitySumInsured: domexLiabilitySumInsured,
                    liabilityDeductible: domexLiabilityDeductible,
                    liabilityMobile: domexLiabilityMobile ? true : null,
                    liabilityTenant: domexLiabilityTenant ? true : null,
                    liabilityLandlord: domexLiabilityLandlord ? true : null,
                    assistancePlus: domexAssistancePlus ? true : null,
                    note: null,
                  }
                : null,
            isRefresh: shouldRefreshOriginalNeon,
            refreshOriginalContractNumber: null,
          },
        },
      });
      const apiError = getContractsMutationError({
        response,
        data,
        fallback: "Uložení smlouvy selhalo.",
      });
      if (apiError) {
        setSaveMessage(apiError);
        return;
      }

      const createdEntryId =
        typeof data?.entryId === "string" ? data.entryId.trim() : "";
      const ownerEmail = (user.email ?? "").trim().toLowerCase();
      if (createdEntryId && ownerEmail) {
        setLastSavedContractRef({
          ownerEmail,
          entryId: createdEntryId,
        });
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
        setSaveMessage("Smlouva byla uložena a označena jako Refresh.");
      } else {
        setSaveMessage("Smlouva byla uložena mezi sepsané.");
      }
      setSaveSuccessFlash({
        contractNumber: contractNumber.trim() || null,
        clientName: clientName.trim() || null,
      });
      setRefreshOriginalOpen(false);
    } catch (error) {
      const errorMessage =
        error instanceof Error && error.message.trim().length > 0
          ? error.message.trim()
          : "Nepodařilo se uložit smlouvu. Zkus to prosím za chvíli znovu.";
      console.error("Chyba při ukládání smlouvy:", errorMessage);
      setSaveMessage(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!saveSuccessFlash) return;
    const t = window.setTimeout(() => setSaveSuccessFlash(null), 3200);
    return () => window.clearTimeout(t);
  }, [saveSuccessFlash]);

  useEffect(() => {
    if (!showCoefModal || product !== "neon") return;
    setNeonCoefficientView(isNeonHistoricalBySignedDate ? "historical" : "current");
  }, [showCoefModal, product, isNeonHistoricalBySignedDate]);

  useEffect(() => {
    return () => {
      if (neonPreviewObjectUrlRef.current) {
        URL.revokeObjectURL(neonPreviewObjectUrlRef.current);
        neonPreviewObjectUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!showCoefModal || product !== "neon" || !user || !neonPreviewImageUrl) {
      if (neonPreviewObjectUrlRef.current) {
        URL.revokeObjectURL(neonPreviewObjectUrlRef.current);
        neonPreviewObjectUrlRef.current = null;
      }
      setNeonPreviewBlobUrl(null);
      setNeonPreviewLoading(false);
      setNeonPreviewError(null);
      return;
    }

    let cancelled = false;
    setNeonPreviewLoading(true);
    setNeonPreviewError(null);

    const loadPreview = async () => {
      try {
        const response = await requestBlobWithAuth({
          user,
          path: neonPreviewImageUrl,
        });
        if (!response.ok) {
          throw new Error(`Nepodařilo se načíst náhled (${response.status}).`);
        }

        const previewBlob = await response.blob();
        const blobUrl = URL.createObjectURL(previewBlob);

        if (cancelled) {
          URL.revokeObjectURL(blobUrl);
          return;
        }

        if (neonPreviewObjectUrlRef.current) {
          URL.revokeObjectURL(neonPreviewObjectUrlRef.current);
        }
        neonPreviewObjectUrlRef.current = blobUrl;
        setNeonPreviewBlobUrl(blobUrl);
      } catch (err) {
        const errorMessage =
          err instanceof Error && err.message.trim().length > 0
            ? err.message.trim()
            : "Nepodařilo se načíst náhled provizních podmínek.";
        if (!cancelled) {
          setNeonPreviewError(errorMessage);
          setNeonPreviewBlobUrl(null);
        }
      } finally {
        if (!cancelled) {
          setNeonPreviewLoading(false);
        }
      }
    };

    loadPreview();

    return () => {
      cancelled = true;
    };
  }, [showCoefModal, product, user, neonPreviewImageUrl]);

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
  const showPolicyEndDateField = product === "cppcestovko";
  const lastSavedContractHref = lastSavedContractRef
    ? `/smlouvy/${encodeURIComponent(
        `${lastSavedContractRef.ownerEmail}___${lastSavedContractRef.entryId}`
      )}?from=list`
    : null;
  const currentProduct = PRODUCT_OPTIONS.find((p) => p.id === product)!;
  const currentProductInstitutionId = productInstitutionIdFromCatalog(product);
  const activeProductPickerColumn =
    PRODUCT_PICKER_COLUMN_BY_KEY.get(productPickerSection) ?? PRODUCT_PICKER_COLUMNS[0];
  const productPickerSearchQuery = normalizeProductPickerSearch(productSearchText);
  const allProductPickerProducts = PRODUCT_PICKER_COLUMNS.flatMap((column) => column.products);
  const isGlobalProductSearch = productPickerSearchQuery.length > 0;
  const filteredSectionProducts = (() => {
    const sourceProducts = isGlobalProductSearch
      ? allProductPickerProducts
      : activeProductPickerColumn.products;
    if (!productPickerSearchQuery) return sourceProducts;

    return sourceProducts.filter((productId) => {
      const option = PRODUCT_OPTION_BY_ID.get(productId);
      const haystack = normalizeProductPickerSearch(
        [option?.label ?? productLabel(productId), productInstitutionLabel(productId)].join(" ")
      );
      return haystack.includes(productPickerSearchQuery);
    });
  })();
  const durationHelp = durationTooltip(product, isNeonHistoricalBySignedDate);
  const canChooseMode =
    isLifeProduct &&
    userCommissionMode === "accelerated" &&
    !(product === "neon" && isNeonHistoricalBySignedDate);

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
        return calculateNeon(
          val,
          pos,
          years,
          usedMode,
          contractSignedDateForNeon
        );
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
      case "maxcizinkomplex":
        return calculateMaxCizinKomplex(val, pos, maxCizinKomplexVariant);
      case "pillowInjury":
        return calculatePillowInjury(val, pos, usedMode);
      case "domex":
      case "cpphafan":
      case "koopmajetekobcan": {
        const dto =
          product === "domex"
            ? calculateDomex(val, freq, pos)
            : product === "cpphafan"
            ? calculateCppHafan(val, freq, pos)
            : calculateKoopMajetekObcan(val, freq, pos);
        const filtered = dto.items.filter((i) =>
          (i.title ?? "").toLowerCase().includes("(z platby)")
        );
        const totals = paymentBasedTotals(filtered, paymentsPerYear(freq));
        return { items: filtered, total: totals.immediate + totals.subsequent };
      }
      case "pillowmajetek":
        return calculatePillowMajetek(val, freq, pos);
      case "maxdomov": {
        const dto = calculateMaxdomov(val, freq, pos);
        const filtered = dto.items.filter((i) =>
          (i.title ?? "").toLowerCase().includes("(z platby)")
        );
        const totals = paymentBasedTotals(filtered, paymentsPerYear(freq));
        return { items: filtered, total: totals.immediate + totals.subsequent };
      }
      case "allianzmujdomov":
        return calculateAllianzMujDomov(val, freq, pos);
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
      case "koopcestovko":
        return calculateKoopCestovko(val, pos);
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

      {tipContractModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setTipContractModalOpen(false)}
          />
          <div className="relative w-full max-w-lg rounded-2xl border border-slate-300 bg-white p-5 shadow-[0_20px_70px_rgba(0,0,0,0.35)] space-y-4">
            <div className="space-y-2">
              <h3 className="text-base font-semibold text-slate-900">Smlouva z TIPU</h3>
              <p className="text-sm text-slate-700">
                Tipař má nárok pouze na % z okamžité provize v 1. roce.
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-xs uppercase tracking-wide text-slate-600">
                Podíl pro tipaře
              </label>
              <select
                value={tipContractDraftPercent}
                onChange={(e) =>
                  setTipContractDraftPercent(clampTipContractPercent(Number(e.target.value)))
                }
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
              >
                {TIP_CONTRACT_PERCENT_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value} %
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-xs uppercase tracking-wide text-slate-600">
                E-mail tipaře (volitelné)
              </label>
              <input
                type="email"
                value={tipContractDraftEmail}
                onChange={(e) => setTipContractDraftEmail(e.target.value)}
                placeholder="napr. tipar@bohemika.cz"
                className={`w-full rounded-xl border px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:border-slate-900 ${
                  tipContractLookupState.status === "found"
                    ? "border-emerald-400 bg-emerald-50 focus:ring-emerald-600"
                    : "border-slate-300 bg-white focus:ring-slate-900"
                }`}
              />
              {tipContractLookupState.status === "checking" && (
                <p className="text-xs text-slate-500">Ověřuji uživatele…</p>
              )}
              {tipContractLookupState.status === "found" && (
                <p className="text-xs text-emerald-700">
                  Uživatel nalezen:{" "}
                  <strong>
                    {tipContractLookupState.name ?? tipContractLookupState.email}
                  </strong>
                </p>
              )}
              {tipContractLookupState.status === "notFound" && (
                <p className="text-xs text-rose-700">Uživatel s tímto e-mailem nebyl nalezen.</p>
              )}
              {tipContractLookupState.status === "error" && (
                <p className="text-xs text-rose-700">{tipContractLookupState.message}</p>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              <p>
                Příklad: pokud je okamžitá provize v 1. roce {formatMoneyResult(
                  tipContractImmediateGrossFirstYear
                )}
                , tipař dostane {tipContractDraftPercent} % a tobě zůstane{" "}
                {formatMoneyResult(
                  roundToCents(
                    tipContractImmediateGrossFirstYear *
                      (1 - clampTipContractPercent(tipContractDraftPercent) / 100)
                  )
                )}
                .
              </p>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              {tipContractConfig && (
                <button
                  type="button"
                  onClick={clearTipContractSettings}
                  className="rounded-full border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 transition"
                >
                  Vypnout TIP
                </button>
              )}
              <button
                type="button"
                onClick={() => setTipContractModalOpen(false)}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-900 hover:bg-slate-100 transition"
              >
                Zrušit
              </button>
              <button
                type="button"
                onClick={applyTipContractSettings}
                disabled={
                  (() => {
                    const normalizedDraftEmail = tipContractDraftEmail.trim().toLowerCase();
                    if (!normalizedDraftEmail) return false;
                    return (
                      tipContractLookupState.status !== "found" ||
                      tipContractLookupState.email !== normalizedDraftEmail
                    );
                  })()
                }
                className="rounded-full border border-slate-900 bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                Použít
              </button>
            </div>
          </div>
        </div>
      )}

      {productOpen && (
        <div className="fixed inset-0 z-[120]">
          <button
            type="button"
            onClick={() => setProductOpen(false)}
            className="absolute inset-0 bg-transparent"
            aria-label="Zavřít výběr produktu"
          />
          <div className="pointer-events-none absolute inset-x-0 top-1/2 z-[121] -translate-y-1/2">
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Výběr produktu"
              className="pointer-events-auto w-full border-y border-slate-300 bg-white shadow-[0_22px_70px_rgba(2,6,23,0.22)]"
            >
              <div className="space-y-4 border-b border-slate-200 bg-white px-5 py-5 sm:px-10">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="inline-flex rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-700">
                    {currentProduct.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => setProductOpen(false)}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-slate-100 transition"
                  >
                    <X size={14} strokeWidth={2} aria-hidden="true" />
                    Zavřít
                  </button>
                </div>

                <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                  <label className="flex w-full items-center gap-2 rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 lg:w-[230px] lg:flex-none">
                    <Search size={13} className="text-slate-400" aria-hidden="true" />
                    <input
                      type="text"
                      value={productSearchText}
                      onChange={(e) => setProductSearchText(e.target.value)}
                      aria-label="Hledat produkt"
                      placeholder="Hledat produkt"
                      className="w-full bg-transparent text-xs text-slate-900 placeholder:text-slate-400 outline-none"
                    />
                  </label>

                  <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-gutter:stable_both-edges] [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar-track]:bg-slate-100 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-thumb:hover]:bg-slate-400">
                    <div className="flex min-w-max items-center gap-2 pb-1">
                      {PRODUCT_PICKER_COLUMNS.map((column) => {
                        const sectionActive = column.key === activeProductPickerColumn.key;
                        return (
                          <button
                            key={column.key}
                            type="button"
                            onClick={() => setProductPickerSection(column.key)}
                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                              sectionActive
                                ? "border-slate-900 bg-slate-900 text-white"
                                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                            }`}
                          >
                            <span>{column.title}</span>
                            <span
                              className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                                sectionActive
                                  ? "bg-white text-slate-900"
                                  : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {column.products.length}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-5 pb-6 pt-5 sm:px-10">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
                    {isGlobalProductSearch
                      ? "Výsledky hledání (všechny kategorie)"
                      : activeProductPickerColumn.title}
                  </h3>
                  <span className="text-xs font-medium text-slate-500">
                    {filteredSectionProducts.length} /{" "}
                    {isGlobalProductSearch
                      ? allProductPickerProducts.length
                      : activeProductPickerColumn.products.length}
                  </span>
                </div>

                {!isGlobalProductSearch && activeProductPickerColumn.products.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
                    {activeProductPickerColumn.emptyText ?? "Zatím bez produktů."}
                  </div>
                ) : filteredSectionProducts.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
                    Pro tento filtr jsme nic nenašli.
                  </div>
                ) : (
                  <div className="max-h-[46vh] overflow-y-auto pr-1">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {filteredSectionProducts.map((productId) => {
                        const option = PRODUCT_OPTION_BY_ID.get(productId);
                        if (!option) return null;
                        const isActive = productId === product;
                        const unsupportedText = SUPPORTED_PRODUCTS.includes(productId)
                          ? null
                          : "zatím bez výpočtu";

                        return (
                          <button
                            key={productId}
                            type="button"
                            onClick={() => {
                              setProduct(productId);
                              setPdfClientNameLoaded(false);
                              setPdfMatchedClientName(false);
                              setProductOpen(false);
                            }}
                            className={`relative rounded-2xl border bg-white px-4 py-3 text-left font-mono shadow-[0_8px_20px_rgba(15,23,42,0.08)] transition hover:border-slate-400 hover:bg-slate-50 ${
                              isActive
                                ? "border-slate-900 ring-2 ring-slate-900/25"
                                : "border-slate-200"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="flex min-w-0 items-center gap-3">
                                <span
                                  className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white ${productLogoFrameClass(
                                    productId
                                  )}`}
                                >
                                  <Image
                                    src={productInstitutionLogo(productId)}
                                    alt=""
                                    fill
                                    className={productLogoScaleClass(productId)}
                                  />
                                </span>
                                <span className="min-w-0">
                                  <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                    {productInstitutionLabel(productId)}
                                  </span>
                                  <span className="block truncate text-sm font-semibold text-slate-900">
                                    {option.label}
                                  </span>
                                </span>
                              </span>
                              <span
                                className={`inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border text-xs ${
                                  isActive
                                    ? "border-slate-900 bg-slate-900 text-white"
                                    : "border-slate-300 bg-white text-transparent"
                                }`}
                              >
                                ✓
                              </span>
                            </div>
                            {unsupportedText && (
                              <div className="mt-2">
                                <span className="inline-flex rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800">
                                  {unsupportedText}
                                </span>
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
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
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      if (productOpen) {
                        setProductOpen(false);
                        return;
                      }
                      setProductPickerSection(productPickerSectionForProduct(product));
                      setProductSearchText("");
                      setProductOpen(true);
                    }}
                    className="flex w-full items-center justify-between rounded-xl border border-slate-300 bg-white text-slate-900 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <div
                        className={`relative flex-shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white ${institutionLogoFrameClass(
                          currentProductInstitutionId,
                          "chip"
                        )}`}
                      >
                        <Image
                          src={productInstitutionLogo(product)}
                          alt=""
                          fill
                          className={institutionLogoImageClass(currentProductInstitutionId)}
                        />
                      </div>
                      <span className="flex min-w-0 flex-col items-start text-left leading-tight">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Vyber produkt
                        </span>
                        <span className="truncate font-medium">{currentProduct.label}</span>
                      </span>
                    </span>
                    <span className="ml-3 text-xs text-slate-400">
                      {productOpen ? "Skrýt" : "Otevřít"}
                    </span>
                  </button>
                </div>
              </div>

              {canImportFromPdf && (
                <div className="space-y-2">
                  <div
                    className={`ui-card ui-card-quiet flex h-full items-center justify-between gap-3 rounded-xl border-2 border-dashed px-3 py-2.5 transition ${
                      pdfDropActive
                        ? "border-slate-900 bg-slate-100"
                        : "border-slate-300 bg-white"
                    }`}
                    onDragEnter={handlePdfDragEnter}
                    onDragOver={handlePdfDragOver}
                    onDragLeave={handlePdfDragLeave}
                    onDrop={handlePdfDrop}
                  >
                    <div className="text-sm font-semibold text-slate-900">
                      Nahraj smlouvu PDF nebo ji přetáhni sem.
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
                      onChange={(e) => {
                        resetPdfDropState();
                        handlePdfImport(e.target.files?.[0] ?? null);
                      }}
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

              {product === "maxcizinkomplex" && (
                <div className="space-y-1">
                  <label className="block text-sm font-medium">Varianta produktu</label>
                  <select
                    className="w-full rounded-xl border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
                    value={maxCizinKomplexVariant}
                    onChange={(e) =>
                      setMaxCizinKomplexVariant(e.target.value as MaxCizinKomplexVariant)
                    }
                  >
                    {MAX_CIZIN_KOMPLEX_VARIANT_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {shouldShowDurationMonths(product) && (
                <div className="space-y-1">
                  <label className="block text-sm font-medium">
                    Doba trvání smlouvy (měsíce)
                  </label>
                  <input
                    type="number"
                    min={durationMonthsRange(product)[0]}
                    max={durationMonthsRange(product)[1]}
                    className={`w-full rounded-xl border bg-white text-slate-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 ${
                      missingFields.includes("dobu trvání v měsících")
                        ? "border-rose-400/70"
                        : "border-slate-300"
                    }`}
                    value={durationMonths ?? ""}
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      if (!raw) {
                        setDurationMonths(null);
                        return;
                      }
                      const parsed = Number(raw);
                      if (!Number.isFinite(parsed)) {
                        setDurationMonths(null);
                        return;
                      }
                      setDurationMonths(
                        normalizedDurationMonths(product, parsed)
                      );
                    }}
                    placeholder="Např. 12"
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

              {!tipsterModeEnabled && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={openTipContractModal}
                      className={`ui-btn-primary ui-focus inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition ${
                        tipContractConfig
                          ? "border-emerald-600 bg-emerald-600 text-white hover:border-emerald-700 hover:bg-emerald-700"
                          : ""
                      }`}
                    >
                      {tipContractConfig ? "Smlouva z TIPU ✓" : "Smlouva z TIPU"}
                    </button>
                    {isLifeProduct && product === "neon" && (
                      <button
                        type="button"
                        onClick={() => setRefreshOriginalOpen((v) => !v)}
                        className={`ui-btn-primary ui-focus inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition ${
                          refreshOriginalOpen
                            ? "border-emerald-600 bg-emerald-600 text-white hover:border-emerald-700 hover:bg-emerald-700"
                            : ""
                        }`}
                      >
                        <RefreshCcw size={14} strokeWidth={2} className="shrink-0" aria-hidden="true" />
                        {refreshOriginalOpen ? "Refresh zapnutý" : "Refresh smlouvy"}
                      </button>
                    )}
                    {isLifeProduct && (
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
                    )}
                  </div>
                  {isLifeProduct && product === "neon" && refreshOriginalOpen && (
                    <p className="text-[11px] text-slate-600">
                      Při uložení se nová smlouva označí jako Refresh.
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
                  className={`w-full rounded-xl border bg-white text-slate-900 px-3 py-2 text-sm outline-none focus:ring-2 ${
                    missingFields.includes("jméno klienta")
                      ? "border-rose-400/70 focus:ring-rose-500 focus:border-rose-500"
                      : pdfMatchedClientName
                      ? "border-emerald-400 bg-emerald-50 focus:ring-emerald-600 focus:border-emerald-600"
                      : "border-slate-300 focus:ring-slate-900 focus:border-slate-900"
                  }`}
                  value={clientName}
                  onChange={(e) => {
                    setClientName(e.target.value);
                    setPdfClientNameLoaded(false);
                    setPdfMatchedClientName(false);
                    setClientSuggestionsOpen(true);
                  }}
                  placeholder="Např. Jan Novák"
                  autoComplete="off"
                  onFocus={() => setClientSuggestionsOpen(true)}
                  onBlur={() => setTimeout(() => setClientSuggestionsOpen(false), 100)}
                />
                {pdfClientNameLoaded && !missingFields.includes("jméno klienta") && (
                  <p
                    className={`mt-1 text-[11px] ${
                      pdfMatchedClientName ? "text-emerald-700" : "text-slate-600"
                    }`}
                  >
                    {pdfMatchedClientName
                      ? "Jméno klienta načteno z PDF. Nalezena shoda s klientem v systému."
                      : "Jméno klienta načteno z PDF. V systému zatím bez přesné shody."}
                  </p>
                )}
                {filteredClientSuggestions.length > 0 && clientSuggestionsOpen && (
                  <div className="absolute z-30 mt-1 w-full rounded-xl border border-slate-300 bg-white backdrop-blur-2xl shadow-[0_14px_40px_rgba(0,0,0,0.7)] overflow-hidden">
                    {filteredClientSuggestions.map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => {
                          setClientName(name);
                          setPdfClientNameLoaded(false);
                          setPdfMatchedClientName(false);
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
                {contractNumberLiveCheck.status === "checking" && (
                  <p className="text-[11px] text-slate-500">
                    Kontroluji duplicitu čísla smlouvy…
                  </p>
                )}
                {contractNumberLiveCheck.status === "duplicate" && (
                  <p className="text-[11px] text-rose-700">
                    Smlouva s tímto číslem už existuje ({contractNumberLiveCheck.count}×).
                  </p>
                )}
                {contractNumberLiveCheck.status === "error" && (
                  <p className="text-[11px] text-amber-700">
                    Nepodařilo se ověřit duplicitu čísla smlouvy.
                  </p>
                )}
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

              {showPolicyEndDateField && (
                <div className="space-y-1">
                  <label className="block text-sm font-medium">
                    Pojištění do (volitelné)
                  </label>
                  <input
                    type="date"
                    className="w-full rounded-xl border border-slate-300 bg-white text-slate-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
                    value={policyEndDate}
                    onChange={(e) => setPolicyEndDate(e.target.value)}
                  />
                </div>
              )}
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

                {product === "neon" && isNeonHistoricalBySignedDate && (
                  <div className="space-y-1">
                    <label className="block text-sm font-medium">
                      Režim provize
                    </label>
                    <p className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
                      U NEON smluv sjednaných od 01.10.2019 do 30.06.2024 se
                      režim zrychlený/běžný nepoužívá.
                    </p>
                  </div>
                )}
              </section>
            )}
          </div>

          {/* Výsledky */}
          <div className="self-start space-y-3 lg:sticky lg:top-6">
            <section className="ui-card rounded-3xl bg-white px-5 py-4 space-y-3 overflow-hidden">
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
                  className={`ui-btn-secondary ui-focus inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs sm:text-sm ${
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

            {tipContractConfig && !tipsterModeEnabled && (
              <p className="text-xs text-emerald-700">
                Aktivní Smlouva z TIPU: {tipContractConfig.tipsterPercent} % z okamžité provize v
                1. roce pro{" "}
                {tipContractConfig.tipsterName ??
                  tipContractConfig.tipsterEmail ??
                  "neoznačeného tipaře"}
                .
              </p>
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

                  {tipContractConfig && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-slate-900 space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                        Smlouva z TIPU
                      </p>
                      <div className="flex items-center justify-between text-sm">
                        <span>Okamžitá v 1. roce (brutto)</span>
                        <span className="font-semibold">
                          {formatMoneyResult(tipContractImmediateGrossFirstYear)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span>Podíl tipaře ({tipContractConfig.tipsterPercent} %)</span>
                        <span className="font-semibold text-rose-700">
                          −{formatMoneyResult(tipContractTipsterAmountFirstYear)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span>Okamžitá v 1. roce po TIPU</span>
                        <span className="font-bold text-emerald-800">
                          {formatMoneyResult(tipContractImmediateNetFirstYear)}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="pt-2 flex items-center justify-between">
                    {(product === "domex" ||
                      product === "cpphafan" ||
                      product === "koopmajetekobcan" ||
                      product === "maxdomov") &&
                    paymentBasedTotalsMemo ? (
                      <div className="w-full space-y-1 text-slate-900">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">
                            Celkem v 1. roce{tipContractConfig ? " po TIPU" : ""}
                          </span>
                          <span className="text-2xl sm:text-3xl font-bold text-slate-900">
                            {formatMoneyResult(
                              tipContractConfig
                                ? tipContractImmediateNetFirstYear
                                : paymentBasedTotalsMemo.immediate
                            )}
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
                        <span className="font-semibold text-slate-900">
                          Celkem{tipContractConfig ? " po TIPU" : ""}
                        </span>
                        <span className="text-2xl sm:text-3xl font-bold text-slate-900">
                          {formatMoneyResult(tipContractConfig ? tipContractTotalNet : total)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              );
            })()}
            </section>
            {!tipsterModeEnabled && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSaveContract()}
                  disabled={saving || items.length === 0 || parseNumber(amountText) <= 0}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-700 bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <CheckCircle2 size={16} strokeWidth={2} className="shrink-0" aria-hidden="true" />
                  {saving ? "Ukládám…" : "Sepsáno"}
                </button>
                {lastSavedContractHref && (
                  <Link
                    href={lastSavedContractHref}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
                  >
                    <FileText size={16} strokeWidth={2} className="shrink-0" aria-hidden="true" />
                    Zobrazit smlouvu
                  </Link>
                )}
              </div>
            )}
          </div>
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
              showAutoTermsPreview || showNeonTermsPreview ? "max-w-6xl" : "max-w-md"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-semibold text-slate-900">Koeficienty</h3>
              <button
                type="button"
                onClick={() => setShowCoefModal(false)}
                className="rounded-full px-2 text-slate-500 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                aria-label="Zavřít"
              >
                ×
              </button>
            </div>

            <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm text-slate-600">
                  {product ? productLabel(product) : "—"} · pozice {positionLabel(position)}{" "}
                  {product === "neon" && isNeonHistoricalInCoefModal
                    ? "· historické podmínky (bez režimu)"
                    : `· režim ${mode}`}
                </p>
                {product === "neon" && (
                  <p className="text-xs font-semibold text-rose-700">
                    {isNeonHistoricalInCoefModal
                      ? "Historické koeficienty – platnost 01.10.2019 až 30.06.2024"
                      : "Aktuální koeficienty – platnost od 01.07.2024"}
                  </p>
                )}
                {product && isAutoProduct(product) && (
                  <p className="text-xs font-semibold text-rose-700">
                    Provizní podmínky aktuální od 01.04.2026
                  </p>
                )}
              </div>

              {product === "neon" && (
                <div className="inline-flex items-center gap-1 rounded-xl border border-slate-300 bg-slate-50 p-1">
                  <button
                    type="button"
                    onClick={() => setNeonCoefficientView("current")}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                      neonCoefficientView === "current"
                        ? "bg-slate-900 text-white"
                        : "text-slate-600 hover:bg-white"
                    }`}
                  >
                    Aktuální
                  </button>
                  <button
                    type="button"
                    onClick={() => setNeonCoefficientView("historical")}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                      neonCoefficientView === "historical"
                        ? "bg-slate-900 text-white"
                        : "text-slate-600 hover:bg-white"
                    }`}
                  >
                    Historické
                  </button>
                </div>
              )}
            </div>

            <div
              className={`mt-4 ${
                showNeonTermsPreview
                  ? "grid gap-4 lg:grid-cols-[minmax(320px,0.68fr)_minmax(620px,1.32fr)]"
                  : ""
              }`}
            >
              <section className="order-1 rounded-xl border border-slate-300 bg-slate-50 p-3 space-y-3">
                {product === "neon" ? (
                  <div className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs leading-relaxed text-slate-700">
                    <p className="font-bold uppercase tracking-wide text-slate-900">
                      JAK FUNGUJE VÝPOČET?
                    </p>
                    <p className="mt-1">
                      Měsíční pojistné x 12 x doba trvání smlouvy (maximálně{" "}
                      {isNeonHistoricalInCoefModal ? "20" : "15"}) x koeficient %.
                    </p>
                    <p className="mt-1">
                      Pro následnou a pečovatelskou provizi: pojistné x 12 x
                      koeficient %.
                    </p>
                  </div>
                ) : (
                  coefExplanation && (
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {coefExplanation}
                    </p>
                  )
                )}

                {product &&
                  (product === "neon" ||
                    product === "flexi" ||
                    product === "maximaMaxEfekt" ||
                    product === "pillowInjury") && (
                    <p className="text-xs font-semibold text-rose-700">
                      UPOZORNĚNÍ: Výpočet okamžité provize počítá s tím, že je
                      zpracována karta klienta dle podmínek!
                    </p>
                  )}
                {neonImmediatePayoutInfo && (
                  <p className="text-xs text-slate-700 leading-relaxed">
                    {neonImmediatePayoutInfo}
                  </p>
                )}

                <div className="space-y-2 pt-1">
                  {coefList.length > 0 ? (
                    coefList.map((c, idx) => (
                      <div
                        key={`${c.label}-${idx}`}
                        className="flex w-full max-w-[500px] items-center justify-between rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
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
                  <div className="rounded-xl border border-slate-300 bg-slate-50 p-2 sm:p-3">
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
              </section>

              {showNeonTermsPreview && neonTermsPreviewUrl && (
                <aside className="order-2 rounded-xl border border-slate-300 bg-slate-50 p-2 sm:p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Provizní podmínky NEON
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleNeonDocumentAction("download")}
                      disabled={neonDocAction !== null}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Download size={12} strokeWidth={2} className="shrink-0" aria-hidden="true" />
                      {neonDocAction === "download"
                        ? "Stahuji..."
                        : "Stáhnout provizní podmínky"}
                    </button>
                  </div>
                  <div className="mb-2 text-[11px] text-slate-600">
                    <button
                      type="button"
                      onClick={() => void handleNeonDocumentAction("open")}
                      disabled={neonDocAction !== null}
                      className="font-semibold underline underline-offset-2 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {neonDocAction === "open"
                        ? "Otevírám PDF..."
                        : "Kompletní PDF: Otevřít v nové kartě"}
                    </button>
                  </div>

                  {neonPreviewError && (
                    <p className="mb-2 text-xs font-semibold text-rose-700">{neonPreviewError}</p>
                  )}

                  <div className="h-[70vh] min-h-[540px] overflow-hidden rounded-lg border border-slate-300 bg-white">
                    {neonPreviewLoading ? (
                      <div className="flex h-full items-center justify-center px-4 text-sm text-slate-600">
                        Načítám náhled provizních podmínek...
                      </div>
                    ) : neonPreviewBlobUrl ? (
                      <img
                        src={neonPreviewBlobUrl}
                        alt={
                          neonCoefficientView === "historical"
                            ? "Náhled provizních podmínek NEON 2019"
                            : "Náhled provizních podmínek NEON 2024"
                        }
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-slate-600">
                        Náhled se nepodařilo načíst.
                      </div>
                    )}
                  </div>
                </aside>
              )}
            </div>
          </div>
        </div>
      )}
      </div>
      </div>
    </AppLayout>
  );
}
