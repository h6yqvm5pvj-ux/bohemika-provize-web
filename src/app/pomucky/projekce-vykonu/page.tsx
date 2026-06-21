"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { CarFront, Heart, House, Minus, Plus, TrendingDown, TrendingUp, UserRound, Users } from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { auth } from "@/app/firebase";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import {
  formatMoney as formatMoneyValue,
} from "@/app/lib/formatters";
import {
  calculateNeon,
  calculateCppAuto,
  calculateDomex,
} from "@/app/lib/productFormulas";
import { type Position, type CommissionMode } from "@/app/types/domain";
import SplitTitle from "../plan-produkce/SplitTitle";

type YearRow = { year: number; total: number };
type MonthlyTotals = Record<number, number[]>;
type AutoInflation = 0 | 5 | 10;
type StornoPct = 0 | 3 | 5 | 10;
type SubordinateInput = {
  id: string;
  position: Position;
  lifeMonthly: string;
  autoAnnual: string;
  propAnnual: string;
};
type ManagerPosition =
  | "manazer4"
  | "manazer5"
  | "manazer6"
  | "manazer7"
  | "manazer8"
  | "manazer9";
type AdvisorPosition =
  | "poradce1"
  | "poradce2"
  | "poradce3"
  | "poradce4"
  | "poradce5"
  | "poradce6";

type UserProfileApiResponse = {
  ok?: boolean;
  profile?: {
    fullName?: string | null;
    position?: Position | null;
  };
};

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

const PANEL_CLASS =
  "rounded-[28px] border border-slate-300 bg-white px-5 py-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)]";
const PANEL_SOFT_CLASS =
  "rounded-[28px] border border-slate-200 bg-[linear-gradient(140deg,rgba(248,250,252,0.95)_0%,rgba(255,255,255,1)_52%,rgba(238,242,255,0.8)_100%)] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.06)]";
const FIELD_CLASS =
  "w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10";
const STRUCTURE_FIELD_CLASS =
  "h-8 w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-[12px] text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10";
const BADGE_BUTTON_BASE =
  "rounded-full border px-2.5 py-1 text-[12px] font-semibold transition";

function parseNumber(text: string): number {
  if (!text) return 0;
  const v = parseFloat(text.replace(",", "."));
  return Number.isNaN(v) ? 0 : v;
}

function displayNameFromUser(user: User | null): string {
  const fromProfile = user?.displayName?.trim();
  if (fromProfile) return fromProfile;

  const localPart = user?.email?.split("@")[0] ?? "";
  if (!localPart) return "Uživatel";

  const words = localPart.split(/[._-]+/).filter(Boolean);
  if (!words.length) return localPart;

  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
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
    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-800">
      <span className="min-w-[76px] text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </span>
      {[0, 3, 5, 10].map((val) => (
        <button
          key={val}
          type="button"
          onClick={() => onChange(val as StornoPct)}
          className={`${BADGE_BUTTON_BASE} ${
            value === val
              ? "border-emerald-500 bg-emerald-500 text-white shadow-[0_8px_18px_rgba(16,185,129,0.3)]"
              : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
          }`}
        >
          {val}%
        </button>
      ))}
    </div>
  );
}

function formatMoney(v: number): string {
  return formatMoneyValue(v);
}

