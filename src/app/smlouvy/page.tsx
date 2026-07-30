// src/app/smlouvy/page.tsx
"use client";

import { Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowDownUp,
  BadgeCheck,
  Banknote,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Car,
  Check,
  ChevronDown,
  Clock,
  CircleDollarSign,
  ExternalLink,
  HeartPulse,
  Home,
  LayoutGrid,
  ListFilter,
  List,
  Plane,
  RefreshCw,
  ReceiptText,
  Search,
  SlidersHorizontal,
  UserRound,
  UserSearch,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

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
  parseCommissionAuditCodeFilter,
} from "@/app/lib/commissionAudit";
import {
  institutionLogoFrameClass,
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
  INSTITUTION_DEFS,
  INSTITUTION_LOGO_BY_ID,
  productMatchesFilters,
} from "./contractsPageFilters";
import {
  commissionAuditCompactLabel,
  commissionAuditStatusLabel,
  commissionAuditSummaryLabel,
  commissionAuditTimingLabel,
  commissionAuditToneClasses,
  formatCommissionAuditDate,
} from "./contractsPageCommissionAudit";
import {
  CONTRACTS_UPDATED_KEY,
  CONTRACTS_SILENT_REFRESH_COOLDOWN_MS,
  CONTRACT_LIST_ESTIMATED_CARD_ROW_HEIGHT,
  CONTRACT_LIST_ESTIMATED_COMPACT_ROW_HEIGHT,
  CONTRACT_LIST_OVERSCAN_ROWS,
  CONTRACT_LIST_WINDOWING_THRESHOLD,
  DEFAULT_CONTRACT_LIST_VIEW_MODE,
  cursorFromApi,
  getErrorMessage,
  normalizeContractNumberForSearch,
  normalizeCursorToken,
  normalizeEmail,
  normalizeSearchValue,
  readContractListViewMode,
  readContractsApiResponseSafe,
  readContractsCache,
  readContractsViewState,
  writeContractListViewMode,
  writeContractsCache,
  writeContractsViewState,
} from "./contractsPageStorage";
import type {
  AppUser,
  CommissionAuditFilterCode,
  CommissionAuditFilterMode,
  ContractDetailWindowState,
  ContractDoc,
  ContractListViewMode,
  ContractsApiResponse,
  ContractsListFilters,
  DisplayedContract,
  FilterMode,
  Institution,
  ProductCategory,
} from "./contractsPageTypes";

const COMMISSION_AUDIT_MODE_DEFS: {
  id: Exclude<CommissionAuditFilterMode, "off">;
  label: string;
  description: string;
  icon: LucideIcon;
  tone: string;
}[] = [
  {
    id: "overdue",
    label: "Nevyplacené",
    description: "Provize po termínu za posledních 180 dní bez zapsané platby.",
    icon: AlertCircle,
    tone: "border-rose-200 bg-rose-50 text-rose-700",
  },
  {
    id: "upcoming",
    label: "Blíží se",
    description: "Provize s očekávanou výplatou do 90 dní.",
    icon: Clock,
    tone: "border-sky-200 bg-sky-50 text-sky-700",
  },
  {
    id: "difference",
    label: "Rozdíl",
    description: "Vyplacená částka se liší od očekávané.",
    icon: CircleDollarSign,
    tone: "border-amber-200 bg-amber-50 text-amber-700",
  },
  {
    id: "career_mismatch",
    label: "Jiný kariérní stupeň",
    description: "Vyplaceno na jiném stupni bez pozdější opravy přes storno a správnou platbu.",
    icon: BriefcaseBusiness,
    tone: "border-violet-200 bg-violet-50 text-violet-700",
  },
  {
    id: "all",
    label: "Vše k provizím",
    description: "Nevyplacené, blížící se, rozdílové i kariérní položky.",
    icon: WalletCards,
    tone: "border-slate-200 bg-slate-100 text-slate-700",
  },
];

const COMMISSION_AUDIT_CODE_DEFS: {
  id: CommissionAuditFilterCode;
  label: string;
}[] = [
  { id: "all", label: "Všechny kódy" },
  { id: "a101", label: "A101-A112" },
  { id: "b0301", label: "B0301 / B301" },
  { id: "b36", label: "B36 / B036 / B3601" },
  { id: "b48", label: "B48 / B048 / B4801" },
  { id: "subsequent", label: "Následné B101-B112" },
];

const LIFE_PRODUCTS = new Set<Product>(LIFE_PRODUCTS_LIST);
const GOLD_PRODUCT: Product = "comfortcc";
const PRODUCT_CARD_LABELS: Partial<Record<Product, string>> = {
  neon: "Životní pojištění NEON",
  flexi: "Životní pojištění FLEXI",
  maximaMaxEfekt: "Životní pojištění MaxEfekt",
  pillowInjury: "Úraz / Nemoc",
  zamex: "ZAMEX",
  cppbytex: "BYTEX PLUS",
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
  life: HeartPulse,
  auto: Car,
  property: Home,
  travel: Plane,
  comfort: CircleDollarSign,
  business: BriefcaseBusiness,
  foreigners: UsersRound,
};

const CATEGORY_TONE_BY_ID: Record<ProductCategory, string> = {
  life: "border-rose-200 bg-rose-50 text-rose-700",
  auto: "border-sky-200 bg-sky-50 text-sky-700",
  property: "border-emerald-200 bg-emerald-50 text-emerald-700",
  travel: "border-cyan-200 bg-cyan-50 text-cyan-700",
  comfort: "border-amber-200 bg-amber-50 text-amber-700",
  business: "border-violet-200 bg-violet-50 text-violet-700",
  foreigners: "border-teal-200 bg-teal-50 text-teal-700",
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
      cardWrapper:
        "border-amber-200/75 bg-amber-300/24 text-amber-50 shadow-[0_10px_24px_rgba(217,119,6,0.28)] ring-1 ring-amber-100/20",
      cardIconWrap:
        "border-amber-500/80 bg-[linear-gradient(135deg,#fbbf24_0%,#d97706_100%)] text-[#fbf7ff] shadow-[0_8px_16px_rgba(217,119,6,0.34)]",
      compactClass: "border-amber-200 bg-amber-50 text-amber-800",
      compactDotClass: "bg-amber-500",
      icon: (
        <CalendarDays
          size={12}
          strokeWidth={2.2}
          className="shrink-0"
          aria-hidden="true"
        />
      ),
    };
  }

  if (isDozita) {
    return {
      label: "Dožitá",
      cardWrapper:
        "border-sky-200/75 bg-sky-300/24 text-sky-50 shadow-[0_10px_24px_rgba(14,116,144,0.28)] ring-1 ring-sky-100/20",
      cardIconWrap:
        "border-sky-500/80 bg-[linear-gradient(135deg,#38bdf8_0%,#0369a1_100%)] text-[#fbf7ff] shadow-[0_8px_16px_rgba(3,105,161,0.34)]",
      compactClass: "border-sky-200 bg-sky-50 text-sky-800",
      compactDotClass: "bg-sky-500",
      icon: (
        <CalendarDays
          size={12}
          strokeWidth={2.2}
          className="shrink-0"
          aria-hidden="true"
        />
      ),
    };
  }

  if (paid) {
    return {
      label: "Zaplaceno",
      cardWrapper:
        "border-emerald-200/75 bg-emerald-300/24 text-emerald-50 shadow-[0_10px_24px_rgba(5,150,105,0.28)] ring-1 ring-emerald-100/20",
      cardIconWrap:
        "border-emerald-500/80 bg-[linear-gradient(135deg,#34d399_0%,#059669_100%)] text-[#fbf7ff] shadow-[0_8px_16px_rgba(5,150,105,0.34)]",
      compactClass: "border-emerald-200 bg-emerald-50 text-emerald-800",
      compactDotClass: "bg-emerald-500",
      icon: (
        <span className="text-[13px] font-black leading-none" aria-hidden="true">
          ✓
        </span>
      ),
    };
  }

  return {
    label: "Nezaplaceno",
    cardWrapper:
      "border-rose-200/75 bg-rose-300/24 text-rose-50 shadow-[0_10px_24px_rgba(225,29,72,0.28)] ring-1 ring-rose-100/20",
    cardIconWrap:
      "border-rose-500/80 bg-[linear-gradient(135deg,#fb7185_0%,#e11d48_100%)] text-[#fbf7ff] shadow-[0_8px_16px_rgba(225,29,72,0.34)]",
    compactClass: "border-rose-200 bg-rose-50 text-rose-700",
    compactDotClass: "bg-rose-500",
    icon: (
      <span className="text-[13px] font-black leading-none" aria-hidden="true">
        !
      </span>
    ),
  };
}

function institutionLabelForProduct(product?: Product | null): string | null {
  return productInstitutionLabel(product, null);
}

