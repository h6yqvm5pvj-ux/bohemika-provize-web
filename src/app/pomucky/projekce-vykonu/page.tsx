"use client";

import { useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  ArrowLeft,
  CarFront,
  ChartNoAxesColumnIncreasing,
  ChartSpline,
  Gauge,
  HelpCircle,
  Heart,
  House,
  Layers3,
  Minus,
  Orbit,
  Plus,
  Sparkles,
  TimerReset,
  TrendingDown,
  TrendingUp,
  UserRound,
  Users,
  Workflow,
  X,
} from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { auth } from "@/app/firebase";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import {
  POSITION_LABELS,
  formatMoney as formatMoneyValue,
} from "@/app/lib/formatters";
import {
  calculateCppAuto,
  calculateDomex,
} from "@/app/lib/productFormulas";
import { type Position, type CommissionMode } from "@/app/types/domain";
import { projectNeonPayouts as projectNeon } from "./projectionLogic";

type YearRow = { year: number; total: number };
type MonthlyTotals = Record<number, number[]>;
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
  "rounded-[28px] border border-white/10 bg-black/70 px-5 py-5 text-white shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur-2xl";
const PANEL_SOFT_CLASS =
  "rounded-[28px] border border-white/10 bg-[linear-gradient(135deg,rgba(12,12,15,0.92)_0%,rgba(34,14,56,0.88)_55%,rgba(7,7,9,0.96)_100%)] px-5 py-5 text-white shadow-[0_22px_70px_rgba(0,0,0,0.42)] backdrop-blur-2xl";
const FIELD_CLASS =
  "w-full rounded-2xl border border-white/15 bg-white px-3 py-2.5 text-sm font-bold text-black outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] transition focus:border-fuchsia-400 focus:ring-4 focus:ring-fuchsia-500/20";
const STRUCTURE_FIELD_CLASS =
  "h-8 w-full rounded-lg border border-white/15 bg-white px-2 py-1 text-[12px] font-bold text-black outline-none transition focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-500/20";
const BADGE_BUTTON_BASE =
  "rounded-full border px-2.5 py-1 text-[12px] font-extrabold transition";
const SMART_AUTO_ANNIVERSARY_GROWTH = 0.05;
const SMART_PROPERTY_REWRITE_YEAR = 3;
const SMART_PROPERTY_REWRITE_GROWTH = 0.2;
const SMART_PROPERTY_ANNUAL_GROWTH_AFTER_REWRITE = 0.03;
const SMART_LIFE_REVISION_GROWTH = 0.02;

const POSITION_OPTIONS: Position[] = [
  "poradce1",
  "poradce2",
  "poradce3",
  "poradce4",
  "poradce5",
  "poradce6",
  "poradce7",
  "poradce8",
  "poradce9",
  "poradce10",
  "manazer4",
  "manazer5",
  "manazer6",
  "manazer7",
  "manazer8",
  "manazer9",
  "manazer10",
];

const MANAGER_POSITION_OPTIONS: ManagerPosition[] = [
  "manazer4",
  "manazer5",
  "manazer6",
  "manazer7",
  "manazer8",
  "manazer9",
];

const ADVISOR_POSITION_OPTIONS: AdvisorPosition[] = [
  "poradce1",
  "poradce2",
  "poradce3",
  "poradce4",
  "poradce5",
  "poradce6",
];

const PROJECTION_PAGE_CSS = `
  @keyframes projection-grid-shift {
    0% { background-position: 0 0, 0 0; }
    100% { background-position: 42px 42px, 42px 42px; }
  }
  @keyframes projection-sweep {
    0% { transform: translateX(-42%) skewX(-10deg); opacity: 0; }
    18% { opacity: 0.6; }
    54% { opacity: 0.35; }
    100% { transform: translateX(122%) skewX(-10deg); opacity: 0; }
  }
  @keyframes projection-float {
    0%, 100% { transform: translate3d(0, 0, 0); }
    50% { transform: translate3d(0, -8px, 0); }
  }
  @keyframes projection-bar-rise {
    from { opacity: 0.28; transform: scaleY(0.18); }
    to { opacity: 1; transform: scaleY(1); }
  }
  @keyframes projection-line-dash {
    to { stroke-dashoffset: -34; }
  }
  @keyframes projection-trend-draw {
    from { stroke-dashoffset: 1; opacity: 0.3; }
    to { stroke-dashoffset: 0; opacity: 1; }
  }
  @keyframes projection-point-pulse {
    0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.9; }
    50% { transform: translate(-50%, -50%) scale(1.28); opacity: 1; }
  }
  .projection-grid {
    background-image:
      linear-gradient(rgba(255,255,255,0.07) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.07) 1px, transparent 1px);
    background-size: 42px 42px;
    animation: projection-grid-shift 18s linear infinite;
  }
  .projection-sweep::after {
    content: "";
    position: absolute;
    inset: -12% auto -12% 0;
    width: 42%;
    background: linear-gradient(90deg, transparent, rgba(217,70,239,0.28), transparent);
    animation: projection-sweep 5.8s ease-in-out infinite;
  }
  .projection-float {
    animation: projection-float 5.4s ease-in-out infinite;
  }
  .projection-bar {
    transform-origin: bottom;
    animation: projection-bar-rise 620ms cubic-bezier(0.2, 0.9, 0.2, 1) both;
  }
  .projection-line {
    stroke-dasharray: 12 10;
    animation: projection-line-dash 2.2s linear infinite;
  }
  .projection-trend-line {
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    animation: projection-trend-draw 900ms cubic-bezier(0.2, 0.9, 0.2, 1) both;
  }
  .projection-chart-point {
    animation: projection-point-pulse 2.8s ease-in-out infinite;
  }
  .projection-page h2,
  .projection-page .projection-readable,
  .projection-page .projection-readable * {
    color: #fff !important;
  }
  .projection-page .projection-readable {
    text-shadow: 0 2px 10px rgba(0, 0, 0, 0.72);
  }
  .projection-page .projection-percent-idle {
    background: #fff !important;
    border-color: #fff !important;
    color: #050505 !important;
    box-shadow: 0 10px 22px rgba(255, 255, 255, 0.12);
  }
  .projection-page .projection-percent-active {
    background: #e879f9 !important;
    border-color: #f0abfc !important;
    color: #050505 !important;
    box-shadow: 0 10px 28px rgba(217, 70, 239, 0.32);
  }
`;

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

