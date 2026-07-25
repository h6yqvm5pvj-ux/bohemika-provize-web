// src/app/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactElement } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Globe2, Mail, RefreshCw, SlidersHorizontal } from "lucide-react";

import { auth } from "./firebase";
import {
  onAuthStateChanged,
  type User as FirebaseUser,
} from "firebase/auth";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import { readAdminImpersonationState } from "@/app/lib/adminImpersonation";
import {
  getUserProfileCached,
  invalidateUserProfileCache,
} from "@/app/lib/userProfileCache";
import {
  APP_LANGUAGE_EVENT,
  APP_LANGUAGE_LOCAL_STORAGE_KEY,
  DEFAULT_APP_LANGUAGE,
  getAppLanguageMeta,
  resolveAppLanguage,
  type AppLanguage,
} from "@/lib/appLanguage";

import { AppLayout } from "@/components/AppLayout";
import {
  applyStatementMissingPayoutShifts,
  applyStatementPayoutTotalsToMonths,
  calculateNetCashflow,
  calculateStornoFund,
  groupItemsByMonth,
  statementMonthKey,
} from "./cashflow/helpers";
import type { CashflowCommissionStatementSummary } from "./cashflow/types";
import { useCashflowData } from "./cashflow/useCashflowData";
import { ExpectedPayoutSection } from "./home/components/ExpectedPayoutSection";
import { MonthlyGoalSection } from "./home/components/MonthlyGoalSection";
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

const AutoAnniversaryModal = dynamic(
  () =>
    import("@/components/AutoAnniversaryModal").then(
      (mod) => mod.AutoAnniversaryModal
    ),
  { ssr: false }
);
const GoldWidget = dynamic(
  () => import("./home/components/GoldWidget").then((mod) => mod.GoldWidget),
  { ssr: false }
);
const ProductionChartSection = dynamic(
  () =>
    import("./home/components/ProductionChartSection").then(
      (mod) => mod.ProductionChartSection
    ),
  { ssr: false }
);
const TipsterHomeView = dynamic(
  () =>
    import("./home/components/TipsterHomeView").then(
      (mod) => mod.TipsterHomeView
    ),
  { ssr: false }
);
const InstitutionPortalLinksModal = dynamic(
  () =>
    import("./pomucky/InstitutionPortalLinksModal").then(
      (mod) => mod.InstitutionPortalLinksModal
    ),
  { ssr: false }
);

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const resolveEffectiveAdvisorEmail = (
  user: FirebaseUser | null,
  profile: Record<string, unknown> | null
): string | null => {
  const profileEmail = normalizeEmail(profile?.email);
  if (profileEmail) return profileEmail;
  const impersonatedEmail = readAdminImpersonationState()?.email;
  if (impersonatedEmail) return impersonatedEmail;
  const userEmail = normalizeEmail(user?.email);
  return userEmail || null;
};

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
          className="relative flex overflow-hidden mr-4 last:mr-0 gap-[2px]"
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

function cleanDisplayName(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function HomeBackgroundLines() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
      <svg
        className="absolute -right-20 top-8 h-[34rem] w-[58rem] opacity-70"
        viewBox="0 0 920 540"
        fill="none"
      >
        <defs>
          <linearGradient id="homeLinePrimary" x1="34" y1="74" x2="876" y2="386" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ec4899" stopOpacity="0" />
            <stop offset="0.38" stopColor="#ec4899" stopOpacity="0.34" />
            <stop offset="0.72" stopColor="#38bdf8" stopOpacity="0.26" />
            <stop offset="1" stopColor="#38bdf8" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="homeLineSecondary" x1="58" y1="320" x2="822" y2="106" gradientUnits="userSpaceOnUse">
            <stop stopColor="#0f172a" stopOpacity="0" />
            <stop offset="0.42" stopColor="#0f172a" stopOpacity="0.14" />
            <stop offset="1" stopColor="#a855f7" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M42 134C180 42 314 34 446 110C578 186 676 182 876 54"
          stroke="url(#homeLinePrimary)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M74 302C220 210 342 218 484 292C628 368 744 360 860 284"
          stroke="url(#homeLineSecondary)"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M106 458C248 374 390 364 526 416C642 460 748 464 848 410"
          stroke="url(#homeLinePrimary)"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeDasharray="10 14"
        />
      </svg>

      <svg
        className="absolute -left-24 bottom-4 h-[28rem] w-[48rem] opacity-60"
        viewBox="0 0 760 430"
        fill="none"
      >
        <defs>
          <linearGradient id="homeLineLeft" x1="22" y1="310" x2="724" y2="92" gradientUnits="userSpaceOnUse">
            <stop stopColor="#38bdf8" stopOpacity="0" />
            <stop offset="0.46" stopColor="#38bdf8" stopOpacity="0.22" />
            <stop offset="0.78" stopColor="#ec4899" stopOpacity="0.2" />
            <stop offset="1" stopColor="#ec4899" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M28 318C140 230 248 202 380 226C502 248 602 208 724 98"
          stroke="url(#homeLineLeft)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M84 380C208 314 326 300 454 322C560 340 652 318 728 260"
          stroke="url(#homeLineLeft)"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeDasharray="8 12"
        />
      </svg>

      <span className="absolute left-[18%] top-24 h-px w-72 -rotate-6 bg-[linear-gradient(90deg,transparent,rgba(15,23,42,0.12),transparent)]" />
      <span className="absolute right-[12%] top-[37rem] h-px w-96 rotate-3 bg-[linear-gradient(90deg,transparent,rgba(236,72,153,0.18),transparent)]" />
      <span className="absolute left-[31%] bottom-16 h-px w-80 -rotate-3 bg-[linear-gradient(90deg,transparent,rgba(56,189,248,0.18),transparent)]" />
    </div>
  );
}

