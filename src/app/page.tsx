// src/app/page.tsx
"use client";

import { useEffect, useMemo, useState, type DragEvent, type ReactElement } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";

import { auth, db } from "./firebase";
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
  setDoc,
  updateDoc,
  query,
  where,
} from "firebase/firestore";

import { AppLayout } from "@/components/AppLayout";
import { AutoAnniversaryModal } from "@/components/AutoAnniversaryModal";
import {
  type CommissionResultItemDTO,
  type Position,
  type Product,
  type PaymentFrequency,
  type CommissionMode,
} from "./types/domain";
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
  calculateCppPPRbez,
  calculateCppPPRs,
  calculateZamex,
  calculateCppCestovko,
  calculateAxaCestovko,
  calculateComfortCC,
} from "./lib/productFormulas";

// ---------- helpers ----------

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

function entrySignedDate(entry: { contractSignedDate?: any; createdAt?: any }): Date | null {
  return toDate(entry.contractSignedDate) ?? toDate(entry.createdAt) ?? null;
}

function formatMoney(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value)) return "0 Kč";
  return (
    value.toLocaleString("cs-CZ", {
      maximumFractionDigits: 0,
    }) + " Kč"
  );
}

function isManagerPosition(pos?: Position | null): boolean {
  if (!pos) return false;
  return pos.startsWith("manazer");
}

function normalizeToMonthly(amount: number, frequency?: PaymentFrequency | null): number {
  switch (frequency) {
    case "monthly":
      return amount;
    case "quarterly":
      return amount / 3;
    case "semiannual":
      return amount / 6;
    case "annual":
    default:
      return amount / 12;
  }
}

function normalizeToAnnual(amount: number, frequency?: PaymentFrequency | null): number {
  switch (frequency) {
    case "monthly":
      return amount * 12;
    case "quarterly":
      return amount * 4;
    case "semiannual":
      return amount * 2;
    case "annual":
    default:
      return amount;
  }
}

function commissionItemsForPosition(
  entry: EntryDoc,
  pos: Position,
  modeOverride?: CommissionMode | null
): CommissionResultItemDTO[] {
  const product = entry.productKey;
  const amount = entry.inputAmount ?? 0;
  const freq = (entry.frequencyRaw ?? "annual") as PaymentFrequency;
  const duration =
    typeof entry.durationYears === "number" && !Number.isNaN(entry.durationYears)
      ? entry.durationYears
      : 15;
  const mode = (modeOverride ?? entry.commissionMode ?? "accelerated") as CommissionMode;

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
    case "cppPPRs":
      return calculateCppPPRs(amount, freq, pos).items;
    case "cppPPRbez":
      return calculateCppPPRbez(amount, freq, pos).items;
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
    case "comfortcc":
      return calculateComfortCC({
        fee: amount,
        payment: entry.comfortPayment ?? 0,
        isSavings: !!entry.comfortGradual,
        isGradualFee: !!entry.comfortGradual,
        position: pos,
      }).items;
    default:
      return [];
  }
}

function nameFromEmail(email: string | null | undefined): string {
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

// ---------- typy ----------

type EntryDoc = {
  id: string;
  userEmail?: string | null;
  createdAt?: any;
  contractSignedDate?: any;
  items?: CommissionResultItemDTO[];

  productKey?: Product;
  inputAmount?: number | null;
  frequencyRaw?: PaymentFrequency | null;
  durationYears?: number | null;
  commissionMode?: CommissionMode | null;
  position?: Position | null;
  comfortPayment?: number | null;
  comfortGradual?: boolean | null;
};

type UserMeta = {
  position?: Position;
  commissionMode?: CommissionMode | null;
  monthlyGoal?: number | null;
  managerEmail?: string | null;
};

type LeaderboardProductFilter = "life" | "other";
type LeaderboardRange = "month" | "sixMonths" | "year";

type TeamLeaderboardEntry = {
  email: string;
  name: string;
  totalPremium: number;
};

// ---------- animace čísel ----------

function useAnimatedNumber(target: number, duration = 800): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    let frame: number;
    let start: number | null = null;
    const initial = value;
    const diff = target - initial;

    if (diff === 0) return;

    const step = (timestamp: number) => {
      if (start === null) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      const current = initial + diff * eased;
      setValue(Math.round(current));
      if (progress < 1) {
        frame = requestAnimationFrame(step);
      }
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return value;
}

function AnimatedNumber({
  value,
  duration = 800,
}: {
  value: number;
  duration?: number;
}) {
  const animated = useAnimatedNumber(value, duration);
  return (
    <span>
      {animated.toLocaleString("cs-CZ", {
        maximumFractionDigits: 0,
      })}
    </span>
  );
}

function AnimatedMoney({
  value,
  duration = 800,
}: {
  value: number;
  duration?: number;
}) {
  const animated = useAnimatedNumber(value, duration);
  return <span>{formatMoney(animated)}</span>;
}

function SplitTextHeading({ text }: { text: string }) {
  const words = text.split(" ").filter(Boolean);
  return (
    <div className="text-5xl sm:text-6xl font-extrabold tracking-tight text-white leading-tight flex flex-wrap">
      <style jsx>{`
        @keyframes splitRise {
          0% {
            opacity: 0;
            transform: translateY(110%) skewY(6deg);
            filter: blur(6px);
          }
          60% {
            opacity: 1;
            transform: translateY(-6%) skewY(0deg);
            filter: blur(0);
          }
          100% {
            opacity: 1;
            transform: translateY(0) skewY(0deg);
            filter: blur(0);
          }
        }
      `}</style>
      {words.map((word, idx) => (
        <span
          key={`${word}-${idx}`}
          className="relative flex overflow-hidden mr-3 last:mr-0 gap-[2px]"
        >
          {Array.from(word).map((char, charIdx) => (
            <span
              key={`${word}-${idx}-${char}-${charIdx}`}
              className="inline-block text-white drop-shadow-[0_14px_34px_rgba(0,0,0,0.6)]"
              style={{
                animation:
                  "splitRise 900ms cubic-bezier(0.22, 1, 0.36, 1) forwards",
                animationDelay: `${(idx * 8 + charIdx) * 38}ms`,
                transform: "translateY(120%) skewY(8deg)",
                opacity: 0,
              }}
            >
              {char}
            </span>
          ))}
        </span>
      ))}
    </div>
  );
}

type PersonalSeriesPoint = {
  label: string;
  lifeMonthly: number;
  otherAnnual: number;
  totalCombined: number;
};

type ChartMode = "personal" | "team" | "combined" | "specific";

type HomeWidgets = {
  productionSummary: boolean;
  monthlyGoal: boolean;
  teamLeaderboard: boolean;
  productionChart: boolean;
  goldWidget: boolean;
};

type HomeSection = "gold" | "summary" | "goal" | "leaderboard" | "chart";
type LayoutScope = "cloud" | "device";
type PerformanceMode = "default" | "lite";

const HOME_WIDGETS_DEFAULT: HomeWidgets = {
  productionSummary: true,
  monthlyGoal: true,
  teamLeaderboard: true,
  productionChart: true,
  goldWidget: false,
};

const homeWidgetsKey = (email?: string | null) =>
  email ? `home.widgets:${email.toLowerCase()}` : null;
const homeLayoutKey = (email?: string | null) =>
  email ? `home.layout:${email.toLowerCase()}` : null;
const homeScopeKey = (email?: string | null) =>
  email ? `home.scope:${email.toLowerCase()}` : null;
const homePerformanceKey = (email?: string | null) =>
  email ? `home.performance:${email.toLowerCase()}` : null;

const HOME_LAYOUT_DEFAULT: HomeSection[] = [
  "gold",
  "summary",
  "goal",
  "leaderboard",
  "chart",
];
const PERFORMANCE_DEFAULT: PerformanceMode = "default";

const readLocalHomeWidgets = (email?: string | null): HomeWidgets | null => {
  if (typeof window === "undefined") return null;
  const key = homeWidgetsKey(email ?? null);
  if (!key) return null;
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<HomeWidgets>;
    return { ...HOME_WIDGETS_DEFAULT, ...parsed };
  } catch {
    return null;
  }
};

const readLocalHomeLayout = (email?: string | null): HomeSection[] | null => {
  if (typeof window === "undefined") return null;
  const key = homeLayoutKey(email ?? null);
  if (!key) return null;
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as HomeSection[];
    return Array.isArray(parsed) && parsed.length > 0 ? (parsed as HomeSection[]) : null;
  } catch {
    return null;
  }
};

const readLocalPerformanceMode = (email?: string | null): PerformanceMode | null => {
  if (typeof window === "undefined") return null;
  const key = homePerformanceKey(email ?? null);
  if (!key) return null;
  const raw = window.localStorage.getItem(key);
  if (raw === "default" || raw === "lite") return raw;
  return null;
};

