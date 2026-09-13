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
import styles from "./exportProduction.module.css";
import { ExportShareDialog } from "./ExportShareDialog";
import { PRODUCTION_REPORT_STYLES } from "./reportStyles";
import { stripUnsupportedColors, withBestPdfSource, renderPdfBlobFromElement, downloadBlobFile } from "./productionPdf";
import {
  CalendarDays,
  Download,
  Eye,
  Loader2,
  Search,
  Send,
  SlidersHorizontal,
  FileText,
  Printer,
  Check,
  Tags,
  UsersRound,
} from "lucide-react";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import {
  effectiveUserEmail,
  useEffectiveUserEmail,
} from "@/app/lib/useAdminImpersonation";

/* -------------------- lazy import PDF deps (kvůli Next/SSR) -------------------- */

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
const EXPORT_ACTIVE_DARK_CLASS = styles.optionActive;
const EXPORT_ACTIVE_VIOLET_CLASS = styles.optionActive;
const EXPORT_ACTIVE_FUCHSIA_CLASS = styles.optionActive;
const EXPORT_INACTIVE_CHIP_CLASS = styles.option;
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

  const [companyLogoDataUrl, setCompanyLogoDataUrl] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const previewFrameRef = useRef<HTMLIFrameElement>(null);
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

  useEffect(() => {
    const frame = previewFrameRef.current;
    if (!frame || !previewHtml) return;
    const fitPreview = () => {
      const report = frame.contentDocument?.querySelector<HTMLElement>(".page");
      if (report) report.style.zoom = String(Math.min(1, Math.max(.2, (frame.clientWidth - 32) / 760)));
    };
    const observer = new ResizeObserver(fitPreview);
    observer.observe(frame);
    frame.addEventListener("load", fitPreview);
    fitPreview();
    return () => { observer.disconnect(); frame.removeEventListener("load", fitPreview); };
  }, [previewHtml, isPreparingPreview]);

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
    const seq = ++shareLookupSeq.current;
    if (!shareModalOpen || shareUseDirectManager || shareSelectedRecipient || !user) {
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

    setShareSuggestions([]);
    setShareSuggestionsLoading(true);
    const timeoutId = window.setTimeout(async () => {
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

    return () => {
      window.clearTimeout(timeoutId);
      if (shareLookupSeq.current === seq) shareLookupSeq.current += 1;
    };
  }, [shareModalOpen, shareUseDirectManager, shareSelectedRecipient, shareRecipientQuery, user]);

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
        const companyLogo = await readAsset("/icons/nadpislogo.jpg");
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
        setCompanyLogoDataUrl(companyLogo);
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

    const companyLogoSrc = companyLogoDataUrl ?? new URL("/icons/nadpislogo.jpg", window.location.origin).href;
    const html = `
      <!DOCTYPE html>
      <html lang="cs">
        <head>
          <meta charset="utf-8" />
          <title>Přehled produkce · Bohemika</title>
          <style>${PRODUCTION_REPORT_STYLES}</style>
        </head>
	        <body>
		          <div class="page report-page">
		            <div class="report-body">
			              <header class="report-hero">
                <img class="company-logo" src="${escapeHtml(companyLogoSrc)}" alt="Bohemika — finanční poradenství" width="142" height="91" />
                <div class="document-title">
                  <div class="document-kicker">Obchodní report</div>
                  <h1>Přehled produkce</h1>
                  <p class="document-period">${periodFrom} – ${periodTo}</p>
                </div>
              </header>
              <div class="info-card">
                <div class="info-grid">
                  <div class="info-item"><span class="info-label">Zpracoval</span><span class="info-value">${adviserName}</span><span class="info-secondary">${escapeHtml(adviserEmailRaw)}</span></div>
                  <div class="info-item"><span class="info-label">Rozsah reportu</span><span class="info-value">${scopeLabel}</span><span class="info-secondary">${escapeHtml(selectedAdvisersLabel)}</span></div>
                  <div class="info-item"><span class="info-label">Vygenerováno</span><span class="info-value">${generatedLabel}</span><span class="info-secondary">${escapeHtml(selectedCategoryLabel)}</span></div>
                </div>
              </div>
              <div class="report-totals">
                <div class="report-total"><span>Počet smluv</span><strong>${totalContracts}</strong></div>
                <div class="report-total"><span>Roční pojistné celkem</span><strong>${formatMoney(summary.lifeAnnual + summary.nonLifeAnnual)}</strong></div>
                <div class="report-total"><span>${cats.has("gold") ? "Objem zlata" : "Životní · měsíční pojistné"}</span><strong>${formatMoney(cats.has("gold") ? summary.goldTotal : summary.lifeMonthly)}</strong></div>
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
                    <div class="section-title">Přehled podle produktu</div>
                    <table class="product-table">
                      <thead>
                        <tr>
                          <th>Produkt</th>
                          <th>Počet smluv</th>
                          <th>Roční pojistné / objem</th>
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
          marginPt: 18,
          scale: 3,
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
    <div className={styles.reportLoading} role="status">
      <div className={styles.loadingDocument}><FileText size={42} aria-hidden="true" /><Loader2 size={19} className="animate-spin" aria-hidden="true" /></div>
      <h2>Připravujeme váš report</h2>
      <p>{previewLoaderStatus}</p>
      <progress value={previewProgress} max={100} aria-label="Příprava náhledu" />
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
      <div className={styles.page}>
        <div className={styles.container}>
          <header className={styles.header}>
            <div className={styles.heading}>
              <span className={styles.headingIcon}><FileText size={25} aria-hidden="true" /></span>
              <div><p className={styles.eyebrow}>Přehledy a dokumenty</p><h1>Export produkce</h1><p className={styles.description}>Připravte přehled své produkce nebo výsledků týmu.</p></div>
            </div>
            <div className={styles.documentBadge}><Printer size={16} aria-hidden="true" /><span>Firemní report <strong>PDF · A4</strong></span></div>
          </header>

          <div className={styles.workspace}>
            <aside className={styles.sidebar}>
              <section className={styles.settings}>
                <div className={styles.settingsHeading}><SlidersHorizontal size={16} aria-hidden="true" /><h2>Nastavení reportu</h2></div>

                <div className={styles.filterSection}>
                  <div className={styles.filterLabel}>
                    <UsersRound
                      size={12}
                      strokeWidth={2.2}
                      className="shrink-0"
                      aria-hidden="true"
                    />
                    <span>Rozsah exportu</span>
                  </div>
                  <div className={styles.optionGrid}>
                    <button
                      type="button"
                      onClick={() => setScopeOption("own")}
                      aria-pressed={scopeOption === "own"}
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
                      aria-pressed={scopeOption === "ownTeam"}
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
                      aria-pressed={scopeOption === "team"}
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
                      aria-pressed={scopeOption === "selected"}
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
                                className="ui-focus w-full rounded-xl border border-violet-200 bg-white py-1.5 pl-8 pr-2.5 text-xs text-slate-800 outline-none placeholder:text-slate-400 focus:border-sky-400"
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
                                        active ? "text-sky-700" : "text-slate-500"
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

                <div className={styles.filterSection}>
                  <div className={styles.filterLabel}>
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
                        aria-pressed={dateRangeOption === value}
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
                          className="mt-1 w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-500/15"
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
                          className="mt-1 w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-500/15"
                        />
                      </label>
                    </div>
                  )}
                </div>

                <div className={styles.filterSection}>
                  <div className={styles.filterLabel}>
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

                <div className={styles.selection}>
                  <div className={styles.selectionTitle}>
                    Aktivní výběr
                  </div>
                  <div className="mt-1.5 space-y-1 leading-relaxed">
                    <div>
                      <span className={styles.selectionLabel}>Rozsah:</span>{" "}
                      <span className="font-semibold">{scopeLabel}</span>
                    </div>
                    <div>
                      <span className={styles.selectionLabel}>Období:</span>{" "}
                      <span className="font-semibold">{dateRangeLabel}</span>
                    </div>
                    <div>
                      <span className={styles.selectionLabel}>Kategorie:</span>{" "}
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
                <div className={styles.toolbar}>
	                  <button
	                    type="button"
	                    onClick={handlePreview}
	                    disabled={generating}
	                    className={styles.secondaryButton}
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
	                    className={styles.primaryButton}
	                  >
	                    <Download className="h-4 w-4" />
	                    {generationMode === "pdf" ? "Připravuji PDF…" : "Stáhnout PDF"}
	                  </button>

                  <button
                    type="button"
                    onClick={openShareModal}
                    disabled={generating || shareSubmitting}
                    className={styles.secondaryButton}
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
                  <p className="rounded-xl border border-sky-200 bg-sky-50/85 px-3 py-2 text-xs font-semibold text-sky-800">
                    {shareSuccessText}
                  </p>
                )}
              </section>

	              <section className={styles.previewPanel}>
	                {isPreparingPreview ? (
	                  renderPreviewLoading()
	                ) : previewHtml ? (
	                  <div className={styles.previewFrame}>
                      <div className={styles.previewCaption}><FileText size={15} aria-hidden="true" /><span>Náhled dokumentu</span><span className={styles.previewFormat}>A4 · Bohemika</span></div>
	                    <iframe
	                      ref={previewFrameRef}
	                      srcDoc={previewHtml}
	                      title="Náhled PDF produkce"
	                      className="min-h-0 flex-1 border-0 bg-white"
	                    />
	                  </div>
	                ) : (
	                  <div className={styles.emptyPreview}>
                      <div className={styles.paperSample} aria-hidden="true">
                        <Image src="/icons/nadpislogo.jpg" alt="" width={1024} height={655} />
                        <span className={styles.sampleRule} />
                        <div className={styles.sampleMeta}><span /><span /><span /></div>
                        <div className={styles.sampleTotals}><span /><span /><span /></div>
                        <div className={styles.sampleTable}>{[0, 1, 2, 3].map(row => <span key={row} />)}</div>
                      </div>
                      <h2>Váš přehled, připravený k prezentaci</h2>
                      <p>Zvolte rozsah a období. Náhled zobrazí report s firemní hlavičkou, souhrnem a přehlednými tabulkami.</p>
                      <button type="button" onClick={handlePreview} disabled={generating} className={styles.secondaryButton}><Eye size={16} aria-hidden="true" />Vytvořit náhled</button>
                      <div className={styles.paperFeatures}><span><Check size={13} aria-hidden="true" />Firemní hlavička</span><span><Check size={13} aria-hidden="true" />Tisk na A4</span></div>
                    </div>
	                )}
	              </section>
            </div>
          </div>
        </div>

        {shareModalOpen && (
          <ExportShareDialog
            scopeLabel={scopeLabel}
            dateRangeLabel={dateRangeLabel}
            directManager={directManager}
            recipient={shareUseDirectManager ? directManager : shareSelectedRecipient}
            isDirectManager={shareUseDirectManager}
            query={shareRecipientQuery}
            suggestions={shareSuggestions}
            searching={shareSuggestionsLoading}
            message={shareMessageText}
            submitting={shareSubmitting}
            error={shareErrorText}
            onQueryChange={(query) => {
              setShareRecipientQuery(query);
              setShareUseDirectManager(false);
              setShareSelectedRecipient(null);
              setShareErrorText(null);
            }}
            onSelectRecipient={handleSelectSuggestion}
            onSelectManager={() => handleToggleDirectManager(true)}
            onClearRecipient={() => handleToggleDirectManager(false)}
            onMessageChange={setShareMessageText}
            onClose={closeShareModal}
            onSend={() => void handleShareExport()}
          />
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
      aria-pressed={active}
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
