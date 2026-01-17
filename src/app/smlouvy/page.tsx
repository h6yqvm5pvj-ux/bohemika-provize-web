// src/app/smlouvy/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

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
  property: ["cppPPRs", "cppPPRbez", "domex", "maxdomov", "cppsimplex"],
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

function formatMoney(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value)) return "0 Kč";
  return (
    value.toLocaleString("cs-CZ", {
      maximumFractionDigits: 0,
    }) + " Kč"
  );
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

function readContractsCache(email: string | null | undefined): ContractsCache | null {
  if (!email || typeof window === "undefined") return null;
  const normalized = email.toLowerCase();
  try {
    const raw = sessionStorage.getItem(CONTRACTS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ContractsCache;
    if (parsed.userEmail !== normalized) return null;
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

export default function ContractsPage() {
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
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkMarking, setBulkMarking] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<Set<ProductCategory>>(new Set());
  const [selectedInstitutions, setSelectedInstitutions] = useState<Set<Institution>>(new Set());

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

  // auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      setUser(fbUser);
    });
    return () => unsub();
  }, []);

  // load pozice + smlouvy
  useEffect(() => {
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
        setMyCursorDate(
          cached.myCursorDate ? new Date(cached.myCursorDate) : null
        );
        setTeamCursorDate(
          cached.teamCursorDate ? new Date(cached.teamCursorDate) : null
        );
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

      try {
        const data = await apiFetchContracts({ scope: "my", includeTeam: true });
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
      } catch (e) {
        console.error("Chyba při načítání smluv:", e);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user, apiFetchContracts]);

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
  ]);

  const hasMoreContracts =
    showTeam && canShowTeamToggle ? teamHasMore : myHasMore;

  const wantsFullScan =
    filterMode === "anniversary" || searchText.trim() !== "";
  const hasMoreActive =
    showTeam && canShowTeamToggle ? teamHasMore : myHasMore;

  useEffect(() => {
    if (!wantsFullScan) return;
    if (!user?.email) return;
    if (loading || loadingMore) return;
    if (!hasMoreActive) return;
    void handleLoadMore(); // při vyhledávání/anniversary postupně načti vše, ne jen první stránku
  }, [
    wantsFullScan,
    user?.email,
    loading,
    loadingMore,
    hasMoreActive,
    showTeam,
    canShowTeamToggle,
    handleLoadMore,
  ]);

  useEffect(() => {
    setSelectedKeys(new Set());
    setSelectMode(false);
  }, [filterMode, searchText, showTeam]);

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
      <div className="w-full max-w-5xl space-y-6">
        {/* HEADER */}
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <SplitTitle text="Smlouvy" />

          {canShowTeamToggle && (
            <div className="inline-flex rounded-full bg-slate-950/70 border border-white/15 p-1 text-xs shadow-lg shadow-black/40 self-start sm:self-end">
              <button
                type="button"
                onClick={() => setShowTeam(false)}
                className={`px-3 py-1.5 rounded-full transition ${
                  !showTeam
                    ? "bg-white text-slate-900 shadow-md"
                    : "text-slate-200"
                }`}
              >
                Moje smlouvy
              </button>
              <button
                type="button"
                onClick={() => setShowTeam(true)}
                className={`px-3 py-1.5 rounded-full transition ${
                  showTeam
                    ? "bg-white text-slate-900 shadow-md"
                    : "text-slate-200"
                }`}
              >
                Týmové smlouvy
              </button>
            </div>
          )}
        </header>

        {/* SEARCH BAR + FILTER + BULK ACTIONS */}
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/5 border border-white/15 shadow-[0_14px_40px_rgba(0,0,0,0.6)] backdrop-blur-xl flex-1">
            <span className="text-sm">🔍</span>
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Hledat klienta nebo číslo smlouvy"
              className="w-full bg-transparent border-none outline-none text-sm text-slate-50 placeholder:text-slate-400"
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <div className="inline-flex rounded-full bg-slate-950/70 border border-white/15 p-1 text-xs shadow-inner shadow-black/60">
              <button
                type="button"
                onClick={() => setFilterMode("latest")}
                className={`px-3 py-1.5 rounded-full transition ${
                  filterMode === "latest"
                    ? "bg-white text-slate-900 shadow-md"
                    : "text-slate-200"
                }`}
              >
                Nejnovější
              </button>
              <button
                type="button"
                onClick={() => setFilterMode("anniversary")}
                className={`px-3 py-1.5 rounded-full transition ${
                  filterMode === "anniversary"
                    ? "bg-white text-slate-900 shadow-md"
                    : "text-slate-200"
                }`}
              >
                Blížící se výročí
              </button>
            </div>

            <div className="inline-flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFilterModalOpen(true)}
                className="rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-white/20"
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
                    ? "border-rose-300/70 bg-rose-500/15 text-rose-100"
                    : "border-white/25 bg-white/10 text-slate-100 hover:bg-white/20"
                }`}
              >
                {selectMode ? "Zrušit výběr" : "Hromadný výběr"}
              </button>
              {selectMode && (
                <button
                  type="button"
                  disabled={selectedKeys.size === 0 || bulkDeleting}
                  onClick={handleBulkDelete}
                  className="rounded-full border border-rose-300 bg-rose-500/80 text-slate-900 px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
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
                  className="rounded-full border border-emerald-300 bg-emerald-500/80 text-emerald-950 px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
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
        {loading ? (
          <p className="text-sm text-slate-300 mt-4">
            Načítám smlouvy…
          </p>
        ) : filteredContracts.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-white/15 bg-white/5 backdrop-blur-lg px-6 py-8 text-center text-sm text-slate-200 space-y-2">
            {filterMode === "anniversary" ? (
              <>
                <p className="font-medium">Žádná blížící se výročí</p>
                <p className="text-slate-300 text-xs">
                  V okně 60 dní a méně od dneška není žádné výročí (počítáno z data
                  počátku smlouvy, případně podpisu).
                </p>
              </>
            ) : searchText.trim() !== "" ? (
              <>
                <p className="font-medium">Nic nenalezeno</p>
                <p className="text-slate-300 text-xs">
                  Zkus upravit hledaný text (klient nebo číslo smlouvy).
                </p>
              </>
            ) : showTeam && hasTeamContracts ? (
              <>
                <p className="font-medium">Žádné týmové smlouvy</p>
                <p className="text-slate-300 text-xs">
                  Až podřízení něco vypočítají a označí jako sepsané,
                  uvidíš je tady.
                </p>
              </>
            ) : (
              <>
                <p className="font-medium">
                  Žádné smlouvy zatím nejsou.
                </p>
                <p className="text-slate-300 text-xs">
                  Až něco vypočítáš v kalkulačce a označíš jako sepsané,
                  objeví se zde.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {bulkError && (
              <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
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

                const CardContent = (
                  <article
                    className={`relative flex h-full flex-col sm:flex-row sm:items-center gap-4 rounded-2xl border border-white/15 bg-white/[0.04] backdrop-blur-2xl px-4 py-3 shadow-[0_18px_60px_rgba(0,0,0,0.8)] hover:border-sky-400/70 hover:bg-white/[0.08] transition ${
                      isSelected ? "border-emerald-400/80 ring-2 ring-emerald-300/50" : ""
                    }`}
                  >
                  {/* levý barevný pruh */}
                  <div className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-gradient-to-b from-sky-400 via-indigo-400 to-emerald-400" />

                  {selectMode && (
                    <div className="absolute right-3 top-3">
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full border ${
                          isSelected
                            ? "bg-emerald-400 text-slate-900 border-emerald-300"
                            : "border-white/30 bg-white/10 text-slate-200"
                        }`}
                      >
                        ✓
                      </span>
                    </div>
                  )}

                  {/* TEXTOVÁ ČÁST */}
                  <div className="pl-3 flex-1 space-y-1">
                    {/* Název produktu */}
                    <div className="text-sm sm:text-base font-semibold text-slate-50">
                      {productLabel(c.productKey)}
                    </div>

                    {/* Blížící se výročí */}
                    {anniversaryInfo.soon && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-100"
                        title={
                          anniversaryInfo.next
                            ? `Výročí: ${anniversaryInfo.next.toLocaleDateString(
                                "cs-CZ"
                              )}`
                            : undefined
                        }
                      >
                        <span className="text-xs">⏳</span>
                        {anniversaryInfo.daysLeft != null
                          ? `${formatDaysLeft(anniversaryInfo.daysLeft)} do výročí`
                          : "Blížící se výročí"}
                      </span>
                    )}

                    {/* Číslo smlouvy */}
                    <p className="text-[11px] sm:text-xs text-slate-300">
                      <span className="font-medium text-slate-200">
                        Číslo smlouvy:{" "}
                      </span>
                      <span>{c.contractNumber ?? "—"}</span>
                    </p>

                    {/* Klient */}
                    {c.clientName && (
                      <p className="text-[11px] sm:text-xs text-slate-300">
                        <span className="font-medium text-slate-200">
                          Klient:{" "}
                        </span>
                        <span>{c.clientName}</span>
                      </p>
                    )}

                    {/* Sjednal (jen u týmových smluv) */}
                    {adviserName && (
                      <p className="text-[11px] sm:text-xs text-slate-300">
                        <span className="font-medium text-slate-200">
                          Sjednal:{" "}
                        </span>
                        <span>{adviserName}</span>
                      </p>
                    )}

                    {/* Datum sjednání */}
                    <p className="text-[11px] sm:text-xs text-slate-300">
                      <span className="font-medium text-slate-200">
                        Datum sjednání:{" "}
                      </span>
                      <span>{signedStr}</span>
                    </p>
                  </div>

                  {/* POJISTNÉ VPRAVO */}
                  <div className="flex flex-row sm:flex-col items-end sm:items-end gap-2 min-w-[140px]">
                    <div className="flex flex-row sm:flex-col items-end sm:items-end gap-1">
                      <span className="text-[11px] sm:text-xs uppercase tracking-wide text-slate-300">
                        Pojistné
                      </span>
                      <span className="text-base sm:text-lg font-semibold text-slate-50">
                        {formatMoney(c.inputAmount ?? 0)}
                      </span>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold border ${
                        c.paid
                          ? "bg-emerald-500/15 border-emerald-400/50 text-emerald-100"
                          : "bg-rose-500/15 border-rose-400/50 text-rose-100"
                      }`}
                    >
                      {c.paid ? "Zaplaceno" : "Nezaplaceno"}
                    </span>
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
                  href={`/smlouvy/${slug}`}
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
                  className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm text-slate-50 hover:bg-white/10 transition shadow-[0_10px_30px_rgba(0,0,0,0.6)] disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loadingMore ? "Načítám…" : "Načíst dalších 10"}
                </button>
              </div>
            )}
          </div>
        )}

        {!loading && !hasTeamContracts && canShowTeamToggle && (
          <p className="text-[11px] text-slate-400 pt-1">
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
          <div className="relative w-full max-w-lg rounded-3xl border border-white/15 bg-slate-950/80 backdrop-blur-2xl p-6 space-y-4 shadow-[0_24px_80px_rgba(0,0,0,0.85)]">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-50">Filtry</h3>
              <button
                type="button"
                onClick={() => setFilterModalOpen(false)}
                className="text-sm text-slate-300 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-100">Produkty</p>
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
                          ? "border-emerald-400/70 bg-emerald-500/10 text-emerald-50"
                          : "border-white/20 bg-white/5 text-slate-200 hover:border-white/35"
                      }`}
                    >
                      <span className="text-sm font-medium">{cat.label}</span>
                      <span
                        className={`h-5 w-5 rounded-full border ${
                          active
                            ? "bg-emerald-400 border-emerald-300 text-emerald-950"
                            : "border-white/30"
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
              <p className="text-sm font-semibold text-slate-100">Instituce</p>
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
                          ? "border-emerald-400/70 bg-emerald-500/10 text-emerald-50"
                          : "border-white/20 bg-white/5 text-slate-200 hover:border-white/35"
                      }`}
                    >
                      <span className="text-sm font-medium">{inst.label}</span>
                      <span
                        className={`h-5 w-5 rounded-full border ${
                          active
                            ? "bg-emerald-400 border-emerald-300 text-emerald-950"
                            : "border-white/30"
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
                className="rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-slate-100 hover:bg-white/10"
              >
                Vymazat filtry
              </button>
              <button
                type="button"
                onClick={() => setFilterModalOpen(false)}
                className="rounded-xl bg-emerald-500/80 px-4 py-2 font-semibold text-emerald-950 hover:bg-emerald-400"
              >
                Použít
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
