// src/app/nastaveni/page.tsx
"use client";

import { type ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  Calculator,
  ChevronLeft,
  ChevronRight,
  Building2,
  ExternalLink,
  Globe,
  Globe2,
  Mail,
  MapPin,
  PhoneCall,
  Snail,
  Upload,
  QrCode as QrCodeIcon,
  X,
  Zap,
} from "lucide-react";

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

import { auth } from "../firebase";
import { AppLayout } from "@/components/AppLayout";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import { confirmEmailForMfaEnrollment } from "@/app/lib/mfaEmailVerification";
import {
  createPasskeyForUser,
  deletePasskeyForUser,
  getPasskeyAvailability,
  listPasskeysForUser,
  resolvePasskeyErrorMessage,
  type PasskeyCredentialSummary,
} from "@/app/lib/passkeys";
import { invalidateUserProfileCache } from "@/app/lib/userProfileCache";
import {
  deleteBrowserFcmToken,
  getBrowserFcmToken,
  getPushDeviceId,
  getPushPermission,
  isPushSupportedInBrowser,
} from "@/app/lib/pushNotifications";
import {
  DEFAULT_FONT_THEME,
  FONT_THEME_EVENT,
  FONT_THEME_LOCAL_STORAGE_KEY,
  applyFontThemeToRoot,
  resolveFontTheme,
  type FontTheme,
} from "@/lib/fontTheme";
import type { Position, CommissionMode } from "../types/domain";
import SplitTitle from "../pomucky/plan-produkce/SplitTitle";
import { AccountSecurityPanel } from "./components/AccountSecurityPanel";
import { CareerTimelinePanel } from "./components/CareerTimelinePanel";
import { DesignSettingsPanel } from "./components/DesignSettingsPanel";
import { NotificationsSettingsPanel } from "./components/NotificationsSettingsPanel";
import { OnlineCardSettingsPanel } from "./components/OnlineCardSettingsPanel";
import { ProfileSettingsPanel } from "./components/ProfileSettingsPanel";
import { SubscriptionSettingsPanel } from "./components/SubscriptionSettingsPanel";
import { UserRequestsPanel } from "./components/UserRequestsPanel";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  INTRANET_NOTIFICATION_SECTIONS,
  normalizeNotificationSettings,
  type IntranetSectionKey,
  type NotificationSettings,
} from "./notificationSettings";
import {
  type SubscriptionEffectiveState,
  type SubscriptionMeResponse,
  type SubscriptionPaymentRow,
  type SubscriptionPlanValue,
  type SubscriptionSnapshot,
  type SubscriptionStatusValue,
} from "./subscriptionSettings";
import {
  USER_REQUEST_AGENCY_NUMBER_MAX_LEN,
  USER_REQUEST_CORPORATE_EMAIL_MAX_LEN,
  USER_REQUEST_FULL_NAME_MAX_LEN,
  USER_REQUEST_MANAGER_EMAIL_MAX_LEN,
  USER_REQUEST_MESSAGE_MAX_LEN,
  USER_REQUEST_MESSAGE_MIN_LEN,
  USER_REQUEST_STEPS,
  sortUserRequestsByActivity,
  type UserRequestCreateApiResponse,
  type UserRequestDeleteApiResponse,
  type UserRequestPayload,
  type UserRequestPriority,
  type UserRequestUpdateApiResponse,
  type UserRequestsApiResponse,
  type UserRequestsView,
  type UserRequestSubject,
} from "./userRequestSettings";

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

const SETTINGS_KEYS = {
  mode: "settings.mode",
  monthlyGoal: "settings.monthlyGoal",
  fontTheme: FONT_THEME_LOCAL_STORAGE_KEY,
  reduceMotion: "settings.reduceMotion",
};

type SettingsTab =
  | "profile"
  | "account"
  | "subscription"
  | "career"
  | "notifications"
  | "onlineCard"
  | "design"
  | "requests";

const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: "profile", label: "Profil" },
  { id: "account", label: "Zabezpečení" },
  { id: "subscription", label: "Předplatné" },
  { id: "career", label: "Kariéra" },
  { id: "notifications", label: "Notifikace" },
  { id: "requests", label: "Žádosti" },
  { id: "design", label: "Design" },
];

const normalizeEmail = (email?: string | null) =>
  (email ?? "").trim().toLowerCase();

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
const PROFILE_FULL_NAME_MAX_LEN = 120;

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

const normalizeOnlineCardSlugInput = (value: unknown): string => {
  if (typeof value !== "string") return "";
  const lowered = value.toLowerCase();
  if (!lowered) return "";
  const ascii = lowered
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+/g, "");
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

type SettingsTeamMember = {
  email?: string | null;
  name?: string | null;
  managerEmail?: string | null;
  teamParentEmail?: string | null;
};

type SettingsTeamMembersResponse = {
  ok?: boolean;
  members?: SettingsTeamMember[];
  error?: string;
};

type DirectManagerInfo = {
  email: string;
  name: string;
};

