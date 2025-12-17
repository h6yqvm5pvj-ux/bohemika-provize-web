// src/app/smlouvy/[id]/page.tsx
"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { auth, db } from "../../firebase";
import {
  onAuthStateChanged,
  type User as FirebaseUser,
} from "firebase/auth";
import { doc, getDoc, deleteDoc } from "firebase/firestore";

import Plasma from "@/components/Plasma";
import {
  type Product,
  type PaymentFrequency,
  type Position,
  type CommissionResultItemDTO,
  type CommissionMode,
} from "../../types/domain";
import Image from "next/image";

import {
  calculateNeon,
  calculateFlexi,
  calculateMaxEfekt,
  calculatePillowInjury,
  calculateDomex,
  calculateMaxdomov,
  calculateCppAuto,
  calculateAllianzAuto,
  calculateCsobAuto,
  calculateUniqaAuto,
  calculatePillowAuto,
  calculateKooperativaAuto,
  calculateZamex,
  calculateCppCestovko,
  calculateAxaCestovko,
  calculateComfortCC,
} from "../../lib/productFormulas";

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
  comfortPayment?: number | null;
  comfortGradual?: boolean | null;
  total?: number;
  items?: CommissionResultItemDTO[];

  userEmail?: string | null;
  clientName?: string | null;
  contractNumber?: string | null;

  policyStartDate?: FirestoreTimestamp | null;
  contractSignedDate?: FirestoreTimestamp | Date | string | null;
  createdAt?: FirestoreTimestamp | Date | string | null;

  durationYears?: number | null;
};

function nameFromEmail(email?: string | null): string {
  if (!email) return "Neznámý poradce";
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[.\-_]/).filter(Boolean);
  if (parts.length === 0) return email;
  const cap = (s: string) =>
    s.length === 0
      ? s
      : s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  return parts.map(cap).join(" ");
}

// ---------- helpers ----------

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;

  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as any).toDate === "function"
  ) {
    const d = (value as any).toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }

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

function formatDate(value: unknown): string {
  const d = toDate(value);
  if (!d) return "—";
  return d.toLocaleDateString("cs-CZ");
}

function formatMoney(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value)) return "0 Kč";
  return (
    value.toLocaleString("cs-CZ", {
      maximumFractionDigits: 0,
    }) + " Kč"
  );
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

function productIcon(p?: Product): string {
  if (
    p === "neon" ||
    p === "flexi" ||
    p === "maximaMaxEfekt" ||
    p === "pillowInjury"
  ) {
    return "/icons/zivot.png";
  }

  if (
    p === "cppAuto" ||
    p === "allianzAuto" ||
    p === "csobAuto" ||
    p === "uniqaAuto" ||
    p === "pillowAuto" ||
    p === "kooperativaAuto"
  ) {
    return "/icons/icon_auto.png";
  }

  if (p === "zamex") {
    return "/icons/icon_zamex.png";
  }

  if (p === "domex" || p === "maxdomov") {
    return "/icons/icon_domex.png";
  }

  if (p === "cppcestovko" || p === "axacestovko") {
    return "/icons/icon_cestovko.png";
  }

  if (p === "comfortcc") {
    return "/icons/trezor.png";
  }

  return "/icons/produkt.png";
}

function positionLabel(pos?: Position | null): string {
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
  return pos ? map[pos] ?? pos : "—";
}

function frequencyText(raw?: PaymentFrequency | null): string {
  switch (raw) {
    case "monthly":
      return "měsíční";
    case "quarterly":
      return "čtvrtletní";
    case "semiannual":
      return "pololetní";
    case "annual":
      return "roční";
    default:
      return "—";
  }
}

function isManagerPosition(pos?: Position | null): boolean {
  if (!pos) return false;
  return pos.startsWith("manazer");
}