function isPositionValue(value: unknown): value is Position {
  return (
    typeof value === "string" && POSITION_OPTIONS.includes(value as Position)
  );
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
    <div className="flex flex-wrap items-center gap-2 text-[11px] text-white">
      <span className="projection-readable min-w-[76px] text-[10px] font-extrabold uppercase tracking-[0.16em] !text-white">
        {label}
      </span>
      {[0, 3, 5, 10].map((val) => (
        <button
          key={val}
          type="button"
          onClick={() => onChange(val as StornoPct)}
          className={`${BADGE_BUTTON_BASE} ${
            value === val
              ? "projection-percent-active border-fuchsia-300 bg-fuchsia-400 !text-black shadow-[0_8px_24px_rgba(217,70,239,0.38)]"
              : "projection-percent-idle border-white bg-white !text-black shadow-[0_10px_22px_rgba(255,255,255,0.12)] hover:border-fuchsia-200 hover:bg-fuchsia-100"
          }`}
        >
          {val}%
        </button>
      ))}
    </div>
  );
}

function SmartPredictionBadge({ text }: { text: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-[12px] border border-fuchsia-200/25 bg-black/42 px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em] !text-white shadow-[0_10px_24px_rgba(0,0,0,0.24)]">
      <Sparkles className="h-3.5 w-3.5 !text-fuchsia-100" />
      <span className="!text-white">{text}</span>
    </div>
  );
}

function formatMoney(v: number): string {
  return formatMoneyValue(v);
}

type ChartPoint = { x: number; y: number };