const resolveDirectManagerFromTeam = async (
  user: FirebaseUser,
  userEmail: string,
  fallbackManagerEmail: string
): Promise<DirectManagerInfo | null> => {
  const payload = await fetchAuthedJsonOrThrow<SettingsTeamMembersResponse>(
    user,
    "/api/team-overview?action=members&includeAncestors=1",
    { method: "GET" }
  );
  const members = Array.isArray(payload?.members) ? payload.members : [];
  const byEmail = new Map<string, SettingsTeamMember>();

  members.forEach((member) => {
    const email = normalizeEmail(member.email);
    if (email) byEmail.set(email, member);
  });

  const ownMember = byEmail.get(normalizeEmail(userEmail));
  const managerEmail =
    normalizeEmail(ownMember?.managerEmail) ||
    normalizeEmail(ownMember?.teamParentEmail) ||
    fallbackManagerEmail;

  if (!managerEmail) return null;

  const manager = byEmail.get(managerEmail);
  const managerName =
    typeof manager?.name === "string" && manager.name.trim()
      ? manager.name.trim()
      : nameFromEmail(managerEmail);

  return {
    email: managerEmail,
    name: managerName || managerEmail,
  };
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
  const storedSlug = slugifyOnlineCard(row.slug);
  const slug =
    storedSlug ||
    resolveOnlineCardAutoSlug({
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

const AGENCY_NUMBER_MAX_LEN = 80;
const PHONE_NUMBER_MAX_LEN = 40;
const PROFILE_ICO_MAX_LEN = 8;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isValidEmail = (value: string): boolean => EMAIL_RE.test(value);

const EXPECTED_MFA_ERROR_CODES = new Set<string>([
  "auth/wrong-password",
  "auth/invalid-credential",
  "auth/invalid-login-credentials",
  "auth/multi-factor-auth-required",
  "auth/invalid-verification-code",
  "auth/code-expired",
  "auth/requires-recent-login",
  "auth/unverified-email",
  "auth/too-many-requests",
  "auth/network-request-failed",
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
  const message = error instanceof Error ? error.message.trim() : "";
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
  if (err?.code === "auth/unverified-email") {
    return "E-mail se nepodařilo automaticky potvrdit pro zapnutí 2FA. Zadej heslo znovu a spusť 2FA ještě jednou.";
  }
  if (err?.code === "auth/too-many-requests") {
    return "Příliš mnoho pokusů. Zkus to prosím později.";
  }
  if (err?.code === "auth/network-request-failed") {
    return "Síťová chyba. Zkontroluj připojení a zkus to znovu.";
  }
  if (err?.code === "auth/operation-not-allowed") {
    return "TOTP MFA není zapnuté ve Firebase Console (Authentication > Multi-factor).";
  }
  if (err?.code) {
    return `${fallback} Firebase vrátil chybu ${err.code}.`;
  }
  if (message) {
    return message;
  }
  return fallback;
};


export default function SettingsPage() {
  const onlineCardQueryAppliedRef = useRef(false);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(true);

  const [position, setPosition] = useState<Position>("manazer7");
  const [mode, setMode] = useState<CommissionMode>("accelerated");
  const [fullName, setFullName] = useState("");
  const [managerEmail, setManagerEmail] = useState("");
  const [directManager, setDirectManager] = useState<DirectManagerInfo | null>(null);
  const [agencyNumber, setAgencyNumber] = useState("");
  const [ico, setIco] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileStatus, setProfileStatus] = useState<InlineStatus | null>(null);
  const [appCacheClearing, setAppCacheClearing] = useState(false);
  const [appCacheStatus, setAppCacheStatus] = useState<InlineStatus | null>(null);
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
  const [mfaDisableConfirmOpen, setMfaDisableConfirmOpen] = useState(false);
  const [mfaEnrollmentSecret, setMfaEnrollmentSecret] = useState<TotpSecret | null>(null);
  const [mfaEnrollmentCode, setMfaEnrollmentCode] = useState("");
  const [mfaQrCodeDataUrl, setMfaQrCodeDataUrl] = useState("");
  const [mfaQrCodeLoading, setMfaQrCodeLoading] = useState(false);
  const [mfaQrCodeError, setMfaQrCodeError] = useState<string | null>(null);
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [passkeyPlatformAvailable, setPasskeyPlatformAvailable] = useState(false);
  const [passkeyCredentials, setPasskeyCredentials] = useState<PasskeyCredentialSummary[]>([]);
  const [passkeysLoading, setPasskeysLoading] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeyDeletingId, setPasskeyDeletingId] = useState<string | null>(null);
  const [passkeyName, setPasskeyName] = useState("");
  const [passkeyStatus, setPasskeyStatus] = useState<InlineStatus | null>(null);
  const [fcmActive, setFcmActive] = useState<boolean | null>(null);
  const [pushPermission, setPushPermission] = useState<NotificationPermission | "unsupported">(
    "unsupported"
  );
  const [pushSupported, setPushSupported] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [notificationSettings, setNotificationSettings] =
    useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [testPushStatus, setTestPushStatus] = useState<string | null>(null);
  const [fontTheme, setFontTheme] = useState<FontTheme>(DEFAULT_FONT_THEME);
  const [reduceMotion, setReduceMotion] = useState(false);
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
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);
  const [subscriptionSnapshot, setSubscriptionSnapshot] =
    useState<SubscriptionSnapshot | null>(null);
  const [subscriptionPayments, setSubscriptionPayments] = useState<SubscriptionPaymentRow[]>([]);
  const [showCareerTimelineHelp, setShowCareerTimelineHelp] = useState(false);
  const [userRequestsView, setUserRequestsView] =
    useState<UserRequestsView>("create");
  const [userRequestStep, setUserRequestStep] = useState(0);
  const [userRequests, setUserRequests] = useState<UserRequestPayload[]>([]);
  const [userRequestsLoading, setUserRequestsLoading] = useState(false);
  const [userRequestsError, setUserRequestsError] = useState<string | null>(null);
  const [userRequestSubject, setUserRequestSubject] =
    useState<UserRequestSubject>("userCreation");
  const [userRequestCorporateEmail, setUserRequestCorporateEmail] = useState("");
  const [userRequestFullName, setUserRequestFullName] = useState("");
  const [userRequestAgencyNumber, setUserRequestAgencyNumber] = useState("");
  const [userRequestManagerEmail, setUserRequestManagerEmail] = useState("");
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
    let isCancelled = false;
    void getPasskeyAvailability().then((availability) => {
      if (isCancelled) return;
      setPasskeySupported(availability.supported);
      setPasskeyPlatformAvailable(availability.platformAvailable);
    });
    return () => {
      isCancelled = true;
    };
  }, []);

  const loadPasskeys = useCallback(async () => {
    if (!user) return;
    setPasskeysLoading(true);
    setPasskeyStatus(null);
    try {
      const credentials = await listPasskeysForUser(user);
      setPasskeyCredentials(credentials);
    } catch (error) {
      setPasskeyStatus({
        type: "error",
        message: resolvePasskeyErrorMessage(
          error,
          "Přístupové klíče se nepodařilo načíst."
        ),
      });
    } finally {
      setPasskeysLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setPasskeyCredentials([]);
      setPasskeyStatus(null);
      return;
    }
    if (activeTab !== "account") return;
    void loadPasskeys();
  }, [activeTab, loadPasskeys, user]);

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
    setMfaDisableConfirmOpen(false);
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
      setMfaDisableConfirmOpen(false);
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

    void import("qrcode")
      .then((qrCodeModule) =>
        qrCodeModule.default.toDataURL(qrUri, {
          width: 220,
          margin: 1,
          errorCorrectionLevel: "M",
        })
      )
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

        let profileManagerEmailForHierarchy = "";

        if (payload?.hasProfile) {
          const data = payload.profile ?? {};
          const profileFullName =
            typeof data.fullName === "string" && data.fullName.trim()
              ? data.fullName.trim()
              : typeof data.name === "string" && data.name.trim()
                ? data.name.trim()
                : nameFromEmail(email);
          setFullName(profileFullName);
          const profileManagerEmail =
            typeof data.managerEmail === "string"
              ? normalizeEmail(data.managerEmail)
              : "";
          profileManagerEmailForHierarchy = profileManagerEmail;
          setManagerEmail(profileManagerEmail);
          setDirectManager(null);

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

          setAgencyNumber(typeof data.agencyNumber === "string" ? data.agencyNumber.trim() : "");
          setIco(
            typeof data.ico === "string"
              ? data.ico.replace(/\D+/g, "").slice(0, PROFILE_ICO_MAX_LEN)
              : ""
          );
          setPhoneNumber(typeof data.phoneNumber === "string" ? data.phoneNumber.trim() : "");
          setProfileStatus(null);

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
          setFullName(nameFromEmail(email));
          setManagerEmail("");
          setDirectManager(null);
          setAgencyNumber("");
          setPhoneNumber("");
          setProfileStatus(null);
          setOnlineCardDraft(defaultOnlineCardFromUser(email, {}));
          setOnlineCardStatus(null);
          if (typeof window !== "undefined") {
            const storedMode = window.localStorage.getItem(
              SETTINGS_KEYS.mode
            ) as CommissionMode | null;
            const storedGoal = window.localStorage.getItem(
              SETTINGS_KEYS.monthlyGoal
            );
            const storedFontTheme = window.localStorage.getItem(
              SETTINGS_KEYS.fontTheme
            );

            if (storedMode) setMode(storedMode);
            const n = storedGoal ? Number(storedGoal) : 0;
            if (Number.isFinite(n)) setMonthlyGoal(n);
            applyFontThemePreference(storedFontTheme);
            const storedMotion = window.localStorage.getItem(
              SETTINGS_KEYS.reduceMotion
            );
            if (storedMotion === "1") {
              setReduceMotion(true);
              applyMotionPreference(true);
            }
          }
        }

        try {
          const resolvedManager = await resolveDirectManagerFromTeam(
            user,
            email,
            profileManagerEmailForHierarchy
          );
          setDirectManager(resolvedManager);
          if (resolvedManager?.email) {
            setManagerEmail(resolvedManager.email);
          }
        } catch (managerError) {
          console.warn("Přímého manažera se nepodařilo načíst z týmové hierarchie:", managerError);
          setDirectManager(
            profileManagerEmailForHierarchy
              ? {
                  email: profileManagerEmailForHierarchy,
                  name: nameFromEmail(profileManagerEmailForHierarchy) || profileManagerEmailForHierarchy,
                }
              : null
          );
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
    if (onlineCardQueryAppliedRef.current) return;
    if (timelineSetupRequired) return;
    if (typeof window === "undefined") return;
    const requestedTab = new URLSearchParams(window.location.search).get("tab");
    if (requestedTab === "onlineCard" || requestedTab === "online-vizitka") {
      setActiveTab("onlineCard");
      onlineCardQueryAppliedRef.current = true;
    }
  }, [timelineSetupRequired]);

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
      invalidateUserProfileCache(user.email);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("app:refresh-user-profile"));
      }
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

  const prependPositionTimelineRow = () => {
    setPositionTimelineSaved(false);
    setTimelineSaveFlashVisible(false);
    setPositionTimelineError(null);
    setPositionTimelineDraft((prev) => {
      const firstRow = [...prev]
        .filter((row) => row.validFrom.trim())
        .sort((a, b) => a.validFrom.localeCompare(b.validFrom))[0];

      return [
        {
          id: createTimelineRowId(),
          position: firstRow?.position ?? position,
          validFrom: "",
          validTo: firstRow?.validFrom ?? "",
        },
        ...prev,
      ];
    });
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

  const handleSaveProfile = async () => {
    const nextFullName = fullName.trim();
    const nextAgencyNumber = agencyNumber.trim();
    const nextIco = ico.replace(/\D+/g, "").slice(0, PROFILE_ICO_MAX_LEN);
    const nextPhoneNumber = phoneNumber.trim();
    if (!nextFullName) {
      setProfileStatus({
        type: "error",
        message: "Jméno a příjmení musí být vyplněné.",
      });
      return;
    }
    if (nextFullName.length > PROFILE_FULL_NAME_MAX_LEN) {
      setProfileStatus({
        type: "error",
        message: `Jméno a příjmení může mít maximálně ${PROFILE_FULL_NAME_MAX_LEN} znaků.`,
      });
      return;
    }
    if (nextAgencyNumber.length > AGENCY_NUMBER_MAX_LEN) {
      setProfileStatus({
        type: "error",
        message: `Agenturní číslo může mít maximálně ${AGENCY_NUMBER_MAX_LEN} znaků.`,
      });
      return;
    }
    if (nextIco && nextIco.length !== PROFILE_ICO_MAX_LEN) {
      setProfileStatus({
        type: "error",
        message: `IČO musí mít ${PROFILE_ICO_MAX_LEN} číslic.`,
      });
      return;
    }
    if (nextPhoneNumber.length > PHONE_NUMBER_MAX_LEN) {
      setProfileStatus({
        type: "error",
        message: `Telefonní číslo může mít maximálně ${PHONE_NUMBER_MAX_LEN} znaků.`,
      });
      return;
    }

    setProfileSaving(true);
    setProfileStatus(null);
    try {
      const saved = await saveUserFields({
        fullName: nextFullName,
        agencyNumber: nextAgencyNumber,
        ico: nextIco,
        phoneNumber: nextPhoneNumber,
      });
      if (!saved.ok) {
        setProfileStatus({ type: "error", message: saved.error });
        return;
      }
      setFullName(nextFullName);
      setAgencyNumber(nextAgencyNumber);
      setIco(nextIco);
      setPhoneNumber(nextPhoneNumber);
      setProfileStatus({
        type: "success",
        message: "Profil byl uložen.",
      });
    } finally {
      setProfileSaving(false);
    }
  };

  const handleClearAppCache = async () => {
    if (appCacheClearing) return;

    setAppCacheClearing(true);
    setAppCacheStatus(null);

    try {
      let deletedCacheCount = 0;
      if (typeof window !== "undefined" && "caches" in window) {
        const cacheKeys = await window.caches.keys();
        const deleted = await Promise.all(cacheKeys.map((key) => window.caches.delete(key)));
        deletedCacheCount = deleted.filter(Boolean).length;
      }

      let serviceWorkerChecked = false;
      if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.getRegistration("/");
        if (registration) {
          await registration.update();
          serviceWorkerChecked = true;
        }
      }

      if (user?.email) {
        invalidateUserProfileCache(user.email);
      }

      const details =
        deletedCacheCount > 0 || serviceWorkerChecked
          ? ` Vymazáno cache: ${deletedCacheCount}${serviceWorkerChecked ? ", service worker zkontrolován" : ""}.`
          : "";
      setAppCacheStatus({
        type: "success",
        message: `Cache aplikace byla obnovena.${details} Stránka se znovu načte.`,
      });

      if (typeof window !== "undefined") {
        window.setTimeout(() => {
          window.location.reload();
        }, 700);
      }
    } catch (error) {
      console.error("Chyba při mazání aplikační cache:", error);
      setAppCacheStatus({
        type: "error",
        message: "Cache aplikace se nepodařilo vymazat. Zkus obnovit stránku ručně.",
      });
      setAppCacheClearing(false);
    }
  };

  const updateOnlineCardDraft = (patch: Partial<OnlineCardDraft>) => {
    setOnlineCardStatus(null);
    setOnlineCardDraft((prev) => {
      const merged = { ...prev, ...patch };
      const fallbackEmail = user?.email ?? "";
      const previousAutoSlug = resolveOnlineCardAutoSlug({
        fullName: prev.fullName,
        email: prev.email,
        fallbackEmail,
      });
      const shouldRefreshAutoSlug =
        !Object.prototype.hasOwnProperty.call(patch, "slug") &&
        (!prev.slug || prev.slug === previousAutoSlug);
      const slug = Object.prototype.hasOwnProperty.call(patch, "slug")
        ? normalizeOnlineCardSlugInput(patch.slug)
        : shouldRefreshAutoSlug
          ? resolveOnlineCardAutoSlug({
              fullName: merged.fullName,
              email: merged.email,
              fallbackEmail,
            })
          : normalizeOnlineCardSlugInput(merged.slug);
      return {
        ...merged,
        slug,
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
    const slug = slugifyOnlineCard(onlineCardDraft.slug);
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
        message: `URL vizitky musí mít alespoň ${ONLINE_CARD_SLUG_MIN_LEN} znaky.`,
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
    setUserRequestAgencyNumber("");
    setUserRequestManagerEmail("");
    setUserRequestMode("standard");
    setUserRequestSubject("userCreation");
    setUserRequestPriority("normal");
    setEditingUserRequestId(null);
    setUserRequestStep(0);
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
    const requestedAgencyNumber = userRequestAgencyNumber.trim();
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
      if (requestedAgencyNumber.length > USER_REQUEST_AGENCY_NUMBER_MAX_LEN) {
        setUserRequestStatus({
          type: "error",
          message: `Agenturní číslo může mít maximálně ${USER_REQUEST_AGENCY_NUMBER_MAX_LEN} znaků.`,
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
            requestedAgencyNumber:
              userRequestSubject === "userCreation" ? requestedAgencyNumber || null : null,
            requestedManagerEmail:
              userRequestSubject === "userCreation" ? requestedManagerEmail || null : null,
            requestedPosition: null,
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
      setUserRequestsView("history");
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
    setUserRequestAgencyNumber(request.requestedUserDraft?.agencyNumber ?? "");
    setUserRequestManagerEmail(request.requestedUserDraft?.managerEmail ?? "");
    setUserRequestMode(request.requestedUserDraft?.commissionMode ?? "standard");
    setUserRequestPriority(request.priority);
    setUserRequestMessage(request.message);
    setUserRequestsView("create");
    setUserRequestStep(1);
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
      setMfaDisableConfirmOpen(false);

      const reauthenticated = await reauthenticateForMfaChange(activeUser);
      if (!reauthenticated) return;

      if (!activeUser.emailVerified) {
        setMfaStatus({
          type: "info",
          message: "Potvrzuji e-mail pro zapnutí 2FA.",
        });
        await confirmEmailForMfaEnrollment(activeUser);
      }

      const enrollmentUser = auth.currentUser ?? activeUser;
      const session = await multiFactor(enrollmentUser).getSession();
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
      setMfaDisableConfirmOpen(false);
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

  const handleCreatePasskey = async () => {
    if (!user) return;
    if (!passkeySupported) {
      setPasskeyStatus({
        type: "error",
        message: "Tento prohlížeč nebo zařízení přístupové klíče nepodporuje.",
      });
      return;
    }

    setPasskeyBusy(true);
    setPasskeyStatus(null);

    try {
      const created = await createPasskeyForUser(
        user,
        passkeyName.trim() || "Moje zařízení"
      );
      setPasskeyCredentials((prev) => [
        created,
        ...prev.filter((item) => item.credentialId !== created.credentialId),
      ]);
      setPasskeyName("");
      setPasskeyStatus({
        type: "success",
        message:
          "Přístupový klíč byl uložený. Příště se na tomto zařízení můžeš přihlásit bez kódu z Microsoft Authenticatoru.",
      });
    } catch (error) {
      setPasskeyStatus({
        type: "error",
        message: resolvePasskeyErrorMessage(
          error,
          "Přístupový klíč se nepodařilo vytvořit."
        ),
      });
    } finally {
      setPasskeyBusy(false);
    }
  };

  const handleDeletePasskey = async (credentialId: string) => {
    if (!user) return;
    setPasskeyDeletingId(credentialId);
    setPasskeyStatus(null);

    try {
      await deletePasskeyForUser(user, credentialId);
      setPasskeyCredentials((prev) =>
        prev.filter((item) => item.credentialId !== credentialId)
      );
      setPasskeyStatus({
        type: "success",
        message: "Přístupový klíč byl odebraný.",
      });
    } catch (error) {
      setPasskeyStatus({
        type: "error",
        message: resolvePasskeyErrorMessage(
          error,
          "Přístupový klíč se nepodařilo odebrat."
        ),
      });
    } finally {
      setPasskeyDeletingId(null);
    }
  };

  if (!user) {
    // redirect už běží, tady jen nic nerenderujeme
    return null;
  }

  const userEmail = user.email ?? "Neznámý e-mail";
  const normalizedUserEmail = normalizeEmail(user.email);
  const profileFullNameDisplay =
    fullName.trim() ||
    onlineCardDraft.fullName.trim() ||
    (normalizedUserEmail ? nameFromEmail(normalizedUserEmail) : "Profil uživatele");
  const profileDisplayName =
    profileFullNameDisplay;
  const profileInitial = profileDisplayName.trim().charAt(0).toUpperCase() || "P";
  const profilePositionLabel =
    POSITIONS.find((item) => item.id === position)?.label ?? "Nenastaveno";
  const commissionModeLabel =
    COMMISSION_MODES.find((item) => item.id === mode)?.label ?? "Nenastaveno";
  const managerNameDisplay =
    directManager?.name ||
    (managerEmail ? nameFromEmail(managerEmail) || managerEmail : "Nenastaveno");
  const managerEmailDisplay = directManager?.email || managerEmail;
  const profileCompletionItems = [
    fullName.trim(),
    agencyNumber.trim(),
    ico.trim(),
    phoneNumber.trim(),
  ];
  const profileCompletionCount = profileCompletionItems.filter(Boolean).length;
  const profileCompletionPercent = Math.round(
    (profileCompletionCount / profileCompletionItems.length) * 100
  );
  const securityScoreItems = [
    true,
    mfaEnabled,
    passkeyCredentials.length > 0,
    true,
  ];
  const securityScoreCount = securityScoreItems.filter(Boolean).length;
  const securityScorePercent = Math.round(
    (securityScoreCount / securityScoreItems.length) * 100
  );
  const securityScoreLabel =
    securityScorePercent >= 100
      ? "Výborné"
      : securityScorePercent >= 75
        ? "Dobré"
        : "Doplnit";
  const passkeySummary = passkeysLoading
    ? "Načítám"
    : passkeyCredentials.length > 0
      ? `${passkeyCredentials.length} aktivní`
      : "Nenastaveno";
  const mfaIssuer = "Bohemka.App";
  const mfaAccountName = normalizedUserEmail || userEmail;
  const mfaQrCodeUri = mfaEnrollmentSecret
    ? mfaEnrollmentSecret.generateQrCodeUrl(mfaAccountName, mfaIssuer)
    : "";
  const enabledNotificationTypes = Object.values(notificationSettings.types).filter(Boolean).length;
  const panelClass =
    "relative overflow-hidden rounded-2xl border border-slate-300 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_62%,#eef2f7_100%)] px-6 py-5 shadow-[0_18px_46px_rgba(15,23,42,0.08)] sm:px-8 sm:py-6";
  const compactPanelClass =
    "relative overflow-hidden rounded-2xl border border-slate-300 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_62%,#eef2f7_100%)] px-4 py-4 shadow-[0_18px_46px_rgba(15,23,42,0.08)] sm:px-6 sm:py-5";
  const fieldClass =
    "w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-[0_8px_18px_rgba(15,23,42,0.04)] outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10";
  const toggleOffClass =
    "border-slate-300 bg-white text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.04)] hover:bg-slate-50";
  const notificationToggleOnClass =
    "border-emerald-500 bg-[linear-gradient(135deg,#34d399_0%,#059669_100%)] shadow-[0_8px_20px_rgba(16,185,129,0.3)]";
  const notificationToggleOffClass =
    "border-slate-300 bg-slate-100";
  const requestMessageLength = userRequestMessage.trim().length;
  const requestNeedsCorporateEmail = userRequestSubject === "userCreation";
  const normalizedRequestCorporateEmail = normalizeEmail(userRequestCorporateEmail);
  const normalizedRequestManagerEmail = normalizeEmail(userRequestManagerEmail);
  const requestFullNameLength = userRequestFullName.trim().length;
  const requestAgencyNumberLength = userRequestAgencyNumber.trim().length;
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
  const requestAgencyNumberValid =
    !requestNeedsCorporateEmail ||
    requestAgencyNumberLength <= USER_REQUEST_AGENCY_NUMBER_MAX_LEN;
  const canSubmitUserRequest =
    requestMessageLength >= USER_REQUEST_MESSAGE_MIN_LEN &&
    requestMessageLength <= USER_REQUEST_MESSAGE_MAX_LEN &&
    requestCorporateEmailValid &&
    requestManagerEmailValid &&
    requestFullNameValid &&
    requestAgencyNumberValid;
  const currentUserRequestStep = Math.min(
    Math.max(userRequestStep, 0),
    USER_REQUEST_STEPS.length - 1
  );
  const currentUserRequestStepId =
    USER_REQUEST_STEPS[currentUserRequestStep]?.id ?? "type";
  const otherRequestMessageValid =
    requestNeedsCorporateEmail ||
    (requestMessageLength >= USER_REQUEST_MESSAGE_MIN_LEN &&
      requestMessageLength <= USER_REQUEST_MESSAGE_MAX_LEN);
  const requestDetailsStepValid =
    requestNeedsCorporateEmail
      ? requestCorporateEmailValid &&
        requestManagerEmailValid &&
        requestFullNameValid &&
        requestAgencyNumberValid
      : otherRequestMessageValid;
  const requestCurrentStepCanContinue =
    currentUserRequestStepId === "details"
      ? requestDetailsStepValid
      : currentUserRequestStepId === "message"
        ? canSubmitUserRequest
        : true;
  const requestStepperProgress =
    ((currentUserRequestStep + 1) / USER_REQUEST_STEPS.length) * 100;
  const goToPreviousUserRequestStep = () => {
    setUserRequestStatus(null);
    setUserRequestStep((prev) => Math.max(0, prev - 1));
  };
  const goToNextUserRequestStep = () => {
    if (currentUserRequestStepId === "details" && !requestDetailsStepValid) {
      setUserRequestStatus({
        type: "error",
        message: requestNeedsCorporateEmail
          ? "Nejdřív vyplň platné údaje žádosti."
          : `Popis žádosti musí mít alespoň ${USER_REQUEST_MESSAGE_MIN_LEN} znaků.`,
      });
      return;
    }
    if (currentUserRequestStepId === "message" && !canSubmitUserRequest) {
      setUserRequestStatus({
        type: "error",
        message: `Popis žádosti musí mít alespoň ${USER_REQUEST_MESSAGE_MIN_LEN} znaků.`,
      });
      return;
    }
    setUserRequestStatus(null);
    setUserRequestStep((prev) =>
      Math.min(USER_REQUEST_STEPS.length - 1, prev + 1)
    );
  };
  const onlineCardSlugNormalized = slugifyOnlineCard(onlineCardDraft.slug);
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

    void import("qrcode")
      .then((qrCodeModule) =>
        qrCodeModule.default.toDataURL(onlineCardPublicUrl, {
          width: 900,
          margin: 2,
          errorCorrectionLevel: "M",
          color: {
            dark: "#0f172a",
            light: "#ffffff",
          },
        })
      )
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
                <Image
                  src={activeOnlineCardOfficePhoto}
                  alt={`Náhled kanceláře ${onlineCardOfficePhotoIndex + 1}`}
                  width={960}
                  height={560}
                  sizes="(min-width: 640px) 640px, 100vw"
                  unoptimized
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
                      <Image
                        src={photoUrl}
                        alt={`Miniatura kanceláře ${index + 1}`}
                        width={80}
                        height={56}
                        sizes="80px"
                        unoptimized
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
  const onlineCardStudioPublishPanel = (
    <aside className="relative overflow-hidden rounded-[30px] border border-violet-300/25 bg-[radial-gradient(circle_at_8%_0%,rgba(196,181,253,0.24),transparent_30%),linear-gradient(135deg,#140b2f_0%,#24104f_46%,#5b21b6_100%)] p-4 text-white shadow-[0_26px_70px_rgba(60,18,122,0.34)] sm:p-5">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.08)_0%,transparent_45%,rgba(255,255,255,0.1)_100%)]" />
      <div className="relative z-10 space-y-4">
        <div className="min-w-0 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-2 rounded-full border border-violet-200/25 bg-white/[0.08] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] !text-violet-100">
                <Globe className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
                Veřejná online vizitka
              </p>
              <h2 className="mt-3 text-2xl font-extrabold tracking-tight !text-white sm:text-3xl">
                Publikace a sdílení vizitky
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 !text-violet-100/80">
                Zapni veřejnou stránku, zkontroluj URL a ulož změny. Samotný editor je hned pod tímto panelem přes celou šířku.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                updateOnlineCardDraft({
                  enabled: !onlineCardDraft.enabled,
                })
              }
              className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                onlineCardDraft.enabled
                  ? "border-emerald-200/45 bg-emerald-300/18 !text-emerald-50 shadow-[0_14px_30px_rgba(16,185,129,0.18)]"
                  : "border-white/18 bg-white/[0.08] !text-violet-100 hover:bg-white/[0.12]"
              }`}
              aria-pressed={onlineCardDraft.enabled}
            >
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  onlineCardDraft.enabled ? "bg-emerald-200" : "bg-violet-200/60"
                }`}
                aria-hidden="true"
              />
              {onlineCardDraft.enabled ? "Zapnuto" : "Vypnuto"}
            </button>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="min-w-0 rounded-2xl border border-white/14 bg-white/[0.08] px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] !text-violet-100/72">
                Veřejná URL
              </p>
              {onlineCardPublicUrl ? (
                <p className="mt-2 break-all text-base font-bold leading-6 !text-white">
                  {onlineCardPublicUrl}
                </p>
              ) : (
                <p className="mt-2 text-sm font-semibold !text-violet-100/74">
                  Pro vygenerování URL nejdřív vyplň jméno.
                </p>
              )}
              <div className="mt-3 rounded-xl border border-white/14 bg-slate-950/20 px-3 py-2">
                <label
                  htmlFor="online-card-slug"
                  className="text-[10px] font-semibold uppercase tracking-[0.18em] !text-violet-100/70"
                >
                  Adresa za /vizitka/
                </label>
                <div className="mt-1 flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center">
                  <span className="shrink-0 text-xs font-semibold !text-violet-100/66 sm:text-sm">
                    bohemka.app/vizitka/
                  </span>
                  <input
                    id="online-card-slug"
                    type="text"
                    value={onlineCardDraft.slug}
                    onChange={(event) => updateOnlineCardDraft({ slug: event.target.value })}
                    placeholder="jmeno-prijmeni"
                    maxLength={ONLINE_CARD_SLUG_MAX_LEN}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className="min-w-0 flex-1 rounded-lg border border-white/16 bg-white/[0.08] px-2 py-1.5 text-sm font-bold !text-white outline-none transition placeholder:!text-violet-100/34 focus:border-violet-200/70 focus:bg-white/[0.12]"
                  />
                </div>
              </div>
              <p className="mt-2 text-xs !text-violet-100/68">
                Použij malá písmena, čísla a pomlčky. Pokud vizitku vypneš, URL zůstane uložená, ale nebude veřejně dostupná.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {onlineCardPublicUrl ? (
                <a
                  href={onlineCardPublicUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/24 bg-white px-4 py-2 text-sm font-semibold text-violet-950 transition hover:bg-violet-50"
                >
                  Otevřít vizitku
                  <ExternalLink size={14} strokeWidth={2.2} aria-hidden="true" />
                </a>
              ) : null}
              <button
                type="button"
                onClick={handleOpenOnlineCardQr}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/[0.1] px-4 py-2 text-sm font-semibold !text-white transition hover:bg-white/[0.16]"
              >
                QR kód
                <QrCodeIcon size={14} strokeWidth={2.2} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => void handleSaveOnlineCard()}
                disabled={onlineCardSaving || !onlineCardPublishReady}
                className="inline-flex items-center justify-center rounded-full border border-white/25 bg-white px-4 py-2 text-sm font-bold text-violet-950 shadow-[0_16px_36px_rgba(255,255,255,0.13)] transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {onlineCardSaving ? "Ukládám..." : "Uložit vizitku"}
              </button>
            </div>
          </div>

          {onlineCardStatus ? (
            <p
              className={`w-fit max-w-full rounded-2xl border px-3 py-2 text-xs font-semibold ${
                onlineCardStatus.type === "success"
                  ? "border-emerald-200/25 bg-emerald-300/12 !text-emerald-50"
                  : onlineCardStatus.type === "info"
                    ? "border-white/16 bg-white/[0.08] !text-violet-50"
                    : "border-rose-200/25 bg-rose-300/12 !text-rose-50"
              }`}
            >
              {onlineCardStatus.message}
            </p>
          ) : null}
        </div>
      </div>
    </aside>
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

              </section>
              )}

              {activeTab === "profile" && !timelineSetupRequired && (
                <ProfileSettingsPanel
                  profileInitial={profileInitial}
                  profileDisplayName={profileDisplayName}
                  profileStatus={profileStatus}
                  completionPercent={profileCompletionPercent}
                  positionLabel={profilePositionLabel}
                  commissionModeLabel={commissionModeLabel}
                  managerNameDisplay={managerNameDisplay}
                  managerEmailDisplay={managerEmailDisplay}
                  fieldClass={fieldClass}
                  fullName={fullName}
                  userEmail={userEmail}
                  agencyNumber={agencyNumber}
                  ico={ico}
                  phoneNumber={phoneNumber}
                  appCacheStatus={appCacheStatus}
                  appCacheClearing={appCacheClearing}
                  profileSaving={profileSaving}
                  fullNameMaxLength={PROFILE_FULL_NAME_MAX_LEN}
                  agencyNumberMaxLength={AGENCY_NUMBER_MAX_LEN}
                  icoMaxLength={PROFILE_ICO_MAX_LEN}
                  phoneNumberMaxLength={PHONE_NUMBER_MAX_LEN}
                  onFullNameChange={(value) => {
                    setFullName(value);
                    setProfileStatus(null);
                  }}
                  onAgencyNumberChange={(value) => {
                    setAgencyNumber(value);
                    setProfileStatus(null);
                  }}
                  onIcoChange={(value) => {
                    setIco(value);
                    setProfileStatus(null);
                  }}
                  onPhoneNumberChange={(value) => {
                    setPhoneNumber(value);
                    setProfileStatus(null);
                  }}
                  onClearAppCache={handleClearAppCache}
                  onSaveProfile={handleSaveProfile}
                />
              )}

              {activeTab === "career" && (
                <CareerTimelinePanel
                  positions={POSITIONS}
                  rows={positionTimelineDraft}
                  fieldClass={fieldClass}
                  locked={positionTimelineLocked}
                  saving={positionTimelineSaving}
                  saved={positionTimelineSaved}
                  error={positionTimelineError}
                  helpOpen={showCareerTimelineHelp}
                  onHelpOpen={() => setShowCareerTimelineHelp(true)}
                  onHelpClose={() => setShowCareerTimelineHelp(false)}
                  onAddRow={addPositionTimelineRow}
                  onPrependRow={prependPositionTimelineRow}
                  onUnlock={unlockPositionTimeline}
                  onUpdateRow={updatePositionTimelineRow}
                  onRemoveRow={removePositionTimelineRow}
                  onSave={savePositionTimeline}
                />
              )}

              {activeTab === "notifications" && !timelineSetupRequired && (
                <NotificationsSettingsPanel
                  className={panelClass}
                  settings={notificationSettings}
                  enabledTypesCount={enabledNotificationTypes}
                  fcmActive={fcmActive}
                  pushPermission={pushPermission}
                  pushSupported={pushSupported}
                  pushBusy={pushBusy}
                  toggleOnClass={notificationToggleOnClass}
                  toggleOffClass={notificationToggleOffClass}
                  testPushStatus={testPushStatus}
                  onEnableBrowserPush={handleEnableBrowserPush}
                  onDisableBrowserPush={handleDisableBrowserPush}
                  onToggleType={toggleNotificationType}
                  onTestPush={handleTestPush}
                  onSetIntranetMode={setIntranetNotificationMode}
                  onToggleIntranetSection={toggleIntranetNotificationSection}
                />
              )}

              {activeTab === "onlineCard" && !timelineSetupRequired && (
                <OnlineCardSettingsPanel
                  className={panelClass}
                  draft={onlineCardDraft}
                  publishPanel={onlineCardStudioPublishPanel}
                  officeSection={onlineCardStudioOfficeSection}
                  contactSection={onlineCardStudioContactSection}
                  fullscreen={onlineCardStudioFullscreen}
                  saving={onlineCardSaving}
                  publishReady={onlineCardPublishReady}
                  qrOpen={onlineCardQrOpen}
                  qrLoading={onlineCardQrLoading}
                  qrDataUrl={onlineCardQrDataUrl}
                  qrError={onlineCardQrError}
                  publicUrl={onlineCardPublicUrl}
                  onDraftPatch={(patch) => updateOnlineCardDraft(patch)}
                  onPreviewMeetingCta={handlePreviewMeetingCta}
                  onFullscreenChange={setOnlineCardStudioFullscreen}
                  onSave={handleSaveOnlineCard}
                  onQrClose={() => setOnlineCardQrOpen(false)}
                  onDownloadQr={handleDownloadOnlineCardQr}
                />
              )}

              {activeTab === "requests" && !timelineSetupRequired && (
                <UserRequestsPanel
                  className={panelClass}
                  fieldClass={fieldClass}
                  toggleOffClass={toggleOffClass}
                  commissionModes={COMMISSION_MODES}
                  view={userRequestsView}
                  requests={userRequests}
                  requestsLoading={userRequestsLoading}
                  requestsError={userRequestsError}
                  requestStatus={userRequestStatus}
                  editingRequestId={editingUserRequestId}
                  currentStep={currentUserRequestStep}
                  currentStepId={currentUserRequestStepId}
                  stepperProgress={requestStepperProgress}
                  requestCurrentStepCanContinue={requestCurrentStepCanContinue}
                  canSubmitRequest={canSubmitUserRequest}
                  userRequestSubmitting={userRequestSubmitting}
                  deletingRequestId={userRequestDeletingId}
                  subject={userRequestSubject}
                  corporateEmail={userRequestCorporateEmail}
                  fullName={userRequestFullName}
                  agencyNumber={userRequestAgencyNumber}
                  managerEmail={userRequestManagerEmail}
                  mode={userRequestMode}
                  priority={userRequestPriority}
                  message={userRequestMessage}
                  requestMessageLength={requestMessageLength}
                  userRequestsNowMs={userRequestsNowMs}
                  onViewChange={(nextView) => {
                    setUserRequestsView(nextView);
                    setUserRequestStatus(null);
                    if (nextView === "history") void loadUserRequests();
                  }}
                  onCancelEdit={() => {
                    resetUserRequestForm();
                    setUserRequestStatus(null);
                  }}
                  onSubjectChange={(nextSubject) => {
                    setUserRequestSubject(nextSubject);
                    setUserRequestStatus(null);
                  }}
                  onCorporateEmailChange={(value) => {
                    setUserRequestCorporateEmail(value);
                    setUserRequestStatus(null);
                  }}
                  onFullNameChange={(value) => {
                    setUserRequestFullName(value);
                    setUserRequestStatus(null);
                  }}
                  onAgencyNumberChange={(value) => {
                    setUserRequestAgencyNumber(value);
                    setUserRequestStatus(null);
                  }}
                  onManagerEmailChange={(value) => {
                    setUserRequestManagerEmail(value);
                    setUserRequestStatus(null);
                  }}
                  onModeChange={(nextMode) => {
                    setUserRequestMode(nextMode);
                    setUserRequestStatus(null);
                  }}
                  onPriorityChange={setUserRequestPriority}
                  onMessageChange={(value) => {
                    setUserRequestMessage(value);
                    setUserRequestStatus(null);
                  }}
                  onSubmit={handleSubmitUserRequest}
                  onPreviousStep={goToPreviousUserRequestStep}
                  onNextStep={goToNextUserRequestStep}
                  onRefreshRequests={loadUserRequests}
                  onStartEditRequest={handleStartEditUserRequest}
                  onDeleteRequest={handleDeleteUserRequest}
                />
              )}
            </div>

            {activeTab === "design" && !timelineSetupRequired && (
              <DesignSettingsPanel
                className={compactPanelClass}
                fontTheme={fontTheme}
                reduceMotion={reduceMotion}
                toggleOffClass={toggleOffClass}
                onFontThemeChange={(theme) => {
                  void handleFontThemeChange(theme);
                }}
                onReduceMotionChange={(value) => {
                  void handleReduceMotionChange(value);
                }}
              />
            )}

            {activeTab === "subscription" && !timelineSetupRequired && (
              <SubscriptionSettingsPanel
                className={panelClass}
                loading={subscriptionLoading}
                error={subscriptionError}
                snapshot={subscriptionSnapshot}
                payments={subscriptionPayments}
              />
            )}

            {/* Zabezpečení */}
            {activeTab === "account" && !timelineSetupRequired && (
              <AccountSecurityPanel
                className={panelClass}
                fieldClass={fieldClass}
                userEmail={userEmail}
                mfaEnabled={mfaEnabled}
                securityScoreLabel={securityScoreLabel}
                securityScorePercent={securityScorePercent}
                passkeySummary={passkeySummary}
                showPasswordForm={showPasswordForm}
                currentPassword={currentPassword}
                newPassword={newPassword}
                confirmPassword={confirmPassword}
                changingPassword={changingPassword}
                passwordStatus={passwordStatus}
                passkeySupported={passkeySupported}
                passkeyPlatformAvailable={passkeyPlatformAvailable}
                passkeyCredentials={passkeyCredentials}
                passkeysLoading={passkeysLoading}
                passkeyBusy={passkeyBusy}
                passkeyDeletingId={passkeyDeletingId}
                passkeyName={passkeyName}
                passkeyStatus={passkeyStatus}
                mfaPassword={mfaPassword}
                mfaBusy={mfaBusy}
                mfaEnrollmentSecretKey={mfaEnrollmentSecret?.secretKey ?? null}
                mfaEnrollmentCode={mfaEnrollmentCode}
                mfaQrCodeDataUrl={mfaQrCodeDataUrl}
                mfaQrCodeLoading={mfaQrCodeLoading}
                mfaQrCodeError={mfaQrCodeError}
                mfaQrCodeUri={mfaQrCodeUri}
                mfaDisableConfirmOpen={mfaDisableConfirmOpen}
                mfaTotpLabel={mfaTotpLabel}
                mfaReauthCode={mfaReauthCode}
                mfaStatus={mfaStatus}
                onShowPasswordForm={() => setShowPasswordForm(true)}
                onCancelPasswordChange={() => {
                  setShowPasswordForm(false);
                  setCurrentPassword("");
                  setNewPassword("");
                  setConfirmPassword("");
                  setPasswordStatus(null);
                }}
                onCurrentPasswordChange={setCurrentPassword}
                onNewPasswordChange={setNewPassword}
                onConfirmPasswordChange={setConfirmPassword}
                onChangePassword={handleChangePassword}
                onPasskeyNameChange={setPasskeyName}
                onCreatePasskey={handleCreatePasskey}
                onDeletePasskey={handleDeletePasskey}
                onMfaPasswordChange={setMfaPassword}
                onMfaEnrollmentCodeChange={setMfaEnrollmentCode}
                onMfaReauthCodeChange={setMfaReauthCode}
                onStartMfaEnrollment={handleStartMfaEnrollment}
                onConfirmMfaEnrollment={handleConfirmMfaEnrollment}
                onCancelMfaEnrollment={() => {
                  clearMfaDraft();
                  setMfaStatus(null);
                }}
                onOpenDisableMfa={() => {
                  setMfaDisableConfirmOpen(true);
                  setMfaPassword("");
                  setMfaReauthCode("");
                  setMfaStatus(null);
                }}
                onCancelDisableMfa={() => {
                  setMfaDisableConfirmOpen(false);
                  setMfaPassword("");
                  setMfaReauthCode("");
                  setMfaStatus(null);
                }}
                onDisableMfa={handleDisableMfa}
              />
            )}

          </>
        )}
        </div>
      </div>
    </AppLayout>
  );
}
