"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit as fbLimit,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";

import { AppLayout } from "@/components/AppLayout";
import { auth, db } from "@/app/firebase";
import {
  calculateAllianzAuto,
  calculateAxaCestovko,
  calculateComfortCC,
  calculateCppAuto,
  calculateCppCestovko,
  calculateCppPPRbez,
  calculateCppPPRs,
  calculateCsobAuto,
  calculateDomex,
  calculateFlexi,
  calculateKooperativaAuto,
  calculateMaxEfekt,
  calculateMaxdomov,
  calculateNeon,
  calculatePillowAuto,
  calculatePillowInjury,
  calculateUniqaAuto,
  calculateZamex,
} from "@/app/lib/productFormulas";
import { type CommissionMode, type CommissionResultDTO, type Position, type Product } from "@/app/types/domain";
import SplitTitle from "../plan-produkce/SplitTitle";

type ContractEntry = {
  id: string;
  product: Product;
  premium: string;
  commission: number;
};

type DayEntry = {
  outreach: string;
  agreed: string;
  meetings: string;
  workedHours: string;
  contracts: ContractEntry[];
};

const LIFE_PRODUCTS: Product[] = ["neon", "flexi", "maximaMaxEfekt", "pillowInjury"];
const TRAVEL_PRODUCTS: Product[] = ["cppcestovko", "axacestovko"];
const DEFAULT_POSITION: Position = "poradce1";
const DEFAULT_MODE: CommissionMode = "accelerated";
const DEFAULT_PRODUCT: Product = "neon";

const PRODUCT_OPTIONS: { value: Product; label: string }[] = [
  { value: "neon", label: "ČPP ŽP NEON" },
  { value: "flexi", label: "Kooperativa ŽP FLEXI" },
  { value: "maximaMaxEfekt", label: "MAXIMA ŽP MaxEfekt" },
  { value: "pillowInjury", label: "Pillow Úraz / Nemoc" },
  { value: "domex", label: "ČPP DOMEX" },
  { value: "maxdomov", label: "Maxima MAXDOMOV" },
  { value: "zamex", label: "ČPP ZAMEX" },
  { value: "cppPPRbez", label: "ČPP Pojištění majetku a odpovědnosti podnikatelů" },
  { value: "cppPPRs", label: "ČPP Pojištění majetku a odpovědnosti podnikatelů – ÚPIS" },
  { value: "cppAuto", label: "ČPP Auto" },
  { value: "allianzAuto", label: "Allianz Auto" },
  { value: "csobAuto", label: "ČSOB Auto" },
  { value: "uniqaAuto", label: "UNIQA Auto" },
  { value: "pillowAuto", label: "Pillow Auto" },
  { value: "kooperativaAuto", label: "Kooperativa Auto" },
  { value: "cppcestovko", label: "ČPP Cestovko" },
  { value: "axacestovko", label: "AXA Cestovko" },
  { value: "comfortcc", label: "Comfort Commodity" },
];
const PRODUCT_SET = new Set(PRODUCT_OPTIONS.map((p) => p.value));

