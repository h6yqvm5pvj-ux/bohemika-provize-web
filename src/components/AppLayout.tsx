// src/components/AppLayout.tsx
"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { auth } from "../app/firebase-auth";
import {
  EmailAuthProvider,
  FactorId,
  multiFactor,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signOut,
  TotpMultiFactorGenerator,
  type TotpSecret,
  type User as FirebaseUser,
} from "firebase/auth";
import QRCode from "qrcode";
import type { LucideIcon } from "lucide-react";
import {
  Apple,
  ArrowLeft,
  Building2,
  BriefcaseBusiness,
  Calculator,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Home,
  Lightbulb,
  Loader2,
  PhoneCall,
  Play,
  Plus,
  QrCode,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  UsersRound,
  Wrench,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  FONT_THEME_EVENT,
  FONT_THEME_LOCAL_STORAGE_KEY,
  applyFontThemeToRoot,
} from "@/lib/fontTheme";
import {
  APP_LANGUAGE_EVENT,
  APP_LANGUAGE_LOCAL_STORAGE_KEY,
  DEFAULT_APP_LANGUAGE,
  getAppLanguageMeta,
  resolveAppLanguage,
  type AppLanguage,
} from "@/lib/appLanguage";
import {
  adminRoleAtLeast,
  resolveAdminRoleFromClaims,
  type AdminRole,
} from "@/lib/adminAccess";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import { confirmEmailForMfaEnrollment } from "@/app/lib/mfaEmailVerification";
import * as userProfileCache from "@/app/lib/userProfileCache";
import type { UserProfileResponse } from "@/app/lib/userProfileCache";
import {
  evaluateSubscriptionFromProfile,
  type EvaluatedSubscriptionAccess,
} from "@/lib/subscriptionAccess";
import type { Position } from "@/app/types/domain";

type ActivePage =
  | "home"
  | "intranet"
  | "calc"
  | "contracts"
  | "cashflow"
  | "team"
  | "tools"
  | "tips"
  | "settings"
  | "admin";

interface AppLayoutProps {
  children: ReactNode;
  active: ActivePage;
}

type SubscriptionAccessUiState = "none" | "active" | "grace" | "blocked";
type SubscriptionBlockReason = "none" | "unpaid" | "expired";
type AccountType = "advisor" | "tipster";
type AccountSetupStepId = "phone" | "career" | "security";

type AccountSetupTimelineItem = {
  id: string;
  position: Position | "";
  validFrom: string;
  validTo: string;
};

const POSITIONS: { id: Position; label: string }[] = [
  { id: "poradce1", label: "Poradce 1" },
  { id: "poradce2", label: "Poradce 2" },
  { id: "poradce3", label: "Poradce 3" },
  { id: "poradce4", label: "Poradce 4" },
  { id: "poradce5", label: "Poradce 5" },
  { id: "poradce6", label: "Poradce 6" },
  { id: "poradce7", label: "Poradce 7" },
  { id: "poradce8", label: "Poradce 8" },
  { id: "poradce9", label: "Poradce 9" },
  { id: "poradce10", label: "Poradce 10" },
  { id: "manazer4", label: "Manažer 4" },
  { id: "manazer5", label: "Manažer 5" },
  { id: "manazer6", label: "Manažer 6" },
  { id: "manazer7", label: "Manažer 7" },
  { id: "manazer8", label: "Manažer 8" },
  { id: "manazer9", label: "Manažer 9" },
  { id: "manazer10", label: "Manažer 10" },
];

const POSITION_SET = new Set<Position>(POSITIONS.map((item) => item.id));
const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const PHONE_NUMBER_MAX_LEN = 40;
const PROFILE_ICO_MAX_LEN = 8;
const ACCOUNT_SETUP_STEPS: { id: AccountSetupStepId; label: string }[] = [
  { id: "phone", label: "Kontakt" },
  { id: "career", label: "Kariéra" },
  { id: "security", label: "2FA" },
];
const MFA_ISSUER = "Bohemka.App";
const MFA_FACTOR_LABEL = "Microsoft Authenticator";
const MFA_GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;
const AUTO_LOGOUT_AFTER_MS = 120 * 60 * 1000;
const MICROSOFT_AUTHENTICATOR_APP_STORE_URL =
  "https://apps.apple.com/cz/app/microsoft-authenticator/id983156458";
const MICROSOFT_AUTHENTICATOR_GOOGLE_PLAY_URL =
  "https://play.google.com/store/apps/details?id=com.azure.authenticator";
const APP_LAYOUT_COPY: Record<
  AppLanguage,
  {
    nav: Record<ActivePage, string>;
    logout: string;
    accountSettings: string;
  }
> = {
  cs: {
    nav: {
      home: "Domů",
      intranet: "Intranet",
      calc: "Kalkulačka",
      contracts: "Smlouvy",
      cashflow: "Provizní kalendář",
      team: "Můj tým",
      tools: "Pomůcky",
      tips: "Tipy",
      settings: "Nastavení",
      admin: "Admin",
    },
    logout: "Odhlásit se",
    accountSettings: "Nastavení účtu",
  },
};

const resolveAccountType = (data: Record<string, unknown>): AccountType => {
  const raw =
    typeof data.accountType === "string"
      ? data.accountType
      : typeof data.userRole === "string"
        ? data.userRole
        : "";
  return raw.trim().toLowerCase() === "tipster" ? "tipster" : "advisor";
};

