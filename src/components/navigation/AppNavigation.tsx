// src/components/navigation/AppNavigation.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useSidebarPreference } from "./useSidebarPreference";
import styles from "./appNavigation.module.css";
import type { LucideIcon } from "lucide-react";
import {
  Building2,
  Calculator,
  CalendarDays,
  FileText,
  Home,
  IdCard,
  Lightbulb,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  ReceiptText,
  Settings,
  ShieldCheck,
  UsersRound,
  Wrench,
} from "lucide-react";
import { CLIENT_CARDS_ENABLED } from "@/app/_klienti/clientFeature";
import { COMMISSION_STATEMENTS_ENABLED } from "@/app/_provizni-vypisy/statementFeature";
import { ProfileAvatar } from "@/components/ProfileAvatar";

export type ActivePage =
  | "home"
  | "intranet"
  | "calc"
  | "clients"
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
  requiresAdminArea?: boolean;
};

type NavigationItem = NavigationItemConfig & {
  label: string;
};

interface AppNavigationProps {
  children: ReactNode;
  desktopHeaderContent?: ReactNode;
  mobileHeaderAction?: ReactNode;
  active: ActivePage;
  navLabels: Record<ActivePage, string>;
  logoutLabel: string;
  hasUser: boolean;
  userEmail: string;
  userAvatar: string;
  hasTeam: boolean;
  hasTipsters: boolean;
  isAdminRequestsUser: boolean;
  canAccessAdminArea: boolean;
  isTipsterAccount: boolean;
  isProfilePending: boolean;
  timelineSetupGateActive: boolean;
  mobileMenuOpen: boolean;
  shellFontClass: string;
  embedded?: boolean;
  onToggleMobileMenu: () => void;
  onCloseMobileMenu: () => void;
  onLogout: () => void;
}

const NAV_ITEM_CONFIGS: NavigationItemConfig[] = [
  { key: "home", href: "/", icon: Home },
  { key: "team", href: "/muj-tym", icon: UsersRound },
  { key: "intranet", href: "/intranet", icon: Building2 },
  { key: "calc", href: "/kalkulacka", icon: Calculator },
  ...(CLIENT_CARDS_ENABLED
    ? [{ key: "clients" as const, href: "/klienti", icon: IdCard }]
    : []),
  { key: "contracts", href: "/smlouvy", icon: FileText },
  { key: "tips", href: "/tipy", icon: Lightbulb, requiresTipsters: true },
  { key: "cashflow", href: "/cashflow", icon: CalendarDays },
  ...(COMMISSION_STATEMENTS_ENABLED
    ? [
        {
          key: "statements" as const,
          href: "/provizni-vypisy",
          icon: ReceiptText,
        },
      ]
    : []),
  { key: "tools", href: "/pomucky", icon: Wrench },
  { key: "admin", href: "/admin/zadosti", icon: ShieldCheck, requiresAdminArea: true },
  { key: "settings", href: "/nastaveni", icon: Settings },
];

const TIPSTER_NAV_ITEM_CONFIGS: NavigationItemConfig[] = [
  { key: "home", href: "/", icon: Home },
  { key: "tips", href: "/tipy", icon: Lightbulb },
  { key: "cashflow", href: "/cashflow", icon: CalendarDays },
];

const PREPARATION_SECTION_OWNER = "jakub.rauscher";
const PREPARATION_GATED_NAV_KEYS = new Set<ActivePage>(["statements"]);

const normalizeUserIdentifier = (value: string | null | undefined) =>
  (value ?? "").trim().toLowerCase();

const canAccessPreparationSectionsForUser = (userEmail: string) => {
  const normalized = normalizeUserIdentifier(userEmail);
  const localPart = normalized.split("@")[0] ?? "";
  return normalized === PREPARATION_SECTION_OWNER || localPart === PREPARATION_SECTION_OWNER;
};

const buildNavigationItems = (
  configs: NavigationItemConfig[],
  navLabels: Record<ActivePage, string>
): NavigationItem[] =>
  configs.map((item) => ({
    ...item,
    label: navLabels[item.key],
  }));

const shouldShowNavigationItem = (
  item: NavigationItem,
  flags: {
    hasTeam: boolean;
    hasTipsters: boolean;
    isAdminRequestsUser: boolean;
    canAccessAdminArea: boolean;
  }
) => {
  if (item.requiresTeam && !flags.hasTeam) return false;
  if (item.requiresTipsters && !flags.hasTipsters) return false;
  if (item.requiresAdmin && !flags.isAdminRequestsUser) return false;
  if (item.requiresAdminArea && !flags.canAccessAdminArea) return false;
  return true;
};