function buildSmoothPath(points: ChartPoint[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  return points
    .slice(1)
    .reduce((path, point, index) => {
      const previous = points[index];
      const midX = (previous.x + point.x) / 2;
      return `${path} C ${midX} ${previous.y}, ${midX} ${point.y}, ${point.x} ${point.y}`;
    }, `M ${points[0].x} ${points[0].y}`);
}

function completedPolicyYears(start: Date, date: Date): number {
  const rawYears = date.getFullYear() - start.getFullYear();
  const beforeAnniversary =
    date.getMonth() < start.getMonth() ||
    (date.getMonth() === start.getMonth() && date.getDate() < start.getDate());
  return Math.max(0, rawYears - (beforeAnniversary ? 1 : 0));
}

function smartAutoRenewalFactor(yearsFromStart: number): number {
  return Math.pow(
    1 + SMART_AUTO_ANNIVERSARY_GROWTH,
    Math.max(0, yearsFromStart)
  );
}

function smartPropertyRenewalFactor(yearsFromStart: number): number {
  if (yearsFromStart < SMART_PROPERTY_REWRITE_YEAR) return 1;
  return (
    1 + SMART_PROPERTY_REWRITE_GROWTH
  ) * Math.pow(
    1 + SMART_PROPERTY_ANNUAL_GROWTH_AFTER_REWRITE,
    yearsFromStart - SMART_PROPERTY_REWRITE_YEAR
  );
}

function smartLifeRevisionFactor(yearsFromStart: number): number {
  return Math.pow(
    1 + SMART_LIFE_REVISION_GROWTH,
    Math.max(0, yearsFromStart)
  );
}

function projectLife(
  monthlyPremium: number,
  pos: Position,
  mode: CommissionMode,
  start: Date,
  storno: StornoPct
) {
  return projectNeon(monthlyPremium, pos, mode, start, storno).map((payout) => {
    const yearsFromStart = completedPolicyYears(start, payout.date);
    return {
      ...payout,
      amount: payout.amount * smartLifeRevisionFactor(yearsFromStart),
    };
  });
}

function projectAuto(
  annualPremium: number,
  pos: Position,
  start: Date,
  storno: StornoPct
) {
  const autoCommission = calculateCppAuto(annualPremium, "annual", pos).total;
  const res: { date: Date; amount: number }[] = [];
  // první výplata až následující měsíc (prosincová produkce se vyplatí v lednu)
  const first = new Date(start);
  first.setMonth(first.getMonth() + 1);
  for (let y = 0; y < YEARS; y++) {
    const smartGrowth = smartAutoRenewalFactor(y);
    const stor = Math.pow(1 - storno / 100, y);
    const payout = autoCommission * smartGrowth * stor;
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
      const smartGrowth = smartPropertyRenewalFactor(y);
      res.push({
        date,
        amount: subsequent.amount * smartGrowth * Math.pow(1 - storno / 100, y),
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
  const [selectedPosition, setSelectedPosition] =
    useState<Position>("poradce1");

  const [lifeMonthly, setLifeMonthly] = useState("0");
  const [autoAnnual, setAutoAnnual] = useState("0");
  const [propAnnual, setPropAnnual] = useState("0");
  const [lifeStorno, setLifeStorno] = useState<StornoPct>(0);
  const [autoStorno, setAutoStorno] = useState<StornoPct>(0);
  const [propStorno, setPropStorno] = useState<StornoPct>(0);
  const [viewMode, setViewMode] = useState<"none" | "individual" | "team">(
    "none"
  );
  const [isHelpOpen, setIsHelpOpen] = useState(false);
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
        setSelectedPosition("poradce1");
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
        if (isPositionValue(profilePosition)) {
          setSelectedPosition(profilePosition);
        } else {
          setSelectedPosition("poradce1");
        }
      } catch (err) {
        console.error("Načtení profilu pro projekci výkonu selhalo:", err);
        setProfileFullName(null);
        setSelectedPosition("poradce1");
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
    const pos = selectedPosition;
    const mode: CommissionMode = "accelerated";
    const life = Math.max(0, parseNumber(lifeMonthly));
    const auto = Math.max(0, parseNumber(autoAnnual));
    const prop = Math.max(0, parseNumber(propAnnual));

    const payouts: { date: Date; amount: number }[] = [];
    const monthlyMap = new Map<number, Map<number, number>>();

    // pro každý měsíc v horizontu zopakujeme produkci
    for (let m = 0; m < MONTHS; m++) {
      const base = new Date(startDate.getFullYear(), startDate.getMonth() + m, 1);
      if (life > 0) payouts.push(...projectLife(life, pos, mode, base, lifeStorno));
      if (auto > 0) payouts.push(...projectAuto(auto, pos, base, autoStorno));
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
  }, [selectedPosition, lifeMonthly, autoAnnual, propAnnual, lifeStorno, autoStorno, propStorno, startDate]);

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
        addPayouts(combined, projectLife(managerLife, posManager, mode, base, 0));
      }
      if (managerAuto > 0) {
        addPayouts(combined, projectAuto(managerAuto, posManager, base, 0));
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
          const man = projectLife(life, posManager, mode, base, 0);
          const subp = projectLife(life, posSub, mode, base, 0);
          addDiffPayouts(combined, man, subp);
        }
        if (auto > 0) {
          const man = projectAuto(auto, posManager, base, 0);
          const subp = projectAuto(auto, posSub, base, 0);
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
        <ProjectionChrome>
          <div className="mx-auto flex min-h-[52vh] w-full max-w-4xl items-center justify-center">
            <section className={`${PANEL_SOFT_CLASS} text-center`}>
              <p className="text-sm font-semibold text-white/80">
                Přihlas se, abys viděl projekci následných provizí.
              </p>
            </section>
          </div>
        </ProjectionChrome>
      </AppLayout>
    );
  }

  const renderIntro = () => {
    const displayName = profileFullName || displayNameFromUser(user);

    return (
      <div className="flex min-h-[calc(100vh-2rem)] w-full flex-col gap-5">
        <ProjectionTopNav onHelp={() => setIsHelpOpen(true)} />

        <section className="projection-sweep relative flex flex-1 items-center overflow-hidden rounded-[34px] border border-white/10 bg-black px-5 py-8 shadow-[0_32px_100px_rgba(0,0,0,0.52)] sm:px-8 lg:px-10">
          <div className="projection-grid pointer-events-none absolute inset-0 opacity-25" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-fuchsia-300/80 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-fuchsia-500/20 to-transparent" />

          <div className="relative z-10 grid w-full items-center gap-8 lg:grid-cols-[1.12fr_0.88fr]">
            <div className="max-w-3xl space-y-7">
              <div className="inline-flex items-center gap-2 rounded-full border border-fuchsia-300/30 bg-white/10 px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.22em] text-fuchsia-100">
                <Sparkles className="h-4 w-4 text-fuchsia-300" />
                Virtuální topka
              </div>

              <div className="space-y-4">
                <h1 className="max-w-4xl text-5xl font-black leading-[0.95] tracking-tight text-white sm:text-6xl lg:text-7xl">
                  Projekce výkonu
                  <span className="block bg-gradient-to-r from-white via-fuchsia-200 to-fuchsia-500 bg-clip-text text-transparent">
                    v budoucích letech
                  </span>
                </h1>
                <p className="max-w-2xl text-lg font-semibold leading-8 text-white/80 sm:text-xl">
                  Pravidelná péče o klienta zajistí pravidelný příjem. Vyber
                  pozici, zadej produkci a sleduj vývoj následných provizí.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <MetricTile icon={<TimerReset className="h-4 w-4" />} label="Horizont" value="15 let" />
                <MetricTile icon={<Gauge className="h-4 w-4" />} label="Výpočet" value="Měsíčně" />
                <MetricTile icon={<Layers3 className="h-4 w-4" />} label="Pozice" value={POSITION_LABELS[selectedPosition]} />
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setViewMode("individual")}
                  className="group relative inline-flex min-h-12 items-center justify-center gap-3 overflow-hidden rounded-[18px] border border-white/25 bg-white/14 px-6 py-3 text-sm font-black text-white shadow-[0_18px_44px_rgba(0,0,0,0.26),inset_0_1px_0_rgba(255,255,255,0.34)] backdrop-blur-xl transition duration-300 before:absolute before:inset-x-4 before:top-1 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/80 before:to-transparent after:absolute after:inset-0 after:bg-[linear-gradient(115deg,transparent_0%,rgba(255,255,255,0.18)_46%,transparent_72%)] after:opacity-0 after:transition after:duration-300 hover:-translate-y-0.5 hover:border-white/45 hover:bg-white/20 hover:after:opacity-100"
                >
                  <span className="relative z-10 inline-flex h-7 w-7 items-center justify-center rounded-[9px] border border-white/25 bg-black/50 text-white shadow-[0_10px_24px_rgba(0,0,0,0.22)] transition group-hover:-translate-y-0.5">
                    <UserRound className="h-4 w-4" />
                  </span>
                  <span className="relative z-10">Vlastní produkce</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("team")}
                  className="group relative inline-flex min-h-12 items-center justify-center gap-3 overflow-hidden rounded-[18px] border border-fuchsia-200/35 bg-fuchsia-500/28 px-6 py-3 text-sm font-black text-white shadow-[0_18px_46px_rgba(217,70,239,0.20),inset_0_1px_0_rgba(255,255,255,0.30)] backdrop-blur-xl transition duration-300 before:absolute before:inset-x-4 before:top-1 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/75 before:to-transparent after:absolute after:inset-0 after:bg-[linear-gradient(115deg,transparent_0%,rgba(255,255,255,0.18)_46%,transparent_72%)] after:opacity-0 after:transition after:duration-300 hover:-translate-y-0.5 hover:border-fuchsia-100/70 hover:bg-fuchsia-400/36 hover:after:opacity-100"
                >
                  <span className="relative z-10 inline-flex h-7 w-7 items-center justify-center rounded-[9px] border border-white/25 bg-black/55 text-fuchsia-100 shadow-[0_10px_24px_rgba(0,0,0,0.22)] transition group-hover:-translate-y-0.5">
                    <Users className="h-4 w-4" />
                  </span>
                  <span className="relative z-10">Budování týmu</span>
                </button>
              </div>
            </div>

            <div className="projection-float relative overflow-hidden rounded-[32px] border border-white/10 bg-white/10 p-5 shadow-[0_26px_80px_rgba(0,0,0,0.36)] backdrop-blur-2xl">
              <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent" />
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-white/75">
                      Start profilu
                    </p>
                    <p className="mt-1 text-2xl font-black leading-tight text-white">
                      {displayName}
                    </p>
                  </div>
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-fuchsia-300/35 bg-fuchsia-400/20 text-fuchsia-100">
                    <UserRound className="h-5 w-5" />
                  </span>
                </div>

                <PositionSelector
                  value={selectedPosition}
                  onChange={setSelectedPosition}
                />

                <HeroProjectionChart />
              </div>
            </div>
          </div>
        </section>
      </div>
    );
  };

  const renderIndividual = () => {
    const selectedYearTotal =
      selectedYear == null
        ? 0
        : years.find((row) => row.year === selectedYear)?.total ?? 0;
    const selectedMonths =
      selectedYear == null ? [] : monthlyByYear[selectedYear] ?? [];
    const selectedMonthTotal = selectedMonths.reduce(
      (sum, amount) => sum + amount,
      0
    );

    return (
      <div className="w-full space-y-6">
        <ProjectionTopNav
          onHelp={() => setIsHelpOpen(true)}
          onReset={() => setViewMode("none")}
        />

        <section className="grid gap-4 lg:grid-cols-[1.16fr_0.84fr]">
          <div className="relative px-1 py-6 sm:px-3 lg:py-8">
            <div className="relative z-10 space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-fuchsia-300/30 bg-white/10 px-3 py-1.5 text-xs font-black uppercase tracking-[0.2em] text-fuchsia-100">
                <ChartSpline className="h-4 w-4 text-fuchsia-300" />
                Vlastní produkce
              </div>
              <div className="space-y-3">
                <h1 className="max-w-4xl text-4xl font-black leading-[0.96] tracking-tight !text-white drop-shadow-[0_4px_22px_rgba(0,0,0,0.72)] sm:text-5xl lg:text-6xl">
                  Poznej sílu
                  <span className="block bg-gradient-to-r from-white via-fuchsia-200 to-fuchsia-500 bg-clip-text text-transparent">
                    následných provizí
                  </span>
                </h1>
                <p className="max-w-2xl text-base font-semibold leading-7 !text-white/80 drop-shadow-[0_2px_14px_rgba(0,0,0,0.72)] sm:text-lg">
                  Pravidelná péče o klienta zajistí pravidelný příjem.
                </p>
              </div>
            </div>
          </div>

          <aside className={`${PANEL_SOFT_CLASS} space-y-4`}>
            <PositionSelector
              value={selectedPosition}
              onChange={setSelectedPosition}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricTile
                icon={<Layers3 className="h-4 w-4" />}
                label="Pozice"
                value={POSITION_LABELS[selectedPosition]}
              />
              <MetricTile
                icon={<ChartNoAxesColumnIncreasing className="h-4 w-4" />}
                label="Nejlepší rok"
                value={formatMoney(maxYearValue)}
              />
              <MetricTile
                icon={<Orbit className="h-4 w-4" />}
                label="Vybraný rok"
                value={selectedYear == null ? "-" : String(selectedYear)}
              />
              <MetricTile
                icon={<Sparkles className="h-4 w-4" />}
                label="Výplata v roce"
                value={formatMoney(selectedMonthTotal || selectedYearTotal)}
              />
            </div>
          </aside>
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <InputCard
            title="Životní pojištění"
            subtitle="Měsíční pojistné"
            value={lifeMonthly}
            onChange={setLifeMonthly}
            tone="life"
            icon={<Heart className="h-5 w-5" />}
            extra={
              <div className="space-y-3">
                <StornoPicker
                  label="Stornovost"
                  value={lifeStorno}
                  onChange={setLifeStorno}
                />
                <SmartPredictionBadge text="Revize +2 % ročně" />
              </div>
            }
          />
          <InputCard
            title="Auto pojištění"
            subtitle="Roční pojistné"
            value={autoAnnual}
            onChange={setAutoAnnual}
            tone="auto"
            icon={<CarFront className="h-5 w-5" />}
            extra={
              <div className="space-y-3">
                <StornoPicker
                  label="Stornovost"
                  value={autoStorno}
                  onChange={setAutoStorno}
                />
                <SmartPredictionBadge text="Výročí +5 % ročně" />
              </div>
            }
          />
          <InputCard
            title="Pojištění majetku"
            subtitle="Roční pojistné"
            value={propAnnual}
            onChange={setPropAnnual}
            tone="property"
            icon={<House className="h-5 w-5" />}
            extra={
              <div className="space-y-3">
                <StornoPicker
                  label="Stornovost"
                  value={propStorno}
                  onChange={setPropStorno}
                />
                <SmartPredictionBadge text="Revize po 3 letech" />
              </div>
            }
          />
        </section>

        <section className={`${PANEL_CLASS} space-y-4`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] !text-white">
                Roční projekce
              </p>
              <p className="text-sm font-semibold !text-white">
                Součet okamžitých i následných provizí za daný rok.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-right">
              <p className="text-[11px] font-bold !text-white">Nejlepší rok</p>
              <p className="text-2xl font-black !text-white">
                {formatMoney(maxYearValue)}
              </p>
            </div>
          </div>

          <ProjectionYearBarChart
            years={years}
            maxYearValue={maxYearValue}
            selectedYear={selectedYear}
            onSelect={setSelectedYear}
            tone="purple"
          />
        </section>

        {selectedYear != null && monthlyByYear[selectedYear] && (
          <section className={`${PANEL_CLASS} space-y-4`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] !text-white">
                  Měsíční výplaty
                </p>
                <p className="text-sm font-semibold !text-white">
                  Rok {selectedYear} • klikni na jiný rok v grafu pro změnu.
                </p>
              </div>
            </div>

            <MonthPayoutGrid months={monthlyByYear[selectedYear]} />
          </section>
        )}

        <div className="rounded-2xl border border-white/10 bg-black/50 px-4 py-3 text-xs font-semibold !text-white">
          Odhad provize je orientační.
        </div>
      </div>
    );
  };

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
      <div className="w-full space-y-6">
        <ProjectionTopNav
          onHelp={() => setIsHelpOpen(true)}
          onReset={() => setViewMode("none")}
        />

        <section className="projection-sweep relative overflow-hidden rounded-[32px] border border-white/10 bg-black px-5 py-6 shadow-[0_28px_88px_rgba(0,0,0,0.48)] sm:px-7">
          <div className="projection-grid pointer-events-none absolute inset-0 opacity-20" />
          <div className="relative z-10 mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-fuchsia-300/30 bg-white/10 px-3 py-1.5 text-xs font-black uppercase tracking-[0.2em] text-fuchsia-100">
                <Workflow className="h-4 w-4 text-fuchsia-300" />
                Týmová struktura
              </div>
              <h1 className="text-4xl font-black leading-[0.96] tracking-tight text-white sm:text-5xl lg:text-6xl">
                Chci budovat
                <span className="block bg-gradient-to-r from-white via-fuchsia-200 to-fuchsia-500 bg-clip-text text-transparent">
                  výkonný tým
                </span>
              </h1>
            </div>

            <button
              type="button"
              onClick={addSub}
              disabled={subordinates.length >= 20}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-fuchsia-300/45 bg-fuchsia-400 px-5 py-2.5 text-sm font-black text-black shadow-[0_16px_40px_rgba(217,70,239,0.24)] transition duration-300 hover:-translate-y-0.5 hover:bg-fuchsia-300 disabled:cursor-not-allowed disabled:opacity-60"
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
            const stageBottomSpace = 88;
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
              <div className="relative z-10 overflow-x-auto rounded-[30px] border border-white/10 bg-black/60 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                <div className="projection-grid pointer-events-none absolute inset-0 opacity-20" />
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
                            className="projection-line"
                            stroke="rgba(217, 70, 239, 0.82)"
                            strokeWidth="2"
                          />
                          <circle
                            cx={item.targetX}
                            cy={item.targetY}
                            r="4"
                            fill="rgba(255, 255, 255, 0.95)"
                          />
                        </g>
                      );
                    })}
                    <circle cx={lineStartX} cy={lineStartY} r="5" fill="rgba(217, 70, 239, 0.95)" />
                  </svg>

                  <article
                    className="projection-float absolute overflow-hidden rounded-[18px] border border-fuchsia-300/35 bg-[linear-gradient(155deg,rgba(255,255,255,0.96)_0%,rgba(244,232,255,0.96)_55%,rgba(217,70,239,0.42)_100%)] px-2 py-2 text-black shadow-[0_20px_46px_rgba(217,70,239,0.22)]"
                    style={{
                      width: `${managerCardWidth}px`,
                      minHeight: `${managerCardHeight}px`,
                      left: `${managerLeft}px`,
                      top: `${managerTop}px`,
                    }}
                  >
                    <span className="absolute inset-x-0 top-0 h-1 bg-fuchsia-500/80" aria-hidden />
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-fuchsia-200 bg-black text-fuchsia-200">
                        <UserRound className="h-3.5 w-3.5" />
                      </span>
                      <div>
                        <div className="text-[9px] font-black uppercase tracking-[0.16em] text-black/40">
                          Uživatel
                        </div>
                        <div className="text-sm font-black leading-tight text-black">{managerName}</div>
                      </div>
                    </div>

                    <div className="mt-1.5 space-y-1.5">
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-black/50">Pozice</label>
                        <select
                          className={STRUCTURE_FIELD_CLASS}
                          value={managerPos}
                          onChange={(e) =>
                            setManagerPos(e.target.value as ManagerPosition)
                          }
                        >
                          {MANAGER_POSITION_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {POSITION_LABELS[option]}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-3 gap-1.5">
                        <div>
                          <label className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.08em] text-black/50">
                            <Heart className="h-3 w-3 text-fuchsia-600" />
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
                          <label className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.08em] text-black/50">
                            <CarFront className="h-3 w-3 text-fuchsia-600" />
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
                          <label className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.08em] text-black/50">
                            <House className="h-3 w-3 text-fuchsia-600" />
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
                      className="absolute overflow-hidden rounded-[18px] border border-white/15 bg-[linear-gradient(155deg,rgba(255,255,255,0.94)_0%,rgba(250,245,255,0.96)_58%,rgba(168,85,247,0.34)_100%)] px-2 py-2 text-black shadow-[0_16px_38px_rgba(0,0,0,0.22)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_22px_52px_rgba(217,70,239,0.2)]"
                      style={{
                        width: `${subordinateCardWidth}px`,
                        minHeight: `${subordinateCardHeight}px`,
                        left: `${item.left}px`,
                        top: `${item.top}px`,
                      }}
                    >
                      <span className="absolute inset-x-0 top-0 h-1 bg-black" aria-hidden />
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-fuchsia-200 bg-fuchsia-500 text-black">
                            <Users className="h-3.5 w-3.5" />
                          </span>
                          <div>
                            <div className="text-[9px] font-black uppercase tracking-[0.16em] text-black/40">
                              Podřízený {item.idx + 1}
                            </div>
                            <div className="text-sm font-black leading-tight text-black">Poradce</div>
                          </div>
                        </div>

                        {subordinates.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeSub(item.sub.id)}
                            className="rounded-full border border-black/10 bg-black px-2.5 py-1 text-[11px] font-black text-white transition hover:bg-fuchsia-500 hover:text-black"
                          >
                            Odebrat
                          </button>
                        )}
                      </div>

                      <div className="mt-1.5 space-y-1.5">
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-black/50">
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
                            {ADVISOR_POSITION_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {POSITION_LABELS[option]}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="grid grid-cols-3 gap-1.5">
                          <div>
                            <label className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.08em] text-black/50">
                              <Heart className="h-3 w-3 text-fuchsia-600" />
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
                            <label className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.08em] text-black/50">
                              <CarFront className="h-3 w-3 text-fuchsia-600" />
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
                            <label className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.08em] text-black/50">
                              <House className="h-3 w-3 text-fuchsia-600" />
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

        <section className={`${PANEL_CLASS} space-y-4`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] !text-white">
                Roční projekce meziprovize
              </p>
              <p className="text-sm font-semibold !text-white">
                Součet manažerských provizí za daný
                rok.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-right">
              <p className="text-[11px] font-bold !text-white">Nejlepší rok</p>
              <p className="text-2xl font-black !text-white">
                {formatMoney(teamMaxYearValue)}
              </p>
            </div>
          </div>

          {!hasTeamData ? (
            <p className="rounded-2xl border border-white/10 bg-white/10 px-4 py-4 text-sm font-semibold !text-white">
              Zadej produkci podřízených, abychom mohli spočítat meziprovizi.
            </p>
          ) : (
            <ProjectionYearBarChart
              years={teamYears}
              maxYearValue={teamMaxYearValue}
              selectedYear={selectedTeamYear}
              onSelect={setSelectedTeamYear}
              tone="purple"
            />
          )}
        </section>

        {selectedTeamYear != null &&
          teamMonthlyByYear[selectedTeamYear] &&
          hasTeamData && (
            <section className={`${PANEL_CLASS} space-y-3`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] !text-white">
                    Měsíční výplaty manažerské provize
                  </p>
                  <p className="text-sm font-semibold !text-white">
                    Rok {selectedTeamYear} • klikni na jiný rok v grafu pro změnu.
                  </p>
                </div>
              </div>

              <MonthPayoutGrid months={teamMonthlyByYear[selectedTeamYear]} />
            </section>
          )}

        <div className="rounded-2xl border border-white/10 bg-black/50 px-4 py-3 text-xs font-semibold !text-white">
          Odhad provize je orientační.
        </div>
      </div>
    );
  };

  return (
    <AppLayout active="tools">
      <ProjectionChrome>
        {viewMode === "none" && renderIntro()}
        {viewMode === "individual" && renderIndividual()}
        {viewMode === "team" && renderTeam()}
        <ProjectionHelpModal
          isOpen={isHelpOpen}
          onClose={() => setIsHelpOpen(false)}
        />
      </ProjectionChrome>
    </AppLayout>
  );
}

function ProjectionChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="projection-page relative -mx-3 -my-6 min-h-[calc(100vh+3rem)] w-[calc(100%+1.5rem)] overflow-hidden bg-[linear-gradient(135deg,#030303_0%,#160722_48%,#050505_100%)] px-4 py-4 text-white sm:-mx-4 sm:-my-8 sm:min-h-[calc(100vh+4rem)] sm:w-[calc(100%+2rem)] sm:px-6 sm:py-5 lg:-mx-8 lg:w-[calc(100%+4rem)] lg:px-8">
      <style>{PROJECTION_PAGE_CSS}</style>
      <div className="projection-grid pointer-events-none absolute inset-0 opacity-20" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,transparent_0%,rgba(217,70,239,0.15)_42%,transparent_72%)]" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

function ProjectionTopNav({
  onHelp,
  onReset,
}: {
  onHelp: () => void;
  onReset?: () => void;
}) {
  const glassButtonClass =
    "group relative inline-flex min-h-10 items-center gap-2 overflow-hidden rounded-[16px] border border-fuchsia-100/35 bg-fuchsia-400/22 px-4 py-2 text-sm font-black !text-white shadow-[0_14px_34px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.30)] backdrop-blur-xl transition duration-300 before:absolute before:inset-x-3 before:top-1 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/75 before:to-transparent after:absolute after:inset-0 after:bg-[linear-gradient(115deg,transparent_0%,rgba(255,255,255,0.18)_46%,transparent_72%)] after:opacity-0 after:transition after:duration-300 hover:-translate-y-0.5 hover:border-fuchsia-100/70 hover:bg-fuchsia-300/30 hover:after:opacity-100";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Link
        href="/pomucky"
        className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-white/10 bg-white px-4 py-2 text-sm font-black text-black shadow-[0_14px_34px_rgba(0,0,0,0.24)] transition duration-300 hover:-translate-y-0.5 hover:bg-fuchsia-100"
      >
        <ArrowLeft className="h-4 w-4" />
        Zpět na pomůcky
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onHelp}
          className={glassButtonClass}
          style={{ color: "#fff" }}
        >
          <HelpCircle className="relative z-10 h-4 w-4 !text-white" />
          <span className="relative z-10 !text-white">Nápověda</span>
        </button>
        {onReset ? (
          <button
            type="button"
            onClick={onReset}
            className={glassButtonClass}
            style={{ color: "#fff" }}
          >
            <Sparkles className="relative z-10 h-4 w-4 !text-white" />
            <span className="relative z-10 !text-white">Změnit volbu</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ProjectionHelpModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-6 backdrop-blur-xl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="projection-help-title"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl overflow-hidden rounded-[22px] border border-fuchsia-200/20 bg-[linear-gradient(145deg,rgba(8,7,12,0.98)_0%,rgba(25,8,37,0.98)_58%,rgba(4,4,6,0.99)_100%)] p-6 !text-white shadow-[0_28px_90px_rgba(0,0,0,0.62)]"
        onClick={(event) => event.stopPropagation()}
        style={{ color: "#fff" }}
      >
        <div className="projection-grid pointer-events-none absolute inset-0 opacity-10" />
        <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-fuchsia-200/80 to-transparent" />
        <div className="relative z-10 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] !text-fuchsia-100">
              Projekce výkonu
            </p>
            <h2 id="projection-help-title" className="mt-2 text-3xl font-black !text-white">
              Nápověda
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-white/25 bg-white/12 !text-white transition hover:bg-white/18"
            aria-label="Zavřít nápovědu"
            style={{ color: "#fff" }}
          >
            <X className="h-5 w-5 !text-white" />
          </button>
        </div>

        <div
          className="relative z-10 mt-5 space-y-4 text-sm font-semibold leading-7 !text-white"
          style={{ color: "#fff" }}
        >
          <p className="!text-white">
            Odhad provize je orientační, výpočet počítá s pravidelnou produkcí
            dle dat, která jsi zadal(a).
          </p>
          <p className="!text-white">
            Provize ze životního pojištění vychází dle produktu ČPP Neon.
            Pojištění vozidel vychází z předpokladu, že každý produkt kromě
            pojištění flotil má stejné provizní podmínky. Majetkové pojištění
            vychází dle produktu ČPP Domex.
          </p>
          <p className="!text-white">
            Projekce už započítává chytré scénáře podobně jako provizní
            kalendář: u aut se modeluje zdražení k výročí o 5 % ročně, u
            majetku přepracování po 3 letech s navýšením o 20 % a následným
            růstem o 3 % ročně, u životního pojištění revizní navýšení o 2 %
            ročně.
          </p>
        </div>
      </div>
    </div>
  );
}