// spočítá kompletní výsledek pro danou pozici (stejné formule jako v kalkulačce)
function calculateResultForPosition(
  c: ContractDoc,
  position: Position,
  mode: CommissionMode | null
): { items: CommissionResultItemDTO[]; total: number } | null {
  const product = c.productKey;
  if (!product) return null;

  const amount = c.inputAmount ?? 0;
  const freq = (c.frequencyRaw ?? "annual") as PaymentFrequency;
  const comfortPayment = c.comfortPayment ?? 0;
  const comfortGradual = !!c.comfortGradual;

  const years =
    typeof c.durationYears === "number" && !Number.isNaN(c.durationYears)
      ? c.durationYears
      : 30;

  const usedMode = (mode ?? "standard") as CommissionMode;

  switch (product) {
    case "neon":
      return calculateNeon(amount, position, years, usedMode);
    case "flexi":
      return calculateFlexi(amount, position, usedMode);
    case "maximaMaxEfekt":
      return calculateMaxEfekt(amount, years, position, usedMode);
    case "pillowInjury":
      return calculatePillowInjury(amount, position, usedMode);
    case "domex":
      return calculateDomex(amount, freq, position);
    case "maxdomov":
      return calculateMaxdomov(amount, freq, position);
    case "cppAuto":
      return calculateCppAuto(amount, freq, position);
    case "allianzAuto":
      return calculateAllianzAuto(amount, freq, position);
    case "csobAuto":
      return calculateCsobAuto(amount, freq, position);
    case "uniqaAuto":
      return calculateUniqaAuto(amount, freq, position);
    case "pillowAuto":
      return calculatePillowAuto(amount, freq, position);
    case "kooperativaAuto":
      return calculateKooperativaAuto(amount, freq, position);
    case "zamex":
      return calculateZamex(amount, freq, position);
    case "cppcestovko":
      return calculateCppCestovko(amount, position);
    case "axacestovko":
      return calculateAxaCestovko(amount, position);
    case "comfortcc":
      return calculateComfortCC({
        fee: amount,
        payment: comfortGradual ? comfortPayment : 0,
        isSavings: comfortGradual,
        isGradualFee: comfortGradual,
        position,
      });
    default:
      return null;
  }
}

// ---------- PAGE ----------