function institutionMonogram(label: string): string {
  const chunks = label
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (chunks.length === 0) return "?";
  if (chunks.length === 1) return chunks[0].slice(0, 3).toUpperCase();
  return `${chunks[0][0] ?? ""}${chunks[1][0] ?? ""}`.toUpperCase();
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

function isRefreshContract(contract: ContractDoc | null | undefined): boolean {
  if (!contract) return false;
  if (contract.isRefresh === true) return true;
  if ((contract as DisplayedContract).groupedHasRefresh === true) return true;
  if (
    typeof contract.refreshOriginalContractNumber === "string" &&
    contract.refreshOriginalContractNumber.trim().length > 0
  ) {
    return true;
  }
  return Boolean(contract.refreshCommissionBase);
}

function originalReplacementLabel(product?: Product | null): string {
  return product === "neon" ? "Refresh" : "Náhrada";
}

function contractOwnerEmail(
  contract: ContractDoc | (ContractDoc & { adviserEmail?: string | null })
): string {
  return normalizeEmail(
    ((contract as { adviserEmail?: string | null }).adviserEmail ??
      contract.userEmail ??
      null) as string | null
  );
}

function contractMatchesSelectedSubordinates(
  contract: ContractDoc | (ContractDoc & { adviserEmail?: string | null }),
  selectedSubordinates: Set<string>
): boolean {
  if (selectedSubordinates.size === 0) return true;
  const ownerEmail = contractOwnerEmail(contract);
  return ownerEmail.length > 0 && selectedSubordinates.has(ownerEmail);
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
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const lastSilentRefreshAtRef = useRef(0);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [currentUserPosition, setCurrentUserPosition] =
    useState<Position | null>(null);
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
  const [listViewMode, setListViewMode] = useState<ContractListViewMode>(
    DEFAULT_CONTRACT_LIST_VIEW_MODE
  );
  const [listViewModeReadyForEmail, setListViewModeReadyForEmail] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>("latest");
  const [searchText, setSearchText] = useState("");
  const [showUnpaidOnly, setShowUnpaidOnly] = useState(false);
  const [showRefreshOnly, setShowRefreshOnly] = useState(false);
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
  const previousServerFilterActiveRef = useRef(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkMarking, setBulkMarking] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<Set<ProductCategory>>(new Set());
  const [selectedInstitutions, setSelectedInstitutions] = useState<Set<Institution>>(new Set());
  const [selectedSubordinates, setSelectedSubordinates] = useState<Set<string>>(new Set());
  const [subordinateSearchText, setSubordinateSearchText] = useState("");
  const [listMicroAnimating, setListMicroAnimating] = useState(false);
  const [searchProgress, setSearchProgress] = useState(0);
  const [searchProgressVisible, setSearchProgressVisible] = useState(false);
  const [commissionAuditFilterPending, setCommissionAuditFilterPending] =
    useState(false);
  const [contractDetailWindow, setContractDetailWindow] =
    useState<ContractDetailWindowState | null>(null);
  const contractsListRef = useRef<HTMLDivElement | null>(null);
  const searchProgressHideTimerRef = useRef<number | null>(null);
  const [contractsColumns, setContractsColumns] = useState(1);
  const [contractsWindowMetrics, setContractsWindowMetrics] = useState({
    scrollY: 0,
    viewportHeight: 0,
    listTop: 0,
  });
  const lastListTransitionSignatureRef = useRef<string | null>(null);
  const shouldRestoreView = searchParams?.get("restore") === "1";
  const normalizedUserEmail = normalizeEmail(user?.email);
  const deferredSearchText = useDeferredValue(searchText);
  const hasImmediateSearchQuery = normalizeSearchValue(searchText).length > 0;
  const hasSearchQuery = normalizeSearchValue(deferredSearchText).length > 0;
  const canShowTeamToggle =
    isManagerPosition(currentUserPosition) || teamUsersRef.current.length > 0;
  const anniversaryModeActive = filterMode === "anniversary" && !hasSearchQuery;
  const selectedCategoryList = useMemo(
    () => Array.from(selectedCategories).sort(),
    [selectedCategories]
  );
  const selectedInstitutionList = useMemo(
    () => Array.from(selectedInstitutions).sort(),
    [selectedInstitutions]
  );
  const selectedSubordinateList = useMemo(
    () => Array.from(selectedSubordinates).sort(),
    [selectedSubordinates]
  );
  const commissionAuditActive = isCommissionAuditFilterActive({
    mode: commissionAuditMode,
    codeFilter: commissionAuditCodeFilter,
  });
  const serverFilterActive =
    hasSearchQuery ||
    anniversaryModeActive ||
    showUnpaidOnly ||
    showRefreshOnly ||
    showStornoOnly ||
    showMaturedOnly ||
    commissionAuditActive ||
    selectedCategoryList.length > 0 ||
    selectedInstitutionList.length > 0 ||
    (showTeam && canShowTeamToggle && selectedSubordinateList.length > 0);
  const activeListFilters = useMemo<ContractsListFilters>(
    () => ({
      query: deferredSearchText.trim(),
      filterMode: anniversaryModeActive ? "anniversary" : "latest",
      showUnpaidOnly,
      showRefreshOnly,
      showStornoOnly,
      showMaturedOnly,
      commissionAuditMode,
      commissionAuditCodeFilter,
      selectedCategories: selectedCategoryList,
      selectedInstitutions: selectedInstitutionList,
      selectedSubordinates: selectedSubordinateList,
    }),
    [
      deferredSearchText,
      anniversaryModeActive,
      showUnpaidOnly,
      showRefreshOnly,
      showStornoOnly,
      showMaturedOnly,
      commissionAuditMode,
      commissionAuditCodeFilter,
      selectedCategoryList,
      selectedInstitutionList,
      selectedSubordinateList,
    ]
  );

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
    }: {
      scope: "my" | "team";
      cursor?: string | null;
      includeTeam?: boolean;
      filters?: ContractsListFilters;
    }) => {
      if (!user) {
        throw new Error("Nejsi přihlášený.");
      }
      const params = new URLSearchParams({ scope });
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
        if (scope === "team" && filters.selectedSubordinates.length > 0) {
          params.set("subordinates", filters.selectedSubordinates.join(","));
        }
      }

      const requestWithToken = async (token: string) =>
        fetch(`/api/contracts/list?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
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
      } catch {
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
      return data;
    },
    [user]
  );

  const fetchMyPage = useCallback(
    async (
      startBefore: string | null,
      append: boolean,
      filters?: ContractsListFilters,
      requestId?: number
    ) => {
      if (!user?.email) {
        return { list: [] as ContractDoc[], oldest: null as Date | null, hasMore: false };
      }
      const data = await apiFetchContracts({
        scope: "my",
        cursor: startBefore,
        filters,
      });
      const list = (data.contracts as ContractDoc[]) ?? [];
      const oldest = getOldestContractDate(list);
      const hasMore = Boolean(data.hasMore);

      if (requestId != null && serverFilterRequestRef.current !== requestId) {
        return { list, oldest, hasMore };
      }

      setMyContracts((prev) => (append ? mergeContracts(prev, list) : list));
      setMyHasMore(hasMore);
      setMyCursorDate(cursorFromApi(data.nextCursorToken, data.nextCursor));

      return { list, oldest, hasMore };
    },
    [apiFetchContracts, user?.email]
  );

  const fetchTeamPage = useCallback(
    async (
      startBefore: string | null,
      append: boolean,
      filters?: ContractsListFilters,
      requestId?: number
    ) => {
      const teamEmails = teamUsersRef.current.map((u) => u.email).filter(Boolean);
      if (teamEmails.length === 0) {
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
      });
      const list = (data.contracts as (ContractDoc & { adviserEmail: string | null })[]) ?? [];
      const oldest = getOldestContractDate(list);
      const hasMore = Boolean(data.hasMore);

      if (requestId != null && serverFilterRequestRef.current !== requestId) {
        return { list, oldest, hasMore };
      }

      setTeamContracts((prev) => (append ? mergeContracts(prev, list) : list));
      setTeamHasMore(hasMore);
      setTeamCursorDate(cursorFromApi(data.nextCursorToken, data.nextCursor));

      return { list, oldest, hasMore };
    },
    [apiFetchContracts]
  );

  const applyContractsPayload = useCallback(
    (email: string, data: ContractsApiResponse) => {
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
    []
  );

  const refreshContracts = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      const email = (user?.email ?? "").toLowerCase();
      if (!email) return;
      // Při aktivních serverových filtrech by tichý refresh přepsal filtrovaný dataset
      // první nefiltrouvanou stránkou a UI by viditelně probliklo.
      if (silent && serverFilterActive) return;
      if (silent && Date.now() - lastSilentRefreshAtRef.current < CONTRACTS_SILENT_REFRESH_COOLDOWN_MS) {
        return;
      }
      if (refreshInFlightRef.current) {
        if (!silent) {
          await refreshInFlightRef.current;
        }
        return;
      }
      const task = (async () => {
        if (!silent) setLoading(true);
        setLoadError(null);
        try {
          const data = await apiFetchContracts({ scope: "my", includeTeam: true });
          applyContractsPayload(email, data);
        } catch (e) {
          const msg = getErrorMessage(e, "Nepodařilo se načíst nejnovější smlouvy.");
          if (msg.toLowerCase().includes("síť") || msg.toLowerCase().includes("network")) {
            console.warn("Dočasný výpadek sítě při načítání smluv:", msg);
          } else {
            console.error("Chyba při načítání smluv:", e);
          }
          setLoadError(msg);
        } finally {
          if (!silent) setLoading(false);
        }
      })();

      refreshInFlightRef.current = task;
      try {
        await task;
      } finally {
        if (silent) {
          lastSilentRefreshAtRef.current = Date.now();
        }
        if (refreshInFlightRef.current === task) {
          refreshInFlightRef.current = null;
        }
      }
    },
    [user?.email, apiFetchContracts, applyContractsPayload, serverFilterActive]
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
  }, [user?.email]);

  // load pozice + smlouvy
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const email = (user?.email ?? "").toLowerCase();
      if (!email) {
        setMyContracts([]);
        setTeamContracts([]);
        setCurrentUserPosition(null);
        setMyHasMore(false);
        setTeamHasMore(false);
        setMyCursorDate(null);
        setTeamCursorDate(null);
        setLoadError(null);
        setLoading(false);
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
  }, [user?.email, refreshContracts, serverFilterActive]);

  useEffect(() => {
    if (!user?.email) return;

    if (!serverFilterActive) {
      if (previousServerFilterActiveRef.current) {
        previousServerFilterActiveRef.current = false;
        void refreshContracts({ silent: false });
      }
      return;
    }

    previousServerFilterActiveRef.current = true;
    const requestId = serverFilterRequestRef.current + 1;
    serverFilterRequestRef.current = requestId;
    let cancelled = false;
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
          await fetchTeamPage(null, false, activeListFilters, requestId);
        } else {
          await fetchMyPage(null, false, activeListFilters, requestId);
        }
      } catch (e) {
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
    };
  }, [
    user?.email,
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
    if (typeof window === "undefined" || !user?.email) return;

    const triggerRefresh = () => {
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
  }, [user?.email, refreshContracts]);

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

  const subordinateSearchQuery = useMemo(
    () => normalizeSearchValue(subordinateSearchText),
    [subordinateSearchText]
  );

  const selectedSubordinateOptions = useMemo(() => {
    if (selectedSubordinates.size === 0) return [] as { email: string; label: string }[];
    const knownByEmail = new Map(
      subordinateFilterOptions.map((member) => [member.email, member] as const)
    );

    return Array.from(selectedSubordinates)
      .map((email) => knownByEmail.get(email) ?? { email, label: adviserLabelForEmail(email) })
      .sort((a, b) => {
        const labelCompare = a.label.localeCompare(b.label, "cs", {
          sensitivity: "base",
        });
        if (labelCompare !== 0) return labelCompare;
        return a.email.localeCompare(b.email, "cs", { sensitivity: "base" });
      });
  }, [selectedSubordinates, subordinateFilterOptions]);

  const searchableSubordinateOptions = useMemo(() => {
    if (!canShowTeamToggle) return [] as { email: string; label: string }[];
    if (!subordinateSearchQuery) return subordinateFilterOptions;

    return subordinateFilterOptions
      .filter((member) => {
        const name = normalizeSearchValue(member.label);
        const email = normalizeSearchValue(member.email);
        return name.includes(subordinateSearchQuery) || email.includes(subordinateSearchQuery);
      });
  }, [canShowTeamToggle, subordinateFilterOptions, subordinateSearchQuery]);
  const showSubordinateBulkToggle = subordinateFilterOptions.length > 8;
  const selectedSearchableSubordinateCount = searchableSubordinateOptions.filter((member) =>
    selectedSubordinates.has(member.email)
  ).length;
  const allSearchableSubordinatesSelected =
    searchableSubordinateOptions.length > 0 &&
    selectedSearchableSubordinateCount === searchableSubordinateOptions.length;
  const subordinateBulkScopeLabel = subordinateSearchQuery
    ? `${searchableSubordinateOptions.length} nalezených`
    : `${subordinateFilterOptions.length} podřízených`;

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
        entryCount: number;
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
          entryCount: 1,
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

      existing.entryCount += 1;
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
          groupedEntryCount: group.entryCount,
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

  const filteredContracts = useMemo(() => {
    const q = normalizeSearchValue(deferredSearchText);
    const qContract = normalizeContractNumberForSearch(deferredSearchText);
    const anniversaryOnly = filterMode === "anniversary" && q.length === 0;
    let base = displayedContracts;
    const teamScopeActive = showTeam && canShowTeamToggle;

    if (teamScopeActive && selectedSubordinates.size > 0) {
      base = base.filter((c) =>
        contractMatchesSelectedSubordinates(c, selectedSubordinates)
      );
    }

    if (q) {
      base = base.filter((c) => {
        const clientTokens =
          c.searchClientTokens && c.searchClientTokens.length > 0
            ? c.searchClientTokens
            : [normalizeSearchValue(c.clientName)];
        const contractTokens =
          c.searchContractTokens && c.searchContractTokens.length > 0
            ? c.searchContractTokens
            : [normalizeSearchValue(c.contractNumber)];
        const compactContractTokens =
          c.searchContractCompactTokens && c.searchContractCompactTokens.length > 0
            ? c.searchContractCompactTokens
            : [normalizeContractNumberForSearch(c.contractNumber)];
        return (
          clientTokens.some((value) => value.includes(q)) ||
          contractTokens.some((value) => value.includes(q)) ||
          (qContract.length > 0 &&
            compactContractTokens.some((value) => value.includes(qContract)))
        );
      });
    }

    if (showUnpaidOnly) {
      base = base.filter(
        (c) => c.paid !== true && !isContractStorno(c) && !isContractDozita(c)
      );
    }

    if (showRefreshOnly) {
      base = base.filter((c) => isRefreshContract(c));
    }

    if (showStornoOnly || showMaturedOnly) {
      base = base.filter((c) => {
        const lifecycleStatus = contractLifecycleStatus(c as ContractDoc);
        return (
          (showStornoOnly && lifecycleStatus === "storno") ||
          (showMaturedOnly && lifecycleStatus === "dozita")
        );
      });
    }

    if (commissionAuditActive) {
      const now = new Date();
      base = base.filter(
        (c) =>
          commissionAuditSummaryForContract(c, {
            mode: commissionAuditMode,
            codeFilter: commissionAuditCodeFilter,
            viewerEmail: contractOwnerEmail(c),
            now,
          }).items.length > 0
      );
    }

    if (anniversaryOnly) {
      const enriched = base
        .map((c) => {
          const product = (c as any).productKey as Product | undefined;
          if (
            isContractStorno(c as ContractDoc) ||
            isContractDozita(c as ContractDoc) ||
            !shouldTrackAnniversary(product)
          ) {
            return { contract: c, next: undefined, soon: false };
          }
          const start = getAnniversaryStartDate(c);
          const info = isAnniversarySoon(start);
          return { contract: c, next: info.next, soon: info.soon };
        })
        .filter(
          (item) =>
            item.soon &&
            productMatchesFilters(
              (item.contract as any).productKey as Product | undefined,
              selectedCategories,
              selectedInstitutions
            )
        )
        .sort(
          (a, b) =>
            (a.next?.getTime() ?? Number.POSITIVE_INFINITY) -
            (b.next?.getTime() ?? Number.POSITIVE_INFINITY)
        )
        .map((item) => item.contract);

      return enriched;
    }

    return base.filter((c) =>
      productMatchesFilters(
        c.productKey as Product | undefined,
        selectedCategories,
        selectedInstitutions
      )
    );
  }, [
    displayedContracts,
    showTeam,
    canShowTeamToggle,
    selectedSubordinates,
    deferredSearchText,
    showUnpaidOnly,
    showRefreshOnly,
    showStornoOnly,
    showMaturedOnly,
    commissionAuditActive,
    commissionAuditMode,
    commissionAuditCodeFilter,
    filterMode,
    selectedCategories,
    selectedInstitutions,
  ]);

  const effectiveFilteredContracts = filteredContracts;
  const contractListEstimatedRowHeight =
    listViewMode === "compact"
      ? CONTRACT_LIST_ESTIMATED_COMPACT_ROW_HEIGHT
      : CONTRACT_LIST_ESTIMATED_CARD_ROW_HEIGHT;

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

    const rows = Math.ceil(total / contractsColumns);
    const relativeTop = contractsWindowMetrics.scrollY - contractsWindowMetrics.listTop;
    const startRow = Math.max(
      0,
      Math.floor(relativeTop / contractListEstimatedRowHeight) -
        CONTRACT_LIST_OVERSCAN_ROWS
    );
    const endRow = Math.min(
      rows - 1,
      Math.ceil(
        (relativeTop + contractsWindowMetrics.viewportHeight) /
          contractListEstimatedRowHeight
      ) + CONTRACT_LIST_OVERSCAN_ROWS
    );

    const startIndex = startRow * contractsColumns;
    const endExclusive = Math.min(total, (endRow + 1) * contractsColumns);
    const topPadding = startRow * contractListEstimatedRowHeight;
    const bottomPadding = Math.max(
      0,
      (rows - endRow - 1) * contractListEstimatedRowHeight
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
    contractsColumns,
    contractListEstimatedRowHeight,
  ]);

  const listTransitionSignature = useMemo(
    () =>
      JSON.stringify({
        view: showTeam && canShowTeamToggle ? "team" : "mine",
        listViewMode,
        mode: filterMode,
        unpaidOnly: showUnpaidOnly,
        refreshOnly: showRefreshOnly,
        stornoOnly: showStornoOnly,
        maturedOnly: showMaturedOnly,
        commissionAuditMode,
        commissionAuditCodeFilter,
        categories: Array.from(selectedCategories).sort(),
        institutions: Array.from(selectedInstitutions).sort(),
        subordinates: Array.from(selectedSubordinates).sort(),
      }),
    [
      showTeam,
      canShowTeamToggle,
      listViewMode,
      filterMode,
      showUnpaidOnly,
      showRefreshOnly,
      showStornoOnly,
      showMaturedOnly,
      commissionAuditMode,
      commissionAuditCodeFilter,
      selectedCategories,
      selectedInstitutions,
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
    const media = window.matchMedia("(min-width: 768px)");
    const syncColumns = () => {
      setContractsColumns(listViewMode === "compact" ? 1 : media.matches ? 2 : 1);
    };
    syncColumns();
    media.addEventListener("change", syncColumns);
    return () => {
      media.removeEventListener("change", syncColumns);
    };
  }, [listViewMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let rafId: number | null = null;

    const syncMetrics = () => {
      const listTop = contractsListRef.current
        ? contractsListRef.current.getBoundingClientRect().top + window.scrollY
        : 0;
      setContractsWindowMetrics({
        scrollY: window.scrollY,
        viewportHeight: window.innerHeight,
        listTop,
      });
    };

    const onWindowChange = () => {
      if (rafId != null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        syncMetrics();
      });
    };

    syncMetrics();
    window.addEventListener("scroll", onWindowChange, { passive: true });
    window.addEventListener("resize", onWindowChange);

    return () => {
      if (rafId != null) {
        window.cancelAnimationFrame(rafId);
      }
      window.removeEventListener("scroll", onWindowChange);
      window.removeEventListener("resize", onWindowChange);
    };
  }, [effectiveFilteredContracts.length, showTeam, filterMode, listViewMode]);

  const handleLoadMore = useCallback(async () => {
    if (loadingMore) return;
    if (!user?.email) return;
    setLoadingMore(true);
    try {
      const requestId = serverFilterActive
        ? serverFilterRequestRef.current
        : undefined;
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
    user?.email,
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
  const isSearchLoading =
    hasSearchQuery &&
    effectiveFilteredContracts.length === 0 &&
    (loading || loadingMore);
  const isFilteredListLoading =
    serverFilterActive &&
    effectiveFilteredContracts.length === 0 &&
    (loading || loadingMore || isFilterPending);
  const isCommissionAuditFilterLoading =
    commissionAuditActive &&
    (commissionAuditFilterPending || loading || isFilterPending);
  const isSearchProgressComplete =
    searchProgressVisible &&
    hasImmediateSearchQuery &&
    searchText === deferredSearchText &&
    !loading &&
    !loadingMore &&
    !isFilterPending;

  useEffect(() => {
    if (searchProgressHideTimerRef.current != null) {
      window.clearTimeout(searchProgressHideTimerRef.current);
      searchProgressHideTimerRef.current = null;
    }

    if (!hasImmediateSearchQuery) {
      setSearchProgressVisible(false);
      setSearchProgress(0);
      return;
    }

    setSearchProgressVisible(true);
    setSearchProgress(0);
  }, [searchText, hasImmediateSearchQuery]);

  useEffect(() => {
    if (!searchProgressVisible || !hasImmediateSearchQuery) return;

    if (isSearchProgressComplete) {
      setSearchProgress(100);
      if (searchProgressHideTimerRef.current != null) {
        window.clearTimeout(searchProgressHideTimerRef.current);
      }
      searchProgressHideTimerRef.current = window.setTimeout(() => {
        setSearchProgressVisible(false);
        setSearchProgress(0);
        searchProgressHideTimerRef.current = null;
      }, 550);
      return () => {
        if (searchProgressHideTimerRef.current != null) {
          window.clearTimeout(searchProgressHideTimerRef.current);
          searchProgressHideTimerRef.current = null;
        }
      };
    }

    const timer = window.setInterval(() => {
      setSearchProgress((prev) => {
        if (prev < 35) return Math.min(prev + 12, 35);
        if (prev < 70) return Math.min(prev + 7, 70);
        return Math.min(prev + 3, 95);
      });
    }, 120);

    return () => window.clearInterval(timer);
  }, [searchProgressVisible, hasImmediateSearchQuery, isSearchProgressComplete]);

  const persistContractsViewState = useCallback(() => {
    if (!normalizedUserEmail) return;
    writeContractsViewState(normalizedUserEmail, {
      showTeam,
      listViewMode,
      filterMode,
      searchText,
      showUnpaidOnly,
      showRefreshOnly,
      showStornoOnly,
      showMaturedOnly,
      commissionAuditMode,
      commissionAuditCodeFilter,
      selectedCategories: Array.from(selectedCategories),
      selectedInstitutions: Array.from(selectedInstitutions),
      selectedSubordinates: Array.from(selectedSubordinates),
      scrollY: typeof window !== "undefined" ? window.scrollY : 0,
    });
  }, [
    normalizedUserEmail,
    showTeam,
    listViewMode,
    filterMode,
    searchText,
    showUnpaidOnly,
    showRefreshOnly,
    showStornoOnly,
    showMaturedOnly,
    commissionAuditMode,
    commissionAuditCodeFilter,
    selectedCategories,
    selectedInstitutions,
    selectedSubordinates,
  ]);

  const closeContractDetailWindow = useCallback(() => {
    setContractDetailWindow(null);
  }, []);

  const openContractDetailWindow = useCallback(
    (contract: ContractDoc, slug: string) => {
      persistContractsViewState();
      const pageHref = `/smlouvy/${slug}?from=list`;
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

  const applyCommissionAuditMode = useCallback(
    (nextMode: CommissionAuditFilterMode) => {
      if (nextMode !== "off") {
        setCommissionAuditFilterPending(true);
      }
      startFilterTransition(() => setCommissionAuditMode(nextMode));
    },
    [startFilterTransition]
  );

  const changeCommissionAuditCodeFilter = useCallback(
    (value: string) => {
      if (commissionAuditMode !== "off") {
        setCommissionAuditFilterPending(true);
      }
      startFilterTransition(() =>
        setCommissionAuditCodeFilter(parseCommissionAuditCodeFilter(value))
      );
    },
    [commissionAuditMode, startFilterTransition]
  );

  useEffect(() => {
    if (!normalizedUserEmail) {
      setListViewModeReadyForEmail(null);
      return;
    }
    setListViewModeReadyForEmail(null);
    const savedMode = readContractListViewMode(normalizedUserEmail);
    setListViewMode(savedMode ?? DEFAULT_CONTRACT_LIST_VIEW_MODE);
    setListViewModeReadyForEmail(normalizedUserEmail);
  }, [normalizedUserEmail]);

  useEffect(() => {
    if (!normalizedUserEmail) return;
    if (listViewModeReadyForEmail !== normalizedUserEmail) return;
    writeContractListViewMode(normalizedUserEmail, listViewMode);
  }, [normalizedUserEmail, listViewMode, listViewModeReadyForEmail]);

  useEffect(() => {
    if (!shouldRestoreView) return;
    if (!normalizedUserEmail) return;
    const saved = readContractsViewState(normalizedUserEmail);
    if (!saved) return;

    setShowTeam(saved.showTeam);
    setListViewMode(saved.listViewMode);
    setFilterMode(saved.filterMode);
    setSearchText(saved.searchText);
    setShowUnpaidOnly(saved.showUnpaidOnly);
    setShowRefreshOnly(saved.showRefreshOnly);
    setShowStornoOnly(saved.showStornoOnly);
    setShowMaturedOnly(saved.showMaturedOnly);
    setCommissionAuditMode(saved.commissionAuditMode);
    setCommissionAuditCodeFilter(saved.commissionAuditCodeFilter);
    setSelectedCategories(new Set(saved.selectedCategories));
    setSelectedInstitutions(new Set(saved.selectedInstitutions));
    setSelectedSubordinates(new Set(saved.selectedSubordinates));
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
    if (!filterModalOpen) {
      setSubordinateSearchText("");
    }
  }, [filterModalOpen]);

  useEffect(() => {
    setSelectedKeys(new Set());
    setSelectMode(false);
  }, [
    filterMode,
    searchText,
    showTeam,
    showUnpaidOnly,
    showRefreshOnly,
    showStornoOnly,
    showMaturedOnly,
    commissionAuditMode,
    commissionAuditCodeFilter,
    selectedCategoryList,
    selectedInstitutionList,
    selectedSubordinateList,
  ]);

  useEffect(() => {
    persistContractsViewState();
  }, [persistContractsViewState]);

  const hasTeamContracts =
    teamContracts.length > 0 && canShowTeamToggle;
  const advancedFilterCount =
    selectedCategoryList.length +
    selectedInstitutionList.length +
    (showTeam && canShowTeamToggle ? selectedSubordinateList.length : 0) +
    (showStornoOnly ? 1 : 0) +
    (showMaturedOnly ? 1 : 0) +
    (commissionAuditActive ? 1 : 0);

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
  };

  const handleBulkDelete = async () => {
    if (selectedKeys.size === 0) return;
    if (!user) return;
    const confirmed = window.confirm(
      "Opravdu chceš smazat vybrané smlouvy? Tuto akci nelze vrátit."
    );
    if (!confirmed) return;

    setBulkDeleting(true);
    setBulkError(null);

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

  const quickFilterActiveCount =
    (filterMode === "anniversary" ? 1 : 0) +
    (showUnpaidOnly ? 1 : 0) +
    (showRefreshOnly ? 1 : 0) +
    (showStornoOnly ? 1 : 0) +
    (showMaturedOnly ? 1 : 0);
  const commissionFilterCount = commissionAuditActive
    ? 1 + (commissionAuditCodeFilter !== "all" ? 1 : 0)
    : 0;
  const modalActiveFilterCount =
    quickFilterActiveCount +
    commissionFilterCount +
    selectedCategoryList.length +
    selectedInstitutionList.length +
    (showTeam && canShowTeamToggle ? selectedSubordinateList.length : 0);
  const commissionAuditSelectedLabel =
    commissionAuditMode === "off"
      ? "Vypnuto"
      : COMMISSION_AUDIT_MODE_DEFS.find((item) => item.id === commissionAuditMode)?.label ??
        "Zapnuto";
  const filterCardBaseClass =
    "group relative flex min-h-[52px] w-full items-center gap-2.5 rounded-[16px] border px-3 py-2 text-left transition hover:-translate-y-0.5 hover:shadow-[0_10px_18px_rgba(15,23,42,0.07)]";
  const inactiveFilterCardClass =
    "border-slate-200 bg-white text-slate-700 hover:border-slate-300";
  const activeFilterCardClass =
    "border-violet-700 bg-white text-slate-950 ring-2 ring-violet-200 shadow-[0_16px_30px_rgba(109,40,217,0.12)]";
  const activeFilterIconClass =
    "border-violet-700 bg-violet-700 text-white shadow-[0_8px_18px_rgba(109,40,217,0.24)] [&_*]:!text-white";
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
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                    placeholder="Hledat klienta nebo smlouvu"
                      className="min-w-0 flex-1 border-none bg-transparent text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400"
                    />
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
                          onClick={() => setShowTeam(false)}
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

                    <div
                      className="inline-flex h-10 items-center gap-1 rounded-[16px] border border-slate-200 bg-slate-100/75 p-1"
                      aria-label="Zobrazení seznamu smluv"
                    >
                      <button
                        type="button"
                        onClick={() => setListViewMode("cards")}
                        aria-pressed={listViewMode === "cards"}
                        className={`ui-focus inline-flex h-8 items-center gap-1.5 rounded-[14px] border px-3 text-xs font-bold transition ${
                          listViewMode === "cards"
                            ? activePurpleButtonClass
                            : "border-transparent text-slate-600 hover:bg-white hover:text-slate-950"
                        }`}
                      >
                        <LayoutGrid size={14} strokeWidth={2} className="shrink-0" aria-hidden="true" />
                        <span>Karty</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setListViewMode("compact")}
                        aria-pressed={listViewMode === "compact"}
                        className={`ui-focus inline-flex h-8 items-center gap-1.5 rounded-[14px] border px-3 text-xs font-bold transition ${
                          listViewMode === "compact"
                            ? activePurpleButtonClass
                            : "border-transparent text-slate-600 hover:bg-white hover:text-slate-950"
                        }`}
                      >
                        <List size={14} strokeWidth={2} className="shrink-0" aria-hidden="true" />
                        <span>Kompakt</span>
                      </button>
                    </div>
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

          {searchProgressVisible && hasImmediateSearchQuery && (
            <div
              className="overflow-hidden rounded-[16px] border border-emerald-100 bg-emerald-50/75 px-3 py-2"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(searchProgress)}
              aria-label="Prohledávání smluv"
            >
              <div className="mb-1.5 flex items-center justify-between gap-3 text-[11px] font-semibold text-slate-600">
                <span className="truncate">Prohledávám databázi smluv</span>
                <span className="tabular-nums text-emerald-700">
                  {Math.round(searchProgress)} %
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-[width] duration-150 ease-out"
                  style={{ width: `${searchProgress}%` }}
                />
              </div>
            </div>
          )}

          {selectMode && (
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-200/85 pt-2">
              <span className="text-xs font-semibold text-slate-600">
                Vybráno: {selectedKeys.size}
              </span>
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
            <div className="mt-4 space-y-3">
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
              {listViewMode === "compact" && (
                <div className="hidden rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 shadow-[0_8px_18px_rgba(15,23,42,0.04)] lg:grid lg:grid-cols-[minmax(0,1.28fr)_96px_122px_minmax(280px,1.1fr)_auto] lg:items-center lg:gap-3">
                  <span>Smlouva</span>
                  <span>Datum</span>
                  <span>Pojistné</span>
                  <span>Stav</span>
                  <span className="text-right">Akce</span>
                </div>
              )}
              <div
                ref={contractsListRef}
                className={
                  listViewMode === "compact"
                    ? "grid grid-cols-1 gap-2"
                    : "grid grid-cols-1 gap-3 md:grid-cols-2"
                }
              >
              {virtualizedContracts.enabled &&
                virtualizedContracts.topPadding > 0 && (
                  <div
                    aria-hidden="true"
                    className={listViewMode === "compact" ? "" : "md:col-span-2"}
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
                const groupedEntryCount = Number(
                  (c as ContractDoc).groupedEntryCount ?? 1
                );
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
                const compactRowToneClass = isStorno
                  ? "border-amber-200/80 bg-amber-50/70"
                  : isDozita
                    ? "border-sky-200/80 bg-sky-50/70"
                    : c.paid
                      ? "border-slate-200 bg-white"
                      : "border-rose-200/85 bg-rose-50/60";

                  const CompactContent = (
                    <article
                      className={`relative isolate overflow-hidden rounded-[18px] border px-3 py-2.5 text-slate-900 shadow-[0_8px_18px_rgba(15,23,42,0.05)] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_12px_24px_rgba(15,23,42,0.09)] sm:rounded-2xl sm:py-3 ${
                        compactRowToneClass
                      } ${isSelected ? "ring-2 ring-violet-200" : ""}`}
                      style={{
                        contentVisibility: "auto",
                        containIntrinsicSize: "84px",
                      }}
                    >
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1.5 lg:grid-cols-[minmax(0,1.28fr)_96px_122px_minmax(280px,1.1fr)_auto] lg:items-center lg:gap-3">
                        <div className="order-1 flex min-w-0 items-start gap-2 lg:order-none lg:gap-3">
                          {selectMode ? (
                            <span
                              className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-black lg:h-6 lg:w-6 lg:text-xs ${
                                isSelected
                                  ? "border-violet-700 bg-violet-700 text-white [&_*]:!text-white"
                                  : "border-slate-300 bg-white text-slate-400"
                              }`}
                              aria-hidden="true"
                            >
                              ✓
                            </span>
                          ) : null}
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-center gap-1.5 lg:flex-wrap">
                              {institutionLabel ? (
                                <span className="inline-flex shrink-0 items-center rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] text-slate-700 lg:rounded-lg lg:px-2 lg:text-[10px]">
                                  {institutionLabel}
                                </span>
                              ) : null}
                              <span className="min-w-0 truncate text-[15px] font-bold leading-tight text-slate-950 lg:text-base">
                                {displayProductName}
                              </span>
                              {isEndorsement ? (
                                <span className="hidden shrink-0 items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700 sm:inline-flex">
                                  Dodatek
                                </span>
                              ) : null}
                              {hasOriginalReplacement ? (
                                <span className="hidden shrink-0 items-center rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700 sm:inline-flex">
                                  {originalReplacementBadgeLabel}
                                </span>
                              ) : null}
                              {groupedEndorsementCount > 0 ? (
                                <span className="hidden shrink-0 items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 sm:inline-flex">
                                  {groupedEndorsementCount}× změna
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-0.5 flex min-w-0 items-center gap-x-2 overflow-hidden text-[12px] leading-tight text-slate-600 lg:mt-1 lg:flex-wrap lg:gap-x-3 lg:gap-y-1 lg:text-xs">
                              <span className="min-w-0 truncate font-semibold text-slate-800">
                                {c.clientName || "Klient neuveden"}
                              </span>
                              <span className="max-w-[42vw] shrink-0 truncate whitespace-nowrap lg:max-w-none">č. {c.contractNumber ?? "—"}</span>
                              {adviserName ? <span className="hidden sm:inline">{adviserName}</span> : null}
                              {anniversaryInfo.soon ? (
                                <span className="hidden font-semibold text-rose-700 sm:inline">
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

                        <div className="order-3 col-start-1 row-start-2 min-w-0 self-end lg:order-none lg:col-auto lg:row-auto">
                          <div className="hidden text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 lg:block">
                            Datum
                          </div>
                          <div className="inline-flex min-w-0 items-center gap-1 text-[11px] font-semibold text-slate-500 lg:block lg:text-sm lg:text-slate-800">
                            <CalendarDays size={12} strokeWidth={2.2} className="shrink-0 lg:hidden" aria-hidden="true" />
                            <span className="truncate">{signedStr}</span>
                          </div>
                        </div>

                        <div className="order-2 col-start-2 row-start-1 text-right lg:order-none lg:col-auto lg:row-auto lg:text-left">
                          <div className="hidden text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 lg:block">
                            Pojistné
                          </div>
                          <div className="whitespace-nowrap text-[15px] font-black leading-none text-slate-950 lg:text-base lg:leading-normal">
                            {formatMoney(premiumDisplay.amount)}
                          </div>
                          <div className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500 lg:mt-0 lg:text-[10px]">
                            {premiumDisplay.cadenceLabel ?? "Částka"}
                          </div>
                          {isEndorsement && premiumDelta != null ? (
                            <div
                              className={`text-[10px] font-semibold lg:text-[11px] ${
                                premiumDelta >= 0 ? "text-emerald-700" : "text-rose-700"
                              }`}
                            >
                              {premiumDelta >= 0 ? "+" : "−"}
                              {formatMoney(Math.abs(premiumDelta))}
                            </div>
                          ) : null}
                        </div>

                        <div className="order-4 col-start-2 row-start-2 justify-self-end lg:order-none lg:col-auto lg:row-auto lg:justify-self-auto">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold leading-5 lg:gap-1.5 lg:px-2.5 lg:py-1 lg:text-xs ${statusBadge.compactClass}`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full lg:h-2 lg:w-2 ${statusBadge.compactDotClass}`}
                              aria-hidden="true"
                            />
                            {statusBadge.label}
                          </span>
                          {primaryCommissionAuditItem && commissionAuditTone ? (
                            <div
                              className={`mt-1.5 hidden w-full max-w-full items-start gap-1.5 rounded-2xl border px-2.5 py-1 text-[11px] font-bold leading-snug lg:flex ${commissionAuditTone.compact}`}
                              title={`${commissionAuditCompactLabel(primaryCommissionAuditItem)} · ${commissionAuditTimingLabel(primaryCommissionAuditItem)} · ${formatCommissionAuditDate(
                                primaryCommissionAuditItem.expectedDateMs
                              )}`}
                            >
                              <Clock size={12} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden="true" />
                              <span className="min-w-0 flex-1 whitespace-normal break-words">
                                <span>{commissionAuditCompactLabel(primaryCommissionAuditItem)}</span>
                                <span className="mx-1">·</span>
                                <span>{commissionAuditTimingLabel(primaryCommissionAuditItem)}</span>
                                {commissionAuditSummary &&
                                commissionAuditSummary.items.length > 1 ? (
                                  <span>
                                    {" "}
                                    · +{commissionAuditSummary.items.length - 1}
                                  </span>
                                ) : null}
                              </span>
                            </div>
                          ) : null}
                        </div>

                        {primaryCommissionAuditItem && commissionAuditTone ? (
                          <div
                            className={`order-5 col-span-2 mt-0.5 flex max-w-full items-start gap-1.5 rounded-xl border px-2 py-1 text-[10px] font-bold leading-snug lg:hidden ${commissionAuditTone.compact}`}
                            title={`${commissionAuditCompactLabel(primaryCommissionAuditItem)} · ${commissionAuditTimingLabel(primaryCommissionAuditItem)} · ${formatCommissionAuditDate(
                              primaryCommissionAuditItem.expectedDateMs
                            )}`}
                          >
                            <Clock size={11} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden="true" />
                            <span className="min-w-0 flex-1 truncate">
                              <span>{commissionAuditCompactLabel(primaryCommissionAuditItem)}</span>
                              <span className="mx-1">·</span>
                              <span>{commissionAuditTimingLabel(primaryCommissionAuditItem)}</span>
                              {commissionAuditSummary &&
                              commissionAuditSummary.items.length > 1 ? (
                                <span>
                                  {" "}
                                  · +{commissionAuditSummary.items.length - 1}
                                </span>
                              ) : null}
                            </span>
                          </div>
                        ) : null}

                        <div className="order-6 hidden justify-start lg:order-none lg:flex lg:justify-end">
                          {!selectMode ? (
                            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition group-hover:border-slate-400 group-hover:text-slate-950">
                              Detail ↗
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  );

                  const CardContent = (
                    <article
                      className={`relative isolate overflow-hidden rounded-[26px] border border-[#653493] bg-[#150e1f] px-4 py-4 font-mono shadow-[0_18px_34px_rgba(20,8,32,0.38)] ring-1 ring-[#7a35a7]/22 transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-[#9756d1] hover:shadow-[0_24px_44px_rgba(20,8,34,0.5)] ${
                        isSelected ? "border-[#c084fc] ring-2 ring-[#b967ff]/45" : ""
                      }`}
                      style={{
                        contentVisibility: "auto",
                        containIntrinsicSize: "340px",
                      }}
                    >
                    <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(116deg,rgba(66,30,100,0.54)_0%,rgba(29,18,45,0.8)_44%,rgba(18,12,27,0.99)_100%)]" />
                    <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,rgba(190,92,255,0.11)_0%,rgba(190,92,255,0)_40%,rgba(164,82,244,0.11)_100%)]" />
                    <div className="pointer-events-none absolute -top-16 left-12 h-56 w-px rotate-[34deg] bg-[#9d61ca]/16" />
                    <div className="pointer-events-none absolute -right-14 top-8 h-36 w-36 rounded-full bg-[#ab66ff]/22 blur-3xl" />
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-8 top-0 z-[1] h-[2px] rounded-b-full bg-[linear-gradient(90deg,rgba(168,85,247,0),rgba(192,132,252,0.74),rgba(217,180,254,0.9),rgba(192,132,252,0.74),rgba(168,85,247,0))]"
                    />
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-10 top-[2px] z-[1] h-px rounded-full bg-[linear-gradient(90deg,rgba(168,85,247,0),rgba(250,245,255,0.62),rgba(168,85,247,0))]"
                    />
                    {selectMode && (
                      <div className="absolute right-3 top-3 z-10">
                        <span
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full border ${
                            isSelected
                              ? "border-[#d8b4fe] bg-[linear-gradient(135deg,#b967ff_0%,#9350ea_100%)] text-[#fbf7ff] shadow-[0_10px_20px_rgba(168,79,240,0.36)]"
                              : "border-[#9a67d0]/80 bg-[#2e1c43]/92 text-[#d8bcf3]"
                          }`}
                        >
                          ✓
                      </span>
                    </div>
                  )}
                    {!selectMode && (
                      <div
                        className="pointer-events-none absolute right-3 top-3 z-[2] inline-flex items-center gap-1 rounded-full border border-[#9a67d0]/80 bg-[#2e1c43]/92 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.11em] text-[#d8bcf3] opacity-0 shadow-[0_10px_20px_rgba(20,8,34,0.3)] transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
                        aria-hidden="true"
                      >
                        <span>Detail</span>
                      <span className="text-[11px]">↗</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_190px] sm:gap-4">
                    <div className="relative z-[1] min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                          {institutionLabel ? (
                            <span className="inline-flex items-center rounded-[9px] bg-[linear-gradient(135deg,#b85cff_0%,#9d47ed_100%)] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-[#fbf7ff] shadow-[0_10px_20px_rgba(159,72,237,0.36)]">
                              {institutionLabel}
                            </span>
                          ) : null}
                          <div className="min-w-0 text-[1.65rem] leading-tight font-semibold text-[#fbf7ff] sm:text-[1.95rem]">
                            {displayProductName}
                          </div>
                          {isEndorsement && (
                            <span className="inline-flex items-center rounded-full border border-sky-300/45 bg-sky-300/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-100">
                              Dodatek
                            </span>
                          )}
                          {hasOriginalReplacement && (
                            <span className="inline-flex items-center rounded-full border border-indigo-300/45 bg-indigo-300/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-100">
                              {originalReplacementBadgeLabel}
                            </span>
                          )}
                          {groupedEndorsementCount > 0 && (
                            <span className="inline-flex items-center rounded-full border border-[#9a67d0]/70 bg-[#2e1c43]/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#d8bcf3]">
                              {groupedEndorsementCount}× změna
                            </span>
                          )}
                      </div>

                      {anniversaryInfo.soon && (
                          <div
                            className="mt-2 text-xs font-semibold text-rose-200"
                          title={
                            anniversaryInfo.next
                              ? `${
                                  anniversaryInfo.anniversaryNumber
                                    ? `${anniversaryInfo.anniversaryNumber}. výročí`
                                    : "Výročí"
                                }: ${anniversaryInfo.next.toLocaleDateString(
                                  "cs-CZ"
                                )}`
                              : undefined
                          }
                        >
                          {anniversaryInfo.daysLeft != null
                            ? `${
                                anniversaryInfo.anniversaryNumber
                                  ? `${anniversaryInfo.anniversaryNumber}. výročí`
                                  : "Výročí"
                              } za ${formatDaysLeft(anniversaryInfo.daysLeft)}`
                            : "Blížící se výročí"}
                        </div>
                      )}

                      {primaryCommissionAuditItem && commissionAuditTone ? (
                        <div
                          className={`mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${commissionAuditTone.card}`}
                          title={`${primaryCommissionAuditItem.label} · ${formatCommissionAuditDate(
                            primaryCommissionAuditItem.expectedDateMs
                          )}`}
                        >
                          <Clock size={12} strokeWidth={2} className="shrink-0" aria-hidden="true" />
                          <span className="truncate">
                            {primaryCommissionAuditItem.code ??
                              primaryCommissionAuditItem.label}
                          </span>
                          <span className="shrink-0">
                            {commissionAuditStatusLabel(primaryCommissionAuditItem)}
                          </span>
                          {commissionAuditSummary &&
                          commissionAuditSummary.items.length > 1 ? (
                            <span className="shrink-0">
                              · {commissionAuditSummaryLabel(commissionAuditSummary)}
                            </span>
                          ) : null}
                        </div>
                      ) : null}

                        <div className="mt-3 grid grid-cols-1 gap-1.5 text-[15px] leading-tight text-[#d8bcf3]">
                          <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                            <span className="text-[10px] font-semibold uppercase tracking-[0.11em] text-[#c8aee4]">
                              Číslo smlouvy
                            </span>
                            <span className="font-medium text-[#fbf7ff]">{c.contractNumber ?? "—"}</span>
                          </p>
                          {c.clientName && (
                            <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                              <span className="text-[10px] font-semibold uppercase tracking-[0.11em] text-[#c8aee4]">
                                Klient
                              </span>
                              <span className="text-base font-semibold text-[#fbf7ff]">{c.clientName}</span>
                            </p>
                          )}
                          <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                            <span className="text-[10px] font-semibold uppercase tracking-[0.11em] text-[#c8aee4]">
                              Datum sjednání
                            </span>
                            <span className="text-[#fbf7ff]">{signedStr}</span>
                          </p>
                          {adviserName && (
                            <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                              <span className="text-[10px] font-semibold uppercase tracking-[0.11em] text-[#c8aee4]">
                                Sjednal
                              </span>
                              <span className="text-[#fbf7ff]">{adviserName}</span>
                            </p>
                          )}
                          {groupedEntryCount > 1 && (
                            <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                              <span className="text-[10px] font-semibold uppercase tracking-[0.11em] text-[#c8aee4]">
                                Verzí v kartě
                              </span>
                              <span className="text-[#fbf7ff]">{groupedEntryCount}</span>
                            </p>
                          )}
                          {isEndorsement && premiumDelta != null && (
                            <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                              <span className="text-[10px] font-semibold uppercase tracking-[0.11em] text-[#c8aee4]">
                                Změna pojistného
                              </span>
                              <span
                                className={
                                  premiumDelta >= 0 ? "text-emerald-200" : "text-rose-200"
                                }
                            >
                              {premiumDelta >= 0 ? "+" : "−"}
                              {formatMoney(Math.abs(premiumDelta))}
                            </span>
                          </p>
                        )}
                      </div>
                    </div>

                      <div className="relative z-[1] border-t-2 border-[#a855f7]/75 pt-3 sm:border-l-2 sm:border-t-0 sm:pl-5 sm:pt-0">
                        <div className="flex items-end justify-between gap-3 sm:h-full sm:flex-col sm:items-end sm:justify-between">
                          <div className="text-right">
                            <span className="text-[11px] font-black uppercase tracking-[0.14em] text-[#f3e8ff] drop-shadow-[0_2px_8px_rgba(243,232,255,0.18)]">
                              {isEndorsement ? "Nové pojistné" : "Pojistné"}
                            </span>
                            <div className="mt-1 whitespace-nowrap text-4xl leading-none font-black tracking-tight text-[#fbf7ff] drop-shadow-[0_8px_18px_rgba(168,85,247,0.2)]">
                              {formatMoney(premiumDisplay.amount)}
                            </div>
                            {premiumDisplay.cadenceLabel && (
                              <div className="mt-1 text-[11px] font-black uppercase tracking-[0.14em] text-[#f3e8ff] drop-shadow-[0_2px_8px_rgba(243,232,255,0.18)]">
                                {premiumDisplay.cadenceLabel}
                              </div>
                            )}
                            {isEndorsement && premiumDelta != null && (
                              <div
                                className={`mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                                  premiumDelta >= 0 ? "text-emerald-200" : "text-rose-200"
                                }`}
                            >
                              {premiumDelta >= 0 ? "Navýšení" : "Ponížení"}{" "}
                              {formatMoney(Math.abs(premiumDelta))}
                            </div>
                          )}
                        </div>
                          <span
                            className={`inline-flex items-center gap-2 rounded-full border px-1.5 py-1 pr-2.5 text-[12px] font-semibold leading-none tracking-[0.01em] ${statusBadge.cardWrapper}`}
                          >
                            <span
                              className={`inline-flex h-5 w-5 items-center justify-center rounded-full border ring-1 ring-[#fbf7ff]/45 ${statusBadge.cardIconWrap}`}
                            >
                              {statusBadge.icon}
                            </span>
                            <span className="pr-1">{statusBadge.label}</span>
                          </span>
                      </div>
                    </div>
                  </div>
                </article>
              );

              const renderedContract = listViewMode === "compact" ? CompactContent : CardContent;

              return selectMode ? (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleSelect(selectionKey)}
                  className="block group h-full w-full text-left"
                >
                  {renderedContract}
                </button>
              ) : (
                <button
                  key={c.id}
                  type="button"
                  onClick={() =>
                    openContractDetailWindow(c as ContractDoc, slug)
                  }
                  className="block group h-full w-full text-left"
                >
                  {renderedContract}
                </button>
              );
              })}
              {virtualizedContracts.enabled &&
                virtualizedContracts.bottomPadding > 0 && (
                  <div
                    aria-hidden="true"
                    className={listViewMode === "compact" ? "" : "md:col-span-2"}
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
        <div className="fixed inset-0 z-[80] flex items-start justify-center px-3 py-4 sm:items-center sm:px-5 sm:py-6">
          <div
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-md"
            onClick={() => setFilterModalOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Filtry smluv"
            className="relative flex max-h-[calc(100vh-2rem)] w-full max-w-7xl flex-col overflow-hidden rounded-[28px] border border-white/70 bg-slate-50 shadow-[0_38px_110px_rgba(2,6,23,0.38)]"
          >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border border-slate-200 bg-slate-950 text-white shadow-[0_12px_26px_rgba(15,23,42,0.2)]">
                  <SlidersHorizontal size={19} strokeWidth={2.2} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-xl font-black tracking-tight text-slate-950">
                      Filtry smluv
                    </h3>
                    <span className="inline-flex h-6 items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 text-[11px] font-black uppercase tracking-[0.1em] text-slate-600">
                      {modalActiveFilterCount === 0
                        ? "Bez filtrů"
                        : `${modalActiveFilterCount} aktivní`}
                    </span>
                  </div>
                  <p className="mt-1 max-w-2xl text-sm font-medium leading-snug text-slate-500">
                    Přesné zúžení smluv podle režimu, provizní kontroly, produktu,
                    instituce a podřízených.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFilterModalOpen(false)}
                className="ui-focus inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[16px] border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950"
                aria-label="Zavřít filtry"
              >
                <X size={16} strokeWidth={2.2} aria-hidden="true" />
              </button>
            </div>

            <div
              className={`grid min-h-0 flex-1 grid-cols-1 ${
                canShowTeamToggle
                  ? "lg:grid-cols-[minmax(0,1fr)_340px]"
                  : "lg:grid-cols-1"
              }`}
            >
              <div className="contracts-filter-scrollbar min-h-0 overflow-y-scroll px-3 py-3 sm:px-4 sm:py-4">
                <div className="space-y-3">
                  <section className="rounded-[20px] border border-slate-200 bg-white p-3 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                    <div className="mb-2.5 flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px] border border-slate-200 bg-slate-100 text-slate-700">
                          <ListFilter size={15} strokeWidth={2.1} aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <h4 className="text-sm font-black text-slate-950">
                            Režim a stav smluv
                          </h4>
                          <p className="text-xs font-medium text-slate-500">
                            Nejčastější zúžení seznamu smluv.
                          </p>
                        </div>
                      </div>
                      {quickFilterActiveCount > 0 && (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-700">
                          {quickFilterActiveCount} aktivní
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() =>
                          startFilterTransition(() => setFilterMode("latest"))
                        }
                        className={`${filterCardBaseClass} ${
                          filterMode === "latest"
                            ? activeFilterCardClass
                            : inactiveFilterCardClass
                        }`}
                      >
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[13px] border ${
                            filterMode === "latest"
                              ? activeFilterIconClass
                              : "border-slate-200 bg-slate-100 text-slate-600"
                          }`}
                        >
                          <ArrowDownUp size={16} strokeWidth={2.1} aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-black">Nejnovější</span>
                          <span
                            className={`mt-0.5 block text-[11px] font-semibold leading-snug ${
                              filterMode === "latest" ? "text-slate-600" : "text-slate-500"
                            }`}
                          >
                            Standardní řazení podle posledních smluv.
                          </span>
                        </span>
                        {filterMode === "latest" && (
                          <Check size={15} strokeWidth={2.5} className="shrink-0" aria-hidden="true" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          startFilterTransition(() => setFilterMode("anniversary"))
                        }
                        className={`${filterCardBaseClass} ${
                          filterMode === "anniversary"
                            ? activeFilterCardClass
                            : inactiveFilterCardClass
                        }`}
                      >
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[13px] border ${
                            filterMode === "anniversary"
                              ? activeFilterIconClass
                              : "border-emerald-200 bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          <CalendarDays size={16} strokeWidth={2.1} aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-black">Výročí</span>
                          <span
                            className={`mt-0.5 block text-[11px] font-semibold leading-snug ${
                              filterMode === "anniversary" ? "text-slate-600" : "text-slate-500"
                            }`}
                          >
                            Smlouvy s blížícím se výročím.
                          </span>
                        </span>
                        {filterMode === "anniversary" && (
                          <Check size={15} strokeWidth={2.5} className="shrink-0" aria-hidden="true" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowUnpaidOnly((prev) => !prev)}
                        className={`${filterCardBaseClass} ${
                          showUnpaidOnly
                            ? activeFilterCardClass
                            : inactiveFilterCardClass
                        }`}
                      >
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[13px] border ${
                            showUnpaidOnly
                              ? activeFilterIconClass
                              : "border-rose-200 bg-rose-50 text-rose-700"
                          }`}
                        >
                          <AlertCircle size={16} strokeWidth={2.1} aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-black">Nezaplacené</span>
                          <span
                            className={`mt-0.5 block text-[11px] font-semibold leading-snug ${
                              showUnpaidOnly ? "text-slate-600" : "text-slate-500"
                            }`}
                          >
                            Jen smlouvy bez označené úhrady.
                          </span>
                        </span>
                        {showUnpaidOnly && (
                          <Check size={15} strokeWidth={2.5} className="shrink-0" aria-hidden="true" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowRefreshOnly((prev) => !prev)}
                        className={`${filterCardBaseClass} ${
                          showRefreshOnly
                            ? activeFilterCardClass
                            : inactiveFilterCardClass
                        }`}
                      >
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[13px] border ${
                            showRefreshOnly
                              ? activeFilterIconClass
                              : "border-sky-200 bg-sky-50 text-sky-700"
                          }`}
                        >
                          <RefreshCw size={16} strokeWidth={2.1} aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-black">Refresh/Náhrada</span>
                          <span
                            className={`mt-0.5 block text-[11px] font-semibold leading-snug ${
                              showRefreshOnly ? "text-slate-600" : "text-slate-500"
                            }`}
                          >
                            Jen náhrady a refresh smlouvy.
                          </span>
                        </span>
                        {showRefreshOnly && (
                          <Check size={15} strokeWidth={2.5} className="shrink-0" aria-hidden="true" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowMaturedOnly((prev) => !prev)}
                        className={`${filterCardBaseClass} ${
                          showMaturedOnly
                            ? activeFilterCardClass
                            : inactiveFilterCardClass
                        }`}
                      >
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[13px] border ${
                            showMaturedOnly
                              ? activeFilterIconClass
                              : "border-emerald-200 bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          <BadgeCheck size={16} strokeWidth={2.1} aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-black">Dožité</span>
                          <span
                            className={`mt-0.5 block text-[11px] font-semibold leading-snug ${
                              showMaturedOnly ? "text-slate-600" : "text-slate-500"
                            }`}
                          >
                            Smlouvy po dni pojištění do.
                          </span>
                        </span>
                        {showMaturedOnly && (
                          <Check size={15} strokeWidth={2.5} className="shrink-0" aria-hidden="true" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowStornoOnly((prev) => !prev)}
                        className={`${filterCardBaseClass} ${
                          showStornoOnly
                            ? activeFilterCardClass
                            : inactiveFilterCardClass
                        }`}
                      >
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[13px] border ${
                            showStornoOnly
                              ? activeFilterIconClass
                              : "border-rose-200 bg-rose-50 text-rose-700"
                          }`}
                        >
                          <X size={16} strokeWidth={2.3} aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-black">Stornované</span>
                          <span
                            className={`mt-0.5 block text-[11px] font-semibold leading-snug ${
                              showStornoOnly ? "text-slate-600" : "text-slate-500"
                            }`}
                          >
                            Smlouvy označené jako storno.
                          </span>
                        </span>
                        {showStornoOnly && (
                          <Check size={15} strokeWidth={2.5} className="shrink-0" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  </section>

                  <section className="rounded-[20px] border border-slate-200 bg-white p-3 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                    <div className="mb-2.5 flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px] border border-amber-200 bg-amber-50 text-amber-700">
                          <Banknote size={15} strokeWidth={2.1} aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <h4 className="text-sm font-black text-slate-950">
                            Kontrola provizí
                          </h4>
                          <p className="text-xs font-medium text-slate-500">
                            Aktuálně: {commissionAuditSelectedLabel}
                          </p>
                        </div>
                      </div>
                      {commissionFilterCount > 0 && (
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-black text-amber-700">
                          {commissionFilterCount} aktivní
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => applyCommissionAuditMode("off")}
                        className={`${filterCardBaseClass} ${
                        commissionAuditMode === "off"
                            ? activeFilterCardClass
                            : inactiveFilterCardClass
                      }`}
                    >
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[13px] border ${
                            commissionAuditMode === "off"
                              ? activeFilterIconClass
                              : "border-slate-200 bg-slate-100 text-slate-600"
                          }`}
                        >
                          <BadgeCheck size={16} strokeWidth={2.1} aria-hidden="true" />
                      </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-black">Vypnuto</span>
                          <span
                            className={`mt-0.5 block text-[11px] font-semibold leading-snug ${
                              commissionAuditMode === "off" ? "text-slate-600" : "text-slate-500"
                            }`}
                          >
                            Bez provizní kontroly.
                          </span>
                        </span>
                        {commissionAuditMode === "off" && (
                          <Check size={15} strokeWidth={2.5} className="shrink-0" aria-hidden="true" />
                        )}
                    </button>
                    {COMMISSION_AUDIT_MODE_DEFS.map((item) => {
                      const active = commissionAuditMode === item.id;
                        const Icon = item.icon;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => applyCommissionAuditMode(item.id)}
                            className={`${filterCardBaseClass} ${
                            active
                                ? activeFilterCardClass
                                : inactiveFilterCardClass
                          }`}
                        >
                            <span
                              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[13px] border ${
                                active
                                  ? activeFilterIconClass
                                  : item.tone
                              }`}
                            >
                              <Icon size={16} strokeWidth={2.1} aria-hidden="true" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-black">
                              {item.label}
                            </span>
                            <span
                                className={`mt-0.5 block text-[11px] font-semibold leading-snug ${
                                active ? "text-slate-600" : "text-slate-500"
                              }`}
                            >
                              {item.description}
                            </span>
                          </span>
                            {active && (
                              <Check size={15} strokeWidth={2.5} className="shrink-0" aria-hidden="true" />
                            )}
                        </button>
                      );
                    })}
                  </div>

                    <label className="mt-3 block text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                      Kód provize
                    </label>
                    <div className="relative mt-2">
                      <select
                        value={commissionAuditCodeFilter}
                        onChange={(event) =>
                          changeCommissionAuditCodeFilter(event.target.value)
                        }
                        className="h-10 w-full appearance-none rounded-[16px] border border-slate-200 bg-slate-50 px-3.5 pr-10 text-sm font-black text-slate-950 outline-none transition focus:border-slate-950 focus:bg-white focus:ring-2 focus:ring-slate-950/10"
                      >
                        {COMMISSION_AUDIT_CODE_DEFS.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        size={15}
                        strokeWidth={2.2}
                        className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500"
                        aria-hidden="true"
                      />
                    </div>
                  </section>

                  <section className="rounded-[20px] border border-slate-200 bg-white p-3 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                    <div className="mb-2.5 flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px] border border-slate-200 bg-slate-100 text-slate-700">
                          <ReceiptText size={15} strokeWidth={2.1} aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <h4 className="text-sm font-black text-slate-950">Produkty</h4>
                          <p className="text-xs font-medium text-slate-500">
                            Kategorie produktů napříč institucemi.
                          </p>
                        </div>
                      </div>
                      {selectedCategoryList.length > 0 && (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-700">
                          {selectedCategoryList.length} vybráno
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {CATEGORY_DEFS.map((cat) => {
                      const active = selectedCategories.has(cat.id);
                        const Icon = CATEGORY_ICON_BY_ID[cat.id];
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() =>
                            setSelectedCategories((prev) => {
                              const next = new Set(prev);
                              if (next.has(cat.id)) {
                                next.delete(cat.id);
                              } else {
                                next.add(cat.id);
                              }
                              return next;
                            })
                          }
                            className={`${filterCardBaseClass} items-center ${
                            active
                                ? activeFilterCardClass
                                : inactiveFilterCardClass
                          }`}
                        >
                          <span
                              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[13px] border ${
                              active
                                  ? activeFilterIconClass
                                  : CATEGORY_TONE_BY_ID[cat.id]
                            }`}
                          >
                              <Icon size={16} strokeWidth={2.1} aria-hidden="true" />
                          </span>
                            <span className="min-w-0 flex-1 truncate text-sm font-black">
                              {cat.label}
                          </span>
                            {active && (
                              <Check size={15} strokeWidth={2.5} className="shrink-0" aria-hidden="true" />
                            )}
                        </button>
                      );
                    })}
                  </div>
                  </section>

                  <section className="rounded-[20px] border border-slate-200 bg-white p-3 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                    <div className="mb-2.5 flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px] border border-slate-200 bg-slate-100 text-slate-700">
                          <Building2 size={15} strokeWidth={2.1} aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <h4 className="text-sm font-black text-slate-950">Instituce</h4>
                          <p className="text-xs font-medium text-slate-500">
                            Pojišťovny a produktoví partneři.
                          </p>
                        </div>
                      </div>
                      {selectedInstitutionList.length > 0 && (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-700">
                          {selectedInstitutionList.length} vybráno
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {INSTITUTION_DEFS.map((inst) => {
                      const active = selectedInstitutions.has(inst.id);
                      const logoSrc = INSTITUTION_LOGO_BY_ID[inst.id];
                      return (
                        <button
                          key={inst.id}
                          type="button"
                          aria-pressed={active}
                          onClick={() =>
                            setSelectedInstitutions((prev) => {
                              const next = new Set(prev);
                              if (next.has(inst.id)) {
                                next.delete(inst.id);
                              } else {
                                next.add(inst.id);
                              }
                              return next;
                            })
                          }
                          className={`ui-focus group flex min-h-[56px] items-center justify-between gap-3 rounded-[16px] border px-3 py-2 text-left transition hover:-translate-y-0.5 hover:shadow-[0_10px_18px_rgba(15,23,42,0.07)] ${
                            active
                              ? activeFilterCardClass
                              : "border-slate-200 bg-white text-slate-900 hover:border-slate-300"
                          }`}
                        >
                          <span className="flex min-w-0 items-center gap-3">
                              <span
                              className={`flex h-10 w-[92px] shrink-0 items-center justify-center rounded-[14px] border bg-white px-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] ${
                                  active
                                    ? "border-violet-700 bg-violet-50 text-violet-900"
                                    : "border-slate-200 bg-white text-slate-700"
                                }`}
                              >
                                <span
                                  className={`relative flex shrink-0 items-center justify-center overflow-hidden ${institutionLogoFrameClass(
                                    inst.id,
                                  "compact"
                                  )}`}
                                >
                                  {logoSrc ? (
                                    <Image
                                      src={logoSrc}
                                      alt={`${inst.label} logo`}
                                    width={64}
                                    height={36}
                                      className={`${institutionLogoImageClass(inst.id)} h-full w-full`}
                                    />
                                  ) : (
                                    <span className="text-sm font-black tracking-wide text-slate-700">
                                      {institutionMonogram(inst.label)}
                                    </span>
                                  )}
                                </span>
                              </span>

                            <span className="truncate text-sm font-black leading-tight">
                                {inst.label}
                              </span>
                          </span>

                          {active ? (
                            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${activeFilterIconClass}`}>
                              <Check size={15} strokeWidth={2.6} aria-hidden="true" />
                            </span>
                          ) : (
                            <span className="h-5 w-5 shrink-0 rounded-full border border-slate-200 bg-white transition group-hover:border-slate-300" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                  </section>
              </div>
              </div>

              {canShowTeamToggle && (
                <aside className="contracts-filter-scrollbar min-h-0 overflow-y-scroll border-t border-slate-200 bg-white px-4 py-4 sm:px-5 lg:border-l lg:border-t-0">
                  <div className="mb-3 flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px] border border-slate-200 bg-slate-100 text-slate-700">
                      <UserSearch size={15} strokeWidth={2.1} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <h4 className="text-sm font-black text-slate-950">Podřízení</h4>
                      <p className="text-xs font-medium leading-snug text-slate-500">
                        Filtrování týmových smluv podle poradce.
                      </p>
                    </div>
                  </div>

                  {subordinateFilterOptions.length === 0 ? (
                    <p className="rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                      Zatím nejsou dostupní žádní podřízení pro filtrování.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      <label className="flex h-11 items-center gap-2 rounded-[17px] border border-slate-200 bg-slate-50 px-3 transition focus-within:border-slate-950 focus-within:bg-white focus-within:ring-2 focus-within:ring-slate-950/10">
                        <Search size={15} strokeWidth={2.1} className="text-slate-400" aria-hidden="true" />
                        <input
                          type="text"
                          value={subordinateSearchText}
                          onChange={(event) => setSubordinateSearchText(event.target.value)}
                          aria-label="Hledat podřízeného"
                          placeholder="Hledat podřízeného (jméno nebo e-mail)"
                          className="w-full bg-transparent text-xs font-semibold text-slate-900 placeholder:text-slate-400 outline-none"
                        />
                      </label>

                      {selectedSubordinateOptions.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {selectedSubordinateOptions.map((member) => (
                            <button
                              key={`selected-${member.email}`}
                              type="button"
                              onClick={() =>
                                setSelectedSubordinates((prev) => {
                                  const next = new Set(prev);
                                  next.delete(member.email);
                                  return next;
                                })
                              }
                              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-violet-700 bg-violet-700 px-3 py-1.5 text-xs font-bold text-white shadow-[0_8px_18px_rgba(109,40,217,0.18)] [&_*]:!text-white"
                            >
                              <span className="truncate">{member.label}</span>
                              <X size={12} strokeWidth={2.4} aria-hidden="true" />
                            </button>
                          ))}
                        </div>
                      )}

                      {showSubordinateBulkToggle && searchableSubordinateOptions.length > 0 && (
                        <label className="flex min-h-10 items-center justify-between gap-3 rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-slate-300 hover:bg-white">
                          <span className="flex min-w-0 items-center gap-2">
                            <input
                              type="checkbox"
                              checked={allSearchableSubordinatesSelected}
                              onChange={() =>
                                setSelectedSubordinates((prev) => {
                                  const next = new Set(prev);
                                  for (const member of searchableSubordinateOptions) {
                                    if (allSearchableSubordinatesSelected) {
                                      next.delete(member.email);
                                    } else {
                                      next.add(member.email);
                                    }
                                  }
                                  return next;
                                })
                              }
                              className="h-4 w-4 shrink-0 accent-violet-700"
                            />
                            <span className="truncate">
                              {allSearchableSubordinatesSelected ? "Zrušit vše" : "Vybrat vše"}
                            </span>
                          </span>
                          <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[11px] font-black text-slate-500">
                            {selectedSearchableSubordinateCount}/{subordinateBulkScopeLabel}
                          </span>
                        </label>
                      )}

                      {searchableSubordinateOptions.length === 0 ? (
                        <p className="rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold text-slate-600">
                          Pro zadaný výraz jsme nikoho nenašli.
                        </p>
                      ) : (
                        <div className="contracts-filter-scrollbar max-h-[52vh] space-y-2 overflow-y-scroll pr-1">
                          {searchableSubordinateOptions.map((member) => {
                            const active = selectedSubordinates.has(member.email);
                            return (
                              <button
                                key={member.email}
                                type="button"
                                onClick={() =>
                                  setSelectedSubordinates((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(member.email)) {
                                      next.delete(member.email);
                                    } else {
                                      next.add(member.email);
                                    }
                                    return next;
                                  })
                                }
                                className={`flex w-full items-center justify-between gap-3 rounded-[18px] border px-3 py-2.5 text-left transition ${
                                  active
                                      ? "border-violet-700 bg-white text-slate-950 ring-2 ring-violet-200"
                                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                                }`}
                              >
                                <span className="min-w-0">
                                  <span className="block truncate text-sm font-black">
                                    {member.label}
                                  </span>
                                  <span
                                    className={`block truncate text-[11px] font-semibold ${
                                      active ? "text-slate-600" : "text-slate-500"
                                    }`}
                                  >
                                    {member.email}
                                  </span>
                                </span>
                                {active && (
                                  <Check size={15} strokeWidth={2.5} className="shrink-0" aria-hidden="true" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </aside>
              )}
            </div>

            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 text-sm sm:px-6">
              <button
                type="button"
                onClick={() => {
                  startFilterTransition(() => {
                    setFilterMode("latest");
                    setShowUnpaidOnly(false);
                    setShowRefreshOnly(false);
                    setShowStornoOnly(false);
                    setShowMaturedOnly(false);
                    setCommissionAuditMode("off");
                    setCommissionAuditCodeFilter("all");
                    setSelectedCategories(new Set());
                    setSelectedInstitutions(new Set());
                    setSelectedSubordinates(new Set());
                  });
                }}
                className="ui-focus inline-flex h-11 items-center gap-2 rounded-[17px] border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950"
              >
                <X size={15} strokeWidth={2.3} aria-hidden="true" />
                Vymazat filtry
              </button>
              <button
                type="button"
                onClick={() => setFilterModalOpen(false)}
                className="ui-focus inline-flex h-11 items-center gap-2 rounded-[17px] border border-violet-700 bg-violet-700 px-5 text-sm font-black text-white shadow-[0_12px_24px_rgba(109,40,217,0.24)] transition hover:bg-violet-800 [&_*]:!text-white"
              >
                <Check size={16} strokeWidth={2.5} aria-hidden="true" />
                Použít
              </button>
            </div>
          </div>
        </div>
      )}
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
          <div className="flex h-[min(900px,92vh)] w-[min(1120px,92vw)] flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_36px_92px_rgba(2,6,23,0.42)]">
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
