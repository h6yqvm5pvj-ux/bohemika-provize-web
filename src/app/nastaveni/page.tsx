// src/app/nastaveni/page.tsx
"use client";

import { type ChangeEvent, useCallback, useEffect, useState } from "react";
import Image from "next/image";
import {
  AtSign,
  BellRing,
  Calculator,
  CalendarDays,
  CarFront,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Download,
  Building2,
  ExternalLink,
  FileText,
  Globe,
  Globe2,
  HeartPulse,
  Home,
  KeyRound,
  Maximize2,
  Mail,
  MapPin,
  Minimize2,
  Landmark,
  PhoneCall,
  ShieldCheck,
  Snail,
  Sparkles,
  TrendingUp,
  Upload,
  UserRound,
  UsersRound,
  QrCode as QrCodeIcon,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { User as FirebaseUser } from "firebase/auth";
import {
  EmailAuthProvider,
  FactorId,
  getMultiFactorResolver,
  multiFactor,
  type MultiFactorError,
  onAuthStateChanged,
  reauthenticateWithCredential,
  TotpMultiFactorGenerator,
  type TotpSecret,
  updatePassword,
} from "firebase/auth";
import QRCode from "qrcode";

import { auth } from "../firebase";
import { AppLayout } from "@/components/AppLayout";
import { AdvisorProfileSections } from "@/components/AdvisorProfileSections";
import { PremiumOnlineCardPreview } from "@/components/PremiumOnlineCardPreview";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import {
  deleteBrowserFcmToken,
  getBrowserFcmToken,
  getPushDeviceId,
  getPushPermission,
  isPushSupportedInBrowser,
} from "@/app/lib/pushNotifications";
import {
  BOX_THEME_EVENT,
  BOX_THEME_LOCAL_STORAGE_KEY,
  BOX_THEME_OPTIONS,
  DEFAULT_BOX_THEME,
  applyBoxThemeToRoot,
  resolveBoxTheme,
  type BoxTheme,
} from "@/lib/boxTheme";
import {
  DEFAULT_FONT_THEME,
  FONT_THEME_EVENT,
  FONT_THEME_LOCAL_STORAGE_KEY,
  FONT_THEME_OPTIONS,
  applyFontThemeToRoot,
  resolveFontTheme,
  type FontTheme,
} from "@/lib/fontTheme";
import type { Position, CommissionMode } from "../types/domain";
import SplitTitle from "../pomucky/plan-produkce/SplitTitle";
import {
  INTRANET_SECTIONS,
  INTRANET_SECTION_KEYS,
  type IntranetSectionKey,
} from "../intranet/sections";

const POSITIONS: { id: Position; label: string }[] = [
  { id: "poradce1", label: "Poradce 1" },
  { id: "poradce2", label: "Poradce 2" },
  { id: "poradce3", label: "Poradce 3" },
  { id: "poradce4", label: "Poradce 4" },
  { id: "poradce5", label: "Poradce 5" },
  { id: "poradce6", label: "Poradce 6" },
  { id: "poradce7", label: "Poradce 7" },
  { id: "poradce8", label: "Poradce 8" },
  { id: "poradce9", label: "Poradce 9" },
  { id: "poradce10", label: "Poradce 10" },
  { id: "manazer4", label: "Manažer 4" },
  { id: "manazer5", label: "Manažer 5" },
  { id: "manazer6", label: "Manažer 6" },
  { id: "manazer7", label: "Manažer 7" },
  { id: "manazer8", label: "Manažer 8" },
  { id: "manazer9", label: "Manažer 9" },
  { id: "manazer10", label: "Manažer 10" },
];

const COMMISSION_MODES: { id: CommissionMode; label: string }[] = [
  { id: "accelerated", label: "Zrychlený" },
  { id: "standard", label: "Běžný" },
];

type PositionTimelineItem = {
  id: string;
  position: Position;
  validFrom: string;
  validTo: string;
};

const POSITION_SET = new Set<Position>(POSITIONS.map((p) => p.id));
const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

const createTimelineRowId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `row_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
};

const isIsoDay = (value: string): boolean => {
  if (!ISO_DAY_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime());
};

const hasInvalidRangeOrder = (validFrom: string, validTo: string): boolean => {
  if (!validFrom || !validTo) return false;
  if (!isIsoDay(validFrom) || !isIsoDay(validTo)) return false;
  return validTo < validFrom;
};

const parsePositionTimeline = (value: unknown): PositionTimelineItem[] => {
  if (!Array.isArray(value)) return [];
  const rows: PositionTimelineItem[] = [];

  value.forEach((raw) => {
    if (!raw || typeof raw !== "object") return;
    const row = raw as Record<string, unknown>;
    const position = row.position as Position;
    const validFrom = typeof row.validFrom === "string" ? row.validFrom.trim() : "";
    const validToRaw = typeof row.validTo === "string" ? row.validTo.trim() : "";
    const validTo = validToRaw || "";

    if (!POSITION_SET.has(position)) return;
    if (!isIsoDay(validFrom)) return;
    if (validTo && !isIsoDay(validTo)) return;
    if (validTo && validTo < validFrom) return;

    rows.push({
      id:
        typeof row.id === "string" && row.id.trim().length > 0
          ? row.id.trim()
          : createTimelineRowId(),
      position,
      validFrom,
      validTo,
    });
  });

  rows.sort((a, b) => {
    if (a.validFrom !== b.validFrom) return a.validFrom.localeCompare(b.validFrom);
    const aTo = a.validTo || "9999-12-31";
    const bTo = b.validTo || "9999-12-31";
    return aTo.localeCompare(bTo);
  });

  return rows;
};

type NotificationSettings = {
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

type NotificationTypeKey = keyof NotificationSettings["types"];

type NotificationTypeOption = {
  id: NotificationTypeKey;
  label: string;
  icon: LucideIcon;
};

const NOTIFICATION_TYPE_OPTIONS: readonly NotificationTypeOption[] = [
  { id: "newContract", label: "Nová smlouva", icon: FileText },
  { id: "anniversary", label: "Výročí", icon: CalendarDays },
  { id: "unpaid", label: "Nezaplaceno", icon: Landmark },
  { id: "team", label: "Týmové akce", icon: UsersRound },
  { id: "intranet", label: "Intranet", icon: Sparkles },
  { id: "weeklyTeamReport", label: "Týdenní report týmu", icon: TrendingUp },
];

const INTRANET_SECTION_ICON_BY_KEY: Record<IntranetSectionKey, LucideIcon> = {
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

const INTRANET_NOTIFICATION_SECTIONS = INTRANET_SECTIONS.map(
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

const normalizeNotificationSettings = (
  value: unknown
): NotificationSettings => {
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
        typeof typesInput.newContract === "boolean"
          ? typesInput.newContract
          : true,
      anniversary:
        typeof typesInput.anniversary === "boolean"
          ? typesInput.anniversary
          : true,
      unpaid:
        typeof typesInput.unpaid === "boolean" ? typesInput.unpaid : true,
      team: typeof typesInput.team === "boolean" ? typesInput.team : true,
      intranet:
        typeof typesInput.intranet === "boolean"
          ? typesInput.intranet
          : true,
      weeklyTeamReport:
        typeof typesInput.weeklyTeamReport === "boolean"
          ? typesInput.weeklyTeamReport
          : true,
    },
    channels: {
      email:
        typeof channelsInput.email === "boolean" ? channelsInput.email : true,
      push:
        typeof channelsInput.push === "boolean" ? channelsInput.push : true,
    },
    intranet: {
      mode,
      sections:
        mode === "selected"
          ? selectedSections
          : [...INTRANET_NOTIFICATION_SECTIONS],
    },
  };
};

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
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

const SETTINGS_KEYS = {
  mode: "settings.mode",
  monthlyGoal: "settings.monthlyGoal",
  boxTheme: BOX_THEME_LOCAL_STORAGE_KEY,
  fontTheme: FONT_THEME_LOCAL_STORAGE_KEY,
  reduceMotion: "settings.reduceMotion",
  tipsterMode: "settings.tipsterMode",
};

type SettingsTab =
  | "account"
  | "subscription"
  | "career"
  | "notifications"
  | "onlineCard"
  | "design"
  | "requests";

const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: "account", label: "Účet" },
  { id: "subscription", label: "Předplatné" },
  { id: "career", label: "Kariéra" },
  { id: "notifications", label: "Notifikace" },
  { id: "onlineCard", label: "Online vizitka" },
  { id: "requests", label: "Žádosti" },
  { id: "design", label: "Design" },
];

type SubscriptionEffectiveState = "active" | "grace" | "blocked";
type SubscriptionStatusValue = "active" | "expired" | "unpaid" | "none";
type SubscriptionPlanValue = "monthly" | "semiannual" | "yearly" | "unlimited";

type SubscriptionPaymentRow = {
  id: string;
  plan: string;
  amountCzk: number;
  periodFrom: string;
  periodUntil: string;
  note: string | null;
  createdAtMs: number | null;
  createdByEmail: string | null;
};

type SubscriptionMeResponse = {
  ok?: boolean;
  subscription?: {
    status?: SubscriptionStatusValue;
    effectiveState?: SubscriptionEffectiveState;
    reason?: string;
    plan?: SubscriptionPlanValue | null;
    paidFrom?: string | null;
    paidUntil?: string | null;
    graceUntil?: string | null;
  };
  payments?: SubscriptionPaymentRow[];
};

const normalizeEmail = (email?: string | null) =>
  (email ?? "").trim().toLowerCase();

const formatDateTime = (valueMs: number | null | undefined): string => {
  if (!valueMs || !Number.isFinite(valueMs)) return "—";
  return new Date(valueMs).toLocaleString("cs-CZ");
};

const formatIsoDay = (value: string | null | undefined): string => {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("cs-CZ", { timeZone: "Europe/Prague" });
};

const formatMoneyCzk = (value: number): string =>
  new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: "CZK",
    maximumFractionDigits: 0,
  }).format(value);

const SUBSCRIPTION_PLAN_LABELS: Record<SubscriptionPlanValue, string> = {
  monthly: "Měsíční",
  semiannual: "Pololetní",
  yearly: "Roční",
  unlimited: "Neomezený",
};

type SubscriptionPriceCard = {
  id: Exclude<SubscriptionPlanValue, "unlimited">;
  label: string;
  priceLabel: string;
  cadenceLabel: string;
  tintClass: string;
  accentClass: string;
  ringClass: string;
};

const SUBSCRIPTION_PRICE_CARDS: readonly SubscriptionPriceCard[] = [
  {
    id: "monthly",
    label: "Měsíční",
    priceLabel: "300 Kč",
    cadenceLabel: "za měsíc",
    tintClass:
      "bg-[linear-gradient(130deg,rgba(186,230,253,0.45)_0%,rgba(255,255,255,0.92)_52%,rgba(224,231,255,0.55)_100%)]",
    accentClass: "bg-[linear-gradient(90deg,#0284c7_0%,#4f46e5_100%)]",
    ringClass: "ring-sky-200/80",
  },
  {
    id: "semiannual",
    label: "Pololetní",
    priceLabel: "1.590 Kč",
    cadenceLabel: "na 6 měsíců",
    tintClass:
      "bg-[linear-gradient(130deg,rgba(196,181,253,0.45)_0%,rgba(255,255,255,0.92)_52%,rgba(196,242,224,0.55)_100%)]",
    accentClass: "bg-[linear-gradient(90deg,#7c3aed_0%,#0f766e_100%)]",
    ringClass: "ring-violet-200/80",
  },
  {
    id: "yearly",
    label: "Roční",
    priceLabel: "2.800 Kč",
    cadenceLabel: "na 12 měsíců",
    tintClass:
      "bg-[linear-gradient(130deg,rgba(254,240,138,0.42)_0%,rgba(255,255,255,0.92)_52%,rgba(191,219,254,0.5)_100%)]",
    accentClass: "bg-[linear-gradient(90deg,#d97706_0%,#2563eb_100%)]",
    ringClass: "ring-amber-200/80",
  },
];

const hasNonEmptyToken = (value: unknown): boolean =>
  typeof value === "string" && value.trim().length > 0;

const hasAnyPushToken = (data: Record<string, unknown>): boolean => {
  if (hasNonEmptyToken(data.fcmToken)) return true;
  if (hasNonEmptyToken(data.pushToken)) return true;
  if (hasNonEmptyToken(data.notificationToken)) return true;

  const tokenArrays = [data.fcmTokens, data.pushTokens, data.notificationTokens];
  for (const raw of tokenArrays) {
    if (Array.isArray(raw) && raw.some((item) => hasNonEmptyToken(item))) {
      return true;
    }
  }

  const tokenMaps = [data.fcmTokensByDevice, data.pushTokensByDevice];
  for (const raw of tokenMaps) {
    if (raw && typeof raw === "object") {
      const values = Object.values(raw as Record<string, unknown>);
      if (values.some((item) => hasNonEmptyToken(item))) {
        return true;
      }
    }
  }

  return false;
};

type OnlineCardDraft = {
  enabled: boolean;
  slug: string;
  fullName: string;
  title: string;
  phone: string;
  email: string;
  website: string;
  ico: string;
  bio: string;
  location: string;
  officeLabel: string;
  officePhotos: string[];
};

const ONLINE_CARD_SLUG_MAX_LEN = 64;
const ONLINE_CARD_SLUG_MIN_LEN = 3;
const ONLINE_CARD_WEBSITE_MAX_LEN = 220;
const ONLINE_CARD_ICO_MAX_LEN = 8;
const ONLINE_CARD_OFFICE_MAX_LEN = 160;
const ONLINE_CARD_OFFICE_PHOTOS_MAX = 3;
const ONLINE_CARD_OFFICE_PHOTO_URL_MAX_LEN = 1_200;
const ONLINE_CARD_PUBLIC_BASE_URL = "https://bohemka.app";

const slugifyOnlineCard = (value: unknown): string => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  const ascii = trimmed
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return ascii.slice(0, ONLINE_CARD_SLUG_MAX_LEN);
};

const resolveOnlineCardAutoSlug = ({
  fullName,
  email,
  fallbackEmail,
}: {
  fullName: string;
  email: string;
  fallbackEmail: string;
}): string => {
  const source =
    fullName.trim() ||
    email.trim() ||
    normalizeEmail(fallbackEmail).split("@")[0] ||
    "vizitka";
  return slugifyOnlineCard(source);
};

const sanitizeOnlineCardWebsiteInput = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "";
    }
    return url.toString().slice(0, ONLINE_CARD_WEBSITE_MAX_LEN);
  } catch {
    return "";
  }
};

const sanitizeOnlineCardPhotoUrl = (value: unknown): string => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > ONLINE_CARD_OFFICE_PHOTO_URL_MAX_LEN) return "";

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "";
    }
    return url.toString();
  } catch {
    return "";
  }
};

const normalizeOnlineCardOfficePhotos = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const next: string[] = [];
  const seen = new Set<string>();

  for (const entry of value) {
    const photoUrl = sanitizeOnlineCardPhotoUrl(entry);
    if (!photoUrl || seen.has(photoUrl)) continue;
    seen.add(photoUrl);
    next.push(photoUrl);
    if (next.length >= ONLINE_CARD_OFFICE_PHOTOS_MAX) break;
  }

  return next;
};

const titleCaseWord = (value: string): string =>
  value.length > 1
    ? `${value.charAt(0).toUpperCase()}${value.slice(1).toLowerCase()}`
    : value.toUpperCase();

const nameFromEmail = (email: string): string => {
  const local = normalizeEmail(email).split("@")[0] ?? "";
  if (!local) return "";
  const parts = local.split(/[.\-_]/).filter(Boolean);
  if (parts.length === 0) return "";
  return parts.map((part) => titleCaseWord(part)).join(" ");
};

const defaultOnlineCardFromUser = (
  email: string,
  profileData: Record<string, unknown>
): OnlineCardDraft => {
  const fullName =
    typeof profileData.fullName === "string" && profileData.fullName.trim()
      ? profileData.fullName.trim()
      : typeof profileData.name === "string" && profileData.name.trim()
        ? profileData.name.trim()
        : nameFromEmail(email);
  const emailValue = normalizeEmail(email);
  const fallbackSlug = resolveOnlineCardAutoSlug({
    fullName,
    email: emailValue,
    fallbackEmail: emailValue,
  });

  return {
    enabled: false,
    slug: fallbackSlug,
    fullName,
    title: "",
    phone: "",
    email: emailValue,
    website: "",
    ico: "",
    bio: "",
    location: "",
    officeLabel: "",
    officePhotos: [],
  };
};

const normalizeOnlineCardDraft = (
  value: unknown,
  fallback: OnlineCardDraft
): OnlineCardDraft => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }
  const row = value as Record<string, unknown>;
  const fullName = typeof row.fullName === "string" ? row.fullName.trim() : "";
  const email =
    typeof row.email === "string" && row.email.trim()
      ? normalizeEmail(row.email)
      : fallback.email;
  const normalizedFullName = fullName || fallback.fullName;
  const slug = resolveOnlineCardAutoSlug({
    fullName: normalizedFullName,
    email,
    fallbackEmail: fallback.email,
  });
  return {
    enabled: row.enabled === true,
    slug,
    fullName: normalizedFullName,
    title: typeof row.title === "string" ? row.title.trim().slice(0, 120) : "",
    phone: typeof row.phone === "string" ? row.phone.trim().slice(0, 80) : "",
    email,
    website:
      typeof row.website === "string"
        ? row.website.trim().slice(0, ONLINE_CARD_WEBSITE_MAX_LEN)
        : "",
    ico:
      typeof row.ico === "string"
        ? row.ico.replace(/\D+/g, "").slice(0, ONLINE_CARD_ICO_MAX_LEN)
        : "",
    bio: typeof row.bio === "string" ? row.bio.trim().slice(0, 1_000) : "",
    location: typeof row.location === "string" ? row.location.trim().slice(0, 120) : "",
    officeLabel:
      typeof row.officeLabel === "string"
        ? row.officeLabel.trim().slice(0, ONLINE_CARD_OFFICE_MAX_LEN)
        : "",
    officePhotos: normalizeOnlineCardOfficePhotos(row.officePhotos),
  };
};

const EMPTY_ONLINE_CARD_DRAFT: OnlineCardDraft = {
  enabled: false,
  slug: "",
  fullName: "",
  title: "",
  phone: "",
  email: "",
  website: "",
  ico: "",
  bio: "",
  location: "",
  officeLabel: "",
  officePhotos: [],
};

type InlineStatus = {
  type: "success" | "error" | "info";
  message: string;
};

type TestPushApiResponse = {
  ok?: boolean;
  error?: string;
  detail?: string;
  sent?: number;
  failed?: number;
  cleanedTokens?: number;
};

type PushTokenApiResponse = {
  ok?: boolean;
  error?: string;
  tokenStored?: boolean;
  tokenRemoved?: boolean;
};

type OnlineCardOfficePhotoUploadResponse = {
  ok?: boolean;
  url?: string;
  error?: string;
};

type UserRequestSubject = "userCreation" | "other";
type UserRequestPriority = "normal" | "urgent";
type UserRequestStatus = "pending" | "needsInfo" | "accepted" | "rejected";

type UserCreationRequestDraft = {
  fullName: string | null;
  managerEmail: string | null;
  position: Position;
  commissionMode: CommissionMode;
};

type UserRequestPayload = {
  id: string;
  requesterEmail: string;
  subject: UserRequestSubject;
  requestedCorporateEmail: string | null;
  requestedUserDraft: UserCreationRequestDraft | null;
  message: string;
  priority: UserRequestPriority;
  status: UserRequestStatus;
  feedback: string | null;
  createdUserEmail: string | null;
  createdUserUid: string | null;
  createdAtMs: number;
  updatedAtMs: number;
  decidedAtMs: number | null;
  decidedByEmail: string | null;
};

type UserRequestsApiResponse = {
  ok?: boolean;
  requests?: UserRequestPayload[];
};

type UserRequestCreateApiResponse = {
  ok?: boolean;
  request?: UserRequestPayload;
  error?: string;
};

type UserRequestUpdateApiResponse = {
  ok?: boolean;
  request?: UserRequestPayload;
  error?: string;
};

type UserRequestDeleteApiResponse = {
  ok?: boolean;
  id?: string;
  error?: string;
};

const USER_REQUEST_MESSAGE_MIN_LEN = 5;
const USER_REQUEST_MESSAGE_MAX_LEN = 2500;
const USER_REQUEST_CORPORATE_EMAIL_MAX_LEN = 180;
const USER_REQUEST_MANAGER_EMAIL_MAX_LEN = 180;
const USER_REQUEST_FULL_NAME_MAX_LEN = 120;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isValidEmail = (value: string): boolean => EMAIL_RE.test(value);

const USER_REQUEST_SUBJECT_LABEL: Record<UserRequestSubject, string> = {
  userCreation: "Založení uživatele",
  other: "Jiné",
};

const USER_REQUEST_PRIORITY_LABEL: Record<UserRequestPriority, string> = {
  normal: "Běžná",
  urgent: "Urgentní",
};

const USER_REQUEST_STATUS_LABEL: Record<UserRequestStatus, string> = {
  pending: "Čeká",
  needsInfo: "Potřeba doplnit",
  accepted: "Akceptováno",
  rejected: "Odmítnuto",
};

const USER_REQUEST_STATUS_CLASS: Record<UserRequestStatus, string> = {
  pending: "border-amber-300 bg-amber-50 text-amber-800",
  needsInfo: "border-sky-300 bg-sky-50 text-sky-800",
  accepted: "border-emerald-300 bg-emerald-50 text-emerald-700",
  rejected: "border-rose-300 bg-rose-50 text-rose-700",
};

const USER_REQUEST_SLA_NORMAL_MS = 72 * 60 * 60 * 1000;
const USER_REQUEST_SLA_URGENT_MS = 8 * 60 * 60 * 1000;

const sortUserRequestsByActivity = (rows: UserRequestPayload[]): UserRequestPayload[] =>
  [...rows].sort((a, b) => {
    const aActivity = Math.max(a.updatedAtMs || 0, a.createdAtMs || 0);
    const bActivity = Math.max(b.updatedAtMs || 0, b.createdAtMs || 0);
    return bActivity - aActivity;
  });

const formatDurationCompact = (durationMs: number): string => {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return "0 min";
  const totalMinutes = Math.floor(durationMs / 60_000);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) return `${totalHours} h`;
  const totalDays = Math.floor(totalHours / 24);
  return `${totalDays} d`;
};

const formatSlaLimit = (priority: UserRequestPriority): string =>
  priority === "urgent" ? "8 h" : "3 dny";

const buildUserRequestSlaInfo = (request: UserRequestPayload, nowMs: number) => {
  const status = request.status;
  const waitingStatuses: UserRequestStatus[] = ["pending", "needsInfo"];
  const waiting = waitingStatuses.includes(status);
  const sinceMs = waiting ? request.updatedAtMs || request.createdAtMs : null;
  const elapsedMs =
    sinceMs && Number.isFinite(sinceMs) ? Math.max(0, nowMs - sinceMs) : 0;

  const slaLimitMs =
    request.priority === "urgent" ? USER_REQUEST_SLA_URGENT_MS : USER_REQUEST_SLA_NORMAL_MS;
  const isUrgentPending = status === "pending" && request.priority === "urgent";
  const isOverdueUrgent =
    isUrgentPending && elapsedMs > slaLimitMs;

  return {
    waiting,
    elapsedLabel: formatDurationCompact(elapsedMs),
    slaLimitLabel: formatSlaLimit(request.priority),
    isOverdueUrgent,
  };
};

const EXPECTED_MFA_ERROR_CODES = new Set<string>([
  "auth/wrong-password",
  "auth/invalid-credential",
  "auth/invalid-login-credentials",
  "auth/multi-factor-auth-required",
  "auth/invalid-verification-code",
  "auth/code-expired",
  "auth/requires-recent-login",
  "auth/too-many-requests",
  "auth/operation-not-allowed",
]);

const isExpectedMfaError = (error: unknown): boolean => {
  const code = (error as { code?: string })?.code;
  return typeof code === "string" && EXPECTED_MFA_ERROR_CODES.has(code);
};

const logMfaIssue = (context: string, error: unknown) => {
  const code = (error as { code?: string })?.code;
  if (isExpectedMfaError(error)) {
    console.warn(`[MFA] ${context}: ${code ?? "unknown"}`);
    return;
  }
  console.error(`[MFA] ${context}:`, error);
};

const resolveMfaErrorMessage = (error: unknown, fallback: string): string => {
  const err = error as { code?: string };
  if (
    err?.code === "auth/wrong-password" ||
    err?.code === "auth/invalid-credential" ||
    err?.code === "auth/invalid-login-credentials"
  ) {
    return "Aktuální heslo není správné.";
  }
  if (err?.code === "auth/multi-factor-auth-required") {
    return "Pro tuto změnu zadej i aktuální kód z Microsoft Authenticator.";
  }
  if (err?.code === "auth/invalid-verification-code") {
    return "Neplatný 2FA kód. Zadej aktuální kód z aplikace.";
  }
  if (err?.code === "auth/code-expired") {
    return "2FA kód vypršel. Zadej nový aktuální kód.";
  }
  if (err?.code === "auth/requires-recent-login") {
    return "Pro tuto změnu je potřeba znovu ověřit heslo.";
  }
  if (err?.code === "auth/too-many-requests") {
    return "Příliš mnoho pokusů. Zkus to prosím později.";
  }
  if (err?.code === "auth/operation-not-allowed") {
    return "TOTP MFA není zapnuté ve Firebase Console (Authentication > Multi-factor).";
  }
  return fallback;
};


export default function SettingsPage() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(true);

  const [position, setPosition] = useState<Position>("manazer7");
  const [mode, setMode] = useState<CommissionMode>("accelerated");
  const [, setMonthlyGoal] = useState<number>(0);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<
    { type: "success" | "error"; message: string } | null
  >(null);
  const [changingPassword, setChangingPassword] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [mfaPassword, setMfaPassword] = useState("");
  const [mfaStatus, setMfaStatus] = useState<InlineStatus | null>(null);
  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaTotpUid, setMfaTotpUid] = useState<string | null>(null);
  const [mfaTotpLabel, setMfaTotpLabel] = useState<string | null>(null);
  const [mfaReauthCode, setMfaReauthCode] = useState("");
  const [mfaEnrollmentSecret, setMfaEnrollmentSecret] = useState<TotpSecret | null>(null);
  const [mfaEnrollmentCode, setMfaEnrollmentCode] = useState("");
  const [mfaQrCodeDataUrl, setMfaQrCodeDataUrl] = useState("");
  const [mfaQrCodeLoading, setMfaQrCodeLoading] = useState(false);
  const [mfaQrCodeError, setMfaQrCodeError] = useState<string | null>(null);
  const [fcmActive, setFcmActive] = useState<boolean | null>(null);
  const [pushPermission, setPushPermission] = useState<NotificationPermission | "unsupported">(
    "unsupported"
  );
  const [pushSupported, setPushSupported] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [notificationSettings, setNotificationSettings] =
    useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [testPushStatus, setTestPushStatus] = useState<string | null>(null);
  const [boxTheme, setBoxTheme] = useState<BoxTheme>(DEFAULT_BOX_THEME);
  const [fontTheme, setFontTheme] = useState<FontTheme>(DEFAULT_FONT_THEME);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [tipsterMode, setTipsterMode] = useState(false);
  const [onlineCardDraft, setOnlineCardDraft] =
    useState<OnlineCardDraft>(EMPTY_ONLINE_CARD_DRAFT);
  const [onlineCardSaving, setOnlineCardSaving] = useState(false);
  const [onlineCardStatus, setOnlineCardStatus] = useState<InlineStatus | null>(null);
  const [onlineCardStudioFullscreen, setOnlineCardStudioFullscreen] = useState(false);
  const [onlineCardOfficeUploading, setOnlineCardOfficeUploading] = useState(false);
  const [onlineCardOfficePhotoIndex, setOnlineCardOfficePhotoIndex] = useState(0);
  const [onlineCardQrOpen, setOnlineCardQrOpen] = useState(false);
  const [onlineCardQrDataUrl, setOnlineCardQrDataUrl] = useState("");
  const [onlineCardQrLoading, setOnlineCardQrLoading] = useState(false);
  const [onlineCardQrError, setOnlineCardQrError] = useState<string | null>(null);
  const [positionTimelineDraft, setPositionTimelineDraft] = useState<PositionTimelineItem[]>([]);
  const [positionTimelineSaving, setPositionTimelineSaving] = useState(false);
  const [positionTimelineSaved, setPositionTimelineSaved] = useState(false);
  const [positionTimelineError, setPositionTimelineError] = useState<string | null>(null);
  const [timelineSaveFlashVisible, setTimelineSaveFlashVisible] = useState(false);
  const [positionTimelineLocked, setPositionTimelineLocked] = useState(false);
  const [timelineSetupRequired, setTimelineSetupRequired] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>("career");
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);
  const [subscriptionSnapshot, setSubscriptionSnapshot] = useState<{
    status: SubscriptionStatusValue;
    effectiveState: SubscriptionEffectiveState;
    plan: SubscriptionPlanValue | null;
    paidFrom: string | null;
    paidUntil: string | null;
    graceUntil: string | null;
  } | null>(null);
  const [subscriptionPayments, setSubscriptionPayments] = useState<SubscriptionPaymentRow[]>([]);
  const [showCareerTimelineHelp, setShowCareerTimelineHelp] = useState(false);
  const [userRequests, setUserRequests] = useState<UserRequestPayload[]>([]);
  const [userRequestsLoading, setUserRequestsLoading] = useState(false);
  const [userRequestsError, setUserRequestsError] = useState<string | null>(null);
  const [userRequestSubject, setUserRequestSubject] =
    useState<UserRequestSubject>("userCreation");
  const [userRequestCorporateEmail, setUserRequestCorporateEmail] = useState("");
  const [userRequestFullName, setUserRequestFullName] = useState("");
  const [userRequestManagerEmail, setUserRequestManagerEmail] = useState("");
  const [userRequestPosition, setUserRequestPosition] = useState<Position>("poradce1");
  const [userRequestMode, setUserRequestMode] = useState<CommissionMode>("standard");
  const [userRequestPriority, setUserRequestPriority] =
    useState<UserRequestPriority>("normal");
  const [userRequestMessage, setUserRequestMessage] = useState("");
  const [userRequestSubmitting, setUserRequestSubmitting] = useState(false);
  const [userRequestStatus, setUserRequestStatus] = useState<InlineStatus | null>(null);
  const [userRequestDeletingId, setUserRequestDeletingId] = useState<string | null>(null);
  const [editingUserRequestId, setEditingUserRequestId] = useState<string | null>(null);
  const [userRequestsNowMs, setUserRequestsNowMs] = useState(() => Date.now());

  const applyMotionPreference = (off: boolean) => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (off) {
      root.setAttribute("data-motion", "off");
    } else {
      root.removeAttribute("data-motion");
    }
  };

  const applyBoxThemePreference = (value: unknown) => {
    const next = resolveBoxTheme(value);
    setBoxTheme(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SETTINGS_KEYS.boxTheme, next);
      applyBoxThemeToRoot(next);
    }
    return next;
  };

  const applyFontThemePreference = (value: unknown) => {
    const next = resolveFontTheme(value);
    setFontTheme(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SETTINGS_KEYS.fontTheme, next);
      applyFontThemeToRoot(next);
    }
    return next;
  };

  // auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      if (!fbUser) {
        setUser(null);
        return;
      }
      setUser(fbUser);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setUserRequestsNowMs(Date.now());
    }, 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const supported = isPushSupportedInBrowser();
    setPushSupported(supported);
    setPushPermission(getPushPermission());
  }, []);

  useEffect(() => {
    if (!onlineCardStudioFullscreen || typeof window === "undefined") return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOnlineCardStudioFullscreen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onlineCardStudioFullscreen]);

  useEffect(() => {
    setOnlineCardOfficePhotoIndex((prev) => {
      if (onlineCardDraft.officePhotos.length === 0) return 0;
      return Math.min(prev, onlineCardDraft.officePhotos.length - 1);
    });
  }, [onlineCardDraft.officePhotos]);

  useEffect(() => {
    if (!onlineCardQrOpen || typeof window === "undefined") return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOnlineCardQrOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onlineCardQrOpen]);

  const clearMfaDraft = () => {
    setMfaEnrollmentSecret(null);
    setMfaEnrollmentCode("");
    setMfaQrCodeDataUrl("");
    setMfaQrCodeLoading(false);
    setMfaQrCodeError(null);
  };

  const syncMfaState = async (targetUser: FirebaseUser) => {
    await targetUser.reload();
    const activeUser = auth.currentUser ?? targetUser;
    const totpFactor =
      multiFactor(activeUser).enrolledFactors.find(
        (factor) => factor.factorId === FactorId.TOTP
      ) ?? null;

    setMfaEnabled(Boolean(totpFactor));
    setMfaTotpUid(totpFactor?.uid ?? null);
    setMfaTotpLabel(totpFactor?.displayName ?? null);
  };

  useEffect(() => {
    if (!user) {
      setMfaEnabled(false);
      setMfaTotpUid(null);
      setMfaTotpLabel(null);
      setMfaStatus(null);
      setMfaPassword("");
      setMfaReauthCode("");
      clearMfaDraft();
      return;
    }

    let isCancelled = false;

    const loadMfaState = async () => {
      try {
        await syncMfaState(user);
      } catch (error) {
        if (!isCancelled) {
          console.error("Chyba při načítání stavu 2FA:", error);
          setMfaStatus({
            type: "error",
            message: resolveMfaErrorMessage(
              error,
              "Nepodařilo se načíst stav 2FA."
            ),
          });
        }
      }
    };

    void loadMfaState();

    return () => {
      isCancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!mfaEnrollmentSecret) {
      setMfaQrCodeDataUrl("");
      setMfaQrCodeLoading(false);
      setMfaQrCodeError(null);
      return;
    }

    let isCancelled = false;
    setMfaQrCodeLoading(true);
    setMfaQrCodeError(null);

    const accountName =
      normalizeEmail(user?.email) || user?.email || "bohemika-user";
    const qrUri = mfaEnrollmentSecret.generateQrCodeUrl(
      accountName,
      "Bohemka.App"
    );

    void QRCode.toDataURL(qrUri, {
      width: 220,
      margin: 1,
      errorCorrectionLevel: "M",
    })
      .then((dataUrl) => {
        if (isCancelled) return;
        setMfaQrCodeDataUrl(dataUrl);
      })
      .catch((error) => {
        console.error("Chyba při generování QR kódu:", error);
        if (isCancelled) return;
        setMfaQrCodeError("QR kód se nepodařilo vygenerovat.");
      })
      .finally(() => {
        if (isCancelled) return;
        setMfaQrCodeLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [mfaEnrollmentSecret, user]);

  // načtení metadat uživatele z Firestore
  useEffect(() => {
    const loadMeta = async () => {
      if (!user) return;

      const emailRaw = user.email;
      const email = normalizeEmail(emailRaw);
      if (!email) return; // email může být teoreticky null

      setLoadingMeta(true);

      try {
        const payload = await fetchAuthedJsonOrThrow<{
          ok?: boolean;
          hasProfile?: boolean;
          profile?: Record<string, unknown>;
        }>(user, "/api/user/profile", { method: "GET" });

        if (payload?.hasProfile) {
          const data = payload.profile ?? {};

          if (data.position) {
            setPosition(data.position as Position);
          }

          if (data.commissionMode) {
            setMode(data.commissionMode as CommissionMode);
            if (typeof window !== "undefined") {
              window.localStorage.setItem(
                SETTINGS_KEYS.mode,
                data.commissionMode as string
              );
            }
          } else if (typeof window !== "undefined") {
            const stored = window.localStorage.getItem(
              SETTINGS_KEYS.mode
            ) as CommissionMode | null;
            if (stored) setMode(stored);
          }

          if (typeof data.monthlyGoal === "number") {
            setMonthlyGoal(data.monthlyGoal);
            if (typeof window !== "undefined") {
              window.localStorage.setItem(
                SETTINGS_KEYS.monthlyGoal,
                String(data.monthlyGoal)
              );
            }
          } else if (typeof window !== "undefined") {
            const stored = window.localStorage.getItem(
              SETTINGS_KEYS.monthlyGoal
            );
            const n = stored ? Number(stored) : 0;
            if (Number.isFinite(n)) setMonthlyGoal(n);
          }

          if (typeof data.boxTheme === "string") {
            applyBoxThemePreference(data.boxTheme);
          } else if (typeof window !== "undefined") {
            applyBoxThemePreference(
              window.localStorage.getItem(SETTINGS_KEYS.boxTheme)
            );
          } else {
            setBoxTheme(DEFAULT_BOX_THEME);
          }

          if (typeof data.fontTheme === "string") {
            applyFontThemePreference(data.fontTheme);
          } else if (typeof window !== "undefined") {
            applyFontThemePreference(
              window.localStorage.getItem(SETTINGS_KEYS.fontTheme)
            );
          } else {
            setFontTheme(DEFAULT_FONT_THEME);
          }

          if (typeof data.reduceMotion === "boolean") {
            setReduceMotion(data.reduceMotion);
            applyMotionPreference(data.reduceMotion);
            if (typeof window !== "undefined") {
              window.localStorage.setItem(
                SETTINGS_KEYS.reduceMotion,
                data.reduceMotion ? "1" : "0"
              );
            }
          } else if (typeof window !== "undefined") {
            const storedMotion = window.localStorage.getItem(
              SETTINGS_KEYS.reduceMotion
            );
            if (storedMotion === "1") {
              setReduceMotion(true);
              applyMotionPreference(true);
            }
          }

          if (typeof data.tipsterCollaborationMode === "boolean") {
            setTipsterMode(data.tipsterCollaborationMode);
            if (typeof window !== "undefined") {
              window.localStorage.setItem(
                SETTINGS_KEYS.tipsterMode,
                data.tipsterCollaborationMode ? "1" : "0"
              );
            }
          } else if (typeof window !== "undefined") {
            const storedTipsterMode = window.localStorage.getItem(
              SETTINGS_KEYS.tipsterMode
            );
            if (storedTipsterMode === "1" || storedTipsterMode === "0") {
              setTipsterMode(storedTipsterMode === "1");
            }
          }

          const onlineCardFallback = defaultOnlineCardFromUser(
            email,
            data as Record<string, unknown>
          );
          setOnlineCardDraft(normalizeOnlineCardDraft(data.onlineCard, onlineCardFallback));
          setOnlineCardStatus(null);

          setFcmActive(hasAnyPushToken(data as Record<string, unknown>));

          if (data.notificationSettings) {
            setNotificationSettings(normalizeNotificationSettings(data.notificationSettings));
          }

          const parsedTimeline = parsePositionTimeline(data.positionTimeline);
          setPositionTimelineDraft(parsedTimeline);
          setPositionTimelineLocked(parsedTimeline.length > 0);
          setTimelineSetupRequired(parsedTimeline.length === 0);
        } else {
          // user dokument neexistuje → zkusíme aspoň natáhnout z localStorage
          setPositionTimelineDraft([]);
          setPositionTimelineLocked(false);
          setTimelineSetupRequired(true);
          setOnlineCardDraft(defaultOnlineCardFromUser(email, {}));
          setOnlineCardStatus(null);
          if (typeof window !== "undefined") {
            const storedMode = window.localStorage.getItem(
              SETTINGS_KEYS.mode
            ) as CommissionMode | null;
            const storedGoal = window.localStorage.getItem(
              SETTINGS_KEYS.monthlyGoal
            );
            const storedBoxTheme = window.localStorage.getItem(
              SETTINGS_KEYS.boxTheme
            );
            const storedFontTheme = window.localStorage.getItem(
              SETTINGS_KEYS.fontTheme
            );

            if (storedMode) setMode(storedMode);
            const n = storedGoal ? Number(storedGoal) : 0;
            if (Number.isFinite(n)) setMonthlyGoal(n);
            applyBoxThemePreference(storedBoxTheme);
            applyFontThemePreference(storedFontTheme);
            const storedMotion = window.localStorage.getItem(
              SETTINGS_KEYS.reduceMotion
            );
            if (storedMotion === "1") {
              setReduceMotion(true);
              applyMotionPreference(true);
            }
            const storedTipsterMode = window.localStorage.getItem(
              SETTINGS_KEYS.tipsterMode
            );
            if (storedTipsterMode === "1" || storedTipsterMode === "0") {
              setTipsterMode(storedTipsterMode === "1");
            }
          }
        }
      } catch (e) {
        console.error("Chyba při načítání nastavení:", e);
      } finally {
        setLoadingMeta(false);
      }
    };

    loadMeta();
  }, [user]);

  const loadSubscription = useCallback(async () => {
    if (!user) {
      setSubscriptionSnapshot(null);
      setSubscriptionPayments([]);
      setSubscriptionError(null);
      setSubscriptionLoading(false);
      return;
    }

    setSubscriptionLoading(true);
    setSubscriptionError(null);
    try {
      const payload = await fetchAuthedJsonOrThrow<SubscriptionMeResponse>(
        user,
        "/api/subscription/me",
        { method: "GET" }
      );
      const row = payload?.subscription;
      setSubscriptionSnapshot({
        status: (row?.status as SubscriptionStatusValue) || "none",
        effectiveState: (row?.effectiveState as SubscriptionEffectiveState) || "blocked",
        plan: (row?.plan as SubscriptionPlanValue | null) ?? null,
        paidFrom: row?.paidFrom ?? null,
        paidUntil: row?.paidUntil ?? null,
        graceUntil: row?.graceUntil ?? null,
      });
      setSubscriptionPayments(Array.isArray(payload?.payments) ? payload.payments : []);
    } catch (error) {
      setSubscriptionSnapshot(null);
      setSubscriptionPayments([]);
      setSubscriptionError(
        error instanceof Error ? error.message : "Nepodařilo se načíst předplatné."
      );
    } finally {
      setSubscriptionLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadSubscription();
  }, [loadSubscription]);

  useEffect(() => {
    applyMotionPreference(reduceMotion);
  }, [reduceMotion]);

  useEffect(() => {
    if (!timelineSaveFlashVisible) return;
    const timeoutId = window.setTimeout(() => {
      setTimelineSaveFlashVisible(false);
    }, 2600);
    return () => window.clearTimeout(timeoutId);
  }, [timelineSaveFlashVisible]);

  useEffect(() => {
    if (!timelineSetupRequired) return;
    if (activeTab !== "career") {
      setActiveTab("career");
    }
  }, [timelineSetupRequired, activeTab]);

  useEffect(() => {
    if (loadingMeta || typeof window === "undefined") return;

    const scrollToTimeline = () => {
      if (window.location.hash !== "#timeline-kariery") return;
      const timelineSection = document.getElementById("timeline-kariery");
      if (!timelineSection) return;
      timelineSection.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const startupTimer = window.setTimeout(() => {
      scrollToTimeline();
    }, 80);
    const onHashChange = () => {
      window.setTimeout(scrollToTimeline, 0);
    };

    window.addEventListener("hashchange", onHashChange);
    return () => {
      window.clearTimeout(startupTimer);
      window.removeEventListener("hashchange", onHashChange);
    };
  }, [loadingMeta]);

  async function saveUserFields(
    partial: Record<string, any>
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!user) {
      return { ok: false, error: "Nejsi přihlášený." };
    }

    try {
      await fetchAuthedJsonOrThrow(user, "/api/user/profile", {
        method: "PATCH",
        body: JSON.stringify(partial),
      });
      return { ok: true };
    } catch (e) {
      console.error("Chyba při ukládání nastavení:", e);
      const message =
        e instanceof Error && e.message.trim().length > 0
          ? e.message.trim()
          : "Uložení nastavení selhalo.";
      return { ok: false, error: message };
    }
  }

  const addPositionTimelineRow = () => {
    setPositionTimelineSaved(false);
    setTimelineSaveFlashVisible(false);
    setPositionTimelineError(null);
    setPositionTimelineDraft((prev) => [
      ...prev,
      {
        id: createTimelineRowId(),
        position,
        validFrom: "",
        validTo: "",
      },
    ]);
  };

  const unlockPositionTimeline = () => {
    setPositionTimelineLocked(false);
    setPositionTimelineSaved(false);
    setTimelineSaveFlashVisible(false);
    setPositionTimelineError(null);
  };

  const updatePositionTimelineRow = (
    rowId: string,
    patch: Partial<PositionTimelineItem>
  ) => {
    setPositionTimelineSaved(false);
    setTimelineSaveFlashVisible(false);
    setPositionTimelineError(null);
    setPositionTimelineDraft((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, ...patch } : row))
    );
  };

  const removePositionTimelineRow = (rowId: string) => {
    setPositionTimelineSaved(false);
    setTimelineSaveFlashVisible(false);
    setPositionTimelineError(null);
    setPositionTimelineDraft((prev) => prev.filter((row) => row.id !== rowId));
  };

  const savePositionTimeline = async () => {
    setPositionTimelineSaving(true);
    setPositionTimelineSaved(false);
    setTimelineSaveFlashVisible(false);
    setPositionTimelineError(null);

    try {
      const normalized = positionTimelineDraft
        .map((row) => ({
          ...row,
          validFrom: row.validFrom.trim(),
          validTo: row.validTo.trim(),
        }))
        .filter(
          (row) =>
            row.position ||
            row.validFrom.length > 0 ||
            row.validTo.length > 0
        );

      if (normalized.length === 0) {
        setPositionTimelineError("Přidej aspoň jednu pozici do timeline.");
        return;
      }

      for (let i = 0; i < normalized.length; i += 1) {
        const row = normalized[i];
        const rowNo = i + 1;
        if (!POSITION_SET.has(row.position)) {
          setPositionTimelineError(`Řádek ${rowNo}: vyber platnou pozici v timeline.`);
          return;
        }
        if (!row.validFrom) {
          setPositionTimelineError(`Řádek ${rowNo}: vyplň datum OD.`);
          return;
        }
        if (!isIsoDay(row.validFrom)) {
          setPositionTimelineError(`Řádek ${rowNo}: datum OD musí být platné.`);
          return;
        }
        if (row.validTo && !isIsoDay(row.validTo)) {
          setPositionTimelineError(`Řádek ${rowNo}: datum DO musí být platné.`);
          return;
        }
        if (hasInvalidRangeOrder(row.validFrom, row.validTo)) {
          setPositionTimelineError(`Řádek ${rowNo}: datum DO nemůže být dřív než datum OD.`);
          return;
        }
      }

      const sorted = [...normalized].sort((a, b) => {
        if (a.validFrom !== b.validFrom) {
          return a.validFrom.localeCompare(b.validFrom);
        }
        const aTo = a.validTo || "9999-12-31";
        const bTo = b.validTo || "9999-12-31";
        return aTo.localeCompare(bTo);
      });

      const openEndedIndexes = sorted
        .map((row, index) => (!row.validTo ? index : -1))
        .filter((index) => index >= 0);

      if (openEndedIndexes.length > 1) {
        setPositionTimelineError(
          "Současnost (prázdné datum DO) může být jen u jedné poslední pozice."
        );
        return;
      }

      if (
        openEndedIndexes.length === 1 &&
        openEndedIndexes[0] !== sorted.length - 1
      ) {
        setPositionTimelineError(
          "Současnost (prázdné datum DO) je povolena jen u poslední aktuální pozice."
        );
        return;
      }

      for (let i = 1; i < sorted.length; i += 1) {
        const prev = sorted[i - 1];
        const current = sorted[i];
        const prevTo = prev.validTo || "9999-12-31";
        if (prevTo > current.validFrom) {
          setPositionTimelineError(
            `Rozsahy se překrývají mezi řádky ${i} a ${i + 1}. Uprav datum OD/DO.`
          );
          return;
        }
      }

      const payload = sorted.map((row) => ({
        id: row.id,
        position: row.position,
        validFrom: row.validFrom,
        validTo: row.validTo || null,
      }));

      const saved = await saveUserFields({ positionTimeline: payload });
      if (!saved.ok) {
        setPositionTimelineError(saved.error);
        return;
      }
      setPositionTimelineDraft(
        payload.map((row) => ({
          id: row.id,
          position: row.position,
          validFrom: row.validFrom,
          validTo: row.validTo ?? "",
        }))
      );
      setPositionTimelineLocked(true);
      setPositionTimelineSaved(true);
      setTimelineSaveFlashVisible(true);
      setTimelineSetupRequired(false);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("app:refresh-user-profile"));
      }
    } catch (e) {
      console.error("Chyba při ukládání timeline pozic:", e);
      setPositionTimelineError("Historii kariéry se nepodařilo uložit.");
    } finally {
      setPositionTimelineSaving(false);
    }
  };

  const handleModeChange = async (value: CommissionMode) => {
    setMode(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SETTINGS_KEYS.mode, value);
    }
    await saveUserFields({ commissionMode: value });
  };

  const handleTipsterModeChange = async (value: boolean) => {
    setTipsterMode(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SETTINGS_KEYS.tipsterMode, value ? "1" : "0");
    }
    await saveUserFields({ tipsterCollaborationMode: value });
  };

  const updateOnlineCardDraft = (patch: Partial<OnlineCardDraft>) => {
    setOnlineCardStatus(null);
    setOnlineCardDraft((prev) => {
      const merged = { ...prev, ...patch };
      return {
        ...merged,
        slug: resolveOnlineCardAutoSlug({
          fullName: merged.fullName,
          email: merged.email,
          fallbackEmail: user?.email ?? "",
        }),
      };
    });
  };

  const shiftOnlineCardOfficePhoto = (direction: 1 | -1) => {
    const photoCount = onlineCardDraft.officePhotos.length;
    if (photoCount <= 1) return;
    setOnlineCardOfficePhotoIndex((prev) => (prev + direction + photoCount) % photoCount);
  };

  const removeOnlineCardOfficePhoto = (photoIndex: number) => {
    setOnlineCardStatus(null);
    setOnlineCardDraft((prev) => {
      if (photoIndex < 0 || photoIndex >= prev.officePhotos.length) return prev;
      const nextPhotos = prev.officePhotos.filter((_, index) => index !== photoIndex);
      return {
        ...prev,
        officePhotos: nextPhotos,
      };
    });
  };

  const uploadOnlineCardOfficePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!selectedFile) return;

    if (!user) {
      setOnlineCardStatus({
        type: "error",
        message: "Pro nahrání fotky kanceláře se nejdřív přihlas.",
      });
      return;
    }

    if (onlineCardDraft.officePhotos.length >= ONLINE_CARD_OFFICE_PHOTOS_MAX) {
      setOnlineCardStatus({
        type: "info",
        message: `Maximální počet fotek kanceláře je ${ONLINE_CARD_OFFICE_PHOTOS_MAX}.`,
      });
      return;
    }

    setOnlineCardOfficeUploading(true);
    setOnlineCardStatus(null);

    try {
      const formData = new FormData();
      formData.set("file", selectedFile);

      const response = await fetchAuthedJsonOrThrow<OnlineCardOfficePhotoUploadResponse>(
        user,
        "/api/online-card/office-photo",
        {
          method: "POST",
          body: formData,
        }
      );

      const uploadedUrl = sanitizeOnlineCardPhotoUrl(response?.url);
      if (!uploadedUrl) {
        throw new Error("Nahraná fotka nevrátila platnou URL.");
      }

      setOnlineCardDraft((prev) => {
        const merged = normalizeOnlineCardOfficePhotos([...prev.officePhotos, uploadedUrl]);
        return {
          ...prev,
          officePhotos: merged,
        };
      });
      setOnlineCardStatus({
        type: "success",
        message: "Fotka kanceláře je připravená. Nezapomeň kliknout na Uložit vizitku.",
      });
    } catch (error) {
      console.error("Chyba při nahrávání fotky kanceláře:", error);
      setOnlineCardStatus({
        type: "error",
        message:
          error instanceof Error && error.message.trim()
            ? error.message
            : "Fotku kanceláře se nepodařilo nahrát.",
      });
    } finally {
      setOnlineCardOfficeUploading(false);
    }
  };

  const handleSaveOnlineCard = async () => {
    const fullName = onlineCardDraft.fullName.trim();
    const email = normalizeEmail(onlineCardDraft.email);
    const slug = resolveOnlineCardAutoSlug({
      fullName,
      email,
      fallbackEmail: user?.email ?? "",
    });
    const website = sanitizeOnlineCardWebsiteInput(onlineCardDraft.website);

    if (onlineCardDraft.enabled && fullName.length === 0) {
      setOnlineCardStatus({
        type: "error",
        message: "Pro aktivní vizitku vyplň jméno.",
      });
      return;
    }

    if (onlineCardDraft.enabled && slug.length < ONLINE_CARD_SLUG_MIN_LEN) {
      setOnlineCardStatus({
        type: "error",
        message: `Slug musí mít alespoň ${ONLINE_CARD_SLUG_MIN_LEN} znaky.`,
      });
      return;
    }

    if (email && !isValidEmail(email)) {
      setOnlineCardStatus({
        type: "error",
        message: "Kontaktní e-mail nemá platný formát.",
      });
      return;
    }

    if (onlineCardDraft.website.trim() && !website) {
      setOnlineCardStatus({
        type: "error",
        message: "Web vizitky má neplatný formát.",
      });
      return;
    }

    setOnlineCardSaving(true);
    setOnlineCardStatus(null);

    const payload: OnlineCardDraft = {
      enabled: onlineCardDraft.enabled,
      slug,
      fullName,
      title: onlineCardDraft.title.trim().slice(0, 120),
      phone: onlineCardDraft.phone.trim().slice(0, 80),
      email,
      website,
      ico: onlineCardDraft.ico.replace(/\D+/g, "").slice(0, ONLINE_CARD_ICO_MAX_LEN),
      bio: onlineCardDraft.bio.trim().slice(0, 1_000),
      location: onlineCardDraft.location.trim().slice(0, 120),
      officeLabel: onlineCardDraft.officeLabel.trim().slice(0, ONLINE_CARD_OFFICE_MAX_LEN),
      officePhotos: normalizeOnlineCardOfficePhotos(onlineCardDraft.officePhotos),
    };

    const saved = await saveUserFields({ onlineCard: payload });
    if (!saved.ok) {
      setOnlineCardStatus({
        type: "error",
        message: saved.error,
      });
      setOnlineCardSaving(false);
      return;
    }

    setOnlineCardDraft(payload);
    setOnlineCardStatus({
      type: "success",
      message: payload.enabled
        ? "Online vizitka byla publikována."
        : "Online vizitka byla uložena jako neveřejná.",
    });
    setOnlineCardSaving(false);
  };

  const persistNotificationSettings = async (
    next: NotificationSettings,
    additional?: Record<string, any>
  ) => {
    setNotificationSettings(next);
    await saveUserFields({
      notificationSettings: next,
      ...(additional ?? {}),
    });
  };

  const toggleNotificationType = async (key: keyof NotificationSettings["types"]) => {
    const next = {
      ...notificationSettings,
      types: { ...notificationSettings.types, [key]: !notificationSettings.types[key] },
    };
    await persistNotificationSettings(next);
  };

  const setPushChannelEnabled = async (enabled: boolean) => {
    if (notificationSettings.channels.push === enabled) return;
    const next = {
      ...notificationSettings,
      channels: {
        ...notificationSettings.channels,
        push: enabled,
      },
    };
    await persistNotificationSettings(next);
  };

  const setIntranetNotificationMode = async (mode: "all" | "selected") => {
    if (notificationSettings.intranet.mode === mode) return;
    const nextSections =
      mode === "all"
        ? [...INTRANET_NOTIFICATION_SECTIONS]
        : notificationSettings.intranet.sections.length > 0
          ? notificationSettings.intranet.sections
          : [...INTRANET_NOTIFICATION_SECTIONS];
    const next = {
      ...notificationSettings,
      intranet: {
        mode,
        sections: nextSections,
      },
    };
    await persistNotificationSettings(next);
  };

  const toggleIntranetNotificationSection = async (key: IntranetSectionKey) => {
    if (notificationSettings.intranet.mode !== "selected") return;
    const current = notificationSettings.intranet.sections;
    const exists = current.includes(key);
    const nextSections = exists
      ? current.filter((section) => section !== key)
      : [...current, key];
    const next = {
      ...notificationSettings,
      intranet: {
        ...notificationSettings.intranet,
        sections: nextSections,
      },
    };
    await persistNotificationSettings(next);
  };

  const handleEnableBrowserPush = async () => {
    if (!user) {
      setTestPushStatus("Nejsi přihlášený.");
      return;
    }
    if (!pushSupported) {
      setTestPushStatus("Tento prohlížeč nepodporuje web push notifikace.");
      return;
    }

    setPushBusy(true);
    setTestPushStatus("Aktivuju push notifikace pro toto zařízení…");
    try {
      const token = await getBrowserFcmToken();
      const payload = await fetchAuthedJsonOrThrow<PushTokenApiResponse>(user, "/api/push/token", {
        method: "POST",
        body: JSON.stringify({
          token,
          deviceId: getPushDeviceId(),
          userAgent: navigator.userAgent,
        }),
      });
      if (payload?.ok !== true) {
        const msg = payload?.error || "Push token se nepodařilo uložit.";
        setTestPushStatus(`Chyba: ${msg}`);
        return;
      }

      setPushPermission(getPushPermission());
      setFcmActive(true);
      await setPushChannelEnabled(true);
      setTestPushStatus("Push notifikace jsou aktivní pro toto zařízení.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPushPermission(getPushPermission());
      setTestPushStatus(`Chyba: ${message}`);
    } finally {
      setPushBusy(false);
    }
  };

  const handleDisableBrowserPush = async () => {
    if (!user) {
      setTestPushStatus("Nejsi přihlášený.");
      return;
    }
    if (!pushSupported) {
      setTestPushStatus("Tento prohlížeč nepodporuje web push notifikace.");
      return;
    }

    setPushBusy(true);
    setTestPushStatus("Odpojuju push notifikace pro toto zařízení…");
    try {
      const { previousToken } = await deleteBrowserFcmToken();
      if (previousToken) {
        await fetchAuthedJsonOrThrow<PushTokenApiResponse>(user, "/api/push/token", {
          method: "DELETE",
          body: JSON.stringify({
            token: previousToken,
            deviceId: getPushDeviceId(),
            userAgent: navigator.userAgent,
          }),
        });
      }

      setPushPermission(getPushPermission());
      setFcmActive(false);
      await setPushChannelEnabled(false);
      setTestPushStatus("Push notifikace jsou pro toto zařízení vypnuté.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPushPermission(getPushPermission());
      setTestPushStatus(`Chyba: ${message}`);
    } finally {
      setPushBusy(false);
    }
  };

  const handleTestPush = async () => {
    if (!user) {
      setTestPushStatus("Nejsi přihlášený.");
      return;
    }
    setTestPushStatus("Posílám testovací notifikaci…");

    try {
      const payload = await fetchAuthedJsonOrThrow<TestPushApiResponse>(
        user,
        "/api/test-push",
        {
          method: "POST",
          body: JSON.stringify({ message: "Test push z Nastavení" }),
        }
      );
      if (payload?.ok !== true) {
        const msg = payload?.error || payload?.detail || "Odeslání selhalo.";
        setTestPushStatus(`Chyba: ${msg}`);
        return;
      }

      const sent = typeof payload?.sent === "number" ? payload.sent : null;
      const failed = typeof payload?.failed === "number" ? payload.failed : null;
      if (sent != null && failed != null) {
        setTestPushStatus(`Test odeslán (doručeno ${sent}, chybně ${failed}).`);
      } else {
        setTestPushStatus("Testovací notifikace odeslána.");
      }
    } catch (err) {
      setTestPushStatus(`Chyba: ${(err as any)?.message || String(err)}`);
    }
  };

  const resetUserRequestForm = useCallback(() => {
    setUserRequestMessage("");
    setUserRequestCorporateEmail("");
    setUserRequestFullName("");
    setUserRequestManagerEmail("");
    setUserRequestPosition("poradce1");
    setUserRequestMode("standard");
    setUserRequestSubject("userCreation");
    setUserRequestPriority("normal");
    setEditingUserRequestId(null);
  }, []);

  const loadUserRequests = useCallback(async () => {
    if (!user) return;
    setUserRequestsLoading(true);
    setUserRequestsError(null);

    try {
      const payload = await fetchAuthedJsonOrThrow<UserRequestsApiResponse>(
        user,
        "/api/user-requests",
        { method: "GET" }
      );
      const requests = Array.isArray(payload.requests) ? payload.requests : [];
      setUserRequests(sortUserRequestsByActivity(requests));
    } catch (error) {
      setUserRequestsError(
        error instanceof Error
          ? error.message
          : "Nepodařilo se načíst podané žádosti."
      );
    } finally {
      setUserRequestsLoading(false);
    }
  }, [user]);

  const handleSubmitUserRequest = async () => {
    if (!user) {
      setUserRequestStatus({
        type: "error",
        message: "Nejsi přihlášený.",
      });
      return;
    }

    const requestedCorporateEmail = normalizeEmail(userRequestCorporateEmail);
    const requestedManagerEmail = normalizeEmail(userRequestManagerEmail);
    const requestedFullName = userRequestFullName.trim();
    const isEditingReturnedRequest = Boolean(editingUserRequestId);
    if (userRequestSubject === "userCreation") {
      if (!requestedCorporateEmail) {
        setUserRequestStatus({
          type: "error",
          message: "Pro založení uživatele vyplň firemní e-mail.",
        });
        return;
      }
      if (!isValidEmail(requestedCorporateEmail)) {
        setUserRequestStatus({
          type: "error",
          message: "Firemní e-mail nemá platný formát.",
        });
        return;
      }
      if (requestedCorporateEmail.length > USER_REQUEST_CORPORATE_EMAIL_MAX_LEN) {
        setUserRequestStatus({
          type: "error",
          message: `Firemní e-mail může mít maximálně ${USER_REQUEST_CORPORATE_EMAIL_MAX_LEN} znaků.`,
        });
        return;
      }
      if (!requestedFullName) {
        setUserRequestStatus({
          type: "error",
          message: "Pro založení uživatele vyplň jméno a příjmení.",
        });
        return;
      }
      if (requestedFullName.length > USER_REQUEST_FULL_NAME_MAX_LEN) {
        setUserRequestStatus({
          type: "error",
          message: `Jméno může mít maximálně ${USER_REQUEST_FULL_NAME_MAX_LEN} znaků.`,
        });
        return;
      }
      if (!requestedManagerEmail) {
        setUserRequestStatus({
          type: "error",
          message: "Pro založení uživatele vyplň e-mail přímého nadřízeného.",
        });
        return;
      }
      if (requestedManagerEmail.length > USER_REQUEST_MANAGER_EMAIL_MAX_LEN) {
        setUserRequestStatus({
          type: "error",
          message: `E-mail nadřízeného může mít maximálně ${USER_REQUEST_MANAGER_EMAIL_MAX_LEN} znaků.`,
        });
        return;
      }
      if (requestedManagerEmail && !isValidEmail(requestedManagerEmail)) {
        setUserRequestStatus({
          type: "error",
          message: "E-mail nadřízeného nemá platný formát.",
        });
        return;
      }
      if (requestedManagerEmail === requestedCorporateEmail) {
        setUserRequestStatus({
          type: "error",
          message: "Nadřízený nemůže být stejný jako nový uživatel.",
        });
        return;
      }
    }

    const message = userRequestMessage.trim();
    if (message.length < USER_REQUEST_MESSAGE_MIN_LEN) {
      setUserRequestStatus({
        type: "error",
        message: `Popis žádosti musí mít alespoň ${USER_REQUEST_MESSAGE_MIN_LEN} znaků.`,
      });
      return;
    }

    if (message.length > USER_REQUEST_MESSAGE_MAX_LEN) {
      setUserRequestStatus({
        type: "error",
        message: `Popis žádosti může mít maximálně ${USER_REQUEST_MESSAGE_MAX_LEN} znaků.`,
      });
      return;
    }

    setUserRequestSubmitting(true);
    setUserRequestStatus(null);

    try {
      const payload = await fetchAuthedJsonOrThrow<
        UserRequestCreateApiResponse | UserRequestUpdateApiResponse
      >(
        user,
        "/api/user-requests",
        {
          method: isEditingReturnedRequest ? "PUT" : "POST",
          body: JSON.stringify({
            id: editingUserRequestId,
            subject: userRequestSubject,
            requestedCorporateEmail:
              userRequestSubject === "userCreation" ? requestedCorporateEmail : null,
            requestedFullName:
              userRequestSubject === "userCreation" ? requestedFullName || null : null,
            requestedManagerEmail:
              userRequestSubject === "userCreation" ? requestedManagerEmail || null : null,
            requestedPosition:
              userRequestSubject === "userCreation" ? userRequestPosition : null,
            requestedCommissionMode:
              userRequestSubject === "userCreation" ? userRequestMode : null,
            message,
            priority: userRequestPriority,
          }),
        }
      );

      if (payload?.request) {
        const updatedRequest = payload.request;
        setUserRequests((prev) =>
          sortUserRequestsByActivity([
            updatedRequest,
            ...prev.filter((item) => item.id !== updatedRequest.id),
          ])
        );
      } else {
        await loadUserRequests();
      }

      resetUserRequestForm();
      setUserRequestStatus({
        type: "success",
        message: isEditingReturnedRequest
          ? "Žádost byla doplněna a znovu odeslána."
          : "Žádost byla odeslána.",
      });
    } catch (error) {
      setUserRequestStatus({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : isEditingReturnedRequest
              ? "Doplněnou žádost se nepodařilo odeslat."
              : "Žádost se nepodařilo odeslat.",
      });
    } finally {
      setUserRequestSubmitting(false);
    }
  };

  const handleStartEditUserRequest = (request: UserRequestPayload) => {
    if (request.status !== "needsInfo") return;
    setEditingUserRequestId(request.id);
    setUserRequestSubject(request.subject);
    setUserRequestCorporateEmail(request.requestedCorporateEmail ?? "");
    setUserRequestFullName(request.requestedUserDraft?.fullName ?? "");
    setUserRequestManagerEmail(request.requestedUserDraft?.managerEmail ?? "");
    setUserRequestPosition(request.requestedUserDraft?.position ?? "poradce1");
    setUserRequestMode(request.requestedUserDraft?.commissionMode ?? "standard");
    setUserRequestPriority(request.priority);
    setUserRequestMessage(request.message);
    setUserRequestStatus({
      type: "info",
      message: "Žádost je vrácená k doplnění. Uprav ji a odešli znovu.",
    });
  };

  const handleDeleteUserRequest = async (requestId: string) => {
    if (!user) {
      setUserRequestStatus({
        type: "error",
        message: "Nejsi přihlášený.",
      });
      return;
    }

    const targetRequest = userRequests.find((request) => request.id === requestId) ?? null;
    const cancellableByRequester =
      targetRequest?.status === "pending" || targetRequest?.status === "needsInfo";
    const confirmText = cancellableByRequester
      ? "Opravdu chceš tuto žádost stornovat?"
      : "Opravdu chceš tuto žádost smazat?";
    const confirmed = window.confirm(confirmText);
    if (!confirmed) return;

    setUserRequestDeletingId(requestId);
    setUserRequestStatus(null);
    setUserRequestsError(null);

    try {
      await fetchAuthedJsonOrThrow<UserRequestDeleteApiResponse>(
        user,
        "/api/user-requests",
        {
          method: "DELETE",
          body: JSON.stringify({ id: requestId }),
        }
      );
      setUserRequests((prev) => prev.filter((item) => item.id !== requestId));
      if (editingUserRequestId === requestId) {
        resetUserRequestForm();
      }
      setUserRequestStatus({
        type: "success",
        message: cancellableByRequester ? "Žádost byla stornována." : "Žádost byla smazána.",
      });
    } catch (error) {
      setUserRequestStatus({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Žádost se nepodařilo smazat.",
      });
    } finally {
      setUserRequestDeletingId(null);
    }
  };

  useEffect(() => {
    if (!user) {
      setUserRequests([]);
      setUserRequestsLoading(false);
      setUserRequestsError(null);
      setUserRequestStatus(null);
      resetUserRequestForm();
      setUserRequestDeletingId(null);
      return;
    }
    void loadUserRequests();
  }, [user, loadUserRequests, resetUserRequestForm]);

  const handleBoxThemeChange = async (nextTheme: BoxTheme) => {
    const resolved = applyBoxThemePreference(nextTheme);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(BOX_THEME_EVENT, {
          detail: { boxTheme: resolved },
        })
      );
    }
    await saveUserFields({ boxTheme: resolved });
  };

  const handleFontThemeChange = async (nextTheme: FontTheme) => {
    const resolved = applyFontThemePreference(nextTheme);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(FONT_THEME_EVENT, {
          detail: { fontTheme: resolved },
        })
      );
    }
    await saveUserFields({ fontTheme: resolved });
  };

  const handleReduceMotionChange = async (value: boolean) => {
    setReduceMotion(value);
    applyMotionPreference(value);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(SETTINGS_KEYS.reduceMotion, value ? "1" : "0");
    }

    await saveUserFields({ reduceMotion: value });
  };

  const handleChangePassword = async () => {
    if (!user || !user.email) {
      setPasswordStatus({
        type: "error",
        message: "Uživatel není přihlášen.",
      });
      return;
    }

    if (!currentPassword || !newPassword) {
      setPasswordStatus({
        type: "error",
        message: "Vyplň původní i nové heslo.",
      });
      return;
    }

    if (newPassword.length < 6) {
      setPasswordStatus({
        type: "error",
        message: "Nové heslo musí mít alespoň 6 znaků.",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordStatus({
        type: "error",
        message: "Nové heslo a potvrzení se neshodují.",
      });
      return;
    }

    try {
      setChangingPassword(true);
      setPasswordStatus(null);

      const credential = EmailAuthProvider.credential(
        user.email,
        currentPassword
      );

      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);

      setPasswordStatus({
        type: "success",
        message: "Heslo bylo úspěšně změněno.",
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: unknown) {
      const err = error as { code?: string };
      let message = "Změna hesla se nepovedla. Zkus to prosím znovu.";
      if (err?.code === "auth/wrong-password") {
        message = "Původní heslo není správné.";
      } else if (err?.code === "auth/weak-password") {
        message = "Nové heslo je příliš slabé (min. 6 znaků).";
      } else if (err?.code === "auth/too-many-requests") {
        message = "Příliš mnoho pokusů. Zkus to prosím později.";
      }
      setPasswordStatus({ type: "error", message });
    } finally {
      setChangingPassword(false);
    }
  };

  const reauthenticateForMfaChange = async (
    targetUser: FirebaseUser | null
  ): Promise<boolean> => {
    if (!targetUser || !targetUser.email) {
      setMfaStatus({ type: "error", message: "Uživatel není přihlášen." });
      return false;
    }

    if (!mfaPassword.trim()) {
      setMfaStatus({
        type: "error",
        message: "Zadej aktuální heslo pro potvrzení změny 2FA.",
      });
      return false;
    }

    const credential = EmailAuthProvider.credential(
      targetUser.email.trim(),
      mfaPassword
    );
    try {
      await reauthenticateWithCredential(targetUser, credential);
      return true;
    } catch (error) {
      const authError = error as { code?: string };
      if (authError?.code === "auth/multi-factor-auth-required") {
        const otp = mfaReauthCode.trim();
        if (!otp) {
          setMfaStatus({
            type: "error",
            message:
              "Pro potvrzení změny 2FA zadej i aktuální kód z Microsoft Authenticator.",
          });
          return false;
        }

        try {
          const resolver = getMultiFactorResolver(auth, error as MultiFactorError);
          const totpHint = resolver.hints.find(
            (hint) => hint.factorId === FactorId.TOTP
          );

          if (!totpHint) {
            setMfaStatus({
              type: "error",
              message:
                "Účet vyžaduje 2FA, ale nebyl nalezen TOTP faktor. Zkus to znovu po přihlášení.",
            });
            return false;
          }

          const assertion = TotpMultiFactorGenerator.assertionForSignIn(
            totpHint.uid,
            otp
          );
          await resolver.resolveSignIn(assertion);
          return true;
        } catch (resolverError) {
          logMfaIssue("reauthenticateForMfaChangeResolver", resolverError);
          setMfaStatus({
            type: "error",
            message: resolveMfaErrorMessage(
              resolverError,
              "Nepodařilo se ověřit 2FA kód pro potvrzení změny."
            ),
          });
          return false;
        }
      }

      logMfaIssue("reauthenticateForMfaChange", error);
      setMfaStatus({
        type: "error",
        message: resolveMfaErrorMessage(
          error,
          "Nepodařilo se ověřit aktuální heslo pro změnu 2FA."
        ),
      });
      return false;
    }
  };

  const handleStartMfaEnrollment = async () => {
    if (!user) return;

    setMfaBusy(true);
    setMfaStatus(null);

    try {
      await user.reload();
      const activeUser = auth.currentUser ?? user;
      setUser(activeUser);

      const reauthenticated = await reauthenticateForMfaChange(activeUser);
      if (!reauthenticated) return;

      const session = await multiFactor(activeUser).getSession();
      const secret = await TotpMultiFactorGenerator.generateSecret(session);

      setMfaEnrollmentSecret(secret);
      setMfaEnrollmentCode("");
      setMfaStatus({
        type: "info",
        message:
          "Otevři Microsoft Authenticator, přidej účet pomocí setup key a zadej ověřovací kód.",
      });
    } catch (error) {
      logMfaIssue("handleStartMfaEnrollment", error);
      setMfaStatus({
        type: "error",
        message: resolveMfaErrorMessage(
          error,
          "Nepodařilo se spustit nastavení 2FA."
        ),
      });
    } finally {
      setMfaBusy(false);
    }
  };

  const handleConfirmMfaEnrollment = async () => {
    if (!user || !mfaEnrollmentSecret) return;

    const otp = mfaEnrollmentCode.trim();
    if (!otp) {
      setMfaStatus({
        type: "error",
        message: "Zadej jednorázový kód z aplikace Microsoft Authenticator.",
      });
      return;
    }

    setMfaBusy(true);
    setMfaStatus(null);

    try {
      const assertion = TotpMultiFactorGenerator.assertionForEnrollment(
        mfaEnrollmentSecret,
        otp
      );
      await multiFactor(user).enroll(assertion, "Microsoft Authenticator");
      await syncMfaState(user);

      setMfaPassword("");
      setMfaReauthCode("");
      clearMfaDraft();
      setMfaStatus({
        type: "success",
        message: "2FA bylo úspěšně zapnuto.",
      });
    } catch (error) {
      logMfaIssue("handleConfirmMfaEnrollment", error);
      setMfaStatus({
        type: "error",
        message: resolveMfaErrorMessage(
          error,
          "2FA se nepodařilo dokončit. Zkus to prosím znovu."
        ),
      });
    } finally {
      setMfaBusy(false);
    }
  };

  const handleDisableMfa = async () => {
    if (!user) return;
    if (!mfaTotpUid) {
      setMfaStatus({
        type: "error",
        message: "Aktivní TOTP faktor nebyl nalezen.",
      });
      return;
    }

    setMfaBusy(true);
    setMfaStatus(null);

    try {
      const reauthenticated = await reauthenticateForMfaChange(user);
      if (!reauthenticated) return;

      await multiFactor(user).unenroll(mfaTotpUid);
      await syncMfaState(user);

      setMfaPassword("");
      setMfaReauthCode("");
      clearMfaDraft();
      setMfaStatus({
        type: "success",
        message: "2FA bylo vypnuto.",
      });
    } catch (error) {
      logMfaIssue("handleDisableMfa", error);
      setMfaStatus({
        type: "error",
        message: resolveMfaErrorMessage(
          error,
          "2FA se nepodařilo vypnout. Zkus to prosím znovu."
        ),
      });
    } finally {
      setMfaBusy(false);
    }
  };

  if (!user) {
    // redirect už běží, tady jen nic nerenderujeme
    return null;
  }

  const userEmail = user.email ?? "Neznámý e-mail";
  const normalizedUserEmail = normalizeEmail(user.email);
  const mfaIssuer = "Bohemka.App";
  const mfaAccountName = normalizedUserEmail || userEmail;
  const mfaQrCodeUri = mfaEnrollmentSecret
    ? mfaEnrollmentSecret.generateQrCodeUrl(mfaAccountName, mfaIssuer)
    : "";
  const positionDisplay = POSITIONS.find((p) => p.id === position)?.label ?? position;
  const modeDisplay = COMMISSION_MODES.find((m) => m.id === mode)?.label ?? mode;
  const enabledNotificationTypes = Object.values(notificationSettings.types).filter(Boolean).length;
  const panelClass =
    "relative overflow-hidden rounded-2xl border border-slate-300 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_62%,#eef2f7_100%)] px-6 py-5 shadow-[0_18px_46px_rgba(15,23,42,0.08)] sm:px-8 sm:py-6";
  const compactPanelClass =
    "relative overflow-hidden rounded-2xl border border-slate-300 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_62%,#eef2f7_100%)] px-4 py-4 shadow-[0_18px_46px_rgba(15,23,42,0.08)] sm:px-6 sm:py-5";
  const fieldClass =
    "w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-[0_8px_18px_rgba(15,23,42,0.04)] outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10";
  const toggleOffClass =
    "border-slate-300 bg-white text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.04)] hover:bg-slate-50";
  const notificationCardClass =
    "relative overflow-hidden rounded-[22px] border border-slate-200/90 bg-[linear-gradient(145deg,rgba(255,255,255,0.97)_0%,rgba(248,250,252,0.95)_58%,rgba(241,245,255,0.93)_100%)] p-4 shadow-[0_14px_34px_rgba(15,23,42,0.07)]";
  const notificationToggleOnClass =
    "border-emerald-500 bg-[linear-gradient(135deg,#34d399_0%,#059669_100%)] shadow-[0_8px_20px_rgba(16,185,129,0.3)]";
  const notificationToggleOffClass =
    "border-slate-300 bg-slate-100";
  const requestMessageLength = userRequestMessage.trim().length;
  const requestNeedsCorporateEmail = userRequestSubject === "userCreation";
  const normalizedRequestCorporateEmail = normalizeEmail(userRequestCorporateEmail);
  const normalizedRequestManagerEmail = normalizeEmail(userRequestManagerEmail);
  const requestFullNameLength = userRequestFullName.trim().length;
  const requestCorporateEmailValid =
    !requestNeedsCorporateEmail ||
    (normalizedRequestCorporateEmail.length > 0 &&
      normalizedRequestCorporateEmail.length <= USER_REQUEST_CORPORATE_EMAIL_MAX_LEN &&
      isValidEmail(normalizedRequestCorporateEmail));
  const requestManagerEmailValid =
    !requestNeedsCorporateEmail ||
    (normalizedRequestManagerEmail.length <= USER_REQUEST_MANAGER_EMAIL_MAX_LEN &&
      normalizedRequestManagerEmail.length > 0 &&
      isValidEmail(normalizedRequestManagerEmail) &&
      normalizedRequestManagerEmail !== normalizedRequestCorporateEmail);
  const requestFullNameValid =
    !requestNeedsCorporateEmail ||
    (requestFullNameLength > 0 && requestFullNameLength <= USER_REQUEST_FULL_NAME_MAX_LEN);
  const canSubmitUserRequest =
    requestMessageLength >= USER_REQUEST_MESSAGE_MIN_LEN &&
    requestMessageLength <= USER_REQUEST_MESSAGE_MAX_LEN &&
    requestCorporateEmailValid &&
    requestManagerEmailValid &&
    requestFullNameValid;
  const onlineCardSlugNormalized = resolveOnlineCardAutoSlug({
    fullName: onlineCardDraft.fullName,
    email: onlineCardDraft.email,
    fallbackEmail: user?.email ?? "",
  });
  const onlineCardSlugValid = onlineCardSlugNormalized.length >= ONLINE_CARD_SLUG_MIN_LEN;
  const onlineCardHasName = onlineCardDraft.fullName.trim().length > 0;
  const onlineCardPublicPath = onlineCardSlugValid && onlineCardHasName
    ? `/vizitka/${onlineCardSlugNormalized}`
    : "";
  const onlineCardPublicUrl = onlineCardPublicPath
    ? `${ONLINE_CARD_PUBLIC_BASE_URL}${onlineCardPublicPath}`
    : "";
  const onlineCardPublishReady =
    !onlineCardDraft.enabled ||
    (onlineCardSlugValid && onlineCardDraft.fullName.trim().length > 0);
  const onlineCardOfficePhotoCount = onlineCardDraft.officePhotos.length;
  const activeOnlineCardOfficePhoto = onlineCardDraft.officePhotos[onlineCardOfficePhotoIndex] ?? "";
  const onlineCardOfficeUploadBlocked =
    onlineCardOfficeUploading || onlineCardOfficePhotoCount >= ONLINE_CARD_OFFICE_PHOTOS_MAX;
  const handlePreviewMeetingCta = () => {
    if (typeof window === "undefined") return;
    if (onlineCardPublicUrl) {
      window.open(onlineCardPublicUrl, "_blank", "noopener,noreferrer");
      return;
    }
    setOnlineCardStatus({
      type: "info",
      message: "Nejdřív vyplň jméno pro vygenerování veřejné URL.",
    });
  };
  const handleOpenOnlineCardQr = () => {
    if (!onlineCardPublicUrl) {
      setOnlineCardStatus({
        type: "info",
        message: "Nejdřív vyplň jméno pro vygenerování veřejné URL.",
      });
      return;
    }

    setOnlineCardQrOpen(true);
    setOnlineCardQrLoading(true);
    setOnlineCardQrError(null);
    setOnlineCardQrDataUrl("");

    void QRCode.toDataURL(onlineCardPublicUrl, {
      width: 900,
      margin: 2,
      errorCorrectionLevel: "M",
      color: {
        dark: "#0f172a",
        light: "#ffffff",
      },
    })
      .then((dataUrl) => {
        setOnlineCardQrDataUrl(dataUrl);
      })
      .catch((error) => {
        console.error("Chyba při generování QR kódu pro vizitku:", error);
        setOnlineCardQrError("QR kód se nepodařilo vygenerovat.");
      })
      .finally(() => {
        setOnlineCardQrLoading(false);
      });
  };
  const handleDownloadOnlineCardQr = () => {
    if (!onlineCardQrDataUrl || typeof document === "undefined") return;
    const link = document.createElement("a");
    link.href = onlineCardQrDataUrl;
    link.download = `vizitka-${onlineCardSlugNormalized || "profil"}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  const onlineCardStudioOfficeSection = (
    <section className="relative overflow-hidden rounded-[30px] border border-violet-400/18 bg-[linear-gradient(160deg,rgba(14,11,29,0.96)_0%,rgba(8,8,20,0.98)_100%)] p-6 shadow-[0_24px_70px_rgba(6,4,23,0.48)] sm:p-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(139,92,246,0.2),transparent_34%)]" />
      <div className="relative z-10 space-y-4">
        <div className="text-center">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-violet-300/35 bg-white/[0.05] px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-100">
            <Building2 className="h-3.5 w-3.5" />
            Kancelář
          </p>
        </div>

        <div className="space-y-2">
          <div className="rounded-xl border border-dashed border-violet-300/45 bg-white/[0.03] px-3 py-2 transition-colors hover:border-violet-200/65 focus-within:border-violet-200/80 focus-within:bg-white/[0.05]">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-200/78">
              Název nebo adresa kanceláře
            </p>
            <input
              type="text"
              value={onlineCardDraft.officeLabel}
              onChange={(event) =>
                updateOnlineCardDraft({
                  officeLabel: event.target.value.slice(0, ONLINE_CARD_OFFICE_MAX_LEN),
                })
              }
              placeholder="Např. Bohemika Praha 4, Budějovická 123"
              maxLength={ONLINE_CARD_OFFICE_MAX_LEN}
              className="mt-1 w-full bg-transparent text-base font-semibold !text-white/92 placeholder:!text-white/40 outline-none"
            />
          </div>
          <p className="text-[11px] text-violet-100/65">
            {onlineCardDraft.officeLabel.length}/{ONLINE_CARD_OFFICE_MAX_LEN} znaků
          </p>
        </div>

        <div className="space-y-2 rounded-2xl border border-white/14 bg-white/[0.03] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-200/78">
              Fotky kanceláře
            </p>
            <span className="text-[11px] text-violet-100/70">
              {onlineCardOfficePhotoCount}/{ONLINE_CARD_OFFICE_PHOTOS_MAX}
            </span>
          </div>

          <label
            className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              onlineCardOfficeUploadBlocked
                ? "cursor-not-allowed border-white/20 bg-white/10 text-violet-100/60"
                : "border-violet-300/35 bg-white/[0.06] text-white hover:bg-white/[0.12]"
            }`}
          >
            <Upload className="h-3.5 w-3.5" />
            {onlineCardOfficeUploading ? "Nahrávám..." : "Nahrát fotku"}
            <input
              type="file"
              className="hidden"
              accept="image/jpeg,image/png,image/webp"
              disabled={onlineCardOfficeUploadBlocked}
              onChange={(event) => void uploadOnlineCardOfficePhoto(event)}
            />
          </label>

          {activeOnlineCardOfficePhoto ? (
            <div className="space-y-3">
              <div className="relative overflow-hidden rounded-2xl border border-white/14 bg-white/[0.04]">
                <img
                  src={activeOnlineCardOfficePhoto}
                  alt={`Náhled kanceláře ${onlineCardOfficePhotoIndex + 1}`}
                  className="h-[210px] w-full object-cover sm:h-[280px]"
                />
                {onlineCardOfficePhotoCount > 1 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => shiftOnlineCardOfficePhoto(-1)}
                      className="absolute left-3 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-slate-950/45 text-white transition hover:bg-slate-950/65"
                      aria-label="Předchozí fotka kanceláře"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => shiftOnlineCardOfficePhoto(1)}
                      className="absolute right-3 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-slate-950/45 text-white transition hover:bg-slate-950/65"
                      aria-label="Další fotka kanceláře"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {onlineCardDraft.officePhotos.map((photoUrl, index) => (
                  <div key={photoUrl} className="relative">
                    <button
                      type="button"
                      onClick={() => setOnlineCardOfficePhotoIndex(index)}
                      className={`overflow-hidden rounded-xl border transition ${
                        index === onlineCardOfficePhotoIndex
                          ? "border-violet-200 shadow-[0_0_0_1px_rgba(196,181,253,0.7)]"
                          : "border-white/18"
                      }`}
                      aria-label={`Zobrazit fotku kanceláře ${index + 1}`}
                    >
                      <img
                        src={photoUrl}
                        alt={`Miniatura kanceláře ${index + 1}`}
                        className="h-14 w-20 object-cover"
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeOnlineCardOfficePhoto(index)}
                      className="absolute -right-2 -top-2 inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/40 bg-slate-950/75 text-white transition hover:bg-slate-900"
                      aria-label={`Smazat fotku kanceláře ${index + 1}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-violet-100/70">
              Nahraj až {ONLINE_CARD_OFFICE_PHOTOS_MAX} fotky. Na veřejné vizitce se budou přepínat
              šipkami.
            </p>
          )}
        </div>
      </div>
    </section>
  );
  const onlineCardStudioContactSection = (
    <section className="relative overflow-hidden rounded-[30px] border border-violet-400/18 bg-[linear-gradient(160deg,rgba(14,11,29,0.96)_0%,rgba(8,8,20,0.98)_100%)] p-6 shadow-[0_24px_70px_rgba(6,4,23,0.48)] sm:p-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(139,92,246,0.2),transparent_34%)]" />
      <div className="relative z-10 space-y-5">
        <div className="text-center">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-violet-300/35 bg-white/[0.05] px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-100">
            <Mail className="h-3.5 w-3.5" />
            Kontakt
          </p>
        </div>

        <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
          {[
            {
              key: "phone",
              label: "Telefon",
              icon: PhoneCall,
              value: onlineCardDraft.phone,
              placeholder: "+420 777 000 111",
              maxLength: 80,
              inputMode: "tel" as const,
              onChange: (next: string) => updateOnlineCardDraft({ phone: next.slice(0, 80) }),
            },
            {
              key: "email",
              label: "E-mail",
              icon: Mail,
              value: onlineCardDraft.email,
              placeholder: "jmeno@bohemika.eu",
              maxLength: 160,
              inputMode: "email" as const,
              onChange: (next: string) => updateOnlineCardDraft({ email: next.slice(0, 160) }),
            },
            {
              key: "web",
              label: "Web",
              icon: Globe2,
              value: onlineCardDraft.website,
              placeholder: "https://...",
              maxLength: ONLINE_CARD_WEBSITE_MAX_LEN,
              inputMode: "url" as const,
              onChange: (next: string) => updateOnlineCardDraft({ website: next.slice(0, ONLINE_CARD_WEBSITE_MAX_LEN) }),
            },
            {
              key: "ico",
              label: "IČO",
              icon: Building2,
              value: onlineCardDraft.ico,
              placeholder: "12345678",
              maxLength: ONLINE_CARD_ICO_MAX_LEN,
              inputMode: "numeric" as const,
              onChange: (next: string) => updateOnlineCardDraft({ ico: next.replace(/\D+/g, "").slice(0, ONLINE_CARD_ICO_MAX_LEN) }),
            },
            {
              key: "location",
              label: "Lokalita",
              icon: MapPin,
              value: onlineCardDraft.location,
              placeholder: "Město",
              maxLength: 120,
              inputMode: "text" as const,
              onChange: (next: string) => updateOnlineCardDraft({ location: next.slice(0, 120) }),
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.key} className="group space-y-2">
                <div className="inline-flex items-center gap-2.5 text-violet-200/75">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/14 bg-white/[0.07] text-violet-100 transition-colors group-hover:border-violet-300/60 group-hover:text-white">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-200/75">
                    {item.label}
                  </span>
                </div>

                <div className="pl-[42px]">
                  <div className="rounded-xl border border-dashed border-violet-300/45 bg-white/[0.03] px-3 py-2 transition-colors hover:border-violet-200/65 focus-within:border-violet-200/80 focus-within:bg-white/[0.05]">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-200/78">
                      Kontakt
                    </p>
                    <input
                      type="text"
                      value={item.value}
                      onChange={(event) => item.onChange(event.target.value)}
                      placeholder={item.placeholder}
                      maxLength={item.maxLength}
                      inputMode={item.inputMode}
                      className="mt-1 w-full bg-transparent text-[18px] font-semibold leading-tight !text-white/92 placeholder:!text-white/40 outline-none sm:text-[22px]"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );

  return (
    <AppLayout active="settings">
      <div className="w-full bg-white px-3 py-6 sm:px-4 sm:py-8 lg:px-8">
        <div className="mx-auto w-full max-w-6xl space-y-6 px-1 py-1 font-mono text-slate-900 sm:px-2 sm:py-2">
        {timelineSaveFlashVisible && (
          <div aria-live="polite" className="fixed bottom-6 right-6 z-50 pointer-events-none">
            <div className="relative flex items-center gap-3 rounded-2xl border border-slate-300 bg-white px-4 py-3 shadow-[0_20px_60px_rgba(15,23,42,0.18)]">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-white">
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
                  <path
                    fill="currentColor"
                    d="M9.5 15.6 6.4 12.5a1 1 0 0 0-1.4 1.4l3.8 3.8a1 1 0 0 0 1.45-.05l8-9a1 1 0 1 0-1.5-1.3l-7.25 8.2Z"
                  />
                </svg>
              </div>
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-slate-900">Uloženo!</p>
                <p className="text-[11px] text-slate-600">Historie kariéry byla uložena.</p>
              </div>
            </div>
          </div>
        )}
        {/* HEADER */}
        <header className="mb-2">
          <SplitTitle text="Nastavení" className="font-mono !text-slate-900" />
        </header>

        {loadingMeta ? (
          <div className="rounded-[24px] border border-slate-200 bg-white px-6 py-5 text-sm text-slate-700 shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
            Načítám nastavení…
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <span className="inline-flex min-h-[58px] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                <UserRound size={13} strokeWidth={2} className="text-slate-600" aria-hidden="true" />
                Pozice: {positionDisplay}
              </span>
              <span className="inline-flex min-h-[58px] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                <Calculator size={13} strokeWidth={2} className="text-slate-600" aria-hidden="true" />
                Režim: {modeDisplay}
              </span>
              <span
                className={`inline-flex min-h-[58px] items-center gap-3 rounded-2xl border px-4 py-3 text-xs font-semibold shadow-[0_10px_24px_rgba(15,23,42,0.05)] ${
                  tipsterMode ? "border-slate-900 bg-slate-900 text-white" : toggleOffClass
                }`}
              >
                <Sparkles size={13} strokeWidth={2} aria-hidden="true" />
                Tipař: {tipsterMode ? "ON" : "OFF"}
              </span>
              <span className="inline-flex min-h-[58px] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                <BellRing size={13} strokeWidth={2} className="text-slate-600" aria-hidden="true" />
                Notifikace: {enabledNotificationTypes}/4
              </span>
            </div>

            {timelineSetupRequired ? (
              <div className="rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                Před prvním použitím aplikace nejdřív nastav a ulož Historii kariéry. Ostatní
                části Nastavení se zpřístupní po uložení timeline.
              </div>
            ) : null}

            <div className="flex w-fit max-w-full flex-wrap gap-1 overflow-x-auto rounded-full border border-slate-900 bg-slate-950 p-1 shadow-[0_16px_34px_rgba(15,23,42,0.16)]">
              {SETTINGS_TABS.map((tab) => {
                const active = activeTab === tab.id;
                const tabDisabled = timelineSetupRequired && tab.id !== "career";
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      if (tabDisabled) return;
                      setActiveTab(tab.id);
                    }}
                    disabled={tabDisabled}
                    className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${
                      active
                        ? "bg-white text-slate-950"
                        : tabDisabled
                          ? "cursor-not-allowed text-white/45"
                          : "text-white hover:bg-white/10"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="grid gap-4 lg:grid-cols-2 lg:items-stretch">
              {activeTab === "career" && !timelineSetupRequired && (
              <section className={`h-full space-y-4 lg:col-span-2 ${panelClass}`}>
                <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#0f172a_0%,#64748b_48%,#cbd5e1_100%)]" />
                <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">
                  <Calculator size={14} strokeWidth={2} className="text-slate-600" aria-hidden="true" />
                  <span>Výchozí kalkulačka</span>
                </h2>

                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Výchozí režim provizí
                    </label>
                    <div
                      className="inline-flex w-full max-w-md rounded-2xl border border-slate-300 bg-slate-100 p-1"
                      role="radiogroup"
                      aria-label="Výchozí režim provizí"
                    >
                      {COMMISSION_MODES.map((m) => {
                        const active = mode === m.id;
                        const isAccelerated = m.id === "accelerated";
                        const isStandard = m.id === "standard";

                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => void handleModeChange(m.id)}
                            className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                              active
                                ? "border border-slate-900 bg-white text-slate-900 shadow-[0_4px_12px_rgba(15,23,42,0.1)]"
                                : "border border-transparent text-slate-600 hover:text-slate-900"
                            }`}
                            role="radio"
                            aria-checked={active}
                          >
                            {isAccelerated && (
                              <Zap
                                size={14}
                                strokeWidth={2.2}
                                className={active ? "text-amber-500" : "text-amber-600"}
                                aria-hidden="true"
                              />
                            )}
                            {isStandard && (
                              <Snail
                                size={14}
                                strokeWidth={2.2}
                                className={active ? "text-slate-600" : "text-slate-500"}
                                aria-hidden="true"
                              />
                            )}
                            {m.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-slate-500">
                      Zrychlený / běžný režim se používá u životního pojištění.
                    </p>
                  </div>
                </div>

                <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-slate-900">
                      Režim tipařské spolupráce
                    </span>
                    <button
                      type="button"
                      onClick={() => handleTipsterModeChange(!tipsterMode)}
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                        tipsterMode
                          ? "border-slate-900 bg-slate-900 text-white"
                          : toggleOffClass
                      }`}
                      aria-pressed={tipsterMode}
                    >
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          tipsterMode ? "bg-white" : "bg-slate-400"
                        }`}
                        aria-hidden="true"
                      />
                      {tipsterMode ? "ON" : "OFF"}
                    </button>
                  </div>
                </div>
              </section>
              )}

              {activeTab === "career" && (
              <section
                id="timeline-kariery"
                className="relative h-full space-y-4 overflow-hidden scroll-mt-24 rounded-2xl border border-slate-300 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_62%,#eef2f7_100%)] px-5 py-5 shadow-[0_18px_46px_rgba(15,23,42,0.08)] sm:px-6 sm:py-6 lg:col-span-2"
              >
                <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#0f172a_0%,#64748b_48%,#cbd5e1_100%)]" />
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">
                      <Sparkles size={14} strokeWidth={2} className="text-slate-600" aria-hidden="true" />
                      <span>Historie Kariéry</span>
                    </h2>
                    <p className="text-xs text-slate-500">
                      Nastav období od-do. Kalkulačka pak sama předvyplní pozici podle data sjednání.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowCareerTimelineHelp(true)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                    >
                      <CircleHelp size={13} strokeWidth={2.2} aria-hidden="true" />
                      Nápověda
                    </button>
                    {positionTimelineLocked ? (
                      <button
                        type="button"
                        onClick={unlockPositionTimeline}
                        className="rounded-full border border-slate-900 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 transition hover:bg-slate-100"
                      >
                        Změna
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={addPositionTimelineRow}
                        className="rounded-full border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-black"
                      >
                        Přidat pozici
                      </button>
                    )}
                  </div>
                </div>

                {showCareerTimelineHelp && (
                  <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 px-4"
                    onClick={() => setShowCareerTimelineHelp(false)}
                  >
                    <div
                      className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-[0_20px_50px_rgba(15,23,42,0.3)] sm:px-6"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold uppercase tracking-[0.16em] text-slate-900">
                          <CircleHelp size={14} strokeWidth={2.2} className="text-slate-600" />
                          Nápověda
                        </h3>
                        <button
                          type="button"
                          onClick={() => setShowCareerTimelineHelp(false)}
                          className="rounded-full border border-slate-300 p-1.5 text-slate-600 transition hover:bg-slate-100"
                          aria-label="Zavřít nápovědu"
                        >
                          <X size={14} strokeWidth={2.4} />
                        </button>
                      </div>

                      <p className="text-sm leading-relaxed text-slate-700">
                        Zadej historii své kariéry, najdeš ji v Maxxu pod odkazem{" "}
                        <a
                          href="https://sjednatel.bohemiaservis.cz/broker-card"
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-1 font-semibold text-slate-900 underline underline-offset-2"
                        >
                          https://sjednatel.bohemiaservis.cz/broker-card
                          <ExternalLink size={13} strokeWidth={2.2} aria-hidden="true" />
                        </a>
                        . Záložka kariéra.
                      </p>
                    </div>
                  </div>
                )}

                {positionTimelineDraft.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-5 text-sm text-slate-500">
                    Historii kariéry zatím nemáš nastavenou. Najdeš ji v Maxxu pod odkazem{" "}
                    <a
                      href="https://sjednatel.bohemiaservis.cz/broker-card"
                      target="_blank"
                      rel="noreferrer noopener"
                      className="font-semibold text-slate-900 underline underline-offset-2"
                    >
                      https://sjednatel.bohemiaservis.cz/broker-card
                    </a>
                    . Záložka kariéra. Přidej stupně kliknutím na tlačítko Přidat pozici, přidávej od
                    nejstarší po aktuální tak jako v Maxxu.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                          {positionTimelineDraft.map((row, rowIndex) => {
                            const rowRangeError = hasInvalidRangeOrder(
                              row.validFrom.trim(),
                              row.validTo.trim()
                            );
                            const isLastDraftRow =
                              rowIndex === positionTimelineDraft.length - 1;
                            const rowOpenEndedNotLast =
                              !row.validTo.trim() && !isLastDraftRow;
                            return (
                            <div
                              key={row.id}
                              className={`rounded-2xl border bg-white px-3 py-3 shadow-[0_6px_16px_rgba(15,23,42,0.05)] ${
                                rowRangeError || rowOpenEndedNotLast
                                  ? "border-rose-300"
                                  : "border-slate-300"
                              }`}
                            >
                              <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_150px_150px_auto]">
                          <select
                            value={row.position}
                            onChange={(e) =>
                              updatePositionTimelineRow(row.id, {
                                position: e.target.value as Position,
                              })
                            }
                            disabled={positionTimelineLocked}
                            className={`${fieldClass} ${
                              positionTimelineLocked
                                ? "cursor-not-allowed bg-slate-100 text-slate-500"
                                : ""
                            }`}
                          >
                            {POSITIONS.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.label}
                              </option>
                            ))}
                          </select>
                          <input
                            type="date"
                            value={row.validFrom}
                            onChange={(e) =>
                              updatePositionTimelineRow(row.id, { validFrom: e.target.value })
                            }
                            disabled={positionTimelineLocked}
                            className={`${fieldClass} ${
                              positionTimelineLocked
                                ? "cursor-not-allowed bg-slate-100 text-slate-500"
                                : ""
                            }`}
                            title="Platí od"
                          />
                          <input
                            type="date"
                            value={row.validTo}
                            onChange={(e) =>
                              updatePositionTimelineRow(row.id, { validTo: e.target.value })
                            }
                            disabled={positionTimelineLocked}
                            className={`${fieldClass} ${
                              positionTimelineLocked
                                ? "cursor-not-allowed bg-slate-100 text-slate-500"
                                : ""
                            }`}
                            title="Platí do"
                          />
                          <button
                            type="button"
                            onClick={() => removePositionTimelineRow(row.id)}
                            disabled={positionTimelineLocked}
                            className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                          >
                            Smazat
                              </button>
                              </div>
                              {rowRangeError && (
                                <p className="mt-2 text-xs font-medium text-rose-700">
                                  Datum DO nemůže být dřív než datum OD.
                                </p>
                              )}
                              {rowOpenEndedNotLast && (
                                <p className="mt-2 text-xs font-medium text-rose-700">
                                  Současnost (prázdné DO) může být jen u posledního řádku.
                                </p>
                              )}
                              {isLastDraftRow &&
                                (!row.validTo.trim() || !positionTimelineLocked) && (
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  {row.validTo.trim() ? (
                                    positionTimelineLocked ? null : (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updatePositionTimelineRow(row.id, { validTo: "" })
                                      }
                                      className="rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-200"
                                    >
                                      Nastavit DO: současnost
                                    </button>
                                    )
                                  ) : (
                                    <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                                      Poslední pozice běží do současnosti
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          )})}
                        </div>
                      )}

                {positionTimelineError ? (
                  <p className="text-xs font-medium text-rose-700">{positionTimelineError}</p>
                ) : null}

                <div className="flex flex-wrap items-center justify-end gap-2">
                  {positionTimelineSaved ? (
                    <span className="text-xs font-semibold text-emerald-700">Uloženo</span>
                  ) : null}
                  {positionTimelineLocked ? (
                    <button
                      type="button"
                      onClick={unlockPositionTimeline}
                      className="rounded-xl border border-slate-900 bg-white px-3 py-2 text-xs font-semibold text-slate-900 transition hover:bg-slate-100"
                    >
                      Změna
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void savePositionTimeline()}
                      disabled={positionTimelineSaving}
                      className="rounded-xl border border-emerald-700 bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {positionTimelineSaving ? "Ukládám..." : "Uložit timeline"}
                    </button>
                  )}
                </div>
              </section>
              )}

              {activeTab === "notifications" && !timelineSetupRequired && (
              <section className={`h-full space-y-4 lg:col-span-2 ${panelClass}`}>
                <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#06b6d4_0%,#3b82f6_45%,#6366f1_100%)]" />
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_90%_9%,rgba(56,189,248,0.13),transparent_32%)]" />
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_7%_95%,rgba(99,102,241,0.1),transparent_34%)]" />

                <div className="relative z-10 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">
                      <BellRing size={14} strokeWidth={2} className="text-slate-600" aria-hidden="true" />
                      <span>Notifikace</span>
                    </h2>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.05)]">
                        Aktivní typy: {enabledNotificationTypes}/6
                      </span>
                      <span
                        className={`rounded-full px-3 py-1 text-[11px] font-semibold border shadow-[0_8px_18px_rgba(15,23,42,0.08)] ${
                          fcmActive
                            ? "border-emerald-700 bg-emerald-600 text-[#f8fafc]"
                            : "border-rose-700 bg-rose-600 text-[#f8fafc]"
                        }`}
                      >
                        {fcmActive ? "Push aktivní" : "Push neaktivní"}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
                    <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(165deg,rgba(255,255,255,0.96)_0%,rgba(241,245,249,0.96)_100%)] p-4 shadow-[0_18px_38px_rgba(15,23,42,0.09)]">
                      <div className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                        Přehled
                      </div>
                      <h3 className="mt-2 text-xl font-bold tracking-[-0.015em] text-slate-900">
                        Push notifikace
                      </h3>
                      <p className="mt-1 text-sm text-slate-600">
                        Správa oprávnění zařízení, typů notifikací a testovací zprávy.
                      </p>

                      <div className="mt-3 space-y-3">
                        {!pushSupported ? (
                          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                            Tento prohlížeč nepodporuje web push notifikace.
                          </div>
                        ) : (
                          <div className={`${notificationCardClass} space-y-3 ring-1 ring-emerald-200/80`}>
                            <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#10b981_0%,#22c55e_100%)]" />
                            <BellRing
                              className="pointer-events-none absolute -right-3 bottom-[-12px] h-20 w-20 text-slate-300/30"
                              strokeWidth={1.7}
                              aria-hidden="true"
                            />
                            <div className="relative space-y-1">
                              <div className="text-xs uppercase tracking-wide text-slate-500">Zařízení & oprávnění</div>
                              <p className="text-sm text-slate-700">
                                Oprávnění prohlížeče:{" "}
                                <span className="font-semibold text-slate-900">
                                  {pushPermission === "granted"
                                    ? "povoleno"
                                    : pushPermission === "denied"
                                      ? "zamítnuto"
                                      : pushPermission === "default"
                                        ? "nepotvrzeno"
                                        : "nepodporováno"}
                                </span>
                              </p>
                            </div>
                            <div className="relative grid gap-2 sm:grid-cols-2">
                              <button
                                type="button"
                                onClick={() => void handleEnableBrowserPush()}
                                disabled={pushBusy}
                                className="rounded-xl border border-emerald-700 bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-[#f8fafc] shadow-[0_12px_24px_rgba(16,185,129,0.28)] transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {pushBusy ? "Nastavuju…" : "Zapnout push"}
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDisableBrowserPush()}
                                disabled={pushBusy}
                                className="rounded-xl border border-slate-900 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-[0_8px_20px_rgba(15,23,42,0.06)] transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Vypnout push
                              </button>
                            </div>
                          </div>
                        )}

                        <div className={`${notificationCardClass} space-y-3 ring-1 ring-indigo-200/80`}>
                          <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#4f46e5_0%,#3b82f6_100%)]" />
                          <BellRing
                            className="pointer-events-none absolute -right-3 bottom-[-12px] h-20 w-20 text-slate-300/30"
                            strokeWidth={1.7}
                            aria-hidden="true"
                          />
                          <div className="relative text-xs uppercase tracking-wide text-slate-500">Typy notifikací</div>
                          <div className="relative space-y-2.5">
                            {NOTIFICATION_TYPE_OPTIONS.map((t) => {
                              const active = notificationSettings.types[t.id];
                              const Icon = t.icon;
                              return (
                                <button
                                  key={t.id}
                                  type="button"
                                  onClick={() => toggleNotificationType(t.id)}
                                  role="switch"
                                  aria-checked={active}
                                  className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-sm font-semibold text-slate-800 shadow-[0_8px_18px_rgba(15,23,42,0.04)] transition hover:border-slate-300 hover:bg-slate-50"
                                >
                                  <span className="inline-flex items-center gap-2.5">
                                    <span
                                      className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border transition ${
                                        active
                                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                          : "border-slate-200 bg-slate-50 text-slate-500"
                                      }`}
                                    >
                                      <Icon className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
                                    </span>
                                    <span>{t.label}</span>
                                  </span>
                                  <span
                                    className={`relative inline-flex h-7 w-12 shrink-0 rounded-full border transition ${active ? notificationToggleOnClass : notificationToggleOffClass}`}
                                    aria-hidden="true"
                                  >
                                    <span
                                      className={`absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow-[0_2px_6px_rgba(15,23,42,0.25)] transition-all ${active ? "left-[26px]" : "left-[2px]"}`}
                                    />
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className={`${notificationCardClass} flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ring-1 ring-slate-200/80`}>
                          <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#0f172a_0%,#1d4ed8_100%)]" />
                          <BellRing
                            className="pointer-events-none absolute -right-3 bottom-[-12px] h-20 w-20 text-slate-300/30"
                            strokeWidth={1.7}
                            aria-hidden="true"
                          />
                          <div className="relative">
                            <div className="text-xs uppercase tracking-wide text-slate-500">Testovací push</div>
                            <p className="text-xs text-slate-500">
                              Ověř, že push chodí přes webový token tohoto účtu.
                            </p>
                          </div>
                          <div className="relative flex flex-col gap-2 sm:items-end">
                            {testPushStatus ? (
                              <span className="text-[11px] text-slate-600">{testPushStatus}</span>
                            ) : null}
                            <button
                              type="button"
                              onClick={handleTestPush}
                              className="rounded-xl border border-slate-900 bg-[linear-gradient(135deg,#0f172a_0%,#0b1f3e_72%,#1d4ed8_100%)] px-4 py-2.5 text-sm font-semibold text-[#f8fafc] shadow-[0_12px_24px_rgba(29,78,216,0.24)] transition hover:brightness-95"
                            >
                              Odeslat test
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <aside className="rounded-[28px] border border-slate-200 bg-[linear-gradient(165deg,rgba(255,255,255,0.96)_0%,rgba(241,245,249,0.96)_100%)] p-4 shadow-[0_18px_38px_rgba(15,23,42,0.09)]">
                      <div className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                        Nastavení
                      </div>
                      <h3 className="mt-2 text-xl font-bold tracking-[-0.015em] text-slate-900">
                        Intranet sekce
                      </h3>
                      <p className="mt-1 text-sm text-slate-600">
                        Nastavení intranet sekcí pro push notifikace.
                      </p>

                      <div className="mt-3 space-y-3">
                        <div className={`${notificationCardClass} space-y-3 ring-1 ring-violet-200/80`}>
                          <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#7c3aed_0%,#22d3ee_100%)]" />
                          <Sparkles
                            className="pointer-events-none absolute -right-3 bottom-[-12px] h-20 w-20 text-slate-300/30"
                            strokeWidth={1.7}
                            aria-hidden="true"
                          />
                          <div className="relative text-xs uppercase tracking-wide text-slate-500">
                            Intranet příspěvky
                          </div>
                          <p className="relative text-xs text-slate-600">
                            Zvol si, jestli chceš push na všechny sekce nebo jen na vybrané.
                          </p>
                          <div className="relative inline-flex w-full rounded-xl border border-slate-200 bg-slate-100/90 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                            <button
                              type="button"
                              onClick={() => void setIntranetNotificationMode("all")}
                              className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                                notificationSettings.intranet.mode === "all"
                                  ? "bg-[linear-gradient(135deg,#0f172a_0%,#0b1f3e_72%,#1d4ed8_100%)] text-[#f8fafc] shadow-[0_10px_22px_rgba(29,78,216,0.26)]"
                                  : "text-slate-700 hover:bg-white"
                              }`}
                            >
                              Všechny sekce
                            </button>
                            <button
                              type="button"
                              onClick={() => void setIntranetNotificationMode("selected")}
                              className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                                notificationSettings.intranet.mode === "selected"
                                  ? "bg-[linear-gradient(135deg,#0f172a_0%,#0b1f3e_72%,#1d4ed8_100%)] text-[#f8fafc] shadow-[0_10px_22px_rgba(29,78,216,0.26)]"
                                  : "text-slate-700 hover:bg-white"
                              }`}
                            >
                              Jen vybrané
                            </button>
                          </div>

                          {notificationSettings.intranet.mode === "selected" ? (
                            <div className="relative space-y-2">
                              <div className="space-y-2">
                                {INTRANET_SECTIONS.map((section) => {
                                  const active =
                                    notificationSettings.intranet.sections.includes(section.key);
                                  const Icon = INTRANET_SECTION_ICON_BY_KEY[section.key];
                                  return (
                                    <button
                                      key={section.key}
                                      type="button"
                                      onClick={() =>
                                        void toggleIntranetNotificationSection(section.key)
                                      }
                                      role="switch"
                                      aria-checked={active}
                                      className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm font-semibold text-slate-800 shadow-[0_8px_18px_rgba(15,23,42,0.04)] transition hover:border-slate-300 hover:bg-slate-50"
                                    >
                                      <span className="inline-flex items-center gap-2.5">
                                        <span
                                          className={`inline-flex h-6 w-6 items-center justify-center rounded-md border transition ${
                                            active
                                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                              : "border-slate-200 bg-slate-50 text-slate-500"
                                          }`}
                                        >
                                          <Icon className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
                                        </span>
                                        <span>{section.label}</span>
                                      </span>
                                      <span
                                        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border transition ${active ? notificationToggleOnClass : notificationToggleOffClass}`}
                                        aria-hidden="true"
                                      >
                                        <span
                                          className={`absolute top-1/2 h-[18px] w-[18px] -translate-y-1/2 rounded-full bg-white shadow-[0_2px_6px_rgba(15,23,42,0.25)] transition-all ${active ? "left-[22px]" : "left-[2px]"}`}
                                        />
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                              {notificationSettings.intranet.sections.length === 0 ? (
                                <p className="text-[11px] text-amber-700">
                                  Není vybraná žádná sekce, intranet push nebude chodit.
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </aside>
                  </div>
                </div>
              </section>
              )}

              {activeTab === "onlineCard" && !timelineSetupRequired && (
              <section className={`h-full space-y-4 lg:col-span-2 ${panelClass}`}>
                <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#0f172a_0%,#1d4ed8_48%,#22d3ee_100%)]" />
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.28fr)_minmax(0,0.72fr)]">
                  <div className="space-y-3 rounded-2xl border border-slate-200 bg-white px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">
                          <Globe size={14} strokeWidth={2} className="text-slate-600" aria-hidden="true" />
                          <span>Online Vizitka Studio</span>
                        </h2>
                        <p className="mt-1 text-xs text-slate-500">
                          Klikni přímo do náhledu a upravuj obsah naživo. Pod hlavní vizitkou níže
                          najdeš i sekce profi stránky poradce.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-700">
                          Živý náhled
                        </span>
                        <button
                          type="button"
                          onClick={() => setOnlineCardStudioFullscreen(true)}
                          className="inline-flex items-center gap-1.5 rounded-full border border-slate-900 bg-slate-900 px-3 py-1 text-[11px] font-semibold text-white transition hover:bg-black"
                        >
                          <Maximize2 size={12} strokeWidth={2.2} aria-hidden="true" />
                          Rozbalit editor
                        </button>
                      </div>
                    </div>

                    <div className="online-card-studio-preview space-y-4">
                      <PremiumOnlineCardPreview
                        editable
                        layout="fullWidth"
                        showContactSection={false}
                        value={{
                          fullName: onlineCardDraft.fullName,
                          title: onlineCardDraft.title,
                          phone: onlineCardDraft.phone,
                          email: onlineCardDraft.email,
                          website: onlineCardDraft.website,
                          ico: onlineCardDraft.ico,
                          bio: onlineCardDraft.bio,
                          location: onlineCardDraft.location,
                          officeLabel: onlineCardDraft.officeLabel,
                          officePhotos: onlineCardDraft.officePhotos,
                        }}
                        meetingCta={{
                          label: "Sjednat schůzku",
                          onClick: handlePreviewMeetingCta,
                        }}
                        onPatch={(patch) => updateOnlineCardDraft(patch)}
                      />

                      <p className="text-[11px] text-slate-500">
                        Přímá editace náhledu upravuje pole vizitky. Odeslání změn do profilu proveď
                        tlačítkem Uložit vizitku.
                      </p>

                      <AdvisorProfileSections />
                      {onlineCardStudioOfficeSection}
                      {onlineCardStudioContactSection}
                    </div>
                  </div>

                  <aside className="space-y-3 rounded-2xl border border-slate-200 bg-[linear-gradient(165deg,rgba(255,255,255,0.96)_0%,rgba(241,245,249,0.96)_100%)] px-4 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-700">
                          Veřejná stránka
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Publikovat bez přihlášení.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          updateOnlineCardDraft({
                            enabled: !onlineCardDraft.enabled,
                          })
                        }
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                          onlineCardDraft.enabled
                            ? "border-slate-900 bg-slate-900 text-white"
                            : toggleOffClass
                        }`}
                        aria-pressed={onlineCardDraft.enabled}
                      >
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${
                            onlineCardDraft.enabled ? "bg-white" : "bg-slate-400"
                          }`}
                          aria-hidden="true"
                        />
                        {onlineCardDraft.enabled ? "Zapnuto" : "Vypnuto"}
                      </button>
                    </div>

                    <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">
                      Veřejná URL
                    </h3>
                    {onlineCardPublicUrl ? (
                      <div className="space-y-2 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                        <p className="break-all text-sm font-semibold text-slate-900">
                          {onlineCardPublicUrl}
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <a
                            href={onlineCardPublicUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="inline-flex items-center gap-1.5 rounded-full border border-slate-900 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 transition hover:bg-slate-100"
                          >
                            Otevřít vizitku
                            <ExternalLink size={12} strokeWidth={2.2} aria-hidden="true" />
                          </a>
                          <button
                            type="button"
                            onClick={handleOpenOnlineCardQr}
                            className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 transition hover:bg-slate-100"
                          >
                            QR kód
                            <QrCodeIcon size={12} strokeWidth={2.2} aria-hidden="true" />
                          </button>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          URL se generuje automaticky podle jména.
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-xs text-slate-500">
                        Pro vygenerování URL nejdřív vyplň jméno.
                      </div>
                    )}

                    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-xs text-slate-600">
                      Pokud vizitku vypneš, URL zůstane uložená, ale stránka nebude veřejně
                      dostupná.
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                      <p className="text-[11px] text-slate-500">
                        Text „O mně“
                      </p>
                      <p className="mt-1 text-xs font-semibold text-slate-700">
                        {onlineCardDraft.bio.length}/1000 znaků
                      </p>
                    </div>

                    <div className="flex flex-col gap-2">
                      {onlineCardStatus ? (
                        <p
                          className={`text-xs ${
                            onlineCardStatus.type === "success"
                              ? "text-emerald-700"
                              : onlineCardStatus.type === "info"
                                ? "text-slate-700"
                                : "text-rose-700"
                          }`}
                        >
                          {onlineCardStatus.message}
                        </p>
                      ) : (
                        <span className="text-xs text-slate-500">
                          Uložení zapíše aktuální náhled do profilu.
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => void handleSaveOnlineCard()}
                        disabled={onlineCardSaving || !onlineCardPublishReady}
                        className="inline-flex items-center justify-center rounded-xl border border-slate-900 bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {onlineCardSaving ? "Ukládám..." : "Uložit vizitku"}
                      </button>
                    </div>
                  </aside>
                </div>

                {onlineCardStudioFullscreen && (
                  <div className="fixed inset-0 z-[80] bg-slate-950/25 p-2 backdrop-blur-[2px] sm:p-4">
                    <div className="mx-auto flex h-full w-full max-w-[1560px] flex-col overflow-hidden rounded-[28px] border border-slate-200/80 bg-[linear-gradient(170deg,#f8fafc_0%,#f1f5f9_48%,#eef2ff_100%)] shadow-[0_32px_100px_rgba(15,23,42,0.2)]">
                      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600">
                            Online Vizitka Studio
                          </p>
                          <p className="text-xs text-slate-500">
                            Režim přes celou stránku. Esc = zavřít.
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleSaveOnlineCard()}
                            disabled={onlineCardSaving || !onlineCardPublishReady}
                            className="inline-flex items-center justify-center rounded-full border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {onlineCardSaving ? "Ukládám..." : "Uložit vizitku"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setOnlineCardStudioFullscreen(false)}
                            className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                          >
                            <Minimize2 size={12} strokeWidth={2.2} aria-hidden="true" />
                            Zavřít
                          </button>
                        </div>
                      </header>

                      <div className="flex-1 overflow-y-auto p-3 sm:p-5">
                        <div className="w-full space-y-4">
                          <div className="online-card-studio-preview space-y-4">
                            <PremiumOnlineCardPreview
                              editable
                              layout="fullWidth"
                              showContactSection={false}
                              value={{
                                fullName: onlineCardDraft.fullName,
                                title: onlineCardDraft.title,
                                phone: onlineCardDraft.phone,
                                email: onlineCardDraft.email,
                                website: onlineCardDraft.website,
                                ico: onlineCardDraft.ico,
                                bio: onlineCardDraft.bio,
                                location: onlineCardDraft.location,
                                officeLabel: onlineCardDraft.officeLabel,
                                officePhotos: onlineCardDraft.officePhotos,
                              }}
                              meetingCta={{
                                label: "Sjednat schůzku",
                                onClick: handlePreviewMeetingCta,
                              }}
                              onPatch={(patch) => updateOnlineCardDraft(patch)}
                            />
                            <AdvisorProfileSections />
                            {onlineCardStudioOfficeSection}
                            {onlineCardStudioContactSection}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {onlineCardQrOpen ? (
                  <div className="fixed inset-0 z-[92] flex items-end justify-center bg-slate-950/40 p-2 backdrop-blur-[2px] sm:items-center sm:p-4">
                    <div className="w-full max-w-[460px] rounded-[26px] border border-slate-200 bg-white p-4 shadow-[0_30px_80px_rgba(15,23,42,0.3)] sm:p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            QR kód vizitky
                          </p>
                          <p className="mt-1 text-xs text-slate-600">
                            Naskenuj nebo stáhni QR pro sdílení veřejné URL.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setOnlineCardQrOpen(false)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-100"
                          aria-label="Zavřít QR dialog"
                        >
                          <X size={14} strokeWidth={2.2} />
                        </button>
                      </div>

                      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        {onlineCardQrLoading ? (
                          <p className="text-center text-xs text-slate-500">Generuji QR kód…</p>
                        ) : null}

                        {!onlineCardQrLoading && onlineCardQrDataUrl ? (
                          <Image
                            src={onlineCardQrDataUrl}
                            alt="QR kód veřejné vizitky"
                            width={340}
                            height={340}
                            className="mx-auto h-auto w-full max-w-[340px] rounded-xl border border-slate-200 bg-white p-2"
                          />
                        ) : null}

                        {onlineCardQrError ? (
                          <p className="text-center text-xs text-rose-700">{onlineCardQrError}</p>
                        ) : null}
                      </div>

                      <p className="mt-3 break-all text-[11px] text-slate-500">{onlineCardPublicUrl}</p>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={handleDownloadOnlineCardQr}
                          disabled={!onlineCardQrDataUrl}
                          className="inline-flex items-center gap-1.5 rounded-full border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Stáhnout QR
                          <Download size={12} strokeWidth={2.2} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setOnlineCardQrOpen(false)}
                          className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                        >
                          Zavřít
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </section>
              )}

              {activeTab === "requests" && !timelineSetupRequired && (
              <section className={`h-full space-y-4 lg:col-span-2 ${panelClass}`}>
                <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#0f172a_0%,#64748b_48%,#cbd5e1_100%)]" />
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">
                      <ShieldCheck size={14} strokeWidth={2} className="text-slate-600" aria-hidden="true" />
                      <span>Nová žádost</span>
                    </h2>
                    {editingUserRequestId ? (
                      <div className="flex flex-col gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800 sm:flex-row sm:items-center sm:justify-between">
                        <span>Upravuješ vrácenou žádost k doplnění.</span>
                        <button
                          type="button"
                          onClick={() => {
                            resetUserRequestForm();
                            setUserRequestStatus(null);
                          }}
                          className="inline-flex items-center justify-center rounded-full border border-sky-300 bg-white px-3 py-1 font-semibold text-sky-800 transition hover:bg-sky-100"
                        >
                          Zrušit úpravu
                        </button>
                      </div>
                    ) : null}

                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-700">
                        Předmět
                      </label>
                      <select
                        className={fieldClass}
                        value={userRequestSubject}
                        onChange={(e) => {
                          setUserRequestSubject(e.target.value as UserRequestSubject);
                          setUserRequestStatus(null);
                        }}
                      >
                        <option value="userCreation">
                          {USER_REQUEST_SUBJECT_LABEL.userCreation}
                        </option>
                        <option value="other">{USER_REQUEST_SUBJECT_LABEL.other}</option>
                      </select>
                    </div>

                    {userRequestSubject === "userCreation" && (
                      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                        <div className="space-y-1.5">
                          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-700">
                            Firemní e-mail
                          </label>
                          <input
                            type="email"
                            className={fieldClass}
                            value={userRequestCorporateEmail}
                            onChange={(e) => {
                              setUserRequestCorporateEmail(e.target.value);
                              setUserRequestStatus(null);
                            }}
                            placeholder="jmeno.prijmeni@bohemika.eu"
                            maxLength={USER_REQUEST_CORPORATE_EMAIL_MAX_LEN}
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-700">
                            Jméno a příjmení
                          </label>
                          <input
                            type="text"
                            className={fieldClass}
                            value={userRequestFullName}
                            onChange={(e) => {
                              setUserRequestFullName(e.target.value);
                              setUserRequestStatus(null);
                            }}
                            placeholder="Jméno Příjmení"
                            maxLength={USER_REQUEST_FULL_NAME_MAX_LEN}
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-700">
                            E-mail přímého nadřízeného
                          </label>
                          <input
                            type="email"
                            className={fieldClass}
                            value={userRequestManagerEmail}
                            onChange={(e) => {
                              setUserRequestManagerEmail(e.target.value);
                              setUserRequestStatus(null);
                            }}
                            placeholder="jmeno.prijmeni@bohemika.eu"
                            maxLength={USER_REQUEST_MANAGER_EMAIL_MAX_LEN}
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-700">
                            Výchozí pozice
                          </label>
                          <select
                            className={fieldClass}
                            value={userRequestPosition}
                            onChange={(event) => {
                              setUserRequestPosition(event.target.value as Position);
                              setUserRequestStatus(null);
                            }}
                          >
                            {POSITIONS.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-1.5">
                          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-700">
                            Režim provizí
                          </label>
                          <div
                            className="inline-flex w-full rounded-2xl border border-slate-300 bg-slate-100 p-1"
                            role="radiogroup"
                            aria-label="Režim provizí žádosti"
                          >
                            {COMMISSION_MODES.map((m) => {
                              const active = userRequestMode === m.id;
                              const isAccelerated = m.id === "accelerated";
                              return (
                                <button
                                  key={m.id}
                                  type="button"
                                  onClick={() => {
                                    setUserRequestMode(m.id);
                                    setUserRequestStatus(null);
                                  }}
                                  className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                                    active
                                      ? "border border-slate-900 bg-white text-slate-900 shadow-[0_4px_12px_rgba(15,23,42,0.1)]"
                                      : "border border-transparent text-slate-600 hover:text-slate-900"
                                  }`}
                                  role="radio"
                                  aria-checked={active}
                                >
                                  {isAccelerated ? (
                                    <Zap
                                      size={14}
                                      strokeWidth={2.2}
                                      className={active ? "text-amber-500" : "text-amber-600"}
                                      aria-hidden="true"
                                    />
                                  ) : (
                                    <Snail
                                      size={14}
                                      strokeWidth={2.2}
                                      className={active ? "text-slate-600" : "text-slate-500"}
                                      aria-hidden="true"
                                    />
                                  )}
                                  {m.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <p className="text-[11px] text-slate-500">
                          Heslo nenastavuješ. Po schválení žádosti ho nastaví admin.
                        </p>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                        Priorita
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(["normal", "urgent"] as UserRequestPriority[]).map((priority) => {
                          const active = userRequestPriority === priority;
                          return (
                            <button
                              key={priority}
                              type="button"
                              onClick={() => setUserRequestPriority(priority)}
                              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                                active
                                  ? "border-slate-900 bg-slate-900 text-white"
                                  : toggleOffClass
                              }`}
                            >
                              {USER_REQUEST_PRIORITY_LABEL[priority]}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-700">
                        Popis žádosti
                      </label>
                      <textarea
                        className={`${fieldClass} min-h-[120px] resize-y`}
                        value={userRequestMessage}
                        onChange={(e) => {
                          setUserRequestMessage(e.target.value);
                          setUserRequestStatus(null);
                        }}
                        placeholder="Napiš prosím detaily žádosti."
                        maxLength={USER_REQUEST_MESSAGE_MAX_LEN}
                      />
                      <p className="text-[11px] text-slate-500">
                        {requestMessageLength}/{USER_REQUEST_MESSAGE_MAX_LEN} znaků (minimum{" "}
                        {USER_REQUEST_MESSAGE_MIN_LEN}).
                      </p>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      {userRequestStatus && (
                        <p
                          className={`text-xs ${
                            userRequestStatus.type === "success"
                              ? "text-emerald-700"
                              : userRequestStatus.type === "info"
                                ? "text-slate-700"
                                : "text-rose-700"
                          }`}
                        >
                          {userRequestStatus.message}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleSubmitUserRequest()}
                        disabled={userRequestSubmitting || !canSubmitUserRequest}
                        className="inline-flex items-center justify-center rounded-xl border border-slate-900 bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {userRequestSubmitting
                          ? editingUserRequestId
                            ? "Odesílám změny..."
                            : "Odesílám..."
                          : editingUserRequestId
                            ? "Uložit a odeslat znovu"
                            : "Odeslat"}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3 rounded-2xl border border-slate-200 bg-white px-4 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">
                        Podané žádosti
                      </h3>
                      <button
                        type="button"
                        onClick={() => void loadUserRequests()}
                        disabled={userRequestsLoading}
                        className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {userRequestsLoading ? "Načítám..." : "Obnovit"}
                      </button>
                    </div>

                    {userRequestsError ? (
                      <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                        {userRequestsError}
                      </div>
                    ) : null}

                    {!userRequestsLoading && userRequests.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-xs text-slate-500">
                        Zatím nemáš podané žádosti.
                      </div>
                    ) : null}

                    <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                      {userRequests.map((request) => {
                        const slaInfo = buildUserRequestSlaInfo(request, userRequestsNowMs);
                        const cancellableByRequester =
                          request.status === "pending" || request.status === "needsInfo";
                        const decisionDurationMs =
                          request.decidedAtMs && Number.isFinite(request.decidedAtMs)
                            ? Math.max(0, request.decidedAtMs - request.createdAtMs)
                            : 0;

                        return (
                          <article
                            key={request.id}
                            className={`rounded-xl border px-3 py-3 ${
                              slaInfo.isOverdueUrgent
                                ? "border-rose-300 bg-rose-50"
                                : "border-slate-200 bg-slate-50"
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-slate-800">
                                {USER_REQUEST_SUBJECT_LABEL[request.subject]}
                              </span>
                              <div className="flex items-center gap-2">
                                <span
                                  className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                                    USER_REQUEST_STATUS_CLASS[request.status]
                                  }`}
                                >
                                  {USER_REQUEST_STATUS_LABEL[request.status]}
                                </span>
                                {request.status === "needsInfo" ? (
                                  <button
                                    type="button"
                                    onClick={() => handleStartEditUserRequest(request)}
                                    disabled={Boolean(userRequestDeletingId) || userRequestSubmitting}
                                    className="rounded-full border border-sky-300 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    Doplnit
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteUserRequest(request.id)}
                                  disabled={userRequestDeletingId === request.id}
                                  className="rounded-full border border-rose-300 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {userRequestDeletingId === request.id
                                    ? "Mažu..."
                                    : cancellableByRequester
                                      ? "Stornovat"
                                      : "Smazat"}
                                </button>
                              </div>
                            </div>

                            <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-700">
                              {request.message}
                            </p>

                            <dl className="mt-3 space-y-1 text-[11px] text-slate-500">
                              <div className="flex flex-wrap items-baseline gap-1">
                                <dt className="font-semibold text-slate-600">Priorita:</dt>
                                <dd>{USER_REQUEST_PRIORITY_LABEL[request.priority]}</dd>
                              </div>
                              {slaInfo.waiting ? (
                                <div className="flex flex-wrap items-baseline gap-1">
                                  <dt className="font-semibold text-slate-600">Čeká:</dt>
                                  <dd
                                    className={
                                      slaInfo.isOverdueUrgent
                                        ? "font-semibold text-rose-700"
                                        : "text-slate-600"
                                    }
                                  >
                                    {slaInfo.elapsedLabel} (SLA {slaInfo.slaLimitLabel})
                                  </dd>
                                </div>
                              ) : (
                                <div className="flex flex-wrap items-baseline gap-1">
                                  <dt className="font-semibold text-slate-600">Vyřízeno za:</dt>
                                  <dd>{formatDurationCompact(decisionDurationMs)}</dd>
                                </div>
                              )}
                              {request.requestedCorporateEmail ? (
                                <div className="flex flex-wrap items-baseline gap-1">
                                  <dt className="font-semibold text-slate-600">Firemní e-mail:</dt>
                                  <dd>{request.requestedCorporateEmail}</dd>
                                </div>
                              ) : null}
                              {request.requestedUserDraft ? (
                                <>
                                  {request.requestedUserDraft.fullName ? (
                                    <div className="flex flex-wrap items-baseline gap-1">
                                      <dt className="font-semibold text-slate-600">Jméno:</dt>
                                      <dd>{request.requestedUserDraft.fullName}</dd>
                                    </div>
                                  ) : null}
                                  {request.requestedUserDraft.managerEmail ? (
                                    <div className="flex flex-wrap items-baseline gap-1">
                                      <dt className="font-semibold text-slate-600">Nadřízený:</dt>
                                      <dd>{request.requestedUserDraft.managerEmail}</dd>
                                    </div>
                                  ) : null}
                                  <div className="flex flex-wrap items-baseline gap-1">
                                    <dt className="font-semibold text-slate-600">Pozice:</dt>
                                    <dd>
                                      {POSITIONS.find(
                                        (p) => p.id === request.requestedUserDraft?.position
                                      )?.label ?? request.requestedUserDraft.position}
                                    </dd>
                                  </div>
                                  <div className="flex flex-wrap items-baseline gap-1">
                                    <dt className="font-semibold text-slate-600">Režim:</dt>
                                    <dd>
                                      {COMMISSION_MODES.find(
                                        (m) => m.id === request.requestedUserDraft?.commissionMode
                                      )?.label ?? request.requestedUserDraft.commissionMode}
                                    </dd>
                                  </div>
                                </>
                              ) : null}
                              {request.createdUserEmail ? (
                                <div className="flex flex-wrap items-baseline gap-1">
                                  <dt className="font-semibold text-slate-600">Vytvořený účet:</dt>
                                  <dd>{request.createdUserEmail}</dd>
                                </div>
                              ) : null}
                              <div className="flex flex-wrap items-baseline gap-1">
                                <dt className="font-semibold text-slate-600">Vytvořeno:</dt>
                                <dd>{formatDateTime(request.createdAtMs)}</dd>
                              </div>
                              <div className="flex flex-wrap items-baseline gap-1">
                                <dt className="font-semibold text-slate-600">Zpětná vazba:</dt>
                                <dd>
                                  {request.feedback?.trim()
                                    ? request.feedback
                                    : "Zatím bez zpětné vazby."}
                                </dd>
                              </div>
                            </dl>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </section>
              )}
            </div>

            {activeTab === "design" && !timelineSetupRequired && (
            <section className={`space-y-3 ${compactPanelClass}`}>
                <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#0f172a_0%,#64748b_48%,#cbd5e1_100%)]" />
                <div className="space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <div>
                      <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">
                        Animace rozhraní
                      </h2>
                      <p className="text-xs text-slate-500">
                        Přepíná pohybové efekty v aplikaci.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs uppercase tracking-[0.16em] text-slate-500">
                        Animace
                      </span>
                      <button
                        type="button"
                        onClick={() => handleReduceMotionChange(!reduceMotion)}
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                          reduceMotion
                            ? "border-slate-900 bg-slate-900 text-white"
                            : toggleOffClass
                        }`}
                        aria-pressed={reduceMotion}
                      >
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${
                            reduceMotion ? "bg-white" : "bg-slate-400"
                          }`}
                          aria-hidden="true"
                        />
                        {reduceMotion ? "Animace vypnuté" : "Animace zapnuté"}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">
                        Barva tmavých boxů
                      </h3>
                      <p className="text-xs text-slate-500">
                        Změní barvu tmavých tlačítek a aktivních filtrů v celé aplikaci.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                      {BOX_THEME_OPTIONS.map((opt) => {
                        const isActive = boxTheme === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => void handleBoxThemeChange(opt.id)}
                            aria-pressed={isActive}
                            className={`flex flex-col items-start gap-2 rounded-2xl border px-3 py-2 text-left transition ${
                              isActive
                                ? "border-slate-900 bg-white shadow-[0_8px_20px_rgba(15,23,42,0.12)]"
                                : "border-slate-300 bg-white hover:border-slate-500"
                            }`}
                          >
                            <span
                              className="h-8 w-full rounded-lg"
                              style={{
                                background: `linear-gradient(135deg, ${opt.swatchFrom}, ${opt.swatchTo})`,
                              }}
                            />
                            <span className="text-xs font-semibold text-slate-800">
                              {opt.label}
                            </span>
                            <span className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
                              {isActive ? "Aktivní" : "Vybrat"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">
                        Písmo napříč webem
                      </h3>
                      <p className="text-xs text-slate-500">
                        Přepne hlavní font pro celý web včetně panelů a detailů.
                      </p>
                    </div>

                    <div className="grid max-w-4xl grid-cols-1 gap-2 sm:grid-cols-2">
                      {FONT_THEME_OPTIONS.map((opt) => {
                        const isActive = fontTheme === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => void handleFontThemeChange(opt.id)}
                            aria-pressed={isActive}
                            className={`rounded-xl border px-3 py-2.5 text-left transition ${
                              isActive
                                ? "border-slate-900 bg-white shadow-[0_6px_16px_rgba(15,23,42,0.1)]"
                                : "border-slate-300 bg-white hover:border-slate-500"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-sm font-semibold text-slate-900">
                                {opt.label}
                              </span>
                              <span
                                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                                  isActive
                                    ? "border-slate-900 bg-slate-900 text-white"
                                    : "border-slate-300 bg-slate-100 text-slate-600"
                                }`}
                              >
                                {isActive ? "Aktivní" : "Vybrat"}
                              </span>
                            </div>
                            <p className="mt-0.5 text-[11px] text-slate-500">
                              {opt.description}
                            </p>
                            <span
                              className="mt-2 block rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-base text-slate-900"
                              style={{ fontFamily: opt.previewFamily }}
                            >
                              {opt.previewText}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
            </section>
            )}

            {activeTab === "subscription" && !timelineSetupRequired && (
            <section className={`space-y-4 ${panelClass}`}>
              <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#0f172a_0%,#64748b_48%,#cbd5e1_100%)]" />
              <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">
                <Landmark size={14} strokeWidth={2} className="text-slate-600" aria-hidden="true" />
                <span>Předplatné</span>
              </h2>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.8fr)]">
                <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(165deg,rgba(255,255,255,0.96)_0%,rgba(241,245,249,0.96)_100%)] p-4 shadow-[0_18px_38px_rgba(15,23,42,0.09)]">
                  <div className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                    Přehled
                  </div>
                  <h3 className="mt-2 text-xl font-bold tracking-[-0.015em] text-slate-900">
                    Stav tvého předplatného
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Rychlý přehled platnosti a historie plateb.
                  </p>

                  <div className="mt-3 space-y-4">
                    {subscriptionLoading ? (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                        Načítám údaje o předplatném…
                      </div>
                    ) : subscriptionError ? (
                      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                        {subscriptionError}
                      </div>
                    ) : subscriptionSnapshot ? (
                      <>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <article
                            className={`relative isolate overflow-hidden rounded-2xl border border-white/90 bg-white/85 p-4 shadow-[0_12px_24px_rgba(15,23,42,0.08)] ring-1 ${
                              subscriptionSnapshot.effectiveState === "active"
                                ? "ring-emerald-200/80"
                                : subscriptionSnapshot.effectiveState === "grace"
                                  ? "ring-amber-200/80"
                                  : "ring-rose-200/80"
                            }`}
                          >
                            <div
                              className={`absolute inset-x-0 top-0 h-1 ${
                                subscriptionSnapshot.effectiveState === "active"
                                  ? "bg-[linear-gradient(90deg,#059669_0%,#22c55e_100%)]"
                                  : subscriptionSnapshot.effectiveState === "grace"
                                    ? "bg-[linear-gradient(90deg,#d97706_0%,#f59e0b_100%)]"
                                    : "bg-[linear-gradient(90deg,#e11d48_0%,#fb7185_100%)]"
                              }`}
                            />
                            <ShieldCheck
                              className="pointer-events-none absolute -right-3 bottom-[-14px] h-20 w-20 text-slate-300/30"
                              strokeWidth={1.5}
                              aria-hidden="true"
                            />
                            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                              Stav
                            </div>
                            <div
                              className={`relative mt-2 inline-flex rounded-full border px-3 py-1.5 text-base font-semibold leading-none ${
                                subscriptionSnapshot.effectiveState === "active"
                                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                                  : subscriptionSnapshot.effectiveState === "grace"
                                    ? "border-amber-300 bg-amber-50 text-amber-800"
                                    : "border-rose-300 bg-rose-50 text-rose-700"
                              }`}
                            >
                              {subscriptionSnapshot.effectiveState === "active"
                                ? "Aktivní"
                                : subscriptionSnapshot.effectiveState === "grace"
                                  ? "Ochranná lhůta"
                                  : subscriptionSnapshot.status === "unpaid"
                                    ? "Nezaplaceno"
                                    : "Blokováno"}
                            </div>
                          </article>

                          <article className="relative isolate overflow-hidden rounded-2xl border border-white/90 bg-white/85 p-4 shadow-[0_12px_24px_rgba(15,23,42,0.08)] ring-1 ring-indigo-200/70">
                            <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#3730a3_0%,#2563eb_100%)]" />
                            <Clock3
                              className="pointer-events-none absolute -right-3 bottom-[-14px] h-20 w-20 text-slate-300/30"
                              strokeWidth={1.5}
                              aria-hidden="true"
                            />
                            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                              Tarif
                            </div>
                            <div className="relative mt-2 text-[33px] font-black leading-none tracking-[-0.02em] text-slate-900">
                              {subscriptionSnapshot.plan
                                ? SUBSCRIPTION_PLAN_LABELS[subscriptionSnapshot.plan]
                                : "—"}
                            </div>
                          </article>

                          <article className="relative isolate overflow-hidden rounded-2xl border border-white/90 bg-white/85 p-4 shadow-[0_12px_24px_rgba(15,23,42,0.08)] ring-1 ring-sky-200/80">
                            <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#0284c7_0%,#38bdf8_100%)]" />
                            <Clock3
                              className="pointer-events-none absolute -right-3 bottom-[-14px] h-20 w-20 text-slate-300/30"
                              strokeWidth={1.5}
                              aria-hidden="true"
                            />
                            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                              Zaplaceno od
                            </div>
                            <div className="relative mt-2 text-[33px] font-black leading-none tracking-[-0.02em] text-slate-900">
                              {formatIsoDay(subscriptionSnapshot.paidFrom)}
                            </div>
                          </article>

                          <article className="relative isolate overflow-hidden rounded-2xl border border-white/90 bg-white/85 p-4 shadow-[0_12px_24px_rgba(15,23,42,0.08)] ring-1 ring-violet-200/80">
                            <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#7c3aed_0%,#22d3ee_100%)]" />
                            <Landmark
                              className="pointer-events-none absolute -right-3 bottom-[-14px] h-20 w-20 text-slate-300/30"
                              strokeWidth={1.5}
                              aria-hidden="true"
                            />
                            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                              Zaplaceno do
                            </div>
                            <div className="relative mt-2 text-[33px] font-black leading-none tracking-[-0.02em] text-slate-900">
                              {subscriptionSnapshot.plan === "unlimited"
                                ? "Neomezeně"
                                : formatIsoDay(subscriptionSnapshot.paidUntil)}
                            </div>
                          </article>
                        </div>

                        {subscriptionSnapshot.effectiveState === "grace" ? (
                          <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                            Předplatné je po splatnosti. Přístup běží v ochranné lhůtě do{" "}
                            <span className="font-semibold">
                              {formatIsoDay(subscriptionSnapshot.graceUntil)}
                            </span>
                            . Pro zachování přístupu uhraď platbu.
                          </div>
                        ) : null}

                        <div className="rounded-2xl border border-white/90 bg-white/90 p-3 shadow-[0_12px_24px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/80">
                          <h3 className="mb-2 text-sm font-semibold text-slate-900">
                            Historie plateb
                          </h3>

                          {subscriptionPayments.length === 0 ? (
                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                              Zatím není evidovaná žádná platba.
                            </div>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="min-w-full text-left text-xs text-slate-700">
                                <thead>
                                  <tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.12em] text-slate-500">
                                    <th className="px-2 py-2">Tarif</th>
                                    <th className="px-2 py-2">Částka</th>
                                    <th className="px-2 py-2">Období</th>
                                    <th className="px-2 py-2">Zapsal</th>
                                    <th className="px-2 py-2">Poznámka</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {subscriptionPayments.map((payment) => (
                                    <tr key={payment.id} className="border-b border-slate-100 align-top">
                                      <td className="px-2 py-2 font-semibold text-slate-900">
                                        {payment.plan in SUBSCRIPTION_PLAN_LABELS
                                          ? SUBSCRIPTION_PLAN_LABELS[
                                              payment.plan as SubscriptionPlanValue
                                            ]
                                          : payment.plan || "—"}
                                      </td>
                                      <td className="px-2 py-2">{formatMoneyCzk(payment.amountCzk || 0)}</td>
                                      <td className="px-2 py-2">
                                        {formatIsoDay(payment.periodFrom)} – {formatIsoDay(payment.periodUntil)}
                                      </td>
                                      <td className="px-2 py-2">
                                        <div>{payment.createdByEmail || "—"}</div>
                                        <div className="text-[10px] text-slate-500">
                                          {formatDateTime(payment.createdAtMs)}
                                        </div>
                                      </td>
                                      <td className="px-2 py-2">{payment.note || "—"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                        Předplatné zatím není nastavené.
                      </div>
                    )}
                  </div>
                </div>

                <aside className="rounded-[28px] border border-slate-200 bg-[linear-gradient(165deg,rgba(255,255,255,0.96)_0%,rgba(241,245,249,0.96)_100%)] p-4 shadow-[0_18px_38px_rgba(15,23,42,0.09)]">
                  <div className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                    Ceník
                  </div>
                  <h3 className="mt-2 text-xl font-bold tracking-[-0.015em] text-slate-900">
                    Tarify předplatného
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Přehled aktuálních tarifů včetně délky období.
                  </p>

                  <div className="mt-3 space-y-3">
                    {SUBSCRIPTION_PRICE_CARDS.map((priceCard) => (
                      <article
                        key={priceCard.id}
                        className={`group relative isolate min-h-[136px] overflow-hidden rounded-2xl border border-white/80 ${priceCard.tintClass} p-4 shadow-[0_14px_28px_rgba(15,23,42,0.11)] ring-1 ${priceCard.ringClass}`}
                      >
                        <div className={`absolute inset-x-0 top-0 h-1 ${priceCard.accentClass}`} />
                        <Landmark
                          className="pointer-events-none absolute -right-2 bottom-[-16px] h-24 w-24 text-slate-300/35"
                          strokeWidth={1.5}
                          aria-hidden="true"
                        />

                        <div className="relative flex h-full flex-col justify-between gap-3">
                          <div className="inline-flex w-fit items-center rounded-full border border-slate-200/90 bg-white/85 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                            {priceCard.label}
                          </div>

                          <div className="space-y-1">
                            <div className="text-[28px] font-black leading-none tracking-[-0.02em] text-slate-900">
                              {priceCard.priceLabel}
                            </div>
                            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
                              {priceCard.cadenceLabel}
                            </div>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </aside>
              </div>
            </section>
            )}

            {/* Účet */}
            {activeTab === "account" && !timelineSetupRequired && (
            <section className={`space-y-4 ${panelClass}`}>
              <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#0f172a_0%,#64748b_48%,#cbd5e1_100%)]" />
              <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">
                <UserRound size={14} strokeWidth={2} className="text-slate-600" aria-hidden="true" />
                <span>Účet</span>
              </h2>

              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 text-sm">
                <div>
                  <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wide text-slate-500">
                    <AtSign size={12} strokeWidth={2} className="text-slate-500" aria-hidden="true" />
                    <span>E-mail účtu</span>
                  </div>
                  <div className="mt-1 font-medium text-slate-900">
                    {userEmail}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Odhlásit se můžeš kdykoliv pomocí tlačítka v levém panelu
                    dole.
                  </p>
                </div>

                <div className="w-full sm:max-w-md space-y-3">
                  <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wide text-slate-500">
                    <KeyRound size={12} strokeWidth={2} className="text-slate-500" aria-hidden="true" />
                    <span>Změna hesla</span>
                  </div>

                  {!showPasswordForm && (
                    <button
                      type="button"
                      onClick={() => setShowPasswordForm(true)}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-2xl border border-slate-900 bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-black"
                    >
                      <KeyRound size={15} strokeWidth={2} className="shrink-0" aria-hidden="true" />
                      Změnit heslo
                    </button>
                  )}

                  {showPasswordForm && (
                    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <input
                        type="password"
                        autoComplete="current-password"
                        className={fieldClass}
                        placeholder="Původní heslo"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                      />
                      <input
                        type="password"
                        autoComplete="new-password"
                        className={fieldClass}
                        placeholder="Nové heslo (min. 6 znaků)"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                      <input
                        type="password"
                        autoComplete="new-password"
                        className={fieldClass}
                        placeholder="Potvrď nové heslo"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                      />
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <button
                          type="button"
                          onClick={handleChangePassword}
                          disabled={changingPassword}
                          className="inline-flex items-center justify-center rounded-2xl border border-slate-900 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {changingPassword ? "Měním heslo…" : "Potvrdit změnu"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowPasswordForm(false);
                            setCurrentPassword("");
                            setNewPassword("");
                            setConfirmPassword("");
                            setPasswordStatus(null);
                          }}
                          className="text-xs text-slate-500 hover:text-slate-900"
                        >
                          Zrušit
                        </button>
                      </div>
                      {passwordStatus && (
                        <div
                          className={`text-xs ${
                            passwordStatus.type === "success"
                              ? "text-emerald-700"
                              : "text-rose-700"
                          }`}
                        >
                          {passwordStatus.message}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wide text-slate-500">
                        <ShieldCheck size={12} strokeWidth={2} className="text-slate-500" aria-hidden="true" />
                        <span>2FA (Microsoft Authenticator)</span>
                      </div>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                          mfaEnabled
                            ? "border-emerald-700 bg-emerald-600 text-white"
                            : "border-slate-300 bg-white text-slate-700"
                        }`}
                      >
                        {mfaEnabled ? "Zapnuto" : "Vypnuto"}
                      </span>
                    </div>

                    <p className="text-xs text-slate-500">
                      Po zadání hesla budete při přihlášení potvrzovat ještě jednorázový kód z aplikace Microsoft Authenticator.
                    </p>

                    <input
                      type="password"
                      autoComplete="current-password"
                      className={fieldClass}
                      placeholder="Aktuální heslo pro potvrzení"
                      value={mfaPassword}
                      onChange={(e) => setMfaPassword(e.target.value)}
                    />

                    {mfaEnabled && !mfaEnrollmentSecret && (
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        className={fieldClass}
                        placeholder="Aktuální 2FA kód (pro vypnutí)"
                        value={mfaReauthCode}
                        onChange={(e) =>
                          setMfaReauthCode(e.target.value.replace(/\D/g, "").slice(0, 8))
                        }
                      />
                    )}

                    {!mfaEnabled && !mfaEnrollmentSecret && (
                      <button
                        type="button"
                        onClick={() => void handleStartMfaEnrollment()}
                        disabled={mfaBusy}
                        className="inline-flex w-full items-center justify-center rounded-2xl border border-slate-900 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {mfaBusy ? "Spouštím 2FA…" : "Zapnout 2FA"}
                      </button>
                    )}

                    {mfaEnrollmentSecret && (
                      <div className="space-y-3 rounded-xl border border-slate-300 bg-white p-3">
                        <p className="text-xs text-slate-600">
                          V Microsoft Authenticator zvol Přidat účet a naskenuj QR kód.
                        </p>

                        <div className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                          {mfaQrCodeLoading && (
                            <p className="text-xs text-slate-500">Generuji QR kód…</p>
                          )}
                          {!mfaQrCodeLoading && mfaQrCodeDataUrl && (
                            <Image
                              src={mfaQrCodeDataUrl}
                              alt="QR kód pro Microsoft Authenticator"
                              width={220}
                              height={220}
                              unoptimized
                              className="rounded-lg border border-slate-300 bg-white p-1"
                            />
                          )}
                          {mfaQrCodeError && (
                            <p className="text-xs text-rose-700">{mfaQrCodeError}</p>
                          )}
                          <p className="text-[11px] text-slate-500">
                            Pokud skenování nefunguje, použij setup key níže.
                          </p>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                          <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
                            Setup key
                          </div>
                          <div className="mt-1 break-all text-xs font-semibold text-slate-900">
                            {mfaEnrollmentSecret.secretKey}
                          </div>
                        </div>

                        <details className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                          <summary className="cursor-pointer text-[11px] font-semibold text-slate-700">
                            Zobrazit QR URI (pokročilé)
                          </summary>
                          <p className="mt-2 break-all text-[10px] text-slate-600">
                            {mfaQrCodeUri}
                          </p>
                        </details>

                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          className={fieldClass}
                          placeholder="6místný kód z aplikace"
                          value={mfaEnrollmentCode}
                          onChange={(e) =>
                            setMfaEnrollmentCode(
                              e.target.value.replace(/\D/g, "").slice(0, 8)
                            )
                          }
                        />

                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => void handleConfirmMfaEnrollment()}
                            disabled={mfaBusy}
                            className="inline-flex items-center justify-center rounded-2xl border border-emerald-700 bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {mfaBusy ? "Potvrzuji…" : "Potvrdit a zapnout"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              clearMfaDraft();
                              setMfaStatus(null);
                            }}
                            className="text-xs text-slate-500 hover:text-slate-900"
                          >
                            Zrušit
                          </button>
                        </div>
                      </div>
                    )}

                    {mfaEnabled && !mfaEnrollmentSecret && (
                      <div className="space-y-2">
                        <p className="text-[11px] text-slate-500">
                          {mfaTotpLabel
                            ? `Aktivní faktor: ${mfaTotpLabel}`
                            : "Aktivní faktor: Microsoft Authenticator"}
                        </p>
                        <button
                          type="button"
                          onClick={() => void handleDisableMfa()}
                          disabled={mfaBusy}
                          className="inline-flex w-full items-center justify-center rounded-2xl border border-rose-700 bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {mfaBusy ? "Vypínám 2FA…" : "Vypnout 2FA"}
                        </button>
                      </div>
                    )}

                    {mfaStatus && (
                      <div
                        className={`text-xs ${
                          mfaStatus.type === "success"
                            ? "text-emerald-700"
                            : mfaStatus.type === "info"
                              ? "text-slate-700"
                              : "text-rose-700"
                        }`}
                      >
                        {mfaStatus.message}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>
            )}

          </>
        )}
        </div>
      </div>
    </AppLayout>
  );
}
