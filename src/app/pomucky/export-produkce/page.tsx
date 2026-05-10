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
  ExternalLink,
  Loader2,
  Maximize2,
  Minimize2,
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
  | "currentYear";

type ScopeOption = "own" | "team" | "selected";

type ProductCategory = "life" | "nonlife" | "auto" | "property" | "gold";

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

type PerUserStats = AggregatedStats & {
  email: string;
  name: string;
  positionLabel?: string | null;
};

type UserProfileApiResponse = {
  profile?: {
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
  ["currentYear", "Aktuální rok"],
];

const CATEGORY_FILTERS: { key: ProductCategory; label: string }[] = [
  { key: "life", label: "Životní pojištění" },
  { key: "nonlife", label: "Neživotní pojištění" },
  { key: "auto", label: "Auto" },
  { key: "property", label: "Majetek" },
  { key: "gold", label: "Zlato" },
];

const ALL_CATEGORY_KEYS: ProductCategory[] = CATEGORY_FILTERS.map((c) => c.key);
const PRODUCT_ICON_PATHS: Partial<Record<Product, string>> = Object.fromEntries(
  PRODUCT_ORDER.map((product) => [
    product,
    productInstitutionLogo(product),
  ]).filter((entry): entry is [Product, string] => Boolean(entry[1]))
) as Partial<Record<Product, string>>;

function productCategory(p: Product): ProductCategory {
  if (isLifeProduct(p)) return "life";
  if (isAutoProduct(p)) return "auto";
  if (isPropertyProduct(p) || isTravelProduct(p) || hasProductGroup(p, "liability")) {
    return "property";
  }
  if (isComfortProduct(p)) return "gold";
  return "nonlife";
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
    case "currentYear":
      return "Aktuální rok";
  }
}