export default function ContractDetailPage() {
  const params = useParams<{ id: string }>();
  const rawId = params?.id;

  // slug: email___entryId
  let ownerEmail: string | null = null;
  let entryId: string | null = null;

  if (typeof rawId === "string") {
    const decoded = decodeURIComponent(rawId);
    const parts = decoded.split("___");
    if (parts.length === 2) {
      ownerEmail = parts[0];
      entryId = parts[1];
    }
  }

  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [managerPosition, setManagerPosition] = useState<Position | null>(
    null
  );
  const [managerMode, setManagerMode] = useState<CommissionMode | null>(
    null
  );

  const [contract, setContract] = useState<ContractDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [overrideItems, setOverrideItems] = useState<
    CommissionResultItemDTO[] | null
  >(null);
  const [overrideTotal, setOverrideTotal] = useState<number | null>(null);

  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [showAdvisorDetails, setShowAdvisorDetails] = useState(false);
  const [ownerPosition, setOwnerPosition] = useState<Position | null>(null);
  const [ownerManagerEmail, setOwnerManagerEmail] = useState<string | null>(null);
  const [ownerManagerPosition, setOwnerManagerPosition] = useState<Position | null>(null);

  // auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  // metadata přihlášeného usera
  useEffect(() => {
    const loadUserMeta = async () => {
      if (!user?.email) return;

      try {
        const ref = doc(db, "users", user.email);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data() as any;
          if (data.position) {
            setManagerPosition(data.position as Position);
          }
          if (data.commissionMode) {
            setManagerMode(data.commissionMode as CommissionMode);
          }
        }
      } catch (e) {
        console.error("Chyba při načítání uživatele:", e);
      }
    };

    loadUserMeta();
  }, [user]);

  // načtení smlouvy – users/{email}/entries/{entryId}
  useEffect(() => {
    const load = async () => {
      if (!ownerEmail || !entryId) {
        setError("Neplatný odkaz na smlouvu.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const ref = doc(db, "users", ownerEmail, "entries", entryId);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          setError("Smlouva nebyla nalezena.");
          setContract(null);
        } else {
          const data = snap.data() as any;
          const c: ContractDoc = {
            id: snap.id,
            ...data,
          };
          setContract(c);

          // meta o poradci
          try {
            const userRef = doc(db, "users", ownerEmail);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists()) {
              const d = userSnap.data() as any;
              const pos = (d.position ?? null) as Position | null;
              const mgrEmail =
                ((d.managerEmail as string | undefined) ?? null)?.toLowerCase() ??
                null;
              setOwnerPosition(pos);
              setOwnerManagerEmail(mgrEmail);

              if (mgrEmail) {
                const mgrSnap = await getDoc(doc(db, "users", mgrEmail));
                if (mgrSnap.exists()) {
                  const md = mgrSnap.data() as any;
                  setOwnerManagerPosition(
                    (md.position ?? null) as Position | null
                  );
                }
              }
            }
          } catch (metaErr) {
            console.error("Chyba při načítání uživatele smlouvy:", metaErr);
          }
        }
      } catch (e) {
        console.error(e);
        setError("Při načítání smlouvy došlo k chybě.");
        setContract(null);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [ownerEmail, entryId]);

  const premium = contract?.inputAmount ?? 0;
  const total = contract?.total ?? 0;
  const freq = contract?.frequencyRaw ?? null;
  const prod = contract?.productKey as Product | undefined;

  const isOwnContract = useMemo(() => {
    if (!user?.email || !contract?.userEmail) return false;
    return (
      user.email.trim().toLowerCase() ===
      contract.userEmail.trim().toLowerCase()
    );
  }, [user, contract]);

  const isManagerViewingSubordinate = useMemo(() => {
    if (!user?.email || !contract?.userEmail) return false;
    if (!isManagerPosition(managerPosition)) return false;

    const current = user.email.trim().toLowerCase();
    const owner = contract.userEmail.trim().toLowerCase();
    return current !== owner;
  }, [user, contract, managerPosition]);

  // výpočet meziprovize
  useEffect(() => {
    if (!contract || !managerPosition || !isManagerViewingSubordinate) {
      setOverrideItems(null);
      setOverrideTotal(null);
      return;
    }

    const managerResult = calculateResultForPosition(
      contract,
      managerPosition,
      managerMode
    );
    if (!managerResult) {
      setOverrideItems(null);
      setOverrideTotal(null);
      return;
    }

    const baselinePos =
      ownerPosition ?? ((contract.position as Position | null) ?? null);
    const baselineMode =
      (contract as any)?.commissionMode ?? managerMode ?? null;

    const baselineResult =
      baselinePos != null
        ? calculateResultForPosition(contract, baselinePos, baselineMode)
        : null;

    const subItems = baselineResult?.items ?? contract.items ?? [];
    const subTotal = baselineResult?.total ?? contract.total ?? 0;

    const diffItems: CommissionResultItemDTO[] = managerResult.items.map(
      (mgrItem, idx) => {
        const subAmount = subItems[idx]?.amount ?? 0;
        return {
          title: mgrItem.title,
          amount: mgrItem.amount - subAmount,
        };
      }
    );

    const diffTotal = managerResult.total - subTotal;

    setOverrideItems(diffItems);
    setOverrideTotal(diffTotal);
  }, [
    contract,
    managerPosition,
    managerMode,
    isManagerViewingSubordinate,
    ownerManagerPosition,
    ownerPosition,
  ]);

  // mazání smlouvy
  const handleDelete = async () => {
    if (!ownerEmail || !entryId) return;
    const confirmed = window.confirm(
      "Opravdu chceš tuto smlouvu smazat? Tuto akci nelze vrátit."
    );
    if (!confirmed) return;

    setDeleting(true);
    setDeleteError(null);

    try {
      const ref = doc(db, "users", ownerEmail, "entries", entryId);
      await deleteDoc(ref);
      window.location.href = "/smlouvy";
    } catch (e) {
      console.error("Chyba při mazání smlouvy:", e);
      setDeleteError(
        "Smlouvu se nepodařilo smazat. Zkus to prosím znovu."
      );
      setDeleting(false);
    }
  };

  // vyfiltrované položky bez řádku "Celkem"
  const filterDomexItems = (arr: CommissionResultItemDTO[]) => {
    if (prod !== "domex") return arr;
    return arr.filter((it) =>
      (it.title ?? "").toLowerCase().includes("(z platby)")
    );
  };

  const adviserItems =
    filterDomexItems(
      (contract?.items ?? []).filter(
        (it) => !it.title.toLowerCase().includes("celkem")
      )
    ) ?? [];

  const managerItems =
    filterDomexItems(
      (overrideItems ?? []).filter(
        (it) => !it.title.toLowerCase().includes("celkem")
      )
    ) ?? [];

  const showMeziprovision =
    managerItems.length > 0 &&
    overrideTotal != null &&
    isManagerViewingSubordinate;

  return (
    <main className="relative min-h-screen overflow-hidden text-slate-50">
      {/* Plasma pozadí jako na ostatních stránkách */}
      <div className="fixed inset-0 -z-10 bg-black">
        <Plasma
          color="#4f46e5"
          speed={0.6}
          direction="forward"
          scale={1.1}
          opacity={0.85}
          mouseInteractive={true}
        />
      </div>

      <div className="relative flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-4xl">
          <div className="rounded-3xl bg-white/5 border border-white/15 shadow-[0_24px_80px_rgba(0,0,0,0.85)] backdrop-blur-2xl p-6 sm:p-8 space-y-6">
            {/* HEADER */}
            <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400 mb-1">
                  Detail smlouvy
                </p>
              </div>

              <div className="flex gap-2">
                <Link
                  href="/smlouvy"
                  className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-xs sm:text-sm text-slate-50 hover:bg-white/10"
                >
                  ← Zpět na smlouvy
                </Link>
              </div>
            </header>

            {/* Klient / Produkt boxy */}
            <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-2xl bg-white/5 border border-white/12 px-4 py-3 backdrop-blur-xl shadow-[0_14px_50px_rgba(0,0,0,0.45)]">
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400 mb-1.5">
                  Klient
                </div>
                <div className="text-2xl font-semibold text-slate-50">
                  {contract?.clientName ?? "—"}
                </div>
              </div>

              <div className="rounded-2xl bg-white/5 border border-white/12 px-4 py-3 backdrop-blur-xl shadow-[0_14px_50px_rgba(0,0,0,0.45)]">
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400 mb-1.5">
                  Produkt
                </div>
                <div className="text-lg font-semibold text-slate-50">
                  <div className="flex items-center gap-3">
                    <Image
                      src={productIcon(prod)}
                      alt="Produkt"
                      width={56}
                      height={56}
                      className="h-12 w-auto"
                    />
                    <span>{productLabel(prod)}</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Info o poradci – zobraz pouze manažerovi na podřízené smlouvě */}
            {contract && isManagerViewingSubordinate && (
              <section className="rounded-2xl bg-white/5 border border-white/15 px-4 py-3 backdrop-blur-xl shadow-[0_14px_50px_rgba(0,0,0,0.45)]">
                <h3 className="text-sm font-semibold text-slate-100 mb-2">
                  Poradce
                </h3>
                <dl className="space-y-1 text-sm text-slate-200">
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-300">Sjednal</dt>
                    <dd className="font-semibold text-right">
                      {nameFromEmail(contract.userEmail)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-300">Pozice</dt>
                    <dd className="font-semibold text-right">
                      {positionLabel(
                        ownerPosition ?? (contract.position as Position | null)
                      )}
                    </dd>
                  </div>
                  {ownerManagerEmail && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-300">Nadřízený</dt>
                      <dd className="font-semibold text-right">
                        {nameFromEmail(ownerManagerEmail)}
                        {ownerManagerPosition && (
                          <span className="text-[11px] text-slate-400 block">
                            {positionLabel(ownerManagerPosition)}
                          </span>
                        )}
                      </dd>
                    </div>
                  )}
                </dl>
              </section>
            )}

            {/* STAVY */}
            {loading && (
              <p className="text-sm text-slate-300">Načítám smlouvu…</p>
            )}

            {!loading && error && (
              <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {error}
              </div>
            )}

            {!loading && !error && contract && (
              <div className="space-y-6">
                {/* ZÁKLADNÍ INFO */}
                <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-2xl bg-white/5 border border-white/15 px-4 py-3 backdrop-blur-xl">
                    <h3 className="text-base font-semibold text-slate-100 mb-3">
                      Základní údaje
                    </h3>
                    <dl className="space-y-2 text-sm text-slate-200">
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-300">Sjednána jako</dt>
                        <dd className="font-semibold text-right">
                          {positionLabel(contract.position)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-300">Pojistné</dt>
                        <dd className="font-semibold text-right">
                          {formatMoney(premium)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-300">
                          Frekvence platby
                        </dt>
                        <dd className="font-semibold text-right">
                          {frequencyText(freq)}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  {/* DATA SMLOUVY */}
                  <div className="rounded-2xl bg-white/5 border border-white/15 px-4 py-3 backdrop-blur-xl">
                    <h3 className="text-base font-semibold text-slate-100 mb-3">
                      Data smlouvy
                    </h3>
                    <dl className="space-y-2 text-sm text-slate-200">
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-300">Datum sjednání</dt>
                        <dd className="font-semibold text-right">
                          {formatDate(
                            contract.contractSignedDate ?? contract.createdAt
                          )}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-slate-300">
                          Počátek smlouvy
                        </dt>
                        <dd className="font-semibold text-right">
                          {formatDate(contract.policyStartDate)}
                        </dd>
                      </div>
                      {contract.contractNumber && (
                        <div className="flex justify-between gap-2">
                          <dt className="text-slate-300">
                            Číslo smlouvy
                          </dt>
                          <dd className="font-semibold text-right">
                            {contract.contractNumber}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>
                </section>

                {/* MEZIPROVIZE – jen když manažer kouká na podřízeného */}
                {showMeziprovision && (
                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold text-emerald-200">
                      Meziprovize pro {managerPosition ?? "manažera"}
                    </h3>
                    <div className="rounded-2xl border border-emerald-400/40 bg-emerald-950/25 backdrop-blur-xl px-4 py-3 divide-y divide-white/10">
                      {managerItems.map((item) => (
                        <div
                          key={item.title}
                          className="flex items-baseline justify-between gap-3 py-2"
                        >
                          <span className="text-sm text-slate-200">
                            {item.title}
                          </span>
                          <span className="text-sm font-semibold text-emerald-300">
                            {formatMoney(item.amount)}
                          </span>
                        </div>
                      ))}

                      <div className="flex items-center justify-between pt-3">
                        <span className="text-sm font-semibold">
                          Celkem meziprovize
                        </span>
                        <span className="text-base font-bold text-emerald-300">
                          {formatMoney(overrideTotal)}
                        </span>
                      </div>
                    </div>
                  </section>
                )}

                {/* PROVIZE PORADCE */}
                {isOwnContract ? (
                  // VLASTNÍ SMLOUVA – vždy viditelné
                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold text-slate-100">
                      Výpočet provizí
                    </h3>
                    <div className="rounded-2xl border border-emerald-400/40 bg-emerald-950/25 backdrop-blur-xl px-4 py-3 divide-y divide-white/10">
                      {adviserItems.map((item) => (
                        <div
                          key={item.title}
                          className="flex items-baseline justify-between gap-3 py-2"
                        >
                          <span className="text-sm text-slate-200">
                            {item.title}
                          </span>
                          <span className="text-sm font-medium text-slate-50">
                            {formatMoney(item.amount)}
                          </span>
                        </div>
                      ))}

                      <div className="flex items-center justify-between pt-3">
                        <span className="text-sm font-semibold">
                          Celkem
                        </span>
                        <span className="text-base font-bold">
                          {formatMoney(total)}
                        </span>
                      </div>
                    </div>
                  </section>
                ) : (
                  // MANAŽER NA SMLOUVĚ PODŘÍZENÉHO – collapsible
                  <section className="space-y-3">
                    <button
                      type="button"
                      onClick={() =>
                        setShowAdvisorDetails((v) => !v)
                      }
                      className="inline-flex items-center gap-2 text-sm font-semibold text-slate-100 hover:text-emerald-300 transition"
                    >
                      <span>
                        {showAdvisorDetails
                          ? "Skrýt provizi poradce"
                          : "Zobrazit provizi poradce"}
                      </span>
                      <span className="text-xs text-slate-400">
                        {showAdvisorDetails ? "▲" : "▼"}
                      </span>
                    </button>

                    {showAdvisorDetails && (
                      <div className="rounded-2xl border border-emerald-400/40 bg-emerald-950/25 backdrop-blur-xl px-4 py-3 divide-y divide-white/10">
                        {adviserItems.map((item) => (
                          <div
                            key={item.title}
                            className="flex items-baseline justify-between gap-3 py-2"
                          >
                            <span className="text-sm text-slate-200">
                              {item.title}
                            </span>
                            <span className="text-sm font-medium text-slate-50">
                              {formatMoney(item.amount)}
                            </span>
                          </div>
                        ))}

                        <div className="flex items-center justify-between pt-3">
                          <span className="text-sm font-semibold">
                            Celkem
                          </span>
                          <span className="text-base font-bold">
                            {formatMoney(total)}
                          </span>
                        </div>
                      </div>
                    )}
                  </section>
                )}

                {/* SMAZAT SMLOUVU */}
                <section className="pt-2">
                  {deleteError && (
                    <p className="mb-2 text-xs text-red-300">
                      {deleteError}
                    </p>
                  )}
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={deleting}
                      className="inline-flex items-center rounded-xl border border-red-500/70 bg-red-600/80 px-4 py-2 text-xs sm:text-sm font-medium text-white shadow-lg shadow-red-500/40 hover:bg-red-500 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {deleting ? "Mažu…" : "Smazat smlouvu"}
                    </button>
                  </div>
                </section>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
