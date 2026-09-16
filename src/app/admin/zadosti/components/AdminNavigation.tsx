"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { ADMIN_SECTIONS, type AdminPage, type AdminSection } from "../../components/adminSections";
import styles from "../adminConsole.module.css";

export type { AdminSection } from "../../components/adminSections";

type AdminNavigationProps = {
  activeSection: AdminPage;
  onSectionChange?: (section: AdminSection) => void;
  isAllowedAdmin: boolean;
  canCreateUsers: boolean;
  isOwnerAdmin: boolean;
  pendingCount?: number;
};

export function AdminNavigation({ activeSection, onSectionChange, isAllowedAdmin, canCreateUsers, isOwnerAdmin, pendingCount }: AdminNavigationProps) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = ref.current;
    if (!nav) return;
    const revealActiveSection = () => {
      const item = nav.querySelector<HTMLElement>('[data-active="true"]');
      if (item && nav.scrollWidth > nav.clientWidth) {
        nav.scrollLeft += item.getBoundingClientRect().left - nav.getBoundingClientRect().left - 6;
      }
    };
    revealActiveSection();
    const observer = new ResizeObserver(revealActiveSection);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [activeSection, isAllowedAdmin, canCreateUsers, isOwnerAdmin]);
  const sections = ADMIN_SECTIONS.filter(section => section.id === "createUser" ? canCreateUsers
    : section.id === "subscriptions" ? isOwnerAdmin : isAllowedAdmin);
  return (
    <nav ref={ref} className={styles.navigation} aria-label="Sekce administrace">
      {sections.map(section => {
        const active = section.id === activeSection;
        const Icon = section.icon;
        const content = <><Icon className={styles.navIcon} aria-hidden="true" /><span>{section.label}</span>{section.id === "requests" && Boolean(pendingCount) ? <span className={styles.navCount}>{pendingCount}</span> : null}</>;
        return "href" in section || !onSectionChange ? (
          <Link key={section.id} href={"href" in section ? section.href : `/admin/zadosti?section=${section.id}`} data-active={active} aria-current={active ? "page" : undefined} className={styles.navItem}>{content}</Link>
        ) : (
          <button key={section.id} type="button" data-active={active} aria-pressed={active} onClick={() => onSectionChange(section.id)} className={styles.navItem}>{content}</button>
        );
      })}
    </nav>
  );
}
