"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";

import { AppLayout } from "@/components/AppLayout";
import { auth, db } from "@/app/firebase";
import { type Position, type Product, type PaymentFrequency } from "@/app/types/domain";
import SplitTitle from "../pomucky/plan-produkce/SplitTitle";

type Member = {
  email: string;
  name: string;
  position?: Position | null;
  managerEmail?: string | null;
  docId?: string;
};

type FirestoreTimestamp = {
  seconds: number;
  nanoseconds?: number;
};

function nameFromEmail(email: string | null | undefined): string {
  if (!email) return "Neznámý uživatel";
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[.\-_]/).filter(Boolean);
  if (!parts.length) return email;
  const cap = (s: string) => (s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1).toLowerCase());
  return parts.map(cap).join(" ");
}

function positionLabel(pos?: Position | null): string {
  if (!pos) return "—";
  const map: Record<Position, string> = {
    poradce1: "Poradce 1",
    poradce2: "Poradce 2",
    poradce3: "Poradce 3",
    poradce4: "Poradce 4",
    poradce5: "Poradce 5",
    poradce6: "Poradce 6",
    poradce7: "Poradce 7",
    poradce8: "Poradce 8",
    poradce9: "Poradce 9",
    poradce10: "Poradce 10",
    manazer4: "Manažer 4",
    manazer5: "Manažer 5",
    manazer6: "Manažer 6",
    manazer7: "Manažer 7",
    manazer8: "Manažer 8",
    manazer9: "Manažer 9",
    manazer10: "Manažer 10",
  };
  return map[pos] ?? pos;
}

const POSITION_OPTIONS: { id: Position; label: string }[] = [
  { id: "poradce1", label: "Poradce 1" },
  { id: "poradce2", label: "Poradce 2" },
  { id: "poradce3", label: "Poradce 3" },
  { id: "poradce4", label: "Poradce 4" },
  { id: "poradce5", label: "Poradce 5" },
  { id: "poradce6", label: "Poradce 6" },
  { id: "poradce7", label: "Poradce 7" },
  { id: "poradce8", label: "Poradce 8" },
  { id: "poradce9", label: "Poradce 9" },
  { id: "poradce10", label: "Poradce 10" },
  { id: "manazer4", label: "Manažer 4" },
  { id: "manazer5", label: "Manažer 5" },
  { id: "manazer6", label: "Manažer 6" },
  { id: "manazer7", label: "Manažer 7" },
  { id: "manazer8", label: "Manažer 8" },
  { id: "manazer9", label: "Manažer 9" },
  { id: "manazer10", label: "Manažer 10" },
];

function isManagerPosition(pos?: Position | null): boolean {
  if (!pos) return false;
  return pos.startsWith("manazer");
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "object" && value !== null && "toDate" in value && typeof (value as any).toDate === "function") {
    const d = (value as any).toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "object" && value !== null && "seconds" in value && typeof (value as any).seconds === "number") {
    const v = value as FirestoreTimestamp;
    const ms = v.seconds * 1000 + Math.floor((v.nanoseconds ?? 0) / 1_000_000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value as any);
  return Number.isNaN(d.getTime()) ? null : d;
}

const ONLINE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minut
const RECENT_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 1 den

type Category = "life" | "auto" | "property" | "travel" | "comfort" | "other";
type ProductionCategory = "life" | "auto" | "property" | "travel" | "comfort";
type AggregateMetrics = { contracts: number; annualPremium: number; monthlyPremium: number };
type ContractStats = {
  total: number;
  month: number;
  categories: Record<Category, number>;
  categoryMetrics: Record<Category, AggregateMetrics>;
  institutionMetrics: Record<string, AggregateMetrics>;
  institutionByCategory: Record<Category, Record<string, AggregateMetrics>>;
};
const PRODUCTION_CATEGORY_TABS: { key: ProductionCategory; label: string }[] = [
  { key: "life", label: "Životní pojištění" },
  { key: "auto", label: "Auta" },
  { key: "property", label: "Majetek" },
  { key: "comfort", label: "Zlato" },
  { key: "travel", label: "Cestovko" },
];
const LIFE_PRODUCTS = new Set<Product>(["neon", "flexi", "maximaMaxEfekt", "pillowInjury"]);

function categorizeProduct(p?: Product | null): Category {
  switch (p) {
    case "neon":
    case "flexi":
    case "maximaMaxEfekt":
    case "pillowInjury":
      return "life";
    case "cppAuto":
    case "allianzAuto":
    case "csobAuto":
    case "uniqaAuto":
    case "pillowAuto":
    case "kooperativaAuto":
      return "auto";
    case "domex":
    case "koopmajetekobcan":
    case "maxdomov":
    case "cppPPRbez":
    case "cppPPRs":
    case "zamex":
    case "cppsimplex":
      return "property";
    case "cppcestovko":
    case "axacestovko":
      return "travel";
    case "comfortcc":
      return "comfort";
    default:
      return "other";
  }
}

