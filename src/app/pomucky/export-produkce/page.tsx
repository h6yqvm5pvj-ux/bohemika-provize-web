// src/app/pomucky/export-produkce/page.tsx
"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

import { AppLayout } from "@/components/AppLayout";
import {
  POSITION_LABELS,
  formatMoney,
  toDate,
} from "@/app/lib/formatters";
import {
  PRODUCT_ORDER,
  hasProductGroup,
  isAutoProduct,
  isComfortProduct,
  isLifeProduct,
  isPropertyProduct,
  isTravelProduct,
  productInstitutionLabel,
  productInstitutionLogo,
  productLabel as productLabelFromCatalog,
} from "@/app/lib/productCatalog";
import { auth } from "../../firebase";

import {
  onAuthStateChanged,
  type User as FirebaseUser,
} from "firebase/auth";

import { type Position, type Product } from "../../types/domain";
import SplitTitle from "../plan-produkce/SplitTitle";
import {
  CalendarDays,
  Download,
  Eye,
  Loader2,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  Tags,
  UserCheck,
  UsersRound,
  X,
} from "lucide-react";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import {
  effectiveUserEmail,
  useEffectiveUserEmail,
} from "@/app/lib/useAdminImpersonation";

/* -------------------- lazy import PDF deps (kvůli Next/SSR) -------------------- */

let html2canvasProPromise: Promise<any> | null = null;
let jsPdfCtorPromise: Promise<any> | null = null;

async function getHtml2CanvasPro() {
  if (!html2canvasProPromise) {
    html2canvasProPromise = import("html2canvas-pro").then(
      (mod: unknown) =>
        (mod as { default?: unknown }).default ??
        (mod as Record<string, unknown>)
    );
  }
  return html2canvasProPromise;
}

async function getJsPdfCtor() {
  if (!jsPdfCtorPromise) {
    jsPdfCtorPromise = import("jspdf").then((mod: unknown) => {
      const typed = mod as {
        jsPDF?: unknown;
        default?: { jsPDF?: unknown } | unknown;
      };
      return (
        typed.jsPDF ??
        (typed.default &&
        typeof typed.default === "object" &&
        "jsPDF" in typed.default
          ? (typed.default as { jsPDF?: unknown }).jsPDF
          : typed.default)
      );
    });
  }
  return jsPdfCtorPromise;
}

/* --------------------------------- typy --------------------------------- */

type DateRangeOption =
  | "currentMonth"
  | "last3"
  | "last6"
  | "last12"
  | "custom";

type ScopeOption = "own" | "ownTeam" | "team" | "selected";

type ProductCategory =
  | "life"
  | "auto"
  | "propertyLiability"
  | "travel"
  | "foreigners"
  | "entrepreneurs"
  | "gold";

type EntryDoc = {
  id: string;
  userEmail?: string | null;
  createdAt?: any;
  contractSignedDate?: any;
  productKey?: Product;
  inputAmount?: number | null;
  frequencyRaw?: string | null;
};

type ContractsApiResponse = {
  ok?: boolean;
  error?: string;
  contracts?: (EntryDoc & { adviserEmail?: string | null })[];
  hasMore?: boolean;
  nextCursorToken?: string | null;
  nextCursor?: number | null;
};

type TeamOverviewMember = {
  email: string;
  name?: string | null;
  position?: Position | null;
  managerEmail?: string | null;
  docId?: string;
};

type TeamOverviewApiResponse = {
  ok?: boolean;
  error?: string;
  position?: Position | null;
  members?: TeamOverviewMember[];
};

type Subordinate = {
  email: string;
  name: string;
  position?: Position | null;
};

type AggregatedStats = {
  lifeMonthly: number;
  lifeAnnual: number;
  lifeContracts: number;
  nonLifeAnnual: number;
  nonLifeContracts: number;
  autoAnnual: number;
  autoContracts: number;
  propertyAnnual: number;
  propertyContracts: number;
  goldTotal: number;
  goldContracts: number;
};

type CategoryReportStats = {
  monthly: number;
  annual: number;
  contracts: number;
};

type PerUserStats = AggregatedStats & {
  email: string;
  name: string;
  positionLabel?: string | null;
};

type UserProfileApiResponse = {
  profile?: {
    fullName?: string | null;
    managerEmail?: string | null;
  };
};

type UserLookupResponse = {
  ok?: boolean;
  exists?: boolean;
  email?: string | null;
  name?: string | null;
};

type UserSearchResponse = {
  ok?: boolean;
  users?: Array<{
    email?: string;
    name?: string;
    managerEmail?: string | null;
  }>;
  error?: string;
};

type ExportShareResponse = {
  ok?: boolean;
  recipientEmail?: string;
  recipientName?: string;
  written?: number;
  error?: string;
};

type RecipientOption = {
  email: string;
  name: string;
};

type ExportShareSnapshot = {
  scopeLabel: string;
  dateRangeLabel: string;
  periodFrom: string;
  periodTo: string;
  generatedLabel: string;
  adviserName: string;
  adviserEmail: string;
  selectedCategoryLabel: string;
  selectedAdvisersLabel: string;
  totalContracts: number;
  totalAnnual: number;
  lifeContracts: number;
  lifeAnnual: number;
  nonLifeContracts: number;
  nonLifeAnnual: number;
  autoContracts: number;
  autoAnnual: number;
  propertyContracts: number;
  propertyAnnual: number;
  goldContracts: number;
  goldTotal: number;
  topProductName: string;
  topProductAnnual: number;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SHARE_EMOJIS = ["🙂", "👏", "🔥", "💪", "🚀", "✅", "🎯"];

const DATE_RANGE_OPTIONS: [DateRangeOption, string][] = [
  ["currentMonth", "Aktuální měsíc"],
  ["last3", "Poslední 3 měsíce"],
  ["last6", "Posledních 6 měsíců"],
  ["last12", "Posledních 12 měsíců"],
  ["custom", "Vlastní rozsah"],
];

const CATEGORY_FILTERS: { key: ProductCategory; label: string }[] = [
  { key: "life", label: "Život" },
  { key: "auto", label: "Vozidla" },
  { key: "propertyLiability", label: "Majetek a odpovědnost" },
  { key: "travel", label: "Cestovko" },
  { key: "foreigners", label: "Cizinci" },
  { key: "entrepreneurs", label: "Podnikatelé" },
  { key: "gold", label: "Zlato" },
];

const ALL_CATEGORY_KEYS: ProductCategory[] = CATEGORY_FILTERS.map((c) => c.key);
const ENTREPRENEUR_PRODUCTS = new Set<Product>([
  "cppPPRbez",
  "cppPPRs",
  "cppsimplex",
  "kooppmop",
]);
const FOREIGNER_PRODUCTS = new Set<Product>(["maxcizinkomplex"]);
const TRAVEL_PRODUCTS = new Set<Product>([
  "cppcestovko",
  "axacestovko",
  "koopcestovko",
]);
const EXPORT_ACTIVE_DARK_CLASS =
  "border-slate-950 bg-[linear-gradient(135deg,#111827_0%,#211442_54%,#090d1c_100%)] text-[#f8fafc] shadow-[0_12px_26px_rgba(18,12,43,0.24)]";
const EXPORT_ACTIVE_VIOLET_CLASS =
  "border-violet-500 bg-[linear-gradient(135deg,#7c3aed_0%,#a855f7_56%,#c084fc_100%)] text-[#f8fafc] shadow-[0_12px_26px_rgba(124,58,237,0.28)]";
const EXPORT_ACTIVE_FUCHSIA_CLASS =
  "border-fuchsia-500 bg-[linear-gradient(135deg,#020617_0%,#a21caf_52%,#ec4899_100%)] text-[#f8fafc] shadow-[0_12px_26px_rgba(162,28,175,0.28)]";
const EXPORT_INACTIVE_CHIP_CLASS =
  "border-violet-100 bg-white text-slate-700 hover:border-violet-300 hover:bg-violet-50/80";
const PRODUCT_ICON_PATHS: Partial<Record<Product, string>> = Object.fromEntries(
  PRODUCT_ORDER.map((product) => [
    product,
    product === "csobAuto" ? "/icons/csb.png" : productInstitutionLogo(product),
  ]).filter((entry): entry is [Product, string] => Boolean(entry[1]))
) as Partial<Record<Product, string>>;

function productCategory(p: Product): ProductCategory {
  if (ENTREPRENEUR_PRODUCTS.has(p)) return "entrepreneurs";
  if (FOREIGNER_PRODUCTS.has(p)) return "foreigners";
  if (TRAVEL_PRODUCTS.has(p)) return "travel";
  if (isLifeProduct(p)) return "life";
  if (isAutoProduct(p)) return "auto";
  if (isComfortProduct(p)) return "gold";
  return "propertyLiability";
}

function productLabel(p: Product): string {
  return productLabelFromCatalog(p, p);
}

function institutionLabel(p: Product): string {
  return productInstitutionLabel(p, p) ?? p;
}

/* -------------------------------- helpers ------------------------------- */

function emptyStats(): AggregatedStats {
  return {
    lifeMonthly: 0,
    lifeAnnual: 0,
    lifeContracts: 0,
    nonLifeAnnual: 0,
    nonLifeContracts: 0,
    autoAnnual: 0,
    autoContracts: 0,
    propertyAnnual: 0,
    propertyContracts: 0,
    goldTotal: 0,
    goldContracts: 0,
  };
}

function emptyCategoryReportStats(): CategoryReportStats {
  return {
    monthly: 0,
    annual: 0,
    contracts: 0,
  };
}

function categoryLabel(category: ProductCategory): string {
  return (
    CATEGORY_FILTERS.find((item) => item.key === category)?.label ?? category
  );
}

function hasCategoryReportStats(stats: CategoryReportStats): boolean {
  return stats.contracts > 0 || stats.monthly > 0 || stats.annual > 0;
}

function nameFromEmail(email: string | null | undefined): string {
  if (!email) return "Neznámý poradce";
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[.\-_]/).filter(Boolean);
  if (parts.length === 0) return email;

  const cap = (s: string) =>
    s.length === 0
      ? s
      : s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

  return parts.map(cap).join(" ");
}

function labelForDateRange(option: DateRangeOption): string {
  switch (option) {
    case "currentMonth":
      return "Aktuální měsíc";
    case "last3":
      return "Poslední 3 měsíce";
    case "last6":
      return "Posledních 6 měsíců";
    case "last12":
      return "Posledních 12 měsíců";
    case "custom":
      return "Vlastní rozsah";
  }
}

function formatDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultCustomDateRangeInputs(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now);
  from.setDate(1);
  return {
    from: formatDateInputValue(from),
    to: formatDateInputValue(now),
  };
}

function parseDateInput(value: string, endOfDay = false): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  } else {
    date.setHours(0, 0, 0, 0);
  }
  return date;
}

function labelForScope(option: ScopeOption): string {
  switch (option) {
    case "own":
      return "Vlastní";
    case "ownTeam":
      return "Vlastní a týmová";
    case "team":
      return "Týmová";
    case "selected":
      return "Vybraní podřízení";
  }
}

function positionLabel(pos?: Position | null): string | null {
  if (!pos) return null;
  return POSITION_LABELS[pos] ?? null;
}

function toAnnualPremium(
  amount: number,
  frequency: string | null | undefined
): number {
  switch (frequency) {
    case "monthly":
      return amount * 12;
    case "quarterly":
      return amount * 4;
    case "semiannual":
      return amount * 2;
    case "annual":
    default:
      return amount;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeCursorToken(
  token: string | null | undefined,
  legacyCursor: number | null | undefined
): string | null {
  if (typeof token === "string" && token.trim()) {
    return token.trim();
  }
  if (typeof legacyCursor === "number" && Number.isFinite(legacyCursor)) {
    return String(legacyCursor);
  }
  return null;
}

const normalizeEmail = (value: string | null | undefined): string =>
  (value ?? "").trim().toLowerCase();

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Nepodařilo se převést obrázek na data URL."));
      }
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("Nepodařilo se načíst obrázek."));
    };
    reader.readAsDataURL(blob);
  });
}

type ThemeIconKind = ProductCategory;

function themeIconSvg(kind: ThemeIconKind): string {
  const base =
    'xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.05" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  switch (kind) {
    case "life":
      return `<svg ${base}><path d="M12 22s8-3.6 8-10V6.8a1.4 1.4 0 0 0-1.1-1.4A19.2 19.2 0 0 1 12 2 19.2 19.2 0 0 1 5.1 5.4 1.4 1.4 0 0 0 4 6.8V12c0 6.4 8 10 8 10Z"/><path d="M12 15.4 9.2 12.8a2 2 0 0 1 2.8-2.9 2 2 0 0 1 2.8 2.9L12 15.4Z"/></svg>`;
    case "auto":
      return `<svg ${base}><path d="m4 10 1.5-3.4A2.4 2.4 0 0 1 7.7 5h8.6a2.4 2.4 0 0 1 2.2 1.6L20 10"/><rect x="3" y="10" width="18" height="7" rx="2"/><path d="M7 14h.01M17 14h.01M6 17v2M18 17v2"/></svg>`;
    case "propertyLiability":
      return `<svg ${base}><path d="m3 11 9-7 9 7"/><path d="M5 10.5V20h14v-9.5"/><path d="M9 20v-5.5h6V20"/><path d="M15.5 9.5h2.2v2.2"/></svg>`;
    case "travel":
      return `<svg ${base}><path d="M2.5 16.5 21 8.2l-7.9 8.7-.8 4.6-2.5-3.7-4.7 1.4 3.1-4.1-5.7-1.9Z"/><path d="m8.2 15.1 4.9 1.8"/></svg>`;
    case "foreigners":
      return `<svg ${base}><rect x="5" y="3" width="14" height="18" rx="2.5"/><circle cx="12" cy="11" r="2.5"/><path d="M8.5 16.5h7M9 7h6"/></svg>`;
    case "entrepreneurs":
      return `<svg ${base}><path d="M9.5 7V5.8A2.8 2.8 0 0 1 12.3 3h-.6a2.8 2.8 0 0 1 2.8 2.8V7"/><rect x="3" y="7" width="18" height="13" rx="2.2"/><path d="M3 12h18"/><path d="M9.5 12v1.3h5V12"/></svg>`;
    case "gold":
      return `<svg ${base}><ellipse cx="12" cy="6.5" rx="6.5" ry="3.2"/><path d="M5.5 6.5v5c0 1.8 2.9 3.2 6.5 3.2s6.5-1.4 6.5-3.2v-5"/><path d="M5.5 11.5v4c0 1.8 2.9 3.2 6.5 3.2s6.5-1.4 6.5-3.2v-4"/></svg>`;
    default:
      return `<svg ${base}><path d="M4 5h16v14H4zM8 9h8M8 13h5"/></svg>`;
  }
}

