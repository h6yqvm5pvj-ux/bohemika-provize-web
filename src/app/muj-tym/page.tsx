"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, collectionGroup, doc, getDoc, getDocs, limit as fbLimit, orderBy, query, where } from "firebase/firestore";

import { AppLayout } from "@/components/AppLayout";
import { auth, db } from "@/app/firebase";
import { type Position } from "@/app/types/domain";
import SplitTitle from "../pomucky/plan-produkce/SplitTitle";

type Member = {
  email: string;
  name: string;
  position?: Position | null;
  managerEmail?: string | null;
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
  if (typeof value === "object" && value !== null && "seconds" in value && typeof (value as any).seconds === "number") {
    const v = value as FirestoreTimestamp;
    const ms = v.seconds * 1000 + Math.floor((v.nanoseconds ?? 0) / 1_000_000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value as any);
  return Number.isNaN(d.getTime()) ? null : d;
}

type TeamCachePayload = {
  members: Member[];
  lastActive: Record<string, number | null>;
  contractCounts: Record<string, { total: number; month: number }>;
  contractsLoaded: boolean;
  contractsError: boolean;
  userPosition: Position | null;
};

const TEAM_CACHE_TTL_MS = 5 * 60 * 1000;
const teamDataCache: Record<string, { ts: number; payload: TeamCachePayload }> = {};

export default function TeamPage() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [lastActive, setLastActive] = useState<Record<string, number | null>>({});
  const [contractCounts, setContractCounts] = useState<Record<string, { total: number; month: number }>>({});
  const [contractsLoaded, setContractsLoaded] = useState(false);
  const [contractsError, setContractsError] = useState(false);
  const [userPosition, setUserPosition] = useState<Position | null>(null);
  const usedCacheRef = useRef(false);

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

        while (queue.length > 0) {
          const mgr = queue.shift()!;
          const snap = await getDocs(query(usersCol, where("managerEmail", "==", mgr)));
          for (const docSnap of snap.docs) {
            const data = docSnap.data() as any;
            const em = (data.email as string | undefined)?.toLowerCase() ?? "";
            if (!em || visited.has(em)) continue;
            visited.add(em);
            const pos = (data.position as Position | undefined) ?? null;
            all.push({
              email: em,
              name: nameFromEmail(em),
              position: pos,
              managerEmail: mgr,
            });
            queue.push(em);
          }
        }

        setMembers(all);
        if (all.length && !selectedEmail) {
          setSelectedEmail(all[0].email);
        }

        // načti poslední aktivitu (uložená statistika) pro každého
        const entries = await Promise.all(
          all.map(async (m) => {
            try {
              const snap = await getDocs(
                query(
                  collection(db, "userStats", m.email, "monthlySnapshots"),
                  orderBy("savedAt", "desc"),
                  fbLimit(1)
                )
              );
              const raw = snap.docs[0]?.data()?.savedAt;
              let d = toDate(raw);
              if (!d && typeof raw === "number") {
                const isSeconds = raw < 10_000_000_000; // heuristic
                d = new Date(isSeconds ? raw * 1000 : raw);
              }
              const ts = d?.getTime();
              return [m.email, Number.isFinite(ts) ? Number(ts) : null] as const;
            } catch {
              return [m.email, null] as const;
            }
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
              contractCounts,
              contractsLoaded,
              contractsError,
              userPosition: pos,
            },
          };
        }
      }
    };

    loadTeam();
    // only depends on signed-in user; selection should not retrigger fetch
  }, [userEmail]);

  useEffect(() => {
    const loadContractCounts = async () => {
      if (cacheKey) {
        const cached = teamDataCache[cacheKey];
        if (cached && Date.now() - cached.ts < TEAM_CACHE_TTL_MS && cached.payload.contractsLoaded) {
          applyCachedTeamState(cached.payload);
          return;
        }
      }

      if (members.length === 0) {
        setContractCounts({});
        setContractsLoaded(true);
        setContractsError(false);
        return;
      }
      setContractsLoaded(false);
      setContractsError(false);
      let stats: Record<string, { total: number; month: number }> = {};
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
            const current = stats[email] ?? { total: 0, month: 0 };
            current.total += 1;
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

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return members;
    return members.filter((m) => m.name.toLowerCase().includes(term) || m.email.toLowerCase().includes(term));
  }, [members, search]);

  const selected = members.find((m) => m.email === selectedEmail) ?? null;
  const subordinatesOfSelected = useMemo(
    () => (selected ? members.filter((m) => (m.managerEmail ?? "").toLowerCase() === selected.email) : []),
    [selected, members]
  );

  const formatLastActive = (email: string): string => {
    const ts = lastActive[email];
    if (!ts) return "—";
    try {
      return new Date(ts).toLocaleDateString("cs-CZ");
    } catch {
      return "—";
    }
  };

  const contractCountLabel = (email: string, key: "total" | "month") => {
    if (!contractsLoaded || contractsError) return "—";
    const stats = contractCounts[email];
    const value = key === "total" ? stats?.total : stats?.month;
    return value != null ? String(value) : "0";
  };

  const performanceInfo = (email: string) => {
    const stats = contractCounts[email];
    const month = stats?.month ?? 0;
    if (month > 0) {
      return { label: "↑", className: "bg-emerald-500/15 text-emerald-100 border-emerald-300/60" };
    }
    if (month < 0) {
      return { label: "↓", className: "bg-rose-500/15 text-rose-100 border-rose-300/60" };
    }
    return { label: "→", className: "bg-white/5 text-slate-300 border-white/15" };
  };

  const canSendTeamMessage = isManagerPosition(userPosition) && members.length > 0;

  return (
    <AppLayout active="team">
      <div className="w-full max-w-5xl space-y-6">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <SplitTitle text="Můj tým" />
        </header>

        {loading ? (
          <p className="text-sm text-slate-300">Načítám tým…</p>
        ) : members.length === 0 ? (
          <p className="text-sm text-slate-300">Nemáš nastavené žádné podřízené.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-slate-900/60 px-3 py-2 w-full max-w-sm shadow-[0_8px_24px_rgba(0,0,0,0.2)]">
                <span className="text-slate-500 text-sm">🔍</span>
                <input
                  type="text"
                  placeholder="Jméno nebo e-mail"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href="/pomucky/struktura"
                  className="inline-flex items-center gap-2 rounded-full border border-emerald-300/60 bg-emerald-500/15 px-3 py-1.5 text-sm font-semibold text-emerald-50 hover:border-emerald-200 hover:bg-emerald-500/25 transition"
                >
                  Struktura
                </Link>
                {canSendTeamMessage ? (
                  <Link
                    href="/pomucky/zprava-tymu"
                    className="inline-flex items-center gap-2 rounded-full border border-emerald-300/60 bg-emerald-500/15 px-3 py-1.5 text-sm font-semibold text-emerald-50 hover:border-emerald-200 hover:bg-emerald-500/25 transition"
                  >
                    Zpráva týmu
                  </Link>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[0.8fr_1.2fr] gap-4 items-start">
              <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/70 via-slate-900/60 to-slate-950/80 p-4 shadow-[0_20px_80px_rgba(0,0,0,0.45)] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Podřízení</div>
                  <span className="text-[11px] rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-slate-300">
                    {filtered.length} osob
                  </span>
                </div>
                <div className="space-y-2">
                  {filtered.map((m) => {
                    const isSelected = m.email === selectedEmail;
                    const perf = performanceInfo(m.email);
                    return (
                      <button
                        key={m.email}
                        onClick={() => setSelectedEmail(m.email)}
                        className={[
                          "w-full text-left px-3 py-3 rounded-2xl border transition flex items-center justify-between gap-3",
                          isSelected
                            ? "border-sky-300/70 bg-sky-500/15 text-white shadow-[0_10px_40px_rgba(56,189,248,0.2)]"
                            : "border-white/8 bg-white/5 text-slate-100 hover:border-white/20 hover:bg-white/8",
                        ].join(" ")}
                      >
                        <div className="text-sm font-semibold">{m.name}</div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[11px] inline-flex items-center justify-center rounded-full border px-2 py-1 ${perf.className}`}
                            title={`Výkon tento měsíc: ${contractCountLabel(m.email, "month")}`}
                          >
                            {perf.label}
                          </span>
                          <div className="text-[11px] rounded-full border border-white/10 bg-white/5 px-2 py-1 text-slate-300">
                            {positionLabel(m.position)}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/70 via-slate-900/60 to-slate-950/80 p-5 shadow-[0_20px_80px_rgba(0,0,0,0.45)] space-y-4">
                {selected ? (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400 mb-1">Detail</div>
                        <div className="text-2xl font-bold text-white leading-tight">{selected.name}</div>
                        <p className="text-sm text-slate-300 mt-1">{selected.email}</p>
                      </div>
                      <div className="flex gap-2">
                        <Link
                          href={`/pomucky/statistika?user=${encodeURIComponent(selected.email)}`}
                          className="rounded-full border border-emerald-300/60 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-50 hover:border-emerald-200 hover:bg-emerald-500/25 transition"
                        >
                          Statistiky
                        </Link>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3 space-y-1">
                        <div className="text-[11px] uppercase tracking-wide text-slate-400">Pozice</div>
                        <div className="text-sm font-semibold text-white">{positionLabel(selected.position)}</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3 space-y-1">
                        <div className="text-[11px] uppercase tracking-wide text-slate-400">Naposledy aktivní</div>
                        <div className="text-sm font-semibold text-white">{formatLastActive(selected.email)}</div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-slate-400">Celkem smluv</div>
                        <div className="text-lg font-bold text-white">{contractCountLabel(selected.email, "total")}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-slate-400">Smluv tento měsíc</div>
                        <div className="text-lg font-bold text-white">{contractCountLabel(selected.email, "month")}</div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Podřízení</div>
                        <span className="text-[11px] text-slate-400">
                          {subordinatesOfSelected.length} {subordinatesOfSelected.length === 1 ? "osoba" : "osob"}
                        </span>
                      </div>
                      {subordinatesOfSelected.length === 0 ? (
                        <div className="text-sm text-slate-400 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                          Nemá podřízené.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {subordinatesOfSelected.map((sub) => (
                            <div
                              key={sub.email}
                              className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 space-y-1"
                            >
                              <div className="text-sm font-semibold text-white">{sub.name}</div>
                              <div className="text-xs text-slate-400">{sub.email}</div>
                              <div className="text-xs text-slate-400">
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
                  <div className="text-sm text-slate-400">Vyber podřízeného vlevo.</div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
