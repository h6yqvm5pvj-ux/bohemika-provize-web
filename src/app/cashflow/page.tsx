// src/app/cashflow/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { auth, db } from "../firebase";
import {
  onAuthStateChanged,
  type User as FirebaseUser,
} from "firebase/auth";
import { collectionGroup, getDocs } from "firebase/firestore";

import { AppLayout } from "@/components/AppLayout";
import SplitTitle from "../pomucky/plan-produkce/SplitTitle";
import {
  type Product,
  type PaymentFrequency,
  type CommissionResultItemDTO,
  type Position,
  type CommissionMode,
} from "../types/domain";
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
} from "../lib/productFormulas";
import { doc, getDoc, collection, query, where } from "firebase/firestore";

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

function normalizeTitleKey(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("z platby")) return `payment-${t}`;
  if (t.includes("za rok")) return `annual-${t}`;
  if (t.includes("okamžitá")) return "immediate";
  if (t.includes("po 3")) return "po3";
  if (t.includes("po 4")) return "po4";
  if (t.includes("2.–5.")) return "nasl25";
  if (t.includes("5.–10.")) return "nasl510";
  if (t.includes("od 6.")) return "nasl6plus";
  if (t.includes("z platby")) return "subsequentByPayment";
  return t;
}

function commissionItemsForPosition(
  entry: EntryDoc,
  pos: Position
): CommissionResultItemDTO[] {
  const product = entry.productKey;
  const amount = entry.inputAmount ?? 0;
  const freq = (entry.frequencyRaw ?? "annual") as PaymentFrequency;
  const duration =
    typeof entry.durationYears === "number" && !Number.isNaN(entry.durationYears)
      ? entry.durationYears
      : 15;
  const mode = (entry.commissionMode ?? entry.mode ?? "accelerated") as CommissionMode;

  switch (product) {
    case "neon":
      return calculateNeon(amount, pos, duration, mode).items;
    case "flexi":
      return calculateFlexi(amount, pos, mode).items;
    case "maximaMaxEfekt":
      return calculateMaxEfekt(amount, duration, pos, mode).items;
    case "pillowInjury":
      return calculatePillowInjury(amount, pos, mode).items;
    case "domex":
      return calculateDomex(amount, freq, pos).items;
    case "maxdomov":
      return calculateMaxdomov(amount, freq, pos).items;
    case "cppAuto":
      return calculateCppAuto(amount, freq, pos).items;
    case "allianzAuto":
      return calculateAllianzAuto(amount, freq, pos).items;
    case "csobAuto":
      return calculateCsobAuto(amount, freq, pos).items;
    case "uniqaAuto":
      return calculateUniqaAuto(amount, freq, pos).items;
    case "pillowAuto":
      return calculatePillowAuto(amount, freq, pos).items;
    case "kooperativaAuto":
      return calculateKooperativaAuto(amount, freq, pos).items;
    case "zamex":
      return calculateZamex(amount, freq, pos).items;
    case "cppcestovko":
      return calculateCppCestovko(amount, pos).items;
    case "axacestovko":
      return calculateAxaCestovko(amount, pos).items;
    default:
      return [];
  }
}

/* ---------- typy ---------- */

type EntryDoc = {
  id: string;
  originalEntryId?: string | null;

  productKey?: Product;
  frequencyRaw?: PaymentFrequency | null;
  total?: number;
  items?: CommissionResultItemDTO[];

  userEmail?: string | null;
  position?: Position | null;
  mode?: CommissionMode | null;
  commissionMode?: CommissionMode | null;
  inputAmount?: number | null;
  contractNumber?: string | null;

  policyStartDate?: any;
  createdAt?: any;
  durationYears?: number | null;
  source?: "own" | "manager";
};

