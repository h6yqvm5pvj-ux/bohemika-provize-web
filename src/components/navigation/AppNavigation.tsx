// src/components/navigation/AppNavigation.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Building2,
  Calculator,
  CalendarDays,
  FileText,
  Home,
  Lightbulb,
  ReceiptText,
  Settings,
  ShieldCheck,
  UsersRound,
  Wrench,
} from "lucide-react";

export type ActivePage =
  | "home"
  | "intranet"
  | "calc"
  | "contracts"
  | "cashflow"
  | "statements"
  | "team"
  | "tools"
  | "tips"
  | "settings"
  | "admin";

type NavigationItemConfig = {
  key: ActivePage;
  href: string;
  icon: LucideIcon;
  requiresTeam?: boolean;
  requiresTipsters?: boolean;
  requiresAdmin?: boolean;
};

type NavigationItem = NavigationItemConfig & {
  label: string;
};

interface AppNavigationProps {
  children: ReactNode;
  active: ActivePage;
  navLabels: Record<ActivePage, string>;
  logoutLabel: string;
  hasUser: boolean;
  userEmail: string;
  hasTeam: boolean;
  hasTipsters: boolean;
  isAdminRequestsUser: boolean;
  isTipsterAccount: boolean;
  isProfilePending: boolean;
  timelineSetupGateActive: boolean;
  mobileMenuOpen: boolean;
  shellFontClass: string;
  onToggleMobileMenu: () => void;
  onCloseMobileMenu: () => void;
  onLogout: () => void;
}

const NAV_ITEM_CONFIGS: NavigationItemConfig[] = [
  { key: "home", href: "/", icon: Home },
  { key: "team", href: "/muj-tym", icon: UsersRound },
  { key: "intranet", href: "/intranet", icon: Building2 },
  { key: "calc", href: "/kalkulacka", icon: Calculator },
  { key: "contracts", href: "/smlouvy", icon: FileText },
  { key: "tips", href: "/tipy", icon: Lightbulb, requiresTipsters: true },
  { key: "cashflow", href: "/cashflow", icon: CalendarDays },
  { key: "statements", href: "/provizni-vypisy", icon: ReceiptText, requiresAdmin: true },
  { key: "tools", href: "/pomucky", icon: Wrench },
  { key: "admin", href: "/admin/zadosti", icon: ShieldCheck, requiresAdmin: true },
  { key: "settings", href: "/nastaveni", icon: Settings },
];

const TIPSTER_NAV_ITEM_CONFIGS: NavigationItemConfig[] = [
  { key: "home", href: "/", icon: Home },
  { key: "tips", href: "/tipy", icon: Lightbulb },
  { key: "cashflow", href: "/cashflow", icon: CalendarDays },
];

const NAV_ITEM_BASE =
  "group relative flex items-center rounded-[18px] px-3 py-2.5 text-[15px] font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-white";
const NAV_LABEL_BASE = "flex w-full items-center gap-3";
const NAV_ITEM_ACTIVE_CLASS =
  "bg-[linear-gradient(135deg,#111827_0%,#211442_54%,#090d1c_100%)] text-white shadow-[0_14px_28px_rgba(18,12,43,0.28)] ring-1 ring-white/10";
const NAV_ITEM_INACTIVE_CLASS =
  "text-slate-600 hover:bg-white/80 hover:text-slate-950 hover:shadow-[0_10px_22px_rgba(15,23,42,0.08)]";
const ACTIVE_NAV_RAIL_CLASS =
  "bg-[linear-gradient(180deg,#a855f7_0%,#ec4899_100%)] shadow-[0_0_16px_rgba(168,85,247,0.55)]";

const buildNavigationItems = (
  configs: NavigationItemConfig[],
  navLabels: Record<ActivePage, string>
): NavigationItem[] =>
  configs.map((item) => ({
    ...item,
    label: navLabels[item.key],
  }));

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

const shouldShowNavigationItem = (
  item: NavigationItem,
  flags: {
    hasTeam: boolean;
    hasTipsters: boolean;
    isAdminRequestsUser: boolean;
  }
) => {
  if (item.requiresTeam && !flags.hasTeam) return false;
  if (item.requiresTipsters && !flags.hasTipsters) return false;
  if (item.requiresAdmin && !flags.isAdminRequestsUser) return false;
  return true;
};

