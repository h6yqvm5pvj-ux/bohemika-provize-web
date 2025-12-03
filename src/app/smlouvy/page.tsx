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
  getDoc,
  getDocs,
  orderBy,
  query,
  where,
} from "firebase/firestore";

import {
  type Product,
  type Position,
  type PaymentFrequency,
} from "../types/domain";

import { AppLayout } from "@/components/AppLayout";

type FirestoreTimestamp = {
  seconds: number;
  nanoseconds: number;
};

type ContractDoc = {
  id: string;

  productKey?: Product;
  position?: Position;
  inputAmount?: number;
  frequencyRaw?: PaymentFrequency | null;
  total?: number;

  userEmail?: string | null;
  clientName?: string | null;
  contractNumber?: string | null;

  createdAt?: FirestoreTimestamp | Date | string | null;
};

type AppUser = {
  id: string;
  email: string | null;
  position: Position | null;
  managerEmail?: string | null;
};

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
    case "maxdomov":
      return "Maxima MAXDOMOV";
    case "cppAuto":
      return "ČPP Auto";
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

export default function ContractsPage() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [currentUserPosition, setCurrentUserPosition] =
    useState<Position | null>(null);

  const [myContracts, setMyContracts] = useState<ContractDoc[]>([]);
  const [teamContracts, setTeamContracts] = useState<
    (ContractDoc & { adviserEmail: string | null })[]
  >([]);

  const [showTeam, setShowTeam] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(true);

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

        // 3) Podřízení – users s managerEmail == current user
        const teamUsersQ = query(
          collection(db, "users"),
          where("managerEmail", "==", user.email)
        );
        const teamUsersSnap = await getDocs(teamUsersQ);
        const teamUsers: AppUser[] = teamUsersSnap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            email: (data.email ?? d.id) as string,
            position: (data.position ?? null) as Position | null,
            managerEmail: (data.managerEmail ?? null) as string | null,
          };
        });

        if (teamUsers.length === 0) {
          setTeamContracts([]);
          setLoading(false);
          return;
        }

        const teamEmails = teamUsers
          .map((u) => u.email)
          .filter((e) => !!e);

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
    if (showTeam && canShowTeamToggle) return teamContracts;
    return myContracts;
  }, [showTeam, canShowTeamToggle, teamContracts, myContracts]);

  const filteredContracts = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return displayedContracts;

    return displayedContracts.filter((c) => {
      const client = (c.clientName ?? "").toLowerCase();
      const contractNo = (c.contractNumber ?? "").toLowerCase();
      return client.includes(q) || contractNo.includes(q);
    });
  }, [displayedContracts, searchText]);

  const hasTeamContracts =
    teamContracts.length > 0 && canShowTeamToggle;

  return (
    <AppLayout active="contracts">
      <div className="w-full max-w-5xl space-y-6">
        {/* HEADER */}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
              Smlouvy
            </h1>
            {user && (
              <p className="text-sm text-slate-300">
                Přihlášen jako{" "}
                <span className="font-medium text-slate-50">
                  {user.email}
                </span>
              </p>
            )}
          </div>
        </header>

        {/* PŘEPNUTÍ Moje / Týmové */}
        {canShowTeamToggle && (
          <div className="inline-flex rounded-full bg-slate-950/70 border border-white/15 p-1 text-xs shadow-lg shadow-black/40">
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

        {/* SEARCH BAR */}
        <div className="mt-2">
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/5 border border-white/15 shadow-[0_14px_40px_rgba(0,0,0,0.6)] backdrop-blur-xl">
            <span className="text-sm">🔍</span>
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Hledat klienta nebo číslo smlouvy"
              className="w-full bg-transparent border-none outline-none text-sm text-slate-50 placeholder:text-slate-400"
            />
          </div>
        </div>

        {/* LIST SMLOUV */}
        {loading ? (
          <p className="text-sm text-slate-300 mt-4">
            Načítám smlouvy…
          </p>
        ) : filteredContracts.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-white/15 bg-white/5 backdrop-blur-lg px-6 py-8 text-center text-sm text-slate-200 space-y-2">
            {searchText.trim() !== "" ? (
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
            {filteredContracts.map((c: any) => {
              const created = toDate(c.createdAt);
              const createdStr = created
                ? created.toLocaleDateString("cs-CZ")
                : "—";

              const ownerEmail =
                (showTeam && c.adviserEmail) ||
                c.userEmail ||
                "";

              const slug = `${ownerEmail}___${c.id}`;

              const adviserName =
                showTeam && ownerEmail
                  ? adviserNameFromEmail(ownerEmail)
                  : "";

              return (
                <Link
                  key={c.id}
                  href={`/smlouvy/${slug}`}
                  className="block group"
                >
                  <article className="relative flex flex-col sm:flex-row sm:items-center gap-4 rounded-2xl border border-white/15 bg-white/[0.04] backdrop-blur-2xl px-4 py-3 shadow-[0_18px_60px_rgba(0,0,0,0.8)] hover:border-sky-400/70 hover:bg-white/[0.08] transition">
                    {/* levý barevný pruh */}
                    <div className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-gradient-to-b from-sky-400 via-indigo-400 to-emerald-400" />

                    {/* TEXTOVÁ ČÁST */}
                    <div className="pl-3 flex-1 space-y-1">
                      {/* Název produktu */}
                      <div className="text-sm sm:text-base font-semibold text-slate-50">
                        {productLabel(c.productKey)}
                      </div>

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

                      {/* Datum přidání */}
                      <p className="text-[11px] sm:text-xs text-slate-300">
                        <span className="font-medium text-slate-200">
                          Datum přidání:{" "}
                        </span>
                        <span>{createdStr}</span>
                      </p>
                    </div>

                    {/* POJISTNÉ VPRAVO */}
                    <div className="flex flex-row sm:flex-col items-end sm:items-end gap-1 min-w-[130px]">
                      <span className="text-[11px] sm:text-xs uppercase tracking-wide text-slate-300">
                        Pojistné
                      </span>
                      <span className="text-base sm:text-lg font-semibold text-slate-50">
                        {formatMoney(c.inputAmount ?? 0)}
                      </span>
                    </div>
                  </article>
                </Link>
              );
            })}
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
