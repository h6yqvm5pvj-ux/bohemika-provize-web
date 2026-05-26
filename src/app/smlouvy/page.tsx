// src/app/smlouvy/page.tsx
"use client";

import { Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowDownUp,
  CalendarDays,
  Search,
  SlidersHorizontal,
  UserRound,
  UsersRound,
} from "lucide-react";

import { auth } from "../firebase";
import {
  onAuthStateChanged,
  type User as FirebaseUser,
} from "firebase/auth";

import {
  type Product,
  type Position,
  type PaymentFrequency,
  type MaxCizinKomplexVariant,
} from "../types/domain";

import { AppLayout } from "@/components/AppLayout";
import { formatMoney, toDate } from "@/app/lib/formatters";
import {
  contractLifecycleStatus,
} from "@/app/lib/contractLifecycle";
import {
  AUTO_PRODUCTS,
  COMFORT_PRODUCTS,
  INSTITUTION_CATALOG,
  LIFE_PRODUCTS as LIFE_PRODUCTS_LIST,
  LIABILITY_PRODUCTS,
  PRODUCT_CATALOG,
  PRODUCT_ORDER,
  PROPERTY_PRODUCTS,
  TRAVEL_PRODUCTS,
  productInstitutionId,
  productInstitutionLabel,
  productLabel as productLabelFromCatalog,
  type ProductInstitutionId,
} from "@/app/lib/productCatalog";
import {
  institutionLogoFrameClass,
  institutionLogoImageClass,
} from "@/app/lib/institutionLogoDisplay";

type FirestoreTimestamp = {
  seconds: number;
  nanoseconds: number;
};

type ContractDoc = {
  id: string;
  paid?: boolean | null;
  status?: "active" | "storno" | string | null;
  stornoDate?: FirestoreTimestamp | Date | string | null;
  isRefresh?: boolean | null;
  refreshOriginalContractNumber?: string | null;
  entryType?: "contract" | "endorsement" | string | null;
  rootContractEntryId?: string | null;
  groupedEntryCount?: number;
  groupedEndorsementCount?: number;

  productKey?: Product;
  position?: Position;
  inputAmount?: number;
  previousInputAmount?: number | null;
  newInputAmount?: number | null;
  effectiveInputAmount?: number | null;
  premiumDelta?: number | null;
  changeType?: "increase" | "decrease" | "same" | string | null;
  frequencyRaw?: PaymentFrequency | null;
  total?: number;

  userEmail?: string | null;
  clientName?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  clientAddress?: string | null;
  contractNumber?: string | null;

  createdAt?: FirestoreTimestamp | Date | string | null;
  contractSignedDate?: FirestoreTimestamp | Date | string | null;
  policyStartDate?: FirestoreTimestamp | Date | string | null;
  policyEndDate?: FirestoreTimestamp | Date | string | null;
  durationYears?: number | null;
  durationMonths?: number | null;
  maxCizinKomplexVariant?: MaxCizinKomplexVariant | null;
};

type AppUser = {
  id: string;
  email: string | null;
  position: Position | null;
  managerEmail?: string | null;
};

type DisplayedContract = ContractDoc & {
  adviserEmail?: string | null;
  groupedEntryCount?: number;
  groupedEndorsementCount?: number;
  searchClientTokens?: string[];
  searchContractTokens?: string[];
  searchContractCompactTokens?: string[];
};

type FilterMode = "latest" | "anniversary";
type ProductCategory =
  | "life"
  | "auto"
  | "property"
  | "travel"
  | "comfort"
  | "liability";
type Institution =
  ProductInstitutionId;

const CONTRACT_PROPERTY_PRODUCTS: Product[] = PROPERTY_PRODUCTS.filter(
  (product) => product !== "zamex"
);

const PRODUCT_CATEGORY_MAP: Record<ProductCategory, Product[]> = {
  life: LIFE_PRODUCTS_LIST,
  auto: AUTO_PRODUCTS,
  property: CONTRACT_PROPERTY_PRODUCTS,
  travel: TRAVEL_PRODUCTS,
  comfort: COMFORT_PRODUCTS,
  liability: LIABILITY_PRODUCTS,
};

const CATEGORY_DEFS: { id: ProductCategory; label: string }[] = [
  { id: "life", label: "Životní pojištění" },
  { id: "auto", label: "Auto" },
  { id: "property", label: "Majetek" },
  { id: "travel", label: "Cestovko" },
  { id: "comfort", label: "Comfort Commodity" },
  { id: "liability", label: "Odpovědnost" },
];

const INSTITUTION_DEFS: { id: Institution; label: string }[] = Array.from(
  new Map(
    PRODUCT_ORDER.map((product) => {
      const meta = PRODUCT_CATALOG[product];
      return [meta.institutionId, meta.institutionLabel] as const;
    })
  ).entries()
).map(([id, label]) => ({
  id,
  label,
}));

const INSTITUTION_LOGO_BY_ID: Partial<Record<Institution, string>> = Object.fromEntries(
  INSTITUTION_DEFS.map((inst) => [
    inst.id,
    INSTITUTION_CATALOG[inst.id].logoPath,
  ])
) as Partial<Record<Institution, string>>;

