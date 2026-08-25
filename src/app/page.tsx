// src/app/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactElement } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  BarChart3,
  Coins,
  Gauge,
  Globe2,
  Mail,
  Radar,
  RefreshCw,
  SlidersHorizontal,
  Target,
  Trophy,
  WalletCards,
  X,
  Zap,
} from "lucide-react";

import { auth } from "./firebase";
import {
  onAuthStateChanged,
  type User as FirebaseUser,
} from "firebase/auth";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import {
  readAdminImpersonationState,
  resolveUserProfilePatchRequest,
} from "@/app/lib/adminImpersonation";
import {
  effectiveUserEmail,
  useEffectiveUserEmail,
} from "@/app/lib/useAdminImpersonation";
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
import { GlobalSearchCommand } from "@/components/search/GlobalSearchCommand";
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
  type PerformanceMode,
  type QuickAction,
  type TeamLeaderboardEntry,
} from "./home/types";

const GoldWidget = dynamic(
  () => import("./home/components/GoldWidget").then((mod) => mod.GoldWidget),
  { ssr: false }
);
const ExpectedPayoutWidget = dynamic(
  () =>
    import("./home/components/ExpectedPayoutWidget").then(
      (mod) => mod.ExpectedPayoutWidget
    ),
  { ssr: false }
);
const MonthlyGoalSection = dynamic(
  () =>
    import("./home/components/MonthlyGoalSection").then(
      (mod) => mod.MonthlyGoalSection
    ),
  { ssr: false }
);
const ProductionChartSection = dynamic(
  () =>
    import("./home/components/ProductionChartSection").then(
      (mod) => mod.ProductionChartSection
    ),
  { ssr: false }
);
const ProductionSummarySection = dynamic(
  () =>
    import("./home/components/ProductionSummarySection").then(
      (mod) => mod.ProductionSummarySection
    ),
  { ssr: false }
);
const TeamLeaderboardSection = dynamic(
  () =>
    import("./home/components/TeamLeaderboardSection").then(
      (mod) => mod.TeamLeaderboardSection
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
  const [accessProfileHasTeam, setAccessProfileHasTeam] = useState(false);
  const [mailUnreadCount, setMailUnreadCount] = useState(0);
  const normalizedEmail = useEffectiveUserEmail(user?.email) || null;
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
  const teamHistoryMonths = useMemo(() => {
    if (!shouldLoadAdvisorHome || !homeWidgets.teamLeaderboard) return 0;
    if (lbRange === "sixMonths") return 6;
    if (lbRange === "year") return 12;
    return 0;
  }, [lbRange, homeWidgets.teamLeaderboard, shouldLoadAdvisorHome]);

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
    teamHistoryMonths,
    initialHasTeam: accessProfileHasTeam,
    reloadKey: homeReloadKey,
  });
  const [expectedPayoutLoading, setExpectedPayoutLoading] = useState(false);

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
      setAccessProfileHasTeam(false);
      setAccessProfileError(null);
      setAccessProfileReady(true);
      return;
    }

    let cancelled = false;
    const requestScopeEmail = normalizedEmail;

    const loadProfile = (force = false) => {
      setAccessProfileReady(false);
      setAccessProfileError(null);

      getUserProfileCached(user, { maxAgeMs: 60 * 1000, force })
        .then((payload) => {
          if (
            cancelled ||
            effectiveUserEmail(auth.currentUser?.email) !== requestScopeEmail
          ) return;
          const profile = (payload?.profile ?? {}) as Record<string, unknown>;
          setAccessProfile(profile);
          setAccessProfileHasTeam(payload?.hasTeam === true);
          if (typeof profile.language === "string") {
            setLanguage(applyHomeLanguagePreference(profile.language));
          }
        })
        .catch((error) => {
          if (
            cancelled ||
            effectiveUserEmail(auth.currentUser?.email) !== requestScopeEmail
          ) return;
          console.error("Ověření typu účtu selhalo:", error);
          setAccessProfile(null);
          setAccessProfileHasTeam(false);
          setAccessProfileError(HOME_COPY.cs.profileTypeLoadError);
        })
        .finally(() => {
          if (
            !cancelled &&
            effectiveUserEmail(auth.currentUser?.email) === requestScopeEmail
          ) {
            setAccessProfileReady(true);
          }
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
  }, [authReady, normalizedEmail, user]);

  useEffect(() => {
    if (!authReady || !user) {
      setMailUnreadCount(0);
      return;
    }

    let cancelled = false;
    const requestScopeEmail = normalizedEmail;
    const loadUnreadCount = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      try {
        const payload = await fetchAuthedJsonOrThrow<{ unreadCount?: number }>(
          currentUser,
          "/api/mailbox?countOnly=1",
          { method: "GET" }
        );
        if (
          cancelled ||
          effectiveUserEmail(auth.currentUser?.email) !== requestScopeEmail
        ) return;
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
  }, [authReady, normalizedEmail, user]);

  const pushHomeSettingsToCloud = useCallback(async (payload: {
    homeLayout?: HomeSection[];
    homeWidgets?: HomeWidgets;
    homePerformanceMode?: PerformanceMode;
    homeQuickActions?: QuickAction[];
  }) => {
    const currentUser = auth.currentUser;
    if (!normalizedEmail || !currentUser) return;
    if (effectiveUserEmail(currentUser.email) !== normalizedEmail) return;
    const profilePatch = resolveUserProfilePatchRequest();
    try {
      await fetchAuthedJsonOrThrow(currentUser, profilePatch.url, {
        method: "PATCH",
        headers: profilePatch.headers,
        body: JSON.stringify(payload),
      });
      invalidateUserProfileCache(normalizedEmail);
    } catch (e) {
      console.error("Uložení nastavení domova selhalo", e);
    }
  }, [normalizedEmail]);

  const persistHomeWidgets = (updater: (prev: HomeWidgets) => HomeWidgets) => {
    setHomeWidgets((prev) => {
      const next = updater(prev);
      const key = homeWidgetsKey(normalizedEmail);
      if (typeof window !== "undefined" && key) {
        window.localStorage.setItem(key, JSON.stringify(next));
      }
      void pushHomeSettingsToCloud({ homeWidgets: next });
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
      void pushHomeSettingsToCloud({ homeQuickActions: next });
      return next;
    });
  };

  const persistHomeLayout = (next: HomeSection[]) => {
    setHomeLayout(next);
    const key = homeLayoutKey(normalizedEmail);
    if (typeof window !== "undefined" && key) {
      window.localStorage.setItem(key, JSON.stringify(next));
    }
    void pushHomeSettingsToCloud({ homeLayout: next });
  };

  const handleWidgetToggle = (key: keyof HomeWidgets) => {
    persistHomeWidgets((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const updatePerformanceMode = (mode: PerformanceMode) => {
    setPerformanceMode(mode);
    const key = homePerformanceKey(normalizedEmail);
    if (typeof window !== "undefined" && key) {
      window.localStorage.setItem(key, mode);
    }
    void pushHomeSettingsToCloud({ homePerformanceMode: mode });
  };

  const refreshHomeData = () => {
    if (!advisorDataEmail) return;
    invalidateHomeCache(advisorDataEmail);
    setHomeReloadKey((k) => k + 1);
    setGoldReloadKey((k) => k + 1);
  };

  // Nastavení domova jsou vždy synchronizována s profilem; lokální uložiště slouží
  // jen jako okamžitá záloha při nedostupném připojení.
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

        const settingsToSynchronize: {
          homeLayout?: HomeSection[];
          homeWidgets?: HomeWidgets;
          homePerformanceMode?: PerformanceMode;
          homeQuickActions?: QuickAction[];
        } = {};

        if (cloudLayout && Array.isArray(cloudLayout) && cloudLayout.length > 0) {
          const normalized = normalizeHomeLayout(cloudLayout as HomeSection[]);
          setHomeLayout(normalized);
          const key = homeLayoutKey(email);
          if (typeof window !== "undefined" && key) {
            window.localStorage.setItem(key, JSON.stringify(normalized));
          }
        } else {
          const fallbackLayout = normalizeHomeLayout(readLocalHomeLayout(email));
          setHomeLayout(fallbackLayout);
          settingsToSynchronize.homeLayout = fallbackLayout;
        }

        if (cloudWidgets) {
          const merged = { ...HOME_WIDGETS_DEFAULT, ...cloudWidgets };
          setHomeWidgets(merged);
          const key = homeWidgetsKey(email);
          if (typeof window !== "undefined" && key) {
            window.localStorage.setItem(key, JSON.stringify(merged));
          }
        } else {
          const fallbackWidgets = readLocalHomeWidgets(email) ?? HOME_WIDGETS_DEFAULT;
          setHomeWidgets(fallbackWidgets);
          settingsToSynchronize.homeWidgets = fallbackWidgets;
        }

        if (cloudQA && Array.isArray(cloudQA)) {
          const normalizedQuickActions = normalizeQuickActions(cloudQA);
          setQuickActions(normalizedQuickActions);
          const key = quickActionsKey(email);
          if (typeof window !== "undefined" && key) {
            window.localStorage.setItem(key, JSON.stringify(normalizedQuickActions));
          }
        } else {
          const fallbackQuickActions = normalizeQuickActions(
            readLocalQuickActions(email) ?? QUICK_ACTIONS_DEFAULT,
          );
          setQuickActions(fallbackQuickActions);
          settingsToSynchronize.homeQuickActions = fallbackQuickActions;
        }

        if (cloudPerf) {
          setPerformanceMode(cloudPerf);
          const key = homePerformanceKey(email);
          if (typeof window !== "undefined" && key) {
            window.localStorage.setItem(key, cloudPerf);
          }
        } else {
          const fallbackPerformanceMode = readLocalPerformanceMode(email) ?? PERFORMANCE_DEFAULT;
          setPerformanceMode(fallbackPerformanceMode);
          settingsToSynchronize.homePerformanceMode = fallbackPerformanceMode;
        }

        if (Object.keys(settingsToSynchronize).length > 0) {
          void pushHomeSettingsToCloud(settingsToSynchronize);
        }
      } catch (e) {
        console.error("Načtení nastavení domova selhalo", e);
        loadFromDevice();
      }
    };

    load();
  }, [normalizedEmail, pushHomeSettingsToCloud]);

  useEffect(() => {
    homeLayoutRef.current = homeLayout;
  }, [homeLayout]);

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
    let requestInFlight = false;
    const loadGold = async () => {
      if (requestInFlight) return;
      requestInFlight = true;
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
        requestInFlight = false;
        if (!cancelled) setGoldLoading(false);
      }
    };
    void loadGold();
    const intervalId = window.setInterval(() => {
      void loadGold();
    }, 5 * 60_000);
    const handleWindowFocus = () => {
      void loadGold();
    };
    window.addEventListener("focus", handleWindowFocus);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [homeWidgets.goldWidget, goldReloadKey, copy.goldFetch]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = homeLayoutKey(normalizedEmail);
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
  }, [normalizedEmail]);

  const isManager = isManagerPosition(userMeta?.position ?? null) || hasTeam;
  const showTeamBox = hasTeam;
  const hasTipContract = myTipContractsCount > 0;
  // Poradce bez týmu potřebuje plnou šířku až ve chvíli, kdy vedle vlastní
  // produkce zobrazujeme také samostatnou kartu tipařské produkce.
  const shouldExpandProductionSummary = showTeamBox || hasTipContract;

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
    expectedPayoutLoading ||
    goldLoading;

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
          <ExpectedPayoutWidget
            language={language}
            user={user}
            advisorDataEmail={advisorDataEmail}
            homeReloadKey={homeReloadKey}
            periodLabel={`${monthLabelCapitalized} ${year}`}
            isLiteUI={isLiteUI}
            onLoadingChange={setExpectedPayoutLoading}
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
            className={`relative z-30 space-y-3 rounded-[24px] border border-slate-200 bg-white px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.06)] sm:px-8 sm:py-7 ${
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

  const saveMonthlyGoal = async (value: number) => {
    const currentUser = auth.currentUser;
    if (!normalizedEmail || !currentUser) return;
    if (effectiveUserEmail(currentUser.email) !== normalizedEmail) return;
    const profilePatch = resolveUserProfilePatchRequest();
    try {
      invalidateHomeCache(normalizedEmail);
      await fetchAuthedJsonOrThrow(currentUser, profilePatch.url, {
        method: "PATCH",
        headers: profilePatch.headers,
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
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    twelveMonthsAgo.setHours(0, 0, 0, 0);

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
        if (signed < twelveMonthsAgo) continue;
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
    <AppLayout active="home" desktopGlobalSearch={false}>
      {portalLinksModalOpen && (
        <InstitutionPortalLinksModal onClose={() => setPortalLinksModalOpen(false)} />
      )}
      <div className="relative isolate w-full overflow-hidden bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_52%,#f8fafc_100%)] px-3 py-6 sm:px-4 sm:py-8 lg:px-8">
        <HomeBackgroundLines />
        <div className="relative z-10 mx-auto w-full max-w-6xl min-w-0 space-y-6 font-mono text-slate-900">
        <div className="pt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SplitTextHeading text={`${copy.homeHeadingPrefix} ${monthLabelCapitalized} ${year}`} />
          <div className="self-start w-full sm:w-[29.5rem]">
            <div className="flex flex-wrap items-center justify-end gap-3">
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
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-pink-500 bg-gradient-to-br from-pink-500 to-rose-600 px-4 text-sm font-bold !text-white shadow-[0_12px_24px_rgba(219,39,119,0.32)] transition hover:scale-[1.03] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300 focus-visible:ring-offset-2 [&_svg]:!stroke-white"
              aria-label="Portály"
              title="Portály"
            >
              <Globe2 size={20} aria-hidden="true" />
              <span>Portály</span>
            </button>

            <Link
              href="/pomucky/radar-vyroci"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-violet-600 bg-gradient-to-br from-violet-600 to-indigo-700 px-4 text-sm font-bold !text-white shadow-[0_12px_24px_rgba(109,40,217,0.32)] transition hover:scale-[1.03] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-2 [&_svg]:!stroke-white"
              aria-label="Radar výročí"
              title="Radar výročí"
            >
              <Radar size={20} aria-hidden="true" />
              <span>Výročí</span>
            </Link>

            <Link
              href="/posta"
              className="relative inline-flex h-12 items-center justify-center gap-2 rounded-full border border-blue-700 bg-gradient-to-br from-blue-600 to-indigo-700 px-4 text-sm font-bold !text-white shadow-[0_12px_24px_rgba(37,99,235,0.35)] transition hover:scale-[1.03] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 [&_svg]:!stroke-white"
              aria-label={copy.mail}
              title={copy.mail}
            >
              <Mail size={21} aria-hidden="true" />
              <span>{copy.mail}</span>
              {mailUnreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 inline-flex min-w-[22px] items-center justify-center rounded-full border border-white bg-rose-600 px-1.5 text-[10px] font-bold leading-5 !text-white shadow-[0_5px_12px_rgba(190,18,60,0.4)]">
                  {mailUnreadCount > 99 ? "99+" : mailUnreadCount}
                </span>
              ) : null}
            </Link>

            <div className="relative z-[100]">
              <button
                type="button"
                onClick={() => setWidgetPanelOpen((prev) => !prev)}
                className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-slate-900 bg-slate-900 !text-white shadow-[0_12px_24px_rgba(15,23,42,0.28)] transition hover:scale-[1.03] hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2 [&_svg]:!stroke-white"
                aria-label={copy.customizeHomeAria}
                title={copy.customizeButtonTitle}
              >
                <SlidersHorizontal size={21} aria-hidden="true" className="opacity-90" />
              </button>

              {widgetPanelOpen && (
                <div className="fixed left-1/2 top-[min(42vh,22rem)] z-[110] max-h-[calc(100vh-7rem)] w-[calc(100vw-2rem)] max-w-[24rem] -translate-x-1/2 overflow-y-auto rounded-[26px] border border-violet-100 bg-white p-2 shadow-[0_24px_70px_rgba(49,25,105,0.28)] sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:z-[110] sm:mt-3 sm:w-[23rem] sm:max-w-none sm:translate-x-0">
                  <div className="rounded-[20px] bg-gradient-to-br from-violet-700 via-violet-600 to-indigo-800 px-4 py-4 !text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/25 bg-white/15 [&_svg]:!stroke-white">
                          <SlidersHorizontal size={19} aria-hidden="true" />
                        </span>
                        <div className="text-base font-extrabold !text-white">{copy.customizeTitle}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setWidgetPanelOpen(false)}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/10 !text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white [&_svg]:!stroke-white"
                        aria-label={copy.close}
                      >
                        <X size={16} aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 px-1 pb-1 pt-3">
                    {[
                      { key: "productionSummary" as const, label: copy.widgetLabels.productionSummary, icon: BarChart3, iconClass: "bg-violet-100 text-violet-700", disabled: false },
                      { key: "expectedPayout" as const, label: copy.widgetLabels.expectedPayout, icon: WalletCards, iconClass: "bg-fuchsia-100 text-fuchsia-700", disabled: false },
                      { key: "monthlyGoal" as const, label: copy.widgetLabels.monthlyGoal, icon: Target, iconClass: "bg-rose-100 text-rose-700", disabled: false },
                      { key: "goldWidget" as const, label: copy.widgetLabels.goldWidget, icon: Coins, iconClass: "bg-amber-100 text-amber-700", disabled: false },
                      { key: "teamLeaderboard" as const, label: copy.widgetLabels.teamLeaderboard, icon: Trophy, iconClass: "bg-sky-100 text-sky-700", disabled: !showTeamBox, note: copy.managerOnlyNote },
                      { key: "quickActions" as const, label: copy.widgetLabels.quickActions, icon: Zap, iconClass: "bg-emerald-100 text-emerald-700", disabled: false },
                    ].map((opt) => {
                      const checked = homeWidgets[opt.key];
                      const Icon = opt.icon;
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          role="switch"
                          aria-checked={checked}
                          disabled={opt.disabled}
                          onClick={() => handleWidgetToggle(opt.key)}
                          className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                            opt.disabled
                              ? "cursor-not-allowed border-slate-100 bg-slate-50 opacity-55"
                              : "border-slate-200 bg-slate-50/80 hover:border-violet-200 hover:bg-violet-50/60"
                          }`}
                        >
                          <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${opt.iconClass}`}>
                            <Icon size={18} aria-hidden="true" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-slate-800">{opt.label}</span>
                            {opt.note && opt.disabled ? (
                              <span className="mt-0.5 block text-[11px] text-slate-500">{opt.note}</span>
                            ) : null}
                          </span>
                          <span className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-violet-700" : "bg-slate-300"}`}>
                            <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`} />
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={performanceMode === "default"}
                    onClick={() => updatePerformanceMode(performanceMode === "lite" ? "default" : "lite")}
                    className="mx-1 mb-1 mt-3 flex w-[calc(100%_-_0.5rem)] items-center gap-3 rounded-2xl border border-violet-100 bg-violet-50/70 p-3 text-left transition hover:bg-violet-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                  >
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-violet-700 shadow-sm">
                      <Gauge size={18} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-slate-900">{copy.performance.title}</span>
                      <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">
                        {performanceMode === "lite" ? copy.performance.liteDescription : copy.performance.defaultDescription}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-violet-700">
                        {performanceMode === "lite" ? copy.performance.liteLabel : copy.performance.defaultLabel}
                      </span>
                      <span className={`mt-1.5 inline-flex h-5 w-9 rounded-full p-0.5 transition ${performanceMode === "default" ? "bg-violet-700" : "bg-slate-300"}`}>
                        <span className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${performanceMode === "default" ? "translate-x-4" : "translate-x-0"}`} />
                      </span>
                    </span>
                  </button>
                  <p className="px-3 pb-2 pt-2 text-center text-[11px] leading-4 text-slate-500">
                    Nastavení domova se synchronizuje na všech tvých zařízeních.
                  </p>
                </div>
              )}
            </div>
            <div className="mt-3 w-full">
              <GlobalSearchCommand user={user} dialogBelowDesktopHeader={false} />
            </div>
          </div>
        </div>
        </div>

        <div className="columns-1 md:columns-2 [column-gap:1rem] sm:[column-gap:1.25rem]">
          {visibleSections.map((sec) => {
            const isDragging = draggingSection === sec;
            const isHoverTarget = reorderEnabled && hoverSection === sec && !isDragging;

            return (
              <div
                key={sec}
                className={`mb-4 break-inside-avoid sm:mb-5 ${
                  (sec === "summary" && shouldExpandProductionSummary) || sec === "chart"
                    ? "md:[column-span:all]"
                    : ""
                }`}
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
