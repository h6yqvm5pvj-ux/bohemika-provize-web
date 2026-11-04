// src/app/page.tsx
"use client";

import { useMailboxRefresh } from "./posta/useMailboxRefresh";

import homeWidgetStyles from "./home/components/homeWidgets.module.css";
import { QuickActionsContent } from "./home/components/QuickActionsContent";
import { HomeCustomizationPanel } from "./home/components/HomeCustomizationPanel";
import { HomeProductionHelp } from "./home/components/HomeProductionHelp";
import { HomePageSurface } from "./home/components/HomePageSurface";
import { isInheritedContract } from "@/app/lib/inheritedContracts";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactElement } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Globe2,
  Mail,
  Radar,
  RefreshCw,
  SlidersHorizontal,
  Smartphone,
} from "lucide-react";

import { auth } from "./firebase";
import {
  onAuthStateChanged,
  type User as FirebaseUser,
} from "firebase/auth";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import { OPEN_CONTACT_DIRECTORY_EVENT } from "@/app/lib/contactDirectory";
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
import headerStyles from "./home/components/homeHeader.module.css";
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

import { DeferredHomeWidget } from "./home/components/DeferredHomeWidget";
import { ExpectedPayoutSection } from "./home/components/ExpectedPayoutSection";

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
const ContactsModal = dynamic(
  () =>
    import("./pomucky/ContactsModal").then((mod) => mod.ContactsModal),
  { ssr: false }
);

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const TEAM_ONLY_PRODUCTION_EMAILS = new Set(["petr.rauscher@bohemika.eu"]);

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

function cleanDisplayName(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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
  },
};