const createTimelineRowId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `row_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
};

const isIsoDay = (value: string): boolean => {
  if (!ISO_DAY_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return false;
  return date.toISOString().slice(0, 10) === value;
};

const hasInvalidRangeOrder = (validFrom: string, validTo: string): boolean => {
  if (!validFrom || !validTo) return false;
  if (!isIsoDay(validFrom) || !isIsoDay(validTo)) return false;
  return validTo < validFrom;
};

const parsePositionTimeline = (value: unknown): AccountSetupTimelineItem[] => {
  if (!Array.isArray(value)) return [];
  const rows: AccountSetupTimelineItem[] = [];

  value.forEach((raw) => {
    if (!raw || typeof raw !== "object") return;
    const row = raw as Record<string, unknown>;
    const position = row.position as Position;
    const validFrom = typeof row.validFrom === "string" ? row.validFrom.trim() : "";
    const validToRaw = typeof row.validTo === "string" ? row.validTo.trim() : "";
    const validTo = validToRaw || "";

    if (!POSITION_SET.has(position)) return;
    if (!isIsoDay(validFrom)) return;
    if (validTo && !isIsoDay(validTo)) return;
    if (validTo && validTo < validFrom) return;

    rows.push({
      id:
        typeof row.id === "string" && row.id.trim().length > 0
          ? row.id.trim()
          : createTimelineRowId(),
      position,
      validFrom,
      validTo,
    });
  });

  rows.sort((a, b) => {
    if (a.validFrom !== b.validFrom) return a.validFrom.localeCompare(b.validFrom);
    const aTo = a.validTo || "9999-12-31";
    const bTo = b.validTo || "9999-12-31";
    return aTo.localeCompare(bTo);
  });

  return rows;
};

const resolveAccountSetupMfaErrorMessage = (error: unknown, fallback: string): string => {
  const code = (error as { code?: string })?.code;
  const message = error instanceof Error ? error.message.trim() : "";
  if (
    code === "auth/wrong-password" ||
    code === "auth/invalid-credential" ||
    code === "auth/invalid-login-credentials"
  ) {
    return "Aktuální heslo není správné.";
  }
  if (code === "auth/invalid-verification-code") {
    return "Neplatný 2FA kód. Zadej aktuální kód z aplikace.";
  }
  if (code === "auth/code-expired") {
    return "2FA kód vypršel. Zadej nový aktuální kód.";
  }
  if (code === "auth/requires-recent-login") {
    return "Pro tuto změnu je potřeba znovu ověřit heslo.";
  }
  if (code === "auth/unverified-email") {
    return "E-mail se nepodařilo automaticky potvrdit pro zapnutí 2FA. Zadej heslo znovu a spusť 2FA ještě jednou.";
  }
  if (code === "auth/user-not-found") {
    return "Účet s tímto e-mailem neexistuje ve Firebase Authentication.";
  }
  if (code === "auth/invalid-email") {
    return "Účet nemá platný e-mail.";
  }
  if (code === "auth/too-many-requests") {
    return "Příliš mnoho pokusů. Zkus to prosím později.";
  }
  if (code === "auth/network-request-failed") {
    return "Síťová chyba. Zkontroluj připojení a zkus to znovu.";
  }
  if (code === "auth/operation-not-allowed") {
    return "Firebase nemá zapnutou potřebnou metodu. Zkontroluj Authentication > Sign-in method a Multi-factor.";
  }
  if (code) {
    return `${fallback} Firebase vrátil chybu ${code}.`;
  }
  if (message) {
    return message;
  }
  return fallback;
};

const PROFILE_CACHE_MAX_AGE_MS = 60 * 1000;
const AUTH_READY_TIMEOUT_MS = 12_000;

const hasTeamCacheKey = (email: string): string =>
  `app.hasTeam:${email.trim().toLowerCase()}`;

const readCachedHasTeam = (email?: string | null): boolean | null => {
  if (typeof window === "undefined" || !email) return null;
  const cached = window.sessionStorage.getItem(hasTeamCacheKey(email));
  if (cached === "0") return false;
  if (cached === "1") return true;
  return null;
};

const writeCachedHasTeam = (email: string | null | undefined, value: boolean): void => {
  if (typeof window === "undefined" || !email) return;
  window.sessionStorage.setItem(hasTeamCacheKey(email), value ? "1" : "0");
};

const formatIsoDayCz = (value: string | null): string => {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("cs-CZ", { timeZone: "Europe/Prague" });
};

const normalizeIsoDateTime = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const parseIsoDateTimeMs = (value: string | null): number | null => {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
};

export function AppLayout({ children, active }: AppLayoutProps) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const isTipsRoute = pathname === "/tipy" || pathname.startsWith("/tipy/");
  const isCashflowRoute = pathname === "/cashflow";
  const isTipsterAllowedRoute = pathname === "/" || isTipsRoute || isCashflowRoute;
  const showToolsBackToIndex = active === "tools" && pathname !== "/pomucky";
  const toolsBackButtonRightAligned = pathname === "/pomucky/invalidita";
  const contentOverflowClass =
    active === "tools" || active === "cashflow" ? "overflow-visible" : "overflow-x-clip";
  const lastActiveUpdateRef = useRef(0);
  const isFullBleedPage =
    pathname?.startsWith("/pomucky/zlato") ||
    pathname === "/" ||
    isTipsRoute ||
    pathname === "/kalkulacka" ||
    pathname === "/nastaveni" ||
    pathname === "/smlouvy";

  const [subscriptionAccessState, setSubscriptionAccessState] =
    useState<SubscriptionAccessUiState>("none");
  const [subscriptionBlockReason, setSubscriptionBlockReason] =
    useState<SubscriptionBlockReason>("none");
  const [subscriptionEvaluation, setSubscriptionEvaluation] =
    useState<EvaluatedSubscriptionAccess | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [hasInternalProfile, setHasInternalProfile] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [authInitTimedOut, setAuthInitTimedOut] = useState(false);
  const [language, setLanguage] = useState<AppLanguage>(DEFAULT_APP_LANGUAGE);
  const [needsCareerTimelineSetup, setNeedsCareerTimelineSetup] = useState(false);
  const [showAccountSetupWizard, setShowAccountSetupWizard] = useState(false);
  const [accountSetupStep, setAccountSetupStep] = useState(0);
  const [accountSetupCompleted, setAccountSetupCompleted] = useState(false);
  const [accountSetupPhone, setAccountSetupPhone] = useState("");
  const [accountSetupSavedPhone, setAccountSetupSavedPhone] = useState("");
  const [accountSetupIco, setAccountSetupIco] = useState("");
  const [accountSetupSavedIco, setAccountSetupSavedIco] = useState("");
  const [accountSetupPhoneSaving, setAccountSetupPhoneSaving] = useState(false);
  const [accountSetupTimelineDraft, setAccountSetupTimelineDraft] = useState<
    AccountSetupTimelineItem[]
  >([]);
  const [accountSetupTimelineSaving, setAccountSetupTimelineSaving] = useState(false);
  const [accountSetupError, setAccountSetupError] = useState<string | null>(null);
  const [accountSetupInfo, setAccountSetupInfo] = useState<string | null>(null);
  const [accountSetupMfaReady, setAccountSetupMfaReady] = useState(false);
  const [accountSetupMfaEnabled, setAccountSetupMfaEnabled] = useState(false);
  const [accountSetupMfaPassword, setAccountSetupMfaPassword] = useState("");
  const [accountSetupMfaSecret, setAccountSetupMfaSecret] = useState<TotpSecret | null>(null);
  const [accountSetupMfaCode, setAccountSetupMfaCode] = useState("");
  const [accountSetupMfaQrDataUrl, setAccountSetupMfaQrDataUrl] = useState("");
  const [accountSetupMfaQrLoading, setAccountSetupMfaQrLoading] = useState(false);
  const [accountSetupMfaQrError, setAccountSetupMfaQrError] = useState<string | null>(null);
  const [accountSetupMfaSaving, setAccountSetupMfaSaving] = useState(false);
  const [accountSetupCompletionSaving, setAccountSetupCompletionSaving] = useState(false);
  const [accountSetupCompletedAt, setAccountSetupCompletedAt] = useState<string | null>(null);
  const [accountSetupMfaGraceStartedAt, setAccountSetupMfaGraceStartedAt] =
    useState<string | null>(null);
  const [accountSetupSecurityHardRequired, setAccountSetupSecurityHardRequired] =
    useState(false);
  const [accountSetupWizardManuallyOpened, setAccountSetupWizardManuallyOpened] =
    useState(false);
  const [accountType, setAccountType] = useState<AccountType>("advisor");
  const [hasTeam, setHasTeam] = useState<boolean>(true);
  const [hasTipsters, setHasTipsters] = useState(false);
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null);

  // Auth listener
  useEffect(() => {
    let resolved = false;
    const readyFallbackTimer = window.setTimeout(() => {
      if (resolved) return;
      const currentUser = auth.currentUser;
      if (currentUser) {
        resolved = true;
        setAuthInitTimedOut(false);
        setUser(currentUser);
        setLoadingProfile(true);
        setHasTeam(readCachedHasTeam(currentUser.email) ?? true);
        setAuthReady(true);
        return;
      }

      console.warn("Auth ready timeout in AppLayout; waiting without guest redirect.");
      setAuthInitTimedOut(true);
      setLoadingProfile(false);
    }, AUTH_READY_TIMEOUT_MS);

    const unsub = onAuthStateChanged(auth, (u) => {
      resolved = true;
      window.clearTimeout(readyFallbackTimer);
      setAuthInitTimedOut(false);
      setUser(u);
      if (!u) {
        setAdminRole(null);
        setSubscriptionAccessState("none");
        setSubscriptionBlockReason("none");
        setSubscriptionEvaluation(null);
        setHasInternalProfile(false);
        setLoadingProfile(false);
        setNeedsCareerTimelineSetup(false);
        setShowAccountSetupWizard(false);
        setAccountSetupCompleted(false);
        setAccountSetupStep(0);
        setAccountSetupPhone("");
        setAccountSetupSavedPhone("");
        setAccountSetupIco("");
        setAccountSetupSavedIco("");
        setAccountSetupTimelineDraft([]);
        setAccountSetupError(null);
        setAccountSetupInfo(null);
        setAccountSetupMfaReady(false);
        setAccountSetupMfaEnabled(false);
        setAccountSetupMfaPassword("");
        setAccountSetupMfaSecret(null);
        setAccountSetupMfaCode("");
        setAccountSetupMfaQrDataUrl("");
        setAccountSetupMfaQrLoading(false);
        setAccountSetupMfaQrError(null);
        setAccountSetupMfaSaving(false);
        setAccountSetupCompletionSaving(false);
        setAccountSetupCompletedAt(null);
        setAccountSetupMfaGraceStartedAt(null);
        setAccountSetupSecurityHardRequired(false);
        setAccountSetupWizardManuallyOpened(false);
        setAccountType("advisor");
        setHasTeam(false);
        setHasTipsters(false);
      } else {
        setLoadingProfile(true);
        setHasInternalProfile(false);
        setHasTeam(readCachedHasTeam(u.email) ?? true);
      }
      setAuthReady(true);
    });

    return () => {
      resolved = true;
      window.clearTimeout(readyFallbackTimer);
      unsub();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setAdminRole(null);
      return;
    }

    user
      .getIdTokenResult()
      .then((token) => {
        if (cancelled) return;
        setAdminRole(
          resolveAdminRoleFromClaims(
            user.email,
            token.claims as Record<string, unknown>
          )
        );
      })
      .catch(() => {
        if (!cancelled) {
          setAdminRole(resolveAdminRoleFromClaims(user.email, null));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  // Redirect guests to login (all pages using AppLayout should be protected)
  useEffect(() => {
    if (!authReady) return;
    if (!user) {
      router.replace("/login");
    }
  }, [authReady, user, router]);

  // Respektovat vypnutí animací hned po načtení (uloženo v localStorage)
  useLayoutEffect(() => {
    if (typeof document === "undefined") return;

    const applyMotionPreference = () => {
      const stored = window.localStorage.getItem("settings.reduceMotion");
      if (stored === "1") {
        document.documentElement.setAttribute("data-motion", "off");
      } else {
        document.documentElement.removeAttribute("data-motion");
      }
    };

    applyMotionPreference();
    const onStorage = (ev: StorageEvent) => {
      if (ev.key === "settings.reduceMotion") {
        applyMotionPreference();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Box theme setting was removed from Nastavení; clear legacy persisted theme.
  useLayoutEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const root = document.documentElement;
    window.localStorage.removeItem("settings.boxTheme");
    root.removeAttribute("data-box-theme");
    root.style.removeProperty("--ui-surface-strong");
    root.style.removeProperty("--ui-focus");
  }, []);

  // Načíst a aplikovat font napříč aplikací z localStorage
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;

    const applyFromValue = (value?: unknown) => {
      const theme = applyFontThemeToRoot(
        value ?? window.localStorage.getItem(FONT_THEME_LOCAL_STORAGE_KEY)
      );
      window.localStorage.setItem(FONT_THEME_LOCAL_STORAGE_KEY, theme);
    };

    applyFromValue();

    const onStorage = (ev: StorageEvent) => {
      if (ev.key && ev.key !== FONT_THEME_LOCAL_STORAGE_KEY) return;
      applyFromValue(ev.newValue);
    };

    const onCustom = (ev: Event) => {
      const detail = (ev as CustomEvent<{ fontTheme?: string }>).detail;
      applyFromValue(detail?.fontTheme);
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(FONT_THEME_EVENT, onCustom as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(FONT_THEME_EVENT, onCustom as EventListener);
    };
  }, []);

  // Načíst a aplikovat jazyk shellu aplikace z localStorage / profilu.
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;

    const applyLanguage = (value?: unknown) => {
      const next = resolveAppLanguage(
        value ?? window.localStorage.getItem(APP_LANGUAGE_LOCAL_STORAGE_KEY)
      );
      window.localStorage.setItem(APP_LANGUAGE_LOCAL_STORAGE_KEY, next);
      if (typeof document !== "undefined") {
        document.documentElement.lang = getAppLanguageMeta(next)?.htmlLang ?? next;
      }
      setLanguage(next);
    };

    applyLanguage();

    const onStorage = (ev: StorageEvent) => {
      if (ev.key && ev.key !== APP_LANGUAGE_LOCAL_STORAGE_KEY) return;
      applyLanguage(ev.newValue);
    };

    const onCustom = (ev: Event) => {
      const detail = (ev as CustomEvent<{ language?: string }>).detail;
      applyLanguage(detail?.language);
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(APP_LANGUAGE_EVENT, onCustom as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(APP_LANGUAGE_EVENT, onCustom as EventListener);
    };
  }, []);

  // zavřít mobilní menu po změně stránky
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Zafixovat globální světlý režim.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const body = document.body;

    body.classList.remove(
      "simple-bg",
      "simple-bg-blue",
      "simple-bg-black",
      "simple-bg-white"
    );

    body.classList.add("simple-bg");
    body.classList.add("simple-bg-white");
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      window.location.href = "/login";
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (!user || typeof window === "undefined") return;

    let timeoutId: number | null = null;
    let lastResetAt = 0;

    const scheduleLogout = (force = false) => {
      const now = Date.now();
      if (!force && now - lastResetAt < 1000) return;
      lastResetAt = now;

      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }

      timeoutId = window.setTimeout(() => {
        void signOut(auth)
          .catch((error) => {
            console.error("Automatické odhlášení se nepodařilo dokončit:", error);
          })
          .finally(() => {
            window.location.href = "/login";
          });
      }, AUTO_LOGOUT_AFTER_MS);
    };

    const onActivity = () => scheduleLogout();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        scheduleLogout(true);
      }
    };
    const activityEvents: Array<keyof WindowEventMap> = [
      "focus",
      "keydown",
      "mousedown",
      "mousemove",
      "scroll",
      "touchstart",
      "wheel",
    ];

    scheduleLogout(true);
    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, onActivity);
    });
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, onActivity);
      });
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [user]);

  // Načtení subscription profilu přes API
  const applySubscriptionPayload = useCallback((
    payload: UserProfileResponse,
    currentUser: FirebaseUser
  ) => {
    const data = (payload?.profile ?? {}) as Record<string, unknown>;
    const nextHasInternalProfile = payload?.hasProfile === true;
    const nextAccountType = resolveAccountType(data);
    const nextLanguage = resolveAppLanguage(data.language);
    const evaluation = nextHasInternalProfile ? evaluateSubscriptionFromProfile(data) : null;
    const parsedTimeline = parsePositionTimeline(data.positionTimeline);
    const nextPhoneNumber =
      typeof data.phoneNumber === "string" ? data.phoneNumber.trim() : "";
    const nextIco =
      typeof data.ico === "string"
        ? data.ico.replace(/\D+/g, "").slice(0, PROFILE_ICO_MAX_LEN)
        : "";
    const nextAccountSetupCompletedAt = normalizeIsoDateTime(data.accountSetupCompletedAt);
    const nextMfaGraceStartedAt = normalizeIsoDateTime(data.mfaSetupGraceStartedAt);
    setAccountType(nextAccountType);
    setLanguage(nextLanguage);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(APP_LANGUAGE_LOCAL_STORAGE_KEY, nextLanguage);
    }
    if (typeof document !== "undefined") {
      document.documentElement.lang = getAppLanguageMeta(nextLanguage)?.htmlLang ?? nextLanguage;
    }
    setHasInternalProfile(nextHasInternalProfile);
    setAccountSetupPhone(nextPhoneNumber);
    setAccountSetupSavedPhone(nextPhoneNumber);
    setAccountSetupIco(nextIco);
    setAccountSetupSavedIco(nextIco);
    setAccountSetupCompletedAt(nextAccountSetupCompletedAt);
    setAccountSetupMfaGraceStartedAt(nextMfaGraceStartedAt);
    setAccountSetupTimelineDraft(parsedTimeline);
    setAccountSetupSecurityHardRequired((prev) =>
      prev ||
      (nextAccountType !== "tipster" &&
        (!nextHasInternalProfile || parsedTimeline.length === 0))
    );
    setSubscriptionEvaluation(evaluation);
    if (!evaluation) {
      setSubscriptionAccessState("none");
      setSubscriptionBlockReason("none");
    } else {
      setSubscriptionAccessState(
        evaluation.state === "blocked" ? "blocked" : evaluation.state
      );
      setSubscriptionBlockReason(
        evaluation.reason === "unpaid"
          ? "unpaid"
          : evaluation.reason === "expired"
            ? "expired"
            : "none"
      );
    }
    setNeedsCareerTimelineSetup(
      nextAccountType !== "tipster" &&
        (!nextHasInternalProfile || parsedTimeline.length === 0)
    );
    const has = payload?.hasTeam === true;
    const hasTipsterAccounts = payload?.hasTipsters === true;
    setHasTeam(has);
    setHasTipsters(hasTipsterAccounts);
    writeCachedHasTeam(currentUser.email, has);
  }, []);

  const loadSubscriptionProfileForUser = useCallback(async (
    currentUser: FirebaseUser | null,
    options?: { force?: boolean }
  ) => {
    const emailRaw = currentUser?.email;
    if (!emailRaw) {
      setSubscriptionAccessState("none");
      setSubscriptionBlockReason("none");
      setSubscriptionEvaluation(null);
      setHasInternalProfile(false);
      setNeedsCareerTimelineSetup(false);
      setLoadingProfile(false);
      setAccountType("advisor");
      setAccountSetupPhone("");
      setAccountSetupSavedPhone("");
      setAccountSetupIco("");
      setAccountSetupSavedIco("");
      setAccountSetupCompletedAt(null);
      setAccountSetupMfaGraceStartedAt(null);
      setAccountSetupSecurityHardRequired(false);
      setAccountSetupWizardManuallyOpened(false);
      setHasTeam(false);
      setHasTipsters(false);
      return;
    }

    const force = options?.force === true;
    const warmPayload =
      !force && typeof userProfileCache.peekUserProfileCached === "function"
        ? userProfileCache.peekUserProfileCached(currentUser, {
            maxAgeMs: PROFILE_CACHE_MAX_AGE_MS,
          })
        : null;
    if (warmPayload) {
      applySubscriptionPayload(warmPayload, currentUser);
      setLoadingProfile(false);
    } else {
      setLoadingProfile(true);
    }

    try {
      const payload = await userProfileCache.getUserProfileCached(currentUser, {
        maxAgeMs: PROFILE_CACHE_MAX_AGE_MS,
        force,
      });
      applySubscriptionPayload(payload, currentUser);
    } catch (e) {
      console.warn("Chyba při načítání subscription profilu:", e);
      setSubscriptionAccessState("none");
      setSubscriptionBlockReason("none");
      setSubscriptionEvaluation(null);
      setHasInternalProfile(false);
      setNeedsCareerTimelineSetup(false);
      setAccountType("advisor");
      setAccountSetupSavedPhone("");
      setAccountSetupIco("");
      setAccountSetupSavedIco("");
      setAccountSetupCompletedAt(null);
      setAccountSetupMfaGraceStartedAt(null);
      setAccountSetupSecurityHardRequired(false);
      setAccountSetupWizardManuallyOpened(false);
      setHasTeam(false);
      setHasTipsters(false);
    } finally {
      setLoadingProfile(false);
    }
  }, [applySubscriptionPayload]);

  // Načtení subscription, když se změní user
  useEffect(() => {
    if (!user) return;
    void loadSubscriptionProfileForUser(user);
  }, [user, loadSubscriptionProfileForUser]);

  useEffect(() => {
    if (!user || typeof window === "undefined") return;

    const onRefreshProfile = () => {
      void loadSubscriptionProfileForUser(user, { force: true });
    };

    window.addEventListener("app:refresh-user-profile", onRefreshProfile);
    return () => {
      window.removeEventListener("app:refresh-user-profile", onRefreshProfile);
    };
  }, [user, loadSubscriptionProfileForUser]);

  const clearAccountSetupMfaDraft = useCallback(() => {
    setAccountSetupMfaSecret(null);
    setAccountSetupMfaCode("");
    setAccountSetupMfaQrDataUrl("");
    setAccountSetupMfaQrLoading(false);
    setAccountSetupMfaQrError(null);
  }, []);

  const syncAccountSetupMfaState = useCallback(async (targetUser: FirebaseUser) => {
    await targetUser.reload();
    const activeUser = auth.currentUser ?? targetUser;
    const totpFactor =
      multiFactor(activeUser).enrolledFactors.find(
        (factor) => factor.factorId === FactorId.TOTP
      ) ?? null;
    setAccountSetupMfaEnabled(Boolean(totpFactor));
    return Boolean(totpFactor);
  }, []);

  useEffect(() => {
    if (!user) {
      setAccountSetupMfaReady(false);
      setAccountSetupMfaEnabled(false);
      setAccountSetupMfaPassword("");
      setAccountSetupMfaSaving(false);
      clearAccountSetupMfaDraft();
      return;
    }

    let cancelled = false;
    setAccountSetupMfaReady(false);

    void syncAccountSetupMfaState(user)
      .catch((error) => {
        console.warn("Chyba při načítání stavu 2FA:", error);
        if (!cancelled) {
          setAccountSetupMfaEnabled(false);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setAccountSetupMfaReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [clearAccountSetupMfaDraft, syncAccountSetupMfaState, user]);

  useEffect(() => {
    if (!accountSetupMfaSecret) {
      setAccountSetupMfaQrDataUrl("");
      setAccountSetupMfaQrLoading(false);
      setAccountSetupMfaQrError(null);
      return;
    }

    let cancelled = false;
    const accountName = user?.email?.trim().toLowerCase() || user?.email || "bohemika-user";
    const qrUri = accountSetupMfaSecret.generateQrCodeUrl(accountName, MFA_ISSUER);
    setAccountSetupMfaQrLoading(true);
    setAccountSetupMfaQrError(null);

    void QRCode.toDataURL(qrUri, {
      width: 220,
      margin: 1,
      errorCorrectionLevel: "M",
    })
      .then((dataUrl) => {
        if (!cancelled) {
          setAccountSetupMfaQrDataUrl(dataUrl);
        }
      })
      .catch((error) => {
        console.error("Chyba při generování QR kódu pro onboarding 2FA:", error);
        if (!cancelled) {
          setAccountSetupMfaQrError("QR kód se nepodařilo vygenerovat.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setAccountSetupMfaQrLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accountSetupMfaSecret, user]);

  useEffect(() => {
    if (!user) return;
    if (loadingProfile || !accountSetupMfaReady || subscriptionAccessState === "blocked") return;
    if (accountType === "tipster") {
      setShowAccountSetupWizard(false);
      return;
    }
    const mfaMissing = !accountSetupMfaEnabled;
    const contactMissing =
      !accountSetupSavedPhone.trim() || !accountSetupSavedIco.trim();
    const setupRequired = contactMissing || needsCareerTimelineSetup || mfaMissing;

    if (!setupRequired) {
      if (!accountSetupCompleted) {
        setShowAccountSetupWizard(false);
      }
      return;
    }
    setShowAccountSetupWizard(true);
  }, [
    accountSetupCompleted,
    accountSetupCompletedAt,
    accountSetupMfaEnabled,
    accountSetupMfaGraceStartedAt,
    accountSetupMfaReady,
    accountSetupSecurityHardRequired,
    accountSetupWizardManuallyOpened,
    accountSetupSavedIco,
    accountSetupSavedPhone,
    accountType,
    user,
    loadingProfile,
    subscriptionAccessState,
    needsCareerTimelineSetup,
  ]);

  useEffect(() => {
    if (!showAccountSetupWizard || accountSetupTimelineDraft.length > 0) return;
    setAccountSetupTimelineDraft([
      {
        id: createTimelineRowId(),
        position: "",
        validFrom: "",
        validTo: "",
      },
    ]);
  }, [accountSetupTimelineDraft.length, showAccountSetupWizard]);

  useEffect(() => {
    if (!showAccountSetupWizard || accountSetupCompleted) return;
    const phoneStepIndex = ACCOUNT_SETUP_STEPS.findIndex((step) => step.id === "phone");
    const careerStepIndex = ACCOUNT_SETUP_STEPS.findIndex((step) => step.id === "career");
    const securityStepIndex = ACCOUNT_SETUP_STEPS.findIndex((step) => step.id === "security");

    if (!accountSetupSavedPhone.trim() || !accountSetupSavedIco.trim()) {
      setAccountSetupStep(phoneStepIndex);
      return;
    }
    if (needsCareerTimelineSetup) {
      setAccountSetupStep(careerStepIndex);
      return;
    }
    if (!accountSetupMfaEnabled) {
      setAccountSetupStep(securityStepIndex);
    }
  }, [
    accountSetupCompleted,
    accountSetupMfaEnabled,
    accountSetupSavedIco,
    accountSetupSavedPhone,
    needsCareerTimelineSetup,
    showAccountSetupWizard,
  ]);

  useEffect(() => {
    if (!accountSetupCompleted) return;
    const timeoutId = window.setTimeout(() => {
      setShowAccountSetupWizard(false);
      setAccountSetupCompleted(false);
      setAccountSetupStep(0);
      setAccountSetupError(null);
      setAccountSetupInfo(null);
      setAccountSetupWizardManuallyOpened(false);
    }, 2200);
    return () => window.clearTimeout(timeoutId);
  }, [accountSetupCompleted]);

  useEffect(() => {
    if (!user || loadingProfile || accountType !== "tipster") return;
    if (!isTipsterAllowedRoute) {
      router.replace("/");
    }
  }, [accountType, isTipsterAllowedRoute, loadingProfile, router, user]);

  // Zapsat lastActive do Firestore při přihlášení + periodické obnovení
  useEffect(() => {
    const currentUser = user;
    const email = currentUser?.email?.toLowerCase();
    if (!currentUser || !email || !hasInternalProfile) return;
    let cancelled = false;
    const LAST_ACTIVE_UPDATE_INTERVAL_MS = 5 * 60 * 1000;
    const LAST_ACTIVE_THROTTLE_MS = 60 * 1000;
    const shouldLog = process.env.NODE_ENV !== "production";

    const updateLastActive = async (reason: string) => {
      if (cancelled) return;
      const now = Date.now();
      if (now - lastActiveUpdateRef.current < LAST_ACTIVE_THROTTLE_MS) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      lastActiveUpdateRef.current = now;
      try {
        await fetchAuthedJsonOrThrow(currentUser, "/api/user/profile", {
          method: "PATCH",
          body: JSON.stringify({ lastActivePing: true }),
          cache: "no-store",
        });
        if (shouldLog) {
          console.info("[lastActive] updated", { email, reason });
        }
      } catch (err) {
        console.error("Failed to update lastActive", err);
      }
    };

    void updateLastActive("login");

    const intervalId = window.setInterval(() => {
      void updateLastActive("interval");
    }, LAST_ACTIVE_UPDATE_INTERVAL_MS);

    const onFocus = () => {
      void updateLastActive("focus");
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void updateLastActive("visibility");
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [hasInternalProfile, user]);

  // Ruční reload z paywallu
  const handleReloadSubscription = async () => {
    await loadSubscriptionProfileForUser(user, { force: true });
  };

  const markAccountSetupCompleted = async () => {
    if (!user) {
      setAccountSetupError("Nejsi přihlášený.");
      return;
    }

    const completedAt = new Date().toISOString();
    setAccountSetupCompletionSaving(true);
    setAccountSetupError(null);
    try {
      await fetchAuthedJsonOrThrow(user, "/api/user/profile", {
        method: "PATCH",
        body: JSON.stringify({ accountSetupCompletedAt: completedAt }),
      });
      userProfileCache.invalidateUserProfileCache(user.email);
      setHasInternalProfile(true);
      setAccountSetupCompletedAt(completedAt);
      setAccountSetupWizardManuallyOpened(false);
      setAccountSetupCompleted(true);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("app:refresh-user-profile"));
      }
    } catch (err) {
      const message =
        err instanceof Error && err.message.trim().length > 0
          ? err.message.trim()
          : "Dokončení nastavení účtu se nepodařilo uložit.";
      setAccountSetupError(message);
    } finally {
      setAccountSetupCompletionSaving(false);
    }
  };

  const saveAccountSetupPhone = async () => {
    if (!user) {
      setAccountSetupError("Nejsi přihlášený.");
      return;
    }

    const nextPhoneNumber = accountSetupPhone.trim();
    const nextIco = accountSetupIco.replace(/\D+/g, "").slice(0, PROFILE_ICO_MAX_LEN);
    const digitCount = nextPhoneNumber.replace(/\D+/g, "").length;
    if (!nextPhoneNumber) {
      setAccountSetupError("Vyplň telefonní číslo.");
      return;
    }
    if (digitCount < 6) {
      setAccountSetupError("Telefonní číslo je příliš krátké.");
      return;
    }
    if (nextPhoneNumber.length > PHONE_NUMBER_MAX_LEN) {
      setAccountSetupError(
        `Telefonní číslo může mít maximálně ${PHONE_NUMBER_MAX_LEN} znaků.`
      );
      return;
    }
    if (!nextIco) {
      setAccountSetupError("Vyplň IČO.");
      return;
    }
    if (nextIco.length !== PROFILE_ICO_MAX_LEN) {
      setAccountSetupError(`IČO musí mít ${PROFILE_ICO_MAX_LEN} číslic.`);
      return;
    }

    setAccountSetupPhoneSaving(true);
    setAccountSetupError(null);
    try {
      await fetchAuthedJsonOrThrow(user, "/api/user/profile", {
        method: "PATCH",
        body: JSON.stringify({ phoneNumber: nextPhoneNumber, ico: nextIco }),
      });
      userProfileCache.invalidateUserProfileCache(user.email);
      setHasInternalProfile(true);
      setAccountSetupPhone(nextPhoneNumber);
      setAccountSetupSavedPhone(nextPhoneNumber);
      setAccountSetupIco(nextIco);
      setAccountSetupSavedIco(nextIco);
      setAccountSetupStep(1);
    } catch (err) {
      const message =
        err instanceof Error && err.message.trim().length > 0
          ? err.message.trim()
          : "Kontaktní údaje se nepodařilo uložit.";
      setAccountSetupError(message);
    } finally {
      setAccountSetupPhoneSaving(false);
    }
  };

  const addAccountSetupTimelineRow = () => {
    setAccountSetupError(null);
    setAccountSetupTimelineDraft((prev) => [
      ...prev,
      {
        id: createTimelineRowId(),
        position: "",
        validFrom: "",
        validTo: "",
      },
    ]);
  };

  const updateAccountSetupTimelineRow = (
    rowId: string,
    patch: Partial<AccountSetupTimelineItem>
  ) => {
    setAccountSetupError(null);
    setAccountSetupTimelineDraft((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, ...patch } : row))
    );
  };

  const removeAccountSetupTimelineRow = (rowId: string) => {
    setAccountSetupError(null);
    setAccountSetupTimelineDraft((prev) => {
      const next = prev.filter((row) => row.id !== rowId);
      return next.length > 0
        ? next
        : [
            {
              id: createTimelineRowId(),
              position: "",
              validFrom: "",
              validTo: "",
            },
          ];
    });
  };

  const buildAccountSetupTimelinePayload = ():
    | {
        ok: true;
        payload: Array<{
          id: string;
          position: Position;
          validFrom: string;
          validTo: string | null;
        }>;
      }
    | { ok: false; error: string } => {
    const normalized = accountSetupTimelineDraft
      .map((row) => ({
        ...row,
        validFrom: row.validFrom.trim(),
        validTo: row.validTo.trim(),
      }))
      .filter(
        (row) => row.position || row.validFrom.length > 0 || row.validTo.length > 0
      );

    if (normalized.length === 0) {
      return { ok: false, error: "Přidej aspoň jednu pozici do kariéry." };
    }

    for (let i = 0; i < normalized.length; i += 1) {
      const row = normalized[i];
      const rowNo = i + 1;
      if (!POSITION_SET.has(row.position as Position)) {
        return { ok: false, error: `Řádek ${rowNo}: vyber platnou pozici.` };
      }
      if (!row.validFrom) {
        return { ok: false, error: `Řádek ${rowNo}: vyplň datum OD.` };
      }
      if (!isIsoDay(row.validFrom)) {
        return { ok: false, error: `Řádek ${rowNo}: datum OD musí být platné.` };
      }
      if (row.validTo && !isIsoDay(row.validTo)) {
        return { ok: false, error: `Řádek ${rowNo}: datum DO musí být platné.` };
      }
      if (hasInvalidRangeOrder(row.validFrom, row.validTo)) {
        return {
          ok: false,
          error: `Řádek ${rowNo}: datum DO nemůže být dřív než datum OD.`,
        };
      }
    }

    const sorted = [...normalized].sort((a, b) => {
      if (a.validFrom !== b.validFrom) return a.validFrom.localeCompare(b.validFrom);
      const aTo = a.validTo || "9999-12-31";
      const bTo = b.validTo || "9999-12-31";
      return aTo.localeCompare(bTo);
    });

    const openEndedIndexes = sorted
      .map((row, index) => (!row.validTo ? index : -1))
      .filter((index) => index >= 0);
    if (openEndedIndexes.length > 1) {
      return {
        ok: false,
        error: "Současnost (prázdné datum DO) může být jen u jedné poslední pozice.",
      };
    }
    if (openEndedIndexes.length === 1 && openEndedIndexes[0] !== sorted.length - 1) {
      return {
        ok: false,
        error: "Současnost (prázdné datum DO) je povolena jen u poslední aktuální pozice.",
      };
    }

    for (let i = 1; i < sorted.length; i += 1) {
      const prev = sorted[i - 1];
      const current = sorted[i];
      const prevTo = prev.validTo || "9999-12-31";
      if (prevTo > current.validFrom) {
        return {
          ok: false,
          error: `Rozsahy se překrývají mezi řádky ${i} a ${i + 1}. Uprav datum OD/DO.`,
        };
      }
    }

    return {
      ok: true,
      payload: sorted.map((row) => ({
        id: row.id,
        position: row.position as Position,
        validFrom: row.validFrom,
        validTo: row.validTo || null,
      })),
    };
  };

  const saveAccountSetupCareer = async () => {
    if (!user) {
      setAccountSetupError("Nejsi přihlášený.");
      return;
    }

    const timeline = buildAccountSetupTimelinePayload();
    if (!timeline.ok) {
      setAccountSetupError(timeline.error);
      return;
    }
    const nextIco = accountSetupIco.replace(/\D+/g, "").slice(0, PROFILE_ICO_MAX_LEN);

    setAccountSetupTimelineSaving(true);
    setAccountSetupError(null);
    try {
      await fetchAuthedJsonOrThrow(user, "/api/user/profile", {
        method: "PATCH",
        body: JSON.stringify({
          phoneNumber: accountSetupPhone.trim(),
          ico: nextIco,
          positionTimeline: timeline.payload,
        }),
      });
      userProfileCache.invalidateUserProfileCache(user.email);
      setHasInternalProfile(true);
      setAccountSetupIco(nextIco);
      setAccountSetupSavedIco(nextIco);
      setAccountSetupTimelineDraft(
        timeline.payload.map((row) => ({
          id: row.id,
          position: row.position,
          validFrom: row.validFrom,
          validTo: row.validTo ?? "",
        }))
      );
      setNeedsCareerTimelineSetup(false);
      if (accountSetupMfaEnabled) {
        await markAccountSetupCompleted();
      } else {
        const securityStepIndex = ACCOUNT_SETUP_STEPS.findIndex((step) => step.id === "security");
        setAccountSetupStep(securityStepIndex);
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("app:refresh-user-profile"));
      }
    } catch (err) {
      const message =
        err instanceof Error && err.message.trim().length > 0
          ? err.message.trim()
          : "Historii kariéry se nepodařilo uložit.";
      setAccountSetupError(message);
    } finally {
      setAccountSetupTimelineSaving(false);
    }
  };

  const startAccountSetupMfaEnrollment = async () => {
    if (!user) {
      setAccountSetupError("Nejsi přihlášený.");
      return;
    }

    const activeUserEmail = (auth.currentUser ?? user).email?.trim();
    if (!activeUserEmail) {
      setAccountSetupError("Pro nastavení 2FA musí mít účet e-mail.");
      return;
    }

    const currentPassword = accountSetupMfaPassword;
    if (!currentPassword) {
      setAccountSetupError("Zadej aktuální heslo k účtu.");
      return;
    }

    setAccountSetupMfaSaving(true);
    setAccountSetupError(null);
    setAccountSetupInfo(null);
    try {
      await user.reload();
      const activeUser = auth.currentUser ?? user;
      const totpAlreadyEnabled = multiFactor(activeUser).enrolledFactors.some(
        (factor) => factor.factorId === FactorId.TOTP
      );
      if (totpAlreadyEnabled) {
        setAccountSetupMfaEnabled(true);
        clearAccountSetupMfaDraft();
        setAccountSetupMfaPassword("");
        await markAccountSetupCompleted();
        return;
      }

      const credential = EmailAuthProvider.credential(activeUserEmail, currentPassword);
      await reauthenticateWithCredential(activeUser, credential);
      if (!activeUser.emailVerified) {
        setAccountSetupInfo("Potvrzuji e-mail pro zapnutí 2FA.");
        await confirmEmailForMfaEnrollment(activeUser);
      }
      const enrollmentUser = auth.currentUser ?? activeUser;
      const session = await multiFactor(enrollmentUser).getSession();
      const secret = await TotpMultiFactorGenerator.generateSecret(session);
      setAccountSetupMfaSecret(secret);
      setAccountSetupMfaCode("");
      setAccountSetupInfo(null);
    } catch (error) {
      console.warn("[AccountSetupMFA] start enrollment failed", {
        code: (error as { code?: string })?.code,
        message: error instanceof Error ? error.message : String(error),
      });
      setAccountSetupError(
        resolveAccountSetupMfaErrorMessage(
          error,
          "Nepodařilo se spustit nastavení 2FA."
        )
      );
    } finally {
      setAccountSetupMfaSaving(false);
    }
  };

  const confirmAccountSetupMfaEnrollment = async () => {
    if (!user || !accountSetupMfaSecret) {
      setAccountSetupError("Nejprve spusť nastavení 2FA.");
      return;
    }

    const verificationCode = accountSetupMfaCode.replace(/\D+/g, "").slice(0, 8);
    if (verificationCode.length < 6) {
      setAccountSetupError("Zadej aktuální 6místný kód z aplikace.");
      return;
    }

    setAccountSetupMfaSaving(true);
    setAccountSetupError(null);
    try {
      const activeUser = auth.currentUser ?? user;
      const assertion = TotpMultiFactorGenerator.assertionForEnrollment(
        accountSetupMfaSecret,
        verificationCode
      );
      await multiFactor(activeUser).enroll(assertion, MFA_FACTOR_LABEL);
      await syncAccountSetupMfaState(activeUser);
      setAccountSetupMfaPassword("");
      clearAccountSetupMfaDraft();
      await markAccountSetupCompleted();
    } catch (error) {
      console.warn("[AccountSetupMFA] confirm enrollment failed", {
        code: (error as { code?: string })?.code,
        message: error instanceof Error ? error.message : String(error),
      });
      setAccountSetupError(
        resolveAccountSetupMfaErrorMessage(
          error,
          "2FA se nepodařilo dokončit. Zkus to prosím znovu."
        )
      );
    } finally {
      setAccountSetupMfaSaving(false);
    }
  };

  const navItemBase =
    "group relative flex items-center rounded-[18px] px-3 py-2.5 text-[15px] font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-white";
  const navLabelBase = "flex w-full items-center gap-3";
  const navItemActiveClass =
    "bg-[linear-gradient(135deg,#111827_0%,#211442_54%,#090d1c_100%)] text-white shadow-[0_14px_28px_rgba(18,12,43,0.28)] ring-1 ring-white/10";
  const navItemInactiveClass =
    "text-slate-600 hover:bg-white/80 hover:text-slate-950 hover:shadow-[0_10px_22px_rgba(15,23,42,0.08)]";
  const activeNavRailClass =
    "bg-[linear-gradient(180deg,#a855f7_0%,#ec4899_100%)] shadow-[0_0_16px_rgba(168,85,247,0.55)]";
  const layoutCopy = APP_LAYOUT_COPY[language];
  const userEmail = user?.email ?? "";
  const userInitial = userEmail.trim().charAt(0).toUpperCase() || "B";

  const navItems: {
    key: ActivePage;
    href: string;
    label: string;
    icon: LucideIcon;
    requiresTeam?: boolean;
    requiresTipsters?: boolean;
    requiresAdmin?: boolean;
  }[] = [
    { key: "home", href: "/", label: layoutCopy.nav.home, icon: Home },
    {
      key: "team",
      href: "/muj-tym",
      label: layoutCopy.nav.team,
      icon: UsersRound,
    },
    {
      key: "intranet",
      href: "/intranet",
      label: layoutCopy.nav.intranet,
      icon: Building2,
    },
    { key: "calc", href: "/kalkulacka", label: layoutCopy.nav.calc, icon: Calculator },
    { key: "contracts", href: "/smlouvy", label: layoutCopy.nav.contracts, icon: FileText },
    { key: "tips", href: "/tipy", label: layoutCopy.nav.tips, icon: Lightbulb, requiresTipsters: true },
    {
      key: "cashflow",
      href: "/cashflow",
      label: layoutCopy.nav.cashflow,
      icon: CalendarDays,
    },
    { key: "tools", href: "/pomucky", label: layoutCopy.nav.tools, icon: Wrench },
    {
      key: "admin",
      href: "/admin/zadosti",
      label: layoutCopy.nav.admin,
      icon: ShieldCheck,
      requiresAdmin: true,
    },
    { key: "settings", href: "/nastaveni", label: layoutCopy.nav.settings, icon: Settings },
  ];

  const tipsterNavItems: {
    key: ActivePage;
    href: string;
    label: string;
    icon: LucideIcon;
  }[] = [
    { key: "home", href: "/", label: layoutCopy.nav.home, icon: Home },
    { key: "tips", href: "/tipy", label: layoutCopy.nav.tips, icon: Lightbulb },
    {
      key: "cashflow",
      href: "/cashflow",
      label: layoutCopy.nav.cashflow,
      icon: CalendarDays,
    },
  ];

  const renderNavIcon = (Icon: LucideIcon, isActive: boolean) => (
    <span
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] border transition ${
        isActive
          ? "border-white/20 bg-white/10 text-cyan-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]"
          : "border-slate-200/90 bg-white/90 text-slate-500 shadow-sm group-hover:border-fuchsia-200 group-hover:bg-fuchsia-50/80 group-hover:text-fuchsia-700"
      }`}
      aria-hidden="true"
    >
      <Icon
        className={`h-[18px] w-[18px] ${isActive ? "text-white" : ""}`}
        strokeWidth={2}
      />
    </span>
  );

  const isTipsterAccount = accountType === "tipster";
  const isNavProfilePending = Boolean(user && loadingProfile);
  const activeNavItems = isNavProfilePending
    ? []
    : isTipsterAccount
      ? tipsterNavItems
      : navItems;
  const showPaywall =
    !!user &&
    hasInternalProfile &&
    !isTipsterAccount &&
    subscriptionAccessState === "blocked" &&
    !loadingProfile;
  const tipsterRestrictedRoute = isTipsterAccount && !isTipsterAllowedRoute;
  const accountSetupMfaGraceStartMs = parseIsoDateTimeMs(accountSetupMfaGraceStartedAt);
  const accountSetupMfaGraceDeadlineMs =
    accountSetupMfaGraceStartMs == null
      ? null
      : accountSetupMfaGraceStartMs + MFA_GRACE_PERIOD_MS;
  // Server-side setup guard now requires enrolled TOTP; legacy grace timestamps are read-only.
  const accountSetupMfaGraceEligible = false;
  const accountSetupMfaGraceActive =
    accountSetupMfaGraceEligible &&
    accountSetupMfaGraceDeadlineMs != null &&
    Date.now() < accountSetupMfaGraceDeadlineMs;
  const accountSetupMfaGraceExpired =
    accountSetupMfaGraceEligible &&
    accountSetupMfaGraceDeadlineMs != null &&
    Date.now() >= accountSetupMfaGraceDeadlineMs;
  const accountSetupMfaHardRequired = !accountSetupMfaEnabled;
  const accountSetupContactMissing =
    !accountSetupSavedPhone.trim() || !accountSetupSavedIco.trim();
  const accountSetupGateRequired =
    accountSetupContactMissing || needsCareerTimelineSetup || accountSetupMfaHardRequired;
  const accountSetupMfaGraceRemainingDays =
    accountSetupMfaGraceDeadlineMs == null
      ? 0
      : Math.max(1, Math.ceil((accountSetupMfaGraceDeadlineMs - Date.now()) / (24 * 60 * 60 * 1000)));
  const accountSetupMfaGraceDeadlineLabel =
    accountSetupMfaGraceDeadlineMs == null
      ? ""
      : formatIsoDayCz(new Date(accountSetupMfaGraceDeadlineMs).toISOString().slice(0, 10));
  const showAccountSetupMfaGraceBanner =
    accountSetupMfaGraceActive && !showAccountSetupWizard && !showPaywall;
  const timelineSetupGateActive =
    !!user &&
    !isTipsterAccount &&
    !loadingProfile &&
    accountSetupMfaReady &&
    subscriptionAccessState !== "blocked" &&
    accountSetupGateRequired;
  const isAdminRequestsUser = adminRoleAtLeast(adminRole, "admin");
  const shellFontClass = "font-mono";
  const accountSetupCurrentStep =
    ACCOUNT_SETUP_STEPS[accountSetupStep]?.id ?? "phone";
  const accountSetupLastStep = ACCOUNT_SETUP_STEPS.length - 1;
  const accountSetupProgress = accountSetupCompleted
    ? 100
    : ((accountSetupStep + 1) / ACCOUNT_SETUP_STEPS.length) * 100;
  const accountSetupBusy =
    accountSetupPhoneSaving ||
    accountSetupTimelineSaving ||
    accountSetupMfaSaving ||
    accountSetupCompletionSaving;
  const accountSetupFieldClass =
    "w-full rounded-2xl border border-white/18 bg-white/[0.06] px-3 py-2.5 text-sm font-semibold text-white outline-none transition placeholder:text-violet-100/38 focus:border-violet-200/70 focus:bg-white/[0.09] focus:ring-2 focus:ring-violet-200/20";
  const accountSetupPrimaryLabel =
    accountSetupCurrentStep === "phone"
      ? accountSetupPhoneSaving
        ? "Ukládám"
        : "Pokračovat"
      : accountSetupCurrentStep === "career"
        ? accountSetupTimelineSaving
          ? "Ukládám"
          : "Pokračovat"
        : accountSetupMfaEnabled
          ? accountSetupCompletionSaving
            ? "Dokončuji"
            : "Dokončit"
          : accountSetupMfaSecret
            ? accountSetupMfaSaving
              ? "Potvrzuji"
              : "Potvrdit 2FA"
            : accountSetupMfaSaving
              ? "Spouštím 2FA"
              : "Zapnout 2FA";

  // Pokud auth není připravené, nerenderuj obsah (zamezení blikání nechráněného UI)
  if (!authReady) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white text-slate-900">
        <div className="max-w-sm px-6 text-center">
          <div className="text-sm text-slate-700">
            {authInitTimedOut
              ? "Přihlášení se načítá déle než obvykle."
              : "Načítám přihlášení…"}
          </div>
          {authInitTimedOut ? (
            <a
              href="/login"
              className="mt-4 inline-flex rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
            >
              Přejít na přihlášení
            </a>
          ) : null}
        </div>
      </main>
    );
  }

  // user je null a redirect se provede v efektu výše
  if (authReady && !user) {
    return null;
  }

  const backgroundStyle = { backgroundColor: "#ffffff" };

  return (
    <main className="relative min-h-screen text-slate-900">
      <div
        className="fixed inset-0 -z-10 transition-colors duration-200"
        style={backgroundStyle}
      />

      <div className="relative flex min-h-screen">
        {showAccountSetupWizard && !showPaywall && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-3 py-4 backdrop-blur-sm sm:px-4"
            role="dialog"
            aria-modal="true"
            aria-label={layoutCopy.accountSettings}
          >
            <section className="vizitka-anim-up max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-[28px] border border-violet-300/25 bg-[linear-gradient(155deg,#160c2a_0%,#100b21_100%)] p-4 text-[#f8fafc] shadow-[0_34px_90px_rgba(7,6,25,0.72),inset_0_1px_0_rgba(196,181,253,0.2)] sm:p-6">
              {accountSetupCompleted ? (
                <div className="flex min-h-[360px] flex-col items-center justify-center py-8 text-center">
                  <div className="relative mb-6 flex h-24 w-24 items-center justify-center rounded-full border border-emerald-300/55 bg-emerald-400/18 text-emerald-100 shadow-[0_0_42px_rgba(52,211,153,0.28)]">
                    <span className="absolute inset-0 rounded-full border border-emerald-300/45 motion-safe:animate-ping" />
                    <span className="absolute inset-3 rounded-full bg-emerald-300/14 motion-safe:animate-pulse" />
                    <CheckCircle2 className="relative h-12 w-12" strokeWidth={2.4} />
                  </div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-200/85">
                    Hotovo
                  </p>
                  <h2 className="mt-2 text-2xl font-bold tracking-[-0.02em] text-white sm:text-3xl">
                    Účet úspěšně otevřen
                  </h2>
                  <p className="mt-3 max-w-md text-sm leading-relaxed text-violet-100/72">
                    Telefon, kariéra a 2FA jsou nastavené. Aplikace je připravená na přesné
                    výpočty a předvyplnění pozice.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-200/80">
                        Vítej v aplikaci!
                      </p>
                      <h2 className="mt-2 text-xl font-bold tracking-[-0.02em] text-white sm:text-2xl">
                        Nejprve je potřeba nastavit účet pro hladký chod.
                      </h2>
                    </div>
                    <div className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/14 bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-violet-100/75">
                      Krok {accountSetupStep + 1} / {ACCOUNT_SETUP_STEPS.length}
                    </div>
                  </div>

                  <div className="mt-5 rounded-2xl border border-white/14 bg-white/[0.04] px-3 py-3">
                    <div
                      className="grid gap-2"
                      style={{
                        gridTemplateColumns: `repeat(${ACCOUNT_SETUP_STEPS.length}, minmax(0, 1fr))`,
                      }}
                    >
                      {ACCOUNT_SETUP_STEPS.map((stepItem, index) => {
                        const stepDone = accountSetupStep > index || accountSetupCompleted;
                        const stepActive = accountSetupStep === index && !accountSetupCompleted;

                        return (
                          <div key={stepItem.id} className="flex flex-col items-center gap-1 text-center">
                            <span
                              className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold transition ${
                                stepDone
                                  ? "border-emerald-300/70 bg-emerald-400/25 text-emerald-100"
                                  : stepActive
                                    ? "border-violet-200/70 bg-violet-400/30 text-[#f8fafc]"
                                    : "border-white/20 bg-white/[0.03] text-violet-200/70"
                              }`}
                            >
                              {stepDone ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                            </span>
                            <span
                              className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${
                                stepActive || stepDone ? "text-[#f4f0ff]" : "text-violet-200/60"
                              }`}
                            >
                              {stepItem.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-3 h-1.5 rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-[linear-gradient(90deg,#10b981_0%,#22c55e_55%,#86efac_100%)] transition-[width] duration-300"
                        style={{ width: `${accountSetupProgress}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-5">
                    {accountSetupCurrentStep === "phone" ? (
                      <div className="space-y-4">
                        <div className="flex items-start gap-3">
                          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-300/45 bg-emerald-400/14 text-emerald-100">
                            <PhoneCall className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.17em] text-violet-200/85">
                              Kontaktní údaje
                            </p>
                            <h3 className="mt-1 text-base font-semibold text-white">Telefon a IČO</h3>
                            <p className="mt-1 text-sm leading-relaxed text-violet-100/66">
                              Údaje se uloží do profilu a použijí se tam, kde aplikace pracuje
                              s identifikací a kontaktem poradce.
                            </p>
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block space-y-2">
                            <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-violet-200/78">
                              Tel. číslo
                            </span>
                            <input
                              type="tel"
                              inputMode="tel"
                              value={accountSetupPhone}
                              onChange={(event) => {
                                setAccountSetupPhone(event.target.value.slice(0, PHONE_NUMBER_MAX_LEN));
                                setAccountSetupError(null);
                              }}
                              placeholder="777 123 456"
                              maxLength={PHONE_NUMBER_MAX_LEN}
                              disabled={accountSetupPhoneSaving}
                              className={accountSetupFieldClass}
                            />
                          </label>

                          <label className="block space-y-2">
                            <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-violet-200/78">
                              IČO
                            </span>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={accountSetupIco}
                              onChange={(event) => {
                                setAccountSetupIco(
                                  event.target.value.replace(/\D+/g, "").slice(0, PROFILE_ICO_MAX_LEN)
                                );
                                setAccountSetupError(null);
                              }}
                              placeholder="12345678"
                              maxLength={PROFILE_ICO_MAX_LEN}
                              disabled={accountSetupPhoneSaving}
                              className={accountSetupFieldClass}
                            />
                          </label>
                        </div>
                      </div>
                    ) : null}

                    {accountSetupCurrentStep === "career" ? (
                      <div className="space-y-4">
                        <div className="flex items-start gap-3">
                          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-300/45 bg-emerald-400/14 text-emerald-100">
                            <BriefcaseBusiness className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.17em] text-violet-200/85">
                              Historie kariéry
                            </p>
                            <h3 className="mt-1 text-base font-semibold text-white">Nastavení kariéry</h3>
                            <p className="mt-1 text-sm leading-relaxed text-violet-100/66">
                              Pozice podle období se používají pro předvyplnění kalkulačky
                              a přesné provizní výpočty.
                            </p>
                          </div>
                        </div>

                        <div className="rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-3 py-3 text-sm leading-relaxed text-emerald-50/88">
                          Historii kariéry najdeš v Maxxu pod odkazem{" "}
                          <a
                            href="https://sjednatel.bohemiaservis.cz/broker-card"
                            target="_blank"
                            rel="noreferrer noopener"
                            className="inline-flex items-center gap-1 rounded-full border border-emerald-200/40 bg-emerald-300/18 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-white no-underline transition hover:bg-emerald-300/28"
                          >
                            KLIKNI ZDE
                            <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
                          </a>
                          , záložka Kariéra. Řádky zadávej od nejstarší pozice po aktuální.
                          Datumy zadávej totožné.
                        </div>

                        <div className="space-y-2.5">
                          {accountSetupTimelineDraft.map((row, rowIndex) => {
                            const rowRangeError = hasInvalidRangeOrder(
                              row.validFrom.trim(),
                              row.validTo.trim()
                            );
                            const isLastDraftRow = rowIndex === accountSetupTimelineDraft.length - 1;
                            const rowOpenEndedNotLast = !row.validTo.trim() && !isLastDraftRow;

                            return (
                              <div
                                key={row.id}
                                className={`rounded-2xl border bg-white/[0.05] px-3 py-3 shadow-[0_10px_24px_rgba(7,6,25,0.22)] ${
                                  rowRangeError || rowOpenEndedNotLast
                                    ? "border-rose-300/65"
                                    : "border-white/14"
                                }`}
                              >
                                <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_150px_150px_auto]">
                                  <label className="space-y-1.5">
                                    <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-200/66">
                                      Pozice
                                    </span>
                                    <select
                                      value={row.position}
                                      onChange={(event) =>
                                        updateAccountSetupTimelineRow(row.id, {
                                          position: event.target.value as Position | "",
                                        })
                                      }
                                      disabled={accountSetupTimelineSaving}
                                      className={`${accountSetupFieldClass} [color-scheme:dark]`}
                                    >
                                      <option value="">Vyber pozici</option>
                                      {POSITIONS.map((positionItem) => (
                                        <option key={positionItem.id} value={positionItem.id}>
                                          {positionItem.label}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <label className="space-y-1.5">
                                    <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-200/66">
                                      Platí od
                                    </span>
                                    <input
                                      type="date"
                                      value={row.validFrom}
                                      onChange={(event) =>
                                        updateAccountSetupTimelineRow(row.id, {
                                          validFrom: event.target.value,
                                        })
                                      }
                                      disabled={accountSetupTimelineSaving}
                                      className={`${accountSetupFieldClass} [color-scheme:dark]`}
                                    />
                                  </label>
                                  <label className="space-y-1.5">
                                    <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-200/66">
                                      Platí do
                                    </span>
                                    <input
                                      type="date"
                                      value={row.validTo}
                                      onChange={(event) =>
                                        updateAccountSetupTimelineRow(row.id, {
                                          validTo: event.target.value,
                                        })
                                      }
                                      disabled={accountSetupTimelineSaving}
                                      className={`${accountSetupFieldClass} [color-scheme:dark]`}
                                    />
                                  </label>
                                  <div className="flex items-end">
                                    <button
                                      type="button"
                                      onClick={() => removeAccountSetupTimelineRow(row.id)}
                                      disabled={accountSetupTimelineSaving}
                                      className="inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-2xl border border-white/18 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-violet-100 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-55 md:w-auto"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
                                      Smazat
                                    </button>
                                  </div>
                                </div>

                                {rowRangeError ? (
                                  <p className="mt-2 text-xs font-medium text-rose-100">
                                    Datum DO nemůže být dřív než datum OD.
                                  </p>
                                ) : null}
                                {rowOpenEndedNotLast ? (
                                  <p className="mt-2 text-xs font-medium text-rose-100">
                                    Současnost (prázdné DO) může být jen u posledního řádku.
                                  </p>
                                ) : null}
                                {isLastDraftRow && !row.validTo.trim() ? (
                                  <div className="mt-2">
                                    <span className="rounded-full border border-emerald-300/40 bg-emerald-400/14 px-2.5 py-1 text-[11px] font-semibold text-emerald-100">
                                      Poslední pozice běží do současnosti
                                    </span>
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>

                        <button
                          type="button"
                          onClick={addAccountSetupTimelineRow}
                          disabled={accountSetupTimelineSaving}
                          className="inline-flex items-center gap-2 rounded-full border border-white/18 bg-white/[0.05] px-3 py-2 text-xs font-semibold text-violet-100 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-55"
                        >
                          <Plus className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                          Přidat pozici
                        </button>
                      </div>
                    ) : null}

                    {accountSetupCurrentStep === "security" ? (
                      <div className="space-y-4">
                        <div className="flex items-start gap-3">
                          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-300/45 bg-emerald-400/14 text-emerald-100">
                            <ShieldCheck className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.17em] text-violet-200/85">
                              Zabezpečení účtu
                            </p>
                            <h3 className="mt-1 text-base font-semibold text-white">Zapnutí 2FA</h3>
                            <p className="mt-1 text-sm leading-relaxed text-violet-100/66">
                              Dvoufázové ověření nastav přes Microsoft Authenticator nebo jinou
                              aplikaci pro jednorázové kódy.
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <a
                            href={MICROSOFT_AUTHENTICATOR_APP_STORE_URL}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="inline-flex items-center gap-2 rounded-full border border-white/16 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-violet-50 transition hover:bg-white/[0.11]"
                            aria-label="Otevřít Microsoft Authenticator v App Store"
                          >
                            <Apple className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
                            App Store
                            <ExternalLink className="h-3 w-3" strokeWidth={2.2} aria-hidden="true" />
                          </a>
                          <a
                            href={MICROSOFT_AUTHENTICATOR_GOOGLE_PLAY_URL}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="inline-flex items-center gap-2 rounded-full border border-white/16 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-violet-50 transition hover:bg-white/[0.11]"
                            aria-label="Otevřít Microsoft Authenticator v Google Play"
                          >
                            <Play className="h-3.5 w-3.5" strokeWidth={2.2} fill="currentColor" aria-hidden="true" />
                            Google Play
                            <ExternalLink className="h-3 w-3" strokeWidth={2.2} aria-hidden="true" />
                          </a>
                        </div>

                        {accountSetupMfaGraceActive ? (
                          <div className="rounded-2xl border border-amber-200/35 bg-amber-300/12 px-3 py-3 text-sm leading-relaxed text-amber-50/90">
                            2FA je potřeba zapnout do {accountSetupMfaGraceRemainingDays}{" "}
                            {accountSetupMfaGraceRemainingDays === 1 ? "dne" : "dnů"}
                            {accountSetupMfaGraceDeadlineLabel
                              ? ` (${accountSetupMfaGraceDeadlineLabel})`
                              : ""}
                            . Do té doby můžeš pokračovat v aplikaci.
                          </div>
                        ) : null}

                        {accountSetupMfaGraceExpired ? (
                          <div className="rounded-2xl border border-rose-200/35 bg-rose-400/14 px-3 py-3 text-sm leading-relaxed text-rose-50/90">
                            Lhůta pro zapnutí 2FA vypršela. Pro pokračování je potřeba účet
                            zabezpečit.
                          </div>
                        ) : null}

                        {accountSetupMfaEnabled ? (
                          <div className="flex items-start gap-3 rounded-2xl border border-emerald-300/30 bg-emerald-400/12 px-3 py-3 text-sm text-emerald-50/90">
                            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-100" aria-hidden="true" />
                            <div>
                              <p className="font-semibold text-white">2FA je zapnuté</p>
                              <p className="mt-0.5 text-emerald-50/74">
                                Účet je zabezpečený a můžeš dokončit nastavení.
                              </p>
                            </div>
                          </div>
                        ) : null}

                        {!accountSetupMfaEnabled && !accountSetupMfaSecret ? (
                          <div className="rounded-2xl border border-white/14 bg-white/[0.05] px-3 py-3">
                            <p className="text-sm leading-relaxed text-violet-100/68">
                              Nejdřív potvrď aktuální heslo. Potom se zobrazí QR kód pro
                              přidání účtu do aplikace s ověřovacími kódy.
                            </p>
                            <label className="mt-3 block space-y-2">
                              <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-violet-200/78">
                                Aktuální heslo
                              </span>
                              <input
                                type="password"
                                autoComplete="current-password"
                                value={accountSetupMfaPassword}
                                onChange={(event) => {
                                  setAccountSetupMfaPassword(event.target.value);
                                  setAccountSetupError(null);
                                  setAccountSetupInfo(null);
                                }}
                                placeholder="Aktuální heslo"
                                disabled={accountSetupMfaSaving}
                                className={accountSetupFieldClass}
                              />
                            </label>
                          </div>
                        ) : null}

                        {!accountSetupMfaEnabled && accountSetupMfaSecret ? (
                          <div className="space-y-3 rounded-2xl border border-white/14 bg-white/[0.05] px-3 py-3">
                            <div className="flex items-start gap-3">
                              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-violet-200/28 bg-violet-300/12 text-violet-100">
                                <QrCode className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
                              </span>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-white">Naskenuj QR kód</p>
                                <p className="mt-1 text-sm leading-relaxed text-violet-100/66">
                                  Po přidání účtu opiš aktuální kód z aplikace.
                                </p>
                              </div>
                            </div>

                            <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)] md:items-start">
                              <div className="flex h-[220px] w-[220px] items-center justify-center overflow-hidden rounded-2xl border border-white/14 bg-white p-2">
                                {accountSetupMfaQrLoading ? (
                                  <Loader2 className="h-7 w-7 animate-spin text-slate-500" aria-hidden="true" />
                                ) : accountSetupMfaQrDataUrl ? (
                                  <Image
                                    src={accountSetupMfaQrDataUrl}
                                    alt="QR kód pro nastavení 2FA"
                                    width={220}
                                    height={220}
                                    unoptimized
                                    className="h-full w-full object-contain"
                                  />
                                ) : (
                                  <QrCode className="h-10 w-10 text-slate-400" aria-hidden="true" />
                                )}
                              </div>

                              <div className="min-w-0 space-y-3">
                                {accountSetupMfaQrError ? (
                                  <p className="rounded-2xl border border-amber-200/35 bg-amber-300/12 px-3 py-2 text-xs font-semibold text-amber-100">
                                    {accountSetupMfaQrError}
                                  </p>
                                ) : null}

                                <div className="rounded-2xl border border-white/12 bg-slate-950/35 px-3 py-2">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-200/62">
                                    Ruční klíč
                                  </p>
                                  <p className="mt-1 break-all font-mono text-xs font-semibold text-violet-50">
                                    {accountSetupMfaSecret.secretKey}
                                  </p>
                                </div>

                                <label className="block space-y-2">
                                  <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-violet-200/78">
                                    2FA kód
                                  </span>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    value={accountSetupMfaCode}
                                    onChange={(event) => {
                                      setAccountSetupMfaCode(
                                        event.target.value.replace(/\D+/g, "").slice(0, 8)
                                      );
                                      setAccountSetupError(null);
                                    }}
                                    placeholder="123456"
                                    disabled={accountSetupMfaSaving}
                                    className={accountSetupFieldClass}
                                  />
                                </label>
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  {accountSetupInfo ? (
                    <p className="mt-4 rounded-2xl border border-emerald-300/35 bg-emerald-400/14 px-3 py-2 text-xs font-semibold text-emerald-100">
                      {accountSetupInfo}
                    </p>
                  ) : null}

                  {accountSetupError ? (
                    <p className="mt-4 rounded-2xl border border-rose-300/45 bg-rose-400/15 px-3 py-2 text-xs font-semibold text-rose-100">
                      {accountSetupError}
                    </p>
                  ) : null}

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-4">
                    <button
                      type="button"
                      onClick={handleLogout}
                      disabled={accountSetupBusy}
                      className="inline-flex items-center gap-2 rounded-full border border-white/14 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-violet-100/72 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-55"
                    >
                      {layoutCopy.logout}
                    </button>

                    <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                      {accountSetupMfaGraceActive && accountSetupCurrentStep === "security" ? (
                        <button
                          type="button"
                          onClick={() => {
                            setAccountSetupError(null);
                            setAccountSetupWizardManuallyOpened(false);
                            setShowAccountSetupWizard(false);
                          }}
                          disabled={accountSetupBusy}
                          className="inline-flex items-center gap-2 rounded-full border border-white/18 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-violet-100 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-55"
                        >
                          Připomenout později
                        </button>
                      ) : null}

                      {accountSetupStep > 0 ? (
                        <button
                          type="button"
                          onClick={() => {
                            setAccountSetupError(null);
                            setAccountSetupStep((prev) => Math.max(prev - 1, 0));
                          }}
                          disabled={accountSetupBusy}
                          className="inline-flex items-center gap-2 rounded-full border border-white/22 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-violet-100 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-55"
                        >
                          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                          Zpět
                        </button>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => {
                          if (accountSetupCurrentStep === "phone") {
                            void saveAccountSetupPhone();
                            return;
                          }
                          if (accountSetupCurrentStep === "career") {
                            void saveAccountSetupCareer();
                            return;
                          }
                          if (accountSetupMfaEnabled) {
                            void markAccountSetupCompleted();
                            return;
                          }
                          if (accountSetupMfaSecret) {
                            void confirmAccountSetupMfaEnrollment();
                            return;
                          }
                          void startAccountSetupMfaEnrollment();
                        }}
                        disabled={accountSetupBusy}
                        className="inline-flex min-w-[154px] items-center justify-center gap-2 rounded-full border border-emerald-300/25 bg-[linear-gradient(120deg,#059669_0%,#10b981_55%,#34d399_100%)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(16,185,129,0.32)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {accountSetupBusy ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : accountSetupStep < accountSetupLastStep ? (
                          <ChevronRight className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <Sparkles className="h-4 w-4" aria-hidden="true" />
                        )}
                        {accountSetupPrimaryLabel}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </section>
          </div>
        )}

        {/* SIDEBAR */}
        <aside
          className={`hidden w-64 shrink-0 flex-col border-r border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_48%,#fff6fb_100%)] shadow-[10px_0_34px_rgba(15,23,42,0.08)] backdrop-blur-sm lg:flex ${shellFontClass}`}
        >
          <div className="px-4 pb-3 pt-5">
            <Link
              href="/"
              className="group flex items-center gap-3 rounded-[26px] border border-white/75 bg-white/80 p-3 shadow-[0_14px_34px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_38px_rgba(15,23,42,0.11)]"
            >
              <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-sky-100 bg-sky-50/80">
                <Image
                  src="/icons/bohemika_logo.png"
                  alt="Bohemika logo"
                  width={52}
                  height={52}
                  className="h-9 w-auto"
                  priority
                />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-base font-bold tracking-tight text-slate-950">
                  Bohemka.App
                </span>
                <span className="mt-0.5 block truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  SmartApp
                </span>
              </span>
            </Link>
          </div>

          <nav className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-3 pr-2">
            {activeNavItems.map((item) => {
              if ("requiresTeam" in item && item.requiresTeam && !hasTeam) return null;
              if ("requiresTipsters" in item && item.requiresTipsters && !hasTipsters) return null;
              if ("requiresAdmin" in item && item.requiresAdmin && !isAdminRequestsUser) return null;
              const isActive = active === item.key;
              const navDisabled = timelineSetupGateActive && item.key !== "settings";
              return (
                navDisabled ? (
                  <div
                    key={item.key}
                    aria-disabled="true"
                    className={`${navItemBase} cursor-not-allowed opacity-50 ${
                      isActive ? navItemActiveClass : navItemInactiveClass
                    }`}
                  >
                    {isActive ? (
                      <span
                        className={`absolute left-1.5 top-1/2 h-7 w-1 -translate-y-1/2 rounded-full ${activeNavRailClass}`}
                        aria-hidden="true"
                      />
                    ) : null}
                    <span className={navLabelBase}>
                      {renderNavIcon(item.icon, isActive)}
                      <span className="truncate">{item.label}</span>
                    </span>
                  </div>
                ) : (
                  <Link
                    key={item.key}
                    href={item.href}
                    prefetch={item.key === "team" ? false : true}
                    className={`${navItemBase} ${
                      isActive ? navItemActiveClass : navItemInactiveClass
                    }`}
                  >
                    {isActive ? (
                      <span
                        className={`absolute left-1.5 top-1/2 h-7 w-1 -translate-y-1/2 rounded-full ${activeNavRailClass}`}
                        aria-hidden="true"
                      />
                    ) : null}
                    <span className={navLabelBase}>
                      {renderNavIcon(item.icon, isActive)}
                      <span className="truncate">{item.label}</span>
                    </span>
                  </Link>
                )
              );
            })}
          </nav>

          <div className="mt-auto px-3 pb-4 pt-3">
            <div className="overflow-hidden rounded-[24px] border border-white/75 bg-white/85 p-3 shadow-[0_16px_34px_rgba(15,23,42,0.1)]">
              {user && (
                <div className="mb-3 flex min-w-0 items-center gap-3">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#101827_0%,#2d1a62_100%)] text-sm font-bold text-white shadow-[0_10px_20px_rgba(45,26,98,0.28)]">
                    {userInitial}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                      Přihlášen
                    </span>
                    <span className="block truncate text-xs font-semibold text-slate-800">
                      {userEmail}
                    </span>
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={handleLogout}
                className="w-full rounded-2xl bg-slate-950 px-3 py-2.5 text-xs font-bold text-white shadow-[0_12px_22px_rgba(15,23,42,0.18)] transition hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300/70 focus-visible:ring-offset-2"
              >
                {layoutCopy.logout}
              </button>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* MOBILE TOP BAR */}
          <header
            className={`sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-900 bg-white px-3 py-2.5 lg:hidden ${shellFontClass}`}
          >
            <div className="flex min-w-0 items-center gap-2">
              <Image
                src="/icons/bohemika_logo.png"
                alt="Bohemika logo"
                width={84}
                height={36}
                className="h-9 w-auto shrink-0"
                priority
              />
              <div className="min-w-0">
                <span className="block truncate text-[11px] font-semibold text-slate-900">
                  Bohemka.App
                </span>
                {user && (
                  <span
                    className="block max-w-[46vw] truncate text-[10px] text-slate-500 min-[390px]:max-w-[52vw]"
                  >
                    {user.email}
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="ui-btn-primary ui-focus inline-flex shrink-0 items-center gap-2 rounded-[18px] px-3 py-2 text-xs"
            >
              <span className="text-base leading-none">☰</span>
              <span className="hidden min-[390px]:inline">Menu</span>
            </button>
          </header>

          {/* MOBILE NAV OVERLAY */}
          {mobileMenuOpen && (
            <div className="fixed inset-0 z-[70] lg:hidden">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setMobileMenuOpen(false)}
              />
              <div
                className={`relative h-full w-80 max-w-[88%] overflow-y-auto border-r border-slate-900 bg-white px-4 py-5 shadow-2xl ${shellFontClass}`}
              >
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Image
                      src="/icons/bohemika_logo.png"
                      alt="Bohemika logo"
                      width={110}
                      height={40}
                      className="h-10 w-auto"
                      priority
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setMobileMenuOpen(false)}
                    className="ui-btn-primary ui-focus rounded-full px-3 py-1 text-xs"
                  >
                    Zavřít
                  </button>
                </div>

                <nav className="space-y-2">
                  {activeNavItems.map((item) => {
                    if ("requiresTeam" in item && item.requiresTeam && !hasTeam) return null;
                    if ("requiresTipsters" in item && item.requiresTipsters && !hasTipsters) return null;
                    if ("requiresAdmin" in item && item.requiresAdmin && !isAdminRequestsUser) return null;
                    const isActive = active === item.key;
                    const navDisabled = timelineSetupGateActive && item.key !== "settings";
                    return (
                      navDisabled ? (
                        <div
                          key={item.key}
                          aria-disabled="true"
                          className={`${navItemBase} cursor-not-allowed opacity-50 ${
                            isActive ? navItemActiveClass : navItemInactiveClass
                          }`}
                        >
                          {isActive ? (
                            <span
                              className={`absolute left-1.5 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full ${activeNavRailClass}`}
                              aria-hidden="true"
                            />
                          ) : null}
                          <span className={navLabelBase}>
                            {renderNavIcon(item.icon, isActive)}
                            <span className="truncate">{item.label}</span>
                          </span>
                        </div>
                      ) : (
                        <Link
                          key={item.key}
                          href={item.href}
                          prefetch={item.key === "team" ? false : true}
                          onClick={() => setMobileMenuOpen(false)}
                          className={`${navItemBase} ${
                            isActive ? navItemActiveClass : navItemInactiveClass
                          }`}
                        >
                          {isActive ? (
                            <span
                              className={`absolute left-1.5 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full ${activeNavRailClass}`}
                              aria-hidden="true"
                            />
                          ) : null}
                          <span className={navLabelBase}>
                            {renderNavIcon(item.icon, isActive)}
                            <span className="truncate">{item.label}</span>
                          </span>
                        </Link>
                      )
                    );
                  })}
                </nav>

                <div className="mt-6 border-t border-slate-900 pt-4">
                  {user && (
                    <div className="mb-3 text-[11px] text-slate-600">
                      Přihlášen jako{" "}
                      <span className="block truncate text-slate-900">
                        {user.email ?? ""}
                      </span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="ui-btn-primary ui-focus w-full rounded-xl py-2 text-xs"
                  >
                    {layoutCopy.logout}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* CONTENT / PAYWALL */}
          <div
            className={[
              `app-content relative flex min-w-0 w-full flex-1 items-start ${contentOverflowClass} ${shellFontClass}`,
              isFullBleedPage
                ? "justify-start px-0 py-6 sm:py-8 lg:px-0"
                : "justify-center px-3 py-6 sm:px-4 sm:py-8 lg:px-8",
            ].join(" ")}
          >
            {showAccountSetupMfaGraceBanner ? (
              <div className="fixed right-4 top-4 z-40 w-[calc(100vw-2rem)] max-w-md rounded-2xl border border-amber-300/80 bg-amber-50/95 px-4 py-3 text-sm text-amber-950 shadow-[0_16px_34px_rgba(15,23,42,0.2)] backdrop-blur sm:right-5 sm:top-5">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-amber-300 bg-white text-amber-800">
                    <ShieldCheck className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">Zapni 2FA do {accountSetupMfaGraceRemainingDays}{" "}
                      {accountSetupMfaGraceRemainingDays === 1 ? "dne" : "dnů"}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-amber-900/80">
                      Účet zatím běží v přechodné lhůtě
                      {accountSetupMfaGraceDeadlineLabel
                        ? ` do ${accountSetupMfaGraceDeadlineLabel}`
                        : ""}
                      . Potom bude zapnutí 2FA povinné.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        const securityStepIndex = ACCOUNT_SETUP_STEPS.findIndex(
                          (step) => step.id === "security"
                        );
                        setAccountSetupError(null);
                        setAccountSetupStep(securityStepIndex);
                        setAccountSetupWizardManuallyOpened(true);
                        setShowAccountSetupWizard(true);
                      }}
                      className="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-900/15 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-black"
                    >
                      Nastavit 2FA
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {subscriptionAccessState === "grace" &&
            !showPaywall &&
            !loadingProfile &&
            subscriptionEvaluation ? (
              <div className="fixed bottom-5 right-5 z-40 max-w-md rounded-2xl border border-amber-300 bg-amber-50/95 px-4 py-3 text-sm text-amber-900 shadow-[0_16px_34px_rgba(15,23,42,0.2)] backdrop-blur">
                <p className="font-semibold">Předplatné vypršelo, uhraď prosím platbu.</p>
                <p className="mt-1 text-xs text-amber-800">
                  Přístup běží v ochranné lhůtě do{" "}
                  <span className="font-semibold">
                    {formatIsoDayCz(subscriptionEvaluation.graceUntil)}
                  </span>
                  . Poslední zaplacené období skončilo{" "}
                  <span className="font-semibold">
                    {formatIsoDayCz(subscriptionEvaluation.paidUntil)}
                  </span>
                  .
                </p>
              </div>
            ) : null}
            {loadingProfile && user ? (
              <div className="flex w-full min-h-[70vh] items-center justify-center">
                <div
                  className="h-14 w-14 animate-spin rounded-full border-[4px] border-current border-t-transparent text-slate-700"
                  role="status"
                  aria-label="Načítám profil a předplatné"
                />
              </div>
            ) : showPaywall ? (
              <div className="w-full max-w-md rounded-3xl border border-white/15 bg-slate-950/90 backdrop-blur-2xl px-6 py-6 sm:px-8 sm:py-8 shadow-[0_24px_80px_rgba(0,0,0,0.9)] space-y-5 text-center">
                <h1 className="text-xl sm:text-2xl font-semibold">
                  {subscriptionBlockReason === "unpaid"
                    ? "Účet je nezaplacený"
                    : "Předplatné vypršelo"}
                </h1>
                <p className="text-sm text-slate-200">
                  {subscriptionBlockReason === "unpaid"
                    ? "Účet je označený jako nezaplacený. Po úhradě platby klikni na načtení profilu."
                    : `Ochranná 3denní lhůta už skončila${
                        subscriptionEvaluation?.graceUntil
                          ? ` (${formatIsoDayCz(subscriptionEvaluation.graceUntil)})`
                          : ""
                      }. Pro další používání je potřeba aktivní předplatné.`}
                </p>

                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={handleReloadSubscription}
                  className="ui-btn-secondary ui-focus w-full rounded-2xl border-white/30 bg-white/10 px-4 py-2.5 text-sm text-slate-50 hover:bg-white/15"
                >
                  Mám zaplaceno, načíst znovu
                </button>

                  <button
                    type="button"
                    onClick={handleLogout}
                    className="ui-btn-secondary ui-focus w-full rounded-2xl bg-white px-4 py-2.5 text-sm text-slate-900 hover:bg-slate-100"
                  >
                    Zpět na přihlášení
                  </button>
                </div>

                <div className="pt-3 border-t border-white/10 text-xs text-slate-300 space-y-1">
                  <p>Něco nehraje? Kontaktuj podporu:</p>
                  <p>
                    E-mail:{" "}
                    <a
                      href="mailto:jakub.rauscher@bohemika.eu"
                      className="underline underline-offset-2"
                    >
                      jakub.rauscher@bohemika.eu
                    </a>
                  </p>
                  <p>
                    Telefon:{" "}
                    <a
                      href="tel:+420602127638"
                      className="underline underline-offset-2"
                    >
                      602 127 638
                    </a>
                  </p>
                </div>
              </div>
            ) : timelineSetupGateActive ? (
              <div className="flex w-full min-h-[70vh] items-center justify-center">
                <div className="text-sm font-medium text-slate-700">
                  Dokonči nastavení účtu pro pokračování.
                </div>
              </div>
            ) : tipsterRestrictedRoute ? (
              <div className="flex w-full min-h-[70vh] items-center justify-center">
                <div className="text-sm font-medium text-slate-700">
                  Přesměrovávám na domovskou stránku…
                </div>
              </div>
            ) : (
              <>
                {showToolsBackToIndex ? (
                  <div
                    className={[
                      "pointer-events-none absolute top-1 z-10 sm:top-2",
                      toolsBackButtonRightAligned
                        ? "right-3 sm:right-4 lg:right-8"
                        : "left-3 sm:left-4 lg:left-8",
                    ].join(" ")}
                  >
                    <Link
                      href="/pomucky"
                      className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
                    >
                      <ArrowLeft size={15} strokeWidth={2} aria-hidden="true" />
                      <span>Zpět na pomůcky</span>
                    </Link>
                  </div>
                ) : null}
                {children}
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