type PersonalSeriesPoint = {
  label: string;
  lifeMonthly: number;
  otherAnnual: number;
  totalCombined: number;
};

type AccountType = "advisor" | "tipster";

const resolveAccountType = (
  profile: Record<string, unknown> | null | undefined
): AccountType => {
  const raw =
    typeof profile?.accountType === "string"
      ? profile.accountType
      : typeof profile?.userRole === "string"
        ? profile.userRole
        : "";
  return raw.trim().toLowerCase() === "tipster" ? "tipster" : "advisor";
};

const HOME_WIDGETS_DEFAULT: HomeWidgets = {
  productionSummary: true,
  expectedPayout: true,
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
  "expectedPayout",
  "goal",
  "leaderboard",
  "quickActions",
];
const PERFORMANCE_DEFAULT: PerformanceMode = "default";
const QUICK_ACTIONS_DEFAULT: QuickAction[] = [];

const HOME_LOCALES: Record<AppLanguage, string> = {
  cs: "cs-CZ",
};

const HOME_COPY: Record<
  AppLanguage,
  {
    authLoading: string;
    authCheckAria: string;
    profileTypeLoadError: string;
    homeHeadingPrefix: string;
    mail: string;
    reloadData: string;
    customizeHomeAria: string;
    customizeTitle: string;
    customizeButtonTitle: string;
    close: string;
    dragToMove: string;
    widgetLabels: Record<keyof HomeWidgets, string>;
    managerOnlyNote: string;
    performance: {
      title: string;
      liteDescription: string;
      defaultDescription: string;
      liteLabel: string;
      defaultLabel: string;
    };
    storage: {
      title: string;
      cloudDescription: string;
      deviceDescription: string;
      cloudLabel: string;
      deviceLabel: string;
      cloudHelp: string;
      deviceHelp: string;
    };
    quickActions: {
      kicker: string;
      title: string;
      add: string;
      pickerTitle: string;
      allAdded: string;
      categoryFallback: string;
      empty: string;
      removeAriaPrefix: string;
    };
    leaderboard: {
      life: string;
      other: string;
    };
    goldFetch: {
      apiError: string;
      dataError: string;
      invalidPrice: string;
      priceError: string;
    };
  }
> = {
  cs: {
    authLoading: "Načítám přihlášení…",
    authCheckAria: "Ověřuji typ účtu",
    profileTypeLoadError: "Nepodařilo se ověřit typ účtu.",
    homeHeadingPrefix: "Produkce",
    mail: "Pošta",
    reloadData: "Obnovit data",
    customizeHomeAria: "Přizpůsobit domovskou stránku",
    customizeTitle: "Přizpůsobení domova",
    customizeButtonTitle: "Přizpůsobit",
    close: "Zavřít",
    dragToMove: "⠿ Táhni pro přesun",
    widgetLabels: {
      productionSummary: "Přehled produkce",
      expectedPayout: "Očekávaná výplata",
      monthlyGoal: "Měsíční cíl",
      teamLeaderboard: "Žebříček týmu",
      productionChart: "Graf produkce",
      goldWidget: "Cena zlata",
      quickActions: "Rychlé akce (pomůcky)",
    },
    managerOnlyNote: "Jen pro manažery s týmem",
    performance: {
      title: "Režim výkonu",
      liteDescription: "Odlehčené vizuály a menší efekty pro slabší zařízení.",
      defaultDescription: "Plné vizuály a efekty.",
      liteLabel: "Odlehčený",
      defaultLabel: "Plný",
    },
    storage: {
      title: "Ukládání",
      cloudDescription: "Synchronizuje se s tvým profilem (všechna zařízení).",
      deviceDescription: "Uloží se jen do tohoto zařízení/prohlížeče.",
      cloudLabel: "Cloud",
      deviceLabel: "Jen zařízení",
      cloudHelp: "Nastavení i rozložení se uloží do profilu a funguje na všech zařízeních.",
      deviceHelp: "Nastavení zůstává jen v tomto prohlížeči (localStorage).",
    },
    quickActions: {
      kicker: "Rychlé akce",
      title: "Pomůcky po ruce",
      add: "+ Přidat",
      pickerTitle: "Pomůcky",
      allAdded: "Vše už máš přidané.",
      categoryFallback: "Pomůcky",
      empty: "Přidej si sem nejčastěji používané pomůcky a měj je na jedno kliknutí.",
      removeAriaPrefix: "Odebrat",
    },
    leaderboard: {
      life: "Životní pojištění",
      other: "Vedlejší produkty",
    },
    goldFetch: {
      apiError: "API vrací chybu",
      dataError: "Nepodařilo se načíst data o zlatu.",
      invalidPrice: "Neplatná cena zlata.",
      priceError: "Nepodařilo se načíst cenu zlata.",
    },
  },
};

