"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
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
  where,
} from "firebase/firestore";

import { AppLayout } from "@/components/AppLayout";
import { auth, db } from "@/app/firebase";
import { type Position, type Product } from "@/app/types/domain";
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
const CATEGORY_LABELS: Record<Category, string> = {
  life: "Životní",
  auto: "Auto",
  property: "Majetek",
  travel: "Cestovko",
  comfort: "Zlato",
  other: "Ostatní",
};
const CATEGORY_COLORS: Record<Category, string> = {
  life: "#60a5fa", // modrá
  auto: "#f59e0b", // zlatá
  property: "#22c55e", // zelená
  travel: "#38bdf8", // světle modrá
  comfort: "#c084fc", // fialová
  other: "#e5e7eb", // šedá
};

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
  contractCounts: Record<
    string,
    { total: number; month: number; categories: Record<Category, number> }
  >;
  contractsLoaded: boolean;
  contractsError: boolean;
  userPosition: Position | null;
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
  const [contractCounts, setContractCounts] = useState<
    Record<string, { total: number; month: number; categories: Record<Category, number> }>
  >({});
  const [contractsLoaded, setContractsLoaded] = useState(false);
  const [, setContractsRefreshing] = useState(false);
  const [contractsError, setContractsError] = useState(false);
  const [userPosition, setUserPosition] = useState<Position | null>(null);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [sortBy, setSortBy] = useState<SortKey>("activity");
  const [copiedEmail, setCopiedEmail] = useState(false);
  const copyEmailTimerRef = useRef<number | null>(null);
  const usedCacheRef = useRef(false);
  const cacheStateRef = useRef<{
    contractCounts: Record<string, { total: number; month: number; categories: Record<Category, number> }>;
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
        setLoading(false);
        return;
      }

      let pos: Position | null = null;
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
        // načtení vlastní pozice
        try {
          const meSnap = await getDoc(doc(usersCol, userEmail));
          pos = meSnap.exists() ? ((meSnap.data() as any).position as Position | undefined) ?? null : null;
          setUserPosition(pos);
        } catch (err) {
          console.error("Chyba při načítání pozice uživatele", err);
          setUserPosition(null);
        }
        const queue = [userEmail];
        const visited = new Set<string>();
        all = [];
        const seededLastActive: Record<string, number | null> = {};

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
      const stats: Record<string, { total: number; month: number; categories: Record<Category, number> }> = {};
      try {
        const emails = Array.from(new Set(members.map((m) => m.email.toLowerCase()))); // dedupe
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
        const entries = collectionGroup(db, "entries");
        const chunkSize = 10;
        const emptyCategories = (): Record<Category, number> => ({
          life: 0,
          auto: 0,
          property: 0,
          travel: 0,
          comfort: 0,
          other: 0,
        });
        const categorizeProduct = (p?: Product | null): Category => {
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
        };

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
                categories: emptyCategories(),
              };
            current.total += 1;
            const category = categorizeProduct(data.productKey as Product | undefined);
            current.categories[category] = (current.categories[category] ?? 0) + 1;
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
            },
          };
        }
      }
    };

    if (usedCacheRef.current && contractsLoaded) return;

    void loadContractCounts();
  }, [members, cacheKey, lastActive, userPosition, contractsLoaded, contractsError]);

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
    return () => {
      if (copyEmailTimerRef.current) window.clearTimeout(copyEmailTimerRef.current);
    };
  }, []);

  const selected = members.find((m) => m.email === selectedEmail) ?? null;
  const subordinatesOfSelected = useMemo(
    () => (selected ? members.filter((m) => (m.managerEmail ?? "").toLowerCase() === selected.email) : []),
    [selected, members]
  );

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
        label: "Neznámé",
        className: "bg-white text-slate-600 border-slate-300",
        title: "Bez záznamu o aktivitě",
      };
    }
    const diff = now - ts;
    if (diff <= ONLINE_THRESHOLD_MS) {
      return {
        label: "Online",
        className: "bg-emerald-50 text-emerald-700 border-emerald-600",
        title: `Aktivní ${new Date(ts).toLocaleString("cs-CZ")}`,
      };
    }
    if (diff <= RECENT_THRESHOLD_MS) {
      return {
        label: formatRelative(ts),
        className: "bg-amber-50 text-amber-700 border-amber-600",
        title: `Naposledy ${new Date(ts).toLocaleString("cs-CZ")}`,
      };
    }
    return {
      label: formatRelative(ts),
      className: "bg-white text-slate-600 border-slate-300",
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

  const categoryLegend = (email: string) => {
    const stats = contractCounts[email];
    const total = stats?.total ?? 0;
    if (!stats || total === 0) {
      return <div className="text-sm text-slate-500">Žádné smlouvy.</div>;
    }
    const entries = (Object.keys(CATEGORY_LABELS) as Category[])
      .map((cat) => ({ cat, count: stats.categories?.[cat] ?? 0 }))
      .filter((c) => c.count > 0);
    if (entries.length === 0) {
      return <div className="text-sm text-slate-500">Žádné smlouvy.</div>;
    }
    return (
      <div className="space-y-1">
        {entries.map(({ cat, count }) => {
          const pct = Math.round((count / total) * 100);
          return (
            <div key={cat} className="flex items-center gap-2 text-[12px] text-slate-900">
              <span
                className="h-3 w-3 rounded-full border border-slate-300 shadow-sm"
                style={{ backgroundColor: CATEGORY_COLORS[cat] }}
              />
              <span className="font-semibold">{CATEGORY_LABELS[cat]}</span>
              <span className="text-slate-500">{count} · {pct}%</span>
            </div>
          );
        })}
      </div>
    );
  };

  const renderCategoryPie = (email: string) => {
    const stats = contractCounts[email];
    const total = stats?.total ?? 0;
    if (!stats || total === 0) {
      return <div className="text-sm text-slate-500">Žádné smlouvy.</div>;
    }
    const entries = (Object.keys(CATEGORY_LABELS) as Category[])
      .map((cat) => ({ cat, count: stats.categories?.[cat] ?? 0 }))
      .filter((c) => c.count > 0);
    if (entries.length === 0) return <div className="text-sm text-slate-500">Žádné smlouvy.</div>;

    const size = 140;
    const r = 60;
    const cx = size / 2;
    const cy = size / 2;
    const TAU = Math.PI * 2;

    const arcPath = (start: number, end: number) => {
      const startX = cx + r * Math.cos(start);
      const startY = cy + r * Math.sin(start);
      const endX = cx + r * Math.cos(end);
      const endY = cy + r * Math.sin(end);
      const largeArc = end - start > Math.PI ? 1 : 0;
      return `M ${cx} ${cy} L ${startX} ${startY} A ${r} ${r} 0 ${largeArc} 1 ${endX} ${endY} Z`;
    };

    // Pokud je jen jedna kategorie, vykresli plný kruh
    if (entries.length === 1) {
      return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={cx} cy={cy} r={r} fill={CATEGORY_COLORS[entries[0].cat]} />
        </svg>
      );
    }

    let angle = -Math.PI / 2; // začneme nahoře
    const slices = entries.map(({ cat, count }) => {
      const delta = (count / total) * TAU;
      const start = angle;
      const end = angle + delta;
      angle = end;
      return { cat, start, end };
    });

    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {slices.map((s) => (
          <path key={s.cat} d={arcPath(s.start, s.end)} fill={CATEGORY_COLORS[s.cat]} stroke="#0f172a" strokeWidth="1" />
        ))}
        {/* vyříznutý střed pro donut */}
        <circle cx={cx} cy={cy} r={r * 0.42} fill="#0f172a" stroke="#1e293b" strokeWidth="1" />
        <text x={cx} y={cy - 4} textAnchor="middle" className="fill-white" style={{ fontSize: "13px", fontWeight: 700 }}>
          {total}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" className="fill-slate-400" style={{ fontSize: "11px" }}>
          smluv
        </text>
      </svg>
    );
  };

  const canSendTeamMessage = isManagerPosition(userPosition) && members.length > 0;

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
            <div className="space-y-3 rounded-3xl border border-slate-900 bg-white p-3 shadow-[0_12px_28px_rgba(15,23,42,0.12)]">
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
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-black"
                >
                  Struktura
                </Link>
                {canSendTeamMessage ? (
                  <Link
                    href="/pomucky/zprava-tymu"
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-black"
                  >
                    Zpráva týmu
                  </Link>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2">
                {ACTIVITY_FILTERS.map((option) => {
                  const active = activityFilter === option.key;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setActivityFilter(option.key)}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                        active
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-900 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[0.58fr_1.42fr] gap-4 items-start">
              <div className="relative overflow-hidden rounded-3xl border border-slate-900 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.14)] space-y-3">
                <div className="relative z-10 flex items-center justify-between">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Podřízení</div>
                  <span className="rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">
                    {filteredMembers.length} osob
                  </span>
                </div>
                <div className="relative z-10 space-y-2">
                  {filteredMembers.length === 0 && (
                    <div className="rounded-2xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-500">
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
                          "w-full text-left px-3 py-3 rounded-2xl border transition flex items-center justify-between gap-3",
                          isSelected
                            ? "border-slate-900 bg-slate-100 text-slate-900 shadow-[0_8px_20px_rgba(15,23,42,0.1)]"
                            : "border-slate-300 bg-white text-slate-900 hover:border-slate-900 hover:bg-slate-50",
                        ].join(" ")}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold truncate">{m.name}</div>
                        </div>
                        <span
                          className={`text-[11px] inline-flex items-center justify-center rounded-full border px-2 py-0.5 ${last.className}`}
                          title={last.title}
                        >
                          {last.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-4">
                {selected ? (
                  <>
                    <div className="relative z-10 flex flex-col gap-3 border-b border-slate-200 pb-4">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500 mb-1">Detail</div>
                        <div className="whitespace-nowrap text-4xl font-bold leading-tight text-slate-900 sm:text-5xl">{selected.name}</div>
                        <p className="text-sm text-slate-500 mt-1">{selected.email}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={handleCopySelectedEmail}
                            className="rounded-full border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-black"
                          >
                            {copiedEmail ? "Zkopírováno" : "Kopírovat e-mail"}
                          </button>
                          <a
                            href={`mailto:${selected.email}`}
                            className="rounded-full border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-black"
                          >
                            Napsat e-mail
                          </a>
                          <Link
                            href={`/pomucky/statistika?user=${encodeURIComponent(selected.email)}`}
                            className="rounded-full border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-black"
                          >
                            Statistiky
                          </Link>
                        </div>
                      </div>
                    </div>

                    <div className="relative z-10 grid grid-cols-1 gap-3 border-b border-slate-200 py-4 sm:grid-cols-2">
                      <div className="space-y-1">
                        <div className="text-[11px] uppercase tracking-wide text-slate-500">Pozice</div>
                        <div className="text-sm font-semibold text-slate-900">{positionLabel(selected.position)}</div>
                      </div>
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

                    <div className="relative space-y-2 overflow-hidden border-b border-slate-200 py-4">
                      <div className="relative z-10 flex items-center justify-between">
                        <div className="text-[11px] uppercase tracking-wide text-slate-500">Podíl kategorií</div>
                        <div className="text-[11px] text-slate-500">(podle počtu smluv)</div>
                      </div>
                      <div className="relative z-10 grid grid-cols-1 sm:grid-cols-[150px_1fr] items-center gap-3">
                        <div className="flex justify-center">{renderCategoryPie(selected.email)}</div>
                        <div>{categoryLegend(selected.email)}</div>
                      </div>
                    </div>

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
                  </>
                ) : (
                  <div className="text-sm text-slate-500">Vyber podřízeného vlevo.</div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
