// src/components/AppLayout.tsx
"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { auth } from "../app/firebase-auth";
import {
  onAuthStateChanged,
  signOut,
  type User as FirebaseUser,
} from "firebase/auth";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  BriefcaseBusiness,
  Calculator,
  CalendarDays,
  FileText,
  Home,
  Settings,
  ShieldCheck,
  UsersRound,
  Wrench,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  FONT_THEME_EVENT,
  FONT_THEME_LOCAL_STORAGE_KEY,
  applyFontThemeToRoot,
} from "@/lib/fontTheme";
import { isAdminPanelEmail } from "@/lib/adminAccess";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import * as userProfileCache from "@/app/lib/userProfileCache";
import type { UserProfileResponse } from "@/app/lib/userProfileCache";
import {
  evaluateSubscriptionFromProfile,
  type EvaluatedSubscriptionAccess,
} from "@/lib/subscriptionAccess";

type ActivePage =
  | "home"
  | "intranet"
  | "calc"
  | "contracts"
  | "cashflow"
  | "team"
  | "tools"
  | "settings"
  | "admin";

interface AppLayoutProps {
  children: ReactNode;
  active: ActivePage;
}

type SubscriptionAccessUiState = "none" | "active" | "grace" | "blocked";
type SubscriptionBlockReason = "none" | "unpaid" | "expired";

const hasCareerTimelineConfigured = (data: Record<string, unknown>): boolean => {
  const raw = data.positionTimeline;
  if (!Array.isArray(raw)) return false;
  return raw.some((item) => {
    if (!item || typeof item !== "object") return false;
    const row = item as Record<string, unknown>;
    const position = typeof row.position === "string" ? row.position.trim() : "";
    const validFrom = typeof row.validFrom === "string" ? row.validFrom.trim() : "";
    return position.length > 0 && validFrom.length > 0;
  });
};

const PROFILE_CACHE_MAX_AGE_MS = 60 * 1000;

const formatIsoDayCz = (value: string | null): string => {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("cs-CZ", { timeZone: "Europe/Prague" });
};

