// src/app/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactElement } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { auth, db } from "./firebase";
import {
  onAuthStateChanged,
  type User as FirebaseUser,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";

import { AppLayout } from "@/components/AppLayout";
import { AutoAnniversaryModal } from "@/components/AutoAnniversaryModal";
import { GoldWidget } from "./home/components/GoldWidget";
import { MonthlyGoalSection } from "./home/components/MonthlyGoalSection";
import { ProductionChartSection } from "./home/components/ProductionChartSection";
import { ProductionSummarySection } from "./home/components/ProductionSummarySection";
import { TeamLeaderboardSection } from "./home/components/TeamLeaderboardSection";
import { invalidateHomeCache, useHomeData } from "./home/useHomeData";
import { type PaymentFrequency, type Product } from "./types/domain";
import {
  entrySignedDate,
  isManagerPosition,
  nameFromEmail,
  normalizeToAnnual,
  normalizeToMonthly,
  MONTH_LABELS,
} from "./home/homeUtils";
import {
  type ChartMode,
  type HomeSection,
  type HomeWidgets,
  type LeaderboardProductFilter,
  type LeaderboardRange,
  type LayoutScope,
  type PerformanceMode,
  type QuickAction,
  type TeamLeaderboardEntry,
} from "./home/types";

function SplitTextHeading({ text }: { text: string }) {
  const words = text.split(" ").filter(Boolean);
  return (
    <div className="flex flex-wrap text-5xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-6xl">
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
              className="inline-block text-slate-900"
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

const HOME_WIDGETS_DEFAULT: HomeWidgets = {
  productionSummary: true,
  monthlyGoal: true,
  teamLeaderboard: true,
  productionChart: true,
  goldWidget: false,
  quickActions: true,
};

const homeWidgetsKey = (email?: string | null) =>
  email ? `home.widgets:${email.toLowerCase()}` : null;
const homeLayoutKey = (email?: string | null) =>
  email ? `home.layout:${email.toLowerCase()}` : null;
const homeScopeKey = (email?: string | null) =>
  email ? `home.scope:${email.toLowerCase()}` : null;
const homePerformanceKey = (email?: string | null) =>
  email ? `home.performance:${email.toLowerCase()}` : null;
const quickActionsKey = (email?: string | null) =>
  email ? `home.quickActions:${email.toLowerCase()}` : null;

const HOME_LAYOUT_DEFAULT: HomeSection[] = [
  "gold",
  "summary",
  "goal",
  "leaderboard",
  "quickActions",
  "chart",
];
const PERFORMANCE_DEFAULT: PerformanceMode = "default";
const QUICK_ACTIONS_DEFAULT: QuickAction[] = [];

const QUICK_ACTION_OPTIONS: QuickAction[] = [
  { key: "argumenty", title: "Argumenty", href: "/pomucky/argumenty", category: "Obecné" },
  { key: "zaznam", title: "Záznam z jednání", href: "/pomucky/zaznam", category: "Obecné" },
  { key: "tvorba", title: "Tvorba", href: "/pomucky/tvorba", category: "Obecné" },
  { key: "investicni-kalkulacka", title: "Investiční kalkulačka", href: "/pomucky/investicni-kalkulacka", category: "Investice" },
  { key: "statistika", title: "Statistika", href: "/pomucky/statistika", category: "Finance" },
  { key: "export-produkce", title: "Export produkce", href: "/pomucky/export-produkce", category: "Finance" },
  { key: "plan-produkce", title: "Plán produkce", href: "/pomucky/plan-produkce", category: "Finance" },
  { key: "zlato", title: "Zlato", href: "/pomucky/zlato", category: "Investice" },
  { key: "katastr", title: "Katastr nemovitostí", href: "/cuzk", category: "Pojištění majetku" },
  { key: "data-o-vozidle", title: "Data o vozidle", href: "/pomucky/data-o-vozidle", category: "Pojištění vozidel" },
  { key: "projekce-vykonu", title: "Projekce výkonu", href: "/pomucky/projekce-vykonu", category: "Finance" },
  { key: "pracovni-neschopenka", title: "Pracovní neschopnost", href: "/pomucky/pracovni-neschopenka", category: "Životní pojištění" },
  { key: "invalidita", title: "Invalidita", href: "/pomucky/invalidita", category: "Životní pojištění" },
];

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

const readLocalQuickActions = (email?: string | null): QuickAction[] | null => {
  if (typeof window === "undefined") return null;
  const key = quickActionsKey(email ?? null);
  if (!key) return null;
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as QuickAction[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

// doplní chybějící sekce (např. nový widget) a odstraní duplicitní / neznámé
const normalizeHomeLayout = (layout: HomeSection[] | null | undefined): HomeSection[] => {
  const known = new Set<HomeSection>();
  const normalized: HomeSection[] = [];
  const source = Array.isArray(layout) && layout.length > 0 ? layout : HOME_LAYOUT_DEFAULT;

  source.forEach((item) => {
    if (HOME_LAYOUT_DEFAULT.includes(item) && !known.has(item)) {
      normalized.push(item);
      known.add(item);
    }
  });

  HOME_LAYOUT_DEFAULT.forEach((item) => {
    if (!known.has(item)) {
      normalized.push(item);
      known.add(item);
    }
  });

  return normalized;
};

// ---------- komponenta ----------

export default function HomePage() {
  const router = useRouter();

  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [lbProductFilter, setLbProductFilter] =
    useState<LeaderboardProductFilter>("life");
  const [lbRange, setLbRange] = useState<LeaderboardRange>("month");
  const [chartMode, setChartMode] = useState<ChartMode>("personal");
  const [selectedSubordinate, setSelectedSubordinate] = useState<string | null>(null);
  const [homeWidgets, setHomeWidgets] = useState<HomeWidgets>(HOME_WIDGETS_DEFAULT);
  const [widgetPanelOpen, setWidgetPanelOpen] = useState(false);
  const [quickActions, setQuickActions] = useState<QuickAction[]>([]);
  const [qaPickerOpen, setQaPickerOpen] = useState(false);
  const qaButtonRef = useRef<HTMLButtonElement | null>(null);
  const [homeLayout, setHomeLayout] = useState<HomeSection[]>(HOME_LAYOUT_DEFAULT);
  const [draggingSection, setDraggingSection] = useState<HomeSection | null>(null);
  const [hoverSection, setHoverSection] = useState<HomeSection | null>(null);
  const homeLayoutRef = useRef<HomeSection[]>(HOME_LAYOUT_DEFAULT);
  const layoutDirtyRef = useRef(false);
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
  const [authReady, setAuthReady] = useState(false);
  const normalizedEmail = useMemo(
    () => user?.email?.toLowerCase() ?? null,
    [user?.email]
  );

  const {
    userMeta,
    setUserMeta,
    myEntries,
    teamEntries,
    hasTeam,
    myContractsCount,
    myImmediateSum,
    teamContractsCount,
    teamImmediateSum,
    loading,
  } = useHomeData({
    email: normalizedEmail,
    loadPersonalHistory: homeWidgets.productionChart,
    loadTeamHistory: homeWidgets.productionChart || homeWidgets.teamLeaderboard,
  });

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

  const persistQuickActions = (updater: (prev: QuickAction[]) => QuickAction[]) => {
    setQuickActions((prev) => {
      const next = updater(prev);
      const key = quickActionsKey(normalizedEmail);
      if (typeof window !== "undefined" && key) {
        window.localStorage.setItem(key, JSON.stringify(next));
      }
      if (layoutScope === "cloud") {
        void pushHomeSettingsToCloud({ homeQuickActions: next });
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
      await pushHomeSettingsToCloud({
        homeLayout,
        homeWidgets,
        homePerformanceMode: performanceMode,
        homeQuickActions: quickActions,
      });
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
      const localQA = readLocalQuickActions(email);
      setHomeLayout(normalizeHomeLayout(localLayout));
      setHomeWidgets(localWidgets ?? HOME_WIDGETS_DEFAULT);
      setPerformanceMode(localPerf ?? PERFORMANCE_DEFAULT);
      setQuickActions(localQA ?? QUICK_ACTIONS_DEFAULT);
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
        const cloudQA = (data?.homeQuickActions as QuickAction[] | undefined) ?? null;

        if (cloudLayout && Array.isArray(cloudLayout) && cloudLayout.length > 0) {
          const normalized = normalizeHomeLayout(cloudLayout as HomeSection[]);
          setHomeLayout(normalized);
          const key = homeLayoutKey(email);
          if (typeof window !== "undefined" && key) {
            window.localStorage.setItem(key, JSON.stringify(normalized));
          }
        } else {
          const localLayout = readLocalHomeLayout(email);
          if (localLayout) {
            setHomeLayout(normalizeHomeLayout(localLayout));
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

        if (cloudQA && Array.isArray(cloudQA)) {
          setQuickActions(cloudQA);
          const key = quickActionsKey(email);
          if (typeof window !== "undefined" && key) {
            window.localStorage.setItem(key, JSON.stringify(cloudQA));
          }
        } else {
          const localQA = readLocalQuickActions(email);
          setQuickActions(localQA ?? QUICK_ACTIONS_DEFAULT);
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

  useEffect(() => {
    homeLayoutRef.current = homeLayout;
  }, [homeLayout]);

  const pushHomeSettingsToCloud = async (payload: {
    homeLayout?: HomeSection[];
    homeWidgets?: HomeWidgets;
    homePerformanceMode?: PerformanceMode;
    homeQuickActions?: QuickAction[];
  }) => {
    if (!normalizedEmail) return;
    try {
      await setDoc(doc(db, "users", normalizedEmail), payload, { merge: true });
    } catch (e) {
      console.error("Uložení nastavení domova selhalo", e);
    }
  };


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
  const remainingToGoal = hasGoal ? Math.max(0, monthlyGoal - totalWithTeam) : 0;
  const progressTone =
    progress >= 90
      ? "from-emerald-400 via-lime-300 to-emerald-200"
      : progress >= 60
      ? "from-amber-400 via-orange-300 to-yellow-200"
      : "from-rose-500 via-red-400 to-orange-300";

  const showProductionSummary = homeWidgets.productionSummary;
  const showMonthlyGoalSection = homeWidgets.monthlyGoal;
  const showLeaderboardSection = showTeamBox && homeWidgets.teamLeaderboard;
  const showChartSection = homeWidgets.productionChart;
  const showGoldWidget = homeWidgets.goldWidget;
  const showQuickActions = homeWidgets.quickActions;
  const reorderEnabled = widgetPanelOpen;
  const goldChangePct = goldData?.changePct ?? null;
  const isLiteUI = performanceMode === "lite";
  const goldChangeAbs =
    goldData?.czkPerOz && goldChangePct != null ? (goldData.czkPerOz * goldChangePct) / 100 : null;
  const goldDir = goldChangePct == null ? "flat" : goldChangePct > 0 ? "up" : goldChangePct < 0 ? "down" : "flat";

  const handleSectionDragStart = (id: HomeSection) => {
    setDraggingSection(id);
    setHoverSection(id);
    layoutDirtyRef.current = false;
  };

  const handleSectionDragOver = (
    event: DragEvent<HTMLElement>,
    targetId: HomeSection
  ) => {
    event.preventDefault();
    if (!draggingSection || draggingSection === targetId) return;

    setHoverSection(targetId);

    setHomeLayout((current) => {
      const from = current.indexOf(draggingSection);
      const to = current.indexOf(targetId);
      if (from === -1 || to === -1 || from === to) return current;

      const reordered = [...current];
      reordered.splice(from, 1);
      reordered.splice(to, 0, draggingSection);
      layoutDirtyRef.current = true;
      return reordered;
    });
  };

  const handleSectionDragEnd = () => {
    setDraggingSection(null);
    setHoverSection(null);
    if (layoutDirtyRef.current) {
      const latestLayout = homeLayoutRef.current;
      if (latestLayout) {
        persistHomeLayout(latestLayout);
      }
      layoutDirtyRef.current = false;
    }
  };

  const renderSection = (id: HomeSection): ReactElement | null => {
    switch (id) {
      case "gold":
        if (!showGoldWidget) return null;
        return (
          <GoldWidget
            isLiteUI={isLiteUI}
            goldLoading={goldLoading}
            goldData={goldData}
            goldChangePct={goldChangePct}
            goldChangeAbs={goldChangeAbs}
            goldDir={goldDir as "up" | "down" | "flat"}
            goldError={goldError}
            onRefresh={refreshGoldWidget}
          />
        );
      case "summary":
        if (!showProductionSummary) return null;
        return (
          <ProductionSummarySection
            loading={loading}
            showTeamBox={showTeamBox}
            myContractsCount={myContractsCount}
            myImmediateSum={myImmediateSum}
            teamContractsCount={teamContractsCount}
            teamImmediateSum={teamImmediateSum}
            totalContractsCount={totalContractsCount}
            totalWithTeam={totalWithTeam}
            isLiteUI={isLiteUI}
          />
        );
      case "goal":
        if (!showMonthlyGoalSection) return null;
        return (
          <MonthlyGoalSection
            monthlyGoal={monthlyGoal}
            progress={progress}
            progressTone={progressTone}
            isLiteUI={isLiteUI}
            remainingToGoal={remainingToGoal}
            position={userMeta?.position ?? null}
            commissionMode={userMeta?.commissionMode ?? null}
            onSaveGoal={saveMonthlyGoal}
          />
        );
      case "leaderboard":
        if (!showLeaderboardSection) return null;
        return (
          <TeamLeaderboardSection
            entries={leaderboardEntries}
            leaderboardLabel={leaderboardLabel}
            lbProductFilter={lbProductFilter}
            lbRange={lbRange}
            onProductFilterChange={setLbProductFilter}
            onRangeChange={setLbRange}
            isLiteUI={isLiteUI}
          />
        );
      case "quickActions":
        if (!showQuickActions) return null;
        const availableQA = QUICK_ACTION_OPTIONS.filter(
          (opt) => !quickActions.some((q) => q.key === opt.key)
        );
        return (
          <section
            className={`relative z-30 space-y-3 rounded-[28px] border border-slate-900 bg-white px-5 py-5 shadow-[0_12px_28px_rgba(15,23,42,0.1)] sm:px-8 sm:py-7 ${
              reorderEnabled && draggingSection === id ? "opacity-50" : ""
            } ${reorderEnabled ? "cursor-move" : ""}`}
            draggable={reorderEnabled}
            onDragStart={() => handleSectionDragStart(id)}
            onDragOver={(e) => handleSectionDragOver(e, id)}
            onDragEnd={handleSectionDragEnd}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                  Rychlé akce
                </p>
                <h2 className="text-lg font-semibold text-slate-900 sm:text-xl">
                  Pomůcky po ruce
                </h2>
              </div>
              <div className="relative z-30">
                <button
                  type="button"
                  ref={qaButtonRef}
                  onClick={() => setQaPickerOpen((v) => !v)}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-black"
                >
                  + Přidat
                </button>
                {qaPickerOpen && (
                  <div
                    className="absolute right-0 top-full z-50 mt-2 max-h-[320px] w-72 space-y-2 overflow-auto rounded-2xl border border-slate-900 bg-white p-3 shadow-[0_12px_28px_rgba(15,23,42,0.15)]"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                        Pomůcky
                      </div>
                      <button
                        type="button"
                        onClick={() => setQaPickerOpen(false)}
                        className="text-[12px] text-slate-500 hover:text-slate-900"
                      >
                        ×
                      </button>
                    </div>
                    {availableQA.length === 0 ? (
                      <p className="text-xs text-slate-600">Vše už máš přidané.</p>
                    ) : (
                      availableQA.map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => {
                            persistQuickActions((prev) => [...prev, opt]);
                            setQaPickerOpen(false);
                          }}
                          className="w-full rounded-xl border border-slate-900 bg-slate-50 px-3 py-2 text-left text-sm text-slate-900 transition hover:bg-white"
                        >
                          <div className="font-semibold">{opt.title}</div>
                          <div className="text-[11px] text-slate-500">
                            {opt.category ?? "Pomůcky"}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            {quickActions.length === 0 ? (
              <p className="text-sm text-slate-600">
                Přidej si sem nejčastěji používané pomůcky a měj je na jedno kliknutí.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {quickActions.map((qa) => (
                  <div
                    key={qa.key}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-900 bg-white px-3 py-1.5 text-sm text-slate-900"
                  >
                    <Link href={qa.href} className="hover:text-slate-700">
                      {qa.title}
                    </Link>
                    <button
                      type="button"
                      onClick={() =>
                        persistQuickActions((prev) => prev.filter((item) => item.key !== qa.key))
                      }
                      className="text-[12px] text-slate-500 hover:text-rose-600"
                      aria-label={`Odebrat ${qa.title}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      case "chart":
        if (!showChartSection) return null;
        return (
          <ProductionChartSection
            chartMode={chartMode}
            setChartMode={setChartMode}
            hasTeam={hasTeam}
            personalProductionSeries={personalProductionSeries}
            selectedSubordinate={selectedSubordinate}
            onSelectSubordinate={setSelectedSubordinate}
            subordinates={subordinates}
            subPickerOpen={subPickerOpen}
            setSubPickerOpen={setSubPickerOpen}
            subSearch={subSearch}
            setSubSearch={setSubSearch}
            isLiteUI={isLiteUI}
          />
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
    quickActions: "md:col-span-1",
    chart: "md:col-span-2",
  };

  const sectionRowSpan: Record<HomeSection, string> = {
    gold: "",
    summary: "",
    goal: "",
    leaderboard: "md:row-span-2",
    quickActions: "",
    chart: "",
  };

  const saveMonthlyGoal = async (value: number) => {
    if (!normalizedEmail) return;
    try {
      invalidateHomeCache(normalizedEmail);
      const ref = doc(db, "users", normalizedEmail);
      await setDoc(ref, { monthlyGoal: value }, { merge: true });
      setUserMeta((prev) => (prev ? { ...prev, monthlyGoal: value } : prev));
    } catch (e) {
      console.error("Uložení měsíčního cíle selhalo", e);
      throw e;
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

      const rawPremium = entry.inputAmount ?? 0;
      if (!rawPremium || !Number.isFinite(rawPremium)) continue;

      const freq = (entry.frequencyRaw ?? "annual") as PaymentFrequency;
      const premium = isLife
        ? rawPremium
        : normalizeToAnnual(rawPremium, freq);

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

  const isSectionVisible = (sec: HomeSection) => {
    switch (sec) {
      case "gold":
        return showGoldWidget;
      case "summary":
        return showProductionSummary;
      case "goal":
        return showMonthlyGoalSection;
      case "leaderboard":
        return showLeaderboardSection;
      case "chart":
        return showChartSection;
      case "quickActions":
        return showQuickActions;
      default:
        return false;
    }
  };

  const visibleSections = homeLayout.filter(isSectionVisible);

  if (!authReady || !user) return null;

  return (
    <AppLayout active="home">
      {user && <AutoAnniversaryModal userId={user.uid} />}
      <div className="w-full bg-white px-3 py-6 sm:px-4 sm:py-8 lg:px-8">
        <div className="mx-auto w-full max-w-6xl min-w-0 space-y-6 font-mono text-slate-900">
        <div className="pt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SplitTextHeading text={`Produkce ${monthLabelCapitalized} ${year}`} />
          <div className="relative self-start">
            <button
              type="button"
              onClick={() => setWidgetPanelOpen((prev) => !prev)}
              className="inline-flex items-center gap-2 rounded-full border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-black"
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
              <div className="absolute right-0 z-20 mt-2 w-72 rounded-2xl border border-slate-900 bg-white p-3 shadow-[0_12px_28px_rgba(15,23,42,0.15)]">
                <div className="flex items-center justify-between gap-2 pb-2">
                  <div className="text-sm font-semibold text-slate-900">
                    Přizpůsobení domova
                  </div>
                  <button
                    type="button"
                    onClick={() => setWidgetPanelOpen(false)}
                    className="rounded-full border border-slate-900 bg-slate-100 px-2 py-1 text-xs text-slate-700 transition hover:bg-white"
                    aria-label="Zavřít"
                  >
                    ×
                  </button>
                </div>

                <div className="space-y-2 text-sm text-slate-700">
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
                      { key: "quickActions", label: "Rychlé akce (pomůcky)", disabled: false },
                      { key: "productionChart", label: "Graf produkce", disabled: false },
                    ].map((opt) => {
                    const checked = homeWidgets[opt.key as keyof HomeWidgets];
                    const disabled = opt.disabled;
                    return (
                      <label
                        key={opt.key}
                        className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${
                          disabled
                            ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-50"
                            : "cursor-pointer border-slate-900 bg-slate-50 hover:bg-white"
                        }`}
                      >
                        <div className="flex flex-col">
                          <span>{opt.label}</span>
                          {opt.note && disabled ? (
                            <span className="text-[11px] text-slate-500">
                              {opt.note}
                            </span>
                          ) : null}
                        </div>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => handleWidgetToggle(opt.key as keyof HomeWidgets)}
                          className="h-4 w-4 accent-slate-900"
                        />
                      </label>
                    );
                  })}
                </div>
                <div className="mt-3 flex items-start justify-between gap-3 rounded-xl border border-slate-900 bg-slate-50 p-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-semibold text-slate-900">Režim výkonu</span>
                    <span className="text-[11px] text-slate-500">
                      {performanceMode === "lite"
                        ? "Odlehčené vizuály a menší efekty pro slabší zařízení."
                        : "Plné vizuály a efekty."}
                    </span>
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                    <span className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                      {performanceMode === "lite" ? "Odlehčený" : "Plný"}
                    </span>
                    <input
                      type="checkbox"
                      checked={performanceMode === "lite"}
                      onChange={() =>
                        updatePerformanceMode(performanceMode === "lite" ? "default" : "lite")
                      }
                      className="h-4 w-4 accent-slate-900"
                    />
                  </label>
                </div>
                <div className="mt-3 flex items-start justify-between gap-3 rounded-xl border border-slate-900 bg-slate-50 p-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-semibold text-slate-900">Ukládání</span>
                    <span className="text-[11px] text-slate-500">
                      {layoutScope === "cloud"
                        ? "Synchronizuje se s tvým profilem (všechna zařízení)."
                        : "Uloží se jen do tohoto zařízení/prohlížeče."}
                    </span>
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                    <span className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                      {layoutScope === "cloud" ? "Cloud" : "Jen zařízení"}
                    </span>
                    <input
                      type="checkbox"
                      checked={layoutScope === "cloud"}
                      onChange={handleScopeToggle}
                      className="h-4 w-4 accent-slate-900"
                    />
                  </label>
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
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
                  className={`font-mono ${reorderEnabled ? "relative cursor-grab active:cursor-grabbing" : ""} ${
                    isDragging
                      ? "rounded-3xl ring-2 ring-slate-800 ring-offset-2 ring-offset-white"
                      : ""
                  } ${
                    isHoverTarget
                      ? "rounded-3xl bg-slate-100 ring-2 ring-slate-400 ring-offset-2 ring-offset-white"
                      : ""
                  }`}
                >
                  {reorderEnabled && (
                    <div className="pointer-events-none absolute right-3 top-3 z-10">
                      <span className="inline-flex items-center gap-2 rounded-full border border-slate-900 bg-slate-900 px-3 py-1 text-[11px] font-semibold text-white shadow-sm">
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
        </div>
      </div>
    </AppLayout>
  );
}