// html2canvas neumí lab/oklch barvy → nahradíme je běžnými hex/barvami
function stripUnsupportedColors(html: string): string {
  return html.replace(/(?:oklch|lab)\([^)]*\)/gi, "#0f172a");
}

type PdfBreakRange = {
  top: number;
  bottom: number;
  kind: "block" | "row";
};

function collectPdfBreakRanges(sourceEl: HTMLElement): PdfBreakRange[] {
  const rootRect = sourceEl.getBoundingClientRect();
  const readRanges = (
    selector: string,
    kind: PdfBreakRange["kind"]
  ): PdfBreakRange[] =>
    Array.from(sourceEl.querySelectorAll(selector))
      .filter((node): node is HTMLElement => node instanceof HTMLElement)
      .map((node) => {
        const rect = node.getBoundingClientRect();
        const top = rect.top - rootRect.top;
        const bottom = top + rect.height;
        return { top, bottom, kind };
      })
      .filter(
        (range) =>
          Number.isFinite(range.top) &&
          Number.isFinite(range.bottom) &&
          range.bottom - range.top > 4
      );

  return [
    ...readRanges(
      ".report-hero, .info-card, .summary-list, .monthly-chart, .card-user",
      "block"
    ),
    ...readRanges(
      ".product-table thead, .product-table tbody tr, .category-line",
      "row"
    ),
  ].sort((a, b) => a.top - b.top || b.bottom - a.bottom);
}

function choosePdfSliceEndCssY({
  startY,
  desiredEndY,
  contentEndY,
  pageCssHeight,
  ranges,
}: {
  startY: number;
  desiredEndY: number;
  contentEndY: number;
  pageCssHeight: number;
  ranges: PdfBreakRange[];
}): number {
  const pageEnd = Math.min(desiredEndY, contentEndY);
  if (pageEnd >= contentEndY - 1) return contentEndY;

  const minUsefulSliceHeight = Math.min(72, pageCssHeight * 0.18);
  const minRangeTop = startY + minUsefulSliceHeight;
  const containingRanges = ranges.filter((range) => {
    const height = range.bottom - range.top;
    return (
      range.top >= minRangeTop &&
      range.top < pageEnd - 1 &&
      range.bottom > pageEnd + 1 &&
      height <= pageCssHeight - 8
    );
  });

  const containingBlock = containingRanges
    .filter((range) => range.kind === "block")
    .sort((a, b) => a.top - b.top)[0];
  if (containingBlock) return containingBlock.top;

  const containingRow = containingRanges
    .filter((range) => range.kind === "row")
    .sort((a, b) => b.top - a.top)[0];
  if (containingRow) return containingRow.top;

  return pageEnd;
}

function createPdfPageSpacer(
  targetEl: HTMLElement,
  heightPx: number
): HTMLElement {
  const height = `${Math.ceil(heightPx)}px`;
  const isTableRow = targetEl.tagName.toLowerCase() === "tr";
  const ownerDocument = targetEl.ownerDocument;

  if (isTableRow) {
    const spacerRow = ownerDocument.createElement("tr");
    spacerRow.setAttribute("data-pdf-page-spacer", "true");
    const cell = ownerDocument.createElement("td");
    cell.colSpan = Math.max(1, targetEl.children.length || 1);
    cell.style.cssText = `height:${height};padding:0;border:0;background:#ffffff;`;
    spacerRow.appendChild(cell);
    return spacerRow;
  }

  const spacer = ownerDocument.createElement("div");
  spacer.setAttribute("data-pdf-page-spacer", "true");
  spacer.style.cssText = `height:${height};break-inside:avoid;page-break-inside:avoid;`;
  return spacer;
}

function applyPdfPageSpacers(
  sourceEl: HTMLElement,
  pageCssHeight: number
): void {
  sourceEl
    .querySelectorAll("[data-pdf-page-spacer]")
    .forEach((node) => node.remove());

  if (!Number.isFinite(pageCssHeight) || pageCssHeight <= 0) return;

  const protectedSelector = [
    ".report-hero",
    ".info-card",
    ".summary-list",
    ".monthly-chart",
    ".card-user",
    ".product-table tbody tr",
    ".category-line",
  ].join(", ");
  const safetyGap = 12;

  for (let pass = 0; pass < 80; pass += 1) {
    const rootTop = sourceEl.getBoundingClientRect().top;
    const target = Array.from(sourceEl.querySelectorAll(protectedSelector))
      .filter((node): node is HTMLElement => node instanceof HTMLElement)
      .find((node) => {
        const rect = node.getBoundingClientRect();
        const height = rect.height;
        if (!Number.isFinite(height) || height <= 4) return false;
        if (height >= pageCssHeight - safetyGap) return false;

        const top = rect.top - rootTop;
        const bottom = rect.bottom - rootTop;
        const pageBottom = (Math.floor(top / pageCssHeight) + 1) * pageCssHeight;

        return (
          top < pageBottom - 1 &&
          bottom > pageBottom - safetyGap
        );
      });

    if (!target) return;

    const rect = target.getBoundingClientRect();
    const currentRootTop = sourceEl.getBoundingClientRect().top;
    const top = rect.top - currentRootTop;
    const pageBottom = (Math.floor(top / pageCssHeight) + 1) * pageCssHeight;
    const spacerHeight = Math.max(1, pageBottom - top + safetyGap);
    target.parentNode?.insertBefore(createPdfPageSpacer(target, spacerHeight), target);
  }
}

type ParsedJsonSafe<T> = {
  payload: T | null;
  raw: string;
};

async function parseJsonSafe<T>(res: Response): Promise<ParsedJsonSafe<T>> {
  const raw = await res.text();
  if (!raw) return { payload: null, raw };
  try {
    return { payload: JSON.parse(raw) as T, raw };
  } catch {
    return { payload: null, raw };
  }
}

function extractApiErrorText(raw: string, fallback: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  if (trimmed.startsWith("<")) return fallback;
  return trimmed.slice(0, 180);
}

async function withIsolatedPdfSource<T>(
  html: string,
  work: (element: HTMLElement) => Promise<T>
): Promise<T> {
  if (typeof document === "undefined") {
    throw new Error("PDF export je dostupný jen v prohlížeči.");
  }

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:fixed;left:-10000px;top:0;width:0;height:0;opacity:0;pointer-events:none;border:0;";
  document.body.appendChild(iframe);

  try {
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      iframe.addEventListener("load", finish, { once: true });
      iframe.srcdoc = html;
      window.setTimeout(finish, 900);
    });

    const doc = iframe.contentDocument;
    if (!doc) {
      throw new Error("Nepodařilo se připravit izolovaný dokument pro export.");
    }

    const pickPageCandidate = () =>
      doc.querySelector(".page") ??
      doc.querySelector(".report-page") ??
      doc.body?.querySelector(".page") ??
      doc.body?.querySelector(".report-page") ??
      doc.body?.firstElementChild ??
      doc.body;

    const isElementNode = (value: unknown): value is HTMLElement =>
      !!value &&
      typeof value === "object" &&
      "nodeType" in value &&
      (value as { nodeType?: unknown }).nodeType === 1 &&
      "querySelectorAll" in value &&
      typeof (value as { querySelectorAll?: unknown }).querySelectorAll ===
        "function";

    let pageCandidate: unknown = pickPageCandidate();
    if (!isElementNode(pageCandidate)) {
      const waitStart = Date.now();
      while (Date.now() - waitStart < 1500) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 40));
        pageCandidate = pickPageCandidate();
        if (isElementNode(pageCandidate)) break;
      }
    }

    if (!isElementNode(pageCandidate)) {
      throw new Error("Nepodařilo se připravit obsah PDF pro export.");
    }
    const page = pageCandidate;

    const images = Array.from(
      page.querySelectorAll("img")
    ) as HTMLImageElement[];
    await Promise.all(
      images.map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise<void>((resolve) => {
          const done = () => resolve();
          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });
          window.setTimeout(done, 1200);
        });
      })
    );

    return await work(page);
  } finally {
    iframe.remove();
  }
}

async function withInlinePdfSource<T>(
  html: string,
  work: (element: HTMLElement) => Promise<T>
): Promise<T> {
  if (typeof document === "undefined") {
    throw new Error("PDF export je dostupný jen v prohlížeči.");
  }
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const sandbox = document.createElement("div");
  sandbox.setAttribute("aria-hidden", "true");
  sandbox.style.cssText =
    "position:fixed;left:-10000px;top:0;width:820px;opacity:0;pointer-events:none;z-index:-1;";
  const styles = Array.from(parsed.head.querySelectorAll("style"))
    .map((node) => node.outerHTML)
    .join("");
  sandbox.innerHTML = `${styles}<div data-pdf-inline-root>${parsed.body.innerHTML}</div>`;
  document.body.appendChild(sandbox);

  try {
    const pageCandidate =
      sandbox.querySelector(".page") ??
      sandbox.querySelector(".report-page") ??
      sandbox.firstElementChild ??
      sandbox;
    if (!(pageCandidate instanceof HTMLElement)) {
      throw new Error("Nepodařilo se připravit obsah PDF pro export.");
    }

    const page = pageCandidate;
    const images = Array.from(
      page.querySelectorAll("img")
    ) as HTMLImageElement[];
    await Promise.all(
      images.map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise<void>((resolve) => {
          const done = () => resolve();
          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });
          window.setTimeout(done, 1200);
        });
      })
    );

    return await work(page);
  } finally {
    sandbox.remove();
  }
}

async function withBestPdfSource<T>(
  html: string,
  work: (element: HTMLElement) => Promise<T>
): Promise<T> {
  try {
    return await withIsolatedPdfSource(html, work);
  } catch (isolatedErr) {
    console.warn(
      "PDF export: izolovaný iframe selhal, přepínám na inline fallback.",
      isolatedErr
    );
    return await withInlinePdfSource(html, work);
  }
}

async function renderPdfBlobFromElement(
  sourceEl: HTMLElement,
  options?: { marginPt?: number; scale?: number; imageQuality?: number }
): Promise<Blob> {
  const html2canvas = await getHtml2CanvasPro();
  const JsPdfCtor = await getJsPdfCtor();

  if (typeof html2canvas !== "function") {
    throw new Error("Nepodařilo se načíst renderer PDF (html2canvas-pro).");
  }
  if (typeof JsPdfCtor !== "function") {
    throw new Error("Nepodařilo se načíst PDF engine (jsPDF).");
  }

  const marginPt =
    typeof options?.marginPt === "number" && Number.isFinite(options.marginPt)
      ? Math.max(0, options.marginPt)
      : 10;
  const scale =
    typeof options?.scale === "number" && Number.isFinite(options.scale)
      ? Math.max(1, options.scale)
      : 2;
  const imageQuality =
    typeof options?.imageQuality === "number" &&
    Number.isFinite(options.imageQuality)
      ? Math.min(1, Math.max(0.4, options.imageQuality))
      : 0.96;

  const pdf = new JsPdfCtor({
    unit: "pt",
    format: "a4",
    orientation: "portrait",
  }) as {
    internal: { pageSize: { getWidth: () => number; getHeight: () => number } };
    addImage: (
      imageData: string,
      format: string,
      x: number,
      y: number,
      width: number,
      height: number,
      alias?: string,
      compression?: string
    ) => unknown;
    addPage: () => unknown;
    output: (type: "blob") => Blob;
  };

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = Math.max(1, pageWidth - marginPt * 2);
  const contentHeight = Math.max(1, pageHeight - marginPt * 2);
  const initialSourceRect = sourceEl.getBoundingClientRect();
  const initialSourceCssWidth = Math.max(
    1,
    initialSourceRect.width || sourceEl.offsetWidth || 760
  );
  const initialPageCssHeight =
    (contentHeight * initialSourceCssWidth) / contentWidth;

  applyPdfPageSpacers(sourceEl, initialPageCssHeight);

  const canvas = (await html2canvas(sourceEl, {
    scale,
    backgroundColor: "#ffffff",
    useCORS: true,
    imageTimeout: 20000,
    logging: false,
  })) as HTMLCanvasElement;

  const sourceRect = sourceEl.getBoundingClientRect();
  const sourceCssWidth = Math.max(1, sourceRect.width || sourceEl.offsetWidth);
  const canvasPxPerCssY = canvas.width / sourceCssWidth;
  const sourceCssHeight = Math.max(
    1,
    canvas.height / Math.max(0.0001, canvasPxPerCssY)
  );
  const pageCssHeight = (contentHeight * sourceCssWidth) / contentWidth;
  const breakRanges = collectPdfBreakRanges(sourceEl);

  let currentCssY = 0;
  let firstPage = true;

  while (currentCssY < sourceCssHeight - 1) {
    const desiredEndY = currentCssY + pageCssHeight;
    let nextCssY = choosePdfSliceEndCssY({
      startY: currentCssY,
      desiredEndY,
      contentEndY: sourceCssHeight,
      pageCssHeight,
      ranges: breakRanges,
    });

    if (nextCssY <= currentCssY + 1) {
      nextCssY = Math.min(desiredEndY, sourceCssHeight);
    }

    const sourceCanvasY = Math.max(
      0,
      Math.min(canvas.height - 1, Math.round(currentCssY * canvasPxPerCssY))
    );
    const targetCanvasY =
      nextCssY >= sourceCssHeight - 1
        ? canvas.height
        : Math.max(
            sourceCanvasY + 1,
            Math.min(canvas.height, Math.round(nextCssY * canvasPxPerCssY))
          );
    const sliceHeight = Math.max(1, targetCanvasY - sourceCanvasY);
    const sliceCanvas = document.createElement("canvas");
    sliceCanvas.width = canvas.width;
    sliceCanvas.height = sliceHeight;

    const sliceCtx = sliceCanvas.getContext("2d");
    if (!sliceCtx) {
      throw new Error("Nepodařilo se připravit stránku PDF.");
    }
    sliceCtx.fillStyle = "#ffffff";
    sliceCtx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
    sliceCtx.drawImage(
      canvas,
      0,
      sourceCanvasY,
      canvas.width,
      sliceHeight,
      0,
      0,
      canvas.width,
      sliceHeight
    );

    const imageData = sliceCanvas.toDataURL("image/jpeg", imageQuality);
    const sliceHeightInPdf = Math.min(
      contentHeight,
      (sliceHeight * contentWidth) / Math.max(1, canvas.width)
    );

    if (!firstPage) pdf.addPage();
    firstPage = false;
    pdf.addImage(
      imageData,
      "JPEG",
      marginPt,
      marginPt,
      contentWidth,
      sliceHeightInPdf,
      undefined,
      "FAST"
    );

    currentCssY = nextCssY;
  }

  return pdf.output("blob");
}