type CashflowItem = {
  id: string;
  date: Date;
  amount: number;
  productKey: Product | "unknown";
  note?: string | null;
  source?: "own" | "manager";
  contractNumber?: string | null;
  ownerEmail: string | null;
  entryId: string | null;
  isManagerOverride?: boolean;
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

type ProductFilter = "all" | "life" | "auto" | "other";
type ScopeFilter = "combined" | "own" | "team";

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
  horizonYears = 10
): CashflowItem[] {
  const out: CashflowItem[] = [];

  for (const entry of entries) {
    const baseEntryId = entry.originalEntryId ?? entry.id;
    const ownerEmail = entry.userEmail ?? null;
    const normalizedOwnerEmail = ownerEmail
      ? ownerEmail.toLowerCase()
      : null;

    const agreement = toDate(entry.createdAt) ?? new Date();
    const start = toDate(entry.policyStartDate) ?? agreement;
    const product = entry.productKey;

    // Rozšíříme horizont o +1 měsíc, aby se vešla výplata po posunu na 1. den
    // následujícího měsíce (estimatePayoutDate překlápí na další měsíc).
    const horizonEnd = new Date(
      start.getFullYear() + horizonYears,
      start.getMonth() + 1,
      start.getDate()
    );

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
        note:
          entry.source === "manager"
            ? note
              ? `Manažerská · ${note}`
              : "Manažerská"
            : note
            ? `Vlastní · ${note}`
            : "Vlastní",
        source: entry.source,
        contractNumber: entry.contractNumber ?? null,
        ownerEmail: normalizedOwnerEmail,
        entryId: baseEntryId ?? null,
        isManagerOverride: entry.source === "manager",
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

      case "domex": {
        const immediateDomex =
          items.find((i) =>
            i.title.includes("okamžitá provize (z platby)")
          ) ?? immediate;
        const subsequentDomex = items.find((i) =>
          i.title.includes("následná provize (z platby)")
        );

        const stepMonths = monthsBetweenPayments(entry.frequencyRaw);
        const firstPayout = estimatePayoutDate(start, agreement);
        const subsequentStart = new Date(
          start.getFullYear() + 1,
          start.getMonth(),
          start.getDate()
        );

        let payout = firstPayout;
        while (payout <= horizonEnd) {
          const amount =
            payout < subsequentStart
              ? immediateDomex?.amount
              : subsequentDomex?.amount;
          const notePrefix =
            entry.source === "manager" ? "Manažerská · " : "Vlastní · ";
          if (amount && Number.isFinite(amount) && amount !== 0) {
            pushItem(
              amount,
              payout,
              `${notePrefix}DOMEX, ${stepMonths === 1 ? "měsíčně" : `každých ${stepMonths} měsíců`}`
            );
          }
          payout = new Date(
            payout.getFullYear(),
            payout.getMonth() + stepMonths,
            payout.getDate()
          );
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
  const [, setUserPosition] = useState<Position | null>(null);
  const [hasTeam, setHasTeam] = useState(false);

  // akordeon – roky a měsíce
  const [expandedYears, setExpandedYears] = useState<
    Record<number, boolean>
  >({});
  const [expandedMonths, setExpandedMonths] = useState<
    Record<string, boolean>
  >({});

  const [scopeFilter, setScopeFilter] =
    useState<ScopeFilter>("combined");
  const [productFilter, setProductFilter] =
    useState<ProductFilter>("all");

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
        const email = (user.email ?? "").toLowerCase();
        if (!email) throw new Error("Chybí e-mail uživatele");

        // zjistit pozici uživatele
        const meSnap = await getDoc(doc(db, "users", email));
        const myPos = (meSnap.data() as { position?: Position } | undefined)
          ?.position;
        setUserPosition(myPos ?? null);

        // podřízení – celý strom manažerů/podřízených
        const usersCol = collection(db, "users");
        const visited = new Set<string>();
        const subordinatePositions: Record<string, Position | null> = {};
        const managerOf: Record<string, string | null> = {};
        const queue: string[] = [email];

        while (queue.length > 0) {
          const mgrEmail = queue.shift()!;
          const subsSnap = await getDocs(
            query(usersCol, where("managerEmail", "==", mgrEmail))
          );
          subsSnap.docs.forEach((d) => {
            const data = d.data() as any;
            const em = (data.email as string | undefined)?.toLowerCase();
            if (!em || visited.has(em)) return;
            visited.add(em);
            subordinatePositions[em] =
              (data.position as Position | undefined) ?? null;
            managerOf[em] = mgrEmail;
            queue.push(em);
          });
        }

        const subordinateEmails = Array.from(visited);
        setHasTeam(subordinateEmails.length > 0);

        const q = collectionGroup(db, "entries");
        const snap = await getDocs(q);

        const allEntries: EntryDoc[] = snap.docs
          .map((d) => ({
            id: d.id,
            ...(d.data() as any),
          }));

        const ownEntries = allEntries
          .filter((e) => (e.userEmail ?? "").toLowerCase() === email)
          .map((e) => ({ ...e, source: "own" as const }));

        const teamRaw =
          subordinateEmails.length > 0
            ? allEntries.filter((e) =>
                subordinateEmails.includes((e.userEmail ?? "").toLowerCase())
              )
            : [];

        // vypočítat meziprovizi pro manažera (po jednotlivých položkách)
        const overrides: EntryDoc[] = [];
        if (myPos && teamRaw.length > 0) {
          for (const entry of teamRaw) {
            const ownerEmail = (entry.userEmail ?? "").toLowerCase();
            const subPos =
              (entry.position as Position | undefined) ??
              subordinatePositions[ownerEmail] ??
              null;
            const ownerManagerEmail = managerOf[ownerEmail] ?? null;
            const ownerManagerPos = ownerManagerEmail
              ? subordinatePositions[ownerManagerEmail] ?? null
              : null;
            const comparePos = ownerManagerPos ?? subPos;

            if (!subPos) continue;

            const mgrItems = commissionItemsForPosition(entry, myPos);
            const baselineItems = commissionItemsForPosition(
              entry,
              comparePos ?? subPos
            );

            const mgrMap = new Map<
              string,
              { title: string; amount: number }
            >();
            mgrItems.forEach((it) => {
              const key = normalizeTitleKey(it.title ?? "");
              const prev = mgrMap.get(key);
              mgrMap.set(key, {
                title: it.title ?? prev?.title ?? key,
                amount: (prev?.amount ?? 0) + (it.amount ?? 0),
              });
            });

            const diffItems: CommissionResultItemDTO[] = [];
            let diffTotal = 0;

            baselineItems.forEach((it) => {
              const key = normalizeTitleKey(it.title ?? "");
              const mgr = mgrMap.get(key);
              const mgrAmt = mgr?.amount ?? 0;
              const subAmt = it.amount ?? 0;
              const remaining = mgrAmt - subAmt;
              if (remaining > 0) {
                diffItems.push({
                  title: mgr?.title ?? it.title,
                  amount: remaining,
                });
                diffTotal += remaining;
              }
              mgrMap.delete(key);
            });

            mgrMap.forEach((val) => {
              if (val.amount > 0) {
                diffItems.push({ title: val.title, amount: val.amount });
                diffTotal += val.amount;
              }
            });

            if (diffItems.length === 0 || diffTotal <= 0) continue;

            overrides.push({
              ...entry,
              originalEntryId: entry.id,
              id: `${entry.id}-override`,
              items: diffItems,
              total: diffTotal,
              source: "manager",
              position: myPos,
            });
          }
        }

        let entriesForCf: EntryDoc[] = [];
        if (scopeFilter === "own") {
          entriesForCf = ownEntries;
        } else if (scopeFilter === "team") {
          entriesForCf = overrides;
        } else {
          entriesForCf = [...ownEntries, ...overrides];
        }

        if (productFilter !== "all") {
          entriesForCf = entriesForCf.filter((e) => {
            const p = e.productKey;
            if (!p) return false;
            if (productFilter === "life") {
              return (
                p === "neon" ||
                p === "flexi" ||
                p === "maximaMaxEfekt" ||
                p === "pillowInjury"
              );
            }
            if (productFilter === "auto") {
              return (
                p === "cppAuto" ||
                p === "allianzAuto" ||
                p === "csobAuto" ||
                p === "uniqaAuto" ||
                p === "pillowAuto" ||
                p === "kooperativaAuto"
              );
            }
            if (productFilter === "other") {
              return !(
                p === "neon" ||
                p === "flexi" ||
                p === "maximaMaxEfekt" ||
                p === "pillowInjury"
              );
            }
            return true;
          });
        }

        const cf = generateCashflow(entriesForCf, 10);
        setCashflowItems(cf);
      } catch (e) {
        console.error("Chyba při načítání cashflow:", e);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user, scopeFilter, productFilter]);

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
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <SplitTitle text="Cashflow provizí" />

          <div className="rounded-2xl bg-emerald-500/15 border border-emerald-400/50 px-4 py-4 text-center shadow-[0_18px_50px_rgba(16,185,129,0.4)]">
            <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-200/80 mb-1">
              Celkové očekávané cashflow
            </div>
            <div className="text-2xl sm:text-3xl font-semibold text-emerald-100">
              {formatMoney(totalCashflow)}
            </div>
          </div>
        </header>

        {/* Filtry */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl px-4 py-4 shadow-[0_12px_40px_rgba(0,0,0,0.7)] space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">
                  Filtrování smluv
                </p>
                <p className="text-sm text-slate-200">Vlastní / tým</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs sm:text-sm">
              <button
                type="button"
                onClick={() => setScopeFilter("combined")}
                className={`px-3 py-1.5 rounded-full border transition ${
                  scopeFilter === "combined"
                    ? "bg-emerald-500 text-white border-emerald-400 shadow-md shadow-emerald-500/40"
                    : "border-white/20 text-slate-200 hover:bg-white/5"
                }`}
              >
                Kombinovaný
              </button>
              <button
                type="button"
                onClick={() => setScopeFilter("own")}
                className={`px-3 py-1.5 rounded-full border transition ${
                  scopeFilter === "own"
                    ? "bg-emerald-500 text-white border-emerald-400 shadow-md shadow-emerald-500/40"
                    : "border-white/20 text-slate-200 hover:bg-white/5"
                }`}
              >
                Vlastní
              </button>
              <button
                type="button"
                disabled={!hasTeam}
                onClick={() => setScopeFilter("team")}
                className={`px-3 py-1.5 rounded-full border transition ${
                  scopeFilter === "team"
                    ? "bg-emerald-500 text-white border-emerald-400 shadow-md shadow-emerald-500/40"
                    : "border-white/20 text-slate-200 hover:bg-white/5"
                } ${!hasTeam ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                Týmové
              </button>
            </div>
            {!hasTeam && (
              <p className="text-[11px] text-slate-400">
                Týmové smlouvy jsou dostupné jen pro manažery s podřízenými.
              </p>
            )}
          </div>

          <div className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl px-4 py-4 shadow-[0_12px_40px_rgba(0,0,0,0.7)] space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">
                  Filtrování produktů
                </p>
                <p className="text-sm text-slate-200">Výběr kategorií</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs sm:text-sm">
              {[
                ["all", "Všechny"],
                ["life", "Život"],
                ["auto", "Auto"],
                ["other", "Vedlejší produkty"],
              ].map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setProductFilter(val as ProductFilter)}
                  className={`px-3 py-1.5 rounded-full border transition ${
                    productFilter === val
                      ? "bg-sky-500 text-white border-sky-400 shadow-md shadow-sky-500/40"
                      : "border-white/20 text-slate-200 hover:bg-white/5"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>

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
              const averageMonthly = yearGroup.total / 12;

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
                          Celkem na odměnách
                        </p>
                        <p className="text-base sm:text-lg font-semibold text-emerald-300">
                          {formatMoney(yearGroup.total)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] uppercase tracking-[0.16em] text-emerald-300/80">
                          Průměrná měsíční odměna
                        </p>
                        <p className="text-base sm:text-lg font-semibold text-emerald-300">
                          {formatMoney(averageMonthly)}
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
                                  const ownerEmail =
                                    item.ownerEmail &&
                                    item.ownerEmail.trim() !== ""
                                      ? item.ownerEmail.trim().toLowerCase()
                                      : null;
                                  const baseEntryId =
                                    item.entryId &&
                                    item.entryId.trim() !== ""
                                      ? item.entryId.trim()
                                      : null;
                                  const contractSlug =
                                    ownerEmail && baseEntryId
                                      ? `${ownerEmail}___${baseEntryId}`
                                      : null;
                                  const href = contractSlug
                                    ? `/smlouvy/${encodeURIComponent(contractSlug)}`
                                    : null;
                                  const containerClasses =
                                    "flex items-center justify-between gap-3 rounded-xl bg-white/4 border border-white/10 px-3 py-2.5 text-xs sm:text-sm transition hover:border-emerald-300/30 hover:bg-white/6";
                                  const content = (
                                    <>
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
                                    </>
                                  );

                                  return href ? (
                                    <Link
                                      key={item.id}
                                      href={href}
                                      className={containerClasses}
                                    >
                                      {content}
                                    </Link>
                                  ) : (
                                    <div key={item.id} className={containerClasses}>
                                      {content}
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