function NavigationList({
  active,
  items,
  hasTeam,
  hasTipsters,
  isAdminRequestsUser,
  canAccessAdminArea,
  timelineSetupGateActive,
  canAccessPreparationSections,
  collapsed = false,
  onNavigate,
  onBlockedPreparationClick,
}: {
  active: ActivePage;
  items: NavigationItem[];
  hasTeam: boolean;
  hasTipsters: boolean;
  isAdminRequestsUser: boolean;
  canAccessAdminArea: boolean;
  timelineSetupGateActive: boolean;
  canAccessPreparationSections: boolean;
  collapsed?: boolean;
  onNavigate?: () => void;
  onBlockedPreparationClick: (item: NavigationItem) => void;
}) {
  const [tooltip, setTooltip] = useState<{ label: string; top: number; left: number } | null>(null);
  useEffect(() => {
    if (!tooltip) return;
    const dismiss = () => setTooltip(null);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [tooltip]);
  const showTooltip = (element: HTMLElement, label: string) => {
    if (!collapsed) return;
    const rect = element.getBoundingClientRect();
    setTooltip({ label, top: rect.top + rect.height / 2, left: rect.right + 18 });
  };
  const visibleItems = items.filter((item) => shouldShowNavigationItem(item, {
    hasTeam, hasTipsters, isAdminRequestsUser, canAccessAdminArea,
  }));
  return (
    <div className={styles.navList} onScrollCapture={() => setTooltip(null)}>
      {visibleItems.map((item) => {
        const isActive = active === item.key;
        const navDisabled = timelineSetupGateActive && item.key !== "settings";
        const isPreparationGated = PREPARATION_GATED_NAV_KEYS.has(item.key);
        const Icon = item.icon;
        const groupStart = item.key === "calc" || item.key === "tools" ||
          ((item.key === "admin" || item.key === "settings") &&
            visibleItems[visibleItems.indexOf(item) - 1]?.key !== "admin");
        const itemClass = `${styles.navItem} ${isActive ? styles.active : ""} ${groupStart ? styles.groupStart : ""}`;
        const content = (
          <>
            <span className={styles.navIcon}><Icon size={20} strokeWidth={1.8} aria-hidden="true" /></span>
            <span className={styles.itemLabel}>{item.label}</span>
            {isActive ? <span className={styles.activeDot} aria-hidden="true" /> : null}
          </>
        );

        if (navDisabled) {
          return (
            <div
              key={item.key}
              aria-disabled="true"
              className={`${itemClass} ${styles.disabled}`}
              title={item.label}
            >
              {content}
            </div>
          );
        }

        return (
          <Link
            key={item.key}
            href={item.href}
            prefetch={false}
            aria-label={item.label}
            aria-current={isActive ? "page" : undefined}
            onMouseEnter={(event) => showTooltip(event.currentTarget, item.label)}
            onMouseLeave={() => setTooltip(null)}
            onFocus={(event) => showTooltip(event.currentTarget, item.label)}
            onBlur={() => setTooltip(null)}
            onKeyDown={(event) => { if (event.key === "Escape") setTooltip(null); }}
            onClick={(event: MouseEvent<HTMLAnchorElement>) => {
              if (isPreparationGated && !canAccessPreparationSections) {
                event.preventDefault();
                onNavigate?.();
                onBlockedPreparationClick(item);
                return;
              }
              onNavigate?.();
            }}
            className={itemClass}
          >
            {content}
          </Link>
        );
      })}
      {collapsed && tooltip ? createPortal(
        <span className={styles.tooltip} aria-hidden="true" style={{ top: tooltip.top, left: tooltip.left }}>
          {tooltip.label}
        </span>, document.body
      ) : null}
    </div>
  );
}

export function AppNavigation({
  children,
  desktopHeaderContent,
  mobileHeaderAction,
  active,
  navLabels,
  logoutLabel,
  hasUser,
  userEmail,
  userAvatar,
  hasTeam,
  hasTipsters,
  isAdminRequestsUser,
  canAccessAdminArea,
  isTipsterAccount,
  isProfilePending,
  timelineSetupGateActive,
  mobileMenuOpen,
  shellFontClass,
  embedded = false,
  onToggleMobileMenu,
  onCloseMobileMenu,
  onLogout,
}: AppNavigationProps) {
  const [blockedPreparationItem, setBlockedPreparationItem] =
    useState<NavigationItem | null>(null);
  const navigationItems = isProfilePending
    ? []
    : buildNavigationItems(
        isTipsterAccount ? TIPSTER_NAV_ITEM_CONFIGS : NAV_ITEM_CONFIGS,
        navLabels
      );
  const [collapsed, toggleCollapsed] = useSidebarPreference();
  const mobileDialogRef = useRef<HTMLDivElement>(null);
  const mobileToggleRef = useRef<HTMLButtonElement>(null);
  const closeMobileRef = useRef(onCloseMobileMenu);
  useEffect(() => { closeMobileRef.current = onCloseMobileMenu; }, [onCloseMobileMenu]);
  useEffect(() => {
    if (!mobileMenuOpen || embedded) return;
    const dialog = mobileDialogRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.querySelector<HTMLButtonElement>("button")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeMobileRef.current(); }
      if (event.key !== "Tab") return;
      const controls = dialog?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
      if (!controls?.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    const desktop = window.matchMedia("(min-width: 1024px)");
    const onResize = () => { if (desktop.matches) closeMobileRef.current(); };
    onResize();
    desktop.addEventListener("change", onResize);
    document.addEventListener("keydown", onKeyDown);
    const returnFocus = mobileToggleRef.current;
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      desktop.removeEventListener("change", onResize);
      returnFocus?.focus();
    };
  }, [mobileMenuOpen, embedded]);
  const canAccessPreparationSections =
    canAccessPreparationSectionsForUser(userEmail);
  const BlockedPreparationIcon = blockedPreparationItem?.icon ?? ReceiptText;

  if (embedded) {
    return (
      <div className={`flex min-w-0 flex-1 flex-col ${shellFontClass}`}>
        {children}
      </div>
    );
  }

  return (
    <>
      <aside
        className={`${styles.sidebar} ${shellFontClass}`}
        data-collapsed={collapsed}
        aria-label="Postranní panel"
      >
        <div className={styles.brandRow}>
          <Link href="/" className={styles.brand} aria-label="Bohemka.App – domů">
            <span className={styles.brandLogo}>
              <Image src="/icons/bohemika_logo.png" alt="" width={40} height={40} priority />
            </span>
            <span className={styles.brandCopy}>
              <span className={styles.brandName}>Bohemka<span>.App</span></span>
              <span className={styles.brandTagline}>Váš pracovní prostor</span>
            </span>
          </Link>
        </div>
        <button
          type="button"
          onClick={toggleCollapsed}
          className={styles.collapseButton}
          aria-expanded={!collapsed}
          aria-controls="desktop-navigation"
          aria-label={collapsed ? "Rozbalit postranní panel" : "Sbalit postranní panel"}
          title={collapsed ? "Rozbalit postranní panel" : "Sbalit postranní panel"}
        >
          {collapsed ? <PanelLeftOpen size={19} aria-hidden="true" /> : <PanelLeftClose size={19} aria-hidden="true" />}
          <span className={styles.itemLabel}>Sbalit panel</span>
        </button>
        <nav id="desktop-navigation" aria-label="Hlavní navigace" className={styles.desktopNav}>
          <NavigationList
            active={active}
            items={navigationItems}
            hasTeam={hasTeam}
            hasTipsters={hasTipsters}
            isAdminRequestsUser={isAdminRequestsUser}
            canAccessAdminArea={canAccessAdminArea}
            timelineSetupGateActive={timelineSetupGateActive}
            canAccessPreparationSections={canAccessPreparationSections}
            collapsed={collapsed}
            onBlockedPreparationClick={setBlockedPreparationItem}
          />
        </nav>
        <div className={styles.footer}>
          {hasUser ? (
            <div className={styles.profile} title={userEmail}>
              <ProfileAvatar src={userAvatar} name={userEmail} className="h-9 w-9 rounded-xl" sizes="36px" />
              <span className={styles.profileCopy}>
                <span className={styles.profileLabel}>Můj účet</span>
                <span className={styles.profileEmail}>{userEmail}</span>
              </span>
            </div>
          ) : null}
          <button type="button" onClick={onLogout} className={styles.logout} aria-label={logoutLabel} title={collapsed ? logoutLabel : undefined}>
            <LogOut size={19} aria-hidden="true" />
            <span className={styles.itemLabel}>{logoutLabel}</span>
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {desktopHeaderContent ? (
          <header
            className={`sticky top-0 z-20 hidden h-[68px] pointer-events-none items-center px-6 lg:flex ${shellFontClass}`}
          >
            <div className="pointer-events-auto mx-auto w-full max-w-2xl">{desktopHeaderContent}</div>
          </header>
        ) : null}
        <header
          className={`${styles.mobileHeader} ${shellFontClass}`}
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
          <div className="flex shrink-0 items-center gap-2">
            {mobileHeaderAction}
            <button
              type="button"
              onClick={onToggleMobileMenu}
              ref={mobileToggleRef}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-navigation"
              aria-label="Otevřít menu"
              className={styles.mobileMenuButton}
            >
              <Menu size={20} aria-hidden="true" />
              <span className="hidden min-[390px]:inline">Menu</span>
            </button>
          </div>
        </header>

        {mobileMenuOpen ? (
          <div className="fixed inset-0 z-[70] lg:hidden" data-pull-to-refresh="off">
            <div className={styles.backdrop} onClick={onCloseMobileMenu} aria-hidden="true" />
            <div
              className={`${styles.mobileDrawer} ${shellFontClass}`}
              ref={mobileDialogRef}
              id="mobile-navigation"
              role="dialog"
              aria-modal="true"
              aria-label="Hlavní menu"
            >
              <div className={styles.mobileBrandRow}>
                <span className={styles.brandName}>Bohemka<span>.App</span></span>
                <button type="button" onClick={onCloseMobileMenu} className={styles.mobileMenuButton} aria-label="Zavřít menu">
                  <X size={21} aria-hidden="true" />
                </button>
              </div>
              <nav aria-label="Mobilní navigace" className={styles.mobileNav}>
                <NavigationList
                  active={active}
                  items={navigationItems}
                  hasTeam={hasTeam}
                  hasTipsters={hasTipsters}
                  isAdminRequestsUser={isAdminRequestsUser}
                  canAccessAdminArea={canAccessAdminArea}
                  timelineSetupGateActive={timelineSetupGateActive}
                  canAccessPreparationSections={canAccessPreparationSections}
                  onNavigate={onCloseMobileMenu}
                  onBlockedPreparationClick={setBlockedPreparationItem}
                />
              </nav>

              <div className={styles.footer}>
                {hasUser ? (
                  <div className={styles.profile}>
                    <ProfileAvatar src={userAvatar} name={userEmail} className="h-9 w-9 rounded-xl" sizes="36px" />
                    <span className={styles.profileCopy}>
                      <span className={styles.profileLabel}>Můj účet</span>
                      <span className={styles.profileEmail}>{userEmail}</span>
                    </span>
                  </div>
                ) : null}
                <button type="button" onClick={onLogout} className={styles.logout}>
                  <LogOut size={19} aria-hidden="true" />{logoutLabel}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {blockedPreparationItem ? (
          <div
            className={`fixed inset-0 z-[90] flex items-center justify-center px-4 ${shellFontClass}`}
          >
            <button
              type="button"
              aria-label="Zavřít upozornění"
              className="absolute inset-0 cursor-default bg-slate-950/55 backdrop-blur-sm"
              onClick={() => setBlockedPreparationItem(null)}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="preparation-section-dialog-title"
              className="relative w-full max-w-md rounded-[24px] border border-slate-200 bg-white p-6 text-slate-950 shadow-[0_28px_70px_rgba(15,23,42,0.26)]"
            >
              <div className="flex items-start gap-4">
                <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-700">
                  <BlockedPreparationIcon
                    className="h-5 w-5"
                    strokeWidth={2.2}
                    aria-hidden="true"
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    id="preparation-section-dialog-title"
                    className="text-lg font-bold tracking-tight"
                  >
                    Sekce je v přípravě
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Tato sekce je v přípravě a brzy bude dostupná.
                  </p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                    {blockedPreparationItem.label}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBlockedPreparationItem(null)}
                className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-slate-950 px-4 py-3 text-sm font-bold text-white shadow-[0_12px_22px_rgba(15,23,42,0.18)] transition hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300/70 focus-visible:ring-offset-2"
              >
                Rozumím
              </button>
            </div>
          </div>
        ) : null}

        {children}
      </div>
    </>
  );
}