const LIFE_PRODUCTS = new Set<Product>(LIFE_PRODUCTS_LIST);
const GOLD_PRODUCT: Product = "comfortcc";
const ANNIVERSARY_EXCLUDED_PRODUCTS = new Set<Product>(TRAVEL_PRODUCTS);
const PRODUCT_CARD_LABELS: Partial<Record<Product, string>> = {
  neon: "Životní pojištění NEON",
  flexi: "Životní pojištění FLEXI",
  maximaMaxEfekt: "Životní pojištění MaxEfekt",
  pillowInjury: "Úraz / Nemoc",
  zamex: "ZAMEX",
  domex: "DOMEX",
  cpphafan: "HAFAN",
  pillowmajetek: "Majetek",
  koopmajetekobcan: "Majetek a odpovědnost občanů",
  maxdomov: "MAXDOMOV",
  allianzmujdomov: "MůjDomov",
  cppsimplex: "Simplex",
  cppAuto: "Auto",
  slaviaauto: "Auto",
  allianzAuto: "Auto",
  csobAuto: "Auto",
  uniqaAuto: "Auto",
  uniqaflotila: "Auto Flotila",
  pillowAuto: "Auto",
  kooperativaAuto: "Auto",
  koopcestovko: "Cestovní pojištění",
  cppcestovko: "Cestovní pojištění",
  axacestovko: "Cestovní pojištění",
  maxcizinkomplex: "Komplexní zdravotní pojištění cizinců",
  comfortcc: "Comfort Commodity",
  cppPPRs: "Majetek a odpovědnost podnikatelů – ÚPIS",
  cppPPRbez: "Majetek a odpovědnost podnikatelů",
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
  const sourceAmount =
    c.entryType === "endorsement"
      ? c.newInputAmount ?? c.effectiveInputAmount ?? c.inputAmount
      : c.inputAmount;
  const base = Number(sourceAmount ?? 0);
  const amount = Number.isFinite(base) ? base : 0;

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

function nextAnniversaryDate(start: Date, now: Date): Date {
  const candidate = new Date(
    now.getFullYear(),
    start.getMonth(),
    start.getDate()
  );
  if (candidate.getTime() < now.getTime()) {
    candidate.setFullYear(candidate.getFullYear() + 1);
  }
  return candidate;
}

const ANNIVERSARY_WINDOW_DAYS = 90;

function isAnniversarySoon(
  date: Date | null
): { soon: boolean; next?: Date; daysLeft?: number; anniversaryNumber?: number } {
  if (!date) return { soon: false };
  const nowRaw = new Date();
  const now = new Date(nowRaw.getFullYear(), nowRaw.getMonth(), nowRaw.getDate());
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const next = nextAnniversaryDate(start, now);
  const diffDays = (next.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  const daysLeft = Math.ceil(diffDays);
  const anniversaryNumber = next.getFullYear() - start.getFullYear();
  const isRealAnniversary = anniversaryNumber >= 1;
  const soon = diffDays <= ANNIVERSARY_WINDOW_DAYS && diffDays >= 0 && isRealAnniversary;
  return { soon, next, daysLeft, anniversaryNumber: isRealAnniversary ? anniversaryNumber : undefined };
}

function shouldTrackAnniversary(product?: Product | null): boolean {
  if (!product) return true;
  return !ANNIVERSARY_EXCLUDED_PRODUCTS.has(product);
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

function formatDaysLeft(days: number): string {
  if (days === 1) return "1 den";
  if (days >= 2 && days <= 4) return `${days} dny`;
  return `${days} dnů`;
}

function productMatchesCategory(
  product: Product | undefined,
  categories: Set<ProductCategory>
): boolean {
  if (!product) return false;
  if (categories.size === 0) return true;
  for (const cat of categories) {
    const list = PRODUCT_CATEGORY_MAP[cat];
    if (list.includes(product)) return true;
  }
  return false;
}

function productMatchesInstitution(
  product: Product | undefined,
  institutions: Set<Institution>
): boolean {
  if (!product) return false;
  if (institutions.size === 0) return true;
  const inst = productInstitutionId(product);
  if (!inst) return false;
  return institutions.has(inst);
}

function productMatchesFilters(
  product: Product | undefined,
  categories: Set<ProductCategory>,
  institutions: Set<Institution>
): boolean {
  return (
    productMatchesCategory(product, categories) &&
    productMatchesInstitution(product, institutions)
  );
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

function getContractDate(contract: ContractDoc | (ContractDoc & { adviserEmail?: string | null })): Date | null {
  return (
    toDate((contract as any).contractSignedDate) ??
    toDate((contract as any).createdAt)
  );
}

function getAnniversaryStartDate(
  contract: ContractDoc | (ContractDoc & { adviserEmail?: string | null })
): Date | null {
  return toDate(contract.policyStartDate) ?? getContractDate(contract);
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

type ContractsCache = {
  userEmail: string;
  position: Position | null;
  myContracts: ContractDoc[];
  teamContracts: (ContractDoc & { adviserEmail: string | null })[];
  savedAt: number;
  myHasMore?: boolean;
  teamHasMore?: boolean;
  myCursorDate?: string | number | null;
  teamCursorDate?: string | number | null;
  teamEmails?: string[];
};

type ContractsApiResponse = {
  ok: boolean;
  error?: string;
  position?: Position | null;
  teamEmails?: string[];
  contracts?: (ContractDoc & { adviserEmail: string | null })[];
  hasMore?: boolean;
  nextCursorToken?: string | null;
  nextCursor?: number | null;
  teamContracts?: (ContractDoc & { adviserEmail: string | null })[];
  teamHasMore?: boolean;
  teamNextCursorToken?: string | null;
  teamNextCursor?: number | null;
};

async function readContractsApiResponseSafe(
  response: Response
): Promise<ContractsApiResponse | null> {
  try {
    return (await response.json()) as ContractsApiResponse;
  } catch {
    return null;
  }
}

type ContractsListFilters = {
  query: string;
  filterMode: FilterMode;
  showUnpaidOnly: boolean;
  selectedCategories: ProductCategory[];
  selectedInstitutions: Institution[];
  selectedSubordinates: string[];
};

const CONTRACTS_CACHE_KEY = "contracts_cache_v3";
const CONTRACTS_UPDATED_KEY = "contracts_last_updated";
const CONTRACTS_VIEW_STATE_KEY = "contracts_view_state_v1";
const CONTRACTS_SILENT_REFRESH_COOLDOWN_MS = 60_000;
const CONTRACT_LIST_WINDOWING_THRESHOLD = 90;
const CONTRACT_LIST_ESTIMATED_ROW_HEIGHT = 340;
const CONTRACT_LIST_OVERSCAN_ROWS = 3;

type ContractsViewState = {
  userEmail: string;
  showTeam: boolean;
  filterMode: FilterMode;
  searchText: string;
  showUnpaidOnly: boolean;
  selectedCategories: ProductCategory[];
  selectedInstitutions: Institution[];
  selectedSubordinates: string[];
  scrollY: number;
};

const normalizeEmail = (email?: string | null) =>
  (email ?? "").trim().toLowerCase();

const stripDiacritics = (value: string): string =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const normalizeSearchValue = (value?: string | null): string =>
  stripDiacritics((value ?? "").trim().toLowerCase());

const normalizeContractNumberForSearch = (value?: string | null): string =>
  normalizeSearchValue(value).replace(/[^a-z0-9]/g, "");

const normalizeCursorToken = (value: unknown): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
};

const cursorFromApi = (
  token: string | null | undefined,
  legacyMillis: number | null | undefined
): string | null => normalizeCursorToken(token ?? legacyMillis ?? null);

function readContractsCache(email: string | null | undefined): ContractsCache | null {
  if (!email || typeof window === "undefined") return null;
  const normalized = email.toLowerCase();
  try {
    const raw = sessionStorage.getItem(CONTRACTS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ContractsCache;
    if (parsed.userEmail !== normalized) return null;
    const updatedRaw = localStorage.getItem(CONTRACTS_UPDATED_KEY);
    const updatedAt = Number(updatedRaw);
    if (Number.isFinite(updatedAt) && (parsed.savedAt ?? 0) < updatedAt) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeContractsCache(cache: ContractsCache) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(CONTRACTS_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // best-effort cache
  }
}

function readContractsViewState(userEmail: string | null | undefined): ContractsViewState | null {
  if (typeof window === "undefined") return null;
  const normalized = normalizeEmail(userEmail);
  if (!normalized) return null;
  try {
    const key = `${CONTRACTS_VIEW_STATE_KEY}:${normalized}`;
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ContractsViewState>;
    return {
      userEmail: normalized,
      showTeam: Boolean(parsed.showTeam),
      filterMode: parsed.filterMode === "anniversary" ? "anniversary" : "latest",
      searchText: typeof parsed.searchText === "string" ? parsed.searchText : "",
      showUnpaidOnly: Boolean(parsed.showUnpaidOnly),
      selectedCategories: Array.isArray(parsed.selectedCategories)
        ? parsed.selectedCategories.filter((v): v is ProductCategory =>
            CATEGORY_DEFS.some((d) => d.id === v)
          )
        : [],
      selectedInstitutions: Array.isArray(parsed.selectedInstitutions)
        ? parsed.selectedInstitutions.filter((v): v is Institution =>
            INSTITUTION_DEFS.some((d) => d.id === v)
          )
        : [],
      selectedSubordinates: Array.isArray(parsed.selectedSubordinates)
        ? Array.from(
            new Set(
              parsed.selectedSubordinates
                .map((v) => (typeof v === "string" ? normalizeEmail(v) : ""))
                .filter(Boolean)
            )
          )
        : [],
      scrollY:
        typeof parsed.scrollY === "number" && Number.isFinite(parsed.scrollY)
          ? Math.max(0, parsed.scrollY)
          : 0,
    };
  } catch {
    return null;
  }
}

function writeContractsViewState(
  userEmail: string | null | undefined,
  state: Omit<ContractsViewState, "userEmail">
) {
  if (typeof window === "undefined") return;
  const normalized = normalizeEmail(userEmail);
  if (!normalized) return;
  try {
    const key = `${CONTRACTS_VIEW_STATE_KEY}:${normalized}`;
    sessionStorage.setItem(
      key,
      JSON.stringify({
        ...state,
        userEmail: normalized,
      } satisfies ContractsViewState)
    );
    sessionStorage.removeItem(CONTRACTS_VIEW_STATE_KEY);
  } catch {
    // best effort
  }
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    const msg = error.message?.trim();
    if (msg) return msg;
  }
  return fallback;
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
  const [filterMode, setFilterMode] = useState<FilterMode>("latest");
  const [searchText, setSearchText] = useState("");
  const [showUnpaidOnly, setShowUnpaidOnly] = useState(false);
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
  const contractsListRef = useRef<HTMLDivElement | null>(null);
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
  const serverFilterActive =
    hasSearchQuery ||
    anniversaryModeActive ||
    showUnpaidOnly ||
    selectedCategoryList.length > 0 ||
    selectedInstitutionList.length > 0 ||
    (showTeam && canShowTeamToggle && selectedSubordinateList.length > 0);
  const activeListFilters = useMemo<ContractsListFilters>(
    () => ({
      query: deferredSearchText.trim(),
      filterMode: anniversaryModeActive ? "anniversary" : "latest",
      showUnpaidOnly,
      selectedCategories: selectedCategoryList,
      selectedInstitutions: selectedInstitutionList,
      selectedSubordinates: selectedSubordinateList,
    }),
    [
      deferredSearchText,
      anniversaryModeActive,
      showUnpaidOnly,
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

    for (const member of teamUsersRef.current) {
      const email = normalizeEmail(member.email);
      if (email) emails.add(email);
    }

    for (const contract of teamContracts) {
      const email = contractOwnerEmail(contract);
      if (email) emails.add(email);
    }

    return Array.from(emails)
      .map((email) => ({
        email,
        label: adviserNameFromEmail(email) || email,
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
      .map((email) => knownByEmail.get(email) ?? { email, label: adviserNameFromEmail(email) || email })
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
    if (!subordinateSearchQuery) return [] as { email: string; label: string }[];

    return subordinateFilterOptions
      .filter((member) => {
        const name = normalizeSearchValue(member.label);
        const email = normalizeSearchValue(member.email);
        return name.includes(subordinateSearchQuery) || email.includes(subordinateSearchQuery);
      })
      .slice(0, 8);
  }, [canShowTeamToggle, subordinateFilterOptions, subordinateSearchQuery]);

  const displayedContracts = useMemo(() => {
    const base = (
      showTeam && canShowTeamToggle ? teamContracts : myContracts
    ) as (ContractDoc & { adviserEmail?: string | null })[];
    const grouped = new Map<
      string,
      {
        latest: ContractDoc & { adviserEmail?: string | null };
        latestSortMs: number;
        latestCreatedMs: number;
        entryCount: number;
        endorsementCount: number;
        searchClientTokens: Set<string>;
        searchContractTokens: Set<string>;
        searchContractCompactTokens: Set<string>;
      }
    >();

    base.forEach((contract) => {
      const ownerEmail = contractOwnerEmail(contract);
      const contractNo = (contract.contractNumber ?? "").trim().toLowerCase();
      const productKey = (contract.productKey ?? "unknown").toString();
      const rootContractEntryId = (contract.rootContractEntryId ?? "").trim();
      const groupKey = contractNo
        ? rootContractEntryId
          ? `${ownerEmail}___root___${rootContractEntryId}`
          : `${ownerEmail}___${productKey}___${contractNo}`
        : `${ownerEmail}___entry___${contract.id}`;
      const sortMs =
        getContractDate(contract)?.getTime() ?? 0;
      const createdMs = toDate((contract as any).createdAt)?.getTime() ?? 0;
      const isEndorsement = contract.entryType === "endorsement";
      const normalizedClient = normalizeSearchValue(contract.clientName);
      const normalizedContract = normalizeSearchValue(contract.contractNumber);
      const compactContract = normalizeContractNumberForSearch(contract.contractNumber);

      const existing = grouped.get(groupKey);
      if (!existing) {
        grouped.set(groupKey, {
          latest: contract,
          latestSortMs: sortMs,
          latestCreatedMs: createdMs,
          entryCount: 1,
          endorsementCount: isEndorsement ? 1 : 0,
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
      if (normalizedClient.length > 0) {
        existing.searchClientTokens.add(normalizedClient);
      }
      if (normalizedContract.length > 0) {
        existing.searchContractTokens.add(normalizedContract);
      }
      if (compactContract.length > 0) {
        existing.searchContractCompactTokens.add(compactContract);
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
    });

    return Array.from(grouped.values())
      .map((group): DisplayedContract => ({
        ...group.latest,
        groupedEntryCount: group.entryCount,
        groupedEndorsementCount: group.endorsementCount,
        searchClientTokens: Array.from(group.searchClientTokens),
        searchContractTokens: Array.from(group.searchContractTokens),
        searchContractCompactTokens: Array.from(group.searchContractCompactTokens),
      }))
      .sort((a, b) => {
        const da = getContractDate(a)?.getTime() ?? 0;
        const db = getContractDate(b)?.getTime() ?? 0;
        if (db !== da) return db - da;

        const ca = toDate((a as any).createdAt)?.getTime() ?? 0;
        const cb = toDate((b as any).createdAt)?.getTime() ?? 0;
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
    filterMode,
    selectedCategories,
    selectedInstitutions,
  ]);

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

    const rows = Math.ceil(total / contractsColumns);
    const relativeTop = contractsWindowMetrics.scrollY - contractsWindowMetrics.listTop;
    const startRow = Math.max(
      0,
      Math.floor(relativeTop / CONTRACT_LIST_ESTIMATED_ROW_HEIGHT) -
        CONTRACT_LIST_OVERSCAN_ROWS
    );
    const endRow = Math.min(
      rows - 1,
      Math.ceil(
        (relativeTop + contractsWindowMetrics.viewportHeight) /
          CONTRACT_LIST_ESTIMATED_ROW_HEIGHT
      ) + CONTRACT_LIST_OVERSCAN_ROWS
    );

    const startIndex = startRow * contractsColumns;
    const endExclusive = Math.min(total, (endRow + 1) * contractsColumns);
    const topPadding = startRow * CONTRACT_LIST_ESTIMATED_ROW_HEIGHT;
    const bottomPadding = Math.max(
      0,
      (rows - endRow - 1) * CONTRACT_LIST_ESTIMATED_ROW_HEIGHT
    );

    return {
      enabled: true,
      topPadding,
      bottomPadding,
      items: effectiveFilteredContracts.slice(startIndex, endExclusive),
    };
  }, [effectiveFilteredContracts, contractsWindowMetrics, contractsColumns]);

  const listTransitionSignature = useMemo(
    () =>
      JSON.stringify({
        view: showTeam && canShowTeamToggle ? "team" : "mine",
        mode: filterMode,
        unpaidOnly: showUnpaidOnly,
        categories: Array.from(selectedCategories).sort(),
        institutions: Array.from(selectedInstitutions).sort(),
        subordinates: Array.from(selectedSubordinates).sort(),
      }),
    [
      showTeam,
      canShowTeamToggle,
      filterMode,
      showUnpaidOnly,
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
      setContractsColumns(media.matches ? 2 : 1);
    };
    syncColumns();
    media.addEventListener("change", syncColumns);
    return () => {
      media.removeEventListener("change", syncColumns);
    };
  }, []);

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
  }, [effectiveFilteredContracts.length, showTeam, filterMode]);

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

  const persistContractsViewState = useCallback(() => {
    if (!normalizedUserEmail) return;
    writeContractsViewState(normalizedUserEmail, {
      showTeam,
      filterMode,
      searchText,
      showUnpaidOnly,
      selectedCategories: Array.from(selectedCategories),
      selectedInstitutions: Array.from(selectedInstitutions),
      selectedSubordinates: Array.from(selectedSubordinates),
      scrollY: typeof window !== "undefined" ? window.scrollY : 0,
    });
  }, [
    normalizedUserEmail,
    showTeam,
    filterMode,
    searchText,
    showUnpaidOnly,
    selectedCategories,
    selectedInstitutions,
    selectedSubordinates,
  ]);

  useEffect(() => {
    if (!shouldRestoreView) return;
    if (!normalizedUserEmail) return;
    const saved = readContractsViewState(normalizedUserEmail);
    if (!saved) return;

    setShowTeam(saved.showTeam);
    setFilterMode(saved.filterMode);
    setSearchText(saved.searchText);
    setShowUnpaidOnly(saved.showUnpaidOnly);
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
    selectedCategoryList,
    selectedInstitutionList,
    selectedSubordinateList,
  ]);

  useEffect(() => {
    persistContractsViewState();
  }, [persistContractsViewState]);

  const hasTeamContracts =
    teamContracts.length > 0 && canShowTeamToggle;

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

  return (
    <AppLayout active="contracts">
      <div className="min-h-screen w-full bg-slate-50 px-3 py-6 sm:px-4 sm:py-8 lg:px-8">
        <div className="mx-auto w-full max-w-6xl space-y-6 font-mono text-slate-900">
        {/* SEARCH BAR + FILTER + BULK ACTIONS */}
        <div className="sticky top-16 z-40 space-y-2 rounded-2xl border border-slate-200/80 bg-slate-50/95 p-2 shadow-[0_8px_20px_rgba(15,23,42,0.06)] backdrop-blur supports-[backdrop-filter]:bg-slate-50/85 lg:top-2">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
            <div className="ui-card ui-card-quiet flex flex-1 items-center gap-2 rounded-2xl bg-white px-4 py-2.5 xl:min-w-[320px]">
              <span className="text-sm">🔍</span>
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Hledat klienta nebo číslo smlouvy"
                className="w-full border-none bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 xl:ml-auto">
              <button
                type="button"
                onClick={() => setFilterModalOpen(true)}
                className="ui-focus inline-flex items-center gap-1.5 rounded-full border border-emerald-700 bg-[linear-gradient(135deg,#0f766e_0%,#16a34a_100%)] px-3 py-1.5 text-xs font-semibold !text-white shadow-[0_8px_18px_rgba(5,150,105,0.34)] transition hover:brightness-95"
              >
                <SlidersHorizontal size={14} strokeWidth={2} className="shrink-0" aria-hidden="true" />
                <span>Filtr</span>
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
                className={`ui-focus rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  selectMode
                    ? "border-rose-600 bg-rose-100 text-rose-700"
                    : "border-emerald-700 bg-[linear-gradient(135deg,#0f766e_0%,#16a34a_100%)] !text-white shadow-[0_8px_18px_rgba(5,150,105,0.34)] hover:brightness-95"
                }`}
              >
                {selectMode ? "Zrušit výběr" : "Hromadný výběr"}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canShowTeamToggle && (
              <div className="ui-chip-group text-xs">
                <button
                  type="button"
                  onClick={() => setShowTeam(false)}
                  className={`ui-focus inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    !showTeam
                      ? "border-transparent bg-[linear-gradient(135deg,#0f766e_0%,#16a34a_100%)] !text-white shadow-[0_8px_18px_rgba(5,150,105,0.34)]"
                      : "border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <UserRound size={14} strokeWidth={2} className="shrink-0" aria-hidden="true" />
                  <span>Moje smlouvy</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowTeam(true)}
                  className={`ui-focus inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    showTeam
                      ? "border-transparent bg-[linear-gradient(135deg,#0f766e_0%,#16a34a_100%)] !text-white shadow-[0_8px_18px_rgba(5,150,105,0.34)]"
                      : "border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <UsersRound size={14} strokeWidth={2} className="shrink-0" aria-hidden="true" />
                  <span>Týmové smlouvy</span>
                </button>
              </div>
            )}

            <div className="ui-chip-group text-xs">
              <button
                type="button"
                onClick={() =>
                  startFilterTransition(() => setFilterMode("latest"))
                }
                className={`ui-focus inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  filterMode === "latest"
                    ? "border-transparent bg-[linear-gradient(135deg,#0f766e_0%,#16a34a_100%)] !text-white shadow-[0_8px_18px_rgba(5,150,105,0.34)]"
                    : "border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <ArrowDownUp size={14} strokeWidth={2} className="shrink-0" aria-hidden="true" />
                <span>Nejnovější</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  startFilterTransition(() => setFilterMode("anniversary"))
                }
                className={`ui-focus inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  filterMode === "anniversary"
                    ? "border-transparent bg-[linear-gradient(135deg,#0f766e_0%,#16a34a_100%)] !text-white shadow-[0_8px_18px_rgba(5,150,105,0.34)]"
                    : "border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <CalendarDays size={14} strokeWidth={2} className="shrink-0" aria-hidden="true" />
                <span>Blížící se výročí</span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowUnpaidOnly((prev) => !prev)}
              className={`ui-focus inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                showUnpaidOnly
                  ? "border-rose-600 bg-rose-600 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              <AlertCircle size={14} strokeWidth={2} className="shrink-0" aria-hidden="true" />
              <span>Jen nezaplacené</span>
            </button>
          </div>

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
          {loading && !serverFilterActive ? (
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
              <div
                ref={contractsListRef}
                className="grid grid-cols-1 gap-3 md:grid-cols-2"
              >
              {virtualizedContracts.enabled &&
                virtualizedContracts.topPadding > 0 && (
                  <div
                    aria-hidden="true"
                    className="md:col-span-2"
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
                    ? adviserNameFromEmail(ownerEmail)
                    : "";
                const premiumDisplay = premiumDisplayForContract(c as ContractDoc);
                const isEndorsement = c.entryType === "endorsement";
                const isRefreshContract =
                  (c as ContractDoc).isRefresh === true ||
                  Boolean(
                    typeof (c as ContractDoc).refreshOriginalContractNumber === "string" &&
                      (c as ContractDoc).refreshOriginalContractNumber?.trim()
                  );
                const premiumDelta = endorsementDeltaAmount(c as ContractDoc);
                const lifecycleStatus = contractLifecycleStatus(c as ContractDoc);
                const isStorno = lifecycleStatus === "storno";
                const isDozita = lifecycleStatus === "dozita";
                const groupedEntryCount = Number((c as ContractDoc).groupedEntryCount ?? 1);
                const groupedEndorsementCount = Number(
                  (c as ContractDoc).groupedEndorsementCount ?? 0
                );
                const institutionLabel = institutionLabelForProduct(c.productKey as Product | undefined);
                const displayProductName = productCardLabel(c.productKey as Product | undefined);

                const CardContent = (
                  <article
                    className={`relative isolate overflow-hidden rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono shadow-[0_8px_20px_rgba(15,23,42,0.05)] transition hover:border-slate-300 hover:bg-slate-50 ${
                      isSelected ? "border-emerald-600 ring-2 ring-emerald-500/40" : ""
                    }`}
                    style={{
                      contentVisibility: "auto",
                      containIntrinsicSize: "340px",
                    }}
                  >
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-8 top-0 z-[1] h-[2px] rounded-b-full bg-[linear-gradient(90deg,rgba(148,163,184,0),rgba(100,116,139,0.45),rgba(30,41,59,0.72),rgba(100,116,139,0.45),rgba(148,163,184,0))]"
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-10 top-[2px] z-[1] h-px rounded-full bg-[linear-gradient(90deg,rgba(148,163,184,0),rgba(226,232,240,0.88),rgba(148,163,184,0))]"
                  />
                  {selectMode && (
                    <div className="absolute right-3 top-3 z-10">
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full border ${
                          isSelected
                            ? "border-emerald-600 bg-emerald-600 text-white"
                            : "border-slate-300 bg-white text-slate-700"
                        }`}
                      >
                        ✓
                      </span>
                    </div>
                  )}
                  {!selectMode && (
                    <div
                      className="pointer-events-none absolute right-3 top-3 z-[2] inline-flex items-center gap-1 rounded-full border border-slate-300/90 bg-white/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.11em] text-slate-600 opacity-0 shadow-sm transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
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
                          <span className="inline-flex items-center rounded-full border border-slate-300/85 bg-white/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.11em] text-slate-600 backdrop-blur-[1px]">
                            {institutionLabel}
                          </span>
                        ) : null}
                        <div className="min-w-0 text-[1.65rem] leading-tight font-semibold text-slate-900 sm:text-[1.95rem]">
                          {displayProductName}
                        </div>
                        {isEndorsement && (
                          <span className="inline-flex items-center rounded-full border border-sky-300 bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800">
                            Dodatek
                          </span>
                        )}
                        {isRefreshContract && (
                          <span className="inline-flex items-center rounded-full border border-indigo-300 bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-800">
                            Refresh
                          </span>
                        )}
                        {groupedEndorsementCount > 0 && (
                          <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
                            {groupedEndorsementCount}× změna
                          </span>
                        )}
                      </div>

                      {anniversaryInfo.soon && (
                        <div
                          className="mt-2 text-xs font-semibold text-rose-600"
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

                      <div className="mt-3 grid grid-cols-1 gap-1.5 text-[15px] leading-tight text-slate-700">
                        <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                          <span className="text-[10px] font-semibold uppercase tracking-[0.11em] text-slate-500">
                            Číslo smlouvy
                          </span>
                          <span className="font-medium text-slate-900">{c.contractNumber ?? "—"}</span>
                        </p>
                        {c.clientName && (
                          <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                            <span className="text-[10px] font-semibold uppercase tracking-[0.11em] text-slate-500">
                              Klient
                            </span>
                            <span className="text-base font-semibold text-slate-900">{c.clientName}</span>
                          </p>
                        )}
                        <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                          <span className="text-[10px] font-semibold uppercase tracking-[0.11em] text-slate-500">
                            Datum sjednání
                          </span>
                          <span className="text-slate-900">{signedStr}</span>
                        </p>
                        {adviserName && (
                          <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                            <span className="text-[10px] font-semibold uppercase tracking-[0.11em] text-slate-500">
                              Sjednal
                            </span>
                            <span className="text-slate-900">{adviserName}</span>
                          </p>
                        )}
                        {groupedEntryCount > 1 && (
                          <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                            <span className="text-[10px] font-semibold uppercase tracking-[0.11em] text-slate-500">
                              Verzí v kartě
                            </span>
                            <span className="text-slate-900">{groupedEntryCount}</span>
                          </p>
                        )}
                        {isEndorsement && premiumDelta != null && (
                          <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                            <span className="text-[10px] font-semibold uppercase tracking-[0.11em] text-slate-500">
                              Změna pojistného
                            </span>
                            <span
                              className={
                                premiumDelta >= 0 ? "text-emerald-700" : "text-rose-700"
                              }
                            >
                              {premiumDelta >= 0 ? "+" : "−"}
                              {formatMoney(Math.abs(premiumDelta))}
                            </span>
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="border-t border-slate-200 pt-3 sm:border-l sm:border-t-0 sm:border-slate-200 sm:pl-5 sm:pt-0">
                      <div className="flex items-end justify-between gap-3 sm:h-full sm:flex-col sm:items-end sm:justify-between">
                        <div className="text-right">
                          <span className="text-[11px] uppercase tracking-[0.12em] text-slate-500">
                            {isEndorsement ? "Nové pojistné" : "Pojistné"}
                          </span>
                          <div className="mt-1 whitespace-nowrap text-4xl leading-none font-semibold tracking-tight text-slate-900">
                            {formatMoney(premiumDisplay.amount)}
                          </div>
                          {premiumDisplay.cadenceLabel && (
                            <div className="mt-1 text-[11px] uppercase tracking-[0.12em] text-slate-500">
                              {premiumDisplay.cadenceLabel}
                            </div>
                          )}
                          {isEndorsement && premiumDelta != null && (
                            <div
                              className={`mt-1 text-[11px] uppercase tracking-[0.12em] ${
                                premiumDelta >= 0 ? "text-emerald-700" : "text-rose-700"
                              }`}
                            >
                              {premiumDelta >= 0 ? "Navýšení" : "Ponížení"}{" "}
                              {formatMoney(Math.abs(premiumDelta))}
                            </div>
                          )}
                        </div>
                        {(() => {
                          const statusBadge = isStorno
                            ? {
                                label: "Storno",
                                wrapper:
                                  "border-amber-200/90 bg-[linear-gradient(135deg,#fffbeb_0%,#fef3c7_100%)] text-amber-900 shadow-[0_10px_24px_rgba(217,119,6,0.14)]",
                                iconWrap:
                                  "border-amber-700/70 bg-[linear-gradient(135deg,#f59e0b_0%,#d97706_100%)] text-white shadow-[0_8px_16px_rgba(217,119,6,0.28)]",
                                icon: (
                                  <CalendarDays
                                    size={12}
                                    strokeWidth={2.2}
                                    className="shrink-0"
                                    aria-hidden="true"
                                  />
                                ),
                              }
                            : isDozita
                            ? {
                                label: "Dožitá",
                                wrapper:
                                  "border-sky-200/90 bg-[linear-gradient(135deg,#f0f9ff_0%,#dbeafe_100%)] text-sky-900 shadow-[0_10px_24px_rgba(14,116,144,0.14)]",
                                iconWrap:
                                  "border-sky-700/70 bg-[linear-gradient(135deg,#0ea5e9_0%,#0369a1_100%)] text-white shadow-[0_8px_16px_rgba(3,105,161,0.28)]",
                                icon: (
                                  <CalendarDays
                                    size={12}
                                    strokeWidth={2.2}
                                    className="shrink-0"
                                    aria-hidden="true"
                                  />
                                ),
                              }
                            : c.paid
                            ? {
                                label: "Zaplaceno",
                                wrapper:
                                  "border-emerald-200/90 bg-[linear-gradient(135deg,#ecfdf5_0%,#d1fae5_100%)] text-emerald-900 shadow-[0_10px_24px_rgba(5,150,105,0.14)]",
                                iconWrap:
                                  "border-emerald-700/70 bg-[linear-gradient(135deg,#22c55e_0%,#059669_100%)] text-white shadow-[0_8px_16px_rgba(5,150,105,0.28)]",
                                icon: (
                                  <span
                                    className="text-[13px] font-black leading-none"
                                    aria-hidden="true"
                                  >
                                    ✓
                                  </span>
                                ),
                              }
                            : {
                                label: "Nezaplaceno",
                                wrapper:
                                  "border-rose-200/90 bg-[linear-gradient(135deg,#fff1f2_0%,#ffe4e6_100%)] text-rose-900 shadow-[0_10px_24px_rgba(225,29,72,0.14)]",
                                iconWrap:
                                  "border-rose-700/70 bg-[linear-gradient(135deg,#f43f5e_0%,#e11d48_100%)] text-white shadow-[0_8px_16px_rgba(225,29,72,0.28)]",
                                icon: (
                                  <span
                                    className="text-[13px] font-black leading-none"
                                    aria-hidden="true"
                                  >
                                    !
                                  </span>
                                ),
                              };

                          return (
                            <span
                              className={`inline-flex items-center gap-2 rounded-full border px-1.5 py-1 pr-2.5 text-[12px] font-semibold leading-none tracking-[0.01em] ${statusBadge.wrapper}`}
                            >
                              <span
                                className={`inline-flex h-5 w-5 items-center justify-center rounded-full border ring-1 ring-white/45 ${statusBadge.iconWrap}`}
                              >
                                {statusBadge.icon}
                              </span>
                              <span className="pr-1">{statusBadge.label}</span>
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </article>
              );

              return selectMode ? (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleSelect(selectionKey)}
                  className="block group h-full text-left"
                >
                  {CardContent}
                </button>
              ) : (
                <Link
                  key={c.id}
                  href={`/smlouvy/${slug}?from=list`}
                  onClick={persistContractsViewState}
                  className="block group h-full"
                >
                  {CardContent}
                </Link>
              );
              })}
              {virtualizedContracts.enabled &&
                virtualizedContracts.bottomPadding > 0 && (
                  <div
                    aria-hidden="true"
                    className="md:col-span-2"
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
        <div className="fixed inset-0 z-[80] flex items-start justify-center px-4 py-4 sm:items-center sm:py-0">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setFilterModalOpen(false)}
          />
          <div className="relative w-full max-w-6xl rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_24px_80px_rgba(15,23,42,0.18)] sm:p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Filtry</h3>
              <button
                type="button"
                onClick={() => setFilterModalOpen(false)}
                className="text-sm text-slate-600 hover:text-slate-900"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="space-y-4 xl:max-h-[68vh] xl:overflow-y-auto xl:pr-2">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-900">Produkty</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {CATEGORY_DEFS.map((cat) => {
                      const active = selectedCategories.has(cat.id);
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
                          className={`flex items-center justify-between rounded-2xl border px-3 py-3 text-left transition ${
                            active
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          <span className="text-sm font-medium">{cat.label}</span>
                          <span
                            className={`h-5 w-5 rounded-full border ${
                              active
                                ? "border-slate-900 bg-white text-slate-900"
                                : "border-slate-300"
                            }`}
                          >
                            {active ? "✓" : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-900">Instituce</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {INSTITUTION_DEFS.map((inst) => {
                      const active = selectedInstitutions.has(inst.id);
                      const logoSrc = INSTITUTION_LOGO_BY_ID[inst.id];
                      return (
                        <button
                          key={inst.id}
                          type="button"
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
                          className={`flex items-center justify-between rounded-2xl border px-3 py-3 text-left transition ${
                            active
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          <span className="flex min-w-0 items-center gap-2.5">
                            <span
                              className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white ${institutionLogoFrameClass(
                                inst.id,
                                "chip"
                              )}`}
                            >
                              {logoSrc ? (
                                <Image
                                  src={logoSrc}
                                  alt={`${inst.label} logo`}
                                  width={36}
                                  height={28}
                                  className={`${institutionLogoImageClass(inst.id)} h-full w-full`}
                                />
                              ) : (
                                <span className="text-[10px] font-semibold tracking-wide text-slate-600">
                                  {institutionMonogram(inst.label)}
                                </span>
                              )}
                            </span>
                            <span className="truncate text-sm font-medium">{inst.label}</span>
                          </span>
                          <span
                            className={`h-5 w-5 rounded-full border ${
                              active
                                ? "border-slate-900 bg-white text-slate-900"
                                : "border-slate-300"
                            }`}
                          >
                            {active ? "✓" : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {canShowTeamToggle && (
                <div className="space-y-2 border-t border-slate-200 pt-3 xl:max-h-[68vh] xl:overflow-y-auto xl:border-l xl:border-t-0 xl:pl-4 xl:pt-0">
                  <p className="text-sm font-semibold text-slate-900">Podřízení</p>
                  {subordinateFilterOptions.length === 0 ? (
                    <p className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      Zatím nejsou dostupní žádní podřízení pro filtrování.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-2.5 py-2">
                        <Search size={13} className="text-slate-400" aria-hidden="true" />
                        <input
                          type="text"
                          value={subordinateSearchText}
                          onChange={(event) => setSubordinateSearchText(event.target.value)}
                          aria-label="Hledat podřízeného"
                          placeholder="Hledat podřízeného (jméno nebo e-mail)"
                          className="w-full bg-transparent text-xs text-slate-900 placeholder:text-slate-400 outline-none"
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
                              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-900 bg-slate-900 px-3 py-1 text-xs text-white"
                            >
                              <span className="truncate">{member.label}</span>
                              <span className="text-[11px]">✕</span>
                            </button>
                          ))}
                        </div>
                      )}

                      {!subordinateSearchQuery ? (
                        <p className="text-xs text-slate-500">
                          Začni psát jméno nebo e-mail podřízeného.
                        </p>
                      ) : searchableSubordinateOptions.length === 0 ? (
                        <p className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                          Pro zadaný výraz jsme nikoho nenašli.
                        </p>
                      ) : (
                        <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
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
                                className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition ${
                                  active
                                    ? "border-slate-900 bg-slate-900 text-white"
                                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                                }`}
                              >
                                <span className="min-w-0">
                                  <span className="block truncate text-sm font-medium">
                                    {member.label}
                                  </span>
                                  <span
                                    className={`block truncate text-[11px] ${
                                      active ? "text-slate-200" : "text-slate-500"
                                    }`}
                                  >
                                    {member.email}
                                  </span>
                                </span>
                                <span
                                  className={`h-5 w-5 rounded-full border text-center text-xs leading-[18px] ${
                                    active
                                      ? "border-slate-900 bg-white text-slate-900"
                                      : "border-slate-300 text-transparent"
                                  }`}
                                >
                                  ✓
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="mt-4 flex justify-between border-t border-slate-200 pt-3 text-sm">
              <button
                type="button"
                onClick={() => {
                  setShowUnpaidOnly(false);
                  setSelectedCategories(new Set());
                  setSelectedInstitutions(new Set());
                  setSelectedSubordinates(new Set());
                }}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-slate-900 hover:bg-slate-50"
              >
                Vymazat filtry
              </button>
              <button
                type="button"
                onClick={() => setFilterModalOpen(false)}
                className="rounded-xl border border-slate-900 bg-slate-900 px-4 py-2 font-semibold text-white hover:bg-black"
              >
                Použít
              </button>
            </div>
          </div>
        </div>
      )}
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