export function AppLayout({ children, active }: AppLayoutProps) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const showToolsBackToIndex = active === "tools" && pathname !== "/pomucky";
  const toolsBackButtonRightAligned = pathname === "/pomucky/invalidita";
  const contentOverflowClass =
    active === "tools" || active === "cashflow" ? "overflow-visible" : "overflow-x-clip";
  const lastActiveUpdateRef = useRef(0);
  const isFullBleedPage =
    pathname?.startsWith("/pomucky/zlato") ||
    pathname === "/" ||
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
  const [authReady, setAuthReady] = useState(false);
  const [needsCareerTimelineSetup, setNeedsCareerTimelineSetup] = useState(false);
  const [showCareerTimelinePrompt, setShowCareerTimelinePrompt] = useState(false);
  const [hasTeam, setHasTeam] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const cached = window.sessionStorage.getItem("app.hasTeam");
    if (cached === "0") return false;
    if (cached === "1") return true;
    return true; // defaultně ukážeme, ať nebliká
  });

  // Auth listener
  useEffect(() => {
    let resolved = false;
    const readyFallbackTimer = window.setTimeout(() => {
      if (resolved) return;
      console.warn("Auth ready timeout in AppLayout; falling back to guest redirect.");
      setUser(null);
      setSubscriptionAccessState("none");
      setSubscriptionBlockReason("none");
      setSubscriptionEvaluation(null);
      setLoadingProfile(false);
      setNeedsCareerTimelineSetup(false);
      setShowCareerTimelinePrompt(false);
      setHasTeam(false);
      setAuthReady(true);
    }, 5000);

    const unsub = onAuthStateChanged(auth, (u) => {
      resolved = true;
      window.clearTimeout(readyFallbackTimer);
      setUser(u);
      if (!u) {
        setSubscriptionAccessState("none");
        setSubscriptionBlockReason("none");
        setSubscriptionEvaluation(null);
        setLoadingProfile(false);
        setNeedsCareerTimelineSetup(false);
        setShowCareerTimelinePrompt(false);
        setHasTeam(false);
      } else {
        setLoadingProfile(true);
      }
      setAuthReady(true);
    });

    return () => {
      resolved = true;
      window.clearTimeout(readyFallbackTimer);
      unsub();
    };
  }, []);

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

  // Načtení subscription profilu přes API
  const applySubscriptionPayload = useCallback((
    payload: UserProfileResponse,
    currentUser: FirebaseUser
  ) => {
    const data = (payload?.profile ?? {}) as Record<string, unknown>;
    const evaluation = evaluateSubscriptionFromProfile(data);
    setSubscriptionEvaluation(evaluation);
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
    setNeedsCareerTimelineSetup(!hasCareerTimelineConfigured(data));
    const has = payload?.hasTeam === true;
    setHasTeam(has);
    if (typeof window !== "undefined" && currentUser.email) {
      const cacheKey = `app.hasTeam:${currentUser.email.toLowerCase()}`;
      window.sessionStorage.setItem(cacheKey, has ? "1" : "0");
    }
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
      setNeedsCareerTimelineSetup(false);
      setLoadingProfile(false);
      setHasTeam(false);
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
      setNeedsCareerTimelineSetup(false);
      setHasTeam(false);
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

  useEffect(() => {
    if (!user) return;
    if (loadingProfile || subscriptionAccessState === "blocked") return;
    if (!needsCareerTimelineSetup) {
      setShowCareerTimelinePrompt(false);
      return;
    }
    if (pathname === "/nastaveni") {
      setShowCareerTimelinePrompt(false);
      return;
    }
    setShowCareerTimelinePrompt(true);
  }, [user, loadingProfile, subscriptionAccessState, needsCareerTimelineSetup, pathname]);

  const handleCareerTimelineSetup = () => {
    setShowCareerTimelinePrompt(false);
    router.push("/nastaveni#timeline-kariery");
  };

  // Zapsat lastActive do Firestore při přihlášení + periodické obnovení
  useEffect(() => {
    const currentUser = user;
    const email = currentUser?.email?.toLowerCase();
    if (!currentUser || !email) return;
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
  }, [user]);

  // Ruční reload z paywallu
  const handleReloadSubscription = async () => {
    await loadSubscriptionProfileForUser(user, { force: true });
  };

  const navItemBase =
    "group relative flex items-center rounded-2xl px-3 py-2.5 transition-all duration-200";
  const navLabelBase = "flex w-full items-center gap-3";
  const navItemActiveClass =
    "bg-slate-900 text-white shadow-[0_10px_22px_rgba(15,23,42,0.24)]";
  const navItemInactiveClass =
    "text-slate-700 hover:bg-slate-100 hover:text-slate-900";
  const activeNavRailClass = "bg-emerald-400";

  const navItems: {
    key: ActivePage;
    href: string;
    label: string;
    icon: LucideIcon;
    requiresTeam?: boolean;
    requiresAdmin?: boolean;
  }[] = [
    { key: "home", href: "/", label: "Domů", icon: Home },
    {
      key: "team",
      href: "/muj-tym",
      label: "Můj tým",
      icon: UsersRound,
    },
    {
      key: "intranet",
      href: "/intranet",
      label: "Intranet",
      icon: Building2,
    },
    { key: "calc", href: "/kalkulacka", label: "Kalkulačka", icon: Calculator },
    { key: "contracts", href: "/smlouvy", label: "Smlouvy", icon: FileText },
    {
      key: "cashflow",
      href: "/cashflow",
      label: "Provizní kalendář",
      icon: CalendarDays,
    },
    { key: "tools", href: "/pomucky", label: "Pomůcky", icon: Wrench },
    {
      key: "admin",
      href: "/admin/zadosti",
      label: "Admin",
      icon: ShieldCheck,
      requiresAdmin: true,
    },
    { key: "settings", href: "/nastaveni", label: "Nastavení", icon: Settings },
  ];

  const renderNavIcon = (Icon: LucideIcon, isActive: boolean) => (
    <span
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition ${
        isActive
          ? "border-white/30 bg-white/10"
          : "border-slate-300 bg-white group-hover:border-slate-400 group-hover:bg-slate-50"
      }`}
      aria-hidden="true"
    >
      <Icon
        className={`h-[18px] w-[18px] ${isActive ? "text-white" : "text-slate-700"}`}
        strokeWidth={2}
      />
    </span>
  );

  const showPaywall =
    !!user &&
    subscriptionAccessState === "blocked" &&
    !loadingProfile;
  const timelineSetupGateActive =
    !!user &&
    !loadingProfile &&
    subscriptionAccessState !== "blocked" &&
    needsCareerTimelineSetup;
  const isAdminRequestsUser = isAdminPanelEmail(user?.email);
  const shellFontClass = "font-mono";

  // Pokud auth není připravené, nerenderuj obsah (zamezení blikání nechráněného UI)
  if (!authReady) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white text-slate-900">
        <div className="text-sm text-slate-700">Načítám přihlášení…</div>
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
        {showCareerTimelinePrompt && !showPaywall && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 px-4">
            <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.35)] sm:p-7">
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-300 bg-emerald-50 text-emerald-700">
                <BriefcaseBusiness size={22} strokeWidth={2.1} aria-hidden="true" />
              </div>
              <h2 className="text-xl font-semibold text-slate-900">
                Nutnost vyplnit historii kariéry
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">
                Pro správné předvyplnění pozice a přesné výpočty je potřeba doplnit Historii
                kariéry. Pokračuj kliknutím na tlačítko níže.
              </p>
              <button
                type="button"
                onClick={handleCareerTimelineSetup}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-700 bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                Nastavit kariéru
                <ArrowRight size={16} strokeWidth={2.2} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {/* SIDEBAR */}
        <aside
          className={`hidden w-56 flex-col border-r border-slate-200 bg-white/95 shadow-[8px_0_30px_rgba(15,23,42,0.08)] backdrop-blur-sm lg:flex ${shellFontClass}`}
        >
          <div className="border-b border-slate-200 px-5 py-5">
            <div className="flex items-center gap-3 justify-center">
              <Image
                src="/icons/bohemika_logo.png"
                alt="Bohemika logo"
                width={140}
                height={50}
                className="h-12 w-auto"
                priority
              />
              <div className="text-base font-semibold tracking-tight text-slate-900">
                Bohemka.App
              </div>
            </div>
          </div>

          <nav className="flex-1 space-y-2 px-3 py-5 text-base">
            {navItems.map((item) => {
              if (item.requiresTeam && !hasTeam) return null;
              if (item.requiresAdmin && !isAdminRequestsUser) return null;
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

          <div
            className="mt-auto border-t border-slate-200 px-4 py-4 text-sm"
          >
            <div className="ui-card ui-card-quiet rounded-2xl bg-slate-50 p-3">
              {user && (
                <div className="mb-2 text-[11px] text-slate-600">
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
                Odhlásit se
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
            <div className="fixed inset-0 z-30 lg:hidden">
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
                  {navItems.map((item) => {
                    if (item.requiresTeam && !hasTeam) return null;
                    if (item.requiresAdmin && !isAdminRequestsUser) return null;
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
                    Odhlásit se
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
