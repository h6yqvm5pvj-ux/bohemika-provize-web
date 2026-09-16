// src/app/smlouvy/page.tsx
"use client";

import { isInheritedContract } from "@/app/lib/inheritedContracts";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type MouseEvent as ReactMouseEvent,
} from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowUpRight,
  ArrowRightLeft,
  BriefcaseBusiness,
  CalendarDays,
  Car,
  Check,
  Clock,
  CircleDollarSign,
  Copy,
  ExternalLink,
  HeartPulse,
  Home,
  Plane,
  PencilLine,
  ReceiptText,
  Search,
  SlidersHorizontal,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import cardStyles from "./contractCards.module.css";
import { filterDisplayedContracts, isRefreshContract, contractOwnerEmail } from "./contractsPageFiltering";
import { ContractFiltersDialog } from "./ContractFiltersDialog";
import { normalizeCareerPositions } from "@/app/lib/careerPositions";
import { contractFilterCount } from "./contractFilterSelection";
import { originalReplacementLabel } from "@/app/lib/originalContractReplacement";

import { auth } from "../firebase";
import {
  onAuthStateChanged,
  type User as FirebaseUser,
} from "firebase/auth";

import {
  type Product,
  type Position,
  type PaymentFrequency,
} from "../types/domain";

import { AppLayout } from "@/components/AppLayout";
import { formatMoney, toDate } from "@/app/lib/formatters";
import {
  effectiveUserEmail,
  useEffectiveUserEmail,
} from "@/app/lib/useAdminImpersonation";
import {
  contractLifecycleStatus,
} from "@/app/lib/contractLifecycle";
import {
  LIFE_PRODUCTS as LIFE_PRODUCTS_LIST,
  PRODUCT_CATALOG,
  productInstitutionLabel,
  productLabel as productLabelFromCatalog,
} from "@/app/lib/productCatalog";
import {
  commissionAuditSummaryForContract,
  isCommissionAuditFilterActive,
} from "@/app/lib/commissionAudit";
import {
  institutionLogoImageClass,
} from "@/app/lib/institutionLogoDisplay";
import {
  formatDaysLeft,
  getAnniversaryStartDate,
  getContractDate,
  isAnniversarySoon,
  shouldTrackAnniversary,
} from "@/app/lib/contractAnniversary";
import {
  CATEGORY_DEFS,
} from "./contractsPageFilters";
import {
  commissionAuditCompactLabel,
  commissionAuditTimingLabel,
  commissionAuditToneClasses,
  formatCommissionAuditDate,
} from "./contractsPageCommissionAudit";
import {
  CONTRACTS_UPDATED_KEY,
  CONTRACTS_SILENT_REFRESH_COOLDOWN_MS,
  CONTRACT_LIST_ESTIMATED_COMPACT_ROW_HEIGHT,
  CONTRACT_LIST_OVERSCAN_ROWS,
  CONTRACT_LIST_WINDOWING_THRESHOLD,
  cursorFromApi,
  getErrorMessage,
  normalizeContractNumberForSearch,
  normalizeCursorToken,
  normalizeEmail,
  normalizeSearchValue,
  readContractsApiResponseSafe,
  readContractsCache,
  readContractsViewState,
  writeContractsCache,
  writeContractsViewState,
} from "./contractsPageStorage";
import type {
  AppUser,
  CommissionAuditFilterCode,
  CommissionAuditFilterMode,
  ContractDetailWindowState,
  ContractDoc,
  ContractsApiResponse,
  ContractsListFilters,
  DisplayedContract,
  FilterMode,
  Institution,
  ProductCategory,
} from "./contractsPageTypes";

const LIFE_PRODUCTS = new Set<Product>(LIFE_PRODUCTS_LIST);
const CONTRACT_SEARCH_DEBOUNCE_MS = 200;
const CONTRACT_SEARCH_CACHE_TTL_MS = 60_000;
const CONTRACT_SEARCH_CACHE_MAX_ENTRIES = 24;
const GOLD_PRODUCT: Product = "comfortcc";
const PRODUCT_CARD_LABELS: Partial<Record<Product, string>> = {
  conseqzenit: "Zenit DPS",
  neon: "Životní pojištění NEON",
  flexi: "Životní pojištění FLEXI",
  maximaMaxEfekt: "Životní pojištění MaxEfekt",
  pillowInjury: "Úraz / Nemoc",
  zamex: "ZAMEX",
  cppbytex: "BYTEX PLUS",
  domexneuron: "DOMEX NEURON",
  domex: "DOMEX",
  cpphafan: "HAFAN",
  pillowmajetek: "Majetek",
  koopmajetekobcan: "Majetek a odpovědnost občanů",
  koopfit: "Sportovní výbava FIT",
  koopodzam: "Odpovědnost zaměstnance",
  kooppmop: "Majetek a odpovědnost podnikatelů",
  maxdomov: "MAXDOMOV",
  allianzmujdomov: "MůjDomov",
  cppsimplex: "Simplex",
  cppAuto: "Auto",
  slaviaauto: "Auto",
  slaviaflotila: "Auto Flotila",
  allianzAuto: "Auto",
  csobAuto: "Auto",
  uniqaAuto: "Auto",
  uniqaflotila: "Auto Flotila",
  pillowAuto: "Auto",
  kooperativaAuto: "Auto",
  koopflotila: "Auto Flotila",
  koopcestovko: "Cestovní pojištění",
  cppcestovko: "Cestovní pojištění",
  axacestovko: "Cestovní pojištění",
  maxcizinkomplex: "Komplexní zdravotní pojištění cizinců",
  comfortcc: "Comfort Commodity",
  cppPPRs: "Majetek a odpovědnost podnikatelů – ÚPIS",
  cppPPRbez: "Majetek a odpovědnost podnikatelů",
};

const CATEGORY_ICON_BY_ID: Record<ProductCategory, LucideIcon> = {
  pension: CircleDollarSign,
  life: HeartPulse,
  auto: Car,
  property: Home,
  travel: Plane,
  comfort: CircleDollarSign,
  business: BriefcaseBusiness,
  foreigners: UsersRound,
};

const CONTRACT_CATEGORY_TONE_BY_ID: Record<ProductCategory, string> = {
  pension: "border-cyan-200 bg-cyan-50 text-cyan-600",
  life: "border-rose-200 bg-rose-50 text-rose-600",
  auto: "border-sky-200 bg-sky-50 text-sky-600",
  property: "border-emerald-200 bg-emerald-50 text-emerald-600",
  travel: "border-violet-200 bg-violet-50 text-violet-600",
  comfort: "border-amber-200 bg-amber-50 text-amber-600",
  business: "border-indigo-200 bg-indigo-50 text-indigo-600",
  foreigners: "border-teal-200 bg-teal-50 text-teal-600",
};

const CONTRACT_CATEGORY_CARD_TONE_BY_ID: Record<ProductCategory, string> = {
  pension: "border-cyan-300/35 bg-cyan-300/15 text-cyan-200",
  life: "border-rose-300/35 bg-rose-300/15 text-rose-200",
  auto: "border-sky-300/35 bg-sky-300/15 text-sky-200",
  property: "border-emerald-300/35 bg-emerald-300/15 text-emerald-200",
  travel: "border-violet-300/35 bg-violet-300/15 text-violet-200",
  comfort: "border-amber-300/35 bg-amber-300/15 text-amber-200",
  business: "border-indigo-300/35 bg-indigo-300/15 text-indigo-200",
  foreigners: "border-teal-300/35 bg-teal-300/15 text-teal-200",
};

type ContractContextMenuState = {
  contract: ContractDoc;
  slug: string;
  x: number;
  y: number;
};

type ContractActionToastState = {
  message: string;
  tone: "success" | "error";
};

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

function premiumDisplayForContract(c: ContractDoc): {
  amount: number;
  cadenceLabel: "MĚSÍČNĚ" | "ROČNĚ" | null;
} {
  const product = c.productKey;
  const amount = premiumSourceAmountForContract(c);

  if (product && LIFE_PRODUCTS.has(product)) {
    return { amount, cadenceLabel: "MĚSÍČNĚ" };
  }

  if (product === GOLD_PRODUCT) {
    return { amount, cadenceLabel: null };
  }

  return {
    amount: amount * paymentsPerYear(c.frequencyRaw),
    cadenceLabel: "ROČNĚ",
  };
}

function premiumSourceAmountForContract(c: ContractDoc): number {
  const sourceAmount =
    c.entryType === "endorsement"
      ? c.newInputAmount ?? c.effectiveInputAmount ?? c.inputAmount
      : c.inputAmount;
  const base = Number(sourceAmount ?? 0);
  return Number.isFinite(base) ? base : 0;
}

function endorsementDeltaAmount(c: ContractDoc): number | null {
  if (c.entryType !== "endorsement") return null;
  const explicitDelta = Number(c.premiumDelta ?? Number.NaN);
  if (Number.isFinite(explicitDelta)) return explicitDelta;

  const prev = Number(c.previousInputAmount ?? Number.NaN);
  const next = Number(
    c.newInputAmount ?? c.effectiveInputAmount ?? c.inputAmount ?? Number.NaN
  );
  if (Number.isFinite(prev) && Number.isFinite(next)) {
    return next - prev;
  }
  return null;
}

function contractStatusBadgeMeta({
  isStorno,
  isDozita,
  paid,
}: {
  isStorno: boolean;
  isDozita: boolean;
  paid?: boolean | null;
}) {
  if (isStorno) {
    return {
      label: "Storno",
      compactClass: "border-amber-200 bg-amber-50 text-amber-800",
      compactDotClass: "bg-amber-500",
    };
  }

  if (isDozita) {
    return {
      label: "Dožitá",
      compactClass: "border-sky-200 bg-sky-50 text-sky-800",
      compactDotClass: "bg-sky-500",
    };
  }

  if (paid) {
    return {
      label: "Zaplaceno",
      compactClass: "border-emerald-200 bg-emerald-50 text-emerald-800",
      compactDotClass: "bg-emerald-500",
    };
  }

  return {
    label: "Nezaplaceno",
    compactClass: "border-rose-200 bg-rose-50 text-rose-700",
    compactDotClass: "bg-rose-500",
  };
}

function institutionLabelForProduct(product?: Product | null): string | null {
  return productInstitutionLabel(product, null);
}

function ContractInstitutionLogo({
  product,
}: {
  product?: Product | null;
}) {
  const institution = product ? PRODUCT_CATALOG[product] : null;
  if (!institution) {
    return (
      <span className={cardStyles.logo} aria-hidden="true">
        <ReceiptText size={22} strokeWidth={1.5} className="text-slate-400" />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cardStyles.logo}
    >
      <Image
        src={institution.institutionLogo}
        alt=""
        fill
        sizes="50px"
        className={`${institutionLogoImageClass(
          institution.institutionId
        )} ${cardStyles.logoImage}`}
      />
    </span>
  );
}

function ContractCategoryIcon({
  product,
  surface = "light",
}: {
  product?: Product | null;
  surface?: "light" | "dark";
}) {
  const category = product ? PRODUCT_CATALOG[product]?.category : null;
  if (!category) return null;

  const Icon = CATEGORY_ICON_BY_ID[category];
  const label = CATEGORY_DEFS.find((item) => item.id === category)?.label ?? category;
  const tone =
    surface === "dark"
      ? CONTRACT_CATEGORY_CARD_TONE_BY_ID[category]
      : CONTRACT_CATEGORY_TONE_BY_ID[category];

  return (
    <span
      role="img"
      aria-label={`Kategorie: ${label}`}
      title={label}
      className={`${cardStyles.categoryIcon} ${tone}`}
    >
      <Icon size={13} strokeWidth={2.2} aria-hidden="true" />
    </span>
  );
}

function isManagerPosition(pos: Position | null): boolean {
  if (!pos) return false;
  return pos.startsWith("manazer");
}

function productLabel(p?: Product): string {
  return productLabelFromCatalog(p, "Neznámý produkt");
}

function productCardLabel(product?: Product): string {
  if (!product) return "Neznámý produkt";

  const mapped = PRODUCT_CARD_LABELS[product];
  if (mapped) return mapped;

  const fallback = productLabel(product);
  const meta = PRODUCT_CATALOG[product];
  if (!meta) return fallback;

  const label = meta.label.trim();
  const institution = meta.institutionLabel.trim();
  const labelLower = label.toLocaleLowerCase("cs-CZ");
  const institutionLower = institution.toLocaleLowerCase("cs-CZ");

  if (institution && labelLower.startsWith(`${institutionLower} `)) {
    return label.slice(institution.length).trim();
  }

  return fallback;
}

