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
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

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

export function AppLayout({ children, active }: AppLayoutProps) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [backgroundColor, setBackgroundColor] = useState<"black" | "blue">("black");
  const pathname = usePathname();
  const router = useRouter();
  const lastActiveUpdateRef = useRef(0);

  // status zatím nepoužíváme v UI
  const [subscriptionStatus, setSubscriptionStatus] =
    useState<SubscriptionStatusWeb>("none");
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [authReady, setAuthReady] = useState(false);
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

  // Animated background nastavení z localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    let mounted = true;
    const updateFromStorage = () => {
      const storedColor = window.localStorage.getItem(
        "settings.backgroundColor"
      );
      if (!mounted) return;
      const parsed = storedColor === "blue" ? "blue" : "black";
      setBackgroundColor(parsed);
    };

    updateFromStorage();
    const handler = () => updateFromStorage();
    const customHandler = (ev: Event) => {
      const detail = (ev as CustomEvent<{ backgroundColor?: string }>).detail;
      if (detail && typeof detail.backgroundColor === "string") {
        const bg = detail.backgroundColor === "blue" ? "blue" : "black";
        setBackgroundColor(bg);
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

  // Přepínání třídy na body kvůli čistě černému / modrému pozadí
  useEffect(() => {
    if (typeof document === "undefined") return;
    const body = document.body;

    // vyčisti staré třídy
    body.classList.remove(
      "simple-bg",
      "simple-bg-black",
      "simple-bg-white",
      "simple-bg-blue"
    );

    body.classList.add("simple-bg");
    body.classList.add(
      backgroundColor === "blue" ? "simple-bg-blue" : "simple-bg-black"
    );
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
      setLoadingProfile(false);
      return;
    }

    const { getFirestore, doc, getDoc } = await loadFirestore();
    const db = getFirestore(firebaseApp);
    const email = emailRaw.trim().toLowerCase();

    setLoadingProfile(true);
    try {
      let snap = await getDoc(doc(db, "users", email));

      // fallback: pokud existuje dokument s původním e-mailem (např. s velkými písmeny), zkus ho
      if (!snap.exists() && emailRaw && emailRaw !== email) {
        snap = await getDoc(doc(db, "users", emailRaw));
      }

      if (!snap.exists()) {
        setSubscriptionStatus("none");
        return;
      }

      const data = snap.data() as any;
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
    } catch (e) {
      console.error("Chyba při načítání subscription profilu:", e);
      setSubscriptionStatus("none");
    } finally {
      setLoadingProfile(false);
    }
  };

  // Načtení subscription, když se změní user
  useEffect(() => {
    if (!user) return;
    void loadSubscriptionProfileForUser(user);
  }, [user]);

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
    "flex items-center justify-between rounded-2xl px-4 py-2.5 transition";
  const navLabelBase = "flex items-center gap-3";

  const navItems: {
    key: ActivePage;
    href: string;
    label: string;
    requiresTeam?: boolean;
  }[] = [
    { key: "home", href: "/", label: "Domů" },
    { key: "team", href: "/muj-tym", label: "Můj tým", requiresTeam: true },
    { key: "calc", href: "/kalkulacka", label: "Kalkulačka" },
    { key: "contracts", href: "/smlouvy", label: "Smlouvy" },
    { key: "cashflow", href: "/cashflow", label: "Provizní kalendář" },
    { key: "tools", href: "/pomucky", label: "Pomůcky" },
    { key: "settings", href: "/nastaveni", label: "Nastavení" },
  ];

  const renderBadge = (isActive: boolean) =>
    isActive && (
      <span className="text-[11px] rounded-full bg-emerald-500/20 px-3 py-0.5 text-emerald-300">
        Aktivní
      </span>
    );

  const icon = (
    <Image
      src="/icons/produkt.png"
      alt=""
      width={22}
      height={22}
      className="shrink-0"
    />
  );

  const showPaywall =
    !!user &&
    subscriptionStatus === "expired" &&
    !loadingProfile;

  // Pokud auth není připravené, nerenderuj obsah (zamezení blikání nechráněného UI)
  if (!authReady) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-black text-slate-100">
        <div className="text-sm text-slate-200">Načítám přihlášení…</div>
      </main>
    );
  }

  // user je null a redirect se provede v efektu výše
  if (authReady && !user) {
    return null;
  }

  return (
    <main className="relative min-h-screen overflow-hidden text-slate-50">
      <div
        className="fixed inset-0 -z-10 transition-colors duration-200"
        style={{
          backgroundColor:
            backgroundColor === "blue"
              ? "#0a1b3a"
              : "#000",
        }}
      />

      <div className="relative flex min-h-screen">
        {/* SIDEBAR */}
        <aside className="hidden w-60 flex-col border-r border-white/10 bg-slate-950/70 backdrop-blur-2xl lg:flex">
          <div className="px-5 py-5 border-b border-white/10">
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

          <nav className="flex-1 px-4 py-5 space-y-1 text-base">
            {navItems.map((item) => {
              if (item.requiresTeam && !hasTeam) return null;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  prefetch={item.key === "team" ? false : true}
                  className={`${navItemBase} ${
                    active === item.key
                      ? "bg-white/10 text-slate-50"
                      : "text-slate-200 hover:bg-white/5"
                  }`}
                >
                  <span className={navLabelBase}>
                    {icon}
                    <span>{item.label}</span>
                  </span>
                  {renderBadge(active === item.key)}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto border-t border-white/10 px-5 py-3.5 text-sm">
            {user && (
              <div className="mb-2 text-[11px] text-slate-400">
                Přihlášen jako{" "}
                <span className="block truncate text-slate-200">
                  {user.email ?? ""}
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="w-full rounded-xl bg-white text-xs font-medium text-slate-900 py-2 hover:bg-slate-100"
            >
              Odhlásit se
            </button>
          </div>
        </aside>

        <div className="flex-1 flex flex-col">
          {/* MOBILE TOP BAR */}
          <header className="sticky top-0 z-20 flex items-center justify-between border-b border-white/10 bg-slate-950/80 px-4 py-3 backdrop-blur lg:hidden">
            <div className="flex items-center gap-2">
              <Image
                src="/icons/bohemika_logo.png"
                alt="Bohemika logo"
                width={110}
                height={40}
                className="h-10 w-auto"
                priority
              />
              <span className="text-sm font-semibold text-slate-100">Bohemka.App</span>
            </div>
            <div className="flex items-center gap-2">
              {user && (
                <span className="max-w-[150px] truncate text-xs text-slate-300">
                  {user.email}
                </span>
              )}
              <button
                type="button"
                onClick={() => setMobileMenuOpen((prev) => !prev)}
                className="flex items-center gap-2 rounded-xl border border-white/20 px-3 py-2 text-xs font-semibold text-slate-100 bg-white/5 hover:bg-white/10"
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
              <div className="relative h-full w-80 max-w-[88%] border-r border-white/10 bg-slate-950/95 px-4 py-5 shadow-2xl overflow-y-auto">
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
                    className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-100 hover:bg-white/10"
                  >
                    Zavřít
                  </button>
                </div>

                <nav className="space-y-1">
                  {navItems.map((item) => {
                    if (item.requiresTeam && !hasTeam) return null;
                    return (
                      <Link
                        key={item.key}
                        href={item.href}
                        prefetch={item.key === "team" ? false : true}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`${navItemBase} ${
                          active === item.key
                            ? "bg-white/10 text-slate-50"
                            : "text-slate-200 hover:bg-white/5"
                        }`}
                      >
                        <span className={navLabelBase}>
                          {icon}
                          <span>{item.label}</span>
                        </span>
                        {renderBadge(active === item.key)}
                      </Link>
                    );
                  })}
                </nav>

                <div className="mt-6 border-t border-white/10 pt-4">
                  {user && (
                    <div className="mb-3 text-[11px] text-slate-400">
                      Přihlášen jako{" "}
                      <span className="block truncate text-slate-200">
                        {user.email ?? ""}
                      </span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full rounded-xl bg-white text-xs font-medium text-slate-900 py-2 hover:bg-slate-100"
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
              className="fixed bottom-4 right-4 z-20 flex items-center gap-2 rounded-full bg-emerald-500 text-slate-900 px-4 py-2 shadow-lg shadow-emerald-500/40 hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-300 lg:hidden"
            >
              <span className="text-lg leading-none">☰</span>
              <span className="text-sm font-semibold">Menu</span>
            </button>
          )}

          {/* CONTENT / PAYWALL */}
          <div className="flex-1 flex items-start justify-center px-3 py-6 sm:px-4 sm:py-8 lg:px-8">
            {loadingProfile && user ? (
              <div className="text-sm text-slate-200">
                Načítám profil a předplatné…
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
                    className="w-full rounded-2xl bg-white/10 border border-white/30 px-4 py-2.5 text-sm font-medium text-slate-50 hover:bg-white/15"
                  >
                    Mám zaplaceno, načíst znovu
                  </button>

                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full rounded-2xl bg-white text-slate-900 px-4 py-2.5 text-sm font-medium hover:bg-slate-100"
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