const QUICK_ACTION_OPTIONS: QuickAction[] = [
  { key: "argumenty", title: "Argumenty", href: "/pomucky/argumenty", category: "Obecné" },
  { key: "dokumenty", title: "Dokumenty", href: "/pomucky/dokumenty", category: "Obecné" },
  { key: "zaznam", title: "Záznam z jednání", href: "/pomucky/zaznam", category: "Obecné" },
  { key: "tvorba", title: "Tvorba", href: "/pomucky/tvorba", category: "Obecné" },
  { key: "ai-asistent", title: "AI Asistent", href: "/pomucky/ai-asistent", category: "Obecné" },
  { key: "hypoteka-vlastni-zdroje", title: "Hypotéka: vlastní zdroje", href: "/pomucky/hypoteka-vlastni-zdroje", category: "Investice" },
  { key: "statistika", title: "Statistika", href: "/pomucky/statistika", category: "Finance" },
  { key: "export-produkce", title: "Export produkce", href: "/pomucky/export-produkce", category: "Finance" },
  { key: "plan-produkce", title: "Plán produkce", href: "/pomucky/plan-produkce", category: "Finance" },
  { key: "zlato", title: "Zlato", href: "/pomucky/zlato", category: "Investice" },
  { key: "katastr", title: "Nahlížení do katastru nemovitostí", href: "/cuzk", category: "Pojištění majetku" },
  { key: "proklepka-vozidla", title: "Proklepka vozidla", href: "/pomucky/proklepka-vozidla", category: "Pojištění vozidel" },
  { key: "projekce-vykonu", title: "Projekce výkonu", href: "/pomucky/projekce-vykonu", category: "Finance" },
  { key: "pracovni-neschopenka", title: "Pracovní neschopnost", href: "/pomucky/pracovni-neschopenka", category: "Životní pojištění" },
  { key: "invalidita", title: "Invalidita", href: "/pomucky/invalidita", category: "Životní pojištění" },
  { key: "srovnavac-zivotniho-pojisteni", title: "Srovnavač životního pojištění", href: "/pomucky/srovnavac-zivotniho-pojisteni", category: "Životní pojištění" },
];
const QUICK_ACTION_OPTIONS_BY_KEY = new Map<string, QuickAction>(
  QUICK_ACTION_OPTIONS.map((option) => [option.key, option])
);

const QUICK_ACTION_TRANSLATIONS: Partial<
  Record<AppLanguage, Record<string, Pick<QuickAction, "title" | "category">>>
> = {};

const resolveQuickActionText = (action: QuickAction, language: AppLanguage) => {
  const translated = QUICK_ACTION_TRANSLATIONS[language]?.[action.key];
  return {
    title: translated?.title ?? action.title,
    category: translated?.category ?? action.category,
  };
};

const applyHomeLanguagePreference = (value: unknown): AppLanguage => {
  const next = resolveAppLanguage(value);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(APP_LANGUAGE_LOCAL_STORAGE_KEY, next);
  }
  if (typeof document !== "undefined") {
    document.documentElement.lang = getAppLanguageMeta(next)?.htmlLang ?? next;
  }
  return next;
};

const capitalizeForLocale = (value: string, language: AppLanguage) => {
  const locale = HOME_LOCALES[language];
  return value.charAt(0).toLocaleUpperCase(locale) + value.slice(1);
};

const formatHomeMonthLabel = (date: Date, language: AppLanguage) =>
  new Intl.DateTimeFormat(HOME_LOCALES[language], { month: "long" }).format(date);

const formatHomeMonthShortLabel = (date: Date, language: AppLanguage) =>
  new Intl.DateTimeFormat(HOME_LOCALES[language], { month: "short" })
    .format(date)
    .replace(/\.$/, "");