function labelForScope(option: ScopeOption): string {
  switch (option) {
    case "own":
      return "Vlastní produkce";
    case "team":
      return "Týmová produkce";
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

type ThemeIconKind = "life" | "nonlife" | "auto" | "property" | "gold";

function themeIconSvg(kind: ThemeIconKind): string {
  const base =
    'xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  switch (kind) {
    case "life":
      return `<svg ${base}><path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.4A4 4 0 0 1 19 11c0 5.5-7 10-7 10Z"/></svg>`;
    case "auto":
      return `<svg ${base}><path d="M3 13h18l-1.5-4.5a2 2 0 0 0-1.9-1.4H6.4a2 2 0 0 0-1.9 1.4L3 13Zm0 0v4m18-4v4M7 17a1.5 1.5 0 1 0 0 .01M17 17a1.5 1.5 0 1 0 0 .01"/></svg>`;
    case "property":
      return `<svg ${base}><path d="m3 11 9-7 9 7M5 10.5V20h14v-9.5M10 20v-5h4v5"/></svg>`;
    case "gold":
      return `<svg ${base}><path d="M4 8h16l-2 8H6L4 8Zm3-3h10l1 3H6l1-3Zm1 11h8v3H8v-3Z"/></svg>`;
    case "nonlife":
    default:
      return `<svg ${base}><path d="M4 5h16v14H4zM8 9h8M8 13h5"/></svg>`;
  }
}

// html2canvas neumí lab/oklch barvy → nahradíme je běžnými hex/barvami
function stripUnsupportedColors(html: string): string {
  return html.replace(/(?:oklch|lab)\([^)]*\)/gi, "#0f172a");
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

  const canvas = (await html2canvas(sourceEl, {
    scale,
    backgroundColor: "#ffffff",
    useCORS: true,
    imageTimeout: 20000,
    logging: false,
  })) as HTMLCanvasElement;

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

  const imageData = canvas.toDataURL("image/jpeg", imageQuality);
  const imageHeightInPdf = (canvas.height * contentWidth) / Math.max(1, canvas.width);

  let remaining = imageHeightInPdf;
  let offsetY = marginPt;
  pdf.addImage(
    imageData,
    "JPEG",
    marginPt,
    offsetY,
    contentWidth,
    imageHeightInPdf,
    undefined,
    "FAST"
  );
  remaining -= contentHeight;

  while (remaining > 0) {
    pdf.addPage();
    offsetY = marginPt - (imageHeightInPdf - remaining);
    pdf.addImage(
      imageData,
      "JPEG",
      marginPt,
      offsetY,
      contentWidth,
      imageHeightInPdf,
      undefined,
      "FAST"
    );
    remaining -= contentHeight;
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

function getDateRange(option: DateRangeOption): { from: Date; to: Date } {
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
    case "currentYear": {
      from.setMonth(0, 1);
      break;
    }
  }

  return { from, to };
}

/* ------------------------------- komponenta ----------------------------- */

export default function ExportProductionPage() {
  const [user, setUser] = useState<FirebaseUser | null>(null);

  const [dateRangeOption, setDateRangeOption] =
    useState<DateRangeOption>("last3");
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

  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [productIconDataUrls, setProductIconDataUrls] = useState<
    Partial<Record<Product, string>>
  >({});

  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewGeneratedAt, setPreviewGeneratedAt] = useState<Date | null>(null);
  const [previewExpanded, setPreviewExpanded] = useState(false);
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
    scopeOption === "team" || scopeOption === "selected";
  const allCategoriesSelected = ALL_CATEGORY_KEYS.every((key) =>
    categories.has(key)
  );
  const scopeLabel = labelForScope(scopeOption);
  const dateRangeLabel = labelForDateRange(dateRangeOption);
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
      : hasTeam
        ? `${subordinates.length + 1} lidí v týmu`
        : "Bez týmu";
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
    let alive = true;
    const loadDirectManager = async () => {
      if (!user?.email) {
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
        setDirectManager(null);
      }
    };

    void loadDirectManager();
    return () => {
      alive = false;
    };
  }, [user]);

  /* ------------------------- podřízení --------------------------- */

  useEffect(() => {
    const loadSubs = async () => {
      if (!user?.email) return;

      const email = normalizeEmail(user.email);

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
        console.error("Chyba při načítání podřízených", e);
        setErrorText("Nepodařilo se načíst podřízené (včetně celého týmu).");
      } finally {
        setLoadingSubs(false);
      }
    };

    loadSubs();
  }, [user]);

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
        const [logo, iconEntries] = await Promise.all([
          readAsset("/icons/bohemika_logo.png"),
          Promise.all(
            (Object.entries(PRODUCT_ICON_PATHS) as [Product, string][]).map(
              async ([product, path]) =>
                [product, await readAsset(path)] as const
            )
          ),
        ]);

        if (cancelled) return;

        if (logo) {
          setLogoDataUrl(logo);
        }

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
    if (!user?.email) {
      throw new Error("Uživatel není přihlášený.");
    }

    const email = user.email.trim().toLowerCase();
    const generatedAt = new Date();

    const { from, to } = getDateRange(dateRangeOption);
    const fromMs = from.getTime();

    // e-maily zahrnuté do exportu
    let emailsToLoad: string[] = [];

    if (scopeOption === "own") {
      emailsToLoad = [email];
    } else if (scopeOption === "team") {
      const subs = subordinates.map((s) => s.email);
      emailsToLoad = [email, ...subs];
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

    const scopeNeedsOwn = scopeOption === "own" || scopeOption === "team";
    const scopeNeedsTeam = scopeOption === "team" || scopeOption === "selected";

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

    const adviserNameRaw = nameFromEmail(email);
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
    const adviserEmail = escapeHtml(adviserEmailRaw);
    const dateLabel = escapeHtml(dateLabelRaw);
    const scopeLabel = escapeHtml(scopeLabelRaw);
    const generatedLabel = escapeHtml(generatedLabelRaw);
    const periodFrom = escapeHtml(periodFromRaw);
    const periodTo = escapeHtml(periodToRaw);

    const cats = selectedCategories;

    const includeLife = cats.has("life");
    const includeNonLife = cats.has("nonlife");
    const includeAuto = cats.has("auto");
    const includeProperty = cats.has("property");
    const includeGold = cats.has("gold");

    const perUserList = Array.from(perUser.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "cs")
    );

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

    const logoHtml =
      logoDataUrl != null
        ? `<div class="logo"><img src="${logoDataUrl}" class="logo-img" /></div>`
        : `<div class="logo-placeholder">B</div>`;

    const summarySections: string[] = [];
    const themedHeading = (
      label: string,
      kind: ThemeIconKind,
      className = "card-title"
    ) => `
      <div class="${className} theme-${kind}">
        <span class="theme-icon" aria-hidden="true">${themeIconSvg(kind)}</span>
        <span>${escapeHtml(label)}</span>
      </div>
    `;

    if (includeLife && (summary.lifeContracts > 0 || summary.lifeMonthly > 0)) {
      summarySections.push(`
        <div class="card card--life">
          ${themedHeading("Životní pojištění", "life")}
          <div class="card-row">
            <span>Měsíční pojistné celkem</span>
            <span>${formatMoney(summary.lifeMonthly)}</span>
          </div>
          <div class="card-row">
            <span>Roční pojistné celkem</span>
            <span>${formatMoney(summary.lifeAnnual)}</span>
          </div>
          <div class="card-row subtle">
            <span>Počet smluv</span>
            <span>${summary.lifeContracts}</span>
          </div>
        </div>
      `);
    }

    if (
      includeNonLife &&
      (summary.nonLifeContracts > 0 || summary.nonLifeAnnual > 0)
    ) {
      summarySections.push(`
        <div class="card card--nonlife">
          ${themedHeading("Neživotní pojištění", "nonlife")}
          <div class="card-row">
            <span>Roční pojistné celkem</span>
            <span>${formatMoney(summary.nonLifeAnnual)}</span>
          </div>
          <div class="card-row subtle">
            <span>Počet smluv</span>
            <span>${summary.nonLifeContracts}</span>
          </div>
        </div>
      `);
    }

    if (
      includeAuto &&
      (summary.autoContracts > 0 || summary.autoAnnual > 0)
    ) {
      summarySections.push(`
        <div class="card card--auto">
          ${themedHeading("Pojištění vozidel", "auto")}
          <div class="card-row">
            <span>Roční pojistné celkem</span>
            <span>${formatMoney(summary.autoAnnual)}</span>
          </div>
          <div class="card-row subtle">
            <span>Počet smluv</span>
            <span>${summary.autoContracts}</span>
          </div>
        </div>
      `);
    }

    if (
      includeProperty &&
      (summary.propertyContracts > 0 || summary.propertyAnnual > 0)
    ) {
      summarySections.push(`
        <div class="card card--property">
          ${themedHeading("Majetek & ostatní neživot", "property")}
          <div class="card-row">
            <span>Roční pojistné celkem</span>
            <span>${formatMoney(summary.propertyAnnual)}</span>
          </div>
          <div class="card-row subtle">
            <span>Počet smluv</span>
            <span>${summary.propertyContracts}</span>
          </div>
        </div>
      `);
    }

    if (includeGold && (summary.goldContracts > 0 || summary.goldTotal > 0)) {
      summarySections.push(`
        <div class="card card--gold">
          ${themedHeading("Zlato (Comfort Commodity)", "gold")}
          <div class="card-row">
            <span>Objem (poplatek)</span>
            <span>${formatMoney(summary.goldTotal)}</span>
          </div>
          <div class="card-row subtle">
            <span>Počet smluv</span>
            <span>${summary.goldContracts}</span>
          </div>
        </div>
      `);
    }

    const teamCards: string[] = [];

    if (isTeamScope) {
      for (const stats of perUserList) {
        const userSections: string[] = [];

        if (includeLife && (stats.lifeContracts > 0 || stats.lifeMonthly > 0)) {
          userSections.push(`
            <div class="card-inner card-inner--life">
              ${themedHeading("Životní pojištění", "life", "card-subtitle")}
              <div class="card-row">
                <span>Měsíční pojistné</span>
                <span>${formatMoney(stats.lifeMonthly)}</span>
              </div>
              <div class="card-row">
                <span>Roční pojistné</span>
                <span>${formatMoney(stats.lifeAnnual)}</span>
              </div>
              <div class="card-row subtle">
                <span>Počet smluv</span>
                <span>${stats.lifeContracts}</span>
              </div>
            </div>
          `);
        }

        if (
          includeNonLife &&
          (stats.nonLifeContracts > 0 || stats.nonLifeAnnual > 0)
        ) {
          userSections.push(`
            <div class="card-inner card-inner--nonlife">
              ${themedHeading("Neživotní pojištění", "nonlife", "card-subtitle")}
              <div class="card-row">
                <span>Roční pojistné</span>
                <span>${formatMoney(stats.nonLifeAnnual)}</span>
              </div>
              <div class="card-row subtle">
                <span>Počet smluv</span>
                <span>${stats.nonLifeContracts}</span>
              </div>
            </div>
          `);
        }

        if (
          includeAuto &&
          (stats.autoContracts > 0 || stats.autoAnnual > 0)
        ) {
          userSections.push(`
            <div class="card-inner card-inner--auto">
              ${themedHeading("Pojištění vozidel", "auto", "card-subtitle")}
              <div class="card-row">
                <span>Roční pojistné</span>
                <span>${formatMoney(stats.autoAnnual)}</span>
              </div>
              <div class="card-row subtle">
                <span>Počet smluv</span>
                <span>${stats.autoContracts}</span>
              </div>
            </div>
          `);
        }

        if (
          includeProperty &&
          (stats.propertyContracts > 0 || stats.propertyAnnual > 0)
        ) {
          userSections.push(`
            <div class="card-inner card-inner--property">
              ${themedHeading("Majetek & ostatní neživot", "property", "card-subtitle")}
              <div class="card-row">
                <span>Roční pojistné</span>
                <span>${formatMoney(stats.propertyAnnual)}</span>
              </div>
              <div class="card-row subtle">
                <span>Počet smluv</span>
                <span>${stats.propertyContracts}</span>
              </div>
            </div>
          `);
        }

        if (includeGold && (stats.goldContracts > 0 || stats.goldTotal > 0)) {
          userSections.push(`
            <div class="card-inner card-inner--gold">
              ${themedHeading("Zlato (Comfort Commodity)", "gold", "card-subtitle")}
              <div class="card-row">
                <span>Objem (poplatek)</span>
                <span>${formatMoney(stats.goldTotal)}</span>
              </div>
              <div class="card-row subtle">
                <span>Počet smluv</span>
                <span>${stats.goldContracts}</span>
              </div>
            </div>
          `);
        }

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

    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            * { box-sizing: border-box; }
            :root {
              --ink: #10213d;
              --ink-soft: #52627f;
              --line: #d8e2f0;
              --paper: #ffffff;
              --paper-soft: #f5f8fc;
              --navy: #112347;
              --blue: #2e6eff;
              --emerald: #0f9f6e;
              --amber: #c78b1f;
              --violet: #7248db;
            }
            body {
              margin: 0;
              padding: 34px 0;
              background: linear-gradient(155deg, #edf3fb 0%, #f8fbff 55%, #eef4fc 100%);
              font-family: "Avenir Next", "Segoe UI", "Helvetica Neue", Arial, sans-serif;
              color: var(--ink);
              -webkit-font-smoothing: antialiased;
            }
            .page {
              width: 760px;
              margin: 0 auto;
              background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
              border-radius: 30px;
              border: 1px solid var(--line);
              box-shadow:
                0 28px 80px rgba(16, 33, 61, 0.14),
                0 1px 0 rgba(255, 255, 255, 0.9) inset;
              padding: 24px 30px 34px;
              position: relative;
              overflow: hidden;
            }
            .page::before {
              content: "";
              position: absolute;
              right: -120px;
              top: -120px;
              width: 290px;
              height: 290px;
              border-radius: 999px;
              background: radial-gradient(circle at center, rgba(46,110,255,0.20) 0%, rgba(46,110,255,0) 72%);
              pointer-events: none;
            }
            .page-topbar {
              position: relative;
              z-index: 1;
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 16px;
            }
            .topbar-pill {
              display: inline-flex;
              align-items: center;
              gap: 6px;
              border-radius: 999px;
              border: 1px solid #ccd9ec;
              background: #f4f8ff;
              color: #26406e;
              padding: 5px 12px;
              font-size: 10px;
              letter-spacing: 0.08em;
              text-transform: uppercase;
              font-weight: 700;
            }
            .topbar-meta {
              font-size: 10px;
              color: #6a7a96;
              letter-spacing: 0.03em;
              font-weight: 600;
            }
            .page-header {
              position: relative;
              z-index: 1;
              display: flex;
              align-items: center;
              gap: 16px;
              margin-bottom: 18px;
            }
            .logo {
              width: 62px;
              height: 62px;
              border-radius: 18px;
              background: linear-gradient(165deg, #ffffff 0%, #ecf3ff 100%);
              border: 1px solid #ccd9ec;
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow:
                0 12px 30px rgba(16, 33, 61, 0.14),
                0 1px 0 rgba(255,255,255,0.9) inset;
              flex-shrink: 0;
            }
            .logo-img {
              max-width: 39px;
              max-height: 39px;
            }
            .logo-placeholder {
              font-weight: 700;
              font-size: 27px;
              color: var(--blue);
            }
            .title-block h1 {
              margin: 0;
              font-size: 48px;
              line-height: 1.02;
              font-family: "Avenir Next Condensed", "Avenir Next", "Segoe UI", sans-serif;
              font-weight: 700;
              letter-spacing: 0.01em;
              color: var(--navy);
            }
            .title-block p {
              margin: 3px 0 0;
              font-size: 12px;
              letter-spacing: 0.14em;
              text-transform: uppercase;
              color: #3f5270;
              font-weight: 700;
            }
            .title-tags {
              margin-top: 9px;
              display: flex;
              flex-wrap: wrap;
              gap: 7px;
            }
            .title-tag {
              display: inline-flex;
              align-items: center;
              border-radius: 999px;
              padding: 5px 10px;
              border: 1px solid #d7e3f4;
              background: #f5f9ff;
              color: #294775;
              font-size: 10px;
              font-weight: 700;
              letter-spacing: 0.05em;
              text-transform: uppercase;
            }
            .title-tag-accent {
              background: linear-gradient(135deg, #264da3 0%, #1d3277 100%);
              border-color: #213f89;
              color: #ffffff;
            }
            .info-card {
              margin-top: 4px;
              border-radius: 18px;
              padding: 14px;
              border: 1px solid #cfdbed;
              background: linear-gradient(160deg, #f7fbff 0%, #eef5ff 100%);
              box-shadow: 0 14px 34px rgba(23, 48, 94, 0.09);
            }
            .info-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 9px;
            }
            .info-item {
              border-radius: 11px;
              border: 1px solid #d8e3f3;
              background: rgba(255, 255, 255, 0.9);
              padding: 9px 10px;
            }
            .info-label {
              display: block;
              font-size: 10px;
              text-transform: uppercase;
              letter-spacing: 0.08em;
              color: #62748f;
              font-weight: 700;
              margin-bottom: 3px;
            }
            .info-value {
              display: block;
              color: #172a49;
              font-size: 14px;
              font-weight: 700;
            }
            .divider {
              margin: 20px 0 16px;
              height: 2px;
              border: 0;
              background: linear-gradient(90deg, #98b5e6 0%, #dce7f7 55%, rgba(220,231,247,0) 100%);
            }
            .section-title {
              position: relative;
              display: inline-flex;
              align-items: center;
              gap: 8px;
              font-size: 15px;
              font-weight: 800;
              letter-spacing: 0.11em;
              text-transform: uppercase;
              color: #13284d;
              margin-bottom: 12px;
            }
            .section-title::before {
              content: "";
              width: 9px;
              height: 9px;
              border-radius: 999px;
              background: linear-gradient(135deg, #2e6eff 0%, #8eb0ff 100%);
              box-shadow: 0 0 0 4px rgba(46,110,255,0.15);
            }
            .card-grid {
              display: flex;
              flex-direction: column;
              gap: 10px;
              break-inside: avoid;
              page-break-inside: avoid;
            }
            .card-grid > * {
              break-inside: avoid;
              page-break-inside: avoid;
            }
            .card {
              border-radius: 17px;
              background: linear-gradient(170deg, #ffffff 0%, #f8fbff 100%);
              border: 1px solid #cfdced;
              box-shadow:
                0 12px 30px rgba(15, 30, 58, 0.09),
                0 1px 0 rgba(255,255,255,0.9) inset;
              padding: 14px 15px 14px;
              font-size: 12px;
              position: relative;
            }
            .card::after {
              content: "";
              position: absolute;
              left: 0;
              top: 11px;
              bottom: 11px;
              width: 4px;
              border-radius: 0 8px 8px 0;
              background: #abc4ea;
            }
            .card-empty {
              text-align: center;
              color: #51637f;
              font-weight: 600;
            }
            .card--life::after,
            .card-inner--life::after { background: #1d72e8; }
            .card--nonlife::after,
            .card-inner--nonlife::after { background: #6c52d9; }
            .card--auto::after,
            .card-inner--auto::after { background: #128169; }
            .card--property::after,
            .card-inner--property::after { background: #d17a17; }
            .card--gold::after,
            .card-inner--gold::after { background: #b07b00; }
            .card-title {
              display: flex;
              align-items: center;
              gap: 8px;
              font-size: 17px;
              font-weight: 800;
              margin-bottom: 7px;
              letter-spacing: 0.07em;
              text-transform: uppercase;
              color: #13284b;
            }
            .theme-icon {
              width: 20px;
              height: 20px;
              border-radius: 7px;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              background: #f2f6fd;
              border: 1px solid #d3e0f2;
              color: #203a67;
              flex-shrink: 0;
              overflow: hidden;
              line-height: 0;
            }
            .theme-icon svg {
              width: 12px;
              height: 12px;
              fill: none;
              stroke: currentColor;
              stroke-width: 1.9;
              stroke-linecap: round;
              stroke-linejoin: round;
            }
            .theme-life .theme-icon { background: #e9f3ff; border-color: #b5d4ff; color: #1d72e8; }
            .theme-nonlife .theme-icon { background: #efe9ff; border-color: #cdc0fb; color: #6549d6; }
            .theme-auto .theme-icon { background: #e4f9f3; border-color: #a6e2d2; color: #128169; }
            .theme-property .theme-icon { background: #fff2df; border-color: #f5cc97; color: #bb6f0e; }
            .theme-gold .theme-icon { background: #fff8d8; border-color: #efd78e; color: #a66d00; }
            .card-row {
              display: flex;
              justify-content: space-between;
              gap: 14px;
              margin-top: 5px;
              align-items: baseline;
            }
            .card-row span:first-child {
              color: #50627e;
              font-size: 14px;
            }
            .card-row span:last-child {
              font-weight: 800;
              color: #142949;
              font-size: 40px;
              letter-spacing: 0.02em;
              font-family: "Avenir Next Condensed", "Avenir Next", "Segoe UI", sans-serif;
            }
            .card-row.subtle span:last-child {
              font-size: 29px;
              color: #1a3359;
            }
            .card-user {
              margin-top: 12px;
              padding-top: 16px;
            }
            .card-user-header {
              display: flex;
              align-items: center;
              gap: 11px;
              margin-bottom: 7px;
            }
            .card-user,
            .card {
              break-inside: avoid;
              page-break-inside: avoid;
            }
            .card-user-body,
            .card-inner {
              break-inside: avoid;
              page-break-inside: avoid;
            }
            .avatar {
              width: 30px;
              height: 30px;
              border-radius: 999px;
              background: linear-gradient(150deg, #20386a 0%, #2f60c6 100%);
              color: #ffffff;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 13px;
              font-weight: 700;
              box-shadow: 0 6px 16px rgba(33,62,124,0.35);
            }
            .card-user-name {
              font-size: 14px;
              font-weight: 700;
              color: #172d52;
            }
            .card-user-email {
              font-size: 11px;
              color: #5a6c86;
            }
            .card-user-position {
              font-size: 11px;
              color: #415673;
              font-weight: 700;
            }
            .card-user-body {
              border-top: 1px solid rgba(157, 177, 207, 0.45);
              margin-top: 7px;
              padding-top: 8px;
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 7px 16px;
            }
            .card-inner {
              border-radius: 12px;
              background: #ffffff;
              padding: 8px 9px;
              border: 1px solid #d4e0f1;
              position: relative;
            }
            .card-inner::after {
              content: "";
              position: absolute;
              left: 0;
              top: 8px;
              bottom: 8px;
              width: 3px;
              border-radius: 0 6px 6px 0;
              background: #abc4ea;
            }
            .card-subtitle {
              display: flex;
              align-items: center;
              gap: 6px;
              font-size: 11px;
              font-weight: 700;
              color: #143056;
              margin-bottom: 4px;
              letter-spacing: 0.04em;
            }
            .card-subtitle .theme-icon {
              width: 16px;
              height: 16px;
              border-radius: 6px;
            }
            .card-subtitle .theme-icon svg {
              width: 10px;
              height: 10px;
            }
            .product-table {
              width: 100%;
              border-spacing: 0;
              margin-top: 10px;
              font-size: 12px;
              border-radius: 14px;
              overflow: hidden;
              border: 1px solid #cad8ec;
              box-shadow: 0 10px 24px rgba(18,34,64,0.09);
            }
            .product-table thead {
              background: linear-gradient(135deg, #15315e 0%, #21498a 100%);
              color: #f1f6ff;
            }
            .product-table th {
              padding: 11px 12px;
              text-align: left;
              font-weight: 700;
              letter-spacing: 0.06em;
              text-transform: uppercase;
              font-size: 10px;
              border-bottom: 1px solid rgba(255,255,255,0.16);
            }
            .product-table tbody tr:nth-child(odd) { background: #ffffff; }
            .product-table tbody tr:nth-child(even) { background: #f7faff; }
            .product-table td {
              padding: 10px 12px;
              border-bottom: 1px solid #e4ebf6;
              color: #364a67;
              vertical-align: top;
            }
            .product-table td.product { width: 62%; text-align: left; }
            .product-table td.count {
              width: 12%;
              text-align: center;
              font-weight: 700;
              color: #173053;
            }
            .product-table td.amount {
              width: 26%;
              text-align: right;
              font-weight: 800;
              color: #142949;
              font-family: "Avenir Next Condensed", "Avenir Next", "Segoe UI", sans-serif;
              font-size: 18px;
            }
            .product-cell {
              display: flex;
              align-items: center;
              gap: 10px;
              min-height: 34px;
            }
            .product-logo {
              width: 31px;
              height: 31px;
              border-radius: 9px;
              border: 1px solid #cfddf0;
              background: #ffffff;
              display: flex;
              align-items: center;
              justify-content: center;
              overflow: hidden;
              flex-shrink: 0;
              box-shadow: 0 4px 10px rgba(15,30,56,0.08);
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
              color: #36527f;
              background: #eaf1fc;
            }
            .product-meta {
              min-width: 0;
            }
            .product-name {
              color: #102546;
              line-height: 1.25;
              font-weight: 700;
            }
            .product-provider {
              margin-top: 2px;
              font-size: 10px;
              color: #5b6f8a;
              text-transform: uppercase;
              letter-spacing: 0.05em;
            }
            .monthly-chart {
              display: flex;
              align-items: flex-end;
              gap: 10px;
              padding: 14px 12px 8px;
              border-radius: 16px;
              background: linear-gradient(180deg, #f5f9ff 0%, #ecf3ff 100%);
              border: 1px solid #cfddf2;
              box-shadow: 0 12px 28px rgba(16, 33, 62, 0.09);
              min-height: 154px;
            }
            .monthly-bar {
              flex: 1;
              display: flex;
              flex-direction: column;
              align-items: center;
              gap: 6px;
            }
            .monthly-bar .bar {
              width: 100%;
              max-width: 44px;
              border-radius: 12px 12px 7px 7px;
              background: linear-gradient(180deg, #4f8bff 0%, #2b60d0 100%);
              box-shadow: 0 8px 16px rgba(43, 96, 208, 0.26);
            }
            .monthly-bar .value {
              font-size: 10px;
              color: #16335b;
              font-weight: 700;
            }
            .monthly-bar .label {
              font-size: 10px;
              color: #536882;
              text-align: center;
            }
            .footer-note {
              margin-top: 15px;
              border-top: 1px dashed #c6d4ea;
              padding-top: 10px;
              font-size: 10px;
              color: #6d7f9a;
              line-height: 1.5;
            }
            @media print {
              body { background: #eef3fa; }
            }
          </style>
        </head>
        <body>
          <div class="page">
            <div class="page-topbar">
              <span class="topbar-pill">Bohemka.App interní report</span>
              <span class="topbar-meta">Vygenerováno ${generatedLabel}</span>
            </div>
            <div class="page-header">
              ${logoHtml}
              <div class="title-block">
                <h1>Bohemka.App - Produkce</h1>
                <p>${dateLabel} - ${scopeLabel}</p>
                <div class="title-tags">
                  <span class="title-tag">${dateLabel}</span>
                  <span class="title-tag title-tag-accent">${scopeLabel}</span>
                </div>
              </div>
            </div>

            <div class="info-card">
              <div class="info-grid">
                <div class="info-item">
                  <span class="info-label">Poradce</span>
                  <span class="info-value">${adviserName}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">E-mail</span>
                  <span class="info-value">${adviserEmail}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">Rozsah</span>
                  <span class="info-value">${scopeLabel}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">Období</span>
                  <span class="info-value">${periodFrom} – ${periodTo}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">Vygenerováno</span>
                  <span class="info-value">${generatedLabel}</span>
                </div>
              </div>
            </div>

            <div class="divider"></div>

            <div>
              <div class="section-title">Souhrn vybrané produkce</div>
              <div class="card-grid">
                ${
                  summarySections.length > 0
                    ? summarySections.join("")
                    : `<div class="card card-empty"><div class="card-row"><span>V zadaném období nebyly nalezeny žádné smlouvy.</span></div></div>`
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
              monthlyTotals.length > 0
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
                    <div class="card-grid">
                      ${teamCards.join("")}
                    </div>
                  </div>
                `
                : ""
            }

            <div class="footer-note">
              PDF bylo vygenerováno z interní webové aplikace Bohemka.App .
              Čísla jsou orientační a mohou se lišit od údajů v systémech
              jednotlivých společností.
            </div>
          </div>
        </body>
      </html>
    `;

    const filenameBase =
      scopeOption === "own"
        ? "produkce_own"
        : scopeOption === "team"
        ? "produkce_team"
        : "produkce_team_selected";

    const topProductEntry = sortedProductEntries[0] ?? null;
    const totalAnnual = summary.lifeAnnual + summary.nonLifeAnnual + summary.goldTotal;
    const totalContracts =
      summary.lifeContracts + summary.nonLifeContracts + summary.goldContracts;

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

    return { html, filenameBase, snapshot };
  };

  /* ---------------- akce: PDF + náhled ---------------- */

  const handleGeneratePdf = async () => {
    if (!user?.email) return;
    if (!validateScopeConfig()) return;

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
    }
  };

  const handlePreview = async () => {
    if (!user?.email) return;
    if (!validateScopeConfig()) return;

    setGenerating(true);
    setErrorText(null);

    try {
      const { html } = await buildReportHtml();
      setPreviewHtml(html);
      setPreviewGeneratedAt(new Date());
    } catch (e) {
      console.error("Chyba při generování náhledu", e);
      setErrorText(
        "Nepodařilo se připravit náhled PDF. Zkus to prosím znovu."
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleOpenPreviewInNewTab = () => {
    if (!previewHtml || typeof window === "undefined") return;
    const popup = window.open("", "_blank", "noopener,noreferrer");
    if (!popup) return;
    popup.document.open();
    popup.document.write(previewHtml);
    popup.document.close();
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
      const { html, snapshot } = await buildReportHtml();
      const payload = await fetchAuthedJsonOrThrow<ExportShareResponse>(
        user,
        "/api/export-produkce/share",
        {
          method: "POST",
          body: JSON.stringify({
            recipientEmail: recipientOption.email,
            noteText: shareMessageText,
            previewHtml: html,
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
      <div className="relative w-full overflow-hidden pb-8">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-[-120px] top-[-90px] h-[360px] w-[360px] rounded-full bg-sky-200/45 blur-3xl" />
          <div className="absolute right-[-120px] top-8 h-[280px] w-[280px] rounded-full bg-emerald-200/40 blur-3xl" />
          <div className="absolute bottom-[-160px] left-1/3 h-[340px] w-[340px] rounded-full bg-indigo-200/35 blur-3xl" />
        </div>

        <div className="mx-auto w-full max-w-[1500px] space-y-4">
          <header className="relative overflow-hidden rounded-[34px] border border-white/70 bg-white/78 p-5 shadow-[0_24px_72px_rgba(15,23,42,0.14)] backdrop-blur-xl sm:p-6">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(14,165,233,0.15)_0%,transparent_42%),radial-gradient(circle_at_90%_18%,rgba(16,185,129,0.18)_0%,transparent_38%)]"
            />
            <div className="relative z-10 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50/95 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-800">
                  <Sparkles className="h-3.5 w-3.5" />
                  Export produkce
                </div>
                <div className="space-y-1">
                  <SplitTitle
                    text="Statistika"
                    className="text-5xl sm:text-6xl lg:text-7xl"
                  />
                  <p className="max-w-3xl text-sm text-slate-700 sm:text-base">
                    Připrav přehled produkce během pár kliknutí, včetně týmového rozkladu, produktových kategorií a PDF exportu pro klienta nebo vedení.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
                  <span className="rounded-full border border-slate-300/80 bg-white/90 px-3 py-1">
                    Rozsah: <strong className="text-slate-900">{scopeLabel}</strong>
                  </span>
                  <span className="rounded-full border border-slate-300/80 bg-white/90 px-3 py-1">
                    Období: <strong className="text-slate-900">{dateRangeLabel}</strong>
                  </span>
                  <span className="rounded-full border border-slate-300/80 bg-white/90 px-3 py-1">
                    Kategorie: <strong className="text-slate-900">{selectedCategoryLabel}</strong>
                  </span>
                  <span className="rounded-full border border-slate-300/80 bg-white/90 px-3 py-1">
                    Tým: <strong className="text-slate-900">{selectedAdvisersLabel}</strong>
                  </span>
                </div>
              </div>

              <div className="relative hidden min-[920px]:block">
                <div className="absolute -left-8 top-6 rounded-2xl border border-slate-200 bg-white/90 px-3 py-2 text-[11px] font-semibold text-slate-700 shadow-[0_12px_28px_rgba(15,23,42,0.12)]">
                  Filtry připravené k exportu
                </div>
                <Image
                  src="/icons/export-produkce.png"
                  alt="Export produkce"
                  width={320}
                  height={320}
                  className="h-52 w-auto object-contain opacity-95"
                  priority
                />
              </div>
            </div>
          </header>

          <div className="grid gap-4 lg:grid-cols-[290px_minmax(0,1fr)] lg:items-start xl:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="space-y-3 lg:sticky lg:top-4">
              <section className="space-y-4 rounded-[30px] border border-slate-200 bg-white p-4 shadow-[0_12px_32px_rgba(15,23,42,0.08)]">
                <div className="flex items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-700 ring-1 ring-slate-200">
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    Nastavení exportu
                  </div>
                </div>

                <div className="space-y-2.5 rounded-2xl bg-slate-50 p-3.5 ring-1 ring-slate-200/80">
                  <div className="ui-kicker inline-flex items-center gap-1.5">
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
                          ? "border-sky-600 bg-sky-600 text-[#f8fafc] shadow-[0_8px_20px_rgba(14,116,144,0.3)]"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      Vlastní produkce
                    </button>
                    <button
                      type="button"
                      disabled={!hasTeam}
                      onClick={() => setScopeOption("team")}
                      className={`ui-focus w-full rounded-xl border px-2.5 py-2 text-left text-xs font-semibold transition ${
                        scopeOption === "team"
                          ? "border-sky-600 bg-sky-600 text-[#f8fafc] shadow-[0_8px_20px_rgba(14,116,144,0.3)]"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                      } ${!hasTeam ? "cursor-not-allowed opacity-45" : ""}`}
                    >
                      Týmová produkce
                    </button>
                    <button
                      type="button"
                      disabled={!hasTeam}
                      onClick={() => setScopeOption("selected")}
                      className={`ui-focus w-full rounded-xl border px-2.5 py-2 text-left text-xs font-semibold transition ${
                        scopeOption === "selected"
                          ? "border-sky-600 bg-sky-600 text-[#f8fafc] shadow-[0_8px_20px_rgba(14,116,144,0.3)]"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
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
                            ? "border-sky-600 bg-sky-600 text-[#f8fafc]"
                            : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                        }`}
                      >
                        <span>Vybraní podřízení ({selectedSubs.size})</span>
                        <span>{subordinatesPickerOpen ? "▴" : "▾"}</span>
                      </button>

                      {subordinatesPickerOpen && (
                        <div className="absolute left-0 top-full z-40 mt-2 w-full rounded-2xl border border-slate-300 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.16)]">
                          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
                            <div className="text-xs font-semibold text-slate-700">
                              Vyber poradce
                            </div>
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedSubs(new Set(subordinates.map((s) => s.email)))
                                }
                                className="ui-focus rounded-xl border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                              >
                                Vše
                              </button>
                              <button
                                type="button"
                                onClick={() => setSelectedSubs(new Set())}
                                className="ui-focus rounded-xl border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                              >
                                Nic
                              </button>
                            </div>
                          </div>
                          <div className="border-b border-slate-200 px-2.5 py-2">
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
                                className="ui-focus w-full rounded-xl border border-slate-300 bg-white py-1.5 pl-8 pr-2.5 text-xs text-slate-800 outline-none placeholder:text-slate-400"
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
                                        ? "border-sky-600 bg-sky-600 text-[#f8fafc] shadow-[0_6px_14px_rgba(14,116,144,0.24)]"
                                        : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50"
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

                <div className="space-y-2.5 rounded-2xl bg-slate-50 p-3.5 ring-1 ring-slate-200/80">
                  <div className="ui-kicker inline-flex items-center gap-1.5">
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
                        onClick={() => setDateRangeOption(value)}
                        className={`ui-focus rounded-xl border px-2.5 py-2 text-center text-xs font-semibold transition ${
                          dateRangeOption === value
                            ? "border-sky-600 bg-sky-600 text-[#f8fafc] shadow-[0_8px_20px_rgba(14,116,144,0.3)]"
                            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2.5 rounded-2xl bg-slate-50 p-3.5 ring-1 ring-slate-200/80">
                  <div className="ui-kicker inline-flex items-center gap-1.5">
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
                          ? "border-sky-600 bg-sky-600 text-[#f8fafc] shadow-[0_8px_20px_rgba(14,116,144,0.3)]"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
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

                <div className="rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs text-sky-900">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-700">
                    Aktivní výběr
                  </div>
                  <div className="mt-1.5 space-y-1 leading-relaxed">
                    <div>
                      <span className="text-sky-700/80">Rozsah:</span>{" "}
                      <span className="font-semibold">{scopeLabel}</span>
                    </div>
                    <div>
                      <span className="text-sky-700/80">Období:</span>{" "}
                      <span className="font-semibold">{dateRangeLabel}</span>
                    </div>
                    <div>
                      <span className="text-sky-700/80">Kategorie:</span>{" "}
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
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-900 bg-[linear-gradient(135deg,#1e293b_0%,#0f172a_100%)] px-5 py-2.5 text-sm font-semibold text-[#f8fafc] shadow-[0_14px_34px_rgba(15,23,42,0.28)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(15,23,42,0.34)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Eye className="h-4 w-4" />
                    {generating ? "Připravuji náhled…" : "Náhled PDF"}
                  </button>

                  <button
                    type="button"
                    onClick={handleGeneratePdf}
                    disabled={generating}
                    className="inline-flex items-center gap-2 rounded-2xl border border-blue-700/70 bg-[linear-gradient(135deg,#1d4ed8_0%,#1e293b_100%)] px-6 py-2.5 text-sm font-semibold text-[#f8fafc] shadow-[0_16px_38px_rgba(30,64,175,0.32)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_45px_rgba(30,64,175,0.38)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Download className="h-4 w-4" />
                    {generating ? "Připravuji PDF…" : "Stáhnout PDF"}
                  </button>

                  <button
                    type="button"
                    onClick={openShareModal}
                    disabled={generating || shareSubmitting}
                    className="inline-flex items-center gap-2 rounded-2xl border border-emerald-700/70 bg-[linear-gradient(135deg,#16a34a_0%,#1d4ed8_100%)] px-5 py-2.5 text-sm font-semibold text-zinc-50 shadow-[0_16px_38px_rgba(5,150,105,0.3)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_45px_rgba(5,150,105,0.36)] disabled:cursor-not-allowed disabled:opacity-60"
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
                  <p className="rounded-xl border border-emerald-200 bg-emerald-50/85 px-3 py-2 text-xs text-emerald-800">
                    {shareSuccessText}
                  </p>
                )}
              </section>

              <section className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_14px_38px_rgba(15,23,42,0.1)]">
                <div className="border-b border-slate-200 bg-[linear-gradient(155deg,#f8fafc_0%,#eef5ff_100%)] px-4 py-3.5 sm:px-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h2 className="text-2xl font-semibold tracking-[-0.015em] text-slate-900">
                        Náhled PDF
                      </h2>
                      <p className="mt-1 text-sm text-slate-600">
                        Náhled odpovídá výslednému exportu. Menší odchylky fontů mezi prohlížečem a PDF jsou normální.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                        A4 • na výšku
                      </span>
                      {previewGeneratedAt && (
                        <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-800">
                          Aktualizováno {previewGeneratedAt.toLocaleTimeString("cs-CZ")}
                        </span>
                      )}
                      {previewHtml && (
                        <>
                          <button
                            type="button"
                            onClick={handleOpenPreviewInNewTab}
                            className="ui-focus inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:border-slate-500 hover:bg-slate-50"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Otevřít v kartě
                          </button>
                          <button
                            type="button"
                            onClick={() => setPreviewExpanded((prev) => !prev)}
                            className="ui-focus inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:border-slate-500 hover:bg-slate-50"
                          >
                            {previewExpanded ? (
                              <Minimize2 className="h-3.5 w-3.5" />
                            ) : (
                              <Maximize2 className="h-3.5 w-3.5" />
                            )}
                            {previewExpanded ? "Zmenšit" : "Rozšířit"}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {previewHtml ? (
                  <div
                    className={`overflow-hidden bg-[radial-gradient(circle_at_14%_8%,rgba(37,99,235,0.1)_0%,transparent_44%),radial-gradient(circle_at_84%_14%,rgba(14,165,233,0.08)_0%,transparent_40%),#f8fafc] p-3 transition-[height] duration-300 sm:p-4 ${
                      previewExpanded ? "h-[78vh] min-h-[760px]" : "h-[640px]"
                    }`}
                  >
                    <div className="h-full overflow-hidden rounded-[24px] border border-slate-300/90 bg-white shadow-[0_20px_48px_rgba(15,23,42,0.2)]">
                      <div className="flex items-center gap-2 border-b border-[#1e293b] bg-[#0b1220] px-4 py-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-[#fb7185]" />
                        <span className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]" />
                        <span className="h-2.5 w-2.5 rounded-full bg-[#22c55e]" />
                        <span className="ml-2 truncate rounded bg-[#1f2937] px-2 py-0.5 text-[10px] font-medium text-[#cbd5e1]">
                          Bohemka.App export preview
                        </span>
                      </div>
                      <iframe
                        srcDoc={previewHtml}
                        title="Náhled PDF produkce"
                        className="h-[calc(100%-38px)] w-full bg-white"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid min-h-[320px] place-items-center bg-[linear-gradient(160deg,#f8fafc_0%,#ffffff_100%)] px-5 py-12 text-center">
                    <div className="max-w-md space-y-2">
                      <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-700">
                        <Eye className="h-5 w-5" />
                      </div>
                      <p className="text-base font-semibold text-slate-900">Náhled zatím není připravený</p>
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
              className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]"
            />

            <div className="relative z-[91] flex min-h-full items-center justify-center p-4">
              <section className="w-full max-w-lg rounded-[30px] border border-white/70 bg-white/95 p-5 shadow-[0_28px_78px_rgba(15,23,42,0.28)] backdrop-blur-xl sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-800">
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
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
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
                        className="w-full rounded-2xl border border-slate-300 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                      />
                      {shareSuggestionsLoading ? (
                        <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-500" />
                      ) : null}
                    </div>

                    {!shareUseDirectManager && shareSuggestions.length > 0 && (
                      <div className="max-h-52 overflow-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-[0_14px_30px_rgba(15,23,42,0.1)]">
                        {shareSuggestions.map((option) => (
                          <button
                            key={option.email}
                            type="button"
                            onClick={() => handleSelectSuggestion(option)}
                            className="flex w-full items-start justify-between rounded-xl px-3 py-2 text-left transition hover:bg-slate-50"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-slate-900">
                                {option.name}
                              </span>
                              <span className="block truncate text-xs text-slate-500">
                                {option.email}
                              </span>
                            </span>
                            <span className="ml-2 shrink-0 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                              Vybrat
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
                    {directManager ? (
                      <label className="flex cursor-pointer items-start gap-3">
                        <input
                          type="checkbox"
                          checked={shareUseDirectManager}
                          onChange={(e) => handleToggleDirectManager(e.target.checked)}
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="text-sm text-slate-700">
                          <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900">
                            <UserCheck className="h-4 w-4 text-emerald-700" />
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
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-sm">
                      <span className="font-semibold text-emerald-900">Vybraný příjemce:</span>{" "}
                      <span className="text-emerald-900">
                        {(shareUseDirectManager ? directManager : shareSelectedRecipient)?.name}
                      </span>
                      <span className="text-emerald-700">
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
                      className="w-full resize-none rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-slate-500">Emoji:</span>
                      {SHARE_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => appendShareEmoji(emoji)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-base transition hover:border-slate-300 hover:bg-slate-50"
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
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Zrušit
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleShareExport()}
                      disabled={shareSubmitting}
                      className="inline-flex items-center gap-2 rounded-xl border border-emerald-700/70 bg-[linear-gradient(135deg,#16a34a_0%,#1d4ed8_100%)] px-4 py-2 text-sm font-semibold text-zinc-50 shadow-[0_12px_30px_rgba(5,150,105,0.28)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
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
          ? "border-sky-600 bg-sky-600 text-[#f8fafc] shadow-[0_8px_20px_rgba(14,116,144,0.3)]"
          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      <span
        className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border text-[9px] ${
          active
            ? "border-white bg-white text-slate-900"
            : "border-slate-300 text-transparent"
        }`}
      >
        {active ? "✓" : ""}
      </span>
      {label}
    </button>
  );
}
