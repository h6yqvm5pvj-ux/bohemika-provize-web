"use client";

import { Bell, ClipboardList, CreditCard, IdCard, ShieldCheck, TrendingUp, UserRound } from "lucide-react";
import { SectionNavigation, SectionNavigationIcon, sectionNavigationItemClass } from "@/components/navigation/SectionNavigation";

export const SETTINGS_TABS = [
  { id: "profile", label: "Profil", icon: UserRound },
  { id: "account", label: "Zabezpečení", icon: ShieldCheck },
  { id: "subscription", label: "Předplatné", icon: CreditCard },
  { id: "career", label: "Kariéra", icon: TrendingUp },
  { id: "notifications", label: "Notifikace", icon: Bell },
  { id: "onlineCard", label: "Online vizitka", icon: IdCard },
  { id: "requests", label: "Žádosti", icon: ClipboardList },
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number]["id"];

type SettingsNavigationProps = {
  tabs: readonly (typeof SETTINGS_TABS)[number][];
  activeTab: SettingsTab;
  timelineGateActive: boolean;
  onTabChange: (tab: SettingsTab) => void;
};

export function SettingsNavigation({ tabs, activeTab, timelineGateActive, onTabChange }: SettingsNavigationProps) {
  return (
    <SectionNavigation
      activeKey={activeTab}
      role="tablist"
      label="Sekce nastavení"
      className="settings-tabs"
    >
      {tabs.map((tab) => {
        const active = activeTab === tab.id;
        const disabled = timelineGateActive && tab.id !== "career";
        return (
          <button
            key={tab.id}
            id={`settings-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={active}
            data-active={active}
            aria-controls="settings-panel"
            tabIndex={active ? 0 : -1}
            disabled={disabled}
            onClick={() => onTabChange(tab.id)}
            className={sectionNavigationItemClass(active, disabled)}
          >
            <SectionNavigationIcon icon={tab.icon} active={active} disabled={disabled} />
            {tab.label}
          </button>
        );
      })}
    </SectionNavigation>
  );
}