function PositionSelector({
  value,
  onChange,
}: {
  value: Position;
  onChange: (value: Position) => void;
}) {
  return (
    <label className="block space-y-2">
      <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/75">
        <Layers3 className="h-3.5 w-3.5 text-fuchsia-300" />
        Pozice pro výpočet
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as Position)}
        className="h-12 w-full rounded-2xl border border-fuchsia-300/25 bg-white px-4 text-sm font-black text-black shadow-[0_16px_40px_rgba(0,0,0,0.24)] outline-none transition focus:border-fuchsia-300 focus:ring-4 focus:ring-fuchsia-400/20"
      >
        {POSITION_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {POSITION_LABELS[option]}
          </option>
        ))}
      </select>
    </label>
  );
}

function MetricTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/10 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
      <div className="projection-readable flex items-center gap-3 text-fuchsia-100">
        <span className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-[9px] border border-fuchsia-200/25 bg-[linear-gradient(135deg,rgba(255,255,255,0.14)_0%,rgba(217,70,239,0.18)_48%,rgba(0,0,0,0.48)_100%)] text-fuchsia-100 shadow-[0_12px_26px_rgba(217,70,239,0.16)]">
          <span className="pointer-events-none absolute inset-x-1 top-1 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent" />
          {icon}
        </span>
        <span className="text-[10px] font-black uppercase tracking-[0.2em] !text-white">
          {label}
        </span>
      </div>
      <div className="projection-readable mt-3 min-h-8 text-xl font-black leading-tight !text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.72)]">
        {value}
      </div>
    </div>
  );
}

