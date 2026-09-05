"use client";

import Link from "next/link";
import { AlertTriangle, Inbox, Landmark, Link2, Megaphone, ShieldCheck, UserPlus, UserRound } from "lucide-react";
import { SectionNavigation, SectionNavigationIcon, sectionNavigationItemClass } from "@/components/navigation/SectionNavigation";

const SECTIONS = [
  { id: "requests", label: "Žádosti", icon: Inbox },
  { id: "createUser", label: "Přidat uživatele", icon: UserPlus },
  { id: "users", label: "Uživatelé", icon: UserRound },
  { id: "broadcasts", label: "Notifikace", icon: Megaphone },
  { id: "subscriptions", label: "Předplatné", icon: Landmark },
  { id: "security", label: "Zabezpečení", icon: ShieldCheck },
] as const;

const LINKS = [
  { href: "/admin/provizni-vypisy/produktova-mapa", label: "Mapa výpisů", icon: Link2 },
  { href: "/admin/data-health", label: "Data Health", icon: AlertTriangle },
] as const;

export type AdminSection = (typeof SECTIONS)[number]["id"];

type AdminNavigationProps = {
  activeSection: AdminSection;
  onSectionChange: (section: AdminSection) => void;
  isAllowedAdmin: boolean;
  canCreateUsers: boolean;
  isOwnerAdmin: boolean;
};

export function AdminNavigation({ activeSection, onSectionChange, isAllowedAdmin, canCreateUsers, isOwnerAdmin }: AdminNavigationProps) {
  const sections = SECTIONS.filter((section) => section.id === "createUser" ? canCreateUsers
    : section.id === "subscriptions" ? isOwnerAdmin : isAllowedAdmin);

  return (
    <SectionNavigation activeKey={activeSection} label="Sekce administrace" className="mb-5">
      {sections.map((section) => {
        const active = section.id === activeSection;
        return (
          <button
            key={section.id}
            type="button"
            data-active={active}
            aria-pressed={active}
            onClick={() => onSectionChange(section.id)}
            className={sectionNavigationItemClass(active)}
          >
            <SectionNavigationIcon icon={section.icon} active={active} />
            {section.label}
          </button>
        );
      })}
      {isAllowedAdmin && LINKS.map((link) => (
        <Link key={link.href} href={link.href} className={sectionNavigationItemClass(false)}>
          <SectionNavigationIcon icon={link.icon} />
          {link.label}
        </Link>
      ))}
    </SectionNavigation>
  );
}