const POSITION_LABELS: Record<Position, string> = {
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

function parseNumberSafe(value: string): number {
  if (!value) return 0;
  const normalized = value.replace(/\s+/g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 Kč";
  return (
    value.toLocaleString("cs-CZ", {
      maximumFractionDigits: 0,
    }) + " Kč"
  );
}

function premiumLabel(product: Product): string {
  if (TRAVEL_PRODUCTS.includes(product)) return "Jednorázové pojistné";
  return LIFE_PRODUCTS.includes(product) ? "Měsíční pojistné" : "Roční pojistné";
}

function immediateCommission(dto: CommissionResultDTO | null | undefined): number {
  if (!dto) return 0;
  const immediate = dto.items?.find((it) => (it.title ?? "").toLowerCase().includes("okamžit"));
  if (immediate && Number.isFinite(immediate.amount)) return immediate.amount;
  return Number.isFinite(dto.total) ? dto.total : 0;
}

function positionLabel(pos: Position | null): string {
  if (!pos) return "Poradce 1 (výchozí)";
  return POSITION_LABELS[pos] ?? pos;
}

function modeLabel(mode: CommissionMode | null): string {
  if (mode === "standard") return "Standard";
  return "Zrychlený";
}

function hasContent(day: DayEntry): boolean {
  const outreach = Number(day.outreach) || 0;
  const agreed = Number(day.agreed) || 0;
  const meetings = Number(day.meetings) || 0;
  const hours = parseNumberSafe(day.workedHours);
  const hasContracts = day.contracts.some(
    (c) => parseNumberSafe(c.premium) > 0 || (c.product as string)
  );
  return outreach > 0 || agreed > 0 || meetings > 0 || hours > 0 || hasContracts;
}

function normalizeProduct(product: any): Product {
  return PRODUCT_SET.has(product) ? (product as Product) : DEFAULT_PRODUCT;
}

function toInputValue(v: any): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return "";
  return String(n);
}

function calculateCommission(product: Product, premiumRaw: string, position: Position, mode: CommissionMode): number {
  const premium = parseNumberSafe(premiumRaw);
  if (!Number.isFinite(premium) || premium <= 0) return 0;
  const pos = position ?? DEFAULT_POSITION;
  const m = mode ?? DEFAULT_MODE;

  switch (product) {
    case "neon":
      return immediateCommission(calculateNeon(premium, pos, 15, m));
    case "flexi":
      return immediateCommission(calculateFlexi(premium, pos, m));
    case "maximaMaxEfekt":
      return immediateCommission(calculateMaxEfekt(premium, 20, pos, m));
    case "pillowInjury":
      return immediateCommission(calculatePillowInjury(premium, pos, m));
    case "domex":
      return immediateCommission(calculateDomex(premium, "annual", pos));
    case "maxdomov":
      return immediateCommission(calculateMaxdomov(premium, "annual", pos));
    case "cppAuto":
      return immediateCommission(calculateCppAuto(premium, "annual", pos));
    case "allianzAuto":
      return immediateCommission(calculateAllianzAuto(premium, "annual", pos));
    case "csobAuto":
      return immediateCommission(calculateCsobAuto(premium, "annual", pos));
    case "uniqaAuto":
      return immediateCommission(calculateUniqaAuto(premium, "annual", pos));
    case "pillowAuto":
      return immediateCommission(calculatePillowAuto(premium, "annual", pos));
    case "kooperativaAuto":
      return immediateCommission(calculateKooperativaAuto(premium, "annual", pos));
    case "zamex":
      return immediateCommission(calculateZamex(premium, "annual", pos));
    case "cppPPRbez":
      return immediateCommission(calculateCppPPRbez(premium, "annual", pos));
    case "cppPPRs":
      return immediateCommission(calculateCppPPRs(premium, "annual", pos));
    case "cppcestovko":
      return immediateCommission(calculateCppCestovko(premium, pos));
    case "axacestovko":
      return immediateCommission(calculateAxaCestovko(premium, pos));
    case "comfortcc":
      return immediateCommission(
        calculateComfortCC({
          fee: premium,
          position: pos,
        })
      );
    default:
      return 0;
  }
}

function monthMeta() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const label = now.toLocaleDateString("cs-CZ", { month: "long", year: "numeric" });
  return { year, month, daysInMonth, label };
}

