// src/components/AppLayout.tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { auth } from "../app/firebase-auth";
import {
  onAuthStateChanged,
  signOut,
  type User as FirebaseUser,
} from "firebase/auth";
import { ArrowLeft, ChevronRight, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useState, type ReactNode } from "react";
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
import { AccountSetupWizard } from "@/components/account-setup/AccountSetupWizard";
import { useAccountSetupFlow } from "@/components/account-setup/useAccountSetupFlow";
import { AppNavigation, type ActivePage } from "@/components/navigation/AppNavigation";
import { useUserProfileAccess } from "@/components/profile/useUserProfileAccess";
import { SubscriptionGate } from "@/components/subscription/SubscriptionGate";

interface AppLayoutProps {
  children: ReactNode;
  active: ActivePage;
}

const AUTO_LOGOUT_AFTER_MS = 120 * 60 * 1000;
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
      clients: "Klienti",
      contracts: "Smlouvy",
      cashflow: "Provizní kalendář",
      statements: "Provizní výpisy",
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

const AUTH_READY_TIMEOUT_MS = 12_000;

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
  const isTipsRoute = pathname === "/tipy" || pathname.startsWith("/tipy/");
  const isCashflowRoute = pathname === "/cashflow";
  const isAdminOnlyRoute = pathname === "/provizni-vypisy";
  const isTipsterAllowedRoute = pathname === "/" || isTipsRoute || isCashflowRoute;
  const showToolsBackToIndex = active === "tools" && pathname !== "/pomucky";
  const toolsBackButtonRightAligned = pathname === "/pomucky/invalidita";
  const contentOverflowClass =
    active === "tools" || active === "cashflow" ? "overflow-visible" : "overflow-x-clip";
  const isFullBleedPage =
    pathname?.startsWith("/pomucky/zlato") ||
    pathname === "/" ||
    isTipsRoute ||
    pathname === "/kalkulacka" ||
    pathname === "/nastaveni" ||
    pathname === "/smlouvy";

  const [authReady, setAuthReady] = useState(false);
  const [authInitTimedOut, setAuthInitTimedOut] = useState(false);
  const [language, setLanguage] = useState<AppLanguage>(DEFAULT_APP_LANGUAGE);
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null);
  const [adminRoleResolved, setAdminRoleResolved] = useState(false);
  const applyResolvedLanguage = useCallback((nextLanguage: AppLanguage) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(APP_LANGUAGE_LOCAL_STORAGE_KEY, nextLanguage);
    }
    if (typeof document !== "undefined") {
      document.documentElement.lang =
        getAppLanguageMeta(nextLanguage)?.htmlLang ?? nextLanguage;
    }
    setLanguage(nextLanguage);
  }, []);
  const profileAccess = useUserProfileAccess({
    user,
    onLanguageResolved: applyResolvedLanguage,
  });
  const {
    accountSetupProfileSync,
    accountType,
    hasTeam,
    hasTipsters,
    isTipsterAccount,
    loadingProfile,
    markInternalProfileReady,
    profileLoadFailureVersion,
    reloadProfile,
    showPaywall,
    subscriptionAccessState,
    subscriptionBlockReason,
    subscriptionEvaluation,
  } = profileAccess;
  const accountSetup = useAccountSetupFlow({
    user,
    loadingProfile,
    accountType,
    subscriptionAccessState,
    formatIsoDayLabel: formatIsoDayCz,
    onInternalProfileReady: markInternalProfileReady,
  });
  const {
    resetAfterProfileLoadFailure: resetAccountSetupAfterProfileLoadFailure,
    syncFromProfileData: syncAccountSetupFromProfileData,
  } = accountSetup;

  useEffect(() => {
    if (!accountSetupProfileSync) return;
    syncAccountSetupFromProfileData(accountSetupProfileSync.data, {
      accountType: accountSetupProfileSync.accountType,
      hasInternalProfile: accountSetupProfileSync.hasInternalProfile,
    });
  }, [accountSetupProfileSync, syncAccountSetupFromProfileData]);

  useEffect(() => {
    if (profileLoadFailureVersion === 0) return;
    resetAccountSetupAfterProfileLoadFailure();
  }, [profileLoadFailureVersion, resetAccountSetupAfterProfileLoadFailure]);

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
        setAuthReady(true);
        return;
      }

      console.warn("Auth ready timeout in AppLayout; waiting without guest redirect.");
      setAuthInitTimedOut(true);
    }, AUTH_READY_TIMEOUT_MS);

    const unsub = onAuthStateChanged(auth, (u) => {
      resolved = true;
      window.clearTimeout(readyFallbackTimer);
      setAuthInitTimedOut(false);
      setUser(u);
      if (!u) {
        setAdminRole(null);
        setAdminRoleResolved(false);
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
      setAdminRoleResolved(false);
      return;
    }

    setAdminRoleResolved(false);

    const loadAdminRole = async () => {
      try {
        const token = await user.getIdTokenResult();
        if (cancelled) return;
        setAdminRole(
          resolveAdminRoleFromClaims(
            user.email,
            token.claims as Record<string, unknown>
          )
        );
      } catch {
        if (!cancelled) {
          setAdminRole(resolveAdminRoleFromClaims(user.email, null));
        }
      } finally {
        if (!cancelled) {
          setAdminRoleResolved(true);
        }
      }
    };

    void loadAdminRole();

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
      applyResolvedLanguage(next);
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
  }, [applyResolvedLanguage]);

  // zavřít mobilní menu po změně stránky
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setMobileMenuOpen(false);
    }, 0);
    return () => window.clearTimeout(timeoutId);
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

  useEffect(() => {
    if (!user || loadingProfile || accountType !== "tipster") return;
    if (!isTipsterAllowedRoute) {
      router.replace("/");
    }
  }, [accountType, isTipsterAllowedRoute, loadingProfile, router, user]);

  const layoutCopy = APP_LAYOUT_COPY[language];
  const tipsterRestrictedRoute = isTipsterAccount && !isTipsterAllowedRoute;
  const showAccountSetupMfaGraceBanner =
    accountSetup.showMfaGraceBanner && !showPaywall;
  const timelineSetupGateActive = accountSetup.timelineSetupGateActive;
  const isAdminRequestsUser = adminRoleAtLeast(adminRole, "admin");
  const adminOnlyRoutePending = isAdminOnlyRoute && !adminRoleResolved;
  const adminOnlyRouteDenied =
    isAdminOnlyRoute && adminRoleResolved && !isAdminRequestsUser;
  const shellFontClass = "font-mono";
  const subscriptionGraceUntilLabel = subscriptionEvaluation?.graceUntil
    ? formatIsoDayCz(subscriptionEvaluation.graceUntil)
    : "";
  const subscriptionPaidUntilLabel = subscriptionEvaluation?.paidUntil
    ? formatIsoDayCz(subscriptionEvaluation.paidUntil)
    : "";

  useEffect(() => {
    if (!user || !adminOnlyRouteDenied) return;
    router.replace("/");
  }, [adminOnlyRouteDenied, router, user]);

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
        {accountSetup.showWizard && !showPaywall ? (
          <AccountSetupWizard
            ariaLabel={layoutCopy.accountSettings}
            logoutLabel={layoutCopy.logout}
            steps={accountSetup.steps}
            stepIndex={accountSetup.stepIndex}
            completed={accountSetup.completed}
            currentStep={accountSetup.currentStep}
            phone={accountSetup.phone}
            phoneMaxLength={accountSetup.phoneMaxLength}
            phoneSaving={accountSetup.phoneSaving}
            ico={accountSetup.ico}
            icoMaxLength={accountSetup.icoMaxLength}
            timelineDraft={accountSetup.timelineDraft}
            timelineSaving={accountSetup.timelineSaving}
            positions={accountSetup.positions}
            mfaGraceActive={accountSetup.mfaGraceActive}
            mfaGraceExpired={accountSetup.mfaGraceExpired}
            mfaGraceRemainingDays={accountSetup.mfaGraceRemainingDays}
            mfaGraceDeadlineLabel={accountSetup.mfaGraceDeadlineLabel}
            mfaEnabled={accountSetup.mfaEnabled}
            mfaPassword={accountSetup.mfaPassword}
            mfaSecretKey={accountSetup.mfaSecretKey}
            mfaQrLoading={accountSetup.mfaQrLoading}
            mfaQrDataUrl={accountSetup.mfaQrDataUrl}
            mfaQrError={accountSetup.mfaQrError}
            mfaCode={accountSetup.mfaCode}
            mfaSaving={accountSetup.mfaSaving}
            completionSaving={accountSetup.completionSaving}
            info={accountSetup.info}
            error={accountSetup.error}
            busy={accountSetup.busy}
            hasInvalidRangeOrder={accountSetup.hasInvalidRangeOrder}
            onLogout={handleLogout}
            onPhoneChange={accountSetup.onPhoneChange}
            onIcoChange={accountSetup.onIcoChange}
            onTimelineRowChange={accountSetup.onTimelineRowChange}
            onRemoveTimelineRow={accountSetup.onRemoveTimelineRow}
            onAddTimelineRow={accountSetup.onAddTimelineRow}
            onMfaPasswordChange={accountSetup.onMfaPasswordChange}
            onMfaCodeChange={accountSetup.onMfaCodeChange}
            onDismissGrace={accountSetup.onDismissGrace}
            onBack={accountSetup.onBack}
            onPrimaryAction={accountSetup.onPrimaryAction}
          />
        ) : null}

        <AppNavigation
          active={active}
          navLabels={layoutCopy.nav}
          logoutLabel={layoutCopy.logout}
          hasUser={Boolean(user)}
          userEmail={user?.email ?? ""}
          hasTeam={hasTeam}
          hasTipsters={hasTipsters}
          isAdminRequestsUser={isAdminRequestsUser}
          isTipsterAccount={isTipsterAccount}
          isProfilePending={Boolean(user && loadingProfile)}
          timelineSetupGateActive={timelineSetupGateActive}
          mobileMenuOpen={mobileMenuOpen}
          shellFontClass={shellFontClass}
          onToggleMobileMenu={() => setMobileMenuOpen((prev) => !prev)}
          onCloseMobileMenu={() => setMobileMenuOpen(false)}
          onLogout={handleLogout}
        >

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
                    <p className="font-semibold">Zapni 2FA do {accountSetup.mfaGraceRemainingDays}{" "}
                      {accountSetup.mfaGraceRemainingDays === 1 ? "dne" : "dnů"}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-amber-900/80">
                      Účet zatím běží v přechodné lhůtě
                      {accountSetup.mfaGraceDeadlineLabel
                        ? ` do ${accountSetup.mfaGraceDeadlineLabel}`
                        : ""}
                      . Potom bude zapnutí 2FA povinné.
                    </p>
                    <button
                      type="button"
                      onClick={accountSetup.openSecuritySetup}
                      className="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-900/15 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-black"
                    >
                      Nastavit 2FA
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            <SubscriptionGate
              subscriptionAccessState={subscriptionAccessState}
              showPaywall={showPaywall}
              loadingProfile={loadingProfile}
              hasUser={Boolean(user)}
              blockReason={subscriptionBlockReason}
              graceUntilLabel={subscriptionGraceUntilLabel}
              paidUntilLabel={subscriptionPaidUntilLabel}
              onReloadSubscription={() => {
                void reloadProfile();
              }}
              onLogout={handleLogout}
            >
              {adminOnlyRoutePending ? (
                <div className="flex w-full min-h-[70vh] items-center justify-center">
                  <div className="text-sm font-medium text-slate-700">
                    Ověřuji oprávnění…
                  </div>
                </div>
              ) : adminOnlyRouteDenied ? (
                <div className="flex w-full min-h-[70vh] items-center justify-center">
                  <div className="text-sm font-medium text-slate-700">
                    Přesměrovávám na domovskou stránku…
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
            </SubscriptionGate>
          </div>
        </AppNavigation>
      </div>
    </main>
  );
}
