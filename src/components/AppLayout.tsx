// src/components/AppLayout.tsx
"use client";

import Link from "next/link";
import Image from "next/image";
import Plasma from "@/components/Plasma";
import { auth } from "../app/firebase";
import {
  onAuthStateChanged,
  signOut,
  type User as FirebaseUser,
} from "firebase/auth";
import { useEffect, useState, type ReactNode } from "react";

type ActivePage =
  | "home"
  | "calc"
  | "contracts"
  | "cashflow"
  | "info"
  | "tools"
  | "settings";

interface AppLayoutProps {
  children: ReactNode;
  active: ActivePage;
}

export function AppLayout({ children, active }: AppLayoutProps) {
  const [user, setUser] = useState<FirebaseUser | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      window.location.href = "/login";
    } catch (e) {
      console.error(e);
    }
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
          mouseInteractive={true}
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
                  Bohemika Provize
                </div>
                <div className="text-[11px] text-slate-400">
                  Webová verze výpočtu provizí
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
                  {user.email}
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

        {/* CONTENT */}
        <div className="flex-1 flex items-center justify-center px-4 py-10">
          {children}
        </div>
      </div>
    </main>
  );
}