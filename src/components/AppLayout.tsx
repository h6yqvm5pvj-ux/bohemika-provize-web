// src/components/AppLayout.tsx
"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { auth } from "../app/firebase-auth";
import { firebaseApp } from "../app/firebase-app";
import {
  onAuthStateChanged,
  signOut,
  type User as FirebaseUser,
} from "firebase/auth";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BriefcaseBusiness,
  Calculator,
  CalendarDays,
  FileText,
  Home,
  Settings,
  UsersRound,
  Wrench,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  BOX_THEME_EVENT,
  BOX_THEME_LOCAL_STORAGE_KEY,
  applyBoxThemeToRoot,
} from "@/lib/boxTheme";

type ActivePage =
  | "home"
  | "calc"
  | "contracts"
  | "cashflow"
  | "team"
  | "tools"
  | "settings";

interface AppLayoutProps {
  children: ReactNode;
  active: ActivePage;
}

type SubscriptionStatusWeb = "none" | "active" | "expired";

type FirestoreExports = typeof import("firebase/firestore");
let firestorePromise: Promise<FirestoreExports> | null = null;
const loadFirestore = () => {
  if (!firestorePromise) {
    firestorePromise = import("firebase/firestore");
  }
  return firestorePromise;
};

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

export function AppLayout({ children, active }: AppLayoutProps) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [backgroundColor, setBackgroundColor] = useState<"white">("white");
  const pathname = usePathname();
  const router = useRouter();
  const lastActiveUpdateRef = useRef(0);
  const isFullBleedPage =
    pathname?.startsWith("/pomucky/zlato") ||
    pathname === "/" ||
    pathname === "/kalkulacka" ||
    pathname === "/nastaveni" ||
    pathname === "/smlouvy";

  // status zatím nepoužíváme v UI
  const [subscriptionStatus, setSubscriptionStatus] =
    useState<SubscriptionStatusWeb>("none");
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
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) {
        setSubscriptionStatus("none");
        setLoadingProfile(false);
        setNeedsCareerTimelineSetup(false);
        setShowCareerTimelinePrompt(false);
        setHasTeam(false);
      } else {
        setLoadingProfile(true);
      }
      setAuthReady(true);
    });
    return () => unsub();
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

  // Načíst a aplikovat barvu tmavých boxů (tlačítka/chipy) z localStorage
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;

    const applyFromValue = (value?: unknown) => {
      const theme = applyBoxThemeToRoot(
        value ?? window.localStorage.getItem(BOX_THEME_LOCAL_STORAGE_KEY)
      );
      window.localStorage.setItem(BOX_THEME_LOCAL_STORAGE_KEY, theme);
    };

    applyFromValue();

    const onStorage = (ev: StorageEvent) => {
      if (ev.key && ev.key !== BOX_THEME_LOCAL_STORAGE_KEY) return;
      applyFromValue(ev.newValue);
    };

    const onCustom = (ev: Event) => {
      const detail = (ev as CustomEvent<{ boxTheme?: string }>).detail;
      applyFromValue(detail?.boxTheme);
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(BOX_THEME_EVENT, onCustom as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(BOX_THEME_EVENT, onCustom as EventListener);
    };
  }, []);

  // Animated background nastavení z localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    let mounted = true;
    const updateFromStorage = () => {
      const storedColor = window.localStorage.getItem(
        "settings.backgroundColor"
      );
      if (storedColor !== "white") {
        window.localStorage.setItem("settings.backgroundColor", "white");
      }
      if (!mounted) return;
      setBackgroundColor("white");
    };

    updateFromStorage();
    const handler = () => updateFromStorage();
    const customHandler = (ev: Event) => {
      const detail = (ev as CustomEvent<{ backgroundColor?: string }>).detail;
      if (detail && typeof detail.backgroundColor === "string") {
        window.localStorage.setItem("settings.backgroundColor", "white");
        setBackgroundColor("white");
      } else {
        updateFromStorage();
      }
    };
    window.addEventListener("storage", handler);
    window.addEventListener("settings:updateBackground", customHandler as any);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener("settings:updateBackground", customHandler as any);
      mounted = false;
    };
  }, []);

  // zavřít mobilní menu po změně stránky
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Přepínání třídy na body kvůli světlému / černému kontrastu
  useEffect(() => {
    if (typeof document === "undefined") return;
    const body = document.body;

    // vyčisti staré třídy
    body.classList.remove(
      "simple-bg",
      "simple-bg-black",
      "simple-bg-white"
    );

    body.classList.add("simple-bg");
    body.classList.add("simple-bg-white");
  }, [backgroundColor]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      window.location.href = "/login";
    } catch (e) {
      console.error(e);
    }
  };

  // Načtení subscription profilu z Firestore
  const loadSubscriptionProfileForUser = async (
    currentUser: FirebaseUser | null
  ) => {
    const emailRaw = currentUser?.email;
    if (!emailRaw) {
      setSubscriptionStatus("none");
      setNeedsCareerTimelineSetup(false);
      setLoadingProfile(false);
      return;
    }

    const { getFirestore, doc, getDoc, getDocFromServer, setDoc } =
      await loadFirestore();
    const db = getFirestore(firebaseApp);
    const email = emailRaw.trim().toLowerCase();

    setLoadingProfile(true);
    try {
      const readUserDoc = async (docId: string) => {
        const userRef = doc(db, "users", docId);
        try {
          return await getDocFromServer(userRef);
        } catch {
          return await getDoc(userRef);
        }
      };

      let snap = await readUserDoc(email);
      let resolvedData = snap.exists()
        ? (snap.data() as Record<string, unknown>)
        : null;

      if (emailRaw && emailRaw !== email) {
        const rawSnap = await readUserDoc(emailRaw);
        const rawData = rawSnap.exists()
          ? (rawSnap.data() as Record<string, unknown>)
          : null;

        // fallback: pokud existuje dokument s původním e-mailem (např. s velkými písmeny), zkus ho
        if (!resolvedData && rawData) {
          snap = rawSnap;
          resolvedData = rawData;
        } else if (resolvedData && rawData) {
          const normalizedHasTimeline = hasCareerTimelineConfigured(resolvedData);
          const rawHasTimeline = hasCareerTimelineConfigured(rawData);
          if (!normalizedHasTimeline && rawHasTimeline) {
            resolvedData = {
              ...resolvedData,
              positionTimeline: rawData.positionTimeline,
            };
            try {
              await setDoc(
                doc(db, "users", email),
                { positionTimeline: rawData.positionTimeline },
                { merge: true }
              );
            } catch (e) {
              console.warn(
                "Chyba při dorovnání timeline z legacy user ID:",
                e
              );
            }
          }
        }
      }

      if (!resolvedData) {
        setSubscriptionStatus("none");
        setNeedsCareerTimelineSetup(false);
        return;
      }

      const data = resolvedData;
      const statusRaw = (data.subscriptionStatus as string | undefined)?.trim().toLowerCase();
      let status: SubscriptionStatusWeb = "none";

      if (statusRaw === "active") {
        status = "active";
      } else if (statusRaw === "expired") {
        status = "expired";
      } else {
        status = "none";
      }

      setSubscriptionStatus(status);
      setNeedsCareerTimelineSetup(!hasCareerTimelineConfigured(data as Record<string, unknown>));
    } catch (e) {
      console.error("Chyba při načítání subscription profilu:", e);
      setSubscriptionStatus("none");
      setNeedsCareerTimelineSetup(false);
    } finally {
      setLoadingProfile(false);
    }
  };

  // Načtení subscription, když se změní user
  useEffect(() => {
    if (!user) return;
    void loadSubscriptionProfileForUser(user);
  }, [user]);

  useEffect(() => {
    if (!user?.email) return;
    if (loadingProfile || subscriptionStatus === "expired") return;
    if (!needsCareerTimelineSetup) {
      setShowCareerTimelinePrompt(false);
      return;
    }
    if (pathname === "/nastaveni") {
      setShowCareerTimelinePrompt(false);
      return;
    }
    if (typeof window === "undefined") return;

    const key = `app.careerTimelinePromptDismissed:${user.email.toLowerCase()}`;
    const dismissed = window.sessionStorage.getItem(key) === "1";
    if (!dismissed) {
      setShowCareerTimelinePrompt(true);
    }
  }, [user?.email, loadingProfile, subscriptionStatus, needsCareerTimelineSetup, pathname]);

  const markCareerTimelinePromptDismissed = () => {
    if (!user?.email || typeof window === "undefined") return;
    const key = `app.careerTimelinePromptDismissed:${user.email.toLowerCase()}`;
    window.sessionStorage.setItem(key, "1");
  };

  const handleCareerTimelineSetup = () => {
    markCareerTimelinePromptDismissed();
    setShowCareerTimelinePrompt(false);
    router.push("/nastaveni#timeline-kariery");
  };

  // Zapsat lastActive do Firestore při přihlášení + periodické obnovení
  useEffect(() => {
    const email = user?.email?.toLowerCase();
    if (!email) return;
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
        const { getFirestore, doc, setDoc, serverTimestamp } = await loadFirestore();
        const db = getFirestore(firebaseApp);
        await setDoc(
          doc(db, "users", email),
          { lastActive: serverTimestamp() },
          { merge: true }
        );
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

  // Zda má tým
  useEffect(() => {
    const loadTeam = async () => {
      if (!user?.email) return;
      let cancelled = false;
      const cacheKey = `app.hasTeam:${user.email.toLowerCase()}`;

      if (typeof window !== "undefined") {
        const cached = window.sessionStorage.getItem(cacheKey);
        if (cached !== null) {
          setHasTeam(cached === "1");
        }
      }

      try {
        const { getFirestore, collection, query, where, getDocs } =
          await loadFirestore();
        if (cancelled) return;
        const db = getFirestore(firebaseApp);
        const email = user.email.toLowerCase();
        const usersCol = collection(db, "users");
        const snap = await getDocs(query(usersCol, where("managerEmail", "==", email)));
        const has = snap.size > 0;
        if (cancelled) return;
        setHasTeam(has);
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem(cacheKey, has ? "1" : "0");
        }
      } catch (e) {
        console.error("Chyba při načítání podřízených:", e);
        // ponecháme předchozí hodnotu, ať nebliká
      }

      return () => {
        cancelled = true;
      };
    };

    loadTeam();
  }, [user]);

  // Ruční reload z paywallu
  const handleReloadSubscription = async () => {
    await loadSubscriptionProfileForUser(user);
  };

  const navItemBase =
    "group relative flex items-center rounded-2xl px-3 py-2.5 transition-all duration-200";
  const navLabelBase = "flex w-full items-center gap-3";
  const navItemActiveClass =
    "bg-slate-900 text-white shadow-[0_10px_22px_rgba(15,23,42,0.24)]";
  const navItemInactiveClass =
    "text-slate-700 hover:bg-slate-100 hover:text-slate-900";

  const navItems: {
    key: ActivePage;
    href: string;
    label: string;
    icon: LucideIcon;
    requiresTeam?: boolean;
  }[] = [
    { key: "home", href: "/", label: "Domů", icon: Home },
    {
      key: "team",
      href: "/muj-tym",
      label: "Můj tým",
      icon: UsersRound,
      requiresTeam: true,
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
    subscriptionStatus === "expired" &&
    !loadingProfile;

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

  return (
    <main className="relative min-h-screen text-slate-900">
      <div
        className="fixed inset-0 -z-10 transition-colors duration-200"
        style={{
          backgroundColor: "#ffffff",
        }}
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
        <aside className="hidden w-56 flex-col border-r border-slate-200 bg-white/95 font-mono shadow-[8px_0_30px_rgba(15,23,42,0.08)] backdrop-blur-sm lg:flex">
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
              <div className="text-base font-semibold tracking-tight">
                Bohemka.App
              </div>
            </div>
          </div>

          <nav className="flex-1 space-y-2 px-3 py-5 text-base">
            {navItems.map((item) => {
              if (item.requiresTeam && !hasTeam) return null;
              const isActive = active === item.key;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  prefetch={item.key === "team" ? false : true}
                  className={`${navItemBase} ${
                    isActive
                      ? navItemActiveClass
                      : navItemInactiveClass
                  }`}
                >
                  {isActive ? (
                    <span
                      className="absolute left-1.5 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full bg-emerald-400"
                      aria-hidden="true"
                    />
                  ) : null}
                    <span className={navLabelBase}>
                    {renderNavIcon(item.icon, isActive)}
                    <span className="truncate">{item.label}</span>
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto border-t border-slate-200 px-4 py-4 text-sm">
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

        <div className="flex-1 flex flex-col">
          {/* MOBILE TOP BAR */}
          <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-900 bg-white px-4 py-3 font-mono lg:hidden">
            <div className="flex items-center gap-2">
              <Image
                src="/icons/bohemika_logo.png"
                alt="Bohemika logo"
                width={110}
                height={40}
                className="h-10 w-auto"
                priority
              />
              <span className="text-sm font-semibold text-slate-900">Bohemka.App</span>
            </div>
            <div className="flex items-center gap-2">
              {user && (
                <span className="max-w-[150px] truncate text-xs text-slate-600">
                  {user.email}
                </span>
              )}
              <button
                type="button"
                onClick={() => setMobileMenuOpen((prev) => !prev)}
                className="ui-btn-primary ui-focus flex items-center gap-2 rounded-xl px-3 py-2 text-xs"
              >
                <span className="text-base leading-none">☰</span>
                <span>Menu</span>
              </button>
            </div>
          </header>

          {/* MOBILE NAV OVERLAY */}
          {mobileMenuOpen && (
            <div className="fixed inset-0 z-30 lg:hidden">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setMobileMenuOpen(false)}
              />
              <div className="relative h-full w-80 max-w-[88%] overflow-y-auto border-r border-slate-900 bg-white px-4 py-5 font-mono shadow-2xl">
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
                    const isActive = active === item.key;
                    return (
                      <Link
                        key={item.key}
                        href={item.href}
                        prefetch={item.key === "team" ? false : true}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`${navItemBase} ${
                          isActive
                            ? navItemActiveClass
                            : navItemInactiveClass
                        }`}
                      >
                        {isActive ? (
                          <span
                            className="absolute left-1.5 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full bg-emerald-400"
                            aria-hidden="true"
                          />
                        ) : null}
                        <span className={navLabelBase}>
                          {renderNavIcon(item.icon, isActive)}
                          <span className="truncate">{item.label}</span>
                        </span>
                      </Link>
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

          {/* MOBILE QUICK MENU BUTTON */}
          {!mobileMenuOpen && (
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="ui-btn-primary ui-focus fixed bottom-4 right-4 z-20 flex items-center gap-2 rounded-full px-4 py-2 font-mono text-white shadow-lg shadow-black/35 lg:hidden"
            >
              <span className="text-lg leading-none">☰</span>
              <span className="text-sm font-semibold">Menu</span>
            </button>
          )}

          {/* CONTENT / PAYWALL */}
          <div
            className={[
              "app-content flex-1 flex items-start font-mono",
              isFullBleedPage
                ? "justify-start px-0 py-6 sm:py-8 lg:px-0"
                : "justify-center px-3 py-6 sm:px-4 sm:py-8 lg:px-8",
            ].join(" ")}
          >
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
                  Předplatné vypršelo
                </h1>
                <p className="text-sm text-slate-200">
                  Pro další používání webu je potřeba mít aktivní
                  předplatné. Pokud máš pocit, že něco nesedí,
                  zkus načíst profil znovu nebo kontaktuj podporu.
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
              children
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
