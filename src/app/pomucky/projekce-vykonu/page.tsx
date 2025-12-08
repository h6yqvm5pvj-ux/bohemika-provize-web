"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import { AppLayout } from "@/components/AppLayout";
import { auth, db } from "@/app/firebase";
import {
  calculateNeon,
  calculateCppAuto,
  calculateAllianzAuto,
  calculateDomex,
} from "@/app/lib/productFormulas";
import { type Position, type CommissionMode } from "@/app/types/domain";

type YearRow = { year: number; total: number };
type MonthlyTotals = Record<number, number[]>;
type AutoInflation = 0 | 5 | 10;
type StornoPct = 0 | 5 | 10;
type SubordinateInput = {
  id: string;
  position: Position;
  lifeMonthly: string;
  autoAnnual: string;
  propAnnual: string;
};
type ManagerPosition = "manazer4" | "manazer5" | "manazer6";
type AdvisorPosition =
  | "poradce1"
  | "poradce2"
  | "poradce3"
  | "poradce4"
  | "poradce5"
  | "poradce6";

const MONTHS = 15 * 12;
const YEARS = 15;
const MONTH_LABELS = [
  "Leden",
  "Únor",
  "Březen",
  "Duben",
  "Květen",
  "Červen",
  "Červenec",
  "Srpen",
  "Září",
  "Říjen",
  "Listopad",
  "Prosinec",
];

function parseNumber(text: string): number {
  if (!text) return 0;
  const v = parseFloat(text.replace(",", "."));
  return Number.isNaN(v) ? 0 : v;
}

function StornoPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: StornoPct;
  onChange: (v: StornoPct) => void;
}) {
  return (
    <div className="flex items-center gap-2 text-[11px] text-slate-200">
      <span className="text-slate-400">{label}:</span>
      {[0, 5, 10].map((val) => (
        <button
          key={val}
          type="button"
          onClick={() => onChange(val as StornoPct)}
          className={`px-2.5 py-1 rounded-full border transition ${
            value === val
              ? "bg-emerald-500 text-white border-emerald-400 shadow-sm shadow-emerald-500/40"
              : "border-white/20 text-slate-200 hover:bg-white/5"
          }`}
        >
          {val}%
        </button>
      ))}
    </div>
  );
}

function formatMoney(v: number): string {
  if (!Number.isFinite(v)) return "0 Kč";
  return (
    v.toLocaleString("cs-CZ", {
      maximumFractionDigits: 0,
    }) + " Kč"
  );
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
  return pos ? map[pos] ?? pos : "neznámá";
}

function estimatePayoutDate(policyStart: Date, cutoffDay = 28): Date {
  const year = policyStart.getFullYear();
  const month = policyStart.getMonth();
  const day = policyStart.getDate();
  const monthsToAdd = day > cutoffDay ? 2 : 1;
  return new Date(year, month + monthsToAdd, 1);
}

function projectNeon(
  monthlyPremium: number,
  pos: Position,
  mode: CommissionMode,
  start: Date,
  storno: StornoPct
) {
  const dto = calculateNeon(monthlyPremium, pos, 15, mode);
  const items = dto.items.map((it) => ({
    title: (it.title ?? "").toLowerCase(),
    amount: it.amount ?? 0,
  }));
  const res: { date: Date; amount: number }[] = [];
  const immediate = items.find((i) => i.title.includes("okamžitá"));
  const po3 = items.find((i) => i.title.includes("po 3"));
  const po4 = items.find((i) => i.title.includes("po 4"));
  const nasl25 = items.find((i) => i.title.includes("2.–5"));
  const nasl510 = items.find((i) => i.title.includes("5.–10"));

  const annPlusYears = (y: number) => new Date(start.getFullYear() + y, start.getMonth(), start.getDate());

  const stornoFactor = (yearsFromStart: number) =>
    Math.pow(1 - storno / 100, Math.max(0, yearsFromStart));

  if (immediate) res.push({ date: estimatePayoutDate(start), amount: immediate.amount * stornoFactor(0) });
  if (po3) res.push({ date: annPlusYears(3), amount: po3.amount * stornoFactor(3) });
  if (po4) res.push({ date: annPlusYears(4), amount: po4.amount * stornoFactor(4) });
  if (nasl25) {
    for (let y = 2; y <= 5; y++) res.push({ date: annPlusYears(y), amount: nasl25.amount * stornoFactor(y) });
  }
  if (nasl510) {
    for (let y = 5; y <= 10; y++) res.push({ date: annPlusYears(y), amount: nasl510.amount * stornoFactor(y) });
  }
  return res;
}