function downloadBlobFile(blob: Blob, filename: string) {
  if (typeof window === "undefined") return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function contractDate(entry: EntryDoc): Date | null {
  return (
    toDate((entry as any).contractSignedDate) ??
    toDate(entry.createdAt)
  );
}

function getDateRange(
  option: DateRangeOption,
  customRange?: { fromInput: string; toInput: string }
): { from: Date; to: Date } | null {
  if (option === "custom") {
    const from = parseDateInput(customRange?.fromInput ?? "");
    const to = parseDateInput(customRange?.toInput ?? "", true);
    if (!from || !to || from.getTime() > to.getTime()) return null;
    return { from, to };
  }

  const now = new Date();
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);

  const from = new Date(now);
  from.setHours(0, 0, 0, 0);

  switch (option) {
    case "currentMonth": {
      from.setDate(1);
      break;
    }
    case "last3": {
      from.setMonth(from.getMonth() - 3);
      break;
    }
    case "last6": {
      from.setMonth(from.getMonth() - 6);
      break;
    }
    case "last12": {
      from.setFullYear(from.getFullYear() - 1);
      break;
    }
  }

  return { from, to };
}

function getDateRangeValidationError(
  option: DateRangeOption,
  customRange: { fromInput: string; toInput: string }
): string | null {
  if (option !== "custom") return null;
  if (!customRange.fromInput || !customRange.toInput) {
    return "U vlastního rozsahu zadej datum OD i DO.";
  }

  const from = parseDateInput(customRange.fromInput);
  const to = parseDateInput(customRange.toInput, true);
  if (!from || !to) {
    return "Vlastní rozsah obsahuje neplatné datum.";
  }
  if (from.getTime() > to.getTime()) {
    return "Datum OD nesmí být později než datum DO.";
  }
  return null;
}

/* ------------------------------- komponenta ----------------------------- */