const QUICK_ACTION_OPTIONS: QuickAction[] = [
  { key: "argumenty", title: "Argumenty", href: "/pomucky/argumenty", category: "Obecné" },
  { key: "dokumenty", title: "Dokumenty", href: "/pomucky/dokumenty", category: "Obecné" },
  { key: "zaznam", title: "Záznam z jednání", href: "/pomucky/zaznam", category: "Obecné" },
  { key: "nahrada-smlouvy", title: "Náhrada smlouvy", href: "/pomucky/nahrada-smlouvy", category: "Obecné" },
  { key: "tvorba", title: "Tvorba", href: "/pomucky/tvorba", category: "Obecné" },
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

const normalizeHomeWidgets = (input: unknown): HomeWidgets => {
  const normalized = { ...HOME_WIDGETS_DEFAULT };
  if (!input || typeof input !== "object" || Array.isArray(input)) return normalized;
  const raw = input as Record<string, unknown>;
  for (const key of Object.keys(HOME_WIDGETS_DEFAULT) as (keyof HomeWidgets)[]) {
    if (typeof raw[key] === "boolean") normalized[key] = raw[key];
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
    return normalizeHomeWidgets(JSON.parse(raw));
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
  const [homeLayout, setHomeLayout] = useState<HomeSection[]>(HOME_LAYOUT_DEFAULT);
  const [draggingSection, setDraggingSection] = useState<HomeSection | null>(null);
  const [hoverSection, setHoverSection] = useState<HomeSection | null>(null);
  const homeLayoutRef = useRef<HomeSection[]>(HOME_LAYOUT_DEFAULT);
  const layoutDirtyRef = useRef(false);
  const [performanceMode, setPerformanceMode] = useState<PerformanceMode>(PERFORMANCE_DEFAULT);
  const [homeReloadKey, setHomeReloadKey] = useState(0);
  const [subPickerOpen, setSubPickerOpen] = useState(false);
  const [subSearch, setSubSearch] = useState("");
  const [portalLinksModalOpen, setPortalLinksModalOpen] = useState(false);
  const [contactsModalOpen, setContactsModalOpen] = useState(false);
  const [contactsTargetId, setContactsTargetId] = useState<string | null>(null);
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
  const showOnlyTeamProduction =
    effectiveAdvisorEmail != null &&
    TEAM_ONLY_PRODUCTION_EMAILS.has(effectiveAdvisorEmail);
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
    monthlyLeaderboard,
    hasTeam,
    myPremiums,
    teamPremiums,
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
    summaryError,
    summaryUpdatedAt,
    summaryRefreshing,
    historyUpdatedAt,
    historyError,
    tipSummaryLoading,
    tipSummaryError,
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
    let active = true;
    // Hydrate the browser preference after mount; ignore an unmounted page.
    queueMicrotask(() => {
      if (active) setLanguage(applyHomeLanguagePreference(
        window.localStorage.getItem(APP_LANGUAGE_LOCAL_STORAGE_KEY)
      ));
    });

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
      active = false;
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(APP_LANGUAGE_EVENT, onCustom as EventListener);
    };
  }, []);

  // auth
  useEffect(() => {
    let resolved = false;
    let lastUserId: string | null = null;
    const clearProfileState = (ready: boolean) => {
      setAccessProfile(null);
      setAccessProfileHasTeam(false);
      setAccessProfileError(null);
      setAccessProfileReady(ready);
      setMailUnreadCount(0);
    };
    const clearSignedOutState = () => {
      lastUserId = null;
      setUser(null);
      clearProfileState(true);
      setAuthReady(true);
    };
    const readyFallbackTimer = window.setTimeout(() => {
      if (resolved) return;
      console.warn("Auth ready timeout on home page; continuing as guest.");
      clearSignedOutState();
    }, 5000);

    const unsub = onAuthStateChanged(auth, (fbUser) => {
      resolved = true;
      window.clearTimeout(readyFallbackTimer);
      if (!fbUser) {
        clearSignedOutState();
        return;
      }
      // A restored/switched account must load its own profile before using home data.
      if (fbUser.uid !== lastUserId) clearProfileState(false);
      lastUserId = fbUser.uid;
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
    const openContacts = (contactId: string | null = null) => {
      setContactsTargetId(contactId);
      setContactsModalOpen(true);
    };
    const handleOpenContacts = (event: Event) => {
      const detail = (event as CustomEvent<{ contactId?: string | null }>).detail;
      openContacts(detail?.contactId ?? null);
    };

    window.addEventListener(OPEN_CONTACT_DIRECTORY_EVENT, handleOpenContacts);
    const url = new URL(window.location.href);
    if (url.searchParams.get("contacts") === "1") {
      openContacts(url.searchParams.get("contact"));
      url.searchParams.delete("contacts");
      url.searchParams.delete("contact");
      if (url.searchParams.get("source") === "contact-notification") {
        url.searchParams.delete("source");
      }
      window.history.replaceState(
        window.history.state,
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
    }

    return () => {
      window.removeEventListener(OPEN_CONTACT_DIRECTORY_EVENT, handleOpenContacts);
    };
  }, []);

  useEffect(() => {
    if (!authReady || !user) return;

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

  const refreshMailUnreadCount = useCallback(async () => {
    const currentUser = auth.currentUser;
    const requestScopeEmail = normalizedEmail;
    if (!currentUser || !requestScopeEmail) return;
    try {
      const payload = await fetchAuthedJsonOrThrow<{ unreadCount?: number }>(currentUser, "/api/mailbox?countOnly=1", { method: "GET" });
      if (auth.currentUser?.uid !== currentUser.uid || effectiveUserEmail(auth.currentUser?.email) !== requestScopeEmail) return;
      const count = Number(payload?.unreadCount ?? 0);
      setMailUnreadCount(Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0);
    } catch (error) {
      console.error("Načtení počtu nepřečtených zpráv selhalo:", error);
    }
  }, [normalizedEmail]);
  useMailboxRefresh(authReady && Boolean(user), refreshMailUnreadCount, 45_000);


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
          const merged = normalizeHomeWidgets(cloudWidgets);
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

  if (!hasTeam && (chartMode !== "personal" || selectedSubordinate !== null)) {
    setChartMode("personal");
    setSelectedSubordinate(null);
  }
  if (!homeWidgets.productionChart && subPickerOpen) setSubPickerOpen(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = homeLayoutKey(normalizedEmail);
    if (!key) return;
    let active = true;
    // Defer device-only layout hydration and cancel it when the identity changes.
    queueMicrotask(() => {
      if (!active) return;
      setHomeLayout(normalizeHomeLayout(readLocalHomeLayout(normalizedEmail)));
    });
    return () => { active = false; };
  }, [normalizedEmail]);

  const isManager = isManagerPosition(userMeta?.position ?? null) || hasTeam;
  const showTeamBox = hasTeam;
  const hasTipContract = myTipContractsCount > 0 || tipSummaryLoading || Boolean(tipSummaryError);
  // Poradce bez týmu potřebuje plnou šířku až ve chvíli, kdy vedle vlastní
  // produkce zobrazujeme také samostatnou kartu tipařské produkce.
  const shouldExpandProductionSummary =
    !showOnlyTeamProduction && (showTeamBox || hasTipContract);

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
  const showQuickActions = homeWidgets.quickActions;
  const reorderEnabled = widgetPanelOpen;
  const isLiteUI = performanceMode === "lite";
  const homeRefreshBusy =
    summaryRefreshing ||
    summaryLoading ||
    tipSummaryLoading ||
    historyLoading ||
    expectedPayoutLoading;

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
      if (isInheritedContract(entry)) continue;
      const signed = entrySignedDate(entry);
      if (!signed) continue;

      const key = `${signed.getFullYear()}-${signed.getMonth()}`;
      const idx = monthIndex.get(key);
      if (idx === undefined) continue;

      const amount = entry.inputAmount ?? 0;
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
    if (!isManager || !hasTeam) return [];
    if (lbRange === "month" && monthlyLeaderboard) {
      return monthlyLeaderboard.filter(row => lbProductFilter === "life" ? row.hasLife : row.hasOther).map(row => ({
        email: row.email, name: cleanDisplayName(row.name) || nameFromEmail(row.email),
        totalPremium: lbProductFilter === "life" ? row.life : row.other,
      })).sort((a, b) => b.totalPremium - a.totalPremium);
    }
    if (teamEntries.length === 0) return [];

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
      if (isInheritedContract(entry)) continue;
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
  }, [isManager, hasTeam, teamEntries, monthlyLeaderboard, lbProductFilter, lbRange]);

  const leaderboardLabel =
    lbProductFilter === "life"
      ? copy.leaderboard.life
      : copy.leaderboard.other;

  const isSectionVisible = (sec: HomeSection) => {
    switch (sec) {
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

  const renderSection = (id: HomeSection): ReactElement | null => {
    switch (id) {
      case "summary":
        if (!showProductionSummary) return null;
        return (
          <ProductionSummarySection
            language={language}
            loading={summaryLoading}
            error={summaryError}
            updatedAt={summaryUpdatedAt}
            refreshing={summaryRefreshing}
            tipSummaryLoading={tipSummaryLoading}
            tipSummaryError={tipSummaryError}
            showTeamBox={showTeamBox}
            showOnlyTeamProduction={showOnlyTeamProduction}
            myPremiums={myPremiums}
            teamPremiums={teamPremiums}
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
            loading={summaryLoading || (showTeamBox && tipSummaryLoading)}
            unavailable={Boolean(summaryError) || (showTeamBox && Boolean(tipSummaryError))}
            isLiteUI={isLiteUI}
            onSaveGoal={saveMonthlyGoal}
          />
        );
      case "expectedPayout":
        if (!showExpectedPayoutSection) return null;
        return (
          <DeferredHomeWidget key={`${user.uid}|${advisorDataEmail}`} placeholder={
            <ExpectedPayoutSection language={language} loading deferred grossAmount={0} stornoFundAmount={0}
              netAmount={0} periodLabel={`${monthLabelCapitalized} ${year}`} isLiteUI={isLiteUI} />
          }>
            <ExpectedPayoutWidget
              language={language}
              user={user}
              advisorDataEmail={advisorDataEmail}
              homeReloadKey={homeReloadKey}
              periodLabel={`${monthLabelCapitalized} ${year}`}
              isLiteUI={isLiteUI}
              onLoadingChange={setExpectedPayoutLoading}
            />
          </DeferredHomeWidget>
        );
      case "leaderboard":
        if (!showLeaderboardSection) return null;
        return (
          <TeamLeaderboardSection
            language={language}
            loading={lbRange === "month" ? summaryRefreshing : historyLoading}
            updatedAt={lbRange === "month" ? summaryUpdatedAt : historyUpdatedAt}
            error={lbRange === "month" ? summaryError : historyError}
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
        const quickActionsCardClass = `${homeWidgetStyles.card} ${homeWidgetStyles.quick} ${isLiteUI ? "" : homeWidgetStyles.elevated}`;
        return (
          <section
            className={`${quickActionsCardClass} ${
              reorderEnabled && draggingSection === id ? "opacity-50" : ""
            } ${reorderEnabled ? "cursor-move" : ""}`}
            draggable={reorderEnabled}
            onDragStart={() => handleSectionDragStart(id)}
            onDragOver={(e) => handleSectionDragOver(e, id)}
            onDragEnd={handleSectionDragEnd}
          >
            <QuickActionsContent
              actions={quickActions.map(action => ({ ...action, ...resolveQuickActionText(action, language) }))}
              availableActions={availableQA.map(action => ({ ...action, ...resolveQuickActionText(action, language) }))}
              copy={copy.quickActions}
              onAdd={action => persistQuickActions(prev => [...prev, action])}
              onRemove={key => persistQuickActions(prev => prev.filter(action => action.key !== key))}
            />
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
      {contactsModalOpen && (
        <ContactsModal
          user={user}
          initialContactId={contactsTargetId}
          onClose={() => {
            setContactsModalOpen(false);
            setContactsTargetId(null);
          }}
        />
      )}
      <HomePageSurface isLiteUI={isLiteUI} className="w-full flex-1 px-3 py-6 sm:px-4 sm:py-8 lg:px-8">
        <div className="relative z-10 mx-auto w-full max-w-6xl min-w-0 space-y-4 font-mono text-slate-900">
        <header className={headerStyles.header}>
          <div className={headerStyles.top}>
            <div className={headerStyles.heading}>
              <h1>{copy.homeHeadingPrefix}</h1>
              <span className={headerStyles.period}>{monthLabelCapitalized} {year}</span>
            </div>
            <div className={headerStyles.utilities}>
            <button
              type="button"
              onClick={refreshHomeData}
              disabled={!advisorDataEmail || homeRefreshBusy}
              className={headerStyles.utilityButton}
              aria-label={copy.reloadData}
              title={copy.reloadData}
            >
              <RefreshCw
                size={20}
                aria-hidden="true"
                className={homeRefreshBusy ? "animate-spin" : ""}
              />
            </button>

            <div className="relative z-[100]">
              <button
                type="button"
                onClick={() => setWidgetPanelOpen((prev) => !prev)}
                className={headerStyles.utilityButton}
                aria-expanded={widgetPanelOpen}
                aria-controls={widgetPanelOpen ? "home-customization-panel" : undefined}
                aria-label={copy.customizeHomeAria}
                title={copy.customizeButtonTitle}
              >
                <SlidersHorizontal size={18} aria-hidden="true" />
                <span className={headerStyles.utilityLabel}>Upravit přehled</span>
              </button>

              {widgetPanelOpen && (
                <HomeCustomizationPanel
                  id="home-customization-panel"
                  title={copy.customizeTitle}
                  closeLabel={copy.close}
                  widgetLabels={copy.widgetLabels}
                  managerOnlyNote={copy.managerOnlyNote}
                  performance={copy.performance}
                  widgets={homeWidgets}
                  showTeamBox={showTeamBox}
                  performanceMode={performanceMode}
                  onClose={() => setWidgetPanelOpen(false)}
                  onToggleWidget={handleWidgetToggle}
                  onPerformanceModeChange={updatePerformanceMode}
                />
              )}
            </div>
            </div>
          </div>
          <div className={headerStyles.toolbar}>
            <div className={headerStyles.search}>
              <GlobalSearchCommand user={user} dialogBelowDesktopHeader={false} triggerClassName={headerStyles.searchTrigger} />
            </div>
            <nav className={headerStyles.actions} aria-label="Rychlé odkazy">
            <button
              type="button"
              onClick={() => setPortalLinksModalOpen(true)}
              className={headerStyles.action}
              aria-label="Portály"
              title="Portály"
            >
              <Globe2 size={20} aria-hidden="true" />
              <span>Portály</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setContactsTargetId(null);
                setContactsModalOpen(true);
              }}
              className={headerStyles.action}
              aria-label="Kontakty"
              title="Kontakty"
            >
              <Smartphone size={20} aria-hidden="true" />
              <span>Kontakty</span>
            </button>

            <Link
              href="/pomucky/radar-vyroci"
              className={headerStyles.action}
              aria-label="Radar výročí"
              title="Radar výročí"
            >
              <Radar size={20} aria-hidden="true" />
              <span>Výročí</span>
            </Link>

            <Link
              href="/posta"
              className={`${headerStyles.action} ${headerStyles.primaryAction}`}
              aria-label={copy.mail}
              title={copy.mail}
            >
              <Mail size={21} aria-hidden="true" />
              <span>{copy.mail}</span>
              {mailUnreadCount > 0 ? (
                <span className={headerStyles.badge}>
                  {mailUnreadCount > 99 ? "99+" : mailUnreadCount}
                </span>
              ) : null}
            </Link>

            <HomeProductionHelp
              className={headerStyles.action}
              showTeamBox={showTeamBox}
              showOnlyTeamProduction={showOnlyTeamProduction}
            />

            </nav>
          </div>
        </header>

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
      </HomePageSurface>
    </AppLayout>
  );
}
