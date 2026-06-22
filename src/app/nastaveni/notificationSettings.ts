import {
  CalendarDays,
  CarFront,
  CircleHelp,
  FileText,
  HeartPulse,
  Home,
  Landmark,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserRound,
  UsersRound,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  INTRANET_SECTIONS,
  INTRANET_SECTION_KEYS,
  type IntranetSectionKey,
} from "../intranet/sections";

export type { IntranetSectionKey } from "../intranet/sections";

export type NotificationSettings = {
  types: {
    newContract: boolean;
    anniversary: boolean;
    unpaid: boolean;
    team: boolean;
    intranet: boolean;
    weeklyTeamReport: boolean;
  };
  channels: {
    email: boolean;
    push: boolean;
  };
  intranet: {
    mode: "all" | "selected";
    sections: IntranetSectionKey[];
  };
};

export type NotificationTypeKey = keyof NotificationSettings["types"];

type NotificationTypeOption = {
  id: NotificationTypeKey;
  label: string;
  icon: LucideIcon;
};

export const NOTIFICATION_TYPE_OPTIONS: readonly NotificationTypeOption[] = [
  { id: "newContract", label: "Nová smlouva", icon: FileText },
  { id: "anniversary", label: "Výročí", icon: CalendarDays },
  { id: "unpaid", label: "Nezaplaceno", icon: Landmark },
  { id: "team", label: "Týmové akce", icon: UsersRound },
  { id: "intranet", label: "Intranet", icon: Sparkles },
  { id: "weeklyTeamReport", label: "Týdenní report týmu", icon: TrendingUp },
];

export const INTRANET_SECTION_ICON_BY_KEY: Record<IntranetSectionKey, LucideIcon> = {
  zivot: HeartPulse,
  majetek: Home,
  auto: CarFront,
  odpovednost: ShieldCheck,
  cizinci: UserRound,
  cestovko: Sparkles,
  investice: TrendingUp,
  zlato: Landmark,
  obecne: Wrench,
  pomoc: CircleHelp,
};

export const INTRANET_NOTIFICATION_SECTIONS = INTRANET_SECTIONS.map(
  (section) => section.key
);

const normalizeIntranetSectionList = (value: unknown): IntranetSectionKey[] => {
  if (!Array.isArray(value)) return [];
  const out = new Set<IntranetSectionKey>();
  value.forEach((raw) => {
    if (typeof raw !== "string") return;
    const key = raw.trim() as IntranetSectionKey;
    if (!INTRANET_SECTION_KEYS.has(key)) return;
    out.add(key);
  });
  return [...out];
};

export const normalizeNotificationSettings = (value: unknown): NotificationSettings => {
  const raw =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const typesInput =
    raw.types && typeof raw.types === "object" && !Array.isArray(raw.types)
      ? (raw.types as Record<string, unknown>)
      : {};
  const channelsInput =
    raw.channels && typeof raw.channels === "object" && !Array.isArray(raw.channels)
      ? (raw.channels as Record<string, unknown>)
      : {};
  const intranetInput =
    raw.intranet && typeof raw.intranet === "object" && !Array.isArray(raw.intranet)
      ? (raw.intranet as Record<string, unknown>)
      : {};

  const mode = intranetInput.mode === "selected" ? "selected" : "all";
  const selectedSections = normalizeIntranetSectionList(intranetInput.sections);

  return {
    types: {
      newContract:
        typeof typesInput.newContract === "boolean" ? typesInput.newContract : true,
      anniversary:
        typeof typesInput.anniversary === "boolean" ? typesInput.anniversary : true,
      unpaid: typeof typesInput.unpaid === "boolean" ? typesInput.unpaid : true,
      team: typeof typesInput.team === "boolean" ? typesInput.team : true,
      intranet: typeof typesInput.intranet === "boolean" ? typesInput.intranet : true,
      weeklyTeamReport:
        typeof typesInput.weeklyTeamReport === "boolean"
          ? typesInput.weeklyTeamReport
          : true,
    },
    channels: {
      email: typeof channelsInput.email === "boolean" ? channelsInput.email : true,
      push: typeof channelsInput.push === "boolean" ? channelsInput.push : true,
    },
    intranet: {
      mode,
      sections: mode === "selected" ? selectedSections : [...INTRANET_NOTIFICATION_SECTIONS],
    },
  };
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  types: {
    newContract: true,
    anniversary: true,
    unpaid: true,
    team: true,
    intranet: true,
    weeklyTeamReport: true,
  },
  channels: {
    email: true,
    push: true,
  },
  intranet: {
    mode: "all",
    sections: [...INTRANET_NOTIFICATION_SECTIONS],
  },
};