export default function ExportProductionPage() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const effectiveEmail = useEffectiveUserEmail(user?.email);
  const [profileFullName, setProfileFullName] = useState<string | null>(null);

  const [dateRangeOption, setDateRangeOption] =
    useState<DateRangeOption>("last3");
  const [customDateRange, setCustomDateRange] = useState(() =>
    defaultCustomDateRangeInputs()
  );
  const [scopeOption, setScopeOption] = useState<ScopeOption>("own");
  const [categories, setCategories] = useState<Set<ProductCategory>>(
    () => new Set<ProductCategory>(ALL_CATEGORY_KEYS)
  );

  const [currentUserPosition, setCurrentUserPosition] =
    useState<Position | null>(null);
  const [subordinates, setSubordinates] = useState<Subordinate[]>([]);
  const [selectedSubs, setSelectedSubs] = useState<Set<string>>(
    () => new Set()
  );
  const [loadingSubs, setLoadingSubs] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [subordinatesPickerOpen, setSubordinatesPickerOpen] = useState(false);
  const [subordinateSearch, setSubordinateSearch] = useState("");

  const [generationMode, setGenerationMode] = useState<"preview" | "pdf" | null>(
    null
  );
  const [previewLoadProgress, setPreviewLoadProgress] = useState(0);
  const [productIconDataUrls, setProductIconDataUrls] = useState<
    Partial<Record<Product, string>>
  >({});

  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [directManager, setDirectManager] = useState<RecipientOption | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareRecipientQuery, setShareRecipientQuery] = useState("");
  const [shareSuggestions, setShareSuggestions] = useState<RecipientOption[]>([]);
  const [shareSuggestionsLoading, setShareSuggestionsLoading] = useState(false);
  const [shareSelectedRecipient, setShareSelectedRecipient] =
    useState<RecipientOption | null>(null);
  const [shareUseDirectManager, setShareUseDirectManager] = useState(false);
  const [shareMessageText, setShareMessageText] = useState("");
  const [shareSubmitting, setShareSubmitting] = useState(false);
  const [shareErrorText, setShareErrorText] = useState<string | null>(null);
  const [shareSuccessText, setShareSuccessText] = useState<string | null>(null);
  const subordinatesPickerRef = useRef<HTMLDivElement | null>(null);
  const shareLookupSeq = useRef(0);

  const hasTeam = subordinates.length > 0;
  const isTeamScope =
    scopeOption === "ownTeam" || scopeOption === "team" || scopeOption === "selected";
  const allCategoriesSelected = ALL_CATEGORY_KEYS.every((key) =>
    categories.has(key)
  );
  const scopeLabel = labelForScope(scopeOption);
  const selectedDateRange = getDateRange(dateRangeOption, {
    fromInput: customDateRange.from,
    toInput: customDateRange.to,
  });
  const dateRangeLabel =
    dateRangeOption === "custom" && selectedDateRange
      ? `Vlastní rozsah: ${selectedDateRange.from.toLocaleDateString("cs-CZ")} – ${selectedDateRange.to.toLocaleDateString("cs-CZ")}`
      : labelForDateRange(dateRangeOption);
  const selectedCategoryCount = categories.size;
  const selectedCategoryLabel =
    allCategoriesSelected
      ? "Všechny kategorie"
      : `${selectedCategoryCount}/${ALL_CATEGORY_KEYS.length} kategorií`;
  const selectedAdvisersLabel =
    scopeOption === "selected" && hasTeam
      ? selectedSubs.size === 0
        ? "Nikdo nevybraný"
        : `${selectedSubs.size} vybraných`
      : scopeOption === "own"
        ? "Jen vlastní"
        : hasTeam
          ? scopeOption === "ownTeam"
            ? `${subordinates.length + 1} lidí včetně tebe`
            : `${subordinates.length} lidí v týmu`
          : "Bez týmu";
  const isPreparingPreview = generating && generationMode === "preview";
  const previewProgress = Math.max(0, Math.min(100, previewLoadProgress));
  const previewScanClipPath = `inset(${100 - previewProgress}% 0 0 0)`;
  const previewLoaderStatus =
    previewProgress < 34
      ? "Načítám produkční data"
      : previewProgress < 72
        ? "Skládám souhrny a poradce"
        : "Finalizuji náhled PDF";
  const filteredSubordinates = useMemo(() => {
    const q = normalizeForSearch(subordinateSearch);
    if (!q) return subordinates;
    return subordinates.filter((sub) =>
      normalizeForSearch(`${sub.name} ${sub.email}`).includes(q)
    );
  }, [subordinates, subordinateSearch]);

  /* ----------------------------- auth ----------------------------- */

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      if (!fbUser) {
        setUser(null);
        return;
      }
      setUser(fbUser);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!isPreparingPreview) return;

    setPreviewLoadProgress(0);
    const timer = window.setInterval(() => {
      setPreviewLoadProgress((current) => {
        if (current < 30) return Math.min(current + 9, 30);
        if (current < 70) return Math.min(current + 5, 70);
        if (current < 94) return Math.min(current + 2, 94);
        return current;
      });
    }, 120);

    return () => window.clearInterval(timer);
  }, [isPreparingPreview]);

  useEffect(() => {
    let alive = true;
    const loadDirectManager = async () => {
      if (!user || !effectiveEmail) {
        setProfileFullName(null);
        setDirectManager(null);
        return;
      }

      try {
        const profilePayload = await fetchAuthedJsonOrThrow<UserProfileApiResponse>(
          user,
          "/api/user/profile",
          { method: "GET" }
        );
        if (!alive) return;

        const fullName =
          typeof profilePayload?.profile?.fullName === "string"
            ? profilePayload.profile.fullName.trim()
            : "";
        setProfileFullName(fullName || null);

        const managerEmail = normalizeEmail(profilePayload?.profile?.managerEmail);
        if (!managerEmail) {
          setDirectManager(null);
          return;
        }

        let managerName = nameFromEmail(managerEmail);
        try {
          const lookupPayload = await fetchAuthedJsonOrThrow<UserLookupResponse>(
            user,
            `/api/user/lookup?email=${encodeURIComponent(managerEmail)}`,
            { method: "GET" }
          );
          const lookedName = lookupPayload?.name;
          if (typeof lookedName === "string" && lookedName.trim().length > 0) {
            managerName = lookedName.trim();
          }
        } catch (lookupErr) {
          console.warn("Načtení jména přímého nadřízeného selhalo:", lookupErr);
        }

        if (!alive) return;
        setDirectManager({
          email: managerEmail,
          name: managerName,
        });
      } catch (err) {
        console.error("Načtení přímého nadřízeného selhalo:", err);
        if (!alive) return;
        setProfileFullName(null);
        setDirectManager(null);
      }
    };

    void loadDirectManager();
    return () => {
      alive = false;
    };
  }, [effectiveEmail, user]);

  /* ------------------------- podřízení --------------------------- */

  useEffect(() => {
    let alive = true;
    const loadSubs = async () => {
      if (!user || !effectiveEmail) {
        setSubordinates([]);
        setCurrentUserPosition(null);
        return;
      }

      const email = effectiveEmail;

      setLoadingSubs(true);
      setErrorText(null);

      try {
        let bearerToken = await user.getIdToken();
        const requestWithToken = async (token: string) =>
          fetch("/api/team-overview?action=members", {
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

        const { payload, raw } = await parseJsonSafe<TeamOverviewApiResponse>(res);
        if (!res.ok || payload?.ok === false) {
          throw new Error(
            payload?.error ||
              extractApiErrorText(raw, "Nepodařilo se načíst tým.")
          );
        }
        if (!payload) {
          throw new Error("API týmu vrátilo neplatnou nebo prázdnou odpověď.");
        }

        const membersRaw = Array.isArray(payload.members) ? payload.members : [];
        const members = membersRaw
          .map((member) => {
            const memberEmail = normalizeEmail(member.email);
            if (!memberEmail) return null;
            return {
              email: memberEmail,
              name:
                typeof member.name === "string" && member.name.trim()
                  ? member.name.trim()
                  : nameFromEmail(memberEmail),
              position: (member.position as Position | null | undefined) ?? null,
            };
          })
          .filter((member): member is { email: string; name: string; position: Position | null } =>
            Boolean(member)
          );

        if (!alive) return;
        setCurrentUserPosition((payload.position as Position | null | undefined) ?? null);

        const list: Subordinate[] = members
          .filter((member) => member.email !== email)
          .map((member) => ({
            email: member.email,
            name: member.name,
            position: member.position,
          }));

        list.sort((a, b) => a.name.localeCompare(b.name, "cs"));
        setSubordinates(list);
        const allowedEmails = new Set(list.map((s) => s.email));
        setSelectedSubs((prev) => {
          const next = new Set<string>();
          for (const subEmail of prev) {
            if (allowedEmails.has(subEmail)) next.add(subEmail);
          }
          return next;
        });
      } catch (e) {
        if (!alive) return;
        console.error("Chyba při načítání podřízených", e);
        setErrorText("Nepodařilo se načíst podřízené (včetně celého týmu).");
      } finally {
        if (alive) setLoadingSubs(false);
      }
    };

    void loadSubs();
    return () => {
      alive = false;
    };
  }, [effectiveEmail, user]);

  useEffect(() => {
    if (scopeOption !== "selected" || !hasTeam) {
      setSubordinatesPickerOpen(false);
      setSubordinateSearch("");
    }
  }, [scopeOption, hasTeam]);

  useEffect(() => {
    if (!subordinatesPickerOpen) return;
    const onDown = (ev: MouseEvent) => {
      const el = subordinatesPickerRef.current;
      if (!el) return;
      if (!el.contains(ev.target as Node)) {
        setSubordinatesPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [subordinatesPickerOpen]);

  useEffect(() => {
    if (!subordinatesPickerOpen) {
      setSubordinateSearch("");
    }
  }, [subordinatesPickerOpen]);

  useEffect(() => {
    if (!shareModalOpen || shareUseDirectManager || !user) {
      setShareSuggestions([]);
      setShareSuggestionsLoading(false);
      return;
    }

    const query = shareRecipientQuery.trim();
    if (query.length < 2) {
      setShareSuggestions([]);
      setShareSuggestionsLoading(false);
      return;
    }

    const seq = ++shareLookupSeq.current;
    const timeoutId = window.setTimeout(async () => {
      setShareSuggestionsLoading(true);
      try {
        const payload = await fetchAuthedJsonOrThrow<UserSearchResponse>(
          user,
          `/api/user/search?q=${encodeURIComponent(query)}`,
          { method: "GET" }
        );
        if (seq !== shareLookupSeq.current) return;

        const rows = Array.isArray(payload?.users) ? payload.users : [];
        const nextSuggestions = rows
          .map((row) => {
            const rowEmail = normalizeEmail(row.email);
            if (!rowEmail) return null;
            const rowName =
              typeof row.name === "string" && row.name.trim().length > 0
                ? row.name.trim()
                : nameFromEmail(rowEmail);
            return { email: rowEmail, name: rowName } satisfies RecipientOption;
          })
          .filter((row): row is RecipientOption => row !== null);
        setShareSuggestions(nextSuggestions);
      } catch (err) {
        console.error("Načtení našeptávání příjemců selhalo:", err);
        if (seq !== shareLookupSeq.current) return;
        setShareSuggestions([]);
      } finally {
        if (seq === shareLookupSeq.current) {
          setShareSuggestionsLoading(false);
        }
      }
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [shareModalOpen, shareUseDirectManager, shareRecipientQuery, user]);

  /* --------------------------- logo ------------------------------ */

  useEffect(() => {
    let cancelled = false;

    const readAsset = async (path: string): Promise<string | null> => {
      try {
        const res = await fetch(path);
        if (!res.ok) return null;
        const blob = await res.blob();
        return await blobToDataUrl(blob);
      } catch {
        return null;
      }
    };

    const loadBrandAssets = async () => {
      try {
        const iconEntries = await Promise.all(
          (Object.entries(PRODUCT_ICON_PATHS) as [Product, string][]).map(
            async ([product, path]) => [product, await readAsset(path)] as const
          )
        );

        if (cancelled) return;

        const nextIcons: Partial<Record<Product, string>> = {};
        for (const [product, dataUrl] of iconEntries) {
          if (!dataUrl) continue;
          nextIcons[product] = dataUrl;
        }
        setProductIconDataUrls(nextIcons);
      } catch (e) {
        console.error("Nepodařilo se načíst brand assety pro export:", e);
      }
    };

    void loadBrandAssets();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedCategories = useMemo(
    () => categories,
    [categories]
  );

  /* -------------------------- UI helpers ------------------------- */

  const handleToggleCategory = (cat: ProductCategory) => {
    setCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const handleToggleSubordinate = (email: string) => {
    setSelectedSubs((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  };

  const validateScopeConfig = (): boolean => {
    const dateRangeError = getDateRangeValidationError(dateRangeOption, {
      fromInput: customDateRange.from,
      toInput: customDateRange.to,
    });
    if (dateRangeError) {
      setErrorText(dateRangeError);
      return false;
    }

    if (scopeOption === "selected" && selectedSubs.size === 0) {
      setErrorText(
        "Vyber alespoň jednoho podřízeného pro rozsah „Vybraní podřízení“."
      );
      return false;
    }
    return true;
  };

  const openShareModal = () => {
    if (!validateScopeConfig()) return;
    shareLookupSeq.current += 1;
    setShareModalOpen(true);
    setShareSuccessText(null);
    setShareErrorText(null);
    setShareRecipientQuery("");
    setShareSelectedRecipient(null);
    setShareSuggestions([]);
    setShareSuggestionsLoading(false);
    setShareUseDirectManager(false);
    setShareMessageText("");
  };

  const closeShareModal = () => {
    if (shareSubmitting) return;
    shareLookupSeq.current += 1;
    setShareModalOpen(false);
    setShareSuggestions([]);
    setShareSuggestionsLoading(false);
    setShareUseDirectManager(false);
    setShareSelectedRecipient(null);
    setShareRecipientQuery("");
    setShareErrorText(null);
    setShareMessageText("");
  };

  const handleSelectSuggestion = (recipientOption: RecipientOption) => {
    setShareUseDirectManager(false);
    setShareSelectedRecipient(recipientOption);
    setShareRecipientQuery(`${recipientOption.name} <${recipientOption.email}>`);
    setShareSuggestions([]);
    setShareErrorText(null);
  };

  const handleToggleDirectManager = (nextChecked: boolean) => {
    shareLookupSeq.current += 1;
    setShareUseDirectManager(nextChecked);
    setShareErrorText(null);
    if (nextChecked) {
      setShareSuggestions([]);
      if (directManager) {
        setShareSelectedRecipient(directManager);
        setShareRecipientQuery(`${directManager.name} <${directManager.email}>`);
      } else {
        setShareSelectedRecipient(null);
      }
      return;
    }

    setShareSelectedRecipient(null);
    setShareRecipientQuery("");
  };

  const appendShareEmoji = (emoji: string) => {
    setShareMessageText((prev) => `${prev}${emoji}`);
  };

  /* ---------------------- logika reportu ------------------------- */

  const buildReportHtml = async (): Promise<{
    html: string;
    filenameBase: string;
    snapshot: ExportShareSnapshot;
  }> => {
    if (!user || !effectiveEmail) {
      throw new Error("Uživatel není přihlášený.");
    }
    if (effectiveUserEmail(user.email) !== effectiveEmail) {
      throw new Error("Přepnutí uživatele se změnilo. Export spusť znovu.");
    }

    const email = effectiveEmail;
    const generatedAt = new Date();

    const resolvedDateRange = getDateRange(dateRangeOption, {
      fromInput: customDateRange.from,
      toInput: customDateRange.to,
    });
    if (!resolvedDateRange) {
      throw new Error(
        getDateRangeValidationError(dateRangeOption, {
          fromInput: customDateRange.from,
          toInput: customDateRange.to,
        }) ?? "Neplatné období exportu."
      );
    }
    const { from, to } = resolvedDateRange;
    const fromMs = from.getTime();

    // e-maily zahrnuté do exportu
    let emailsToLoad: string[] = [];

    if (scopeOption === "own") {
      emailsToLoad = [email];
    } else if (scopeOption === "ownTeam") {
      const subs = subordinates.map((s) => s.email);
      emailsToLoad = [email, ...subs];
    } else if (scopeOption === "team") {
      emailsToLoad = subordinates.map((s) => s.email);
    } else {
      emailsToLoad = Array.from(selectedSubs);
    }

    emailsToLoad = Array.from(new Set(emailsToLoad));

    // načíst smlouvy (entries) přes API
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error("Uživatel není přihlášený.");
    }

    let bearerToken = await currentUser.getIdToken();
    const fetchContractsPage = async (
      scope: "my" | "team",
      cursor?: string | null
    ): Promise<ContractsApiResponse> => {
      const params = new URLSearchParams({
        scope,
        limit: "50",
        shape: "home",
      });
      if (Number.isFinite(fromMs)) {
        params.set("signedFrom", String(fromMs));
      }
      if (scope === "team" && scopeOption === "selected") {
        const selectedTeamEmails = emailsToLoad.filter((item) => item !== email);
        if (selectedTeamEmails.length > 0) {
          params.set("subordinates", selectedTeamEmails.join(","));
        }
      }
      if (cursor) params.set("cursor", cursor);

      const requestWithToken = async (token: string) =>
        fetch(`/api/contracts/list?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        });

      let res = await requestWithToken(bearerToken);
      if (res.status === 401) {
        bearerToken = await currentUser.getIdToken(true);
        res = await requestWithToken(bearerToken);
      }
      const { payload, raw } = await parseJsonSafe<ContractsApiResponse>(res);
      if (res.status === 403 && scope === "team") {
        return {
          ok: true,
          contracts: [],
          hasMore: false,
          nextCursorToken: null,
          nextCursor: null,
        };
      }
      if (!res.ok || payload?.ok === false) {
        const fallback =
          res.status >= 500
            ? `API smluv je dočasně nedostupné (HTTP ${res.status}).`
            : "Nepodařilo se načíst smlouvy.";
        throw new Error(
          payload?.error || extractApiErrorText(raw, fallback)
        );
      }
      if (!payload) {
        throw new Error(
          extractApiErrorText(
            raw,
            "API smluv vrátilo neplatnou nebo prázdnou odpověď."
          )
        );
      }
      return payload;
    };

    const fetchContractsScope = async (scope: "my" | "team"): Promise<EntryDoc[]> => {
      const collected: EntryDoc[] = [];
      const seen = new Set<string>();
      let cursor: string | null = null;
      let hasMore = true;
      let pages = 0;

      while (hasMore && pages < 120) {
        pages += 1;
        const payload = await fetchContractsPage(scope, cursor);
        const contracts = (payload.contracts ?? []) as (EntryDoc & {
          adviserEmail?: string | null;
        })[];
        if (contracts.length === 0) break;
        let addedThisPage = 0;
        let oldestTsOnPage: number | null = null;
        contracts.forEach((item) => {
          const owner = (
            item.adviserEmail ??
            item.userEmail ??
            email
          )
            .toString()
            .trim()
            .toLowerCase();
          const id = String(item.id ?? "").trim();
          if (!owner || !id) return;
          const key = `${owner}___${id}`;
          if (seen.has(key)) return;
          seen.add(key);
          const mapped: EntryDoc = {
            ...(item as EntryDoc),
            id,
            userEmail: owner,
          };
          collected.push(mapped);
          addedThisPage += 1;

          const signed = contractDate(mapped);
          if (!signed) return;
          const ts = signed.getTime();
          if (!Number.isFinite(ts)) return;
          if (oldestTsOnPage == null || ts < oldestTsOnPage) {
            oldestTsOnPage = ts;
          }
        });
        if (addedThisPage === 0) break;
        cursor = normalizeCursorToken(payload.nextCursorToken, payload.nextCursor);
        hasMore = Boolean(payload.hasMore) && Boolean(cursor);
        if (!hasMore) break;
        if (oldestTsOnPage != null && oldestTsOnPage < fromMs) break;
      }
      return collected;
    };

    const scopeNeedsOwn = scopeOption === "own" || scopeOption === "ownTeam";
    const scopeNeedsTeam =
      scopeOption === "ownTeam" ||
      scopeOption === "team" ||
      scopeOption === "selected";

    const [ownEntries, teamEntries] = await Promise.all([
      scopeNeedsOwn ? fetchContractsScope("my") : Promise.resolve([]),
      scopeNeedsTeam ? fetchContractsScope("team") : Promise.resolve([]),
    ]);

    const allowedEmails = new Set(emailsToLoad.map((item) => item.toLowerCase()));
    const allEntries = [...ownEntries, ...teamEntries].filter((entry) =>
      allowedEmails.has((entry.userEmail ?? "").toLowerCase())
    );

    // filtrovat podle období
    const entriesInRange = allEntries.filter((entry) => {
      const signed = contractDate(entry);
      if (!signed) return false;
      return signed >= from && signed <= to;
    });

    // statistiky pro každého poradce
    const perUser = new Map<string, PerUserStats>();
    const perProduct = new Map<Product, { annual: number; contracts: number }>();
    const perMonth = new Map<string, { label: string; value: number }>();
    const perCategory = new Map<ProductCategory, CategoryReportStats>();
    const perUserCategory = new Map<
      string,
      Map<ProductCategory, CategoryReportStats>
    >();

    for (const entry of entriesInRange) {
      const e = (entry.userEmail ?? "").toLowerCase();
      if (!e) continue;

      const p = entry.productKey;
      if (!p) continue;

      // filtr podle zvolených kategorií
      const cat = productCategory(p);
      if (!categories.has(cat)) continue;

      const created = contractDate(entry);
      if (!created) continue;

      const amount = entry.inputAmount ?? 0;
      if (!amount || !Number.isFinite(amount)) continue;

      const isLife = isLifeProduct(p);
      const isAuto = isAutoProduct(p);
      const isProperty =
        isPropertyProduct(p) || isTravelProduct(p) || hasProductGroup(p, "liability");
      const isGold = isComfortProduct(p);
      const isNonLife = !isLife && !isGold;

      const annualForProduct = isGold
        ? amount
        : isLife
          ? amount * 12
          : toAnnualPremium(amount, entry.frequencyRaw);
      const prevProd = perProduct.get(p) ?? { annual: 0, contracts: 0 };
      perProduct.set(p, {
        annual: prevProd.annual + annualForProduct,
        contracts: prevProd.contracts + 1,
      });

      // měsíční agregace (podle data vytvoření)
      const ym = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, "0")}`;
      const monthLabel = created.toLocaleDateString("cs-CZ", {
        month: "short",
        year: "numeric",
      });
      const prevMonth = perMonth.get(ym) ?? { label: monthLabel, value: 0 };
      perMonth.set(ym, {
        label: monthLabel,
        value: prevMonth.value + annualForProduct,
      });

      let stats = perUser.get(e);
      if (!stats) {
        const pos =
          e === email
            ? currentUserPosition
            : subordinates.find((s) => s.email === e)?.position ?? null;
        stats = {
          email: e,
          name:
            e === email
              ? nameFromEmail(e)
              : (subordinates.find((s) => s.email === e)?.name ??
                nameFromEmail(e)),
          positionLabel: positionLabel(pos),
          ...emptyStats(),
        };
        perUser.set(e, stats);
      }

      const categoryMonthly = isLife ? amount : 0;
      const prevCategory = perCategory.get(cat) ?? emptyCategoryReportStats();
      perCategory.set(cat, {
        monthly: prevCategory.monthly + categoryMonthly,
        annual: prevCategory.annual + annualForProduct,
        contracts: prevCategory.contracts + 1,
      });

      let userCategoryStats = perUserCategory.get(e);
      if (!userCategoryStats) {
        userCategoryStats = new Map<ProductCategory, CategoryReportStats>();
        perUserCategory.set(e, userCategoryStats);
      }
      const prevUserCategory =
        userCategoryStats.get(cat) ?? emptyCategoryReportStats();
      userCategoryStats.set(cat, {
        monthly: prevUserCategory.monthly + categoryMonthly,
        annual: prevUserCategory.annual + annualForProduct,
        contracts: prevUserCategory.contracts + 1,
      });

      if (isLife) {
        stats.lifeMonthly += amount;
        stats.lifeContracts += 1;
      } else if (isGold) {
        stats.goldTotal += amount;
        stats.goldContracts += 1;
      } else if (isNonLife) {
        const annual = toAnnualPremium(amount, entry.frequencyRaw);
        stats.nonLifeAnnual += annual;
        stats.nonLifeContracts += 1;

        if (isAuto) {
          stats.autoAnnual += annual;
          stats.autoContracts += 1;
        } else if (isProperty) {
          stats.propertyAnnual += annual;
          stats.propertyContracts += 1;
        }
      }
    }

    // dopočítat roční pojistné z life
    for (const stats of perUser.values()) {
      stats.lifeAnnual = stats.lifeMonthly * 12;
    }

    // souhrn
    const summary: AggregatedStats = emptyStats();

    for (const stats of perUser.values()) {
      summary.lifeMonthly += stats.lifeMonthly;
      summary.lifeAnnual += stats.lifeAnnual;
      summary.lifeContracts += stats.lifeContracts;
      summary.nonLifeAnnual += stats.nonLifeAnnual;
      summary.nonLifeContracts += stats.nonLifeContracts;
      summary.autoAnnual += stats.autoAnnual;
      summary.autoContracts += stats.autoContracts;
      summary.propertyAnnual += stats.propertyAnnual;
      summary.propertyContracts += stats.propertyContracts;
      summary.goldTotal += stats.goldTotal;
      summary.goldContracts += stats.goldContracts;
    }

    // hezký HTML layout (glassy cards)

    const adviserNameRaw = profileFullName || nameFromEmail(email);
    const adviserEmailRaw = email;
    const dateLabelRaw = labelForDateRange(dateRangeOption);
    const scopeLabelRaw = labelForScope(scopeOption);
    const generatedLabelRaw = generatedAt.toLocaleString("cs-CZ", {
      dateStyle: "medium",
      timeStyle: "short",
    });
    const periodFromRaw = from.toLocaleDateString("cs-CZ");
    const periodToRaw = to.toLocaleDateString("cs-CZ");

    const adviserName = escapeHtml(adviserNameRaw);
    const scopeLabel = escapeHtml(scopeLabelRaw);
    const generatedLabel = escapeHtml(generatedLabelRaw);
    const periodFrom = escapeHtml(periodFromRaw);
    const periodTo = escapeHtml(periodToRaw);

    const cats = selectedCategories;
    const selectedCategoryFilters = CATEGORY_FILTERS.filter(({ key }) =>
      cats.has(key)
    );

    const reportOwnerEmail = normalizeEmail(email);
    const currentUserIsManager =
      currentUserPosition?.startsWith("manazer") === true;
    const userPerformanceValue = (stats: PerUserStats) =>
      stats.lifeAnnual + stats.nonLifeAnnual + stats.goldTotal;
    const perUserList = Array.from(perUser.values()).sort((a, b) => {
      const aIsReportOwner = currentUserIsManager && a.email === reportOwnerEmail;
      const bIsReportOwner = currentUserIsManager && b.email === reportOwnerEmail;
      if (aIsReportOwner !== bIsReportOwner) return aIsReportOwner ? -1 : 1;

      const performanceDiff = userPerformanceValue(b) - userPerformanceValue(a);
      if (performanceDiff !== 0) return performanceDiff;

      return a.name.localeCompare(b.name, "cs");
    });

    // připravíme měsíční osu pro celé zvolené období (i když je hodnota 0)
    const monthKeys: { key: string; label: string }[] = [];
    const cursor = new Date(from);
    cursor.setDate(1);
    while (cursor <= to) {
      const key = `${cursor.getFullYear()}-${String(
        cursor.getMonth() + 1
      ).padStart(2, "0")}`;
      const label = cursor.toLocaleDateString("cs-CZ", {
        month: "short",
        year: "numeric",
      });
      monthKeys.push({ key, label });
      cursor.setMonth(cursor.getMonth() + 1);
      cursor.setDate(1);
    }

    const monthlyTotals = monthKeys.map(({ key, label }) => {
      const m = perMonth.get(key);
      return { label, value: m?.value ?? 0 };
    });

    const monthlyMax =
      monthlyTotals.length > 0
        ? Math.max(...monthlyTotals.map((m) => m.value))
        : 0;
    const showMonthlyTrend =
      dateRangeOption !== "currentMonth" && monthlyTotals.length > 0;

    const themedHeading = (
      label: string,
      kind: ThemeIconKind,
      className = "category-line-title"
    ) => `
      <div class="${className} theme-${kind}">
        <span class="theme-icon" aria-hidden="true">${themeIconSvg(kind)}</span>
        <span>${escapeHtml(label)}</span>
      </div>
    `;

    const contractCountLabel = (count: number) =>
      `${count} ${count === 1 ? "smlouva" : count > 1 && count < 5 ? "smlouvy" : "smluv"}`;

    const renderCategoryMetrics = (category: ProductCategory, stats: CategoryReportStats) => {
      const metrics: string[] = [];
      if (category === "life") {
        metrics.push(`<span>${formatMoney(stats.monthly)} měsíčně</span>`);
      }
      metrics.push(
        `<span>${formatMoney(stats.annual)} ${
          category === "gold" ? "objem" : "ročně"
        }</span>`
      );
      metrics.push(`<span>${contractCountLabel(stats.contracts)}</span>`);
      return metrics.join("");
    };

    const renderCategoryLine = (
      category: ProductCategory,
      stats: CategoryReportStats,
      variant: "summary" | "user"
    ) => {
      const isSummary = variant === "summary";
      const className = isSummary
        ? `category-line category-line--${category}`
        : `category-line category-line--compact category-line--${category}`;
      return `
        <div class="${className}">
          ${themedHeading(categoryLabel(category), category, "category-line-title")}
          <div class="category-line-metrics">${renderCategoryMetrics(category, stats)}</div>
        </div>
      `;
    };

    const summarySections = selectedCategoryFilters
      .map(({ key }) => {
        const stats = perCategory.get(key);
        if (!stats || !hasCategoryReportStats(stats)) return "";
        return renderCategoryLine(key, stats, "summary");
      })
      .filter(Boolean);

    const teamCards: string[] = [];

    if (isTeamScope) {
      for (const stats of perUserList) {
        const categoryStats = perUserCategory.get(stats.email) ?? new Map();
        const userSections = selectedCategoryFilters
          .map(({ key }) => {
            const item = categoryStats.get(key);
            if (!item || !hasCategoryReportStats(item)) return "";
            return renderCategoryLine(key, item, "user");
          })
          .filter(Boolean);

        if (userSections.length === 0) continue;

        teamCards.push(`
          <div class="card card-user">
            <div class="card-user-header">
              <div class="avatar">${escapeHtml(
                stats.name.charAt(0).toUpperCase()
              )}</div>
              <div>
                <div class="card-user-name">${escapeHtml(stats.name)}</div>
                <div class="card-user-email">${escapeHtml(stats.email)}</div>
                ${
                  stats.positionLabel
                    ? `<div class="card-user-position">Pozice: ${escapeHtml(
                        stats.positionLabel
                      )}</div>`
                    : ""
                }
              </div>
            </div>
            <div class="card-user-body">
              ${userSections.join("")}
            </div>
          </div>
        `);
      }
    }

    const sortedProductEntries = Array.from(perProduct.entries()).sort(
      (a, b) => b[1].annual - a[1].annual
    );
    const productRowsHtml = sortedProductEntries
      .map(([prod, vals]) => {
        const provider = institutionLabel(prod);
        const iconDataUrl = productIconDataUrls[prod] ?? null;
        const iconPath = PRODUCT_ICON_PATHS[prod] ?? null;
        const iconSrc =
          iconDataUrl ??
          (iconPath
            ? (() => {
                try {
                  return new URL(iconPath, window.location.origin).toString();
                } catch {
                  return iconPath;
                }
              })()
            : null);
        const iconMarkup = iconSrc
          ? `<span class="product-logo"><img src="${escapeHtml(
              iconSrc
            )}" alt="${escapeHtml(provider)}" /></span>`
          : `<span class="product-logo product-logo-fallback">${escapeHtml(
              provider.charAt(0).toUpperCase()
            )}</span>`;

        return `
          <tr>
            <td class="product">
              <div class="product-cell">
                ${iconMarkup}
                <div class="product-meta">
                  <div class="product-name">${escapeHtml(productLabel(prod))}</div>
                  <div class="product-provider">${escapeHtml(provider)}</div>
                </div>
              </div>
            </td>
            <td class="count">${vals.contracts}</td>
            <td class="amount">${formatMoney(vals.annual)}</td>
          </tr>
        `;
      })
      .join("");

    const topProductEntry = sortedProductEntries[0] ?? null;
    const totalAnnual = summary.lifeAnnual + summary.nonLifeAnnual + summary.goldTotal;
    const totalContracts =
      summary.lifeContracts + summary.nonLifeContracts + summary.goldContracts;

    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
	          <style>
	            * { box-sizing: border-box; }
	            :root {
	              --ink: #0b1020;
	              --muted: #667085;
		              --soft: #f8f5ff;
		              --line: #eadff8;
		              --line-strong: #d8c3f1;
		              --violet: #7c3aed;
		              --violet-dark: #2e1065;
		              --black: #080b18;
		              --paper: #ffffff;
		            }
	            body {
	              margin: 0;
	              padding: 28px 0;
	              background: #f7f4fb;
	              font-family: Inter, "Avenir Next", "Segoe UI", "Helvetica Neue", Arial, sans-serif;
	              color: var(--ink);
	              -webkit-font-smoothing: antialiased;
	            }
	            .page {
	              width: 760px;
	              margin: 0 auto;
	              background: var(--paper);
	              border: 1px solid var(--line);
	              border-radius: 22px;
	              box-shadow: 0 18px 48px rgba(44, 20, 83, 0.12);
	              overflow: hidden;
	            }
	            .page::before {
	              content: "";
	              display: block;
		              height: 6px;
		              background: linear-gradient(90deg, var(--black) 0%, var(--violet) 52%, var(--violet-dark) 100%);
		            }
	            .report-body {
	              padding: 28px 32px 30px;
	            }
		            .report-hero {
		              display: flex;
		              align-items: flex-end;
		              justify-content: space-between;
		              gap: 16px;
		              min-height: 96px;
		              margin-bottom: 0;
		              border-radius: 20px 20px 0 0;
		              background: linear-gradient(135deg, #12091f 0%, #4c1d95 58%, #7c3aed 100%);
		              color: #ffffff;
		              padding: 18px 20px;
		            }
		            .brand-row {
		              min-width: 0;
		            }
		            .title-block {
		              min-width: 0;
		            }
		            .title-block h1 {
		              margin: 0;
		              font-size: 34px;
		              line-height: 1;
		              font-family: Inter, "Avenir Next", "Segoe UI", sans-serif;
		              font-weight: 700;
		              letter-spacing: 0;
		              color: #ffffff;
		            }
		            .title-tags {
		              margin-bottom: 8px;
		              display: flex;
		              flex-wrap: wrap;
		              gap: 8px;
		            }
		            .title-tag {
		              display: inline-flex;
		              align-items: center;
		              border-radius: 999px;
		              padding: 6px 11px;
		              border: 1px solid rgba(255, 255, 255, 0.35);
		              background: rgba(255, 255, 255, 0.14);
		              color: #ffffff;
		              font-size: 9px;
		              font-weight: 700;
		              letter-spacing: 0.1em;
		              text-transform: uppercase;
		            }
		            .title-tag-accent {
		              background: #ffffff;
		              border-color: #ffffff;
		              color: var(--violet-dark);
		            }
		            .hero-date {
		              align-self: flex-end;
		              display: flex;
		              flex-direction: column;
		              gap: 3px;
		              min-width: 140px;
		              text-align: right;
		              color: rgba(255, 255, 255, 0.72);
		              font-size: 8px;
		              line-height: 1.25;
		              font-weight: 700;
		              letter-spacing: 0.11em;
		              text-transform: uppercase;
		            }
		            .hero-date strong {
		              color: #ffffff;
		              font-size: 11px;
		              font-weight: 600;
		              letter-spacing: 0;
		              text-transform: none;
		            }
		            .info-card {
		              border: 1px solid var(--line);
	              border-radius: 0 0 18px 18px;
	              border-top: 0;
	              background: #ffffff;
	              margin: 0 0 24px;
	              overflow: hidden;
	            }
		            .info-grid {
		              display: grid;
		              grid-template-columns: 1.2fr 0.85fr 1.1fr;
		            }
			            .info-item {
			              min-height: 58px;
			              padding: 13px 14px 12px;
			              border-left: 1px solid var(--line);
			            }
	            .info-item:first-child {
	              border-left: 0;
	            }
	            .info-label {
	              display: block;
		              font-size: 9px;
		              text-transform: uppercase;
		              letter-spacing: 0.1em;
		              color: #6d28d9;
		              font-weight: 700;
		              margin-bottom: 4px;
		            }
	            .info-value {
	              display: block;
		              color: var(--ink);
		              font-size: 12px;
		              line-height: 1.25;
		              font-weight: 600;
		              overflow-wrap: anywhere;
		            }
	            .divider {
	              margin: 24px 0 16px;
	              height: 1px;
	              border: 0;
	              background: linear-gradient(90deg, #111827 0%, #7c3aed 42%, rgba(124,58,237,0) 100%);
	              opacity: 0.35;
	            }
	            .section-title {
	              display: flex;
	              align-items: center;
	              gap: 9px;
		              font-size: 11px;
		              font-weight: 700;
		              letter-spacing: 0.12em;
	              text-transform: uppercase;
	              color: var(--ink);
	              margin-bottom: 12px;
	            }
	            .section-title::before {
	              content: "";
	              width: 20px;
	              height: 3px;
	              border-radius: 999px;
	              background: linear-gradient(90deg, var(--black), var(--violet));
	            }
	            .summary-list {
	              display: flex;
	              flex-direction: column;
	              border: 1px solid #eee7f6;
	              border-radius: 16px;
	              overflow: hidden;
	              background: #ffffff;
	              break-inside: avoid;
	              page-break-inside: avoid;
	            }
	            .summary-list > *,
	            .team-grid > * {
	              break-inside: avoid;
	              page-break-inside: avoid;
	            }
	            .team-grid {
	              display: flex;
	              flex-direction: column;
	              gap: 10px;
	              break-inside: avoid;
	              page-break-inside: avoid;
	            }
	            .category-line {
	              position: relative;
	              display: grid;
	              grid-template-columns: minmax(190px, 0.95fr) minmax(0, 1.7fr);
	              align-items: center;
	              gap: 16px;
	              padding: 12px 14px 12px 18px;
	              border-top: 1px solid #f0e7f7;
	              font-size: 12px;
	              break-inside: avoid;
	              page-break-inside: avoid;
	            }
	            .category-line:first-child {
	              border-top: 0;
	            }
	            .category-line::before {
	              content: "";
	              position: absolute;
	              inset: 12px auto 12px 0;
	              width: 3px;
	              border-radius: 0 999px 999px 0;
	              background: #111827;
	            }
		            .card-empty {
	              text-align: center;
	              color: var(--muted);
		              font-weight: 600;
	              padding: 18px;
	              border: 1px solid #eee7f6;
	              border-radius: 16px;
	            }
	            .category-line--life::before { background: #7c3aed; }
		            .category-line--auto::before { background: #111827; }
		            .category-line--propertyLiability::before { background: #4c1d95; }
		            .category-line--travel::before { background: #6d28d9; }
		            .category-line--foreigners::before { background: #7c3aed; }
		            .category-line--entrepreneurs::before { background: #2e1065; }
	            .category-line--gold::before { background: #111827; }
		            .category-line-title {
		              display: flex;
		              align-items: center;
		              gap: 10px;
		              font-size: 12px;
		              font-weight: 700;
	              letter-spacing: 0.07em;
	              text-transform: uppercase;
	              color: var(--ink);
	            }
	            .category-line-metrics {
	              display: flex;
	              justify-content: flex-end;
	              gap: 18px;
	              align-items: center;
	              color: var(--ink);
	              font-size: 12px;
	              font-weight: 600;
	              text-align: right;
	            }
	            .category-line-metrics span {
	              min-width: 0;
	              white-space: nowrap;
	              overflow-wrap: anywhere;
	            }
		            .category-line--compact {
		              grid-template-columns: minmax(170px, 0.85fr) minmax(0, 1.45fr);
		              padding: 9px 11px 9px 15px;
		              border: 1px solid #eee7f6;
		              border-radius: 12px;
	              background: #fbf9ff;
	            }
	            .category-line--compact + .category-line--compact {
	              margin-top: 7px;
	            }
	            .category-line--compact::before {
	              inset: 9px auto 9px 0;
	              width: 3px;
	            }
	            .category-line--compact .category-line-title {
	              font-size: 10px;
	              letter-spacing: 0.05em;
	            }
		            .category-line--compact .category-line-metrics {
		              display: grid;
		              grid-auto-flow: column;
		              grid-auto-columns: max-content;
		              justify-content: flex-end;
		              font-size: 10px;
		              gap: 12px;
		            }
		            .theme-icon {
		              width: 25px;
		              height: 25px;
		              border-radius: 9px;
		              display: inline-flex;
		              align-items: center;
		              justify-content: center;
		              background: #ffffff;
		              border: 1px solid #d8c3f1;
		              color: #6d28d9;
		              flex-shrink: 0;
		              overflow: hidden;
		              line-height: 0;
		            }
		            .theme-icon svg {
		              width: 15px;
		              height: 15px;
		              fill: none;
		              stroke: currentColor;
		              stroke-width: 2.05;
		              stroke-linecap: round;
		              stroke-linejoin: round;
		            }
		            .theme-life .theme-icon { border-color: #c4b5fd; color: #7c3aed; }
		            .theme-auto .theme-icon { border-color: #d8c3f1; color: #111827; }
		            .theme-propertyLiability .theme-icon { border-color: #c4b5fd; color: #4c1d95; }
		            .theme-travel .theme-icon { border-color: #c4b5fd; color: #6d28d9; }
		            .theme-foreigners .theme-icon { border-color: #c4b5fd; color: #7c3aed; }
		            .theme-entrepreneurs .theme-icon { border-color: #c4b5fd; color: #2e1065; }
		            .theme-gold .theme-icon { border-color: #d8c3f1; color: #111827; }
	            .card-user {
	              position: relative;
	              overflow: hidden;
	              border-radius: 16px;
	              background: #ffffff;
	              border: 1px solid #eee7f6;
	              padding: 14px 14px 13px;
	              break-inside: avoid;
	              page-break-inside: avoid;
	            }
	            .card-user-header {
	              display: flex;
	              align-items: center;
	              gap: 11px;
	              margin-bottom: 10px;
	            }
	            .avatar {
	              width: 34px;
	              height: 34px;
	              border-radius: 12px;
	              background: linear-gradient(135deg, #111827 0%, #581c87 100%);
	              color: #ffffff;
	              display: flex;
	              align-items: center;
	              justify-content: center;
	              font-size: 13px;
		              font-weight: 700;
	              flex-shrink: 0;
	            }
		            .card-user-name {
		              font-size: 14px;
		              font-weight: 700;
	              color: var(--ink);
	            }
	            .card-user-email {
	              font-size: 11px;
	              color: var(--muted);
	            }
	            .card-user-position {
	              margin-top: 2px;
	              font-size: 10px;
		              color: #6d28d9;
		              font-weight: 700;
	            }
		            .card-user-body {
		              border-top: 1px solid #f0e7f7;
		              padding-top: 10px;
		              display: grid;
		              grid-template-columns: 1fr;
		              gap: 7px;
		            }
	            .product-table {
	              width: 100%;
	              border-collapse: separate;
	              border-spacing: 0;
	              margin-top: 10px;
	              font-size: 12px;
	              border-radius: 16px;
	              overflow: hidden;
	              border: 1px solid #eee7f6;
	              background: #ffffff;
	            }
	            .product-table thead {
	              background: #0b1020;
	              color: #ffffff;
	            }
		            .product-table th {
	              padding: 11px 12px;
	              text-align: left;
		              font-weight: 700;
		              letter-spacing: 0.09em;
	              text-transform: uppercase;
	              font-size: 9px;
	            }
	            .product-table tbody tr:nth-child(even) { background: #fdfbff; }
	            .product-table td {
	              padding: 10px 12px;
	              border-bottom: 1px solid #f0e7f7;
	              color: #3f3f46;
	              vertical-align: middle;
	            }
	            .product-table tbody tr:last-child td {
	              border-bottom: 0;
	            }
	            .product-table td.product { width: 62%; text-align: left; }
		            .product-table td.count {
	              width: 12%;
	              text-align: center;
		              font-weight: 700;
	              color: var(--ink);
	            }
		            .product-table td.amount {
	              width: 26%;
	              text-align: right;
		              font-weight: 700;
	              color: var(--ink);
	              font-size: 15px;
	              white-space: nowrap;
	            }
	            .product-cell {
	              display: flex;
	              align-items: center;
	              gap: 10px;
	              min-height: 32px;
	            }
	            .product-logo {
	              width: 30px;
	              height: 30px;
	              border-radius: 10px;
	              border: 1px solid #eee7f6;
	              background: #ffffff;
	              display: flex;
	              align-items: center;
	              justify-content: center;
	              overflow: hidden;
	              flex-shrink: 0;
	            }
	            .product-logo img {
	              width: 100%;
	              height: 100%;
	              object-fit: contain;
	              padding: 3px;
	            }
		            .product-logo-fallback {
		              font-size: 11px;
		              font-weight: 700;
	              color: #6d28d9;
	              background: #f5f3ff;
	            }
	            .product-meta {
	              min-width: 0;
	            }
		            .product-name {
		              color: var(--ink);
		              line-height: 1.25;
		              font-weight: 600;
	            }
	            .product-provider {
	              margin-top: 2px;
	              font-size: 9px;
	              color: var(--muted);
		              text-transform: uppercase;
		              letter-spacing: 0.08em;
		              font-weight: 600;
	            }
	            .monthly-chart {
	              display: flex;
	              align-items: flex-end;
	              gap: 10px;
	              padding: 14px 12px 10px;
	              border-radius: 16px;
	              background: #ffffff;
	              border: 1px solid #eee7f6;
	              min-height: 154px;
	            }
	            .monthly-bar {
	              flex: 1;
	              display: flex;
	              flex-direction: column;
	              align-items: center;
	              gap: 6px;
	              min-width: 0;
	            }
	            .monthly-bar .bar {
	              width: 100%;
	              max-width: 38px;
	              border-radius: 999px 999px 6px 6px;
	              background: linear-gradient(180deg, #7c3aed 0%, #2e1065 100%);
	            }
	            .monthly-bar .value {
		              font-size: 9px;
		              color: var(--ink);
		              font-weight: 600;
	              white-space: nowrap;
	            }
	            .monthly-bar .label {
	              font-size: 9px;
		              color: var(--muted);
		              text-align: center;
		              font-weight: 600;
	            }
	            .footer-note {
	              margin-top: 20px;
	              border-top: 1px solid #f0e7f7;
	              padding-top: 12px;
	              font-size: 10px;
	              color: var(--muted);
	              line-height: 1.5;
	            }
	            @media print {
	              body { background: #ffffff; padding: 0; }
	              .page { box-shadow: none; border-radius: 0; }
	            }
	          </style>
        </head>
	        <body>
		          <div class="page report-page">
		            <div class="report-body">
			              <div class="report-hero">
			                <div class="brand-row">
			                  <div class="title-block">
			                    <div class="title-tags">
			                      <span class="title-tag title-tag-accent">Export produkce</span>
			                    </div>
			                    <h1>Produkce</h1>
			                  </div>
			                </div>
			                <div class="hero-date">
			                  <span>Vygenerováno</span>
			                  <strong>${generatedLabel}</strong>
			                </div>
			              </div>

	            <div class="info-card">
	              <div class="info-grid">
	                <div class="info-item">
	                  <span class="info-label">Poradce</span>
	                  <span class="info-value">${adviserName}</span>
	                </div>
	                <div class="info-item">
	                  <span class="info-label">Rozsah</span>
	                  <span class="info-value">${scopeLabel}</span>
                </div>
	                <div class="info-item">
	                  <span class="info-label">Období</span>
	                  <span class="info-value">${periodFrom} – ${periodTo}</span>
	                </div>
	              </div>
	            </div>

            <div class="divider"></div>

            <div>
              <div class="section-title">Souhrn vybrané produkce</div>
	              <div class="summary-list">
                ${
                  summarySections.length > 0
                    ? summarySections.join("")
                    : `<div class="card-empty">V zadaném období nebyly nalezeny žádné smlouvy.</div>`
                }
              </div>
            </div>

            ${
              perProduct.size > 0
                ? `
                  <div class="divider"></div>
                  <div>
                    <div class="section-title">Přehled podle produktu (roční pojistné)</div>
                    <table class="product-table">
                      <thead>
                        <tr>
                          <th>Produkt</th>
                          <th>Počet smluv</th>
                          <th>Sjednané pojistné</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${productRowsHtml}
                      </tbody>
                    </table>
                  </div>
                `
                : ""
            }

            ${
              showMonthlyTrend
                ? `
                  <div class="divider"></div>
                  <div>
                    <div class="section-title">Vývoj produkce podle měsíců</div>
                    <div class="monthly-chart">
                      ${monthlyTotals
                        .map((m) => {
                          const height =
                            monthlyMax > 0
                              ? Math.max(12, Math.round((m.value / monthlyMax) * 100))
                              : 12;
                          return `
                            <div class="monthly-bar">
                              <div class="value">${formatMoney(m.value)}</div>
                              <div class="bar" style="height:${height}px"></div>
                              <div class="label">${escapeHtml(m.label)}</div>
                            </div>
                          `;
                        })
                        .join("")}
                    </div>
                  </div>
                `
                : ""
            }

            ${
              isTeamScope && teamCards.length > 0
                ? `
                  <div class="divider"></div>
                  <div>
                    <div class="section-title">Výkony jednotlivých poradců</div>
	                    <div class="team-grid">
                      ${teamCards.join("")}
                    </div>
                  </div>
                `
                : ""
            }

	              <div class="footer-note">
	                PDF bylo vygenerováno z interní webové aplikace Bohemka.App.
	                Čísla jsou orientační a mohou se lišit od údajů v systémech
	                jednotlivých společností.
	              </div>
	            </div>
	          </div>
        </body>
      </html>
    `;

    const filenameBase =
      scopeOption === "own"
        ? "produkce_own"
        : scopeOption === "ownTeam"
        ? "produkce_own_team"
        : scopeOption === "team"
        ? "produkce_team"
        : "produkce_team_selected";

	    const snapshot: ExportShareSnapshot = {
      scopeLabel: scopeLabelRaw,
      dateRangeLabel: dateLabelRaw,
      periodFrom: periodFromRaw,
      periodTo: periodToRaw,
      generatedLabel: generatedLabelRaw,
      adviserName: adviserNameRaw,
      adviserEmail: adviserEmailRaw,
      selectedCategoryLabel,
      selectedAdvisersLabel,
      totalContracts,
      totalAnnual,
      lifeContracts: summary.lifeContracts,
      lifeAnnual: summary.lifeAnnual,
      nonLifeContracts: summary.nonLifeContracts,
      nonLifeAnnual: summary.nonLifeAnnual,
      autoContracts: summary.autoContracts,
      autoAnnual: summary.autoAnnual,
      propertyContracts: summary.propertyContracts,
      propertyAnnual: summary.propertyAnnual,
      goldContracts: summary.goldContracts,
      goldTotal: summary.goldTotal,
      topProductName: topProductEntry ? productLabel(topProductEntry[0]) : "",
      topProductAnnual: topProductEntry ? topProductEntry[1].annual : 0,
    };

    if (effectiveUserEmail(user.email) !== email) {
      throw new Error("Přepnutí uživatele se změnilo. Export spusť znovu.");
    }
    return { html, filenameBase, snapshot };
  };

  /* ---------------- akce: PDF + náhled ---------------- */

  const handleGeneratePdf = async () => {
    if (!user?.email) return;
    if (!validateScopeConfig()) return;

    setGenerationMode("pdf");
    setGenerating(true);
    setErrorText(null);

    try {
      const { html, filenameBase } = await buildReportHtml();
      const safeHtml = stripUnsupportedColors(html);
      const blob = await withBestPdfSource(safeHtml, async (sourceEl) => {
        return await renderPdfBlobFromElement(sourceEl, {
          marginPt: 10,
          scale: 2,
          imageQuality: 0.96,
        });
      });
      downloadBlobFile(blob, `${filenameBase}_${dateRangeOption}.pdf`);
    } catch (e) {
      console.error("Chyba při generování PDF", e);
      setErrorText(
        e instanceof Error && e.message
          ? `Nepodařilo se vygenerovat PDF: ${e.message}`
          : "Nepodařilo se vygenerovat PDF. Zkus to prosím znovu nebo později."
      );
    } finally {
      setGenerating(false);
      setGenerationMode(null);
    }
  };

  const handlePreview = async () => {
    if (!user?.email) return;
    if (!validateScopeConfig()) return;

    setGenerationMode("preview");
    setGenerating(true);
    setPreviewLoadProgress(0);
    setErrorText(null);

    try {
      const { html } = await buildReportHtml();
      setPreviewHtml(html);
    } catch (e) {
      console.error("Chyba při generování náhledu", e);
      setErrorText(
        "Nepodařilo se připravit náhled PDF. Zkus to prosím znovu."
      );
    } finally {
      setPreviewLoadProgress(100);
      setGenerating(false);
      setGenerationMode(null);
    }
  };

  const handleShareExport = async () => {
    if (!user?.email) return;
    if (!validateScopeConfig()) return;

    let recipientOption: RecipientOption | null = shareUseDirectManager
      ? directManager
      : shareSelectedRecipient;
    if (!recipientOption && !shareUseDirectManager) {
      const exactEmail = normalizeEmail(shareRecipientQuery);
      if (exactEmail && EMAIL_RE.test(exactEmail)) {
        const exactMatch = shareSuggestions.find((row) => row.email === exactEmail);
        if (exactMatch) {
          recipientOption = exactMatch;
        }
      }
    }

    if (!recipientOption?.email) {
      setShareErrorText(
        "Vyber prosím příjemce ze seznamu návrhů nebo zvol přímého nadřízeného."
      );
      return;
    }

    setShareSubmitting(true);
    setShareErrorText(null);
    setShareSuccessText(null);

    try {
      const { snapshot } = await buildReportHtml();
      const payload = await fetchAuthedJsonOrThrow<ExportShareResponse>(
        user,
        "/api/export-produkce/share",
        {
          method: "POST",
          body: JSON.stringify({
            recipientEmail: recipientOption.email,
            noteText: shareMessageText,
            snapshot,
          }),
        }
      );

      const sentName =
        typeof payload?.recipientName === "string" && payload.recipientName.trim().length > 0
          ? payload.recipientName.trim()
          : recipientOption.name;
      setShareSuccessText(`Export byl odeslán uživateli ${sentName}.`);
      setShareModalOpen(false);
      setShareUseDirectManager(false);
      setShareSelectedRecipient(null);
      setShareRecipientQuery("");
      setShareSuggestions([]);
      setShareSuggestionsLoading(false);
      setShareMessageText("");
    } catch (err: any) {
      setShareErrorText(err?.message || "Export se nepodařilo odeslat.");
    } finally {
      setShareSubmitting(false);
    }
  };

  /* ----------------------------- render ----------------------------- */

  const renderPreviewLoading = () => (
    <div className="relative grid h-[640px] overflow-hidden bg-white px-6 py-8 sm:px-10 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,#ffffff_0%,#ffffff_39%,#fff2ff_39%,#fff7ff_56%,#ffffff_56%,#ffffff_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#020617_0%,#7c3aed_54%,#ec4899_100%)]" />

      <div className="relative z-10 flex flex-col justify-center">
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-fuchsia-200 bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-fuchsia-700 shadow-[0_10px_24px_rgba(189,0,201,0.1)]">
          <Eye size={14} strokeWidth={2.2} aria-hidden="true" />
          <span>Náhled produkce</span>
        </div>

        <div className="mt-8 flex items-end gap-2">
          <span className="text-[86px] font-black leading-[0.82] tracking-tight text-black sm:text-[112px]">
            {Math.round(previewProgress)}
          </span>
          <span className="pb-2 text-4xl font-black leading-none text-[#bd00c9] sm:text-5xl">
            %
          </span>
        </div>

        <div className="mt-7 space-y-2">
          <h2 className="max-w-sm text-3xl font-black leading-tight tracking-tight text-black sm:text-4xl">
            Připravuji náhled
          </h2>
          <p className="text-base font-bold text-slate-500">
            {previewLoaderStatus}
          </p>
        </div>

        <div className="mt-8 max-w-md">
          <div className="h-3 overflow-hidden rounded-full border border-slate-200 bg-slate-100 shadow-inner">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#020617_0%,#7c3aed_58%,#ec4899_100%)] transition-[width] duration-200 ease-out"
              style={{ width: `${previewProgress}%` }}
            />
          </div>
          <div className="mt-3 h-px w-full bg-[linear-gradient(90deg,rgba(2,6,23,0.22),rgba(124,58,237,0.34),rgba(2,6,23,0))]" />
        </div>
      </div>

      <div className="relative z-10 mt-10 flex items-center justify-center lg:mt-0">
        <div className="relative h-[350px] w-[260px] sm:h-[390px] sm:w-[292px]">
          <div className="absolute inset-0 rotate-[-3deg] rounded-[28px] border border-violet-100 bg-white shadow-[0_26px_60px_rgba(15,23,42,0.13)]" />
          <div className="absolute inset-0 rotate-[-3deg] overflow-hidden rounded-[28px] border border-violet-100 bg-white">
            <div className="h-16 bg-[linear-gradient(135deg,#12091f_0%,#4c1d95_58%,#7c3aed_100%)] px-5 py-4">
              <div className="h-3 w-28 rounded-full bg-white" />
              <div className="mt-3 h-4 w-36 rounded-full bg-white/70" />
            </div>
            <div className="space-y-4 p-5">
              <div className="h-3 w-44 rounded-full bg-slate-950" />
              {[0, 1, 2, 3].map((row) => (
                <div
                  key={row}
                  className="grid grid-cols-[1fr_72px] items-center gap-4 rounded-2xl border border-violet-100 bg-white px-4 py-3"
                >
                  <div className="space-y-2">
                    <div className="h-3 w-24 rounded-full bg-violet-200" />
                    <div className="h-2 w-32 rounded-full bg-slate-100" />
                  </div>
                  <div className="ml-auto h-3 w-16 rounded-full bg-slate-950" />
                </div>
              ))}
            </div>
          </div>
          <div
            className="absolute inset-0 rotate-[-3deg] overflow-hidden rounded-[28px] transition-[clip-path] duration-200 ease-out"
            style={{ clipPath: previewScanClipPath }}
            aria-hidden="true"
          >
            <div className="h-full border border-violet-200 bg-violet-50/35" />
          </div>
          <div
            className="absolute left-[-10%] right-[-10%] z-10 h-1 rotate-[-3deg] rounded-full bg-[#bd00c9] shadow-[0_0_18px_rgba(189,0,201,0.42)] transition-[bottom] duration-200 ease-out"
            style={{
              bottom: `${previewProgress}%`,
              transform: "translateY(50%)",
            }}
            aria-hidden="true"
          />
          <div className="absolute -right-3 -top-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-fuchsia-200 bg-white text-fuchsia-700 shadow-[0_14px_34px_rgba(15,23,42,0.12)]">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        </div>
      </div>
    </div>
  );

  if (!user) {
    return (
      <AppLayout active="tools">
        <div className="mx-auto w-full max-w-3xl px-2 py-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-800 shadow-[0_18px_42px_rgba(15,23,42,0.08)]">
            Pro použití exportu produkce se nejprve přihlas.
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout active="tools">
      <div className="relative w-full overflow-hidden bg-[linear-gradient(180deg,#ffffff_0%,#fbf7ff_45%,#ffffff_100%)] px-0 pb-8 sm:px-3">
        <div className="mx-auto w-full max-w-[1500px] space-y-3 sm:space-y-4">
          <header className="flex flex-col gap-3 px-0 pt-0 sm:gap-4 sm:px-3 sm:pt-2 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col gap-3 min-[560px]:flex-row min-[560px]:items-end min-[560px]:justify-between sm:gap-4 lg:min-w-0 lg:flex-1">
              <div className="space-y-2 sm:space-y-3">
                <div className="inline-flex items-center gap-1.5 rounded-full border border-fuchsia-200 bg-white/92 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-fuchsia-700 shadow-[0_8px_18px_rgba(217,70,239,0.08)] sm:gap-2 sm:px-3 sm:text-[11px] sm:tracking-[0.18em] sm:shadow-[0_10px_24px_rgba(217,70,239,0.1)]">
                  <Sparkles className="h-3.5 w-3.5" />
                  Export produkce
                </div>
                <SplitTitle
                  text="Statistika"
                  className="text-[2.55rem] sm:text-6xl lg:text-7xl"
                />
              </div>

              <div className="hidden shrink-0 min-[560px]:block">
                <Image
                  src="/icons/export-produkce.webp"
                  alt="Export produkce"
                  width={320}
                  height={320}
                  className="h-32 w-auto object-contain grayscale opacity-90 sm:h-40 lg:h-44"
                  priority
                />
              </div>
            </div>
          </header>

          <div className="grid gap-3 sm:gap-4 lg:grid-cols-[290px_minmax(0,1fr)] lg:items-start xl:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="space-y-2.5 sm:space-y-3 lg:sticky lg:top-4">
              <section className="relative space-y-3 overflow-hidden rounded-[22px] border border-violet-100 bg-white p-3 shadow-[0_12px_28px_rgba(76,29,149,0.08)] sm:space-y-4 sm:rounded-[28px] sm:p-4 sm:shadow-[0_18px_42px_rgba(76,29,149,0.10)]">
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#020617_0%,#8b5cf6_48%,#ec4899_100%)]"
                />
                <div className="flex items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-fuchsia-700 sm:gap-2 sm:px-3 sm:text-[11px] sm:tracking-[0.16em]">
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    Nastavení exportu
                  </div>
                </div>

                <div className="space-y-2 rounded-[18px] border border-violet-100 bg-white/82 p-3 shadow-sm sm:space-y-2.5 sm:rounded-2xl sm:p-3.5">
                  <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-fuchsia-700">
                    <UsersRound
                      size={12}
                      strokeWidth={2.2}
                      className="shrink-0"
                      aria-hidden="true"
                    />
                    <span>Rozsah exportu</span>
                  </div>
                  <div className="grid gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setScopeOption("own")}
                      className={`ui-focus w-full rounded-xl border px-2.5 py-2 text-left text-xs font-semibold transition ${
                        scopeOption === "own"
                          ? EXPORT_ACTIVE_DARK_CLASS
                          : EXPORT_INACTIVE_CHIP_CLASS
                      }`}
                    >
                      Vlastní
                    </button>
                    <button
                      type="button"
                      disabled={!hasTeam}
                      onClick={() => setScopeOption("ownTeam")}
                      className={`ui-focus w-full rounded-xl border px-2.5 py-2 text-left text-xs font-semibold transition ${
                        scopeOption === "ownTeam"
                          ? EXPORT_ACTIVE_VIOLET_CLASS
                          : EXPORT_INACTIVE_CHIP_CLASS
                      } ${!hasTeam ? "cursor-not-allowed opacity-45" : ""}`}
                    >
                      Vlastní a týmová
                    </button>
                    <button
                      type="button"
                      disabled={!hasTeam}
                      onClick={() => setScopeOption("team")}
                      className={`ui-focus w-full rounded-xl border px-2.5 py-2 text-left text-xs font-semibold transition ${
                        scopeOption === "team"
                          ? EXPORT_ACTIVE_DARK_CLASS
                          : EXPORT_INACTIVE_CHIP_CLASS
                      } ${!hasTeam ? "cursor-not-allowed opacity-45" : ""}`}
                    >
                      Týmová
                    </button>
                    <button
                      type="button"
                      disabled={!hasTeam}
                      onClick={() => setScopeOption("selected")}
                      className={`ui-focus w-full rounded-xl border px-2.5 py-2 text-left text-xs font-semibold transition ${
                        scopeOption === "selected"
                          ? EXPORT_ACTIVE_FUCHSIA_CLASS
                          : EXPORT_INACTIVE_CHIP_CLASS
                      } ${!hasTeam ? "cursor-not-allowed opacity-45" : ""}`}
                    >
                      Vybraní podřízení
                    </button>
                  </div>

                  {loadingSubs && (
                    <p className="text-xs text-slate-600">Načítám podřízené…</p>
                  )}
                  {!loadingSubs && !hasTeam && (
                    <p className="text-xs text-slate-600">
                      Nemáš nastavené podřízené, proto je dostupná jen vlastní produkce.
                    </p>
                  )}

                  {scopeOption === "selected" && hasTeam && (
                    <div ref={subordinatesPickerRef} className="relative">
                      <button
                        type="button"
                        onClick={() => setSubordinatesPickerOpen((v) => !v)}
                        className={`ui-focus inline-flex w-full items-center justify-between rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                          subordinatesPickerOpen
                            ? EXPORT_ACTIVE_FUCHSIA_CLASS
                            : "border-violet-200 bg-white text-slate-700 hover:border-violet-300 hover:bg-violet-50/70"
                        }`}
                      >
                        <span>Vybraní podřízení ({selectedSubs.size})</span>
                        <span>{subordinatesPickerOpen ? "▴" : "▾"}</span>
                      </button>

                      {subordinatesPickerOpen && (
                        <div className="absolute left-0 top-full z-40 mt-2 w-full rounded-2xl border border-violet-200 bg-white shadow-[0_18px_44px_rgba(76,29,149,0.18)]">
                          <div className="flex items-center justify-between border-b border-violet-100 px-3 py-2">
                            <div className="text-xs font-semibold text-slate-700">
                              Vyber poradce
                            </div>
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedSubs(new Set(subordinates.map((s) => s.email)))
                                }
                                className="ui-focus rounded-xl border border-violet-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:border-violet-300 hover:bg-violet-50"
                              >
                                Vše
                              </button>
                              <button
                                type="button"
                                onClick={() => setSelectedSubs(new Set())}
                                className="ui-focus rounded-xl border border-violet-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:border-violet-300 hover:bg-violet-50"
                              >
                                Nic
                              </button>
                            </div>
                          </div>
                          <div className="border-b border-violet-100 px-2.5 py-2">
                            <label className="relative block">
                              <Search
                                size={14}
                                strokeWidth={2}
                                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                                aria-hidden="true"
                              />
                              <input
                                type="text"
                                value={subordinateSearch}
                                onChange={(e) => setSubordinateSearch(e.target.value)}
                                placeholder="Hledat poradce nebo e-mail"
                                className="ui-focus w-full rounded-xl border border-violet-200 bg-white py-1.5 pl-8 pr-2.5 text-xs text-slate-800 outline-none placeholder:text-slate-400 focus:border-fuchsia-400"
                              />
                            </label>
                          </div>
                          <div className="max-h-56 space-y-1 overflow-y-auto p-2">
                            {filteredSubordinates.length === 0 ? (
                              <p className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px] text-slate-500">
                                Nenašel se žádný podřízený pro zadaný filtr.
                              </p>
                            ) : (
                              filteredSubordinates.map((sub) => {
                                const active = selectedSubs.has(sub.email);
                                return (
                                  <button
                                    key={sub.email}
                                    type="button"
                                    onClick={() => handleToggleSubordinate(sub.email)}
                                    className={`ui-focus w-full rounded-xl border px-2.5 py-1.5 text-left transition ${
                                      active
                                        ? EXPORT_ACTIVE_FUCHSIA_CLASS
                                        : "border-violet-100 bg-white text-slate-800 hover:border-violet-300 hover:bg-violet-50/70"
                                    }`}
                                  >
                                    <span className="block text-[12px] font-semibold">
                                      {sub.name}
                                    </span>
                                    <span
                                      className={`block text-[10px] ${
                                        active ? "text-[rgba(248,250,252,0.85)]" : "text-slate-500"
                                      }`}
                                    >
                                      {sub.email}
                                    </span>
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-2.5 rounded-2xl border border-violet-100 bg-white/82 p-3.5 shadow-sm">
                  <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-fuchsia-700">
                    <CalendarDays
                      size={12}
                      strokeWidth={2.2}
                      className="shrink-0"
                      aria-hidden="true"
                    />
                    <span>Období</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {DATE_RANGE_OPTIONS.map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => {
                          setDateRangeOption(value);
                          setErrorText(null);
                        }}
                        className={`ui-focus rounded-xl border px-2.5 py-2 text-center text-xs font-semibold transition ${
                          value === "custom" ? "col-span-2" : ""
                        } ${
                          dateRangeOption === value
                            ? EXPORT_ACTIVE_VIOLET_CLASS
                            : EXPORT_INACTIVE_CHIP_CLASS
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {dateRangeOption === "custom" && (
                    <div className="grid gap-2 border-t border-violet-100 pt-2 sm:grid-cols-2">
                      <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                        OD
                        <input
                          type="date"
                          value={customDateRange.from}
                          max={customDateRange.to || undefined}
                          onChange={(e) => {
                            setCustomDateRange((prev) => ({
                              ...prev,
                              from: e.target.value,
                            }));
                            setErrorText(null);
                          }}
                          className="mt-1 w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 outline-none transition focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-500/15"
                        />
                      </label>
                      <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                        DO
                        <input
                          type="date"
                          value={customDateRange.to}
                          min={customDateRange.from || undefined}
                          onChange={(e) => {
                            setCustomDateRange((prev) => ({
                              ...prev,
                              to: e.target.value,
                            }));
                            setErrorText(null);
                          }}
                          className="mt-1 w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 outline-none transition focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-500/15"
                        />
                      </label>
                    </div>
                  )}
                </div>

                <div className="space-y-2.5 rounded-2xl border border-violet-100 bg-white/82 p-3.5 shadow-sm">
                  <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-fuchsia-700">
                    <Tags
                      size={12}
                      strokeWidth={2.2}
                      className="shrink-0"
                      aria-hidden="true"
                    />
                    <span>Kategorie produktu</span>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() =>
                        setCategories(new Set<ProductCategory>(ALL_CATEGORY_KEYS))
                      }
                      className={`ui-focus inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition ${
                        allCategoriesSelected
                          ? EXPORT_ACTIVE_VIOLET_CLASS
                          : EXPORT_INACTIVE_CHIP_CLASS
                      }`}
                    >
                      Všechny
                    </button>
                    {CATEGORY_FILTERS.map((category) => (
                      <CheckboxChip
                        key={category.key}
                        label={category.label}
                        active={categories.has(category.key)}
                        onClick={() => handleToggleCategory(category.key)}
                      />
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-fuchsia-200 bg-[linear-gradient(160deg,#fff7ff_0%,#f6f3ff_100%)] px-3 py-2.5 text-xs text-slate-900">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-fuchsia-700">
                    Aktivní výběr
                  </div>
                  <div className="mt-1.5 space-y-1 leading-relaxed">
                    <div>
                      <span className="text-fuchsia-700/80">Rozsah:</span>{" "}
                      <span className="font-semibold">{scopeLabel}</span>
                    </div>
                    <div>
                      <span className="text-fuchsia-700/80">Období:</span>{" "}
                      <span className="font-semibold">{dateRangeLabel}</span>
                    </div>
                    <div>
                      <span className="text-fuchsia-700/80">Kategorie:</span>{" "}
                      <span className="font-semibold">{selectedCategoryLabel}</span>
                    </div>
                  </div>
                </div>
              </section>
            </aside>

            <div className="space-y-4">
              {errorText && (
                <p className="rounded-2xl border border-rose-300 bg-rose-100 px-4 py-2 text-xs text-rose-800 shadow-[0_12px_30px_rgba(244,63,94,0.16)]">
                  {errorText}
                </p>
              )}

              <section className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
	                  <button
	                    type="button"
	                    onClick={handlePreview}
	                    disabled={generating}
	                    className="inline-flex items-center gap-2 rounded-full border border-slate-950 bg-[linear-gradient(135deg,#111827_0%,#211442_54%,#090d1c_100%)] px-5 py-2.5 text-sm font-semibold text-[#f8fafc] shadow-[0_14px_30px_rgba(18,12,43,0.26)] transition hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_18px_38px_rgba(18,12,43,0.32)] disabled:cursor-not-allowed disabled:opacity-60"
	                  >
	                    <Eye className="h-4 w-4" />
	                    {generationMode === "preview"
	                      ? "Připravuji náhled…"
	                      : "Náhled PDF"}
	                  </button>

                  <button
                    type="button"
                    onClick={handleGeneratePdf}
	                    disabled={generating}
	                    className="inline-flex items-center gap-2 rounded-full border border-violet-300/30 bg-[linear-gradient(120deg,#7c3aed_0%,#a855f7_56%,#c084fc_100%)] px-6 py-2.5 text-sm font-semibold text-[#f8fafc] shadow-[0_14px_30px_rgba(124,58,237,0.28)] transition hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_18px_38px_rgba(124,58,237,0.34)] disabled:cursor-not-allowed disabled:opacity-60"
	                  >
	                    <Download className="h-4 w-4" />
	                    {generationMode === "pdf" ? "Připravuji PDF…" : "Stáhnout PDF"}
	                  </button>

                  <button
                    type="button"
                    onClick={openShareModal}
                    disabled={generating || shareSubmitting}
                    className="inline-flex items-center gap-2 rounded-full border border-fuchsia-300/35 bg-[linear-gradient(135deg,#020617_0%,#4c1d95_55%,#ec4899_100%)] px-5 py-2.5 text-sm font-semibold text-zinc-50 shadow-[0_14px_30px_rgba(76,29,149,0.26)] transition hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_18px_38px_rgba(76,29,149,0.32)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {shareSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    {shareSubmitting ? "Odesílám…" : "Odeslat"}
                  </button>

                </div>

                {shareSuccessText && (
                  <p className="rounded-xl border border-fuchsia-200 bg-fuchsia-50/85 px-3 py-2 text-xs font-semibold text-fuchsia-800">
                    {shareSuccessText}
                  </p>
                )}
              </section>

	              <section className="overflow-hidden rounded-[28px] border border-violet-100 bg-white shadow-[0_18px_44px_rgba(76,29,149,0.10)]">
	                {isPreparingPreview ? (
	                  renderPreviewLoading()
	                ) : previewHtml ? (
	                  <div className="flex h-[640px] flex-col overflow-hidden bg-white">
	                    <div className="flex shrink-0 items-center gap-2 border-b border-[#211442] bg-[#090d1c] px-4 py-2">
	                      <span className="h-2.5 w-2.5 rounded-full bg-[#fb7185]" />
	                      <span className="h-2.5 w-2.5 rounded-full bg-[#c084fc]" />
	                      <span className="h-2.5 w-2.5 rounded-full bg-white/80" />
	                      <span className="ml-2 truncate rounded bg-[#1f2937] px-2 py-0.5 text-[10px] font-medium text-[#cbd5e1]">
	                        Bohemka.App export preview
	                      </span>
	                    </div>
	                    <iframe
	                      srcDoc={previewHtml}
	                      title="Náhled PDF produkce"
	                      className="min-h-0 flex-1 border-0 bg-white"
	                    />
	                  </div>
	                ) : (
	                  <div className="grid min-h-[320px] place-items-center bg-[linear-gradient(160deg,#ffffff_0%,#faf5ff_100%)] px-5 py-12 text-center">
	                    <div className="max-w-md space-y-2">
	                      <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700">
	                        <Eye className="h-5 w-5" />
	                      </div>
	                      <p className="text-base font-semibold text-slate-900">
	                        Náhled zatím není připravený
	                      </p>
	                      <p className="text-sm text-slate-600">
	                        Klikni na „Náhled PDF“ a otevře se vizuální kontrola exportu podle aktuálních filtrů.
	                      </p>
	                    </div>
	                  </div>
	                )}
	              </section>
            </div>
          </div>
        </div>

        {shareModalOpen && (
          <div className="fixed inset-0 z-[90]">
            <button
              type="button"
              aria-label="Zavřít okno odeslání"
              onClick={closeShareModal}
              className="absolute inset-0 bg-slate-950/58 backdrop-blur-[2px]"
            />

            <div className="relative z-[91] flex min-h-full items-center justify-center p-4">
              <section className="relative w-full max-w-lg overflow-hidden rounded-[28px] border border-violet-200/70 bg-white/96 p-5 shadow-[0_28px_78px_rgba(76,29,149,0.24)] backdrop-blur-xl sm:p-6">
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#020617_0%,#8b5cf6_48%,#ec4899_100%)]"
                />
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-fuchsia-700">
                      <Send className="h-3.5 w-3.5" />
                      Odeslat export
                    </div>
                    <h3 className="mt-3 text-2xl font-semibold tracking-[-0.015em] text-slate-900">
                      Vyber příjemce
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">
                      Vyhledej uživatele podle jména nebo e-mailu a odešli mu export do pošty.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={closeShareModal}
                    disabled={shareSubmitting}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-violet-200 bg-white text-slate-600 transition hover:border-violet-300 hover:bg-violet-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-5 space-y-4">
                  <div className="space-y-2">
                    <label
                      htmlFor="export-share-recipient"
                      className="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-600"
                    >
                      Příjemce
                    </label>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        id="export-share-recipient"
                        type="text"
                        value={shareRecipientQuery}
                        onChange={(e) => {
                          const nextValue = e.target.value;
                          setShareRecipientQuery(nextValue);
                          setShareUseDirectManager(false);
                          setShareSelectedRecipient(null);
                          setShareErrorText(null);
                        }}
                        placeholder="Jméno nebo e-mail"
                        autoComplete="off"
                        className="w-full rounded-2xl border border-violet-200 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 outline-none transition focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-500/15"
                      />
                      {shareSuggestionsLoading ? (
                        <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-500" />
                      ) : null}
                    </div>

                    {!shareUseDirectManager && shareSuggestions.length > 0 && (
                      <div className="max-h-52 overflow-auto rounded-2xl border border-violet-100 bg-white p-1 shadow-[0_14px_30px_rgba(76,29,149,0.12)]">
                        {shareSuggestions.map((option) => (
                          <button
                            key={option.email}
                            type="button"
                            onClick={() => handleSelectSuggestion(option)}
                            className="flex w-full items-start justify-between rounded-xl px-3 py-2 text-left transition hover:bg-violet-50/70"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-slate-900">
                                {option.name}
                              </span>
                              <span className="block truncate text-xs text-slate-500">
                                {option.email}
                              </span>
                            </span>
                            <span className="ml-2 shrink-0 rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-fuchsia-700">
                              Vybrat
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-violet-100 bg-violet-50/45 px-3 py-2.5">
                    {directManager ? (
                      <label className="flex cursor-pointer items-start gap-3">
                        <input
                          type="checkbox"
                          checked={shareUseDirectManager}
                          onChange={(e) => handleToggleDirectManager(e.target.checked)}
                          className="mt-1 h-4 w-4 rounded border-violet-300 text-fuchsia-600 focus:ring-fuchsia-500"
                        />
                        <span className="text-sm text-slate-700">
                          <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900">
                            <UserCheck className="h-4 w-4 text-fuchsia-700" />
                            Přímý nadřízený
                          </span>
                          <span className="ml-1">{directManager.name}</span>
                          <span className="ml-1 text-xs text-slate-500">
                            ({directManager.email})
                          </span>
                        </span>
                      </label>
                    ) : (
                      <p className="text-xs text-slate-600">
                        Přímý nadřízený není v profilu nastaven.
                      </p>
                    )}
                  </div>

                  {(shareUseDirectManager ? directManager : shareSelectedRecipient) && (
                    <div className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50/80 px-3 py-2 text-sm">
                      <span className="font-semibold text-fuchsia-900">Vybraný příjemce:</span>{" "}
                      <span className="text-fuchsia-900">
                        {(shareUseDirectManager ? directManager : shareSelectedRecipient)?.name}
                      </span>
                      <span className="text-fuchsia-700">
                        {" "}
                        ({(shareUseDirectManager ? directManager : shareSelectedRecipient)?.email})
                      </span>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label
                      htmlFor="export-share-message"
                      className="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-600"
                    >
                      Text zprávy (volitelné)
                    </label>
                    <textarea
                      id="export-share-message"
                      value={shareMessageText}
                      onChange={(e) => setShareMessageText(e.target.value)}
                      rows={3}
                      maxLength={240}
                      placeholder="Napiš krátký vzkaz k exportu…"
                      className="w-full resize-none rounded-2xl border border-violet-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-500/15"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-slate-500">Emoji:</span>
                      {SHARE_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => appendShareEmoji(emoji)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-violet-100 bg-white text-base transition hover:border-fuchsia-200 hover:bg-fuchsia-50"
                          aria-label={`Přidat emoji ${emoji}`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>

                  {shareErrorText && (
                    <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                      {shareErrorText}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={closeShareModal}
                      disabled={shareSubmitting}
                      className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-violet-300 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Zrušit
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleShareExport()}
                      disabled={shareSubmitting}
                      className="inline-flex items-center gap-2 rounded-xl border border-fuchsia-300/35 bg-[linear-gradient(135deg,#020617_0%,#4c1d95_55%,#ec4899_100%)] px-4 py-2 text-sm font-semibold text-zinc-50 shadow-[0_12px_30px_rgba(76,29,149,0.25)] transition hover:-translate-y-0.5 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {shareSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      {shareSubmitting ? "Odesílám…" : "Odeslat"}
                    </button>
                  </div>
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

/* ---------------------- pomocné chip tlačítko ---------------------- */

function CheckboxChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`ui-focus inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition ${
        active
          ? EXPORT_ACTIVE_VIOLET_CLASS
          : EXPORT_INACTIVE_CHIP_CLASS
      }`}
    >
      <span
        className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border text-[9px] ${
          active
            ? "border-white bg-white text-slate-900"
            : "border-violet-200 text-transparent"
        }`}
      >
        {active ? "✓" : ""}
      </span>
      {label}
    </button>
  );
}