function projectAuto(
  annualPremium: number,
  pos: Position,
  start: Date,
  inflationPct: AutoInflation,
  storno: StornoPct
) {
  const one = calculateCppAuto(annualPremium, "annual", pos).total;
  const two = calculateAllianzAuto(annualPremium, "annual", pos).total;
  const res: { date: Date; amount: number }[] = [];
  // první výplata až následující měsíc (prosincová produkce se vyplatí v lednu)
  const first = new Date(start);
  first.setMonth(first.getMonth() + 1);
  for (let y = 0; y < YEARS; y++) {
    const infl = Math.pow(1 + inflationPct / 100, y);
    const stor = Math.pow(1 - storno / 100, y);
    const avg = ((one + two) / 2) * infl * stor;
    res.push({ date: new Date(first.getFullYear() + y, first.getMonth(), first.getDate()), amount: avg });
  }
  return res;
}

function projectProperty(
  annualPremium: number,
  pos: Position,
  start: Date,
  storno: StornoPct
) {
  // používáme jen DOMEX, frekvence roční, výplata dle platby
  const dto = calculateDomex(annualPremium, "annual", pos);
  const items = dto.items.map((it) => ({
    title: (it.title ?? "").toLowerCase(),
    amount: it.amount ?? 0,
  }));
  const immediate = items.find((i) => i.title.includes("okamžitá"));
  const subsequent = items.find((i) => i.title.includes("následná"));

  const res: { date: Date; amount: number }[] = [];
  const first = new Date(start);
  first.setMonth(first.getMonth() + 1); // první výplata další měsíc

  // první rok – okamžitá provize
  if (immediate) {
    res.push({
      date: new Date(first),
      amount: immediate.amount * Math.pow(1 - storno / 100, 0),
    });
  }

  // další roky – následná provize k výročí
  if (subsequent) {
    for (let y = 1; y < YEARS; y++) {
      const date = new Date(first.getFullYear() + y, first.getMonth(), first.getDate());
      res.push({
        date,
        amount: subsequent.amount * Math.pow(1 - storno / 100, y),
      });
    }
  }

  return res;
}

type Payout = { date: Date; amount: number };

function addDiffPayouts(
  target: Map<number, number>,
  manager: Payout[],
  subordinate: Payout[]
) {
  const mMap = new Map<number, number>();
  const sMap = new Map<number, number>();

  for (const p of manager) {
    const key = new Date(p.date.getFullYear(), p.date.getMonth(), 1).getTime();
    mMap.set(key, (mMap.get(key) ?? 0) + p.amount);
  }
  for (const p of subordinate) {
    const key = new Date(p.date.getFullYear(), p.date.getMonth(), 1).getTime();
    sMap.set(key, (sMap.get(key) ?? 0) + p.amount);
  }

  const keys = new Set([...mMap.keys(), ...sMap.keys()]);
  keys.forEach((key) => {
    const diff = (mMap.get(key) ?? 0) - (sMap.get(key) ?? 0);
    if (diff > 0) {
      target.set(key, (target.get(key) ?? 0) + diff);
    }
  });
}

