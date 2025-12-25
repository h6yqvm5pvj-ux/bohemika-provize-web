// src/app/smlouvy/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { auth, db } from "../firebase";
import {
  onAuthStateChanged,
  type User as FirebaseUser,
} from "firebase/auth";
import {
  collection,
  collectionGroup,
  doc,
  deleteDoc,
  getDoc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";

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
  contractNumber?: string | null;

  createdAt?: FirestoreTimestamp | Date | string | null;
  contractSignedDate?: FirestoreTimestamp | Date | string | null;
};

type AppUser = {
  id: string;
  email: string | null;
  position: Position | null;
  managerEmail?: string | null;
};

type FilterMode = "latest" | "anniversary";

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

function isAnniversarySoon(date: Date | null): { soon: boolean; next?: Date } {
  if (!date) return { soon: false };
  const now = new Date();
  const next = nextAnniversaryDate(date, now);
  const diffDays = (next.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  // nové smlouvy (první rok) nechceme označovat jako "blížící se"
  const oneYearMs = 365 * 24 * 60 * 60 * 1000;
  const firstAnniversary = new Date(date.getTime() + oneYearMs);
  const isBeforeFirstAnniv = now < firstAnniversary;
  const soon = diffDays <= 60 && diffDays >= 0 && !isBeforeFirstAnniv;
  return { soon, next };
}

export default function ContractsPage() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [currentUserPosition, setCurrentUserPosition] =
    useState<Position | null>(null);

  const [myContracts, setMyContracts] = useState<ContractDoc[]>([]);
  const [teamContracts, setTeamContracts] = useState<
    (ContractDoc & { adviserEmail: string | null })[]
  >([]);

  const [showTeam, setShowTeam] = useState(false);
  const [filterMode, setFilterMode] = useState<FilterMode>("latest");
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(10);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkMarking, setBulkMarking] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

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
      if (!user?.email) {
        setMyContracts([]);
        setTeamContracts([]);
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        // 1) info o uživateli (pozice)
        const uRef = doc(db, "users", user.email);
        const uSnap = await getDoc(uRef);

        let pos: Position | null = null;
        if (uSnap.exists()) {
          const d = uSnap.data() as any;
          pos = (d.position ?? null) as Position | null;
        }
        setCurrentUserPosition(pos);

        // 2) Moje smlouvy
        const entriesGroup = collectionGroup(db, "entries");
        const myQ = query(
          entriesGroup,
          where("userEmail", "==", user.email),
          orderBy("createdAt", "desc")
        );
        const mySnap = await getDocs(myQ);
        const myList: ContractDoc[] = mySnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        }));
        setMyContracts(myList);

        // 3) Podřízení – celý strom pod sebou (manažer může mít manažera pod sebou)
        const usersCol = collection(db, "users");
        const visited = new Set<string>();
        const teamUsers: AppUser[] = [];
        const queue: string[] = [user.email.toLowerCase()];

        while (queue.length > 0) {
          const mgrEmail = queue.shift()!;
          const snap = await getDocs(
            query(usersCol, where("managerEmail", "==", mgrEmail))
          );
          snap.docs.forEach((d) => {
            const data = d.data() as any;
            const em = ((data.email as string | undefined) ?? d.id).toLowerCase();
            if (!em || visited.has(em)) return;
            visited.add(em);
            teamUsers.push({
              id: d.id,
              email: em,
              position: (data.position ?? null) as Position | null,
              managerEmail: (data.managerEmail ?? null) as string | null,
            });
            queue.push(em);
          });
        }

        if (teamUsers.length === 0) {
          setTeamContracts([]);
          setLoading(false);
          return;
        }

        const teamEmails = teamUsers.map((u) => u.email).filter(Boolean);

        const teamContractsAll: ContractDoc[] = [];

        // Firestore "in" max 10 hodnot → po blocích
        const chunkSize = 10;
        for (let i = 0; i < teamEmails.length; i += chunkSize) {
          const chunk = teamEmails.slice(i, i + chunkSize);
          const teamQ = query(
            entriesGroup,
            where("userEmail", "in", chunk),
            orderBy("createdAt", "desc")
          );
          const teamSnap = await getDocs(teamQ);
          teamSnap.docs.forEach((d) => {
            teamContractsAll.push({
              id: d.id,
              ...(d.data() as any),
            });
          });
        }

        // doplníme adviserEmail z users
        const withEmails = teamContractsAll.map((c) => {
          const adviser = teamUsers.find(
            (u) => u.email === c.userEmail
          );
          return {
            ...c,
            adviserEmail: adviser?.email ?? c.userEmail ?? null,
          };
        });

        setTeamContracts(withEmails);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user]);

  const canShowTeamToggle = isManagerPosition(currentUserPosition);

  const displayedContracts = useMemo(() => {
    const base =
      showTeam && canShowTeamToggle ? teamContracts : myContracts;

    return [...base].sort((a, b) => {
      const da =
        toDate((a as any).contractSignedDate) ??
        toDate(a.createdAt) ??
        new Date(0);
      const db =
        toDate((b as any).contractSignedDate) ??
        toDate(b.createdAt) ??
        new Date(0);
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
          const start = toDate((c as any).policyStartDate);
          const info = isAnniversarySoon(start);
          return { contract: c, next: info.next, soon: info.soon };
        })
        .filter((item) => item.soon)
        .sort(
          (a, b) =>
            (a.next?.getTime() ?? Number.POSITIVE_INFINITY) -
            (b.next?.getTime() ?? Number.POSITIVE_INFINITY)
        )
        .map((item) => item.contract);

      return enriched;
    }

    return base;
  }, [displayedContracts, searchText, filterMode]);

  useEffect(() => {
    setVisibleCount(10);
    setSelectedKeys(new Set());
    setSelectMode(false);
  }, [filterMode, searchText, showTeam, displayedContracts.length]);

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
    const confirmed = window.confirm(
      "Opravdu chceš smazat vybrané smlouvy? Tuto akci nelze vrátit."
    );
    if (!confirmed) return;

    setBulkDeleting(true);
    setBulkError(null);

    try {
      for (const key of Array.from(selectedKeys)) {
        const [ownerEmail, entryId] = key.split("___");
        if (!ownerEmail || !entryId) continue;
        await deleteDoc(doc(db, "users", ownerEmail, "entries", entryId));
      }

      setMyContracts((prev) =>
        prev.filter(
          (c) =>
            !selectedKeys.has(
              `${(c.userEmail ?? "").toLowerCase()}___${c.id}`
            )
        )
      );
      setTeamContracts((prev) =>
        prev.filter(
          (c) =>
            !selectedKeys.has(
              `${(c.userEmail ?? "").toLowerCase()}___${c.id}`
            )
        )
      );

      clearSelection();
    } catch (e) {
      console.error("Chyba při hromadném mazání", e);
      setBulkError("Nepodařilo se smazat všechny smlouvy. Zkus to prosím znovu.");
      setBulkDeleting(false);
    }
  };

  const handleBulkMarkPaid = async () => {
    if (selectedKeys.size === 0) return;
    setBulkMarking(true);
    setBulkError(null);

    try {
      for (const key of Array.from(selectedKeys)) {
        const [ownerEmail, entryId] = key.split("___");
        if (!ownerEmail || !entryId) continue;
        await updateDoc(doc(db, "users", ownerEmail, "entries", entryId), {
          paid: true,
        });
      }

      setMyContracts((prev) =>
        prev.map((c) => {
          const k = `${(c.userEmail ?? "").toLowerCase()}___${c.id}`;
          if (selectedKeys.has(k)) {
            return { ...c, paid: true };
          }
          return c;
        })
      );
      setTeamContracts((prev) =>
        prev.map((c) => {
          const k = `${(c.userEmail ?? "").toLowerCase()}___${c.id}`;
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
                  V okně 60 dní od dneška není žádné výročí (počítáno z data
                  počátku smlouvy).
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
              {filteredContracts.slice(0, visibleCount).map((c: any) => {
                const signed =
                  toDate((c as any).contractSignedDate) ??
                  toDate(c.createdAt);
                const signedStr = signed
                  ? signed.toLocaleDateString("cs-CZ")
                : "—";
              const policyStart = toDate((c as any).policyStartDate);
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
                        Blížící se výročí
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

            {filteredContracts.length > visibleCount && (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => setVisibleCount((c) => c + 10)}
                  className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm text-slate-50 hover:bg-white/10 transition shadow-[0_10px_30px_rgba(0,0,0,0.6)]"
                >
                  Načíst dalších 10
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
    </AppLayout>
  );
}