function dayKey(year: number, month: number, dayIndex: number): string {
  const m = String(month + 1).padStart(2, "0");
  const d = String(dayIndex + 1).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

function makeId() {
  return `c-${Math.random().toString(36).slice(2, 8)}-${Date.now()}`;
}

function StatistikaPageInner() {
  const { year, month, daysInMonth, label } = useMemo(() => monthMeta(), []);
  const todayIndex = useMemo(() => {
    const now = new Date();
    if (now.getFullYear() === year && now.getMonth() === month) {
      return Math.max(0, now.getDate() - 1);
    }
    return 0;
  }, [year, month]);
  const searchParams = useSearchParams();
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [ownerEmail, setOwnerEmail] = useState<string | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [commissionMode, setCommissionMode] = useState<CommissionMode | null>(null);
  const [selectedDay, setSelectedDay] = useState<number>(() => todayIndex);
  const [days, setDays] = useState<DayEntry[]>(
    () =>
      Array.from({ length: daysInMonth }, () => ({
        outreach: "",
        agreed: "",
        meetings: "",
        workedHours: "",
        contracts: [],
      })) as DayEntry[]
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (current) => {
      if (!current?.email) {
        setCurrentUserEmail(null);
        return;
      }
      setCurrentUserEmail(current.email.toLowerCase());
    });

    return () => unsubscribe();
  }, []);

  const positionForCalc = position ?? DEFAULT_POSITION;
  const modeForCalc = commissionMode ?? DEFAULT_MODE;
  const [savingState, setSavingState] = useState<Record<string | number, boolean>>({});
  const [saveStatus, setSaveStatus] = useState<Record<number, "ok" | "error" | null>>({});
  const [savedDays, setSavedDays] = useState<Record<number, boolean>>({});
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<
    { id: string; label: string; outreach: number; meetings: number; commission: number; hours: number; savedAt?: number | null }[]
  >([]);
  const autoSavedRef = useRef(false);

  useEffect(() => {
    const targetEmail = (searchParams.get("user") ?? "").toLowerCase();
    if (targetEmail) {
      setOwnerEmail(targetEmail);
      return;
    }
    setOwnerEmail((prev) => prev ?? (currentUserEmail ? currentUserEmail.toLowerCase() : null));
  }, [searchParams, currentUserEmail]);

  useEffect(() => {
    if (!ownerEmail) {
      setPosition(null);
      setCommissionMode(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const ref = doc(db, "users", ownerEmail);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          if (!cancelled) {
            setPosition(null);
            setCommissionMode(null);
          }
          return;
        }
        const data = snap.data() as { position?: Position | null; commissionMode?: CommissionMode | null };
        if (cancelled) return;
        setPosition((data.position as Position | null | undefined) ?? null);
        setCommissionMode((data.commissionMode as CommissionMode | null | undefined) ?? null);
      } catch {
        if (cancelled) return;
        setPosition(null);
        setCommissionMode(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ownerEmail]);

  useEffect(() => {
    if (!ownerEmail) {
      setPosition(null);
      setCommissionMode(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const ref = doc(db, "users", ownerEmail);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          if (!cancelled) {
            setPosition(null);
            setCommissionMode(null);
          }
          return;
        }
        const data = snap.data() as { position?: Position | null; commissionMode?: CommissionMode | null };
        if (cancelled) return;
        setPosition((data.position as Position | null | undefined) ?? null);
        setCommissionMode((data.commissionMode as CommissionMode | null | undefined) ?? null);
      } catch {
        if (cancelled) return;
        setPosition(null);
        setCommissionMode(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ownerEmail]);

  useEffect(() => {
    setDays((prev) =>
      prev.map((day) => ({
        ...day,
        contracts: day.contracts.map((c) => ({
          ...c,
          commission: calculateCommission(c.product, c.premium, positionForCalc, modeForCalc),
        })),
      }))
    );
  }, [positionForCalc, modeForCalc]);

  useEffect(() => {
    if (!ownerEmail) return;
    let cancelled = false;

    const load = async () => {
      try {
        const loaded: Record<number, DayEntry> = {};
        const loadedSaved: Record<number, boolean> = {};
        const promises = Array.from({ length: daysInMonth }, (_, idx) => idx).map(async (idx) => {
          const key = dayKey(year, month, idx);
          const ref = doc(db, "userStats", ownerEmail, "dailyStats", key);
          const snap = await getDoc(ref);
          if (!snap.exists()) return;
          const data = snap.data() as any;

          const contractsRaw = Array.isArray(data.contracts) ? data.contracts : [];
          const contracts: ContractEntry[] = contractsRaw.map((c: any) => {
            const product = normalizeProduct((c as any)?.product);
            const premiumStr =
              typeof (c as any)?.premium === "string"
                ? ((c as any)?.premium as string)
                : toInputValue((c as any)?.premium);
            return {
              id: makeId(),
              product,
              premium: premiumStr,
              commission: calculateCommission(product, premiumStr, positionForCalc, modeForCalc),
            };
          });

          const dayEntry: DayEntry = {
            outreach: toInputValue((data as any)?.outreach),
            agreed: toInputValue((data as any)?.agreed),
            meetings: toInputValue((data as any)?.meetings),
            workedHours: toInputValue((data as any)?.workedHours),
            contracts,
          };
          loaded[idx] = dayEntry;
          loadedSaved[idx] = hasContent(dayEntry);
        });

        await Promise.all(promises);
        if (cancelled) return;

        setDays((prev) =>
          prev.map((day, idx) => {
            const d = loaded[idx];
            if (!d) return day;
            return {
              ...day,
              outreach: d.outreach ?? "",
              agreed: d.agreed ?? "",
              meetings: d.meetings ?? "",
              workedHours: d.workedHours ?? "",
              contracts: d.contracts ?? [],
            };
          })
        );
        setSavedDays(loadedSaved);
      } catch (e) {
        console.error("Chyba při načítání denních statistik", e);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [ownerEmail, daysInMonth, year, month, positionForCalc, modeForCalc]);

  const monthLabel = useMemo(() => label.charAt(0).toUpperCase() + label.slice(1), [label]);

  const totals = useMemo(
    () =>
      days.reduce(
        (acc, day) => {
          acc.outreach += Number(day.outreach) || 0;
          acc.agreed += Number(day.agreed) || 0;
          acc.meetings += Number(day.meetings) || 0;
          acc.hours += parseNumberSafe(day.workedHours);
          acc.contracts += day.contracts.length;
          for (const c of day.contracts) {
            acc.premium += parseNumberSafe(c.premium);
            acc.commission += c.commission || 0;
          }
          return acc;
        },
        { outreach: 0, agreed: 0, meetings: 0, hours: 0, contracts: 0, premium: 0, commission: 0 }
      ),
    [days]
  );

  const hourlyWage = useMemo(() => {
    if (totals.hours <= 0) return 0;
    return totals.commission / totals.hours;
  }, [totals]);

  const handleDayFieldChange = (idx: number, field: keyof DayEntry, value: string) => {
    setDays((prev) => {
      const next = [...prev];
      next[idx] = { ...prev[idx], [field]: value };
      return next;
    });
  };

  const handleAddContract = (idx: number) => {
    setDays((prev) => {
      const next = [...prev];
      const newEntry: ContractEntry = {
        id: makeId(),
        product: DEFAULT_PRODUCT,
        premium: "",
        commission: 0,
      };
      next[idx] = { ...prev[idx], contracts: [...prev[idx].contracts, newEntry] };
      return next;
    });
  };

  const handleContractChange = (dayIdx: number, contractId: string, updates: Partial<ContractEntry>) => {
    setDays((prev) => {
      const next = [...prev];
      const day = prev[dayIdx];
      const updatedContracts = day.contracts.map((c) => {
        if (c.id !== contractId) return c;
        const updated: ContractEntry = { ...c, ...updates };
        const commission = calculateCommission(updated.product, updated.premium, positionForCalc, modeForCalc);
        return { ...updated, commission };
      });

      next[dayIdx] = { ...day, contracts: updatedContracts };
      return next;
    });
  };

  const handleRemoveContract = (dayIdx: number, contractId: string) => {
    setDays((prev) => {
      const next = [...prev];
      const day = prev[dayIdx];
      next[dayIdx] = {
        ...day,
        contracts: day.contracts.filter((c) => c.id !== contractId),
      };
      return next;
    });
  };

  const dayLabel = (dayIndex: number) => {
    const date = new Date(year, month, dayIndex + 1);
    const weekday = date.toLocaleDateString("cs-CZ", { weekday: "short" });
    const dayNumber = date.getDate();
    return `${dayNumber}. ${weekday}`;
  };

  const safeSelectedIdx = Math.min(Math.max(selectedDay, 0), days.length - 1);
  const selectedEntry = days[safeSelectedIdx] ?? days[0];
  const selectedLabel = dayLabel(safeSelectedIdx);
  const canEdit = Boolean(currentUserEmail && ownerEmail && currentUserEmail === ownerEmail);

  const loadHistory = useCallback(
    async (email: string) => {
      try {
        const col = collection(db, "userStats", email, "monthlySnapshots");
        const snap = await getDocs(query(col, orderBy("savedAt", "desc"), fbLimit(12)));
        const items =
          snap.docs.map((d) => {
            const data = d.data() as any;
            return {
              id: d.id,
              label: (data.label as string | undefined) ?? (data.monthLabel as string | undefined) ?? d.id,
              outreach: Number(data.outreach) || 0,
              meetings: Number(data.meetings) || 0,
              commission: Number(data.commission) || 0,
              hours: Number(data.hours) || 0,
              savedAt: Number(data.savedAt) || null,
            };
          }) ?? [];
        setHistoryItems(items);
      } catch (e) {
        console.error("Chyba při načítání historie statistik", e);
        setHistoryItems([]);
      }
    },
    []
  );

  useEffect(() => {
    if (!ownerEmail) {
      setHistoryItems([]);
      return;
    }
    loadHistory(ownerEmail);
  }, [ownerEmail, loadHistory]);

  const saveDay = async (idx: number) => {
    if (!ownerEmail || !canEdit) {
      return;
    }
    const day = days[idx];
    setSavingState((prev) => ({ ...prev, [idx]: true }));
    setSaveStatus((prev) => ({ ...prev, [idx]: null }));
    try {
      const key = dayKey(year, month, idx);
      const ref = doc(db, "userStats", ownerEmail, "dailyStats", key);
      const payload = {
        outreach: Number(day.outreach) || 0,
        agreed: Number(day.agreed) || 0,
        meetings: Number(day.meetings) || 0,
        workedHours: parseNumberSafe(day.workedHours),
        contracts: day.contracts.map((c) => ({
          product: c.product,
          premium: parseNumberSafe(c.premium),
        })),
        updatedAt: Date.now(),
      };
      await setDoc(ref, payload, { merge: true });
      setSaveStatus((prev) => ({ ...prev, [idx]: "ok" }));
      setSavedDays((prev) => ({ ...prev, [idx]: hasContent(day) }));
    } catch (e) {
      console.error("Chyba při ukládání dne", e);
      setSaveStatus((prev) => ({ ...prev, [idx]: "error" }));
    } finally {
      setSavingState((prev) => ({ ...prev, [idx]: false }));
    }
  };

  const saveMonth = async () => {
    if (!ownerEmail || !canEdit) return;
    setSavingState((prev) => ({ ...prev, month: true }));
    try {
      const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
      const snapshot = {
        monthKey,
        label: monthLabel,
        year,
        month,
        outreach: totals.outreach,
        agreed: totals.agreed,
        meetings: totals.meetings,
        hours: totals.hours,
        contracts: totals.contracts,
        premium: totals.premium,
        commission: totals.commission,
        positionSnapshot: positionForCalc,
        modeSnapshot: modeForCalc,
        savedAt: Date.now(),
      };

      const col = collection(db, "userStats", ownerEmail, "monthlySnapshots");
      await setDoc(doc(col, monthKey), snapshot, { merge: true });

      const allSnap = await getDocs(query(col, orderBy("savedAt", "desc")));
      if (allSnap.docs.length > 12) {
        for (let i = 12; i < allSnap.docs.length; i++) {
          await deleteDoc(allSnap.docs[i].ref);
        }
      }

      await loadHistory(ownerEmail);
      setHistoryOpen(true);
    } catch (e) {
      console.error("Chyba při ukládání měsíční statistiky", e);
    } finally {
      setSavingState((prev) => {
        const next = { ...prev };
        delete next.month;
        return next;
      });
    }
  };

  const isLastDayOfMonth = useMemo(() => {
    const now = new Date();
    if (now.getFullYear() !== year || now.getMonth() !== month) return false;
    const lastDay = new Date(year, month + 1, 0).getDate();
    return now.getDate() === lastDay;
  }, [year, month]);

  useEffect(() => {
    const autoSave = async () => {
      if (!ownerEmail || !canEdit || !isLastDayOfMonth || autoSavedRef.current) return;
      try {
        const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
        const ref = doc(db, "userStats", ownerEmail, "monthlySnapshots", monthKey);
        const snap = await getDoc(ref);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const alreadyToday =
          snap.exists() &&
          (() => {
            const ts = (snap.data() as any)?.savedAt;
            const d = ts ? new Date(Number(ts)) : null;
            if (!d || Number.isNaN(d.getTime())) return false;
            d.setHours(0, 0, 0, 0);
            return d.getTime() === today.getTime();
          })();
        if (alreadyToday) {
          autoSavedRef.current = true;
          return;
        }

        const summary = {
          monthKey,
          label: monthLabel,
          year,
          month,
          outreach: totals.outreach,
          agreed: totals.agreed,
          meetings: totals.meetings,
          hours: totals.hours,
          contracts: totals.contracts,
          premium: totals.premium,
          commission: totals.commission,
          positionSnapshot: positionForCalc,
          modeSnapshot: modeForCalc,
          savedAt: Date.now(),
        };

        await setDoc(ref, summary, { merge: true });
        autoSavedRef.current = true;
        await loadHistory(ownerEmail);
      } catch (e) {
        console.error("Auto-save měsíční statistiky selhalo", e);
      }
    };

    void autoSave();
  }, [ownerEmail, canEdit, isLastDayOfMonth, year, month, monthLabel, totals, positionForCalc, modeForCalc, loadHistory]);

  return (
    <AppLayout active="tools">
      <div className="w-full max-w-6xl space-y-6">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <SplitTitle text="Statistika" />
            <p className="text-sm text-slate-300">
              Přehled aktivit a uzavřených smluv pro {monthLabel}. Provize počítám podle tvé pozice z profilu:
              <span className="ml-1 font-semibold text-white">{positionLabel(position)}</span>, režim{" "}
              <span className="font-semibold text-white">{modeLabel(commissionMode)}</span>.
            </p>
          </div>
          <Link
            href="/pomucky"
            className="text-xs text-slate-200 border border-white/20 rounded-full px-3 py-1.5 hover:bg-white/10 transition"
          >
            ← Zpět na pomůcky
          </Link>
        </header>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={saveMonth}
            disabled={!canEdit || !!savingState["month"]}
            className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold transition ${
              !canEdit
                ? "border-white/10 bg-white/5 text-slate-500 cursor-not-allowed"
                : "border-emerald-300/60 bg-emerald-500/15 text-emerald-50 hover:border-emerald-200 hover:bg-emerald-500/25"
            } ${savingState["month"] ? "opacity-70 cursor-wait" : ""}`}
          >
            {savingState["month"] ? "Ukládám měsíc…" : "Uložit měsíc"}
          </button>
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-white hover:border-sky-300/60 hover:bg-sky-500/15 transition"
          >
            Historie (posledních 12)
          </button>
          {!canEdit && ownerEmail ? (
            <span className="text-xs text-slate-400">
              Přehled pro {ownerEmail}. Úpravy nejsou povolené.
            </span>
          ) : null}
        </div>

        <div className="grid gap-4 rounded-3xl border border-white/10 bg-slate-950/60 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.65)] sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          <div className="space-y-1 rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="text-[11px] uppercase tracking-wider text-slate-400">Měsíc</div>
            <div className="text-lg font-semibold text-white">{monthLabel}</div>
          </div>
          <div className="space-y-1 rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="text-[11px] uppercase tracking-wider text-slate-400">Osloveno</div>
            <div className="text-lg font-semibold text-white">{totals.outreach}</div>
          </div>
          <div className="space-y-1 rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="text-[11px] uppercase tracking-wider text-slate-400">Schůzky</div>
            <div className="text-lg font-semibold text-white">{totals.meetings}</div>
          </div>
          <div className="space-y-1 rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="text-[11px] uppercase tracking-wider text-slate-400">Odpracováno (h)</div>
            <div className="text-lg font-semibold text-white">
              {totals.hours.toLocaleString("cs-CZ", { maximumFractionDigits: 1 })}
            </div>
          </div>
          <div className="space-y-1 rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="text-[11px] uppercase tracking-wider text-slate-400">Provize (odhad)</div>
            <div className="text-lg font-semibold text-emerald-200 drop-shadow-[0_0_12px_rgba(16,185,129,0.25)]">
              {formatMoney(totals.commission)}
            </div>
          </div>
          <div className="space-y-1 rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="text-[11px] uppercase tracking-wider text-slate-400">Průměrná hodinová mzda</div>
            <div className="text-lg font-semibold text-emerald-200 drop-shadow-[0_0_12px_rgba(16,185,129,0.25)]">
              {hourlyWage > 0 ? formatMoney(hourlyWage) : "—"}
            </div>
          </div>
        </div>

        {historyOpen ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.5)] space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-wider text-slate-400">Historie uložených statistik</div>
              <div className="text-xs text-slate-400">Max. 12 záznamů</div>
            </div>
            {historyItems.length === 0 ? (
              <p className="text-sm text-slate-400">Zatím žádné uložené měsíční statistiky.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {historyItems.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-white/10 bg-slate-950/60 p-3 flex flex-col gap-1"
                  >
                    <div className="text-sm font-semibold text-white">{item.label}</div>
                    <div className="text-xs text-slate-400">
                      Celkem oslovení: <span className="font-semibold text-white">{item.outreach}</span>
                    </div>
                    <div className="text-xs text-slate-400">
                      Celkem schůzek: <span className="font-semibold text-white">{item.meetings}</span>
                    </div>
                    <div className="text-xs text-slate-400">
                      Celkem odpracováno:{" "}
                      <span className="font-semibold text-white">
                        {item.hours.toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} h
                      </span>
                    </div>
                    <div className="text-xs text-slate-400">
                      Průměrná hodinová mzda:{" "}
                      <span className="font-semibold text-emerald-200">
                        {item.hours > 0 ? formatMoney(item.commission / item.hours) : "—"}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400">
                      Celkem provize: <span className="font-semibold text-emerald-200">{formatMoney(item.commission)}</span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Uloženo: {item.savedAt ? new Date(item.savedAt).toLocaleString("cs-CZ") : "—"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        <section className="space-y-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3 shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs uppercase tracking-wider text-slate-400">
                Kalendář {label} • klikni na den pro detail
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="inline-flex h-3 w-3 rounded-full bg-emerald-400/80"></span>
                <span>uloženo</span>
                <span className="inline-flex h-3 w-3 rounded-full bg-sky-400/80 ml-3"></span>
                <span>vybraný den</span>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
              {days.map((_, idx) => {
                const isSelected = idx === safeSelectedIdx;
                const isSaved = savedDays[idx];
                const isToday = idx === todayIndex;
                const cls = [
                  "flex flex-col items-center justify-center rounded-xl border px-2 py-1.5 text-sm font-semibold transition",
                  isSelected
                    ? "border-sky-300/80 bg-sky-500/20 text-white shadow-[0_0_16px_rgba(59,130,246,0.25)]"
                    : isSaved
                      ? "border-emerald-300/60 bg-emerald-500/15 text-emerald-50"
                      : "border-white/10 bg-slate-950/40 text-slate-100 hover:border-white/30",
                  isToday ? "ring-1 ring-white/30" : "",
                ].join(" ");
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedDay(idx)}
                    className={cls}
                  >
                    <div className="text-base leading-none">{idx + 1}</div>
                    <div className="text-[10px] font-medium text-slate-400">{dayLabel(idx).split(" ")[1]}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.5)]">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-slate-400">
                  Den {safeSelectedIdx + 1} / {daysInMonth}
                </div>
                <h3 className="text-lg font-semibold text-white">{selectedLabel}</h3>
              </div>
              <div className="text-sm text-slate-300">
                Provize za den:{" "}
                <span className="font-semibold text-emerald-200">
                  {formatMoney(selectedEntry.contracts.reduce((sum, c) => sum + (c.commission || 0), 0))}
                </span>
                <span className="mx-2 text-slate-500">•</span>
                Hodinová mzda:{" "}
                <span className="font-semibold text-emerald-200">
                  {parseNumberSafe(selectedEntry.workedHours) > 0
                    ? formatMoney(
                        selectedEntry.contracts.reduce((sum, c) => sum + (c.commission || 0), 0) /
                          parseNumberSafe(selectedEntry.workedHours)
                      )
                    : "—"}
                </span>
              </div>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-4 lg:grid-cols-5">
              <label className="space-y-1">
                <span className="text-xs text-slate-300">Osloveno</span>
                <input
                  type="number"
                  min="0"
                  value={selectedEntry.outreach}
                  onChange={(e) => handleDayFieldChange(safeSelectedIdx, "outreach", e.target.value)}
                  disabled={!canEdit}
                  className="w-full rounded-2xl border border-white/15 bg-slate-950/70 px-3 py-2 text-sm text-white outline-none ring-emerald-500/40 focus:border-emerald-300/70 focus:ring-2"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-300">Domluveno</span>
                <input
                  type="number"
                  min="0"
                  value={selectedEntry.agreed}
                  onChange={(e) => handleDayFieldChange(safeSelectedIdx, "agreed", e.target.value)}
                  disabled={!canEdit}
                  className="w-full rounded-2xl border border-white/15 bg-slate-950/70 px-3 py-2 text-sm text-white outline-none ring-emerald-500/40 focus:border-emerald-300/70 focus:ring-2"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-300">Schůzky</span>
                <input
                  type="number"
                  min="0"
                  value={selectedEntry.meetings}
                  onChange={(e) => handleDayFieldChange(safeSelectedIdx, "meetings", e.target.value)}
                  disabled={!canEdit}
                  className="w-full rounded-2xl border border-white/15 bg-slate-950/70 px-3 py-2 text-sm text-white outline-none ring-emerald-500/40 focus:border-emerald-300/70 focus:ring-2"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-300">Odpracováno (hodiny)</span>
                <input
                  type="number"
                  min="0"
                  step="0.25"
                  value={selectedEntry.workedHours}
                  onChange={(e) => handleDayFieldChange(safeSelectedIdx, "workedHours", e.target.value)}
                  disabled={!canEdit}
                  className="w-full rounded-2xl border border-white/15 bg-slate-950/70 px-3 py-2 text-sm text-white outline-none ring-emerald-500/40 focus:border-emerald-300/70 focus:ring-2"
                />
              </label>
              <div className="flex items-end justify-end">
                <button
                  type="button"
                  onClick={() => handleAddContract(safeSelectedIdx)}
                  disabled={!canEdit}
                  className="inline-flex items-center gap-2 rounded-2xl border border-emerald-300/50 bg-emerald-500/15 px-3 py-2 text-sm font-semibold text-emerald-50 shadow-[0_0_18px_rgba(16,185,129,0.25)] transition hover:border-emerald-200 hover:bg-emerald-500/25"
                >
                  + Přidat smlouvu
                </button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-400">
                {!currentUserEmail
                  ? "Přihlas se, aby šlo data uložit do profilu."
                  : !canEdit
                    ? "Zobrazuješ statistiku jiného uživatele (jen pro čtení)."
                    : saveStatus[safeSelectedIdx] === "ok"
                      ? "Uloženo"
                      : saveStatus[safeSelectedIdx] === "error"
                        ? "Nepodařilo se uložit"
                        : savedDays[safeSelectedIdx]
                          ? "Uloženo dříve"
                          : "Ulož si data, aby zůstala i po obnovení."}
              </div>
              <button
                type="button"
                disabled={!canEdit || !!savingState[safeSelectedIdx]}
                onClick={() => saveDay(safeSelectedIdx)}
                className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold transition ${
                  !canEdit
                    ? "border-white/10 bg-white/5 text-slate-500 cursor-not-allowed"
                    : "border-sky-300/60 bg-sky-500/15 text-sky-50 hover:border-sky-200 hover:bg-sky-500/25"
                } ${savingState[safeSelectedIdx] ? "opacity-70 cursor-wait" : ""}`}
              >
                {savingState[safeSelectedIdx] ? "Ukládám…" : "Uložit den"}
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {selectedEntry.contracts.length === 0 ? (
                <p className="text-sm text-slate-400">Zatím žádné smlouvy pro tento den.</p>
              ) : (
                selectedEntry.contracts.map((contract) => (
                  <div
                    key={contract.id}
                    className="grid gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-3 md:grid-cols-[2fr_1fr_1fr_auto]"
                  >
                    <label className="space-y-1">
                      <span className="text-xs text-slate-300">Produkt</span>
                      <select
                        value={contract.product}
                        onChange={(e) =>
                          handleContractChange(safeSelectedIdx, contract.id, {
                            product: e.target.value as Product,
                          })
                        }
                        disabled={!canEdit}
                        className="w-full rounded-2xl border border-white/15 bg-slate-950/70 px-3 py-2 text-sm text-white outline-none ring-emerald-500/40 focus:border-emerald-300/70 focus:ring-2"
                      >
                        {PRODUCT_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1">
                      <span className="text-xs text-slate-300">{premiumLabel(contract.product)}</span>
                      <input
                        type="number"
                        min="0"
                        value={contract.premium}
                        onChange={(e) =>
                          handleContractChange(safeSelectedIdx, contract.id, {
                            premium: e.target.value,
                          })
                        }
                        disabled={!canEdit}
                        className="w-full rounded-2xl border border-white/15 bg-slate-950/70 px-3 py-2 text-sm text-white outline-none ring-emerald-500/40 focus:border-emerald-300/70 focus:ring-2"
                      />
                    </label>

                    <div className="space-y-1">
                      <span className="text-xs text-slate-300">Provize (odhad)</span>
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-emerald-200">
                        {formatMoney(contract.commission)}
                      </div>
                    </div>

                      <div className="flex items-end justify-end">
                        <button
                          type="button"
                          onClick={() => handleRemoveContract(safeSelectedIdx, contract.id)}
                          disabled={!canEdit}
                          className="rounded-2xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-slate-100 transition hover:border-rose-400/60 hover:text-rose-100"
                        >
                          Odebrat
                        </button>
                      </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>

      {historyOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/65 backdrop-blur-sm px-4 py-6"
          onClick={() => setHistoryOpen(false)}
        >
          <div
            className="w-full max-w-4xl rounded-3xl border border-white/15 bg-slate-950/90 p-5 shadow-[0_30px_120px_rgba(0,0,0,0.6)] space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-400">Historie uložených statistik</div>
                <div className="text-sm text-slate-300">Posledních 12 uložených měsíců</div>
              </div>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-sm text-white hover:border-sky-300/60 hover:bg-sky-500/20 transition"
              >
                Zavřít
              </button>
            </div>

            {historyItems.length === 0 ? (
              <p className="text-sm text-slate-400">Zatím žádné uložené měsíční statistiky.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {historyItems.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-white/10 bg-slate-900/70 p-3 flex flex-col gap-1"
                  >
                    <div className="text-sm font-semibold text-white">{item.label}</div>
                    <div className="text-xs text-slate-400">
                      Celkem oslovení: <span className="font-semibold text-white">{item.outreach}</span>
                    </div>
                    <div className="text-xs text-slate-400">
                      Celkem schůzek: <span className="font-semibold text-white">{item.meetings}</span>
                    </div>
                    <div className="text-xs text-slate-400">
                      Celkem odpracováno:{" "}
                      <span className="font-semibold text-white">
                        {item.hours.toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} h
                      </span>
                    </div>
                    <div className="text-xs text-slate-400">
                      Průměrná hodinová mzda:{" "}
                      <span className="font-semibold text-emerald-200">
                        {item.hours > 0 ? formatMoney(item.commission / item.hours) : "—"}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400">
                      Celkem provize: <span className="font-semibold text-emerald-200">{formatMoney(item.commission)}</span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Uloženo: {item.savedAt ? new Date(item.savedAt).toLocaleString("cs-CZ") : "—"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </AppLayout>
  );
}

export default function StatistikaPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-slate-300">Načítám…</div>}>
      <StatistikaPageInner />
    </Suspense>
  );
}
