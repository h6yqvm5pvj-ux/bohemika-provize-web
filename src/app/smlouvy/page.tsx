// src/app/smlouvy/page.tsx
"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

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
import SplitTitle from "../pomucky/plan-produkce/SplitTitle";

type FirestoreTimestamp = {
  seconds: number;
  nanoseconds: number;
};

type ContractDoc = {
  id: string;
  paid?: boolean | null;

  productKey?: Product;
  position?: Position;
  inputAmount?: number;
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
};

type AppUser = {
  id: string;
  email: string | null;
  position: Position | null;
  managerEmail?: string | null;
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
  | "cpp"
  | "kooperativa"
  | "maxima"
  | "allianz"
  | "uniqa"
  | "csob"
  | "pillow"
  | "axa"
  | "comfort";

const PRODUCT_CATEGORY_MAP: Record<ProductCategory, Product[]> = {
  life: ["neon", "flexi", "pillowInjury", "maximaMaxEfekt"],
  auto: ["cppAuto", "allianzAuto", "csobAuto", "uniqaAuto", "pillowAuto", "kooperativaAuto"],
  property: [
    "cppPPRs",
    "cppPPRbez",
    "domex",
    "koopmajetekobcan",
    "maxdomov",
    "cppsimplex",
  ],
  travel: ["cppcestovko", "axacestovko"],
  comfort: ["comfortcc"],
  liability: ["zamex", "domex", "cppPPRs", "cppPPRbez"],
};

const CATEGORY_DEFS: { id: ProductCategory; label: string }[] = [
  { id: "life", label: "Životní pojištění" },
  { id: "auto", label: "Auto" },
  { id: "property", label: "Majetek" },
  { id: "travel", label: "Cestovko" },
  { id: "comfort", label: "Comfort Commodity" },
  { id: "liability", label: "Odpovědnost" },
];

const PRODUCT_INSTITUTION_MAP: Record<Product, Institution> = {
  neon: "cpp",
  flexi: "kooperativa",
  maximaMaxEfekt: "maxima",
  pillowInjury: "pillow",
  zamex: "cpp",
  domex: "cpp",
  koopmajetekobcan: "kooperativa",
  maxdomov: "maxima",
  cppsimplex: "cpp",
  cppAuto: "cpp",
  allianzAuto: "allianz",
  csobAuto: "csob",
  uniqaAuto: "uniqa",
  pillowAuto: "pillow",
  kooperativaAuto: "kooperativa",
  cppcestovko: "cpp",
  axacestovko: "axa",
  comfortcc: "comfort",
  cppPPRs: "cpp",
  cppPPRbez: "cpp",
};

const INSTITUTION_DEFS: { id: Institution; label: string }[] = [
  { id: "cpp", label: "ČPP" },
  { id: "kooperativa", label: "Kooperativa" },
  { id: "maxima", label: "Maxima" },
  { id: "allianz", label: "Allianz" },
  { id: "uniqa", label: "UNIQA" },
  { id: "csob", label: "ČSOB" },
  { id: "pillow", label: "Pillow" },
  { id: "axa", label: "AXA" },
  { id: "comfort", label: "Comfort Commodity" },
];

const LIFE_PRODUCTS = new Set<Product>(PRODUCT_CATEGORY_MAP.life);
const GOLD_PRODUCT: Product = "comfortcc";
const AUTO_PRODUCTS = new Set<Product>(PRODUCT_CATEGORY_MAP.auto);
const PROPERTY_PRODUCTS = new Set<Product>(PRODUCT_CATEGORY_MAP.property);
const TRAVEL_PRODUCTS = new Set<Product>(PRODUCT_CATEGORY_MAP.travel);
const COMFORT_PRODUCTS = new Set<Product>(PRODUCT_CATEGORY_MAP.comfort);
const LIABILITY_PRODUCTS = new Set<Product>(PRODUCT_CATEGORY_MAP.liability);
const INSTITUTION_LABEL_BY_ID = Object.fromEntries(
  INSTITUTION_DEFS.map((inst) => [inst.id, inst.label])
) as Record<Institution, string>;

function formatMoney(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value)) return "0 Kč";
  return (
    value.toLocaleString("cs-CZ", {
      maximumFractionDigits: 0,
    }) + " Kč"
  );
}

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
  const base = Number(c.inputAmount ?? 0);
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