function estimatePayoutDate(policyStart: Date, cutoffDay = 25): Date {
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
    for (let y = 1; y <= 4; y++) res.push({ date: annPlusYears(y), amount: nasl25.amount * stornoFactor(y) });
  }
  if (nasl510) {
    for (let y = 4; y <= 9; y++) res.push({ date: annPlusYears(y), amount: nasl510.amount * stornoFactor(y) });
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
  const autoCommission = calculateCppAuto(annualPremium, "annual", pos).total;
  const res: { date: Date; amount: number }[] = [];
  // první výplata až následující měsíc (prosincová produkce se vyplatí v lednu)
  const first = new Date(start);
  first.setMonth(first.getMonth() + 1);
  for (let y = 0; y < YEARS; y++) {
    const infl = Math.pow(1 + inflationPct / 100, y);
    const stor = Math.pow(1 - storno / 100, y);
    const payout = autoCommission * infl * stor;
    res.push({ date: new Date(first.getFullYear() + y, first.getMonth(), first.getDate()), amount: payout });
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

function addPayouts(target: Map<number, number>, payouts: Payout[]) {
  for (const p of payouts) {
    const key = new Date(p.date.getFullYear(), p.date.getMonth(), 1).getTime();
    target.set(key, (target.get(key) ?? 0) + p.amount);
  }
}

export default function ProjectionPage() {
  const [user, setUser] = useState<User | null>(null);
  const [profileFullName, setProfileFullName] = useState<string | null>(null);
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
  const [managerLifeMonthly, setManagerLifeMonthly] = useState("0");
  const [managerAutoAnnual, setManagerAutoAnnual] = useState("0");
  const [managerPropAnnual, setManagerPropAnnual] = useState("0");
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
        setProfileFullName(null);
        setPosition(null);
        return;
      }
      try {
        const payload = await fetchAuthedJsonOrThrow<UserProfileApiResponse>(
          current,
          "/api/user/profile",
          { method: "GET" }
        );
        const fullName =
          typeof payload?.profile?.fullName === "string"
            ? payload.profile.fullName.trim()
            : "";
        setProfileFullName(fullName || null);
        const profilePosition = payload?.profile?.position;
        if (typeof profilePosition === "string") {
          setPosition(profilePosition as Position);
        } else {
          setPosition(null);
        }
      } catch (err) {
        console.error("Načtení profilu pro projekci výkonu selhalo:", err);
        setProfileFullName(null);
        setPosition(null);
      }
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
    const managerLife = Math.max(0, parseNumber(managerLifeMonthly));
    const managerAuto = Math.max(0, parseNumber(managerAutoAnnual));
    const managerProp = Math.max(0, parseNumber(managerPropAnnual));
    const combined = new Map<number, number>();

    for (let m = 0; m < MONTHS; m++) {
      const base = new Date(
        startDate.getFullYear(),
        startDate.getMonth() + m,
        1
      );

      if (managerLife > 0) {
        addPayouts(combined, projectNeon(managerLife, posManager, mode, base, 0));
      }
      if (managerAuto > 0) {
        addPayouts(combined, projectAuto(managerAuto, posManager, base, 0, 0));
      }
      if (managerProp > 0) {
        addPayouts(combined, projectProperty(managerProp, posManager, base, 0));
      }

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
  }, [viewMode, managerPos, managerLifeMonthly, managerAutoAnnual, managerPropAnnual, subordinates, startDate]);
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
          <section className={`${PANEL_SOFT_CLASS} text-center`}>
            <p className="text-sm text-slate-700">
              Přihlas se, abys viděl projekci následných provizí.
            </p>
          </section>
        </div>
      </AppLayout>
    );
  }

  const renderIntro = () => (
    <div className="w-full max-w-5xl mx-auto min-h-[56vh] py-8 text-center space-y-6 flex flex-col items-center justify-center">
      <div className="space-y-3">
        <div className="flex justify-center">
          <SplitTitle text="Vizualizuj si výplatu do budoucna" wrap={false} />
        </div>
        <div className="text-2xl sm:text-3xl font-semibold text-slate-900 leading-tight">
          Pravidelná péče o klienta zajistí pravidelný příjem!
        </div>
      </div>
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
        <button
          type="button"
          onClick={() => setViewMode("individual")}
          className="inline-flex min-w-[170px] items-center justify-center rounded-full border border-slate-900 bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(15,23,42,0.26)] transition hover:bg-black"
        >
          Vlastní produkce
        </button>
        <button
          type="button"
          onClick={() => setViewMode("team")}
          className="inline-flex min-w-[170px] items-center justify-center rounded-full border border-emerald-700 bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(5,150,105,0.34)] transition hover:bg-emerald-500"
        >
          Budování týmu
        </button>
      </div>
    </div>
  );

  const renderIndividual = () => (
    <div className="w-full max-w-5xl space-y-6">
      <header className="space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 leading-tight">
            Poznej sílu následných provizí!
          </h1>
          <button
            type="button"
            onClick={() => setViewMode("none")}
            className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Změnit volbu
          </button>
        </div>
        <div className="text-lg sm:text-xl font-semibold text-slate-900">
          Pravidelná péče o klienta zajistí pravidelný příjem!
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <InputCard
          title="Životní pojištění"
          subtitle="Měsíční pojistné"
          value={lifeMonthly}
          onChange={setLifeMonthly}
          tone="life"
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
          subtitle="Roční pojistné"
          value={autoAnnual}
          onChange={setAutoAnnual}
          tone="auto"
          extra={
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-800">
                <span className="min-w-[76px] text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Zdražení
                </span>
                {[0, 5, 10].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setAutoInflation(val as AutoInflation)}
                    className={`${BADGE_BUTTON_BASE} ${
                      autoInflation === val
                        ? "border-emerald-500 bg-emerald-500 text-white shadow-[0_8px_18px_rgba(16,185,129,0.3)]"
                        : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
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
          subtitle="Roční pojistné"
          value={propAnnual}
          onChange={setPropAnnual}
          tone="property"
          extra={
            <StornoPicker
              label="Stornovost"
              value={propStorno}
              onChange={setPropStorno}
            />
          }
        />
      </section>

      <section className={`${PANEL_CLASS} space-y-3`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-600">
              Roční projekce
            </p>
            <p className="text-sm text-slate-800">
              Součet okamžitých i následných provizí za daný rok.
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-slate-500">Nejlepší rok</p>
            <p className="text-xl font-semibold text-slate-900">
              {formatMoney(maxYearValue)}
            </p>
          </div>
        </div>

        <ProjectionYearBarChart
          years={years}
          maxYearValue={maxYearValue}
          selectedYear={selectedYear}
          onSelect={setSelectedYear}
          tone="emerald"
        />
      </section>

      {selectedYear != null && monthlyByYear[selectedYear] && (
        <section className={`${PANEL_CLASS} space-y-3`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-600">
                Měsíční výplaty
              </p>
              <p className="text-sm text-slate-800">
                Rok {selectedYear} • klikni na jiný rok v grafu pro změnu.
              </p>
            </div>
          </div>

          <MonthPayoutGrid months={monthlyByYear[selectedYear]} />
        </section>
      )}

      <div className="text-xs text-slate-500">
        Odhad provize je orientační: Život dle NEON (měsíční), Auto dle ČPP Auto,
        Majetek DOMEX (výplata dle platby). Výkon se opakuje každý měsíc po celou dobu.
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
    const managerName = profileFullName || displayNameFromUser(user);

    return (
      <div className="w-full max-w-none space-y-6">
        <header className="space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
              Chci budovat tým
            </h1>
            <button
              type="button"
              onClick={() => setViewMode("none")}
              className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              Změnit volbu
            </button>
          </div>
        </header>

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                Týmová struktura
              </p>
            </div>
            <button
              type="button"
              onClick={addSub}
              disabled={subordinates.length >= 20}
              className="inline-flex items-center gap-2 rounded-full border border-emerald-700 bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(5,150,105,0.28)] transition hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Plus className="h-4 w-4" />
              Přidat poradce
            </button>
          </div>

          {(() => {
            const managerCardWidth = 198;
            const managerCardHeight = 186;
            const subordinateCardWidth = 182;
            const subordinateCardHeight = 190;
            const stagePadding = 24;
            const stageGap = 10;
            const sideHorizontalGap = 12;
            const stageBottomSpace = 240;
            const count = subordinates.length;
            const bottomCount = Math.max(0, count - 2);
            const sideWidthNeeded =
              managerCardWidth +
              subordinateCardWidth * 2 +
              sideHorizontalGap * 2 +
              stagePadding * 2;
            const bottomWidthNeeded =
              bottomCount > 0
                ? bottomCount * subordinateCardWidth +
                  (bottomCount - 1) * stageGap +
                  stagePadding * 2
                : 0;
            const stageWidth = Math.max(
              680,
              sideWidthNeeded,
              bottomWidthNeeded
            );
            const managerLeft = stageWidth / 2 - managerCardWidth / 2;
            const managerTop = 12;
            const lineStartX = stageWidth / 2;
            const lineStartY = managerTop + managerCardHeight - 4;
            const sideTop = managerTop + 26;
            const subBaseTop = managerTop + managerCardHeight + 34;

            const layout: Array<{
              sub: SubordinateInput;
              idx: number;
              left: number;
              top: number;
              targetX: number;
              targetY: number;
            }> = [];

            if (count >= 1) {
              const left = managerLeft - sideHorizontalGap - subordinateCardWidth;
              const top = sideTop;
              layout.push({
                sub: subordinates[0],
                idx: 0,
                left,
                top,
                targetX: left + subordinateCardWidth + 2,
                targetY: top + subordinateCardHeight * 0.5,
              });
            }

            if (count >= 2) {
              const left = managerLeft + managerCardWidth + sideHorizontalGap;
              const top = sideTop;
              layout.push({
                sub: subordinates[1],
                idx: 1,
                left,
                top,
                targetX: left - 2,
                targetY: top + subordinateCardHeight * 0.5,
              });
            }

            const bottomSubs = subordinates.slice(2);
            if (bottomSubs.length > 0) {
              const rowWidth =
                bottomSubs.length * subordinateCardWidth +
                (bottomSubs.length - 1) * stageGap;
              const rowLeft = stageWidth / 2 - rowWidth / 2;
              const rowCenterIndex = (bottomSubs.length - 1) / 2;
              bottomSubs.forEach((sub, offset) => {
                const distanceFromCenter = Math.abs(offset - rowCenterIndex);
                const left = rowLeft + offset * (subordinateCardWidth + stageGap);
                const top = subBaseTop + distanceFromCenter * 10;
                layout.push({
                  sub,
                  idx: offset + 2,
                  left,
                  top,
                  targetX: left + subordinateCardWidth / 2,
                  targetY: top - 8,
                });
              });
            }

            const maxTop = layout.length
              ? Math.max(...layout.map((item) => item.top))
              : managerTop;
            const stageHeight = maxTop + subordinateCardHeight + stageBottomSpace;

            return (
              <div className="overflow-x-auto pb-2">
                <div
                  className="relative mx-auto"
                  style={{ width: `${stageWidth}px`, minHeight: `${stageHeight}px` }}
                >
                  <svg
                    className="pointer-events-none absolute inset-0"
                    width={stageWidth}
                    height={stageHeight}
                    viewBox={`0 0 ${stageWidth} ${stageHeight}`}
                    aria-hidden
                  >
                    {layout.map((item) => {
                      const controlY = lineStartY + (item.targetY - lineStartY) * 0.44;
                      const controlX1 = lineStartX + (item.targetX - lineStartX) * 0.12;
                      const controlX2 = lineStartX + (item.targetX - lineStartX) * 0.88;
                      return (
                        <g key={`${item.sub.id}-line`}>
                          <path
                            d={`M ${lineStartX} ${lineStartY} C ${controlX1} ${controlY}, ${controlX2} ${controlY}, ${item.targetX} ${item.targetY}`}
                            fill="none"
                            stroke="rgba(148, 163, 184, 0.85)"
                            strokeWidth="2"
                          />
                          <circle
                            cx={item.targetX}
                            cy={item.targetY}
                            r="4"
                            fill="rgba(14, 116, 144, 0.85)"
                          />
                        </g>
                      );
                    })}
                    <circle cx={lineStartX} cy={lineStartY} r="5" fill="rgba(16, 185, 129, 0.9)" />
                  </svg>

                  <article
                    className="absolute overflow-hidden rounded-[16px] border border-emerald-300 bg-[linear-gradient(160deg,rgba(236,253,245,0.95)_0%,rgba(255,255,255,1)_58%,rgba(220,252,231,0.65)_100%)] px-2 py-2 shadow-[0_8px_18px_rgba(15,23,42,0.10)]"
                    style={{
                      width: `${managerCardWidth}px`,
                      minHeight: `${managerCardHeight}px`,
                      left: `${managerLeft}px`,
                      top: `${managerTop}px`,
                    }}
                  >
                    <span className="absolute inset-x-0 top-0 h-1 bg-emerald-500/80" aria-hidden />
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700">
                        <UserRound className="h-3.5 w-3.5" />
                      </span>
                      <div>
                        <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Uživatel
                        </div>
                        <div className="text-sm font-semibold leading-tight text-slate-900">{managerName}</div>
                      </div>
                    </div>

                    <div className="mt-1.5 space-y-1.5">
                      <div className="space-y-1">
                        <label className="text-[11px] text-slate-500">Pozice</label>
                        <select
                          className={STRUCTURE_FIELD_CLASS}
                          value={managerPos}
                          onChange={(e) =>
                            setManagerPos(e.target.value as ManagerPosition)
                          }
                        >
                          <option value="manazer4">Manažer 4</option>
                          <option value="manazer5">Manažer 5</option>
                          <option value="manazer6">Manažer 6</option>
                          <option value="manazer7">Manažer 7</option>
                          <option value="manazer8">Manažer 8</option>
                          <option value="manazer9">Manažer 9</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-3 gap-1.5">
                        <div>
                          <label className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                            <Heart className="h-3 w-3 text-rose-500" />
                            Život
                          </label>
                          <input
                            type="number"
                            min={0}
                            className={`${STRUCTURE_FIELD_CLASS} mt-1`}
                            value={managerLifeMonthly}
                            onChange={(e) => setManagerLifeMonthly(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                            <CarFront className="h-3 w-3 text-blue-500" />
                            Auto
                          </label>
                          <input
                            type="number"
                            min={0}
                            className={`${STRUCTURE_FIELD_CLASS} mt-1`}
                            value={managerAutoAnnual}
                            onChange={(e) => setManagerAutoAnnual(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                            <House className="h-3 w-3 text-cyan-600" />
                            Maj.
                          </label>
                          <input
                            type="number"
                            min={0}
                            className={`${STRUCTURE_FIELD_CLASS} mt-1`}
                            value={managerPropAnnual}
                            onChange={(e) => setManagerPropAnnual(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  </article>

                  {layout.map((item) => (
                    <article
                      key={item.sub.id}
                      className="absolute overflow-hidden rounded-[16px] border border-sky-300 bg-[linear-gradient(160deg,rgba(239,246,255,0.96)_0%,rgba(255,255,255,1)_58%,rgba(224,242,254,0.62)_100%)] px-2 py-2 shadow-[0_8px_18px_rgba(15,23,42,0.10)]"
                      style={{
                        width: `${subordinateCardWidth}px`,
                        minHeight: `${subordinateCardHeight}px`,
                        left: `${item.left}px`,
                        top: `${item.top}px`,
                      }}
                    >
                      <span className="absolute inset-x-0 top-0 h-1 bg-sky-500/75" aria-hidden />
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-sky-200 bg-sky-50 text-sky-700">
                            <Users className="h-3.5 w-3.5" />
                          </span>
                          <div>
                            <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                              Podřízený {item.idx + 1}
                            </div>
                            <div className="text-sm font-semibold leading-tight text-slate-900">Poradce</div>
                          </div>
                        </div>

                        {subordinates.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeSub(item.sub.id)}
                            className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
                          >
                            Odebrat
                          </button>
                        )}
                      </div>

                      <div className="mt-1.5 space-y-1.5">
                        <div className="space-y-1">
                          <label className="text-[11px] text-slate-500">
                            Pozice
                          </label>
                          <select
                            className={STRUCTURE_FIELD_CLASS}
                            value={item.sub.position}
                            onChange={(e) =>
                              updateSub(
                                item.sub.id,
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

                        <div className="grid grid-cols-3 gap-1.5">
                          <div>
                            <label className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                              <Heart className="h-3 w-3 text-rose-500" />
                              Život
                            </label>
                            <input
                              type="number"
                              min={0}
                              className={`${STRUCTURE_FIELD_CLASS} mt-1`}
                              value={item.sub.lifeMonthly}
                              onChange={(e) =>
                                updateSub(item.sub.id, "lifeMonthly", e.target.value)
                              }
                            />
                          </div>
                          <div>
                            <label className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                              <CarFront className="h-3 w-3 text-blue-500" />
                              Auto
                            </label>
                            <input
                              type="number"
                              min={0}
                              className={`${STRUCTURE_FIELD_CLASS} mt-1`}
                              value={item.sub.autoAnnual}
                              onChange={(e) =>
                                updateSub(item.sub.id, "autoAnnual", e.target.value)
                              }
                            />
                          </div>
                          <div>
                            <label className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                              <House className="h-3 w-3 text-cyan-600" />
                              Maj.
                            </label>
                            <input
                              type="number"
                              min={0}
                              className={`${STRUCTURE_FIELD_CLASS} mt-1`}
                              value={item.sub.propAnnual}
                              onChange={(e) =>
                                updateSub(item.sub.id, "propAnnual", e.target.value)
                              }
                            />
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            );
          })()}
        </section>

        <section className={`${PANEL_CLASS} mt-32 space-y-3`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-600">
                Roční projekce meziprovize
              </p>
              <p className="text-sm text-slate-800">
                Součet manažerských provizí za daný
                rok.
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-slate-500">Nejlepší rok</p>
              <p className="text-xl font-semibold text-slate-900">
                {formatMoney(teamMaxYearValue)}
              </p>
            </div>
          </div>

          {!hasTeamData ? (
            <p className="text-sm text-slate-600">
              Zadej produkci podřízených, abychom mohli spočítat meziprovizi.
            </p>
          ) : (
            <ProjectionYearBarChart
              years={teamYears}
              maxYearValue={teamMaxYearValue}
              selectedYear={selectedTeamYear}
              onSelect={setSelectedTeamYear}
              tone="emerald"
            />
          )}
        </section>

        {selectedTeamYear != null &&
          teamMonthlyByYear[selectedTeamYear] &&
          hasTeamData && (
            <section className={`${PANEL_CLASS} space-y-3`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-slate-600">
                    Měsíční výplaty manažerské provize
                  </p>
                  <p className="text-sm text-slate-800">
                    Rok {selectedTeamYear} • klikni na jiný rok v grafu pro změnu.
                  </p>
                </div>
              </div>

              <MonthPayoutGrid months={teamMonthlyByYear[selectedTeamYear]} />
            </section>
          )}

        <div className="text-xs text-slate-500">
          ŽIVOT vychází z provize produktu ČPP NEON a dobou trvání smlouvy alespoň 15 let. 
          AUTO vychází z provize ČPP AUTO, MAJETEK vychází z provize 
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

function ProjectionYearBarChart({
  years,
  maxYearValue,
  selectedYear,
  onSelect,
  tone,
}: {
  years: YearRow[];
  maxYearValue: number;
  selectedYear: number | null;
  onSelect: (year: number) => void;
  tone: "slate" | "emerald";
}) {
  const activeRingClass =
    tone === "emerald" ? "ring-2 ring-emerald-300/70" : "ring-2 ring-slate-400/70";
  const activeBarClass =
    tone === "emerald"
      ? "border-emerald-500/60 bg-gradient-to-t from-emerald-700 to-emerald-500 shadow-[0_16px_24px_rgba(16,185,129,0.24)]"
      : "border-slate-500/70 bg-gradient-to-t from-slate-800 to-slate-500 shadow-[0_16px_24px_rgba(15,23,42,0.22)]";
  const idleBarClass =
    tone === "emerald"
      ? "border-emerald-400/40 bg-gradient-to-t from-emerald-600/90 to-emerald-400/85 shadow-[0_10px_18px_rgba(16,185,129,0.16)]"
      : "border-slate-500/35 bg-gradient-to-t from-slate-700/90 to-slate-500/80 shadow-[0_10px_18px_rgba(15,23,42,0.14)]";

  return (
    <div className="mt-2 overflow-x-auto pb-1">
      <div className="relative min-w-max rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.95)_0%,rgba(241,245,249,0.72)_100%)] px-4 pb-3 pt-4">
        <div className="pointer-events-none absolute inset-x-4 top-4 bottom-11">
          {[1, 2, 3, 4].map((step) => (
            <div
              key={step}
              className="absolute left-0 right-0 border-t border-slate-200/80"
              style={{ bottom: `${step * 25}%` }}
            />
          ))}
        </div>

        <div className="relative z-10 flex items-end gap-3">
          {years.map((y, idx) => {
            const h =
              maxYearValue > 0
                ? Math.max(14, Math.round((y.total / maxYearValue) * 164))
                : 14;
            const isActive = y.year === selectedYear;

            return (
              <button
                key={y.year}
                type="button"
                className="group flex min-w-[64px] flex-col items-center gap-1"
                onClick={() => onSelect(y.year)}
                aria-pressed={isActive}
                title={`Rok ${idx + 1}`}
              >
                <div
                  className={`text-[10px] font-semibold transition ${
                    isActive ? "text-slate-900" : "text-slate-700"
                  }`}
                >
                  {formatMoney(y.total)}
                </div>

                <div className="relative flex h-[174px] w-[46px] items-end justify-center">
                  <div
                    className={`w-full rounded-[16px] border transition-all duration-300 ${
                      isActive ? activeBarClass : idleBarClass
                    } ${isActive ? activeRingClass : ""}`}
                    style={{
                      height: `${h}px`,
                      transform: isActive ? "translateY(-4px)" : "translateY(0)",
                      opacity: isActive ? 1 : 0.9,
                    }}
                  />
                </div>

                <div
                  className={`text-[11px] font-medium transition ${
                    isActive ? "text-slate-800" : "text-slate-500"
                  }`}
                >
                  {idx + 1}. rok
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MonthPayoutGrid({ months }: { months: number[] }) {
  const normalizedMonths = Array.from({ length: 12 }, (_, idx) => months[idx] ?? 0);
  const maxMonthValue = Math.max(...normalizedMonths, 1);
  const percentFormatter = new Intl.NumberFormat("cs-CZ", {
    maximumFractionDigits: 1,
  });

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {normalizedMonths.map((amount, idx) => {
        const prevAmount = idx > 0 ? normalizedMonths[idx - 1] : null;
        const diff = prevAmount == null ? 0 : amount - prevAmount;
        const hasPrev = prevAmount != null;
        const moved = Math.abs(diff) > 0.5;

        const trend: "up" | "down" | "flat" =
          !hasPrev || !moved ? "flat" : diff > 0 ? "up" : "down";
        const quarterLabel = `Q${Math.floor(idx / 3) + 1}`;
        const barWidthPercent = Math.max(8, Math.round((amount / maxMonthValue) * 100));

        const trendMeta: Record<
          "up" | "down" | "flat",
          {
            box: string;
            icon: React.ReactNode;
            text: string;
          }
        > = {
          up: {
            box: "border-emerald-300/80 bg-emerald-50 text-emerald-700",
            icon: <TrendingUp className="h-3.5 w-3.5" />,
            text:
              hasPrev && (prevAmount ?? 0) > 0
                ? `+${percentFormatter.format((diff / (prevAmount ?? 1)) * 100)} %`
                : "+",
          },
          down: {
            box: "border-rose-300/80 bg-rose-50 text-rose-700",
            icon: <TrendingDown className="h-3.5 w-3.5" />,
            text:
              hasPrev && (prevAmount ?? 0) > 0
                ? `${percentFormatter.format((diff / (prevAmount ?? 1)) * 100)} %`
                : "-",
          },
          flat: {
            box: "border-slate-300 bg-slate-50 text-slate-600",
            icon: <Minus className="h-3.5 w-3.5" />,
            text: hasPrev ? "Beze změny" : "Start roku",
          },
        };

        return (
          <article
            key={`${MONTH_LABELS[idx]}-${idx}`}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-[0_8px_20px_rgba(15,23,42,0.06)] transition hover:-translate-y-[1px] hover:shadow-[0_12px_24px_rgba(15,23,42,0.1)]"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  {quarterLabel}
                </p>
                <p className="text-xl font-semibold text-slate-900">{MONTH_LABELS[idx]}</p>
              </div>
              <div
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold ${trendMeta[trend].box}`}
                title="Změna oproti předchozímu měsíci"
              >
                {trendMeta[trend].icon}
                <span>{trendMeta[trend].text}</span>
              </div>
            </div>

            <div className="mt-3 flex items-end justify-between gap-2">
              <p className="text-[30px] font-semibold leading-none text-slate-900">{formatMoney(amount)}</p>
            </div>

            <div className="mt-3">
              <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all"
                  style={{ width: `${barWidthPercent}%` }}
                />
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function InputCard({
  title,
  subtitle,
  value,
  onChange,
  extra,
  tone = "neutral",
}: {
  title: string;
  subtitle: string;
  value: string;
  onChange: (v: string) => void;
  extra?: React.ReactNode;
  tone?: "life" | "auto" | "property" | "neutral";
}) {
  const toneStyles: Record<
    "life" | "auto" | "property" | "neutral",
    { panel: string; accent: string }
  > = {
    life: {
      panel:
        "border-rose-200 bg-[linear-gradient(150deg,rgba(255,241,242,0.88)_0%,rgba(255,255,255,1)_60%)]",
      accent: "bg-rose-500/80",
    },
    auto: {
      panel:
        "border-blue-200 bg-[linear-gradient(150deg,rgba(239,246,255,0.9)_0%,rgba(255,255,255,1)_60%)]",
      accent: "bg-blue-500/80",
    },
    property: {
      panel:
        "border-cyan-200 bg-[linear-gradient(150deg,rgba(236,254,255,0.9)_0%,rgba(255,255,255,1)_60%)]",
      accent: "bg-cyan-500/80",
    },
    neutral: {
      panel: "border-slate-300 bg-white",
      accent: "bg-slate-400",
    },
  };
  const toneStyle = toneStyles[tone];

  return (
    <section
      className={`relative overflow-hidden rounded-[28px] border px-5 py-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)] space-y-3 ${toneStyle.panel}`}
    >
      <span className={`absolute inset-x-0 top-0 h-1 ${toneStyle.accent}`} aria-hidden />
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className="text-xs text-slate-600">{subtitle}</p>
      </div>
      <input
        type="number"
        min={0}
        className={FIELD_CLASS}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {extra}
    </section>
  );
}