function PersonalProductionChart({ data }: { data: PersonalSeriesPoint[] }) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const plotWidth = Math.min(560, Math.max(320, data.length * 42));
  const plotHeight = 180;
  const paddingX = 28;
  const paddingY = 24;
  const viewWidth = plotWidth + paddingX * 2;
  const viewHeight = plotHeight + paddingY * 2 + 26;
  const step = data.length > 1 ? plotWidth / (data.length - 1) : plotWidth;
  const maxValue = Math.max(...data.map((d) => d.totalCombined), 1);
  const hasData = data.some((d) => d.totalCombined > 0);

  const yFor = (value: number) =>
    paddingY + plotHeight - (Math.min(maxValue, value) / maxValue) * plotHeight;

  const points = data.map((d, i) => ({
    x: paddingX + step * i,
    y: yFor(d.totalCombined),
  }));

  const totalPath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");

  const areaPath =
    points.length > 1
      ? [
          `M${points[0].x.toFixed(1)},${paddingY + plotHeight}`,
          ...points.map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`),
          `L${points[points.length - 1].x.toFixed(1)},${paddingY + plotHeight}`,
          "Z",
        ].join(" ")
      : "";

  const latest = data[data.length - 1] ?? { lifeMonthly: 0, otherAnnual: 0, totalCombined: 0 };
  const selected =
    selectedIdx != null && selectedIdx >= 0 && selectedIdx < data.length
      ? data[selectedIdx]
      : null;
  const tooltipX = selectedIdx != null ? paddingX + step * selectedIdx : 0;
  const tooltipY =
    selected != null
      ? yFor(selected.totalCombined)
      : 0;
  const tooltipWidth = 220;
  const tooltipHeight = 74;
  const tooltipXClamped = Math.max(
    8,
    Math.min(tooltipX - tooltipWidth / 2, viewWidth - tooltipWidth - 8)
  );
  const tooltipYClamped = Math.max(
    8,
    Math.min(tooltipY - tooltipHeight - 12, viewHeight - tooltipHeight - 8)
  );

  return (
    <div className="rounded-3xl border border-white/12 bg-slate-900/75 backdrop-blur-2xl p-5 sm:p-6 shadow-[0_22px_80px_rgba(0,0,0,0.85)]">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold text-white">
            Graf produkce — posledních 12 měsíců
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-200">
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-cyan-300" />
            <span className="font-semibold text-white">{formatMoney(latest.totalCombined)}</span>
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-0 w-full max-w-full">
          <svg
            viewBox={`0 0 ${viewWidth} ${viewHeight}`}
            role="img"
            aria-label="Graf osobní produkce za 12 měsíců"
            className="w-full"
          >
            <defs>
              <linearGradient id="totalLine" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.4" />
              </linearGradient>
              <linearGradient id="areaFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="rgba(103,232,249,0.25)" />
                <stop offset="100%" stopColor="rgba(34,211,238,0.03)" />
              </linearGradient>
              <filter id="tooltipShadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="6" stdDeviation="10" floodColor="rgba(0,0,0,0.35)" />
              </filter>
            </defs>

            <g>
              {points.map((p, i) => {
                return (
                  <line
                    key={`grid-${i}`}
                    x1={p.x}
                    x2={p.x}
                    y1={paddingY}
                    y2={paddingY + plotHeight}
                    stroke="rgba(255,255,255,0.06)"
                    strokeWidth={1}
                  />
                );
              })}
            </g>

            {/* horizontální grid */}
            {[0.25, 0.5, 0.75, 1].map((ratio, idx) => {
              const y = paddingY + plotHeight * ratio;
              const value = maxValue * (1 - ratio);
              return (
                <g key={`hgrid-${idx}`}>
                  <line
                    x1={paddingX}
                    x2={paddingX + plotWidth}
                    y1={y}
                    y2={y}
                    stroke="rgba(255,255,255,0.05)"
                    strokeWidth={1}
                    strokeDasharray="4 6"
                  />
                  <text
                    x={paddingX + plotWidth + 8}
                    y={y + 4}
                    fontSize="10"
                    fill="rgba(148,163,184,0.75)"
                  >
                    {formatMoney(Math.round(value))}
                  </text>
                </g>
              );
            })}

            {hasData && areaPath && (
              <path d={areaPath} fill="url(#areaFill)" stroke="none" />
            )}

            <path
              d={totalPath}
              fill="none"
              stroke="url(#totalLine)"
              strokeWidth={4}
              strokeLinecap="round"
            />

            {points.map((p, i) => {
              const d = data[i];
              const { x, y: yTotal } = p;
              return (
                <g
                  key={`pt-${i}`}
                  className="cursor-pointer"
                  onClick={() => setSelectedIdx(i)}
                  onMouseEnter={() => setSelectedIdx(i)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") setSelectedIdx(i);
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <circle cx={x} cy={yTotal} r={12} fill="transparent" />
                  <circle
                    cx={x}
                    cy={yTotal}
                    r={4}
                    fill="#67e8f9"
                    stroke={selectedIdx === i ? "#a5f3fc" : "#0ea5e9"}
                    strokeWidth={1.5}
                  />
                  {selectedIdx === i && (
                    <circle
                      cx={x}
                      cy={yTotal}
                      r={7.5}
                      fill="none"
                      stroke="rgba(103,232,249,0.4)"
                      strokeWidth={2}
                    />
                  )}
                  <text
                    x={x}
                    y={paddingY + plotHeight + 18}
                    textAnchor="middle"
                    fontSize="11"
                    fill="rgba(226,232,240,0.8)"
                  >
                    {d.label}
                  </text>
                </g>
              );
            })}

            {selected && (
              <g transform={`translate(${tooltipXClamped}, ${tooltipYClamped})`}>
                <rect
                  x={0}
                  y={0}
                  width={tooltipWidth}
                  height={tooltipHeight}
                  rx={10}
                  ry={10}
                  fill="rgba(15,23,42,0.9)"
                  stroke="rgba(148,163,184,0.4)"
                  strokeWidth={1}
                  filter="url(#tooltipShadow)"
                />
                <text
                  x={12}
                  y={18}
                  fontSize="11"
                  fill="rgba(226,232,240,0.9)"
                >
                  {selected.label}
                </text>
                <text
                  x={12}
                  y={36}
                  fontSize="12"
                  fill="#67e8f9"
                  fontWeight={600}
                >
                  Celkem: {formatMoney(selected.totalCombined)}
                </text>
                <text
                  x={12}
                  y={52}
                  fontSize="12"
                  fill="#6ee7b7"
                  fontWeight={600}
                >
                  Život: {formatMoney(selected.lifeMonthly)}
                </text>
                <text
                  x={12}
                  y={68}
                  fontSize="12"
                  fill="#a5f3fc"
                  fontWeight={600}
                >
                  Vedlejší: {formatMoney(selected.otherAnnual)}
                </text>
              </g>
            )}
          </svg>
        </div>
      </div>

      {!hasData && (
        <p className="mt-3 text-xs text-slate-300">
          Zatím žádná osobní produkce v posledních 12 měsících – jakmile přibydou
          smlouvy, graf se vyplní.
        </p>
      )}
    </div>
  );
}


// ---------- komponenta ----------

export default function HomePage() {
  const router = useRouter();

  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userMeta, setUserMeta] = useState<UserMeta | null>(null);

  const [myContractsCount, setMyContractsCount] = useState(0);
  const [myImmediateSum, setMyImmediateSum] = useState(0);
  const [myEntries, setMyEntries] = useState<EntryDoc[]>([]);

  const [teamContractsCount, setTeamContractsCount] = useState(0);
  const [teamImmediateSum, setTeamImmediateSum] = useState(0);

  const [teamEntries, setTeamEntries] = useState<EntryDoc[]>([]);
  const [hasTeam, setHasTeam] = useState(false);

  const [lbProductFilter, setLbProductFilter] =
    useState<LeaderboardProductFilter>("life");
  const [lbRange, setLbRange] = useState<LeaderboardRange>("month");
  const [chartMode, setChartMode] = useState<ChartMode>("personal");
  const [selectedSubordinate, setSelectedSubordinate] = useState<string | null>(null);
  const [homeWidgets, setHomeWidgets] = useState<HomeWidgets>(HOME_WIDGETS_DEFAULT);
  const [widgetPanelOpen, setWidgetPanelOpen] = useState(false);
  const [homeLayout, setHomeLayout] = useState<HomeSection[]>(HOME_LAYOUT_DEFAULT);
  const [draggingSection, setDraggingSection] = useState<HomeSection | null>(null);
  const [hoverSection, setHoverSection] = useState<HomeSection | null>(null);
  const [layoutScope, setLayoutScope] = useState<LayoutScope>("cloud");
  const [performanceMode, setPerformanceMode] = useState<PerformanceMode>(PERFORMANCE_DEFAULT);
  const [goldLoading, setGoldLoading] = useState(false);
  const [goldError, setGoldError] = useState<string | null>(null);
  const [goldReloadKey, setGoldReloadKey] = useState(0);
  const [goldData, setGoldData] = useState<{
    czkPerOz: number;
    ts: number;
    changePct: number | null;
  } | null>(null);
  const [subPickerOpen, setSubPickerOpen] = useState(false);
  const [subSearch, setSubSearch] = useState("");
  const [editGoalOpen, setEditGoalOpen] = useState(false);
  const [goalInput, setGoalInput] = useState("");
  const [savingGoal, setSavingGoal] = useState(false);
  const [goalError, setGoalError] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const normalizedEmail = useMemo(
    () => user?.email?.toLowerCase() ?? null,
    [user?.email]
  );

  const now = new Date();
  const monthLabel = MONTH_LABELS[now.getMonth()];
  const monthLabelCapitalized =
    monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);
  const year = now.getFullYear();

  // auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      if (!fbUser) {
        setUser(null);
        router.push("/login");
        return;
      }
      setUser(fbUser);
      setAuthReady(true);
    });

    return () => unsub();
  }, [router]);

  const persistHomeWidgets = (updater: (prev: HomeWidgets) => HomeWidgets) => {
    setHomeWidgets((prev) => {
      const next = updater(prev);
      const key = homeWidgetsKey(normalizedEmail);
      if (typeof window !== "undefined" && key) {
        window.localStorage.setItem(key, JSON.stringify(next));
      }
      if (layoutScope === "cloud") {
        void pushHomeSettingsToCloud({ homeWidgets: next });
      }
      return next;
    });
  };

  const persistHomeLayout = (next: HomeSection[]) => {
    setHomeLayout(next);
    const key = homeLayoutKey(normalizedEmail);
    if (typeof window !== "undefined" && key) {
      window.localStorage.setItem(key, JSON.stringify(next));
    }
    if (layoutScope === "cloud") {
      void pushHomeSettingsToCloud({ homeLayout: next });
    }
  };

  const handleWidgetToggle = (key: keyof HomeWidgets) => {
    persistHomeWidgets((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const updatePerformanceMode = (mode: PerformanceMode) => {
    setPerformanceMode(mode);
    const key = homePerformanceKey(user?.email ?? null);
    if (typeof window !== "undefined" && key) {
      window.localStorage.setItem(key, mode);
    }
    if (layoutScope === "cloud") {
      void pushHomeSettingsToCloud({ homePerformanceMode: mode });
    }
  };

  const handleScopeToggle = async () => {
    if (!user?.email) return;
    const nextScope: LayoutScope = layoutScope === "cloud" ? "device" : "cloud";
    if (nextScope === "cloud") {
      await pushHomeSettingsToCloud({ homeLayout, homeWidgets, homePerformanceMode: performanceMode });
    }
    setLayoutScope(nextScope);
    rememberScopePreference(nextScope);
  };

  const refreshGoldWidget = () => {
    setGoldReloadKey((k) => k + 1);
  };

  // nastavení režimu ukládání (cloud vs device)
  useEffect(() => {
    if (!normalizedEmail) {
      setLayoutScope("cloud");
      return;
    }
    if (typeof window === "undefined") return;
    const scopeKey = homeScopeKey(normalizedEmail);
    if (!scopeKey) return;
    const stored = window.localStorage.getItem(scopeKey);
    if (stored === "device" || stored === "cloud") {
      setLayoutScope(stored);
    } else {
      setLayoutScope("cloud");
    }
  }, [normalizedEmail]);

  // načtení uživatelského rozložení domova (cloud nebo device)
  useEffect(() => {
    if (!normalizedEmail) return;
    const email = normalizedEmail;

    const loadFromDevice = () => {
      const localLayout = readLocalHomeLayout(email);
      const localWidgets = readLocalHomeWidgets(email);
      const localPerf = readLocalPerformanceMode(email);
      setHomeLayout(localLayout ?? HOME_LAYOUT_DEFAULT);
      setHomeWidgets(localWidgets ?? HOME_WIDGETS_DEFAULT);
      setPerformanceMode(localPerf ?? PERFORMANCE_DEFAULT);
    };

    const load = async () => {
      if (layoutScope === "device") {
        loadFromDevice();
        return;
      }

      try {
        const snap = await getDoc(doc(db, "users", email));
        const data = snap.data() as any | undefined;

        const cloudLayout = (data?.homeLayout as HomeSection[] | undefined) ?? null;
        const cloudWidgets = (data?.homeWidgets as Partial<HomeWidgets> | undefined) ?? null;
        const cloudPerf = (data?.homePerformanceMode as PerformanceMode | undefined) ?? null;

        if (cloudLayout && Array.isArray(cloudLayout) && cloudLayout.length > 0) {
          setHomeLayout(cloudLayout as HomeSection[]);
          const key = homeLayoutKey(email);
          if (typeof window !== "undefined" && key) {
            window.localStorage.setItem(key, JSON.stringify(cloudLayout));
          }
        } else {
          const localLayout = readLocalHomeLayout(email);
          if (localLayout) {
            setHomeLayout(localLayout);
          } else {
            setHomeLayout(HOME_LAYOUT_DEFAULT);
          }
        }

        if (cloudWidgets) {
          const merged = { ...HOME_WIDGETS_DEFAULT, ...cloudWidgets };
          setHomeWidgets(merged);
          const key = homeWidgetsKey(email);
          if (typeof window !== "undefined" && key) {
            window.localStorage.setItem(key, JSON.stringify(merged));
          }
        } else {
          const localWidgets = readLocalHomeWidgets(email);
          setHomeWidgets(localWidgets ?? HOME_WIDGETS_DEFAULT);
        }

        if (cloudPerf) {
          setPerformanceMode(cloudPerf);
          const key = homePerformanceKey(email);
          if (typeof window !== "undefined" && key) {
            window.localStorage.setItem(key, cloudPerf);
          }
        } else {
          const localPerf = readLocalPerformanceMode(email);
          setPerformanceMode(localPerf ?? PERFORMANCE_DEFAULT);
        }
      } catch (e) {
        console.error("Načtení nastavení domova selhalo", e);
        loadFromDevice();
      }
    };

    load();
  }, [normalizedEmail, layoutScope]);

  const rememberScopePreference = (scope: LayoutScope) => {
    if (typeof window === "undefined") return;
    const key = homeScopeKey(normalizedEmail);
    if (!key) return;
    window.localStorage.setItem(key, scope);
  };

  const pushHomeSettingsToCloud = async (payload: {
    homeLayout?: HomeSection[];
    homeWidgets?: HomeWidgets;
    homePerformanceMode?: PerformanceMode;
  }) => {
    if (!normalizedEmail) return;
    try {
      await setDoc(doc(db, "users", normalizedEmail), payload, { merge: true });
    } catch (e) {
      console.error("Uložení nastavení domova selhalo", e);
    }
  };

  // načtení statistik
  useEffect(() => {
    if (!normalizedEmail) return;

    const load = async () => {
      setLoading(true);

      try {
        const email = normalizedEmail;
        const usersRef = collection(db, "users");
        const needPersonalHistory = homeWidgets.productionChart;

        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        // 1) meta o uživateli
        const meSnap = await getDoc(doc(usersRef, email));
        let position: Position | undefined;
        let monthlyGoal: number | null | undefined;
        let myMode: CommissionMode | null = null;
        if (meSnap.exists()) {
          const d = meSnap.data() as any;
          position = d.position as Position | undefined;
          monthlyGoal = (d.monthlyGoal as number | undefined) ?? null;
          myMode = (d.commissionMode as CommissionMode | undefined) ?? null;
        }

        setUserMeta({
          position,
          commissionMode: myMode,
          monthlyGoal: monthlyGoal ?? null,
        });

        const isManager = isManagerPosition(position);
        const managerMode = (myMode as CommissionMode | null) ?? null;

        // 2) moje smlouvy (collectionGroup + fallback na vlastní podkolekci)
        const myEntriesList: EntryDoc[] = [];
        const seenPersonal = new Set<string>();

        const myGroupSnap = await getDocs(
          query(collectionGroup(db, "entries"), where("userEmail", "==", email))
        );
        myGroupSnap.forEach((docSnap) => {
          const key = docSnap.id;
          if (seenPersonal.has(key)) return;
          seenPersonal.add(key);
          const data = docSnap.data() as any as EntryDoc;
          myEntriesList.push({
            ...data,
            id: docSnap.id,
          });
        });

        // fallback: entries pod cestou /users/<email>/entries (pro starší záznamy bez userEmail)
        const myPathSnap = await getDocs(collection(db, "users", email, "entries"));
        myPathSnap.forEach((docSnap) => {
          const key = docSnap.id;
          if (seenPersonal.has(key)) return;
          seenPersonal.add(key);
          const data = docSnap.data() as any as EntryDoc;
          myEntriesList.push({
            ...data,
            id: docSnap.id,
          });
        });

        let myCount = 0;
        let myImmediate = 0;

        myEntriesList.forEach((data) => {
          const signed = entrySignedDate(data);
          if (!signed) return;
          if (
            signed.getFullYear() !== currentYear ||
            signed.getMonth() !== currentMonth
          ) {
            return;
          }

          myCount += 1;

          const items = (data.items ?? []) as CommissionResultItemDTO[];
          const immediate = items.find((it) =>
            (it.title ?? "").toLowerCase().includes("okamžitá provize")
          );
          const immediateAmount = immediate?.amount ?? 0;
          myImmediate += immediateAmount;
        });

        setMyContractsCount(myCount);
        setMyImmediateSum(myImmediate);
        setMyEntries(needPersonalHistory ? myEntriesList : []);

        // Načíst všechny uživatele a postavit strom case-insensitive (managerEmail může být uložen s velkými písmeny)
        const allUsersSnap = await getDocs(usersRef);
        type UserNode = { email: string; managerEmail: string | null; position?: Position };
        const allUsers: UserNode[] = [];
        allUsersSnap.forEach((d) => {
          const data = d.data() as any;
          const em = ((data.email as string | undefined) ?? d.id ?? "").toLowerCase();
          if (!em) return;
          const mgr = (data.managerEmail as string | undefined)?.toLowerCase() ?? null;
          allUsers.push({
            email: em,
            managerEmail: mgr,
            position: (data.position as Position | undefined) ?? undefined,
          });
        });

        const childrenByManager = new Map<string, UserNode[]>();
        for (const u of allUsers) {
          if (!u.managerEmail) continue;
          const arr = childrenByManager.get(u.managerEmail) ?? [];
          arr.push(u);
          childrenByManager.set(u.managerEmail, arr);
        }

        // BFS pro celý strom podřízených (ignoruje velikost písmen)
        const visited = new Set<string>();
        const subPositionMap = new Map<string, Position | undefined>();
        const managerOf = new Map<string, string | null>();
        const queue: string[] = [];
        queue.push(email);

        while (queue.length > 0) {
          const currentManager = queue.shift()!;
          const children = childrenByManager.get(currentManager) ?? [];
          for (const child of children) {
            if (!child.email || visited.has(child.email)) continue;
            visited.add(child.email);
            queue.push(child.email);
            subPositionMap.set(child.email, child.position);
            managerOf.set(child.email, currentManager);
          }
        }

        const subEmails = Array.from(visited);

        setHasTeam(subEmails.length > 0);

        if (subEmails.length === 0) {
          setTeamContractsCount(0);
          setTeamImmediateSum(0);
          setTeamEntries([]);
          setLoading(false);
          return;
        }

        const needTeamHistory = homeWidgets.productionChart || homeWidgets.teamLeaderboard;

        let teamCount = 0;
        let teamImmediate = 0;
        const teamEntriesAll: EntryDoc[] = [];
        const seenTeam = new Set<string>();

        const chunks: string[][] = [];
        for (let i = 0; i < subEmails.length; i += 10) {
          chunks.push(subEmails.slice(i, i + 10));
        }

        for (const chunk of chunks) {
          const teamQ = query(
            collectionGroup(db, "entries"),
            where("userEmail", "in", chunk)
          );

          const teamSnap = await getDocs(teamQ);

          teamSnap.forEach((docSnap) => {
            const data = docSnap.data() as any as EntryDoc;
            const ownerEmail = (data.userEmail ?? "").toLowerCase();
            const key = `${ownerEmail}___${docSnap.id}`;
            if (seenTeam.has(key)) return;
            seenTeam.add(key);

            // pro leaderboard ukládáme všechny záznamy
            if (needTeamHistory) {
              teamEntriesAll.push({
                ...(data as any),
                id: docSnap.id,
              } as EntryDoc);
            }

            // pro horní "Týmovou produkci" počítáme jen aktuální měsíc
            const signed = entrySignedDate(data);
            if (!signed) return;
            if (
              signed.getFullYear() !== currentYear ||
              signed.getMonth() !== currentMonth
            ) {
              return;
            }

            teamCount += 1;

            const items = (data.items ?? []) as CommissionResultItemDTO[];
            const immediate = items.find((it) =>
              (it.title ?? "").toLowerCase().includes("okamžitá provize")
            );
            const baseImmediate = immediate?.amount ?? 0;

            const mgrPos = position;
            const subPos =
              subPositionMap.get(ownerEmail) ??
              (data.position as Position | undefined) ??
              null;
            const ownerManagerEmail = managerOf.get(ownerEmail) ?? null;
            const ownerManagerPos = ownerManagerEmail
              ? subPositionMap.get(ownerManagerEmail) ?? null
              : null;
            const comparePos = ownerManagerPos ?? subPos;
            if (mgrPos && subPos) {
              const mgrImmediate =
                commissionItemsForPosition(
                  data,
                  mgrPos,
                  managerMode
                ).find((i) =>
                  (i.title ?? "").toLowerCase().includes("okamžitá")
                )?.amount ?? baseImmediate;
              const subImmediate =
                commissionItemsForPosition(
                  data,
                  comparePos ?? subPos,
                  managerMode
                ).find((i) =>
                  (i.title ?? "").toLowerCase().includes("okamžitá")
                )?.amount ?? baseImmediate;
              const diff = Math.max(0, mgrImmediate - subImmediate);
              teamImmediate += diff;
            } else {
              teamImmediate += baseImmediate;
            }
          });
        }

        // fallback: projít přímo podkolekce podřízených (kdyby chyběl userEmail nebo měl jiný case)
        for (const sub of subEmails) {
          const snap = await getDocs(collection(db, "users", sub, "entries"));
          snap.forEach((docSnap) => {
            const data = docSnap.data() as any as EntryDoc;
            const ownerEmail = sub.toLowerCase();
            const key = `${ownerEmail}___${docSnap.id}`;
            if (seenTeam.has(key)) return;

            const signed = entrySignedDate(data);
            if (!signed) return;
            if (
              signed.getFullYear() !== currentYear ||
              signed.getMonth() !== currentMonth
            ) {
              return;
            }

            seenTeam.add(key);
            teamCount += 1;

            const items = (data.items ?? []) as CommissionResultItemDTO[];
            const immediate = items.find((it) =>
              (it.title ?? "").toLowerCase().includes("okamžitá provize")
            );
            const baseImmediate = immediate?.amount ?? 0;

            const subPos =
              subPositionMap.get(ownerEmail) ??
              (data.position as Position | undefined) ??
              null;
            const ownerManagerEmail = managerOf.get(ownerEmail) ?? null;
            const ownerManagerPos = ownerManagerEmail
              ? subPositionMap.get(ownerManagerEmail) ?? null
              : null;
            const comparePos = ownerManagerPos ?? subPos;
            if (position && subPos) {
              const mgrImmediate =
                commissionItemsForPosition(
                  data,
                  position,
                  managerMode
                ).find((i) =>
                  (i.title ?? "").toLowerCase().includes("okamžitá")
                )?.amount ?? baseImmediate;
              const subImmediate =
                commissionItemsForPosition(
                  data,
                  comparePos ?? subPos,
                  managerMode
                ).find((i) =>
                  (i.title ?? "").toLowerCase().includes("okamžitá")
                )?.amount ?? baseImmediate;
              const diff = Math.max(0, mgrImmediate - subImmediate);
              teamImmediate += diff;
            } else {
              teamImmediate += baseImmediate;
            }

            if (needTeamHistory) {
              teamEntriesAll.push({
                ...(data as any),
                id: docSnap.id,
              } as EntryDoc);
            }
          });
        }

        setTeamContractsCount(teamCount);
        setTeamImmediateSum(teamImmediate);
        setTeamEntries(needTeamHistory ? teamEntriesAll : []);
      } catch (e) {
        console.error("Chyba při načítání produkce:", e);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [normalizedEmail, homeWidgets.productionChart, homeWidgets.teamLeaderboard]);

  useEffect(() => {
    if (!hasTeam) {
      setChartMode("personal");
      setSelectedSubordinate(null);
    }
  }, [hasTeam]);

  useEffect(() => {
    if (!homeWidgets.productionChart) {
      setSubPickerOpen(false);
    }
  }, [homeWidgets.productionChart]);

  useEffect(() => {
    if (!homeWidgets.goldWidget) return;
    let cancelled = false;
    const loadGold = async () => {
      setGoldLoading(true);
      setGoldError(null);
      try {
        const res = await fetch("/api/gold?range=d1", { cache: "no-store" });
        if (!res.ok) throw new Error("API vrací chybu");
        const j = (await res.json()) as any;
        if (j?.ok !== true) throw new Error(String(j?.message || j?.error || "Nepodařilo se načíst data o zlatu."));

        const czkPerOz = Number(j?.czkPerOz);
        const ts = Number(j?.ts || Date.now());
        const changePctRaw = j?.changes?.d1 ?? j?.changesPct?.["1d"];
        const changePct = Number.isFinite(Number(changePctRaw)) ? Number(changePctRaw) : null;

        if (!Number.isFinite(czkPerOz) || czkPerOz <= 0) {
          throw new Error("Neplatná cena zlata.");
        }

        if (cancelled) return;
        setGoldData({ czkPerOz, ts, changePct });
      } catch (e) {
        if (!cancelled) {
          setGoldError((e as any)?.message || "Nepodařilo se načíst cenu zlata.");
          setGoldData(null);
        }
      } finally {
        if (!cancelled) setGoldLoading(false);
      }
    };
    void loadGold();
    return () => {
      cancelled = true;
    };
  }, [homeWidgets.goldWidget, goldReloadKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = homeLayoutKey(user?.email ?? null);
    if (!key) return;
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      setHomeLayout(HOME_LAYOUT_DEFAULT);
      return;
    }
    try {
      const parsed = JSON.parse(raw) as HomeSection[];
      const cleaned = parsed.filter((s) => HOME_LAYOUT_DEFAULT.includes(s));
      setHomeLayout(cleaned.length ? cleaned : HOME_LAYOUT_DEFAULT);
    } catch {
      setHomeLayout(HOME_LAYOUT_DEFAULT);
    }
  }, [user]);

  const isManager = isManagerPosition(userMeta?.position ?? null) || hasTeam;
  const showTeamBox = hasTeam;

  const baseProduction = myImmediateSum;
  const totalWithTeam =
    baseProduction + (showTeamBox ? teamImmediateSum : 0);
  const totalContractsCount =
    myContractsCount + (showTeamBox ? teamContractsCount : 0);

  const monthlyGoal = userMeta?.monthlyGoal ?? null;
  const hasGoal = monthlyGoal != null && monthlyGoal > 0;
  const progress = hasGoal
    ? Math.min(100, Math.round((totalWithTeam / monthlyGoal) * 100))
    : 0;
  const remainingToGoal = hasGoal
    ? Math.max(0, monthlyGoal - totalWithTeam)
    : 0;
  const progressTone =
    progress >= 90
      ? "from-emerald-400 via-lime-300 to-emerald-200"
      : progress >= 60
      ? "from-amber-400 via-orange-300 to-yellow-200"
      : "from-rose-500 via-red-400 to-orange-300";

  useEffect(() => {
    setGoalInput(monthlyGoal != null && Number.isFinite(monthlyGoal) ? String(monthlyGoal) : "");
  }, [monthlyGoal]);

  const showProductionSummary = homeWidgets.productionSummary;
  const showMonthlyGoalSection = homeWidgets.monthlyGoal;
  const showLeaderboardSection = showTeamBox && homeWidgets.teamLeaderboard;
  const showChartSection = homeWidgets.productionChart;
  const showGoldWidget = homeWidgets.goldWidget;
  const goldChangePct = goldData?.changePct ?? null;
  const isLiteUI = performanceMode === "lite";
  const goldChangeAbs =
    goldData?.czkPerOz && goldChangePct != null ? (goldData.czkPerOz * goldChangePct) / 100 : null;
  const goldDir = goldChangePct == null ? "flat" : goldChangePct > 0 ? "up" : goldChangePct < 0 ? "down" : "flat";

  const handleSectionDragStart = (id: HomeSection) => {
    setDraggingSection(id);
    setHoverSection(id);
  };

  const handleSectionDragOver = (
    event: DragEvent<HTMLDivElement>,
    targetId: HomeSection
  ) => {
    event.preventDefault();
    if (!draggingSection || draggingSection === targetId) return;

    setHoverSection(targetId);

    const current = [...homeLayout];
    const from = current.indexOf(draggingSection);
    const to = current.indexOf(targetId);
    if (from === -1 || to === -1) return;

    const reordered = [...current];
    reordered.splice(from, 1);
    reordered.splice(to, 0, draggingSection);
    persistHomeLayout(reordered);
  };

  const handleSectionDragEnd = () => {
    setDraggingSection(null);
    setHoverSection(null);
  };

  const renderSection = (id: HomeSection): ReactElement | null => {
    switch (id) {
      case "gold":
        if (!showGoldWidget) return null;
        const goldCardClass = isLiteUI
          ? "relative overflow-hidden rounded-3xl border border-amber-300/30 bg-slate-900 px-4 py-3 sm:px-5 sm:py-3 w-full"
          : "relative overflow-hidden rounded-3xl border border-amber-300/35 bg-gradient-to-r from-amber-500/20 via-slate-950/80 to-emerald-500/15 px-4 py-3 sm:px-5 sm:py-3 shadow-[0_18px_50px_rgba(0,0,0,0.75)] w-full";
        return (
          <section className={goldCardClass}>
            <div className="absolute inset-0 pointer-events-none opacity-60 bg-[radial-gradient(circle_at_18%_18%,rgba(248,250,252,0.14),transparent_42%),radial-gradient(circle_at_82%_28%,rgba(16,185,129,0.2),transparent_45%),radial-gradient(circle_at_58%_82%,rgba(251,191,36,0.22),transparent_45%)]" />
            <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3 sm:gap-4">
                <Image
                  src="/icons/gold1.png"
                  alt="Zlatá cihla"
                  width={96}
                  height={96}
                  className="h-[88px] w-[88px] sm:h-[96px] sm:w-[96px] object-contain drop-shadow-[0_10px_22px_rgba(0,0,0,0.35)]"
                  priority
                />
                <div className="flex flex-col gap-1">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-amber-200/90">
                    Spot cena zlata / oz
                  </div>
                  <div className="text-2xl sm:text-3xl font-semibold text-white drop-shadow-[0_10px_30px_rgba(0,0,0,0.4)]">
                    {goldLoading ? "Načítám…" : goldData ? formatMoney(goldData.czkPerOz) : "—"}
                  </div>
                  <div className="text-[11px] text-slate-300">
                    {goldData?.ts
                      ? `Aktualizace ${new Date(goldData.ts).toLocaleTimeString("cs-CZ", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}`
                      : "Čas zatím neznám"}
                  </div>
                  <div
                    className={`inline-flex self-start items-center gap-3 rounded-full border px-4 py-2 text-sm font-semibold mt-1.5 ${
                      goldDir === "up"
                        ? "border-emerald-300/60 bg-emerald-500/20 text-emerald-50"
                        : goldDir === "down"
                          ? "border-rose-300/60 bg-rose-500/20 text-rose-50"
                          : "border-white/20 bg-white/5 text-slate-100"
                    }`}
                  >
                    <span className="text-base">
                      {goldDir === "up" ? "▲" : goldDir === "down" ? "▼" : "—"}
                    </span>
                    <span>
                      {goldChangePct == null
                        ? "Bez změny"
                        : `${goldChangePct > 0 ? "+" : ""}${goldChangePct.toFixed(2)} %`}
                    </span>
                    {goldChangeAbs != null ? (
                      <span className="text-slate-200/90">
                        ({goldChangeAbs > 0 ? "+" : ""}
                        {formatMoney(Math.abs(goldChangeAbs))})
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:items-end gap-2 sm:gap-2">
                <div className="flex items-center gap-2 text-[11px] text-slate-200">
                  <button
                    type="button"
                    onClick={refreshGoldWidget}
                    className="rounded-full border border-white/15 bg-white/5 px-3 py-1 font-semibold hover:border-white/30 hover:bg-white/10 transition"
                  >
                    Obnovit
                  </button>
                  {goldError ? <span className="text-rose-200">{goldError}</span> : null}
                </div>
              </div>
            </div>
          </section>
        );
      case "summary":
        if (!showProductionSummary) return null;
        const summaryCardClass = isLiteUI
          ? "rounded-3xl border border-white/12 bg-slate-900 px-5 py-5 sm:px-8 sm:py-7"
          : "rounded-3xl border border-white/12 bg-slate-900/75 backdrop-blur-2xl px-5 py-5 sm:px-8 sm:py-7 shadow-[0_24px_80px_rgba(0,0,0,0.85)]";
        return (
          <section className={summaryCardClass}>
            <div
              className={`grid gap-6 ${
                showTeamBox ? "md:grid-cols-3" : "md:grid-cols-2"
              }`}
            >
              <div className="space-y-3">
                <h2 className="text-lg sm:text-xl font-semibold text-slate-50">
                  Vlastní produkce
                </h2>
                {loading ? (
                  <p className="text-xs sm:text-sm text-slate-300">Načítám…</p>
                ) : (
                  <dl className="space-y-3">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-400">
                        Počet smluv
                      </dt>
                      <dd className="text-2xl sm:text-3xl font-semibold text-slate-50 mt-0.5">
                        <AnimatedNumber value={myContractsCount} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-400">
                        Provize
                      </dt>
                      <dd className="text-2xl sm:text-3xl font-semibold text-slate-50 mt-0.5">
                        <AnimatedMoney value={myImmediateSum} />
                      </dd>
                    </div>
                  </dl>
                )}
              </div>

              {showTeamBox && (
                <div className="space-y-3">
                  <h2 className="text-lg sm:text-xl font-semibold text-emerald-200">
                    Týmová produkce
                  </h2>
                  {loading ? (
                    <p className="text-xs sm:text-sm text-emerald-100/80">Načítám…</p>
                  ) : (
                    <dl className="space-y-3">
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-emerald-300/80">
                          Počet smluv
                        </dt>
                        <dd className="text-2xl sm:text-3xl font-semibold text-emerald-100 mt-0.5">
                          <AnimatedNumber value={teamContractsCount} />
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-emerald-300/80">
                          Provize
                        </dt>
                        <dd className="text-2xl sm:text-3xl font-semibold text-emerald-100 mt-0.5">
                          <AnimatedMoney value={teamImmediateSum} />
                        </dd>
                      </div>
                    </dl>
                  )}
                </div>
              )}

              <div className="space-y-3">
                <h2 className="text-lg sm:text-xl font-semibold text-cyan-100">
                  Celková produkce
                </h2>
                {loading ? (
                  <p className="text-xs sm:text-sm text-cyan-100/80">Načítám…</p>
                ) : (
                  <dl className="space-y-3">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-cyan-200/80">
                        Počet smluv
                      </dt>
                      <dd className="text-2xl sm:text-3xl font-semibold text-cyan-50 mt-0.5">
                        <AnimatedNumber value={totalContractsCount} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-cyan-200/80">
                        Provize
                      </dt>
                      <dd className="text-2xl sm:text-3xl font-semibold text-cyan-50 mt-0.5">
                        <AnimatedMoney value={totalWithTeam} />
                      </dd>
                    </div>
                  </dl>
                )}
              </div>
            </div>
          </section>
        );
      case "goal":
        if (!showMonthlyGoalSection) return null;
        const goalCardClass = isLiteUI
          ? "relative overflow-hidden rounded-3xl border border-white/15 bg-slate-900 px-4 py-5 sm:px-10 sm:py-7 h-full min-w-0"
          : "relative overflow-hidden rounded-3xl border border-white/15 bg-slate-900/80 backdrop-blur-2xl px-4 py-5 sm:px-10 sm:py-7 shadow-[0_24px_80px_rgba(0,0,0,0.85)] h-full min-w-0";
        return (
          <section className={goalCardClass}>
            {editGoalOpen && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-slate-900/95 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.65)]">
                  <h3 className="text-base font-semibold text-white">Upravit měsíční cíl</h3>
                  <p className="mt-1 text-sm text-slate-300">
                    Zadej částku provize, kterou chceš tento měsíc dosáhnout.
                  </p>
                  <div className="mt-3 space-y-2">
                    <input
                      type="number"
                      value={goalInput}
                      onChange={(e) => setGoalInput(e.target.value)}
                      className="w-full rounded-xl border border-white/15 bg-slate-800/80 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-400"
                      placeholder="Např. 50000"
                      autoFocus
                      min={0}
                    />
                    {goalError ? <div className="text-xs text-rose-300">{goalError}</div> : null}
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setGoalError(null);
                        setEditGoalOpen(false);
                      }}
                      className="rounded-xl border border-white/15 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/10 transition"
                      disabled={savingGoal}
                    >
                      Zrušit
                    </button>
                    <button
                      type="button"
                      onClick={saveMonthlyGoal}
                      disabled={savingGoal}
                      className="rounded-xl border border-emerald-300/70 bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-50 hover:border-emerald-200 hover:bg-emerald-500/30 transition disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {savingGoal ? "Ukládám…" : "Uložit"}
                    </button>
                  </div>
                </div>
              </div>
            )}
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_10%,rgba(125,211,252,0.18),transparent_45%),radial-gradient(circle_at_88%_8%,rgba(74,222,128,0.12),transparent_55%)]" />
            <div className="relative flex flex-col gap-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <h2 className="text-2xl font-semibold text-white">Měsíční cíl</h2>
                  <p className="text-sm text-slate-300">
                    Cíl na měsíc{" "}
                    <span className="font-semibold text-white">
                      {monthlyGoal ? formatMoney(monthlyGoal) : "Není nastaven"}
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="text-right">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Splněno</div>
                    <div className="text-3xl font-semibold text-white">{progress}%</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditGoalOpen(true)}
                    className="rounded-full border border-white/25 px-4 py-2 text-xs font-semibold text-white/90 hover:bg-white/10 transition"
                  >
                    Upravit cíl
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="relative h-3.5 w-full rounded-full bg-white/5 border border-white/10 overflow-hidden">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${progressTone}`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>0 %</span>
                  <span>100 %</span>
                </div>
              </div>
            </div>
          </section>
        );
      case "leaderboard":
        if (!showLeaderboardSection) return null;
        const leaderboardClass = isLiteUI
          ? "rounded-3xl border border-emerald-400/40 bg-emerald-950/70 px-6 py-6 sm:px-10 sm:py-7 h-full"
          : "rounded-3xl border border-emerald-400/40 bg-emerald-500/5 backdrop-blur-2xl px-6 py-6 sm:px-10 sm:py-7 shadow-[0_30px_90px_rgba(0,0,0,0.9)] h-full";
        return (
          <section className={leaderboardClass}>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5">
              <div>
                <h2 className="text-lg sm:text-xl font-semibold text-emerald-100">
                  Žebříček týmu
                </h2>
              </div>

              <div className="flex flex-col items-start sm:items-end gap-2 text-[11px] sm:text-xs">
                <div className="inline-flex rounded-full bg-emerald-900/50 border border-emerald-400/50 p-1">
                  <button
                    type="button"
                    onClick={() => setLbProductFilter("life")}
                    className={`px-3 py-1.5 rounded-full transition ${
                      lbProductFilter === "life"
                        ? "bg-white text-slate-900 shadow-md"
                        : "text-emerald-100 hover:bg-white/5"
                    }`}
                  >
                    Život
                  </button>
                  <button
                    type="button"
                    onClick={() => setLbProductFilter("other")}
                    className={`px-3 py-1.5 rounded-full transition ${
                      lbProductFilter === "other"
                        ? "bg-white text-slate-900 shadow-md"
                        : "text-emerald-100 hover:bg-white/5"
                    }`}
                  >
                    Vedlejší produkty
                  </button>
                </div>

                <div className="inline-flex rounded-full bg-emerald-900/50 border border-emerald-400/50 p-1">
                  <button
                    type="button"
                    onClick={() => setLbRange("month")}
                    className={`px-3 py-1.5 rounded-full transition ${
                      lbRange === "month"
                        ? "bg-emerald-400 text-slate-900 shadow-md"
                        : "text-emerald-100 hover:bg-white/5"
                    }`}
                  >
                    Aktuální měsíc
                  </button>
                  <button
                    type="button"
                    onClick={() => setLbRange("sixMonths")}
                    className={`px-3 py-1.5 rounded-full transition ${
                      lbRange === "sixMonths"
                        ? "bg-emerald-400 text-slate-900 shadow-md"
                        : "text-emerald-100 hover:bg-white/5"
                    }`}
                  >
                    Posledních 6 měsíců
                  </button>
                  <button
                    type="button"
                    onClick={() => setLbRange("year")}
                    className={`px-3 py-1.5 rounded-full transition ${
                      lbRange === "year"
                        ? "bg-emerald-400 text-slate-900 shadow-md"
                        : "text-emerald-100 hover:bg-white/5"
                    }`}
                  >
                    Aktuální rok
                  </button>
                </div>
              </div>
            </div>

            {leaderboardEntries.length === 0 ? (
              <p className="text-xs sm:text-sm text-emerald-100/80">
                Pro zvolené období a typ produktu zatím nemá tým žádnou
                produkci.
              </p>
            ) : (
              <ol className="mt-2 space-y-2">
                {leaderboardEntries.slice(0, 10).map((row, idx) => (
                  <li
                    key={row.email}
                    className="relative overflow-hidden rounded-2xl border border-emerald-400/30 bg-gradient-to-r from-emerald-500/15 via-slate-950/80 to-slate-950/90 px-4 py-3 sm:px-5 sm:py-4"
                  >
                    <div className="absolute inset-0 pointer-events-none opacity-60 bg-[radial-gradient(circle_at_top_left,rgba(52,211,153,0.35),transparent_55%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.3),transparent_55%)]" />

                    <div className="relative flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
                            idx === 0
                              ? "bg-amber-400 text-slate-900"
                              : idx === 1
                                ? "bg-slate-300 text-slate-900"
                                : idx === 2
                                  ? "bg-amber-700 text-slate-50"
                                  : "bg-emerald-900/70 text-emerald-200"
                          }`}
                        >
                          {idx + 1}
                        </div>
                        <div>
                          <div className="text-sm sm:text-base font-semibold text-slate-50">
                            {row.name}
                          </div>
                          <div className="text-[11px] text-emerald-200/80">
                            {leaderboardLabel}
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-[10px] uppercase tracking-wide text-emerald-300/90">
                          Pojistné
                        </div>
                        <div className="text-lg sm:text-xl font-semibold text-emerald-100">
                          <AnimatedMoney value={row.totalPremium} />
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        );
      case "chart":
        if (!showChartSection) return null;
        const chartCardClass = isLiteUI
          ? "rounded-3xl border border-white/12 bg-slate-900 px-5 py-5 sm:px-7 sm:py-6 overflow-hidden"
          : "rounded-3xl border border-white/12 bg-slate-900/80 backdrop-blur-2xl px-5 py-5 sm:px-7 sm:py-6 shadow-[0_22px_80px_rgba(0,0,0,0.85)] overflow-hidden";
        return (
          <section className={chartCardClass}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-2">
              <div>
                <h2 className="text-lg sm:text-xl font-semibold text-white">
                  Osobní produkce — posledních 12 měsíců
                </h2>
                <p className="text-xs text-slate-300">
                  Život = měsíční pojistné, vedlejší produkty = roční pojistné
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-full bg-slate-900/60 border border-white/10 p-1 backdrop-blur">
                  <button
                    type="button"
                    onClick={() => setChartMode("personal")}
                    className={`px-3 py-1.5 text-xs sm:text-[13px] rounded-full transition ${
                      chartMode === "personal"
                        ? "bg-white text-slate-900 shadow-md"
                        : "text-slate-200 hover:bg-white/10"
                    }`}
                  >
                    Osobní
                  </button>
                  {hasTeam && (
                    <>
                      <button
                        type="button"
                        onClick={() => setChartMode("team")}
                        className={`px-3 py-1.5 text-xs sm:text-[13px] rounded-full transition ${
                          chartMode === "team"
                            ? "bg-white text-slate-900 shadow-md"
                            : "text-slate-200 hover:bg-white/10"
                        }`}
                      >
                        Týmová
                      </button>
                      <button
                        type="button"
                        onClick={() => setChartMode("combined")}
                        className={`px-3 py-1.5 text-xs sm:text-[13px] rounded-full transition ${
                          chartMode === "combined"
                            ? "bg-white text-slate-900 shadow-md"
                            : "text-slate-200 hover:bg-white/10"
                        }`}
                      >
                        Souhrnná
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSubPickerOpen(true);
                          setChartMode("specific");
                        }}
                        className={`px-3 py-1.5 text-xs sm:text-[13px] rounded-full transition ${
                          chartMode === "specific"
                            ? "bg-white text-slate-900 shadow-md"
                            : "text-slate-200 hover:bg-white/10"
                        }`}
                      >
                        Konkrétní
                      </button>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2 text-[11px] text-slate-200">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-cyan-300" />
                    Celkem (život měsíčně + vedlejší ročně)
                    <span className="font-semibold text-white">
                      {formatMoney(
                        personalProductionSeries[personalProductionSeries.length - 1]
                          ?.totalCombined ?? 0
                      )}
                    </span>
                  </span>
                </div>
              </div>
            </div>

            {chartMode === "specific" && hasTeam && (
              <div className="mb-3 rounded-2xl border border-white/10 bg-slate-900/70 backdrop-blur px-4 py-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs text-slate-200">
                    {selectedSubordinate
                      ? `Vybraný podřízený: ${
                          subordinates.find((s) => s.email === selectedSubordinate)?.name ??
                          selectedSubordinate
                        }`
                      : "Vyber podřízeného"}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSubPickerOpen(true)}
                      className="rounded-full border border-white/20 px-3 py-1 text-xs text-white hover:bg-white/10 transition"
                    >
                      Změnit výběr
                    </button>
                    {selectedSubordinate && (
                      <button
                        type="button"
                        onClick={() => setSelectedSubordinate(null)}
                        className="rounded-full border border-white/10 px-3 py-1 text-[11px] text-slate-200 hover:bg-white/5 transition"
                      >
                        Vymazat
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            <PersonalProductionChart data={personalProductionSeries} />
          </section>
        );
      default:
        return null;
    }
  };

  const sectionSpan: Record<HomeSection, string> = {
    gold: "md:col-span-1",
    summary: "md:col-span-2",
    goal: "md:col-span-1",
    leaderboard: "md:col-span-1",
    chart: "md:col-span-2",
  };

  const sectionRowSpan: Record<HomeSection, string> = {
    gold: "",
    summary: "",
    goal: "",
    leaderboard: "md:row-span-2",
    chart: "",
  };

  const saveMonthlyGoal = async () => {
    if (!normalizedEmail) return;
    const raw = (goalInput ?? "").toString().replace(/\s+/g, "");
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setGoalError("Zadej částku 0 nebo víc.");
      return;
    }
    setGoalError(null);
    setSavingGoal(true);
    try {
      const ref = doc(db, "users", normalizedEmail);
      await updateDoc(ref, { monthlyGoal: parsed });
      setUserMeta((prev) => (prev ? { ...prev, monthlyGoal: parsed } : prev));
      setEditGoalOpen(false);
    } catch (e) {
      console.error("Uložení měsíčního cíle selhalo", e);
      setGoalError("Uložení se nepodařilo. Zkus to znovu.");
    } finally {
      setSavingGoal(false);
    }
  };

  const subordinates = useMemo(() => {
    const map = new Map<string, { email: string; name: string }>();
    for (const entry of teamEntries) {
      const email = (entry.userEmail ?? "").toLowerCase();
      if (!email) continue;
      if (map.has(email)) continue;
      map.set(email, { email, name: nameFromEmail(email) });
    }
    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "cs")
    );
  }, [teamEntries]);

  const chartEntries = useMemo(() => {
    if (!hasTeam) return myEntries;
    switch (chartMode) {
      case "team":
        return teamEntries;
      case "combined":
        return [...myEntries, ...teamEntries];
      case "specific":
        if (!selectedSubordinate) return [];
        return teamEntries.filter(
          (e) => (e.userEmail ?? "").toLowerCase() === selectedSubordinate
        );
      case "personal":
      default:
        return myEntries;
    }
  }, [chartMode, hasTeam, myEntries, teamEntries, selectedSubordinate]);

  const personalProductionSeries = useMemo(() => {
    const lifeProducts: Product[] = [
      "neon",
      "flexi",
      "maximaMaxEfekt",
      "pillowInjury",
    ];

    type MonthRow = PersonalSeriesPoint & { key: string };
    const months: MonthRow[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const shortMonth = MONTH_LABELS[d.getMonth()].slice(0, 3);
      months.push({
        key,
        label: `${shortMonth} ${String(d.getFullYear()).slice(2)}`,
        lifeMonthly: 0,
        otherAnnual: 0,
        totalCombined: 0,
      });
    }

    const monthIndex = new Map(months.map((m, idx) => [m.key, idx]));

    for (const entry of chartEntries) {
      const signed = entrySignedDate(entry);
      if (!signed) continue;

      const key = `${signed.getFullYear()}-${signed.getMonth()}`;
      const idx = monthIndex.get(key);
      if (idx === undefined) continue;

      const amount =
        entry.inputAmount ??
        (entry.comfortPayment != null ? entry.comfortPayment : 0);
      if (!amount || !Number.isFinite(amount)) continue;

      const freq = (entry.frequencyRaw ?? "annual") as PaymentFrequency;
      const product = entry.productKey as Product | undefined;

      const isLife = product ? lifeProducts.includes(product) : false;

      if (isLife) {
        months[idx].lifeMonthly += normalizeToMonthly(amount, freq);
      } else {
        months[idx].otherAnnual += normalizeToAnnual(amount, freq);
      }
    }

    for (const m of months) {
      m.totalCombined = m.lifeMonthly + m.otherAnnual;
    }

    return months;
  }, [chartEntries]);

  // ---------- žebříček týmu ----------

  const leaderboardEntries: TeamLeaderboardEntry[] = useMemo(() => {
    if (!isManager || !hasTeam || teamEntries.length === 0) return [];

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const lifeProducts: Product[] = [
      "neon",
      "flexi",
      "maximaMaxEfekt",
      "pillowInjury",
    ];

    const sums = new Map<string, number>();

    for (const entry of teamEntries) {
      const signed = entrySignedDate(entry);
      if (!signed) continue;

      // filtr rozsahu
      if (lbRange === "month") {
        if (
          signed.getFullYear() !== currentYear ||
          signed.getMonth() !== currentMonth
        ) {
          continue;
        }
      } else if (lbRange === "year") {
        if (signed.getFullYear() !== currentYear) continue;
      } else if (lbRange === "sixMonths") {
        if (signed < sixMonthsAgo) continue;
      }

      const pk = entry.productKey;
      const isLife =
        pk != null && lifeProducts.includes(pk as Product);

      if (lbProductFilter === "life" && !isLife) continue;
      if (lbProductFilter === "other" && isLife) continue;

      const email = entry.userEmail ?? "";
      if (!email) continue;

      const premium = entry.inputAmount ?? 0;
      if (!premium || !Number.isFinite(premium)) continue;

      const prev = sums.get(email) ?? 0;
      sums.set(email, prev + premium);
    }

    const rows: TeamLeaderboardEntry[] = Array.from(sums.entries())
      .map(([email, totalPremium]) => ({
        email,
        name: nameFromEmail(email),
        totalPremium,
      }))
      .sort((a, b) => b.totalPremium - a.totalPremium);

    return rows;
  }, [isManager, hasTeam, teamEntries, lbProductFilter, lbRange]);

  const leaderboardLabel =
    lbProductFilter === "life"
      ? "Životní pojištění"
      : "Vedlejší produkty";

  const visibleSections = homeLayout.filter((s) => renderSection(s) !== null);
  const reorderEnabled = widgetPanelOpen;

  if (!authReady || !user) return null;

  return (
    <AppLayout active="home">
      {user && <AutoAnniversaryModal userId={user.uid} />}
      <div className="w-full max-w-5xl space-y-6 px-3 sm:px-0 min-w-0">
        <div className="pt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SplitTextHeading text={`Produkce ${monthLabelCapitalized} ${year}`} />
          <div className="relative self-start">
            <button
              type="button"
              onClick={() => setWidgetPanelOpen((prev) => !prev)}
              className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/90 hover:border-white/35 hover:bg-white/10 transition"
            >
              <svg
                aria-hidden="true"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="opacity-80"
              >
                <path
                  d="M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
                <path
                  d="M12 3.5c.9 0 1.64.62 1.85 1.5l.1.45c.05.23.21.42.44.52l.06.02.43.18c.2.09.43.07.61-.06l.36-.26A2 2 0 0 1 17.87 6l.08.44c.05.27.22.5.46.62l.41.22c.2.1.34.29.37.52l.09.65c.12.85-.39 1.66-1.23 1.93l-.37.12c-.23.07-.39.26-.42.5l-.07.56c-.03.23.05.46.22.62l.21.21c.63.63.63 1.64 0 2.27l-.21.21c-.17.16-.25.39-.22.62l.07.56c.03.24.19.43.42.5l.37.12c.84.27 1.35 1.08 1.23 1.93l-.09.65c-.03.23-.17.42-.37.52l-.41.22a.75.75 0 0 0-.46.62l-.08.44a2 2 0 0 1-1.07 1.45l-.36.26a.73.73 0 0 1-.61.06l-.43-.18c-.22-.09-.48-.03-.62.16l-.13.17c-.12.16-.27.3-.44.41-.17.11-.36.18-.56.21l-.46.07A1.9 1.9 0 0 1 12 20.5c-.9 0-1.64-.62-1.85-1.5l-.1-.45a.75.75 0 0 0-.44-.52l-.06-.02-.43-.18a.73.73 0 0 0-.61.06l-.36.26A2 2 0 0 1 6.13 18l-.08-.44a.75.75 0 0 0-.46-.62l-.41-.22a.75.75 0 0 1-.37-.52l-.09-.65a1.9 1.9 0 0 1 1.23-1.93l.37-.12c.23-.07.39-.26.42-.5l.07-.56c.03-.23-.05-.46-.22-.62l-.21-.21a1.6 1.6 0 0 1 0-2.27l.21-.21c.17-.16.25-.39.22-.62l-.07-.56a.75.75 0 0 0-.42-.5l-.37-.12A1.9 1.9 0 0 1 4.72 8l.09-.65c.03-.23.17-.42.37-.52l.41-.22c.24-.12.41-.35.46-.62l.08-.44A2 2 0 0 1 7.5 4.03l.36-.26c.18-.13.41-.15.61-.06l.43.18c.23.09.48.03.62-.16l.13-.17c.12-.16.27-.3.44-.41.17-.11.36-.18.56-.21l.46-.07c.21-.04.41 0 .6.07.19.07.36.19.51.35.14.15.24.34.29.54l.1.45c.2.88.95 1.5 1.85 1.5Z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>Přizpůsobit</span>
            </button>

            {widgetPanelOpen && (
              <div className="absolute right-0 z-20 mt-2 w-72 rounded-2xl border border-white/15 bg-slate-950/90 backdrop-blur-2xl p-3 shadow-[0_18px_50px_rgba(0,0,0,0.75)]">
                <div className="flex items-center justify-between gap-2 pb-2">
                  <div className="text-sm font-semibold text-white">
                    Přizpůsobení domova
                  </div>
                  <button
                    type="button"
                    onClick={() => setWidgetPanelOpen(false)}
                    className="rounded-full border border-white/15 bg-white/5 px-2 py-1 text-xs text-slate-200 hover:bg-white/10 transition"
                    aria-label="Zavřít"
                  >
                    ×
                  </button>
                </div>

                <div className="space-y-2 text-sm text-slate-200">
                  {[
                    { key: "productionSummary", label: "Přehled produkce", disabled: false },
                    { key: "monthlyGoal", label: "Měsíční cíl", disabled: false },
                    { key: "goldWidget", label: "Cena zlata", disabled: false },
                    {
                      key: "teamLeaderboard",
                      label: "Žebříček týmu",
                      disabled: !showTeamBox,
                      note: "Jen pro manažery s týmem",
                    },
                    { key: "productionChart", label: "Graf produkce", disabled: false },
                  ].map((opt) => {
                    const checked = homeWidgets[opt.key as keyof HomeWidgets];
                    const disabled = opt.disabled;
                    return (
                      <label
                        key={opt.key}
                        className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${
                          disabled
                            ? "cursor-not-allowed border-white/10 bg-white/5 opacity-50"
                            : "cursor-pointer border-white/15 bg-white/5 hover:border-white/30"
                        }`}
                      >
                        <div className="flex flex-col">
                          <span>{opt.label}</span>
                          {opt.note && disabled ? (
                            <span className="text-[11px] text-slate-400">
                              {opt.note}
                            </span>
                          ) : null}
                        </div>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => handleWidgetToggle(opt.key as keyof HomeWidgets)}
                          className="h-4 w-4 accent-emerald-400"
                        />
                      </label>
                    );
                  })}
                </div>
                <div className="mt-3 rounded-xl border border-white/12 bg-white/5 p-3 flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-semibold text-white">Režim výkonu</span>
                    <span className="text-[11px] text-slate-400">
                      {performanceMode === "lite"
                        ? "Odlehčené vizuály a menší efekty pro slabší zařízení."
                        : "Plné vizuály a efekty."}
                    </span>
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs text-slate-100">
                    <span className="text-[11px] uppercase tracking-[0.14em] text-slate-400">
                      {performanceMode === "lite" ? "Odlehčený" : "Plný"}
                    </span>
                    <input
                      type="checkbox"
                      checked={performanceMode === "lite"}
                      onChange={() =>
                        updatePerformanceMode(performanceMode === "lite" ? "default" : "lite")
                      }
                      className="h-4 w-4 accent-emerald-400"
                    />
                  </label>
                </div>
                <div className="mt-3 rounded-xl border border-white/12 bg-white/5 p-3 flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-semibold text-white">Ukládání</span>
                    <span className="text-[11px] text-slate-400">
                      {layoutScope === "cloud"
                        ? "Synchronizuje se s tvým profilem (všechna zařízení)."
                        : "Uloží se jen do tohoto zařízení/prohlížeče."}
                    </span>
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs text-slate-100">
                    <span className="text-[11px] uppercase tracking-[0.14em] text-slate-400">
                      {layoutScope === "cloud" ? "Cloud" : "Jen zařízení"}
                    </span>
                    <input
                      type="checkbox"
                      checked={layoutScope === "cloud"}
                      onChange={handleScopeToggle}
                      className="h-4 w-4 accent-emerald-400"
                    />
                  </label>
                </div>
                <p className="mt-2 text-[11px] text-slate-400">
                  {layoutScope === "cloud"
                    ? "Nastavení i rozložení se uloží do profilu a funguje na všech zařízeních."
                    : "Nastavení zůstává jen v tomto prohlížeči (localStorage)."}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 grid-flow-row-dense">
          {visibleSections.map((sec) => {
            const isDragging = draggingSection === sec;
            const isHoverTarget = reorderEnabled && hoverSection === sec && !isDragging;

            return (
              <div
                key={sec}
                className={[sectionSpan[sec], sectionRowSpan[sec]].filter(Boolean).join(" ")}
              >
                <div
                  draggable={reorderEnabled}
                  onDragStart={reorderEnabled ? () => handleSectionDragStart(sec) : undefined}
                  onDragOver={
                    reorderEnabled
                      ? (e: DragEvent<HTMLDivElement>) => handleSectionDragOver(e, sec)
                      : undefined
                  }
                  onDragEnd={reorderEnabled ? handleSectionDragEnd : undefined}
                  onDrop={
                    reorderEnabled
                      ? (e: DragEvent<HTMLDivElement>) => {
                          e.preventDefault();
                          handleSectionDragEnd();
                        }
                      : undefined
                  }
                  className={`${reorderEnabled ? "relative cursor-grab active:cursor-grabbing" : ""} ${
                    isDragging
                      ? "ring-2 ring-emerald-300 ring-offset-2 ring-offset-slate-900/80 rounded-3xl"
                      : ""
                  } ${
                    isHoverTarget
                      ? "ring-2 ring-white/30 ring-offset-2 ring-offset-slate-900/80 rounded-3xl bg-white/5"
                      : ""
                  }`}
                >
                  {reorderEnabled && (
                    <div className="pointer-events-none absolute right-3 top-3 z-10">
                      <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/60 bg-emerald-500/20 px-3 py-1 text-[11px] font-semibold text-emerald-50 shadow-sm">
                        ⠿ Táhni pro přesun
                      </span>
                    </div>
                  )}
                  {renderSection(sec)}
                </div>
              </div>
            );
          })}
        </div>


        {showChartSection && subPickerOpen && hasTeam && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div
              className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
              onClick={() => setSubPickerOpen(false)}
            />
            <div className="relative w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900/90 shadow-[0_26px_90px_rgba(0,0,0,0.9)] p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-white">Vyber podřízeného</h3>
                  <p className="text-xs text-slate-300">
                    Filtruješ graf pouze na zvoleného člověka.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSubPickerOpen(false)}
                  className="text-slate-200 hover:text-white text-lg leading-none"
                  aria-label="Zavřít"
                >
                  ×
                </button>
              </div>

              <input
                type="text"
                value={subSearch}
                onChange={(e) => setSubSearch(e.target.value)}
                placeholder="Hledej podle jména nebo e-mailu"
                className="w-full rounded-xl bg-slate-800/80 border border-white/15 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              />

              <div className="max-h-72 overflow-auto space-y-2">
                {subordinates
                  .filter(
                    (s) =>
                      !subSearch ||
                      s.name.toLowerCase().includes(subSearch.toLowerCase()) ||
                      s.email.toLowerCase().includes(subSearch.toLowerCase())
                  )
                  .map((s) => (
                    <button
                      key={s.email}
                      type="button"
                      onClick={() => {
                        setSelectedSubordinate(s.email);
                        setSubPickerOpen(false);
                        setChartMode("specific");
                      }}
                      className={`w-full text-left rounded-2xl border px-4 py-3 transition ${
                        selectedSubordinate === s.email
                          ? "bg-sky-500/15 border-sky-400/50 text-white"
                          : "bg-white/5 border-white/10 text-slate-200 hover:border-sky-400/60 hover:bg-white/10"
                      }`}
                    >
                      <div className="text-sm font-semibold">{s.name}</div>
                      <div className="text-xs text-slate-300">{s.email}</div>
                    </button>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