function HeroProjectionChart() {
  const chartId = useId().replace(/:/g, "");
  const lineGradientId = `${chartId}-hero-line`;
  const areaGradientId = `${chartId}-hero-area`;
  const bars = [30, 44, 39, 62, 57, 76, 69, 88];
  const points: ChartPoint[] = [
    { x: 4, y: 78 },
    { x: 18, y: 62 },
    { x: 31, y: 66 },
    { x: 45, y: 42 },
    { x: 58, y: 48 },
    { x: 72, y: 26 },
    { x: 84, y: 34 },
    { x: 96, y: 16 },
  ];
  const trendPath = buildSmoothPath(points);
  const areaPath = `${trendPath} L ${points[points.length - 1].x} 96 L ${points[0].x} 96 Z`;

  return (
    <div className="relative overflow-hidden rounded-[18px] border border-white/10 bg-[radial-gradient(circle_at_72%_18%,rgba(232,121,249,0.22),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.10),rgba(0,0,0,0.78))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]">
      <div className="projection-grid pointer-events-none absolute inset-0 opacity-10" />
      <div className="relative z-10 flex items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-fuchsia-300/30 bg-black/45 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-fuchsia-100">
          <TrendingUp className="h-3.5 w-3.5 text-fuchsia-300" />
          Křivka výkonu
        </div>
        <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-white">
          15 let
        </span>
      </div>

      <div className="relative z-10 mt-4 h-60 overflow-hidden rounded-[14px] border border-white/10 bg-black/70 shadow-[0_24px_70px_rgba(0,0,0,0.34)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_68%_42%,rgba(217,70,239,0.18),transparent_32%)]" />
        <div className="pointer-events-none absolute inset-x-5 top-8 bottom-16">
          {[0, 1, 2].map((step) => (
            <span
              key={step}
              className="absolute left-0 right-0 border-t border-white/10"
              style={{ top: `${step * 34}%` }}
            />
          ))}
        </div>

        <div className="absolute inset-x-5 top-7 h-36">
          <svg
            className="h-full w-full overflow-visible"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id={lineGradientId} x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="42%" stopColor="#f0abfc" />
                <stop offset="100%" stopColor="#d946ef" />
              </linearGradient>
              <linearGradient id={areaGradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#e879f9" stopOpacity="0.34" />
                <stop offset="72%" stopColor="#a21caf" stopOpacity="0.08" />
                <stop offset="100%" stopColor="#000000" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={areaPath} fill={`url(#${areaGradientId})`} />
            <path
              d={trendPath}
              fill="none"
              stroke="rgba(217,70,239,0.28)"
              strokeLinecap="round"
              strokeWidth="9"
              vectorEffect="non-scaling-stroke"
            />
            <path
              pathLength={1}
              className="projection-trend-line"
              d={trendPath}
              fill="none"
              stroke={`url(#${lineGradientId})`}
              strokeLinecap="round"
              strokeWidth="3"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {points.map((point, index) => (
            <span
              key={`${point.x}-${point.y}`}
              className="projection-chart-point absolute h-3 w-3 rounded-full border border-white bg-fuchsia-300 shadow-[0_0_24px_rgba(232,121,249,0.7)]"
              style={{
                left: `${point.x}%`,
                top: `${point.y}%`,
                animationDelay: `${index * 80}ms`,
              }}
            />
          ))}
        </div>

        <div className="absolute inset-x-5 bottom-16 grid h-28 grid-cols-8 items-end gap-2">
          {bars.map((height, index) => (
            <span
              key={`${height}-${index}`}
              className="projection-bar rounded-t-[8px] rounded-b-[3px] border border-fuchsia-200/35 bg-gradient-to-t from-fuchsia-900 via-fuchsia-500 to-white shadow-[0_0_28px_rgba(217,70,239,0.34)]"
              style={{
                height: `${height}%`,
                animationDelay: `${index * 70}ms`,
              }}
            />
          ))}
        </div>

        <div className="absolute inset-x-4 bottom-4 grid grid-cols-3 gap-2">
          {[
            ["Rok 1", "Start"],
            ["Rok 8", "Růst"],
            ["Rok 15", "Top"],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-[10px] border border-white/10 bg-white/10 px-3 py-2"
            >
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/60">
                {label}
              </p>
              <p className="mt-0.5 text-sm font-black text-white">{value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
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
  tone: "purple" | "white";
}) {
  const chartId = useId().replace(/:/g, "");
  const lineGradientId = `${chartId}-year-line`;
  const areaGradientId = `${chartId}-year-area`;
  const selectedIndex = years.findIndex((row) => row.year === selectedYear);
  const activeIndex = selectedIndex;
  const selectedRow = activeIndex >= 0 ? years[activeIndex] : null;
  const chartPoints = years.map((row, idx) => {
    const ratio = maxYearValue > 0 ? row.total / maxYearValue : 0;
    return {
      x: years.length > 1 ? (idx / (years.length - 1)) * 100 : 50,
      y: 88 - ratio * 68,
    };
  });
  const trendPath = buildSmoothPath(chartPoints);
  const trendAreaPath = chartPoints.length
    ? `${trendPath} L ${chartPoints[chartPoints.length - 1].x} 96 L ${chartPoints[0].x} 96 Z`
    : "";
  const activeRingClass =
    tone === "purple" ? "ring-2 ring-fuchsia-200/70" : "ring-2 ring-white/70";
  const activeBarClass =
    tone === "purple"
      ? "border-fuchsia-200/70 bg-gradient-to-t from-fuchsia-900 via-fuchsia-500 to-white shadow-[0_18px_36px_rgba(217,70,239,0.34)]"
      : "border-white/70 bg-gradient-to-t from-white/70 to-white shadow-[0_18px_36px_rgba(255,255,255,0.18)]";
  const idleBarClass =
    tone === "purple"
      ? "border-fuchsia-300/30 bg-gradient-to-t from-fuchsia-800/92 via-fuchsia-500/90 to-fuchsia-100/90 shadow-[0_12px_26px_rgba(217,70,239,0.18)]"
      : "border-white/20 bg-gradient-to-t from-white/50 to-white shadow-[0_12px_26px_rgba(255,255,255,0.12)]";

  return (
    <div className="mt-2 overflow-x-auto pb-1">
      <div className="relative min-w-max overflow-hidden rounded-[14px] border border-white/10 bg-[radial-gradient(circle_at_58%_0%,rgba(232,121,249,0.18),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.10)_0%,rgba(0,0,0,0.56)_100%)] px-4 pb-3 pt-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
        <div className="projection-grid pointer-events-none absolute inset-0 opacity-10" />
        <div className="pointer-events-none absolute inset-x-4 top-16 bottom-11">
          {[1, 2, 3, 4].map((step) => (
            <div
              key={step}
              className="absolute left-0 right-0 border-t border-white/10"
              style={{ bottom: `${step * 25}%` }}
            />
          ))}
        </div>

        {selectedRow ? (
          <div className="pointer-events-none absolute right-4 top-4 z-30 rounded-[10px] border border-white/10 bg-black/70 px-4 py-2 text-right shadow-[0_18px_44px_rgba(0,0,0,0.34)]">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-fuchsia-100">
              Aktivní rok
            </p>
            <p className="mt-0.5 text-sm font-black text-white">
              {selectedRow.year} · {formatMoney(selectedRow.total)}
            </p>
          </div>
        ) : null}

        {trendPath ? (
          <div className="pointer-events-none absolute inset-x-6 top-16 bottom-14 z-20">
            <svg
              className="h-full w-full overflow-visible"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id={lineGradientId} x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor="#ffffff" />
                  <stop offset="45%" stopColor="#f0abfc" />
                  <stop offset="100%" stopColor="#d946ef" />
                </linearGradient>
                <linearGradient id={areaGradientId} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#e879f9" stopOpacity="0.22" />
                  <stop offset="70%" stopColor="#a21caf" stopOpacity="0.06" />
                  <stop offset="100%" stopColor="#000000" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={trendAreaPath} fill={`url(#${areaGradientId})`} />
              <path
                d={trendPath}
                fill="none"
                stroke="rgba(217,70,239,0.26)"
                strokeLinecap="round"
                strokeWidth="8"
                vectorEffect="non-scaling-stroke"
              />
              <path
                pathLength={1}
                className="projection-trend-line"
                d={trendPath}
                fill="none"
                stroke={`url(#${lineGradientId})`}
                strokeLinecap="round"
                strokeWidth="2.8"
                vectorEffect="non-scaling-stroke"
              />
            </svg>

            {chartPoints.map((point, idx) => {
              const isActive = idx === activeIndex;

              return (
                <span
                  key={`${years[idx]?.year ?? idx}-${point.x}`}
                  className={`absolute rounded-full border shadow-[0_0_22px_rgba(232,121,249,0.62)] ${
                    isActive
                      ? "h-4 w-4 border-fuchsia-100 bg-white ring-4 ring-fuchsia-400/30"
                      : "projection-chart-point h-2.5 w-2.5 border-white/70 bg-fuchsia-300"
                  }`}
                  style={{
                    left: `${point.x}%`,
                    top: `${point.y}%`,
                    transform: "translate(-50%, -50%)",
                    animationDelay: `${idx * 70}ms`,
                  }}
                />
              );
            })}
          </div>
        ) : null}

        <div className="relative z-10 flex items-end gap-3 pt-11">
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
                className="group relative z-10 flex min-w-[64px] flex-col items-center gap-1"
                onClick={() => onSelect(y.year)}
                aria-pressed={isActive}
                title={`Rok ${idx + 1}`}
              >
                <div
                  className={`projection-readable text-[10px] font-black drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] transition ${
                    isActive ? "!text-white" : "!text-white"
                  }`}
                >
                  {formatMoney(y.total)}
                </div>

                <div className="relative flex h-[174px] w-[46px] items-end justify-center">
                  <div
                    className={`projection-bar w-full rounded-t-[8px] rounded-b-[4px] border transition-all duration-300 ${
                      isActive ? activeBarClass : idleBarClass
                    } ${isActive ? activeRingClass : ""}`}
                    style={{
                      height: `${h}px`,
                      opacity: isActive ? 1 : 0.72,
                      animationDelay: `${idx * 40}ms`,
                    }}
                  />
                </div>

                <div
                  className={`projection-readable text-[11px] font-black transition ${
                    isActive ? "!text-white" : "!text-white"
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
            box: "border-fuchsia-300/60 bg-fuchsia-400 text-black",
            icon: <TrendingUp className="h-3.5 w-3.5" />,
            text:
              hasPrev && (prevAmount ?? 0) > 0
                ? `+${percentFormatter.format((diff / (prevAmount ?? 1)) * 100)} %`
                : "+",
          },
          down: {
            box: "border-white/40 bg-white/20 text-white",
            icon: <TrendingDown className="h-3.5 w-3.5" />,
            text:
              hasPrev && (prevAmount ?? 0) > 0
                ? `${percentFormatter.format((diff / (prevAmount ?? 1)) * 100)} %`
                : "-",
          },
          flat: {
            box: "border-white/45 bg-black/50 !text-white shadow-[0_10px_26px_rgba(0,0,0,0.28)]",
            icon: <Minus className="h-3.5 w-3.5" />,
            text: hasPrev ? "Beze změny" : "Start roku",
          },
        };

        return (
          <article
            key={`${MONTH_LABELS[idx]}-${idx}`}
            className="relative overflow-hidden rounded-[22px] border border-white/20 bg-[linear-gradient(150deg,rgba(255,255,255,0.08)_0%,rgba(12,3,20,0.94)_70%)] px-4 py-3 shadow-[0_18px_40px_rgba(0,0,0,0.34)] transition duration-300 hover:-translate-y-1 hover:border-fuchsia-300/60 hover:shadow-[0_24px_56px_rgba(217,70,239,0.16)]"
          >
            <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-fuchsia-300/80 to-transparent" />
            <div className="flex items-start justify-between gap-2">
              <div className="projection-readable">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] !text-white">
                  {quarterLabel}
                </p>
                <p className="text-xl font-black !text-white">{MONTH_LABELS[idx]}</p>
              </div>
              <div
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-black ${trendMeta[trend].box}`}
                title="Změna oproti předchozímu měsíci"
              >
                {trendMeta[trend].icon}
                <span className={trend === "flat" ? "!text-white" : ""}>
                  {trendMeta[trend].text}
                </span>
              </div>
            </div>

            <div className="projection-readable mt-3 flex items-end justify-between gap-2">
              <p className="text-[30px] font-black leading-none !text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.72)]">{formatMoney(amount)}</p>
            </div>

            <div className="mt-3">
              <div className="h-2 overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-fuchsia-700 via-fuchsia-400 to-white transition-all"
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
  icon,
  tone = "neutral",
}: {
  title: string;
  subtitle: string;
  value: string;
  onChange: (v: string) => void;
  extra?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "life" | "auto" | "property" | "neutral";
}) {
  const toneStyles: Record<
    "life" | "auto" | "property" | "neutral",
    { panel: string; accent: string; icon: string }
  > = {
    life: {
      panel:
        "border-fuchsia-300/25 bg-[linear-gradient(155deg,rgba(255,255,255,0.10)_0%,rgba(0,0,0,0.78)_72%)]",
      accent: "bg-gradient-to-r from-transparent via-fuchsia-300 to-transparent",
      icon: "bg-fuchsia-400 text-black",
    },
    auto: {
      panel:
        "border-white/10 bg-[linear-gradient(155deg,rgba(255,255,255,0.12)_0%,rgba(20,6,30,0.82)_72%)]",
      accent: "bg-gradient-to-r from-transparent via-white to-transparent",
      icon: "bg-white text-black",
    },
    property: {
      panel:
        "border-fuchsia-200/20 bg-[linear-gradient(155deg,rgba(217,70,239,0.18)_0%,rgba(0,0,0,0.80)_74%)]",
      accent: "bg-gradient-to-r from-transparent via-fuchsia-500 to-transparent",
      icon: "bg-black text-fuchsia-200 ring-1 ring-fuchsia-300/30",
    },
    neutral: {
      panel: "border-white/10 bg-black/80",
      accent: "bg-gradient-to-r from-transparent via-white to-transparent",
      icon: "bg-white text-black",
    },
  };
  const toneStyle = toneStyles[tone];

  return (
    <section
      className={`relative overflow-hidden rounded-[28px] border px-5 py-5 shadow-[0_24px_70px_rgba(0,0,0,0.35)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_30px_90px_rgba(217,70,239,0.16)] space-y-4 ${toneStyle.panel}`}
    >
      <span className={`absolute inset-x-0 top-0 h-px ${toneStyle.accent}`} aria-hidden />
      <div className="flex items-start justify-between gap-3">
        <div className="projection-readable">
          <h2 className="text-xl font-black !text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.72)]">{title}</h2>
          <p className="text-xs font-semibold !text-white">{subtitle}</p>
        </div>
        {icon ? (
          <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${toneStyle.icon}`}>
            {icon}
          </span>
        ) : null}
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