function NavigationList({
  active,
  items,
  hasTeam,
  hasTipsters,
  isAdminRequestsUser,
  timelineSetupGateActive,
  activeRailHeightClass,
  onNavigate,
}: {
  active: ActivePage;
  items: NavigationItem[];
  hasTeam: boolean;
  hasTipsters: boolean;
  isAdminRequestsUser: boolean;
  timelineSetupGateActive: boolean;
  activeRailHeightClass: string;
  onNavigate?: () => void;
}) {
  return (
    <>
      {items.map((item) => {
        if (
          !shouldShowNavigationItem(item, {
            hasTeam,
            hasTipsters,
            isAdminRequestsUser,
          })
        ) {
          return null;
        }

        const isActive = active === item.key;
        const navDisabled = timelineSetupGateActive && item.key !== "settings";
        const stateClass = isActive ? NAV_ITEM_ACTIVE_CLASS : NAV_ITEM_INACTIVE_CLASS;
        const activeRail = isActive ? (
          <span
            className={`absolute left-1.5 top-1/2 w-1 -translate-y-1/2 rounded-full ${activeRailHeightClass} ${ACTIVE_NAV_RAIL_CLASS}`}
            aria-hidden="true"
          />
        ) : null;
        const content = (
          <span className={NAV_LABEL_BASE}>
            {renderNavIcon(item.icon, isActive)}
            <span className="truncate">{item.label}</span>
          </span>
        );

        if (navDisabled) {
          return (
            <div
              key={item.key}
              aria-disabled="true"
              className={`${NAV_ITEM_BASE} cursor-not-allowed opacity-50 ${stateClass}`}
            >
              {activeRail}
              {content}
            </div>
          );
        }

        return (
          <Link
            key={item.key}
            href={item.href}
            prefetch={item.key === "team" ? false : true}
            onClick={onNavigate}
            className={`${NAV_ITEM_BASE} ${stateClass}`}
          >
            {activeRail}
            {content}
          </Link>
        );
      })}
    </>
  );
}

export function AppNavigation({
  children,
  active,
  navLabels,
  logoutLabel,
  hasUser,
  userEmail,
  hasTeam,
  hasTipsters,
  isAdminRequestsUser,
  isTipsterAccount,
  isProfilePending,
  timelineSetupGateActive,
  mobileMenuOpen,
  shellFontClass,
  onToggleMobileMenu,
  onCloseMobileMenu,
  onLogout,
}: AppNavigationProps) {
  const navigationItems = isProfilePending
    ? []
    : buildNavigationItems(
        isTipsterAccount ? TIPSTER_NAV_ITEM_CONFIGS : NAV_ITEM_CONFIGS,
        navLabels
      );
  const userInitial = userEmail.trim().charAt(0).toUpperCase() || "B";

  return (
    <>
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
          <NavigationList
            active={active}
            items={navigationItems}
            hasTeam={hasTeam}
            hasTipsters={hasTipsters}
            isAdminRequestsUser={isAdminRequestsUser}
            timelineSetupGateActive={timelineSetupGateActive}
            activeRailHeightClass="h-7"
          />
        </nav>

        <div className="mt-auto px-3 pb-4 pt-3">
          <div className="overflow-hidden rounded-[24px] border border-white/75 bg-white/85 p-3 shadow-[0_16px_34px_rgba(15,23,42,0.1)]">
            {hasUser ? (
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
            ) : null}
            <button
              type="button"
              onClick={onLogout}
              className="w-full rounded-2xl bg-slate-950 px-3 py-2.5 text-xs font-bold text-white shadow-[0_12px_22px_rgba(15,23,42,0.18)] transition hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300/70 focus-visible:ring-offset-2"
            >
              {logoutLabel}
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
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
              {hasUser ? (
                <span className="block max-w-[46vw] truncate text-[10px] text-slate-500 min-[390px]:max-w-[52vw]">
                  {userEmail}
                </span>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onToggleMobileMenu}
            className="ui-btn-primary ui-focus inline-flex shrink-0 items-center gap-2 rounded-[18px] px-3 py-2 text-xs"
          >
            <span className="text-base leading-none">☰</span>
            <span className="hidden min-[390px]:inline">Menu</span>
          </button>
        </header>

        {mobileMenuOpen ? (
          <div className="fixed inset-0 z-[70] lg:hidden">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={onCloseMobileMenu}
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
                  onClick={onCloseMobileMenu}
                  className="ui-btn-primary ui-focus rounded-full px-3 py-1 text-xs"
                >
                  Zavřít
                </button>
              </div>

              <nav className="space-y-2">
                <NavigationList
                  active={active}
                  items={navigationItems}
                  hasTeam={hasTeam}
                  hasTipsters={hasTipsters}
                  isAdminRequestsUser={isAdminRequestsUser}
                  timelineSetupGateActive={timelineSetupGateActive}
                  activeRailHeightClass="h-6"
                  onNavigate={onCloseMobileMenu}
                />
              </nav>

              <div className="mt-6 border-t border-slate-900 pt-4">
                {hasUser ? (
                  <div className="mb-3 text-[11px] text-slate-600">
                    Přihlášen jako{" "}
                    <span className="block truncate text-slate-900">
                      {userEmail}
                    </span>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={onLogout}
                  className="ui-btn-primary ui-focus w-full rounded-xl py-2 text-xs"
                >
                  {logoutLabel}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {children}
      </div>
    </>
  );
}
