"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, limit as fbLimit, orderBy, query, where } from "firebase/firestore";

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

export default function TeamPage() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [lastActive, setLastActive] = useState<Record<string, number | null>>({});

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
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const usersCol = collection(db, "users");
        const queue = [userEmail];
        const visited = new Set<string>();
        const all: Member[] = [];

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
              const ts = snap.docs[0]?.data()?.savedAt as number | undefined;
              return [m.email, Number.isFinite(ts) ? Number(ts) : null] as const;
            } catch {
              return [m.email, null] as const;
            }
          })
        );
        setLastActive(Object.fromEntries(entries));
      } catch (e) {
        console.error("Chyba při načítání týmu", e);
        setMembers([]);
      } finally {
        setLoading(false);
      }
    };

    loadTeam();
    // only depends on signed-in user; selection should not retrigger fetch
  }, [userEmail]);

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
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[0.75fr_1.25fr] gap-4 items-start">
              <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-3 shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
                <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-2">Podřízení</div>
                <div className="divide-y divide-white/5 border border-white/10 rounded-xl overflow-hidden">
                  {filtered.map((m) => {
                    const isSelected = m.email === selectedEmail;
                    return (
                      <button
                        key={m.email}
                        onClick={() => setSelectedEmail(m.email)}
                        className={[
                          "w-full text-left px-3 py-3 flex items-center justify-between gap-3 transition",
                          isSelected
                            ? "bg-sky-500/15 border-l-2 border-l-sky-300 text-white"
                            : "hover:bg-white/5 text-slate-100",
                        ].join(" ")}
                      >
                        <div>
                          <div className="text-sm font-semibold">{m.name}</div>
                          <div className="text-xs text-slate-400">{m.email}</div>
                          <div className="text-[11px] text-slate-500">Naposledy: {formatLastActive(m.email)}</div>
                        </div>
                        <div className="text-[11px] rounded-full border border-white/10 px-2 py-1 text-slate-300">
                          {positionLabel(m.position)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.35)] space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-slate-400">Detail</div>
                    {selected ? (
                      <>
                        <div className="text-lg font-semibold text-white leading-tight">{selected.name}</div>
                        <div className="text-sm text-slate-300">{selected.email}</div>
                        <div className="text-sm text-slate-300">Pozice: {positionLabel(selected.position)}</div>
                        <div className="text-sm text-slate-300">
                          Naposledy aktivní: {formatLastActive(selected.email)}
                        </div>
                      </>
                    ) : (
                      <div className="text-sm text-slate-400">Vyber podřízeného vlevo.</div>
                    )}
                  </div>
                  {selected ? (
                    <Link
                      href={`/pomucky/statistika?user=${encodeURIComponent(selected.email)}`}
                      className="inline-flex items-center gap-2 rounded-full border border-emerald-300/60 bg-emerald-500/15 px-3 py-1.5 text-sm font-semibold text-emerald-50 hover:border-emerald-200 hover:bg-emerald-500/25 transition"
                    >
                      Statistiky
                    </Link>
                  ) : null}
                </div>

                {selected ? (
                  <div className="space-y-2">
                    <div className="text-[11px] uppercase tracking-wider text-slate-400">Podřízení</div>
                    {subordinatesOfSelected.length === 0 ? (
                      <p className="text-sm text-slate-400">Nemá podřízené.</p>
                    ) : (
                      <div className="space-y-2">
                        {subordinatesOfSelected.map((sub) => (
                          <div
                            key={sub.email}
                            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200"
                          >
                            <div className="font-semibold text-white">{sub.name}</div>
                            <div className="text-xs text-slate-400">{sub.email}</div>
                            <div className="text-[11px] text-slate-500">Pozice: {positionLabel(sub.position)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