export default function ProjectionPage() {
  const [user, setUser] = useState<User | null>(null);
  const [position, setPosition] = useState<Position | null>(null);

  const [lifeMonthly, setLifeMonthly] = useState("0");
  const [autoAnnual, setAutoAnnual] = useState("0");
  const [propAnnual, setPropAnnual] = useState("0");
  const [autoInflation, setAutoInflation] = useState<AutoInflation>(0);
  const [lifeStorno, setLifeStorno] = useState<StornoPct>(0);
  const [autoStorno, setAutoStorno] = useState<StornoPct>(0);
  const [propStorno, setPropStorno] = useState<StornoPct>(0);
  const [viewMode, setViewMode] = useState<"none" | "individual" | "team">(
    "none"
  );
  const [managerPos, setManagerPos] = useState<ManagerPosition>("manazer4");
  const [subordinates, setSubordinates] = useState<SubordinateInput[]>([
    {
      id: "sub-1",
      position: "poradce5",
      lifeMonthly: "0",
      autoAnnual: "0",
      propAnnual: "0",
    },
  ]);
  const [selectedTeamYear, setSelectedTeamYear] = useState<number | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (current) => {
      setUser(current);
      if (!current?.email) {
        setPosition(null);
        return;
      }
      const snap = await getDoc(doc(db, "users", current.email.toLowerCase()));
      const pos = (snap.data() as { position?: Position } | undefined)?.position;
      setPosition(pos ?? null);
    });
    return () => unsub();
  }, []);

  const startDate = useMemo(() => {
    const d = new Date();
    d.setDate(1); // začínáme aktuálním měsícem, první výplata přijde příští měsíc
    return d;
  }, []);

  const { years, monthlyByYear } = useMemo(() => {
    const pos = position ?? "poradce1";
    const mode: CommissionMode = "accelerated";
    const life = Math.max(0, parseNumber(lifeMonthly));
    const auto = Math.max(0, parseNumber(autoAnnual));
    const prop = Math.max(0, parseNumber(propAnnual));

    const payouts: { date: Date; amount: number }[] = [];
    const monthlyMap = new Map<number, Map<number, number>>();

    // pro každý měsíc v horizontu zopakujeme produkci
    for (let m = 0; m < MONTHS; m++) {
      const base = new Date(startDate.getFullYear(), startDate.getMonth() + m, 1);
      if (life > 0) payouts.push(...projectNeon(life, pos, mode, base, lifeStorno));
      if (auto > 0) payouts.push(...projectAuto(auto, pos, base, autoInflation, autoStorno));
      if (prop > 0) payouts.push(...projectProperty(prop, pos, base, propStorno));
    }

    const yearMap = new Map<number, number>();
    for (const p of payouts) {
      const y = p.date.getFullYear();
      const m = p.date.getMonth();
      if (y < startDate.getFullYear() || y >= startDate.getFullYear() + YEARS) continue;
      yearMap.set(y, (yearMap.get(y) ?? 0) + p.amount);
      if (!monthlyMap.has(y)) monthlyMap.set(y, new Map());
      const mm = monthlyMap.get(y)!;
      mm.set(m, (mm.get(m) ?? 0) + p.amount);
    }

    const arr: YearRow[] = [];
    const monthlyTotals: MonthlyTotals = {};
    for (let i = 0; i < YEARS; i++) {
      const y = startDate.getFullYear() + i;
      arr.push({ year: y, total: yearMap.get(y) ?? 0 });
      const monthsArr = Array(12).fill(0);
      const mm = monthlyMap.get(y);
      if (mm) {
        mm.forEach((val, key) => {
          if (key >= 0 && key < 12) monthsArr[key] = val;
        });
      }
      monthlyTotals[y] = monthsArr;
    }

    return { years: arr, monthlyByYear: monthlyTotals };
  }, [position, lifeMonthly, autoAnnual, propAnnual, autoInflation, lifeStorno, autoStorno, propStorno, startDate]);

  const maxYearValue =
    years.length > 0 ? Math.max(...years.map((y) => y.total)) : 0;
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const teamData = useMemo(() => {
    if (viewMode !== "team") {
      return { years: [] as YearRow[], monthlyByYear: {} as MonthlyTotals };
    }

    const posManager: Position = managerPos;
    const mode: CommissionMode = "accelerated";
    const combined = new Map<number, number>();

    for (let m = 0; m < MONTHS; m++) {
      const base = new Date(
        startDate.getFullYear(),
        startDate.getMonth() + m,
        1
      );

      subordinates.forEach((sub) => {
        const life = Math.max(0, parseNumber(sub.lifeMonthly));
        const auto = Math.max(0, parseNumber(sub.autoAnnual));
        const prop = Math.max(0, parseNumber(sub.propAnnual));
        if (life === 0 && auto === 0 && prop === 0) return;
        const posSub: Position = sub.position;

        if (life > 0) {
          const man = projectNeon(life, posManager, mode, base, 0);
          const subp = projectNeon(life, posSub, mode, base, 0);
          addDiffPayouts(combined, man, subp);
        }
        if (auto > 0) {
          const man = projectAuto(auto, posManager, base, 0, 0);
          const subp = projectAuto(auto, posSub, base, 0, 0);
          addDiffPayouts(combined, man, subp);
        }
        if (prop > 0) {
          const man = projectProperty(prop, posManager, base, 0);
          const subp = projectProperty(prop, posSub, base, 0);
          addDiffPayouts(combined, man, subp);
        }
      });
    }

    const yearMap = new Map<number, number>();
    const monthlyMap = new Map<number, Map<number, number>>();

    combined.forEach((amount, key) => {
      const date = new Date(key);
      const y = date.getFullYear();
      const m = date.getMonth();
      if (y < startDate.getFullYear() || y >= startDate.getFullYear() + YEARS)
        return;
      yearMap.set(y, (yearMap.get(y) ?? 0) + amount);
      if (!monthlyMap.has(y)) monthlyMap.set(y, new Map());
      const mm = monthlyMap.get(y)!;
      mm.set(m, (mm.get(m) ?? 0) + amount);
    });

    const arr: YearRow[] = [];
    const monthlyTotals: MonthlyTotals = {};
    for (let i = 0; i < YEARS; i++) {
      const y = startDate.getFullYear() + i;
      arr.push({ year: y, total: yearMap.get(y) ?? 0 });
      const monthsArr = Array(12).fill(0);
      const mm = monthlyMap.get(y);
      if (mm) {
        mm.forEach((val, key) => {
          if (key >= 0 && key < 12) monthsArr[key] = val;
        });
      }
      monthlyTotals[y] = monthsArr;
    }

    return { years: arr, monthlyByYear: monthlyTotals };
  }, [viewMode, managerPos, subordinates, startDate]);
  const teamYears = teamData.years;
  const teamMonthlyByYear = teamData.monthlyByYear;
  const teamMaxYearValue =
    teamYears.length > 0 ? Math.max(...teamYears.map((y) => y.total)) : 0;
  useEffect(() => {
    if (years.length === 0) return;
    if (selectedYear == null || !years.find((y) => y.year === selectedYear)) {
      setTimeout(() => setSelectedYear(years[0].year), 0);
    }
  }, [years, selectedYear]);

  useEffect(() => {
    if (viewMode !== "team") return;
    if (teamYears.length === 0) return;
    if (
      selectedTeamYear == null ||
      !teamYears.find((y) => y.year === selectedTeamYear)
    ) {
      setTimeout(() => setSelectedTeamYear(teamYears[0].year), 0);
    }
  }, [teamYears, selectedTeamYear, viewMode]);

  if (!user) {
    return (
      <AppLayout active="tools">
        <div className="w-full max-w-4xl mx-auto">
          <p className="text-sm text-slate-200">
            Přihlas se, abys viděl projekci následných provizí.
          </p>
        </div>
      </AppLayout>
    );
  }

  const renderIntro = () => (
    <div className="w-full max-w-4xl mx-auto py-16 text-center space-y-6">
      <div className="space-y-3">
        <SplitTextAnimated
          text="Vizualizuj si výplatu do budoucna"
          className="text-4xl sm:text-5xl font-semibold text-white leading-tight"
        />
        <SplitTextAnimated
          text="Poznej sílu následných provizí!"
          className="text-3xl sm:text-4xl font-semibold text-white/90 leading-tight"
          delayOffset={600}
        />
        <p className="text-sm text-slate-300 max-w-2xl mx-auto">
          Vyber, zda modeluješ pouze vlastní produkci, nebo chceš řešit i budování
          týmu. V další kroku nastavíš vstupní data a uvidíš projekci na 15 let.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
        <button
          type="button"
          onClick={() => setViewMode("individual")}
          className="rounded-full bg-emerald-500/90 px-6 py-3 text-sm font-semibold text-white shadow-[0_15px_40px_rgba(16,185,129,0.35)] hover:bg-emerald-400/90 transition"
        >
          Vlastní
        </button>
        <button
          type="button"
          onClick={() => setViewMode("team")}
          className="rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10 transition"
        >
          Chci budovat tým
        </button>
      </div>
    </div>
  );

  const renderIndividual = () => (
    <div className="w-full max-w-5xl space-y-6">
      <header className="space-y-2">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            Poznej kouzlo následných provizí!
          </h1>
          <button
            type="button"
            onClick={() => setViewMode("none")}
            className="text-xs text-slate-300 hover:text-white"
          >
            Změnit volbu
          </button>
        </div>
        <p className="text-sm text-slate-300">
          Modelace vychází u Života z provize NEONU, u Auta průměr z provize
          ČPP a Allianz, u Majetku z DOMEXU. Modelace počítá s tím, že produkce
          je každý měsíc stejná. Lze započítat každoroční zdražování i míru
          stornovosti. Pozice: {positionLabel(position)}.
        </p>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <InputCard
          title="Životní pojištění"
          subtitle="Měsíční pojistné (NEON)"
          value={lifeMonthly}
          onChange={setLifeMonthly}
          extra={
            <StornoPicker
              label="Stornovost"
              value={lifeStorno}
              onChange={setLifeStorno}
            />
          }
        />
        <InputCard
          title="Auto pojištění"
          subtitle="Roční pojistné (průměr ČPP/Allianz Auto)"
          value={autoAnnual}
          onChange={setAutoAnnual}
          extra={
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[11px] text-slate-200">
                <span className="text-slate-400">Zdražení:</span>
                {[0, 5, 10].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setAutoInflation(val as AutoInflation)}
                    className={`px-2.5 py-1 rounded-full border transition ${
                      autoInflation === val
                        ? "bg-emerald-500 text-white border-emerald-400 shadow-sm shadow-emerald-500/40"
                        : "border-white/20 text-slate-200 hover:bg-white/5"
                    }`}
                  >
                    {val}%
                  </button>
                ))}
              </div>
              <StornoPicker
                label="Stornovost"
                value={autoStorno}
                onChange={setAutoStorno}
              />
            </div>
          }
        />
        <InputCard
          title="Pojištění majetku"
          subtitle="Roční pojistné (DOMEX, výplata dle platby)"
          value={propAnnual}
          onChange={setPropAnnual}
          extra={
            <StornoPicker
              label="Stornovost"
              value={propStorno}
              onChange={setPropStorno}
            />
          }
        />
      </section>

      <section className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl px-5 py-5 shadow-[0_18px_60px_rgba(0,0,0,0.85)] space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-300">
              Roční projekce
            </p>
            <p className="text-sm text-slate-200">
              Součet okamžitých i následných provizí za daný rok.
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-slate-400">Nejlepší rok</p>
            <p className="text-xl font-semibold text-white">
              {formatMoney(maxYearValue)}
            </p>
          </div>
        </div>

        <div className="mt-2 flex items-end gap-2 overflow-x-auto pb-2">
          {years.map((y, idx) => {
            const h =
              maxYearValue > 0
                ? Math.max(8, Math.round((y.total / maxYearValue) * 160))
                : 8;
            const isActive = y.year === selectedYear;
            return (
              <div
                key={y.year}
                className="flex flex-col items-center gap-1 min-w-[48px] cursor-pointer"
                onClick={() => setSelectedYear(y.year)}
              >
                <div className="text-[10px] text-slate-200 font-semibold">
                  {formatMoney(y.total)}
                </div>
                <div
                  className={`w-[38px] rounded-2xl bg-gradient-to-t from-sky-600 to-sky-400 shadow-[0_10px_22px_rgba(56,189,248,0.35)] transition-all ${
                    isActive ? "ring-2 ring-sky-300/70" : ""
                  }`}
                  style={{ height: `${h}px`, transform: isActive ? "translateY(-4px)" : "translateY(0)" }}
                  title={`Rok ${idx + 1}`}
                />
                <div className="text-[10px] text-slate-400">
                  {idx + 1}. rok
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {selectedYear != null && monthlyByYear[selectedYear] && (
        <section className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl px-5 py-5 shadow-[0_18px_60px_rgba(0,0,0,0.85)] space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-300">
                Měsíční výplaty
              </p>
              <p className="text-sm text-slate-200">
                Rok {selectedYear} • klikni na jiný rok v grafu pro změnu.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {monthlyByYear[selectedYear].map((val, idx) => (
              <div
                key={idx}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 flex items-center justify-between text-sm text-slate-100"
              >
                <span className="text-slate-300">{MONTH_LABELS[idx]}</span>
                <span className="font-semibold">
                  {val > 0 ? formatMoney(val) : "—"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="text-xs text-slate-400">
        Odhad provize je orientační: Život dle NEON (měsíční), Auta průměr ČPP/Allianz
        Auto, Majetek DOMEX (výplata dle platby). Výkon se opakuje každý měsíc po celou dobu.
      </div>
    </div>
  );

  const renderTeam = () => {
    const addSub = () => {
      if (subordinates.length >= 20) return;
      setSubordinates((prev) => [
        ...prev,
        {
          id: `sub-${Date.now()}-${prev.length}`,
          position: "poradce5",
          lifeMonthly: "0",
          autoAnnual: "0",
          propAnnual: "0",
        },
      ]);
    };

    const updateSub = (
      id: string,
      field: keyof Omit<SubordinateInput, "id">,
      value: string
    ) => {
      setSubordinates((prev) =>
        prev.map((s) => (s.id === id ? { ...s, [field]: value } : s))
      );
    };

    const removeSub = (id: string) => {
      setSubordinates((prev) => prev.filter((s) => s.id !== id));
    };

    const hasTeamData = teamYears.some((y) => y.total > 0);

    return (
      <div className="w-full max-w-5xl space-y-6">
        <header className="space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-semibold tracking-tight text-white">
              Chci budovat tým
            </h1>
            <button
              type="button"
              onClick={() => setViewMode("none")}
              className="text-xs text-slate-300 hover:text-white"
            >
              Změnit volbu
            </button>
          </div>
          <p className="text-sm text-slate-300">
            Začni zvolením manažerské pozice, následně přidej podřízené, ať už jednoho či více
             a urči libovolný pravidelný výkon aby jsi viděl co ti budování týmu přinese.
          </p>
        </header>

        <section className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl px-5 py-5 shadow-[0_18px_60px_rgba(0,0,0,0.85)] space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">
            Zvol manažerskou pozici
          </h2>
          <select
            className="w-full max-w-xs rounded-2xl border border-white/20 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-50 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            value={managerPos}
            onChange={(e) =>
              setManagerPos(e.target.value as ManagerPosition)
            }
          >
            <option value="manazer4">Manažer 4</option>
            <option value="manazer5">Manažer 5</option>
            <option value="manazer6">Manažer 6</option>
          </select>
        </section>

        <section className="space-y-4">
          {subordinates.map((sub, idx) => (
            <div
              key={sub.id}
              className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl px-5 py-5 shadow-[0_18px_60px_rgba(0,0,0,0.85)] space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-200">
                  {idx + 1}. Podřízený
                </h3>
                {subordinates.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeSub(sub.id)}
                    className="text-xs text-slate-300 hover:text-white"
                  >
                    Odebrat
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">
                    Zvol pozici
                  </label>
                  <select
                    className="w-full rounded-2xl border border-white/20 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-50 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    value={sub.position}
                    onChange={(e) =>
                      updateSub(
                        sub.id,
                        "position",
                        e.target.value as AdvisorPosition
                      )
                    }
                  >
                    <option value="poradce1">Poradce 1</option>
                    <option value="poradce2">Poradce 2</option>
                    <option value="poradce3">Poradce 3</option>
                    <option value="poradce4">Poradce 4</option>
                    <option value="poradce5">Poradce 5</option>
                    <option value="poradce6">Poradce 6</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-slate-400">
                    Život (měsíční pojistné)
                  </label>
                  <input
                    type="number"
                    min={0}
                    className="w-full rounded-2xl bg-slate-900 border border-white/15 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    value={sub.lifeMonthly}
                    onChange={(e) =>
                      updateSub(sub.id, "lifeMonthly", e.target.value)
                    }
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-slate-400">
                    Auto (roční pojistné)
                  </label>
                  <input
                    type="number"
                    min={0}
                    className="w-full rounded-2xl bg-slate-900 border border-white/15 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    value={sub.autoAnnual}
                    onChange={(e) =>
                      updateSub(sub.id, "autoAnnual", e.target.value)
                    }
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-slate-400">
                    Majetek (roční pojistné)
                  </label>
                  <input
                    type="number"
                    min={0}
                    className="w-full rounded-2xl bg-slate-900 border border-white/15 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    value={sub.propAnnual}
                    onChange={(e) =>
                      updateSub(sub.id, "propAnnual", e.target.value)
                    }
                  />
                </div>
              </div>
            </div>
          ))}

          <div className="flex justify-start">
            <button
              type="button"
              onClick={addSub}
              disabled={subordinates.length >= 20}
              className="rounded-2xl border border-emerald-400/60 bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/30 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              + Přidat dalšího
            </button>
          </div>
        </section>

        <section className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl px-5 py-5 shadow-[0_18px_60px_rgba(0,0,0,0.85)] space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-300">
                Roční projekce meziprovize
              </p>
              <p className="text-sm text-slate-200">
                Součet manažerských provizí za daný
                rok.
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-slate-400">Nejlepší rok</p>
              <p className="text-xl font-semibold text-white">
                {formatMoney(teamMaxYearValue)}
              </p>
            </div>
          </div>

          {!hasTeamData ? (
            <p className="text-sm text-slate-300">
              Zadej produkci podřízených, abychom mohli spočítat meziprovizi.
            </p>
          ) : (
            <div className="mt-2 flex items-end gap-2 overflow-x-auto pb-2">
              {teamYears.map((y, idx) => {
                const h =
                  teamMaxYearValue > 0
                    ? Math.max(8, Math.round((y.total / teamMaxYearValue) * 160))
                    : 8;
                const isActive = y.year === selectedTeamYear;
                return (
                  <div
                    key={y.year}
                    className="flex flex-col items-center gap-1 min-w-[48px] cursor-pointer"
                    onClick={() => setSelectedTeamYear(y.year)}
                  >
                    <div className="text-[10px] text-slate-200 font-semibold">
                      {formatMoney(y.total)}
                    </div>
                    <div
                      className={`w-[38px] rounded-2xl bg-gradient-to-t from-emerald-600 to-emerald-400 shadow-[0_10px_22px_rgba(16,185,129,0.35)] transition-all ${
                        isActive ? "ring-2 ring-emerald-300/70" : ""
                      }`}
                      style={{
                        height: `${h}px`,
                        transform: isActive ? "translateY(-4px)" : "translateY(0)",
                      }}
                      title={`Rok ${idx + 1}`}
                    />
                    <div className="text-[10px] text-slate-400">
                      {idx + 1}. rok
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {selectedTeamYear != null &&
          teamMonthlyByYear[selectedTeamYear] &&
          hasTeamData && (
            <section className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl px-5 py-5 shadow-[0_18px_60px_rgba(0,0,0,0.85)] space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-slate-300">
                    Měsíční výplaty manažerské provize
                  </p>
                  <p className="text-sm text-slate-200">
                    Rok {selectedTeamYear} • klikni na jiný rok v grafu pro změnu.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {teamMonthlyByYear[selectedTeamYear].map((val, idx) => (
                  <div
                    key={idx}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 flex items-center justify-between text-sm text-slate-100"
                  >
                    <span className="text-slate-300">{MONTH_LABELS[idx]}</span>
                    <span className="font-semibold">
                      {val > 0 ? formatMoney(val) : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

        <div className="text-xs text-slate-400">
          ŽIVOT vychází z provize produktu ČPP NEON a dobou trvání smlouvy alespoň 15 let. 
          AUTO vychází z provize vyprůměrované všech AUTO Produktů, MAJETEK vychází z provize 
          z produktu DOMEX. Výpočty jsou orientační a není započten 
          odvod části provize do stornofondu!
        </div>
      </div>
    );
  };

  return (
    <AppLayout active="tools">
      {viewMode === "none" && renderIntro()}
      {viewMode === "individual" && renderIndividual()}
      {viewMode === "team" && renderTeam()}
    </AppLayout>
  );
}

function InputCard({
  title,
  subtitle,
  value,
  onChange,
  extra,
}: {
  title: string;
  subtitle: string;
  value: string;
  onChange: (v: string) => void;
  extra?: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl px-5 py-5 shadow-[0_18px_60px_rgba(0,0,0,0.85)] space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <p className="text-xs text-slate-300">{subtitle}</p>
      </div>
      <input
        type="number"
        min={0}
        className="w-full rounded-xl bg-slate-900 border border-white/15 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {extra}
    </section>
  );
}

function SplitTextAnimated({
  text,
  className,
  delayOffset = 0,
}: {
  text: string;
  className?: string;
  delayOffset?: number;
}) {
  const chars = Array.from(text);
  return (
    <div className={className}>
      <style jsx>{`
        @keyframes floatUp {
          0% {
            opacity: 0;
            transform: translateY(14px) scale(0.98);
            filter: blur(4px);
          }
          60% {
            opacity: 1;
            transform: translateY(-4px) scale(1.01);
            filter: blur(0);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0);
          }
        }
      `}</style>
      {chars.map((ch, idx) => (
        <span
          key={`${ch}-${idx}`}
          className="inline-block"
          style={{
            animation: "floatUp 600ms ease-out forwards",
            animationDelay: `${delayOffset + idx * 18}ms`,
            opacity: 0,
          }}
        >
          {ch === " " ? "\u00a0" : ch}
        </span>
      ))}
    </div>
  );
}
