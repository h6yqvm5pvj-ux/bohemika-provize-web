// src/app/cashflow/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { auth, db } from "../firebase";
import {
  onAuthStateChanged,
  type User as FirebaseUser,
} from "firebase/auth";
import { collectionGroup, getDocs } from "firebase/firestore";

import { AppLayout } from "@/components/AppLayout";
import {
  type Product,
  type PaymentFrequency,
  type CommissionResultItemDTO,
} from "../types/domain";

/* ---------- helpers ---------- */

type FirestoreTimestamp = {
  seconds: number;
  nanoseconds: number;
};

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

function formatMoney(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value)) return "0 Kč";
  return (
    value.toLocaleString("cs-CZ", {
      maximumFractionDigits: 0,
    }) + " Kč"
  );
}

const MONTH_LABELS = [
  "leden",
  "únor",
  "březen",
  "duben",
  "květen",
  "červen",
  "červenec",
  "srpen",
  "září",
  "říjen",
  "listopad",
  "prosinec",
];

function monthLabelFromDate(d: Date): string {
  return `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`;
}

function productLabel(p?: Product | "unknown"): string {
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

/* ---------- typy ---------- */

type EntryDoc = {
  id: string;

  productKey?: Product;
  frequencyRaw?: PaymentFrequency | null;
  total?: number;
  items?: CommissionResultItemDTO[];

  userEmail?: string | null;
  contractNumber?: string | null;

  policyStartDate?: any;
  createdAt?: any;
  durationYears?: number | null;
};

type CashflowItem = {
  id: string;
  date: Date;
  amount: number;
  productKey: Product | "unknown";
  note?: string | null;
  contractNumber?: string | null;
};

type MonthGroup = {
  key: string; // "2026-4"
  year: number;
  monthIndex: number; // 0–11
  label: string; // "duben 2026"
  total: number;
  items: CashflowItem[];
};

type YearGroup = {
  year: number;
  total: number;
  months: MonthGroup[];
};

/* ---------- logika výplat (zjednodušený cashflow generátor) ---------- */

function estimatePayoutDate(
  policyStart: Date,
  agreementDate?: Date | null,
  cutoffDay = 28
): Date {
  const year = policyStart.getFullYear();
  const month = policyStart.getMonth();
  const day = policyStart.getDate();

  if (agreementDate) {
    const aYear = agreementDate.getFullYear();
    const aMonth = agreementDate.getMonth();
    const isLaterMonth =
      year > aYear || (year === aYear && month > aMonth);

    if (day === 1 && isLaterMonth) {
      return new Date(year, month, 1);
    }
  }

  const monthsToAdd = day > cutoffDay ? 2 : 1;
  return new Date(year, month + monthsToAdd, 1);
}

function monthsBetweenPayments(freq?: PaymentFrequency | null): number {
  switch (freq) {
    case "monthly":
      return 1;
    case "quarterly":
      return 3;
    case "semiannual":
      return 6;
    case "annual":
      return 12;
    default:
      return 12;
  }
}

function generateCashflow(
  entries: EntryDoc[],
  horizonYears = 5
): CashflowItem[] {
  const out: CashflowItem[] = [];
  const now = new Date();
  const horizonEnd = new Date(
    now.getFullYear() + horizonYears,
    now.getMonth(),
    now.getDate()
  );

  for (const entry of entries) {
    const agreement = toDate(entry.createdAt) ?? new Date();
    const start = toDate(entry.policyStartDate) ?? agreement;
    const product = entry.productKey;

    const items = (entry.items ?? []).map((it) => ({
      title: (it.title ?? "").toLowerCase(),
      amount: it.amount ?? 0,
    }));

    const immediate = items.find((i) =>
      i.title.includes("okamžitá provize")
    );
    const po3 = items.find((i) => i.title.includes("po 3 letech"));
    const po4 = items.find((i) => i.title.includes("po 4 letech"));
    const nasl25 = items.find((i) =>
      i.title.includes("následná provize (2.–5. rok)")
    );
    const nasl510 = items.find((i) =>
      i.title.includes("následná provize (5.–10. rok)")
    );
    const naslOd6 = items.find((i) =>
      i.title.includes("následná provize (od 6. roku)")
    );
    const naslMaxdomov = items.find((i) =>
      i.title.includes("následná provize (z platby)")
    );

    const pushItem = (amount: number, date: Date, note?: string) => {
      if (!Number.isFinite(amount) || amount === 0) return;
      if (date > horizonEnd) return;

      out.push({
        id: `${entry.id}-${date.getTime()}-${note ?? ""}`,
        date,
        amount,
        productKey: product ?? "unknown",
        note,
        contractNumber: entry.contractNumber ?? null,
      });
    };

    const annPlusYears = (y: number) =>
      estimatePayoutDate(
        new Date(
          start.getFullYear() + y,
          start.getMonth(),
          start.getDate()
        )
      );

    switch (product) {
      // ŽIVOT – NEON + MaxEfekt
      case "neon":
      case "maximaMaxEfekt": {
        if (immediate) {
          pushItem(
            immediate.amount,
            estimatePayoutDate(start, agreement)
          );
        }
        if (po3) pushItem(po3.amount, annPlusYears(3));
        if (po4) pushItem(po4.amount, annPlusYears(4));

        const maxYears = Math.max(1, entry.durationYears ?? 10);
        if (nasl25) {
          for (let y = 2; y <= 5 && y <= maxYears; y++) {
            pushItem(nasl25.amount, annPlusYears(y), "ročně");
          }
        }
        if (nasl510) {
          for (let y = 5; y <= 10 && y <= maxYears; y++) {
            pushItem(nasl510.amount, annPlusYears(y), "ročně");
          }
        }
        break;
      }

      // FLEXI
      case "flexi": {
        if (immediate) {
          pushItem(
            immediate.amount,
            estimatePayoutDate(start, agreement)
          );
        }
        if (po3) pushItem(po3.amount, annPlusYears(3));
        if (po4) pushItem(po4.amount, annPlusYears(4));

        if (naslOd6) {
          let y = 6;
          while (true) {
            const d = annPlusYears(y);
            if (d > horizonEnd) break;
            pushItem(naslOd6.amount, d, "ročně");
            y += 1;
          }
        }
        break;
      }

      // Pillow úraz / nemoc
      case "pillowInjury": {
        if (immediate) {
          pushItem(
            immediate.amount,
            estimatePayoutDate(start, agreement)
          );
        }
        if (po3) pushItem(po3.amount, annPlusYears(3));
        if (po4) pushItem(po4.amount, annPlusYears(4));
        break;
      }

      // MAXDOMOV – z každé platby
      case "maxdomov": {
        if (!immediate) break;

        const perPaymentImmediate = immediate.amount;
        const perPaymentSub = naslMaxdomov?.amount;
        const stepMonths = monthsBetweenPayments(entry.frequencyRaw);
        const endFirstYear = annPlusYears(1);

        let payout = estimatePayoutDate(start, agreement);
        while (payout <= horizonEnd) {
          if (payout < endFirstYear) {
            pushItem(
              perPaymentImmediate,
              payout,
              "získatelská z platby"
            );
          } else if (perPaymentSub != null) {
            pushItem(perPaymentSub, payout, "následná z platby");
          } else {
            pushItem(perPaymentImmediate, payout);
          }

          payout = new Date(
            payout.getFullYear(),
            payout.getMonth() + stepMonths,
            payout.getDate()
          );
        }
        break;
      }

      // Allianz / Pillow / UNIQA Auto – okamžitá + ročně k výročí
      case "allianzAuto":
      case "pillowAuto":
      case "uniqaAuto": {
        if (!immediate) break;

        const first = estimatePayoutDate(start, agreement);
        if (first <= horizonEnd) {
          pushItem(
            immediate.amount,
            first,
            "okamžitá provize"
          );
        }

        let y = 1;
        while (true) {
          const d = annPlusYears(y);
          if (d > horizonEnd) break;
          pushItem(immediate.amount, d, "ročně k výročí");
          y += 1;
        }
        break;
      }

      // ZAMEX – opakovaně dle frekvence
      case "zamex": {
        if (!immediate) break;

        const amount = immediate.amount;
        const stepMonths = monthsBetweenPayments(entry.frequencyRaw);

        let payout = estimatePayoutDate(start, agreement);
        while (payout <= horizonEnd) {
          pushItem(amount, payout);
          payout = new Date(
            payout.getFullYear(),
            payout.getMonth() + stepMonths,
            payout.getDate()
          );
        }
        break;
      }

      // Auto ČPP / ČSOB / Koop – dle frekvence
      case "cppAuto":
      case "csobAuto":
      case "kooperativaAuto": {
        if (!immediate) break;

        const amount = immediate.amount;
        const stepMonths = monthsBetweenPayments(entry.frequencyRaw);
        let payout = estimatePayoutDate(start, agreement);

        while (payout <= horizonEnd) {
          pushItem(amount, payout);
          payout = new Date(
            payout.getFullYear(),
            payout.getMonth() + stepMonths,
            payout.getDate()
          );
        }
        break;
      }

      // Comfort Commodity – okamžitá + měsíční následná
      case "comfortcc": {
        const immediateComfort = items.find((i) =>
          i.title.includes("okamžitá provize")
        );
        const subsequentComfort = items.find((i) =>
          i.title.includes("následná provize")
        );

        const first = estimatePayoutDate(start, agreement);

        if (immediateComfort && first <= horizonEnd) {
          pushItem(
            immediateComfort.amount,
            first,
            "Comfort Commodity – okamžitá provize"
          );
        }

        if (subsequentComfort) {
          let payout = first;
          while (payout <= horizonEnd) {
            pushItem(
              subsequentComfort.amount,
              payout,
              "Comfort Commodity – následná (měsíčně)"
            );
            payout = new Date(
              payout.getFullYear(),
              payout.getMonth() + 1,
              payout.getDate()
            );
          }
        }
        break;
      }

      // ostatní – jen okamžitá
      default: {
        if (immediate) {
          pushItem(
            immediate.amount,
            estimatePayoutDate(start, agreement)
          );
        }
        break;
      }
    }
  }

  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/* ---------- stránka ---------- */

export default function CashflowPage() {
  const router = useRouter();
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [cashflowItems, setCashflowItems] = useState<CashflowItem[]>([]);

  // akordeon – roky a měsíce
  const [expandedYears, setExpandedYears] = useState<
    Record<number, boolean>
  >({});
  const [expandedMonths, setExpandedMonths] = useState<
    Record<string, boolean>
  >({});

  // auth guard
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      if (!fbUser) {
        setUser(null);
        router.push("/login");
        return;
      }
      setUser(fbUser);
    });
    return () => unsub();
  }, [router]);

  // načtení entries a vygenerování cashflow
  useEffect(() => {
    if (!user?.email) return;

    const load = async () => {
      setLoading(true);
      try {
        const q = collectionGroup(db, "entries");
        const snap = await getDocs(q);

        const entries: EntryDoc[] = snap.docs
          .map((d) => ({
            id: d.id,
            ...(d.data() as any),
          }))
          .filter((e) => e.userEmail === user.email);

        const cf = generateCashflow(entries);
        setCashflowItems(cf);
      } catch (e) {
        console.error("Chyba při načítání cashflow:", e);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user]);

  // seskupení podle měsíců
  const monthGroups: MonthGroup[] = useMemo(() => {
    if (cashflowItems.length === 0) return [];

    const map = new Map<string, MonthGroup>();

    for (const item of cashflowItems) {
      const d = item.date;
      const year = d.getFullYear();
      const monthIndex = d.getMonth();
      const key = `${year}-${monthIndex + 1}`;
      const label = monthLabelFromDate(d);

      if (!map.has(key)) {
        map.set(key, {
          key,
          year,
          monthIndex,
          label,
          total: 0,
          items: [],
        });
      }
      const g = map.get(key)!;
      g.total += item.amount;
      g.items.push(item);
    }

    const arr = Array.from(map.values());
    arr.forEach((g) =>
      g.items.sort((a, b) => a.date.getTime() - b.date.getTime())
    );

    arr.sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.monthIndex - b.monthIndex;
    });

    return arr;
  }, [cashflowItems]);

  // seskupení měsíců do roků
  const yearGroups: YearGroup[] = useMemo(() => {
    if (monthGroups.length === 0) return [];

    const yearMap = new Map<number, YearGroup>();

    for (const month of monthGroups) {
      if (!yearMap.has(month.year)) {
        yearMap.set(month.year, {
          year: month.year,
          total: 0,
          months: [],
        });
      }
      const yg = yearMap.get(month.year)!;
      yg.total += month.total;
      yg.months.push(month);
    }

    const arr = Array.from(yearMap.values());
    arr.forEach((yg) =>
      yg.months.sort((a, b) => a.monthIndex - b.monthIndex)
    );
    arr.sort((a, b) => a.year - b.year);
    return arr;
  }, [monthGroups]);

  // inicializace otevřených roků/měsíců (jen jednou, až jsou data)
  useEffect(() => {
    if (yearGroups.length === 0) return;

    setExpandedYears((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      const next: Record<number, boolean> = {};
      yearGroups.forEach((y) => {
        next[y.year] = false; // defaultně zavřené
      });
      return next;
    });

    setExpandedMonths((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      const next: Record<string, boolean> = {};
      monthGroups.forEach((m) => {
        next[m.key] = false;
      });
      return next;
    });
  }, [yearGroups, monthGroups]);

  const totalCashflow = useMemo(
    () => cashflowItems.reduce((sum, i) => sum + i.amount, 0),
    [cashflowItems]
  );

  const toggleYear = (year: number) => {
    setExpandedYears((prev) => ({
      ...prev,
      [year]: !prev[year],
    }));
  };

  const toggleMonth = (key: string) => {
    setExpandedMonths((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  return (
    <AppLayout active="cashflow">
      <div className="w-full max-w-5xl space-y-6">
        {/* HEADER + souhrnný box */}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
              Cashflow provizí
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-1">
              Přehled očekávaných výplat provizí z tvých sjednaných
              smluv.
            </p>
          </div>

          <div className="rounded-2xl bg-emerald-500/15 border border-emerald-400/50 px-4 py-3 text-right shadow-[0_18px_50px_rgba(16,185,129,0.4)]">
            <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-200/80 mb-1">
              Celkové očekávané cashflow
            </div>
            <div className="text-xl sm:text-2xl font-semibold text-emerald-100">
              {formatMoney(totalCashflow)}
            </div>
            <div className="text-[11px] text-emerald-200/80 mt-0.5">
              Vygenerováno z existujících výpočtů.
            </div>
          </div>
        </header>

        {loading ? (
          <p className="text-sm text-slate-300">Načítám data…</p>
        ) : yearGroups.length === 0 ? (
          <p className="text-sm text-slate-300">
            Zatím nemáš žádné smlouvy, ze kterých by šlo cashflow
            spočítat.
          </p>
        ) : (
          <div className="space-y-4">
            {yearGroups.map((yearGroup) => {
              const yearOpen = expandedYears[yearGroup.year] ?? false;

              return (
                <section
                  key={yearGroup.year}
                  className="rounded-2xl bg-slate-950/80 border border-white/12 backdrop-blur-2xl px-4 py-4 sm:px-5 sm:py-5 shadow-[0_18px_60px_rgba(0,0,0,0.85)]"
                >
                  {/* HLAVIČKA ROKU */}
                  <button
                    type="button"
                    onClick={() => toggleYear(yearGroup.year)}
                    className="flex w-full items-center justify-between gap-3 text-left"
                  >
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                        Rok výplat
                      </p>
                      <h2 className="text-lg sm:text-xl font-semibold text-slate-50">
                        Rok {yearGroup.year}
                      </h2>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-[11px] uppercase tracking-[0.16em] text-emerald-300/80">
                          Součet roku
                        </p>
                        <p className="text-base sm:text-lg font-semibold text-emerald-300">
                          {formatMoney(yearGroup.total)}
                        </p>
                      </div>

                      <span
                        className={`inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-white/5 text-xs transition-transform ${
                          yearOpen ? "rotate-90" : ""
                        }`}
                      >
                        ▶
                      </span>
                    </div>
                  </button>

                  {/* MĚSÍCE V ROCE */}
                  {yearOpen && (
                    <div className="mt-4 space-y-3 border-t border-white/10 pt-3">
                      {yearGroup.months.map((month) => {
                        const isOpen = expandedMonths[month.key] ?? false;

                        return (
                          <div
                            key={month.key}
                            className="rounded-2xl bg-slate-950/70 border border-white/10 backdrop-blur-xl px-3 py-3 sm:px-4 sm:py-4 shadow-[0_12px_40px_rgba(0,0,0,0.7)]"
                          >
                            {/* HLAVIČKA MĚSÍCE */}
                            <button
                              type="button"
                              onClick={() => toggleMonth(month.key)}
                              className="flex w-full items-center justify-between gap-3 text-left"
                            >
                              <div>
                                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">
                                  Měsíc výplaty
                                </p>
                                <h3 className="text-base sm:text-lg font-semibold text-slate-50">
                                  {month.label}
                                </h3>
                              </div>

                              <div className="flex items-center gap-4">
                                <div className="text-right">
                                  <p className="text-[10px] uppercase tracking-[0.16em] text-emerald-300/80">
                                    Součet
                                  </p>
                                  <p className="text-sm sm:text-base font-semibold text-emerald-300">
                                    {formatMoney(month.total)}
                                  </p>
                                </div>

                                <span
                                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/20 bg-white/5 text-[11px] transition-transform ${
                                    isOpen ? "rotate-90" : ""
                                  }`}
                                >
                                  ▶
                                </span>
                              </div>
                            </button>

                            {/* PRODUKTY V MĚSÍCI */}
                            {isOpen && (
                              <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                                {month.items.map((item) => {
                                  const d = item.date;
                                  const dateLabel =
                                    d.toLocaleDateString("cs-CZ");
                                  const prodLabel = productLabel(
                                    item.productKey
                                  );
                                  const contractNo =
                                    item.contractNumber &&
                                    item.contractNumber.trim() !== ""
                                      ? item.contractNumber
                                      : null;

                                  return (
                                    <div
                                      key={item.id}
                                      className="flex items-center justify-between gap-3 rounded-xl bg-white/4 border border-white/10 px-3 py-2.5 text-xs sm:text-sm"
                                    >
                                      <div className="flex flex-col">
                                        <span className="text-[11px] text-slate-400">
                                          {dateLabel}
                                        </span>
                                        <span className="text-slate-100 font-medium">
                                          {prodLabel}
                                          {contractNo && (
                                            <span className="text-slate-300 font-normal">
                                              {" "}
                                              · {contractNo}
                                            </span>
                                          )}
                                        </span>
                                        {item.note && (
                                          <span className="text-[11px] text-slate-400">
                                            {item.note}
                                          </span>
                                        )}
                                      </div>

                                      <div className="text-right text-sm font-semibold text-slate-50">
                                        {formatMoney(item.amount)}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}