const normalizeQuickActions = (
  actions: QuickAction[] | null | undefined
): QuickAction[] => {
  if (!Array.isArray(actions)) return QUICK_ACTIONS_DEFAULT;
  const seen = new Set<string>();
  const normalized: QuickAction[] = [];

  for (const action of actions) {
    const key = typeof action?.key === "string" ? action.key : "";
    if (!key || seen.has(key)) continue;
    const canonical = QUICK_ACTION_OPTIONS_BY_KEY.get(key);
    if (!canonical) continue;
    normalized.push(canonical);
    seen.add(key);
  }

  return normalized;
};

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
    return normalizeQuickActions(parsed);
  } catch {
    return QUICK_ACTIONS_DEFAULT;
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
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [language, setLanguage] = useState<AppLanguage>(DEFAULT_APP_LANGUAGE);
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
  const [homeReloadKey, setHomeReloadKey] = useState(0);
  const [goldData, setGoldData] = useState<{
    czkPerOz: number;
    ts: number;
    changePct: number | null;
  } | null>(null);
  const [subPickerOpen, setSubPickerOpen] = useState(false);
  const [subSearch, setSubSearch] = useState("");
  const [portalLinksModalOpen, setPortalLinksModalOpen] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [accessProfileReady, setAccessProfileReady] = useState(false);
  const [accessProfileError, setAccessProfileError] = useState<string | null>(null);
  const [accessProfile, setAccessProfile] = useState<Record<string, unknown> | null>(null);
  const [mailUnreadCount, setMailUnreadCount] = useState(0);
  const normalizedEmail = useMemo(
    () => normalizeEmail(user?.email) || null,
    [user?.email]
  );
  const effectiveAdvisorEmail = useMemo(
    () => resolveEffectiveAdvisorEmail(user, accessProfile),
    [accessProfile, user]
  );
  const copy = HOME_COPY[language];
  const accountType = useMemo(() => resolveAccountType(accessProfile), [accessProfile]);
  const shouldLoadAdvisorHome =
    authReady && !!user && accessProfileReady && accountType !== "tipster";
  const advisorDataEmail = shouldLoadAdvisorHome ? effectiveAdvisorEmail : null;
  const shouldLoadExpectedPayout =
    shouldLoadAdvisorHome && homeWidgets.expectedPayout;

  const {
    userMeta,
    setUserMeta,
    myEntries,
    teamEntries,
    hasTeam,
    myContractsCount,
    myImmediateSum,
    myImmediatePrevSum,
    myTipContractsCount,
    myTipImmediateSum,
    myTipImmediatePrevSum,
    teamContractsCount,
    teamImmediateSum,
    teamImmediatePrevSum,
    summaryLoading,
    historyLoading,
  } = useHomeData({
    email: advisorDataEmail,
    loadPersonalHistory: false,
    loadTeamHistory: shouldLoadAdvisorHome && homeWidgets.teamLeaderboard,
    reloadKey: homeReloadKey,
  });
  const { loading: cashflowLoading, cashflowItems } = useCashflowData({
    userEmail: advisorDataEmail,
    scopeFilter: "combined",
    productFilter: "all",
    enabled: shouldLoadExpectedPayout,
    reloadKey: homeReloadKey,
  });
  const [commissionStatements, setCommissionStatements] = useState<
    CashflowCommissionStatementSummary[]
  >([]);
  const [commissionStatementsLoading, setCommissionStatementsLoading] =
    useState(false);
  const [commissionStatementsReady, setCommissionStatementsReady] =
    useState(false);

  useEffect(() => {
    if (!shouldLoadExpectedPayout || !user) {
      setCommissionStatements([]);
      setCommissionStatementsLoading(false);
      setCommissionStatementsReady(false);
      return;
    }

    let cancelled = false;

    const loadStatements = async () => {
      setCommissionStatementsLoading(true);
      setCommissionStatementsReady(false);
      try {
        const token = await user.getIdToken();
        const response = await fetch("/api/commission-statements?limit=240", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as
          | {
              ok?: boolean;
              items?: CashflowCommissionStatementSummary[];
              error?: string;
            }
          | null;
        if (!response.ok || payload?.ok !== true || !Array.isArray(payload.items)) {
          throw new Error(payload?.error || "Provizní výpisy se nepodařilo načíst.");
        }
        if (!cancelled) setCommissionStatements(payload.items);
      } catch (error) {
        if (cancelled) return;
        console.warn(
          "Domovská stránka: provizní výpisy pro očekávanou výplatu se nepodařilo načíst.",
          error
        );
        setCommissionStatements([]);
      } finally {
        if (!cancelled) {
          setCommissionStatementsLoading(false);
          setCommissionStatementsReady(true);
        }
      }
    };

    void loadStatements();

    return () => {
      cancelled = true;
    };
  }, [homeReloadKey, shouldLoadExpectedPayout, user]);

  const now = new Date();
  const monthLabel = formatHomeMonthLabel(now, language);
  const monthLabelCapitalized = capitalizeForLocale(monthLabel, language);
  const year = now.getFullYear();

  useEffect(() => {
    if (typeof window === "undefined") return;

    setLanguage(
      applyHomeLanguagePreference(
        window.localStorage.getItem(APP_LANGUAGE_LOCAL_STORAGE_KEY)
      )
    );

    const onStorage = (ev: StorageEvent) => {
      if (ev.key && ev.key !== APP_LANGUAGE_LOCAL_STORAGE_KEY) return;
      setLanguage(applyHomeLanguagePreference(ev.newValue));
    };
    const onCustom = (ev: Event) => {
      const detail = (ev as CustomEvent<{ language?: string }>).detail;
      setLanguage(applyHomeLanguagePreference(detail?.language));
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(APP_LANGUAGE_EVENT, onCustom as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(APP_LANGUAGE_EVENT, onCustom as EventListener);
    };
  }, []);

  // auth
  useEffect(() => {
    let resolved = false;
    const readyFallbackTimer = window.setTimeout(() => {
      if (resolved) return;
      console.warn("Auth ready timeout on home page; continuing as guest.");
      setUser(null);
      setAuthReady(true);
    }, 5000);

    const unsub = onAuthStateChanged(auth, (fbUser) => {
      resolved = true;
      window.clearTimeout(readyFallbackTimer);
      if (!fbUser) {
        setUser(null);
        setAuthReady(true);
        return;
      }
      setUser(fbUser);
      setAuthReady(true);
    });

    return () => {
      resolved = true;
      window.clearTimeout(readyFallbackTimer);
      unsub();
    };
  }, []);

  useEffect(() => {
    if (!authReady) return;
    if (!user) {
      setAccessProfile(null);
      setAccessProfileError(null);
      setAccessProfileReady(true);
      return;
    }

    let cancelled = false;

    const loadProfile = (force = false) => {
      setAccessProfileReady(false);
      setAccessProfileError(null);

      getUserProfileCached(user, { maxAgeMs: 60 * 1000, force })
        .then((payload) => {
          if (cancelled) return;
          const profile = (payload?.profile ?? {}) as Record<string, unknown>;
          setAccessProfile(profile);
          if (typeof profile.language === "string") {
            setLanguage(applyHomeLanguagePreference(profile.language));
          }
        })
        .catch((error) => {
          if (cancelled) return;
          console.error("Ověření typu účtu selhalo:", error);
          setAccessProfile(null);
          setAccessProfileError(HOME_COPY.cs.profileTypeLoadError);
        })
        .finally(() => {
          if (!cancelled) setAccessProfileReady(true);
        });
    };

    loadProfile();

    const onRefreshProfile = () => {
      loadProfile(true);
    };
    window.addEventListener("app:refresh-user-profile", onRefreshProfile);

    return () => {
      cancelled = true;
      window.removeEventListener("app:refresh-user-profile", onRefreshProfile);
    };
  }, [authReady, user]);

  useEffect(() => {
    if (!authReady || !user) {
      setMailUnreadCount(0);
      return;
    }

    let cancelled = false;
    const loadUnreadCount = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      try {
        const payload = await fetchAuthedJsonOrThrow<{ unreadCount?: number }>(
          currentUser,
          "/api/mailbox?countOnly=1",
          { method: "GET" }
        );
        if (cancelled) return;
        const count = Number(payload?.unreadCount ?? 0);
        setMailUnreadCount(
          Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0
        );
      } catch (error) {
        if (!cancelled) {
          console.error("Načtení počtu nepřečtených zpráv selhalo:", error);
        }
      }
    };

    void loadUnreadCount();
    const intervalId = window.setInterval(() => {
      void loadUnreadCount();
    }, 45_000);
    const onFocus = () => {
      void loadUnreadCount();
    };
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
    };
  }, [authReady, user]);

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
      const next = normalizeQuickActions(updater(prev));
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

  const refreshHomeData = () => {
    if (!advisorDataEmail) return;
    invalidateHomeCache(advisorDataEmail);
    setHomeReloadKey((k) => k + 1);
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
      setQuickActions(normalizeQuickActions(localQA ?? QUICK_ACTIONS_DEFAULT));
    };

    const load = async () => {
      if (layoutScope === "device") {
        loadFromDevice();
        return;
      }

      try {
        if (!auth.currentUser) {
          loadFromDevice();
          return;
        }
        const payload = await getUserProfileCached(auth.currentUser, {
          maxAgeMs: 60 * 1000,
        });
        const data = (payload?.profile ?? {}) as any;

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
          const normalizedQuickActions = normalizeQuickActions(cloudQA);
          setQuickActions(normalizedQuickActions);
          const key = quickActionsKey(email);
          if (typeof window !== "undefined" && key) {
            window.localStorage.setItem(key, JSON.stringify(normalizedQuickActions));
          }
        } else {
          const localQA = readLocalQuickActions(email);
          setQuickActions(normalizeQuickActions(localQA ?? QUICK_ACTIONS_DEFAULT));
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
    const currentUser = auth.currentUser;
    if (!normalizedEmail || !currentUser) return;
    try {
      await fetchAuthedJsonOrThrow(currentUser, "/api/user/profile", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      invalidateUserProfileCache(normalizedEmail);
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
        if (!res.ok) throw new Error(copy.goldFetch.apiError);
        const j = (await res.json()) as any;
        if (j?.ok !== true) throw new Error(String(j?.message || j?.error || copy.goldFetch.dataError));

        const czkPerOz = Number(j?.czkPerOz);
        const ts = Number(j?.ts || Date.now());
        const changePctRaw = j?.changes?.d1 ?? j?.changesPct?.["1d"];
        const changePct = Number.isFinite(Number(changePctRaw)) ? Number(changePctRaw) : null;

        if (!Number.isFinite(czkPerOz) || czkPerOz <= 0) {
          throw new Error(copy.goldFetch.invalidPrice);
        }

        if (cancelled) return;
        setGoldData({ czkPerOz, ts, changePct });
      } catch (e) {
        if (!cancelled) {
          setGoldError((e as any)?.message || copy.goldFetch.priceError);
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
  }, [homeWidgets.goldWidget, goldReloadKey, copy.goldFetch]);

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
  const prevBaseProduction = myImmediatePrevSum;
  const totalWithTeam =
    baseProduction + (showTeamBox ? teamImmediateSum + myTipImmediateSum : 0);
  const totalPrevWithTeam =
    prevBaseProduction +
    (showTeamBox ? teamImmediatePrevSum + myTipImmediatePrevSum : 0);
  const totalContractsCount =
    myContractsCount + (showTeamBox ? teamContractsCount : 0);

  const monthlyGoal = userMeta?.monthlyGoal ?? null;
  const hasGoal = monthlyGoal != null && monthlyGoal > 0;
  const progress = hasGoal
    ? Math.max(0, Math.round((totalWithTeam / monthlyGoal) * 100))
    : 0;
  const progressTone =
    progress >= 90
      ? "from-emerald-400 via-lime-300 to-emerald-200"
      : progress >= 60
      ? "from-amber-400 via-orange-300 to-yellow-200"
      : "from-rose-500 via-red-400 to-orange-300";

  const showProductionSummary = homeWidgets.productionSummary;
  const showExpectedPayoutSection = shouldLoadExpectedPayout;
  const showMonthlyGoalSection = homeWidgets.monthlyGoal;
  const showLeaderboardSection = showTeamBox && homeWidgets.teamLeaderboard;
  const showChartSection = false;
  const showGoldWidget = homeWidgets.goldWidget;
  const showQuickActions = homeWidgets.quickActions;
  const reorderEnabled = widgetPanelOpen;
  const goldChangePct = goldData?.changePct ?? null;
  const isLiteUI = performanceMode === "lite";
  const goldChangeAbs =
    goldData?.czkPerOz && goldChangePct != null ? (goldData.czkPerOz * goldChangePct) / 100 : null;
  const goldDir = goldChangePct == null ? "flat" : goldChangePct > 0 ? "up" : goldChangePct < 0 ? "down" : "flat";
  const homeRefreshBusy =
    summaryLoading ||
    historyLoading ||
    cashflowLoading ||
    commissionStatementsLoading ||
    goldLoading;

  const expectedPayoutStatementsByMonthKey = useMemo(() => {
    const map: Record<string, CashflowCommissionStatementSummary[]> = {};
    commissionStatements.forEach((statement) => {
      const key = statementMonthKey(statement);
      if (!key) return;
      map[key] = [...(map[key] ?? []), statement];
    });
    return map;
  }, [commissionStatements]);

  const expectedPayout = useMemo(() => {
    const dateNow = new Date();
    const currentYear = dateNow.getFullYear();
    const currentMonth = dateNow.getMonth();
    const currentMonthKey = `${currentYear}-${currentMonth + 1}`;
    const reconciledItems = applyStatementMissingPayoutShifts({
      cashflowItems,
      statementsByMonthKey: expectedPayoutStatementsByMonthKey,
      enabled: true,
    });
    const monthGroups = applyStatementPayoutTotalsToMonths({
      monthGroups: groupItemsByMonth(reconciledItems),
      statementsByMonthKey: expectedPayoutStatementsByMonthKey,
      enabled: true,
    });
    const currentMonthGroup = monthGroups.find(
      (month) => month.key === currentMonthKey
    );

    if (!currentMonthGroup) {
      return {
        grossAmount: 0,
        stornoFundAmount: 0,
        netAmount: 0,
      };
    }

    const grossAmount = currentMonthGroup.total;
    if (currentMonthGroup.totalSource === "paid") {
      return {
        grossAmount,
        stornoFundAmount: 0,
        netAmount: grossAmount,
      };
    }

    const currentMonthItems = currentMonthGroup.items;
    const stornoFundAmount = calculateStornoFund(currentMonthItems);
    const netAmount = calculateNetCashflow(grossAmount, stornoFundAmount);
    return {
      grossAmount,
      stornoFundAmount,
      netAmount,
    };
  }, [cashflowItems, expectedPayoutStatementsByMonthKey]);

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
            language={language}
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
            language={language}
            loading={summaryLoading}
            showTeamBox={showTeamBox}
            myContractsCount={myContractsCount}
            myImmediateSum={myImmediateSum}
            myImmediatePrevSum={myImmediatePrevSum}
            myTipContractsCount={myTipContractsCount}
            myTipImmediateSum={myTipImmediateSum}
            myTipImmediatePrevSum={myTipImmediatePrevSum}
            teamContractsCount={teamContractsCount}
            teamImmediateSum={teamImmediateSum}
            teamImmediatePrevSum={teamImmediatePrevSum}
            totalContractsCount={totalContractsCount}
            totalWithTeam={totalWithTeam}
            totalPrevWithTeam={totalPrevWithTeam}
            isLiteUI={isLiteUI}
          />
        );
      case "goal":
        if (!showMonthlyGoalSection) return null;
        return (
          <MonthlyGoalSection
            language={language}
            monthlyGoal={monthlyGoal}
            progress={progress}
            progressTone={progressTone}
            loading={summaryLoading}
            isLiteUI={isLiteUI}
            onSaveGoal={saveMonthlyGoal}
          />
        );
      case "expectedPayout":
        if (!showExpectedPayoutSection) return null;
        return (
          <ExpectedPayoutSection
            language={language}
            loading={
              cashflowLoading ||
              commissionStatementsLoading ||
              (shouldLoadExpectedPayout && !!user && !commissionStatementsReady)
            }
            grossAmount={expectedPayout.grossAmount}
            stornoFundAmount={expectedPayout.stornoFundAmount}
            netAmount={expectedPayout.netAmount}
            periodLabel={`${monthLabelCapitalized} ${year}`}
            isLiteUI={isLiteUI}
          />
        );
      case "leaderboard":
        if (!showLeaderboardSection) return null;
        return (
          <TeamLeaderboardSection
            language={language}
            loading={historyLoading}
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
            className={`relative z-30 ${reorderEnabled ? "h-full" : ""} space-y-3 rounded-[24px] border border-slate-200 bg-white px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.06)] sm:px-8 sm:py-7 ${
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
                  {copy.quickActions.kicker}
                </p>
                <h2 className="text-lg font-semibold text-slate-900 sm:text-xl">
                  {copy.quickActions.title}
                </h2>
              </div>
              <div className="relative z-30">
                <button
                  type="button"
                  ref={qaButtonRef}
                  onClick={() => setQaPickerOpen((v) => !v)}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-black"
                >
                  {copy.quickActions.add}
                </button>
                {qaPickerOpen && (
                  <div
                    className="absolute right-0 top-full z-50 mt-2 max-h-[320px] w-72 space-y-2 overflow-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_12px_28px_rgba(15,23,42,0.12)]"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                        {copy.quickActions.pickerTitle}
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
                      <p className="text-xs text-slate-600">{copy.quickActions.allAdded}</p>
                    ) : (
                      availableQA.map((opt) => {
                        const actionText = resolveQuickActionText(opt, language);
                        return (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() => {
                              persistQuickActions((prev) => [...prev, opt]);
                              setQaPickerOpen(false);
                            }}
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm text-slate-900 transition hover:bg-white"
                          >
                            <div className="font-semibold">{actionText.title}</div>
                            <div className="text-[11px] text-slate-500">
                              {actionText.category ?? copy.quickActions.categoryFallback}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            </div>

            {quickActions.length === 0 ? (
              <p className="text-sm text-slate-600">
                {copy.quickActions.empty}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {quickActions.map((qa) => {
                  const actionText = resolveQuickActionText(qa, language);
                  return (
                    <div
                      key={qa.key}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900"
                    >
                      <Link href={qa.href} className="hover:text-slate-700">
                        {actionText.title}
                      </Link>
                      <button
                        type="button"
                        onClick={() =>
                          persistQuickActions((prev) => prev.filter((item) => item.key !== qa.key))
                        }
                        className="text-[12px] text-slate-500 hover:text-rose-600"
                        aria-label={`${copy.quickActions.removeAriaPrefix} ${actionText.title}`}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      case "chart":
        if (!showChartSection) return null;
        return (
          <ProductionChartSection
            loading={historyLoading}
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
    summary: showTeamBox ? "md:col-span-2" : "md:col-span-1",
    expectedPayout: "md:col-span-1",
    goal: "md:col-span-1",
    leaderboard: "md:col-span-1",
    quickActions: "md:col-span-1",
    chart: "md:col-span-2",
  };

  const sectionRowSpan: Record<HomeSection, string> = {
    gold: "",
    summary: "",
    expectedPayout: "",
    goal: "",
    leaderboard: "",
    quickActions: "",
    chart: "",
  };

  const saveMonthlyGoal = async (value: number) => {
    const currentUser = auth.currentUser;
    if (!normalizedEmail || !currentUser) return;
    try {
      invalidateHomeCache(normalizedEmail);
      await fetchAuthedJsonOrThrow(currentUser, "/api/user/profile", {
        method: "PATCH",
        body: JSON.stringify({ monthlyGoal: value }),
      });
      invalidateUserProfileCache(normalizedEmail);
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
      const adviserName = cleanDisplayName(entry.adviserName);
      const existing = map.get(email);
      if (!existing || adviserName) {
        map.set(email, { email, name: adviserName || existing?.name || nameFromEmail(email) });
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, HOME_LOCALES[language])
    );
  }, [language, teamEntries]);

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
      const shortMonth = formatHomeMonthShortLabel(d, language);
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
  }, [chartEntries, language]);

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
    const names = new Map<string, string>();

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
      const adviserName = cleanDisplayName(entry.adviserName);
      if (adviserName || !names.has(email)) {
        names.set(email, adviserName || nameFromEmail(email));
      }

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
        name: names.get(email) || nameFromEmail(email),
        totalPremium,
      }))
      .sort((a, b) => b.totalPremium - a.totalPremium);

    return rows;
  }, [isManager, hasTeam, teamEntries, lbProductFilter, lbRange]);

  const leaderboardLabel =
    lbProductFilter === "life"
      ? copy.leaderboard.life
      : copy.leaderboard.other;

  const isSectionVisible = (sec: HomeSection) => {
    switch (sec) {
      case "gold":
        return showGoldWidget;
      case "summary":
        return showProductionSummary;
      case "goal":
        return showMonthlyGoalSection;
      case "expectedPayout":
        return showExpectedPayoutSection;
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

  if (!authReady) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white text-slate-900">
        <div className="text-sm text-slate-700">{copy.authLoading}</div>
      </main>
    );
  }

  if (!user) {
    return <AppLayout active="home">{null}</AppLayout>;
  }

  if (!accessProfileReady) {
    return (
      <AppLayout active="home">
        <div className="flex min-h-[70vh] w-full items-center justify-center bg-slate-50 px-4">
          <div
            className="h-14 w-14 animate-spin rounded-full border-[4px] border-current border-t-transparent text-slate-700"
            role="status"
            aria-label={copy.authCheckAria}
          />
        </div>
      </AppLayout>
    );
  }

  if (accessProfileError) {
    return (
      <AppLayout active="home">
        <div className="flex min-h-[70vh] w-full items-center justify-center bg-slate-50 px-4">
          <div className="rounded-3xl border border-rose-200 bg-white px-5 py-4 text-sm font-medium text-rose-800 shadow-[0_18px_42px_rgba(15,23,42,0.08)]">
            {accessProfileError === HOME_COPY.cs.profileTypeLoadError
              ? copy.profileTypeLoadError
              : accessProfileError}
          </div>
        </div>
      </AppLayout>
    );
  }

  if (accountType === "tipster") {
    return (
      <AppLayout active="home">
        <TipsterHomeView user={user} profile={accessProfile ?? {}} language={language} />
      </AppLayout>
    );
  }

  return (
    <AppLayout active="home">
      {user && <AutoAnniversaryModal userEmail={user.email} />}
      {portalLinksModalOpen && (
        <InstitutionPortalLinksModal onClose={() => setPortalLinksModalOpen(false)} />
      )}
      <div className="relative isolate w-full overflow-hidden bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_52%,#f8fafc_100%)] px-3 py-6 sm:px-4 sm:py-8 lg:px-8">
        <HomeBackgroundLines />
        <div className="relative z-10 mx-auto w-full max-w-6xl min-w-0 space-y-6 font-mono text-slate-900">
        <div className="pt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SplitTextHeading text={`${copy.homeHeadingPrefix} ${monthLabelCapitalized} ${year}`} />
          <div className="self-start flex items-center gap-3">
            <button
              type="button"
              onClick={refreshHomeData}
              disabled={!advisorDataEmail || homeRefreshBusy}
              className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-slate-900 bg-white text-slate-900 shadow-[0_12px_24px_rgba(15,23,42,0.12)] transition hover:scale-[1.03] hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2 sm:hidden"
              aria-label={copy.reloadData}
              title={copy.reloadData}
            >
              <RefreshCw
                size={20}
                aria-hidden="true"
                className={homeRefreshBusy ? "animate-spin" : ""}
              />
            </button>

            <button
              type="button"
              onClick={() => setPortalLinksModalOpen(true)}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-pink-500 bg-gradient-to-br from-pink-500 to-rose-600 px-4 text-sm font-bold text-white shadow-[0_12px_24px_rgba(219,39,119,0.32)] transition hover:scale-[1.03] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300 focus-visible:ring-offset-2"
              aria-label="Portály"
              title="Portály"
            >
              <Globe2 size={20} aria-hidden="true" />
              <span>Portály</span>
            </button>

            <Link
              href="/posta"
              className="relative inline-flex h-12 w-12 items-center justify-center rounded-full border border-blue-700 bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-[0_12px_24px_rgba(37,99,235,0.35)] transition hover:scale-[1.03] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2"
              aria-label={copy.mail}
              title={copy.mail}
            >
              <Mail size={21} aria-hidden="true" />
              {mailUnreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 inline-flex min-w-[22px] items-center justify-center rounded-full border border-white bg-rose-600 px-1.5 text-[10px] font-bold leading-5 text-white shadow-[0_5px_12px_rgba(190,18,60,0.4)]">
                  {mailUnreadCount > 99 ? "99+" : mailUnreadCount}
                </span>
              ) : null}
            </Link>

            <div className="relative z-30">
              <button
                type="button"
                onClick={() => setWidgetPanelOpen((prev) => !prev)}
                className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-slate-900 bg-slate-900 text-white shadow-[0_12px_24px_rgba(15,23,42,0.28)] transition hover:scale-[1.03] hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
                aria-label={copy.customizeHomeAria}
                title={copy.customizeButtonTitle}
              >
                <SlidersHorizontal size={21} aria-hidden="true" className="opacity-90" />
              </button>

              {widgetPanelOpen && (
                <div className="fixed left-1/2 top-[min(42vh,22rem)] z-50 max-h-[calc(100vh-7rem)] w-[calc(100vw-2rem)] max-w-[20rem] -translate-x-1/2 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_12px_28px_rgba(15,23,42,0.12)] sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:z-40 sm:mt-2 sm:w-72 sm:max-w-none sm:translate-x-0 sm:overflow-visible">
                  <div className="flex items-center justify-between gap-2 pb-2">
                    <div className="text-sm font-semibold text-slate-900">
                      {copy.customizeTitle}
                    </div>
                    <button
                      type="button"
                      onClick={() => setWidgetPanelOpen(false)}
                      className="rounded-full border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 transition hover:bg-slate-50"
                      aria-label={copy.close}
                    >
                      ×
                    </button>
                  </div>

                  <div className="space-y-2 text-sm text-slate-700">
                    {[
                      { key: "productionSummary", label: copy.widgetLabels.productionSummary, disabled: false },
                      { key: "expectedPayout", label: copy.widgetLabels.expectedPayout, disabled: false },
                      { key: "monthlyGoal", label: copy.widgetLabels.monthlyGoal, disabled: false },
                      { key: "goldWidget", label: copy.widgetLabels.goldWidget, disabled: false },
                      {
                        key: "teamLeaderboard",
                        label: copy.widgetLabels.teamLeaderboard,
                        disabled: !showTeamBox,
                        note: copy.managerOnlyNote,
                      },
                      { key: "quickActions", label: copy.widgetLabels.quickActions, disabled: false },
                    ].map((opt) => {
                    const checked = homeWidgets[opt.key as keyof HomeWidgets];
                    const disabled = opt.disabled;
                    return (
                      <label
                        key={opt.key}
                        className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${
                          disabled
                            ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-50"
                            : "cursor-pointer border-slate-200 bg-slate-50 hover:bg-white"
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
                <div className="mt-3 flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-semibold text-slate-900">{copy.performance.title}</span>
                    <span className="text-[11px] text-slate-500">
                      {performanceMode === "lite"
                        ? copy.performance.liteDescription
                        : copy.performance.defaultDescription}
                    </span>
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                    <span className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                      {performanceMode === "lite" ? copy.performance.liteLabel : copy.performance.defaultLabel}
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
                <div className="mt-3 flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-semibold text-slate-900">{copy.storage.title}</span>
                    <span className="text-[11px] text-slate-500">
                      {layoutScope === "cloud"
                        ? copy.storage.cloudDescription
                        : copy.storage.deviceDescription}
                    </span>
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                    <span className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                      {layoutScope === "cloud" ? copy.storage.cloudLabel : copy.storage.deviceLabel}
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
                    ? copy.storage.cloudHelp
                    : copy.storage.deviceHelp}
                </p>
              </div>
            )}
          </div>
        </div>
        </div>

        <div
          className={
            reorderEnabled
              ? "grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 grid-flow-row-dense"
              : "columns-1 md:columns-2 [column-gap:1rem] sm:[column-gap:1.25rem]"
          }
        >
          {visibleSections.map((sec) => {
            const isDragging = draggingSection === sec;
            const isHoverTarget = reorderEnabled && hoverSection === sec && !isDragging;

            return (
              <div
                key={sec}
                className={
                  reorderEnabled
                    ? [sectionSpan[sec], sectionRowSpan[sec]].filter(Boolean).join(" ")
                    : `mb-4 break-inside-avoid sm:mb-5 ${
                        sec === "summary" || sec === "chart" ? "md:[column-span:all]" : ""
                      }`
                }
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
                  } ${reorderEnabled ? "h-full" : ""}`}
                >
                  {reorderEnabled && (
                    <div className="pointer-events-none absolute right-3 top-3 z-10">
                      <span className="inline-flex items-center gap-2 rounded-full border border-slate-900 bg-slate-900 px-3 py-1 text-[11px] font-semibold text-white shadow-sm">
                        {copy.dragToMove}
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
