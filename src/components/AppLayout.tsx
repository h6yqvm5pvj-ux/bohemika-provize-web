// src/components/AppLayout.tsx
"use client";

import Link from "next/link";
import Image from "next/image";
import Plasma from "@/components/Plasma";
import { auth, db } from "../app/firebase";
import {
  onAuthStateChanged,
  signOut,
  type User as FirebaseUser,
} from "firebase/auth";
import {
  doc,
  getDoc,
  Timestamp,
} from "firebase/firestore";
import { useEffect, useState, type ReactNode } from "react";

type ActivePage =
  | "home"
  | "calc"
  | "contracts"
  | "calendar"
  | "cashflow"
  | "info"
  | "tools"
  | "settings";

interface AppLayoutProps {
  children: ReactNode;
  active: ActivePage;
}

type SubscriptionStatusWeb = "none" | "active" | "expired";

export function AppLayout({ children, active }: AppLayoutProps) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [animatedBg, setAnimatedBg] = useState(true);

  // status zatím nepoužíváme v UI
  const [, setSubscriptionStatus] =
    useState<SubscriptionStatusWeb>("none");
  const [hasActiveSubscription, setHasActiveSubscription] =
    useState<boolean | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) {
        setHasActiveSubscription(null);
        setSubscriptionStatus("none");
        setLoadingProfile(false);
      }
    });
    return () => unsub();
  }, []);

  // Animated background nastavení z localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(
      "settings.animatedBackground"
    );
    if (stored === "0") {
      setAnimatedBg(false);
    } else if (stored === "1") {
      setAnimatedBg(true);
    } else {
      setAnimatedBg(true);
    }
  }, []);

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
      setHasActiveSubscription(null);
      setSubscriptionStatus("none");
      setLoadingProfile(false);
      return;
    }

    const email = emailRaw.trim().toLowerCase();

    setLoadingProfile(true);
    try {
      const ref = doc(db, "users", email);
      const snap = await getDoc(ref);

      if (!snap.exists()) {
        setSubscriptionStatus("none");
        setHasActiveSubscription(false);
        return;
      }

      const data = snap.data() as any;
      const statusRaw = data.subscriptionStatus as string | undefined;
      const paidUntilTS = data.paidUntil as Timestamp | undefined;

      let status: SubscriptionStatusWeb = "none";
      let hasActive = false;

      if (statusRaw === "active") {
        status = "active";

        if (paidUntilTS) {
          const paidUntil = paidUntilTS.toDate();
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          if (paidUntil >= today) {
            hasActive = true;
          } else {
            status = "expired";
            hasActive = false;
          }
        } else {
          // bez paidUntil = neomezený přístup (stejně jako v appce)
          hasActive = true;
        }
      } else if (statusRaw === "expired") {
        status = "expired";
        hasActive = false;
      } else {
        status = "none";
        hasActive = false;
      }

      setSubscriptionStatus(status);
      setHasActiveSubscription(hasActive);
    } catch (e) {
      console.error("Chyba při načítání subscription profilu:", e);
      setSubscriptionStatus("none");
      setHasActiveSubscription(false);
    } finally {
      setLoadingProfile(false);
    }
  };

  // Načtení subscription, když se změní user
  useEffect(() => {
    if (!user) return;
    void loadSubscriptionProfileForUser(user);
  }, [user]);

  // Ruční reload z paywallu
  const handleReloadSubscription = async () => {
    await loadSubscriptionProfileForUser(user);
  };

  const navItemBase =
    "flex items-center justify-between rounded-2xl px-4 py-2.5 transition";
  const navLabelBase = "flex items-center gap-3";

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
    hasActiveSubscription === false &&
    !loadingProfile;

  return (
    <main className="relative min-h-screen overflow-hidden text-slate-50">
      {/* PLASMA BACKGROUND */}
      <div className="fixed inset-0 -z-10 bg-black">
        <Plasma
          color="#6366f1"
          speed={0.6}
          direction="forward"
          scale={1.2}
          opacity={0.98}
          mouseInteractive={animatedBg}
          animated={animatedBg}
        />
      </div>

      <div className="relative flex min-h-screen">
        {/* SIDEBAR */}
        <aside className="flex w-72 flex-col border-r border-white/10 bg-slate-950/70 backdrop-blur-2xl">
          <div className="px-6 py-5 border-b border-white/10">
            <div className="flex items-center gap-3">
              <Image
                src="/icons/bohemika_logo.png"
                alt="Bohemika logo"
                width={180}
                height={48}
                className="h-10 w-auto"
                priority
              />
              <div>
                <div className="text-sm font-semibold tracking-tight">
                  Bohemka.App
                </div>
                <div className="text-[11px] text-slate-400">
                </div>
              </div>
            </div>
          </div>

          <nav className="flex-1 px-4 py-5 space-y-1 text-base">
            {/* Domů */}
            <Link
              href="/"
              className={`${navItemBase} ${
                active === "home"
                  ? "bg-white/10 text-slate-50"
                  : "text-slate-200 hover:bg-white/5"
              }`}
            >
              <span className={navLabelBase}>
                {icon}
                <span>Domů</span>
              </span>
              {renderBadge(active === "home")}
            </Link>

            {/* Kalkulačka */}
            <Link
              href="/kalkulacka"
              className={`${navItemBase} ${
                active === "calc"
                  ? "bg-white/10 text-slate-50"
                  : "text-slate-200 hover:bg-white/5"
              }`}
            >
              <span className={navLabelBase}>
                {icon}
                <span>Kalkulačka</span>
              </span>
              {renderBadge(active === "calc")}
            </Link>

            {/* Smlouvy */}
            <Link
              href="/smlouvy"
              className={`${navItemBase} ${
                active === "contracts"
                  ? "bg-white/10 text-slate-50"
                  : "text-slate-200 hover:bg-white/5"
              }`}
            >
              <span className={navLabelBase}>
                {icon}
                <span>Smlouvy</span>
              </span>
              {renderBadge(active === "contracts")}
            </Link>

            {/* Provizní kalendář */}
            {/* Kalendář */}
            <Link
              href="/kalendar"
              className={`${navItemBase} ${
                active === "calendar"
                  ? "bg-white/10 text-slate-50"
                  : "text-slate-200 hover:bg-white/5"
              }`}
            >
              <span className={navLabelBase}>
                {icon}
                <span>Kalendář</span>
              </span>
              {renderBadge(active === "calendar")}
            </Link>

            {/* Provizní kalendář */}
            <Link
              href="/cashflow"
              className={`${navItemBase} ${
                active === "cashflow"
                  ? "bg-white/10 text-slate-50"
                  : "text-slate-200 hover:bg-white/5"
              }`}
            >
              <span className={navLabelBase}>
                {icon}
                <span>Provizní kalendář</span>
              </span>
              {renderBadge(active === "cashflow")}
            </Link>

            {/* Pomůcky */}
            <Link
              href="/pomucky"
              className={`${navItemBase} ${
                active === "tools"
                  ? "bg-white/10 text-slate-50"
                  : "text-slate-200 hover:bg-white/5"
              }`}
            >
              <span className={navLabelBase}>
                {icon}
                <span>Pomůcky</span>
              </span>
              {renderBadge(active === "tools")}
            </Link>

            {/* Info */}
            <Link
              href="/info"
              className={`${navItemBase} ${
                active === "info"
                  ? "bg-white/10 text-slate-50"
                  : "text-slate-200 hover:bg-white/5"
              }`}
            >
              <span className={navLabelBase}>
                {icon}
                <span>Info</span>
              </span>
              {renderBadge(active === "info")}
            </Link>

            {/* Nastavení */}
            <Link
              href="/nastaveni"
              className={`${navItemBase} ${
                active === "settings"
                  ? "bg-white/10 text-slate-50"
                  : "text-slate-200 hover:bg-white/5"
              }`}
            >
              <span className={navLabelBase}>
                {icon}
                <span>Nastavení</span>
              </span>
              {renderBadge(active === "settings")}
            </Link>
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

        {/* CONTENT / PAYWALL */}
        <div className="flex-1 flex items-center justify-center px-4 py-10">
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
    </main>
  );
}