function institutionLabelForProduct(product?: Product | null): string {
  switch (product) {
    case "neon":
    case "domex":
    case "cppAuto":
    case "cppcestovko":
    case "cppPPRbez":
    case "cppPPRs":
    case "cppsimplex":
    case "zamex":
      return "ČPP";
    case "flexi":
    case "koopmajetekobcan":
    case "kooperativaAuto":
      return "Kooperativa";
    case "maximaMaxEfekt":
    case "maxdomov":
      return "Maxima";
    case "allianzAuto":
      return "Allianz";
    case "uniqaAuto":
      return "UNIQA";
    case "csobAuto":
      return "ČSOB";
    case "pillowAuto":
    case "pillowInjury":
      return "Pillow";
    case "axacestovko":
      return "AXA";
    case "comfortcc":
      return "Comfort Commodity";
    default:
      return "Ostatní";
  }
}

function insurerLogoPath(insurer: string): string | null {
  const normalized = insurer.toLowerCase();
  if (normalized.includes("čpp") || normalized.includes("cpp")) return "/icons/cpp.png";
  if (normalized.includes("kooperativa")) return "/icons/koop.png";
  if (normalized.includes("maxima")) return "/icons/maxima.png";
  if (normalized.includes("allianz")) return "/icons/allianz.png";
  if (normalized.includes("uniqa")) return "/icons/uniqa.png";
  if (normalized.includes("čsob") || normalized.includes("csob")) return "/icons/csob.png";
  if (normalized.includes("pillow")) return "/icons/pillow.png";
  if (normalized.includes("generali")) return "/icons/generali.png";
  if (normalized.includes("metlife")) return "/icons/metlife.png";
  if (normalized.includes("nn")) return "/icons/nn.png";
  return null;
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

function annualPremiumFromEntry(data: any, category: Category): number {
  const raw = Number(data?.inputAmount ?? 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  const product = data?.productKey as Product | undefined;
  if (product && LIFE_PRODUCTS.has(product)) {
    return raw * 12;
  }
  if (category === "comfort") {
    return raw;
  }
  return raw * paymentsPerYear((data?.frequencyRaw ?? "annual") as PaymentFrequency);
}

function formatMoney(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 Kč";
  return `${Math.round(value).toLocaleString("cs-CZ")} Kč`;
}

function emptyCategoryCounts(): Record<Category, number> {
  return {
    life: 0,
    auto: 0,
    property: 0,
    travel: 0,
    comfort: 0,
    other: 0,
  };
}

function emptyCategoryMetrics(): Record<Category, AggregateMetrics> {
  return {
    life: { contracts: 0, annualPremium: 0, monthlyPremium: 0 },
    auto: { contracts: 0, annualPremium: 0, monthlyPremium: 0 },
    property: { contracts: 0, annualPremium: 0, monthlyPremium: 0 },
    travel: { contracts: 0, annualPremium: 0, monthlyPremium: 0 },
    comfort: { contracts: 0, annualPremium: 0, monthlyPremium: 0 },
    other: { contracts: 0, annualPremium: 0, monthlyPremium: 0 },
  };
}

function emptyInstitutionByCategory(): Record<Category, Record<string, AggregateMetrics>> {
  return {
    life: {},
    auto: {},
    property: {},
    travel: {},
    comfort: {},
    other: {},
  };
}

const formatRelative = (ts: number | null | undefined): string => {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  if (diff < 0) return "právě teď";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "před chvílí";
  if (minutes < 60) return `před ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `před ${hours} h`;
  const days = Math.floor(hours / 24);
  return `před ${days} dny`;
};

type TeamCachePayload = {
  members: Member[];
  lastActive: Record<string, number | null>;
  contractCounts: Record<string, ContractStats>;
  contractsLoaded: boolean;
  contractsError: boolean;
  userPosition: Position | null;
  canManagePositions: boolean;
};

const TEAM_CACHE_TTL_MS = 60 * 1000;
const teamDataCache: Record<string, { ts: number; payload: TeamCachePayload }> = {};

type ActivityFilter = "all" | "online" | "recent" | "unknown";
type SortKey = "activity" | "month" | "total" | "name";

const ACTIVITY_FILTERS: { key: ActivityFilter; label: string }[] = [
  { key: "all", label: "Všichni" },
  { key: "online", label: "Online" },
  { key: "recent", label: "Aktivní 24h" },
  { key: "unknown", label: "Bez aktivity" },
];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "activity", label: "Nejaktivnější" },
  { key: "month", label: "Smlouvy tento měsíc" },
  { key: "total", label: "Celkem smluv" },
  { key: "name", label: "Jméno A-Z" },
];

export default function TeamPage() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [lastActive, setLastActive] = useState<Record<string, number | null>>({});
  const [contractCounts, setContractCounts] = useState<Record<string, ContractStats>>({});
  const [contractsLoaded, setContractsLoaded] = useState(false);
  const [, setContractsRefreshing] = useState(false);
  const [contractsError, setContractsError] = useState(false);
  const [userPosition, setUserPosition] = useState<Position | null>(null);
  const [canManagePositions, setCanManagePositions] = useState(false);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [sortBy, setSortBy] = useState<SortKey>("activity");
  const [productionCategory, setProductionCategory] = useState<ProductionCategory>("life");
  const [detailTab, setDetailTab] = useState<"overview" | "subordinates">("overview");
  const [showMembersPanel, setShowMembersPanel] = useState(true);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [positionModalOpen, setPositionModalOpen] = useState(false);
  const [positionDraft, setPositionDraft] = useState<Position>("poradce1");
  const [savingPosition, setSavingPosition] = useState(false);
  const [positionSaveError, setPositionSaveError] = useState<string | null>(null);
  const [positionSaveSuccess, setPositionSaveSuccess] = useState(false);
  const copyEmailTimerRef = useRef<number | null>(null);
  const positionSaveTimerRef = useRef<number | null>(null);
  const usedCacheRef = useRef(false);
  const cacheStateRef = useRef<{
    contractCounts: Record<string, ContractStats>;
    contractsLoaded: boolean;
    contractsError: boolean;
  }>({
    contractCounts: {},
    contractsLoaded: false,
    contractsError: false,
  });

  const cacheKey = useMemo(() => (userEmail ? `team:${userEmail}` : null), [userEmail]);

  const applyCachedTeamState = (payload: TeamCachePayload) => {
    setMembers(payload.members);
    setLastActive(payload.lastActive);
    setContractCounts(payload.contractCounts);
    setContractsLoaded(payload.contractsLoaded);
    setContractsError(payload.contractsError);
    setUserPosition(payload.userPosition);
    setCanManagePositions(payload.canManagePositions);
  };

  useEffect(() => {
    cacheStateRef.current = {
      contractCounts,
      contractsLoaded,
      contractsError,
    };
  }, [contractCounts, contractsLoaded, contractsError]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u?.email) {
        setUserEmail(null);
        router.push("/login");
        return;
      }
      const em = u.email.toLowerCase();
      setUserEmail(em);
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    const loadTeam = async () => {
      if (!userEmail) {
        setMembers([]);
        setUserPosition(null);
        setCanManagePositions(false);
        setLoading(false);
        return;
      }

      let pos: Position | null = null;
      let canManage = false;
      let lastActiveMap: Record<string, number | null> = {};
      let all: Member[] = [];

      if (cacheKey) {
        const cached = teamDataCache[cacheKey];
        if (cached && Date.now() - cached.ts < TEAM_CACHE_TTL_MS) {
          applyCachedTeamState(cached.payload);
          setLoading(false);
          usedCacheRef.current = true;
          return;
        }
      }

      setLoading(true);
      try {
        const usersCol = collection(db, "users");
        // načtení vlastního profilu
        let meData: any = null;
        let meDocId = userEmail;
        try {
          const meSnap = await getDoc(doc(usersCol, userEmail));
          meData = meSnap.exists() ? (meSnap.data() as any) : null;
          meDocId = meSnap.id;
          pos = (meData?.position as Position | undefined) ?? null;
          canManage = meData?.adminFunction === true || meData?.adminfunction === true;
          setUserPosition(pos);
          setCanManagePositions(canManage);
        } catch (err) {
          console.error("Chyba při načítání pozice uživatele", err);
          setUserPosition(null);
          setCanManagePositions(false);
        }
        const ownEmail = ((meData?.email as string | undefined)?.trim() || userEmail).toLowerCase();
        const queue = [ownEmail];
        const visited = new Set<string>();
        all = [];
        const seededLastActive: Record<string, number | null> = {};

        // aktuálně přihlášený uživatel musí být v seznamu vždy
        const ownLastActive = toDate(meData?.lastActive)?.getTime();
        seededLastActive[ownEmail] = Number.isFinite(ownLastActive) ? Number(ownLastActive) : null;
        all.push({
          email: ownEmail,
          name: nameFromEmail(ownEmail),
          position: pos,
          managerEmail: ((meData?.managerEmail as string | undefined)?.toLowerCase() ?? null),
          docId: meDocId,
        });
        visited.add(ownEmail);

        while (queue.length > 0) {
          const mgr = queue.shift()!;
          const snap = await getDocs(query(usersCol, where("managerEmail", "==", mgr)));
          for (const docSnap of snap.docs) {
            const data = docSnap.data() as any;
            const docId = docSnap.id;
            const rawEmail = (data.email as string | undefined)?.trim() || docId;
            const em = rawEmail.toLowerCase();
            if (!em || visited.has(em)) continue;
            visited.add(em);
            const pos = (data.position as Position | undefined) ?? null;
            const rawLastActive = toDate(data.lastActive)?.getTime();
            seededLastActive[em] = Number.isFinite(rawLastActive) ? Number(rawLastActive) : null;
            all.push({
              email: em,
              name: nameFromEmail(em),
              position: pos,
              managerEmail: ((data.managerEmail as string | undefined)?.toLowerCase() ?? mgr),
              docId,
            });
            queue.push(em);
          }
        }

        setMembers(all);
        if (all.length) {
          setSelectedEmail((prev) => prev ?? all[0]?.email ?? null);
        }

        // načti poslední aktivitu (uložená statistika) pro každého
        const entries = await Promise.all(
          all.map(async (m) => {
            const seeded = seededLastActive[m.email];
            if (typeof seeded === "number" && Number.isFinite(seeded)) {
              return [m.email, seeded] as const;
            }

            const candidateIds = Array.from(new Set([m.docId, m.email].filter(Boolean))) as string[];
            for (const id of candidateIds) {
              const userRef = doc(db, "users", id);
              try {
                let userDoc = await getDoc(userRef);
                let lastActiveUser = toDate((userDoc.data() as any)?.lastActive);
                if (!lastActiveUser) {
                  try {
                    userDoc = await getDocFromServer(userRef);
                    lastActiveUser = toDate((userDoc.data() as any)?.lastActive);
                  } catch (err) {
                    if (process.env.NODE_ENV !== "production") {
                      console.info("[lastActive] server read failed", { email: m.email, id, err });
                    }
                  }
                }
                if (lastActiveUser) {
                  return [m.email, lastActiveUser.getTime()] as const;
                }
              } catch (err) {
                if (process.env.NODE_ENV !== "production") {
                  console.info("[lastActive] read failed", { email: m.email, id, err });
                }
              }
            }

            return [m.email, null] as const;
          })
        );
        lastActiveMap = Object.fromEntries(entries);
        setLastActive(lastActiveMap);
      } catch (e) {
        console.error("Chyba při načítání týmu", e);
        setMembers([]);
      } finally {
        setLoading(false);

        if (cacheKey) {
          teamDataCache[cacheKey] = {
            ts: Date.now(),
            payload: {
              members: all,
              lastActive: lastActiveMap,
              contractCounts: cacheStateRef.current.contractCounts,
              contractsLoaded: cacheStateRef.current.contractsLoaded,
              contractsError: cacheStateRef.current.contractsError,
              userPosition: pos,
              canManagePositions: canManage,
            },
          };
        }
      }
    };

    loadTeam();
    // only depends on signed-in user; selection should not retrigger fetch
  }, [userEmail, cacheKey]);

  useEffect(() => {
    const loadContractCounts = async () => {
      // použij cache jen jako skeleton, ale vždy načti čerstvá data
      if (cacheKey) {
        const cached = teamDataCache[cacheKey];
        if (cached && Date.now() - cached.ts < TEAM_CACHE_TTL_MS && cached.payload.contractsLoaded) {
          applyCachedTeamState(cached.payload);
        }
      }

      if (members.length === 0) {
        setContractCounts({});
        setContractsLoaded(true);
        setContractsError(false);
        return;
      }
      if (Object.keys(cacheStateRef.current.contractCounts).length === 0) {
        setContractsLoaded(false);
      }
      setContractsRefreshing(true);
      setContractsError(false);
      const stats: Record<string, ContractStats> = {};
      try {
        const emails = Array.from(new Set(members.map((m) => m.email.toLowerCase()))); // dedupe
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
        const entries = collectionGroup(db, "entries");
        const chunkSize = 10;

        for (let i = 0; i < emails.length; i += chunkSize) {
          const chunk = emails.slice(i, i + chunkSize);
          const snap = await getDocs(query(entries, where("userEmail", "in", chunk)));
          snap.docs.forEach((docSnap) => {
            const data = docSnap.data() as any;
            const email = (data.userEmail as string | undefined)?.toLowerCase();
            if (!email) return;
            const current =
              stats[email] ?? {
                total: 0,
                month: 0,
                categories: emptyCategoryCounts(),
                categoryMetrics: emptyCategoryMetrics(),
                institutionMetrics: {},
                institutionByCategory: emptyInstitutionByCategory(),
              };
            current.total += 1;
            const category = categorizeProduct(data.productKey as Product | undefined);
            current.categories[category] = (current.categories[category] ?? 0) + 1;
            const annualPremium = annualPremiumFromEntry(data, category);
            const monthlyPremium = annualPremium / 12;
            const byCategory = current.categoryMetrics[category] ?? { contracts: 0, annualPremium: 0, monthlyPremium: 0 };
            byCategory.contracts += 1;
            byCategory.annualPremium += annualPremium;
            byCategory.monthlyPremium += monthlyPremium;
            current.categoryMetrics[category] = byCategory;

            const institution = institutionLabelForProduct(data.productKey as Product | undefined);
            const byInstitution = current.institutionMetrics[institution] ?? { contracts: 0, annualPremium: 0, monthlyPremium: 0 };
            byInstitution.contracts += 1;
            byInstitution.annualPremium += annualPremium;
            byInstitution.monthlyPremium += monthlyPremium;
            current.institutionMetrics[institution] = byInstitution;
            const byInstitutionForCategory = current.institutionByCategory[category][institution] ?? {
              contracts: 0,
              annualPremium: 0,
              monthlyPremium: 0,
            };
            byInstitutionForCategory.contracts += 1;
            byInstitutionForCategory.annualPremium += annualPremium;
            byInstitutionForCategory.monthlyPremium += monthlyPremium;
            current.institutionByCategory[category][institution] = byInstitutionForCategory;

            const date = toDate((data as any).contractSignedDate ?? data.createdAt);
            const ts = date?.getTime();
            if (ts != null && ts >= monthStart && ts < nextMonthStart) {
              current.month += 1;
            }
            stats[email] = current;
          });
        }

        setContractCounts(stats);
      } catch (e) {
        console.error("Chyba při načítání počtu smluv", e);
        setContractCounts({});
        setContractsError(true);
      } finally {
        setContractsLoaded(true);
        setContractsRefreshing(false);

        if (cacheKey) {
          teamDataCache[cacheKey] = {
            ts: Date.now(),
            payload: {
              members,
              lastActive,
              contractCounts: stats ?? {},
              contractsLoaded: true,
              contractsError,
              userPosition,
              canManagePositions,
            },
          };
        }
      }
    };

    if (usedCacheRef.current && contractsLoaded) return;

    void loadContractCounts();
  }, [members, cacheKey, lastActive, userPosition, canManagePositions, contractsLoaded, contractsError]);

  const filteredMembers = useMemo(() => {
    const term = search.trim().toLowerCase();

    const base = members.filter((m) => {
      const searchOk = !term || m.name.toLowerCase().includes(term) || m.email.toLowerCase().includes(term);
      if (!searchOk) return false;
      if (activityFilter === "all") return true;
      const ts = lastActive[m.email];
      if (!ts) return activityFilter === "unknown";
      const diff = Date.now() - ts;
      if (activityFilter === "online") return diff <= ONLINE_THRESHOLD_MS;
      if (activityFilter === "recent") return diff <= RECENT_THRESHOLD_MS;
      return false;
    });

    const toActivityRank = (email: string) => {
      const ts = lastActive[email];
      if (!ts) return Number.NEGATIVE_INFINITY;
      return ts;
    };

    return base.sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name, "cs");
      if (sortBy === "month") {
        const aVal = contractCounts[a.email]?.month ?? 0;
        const bVal = contractCounts[b.email]?.month ?? 0;
        if (aVal !== bVal) return bVal - aVal;
      }
      if (sortBy === "total") {
        const aVal = contractCounts[a.email]?.total ?? 0;
        const bVal = contractCounts[b.email]?.total ?? 0;
        if (aVal !== bVal) return bVal - aVal;
      }
      // default i fallback: nejaktivnější první
      const actDiff = toActivityRank(b.email) - toActivityRank(a.email);
      if (actDiff !== 0) return actDiff;
      return a.name.localeCompare(b.name, "cs");
    });
  }, [members, search, activityFilter, sortBy, lastActive, contractCounts]);

  useEffect(() => {
    if (!filteredMembers.length) {
      setSelectedEmail(null);
      return;
    }
    setSelectedEmail((prev) => (prev && filteredMembers.some((m) => m.email === prev) ? prev : filteredMembers[0].email));
  }, [filteredMembers]);

  useEffect(() => {
    setDetailTab("overview");
    setPositionModalOpen(false);
    setPositionSaveError(null);
    setPositionSaveSuccess(false);
  }, [selectedEmail]);

  useEffect(() => {
    return () => {
      if (copyEmailTimerRef.current) window.clearTimeout(copyEmailTimerRef.current);
      if (positionSaveTimerRef.current) window.clearTimeout(positionSaveTimerRef.current);
    };
  }, []);

  const selected = members.find((m) => m.email === selectedEmail) ?? null;
  const selectedProductionRows = useMemo(() => {
    if (!selected) return [] as { name: string; contracts: number; annualPremium: number; monthlyPremium: number }[];
    const stats = contractCounts[selected.email];
    const raw = stats?.institutionByCategory?.[productionCategory] ?? {};
    return Object.entries(raw)
      .map(([name, row]) => ({
        name,
        contracts: row?.contracts ?? 0,
        annualPremium: row?.annualPremium ?? 0,
        monthlyPremium: row?.monthlyPremium ?? (row?.annualPremium ?? 0) / 12,
      }))
      .filter((row) => row.contracts > 0 || row.annualPremium > 0 || row.monthlyPremium > 0)
      .sort((a, b) => b.annualPremium - a.annualPremium || b.contracts - a.contracts || a.name.localeCompare(b.name, "cs"));
  }, [selected, productionCategory, contractCounts]);
  const selectedProductionTotals = useMemo(
    () =>
      selectedProductionRows.reduce(
        (acc, row) => ({
          contracts: acc.contracts + row.contracts,
          annualPremium: acc.annualPremium + row.annualPremium,
          monthlyPremium: acc.monthlyPremium + row.monthlyPremium,
        }),
        { contracts: 0, annualPremium: 0, monthlyPremium: 0 }
      ),
    [selectedProductionRows]
  );
  const subordinatesOfSelected = useMemo(
    () => (selected ? members.filter((m) => (m.managerEmail ?? "").toLowerCase() === selected.email) : []),
    [selected, members]
  );
  const isSelectedSubordinate = useMemo(
    () => !!selected?.email && !!userEmail && selected.email.toLowerCase() !== userEmail.toLowerCase(),
    [selected, userEmail]
  );
  const canEditSelectedPosition = canManagePositions && isSelectedSubordinate;

  const handleCopySelectedEmail = async () => {
    if (!selected?.email) return;
    try {
      await navigator.clipboard.writeText(selected.email);
      setCopiedEmail(true);
      if (copyEmailTimerRef.current) window.clearTimeout(copyEmailTimerRef.current);
      copyEmailTimerRef.current = window.setTimeout(() => setCopiedEmail(false), 1500);
    } catch {
      // clipboard může být blokovaný browserem
    }
  };

  const formatLastActive = (email: string): string => {
    const ts = lastActive[email];
    if (!ts) return "—";
    try {
      const d = new Date(ts);
      return d.toLocaleString("cs-CZ");
    } catch {
      return "—";
    }
  };

  const lastActiveBadge = (email: string) => {
    const ts = lastActive[email];
    const now = Date.now();
    if (!ts) {
      return {
        statusLabel: "Bez aktivity",
        relativeLabel: "bez záznamu",
        className: "bg-white text-slate-600 border-slate-300",
        dotClassName: "bg-slate-400",
        title: "Bez záznamu o aktivitě",
      };
    }
    const diff = now - ts;
    if (diff <= ONLINE_THRESHOLD_MS) {
      return {
        statusLabel: "Online",
        relativeLabel: formatRelative(ts),
        className: "bg-emerald-50 text-emerald-700 border-emerald-600",
        dotClassName: "bg-emerald-500",
        title: `Aktivní ${new Date(ts).toLocaleString("cs-CZ")}`,
      };
    }
    if (diff <= RECENT_THRESHOLD_MS) {
      return {
        statusLabel: "Aktivní dnes",
        relativeLabel: formatRelative(ts),
        className: "bg-amber-50 text-amber-700 border-amber-600",
        dotClassName: "bg-amber-500",
        title: `Naposledy ${new Date(ts).toLocaleString("cs-CZ")}`,
      };
    }
    return {
      statusLabel: "Bez aktivity",
      relativeLabel: formatRelative(ts),
      className: "bg-white text-slate-600 border-slate-300",
      dotClassName: "bg-slate-400",
      title: `Naposledy ${new Date(ts).toLocaleString("cs-CZ")}`,
    };
  };

  const contractCountLabel = (email: string, key: "total" | "month") => {
    if (contractsError) return "—";
    if (!contractsLoaded && Object.keys(contractCounts).length === 0) return "—";
    const stats = contractCounts[email];
    const value = key === "total" ? stats?.total : stats?.month;
    return value != null ? String(value) : "0";
  };

  const canSendTeamMessage = isManagerPosition(userPosition) && members.length > 0;

  const openPositionModal = () => {
    if (!selected || !canEditSelectedPosition) return;
    setPositionDraft(selected.position ?? "poradce1");
    setPositionSaveError(null);
    setPositionModalOpen(true);
  };

  const saveSelectedPosition = async () => {
    if (!selected || !canEditSelectedPosition) return;
    if (selected.position === positionDraft) {
      setPositionModalOpen(false);
      return;
    }
    setSavingPosition(true);
    setPositionSaveError(null);
    try {
      const targetId = selected.docId ?? selected.email;
      await updateDoc(doc(db, "users", targetId), {
        position: positionDraft,
      });

      setMembers((prev) =>
        prev.map((member) =>
          member.email === selected.email
            ? {
                ...member,
                position: positionDraft,
              }
            : member
        )
      );

      if (cacheKey && teamDataCache[cacheKey]) {
        teamDataCache[cacheKey] = {
          ...teamDataCache[cacheKey],
          payload: {
            ...teamDataCache[cacheKey].payload,
            members: teamDataCache[cacheKey].payload.members.map((member) =>
              member.email === selected.email
                ? {
                    ...member,
                    position: positionDraft,
                  }
                : member
            ),
          },
        };
      }

      setPositionModalOpen(false);
      setPositionSaveSuccess(true);
      if (positionSaveTimerRef.current) window.clearTimeout(positionSaveTimerRef.current);
      positionSaveTimerRef.current = window.setTimeout(() => {
        setPositionSaveSuccess(false);
      }, 3000);
    } catch (e: any) {
      if (e?.code === "permission-denied") {
        setPositionSaveError("Nemáš oprávnění měnit pozici tohoto uživatele.");
      } else {
        setPositionSaveError("Uložení se nepovedlo. Zkus to prosím znovu.");
      }
    } finally {
      setSavingPosition(false);
    }
  };

  return (
    <AppLayout active="team">
      <div className="w-full max-w-6xl space-y-6 px-1 py-1 font-mono text-slate-900 sm:px-2 sm:py-2">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <SplitTitle text="Můj tým" className="!text-slate-900" />
        </header>

        {loading ? (
          <p className="text-sm text-slate-600">Načítám tým…</p>
        ) : members.length === 0 ? (
          <p className="text-sm text-slate-600">Nemáš nastavené žádné podřízené.</p>
        ) : (
          <>
            <div className="ui-card space-y-3 rounded-3xl p-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-slate-900 bg-white px-3 py-2">
                  <span className="text-slate-500 text-sm">🔍</span>
                  <input
                    type="text"
                    placeholder="Jméno nebo e-mail"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-500"
                  />
                </div>

                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortKey)}
                  className="rounded-xl border border-slate-900 bg-white px-3 py-2 text-sm text-slate-900 outline-none hover:bg-slate-50"
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>

                <Link
                  href="/pomucky/struktura"
                  className="ui-btn-primary ui-focus inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm"
                >
                  Struktura
                </Link>
                {canSendTeamMessage ? (
                  <Link
                    href="/pomucky/zprava-tymu"
                    className="ui-btn-primary ui-focus inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm"
                  >
                    Zpráva týmu
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={() => setShowMembersPanel((v) => !v)}
                  className={`ui-focus inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                    showMembersPanel
                      ? "ui-btn-primary"
                      : "ui-btn-secondary"
                  }`}
                >
                  {showMembersPanel ? "Skrýt podřízené" : `Zobrazit podřízené (${filteredMembers.length})`}
                </button>
              </div>

              <div className="ui-chip-group flex w-fit flex-wrap gap-2">
                {ACTIVITY_FILTERS.map((option) => {
                  const active = activityFilter === option.key;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setActivityFilter(option.key)}
                      className={`ui-chip ui-focus px-3 py-1 text-xs ${active ? "ui-chip-active" : ""}`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>

              {showMembersPanel && (
                <div className="space-y-2 border-t border-slate-200 pt-3">
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Podřízení</div>
                    <span className="rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">
                      {filteredMembers.length} osob
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-2 max-h-[360px] overflow-auto pr-1 sm:grid-cols-2 xl:grid-cols-4">
                    {filteredMembers.length === 0 && (
                      <div className="col-span-full rounded-2xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                        Pro zadaný filtr nejsou žádní členové.
                      </div>
                    )}
                    {filteredMembers.map((m) => {
                      const isSelected = m.email === selectedEmail;
                      const last = lastActiveBadge(m.email);
                      return (
                        <button
                          key={m.email}
                          onClick={() => setSelectedEmail(m.email)}
                          className={[
                            "w-full min-h-[88px] rounded-xl border px-3 py-2 text-left transition flex flex-col items-start gap-2",
                            isSelected
                              ? "border-slate-900 bg-slate-100 text-slate-900 shadow-[0_8px_20px_rgba(15,23,42,0.1)]"
                              : "border-slate-300 bg-white text-slate-900 hover:border-slate-900 hover:bg-slate-50",
                          ].join(" ")}
                        >
                          <div className="w-full">
                            <div className="text-[15px] font-semibold leading-tight break-words">{m.name}</div>
                          </div>
                          <div className="flex w-full flex-col items-start gap-1">
                            <span
                              className={`text-[11px] inline-flex items-center justify-center gap-1.5 rounded-full border px-2 py-0.5 ${last.className}`}
                              aria-label={last.title}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${last.dotClassName}`} />
                              {last.statusLabel}
                            </span>
                            <span className="text-[11px] leading-none text-slate-500">{last.relativeLabel}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4">
                {selected ? (
                  <>
                    <div className="relative z-10 flex flex-col gap-3 border-b border-slate-200 pb-4">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500 mb-1">Detail</div>
                        <div className="whitespace-nowrap text-4xl font-bold leading-tight text-slate-900 sm:text-5xl">{selected.name}</div>
                        <div className="mt-2 space-y-0.5">
                          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Pozice</div>
                          <div className="text-2xl font-bold leading-tight text-slate-900">{positionLabel(selected.position)}</div>
                        </div>
                        <p className="text-sm text-slate-500 mt-1">{selected.email}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={handleCopySelectedEmail}
                            className="ui-btn-primary ui-focus rounded-full px-3 py-1.5 text-xs"
                          >
                            {copiedEmail ? "Zkopírováno" : "Kopírovat e-mail"}
                          </button>
                          <a
                            href={`mailto:${selected.email}`}
                            className="ui-btn-primary ui-focus rounded-full px-3 py-1.5 text-xs"
                          >
                            Napsat e-mail
                          </a>
                          <Link
                            href={`/pomucky/statistika?user=${encodeURIComponent(selected.email)}`}
                            className="ui-btn-primary ui-focus rounded-full px-3 py-1.5 text-xs"
                          >
                            Statistiky
                          </Link>
                          {canEditSelectedPosition ? (
                            <button
                              type="button"
                              onClick={openPositionModal}
                              className="ui-btn-primary ui-focus rounded-full px-3 py-1.5 text-xs"
                            >
                              Změnit pozici
                            </button>
                          ) : null}
                        </div>
                        {positionSaveSuccess ? (
                          <div className="mt-2 text-sm font-semibold text-emerald-700">Pozice změněna.</div>
                        ) : null}
                        <div className="ui-chip-group mt-3 inline-flex gap-2">
                          <button
                            type="button"
                            onClick={() => setDetailTab("overview")}
                            className={`ui-chip ui-focus px-3 py-1 text-xs ${detailTab === "overview" ? "ui-chip-active" : ""}`}
                          >
                            Přehled
                          </button>
                          <button
                            type="button"
                            onClick={() => setDetailTab("subordinates")}
                            className={`ui-chip ui-focus px-3 py-1 text-xs ${detailTab === "subordinates" ? "ui-chip-active" : ""}`}
                          >
                            Podřízení ({subordinatesOfSelected.length})
                          </button>
                        </div>
                      </div>
                    </div>

                    {detailTab === "overview" ? (
                      <>
                        <div className="relative z-10 grid grid-cols-1 gap-3 border-b border-slate-200 py-4">
                          <div className="space-y-1">
                            <div className="text-[11px] uppercase tracking-wide text-slate-500">Naposledy aktivní</div>
                            <div className="text-sm font-semibold text-slate-900" title={formatLastActive(selected.email)}>
                              {formatRelative(lastActive[selected.email])}
                            </div>
                          </div>
                        </div>

                        <div className="relative z-10 grid grid-cols-1 gap-3 border-b border-slate-200 py-4 sm:grid-cols-2">
                          <div>
                            <div className="text-[11px] uppercase tracking-wide text-slate-500">Celkem smluv</div>
                            <div className="text-xl font-bold text-slate-900">{contractCountLabel(selected.email, "total")}</div>
                          </div>
                          <div>
                            <div className="text-[11px] uppercase tracking-wide text-slate-500">Smluv tento měsíc</div>
                            <div className="text-xl font-bold text-slate-900">{contractCountLabel(selected.email, "month")}</div>
                          </div>
                        </div>

                        <div className="relative space-y-3 border-b border-slate-200 py-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Produkce</div>
                            <div className="text-xs font-semibold text-slate-500">Pojišťovna / počet smluv / měsíční / roční</div>
                          </div>

                          <div className="ui-chip-group flex w-fit flex-wrap gap-2">
                            {PRODUCTION_CATEGORY_TABS.map((tab) => {
                              const active = productionCategory === tab.key;
                              return (
                                <button
                                  key={tab.key}
                                  type="button"
                                  onClick={() => setProductionCategory(tab.key)}
                                  className={`ui-chip ui-focus px-3 py-1 text-xs ${active ? "ui-chip-active" : ""}`}
                                >
                                  {tab.label}
                                </button>
                              );
                            })}
                          </div>

                          <div className="ui-card ui-card-quiet rounded-2xl bg-slate-50 px-4 py-4">
                            {selectedProductionRows.length === 0 ? (
                              <div className="text-sm text-slate-500">V této kategorii zatím nejsou smlouvy.</div>
                            ) : (
                              <div className="space-y-1.5">
                                <div className="hidden sm:grid sm:grid-cols-[minmax(180px,1fr)_110px_150px_150px] items-center gap-3 px-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                  <div>Pojišťovna</div>
                                  <div className="text-right">Smluv</div>
                                  <div className="text-right">Měsíční</div>
                                  <div className="text-right">Roční</div>
                                </div>
                                {selectedProductionRows.map((row) => {
                                  const logo = insurerLogoPath(row.name);
                                  return (
                                  <div key={row.name} className="grid grid-cols-1 gap-1 rounded-xl border border-slate-200 bg-white px-4 py-3 sm:grid-cols-[minmax(180px,1fr)_110px_150px_150px] sm:items-center sm:gap-3">
                                    <div className="min-w-0 flex items-center gap-2">
                                      {logo ? (
                                        <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm">
                                          <Image
                                            src={logo}
                                            alt={row.name}
                                            width={40}
                                            height={40}
                                            className="h-9 w-9 object-contain"
                                          />
                                        </span>
                                      ) : null}
                                      <span className="min-w-0 text-base font-bold text-slate-900 sm:text-lg">{row.name}</span>
                                    </div>
                                    <div className="text-sm font-semibold text-slate-700 sm:text-right sm:text-base">{row.contracts}x smluv</div>
                                    <div className="text-base font-bold text-emerald-700 sm:text-right sm:text-xl">{formatMoney(row.monthlyPremium)}</div>
                                    <div className="text-base font-bold text-emerald-700 sm:text-right sm:text-xl">{formatMoney(row.annualPremium)}</div>
                                  </div>
                                );
                                })}
                                <div className="grid grid-cols-1 gap-1 rounded-xl border border-slate-900 bg-slate-900 px-4 py-3 text-white sm:grid-cols-[minmax(180px,1fr)_110px_150px_150px] sm:items-center sm:gap-3">
                                  <div className="text-base font-bold sm:text-lg">Celkem</div>
                                  <div className="text-sm font-semibold sm:text-right sm:text-base">{selectedProductionTotals.contracts}x smluv</div>
                                  <div className="text-base font-bold text-emerald-300 sm:text-right sm:text-xl">{formatMoney(selectedProductionTotals.monthlyPremium)}</div>
                                  <div className="text-base font-bold text-emerald-300 sm:text-right sm:text-xl">{formatMoney(selectedProductionTotals.annualPremium)}</div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="space-y-2 pt-2">
                        <div className="flex items-center justify-between">
                          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Podřízení</div>
                          <span className="text-[11px] text-slate-500">
                            {subordinatesOfSelected.length} {subordinatesOfSelected.length === 1 ? "osoba" : "osob"}
                          </span>
                        </div>
                        {subordinatesOfSelected.length === 0 ? (
                          <div className="text-sm text-slate-500 rounded-2xl border border-slate-300 bg-slate-50 px-3 py-2">
                            Nemá podřízené.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {subordinatesOfSelected.map((sub) => (
                              <div
                                key={sub.email}
                                className="rounded-2xl border border-slate-300 bg-slate-50 px-3 py-2 space-y-1"
                              >
                                <div className="text-sm font-semibold text-slate-900">{sub.name}</div>
                                <div className="text-xs text-slate-500">{sub.email}</div>
                                <div className="text-xs text-slate-500">
                                  {positionLabel(sub.position)} · Celkem: {contractCountLabel(sub.email, "total")} · Tento měsíc:{" "}
                                  {contractCountLabel(sub.email, "month")}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-sm text-slate-500">Vyber podřízeného v horním panelu.</div>
                )}
              </div>
          </>
        )}
      </div>
      {positionModalOpen && selected ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-300 bg-white p-4 shadow-2xl">
            <div className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">Změna pozice</div>
            <div className="mt-2 text-lg font-bold text-slate-900">{selected.name}</div>
            <div className="text-sm text-slate-500">{selected.email}</div>

            <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Nová pozice
            </label>
            <select
              value={positionDraft}
              onChange={(e) => setPositionDraft(e.target.value as Position)}
              disabled={savingPosition}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none"
            >
              {POSITION_OPTIONS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>

            {positionSaveError ? <div className="mt-3 text-sm text-rose-700">{positionSaveError}</div> : null}

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (savingPosition) return;
                  setPositionModalOpen(false);
                  setPositionSaveError(null);
                }}
                className="ui-btn-secondary ui-focus rounded-xl px-3 py-2 text-sm"
                disabled={savingPosition}
              >
                Zrušit
              </button>
              <button
                type="button"
                onClick={saveSelectedPosition}
                className="ui-btn-primary ui-focus rounded-xl px-3 py-2 text-sm"
                disabled={savingPosition}
              >
                {savingPosition ? "Ukládám..." : "Uložit změny"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppLayout>
  );
}