function categoryForProduct(product?: Product | null): ProductCategory | null {
  if (!product) return null;
  if (LIFE_PRODUCTS.has(product)) return "life";
  if (AUTO_PRODUCTS.has(product)) return "auto";
  if (PROPERTY_PRODUCTS.has(product)) return "property";
  if (TRAVEL_PRODUCTS.has(product)) return "travel";
  if (COMFORT_PRODUCTS.has(product)) return "comfort";
  if (LIABILITY_PRODUCTS.has(product)) return "liability";
  return null;
}

function categoryLabelForProduct(product?: Product | null): string | null {
  const category = categoryForProduct(product);
  if (!category) return null;
  return CATEGORY_DEFS.find((it) => it.id === category)?.label ?? null;
}

function institutionLabelForProduct(product?: Product | null): string | null {
  if (!product) return null;
  const institution = PRODUCT_INSTITUTION_MAP[product];
  return institution ? INSTITUTION_LABEL_BY_ID[institution] ?? null : null;
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;

  if (
    typeof value === "object" &&
    value !== null &&
    "seconds" in value &&
    typeof (value as any).seconds === "number"
  ) {
    const v = value as FirestoreTimestamp;
    const ms =
      v.seconds * 1000 + Math.floor((v.nanoseconds ?? 0) / 1_000_000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(value as any);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isManagerPosition(pos: Position | null): boolean {
  if (!pos) return false;
  return pos.startsWith("manazer");
}

function productLabel(p?: Product): string {
  switch (p) {
    case "neon":
      return "ČPP ŽP NEON";
    case "flexi":
      return "Kooperativa ŽP FLEXI";
    case "maximaMaxEfekt":
      return "MAXIMA ŽP MaxEfekt";
    case "pillowInjury":
      return "Pillow Úraz / Nemoc";
    case "zamex":
      return "ČPP ZAMEX";
    case "domex":
      return "ČPP DOMEX";
    case "koopmajetekobcan":
      return "Kooperativa Pojištění majetku a odpovědnosti občanů a právní ochrany";
    case "cppsimplex":
      return "ČPP Simplex";
    case "cppPPRbez":
      return "ČPP Pojištění majetku a odpovědnosti podnikatelů";
    case "maxdomov":
      return "Maxima MAXDOMOV";
    case "cppAuto":
      return "ČPP Auto";
    case "cppPPRs":
      return "ČPP Pojištění majetku a odpovědnosti podnikatelů – ÚPIS";
    case "allianzAuto":
      return "Allianz Auto";
    case "csobAuto":
      return "ČSOB Auto";
    case "uniqaAuto":
      return "UNIQA Auto";
    case "pillowAuto":
      return "Pillow Auto";
    case "kooperativaAuto":
      return "Kooperativa Auto";
    case "cppcestovko":
      return "ČPP Cestovko";
    case "axacestovko":
      return "AXA Cestovko";
    case "comfortcc":
      return "Comfort Commodity";
    default:
      return "Neznámý produkt";
  }
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

function addYears(date: Date, years: number) {
  const copy = new Date(date.getTime());
  copy.setFullYear(copy.getFullYear() + years);
  return copy;
}

function isAnniversarySoon(
  date: Date | null
): { soon: boolean; next?: Date; daysLeft?: number } {
  if (!date) return { soon: false };
  const now = new Date();
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const next = nextAnniversaryDate(start, now);
  const diffDays = (next.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  const daysLeft = Math.ceil(diffDays);
  const firstAnniversary = addYears(start, 1);
  const isRealAnniversary = next.getTime() >= firstAnniversary.getTime();
  const soon = diffDays <= 60 && diffDays >= 0 && isRealAnniversary;
  return { soon, next, daysLeft };
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
  const inst = PRODUCT_INSTITUTION_MAP[product];
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
  myCursorDate?: number | null;
  teamCursorDate?: number | null;
  teamEmails?: string[];
};

type ContractsApiResponse = {
  ok: boolean;
  error?: string;
  position?: Position | null;
  teamEmails?: string[];
  contracts?: (ContractDoc & { adviserEmail: string | null })[];
  hasMore?: boolean;
  nextCursor?: number | null;
  teamContracts?: (ContractDoc & { adviserEmail: string | null })[];
  teamHasMore?: boolean;
  teamNextCursor?: number | null;
};

const CONTRACTS_CACHE_KEY = "contracts_cache_v2";
const CONTRACTS_UPDATED_KEY = "contracts_last_updated";
const CONTRACTS_VIEW_STATE_KEY = "contracts_view_state_v1";

type ContractsViewState = {
  userEmail: string;
  showTeam: boolean;
  filterMode: FilterMode;
  searchText: string;
  selectedCategories: ProductCategory[];
  selectedInstitutions: Institution[];
  scrollY: number;
};

const normalizeEmail = (email?: string | null) =>
  (email ?? "").trim().toLowerCase();

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

function ContractsPageContent() {
  const searchParams = useSearchParams();
  const [isFilterPending, startFilterTransition] = useTransition();
  const pendingScrollRestoreRef = useRef<number | null>(null);
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
  const [myCursorDate, setMyCursorDate] = useState<Date | null>(null);
  const [teamCursorDate, setTeamCursorDate] = useState<Date | null>(null);

  const [showTeam, setShowTeam] = useState(false);
  const [filterMode, setFilterMode] = useState<FilterMode>("latest");
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [autoScanPaused, setAutoScanPaused] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkMarking, setBulkMarking] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<Set<ProductCategory>>(new Set());
  const [selectedInstitutions, setSelectedInstitutions] = useState<Set<Institution>>(new Set());
  const shouldRestoreView = searchParams?.get("restore") === "1";
  const normalizedUserEmail = normalizeEmail(user?.email);

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
    }: {
      scope: "my" | "team";
      cursor?: Date | null;
      includeTeam?: boolean;
    }) => {
      if (!user) {
        throw new Error("Nejsi přihlášený.");
      }
      const token = await user.getIdToken(true); // force refresh to avoid expired/invalid token
      const params = new URLSearchParams({ scope });
      if (cursor) params.set("cursor", String(cursor.getTime()));
      if (includeTeam) params.set("includeTeam", "1");

      const res = await fetch(`/api/contracts?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as ContractsApiResponse;
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || "Nepodařilo se načíst smlouvy.");
      }
      return data;
    },
    [user]
  );

  const fetchMyPage = useCallback(
    async (startBefore: Date | null, append: boolean) => {
      if (!user?.email) {
        return { list: [] as ContractDoc[], oldest: null as Date | null, hasMore: false };
      }
      const data = await apiFetchContracts({ scope: "my", cursor: startBefore });
      const list = (data.contracts as ContractDoc[]) ?? [];
      const oldest = getOldestContractDate(list);
      const hasMore = Boolean(data.hasMore);

      setMyContracts((prev) => (append ? mergeContracts(prev, list) : list));
      setMyHasMore(hasMore);
      setMyCursorDate(data.nextCursor ? new Date(data.nextCursor) : null);

      return { list, oldest, hasMore };
    },
    [apiFetchContracts, user?.email]
  );

  const fetchTeamPage = useCallback(
    async (startBefore: Date | null, append: boolean) => {
      const teamEmails = teamUsersRef.current.map((u) => u.email).filter(Boolean);
      if (teamEmails.length === 0) {
        setTeamContracts([]);
        setTeamHasMore(false);
        setTeamCursorDate(null);
        return { list: [] as (ContractDoc & { adviserEmail: string | null })[], oldest: null as Date | null, hasMore: false };
      }

      const data = await apiFetchContracts({ scope: "team", cursor: startBefore });
      const list = (data.contracts as (ContractDoc & { adviserEmail: string | null })[]) ?? [];
      const oldest = getOldestContractDate(list);
      const hasMore = Boolean(data.hasMore);

      setTeamContracts((prev) => (append ? mergeContracts(prev, list) : list));
      setTeamHasMore(hasMore);
      setTeamCursorDate(data.nextCursor ? new Date(data.nextCursor) : null);

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
      setMyCursorDate(data.nextCursor ? new Date(data.nextCursor) : null);
      setTeamCursorDate(data.teamNextCursor ? new Date(data.teamNextCursor) : null);

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
        myCursorDate: data.nextCursor ?? null,
        teamCursorDate: data.teamNextCursor ?? null,
        teamEmails,
      });
    },
    []
  );

  const refreshContracts = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      const email = (user?.email ?? "").toLowerCase();
      if (!email) return;
      if (!silent) setLoading(true);
      setLoadError(null);
      try {
        const data = await apiFetchContracts({ scope: "my", includeTeam: true });
        applyContractsPayload(email, data);
      } catch (e) {
        console.error("Chyba při načítání smluv:", e);
        setLoadError("Nepodařilo se načíst nejnovější smlouvy.");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [user?.email, apiFetchContracts, applyContractsPayload]
  );

  // auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      setUser(fbUser);
    });
    return () => unsub();
  }, []);

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

      const cached = readContractsCache(email);
      if (cached) {
        setMyContracts(cached.myContracts ?? []);
        setTeamContracts(cached.teamContracts ?? []);
        setCurrentUserPosition(cached.position ?? null);
        setMyHasMore(cached.myHasMore ?? true);
        setTeamHasMore(cached.teamHasMore ?? true);
        setMyCursorDate(cached.myCursorDate ? new Date(cached.myCursorDate) : null);
        setTeamCursorDate(cached.teamCursorDate ? new Date(cached.teamCursorDate) : null);
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
  }, [user?.email, refreshContracts]);

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

  const canShowTeamToggle =
    isManagerPosition(currentUserPosition) || teamUsersRef.current.length > 0;

  const displayedContracts = useMemo(() => {
    const base =
      showTeam && canShowTeamToggle ? teamContracts : myContracts;

    return [...base].sort((a, b) => {
      const da = getContractDate(a) ?? new Date(0);
      const db = getContractDate(b) ?? new Date(0);
      return db.getTime() - da.getTime();
    });
  }, [showTeam, canShowTeamToggle, teamContracts, myContracts]);

  const filteredContracts = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    let base = displayedContracts;

    if (q) {
      base = base.filter((c) => {
        const client = (c.clientName ?? "").toLowerCase();
        const contractNo = (c.contractNumber ?? "").toLowerCase();
        return client.includes(q) || contractNo.includes(q);
      });
    }

    if (filterMode === "anniversary") {
      const enriched = base
        .map((c) => {
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
  }, [displayedContracts, searchText, filterMode, selectedCategories, selectedInstitutions]);

  const handleLoadMore = useCallback(async () => {
    if (loadingMore) return;
    if (!user?.email) return;
    setLoadingMore(true);
    try {
      if (showTeam && canShowTeamToggle) {
        if (!teamHasMore) return;
        await fetchTeamPage(teamCursorDate, true);
      } else {
        if (!myHasMore) return;
        await fetchMyPage(myCursorDate, true);
      }
      setAutoScanPaused(false);
    } catch (e) {
      console.error("Chyba při načítání dalších smluv:", e);
      setLoadError("Nepodařilo se načíst další smlouvy. Zkus to prosím znovu.");
      setAutoScanPaused(true);
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
    setLoadError,
  ]);

  const hasMoreContracts =
    showTeam && canShowTeamToggle ? teamHasMore : myHasMore;

  const wantsFullScan =
    filterMode === "anniversary" || searchText.trim() !== "";
  const hasMoreActive =
    showTeam && canShowTeamToggle ? teamHasMore : myHasMore;
  const isAnniversaryLoading =
    filterMode === "anniversary" &&
    (isFilterPending || loadingMore || hasMoreActive);

  const persistContractsViewState = useCallback(() => {
    if (!normalizedUserEmail) return;
    writeContractsViewState(normalizedUserEmail, {
      showTeam,
      filterMode,
      searchText,
      selectedCategories: Array.from(selectedCategories),
      selectedInstitutions: Array.from(selectedInstitutions),
      scrollY: typeof window !== "undefined" ? window.scrollY : 0,
    });
  }, [
    normalizedUserEmail,
    showTeam,
    filterMode,
    searchText,
    selectedCategories,
    selectedInstitutions,
  ]);

  useEffect(() => {
    if (!shouldRestoreView) return;
    if (!normalizedUserEmail) return;
    const saved = readContractsViewState(normalizedUserEmail);
    if (!saved) return;

    setShowTeam(saved.showTeam);
    setFilterMode(saved.filterMode);
    setSearchText(saved.searchText);
    setSelectedCategories(new Set(saved.selectedCategories));
    setSelectedInstitutions(new Set(saved.selectedInstitutions));
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
  }, [loading, loadingMore, hasMoreActive, filteredContracts.length]);

  useEffect(() => {
    if (!wantsFullScan) return;
    if (!user?.email) return;
    if (loading || loadingMore) return;
    if (autoScanPaused) return;
    if (!hasMoreActive) return;
    void handleLoadMore(); // při vyhledávání/anniversary postupně načti vše, ne jen první stránku
  }, [
    wantsFullScan,
    user?.email,
    loading,
    loadingMore,
    autoScanPaused,
    hasMoreActive,
    showTeam,
    canShowTeamToggle,
    handleLoadMore,
  ]);

  useEffect(() => {
    setSelectedKeys(new Set());
    setSelectMode(false);
    setAutoScanPaused(false);
  }, [filterMode, searchText, showTeam]);

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
      const res = await fetch("/api/contracts", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ entries }),
      });

      if (!res.ok) {
        const data = (await res.json()) as any;
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
      const res = await fetch("/api/contracts", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ entries, paid: true }),
      });

      if (!res.ok) {
        const data = (await res.json()) as any;
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
      <div className="min-h-screen w-full bg-white px-3 py-6 sm:px-4 sm:py-8 lg:px-8">
        <div className="mx-auto w-full max-w-6xl space-y-6 font-mono text-slate-900">
        {/* HEADER */}
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <SplitTitle text="Smlouvy" className="!text-slate-900" />

          {canShowTeamToggle && (
            <div className="inline-flex self-start rounded-full border border-slate-900 bg-white p-1 text-xs sm:self-end">
              <button
                type="button"
                onClick={() => setShowTeam(false)}
                className={`px-3 py-1.5 rounded-full transition ${
                  !showTeam
                    ? "bg-slate-900 text-white"
                    : "text-slate-700"
                }`}
              >
                Moje smlouvy
              </button>
              <button
                type="button"
                onClick={() => setShowTeam(true)}
                className={`px-3 py-1.5 rounded-full transition ${
                  showTeam
                    ? "bg-slate-900 text-white"
                    : "text-slate-700"
                }`}
              >
                Týmové smlouvy
              </button>
            </div>
          )}
        </header>

        {/* SEARCH BAR + FILTER + BULK ACTIONS */}
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 items-center gap-2 rounded-2xl border border-slate-900 bg-white px-4 py-2.5">
            <span className="text-sm">🔍</span>
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Hledat klienta nebo číslo smlouvy"
              className="w-full border-none bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-500"
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <div className="inline-flex rounded-full border border-slate-900 bg-white p-1 text-xs">
              <button
                type="button"
                onClick={() =>
                  startFilterTransition(() => setFilterMode("latest"))
                }
                className={`px-3 py-1.5 rounded-full transition ${
                  filterMode === "latest"
                    ? "bg-slate-900 text-white"
                    : "text-slate-700"
                }`}
              >
                Nejnovější
              </button>
              <button
                type="button"
                onClick={() =>
                  startFilterTransition(() => setFilterMode("anniversary"))
                }
                className={`px-3 py-1.5 rounded-full transition ${
                  filterMode === "anniversary"
                    ? "bg-slate-900 text-white"
                    : "text-slate-700"
                }`}
              >
                Blížící se výročí
              </button>
            </div>

            <div className="inline-flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFilterModalOpen(true)}
                className="rounded-full border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black"
              >
                Filtr
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
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  selectMode
                    ? "border-rose-600 bg-rose-100 text-rose-700"
                    : "border-slate-900 bg-slate-900 text-white hover:bg-black"
                }`}
              >
                {selectMode ? "Zrušit výběr" : "Hromadný výběr"}
              </button>
              {selectMode && (
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
              )}
              {selectMode && (
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
              )}
            </div>
          </div>
        </div>

        {/* LIST SMLOUV */}
        {loadError && (
          <div className="rounded-2xl border border-rose-500 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {loadError}
          </div>
        )}
        {loading ? (
          <p className="mt-4 text-sm text-slate-600">
            Načítám smlouvy…
          </p>
        ) : isAnniversaryLoading && filteredContracts.length === 0 ? (
          <div className="mt-4 space-y-2 rounded-2xl border border-slate-900 bg-white px-6 py-8 text-center text-sm text-slate-700">
            <div className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
            <p className="font-medium">Vyhledávám blížící se výročí…</p>
            <p className="text-xs text-slate-500">
              Procházím další smlouvy, může to chvíli trvat.
            </p>
          </div>
        ) : filteredContracts.length === 0 ? (
          <div className="mt-4 space-y-2 rounded-2xl border border-slate-900 bg-white px-6 py-8 text-center text-sm text-slate-700">
            {filterMode === "anniversary" ? (
              <>
                <p className="font-medium">Žádná blížící se výročí</p>
                <p className="text-xs text-slate-500">
                  V okně 60 dní a méně od dneška není žádné výročí (počítáno z data
                  počátku smlouvy, případně podpisu).
                </p>
              </>
            ) : searchText.trim() !== "" ? (
              <>
                <p className="font-medium">Nic nenalezeno</p>
                <p className="text-xs text-slate-500">
                  Zkus upravit hledaný text (klient nebo číslo smlouvy).
                </p>
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
            {isAnniversaryLoading && (
              <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-900 bg-white px-4 py-2.5 text-xs text-slate-700">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
                <span>Dohledávám další výročí…</span>
              </div>
            )}
            {bulkError && (
              <div className="rounded-2xl border border-rose-500 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {bulkError}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredContracts.map((c: any) => {
                const signed =
                  toDate((c as any).contractSignedDate) ??
                  toDate(c.createdAt);
                const signedStr = signed
                  ? signed.toLocaleDateString("cs-CZ")
                  : "—";
                const policyStart = getAnniversaryStartDate(c);
                const anniversaryInfo = isAnniversarySoon(policyStart);

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
                const categoryLabel = categoryLabelForProduct(c.productKey as Product | undefined);
                const institutionLabel = institutionLabelForProduct(c.productKey as Product | undefined);

                const CardContent = (
                  <article
                    className={`relative rounded-2xl border border-slate-900 bg-white px-4 py-3 font-mono shadow-[0_10px_24px_rgba(15,23,42,0.08)] transition hover:bg-slate-50 ${
                      isSelected ? "border-emerald-600 ring-2 ring-emerald-500/40" : ""
                    }`}
                  >
                  {selectMode && (
                    <div className="absolute right-3 top-3 z-10">
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full border ${
                          isSelected
                            ? "border-emerald-600 bg-emerald-600 text-white"
                            : "border-slate-900 bg-white text-slate-700"
                        }`}
                      >
                        ✓
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_190px] sm:gap-4">
                    <div className="min-w-0">
                      <div className="text-2xl leading-tight font-semibold text-slate-900">
                        {productLabel(c.productKey)}
                      </div>

                      {(categoryLabel || institutionLabel) && (
                        <div className="mt-1 text-[11px] uppercase tracking-[0.12em] text-slate-500">
                          {[categoryLabel, institutionLabel].filter(Boolean).join(" · ")}
                        </div>
                      )}

                      {anniversaryInfo.soon && (
                        <div
                          className="mt-2 text-xs font-semibold text-rose-600"
                          title={
                            anniversaryInfo.next
                              ? `Výročí: ${anniversaryInfo.next.toLocaleDateString(
                                  "cs-CZ"
                                )}`
                              : undefined
                          }
                        >
                          {anniversaryInfo.daysLeft != null
                            ? `${formatDaysLeft(anniversaryInfo.daysLeft)} do výročí`
                            : "Blížící se výročí"}
                        </div>
                      )}

                      <div className="mt-3 grid grid-cols-1 gap-1 text-sm text-slate-300">
                        <p>
                          <span className="text-slate-500">Číslo smlouvy:</span>{" "}
                          <span className="text-slate-900">{c.contractNumber ?? "—"}</span>
                        </p>
                        {c.clientName && (
                          <p>
                            <span className="text-slate-500">Klient:</span>{" "}
                            <span className="text-slate-900">{c.clientName}</span>
                          </p>
                        )}
                        <p>
                          <span className="text-slate-500">Datum sjednání:</span>{" "}
                          <span className="text-slate-900">{signedStr}</span>
                        </p>
                        {adviserName && (
                          <p>
                            <span className="text-slate-500">Sjednal:</span>{" "}
                            <span className="text-slate-900">{adviserName}</span>
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="border-t border-slate-200 pt-3 sm:border-l sm:border-t-0 sm:border-slate-200 sm:pl-5 sm:pt-0">
                      <div className="flex items-end justify-between gap-3 sm:h-full sm:flex-col sm:items-end sm:justify-between">
                        <div className="text-right">
                          <span className="text-[11px] uppercase tracking-[0.12em] text-slate-500">
                            Pojistné
                          </span>
                          <div className="mt-1 whitespace-nowrap text-4xl leading-none font-semibold tracking-tight text-slate-900">
                            {formatMoney(premiumDisplay.amount)}
                          </div>
                          {premiumDisplay.cadenceLabel && (
                            <div className="mt-1 text-[11px] uppercase tracking-[0.12em] text-slate-500">
                              {premiumDisplay.cadenceLabel}
                            </div>
                          )}
                        </div>
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${
                            c.paid
                              ? "border-emerald-600 bg-emerald-600 text-white"
                              : "border-rose-600 bg-rose-600 text-white"
                          }`}
                        >
                          {c.paid ? "Zaplaceno" : "Nezaplaceno"}
                        </span>
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
            </div>

            {hasMoreContracts && !loading && (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-sm text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loadingMore ? "Načítám…" : "Načíst dalších 10"}
                </button>
              </div>
            )}
          </div>
        )}

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
        <div className="fixed inset-0 z-30 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setFilterModalOpen(false)}
          />
          <div className="relative w-full max-w-lg space-y-4 rounded-3xl border border-slate-900 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
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
                          : "border-slate-900 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span className="text-sm font-medium">{cat.label}</span>
                      <span
                        className={`h-5 w-5 rounded-full border ${
                          active
                            ? "border-slate-900 bg-white text-slate-900"
                            : "border-slate-900"
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
                          : "border-slate-900 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span className="text-sm font-medium">{inst.label}</span>
                      <span
                        className={`h-5 w-5 rounded-full border ${
                          active
                            ? "border-slate-900 bg-white text-slate-900"
                            : "border-slate-900"
                        }`}
                      >
                        {active ? "✓" : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-between pt-2 text-sm">
              <button
                type="button"
                onClick={() => {
                  setSelectedCategories(new Set());
                  setSelectedInstitutions(new Set());
                }}
                className="rounded-xl border border-slate-900 bg-white px-4 py-2 text-slate-900 hover:bg-slate-50"
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
      <div className="min-h-screen w-full bg-white px-3 py-6 sm:px-4 sm:py-8 lg:px-8">
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