// jmeno.prijmeni@bohemika.eu → "Jmeno Prijmeni"
function adviserNameFromEmail(email?: string | null): string {
  if (!email) return "";
  const beforeAt = email.split("@")[0] ?? "";
  const parts = beforeAt.split(/[.\-_]/).filter(Boolean);
  if (parts.length === 0) return email;
  return parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(" ");
}

function cleanDisplayName(value?: string | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function localIsoDay(value = new Date()): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function adviserLabelForEmail(email: string, knownName?: string | null): string {
  return cleanDisplayName(knownName) || adviserNameFromEmail(email) || email;
}

function isContractStorno(
  contract:
    | ContractDoc
    | null
    | undefined
): boolean {
  return contractLifecycleStatus(contract) === "storno";
}

function isContractDozita(
  contract:
    | ContractDoc
    | null
    | undefined
): boolean {
  return contractLifecycleStatus(contract) === "dozita";
}

function getOldestContractDate(contracts: ContractDoc[]): Date | null {
  if (contracts.length === 0) return null;
  let oldest: Date | null = null;
  for (const c of contracts) {
    const d = getContractDate(c);
    if (!d) continue;
    if (!oldest || d.getTime() < oldest.getTime()) {
      oldest = d;
    }
  }
  return oldest;
}

function ContractsPageContent() {
  const searchParams = useSearchParams();
  const [isFilterPending, startFilterTransition] = useTransition();
  const pendingScrollRestoreRef = useRef<number | null>(null);
  const refreshInFlightRef = useRef<{
    scopeEmail: string;
    viewRevision: number;
    promise: Promise<void>;
  } | null>(null);
  const lastSilentRefreshAtRef = useRef(0);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [currentUserPosition, setCurrentUserPosition] =
    useState<Position | null>(null);
  const [availablePositions, setAvailablePositions] = useState<Position[]>([]);
  const teamUsersRef = useRef<AppUser[]>([]);

  const [myContracts, setMyContracts] = useState<ContractDoc[]>([]);
  const [teamContracts, setTeamContracts] = useState<
    (ContractDoc & { adviserEmail: string | null })[]
  >([]);
  const [myHasMore, setMyHasMore] = useState(true);
  const [teamHasMore, setTeamHasMore] = useState(true);
  const [myCursorDate, setMyCursorDate] = useState<string | null>(null);
  const [teamCursorDate, setTeamCursorDate] = useState<string | null>(null);

  const [showTeam, setShowTeam] = useState(false);
  const [filterMode, setFilterMode] = useState<FilterMode>("latest");
  const [searchText, setSearchText] = useState("");
  const [debouncedSearchText, setDebouncedSearchText] = useState("");
  const [showUnpaidOnly, setShowUnpaidOnly] = useState(false);
  const [showRefreshOnly, setShowRefreshOnly] = useState(false);
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const [showStornoOnly, setShowStornoOnly] = useState(false);
  const [showMaturedOnly, setShowMaturedOnly] = useState(false);
  const [commissionAuditMode, setCommissionAuditMode] =
    useState<CommissionAuditFilterMode>("off");
  const [commissionAuditCodeFilter, setCommissionAuditCodeFilter] =
    useState<CommissionAuditFilterCode>("all");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const serverFilterRequestRef = useRef(0);
  const dataViewRevisionRef = useRef(0);
  const previousServerFilterActiveRef = useRef(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkMarking, setBulkMarking] = useState(false);
  const [bulkTransferring, setBulkTransferring] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkSuccess, setBulkSuccess] = useState<string | null>(null);
  const [canTransferContracts, setCanTransferContracts] = useState(false);
  const [transferTargets, setTransferTargets] = useState<
    { email: string; name: string | null; position: Position | null }[]
  >([]);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferTargetEmail, setTransferTargetEmail] = useState("");
  const [transferTargetQuery, setTransferTargetQuery] = useState("");
  const [transferTargetSearchOpen, setTransferTargetSearchOpen] = useState(false);
  const [transferEffectiveDate, setTransferEffectiveDate] = useState(() =>
    localIsoDay()
  );
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<Set<ProductCategory>>(new Set());
  const [selectedInstitutions, setSelectedInstitutions] = useState<Set<Institution>>(new Set());
  const [selectedPositions, setSelectedPositions] = useState<Set<Position>>(new Set());
  const [selectedSubordinates, setSelectedSubordinates] = useState<Set<string>>(new Set());
  const [listMicroAnimating, setListMicroAnimating] = useState(false);
  const [commissionAuditFilterPending, setCommissionAuditFilterPending] =
    useState(false);
  const [contractDetailWindow, setContractDetailWindow] =
    useState<ContractDetailWindowState | null>(null);
  const [contractContextMenu, setContractContextMenu] =
    useState<ContractContextMenuState | null>(null);
  const [contractActionToast, setContractActionToast] =
    useState<ContractActionToastState | null>(null);
  const contractsListRef = useRef<HTMLDivElement | null>(null);
  const contractActionToastTimerRef = useRef<number | null>(null);
  const searchResponseCacheRef = useRef(
    new Map<string, { expiresAt: number; data: ContractsApiResponse }>()
  );
  const [contractsWindowMetrics, setContractsWindowMetrics] = useState({
    scrollY: 0,
    viewportHeight: 0,
    listTop: 0,
    rowHeight: CONTRACT_LIST_ESTIMATED_COMPACT_ROW_HEIGHT,
  });
  const lastListTransitionSignatureRef = useRef<string | null>(null);
  const shouldRestoreView = searchParams?.get("restore") === "1";
  const globalSearchParam = (searchParams?.get("globalSearch") ?? "").trim().slice(0, 120);
  const normalizedUserEmail = useEffectiveUserEmail(user?.email);
  const normalizedSearchText = normalizeSearchValue(searchText);
  const hasImmediateSearchQuery = normalizedSearchText.length > 0;
  const hasSearchQuery = debouncedSearchText.length > 0;
  const searchDebouncePending = normalizedSearchText !== debouncedSearchText;
  const canShowTeamToggle =
    isManagerPosition(currentUserPosition) || teamUsersRef.current.length > 0;
  const anniversaryModeActive =
    filterMode === "anniversary";
  const selectedCategoryList = useMemo(
    () => Array.from(selectedCategories).sort(),
    [selectedCategories]
  );
  const selectedInstitutionList = useMemo(
    () => Array.from(selectedInstitutions).sort(),
    [selectedInstitutions]
  );
  const selectedPositionList = useMemo(
    () => Array.from(selectedPositions).sort(),
    [selectedPositions]
  );
  const selectedSubordinateList = useMemo(
    () => Array.from(selectedSubordinates).sort(),
    [selectedSubordinates]
  );
  const commissionAuditActive = isCommissionAuditFilterActive({
    mode: commissionAuditMode,
    codeFilter: commissionAuditCodeFilter,
  });

  useEffect(() => {
    if (globalSearchParam) {
      setSearchText(globalSearchParam);
    }
  }, [globalSearchParam]);

  useEffect(() => {
    if (!hasImmediateSearchQuery) {
      setDebouncedSearchText("");
      return;
    }

    const timer = window.setTimeout(() => {
      setDebouncedSearchText(normalizedSearchText);
    }, CONTRACT_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [normalizedSearchText, hasImmediateSearchQuery]);

  useEffect(() => {
    searchResponseCacheRef.current.clear();
    serverFilterRequestRef.current += 1;
    teamUsersRef.current = [];
    setSelectedKeys(new Set());
    setSelectedSubordinates(new Set());
    setSelectedPositions(new Set());
    setAvailablePositions([]);
    setFilterModalOpen(false);
    setSelectMode(false);
    setShowTeam(false);
    setContractDetailWindow(null);
  }, [normalizedUserEmail]);

  const serverFilterActive =
    hasImmediateSearchQuery ||
    hasSearchQuery ||
    anniversaryModeActive ||
    showUnpaidOnly ||
    showRefreshOnly ||
    showActiveOnly ||
    showStornoOnly ||
    showMaturedOnly ||
    commissionAuditActive ||
    selectedCategoryList.length > 0 ||
    selectedInstitutionList.length > 0 ||
    selectedPositionList.length > 0 ||
    (showTeam && canShowTeamToggle && selectedSubordinateList.length > 0);
  const activeListFilters = useMemo<ContractsListFilters>(
    () => ({
      query: debouncedSearchText.trim(),
      filterMode: anniversaryModeActive ? "anniversary" : "latest",
      showUnpaidOnly,
      showRefreshOnly,
      showActiveOnly,
      showStornoOnly,
      showMaturedOnly,
      commissionAuditMode,
      commissionAuditCodeFilter,
      selectedCategories: selectedCategoryList,
      selectedInstitutions: selectedInstitutionList,
      selectedPositions: selectedPositionList,
      selectedSubordinates: selectedSubordinateList,
    }),
    [
      debouncedSearchText,
      anniversaryModeActive,
      showUnpaidOnly,
      showRefreshOnly,
      showActiveOnly,
      showStornoOnly,
      showMaturedOnly,
      commissionAuditMode,
      commissionAuditCodeFilter,
      selectedCategoryList,
      selectedInstitutionList,
      selectedPositionList,
      selectedSubordinateList,
    ]
  );

  // Unfiltered refreshes contain both portfolios, so switching tabs keeps them valid.
  const dataViewKey = JSON.stringify([normalizedUserEmail, serverFilterActive && showTeam, normalizedSearchText, activeListFilters]);
  useEffect(() => { dataViewRevisionRef.current += 1; }, [dataViewKey]);

  const mergeContracts = <T extends { id: string }>(prev: T[], next: T[]): T[] => {
    const seen = new Set(prev.map((c) => c.id));
    const merged = [...prev];
    for (const item of next) {
      if (seen.has(item.id)) continue;
      merged.push(item);
    }
    return merged;
  };

  const apiFetchContracts = useCallback(
    async ({
      scope,
      cursor,
      includeTeam,
      filters,
      signal,
    }: {
      scope: "my" | "team";
      cursor?: string | null;
      includeTeam?: boolean;
      filters?: ContractsListFilters;
      signal?: AbortSignal;
    }) => {
      if (!user) {
        throw new DOMException("Authentication not ready", "AbortError");
      }
      const requestScopeEmail = normalizedUserEmail;
      if (
        !requestScopeEmail ||
        effectiveUserEmail(user.email) !== requestScopeEmail
      ) {
        throw new DOMException("User scope changed", "AbortError");
      }
      const params = new URLSearchParams({ scope });
      params.set("shape", "contractList");
      if (cursor) params.set("cursor", cursor);
      if (includeTeam) params.set("includeTeam", "1");
      if (filters) {
        const query = filters.query.trim();
        if (query) params.set("q", query);
        if (filters.filterMode === "anniversary") {
          params.set("mode", "anniversary");
        }
        if (filters.showUnpaidOnly) {
          params.set("unpaidOnly", "1");
        }
        if (filters.showRefreshOnly) {
          params.set("refreshOnly", "1");
        }
        if (filters.showActiveOnly) {
          params.set("activeOnly", "1");
        }
        if (filters.showStornoOnly) {
          params.set("stornoOnly", "1");
        }
        if (filters.showMaturedOnly) {
          params.set("maturedOnly", "1");
        }
        if (filters.commissionAuditMode !== "off") {
          params.set("commissionAudit", filters.commissionAuditMode);
          if (filters.commissionAuditCodeFilter !== "all") {
            params.set("commissionCode", filters.commissionAuditCodeFilter);
          }
        }
        if (filters.selectedCategories.length > 0) {
          params.set("categories", filters.selectedCategories.join(","));
        }
        if (filters.selectedInstitutions.length > 0) {
          params.set("institutions", filters.selectedInstitutions.join(","));
        }
        if (filters.selectedPositions.length > 0) {
          params.set("positions", filters.selectedPositions.join(","));
        }
        if (scope === "team" && filters.selectedSubordinates.length > 0) {
          params.set("subordinates", filters.selectedSubordinates.join(","));
        }
      }

      const searchCacheKey =
        filters?.query.trim() && !cursor
          ? `${requestScopeEmail}:${params.toString()}`
          : null;
      if (searchCacheKey) {
        const cached = searchResponseCacheRef.current.get(searchCacheKey);
        if (cached && cached.expiresAt > Date.now()) {
          if (signal?.aborted) {
            throw new DOMException("Request aborted", "AbortError");
          }
          if (effectiveUserEmail(auth.currentUser?.email) !== requestScopeEmail) {
            throw new DOMException("User scope changed", "AbortError");
          }
          return cached.data;
        }
        if (cached) searchResponseCacheRef.current.delete(searchCacheKey);
      }

      const requestWithToken = async (token: string) =>
        fetch(`/api/contracts/list?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal,
        });

      let token: string;
      try {
        // Prefer cached token. Forced refresh only when API returns 401.
        token = await user.getIdToken();
      } catch (err) {
        const code = (err as { code?: string } | null)?.code;
        if (code === "auth/network-request-failed") {
          throw new Error(
            "Síťové připojení je dočasně nedostupné. Zkus to prosím znovu."
          );
        }
        throw err;
      }

      let res: Response;
      try {
        res = await requestWithToken(token);
      } catch (err) {
        if ((err as { name?: string } | null)?.name === "AbortError") {
          throw err;
        }
        throw new Error(
          "Nepodařilo se spojit se serverem. Zkontroluj připojení a zkus to znovu."
        );
      }

      let data = await readContractsApiResponseSafe(res);
      if (res.status === 401) {
        const refreshed = await user.getIdToken(true);
        res = await requestWithToken(refreshed);
        data = await readContractsApiResponseSafe(res);
      }

      if (!res.ok || data?.ok === false) {
        throw new Error(
          data?.error ||
            (res.status ? `Nepodařilo se načíst smlouvy (HTTP ${res.status}).` : "Nepodařilo se načíst smlouvy.")
        );
      }
      if (!data) throw new Error("Nepodařilo se načíst smlouvy.");
      if (effectiveUserEmail(auth.currentUser?.email) !== requestScopeEmail) {
        throw new DOMException("User scope changed", "AbortError");
      }
      if (searchCacheKey) {
        searchResponseCacheRef.current.set(searchCacheKey, {
          expiresAt: Date.now() + CONTRACT_SEARCH_CACHE_TTL_MS,
          data,
        });
        while (
          searchResponseCacheRef.current.size > CONTRACT_SEARCH_CACHE_MAX_ENTRIES
        ) {
          const oldestKey = searchResponseCacheRef.current.keys().next().value;
          if (!oldestKey) break;
          searchResponseCacheRef.current.delete(oldestKey);
        }
      }
      return data;
    },
    [normalizedUserEmail, user]
  );

  const applyContractsMetadata = useCallback((data: ContractsApiResponse) => {
    if (data.teamEmails) {
      teamUsersRef.current = data.teamEmails.map(normalizeEmail).filter(Boolean).map(email => ({
        id: email, email, position: null, managerEmail: null,
      }));
    }
    if (data.availablePositions) setAvailablePositions(normalizeCareerPositions(data.availablePositions));
    if (data.position !== undefined) setCurrentUserPosition(data.position);
    if (typeof data.canTransferContracts === "boolean") {
      setCanTransferContracts(data.canTransferContracts);
    }
    if (Array.isArray(data.transferTargets)) {
      setTransferTargets(
        data.transferTargets
          .map((target) => ({
            email: normalizeEmail(target.email),
            name: cleanDisplayName(target.name) || null,
            position: target.position ?? null,
          }))
          .filter((target) => Boolean(target.email))
      );
    }
  }, []);

  const fetchMyPage = useCallback(
    async (
      startBefore: string | null,
      append: boolean,
      filters?: ContractsListFilters,
      requestId?: number,
      signal?: AbortSignal
    ) => {
      if (!user || !normalizedUserEmail) {
        return { list: [] as ContractDoc[], oldest: null as Date | null, hasMore: false };
      }
      const data = await apiFetchContracts({
        scope: "my",
        cursor: startBefore,
        filters,
        signal,
      });
      const list = (data.contracts as ContractDoc[]) ?? [];
      const oldest = getOldestContractDate(list);
      const hasMore = Boolean(data.hasMore);

      if (signal?.aborted) {
        return { list, oldest, hasMore };
      }
      if (requestId != null && serverFilterRequestRef.current !== requestId) {
        return { list, oldest, hasMore };
      }

      applyContractsMetadata(data);
      setMyContracts((prev) => (append ? mergeContracts(prev, list) : list));
      setMyHasMore(hasMore);
      setMyCursorDate(cursorFromApi(data.nextCursorToken, data.nextCursor));

      return { list, oldest, hasMore };
    },
    [apiFetchContracts, applyContractsMetadata, normalizedUserEmail, user]
  );

  const fetchTeamPage = useCallback(
    async (
      startBefore: string | null,
      append: boolean,
      filters?: ContractsListFilters,
      requestId?: number,
      signal?: AbortSignal
    ) => {
      const teamEmails = teamUsersRef.current.map((u) => u.email).filter(Boolean);
      const hasExplicitSubordinateFilter =
        (filters?.selectedSubordinates.length ?? 0) > 0;
      if (teamEmails.length === 0 && !hasExplicitSubordinateFilter) {
        if (requestId != null && serverFilterRequestRef.current !== requestId) {
          return { list: [] as (ContractDoc & { adviserEmail: string | null })[], oldest: null as Date | null, hasMore: false };
        }
        setTeamContracts([]);
        setTeamHasMore(false);
        setTeamCursorDate(null);
        return { list: [] as (ContractDoc & { adviserEmail: string | null })[], oldest: null as Date | null, hasMore: false };
      }

      const data = await apiFetchContracts({
        scope: "team",
        cursor: startBefore,
        filters,
        signal,
      });
      const list = (data.contracts as (ContractDoc & { adviserEmail: string | null })[]) ?? [];
      const oldest = getOldestContractDate(list);
      const hasMore = Boolean(data.hasMore);

      if (signal?.aborted) {
        return { list, oldest, hasMore };
      }
      if (requestId != null && serverFilterRequestRef.current !== requestId) {
        return { list, oldest, hasMore };
      }

      applyContractsMetadata(data);
      setTeamContracts((prev) => (append ? mergeContracts(prev, list) : list));
      setTeamHasMore(hasMore);
      setTeamCursorDate(cursorFromApi(data.nextCursorToken, data.nextCursor));

      return { list, oldest, hasMore };
    },
    [apiFetchContracts, applyContractsMetadata]
  );

  const applyContractsPayload = useCallback(
    (email: string, data: ContractsApiResponse) => {
      applyContractsMetadata(data);
      const myList = (data.contracts as ContractDoc[]) ?? [];
      const teamList =
        (data.teamContracts as (ContractDoc & { adviserEmail: string | null })[]) ?? [];

      setCurrentUserPosition(data.position ?? null);
      setMyContracts(myList);
      setTeamContracts(teamList);
      setMyHasMore(Boolean(data.hasMore));
      setTeamHasMore(Boolean(data.teamHasMore));
      setMyCursorDate(cursorFromApi(data.nextCursorToken, data.nextCursor));
      setTeamCursorDate(
        cursorFromApi(data.teamNextCursorToken, data.teamNextCursor)
      );

      const teamEmails = (data.teamEmails ?? []).map((em) => em.toLowerCase());
      teamUsersRef.current = teamEmails.map((em) => ({
        id: em,
        email: em,
        position: null,
        managerEmail: null,
      }));

      writeContractsCache({
        userEmail: email,
        position: data.position ?? null,
        availablePositions: normalizeCareerPositions(data.availablePositions),
        myContracts: myList,
        teamContracts: teamList,
        savedAt: Date.now(),
        myHasMore: Boolean(data.hasMore),
        teamHasMore: Boolean(data.teamHasMore),
        myCursorDate: cursorFromApi(data.nextCursorToken, data.nextCursor),
        teamCursorDate: cursorFromApi(data.teamNextCursorToken, data.teamNextCursor),
        teamEmails,
      });
    },
    [applyContractsMetadata]
  );

  const refreshContracts = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      const email = normalizedUserEmail;
      if (!user || !email) return;
      // Při aktivních serverových filtrech by tichý refresh přepsal filtrovaný dataset
      // první nefiltrouvanou stránkou a UI by viditelně probliklo.
      if (silent && serverFilterActive) return;
      if (silent && Date.now() - lastSilentRefreshAtRef.current < CONTRACTS_SILENT_REFRESH_COOLDOWN_MS) {
        return;
      }
      const viewRevision = dataViewRevisionRef.current;
      if (refreshInFlightRef.current?.scopeEmail === email && refreshInFlightRef.current.viewRevision === viewRevision) {
        if (!silent) {
          await refreshInFlightRef.current.promise;
        }
        return;
      }
      const task = (async () => {
        if (!silent) setLoading(true);
        setLoadError(null);
        try {
          const data = await apiFetchContracts({ scope: "my", includeTeam: true });
          if (effectiveUserEmail(auth.currentUser?.email) !== email) return;
          // The initial response still supplies team navigation metadata, but
          // must not replace a search that completed while it was loading.
          applyContractsMetadata(data);
          if (dataViewRevisionRef.current !== viewRevision) return;
          applyContractsPayload(email, data);
        } catch (e) {
          if ((e as { name?: string } | null)?.name === "AbortError") return;
          if (effectiveUserEmail(auth.currentUser?.email) !== email) return;
          if (dataViewRevisionRef.current !== viewRevision) return;
          const msg = getErrorMessage(e, "Nepodařilo se načíst nejnovější smlouvy.");
          if (msg.toLowerCase().includes("síť") || msg.toLowerCase().includes("network")) {
            console.warn("Dočasný výpadek sítě při načítání smluv:", msg);
          } else {
            console.error("Chyba při načítání smluv:", e);
          }
          setLoadError(msg);
        } finally {
          if (!silent && effectiveUserEmail(auth.currentUser?.email) === email && dataViewRevisionRef.current === viewRevision) {
            setLoading(false);
          }
        }
      })();

      refreshInFlightRef.current = { scopeEmail: email, viewRevision, promise: task };
      try {
        await task;
      } finally {
        if (silent) {
          lastSilentRefreshAtRef.current = Date.now();
        }
        if (refreshInFlightRef.current?.promise === task) {
          refreshInFlightRef.current = null;
        }
      }
    },
    [normalizedUserEmail, user, apiFetchContracts, applyContractsPayload, applyContractsMetadata, serverFilterActive]
  );

  // auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      setUser(fbUser);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    lastSilentRefreshAtRef.current = 0;
  }, [normalizedUserEmail]);

  // load pozice + smlouvy
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const email = normalizedUserEmail;
      if (!email || !user) {
        setMyContracts([]);
        setTeamContracts([]);
        setCurrentUserPosition(null);
        setMyHasMore(false);
        setTeamHasMore(false);
        setMyCursorDate(null);
        setTeamCursorDate(null);
        setLoadError(null);
        setLoading(false);
        setCanTransferContracts(false);
        setTransferTargets([]);
        setTransferModalOpen(false);
        setTransferTargetEmail("");
        return;
      }
      if (serverFilterActive) {
        return;
      }

      const cached = readContractsCache(email);
      if (cached) {
        setMyContracts(cached.myContracts ?? []);
        setTeamContracts(cached.teamContracts ?? []);
        setCurrentUserPosition(cached.position ?? null);
        setAvailablePositions(normalizeCareerPositions(cached.availablePositions ?? [cached.position]));
        setMyHasMore(cached.myHasMore ?? true);
        setTeamHasMore(cached.teamHasMore ?? true);
        setMyCursorDate(normalizeCursorToken(cached.myCursorDate));
        setTeamCursorDate(normalizeCursorToken(cached.teamCursorDate));
        if (cached.teamEmails?.length) {
          teamUsersRef.current = cached.teamEmails.map((em) => ({
            id: em,
            email: em,
            position: null,
            managerEmail: null,
          }));
        } else if ((cached.teamContracts?.length ?? 0) > 0) {
          const uniq = Array.from(
            new Set(
              cached.teamContracts
                .map((c) => (c.userEmail ?? c.adviserEmail ?? "").toLowerCase())
                .filter(Boolean)
            )
          );
          teamUsersRef.current = uniq.map((em) => ({
            id: em,
            email: em,
            position: null,
            managerEmail: null,
          }));
        }
        setLoading(false);
      } else {
        setLoading(true);
      }

      await refreshContracts({ silent: Boolean(cached) });
      if (!cancelled && cached) {
        setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [normalizedUserEmail, user, refreshContracts, serverFilterActive]);

  useEffect(() => {
    if (!user || !normalizedUserEmail) return;

    // Invalidate paginated responses as soon as the query changes, including the debounce window.
    const requestId = ++serverFilterRequestRef.current;
    if (searchDebouncePending) return;

    if (!serverFilterActive) {
      if (previousServerFilterActiveRef.current) {
        previousServerFilterActiveRef.current = false;
        void refreshContracts({ silent: false });
      }
      return;
    }

    previousServerFilterActiveRef.current = true;
    let cancelled = false;
    const controller = new AbortController();
    const includesCommissionAudit =
      activeListFilters.commissionAuditMode !== "off";

    const loadFiltered = async () => {
      setLoading(true);
      setLoadError(null);
      setBulkError(null);
      setSelectedKeys(new Set());
      setSelectMode(false);

      try {
        const scope: "my" | "team" =
          showTeam && canShowTeamToggle ? "team" : "my";
        if (scope === "team") {
          await fetchTeamPage(
            null,
            false,
            activeListFilters,
            requestId,
            controller.signal
          );
        } else {
          await fetchMyPage(
            null,
            false,
            activeListFilters,
            requestId,
            controller.signal
          );
        }
      } catch (e) {
        if ((e as { name?: string } | null)?.name === "AbortError") return;
        if (cancelled || serverFilterRequestRef.current !== requestId) return;
        const msg = getErrorMessage(e, "Nepodařilo se načíst filtrované smlouvy.");
        if (msg.toLowerCase().includes("síť") || msg.toLowerCase().includes("network")) {
          console.warn("Dočasný výpadek sítě při filtrování smluv:", msg);
        } else {
          console.error("Chyba při filtrování smluv:", e);
        }
        setLoadError(msg);
      } finally {
        if (!cancelled && serverFilterRequestRef.current === requestId) {
          setLoading(false);
          if (includesCommissionAudit) {
            setCommissionAuditFilterPending(false);
          }
        }
      }
    };

    void loadFiltered();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    normalizedUserEmail,
    user,
    searchDebouncePending,
    serverFilterActive,
    activeListFilters,
    showTeam,
    canShowTeamToggle,
    fetchMyPage,
    fetchTeamPage,
    refreshContracts,
  ]);

  useEffect(() => {
    if (!commissionAuditActive && commissionAuditFilterPending) {
      setCommissionAuditFilterPending(false);
    }
  }, [commissionAuditActive, commissionAuditFilterPending]);

  useEffect(() => {
    if (typeof window === "undefined" || !user || !normalizedUserEmail) return;

    const triggerRefresh = () => {
      searchResponseCacheRef.current.clear();
      void refreshContracts({ silent: true });
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        triggerRefresh();
      }
    };

    const onStorage = (ev: StorageEvent) => {
      if (ev.key === CONTRACTS_UPDATED_KEY) {
        triggerRefresh();
      }
    };

    window.addEventListener("focus", triggerRefresh);
    window.addEventListener("pageshow", triggerRefresh);
    window.addEventListener("contracts:updated", triggerRefresh as EventListener);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("focus", triggerRefresh);
      window.removeEventListener("pageshow", triggerRefresh);
      window.removeEventListener("contracts:updated", triggerRefresh as EventListener);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("storage", onStorage);
    };
  }, [normalizedUserEmail, user, refreshContracts]);

  const subordinateFilterOptions = useMemo(() => {
    if (!canShowTeamToggle) return [] as { email: string; label: string }[];
    const emails = new Set<string>();
    const namesByEmail = new Map<string, string>();

    for (const member of teamUsersRef.current) {
      const email = normalizeEmail(member.email);
      if (!email) continue;
      emails.add(email);
      const name = cleanDisplayName(member.fullName) || cleanDisplayName(member.name);
      if (name) namesByEmail.set(email, name);
    }

    for (const contract of teamContracts) {
      const email = contractOwnerEmail(contract);
      if (!email) continue;
      emails.add(email);
      const name = cleanDisplayName(contract.adviserName);
      if (name) namesByEmail.set(email, name);
    }

    return Array.from(emails)
      .map((email) => ({
        email,
        label: adviserLabelForEmail(email, namesByEmail.get(email)),
      }))
      .sort((a, b) => {
        const labelCompare = a.label.localeCompare(b.label, "cs", {
          sensitivity: "base",
        });
        if (labelCompare !== 0) return labelCompare;
        return a.email.localeCompare(b.email, "cs", { sensitivity: "base" });
      });
  }, [canShowTeamToggle, teamContracts]);

  const displayedContracts = useMemo(() => {
    const base = (
      showTeam && canShowTeamToggle ? teamContracts : myContracts
    ) as (ContractDoc & { adviserEmail?: string | null })[];
    const explicitRootEntryKeys = new Set<string>();
    base.forEach((contract) => {
      if (contract.entryType !== "endorsement") return;
      const ownerEmail = contractOwnerEmail(contract);
      const rootContractEntryId = (contract.rootContractEntryId ?? "").trim();
      if (ownerEmail && rootContractEntryId) {
        explicitRootEntryKeys.add(`${ownerEmail}___${rootContractEntryId}`);
      }
    });

    const grouped = new Map<
      string,
      {
        display: ContractDoc & { adviserEmail?: string | null };
        latest: ContractDoc & { adviserEmail?: string | null };
        latestSortMs: number;
        latestCreatedMs: number;
        preferRootDisplay: boolean;
        endorsementCount: number;
        hasRefresh: boolean;
        searchClientTokens: Set<string>;
        searchContractTokens: Set<string>;
        searchContractCompactTokens: Set<string>;
      }
    >();

    base.forEach((contract) => {
      const ownerEmail = contractOwnerEmail(contract);
      const contractNo = (contract.contractNumber ?? "").trim().toLowerCase();
      const productKey = (contract.productKey ?? "unknown").toString();
      const isEndorsement = contract.entryType === "endorsement";
      const rootContractEntryId = (contract.rootContractEntryId ?? "").trim();
      const explicitRootKey =
        ownerEmail && rootContractEntryId
          ? `${ownerEmail}___${rootContractEntryId}`
          : "";
      const ownRootKey = ownerEmail ? `${ownerEmail}___${contract.id}` : "";
      const isExplicitRootContract =
        !isEndorsement && explicitRootEntryKeys.has(ownRootKey);
      const groupKey =
        explicitRootKey || isExplicitRootContract
          ? `${ownerEmail}___root___${
              rootContractEntryId || contract.id
            }`
          : contractNo
            ? `${ownerEmail}___${productKey}___${contractNo}`
            : `${ownerEmail}___entry___${contract.id}`;
      const preferRootDisplay = Boolean(explicitRootKey || isExplicitRootContract);
      const sortMs =
        getContractDate(contract)?.getTime() ?? 0;
      const createdMs = toDate((contract as any).createdAt)?.getTime() ?? 0;
      const hasRefresh = isRefreshContract(contract);
      const normalizedClient = normalizeSearchValue(contract.clientName);
      const normalizedContract = normalizeSearchValue(contract.contractNumber);
      const compactContract = normalizeContractNumberForSearch(contract.contractNumber);

      const existing = grouped.get(groupKey);
      if (!existing) {
        grouped.set(groupKey, {
          display: contract,
          latest: contract,
          latestSortMs: sortMs,
          latestCreatedMs: createdMs,
          preferRootDisplay,
          endorsementCount: isEndorsement ? 1 : 0,
          hasRefresh,
          searchClientTokens: new Set(
            normalizedClient.length > 0 ? [normalizedClient] : []
          ),
          searchContractTokens: new Set(
            normalizedContract.length > 0 ? [normalizedContract] : []
          ),
          searchContractCompactTokens: new Set(
            compactContract.length > 0 ? [compactContract] : []
          ),
        });
        return;
      }

      if (isEndorsement) existing.endorsementCount += 1;
      if (hasRefresh) existing.hasRefresh = true;
      if (normalizedClient.length > 0) {
        existing.searchClientTokens.add(normalizedClient);
      }
      if (normalizedContract.length > 0) {
        existing.searchContractTokens.add(normalizedContract);
      }
      if (compactContract.length > 0) {
        existing.searchContractCompactTokens.add(compactContract);
      }
      if (preferRootDisplay) {
        existing.preferRootDisplay = true;
      }

      const shouldReplaceLatest =
        sortMs > existing.latestSortMs ||
        (sortMs === existing.latestSortMs &&
          (createdMs > existing.latestCreatedMs ||
            (createdMs === existing.latestCreatedMs &&
              contract.id.localeCompare(existing.latest.id, "cs") > 0)));

      if (shouldReplaceLatest) {
        existing.latest = contract;
        existing.latestSortMs = sortMs;
        existing.latestCreatedMs = createdMs;
      }

      if (existing.preferRootDisplay) {
        if (!isEndorsement) {
          existing.display = contract;
        }
      } else if (shouldReplaceLatest) {
        existing.display = contract;
      }
    });

    return Array.from(grouped.values())
      .map((group): DisplayedContract => {
        const latestPremiumAmount =
          group.endorsementCount > 0
            ? premiumSourceAmountForContract(group.latest)
            : null;
        return {
          ...group.display,
          ...(latestPremiumAmount != null
            ? {
                inputAmount: latestPremiumAmount,
                effectiveInputAmount: latestPremiumAmount,
                paid: group.latest.paid ?? group.display.paid,
              }
            : {}),
          groupedEndorsementCount: group.endorsementCount,
          groupedHasRefresh: group.hasRefresh,
          groupedLatestSortMs: group.latestSortMs,
          groupedLatestCreatedMs: group.latestCreatedMs,
          searchClientTokens: Array.from(group.searchClientTokens),
          searchContractTokens: Array.from(group.searchContractTokens),
          searchContractCompactTokens: Array.from(group.searchContractCompactTokens),
        };
      })
      .sort((a, b) => {
        const da = a.groupedLatestSortMs ?? getContractDate(a)?.getTime() ?? 0;
        const db = b.groupedLatestSortMs ?? getContractDate(b)?.getTime() ?? 0;
        if (db !== da) return db - da;

        const ca = a.groupedLatestCreatedMs ?? toDate((a as any).createdAt)?.getTime() ?? 0;
        const cb = b.groupedLatestCreatedMs ?? toDate((b as any).createdAt)?.getTime() ?? 0;
        if (cb !== ca) return cb - ca;

        return String(b.id ?? "").localeCompare(String(a.id ?? ""), "cs");
      });
  }, [showTeam, canShowTeamToggle, teamContracts, myContracts]);

  const filteredContracts = useMemo(() => filterDisplayedContracts(
    displayedContracts,
    { ...activeListFilters, query: normalizedSearchText },
    showTeam && canShowTeamToggle
  ), [displayedContracts, activeListFilters, normalizedSearchText, showTeam, canShowTeamToggle]);

  const effectiveFilteredContracts = filteredContracts;

  const virtualizedContracts = useMemo(() => {
    const total = effectiveFilteredContracts.length;
    const enabled =
      total > CONTRACT_LIST_WINDOWING_THRESHOLD &&
      contractsWindowMetrics.viewportHeight > 0;

    if (!enabled) {
      return {
        enabled: false,
        topPadding: 0,
        bottomPadding: 0,
        items: effectiveFilteredContracts,
      };
    }

    const rows = total;
    const rowHeight = contractsWindowMetrics.rowHeight;
    const relativeTop = contractsWindowMetrics.scrollY - contractsWindowMetrics.listTop;
    const startRow = Math.max(
      0,
      Math.floor(relativeTop / rowHeight) -
        CONTRACT_LIST_OVERSCAN_ROWS
    );
    const endRow = Math.min(
      rows - 1,
      Math.ceil(
        (relativeTop + contractsWindowMetrics.viewportHeight) /
          rowHeight
      ) + CONTRACT_LIST_OVERSCAN_ROWS
    );

    const startIndex = startRow;
    const endExclusive = Math.min(total, endRow + 1);
    const topPadding = startRow * rowHeight;
    const bottomPadding = Math.max(
      0,
      (rows - endRow - 1) * rowHeight
    );

    return {
      enabled: true,
      topPadding,
      bottomPadding,
      items: effectiveFilteredContracts.slice(startIndex, endExclusive),
    };
  }, [
    effectiveFilteredContracts,
    contractsWindowMetrics,
  ]);

  const listTransitionSignature = useMemo(
    () =>
      JSON.stringify({
        view: showTeam && canShowTeamToggle ? "team" : "mine",
        mode: filterMode,
        unpaidOnly: showUnpaidOnly,
        refreshOnly: showRefreshOnly,
        activeOnly: showActiveOnly,
        stornoOnly: showStornoOnly,
        maturedOnly: showMaturedOnly,
        commissionAuditMode,
        commissionAuditCodeFilter,
        categories: Array.from(selectedCategories).sort(),
        institutions: Array.from(selectedInstitutions).sort(),
        positions: Array.from(selectedPositions).sort(),
        subordinates: Array.from(selectedSubordinates).sort(),
      }),
    [
      showTeam,
      canShowTeamToggle,
      filterMode,
      showUnpaidOnly,
      showRefreshOnly,
      showActiveOnly,
      showStornoOnly,
      showMaturedOnly,
      commissionAuditMode,
      commissionAuditCodeFilter,
      selectedCategories,
      selectedInstitutions,
      selectedPositions,
      selectedSubordinates,
    ]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (lastListTransitionSignatureRef.current == null) {
      lastListTransitionSignatureRef.current = listTransitionSignature;
      return;
    }

    if (lastListTransitionSignatureRef.current === listTransitionSignature) return;
    lastListTransitionSignatureRef.current = listTransitionSignature;

    setListMicroAnimating(true);
    const raf = window.requestAnimationFrame(() => {
      setListMicroAnimating(false);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [listTransitionSignature]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let rafId: number | null = null;
    let rowHeight = CONTRACT_LIST_ESTIMATED_COMPACT_ROW_HEIGHT;
    let listWidth = 0;

    const measureRow = () => {
      const list = contractsListRef.current;
      if (!list) return;
      const heights = Array.from(list.querySelectorAll<HTMLButtonElement>(":scope > button"))
        .slice(0, 12)
        .map((row) => row.getBoundingClientRect().height)
        .filter((height) => height > 0)
        .sort((a, b) => a - b);
      if (heights.length === 0) return;
      const gap = Number.parseFloat(window.getComputedStyle(list).rowGap) || 0;
      rowHeight = heights[Math.floor(heights.length / 2)] + gap;
      listWidth = list.clientWidth;
    };

    const syncMetrics = () => {
      const listTop = contractsListRef.current
        ? contractsListRef.current.getBoundingClientRect().top + window.scrollY
        : 0;
      setContractsWindowMetrics({
        scrollY: window.scrollY,
        viewportHeight: window.innerHeight,
        listTop,
        rowHeight,
      });
    };

    const onWindowChange = () => {
      if (rafId != null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        syncMetrics();
      });
    };

    // Re-measure when the card layout changes, keeping the estimate stable while scrolling.
    const onResize = () => {
      measureRow();
      onWindowChange();
    };
    const resizeObserver = new ResizeObserver(() => {
      if (contractsListRef.current?.clientWidth !== listWidth) onResize();
    });
    if (contractsListRef.current) resizeObserver.observe(contractsListRef.current);
    measureRow();
    syncMetrics();
    window.addEventListener("scroll", onWindowChange, { passive: true });
    window.addEventListener("resize", onResize);

    return () => {
      if (rafId != null) {
        window.cancelAnimationFrame(rafId);
      }
      resizeObserver.disconnect();
      window.removeEventListener("scroll", onWindowChange);
      window.removeEventListener("resize", onResize);
    };
  }, [effectiveFilteredContracts.length, showTeam, filterMode, selectMode, commissionAuditActive]);

  const handleLoadMore = useCallback(async () => {
    if (loadingMore || loading || searchDebouncePending) return;
    if (!user || !normalizedUserEmail) return;
    setLoadingMore(true);
    const requestId = serverFilterRequestRef.current;
    try {
      if (showTeam && canShowTeamToggle) {
        if (!teamHasMore) return;
        await fetchTeamPage(
          teamCursorDate,
          true,
          serverFilterActive ? activeListFilters : undefined,
          requestId
        );
      } else {
        if (!myHasMore) return;
        await fetchMyPage(
          myCursorDate,
          true,
          serverFilterActive ? activeListFilters : undefined,
          requestId
        );
      }
    } catch (e) {
      if ((e as { name?: string } | null)?.name === "AbortError") return;
      if (serverFilterRequestRef.current !== requestId) return;
      const msg = getErrorMessage(e, "Nepodařilo se načíst další smlouvy. Zkus to prosím znovu.");
      if (msg.toLowerCase().includes("síť") || msg.toLowerCase().includes("network")) {
        console.warn("Dočasný výpadek sítě při načítání dalších smluv:", msg);
      } else {
        console.error("Chyba při načítání dalších smluv:", e);
      }
      setLoadError(msg);
    } finally {
      setLoadingMore(false);
    }
  }, [
    loadingMore,
    loading,
    searchDebouncePending,
    normalizedUserEmail,
    user,
    showTeam,
    canShowTeamToggle,
    teamHasMore,
    fetchTeamPage,
    teamCursorDate,
    myHasMore,
    fetchMyPage,
    myCursorDate,
    serverFilterActive,
    activeListFilters,
    setLoadError,
  ]);

  const hasMoreContracts =
    showTeam && canShowTeamToggle ? teamHasMore : myHasMore;

  const hasMoreActive =
    showTeam && canShowTeamToggle ? teamHasMore : myHasMore;
  const isAnniversaryLoading =
    anniversaryModeActive &&
    effectiveFilteredContracts.length === 0 &&
    (loading || isFilterPending || loadingMore);
  const isSearchBusy = (hasImmediateSearchQuery || hasSearchQuery) &&
    (searchDebouncePending || loading || loadingMore || isFilterPending);
  const isSearchLoading = isSearchBusy && effectiveFilteredContracts.length === 0;
  const isFilteredListLoading =
    serverFilterActive &&
    effectiveFilteredContracts.length === 0 &&
    (loading || loadingMore || isFilterPending);
  const isCommissionAuditFilterLoading =
    commissionAuditActive &&
    (commissionAuditFilterPending || loading || isFilterPending);
  const persistContractsViewState = useCallback(() => {
    if (!normalizedUserEmail) return;
    writeContractsViewState(normalizedUserEmail, {
      showTeam,
      filterMode,
      searchText,
      showUnpaidOnly,
      showRefreshOnly,
      showActiveOnly,
      showStornoOnly,
      showMaturedOnly,
      commissionAuditMode,
      commissionAuditCodeFilter,
      selectedCategories: Array.from(selectedCategories),
      selectedInstitutions: Array.from(selectedInstitutions),
      selectedPositions: Array.from(selectedPositions),
      selectedSubordinates: Array.from(selectedSubordinates),
      scrollY: typeof window !== "undefined" ? window.scrollY : 0,
    });
  }, [
    normalizedUserEmail,
    showTeam,
    filterMode,
    searchText,
    showUnpaidOnly,
    showRefreshOnly,
    showActiveOnly,
    showStornoOnly,
    showMaturedOnly,
    commissionAuditMode,
    commissionAuditCodeFilter,
    selectedCategories,
    selectedInstitutions,
    selectedPositions,
    selectedSubordinates,
  ]);

  const closeContractDetailWindow = useCallback(() => {
    setContractDetailWindow(null);
  }, []);

  const openContractDetailWindow = useCallback(
    (contract: ContractDoc, slug: string, options?: { edit?: boolean }) => {
      persistContractsViewState();
      const pageHref = `/smlouvy/${slug}?from=list${options?.edit ? "&edit=1" : ""}`;
      const contractNumber = contract.contractNumber?.trim();
      const title = contractNumber ? `Smlouva ${contractNumber}` : "Detail smlouvy";

      setContractDetailWindow({
        href: `${pageHref}&embedded=1`,
        pageHref,
        title,
      });
    },
    [persistContractsViewState]
  );

  const openContractContextMenu = useCallback(
    (
      event: ReactMouseEvent<HTMLButtonElement>,
      contract: ContractDoc,
      slug: string
    ) => {
      event.preventDefault();
      event.stopPropagation();

      const menuWidth = 240;
      const menuHeight = 152;
      const viewportMargin = 12;
      const maxX = Math.max(viewportMargin, window.innerWidth - menuWidth - viewportMargin);
      const maxY = Math.max(viewportMargin, window.innerHeight - menuHeight - viewportMargin);

      setContractContextMenu({
        contract,
        slug,
        x: Math.max(viewportMargin, Math.min(event.clientX, maxX)),
        y: Math.max(viewportMargin, Math.min(event.clientY, maxY)),
      });
    },
    []
  );

  const showContractActionToast = useCallback(
    (message: string, tone: ContractActionToastState["tone"]) => {
      if (contractActionToastTimerRef.current != null) {
        window.clearTimeout(contractActionToastTimerRef.current);
      }
      setContractActionToast({ message, tone });
      contractActionToastTimerRef.current = window.setTimeout(() => {
        setContractActionToast(null);
        contractActionToastTimerRef.current = null;
      }, 2600);
    },
    []
  );

  const copyContractNumber = useCallback(
    async (contractNumber?: string | null) => {
      const value = contractNumber?.trim();
      setContractContextMenu(null);

      if (!value) {
        showContractActionToast("Smlouva nemá uvedené číslo.", "error");
        return;
      }

      try {
        await navigator.clipboard.writeText(value);
        showContractActionToast(`Číslo smlouvy ${value} je zkopírované.`, "success");
      } catch {
        showContractActionToast("Číslo smlouvy se nepodařilo zkopírovat.", "error");
      }
    },
    [showContractActionToast]
  );

  useEffect(() => {
    if (!contractDetailWindow) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeContractDetailWindow();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeContractDetailWindow, contractDetailWindow]);

  useEffect(() => {
    if (!contractContextMenu) return;

    const closeMenu = () => setContractContextMenu(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };

    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [contractContextMenu]);

  useEffect(
    () => () => {
      if (contractActionToastTimerRef.current != null) {
        window.clearTimeout(contractActionToastTimerRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (!shouldRestoreView) return;
    if (!normalizedUserEmail) return;
    const saved = readContractsViewState(normalizedUserEmail);
    if (!saved) return;

    const restoredSubordinates = new Set(saved.selectedSubordinates);
    setShowTeam(saved.showTeam || restoredSubordinates.size > 0);
    setFilterMode(saved.filterMode);
    setSearchText(saved.searchText);
    setShowUnpaidOnly(saved.showUnpaidOnly);
    setShowRefreshOnly(saved.showRefreshOnly);
    setShowActiveOnly(saved.showActiveOnly);
    setShowStornoOnly(saved.showStornoOnly);
    setShowMaturedOnly(saved.showMaturedOnly);
    setCommissionAuditMode(saved.commissionAuditMode);
    setCommissionAuditCodeFilter(saved.commissionAuditCodeFilter);
    setSelectedCategories(new Set(saved.selectedCategories));
    setSelectedInstitutions(new Set(saved.selectedInstitutions));
    setSelectedPositions(new Set(saved.selectedPositions));
    setSelectedSubordinates(restoredSubordinates);
    pendingScrollRestoreRef.current = saved.scrollY;
  }, [shouldRestoreView, normalizedUserEmail]);

  useEffect(() => {
    if (pendingScrollRestoreRef.current == null) return;
    if (loading) return;
    const targetY = pendingScrollRestoreRef.current;
    const raf = window.requestAnimationFrame(() => {
      window.scrollTo(0, targetY);
      const reached = window.scrollY >= targetY - 8;
      const atBottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 8;
      if (reached || (atBottom && !hasMoreActive && !loadingMore)) {
        pendingScrollRestoreRef.current = null;
      }
    });
    return () => window.cancelAnimationFrame(raf);
  }, [loading, loadingMore, hasMoreActive, effectiveFilteredContracts.length]);

  useEffect(() => {
    setSelectedKeys(new Set());
    setSelectMode(false);
  }, [
    filterMode,
    searchText,
    showTeam,
    showUnpaidOnly,
    showRefreshOnly,
    showActiveOnly,
    showStornoOnly,
    showMaturedOnly,
    commissionAuditMode,
    commissionAuditCodeFilter,
    selectedCategoryList,
    selectedInstitutionList,
    selectedPositionList,
    selectedSubordinateList,
  ]);

  useEffect(() => {
    persistContractsViewState();
  }, [persistContractsViewState]);

  const hasTeamContracts =
    teamContracts.length > 0 && canShowTeamToggle;
  const currentFilterSelection = { ...activeListFilters,
    selectedSubordinates: showTeam && canShowTeamToggle ? selectedSubordinateList : [],
  };
  const advancedFilterCount = contractFilterCount(currentFilterSelection);

  const toggleSelect = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedKeys(new Set());
    setSelectMode(false);
    setTransferModalOpen(false);
    setTransferTargetEmail("");
    setTransferTargetQuery("");
    setTransferTargetSearchOpen(false);
    setTransferEffectiveDate(localIsoDay());
  };

  const selectedOwnerEmails = new Set(
    Array.from(selectedKeys)
      .map((key) => normalizeEmail(key.split("___")[0] ?? ""))
      .filter(Boolean)
  );
  const eligibleTransferTargets = transferTargets.filter(
    (target) =>
      Array.from(selectedOwnerEmails).some(
        (ownerEmail) => ownerEmail !== target.email
      )
  );
  const normalizedTransferTargetQuery = normalizeSearchValue(transferTargetQuery);
  const matchingTransferTargets = eligibleTransferTargets
    .filter((target) => {
      if (!normalizedTransferTargetQuery) return true;
      return normalizeSearchValue(
        `${adviserLabelForEmail(target.email, target.name)} ${target.email}`
      ).includes(normalizedTransferTargetQuery);
    })
    .slice(0, 8);

  const handleBulkDelete = async () => {
    if (selectedKeys.size === 0) return;
    if (!user) return;
    const confirmed = window.confirm(
      "Opravdu chceš smazat vybrané smlouvy? Tuto akci nelze vrátit."
    );
    if (!confirmed) return;

    setBulkDeleting(true);
    setBulkError(null);
    setBulkSuccess(null);

    try {
      const entries = Array.from(selectedKeys)
        .map((key) => {
          const [ownerEmail, entryId] = key.split("___");
          return { ownerEmail, entryId };
        })
        .filter((e) => e.ownerEmail && e.entryId);

      const token = await user.getIdToken();
      const res = await fetch("/api/contracts/bulk-delete", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ entries }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as any;
        throw new Error(data?.error || "Chyba při mazání.");
      }

      setMyContracts((prev) =>
        prev.filter(
          (c) =>
            !selectedKeys.has(
              `${(c.userEmail ?? (c as any).adviserEmail ?? "").toLowerCase()}___${c.id}`
            )
        )
      );
      setTeamContracts((prev) =>
        prev.filter(
          (c) =>
            !selectedKeys.has(
              `${(c.userEmail ?? (c as any).adviserEmail ?? "").toLowerCase()}___${c.id}`
            )
        )
      );

      clearSelection();
    } catch (e) {
      console.error("Chyba při hromadném mazání", e);
      setBulkError("Nepodařilo se smazat všechny smlouvy. Zkus to prosím znovu.");
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleBulkMarkPaid = async () => {
    if (selectedKeys.size === 0) return;
    if (!user) return;
    setBulkMarking(true);
    setBulkError(null);
    setBulkSuccess(null);

    try {
      const entries = Array.from(selectedKeys)
        .map((key) => {
          const [ownerEmail, entryId] = key.split("___");
          return { ownerEmail, entryId };
        })
        .filter((e) => e.ownerEmail && e.entryId);

      const token = await user.getIdToken();
      const res = await fetch("/api/contracts/set-paid", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ entries, paid: true }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as any;
        throw new Error(data?.error || "Chyba při ukládání.");
      }

      setMyContracts((prev) =>
        prev.map((c) => {
          const k = `${(c.userEmail ?? (c as any).adviserEmail ?? "").toLowerCase()}___${c.id}`;
          if (selectedKeys.has(k)) {
            return { ...c, paid: true };
          }
          return c;
        })
      );
      setTeamContracts((prev) =>
        prev.map((c) => {
          const k = `${(c.userEmail ?? (c as any).adviserEmail ?? "").toLowerCase()}___${c.id}`;
          if (selectedKeys.has(k)) {
            return { ...c, paid: true };
          }
          return c;
        })
      );
      clearSelection();
    } catch (e) {
      console.error("Chyba při hromadném označení zaplaceno", e);
      setBulkError("Nepodařilo se označit vybrané smlouvy jako zaplacené. Zkus to prosím znovu.");
    } finally {
      setBulkMarking(false);
    }
  };

  const handleBulkTransfer = async () => {
    if (
      selectedKeys.size === 0 ||
      !transferTargetEmail ||
      !transferEffectiveDate ||
      !user
    ) return;
    setBulkTransferring(true);
    setBulkError(null);
    setBulkSuccess(null);

    try {
      const entries = Array.from(selectedKeys)
        .map((key) => {
          const [ownerEmail, entryId] = key.split("___");
          return { ownerEmail, entryId };
        })
        .filter((entry) => entry.ownerEmail && entry.entryId);
      const token = await user.getIdToken();
      const res = await fetch("/api/contracts/transfer", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          requestAction: "submit",
          entries,
          toOwnerEmail: transferTargetEmail,
          effectiveDate: transferEffectiveDate,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        requested?: boolean;
        requestId?: string;
        contractCount?: number;
        effectiveDate?: string;
      };
      if (!res.ok || payload.ok === false) {
        throw new Error(payload.error || "Žádost o převod smluv se nepodařilo odeslat.");
      }

      const requestedContracts = Number(payload.contractCount ?? 0);
      const target = transferTargets.find(
        (candidate) => candidate.email === transferTargetEmail
      );
      const targetLabel = adviserLabelForEmail(
        transferTargetEmail,
        target?.name ?? null
      );
      clearSelection();
      setBulkSuccess(
        `Žádost o převod ${requestedContracts || entries.length} ${
          requestedContracts === 1 ? "smlouvy" : "smluv"
        } na správce ${targetLabel} k ${new Date(
          `${transferEffectiveDate}T12:00:00`
        ).toLocaleDateString("cs-CZ")} byla odeslána administrátorovi.`
      );
    } catch (error) {
      console.error("Chyba při odesílání žádosti o převod smluv", error);
      setBulkError(
        error instanceof Error && error.message
          ? error.message
          : "Žádost o převod smluv se nepodařilo odeslat. Zkus to prosím znovu."
      );
    } finally {
      setBulkTransferring(false);
    }
  };

  const activePurpleButtonClass =
    "border-transparent bg-violet-700 text-white shadow-[0_8px_18px_rgba(109,40,217,0.24)] [&_*]:!text-white";

  return (
    <AppLayout active="contracts">
      <div className="min-h-screen w-full bg-slate-50 px-3 py-6 sm:px-4 sm:py-8 lg:px-8">
        <div className="mx-auto w-full max-w-6xl space-y-6 font-mono text-slate-900">
          {/* SEARCH BAR + FILTER + BULK ACTIONS */}
          <div className="sticky top-16 z-40 space-y-2 rounded-[22px] border border-slate-200/85 bg-white/96 p-3 shadow-[0_14px_30px_rgba(15,23,42,0.08)] backdrop-blur supports-[backdrop-filter]:bg-white/90 lg:top-2">
            <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:gap-3">
              <div className="min-w-0 xl:w-[340px] 2xl:w-[360px]">
                <div className="flex h-10 w-full items-center gap-2 rounded-[16px] border border-slate-200 bg-slate-50/85 px-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] transition focus-within:border-slate-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-slate-900/8">
                    <Search size={17} strokeWidth={2.2} className="shrink-0 text-slate-400" aria-hidden="true" />
                    <input
                      type="text"
                      aria-label="Hledat klienta nebo číslo smlouvy"
                      maxLength={120}
                      autoComplete="off"
                      enterKeyHint="search"
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      onKeyDown={(event) => {
                        if (event.nativeEvent.isComposing) return;
                        if (event.key === "Enter") setDebouncedSearchText(normalizedSearchText);
                        if (event.key === "Escape") { setSearchText(""); setDebouncedSearchText(""); }
                      }}
                      placeholder="Hledat klienta nebo smlouvu"
                      className="min-w-0 flex-1 border-none bg-transparent text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400"
                    />
                    {isSearchBusy && (
                      <span role="status" aria-label="Vyhledávám smlouvy" className="inline-flex shrink-0">
                        <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-violet-200 border-t-violet-700 motion-reduce:animate-none" />
                      </span>
                    )}
                    {searchText.length > 0 && (
                      <button
                        type="button"
                        aria-label="Vymazat hledání"
                        title="Vymazat hledání"
                        onClick={(event) => {
                          setSearchText(""); setDebouncedSearchText("");
                          event.currentTarget.parentElement?.querySelector("input")?.focus();
                        }}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-violet-50 hover:text-violet-700 focus-visible:outline-2 focus-visible:outline-violet-500"
                      ><X size={15} aria-hidden="true" /></button>
                    )}
                </div>
              </div>

              <div className="-mx-1 min-w-0 overflow-x-auto px-1 pb-0.5 xl:mx-0 xl:flex-1 xl:overflow-visible xl:px-0 xl:pb-0">
                <div className="flex min-w-max items-center gap-2 xl:min-w-0 xl:justify-between">
                  <div className="flex items-center gap-2">
                    {canShowTeamToggle && (
                      <div
                        className="inline-flex h-10 items-center gap-1 rounded-[16px] border border-slate-200 bg-slate-100/75 p-1"
                        aria-label="Rozsah smluv"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setShowTeam(false);
                            setSelectedSubordinates(new Set());
    setSelectedPositions(new Set());
    setAvailablePositions([]);
    setFilterModalOpen(false);
                          }}
                          className={`ui-focus inline-flex h-8 items-center gap-1.5 rounded-[14px] border px-3 text-xs font-bold transition ${
                            !showTeam
                              ? activePurpleButtonClass
                              : "border-transparent text-slate-600 hover:bg-white hover:text-slate-950"
                          }`}
                        >
                          <UserRound size={14} strokeWidth={2} className="shrink-0" aria-hidden="true" />
                          <span>Vlastní</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowTeam(true)}
                          className={`ui-focus inline-flex h-8 items-center gap-1.5 rounded-[14px] border px-3 text-xs font-bold transition ${
                            showTeam
                              ? activePurpleButtonClass
                              : "border-transparent text-slate-600 hover:bg-white hover:text-slate-950"
                          }`}
                        >
                          <UsersRound size={14} strokeWidth={2} className="shrink-0" aria-hidden="true" />
                          <span>Tým</span>
                        </button>
                      </div>
                    )}

                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setFilterModalOpen(true)}
                      className="ui-focus inline-flex h-10 items-center gap-1.5 rounded-[16px] border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800 transition hover:border-slate-500 hover:bg-slate-50"
                    >
                      <SlidersHorizontal size={14} strokeWidth={2} className="shrink-0" aria-hidden="true" />
                      <span>Filtr</span>
                      {advancedFilterCount > 0 ? (
                        <span className="ml-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-violet-700 px-1.5 text-[10px] font-black leading-5 text-white">
                          {advancedFilterCount}
                        </span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (selectMode) {
                          clearSelection();
                        } else {
                          setSelectMode(true);
                        }
                      }}
                        className={`ui-focus inline-flex h-10 items-center rounded-[16px] border px-3 text-xs font-bold transition ${
                          selectMode
                          ? "border-violet-700 bg-violet-700 text-white shadow-[0_10px_22px_rgba(109,40,217,0.22)] hover:bg-violet-800 [&_*]:!text-white"
                          : "border-emerald-700 bg-emerald-600 !text-white shadow-[0_10px_22px_rgba(5,150,105,0.2)] hover:bg-emerald-700"
                      }`}
                    >
                      {selectMode ? "Zrušit výběr" : "Hromadný výběr"}
                    </button>
                  </div>
                </div>
              </div>
            </div>

          {selectMode && (
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-200/85 pt-2">
              <span className="text-xs font-semibold text-slate-600">
                Vybráno: {selectedKeys.size}
              </span>
              {canTransferContracts ? (
                <button
                  type="button"
                  disabled={
                    selectedKeys.size === 0 ||
                    bulkTransferring ||
                    eligibleTransferTargets.length === 0
                  }
                  onClick={() => {
                    setTransferTargetEmail("");
                    setTransferTargetQuery("");
                    setTransferTargetSearchOpen(false);
                    setTransferEffectiveDate(localIsoDay());
                    setBulkError(null);
                    setTransferModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-violet-700 bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  <ArrowRightLeft size={13} strokeWidth={2.4} aria-hidden="true" />
                  {selectedKeys.size === 0
                    ? "Požádat o převod"
                    : `Požádat o převod (${selectedKeys.size})`}
                </button>
              ) : null}
              <button
                type="button"
                disabled={selectedKeys.size === 0 || bulkDeleting}
                onClick={handleBulkDelete}
                className="rounded-full border border-rose-600 bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                {bulkDeleting
                  ? "Mažu…"
                  : selectedKeys.size === 0
                  ? "Smazat"
                  : `Smazat (${selectedKeys.size})`}
              </button>
              <button
                type="button"
                disabled={selectedKeys.size === 0 || bulkMarking}
                onClick={handleBulkMarkPaid}
                className="rounded-full border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                {bulkMarking
                  ? "Ukládám…"
                  : selectedKeys.size === 0
                  ? "Označit zaplaceno"
                  : `Zaplaceno (${selectedKeys.size})`}
              </button>
            </div>
          )}
        </div>

        {/* LIST SMLOUV */}
        <div
          className={`transition-[opacity,transform] duration-300 ease-out will-change-transform ${
            listMicroAnimating
              ? "translate-y-2 opacity-0"
              : "translate-y-0 opacity-100"
          }`}
        >
          {loadError && (
            <div className="rounded-2xl border border-rose-500 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {loadError}
            </div>
          )}
          {isCommissionAuditFilterLoading ? (
            <div className="ui-card ui-card-quiet mt-4 space-y-2 rounded-2xl bg-white px-6 py-8 text-center text-sm text-slate-700">
              <div className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-amber-200 border-t-amber-600" />
              <p className="font-medium">Načítám provizní filtr…</p>
              <p className="text-xs text-slate-500">
                Kontroluji očekávané kódy provizí proti zapsaným výpisům.
              </p>
            </div>
          ) : loading && !serverFilterActive ? (
            <p className="mt-4 text-sm text-slate-600">
              Načítám smlouvy…
            </p>
          ) : isAnniversaryLoading && effectiveFilteredContracts.length === 0 ? (
            <div className="ui-card ui-card-quiet mt-4 space-y-2 rounded-2xl bg-white px-6 py-8 text-center text-sm text-slate-700">
              <div className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
              <p className="font-medium">Vyhledávám blížící se výročí…</p>
              <p className="text-xs text-slate-500">
                Načítám filtrovaný seznam ze serveru.
              </p>
            </div>
          ) : isSearchLoading ? (
            <div className="ui-card ui-card-quiet mt-4 space-y-2 rounded-2xl bg-white px-6 py-8 text-center text-sm text-slate-700">
              <div className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
              <p className="font-medium">Vyhledávám smlouvu…</p>
              <p className="text-xs text-slate-500">
                Vyhledávám podle filtrů na serveru.
              </p>
            </div>
          ) : isFilteredListLoading ? (
            <div className="ui-card ui-card-quiet mt-4 space-y-2 rounded-2xl bg-white px-6 py-8 text-center text-sm text-slate-700">
              <div className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
              <p className="font-medium">Načítám filtrované smlouvy…</p>
              <p className="text-xs text-slate-500">
                Filtry se vyhodnocují na serveru.
              </p>
            </div>
          ) : effectiveFilteredContracts.length === 0 ? (
            <div className="ui-card ui-card-quiet mt-4 space-y-2 rounded-2xl bg-white px-6 py-8 text-center text-sm text-slate-700">
              {anniversaryModeActive ? (
                <>
                  <p className="font-medium">Žádná blížící se výročí</p>
                  <p className="text-xs text-slate-500">
                    V okně 90 dní a méně od dneška není žádné výročí (počítáno z data
                    počátku smlouvy, případně podpisu).
                  </p>
                </>
              ) : showUnpaidOnly ? (
                <>
                  <p className="font-medium">Žádné nezaplacené smlouvy</p>
                  <p className="text-xs text-slate-500">
                    V aktuálním výběru nejsou žádné smlouvy se stavem nezaplaceno.
                  </p>
                </>
              ) : showRefreshOnly ? (
                <>
                  <p className="font-medium">Žádné navazující smlouvy</p>
                  <p className="text-xs text-slate-500">
                    V aktuálním výběru nejsou žádné smlouvy označené jako Refresh nebo Náhrada.
                  </p>
                </>
              ) : showActiveOnly ? (
                <>
                  <p className="font-medium">Žádné aktivní smlouvy</p>
                  <p className="text-xs text-slate-500">
                    V aktuálním výběru nejsou žádné smlouvy mimo stav storno nebo dožitá.
                  </p>
                </>
              ) : showStornoOnly || showMaturedOnly ? (
                <>
                  <p className="font-medium">Žádné smlouvy v tomto stavu</p>
                  <p className="text-xs text-slate-500">
                    {showStornoOnly && showMaturedOnly
                      ? "V aktuálním výběru nejsou žádné dožité ani stornované smlouvy."
                      : showStornoOnly
                        ? "V aktuálním výběru nejsou žádné stornované smlouvy."
                        : "V aktuálním výběru nejsou žádné dožité smlouvy."}
                  </p>
                </>
              ) : commissionAuditActive ? (
                <>
                  <p className="font-medium">Žádné provize ke kontrole</p>
                  <p className="text-xs text-slate-500">
                    V aktuálním výběru nejsou žádné smlouvy odpovídající proviznímu filtru.
                  </p>
                </>
              ) : searchText.trim() !== "" ? (
                <>
                  <p className="font-medium">Nic nenalezeno</p>
                  <p className="text-xs text-slate-500">
                    Zkus upravit hledaný text (klient nebo číslo smlouvy).
                  </p>
                  {!showTeam && canShowTeamToggle && (
                    <p className="text-xs text-slate-500">
                      Pokud smlouvu sjednal někdo z týmu, přepni nahoře na
                      týmové smlouvy.
                    </p>
                  )}
                </>
              ) : showTeam && hasTeamContracts ? (
                <>
                  <p className="font-medium">Žádné týmové smlouvy</p>
                  <p className="text-xs text-slate-500">
                    Až podřízení něco vypočítají a označí jako sepsané,
                    uvidíš je tady.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium">
                    Žádné smlouvy zatím nejsou.
                  </p>
                  <p className="text-xs text-slate-500">
                    Až něco vypočítáš v kalkulačce a označíš jako sepsané,
                    objeví se zde.
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className={`${cardStyles.list} mt-4 space-y-3`}>
              {serverFilterActive && loadingMore && (
                <div className="ui-card ui-card-quiet flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-xs text-slate-700">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
                  <span>Načítám další filtrované smlouvy…</span>
                </div>
              )}
              {bulkError && (
                <div className="rounded-2xl border border-rose-500 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {bulkError}
                </div>
              )}
              {bulkSuccess && (
                <div className="rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                  {bulkSuccess}
                </div>
              )}
              <div className={cardStyles.columns} aria-hidden="true">
                <span>Klient / smlouva</span>
                <span>Sjednáno</span>
                <span>Pojistné</span>
                <span>Stav</span>
                <span />
              </div>
              <div
                ref={contractsListRef}
                className="grid grid-cols-1 gap-2"
              >
              {virtualizedContracts.enabled &&
                virtualizedContracts.topPadding > 0 && (
                  <div
                    aria-hidden="true"
                    style={{ height: virtualizedContracts.topPadding }}
                  />
                )}
              {virtualizedContracts.items.map((c: any) => {
                const signed =
                  toDate((c as any).contractSignedDate) ??
                  toDate(c.createdAt);
                const signedStr = signed
                  ? signed.toLocaleDateString("cs-CZ")
                  : "—";
                const policyStart = getAnniversaryStartDate(c);
                const anniversaryInfo = shouldTrackAnniversary(
                  c.productKey as Product | undefined
                ) &&
                  !isContractStorno(c as ContractDoc) &&
                  !isContractDozita(c as ContractDoc)
                  ? isAnniversarySoon(policyStart)
                  : { soon: false };

                const ownerEmailRaw =
                  (showTeam && c.adviserEmail) ||
                  c.userEmail ||
                  "";
                const ownerEmail = ownerEmailRaw.toLowerCase();

                const slug = `${ownerEmail}___${c.id}`;
                const selectionKey = `${ownerEmail}___${c.id}`;
                const isSelected = selectedKeys.has(selectionKey);

                const adviserName =
                  showTeam && ownerEmail
                    ? cleanDisplayName(c.adviserName) || adviserNameFromEmail(ownerEmail)
                    : "";
                const inherited = isInheritedContract(c);
                const premiumDisplay = premiumDisplayForContract(c as ContractDoc);
                const isEndorsement = c.entryType === "endorsement";
                const hasOriginalReplacement = isRefreshContract(c as ContractDoc);
                const originalReplacementBadgeLabel = originalReplacementLabel(
                  (c as ContractDoc).productKey
                );
                const premiumDelta = endorsementDeltaAmount(c as ContractDoc);
                const lifecycleStatus = contractLifecycleStatus(c as ContractDoc);
                const isStorno = lifecycleStatus === "storno";
                const isDozita = lifecycleStatus === "dozita";
                const groupedEndorsementCount = Number(
                  (c as ContractDoc).groupedEndorsementCount ?? 0
                );
                const institutionLabel = institutionLabelForProduct(
                  c.productKey as Product | undefined
                );
                const displayProductName = productCardLabel(
                  c.productKey as Product | undefined
                );
                const statusBadge = contractStatusBadgeMeta({
                  isStorno,
                  isDozita,
                  paid: c.paid,
                });
                const commissionAuditSummary =
                  commissionAuditActive
                    ? commissionAuditSummaryForContract(c as ContractDoc, {
                        mode: commissionAuditMode,
                        codeFilter: commissionAuditCodeFilter,
                        viewerEmail: ownerEmail,
                      })
                    : null;
                const primaryCommissionAuditItem =
                  commissionAuditSummary?.items[0] ?? null;
                const commissionAuditTone = primaryCommissionAuditItem
                  ? commissionAuditToneClasses(primaryCommissionAuditItem)
                  : null;
                  const CompactContent = (
                    <article
                      className={cardStyles.card}
                      data-selected={isSelected}
                      data-selection-mode={selectMode}
                    >
                      <div className={cardStyles.grid}>
                        <div className={cardStyles.identity}>
                          {selectMode ? (
                            <span className={cardStyles.selection} aria-hidden="true">
                              <Check size={13} strokeWidth={2.5} />
                            </span>
                          ) : null}
                          <ContractInstitutionLogo
                            product={c.productKey as Product | undefined}
                          />
                          <div className={cardStyles.identityText}>
                            <div className={cardStyles.client} title={c.clientName || "Klient neuveden"}>
                              {c.clientName || "Klient neuveden"}
                            </div>
                            <div className={cardStyles.product}>
                              <ContractCategoryIcon
                                product={c.productKey as Product | undefined}
                              />
                              <span
                                className={cardStyles.productName}
                                title={[institutionLabel, displayProductName].filter(Boolean).join(" · ")}
                              >
                                {institutionLabel ? <>{institutionLabel} · </> : null}
                                {displayProductName}
                              </span>
                            </div>
                            <div className={cardStyles.metadata}>
                              <span className={cardStyles.number} title={`Číslo smlouvy: ${c.contractNumber ?? "—"}`}>
                                č. {c.contractNumber ?? "—"}
                              </span>
                              {inherited ? (
                                <span className={cardStyles.tag}>Převzatá</span>
                              ) : null}
                              {isEndorsement ? (
                                <span className={cardStyles.tag} data-tone="neutral">Dodatek</span>
                              ) : null}
                              {hasOriginalReplacement ? (
                                <span className={cardStyles.tag}>{originalReplacementBadgeLabel}</span>
                              ) : null}
                              {groupedEndorsementCount > 0 ? (
                                <span className={cardStyles.tag} data-tone="neutral">
                                  {groupedEndorsementCount}× změna
                                </span>
                              ) : null}
                              {adviserName ? (
                                <span className={cardStyles.adviser} title={`Poradce: ${adviserName}`}>
                                  {adviserName}
                                </span>
                              ) : null}
                              {anniversaryInfo.soon ? (
                                <span className={cardStyles.anniversary}>
                                  {anniversaryInfo.daysLeft != null
                                    ? `${
                                        anniversaryInfo.anniversaryNumber
                                          ? `${anniversaryInfo.anniversaryNumber}. výročí`
                                          : "Výročí"
                                      } za ${formatDaysLeft(anniversaryInfo.daysLeft)}`
                                    : "Blížící se výročí"}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        <div className={cardStyles.date}>
                          <CalendarDays size={12} strokeWidth={1.8} aria-hidden="true" />
                          <span className="sr-only">Sjednáno </span>
                          <span>{signedStr}</span>
                        </div>

                        <div className={cardStyles.premium}>
                          <span className="sr-only">Pojistné </span>
                          <div className={cardStyles.amount}>
                            {formatMoney(premiumDisplay.amount)}
                          </div>
                          <div className={cardStyles.cadence}>
                            {premiumDisplay.cadenceLabel ?? "Částka"}
                          </div>
                          {isEndorsement && premiumDelta != null ? (
                            <div
                              className={`text-[11px] font-medium ${
                                premiumDelta >= 0 ? "text-emerald-700" : "text-rose-700"
                              }`}
                            >
                              {premiumDelta >= 0 ? "+" : "−"}
                              {formatMoney(Math.abs(premiumDelta))}
                            </div>
                          ) : null}
                        </div>

                        <div className={cardStyles.status}>
                          <span className={`${cardStyles.statusBadge} ${statusBadge.compactClass}`}>
                            <span
                              className={`${cardStyles.statusDot} ${statusBadge.compactDotClass}`}
                              aria-hidden="true"
                            />
                            {statusBadge.label}
                          </span>
                        </div>

                        {!selectMode ? (
                          <span className={cardStyles.action} title="Otevřít detail smlouvy">
                            <ArrowUpRight size={17} strokeWidth={1.8} aria-hidden="true" />
                            <span className="sr-only">Detail smlouvy</span>
                          </span>
                        ) : null}

                        {primaryCommissionAuditItem && commissionAuditTone ? (
                          <div
                            className={`${cardStyles.audit} flex min-w-0 items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium leading-snug ${commissionAuditTone.compact}`}
                            title={`${commissionAuditCompactLabel(primaryCommissionAuditItem)} · ${commissionAuditTimingLabel(primaryCommissionAuditItem)} · ${formatCommissionAuditDate(
                              primaryCommissionAuditItem.expectedDateMs
                            )}`}
                          >
                            <Clock size={12} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden="true" />
                            <span className="min-w-0 flex-1 whitespace-normal break-words">
                              <span>{commissionAuditCompactLabel(primaryCommissionAuditItem)}</span>
                              <span className="mx-1">·</span>
                              <span>{commissionAuditTimingLabel(primaryCommissionAuditItem)}</span>
                              {commissionAuditSummary && commissionAuditSummary.items.length > 1 ? (
                                <span> · +{commissionAuditSummary.items.length - 1}</span>
                              ) : null}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </article>
                  );

              return selectMode ? (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleSelect(selectionKey)}
                  aria-pressed={isSelected}
                  onContextMenu={(event) =>
                    openContractContextMenu(event, c as ContractDoc, slug)
                  }
                  className={cardStyles.cardButton}
                >
                  {CompactContent}
                </button>
              ) : (
                <button
                  key={c.id}
                  type="button"
                  onClick={() =>
                    openContractDetailWindow(c as ContractDoc, slug)
                  }
                  onContextMenu={(event) =>
                    openContractContextMenu(event, c as ContractDoc, slug)
                  }
                  className={cardStyles.cardButton}
                >
                  {CompactContent}
                </button>
              );
              })}
              {virtualizedContracts.enabled &&
                virtualizedContracts.bottomPadding > 0 && (
                  <div
                    aria-hidden="true"
                    style={{ height: virtualizedContracts.bottomPadding }}
                  />
                )}
              </div>
              {hasMoreContracts && !loading && (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-sm text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loadingMore ? "Načítám…" : "Načíst další smlouvy"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {!loading && !hasTeamContracts && canShowTeamToggle && (
          <p className="pt-1 text-[11px] text-slate-500">
            Zatím tu nejsou žádní podřízení vázaní na tvůj účet
            (kolekce <code>users</code>, pole{" "}
            <code>managerEmail</code>). Jakmile je doplníme, uvidíš
            tady i týmové smlouvy a meziprovize.
          </p>
        )}
      </div>

      {filterModalOpen && (
        <ContractFiltersDialog
          value={currentFilterSelection}
          advisers={subordinateFilterOptions}
          availablePositions={availablePositions}
          canShowTeam={canShowTeamToggle}
          onClose={() => setFilterModalOpen(false)}
          onApply={(next) => {
            setFilterModalOpen(false);
            if (next.commissionAuditMode !== "off") setCommissionAuditFilterPending(true);
            startFilterTransition(() => {
              setFilterMode(next.filterMode);
              setShowUnpaidOnly(next.showUnpaidOnly);
              setShowRefreshOnly(next.showRefreshOnly);
              setShowActiveOnly(next.showActiveOnly);
              setShowStornoOnly(next.showStornoOnly);
              setShowMaturedOnly(next.showMaturedOnly);
              setCommissionAuditMode(next.commissionAuditMode);
              setCommissionAuditCodeFilter(next.commissionAuditCodeFilter);
              setSelectedCategories(new Set(next.selectedCategories));
              setSelectedInstitutions(new Set(next.selectedInstitutions));
              setSelectedPositions(new Set(next.selectedPositions));
              setSelectedSubordinates(new Set(next.selectedSubordinates));
              if (next.selectedSubordinates.length > 0) setShowTeam(true);
            });
          }}
        />
      )}
      {transferModalOpen ? (
        <div
          className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="contract-transfer-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !bulkTransferring) {
              setTransferModalOpen(false);
            }
          }}
        >
          <div className="w-full max-w-lg overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_32px_84px_rgba(2,6,23,0.36)]">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 id="contract-transfer-title" className="text-lg font-black text-slate-950">
                  Požádat o převod smluv
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Vybráno {selectedKeys.size}. Hlavní smlouva bude převedena společně se všemi dodatky.
                </p>
              </div>
              <button
                type="button"
                disabled={bulkTransferring}
                onClick={() => setTransferModalOpen(false)}
                className="ui-focus inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                aria-label="Zavřít převod smluv"
              >
                <X size={17} strokeWidth={2.4} aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <div className="rounded-[20px] border border-violet-200 bg-violet-50 px-4 py-3 text-sm leading-relaxed text-violet-950">
                Žádost nejprve schválí administrátor. Od zvoleného data bude nový správce čerpat dosud nevyplacené a budoucí provize na pozici původního sjednatele. Již vyplacené provize se nemění.
              </div>

              <div className="relative">
                <label htmlFor="contract-transfer-target" className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                  Nový správce
                </label>
                <div className="relative">
                  <Search
                    size={17}
                    strokeWidth={2.2}
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    id="contract-transfer-target"
                    type="search"
                    role="combobox"
                    autoComplete="off"
                    aria-autocomplete="list"
                    aria-expanded={transferTargetSearchOpen}
                    aria-controls="contract-transfer-target-results"
                    value={transferTargetQuery}
                    disabled={bulkTransferring}
                    placeholder="Hledat podle jména nebo e-mailu"
                    onFocus={() => setTransferTargetSearchOpen(true)}
                    onBlur={() => setTransferTargetSearchOpen(false)}
                    onChange={(event) => {
                      setTransferTargetQuery(event.target.value);
                      setTransferTargetEmail("");
                      setTransferTargetSearchOpen(true);
                    }}
                    className="ui-focus h-12 w-full rounded-[16px] border border-slate-300 bg-white pl-10 pr-3 text-sm font-bold text-slate-900 disabled:opacity-60"
                  />
                </div>
                {transferTargetSearchOpen ? (
                  <div
                    id="contract-transfer-target-results"
                    role="listbox"
                    className="absolute inset-x-0 top-full z-20 mt-2 max-h-64 overflow-y-auto rounded-[18px] border border-slate-200 bg-white p-1.5 shadow-[0_18px_46px_rgba(15,23,42,0.18)]"
                  >
                    {matchingTransferTargets.length ? (
                      matchingTransferTargets.map((target) => {
                        const label = adviserLabelForEmail(target.email, target.name);
                        return (
                          <button
                            key={target.email}
                            type="button"
                            role="option"
                            aria-selected={target.email === transferTargetEmail}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              setTransferTargetEmail(target.email);
                              setTransferTargetQuery(`${label} · ${target.email}`);
                              setTransferTargetSearchOpen(false);
                            }}
                            className="ui-focus flex w-full flex-col rounded-[13px] px-3 py-2 text-left transition hover:bg-violet-50"
                          >
                            <span className="text-sm font-black text-slate-900">{label}</span>
                            <span className="text-xs text-slate-500">{target.email}</span>
                          </button>
                        );
                      })
                    ) : (
                      <p className="px-3 py-4 text-center text-sm text-slate-500">
                        Žádný poradce neodpovídá hledání.
                      </p>
                    )}
                  </div>
                ) : null}
              </div>

              <div>
                <label htmlFor="contract-transfer-effective-date" className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                  Datum účinnosti převodu
                </label>
                <input
                  id="contract-transfer-effective-date"
                  type="date"
                  value={transferEffectiveDate}
                  disabled={bulkTransferring}
                  onChange={(event) => setTransferEffectiveDate(event.target.value)}
                  className="ui-focus h-12 w-full rounded-[16px] border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 disabled:opacity-60"
                />
              </div>

              <p className="text-xs leading-relaxed text-slate-500">
                U smlouvy zůstane uložen původní sjednatel, jeho sjednatelská pozice, datum účinnosti i auditní stopa správce. Budoucí schválený převod se provede automaticky v daný den.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
              <button
                type="button"
                disabled={bulkTransferring}
                onClick={() => setTransferModalOpen(false)}
                className="ui-focus h-11 rounded-[16px] border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
              >
                Zrušit
              </button>
              <button
                type="button"
                disabled={!transferTargetEmail || !transferEffectiveDate || bulkTransferring}
                onClick={() => void handleBulkTransfer()}
                className="ui-focus inline-flex h-11 items-center gap-2 rounded-[16px] border border-violet-700 bg-violet-700 px-5 text-sm font-black text-white shadow-[0_12px_24px_rgba(109,40,217,0.24)] transition hover:bg-violet-800 disabled:opacity-50 [&_*]:!text-white"
              >
                <ArrowRightLeft size={16} strokeWidth={2.4} aria-hidden="true" />
                {bulkTransferring ? "Odesílám…" : "Odeslat žádost"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {contractContextMenu ? (
        <div
          className="fixed inset-0 z-[90]"
          role="presentation"
          onMouseDown={() => setContractContextMenu(null)}
          onContextMenu={(event) => {
            event.preventDefault();
            setContractContextMenu(null);
          }}
        >
          <div
            role="menu"
            aria-label="Rychlé akce smlouvy"
            className="fixed w-[min(240px,calc(100vw-24px))] overflow-hidden rounded-[18px] border border-slate-200 bg-white p-1.5 font-mono shadow-[0_22px_54px_rgba(15,23,42,0.24)]"
            style={{ left: contractContextMenu.x, top: contractContextMenu.y }}
            onMouseDown={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const { contract, slug } = contractContextMenu;
                setContractContextMenu(null);
                openContractDetailWindow(contract, slug);
              }}
              className="ui-focus flex h-11 w-full items-center gap-3 rounded-[13px] px-3 text-left text-sm font-bold text-slate-800 transition hover:bg-slate-100"
            >
              <ExternalLink size={16} strokeWidth={2.2} className="text-slate-500" aria-hidden="true" />
              <span>Otevřít</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const { contract, slug } = contractContextMenu;
                setContractContextMenu(null);
                openContractDetailWindow(contract, slug, { edit: true });
              }}
              className="ui-focus flex h-11 w-full items-center gap-3 rounded-[13px] px-3 text-left text-sm font-bold text-slate-800 transition hover:bg-violet-50 hover:text-violet-800"
            >
              <PencilLine size={16} strokeWidth={2.2} className="text-violet-600" aria-hidden="true" />
              <span>Upravit</span>
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={!contractContextMenu.contract.contractNumber?.trim()}
              onClick={() =>
                void copyContractNumber(contractContextMenu.contract.contractNumber)
              }
              className="ui-focus flex h-11 w-full items-center gap-3 rounded-[13px] px-3 text-left text-sm font-bold text-slate-800 transition hover:bg-emerald-50 hover:text-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Copy size={16} strokeWidth={2.2} className="text-emerald-600" aria-hidden="true" />
              <span>Kopírovat číslo smlouvy</span>
            </button>
          </div>
        </div>
      ) : null}
      {contractActionToast ? (
        <div
          role="status"
          className={`fixed bottom-5 right-5 z-[100] flex max-w-[min(380px,calc(100vw-40px))] items-center gap-2 rounded-2xl border px-4 py-3 font-mono text-sm font-bold shadow-[0_18px_46px_rgba(15,23,42,0.2)] ${
            contractActionToast.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {contractActionToast.tone === "success" ? (
            <Check size={17} strokeWidth={2.4} aria-hidden="true" />
          ) : (
            <AlertCircle size={17} strokeWidth={2.4} aria-hidden="true" />
          )}
          <span>{contractActionToast.message}</span>
        </div>
      ) : null}
      {contractDetailWindow ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 px-3 py-4 backdrop-blur-md sm:px-5 sm:py-6"
          role="dialog"
          aria-modal="true"
          aria-label={contractDetailWindow.title}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeContractDetailWindow();
            }
          }}
        >
          <div className="flex h-[min(900px,92vh)] w-[min(1240px,94vw)] flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_36px_92px_rgba(2,6,23,0.42)]">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 py-2 sm:px-4">
              <div className="min-w-0 px-1">
                <p className="truncate text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                  Detail smlouvy
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <a
                  href={contractDetailWindow.pageHref}
                  target="_blank"
                  rel="noreferrer"
                  className="ui-focus hidden h-8 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:border-slate-300 hover:text-slate-950 sm:inline-flex"
                >
                  <ExternalLink size={15} strokeWidth={2.2} aria-hidden="true" />
                  <span>Otevřít jako stránku</span>
                </a>
                <button
                  type="button"
                  onClick={closeContractDetailWindow}
                  className="ui-focus inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-950 text-white shadow-[0_10px_24px_rgba(15,23,42,0.18)] transition hover:bg-black"
                  aria-label="Zavřít detail smlouvy"
                >
                  <X size={18} strokeWidth={2.4} aria-hidden="true" />
                </button>
              </div>
            </div>
            <iframe
              key={contractDetailWindow.href}
              src={contractDetailWindow.href}
              title={contractDetailWindow.title}
              className="min-h-0 flex-1 bg-white"
            />
          </div>
        </div>
      ) : null}
      </div>
    </AppLayout>
  );
}

function ContractsPageFallback() {
  return (
    <AppLayout active="contracts">
      <div className="min-h-screen w-full bg-slate-50 px-3 py-6 sm:px-4 sm:py-8 lg:px-8">
        <div className="mx-auto w-full max-w-6xl font-mono text-slate-900">Načítám smlouvy…</div>
      </div>
    </AppLayout>
  );
}

export default function ContractsPage() {
  return (
    <Suspense fallback={<ContractsPageFallback />}>
      <ContractsPageContent />
    </Suspense>
  );
}
