"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  AlertTriangle,
  BellRing,
  Building2,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  IdCard,
  KeyRound,
  Loader2,
  Inbox,
  Landmark,
  Link2,
  Mail,
  Megaphone,
  Pencil,
  PhoneCall,
  QrCode,
  RefreshCcw,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Snail,
  Trash2,
  UserCheck2,
  UserPlus,
  UserRound,
  X,
  Zap,
} from "lucide-react";
import { onAuthStateChanged, type User } from "firebase/auth";
import Image from "next/image";
import Link from "next/link";

import { AppLayout } from "@/components/AppLayout";
import { auth } from "@/app/firebase";
import { setAdminImpersonationState } from "@/app/lib/adminImpersonation";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import type { CommissionMode, Position } from "@/app/types/domain";
import {
  adminRoleAtLeast,
  canCreateUserAccounts,
  resolveAdminRoleFromClaims,
  type AdminRole,
} from "@/lib/adminAccess";

type EndCollaborationRequestStatus =
  | "pending"
  | "processing"
  | "approved"
  | "rejected"
  | "failed";

type EndCollaborationRequestPayload = {
  id: string;
  status: EndCollaborationRequestStatus;
  requestedByEmail: string;
  targetEmail: string;
  targetName: string;
  expectedManagerEmail: string | null;
  successorEmail: string;
  transferableContracts: number;
  directSubordinates: number;
  createdAtMs: number;
  updatedAtMs: number;
  decidedAtMs: number | null;
  decidedByEmail: string | null;
  decisionReason: string | null;
  summary: {
    successorEmail: string;
    transferredContracts: number;
    reassignedSubordinates: number;
  } | null;
  failureReason: string | null;
};

type EndCollaborationRequestsApiSuccess = {
  ok: true;
  requests?: EndCollaborationRequestPayload[];
};

type UserRequestSubject = "userCreation" | "other";
type UserRequestPriority = "normal" | "urgent";
type UserRequestStatus = "pending" | "needsInfo" | "accepted" | "rejected";

type UserCreationRequestDraft = {
  fullName: string | null;
  agencyNumber: string | null;
  managerEmail: string | null;
  position: Position | null;
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

type UserRequestsApiSuccess = {
  ok?: boolean;
  requests?: UserRequestPayload[];
};

type UserRequestUpdateResponse = {
  ok?: boolean;
  request?: UserRequestPayload;
  error?: string;
};

type UnifiedRequestItem =
  | {
      kind: "endCollaboration";
      id: string;
      createdAtMs: number;
      activityAtMs: number;
      searchable: string;
      pending: boolean;
      request: EndCollaborationRequestPayload;
    }
  | {
      kind: "userRequest";
      id: string;
      createdAtMs: number;
      activityAtMs: number;
      searchable: string;
      pending: boolean;
      request: UserRequestPayload;
    };

const normalizeEmail = (value: string | null | undefined): string =>
  (value ?? "").trim().toLowerCase();

const nameFromEmail = (email: string): string => {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[.\-_]/).filter(Boolean);
  if (!parts.length) return email;
  return parts
    .map((part) =>
      part.length === 0
        ? part
        : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    )
    .join(" ");
};

const formatDateTime = (valueMs: number | null | undefined): string => {
  if (!valueMs || !Number.isFinite(valueMs)) return "—";
  return new Date(valueMs).toLocaleString("cs-CZ");
};

const formatAuthDateTime = (value: string | null | undefined): string => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("cs-CZ", { timeZone: "Europe/Prague" });
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

const PAID_SUBSCRIPTION_PLAN_KEYS: PaidSubscriptionPlanValue[] = [
  "monthly",
  "semiannual",
  "yearly",
];

const isPaidSubscriptionPlanValue = (
  value: string | null | undefined
): value is PaidSubscriptionPlanValue =>
  value === "monthly" || value === "semiannual" || value === "yearly";

const SUBSCRIPTION_DIRECTORY_FILTERS: Array<{
  id: AdminSubscriptionDirectoryFilter;
  label: string;
}> = [
  { id: "all", label: "Všichni" },
  { id: "overdue", label: "Po splatnosti" },
  { id: "dueSoon", label: "Blížící se platba (7 dní)" },
];

const getSubscriptionStateLabel = (row: {
  subscription?: { effectiveState?: string; status?: string };
}) => {
  if (row.subscription?.effectiveState === "active") return "Aktivní";
  if (row.subscription?.effectiveState === "grace") return "Po splatnosti";
  if (row.subscription?.status === "unpaid") return "Nezaplaceno";
  return "Blokováno";
};

const getSubscriptionStatePillClass = (row: {
  subscription?: { effectiveState?: string; status?: string };
}) => {
  if (row.subscription?.effectiveState === "active") {
    return "border-violet-500 bg-violet-500 text-white";
  }
  if (row.subscription?.effectiveState === "grace") {
    return "border-amber-600 bg-amber-500 text-slate-950";
  }
  if (row.subscription?.status === "unpaid") {
    return "border-rose-600 bg-rose-500 text-white";
  }
  return "border-slate-700 bg-slate-600 text-white";
};

const getSubscriptionPlanPillClass = (plan: unknown): string => {
  const normalized = typeof plan === "string" ? plan.trim().toLowerCase() : "";
  if (normalized === "unlimited") {
    return "border-amber-600 bg-amber-400 text-amber-950";
  }
  if (normalized === "monthly") {
    return "border-sky-600 bg-sky-500 text-white";
  }
  if (normalized === "semiannual") {
    return "border-indigo-600 bg-indigo-500 text-white";
  }
  if (normalized === "yearly") {
    return "border-cyan-600 bg-cyan-500 text-white";
  }
  return "border-slate-600 bg-slate-500 text-white";
};

const formatDaysUntilDue = (days: number | null | undefined): string => {
  if (typeof days !== "number" || !Number.isFinite(days)) return "";
  if (days <= 0) return "Končí dnes";
  if (days === 1) return "Končí za 1 den";
  if (days < 5) return `Končí za ${days} dny`;
  return `Končí za ${days} dní`;
};

const USER_REQUEST_SLA_NORMAL_MS = 72 * 60 * 60 * 1000;
const USER_REQUEST_SLA_URGENT_MS = 8 * 60 * 60 * 1000;

const formatDurationCompact = (durationMs: number): string => {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return "0 min";
  const totalMinutes = Math.floor(durationMs / 60_000);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) return `${totalHours} h`;
  const totalDays = Math.floor(totalHours / 24);
  return `${totalDays} d`;
};

const formatUserRequestSlaLimit = (priority: UserRequestPriority): string =>
  priority === "urgent" ? "8 h" : "3 dny";

const buildEndCollaborationWaitInfo = (
  request: EndCollaborationRequestPayload,
  nowMs: number
) => {
  const waiting = request.status === "pending" || request.status === "processing";
  const sinceMs = waiting ? request.updatedAtMs || request.createdAtMs : null;
  const elapsedMs =
    sinceMs && Number.isFinite(sinceMs) ? Math.max(0, nowMs - sinceMs) : 0;

  return {
    waiting,
    elapsedLabel: formatDurationCompact(elapsedMs),
  };
};

const buildAdminUserRequestSlaInfo = (request: UserRequestPayload, nowMs: number) => {
  const waiting = request.status === "pending";
  const sinceMs = waiting ? request.updatedAtMs || request.createdAtMs : null;
  const elapsedMs =
    sinceMs && Number.isFinite(sinceMs) ? Math.max(0, nowMs - sinceMs) : 0;
  const slaLimitMs =
    request.priority === "urgent" ? USER_REQUEST_SLA_URGENT_MS : USER_REQUEST_SLA_NORMAL_MS;
  const isOverdueUrgent =
    waiting && request.priority === "urgent" && elapsedMs > slaLimitMs;

  return {
    waiting,
    elapsedLabel: formatDurationCompact(elapsedMs),
    slaLimitLabel: formatUserRequestSlaLimit(request.priority),
    isOverdueUrgent,
  };
};

const statusPillClass: Record<EndCollaborationRequestStatus, string> = {
  pending: "border-amber-300 bg-amber-50 text-amber-800",
  processing: "border-sky-300 bg-sky-50 text-sky-800",
  approved: "border-violet-300 bg-violet-50 text-violet-800",
  rejected: "border-slate-300 bg-slate-100 text-slate-700",
  failed: "border-rose-300 bg-rose-50 text-rose-800",
};

const statusLabel: Record<EndCollaborationRequestStatus, string> = {
  pending: "Čeká na schválení",
  processing: "Zpracovává se",
  approved: "Schváleno",
  rejected: "Odmítnuto",
  failed: "Chyba zpracování",
};

const userRequestSubjectLabel: Record<UserRequestSubject, string> = {
  userCreation: "Založení uživatele",
  other: "Jiné",
};

const userRequestPriorityLabel: Record<UserRequestPriority, string> = {
  normal: "Běžná",
  urgent: "Urgentní",
};

const userRequestStatusPillClass: Record<UserRequestStatus, string> = {
  pending: "border-amber-300 bg-amber-50 text-amber-800",
  needsInfo: "border-sky-300 bg-sky-50 text-sky-800",
  accepted: "border-violet-300 bg-violet-50 text-violet-800",
  rejected: "border-slate-300 bg-slate-100 text-slate-700",
};

const userRequestStatusLabel: Record<UserRequestStatus, string> = {
  pending: "Čeká",
  needsInfo: "Potřeba doplnit",
  accepted: "Akceptováno",
  rejected: "Odmítnuto",
};

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

const ONLINE_CARD_PUBLIC_BASE_URL = "https://bohemka.app";

const ADMIN_BROADCAST_EMOJI_OPTIONS = ["📣", "🔔", "✅", "⚠️", "🎉", "💡", "📄", "🔥"];

const ADMIN_BROADCAST_TARGETS = [
  { path: "/", label: "Domů" },
  { path: "/smlouvy", label: "Smlouvy" },
  { path: "/pomucky", label: "Pomůcky" },
  { path: "/intranet", label: "Intranet" },
  { path: "/muj-tym", label: "Můj tým" },
  { path: "/tipy", label: "Tipy" },
  { path: "/posta", label: "Pošta" },
  { path: "/cashflow", label: "Cashflow" },
  { path: "/nastaveni?tab=notifications", label: "Nastavení notifikací" },
  { path: "/pomucky/dokumenty", label: "Dokumenty" },
  { path: "/pomucky/zprava-tymu", label: "Zpráva týmu" },
] as const;

const ADMIN_BROADCAST_TOOL_TARGETS = [
  { path: "/pomucky", label: "Přehled pomůcek" },
  { path: "/pomucky/argumenty", label: "Argumenty" },
  { path: "/pomucky/dokumenty", label: "Dokumenty" },
  { path: "/pomucky/zaznam", label: "Záznam z jednání" },
  { path: "/pomucky/vypoved-smlouvy", label: "Výpověď smlouvy" },
  { path: "/pomucky/jak-stiham-vypoved-smlouvy", label: "Jak stíhám výpověď smlouvy?" },
  { path: "/pomucky/tvorba", label: "Tvorba PDF" },
  { path: "/pomucky/ai-asistent", label: "AI Asistent" },
  { path: "/nastaveni?tab=onlineCard", label: "Online Vizitka" },
  { path: "/pomucky/hypoteka-vlastni-zdroje", label: "Hypotéka: vlastní zdroje" },
  { path: "/pomucky/statistika", label: "Statistika" },
  { path: "/pomucky/export-produkce", label: "Export produkce" },
  { path: "/pomucky/plan-produkce", label: "Plán produkce" },
  { path: "/pomucky/zlato", label: "Zlato" },
  { path: "/cuzk", label: "Nahlížení do katastru nemovitostí" },
  { path: "/pomucky/proklepka-vozidla", label: "Proklepka vozidla" },
  { path: "/pomucky/ares", label: "ARES" },
  { path: "/pomucky/projekce-vykonu", label: "Projekce výkonu" },
  { path: "/pomucky/nastaveni-zivotniho-pojisteni", label: "Jak nastavit životní pojištění" },
  { path: "/pomucky/srovnavac-trvalych-nasledku", label: "Srovnavač trvalých následků" },
  { path: "/pomucky/srovnavac-zivotniho-pojisteni", label: "Srovnavač životního pojištění" },
] as const;

const ADMIN_BROADCAST_GROUPS = [
  { id: "advisors", label: "Poradci" },
  { id: "managers", label: "Manažeři" },
  { id: "specialists", label: "Specialisté" },
] as const;

type NewUserAccountType = "advisor" | "tipster";

const ACCOUNT_TYPES: { id: NewUserAccountType; label: string; description: string }[] = [
  {
    id: "advisor",
    label: "Vázaný zástupce",
    description: "Běžný interní účet s přístupem do aplikace.",
  },
  {
    id: "tipster",
    label: "Tipař",
    description: "Omezený účet pouze pro odesílání tipů.",
  },
];

const formatAccountTypeLabel = (value: string | null | undefined): string => {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "tipster") return "Tipař";
  if (normalized === "advisor") return "Vázaný zástupce";
  return "Bez typu účtu";
};

const formatPositionLabel = (value: string | null | undefined): string => {
  const raw = (value ?? "").trim();
  if (!raw) return "";

  const known = POSITIONS.find((position) => position.id === raw)?.label;
  if (known) return known;

  const compact = raw.toLowerCase().replace(/[\s_-]+/g, "");
  const poradceMatch = compact.match(/^poradce(\d+)$/);
  if (poradceMatch?.[1]) return `Poradce ${poradceMatch[1]}`;
  const managerMatch = compact.match(/^(manazer|manažer|manager)(\d+)$/);
  if (managerMatch?.[2]) return `Manažer ${managerMatch[2]}`;

  return raw;
};

const normalizePositionKey = (value: string | null | undefined): string =>
  (value ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");

const isAdvisorPositionKey = (value: string | null | undefined): boolean =>
  /^poradce\d*$/.test(normalizePositionKey(value));

const isManagerPositionKey = (value: string | null | undefined): boolean =>
  /^(manazer|manažer|manager)\d*$/.test(normalizePositionKey(value));

const formatAdminBroadcastDateTime = (value: string | null | undefined): string => {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("cs-CZ", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const toDatetimeLocalInputValue = (date: Date): string => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
};

const NEW_USER_AGENCY_NUMBER_MAX_LEN = 80;
const CREATE_USER_CELEBRATION_MS = 2600;
const CREATE_USER_CONFETTI_COLORS = [
  "#c084fc",
  "#a855f7",
  "#8b5cf6",
  "#7c3aed",
  "#fbbf24",
  "#f472b6",
  "#60a5fa",
];

const CREATE_USER_CONFETTI_PIECES = Array.from({ length: 52 }, (_, index) => {
  const angle = (index / 52) * Math.PI * 2;
  const radius = 118 + (index % 9) * 18;
  return {
    x: Math.round(Math.cos(angle) * radius),
    y: Math.round(Math.sin(angle) * radius - 26 - (index % 4) * 8),
    rotate: ((index * 53) % 360) - 180,
    delayMs: (index % 10) * 22,
    color: CREATE_USER_CONFETTI_COLORS[index % CREATE_USER_CONFETTI_COLORS.length],
    shapeClass:
      index % 5 === 0
        ? "h-2.5 w-2.5 rounded-full"
        : index % 3 === 0
          ? "h-2 w-4 rounded-[3px]"
          : "h-3 w-1.5 rounded-[2px]",
  };
});

type CreateUserResponse = {
  ok?: boolean;
  email?: string;
  uid?: string;
  error?: string;
};

type InlineStatus = {
  type: "success" | "error" | "info";
  message: string;
};

type AdminSection =
  | "requests"
  | "createUser"
  | "users"
  | "broadcasts"
  | "subscriptions"
  | "security";

type SubscriptionPlanValue = "monthly" | "semiannual" | "yearly" | "unlimited";
type PaidSubscriptionPlanValue = Exclude<SubscriptionPlanValue, "unlimited">;

type AdminSubscriptionPaymentRow = {
  id: string;
  plan: string;
  amountCzk: number;
  periodFrom: string;
  periodUntil: string;
  note: string | null;
  createdAtMs: number | null;
  createdByEmail: string | null;
};

type AdminSubscriptionLookupResponse = {
  ok?: boolean;
  user?: {
    email?: string;
    fullName?: string | null;
  };
  subscription?: {
    status?: string;
    effectiveState?: "active" | "grace" | "blocked";
    reason?: string;
    plan?: SubscriptionPlanValue | null;
    paidFrom?: string | null;
    paidUntil?: string | null;
    graceUntil?: string | null;
  };
  payments?: AdminSubscriptionPaymentRow[];
};

type AdminSubscriptionDirectoryFilter = "all" | "overdue" | "dueSoon";

type AdminSubscriptionDirectoryRow = {
  email: string;
  fullName: string | null;
  managerEmail: string | null;
  position: string | null;
  subscription: {
    status?: string;
    effectiveState?: "active" | "grace" | "blocked";
    reason?: string;
    plan?: SubscriptionPlanValue | null;
    paidFrom?: string | null;
    paidUntil?: string | null;
    graceUntil?: string | null;
  };
  flags?: {
    isOverdue?: boolean;
    isDueSoon?: boolean;
    daysUntilDue?: number | null;
  };
};

type AdminSubscriptionDirectoryResponse = {
  ok?: boolean;
  users?: AdminSubscriptionDirectoryRow[];
};

type AdminSecurityFactorRow = {
  uid: string;
  factorId: string;
  displayName: string | null;
  enrollmentTime: string | null;
  phoneNumber: string | null;
};

type AdminSecurityUserRow = {
  uid: string;
  email: string;
  fullName: string | null;
  position: string | null;
  accountType: string | null;
  disabled: boolean;
  emailVerified: boolean;
  createdAt: string | null;
  lastSignInAt: string | null;
  lastRefreshAt: string | null;
  mfa: {
    enabled: boolean;
    factorCount: number;
    hasTotp: boolean;
    hasPhone: boolean;
    factors: AdminSecurityFactorRow[];
  };
};

type AdminSecurityResponse = {
  ok?: boolean;
  users?: AdminSecurityUserRow[];
  summary?: {
    total?: number;
    enabled?: number;
    disabled?: number;
    emailVerified?: number;
  };
};

type AdminBroadcastResponse = {
  ok?: boolean;
  error?: string;
  scheduled?: boolean;
  broadcastId?: string;
  scheduledBroadcastId?: string;
  scheduledAtIso?: string;
  scannedUsers?: number;
  matchedUsers?: number;
  recipients?: number;
  uniqueTokens?: number;
  sent?: number;
  failed?: number;
  skippedPushDisabled?: number;
  skippedNoToken?: number;
  cleanedTokens?: number;
};

type AdminSecurityFilter = "all" | "enabled" | "disabled";

const SECURITY_FILTERS: Array<{
  id: AdminSecurityFilter;
  label: string;
}> = [
  { id: "all", label: "Všichni" },
  { id: "enabled", label: "2FA aktivní" },
  { id: "disabled", label: "Bez 2FA" },
];

type AdminUsersRow = {
  uid: string;
  email: string;
  fullName: string | null;
  agencyNumber: string | null;
  ico: string | null;
  phoneNumber: string | null;
  position: string | null;
  positionTimeline: Array<{
    id: string;
    position: string;
    validFrom: string;
    validTo: string | null;
  }>;
  accountType: string | null;
  managerEmail: string | null;
  tipRecipientEmail: string | null;
  commissionMode: string | null;
  specialist: boolean;
  accountSetupCompletedAt: string | null;
  disabled: boolean;
  emailVerified: boolean;
  createdAt: string | null;
  lastSignInAt: string | null;
  profileExists: boolean;
  privateProfileExists: boolean;
  mfa: {
    enabled: boolean;
    factorCount: number;
    hasTotp: boolean;
    hasPhone: boolean;
    factors: AdminSecurityFactorRow[];
  };
  onlineCard: {
    enabled: boolean;
    slug: string | null;
    ready: boolean;
  };
};

type AdminUsersResponse = {
  ok?: boolean;
  users?: AdminUsersRow[];
  summary?: {
    total?: number;
    disabled?: number;
    missingProfile?: number;
  };
};

type AdminUserSecurityAction =
  | "sendPasswordReset"
  | "resetMfa"
  | "verifyEmail"
  | "revokeSessions";

type AdminUserSecurityActionResponse = {
  ok?: boolean;
  action?: AdminUserSecurityAction;
  targetEmail?: string;
  message?: string;
  beforeFactorCount?: number;
  afterFactorCount?: number;
  refreshTokensRevoked?: boolean;
  emailVerified?: boolean;
};

type AdminUsersDeleteTarget = {
  email: string;
  fullName: string | null;
};

type AdminUsersAccountTypeDraft = NewUserAccountType | "";
type AdminBroadcastRecipientMode = "all" | "group" | "single";
type AdminBroadcastRecipientGroup = (typeof ADMIN_BROADCAST_GROUPS)[number]["id"];
type AdminBroadcastDeliveryMode = "now" | "scheduled";

type AdminUsersMissingItem = {
  key: string;
  label: string;
};

const ADMIN_USER_ICO_MAX_LEN = 8;
const ADMIN_USER_PHONE_MAX_LEN = 40;

const normalizeIcoInput = (value: string): string =>
  value.replace(/\D+/g, "").slice(0, ADMIN_USER_ICO_MAX_LEN);

const hasUsablePhoneNumber = (value: string | null | undefined): boolean =>
  (value ?? "").replace(/\D+/g, "").length >= 6;

const hasUsableIco = (value: string | null | undefined): boolean =>
  (value ?? "").replace(/\D+/g, "").length === ADMIN_USER_ICO_MAX_LEN;

const hasUsablePositionTimeline = (
  timeline: AdminUsersRow["positionTimeline"]
): boolean => Array.isArray(timeline) && timeline.length > 0;

const buildOnlineCardPublicUrl = (slug: string | null | undefined): string =>
  slug ? `${ONLINE_CARD_PUBLIC_BASE_URL}/vizitka/${slug}` : "";

const getAdminUserOnlineCardLabel = (row: AdminUsersRow): string => {
  const card = row.onlineCard;
  if (card?.ready) return "Publikovaná";
  if (card?.enabled) return "Zapnutá, ale neúplná";
  if (card?.slug) return "Vypnutá";
  return "Nenastavená";
};

const buildAdminUserMissingItems = (row: AdminUsersRow): AdminUsersMissingItem[] => {
  const accountType = (row.accountType ?? "").trim().toLowerCase();
  const missing: AdminUsersMissingItem[] = [];

  if (!row.profileExists) missing.push({ key: "profile", label: "Profil" });
  if (!(row.fullName ?? "").trim()) missing.push({ key: "fullName", label: "Jméno" });
  if (!accountType) missing.push({ key: "accountType", label: "Typ účtu" });

  if (accountType === "tipster") {
    if (!normalizeEmail(row.tipRecipientEmail)) {
      missing.push({ key: "tipRecipientEmail", label: "Příjemce tipů" });
    }
    return missing;
  }

  if (!normalizeEmail(row.managerEmail)) {
    missing.push({ key: "managerEmail", label: "Nadřízený" });
  }
  if (!(row.agencyNumber ?? "").trim()) {
    missing.push({ key: "agencyNumber", label: "Agenturní číslo" });
  }
  if (!hasUsableIco(row.ico)) missing.push({ key: "ico", label: "IČO" });
  if (!hasUsablePhoneNumber(row.phoneNumber)) {
    missing.push({ key: "phoneNumber", label: "Telefon" });
  }
  if (!hasUsablePositionTimeline(row.positionTimeline) && !(row.position ?? "").trim()) {
    missing.push({ key: "position", label: "Kariéra" });
  }
  if (!(row.commissionMode ?? "").trim()) {
    missing.push({ key: "commissionMode", label: "Provizní režim" });
  }

  return missing;
};

const getMfaFactorLabel = (factor: AdminSecurityFactorRow): string => {
  if (factor.factorId === "totp") return "TOTP";
  if (factor.factorId === "phone") return "SMS";
  return factor.displayName || factor.factorId.toUpperCase();
};

const generateTemporaryPassword = (): string => {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz2345678923456789";
  const length = 14;

  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return (
      Array.from(bytes, (byte) => chars[byte % chars.length]).join("") + "A7"
    );
  }

  return (
    Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("") +
    "A7"
  );
};

const adminUserSecurityActionKey = (
  email: string,
  action: AdminUserSecurityAction
): string => `${normalizeEmail(email)}:${action}`;

const getAdminUserSecurityActionLabel = (action: AdminUserSecurityAction): string => {
  if (action === "sendPasswordReset") return "Reset hesla";
  if (action === "resetMfa") return "Reset 2FA";
  if (action === "verifyEmail") return "Ověřit e-mail";
  return "Odhlásit relace";
};

const getAdminUserSecurityActionSuccess = (
  action: AdminUserSecurityAction,
  email: string,
  payload: AdminUserSecurityActionResponse
): string => {
  if (action === "sendPasswordReset") {
    return `E-mail pro obnovení hesla byl odeslán na ${email}.`;
  }
  if (action === "resetMfa") {
    const removed = Number(payload.beforeFactorCount ?? 0);
    return `2FA pro ${email} bylo resetováno (${removed} odstraněných faktorů).`;
  }
  if (action === "verifyEmail") {
    return `E-mail ${email} je označený jako ověřený.`;
  }
  return `Aktivní relace uživatele ${email} byly zneplatněny.`;
};

export default function AdminRequestsPage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [requests, setRequests] = useState<EndCollaborationRequestPayload[]>([]);
  const [userRequests, setUserRequests] = useState<UserRequestPayload[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRequestsLoading, setUserRequestsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userRequestsError, setUserRequestsError] = useState<string | null>(null);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [busyUserRequestId, setBusyUserRequestId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [userRequestFeedbackDrafts, setUserRequestFeedbackDrafts] = useState<
    Record<string, string>
  >({});
  const [userRequestPasswordDrafts, setUserRequestPasswordDrafts] = useState<
    Record<string, string>
  >({});
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserFullName, setNewUserFullName] = useState("");
  const [newUserAgencyNumber, setNewUserAgencyNumber] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserManagerEmail, setNewUserManagerEmail] = useState("");
  const [newUserMode, setNewUserMode] = useState<CommissionMode>("standard");
  const [newUserAccountType, setNewUserAccountType] =
    useState<NewUserAccountType>("advisor");
  const [createUserBusy, setCreateUserBusy] = useState(false);
  const [createUserStatus, setCreateUserStatus] = useState<InlineStatus | null>(null);
  const [showCreateUserCelebration, setShowCreateUserCelebration] = useState(false);
  const [createUserCelebrationKey, setCreateUserCelebrationKey] = useState(0);
  const [activeAdminSection, setActiveAdminSection] = useState<AdminSection>("requests");
  const [subscriptionLookupEmail, setSubscriptionLookupEmail] = useState("");
  const [subscriptionLookupLoading, setSubscriptionLookupLoading] = useState(false);
  const [subscriptionLookupError, setSubscriptionLookupError] = useState<string | null>(null);
  const [subscriptionLookupStatus, setSubscriptionLookupStatus] = useState<InlineStatus | null>(null);
  const [subscriptionDirectoryLoading, setSubscriptionDirectoryLoading] = useState(false);
  const [subscriptionDirectoryError, setSubscriptionDirectoryError] = useState<string | null>(null);
  const [subscriptionDirectoryRows, setSubscriptionDirectoryRows] = useState<
    AdminSubscriptionDirectoryRow[]
  >([]);
  const [subscriptionDirectoryFilter, setSubscriptionDirectoryFilter] =
    useState<AdminSubscriptionDirectoryFilter>("all");
  const [subscriptionDirectorySearch, setSubscriptionDirectorySearch] = useState("");
  const [securityRows, setSecurityRows] = useState<AdminSecurityUserRow[]>([]);
  const [securityLoading, setSecurityLoading] = useState(false);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [securityFilter, setSecurityFilter] = useState<AdminSecurityFilter>("all");
  const [securitySearch, setSecuritySearch] = useState("");
  const [broadcastEmoji, setBroadcastEmoji] = useState("📣");
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastRecipientMode, setBroadcastRecipientMode] =
    useState<AdminBroadcastRecipientMode>("all");
  const [broadcastRecipientEmail, setBroadcastRecipientEmail] = useState("");
  const [broadcastRecipientGroup, setBroadcastRecipientGroup] =
    useState<AdminBroadcastRecipientGroup>("advisors");
  const [broadcastTargetPath, setBroadcastTargetPath] = useState("/");
  const [broadcastToolTargetPath, setBroadcastToolTargetPath] = useState("/pomucky");
  const [broadcastCustomTargetPath, setBroadcastCustomTargetPath] = useState("");
  const [broadcastDeliveryMode, setBroadcastDeliveryMode] =
    useState<AdminBroadcastDeliveryMode>("now");
  const [broadcastScheduledAt, setBroadcastScheduledAt] = useState("");
  const [broadcastConfirmed, setBroadcastConfirmed] = useState(false);
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastStatus, setBroadcastStatus] = useState<InlineStatus | null>(null);
  const [adminUsersRows, setAdminUsersRows] = useState<AdminUsersRow[]>([]);
  const [adminUsersLoading, setAdminUsersLoading] = useState(false);
  const [adminUsersError, setAdminUsersError] = useState<string | null>(null);
  const [adminUsersStatus, setAdminUsersStatus] = useState<InlineStatus | null>(null);
  const [adminUsersSearch, setAdminUsersSearch] = useState("");
  const [adminUsersEditingEmail, setAdminUsersEditingEmail] = useState<string | null>(null);
  const [adminUsersEditFullName, setAdminUsersEditFullName] = useState("");
  const [adminUsersEditAgencyNumber, setAdminUsersEditAgencyNumber] = useState("");
  const [adminUsersEditIco, setAdminUsersEditIco] = useState("");
  const [adminUsersEditPhoneNumber, setAdminUsersEditPhoneNumber] = useState("");
  const [adminUsersEditAccountType, setAdminUsersEditAccountType] =
    useState<AdminUsersAccountTypeDraft>("");
  const [adminUsersEditSpecialist, setAdminUsersEditSpecialist] = useState(false);
  const [adminUsersSavingEmail, setAdminUsersSavingEmail] = useState<string | null>(null);
  const [adminUserSecurityBusyKey, setAdminUserSecurityBusyKey] = useState<string | null>(null);
  const [adminUserSecurityConfirmKey, setAdminUserSecurityConfirmKey] =
    useState<string | null>(null);
  const [adminUsersDeleteTarget, setAdminUsersDeleteTarget] =
    useState<AdminUsersDeleteTarget | null>(null);
  const [adminUsersDeleteConfirmed, setAdminUsersDeleteConfirmed] = useState(false);
  const [adminUsersDeletingEmail, setAdminUsersDeletingEmail] = useState<string | null>(null);
  const [adminUserOnlineCardQrDataUrl, setAdminUserOnlineCardQrDataUrl] = useState("");
  const [adminUserOnlineCardQrLoading, setAdminUserOnlineCardQrLoading] = useState(false);
  const [adminUserOnlineCardQrError, setAdminUserOnlineCardQrError] =
    useState<string | null>(null);
  const [adminUserOnlineCardQrStatus, setAdminUserOnlineCardQrStatus] =
    useState<string | null>(null);
  const [subscriptionPlanDraft, setSubscriptionPlanDraft] =
    useState<SubscriptionPlanValue>("monthly");
  const [subscriptionFromDraft, setSubscriptionFromDraft] = useState("");
  const [subscriptionNoteDraft, setSubscriptionNoteDraft] = useState("");
  const [subscriptionEditingPaymentId, setSubscriptionEditingPaymentId] =
    useState<string | null>(null);
  const [subscriptionSavingPaymentId, setSubscriptionSavingPaymentId] =
    useState<string | null>(null);
  const [subscriptionDeletingPaymentId, setSubscriptionDeletingPaymentId] =
    useState<string | null>(null);
  const [subscriptionEditPlan, setSubscriptionEditPlan] =
    useState<PaidSubscriptionPlanValue>("monthly");
  const [subscriptionEditPeriodFrom, setSubscriptionEditPeriodFrom] = useState("");
  const [subscriptionEditPeriodUntil, setSubscriptionEditPeriodUntil] = useState("");
  const [subscriptionEditAmount, setSubscriptionEditAmount] = useState("");
  const [subscriptionEditNote, setSubscriptionEditNote] = useState("");
  const [subscriptionData, setSubscriptionData] = useState<AdminSubscriptionLookupResponse | null>(null);
  const [requestsNowMs, setRequestsNowMs] = useState(() => Date.now());
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null);
  const [canCreateUsers, setCanCreateUsers] = useState(false);

  const isAllowedAdmin = adminRoleAtLeast(adminRole, "admin");
  const isOwnerAdmin = adminRoleAtLeast(adminRole, "owner");
  const canAccessAdminPanel = isAllowedAdmin || canCreateUsers;

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAdminRole(resolveAdminRoleFromClaims(user?.email, null));
      setCanCreateUsers(canCreateUserAccounts(user?.email, null));
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!currentUser) {
      setAdminRole(null);
      setCanCreateUsers(false);
      return;
    }

    currentUser
      .getIdTokenResult()
      .then((token) => {
        if (cancelled) return;
        setAdminRole(
          resolveAdminRoleFromClaims(
            currentUser.email,
            token.claims as Record<string, unknown>
          )
        );
        setCanCreateUsers(
          canCreateUserAccounts(
            currentUser.email,
            token.claims as Record<string, unknown>
          )
        );
      })
      .catch(() => {
        if (!cancelled) {
          setAdminRole(resolveAdminRoleFromClaims(currentUser.email, null));
          setCanCreateUsers(canCreateUserAccounts(currentUser.email, null));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  useEffect(() => {
    if (!authReady) return;
    if (!isAllowedAdmin && canCreateUsers && activeAdminSection !== "createUser") {
      setActiveAdminSection("createUser");
    }
  }, [activeAdminSection, authReady, canCreateUsers, isAllowedAdmin]);

  useEffect(() => {
    if (activeAdminSection === "subscriptions" && !isOwnerAdmin) {
      setActiveAdminSection("requests");
    }
  }, [activeAdminSection, isOwnerAdmin]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setRequestsNowMs(Date.now());
    }, 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const email = normalizeEmail(currentUser?.email);
    if (!email) return;
    setNewUserManagerEmail((prev) => prev || email);
  }, [currentUser?.email]);

  useEffect(() => {
    if (!showCreateUserCelebration) return;
    const timeoutId = window.setTimeout(() => {
      setShowCreateUserCelebration(false);
    }, CREATE_USER_CELEBRATION_MS);
    return () => window.clearTimeout(timeoutId);
  }, [createUserCelebrationKey, showCreateUserCelebration]);

  const loadSubscriptionDirectory = useCallback(async () => {
    const user = auth.currentUser;
    if (!user || !isOwnerAdmin) {
      setSubscriptionDirectoryRows([]);
      setSubscriptionDirectoryError(null);
      setSubscriptionDirectoryLoading(false);
      return;
    }

    setSubscriptionDirectoryLoading(true);
    setSubscriptionDirectoryError(null);
    try {
      const payload = await fetchAuthedJsonOrThrow<AdminSubscriptionDirectoryResponse>(
        user,
        "/api/admin/subscriptions?scope=list",
        { method: "GET" }
      );
      const rows = Array.isArray(payload?.users) ? payload.users : [];
      setSubscriptionDirectoryRows(rows);
    } catch (error) {
      setSubscriptionDirectoryRows([]);
      setSubscriptionDirectoryError(
        error instanceof Error
          ? error.message
          : "Nepodařilo se načíst seznam uživatelů pro předplatné."
      );
    } finally {
      setSubscriptionDirectoryLoading(false);
    }
  }, [isOwnerAdmin]);

  useEffect(() => {
    if (activeAdminSection !== "subscriptions") return;
    void loadSubscriptionDirectory();
  }, [activeAdminSection, loadSubscriptionDirectory]);

  const loadSecurityRows = useCallback(async () => {
    const user = auth.currentUser;
    if (!user || !isAllowedAdmin) {
      setSecurityRows([]);
      setSecurityError(null);
      setSecurityLoading(false);
      return;
    }

    setSecurityLoading(true);
    setSecurityError(null);
    try {
      const payload = await fetchAuthedJsonOrThrow<AdminSecurityResponse>(
        user,
        "/api/admin/security",
        { method: "GET" }
      );
      setSecurityRows(Array.isArray(payload?.users) ? payload.users : []);
    } catch (error) {
      setSecurityRows([]);
      setSecurityError(
        error instanceof Error
          ? error.message
          : "Nepodařilo se načíst zabezpečení uživatelů."
      );
    } finally {
      setSecurityLoading(false);
    }
  }, [isAllowedAdmin]);

  useEffect(() => {
    if (activeAdminSection !== "security") return;
    void loadSecurityRows();
  }, [activeAdminSection, loadSecurityRows]);

  const loadAdminUsersRows = useCallback(async () => {
    const user = auth.currentUser;
    if (!user || !isAllowedAdmin) {
      setAdminUsersRows([]);
      setAdminUsersError(null);
      setAdminUsersLoading(false);
      return;
    }

    setAdminUsersLoading(true);
    setAdminUsersError(null);
    try {
      const payload = await fetchAuthedJsonOrThrow<AdminUsersResponse>(
        user,
        "/api/admin/users",
        { method: "GET" }
      );
      setAdminUsersRows(Array.isArray(payload?.users) ? payload.users : []);
    } catch (error) {
      setAdminUsersRows([]);
      setAdminUsersError(
        error instanceof Error ? error.message : "Nepodařilo se načíst uživatele."
      );
    } finally {
      setAdminUsersLoading(false);
    }
  }, [isAllowedAdmin]);

  useEffect(() => {
    if (activeAdminSection !== "users" && activeAdminSection !== "broadcasts") return;
    void loadAdminUsersRows();
  }, [activeAdminSection, loadAdminUsersRows]);

  const loadRequests = useCallback(async () => {
    const user = auth.currentUser;
    if (!user || !isAllowedAdmin) {
      setRequests([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const payload = await fetchAuthedJsonOrThrow<EndCollaborationRequestsApiSuccess>(
        user,
        "/api/team-overview?action=endCollaborationRequests&scope=all",
        { method: "GET" }
      );
      setRequests(Array.isArray(payload.requests) ? payload.requests : []);
    } catch (err: any) {
      if (typeof err?.message === "string" && err.message.trim()) {
        setError(err.message.trim());
      } else {
        setError("Nepodařilo se načíst žádosti.");
      }
    } finally {
      setLoading(false);
    }
  }, [isAllowedAdmin]);

  const loadUserRequests = useCallback(async () => {
    const user = auth.currentUser;
    if (!user || !isAllowedAdmin) {
      setUserRequests([]);
      setUserRequestsLoading(false);
      return;
    }

    setUserRequestsLoading(true);
    setUserRequestsError(null);
    try {
      const payload = await fetchAuthedJsonOrThrow<UserRequestsApiSuccess>(
        user,
        "/api/user-requests?scope=all",
        { method: "GET" }
      );
      const rows = Array.isArray(payload.requests) ? payload.requests : [];
      setUserRequests(
        rows.sort((a, b) => {
          const aActivity = Math.max(a.updatedAtMs || 0, a.createdAtMs || 0);
          const bActivity = Math.max(b.updatedAtMs || 0, b.createdAtMs || 0);
          return bActivity - aActivity;
        })
      );
    } catch (err: any) {
      if (typeof err?.message === "string" && err.message.trim()) {
        setUserRequestsError(err.message.trim());
      } else {
        setUserRequestsError("Nepodařilo se načíst uživatelské žádosti.");
      }
    } finally {
      setUserRequestsLoading(false);
    }
  }, [isAllowedAdmin]);

  const refreshAllRequests = useCallback(async () => {
    await Promise.all([loadRequests(), loadUserRequests()]);
  }, [loadRequests, loadUserRequests]);

  useEffect(() => {
    if (!authReady) return;
    if (!isAllowedAdmin) {
      setLoading(false);
      setUserRequestsLoading(false);
      return;
    }
    void refreshAllRequests();
  }, [authReady, isAllowedAdmin, refreshAllRequests]);

  const filteredUnifiedRequests = useMemo<UnifiedRequestItem[]>(() => {
    const q = search.trim().toLowerCase();

    const endItems: UnifiedRequestItem[] = requests.map((request) => ({
      kind: "endCollaboration",
      id: `end-${request.id}`,
      createdAtMs: request.createdAtMs,
      activityAtMs: Math.max(request.updatedAtMs || 0, request.createdAtMs || 0),
      searchable: [
        "ukonceni spoluprace",
        request.targetName,
        request.targetEmail,
        request.requestedByEmail,
        request.successorEmail,
      ]
        .join(" ")
        .toLowerCase(),
      pending: request.status === "pending" || request.status === "processing",
      request,
    }));

    const userItems: UnifiedRequestItem[] = userRequests.map((request) => ({
      kind: "userRequest",
      id: `user-${request.id}`,
      createdAtMs: request.createdAtMs,
      activityAtMs: Math.max(request.updatedAtMs || 0, request.createdAtMs || 0),
      searchable: [
        "uzivatelska zadost",
        request.requesterEmail,
        request.requestedCorporateEmail ?? "",
        request.requestedUserDraft?.fullName ?? "",
        request.requestedUserDraft?.agencyNumber ?? "",
        request.requestedUserDraft?.managerEmail ?? "",
        userRequestSubjectLabel[request.subject],
        request.message,
      ]
        .join(" ")
        .toLowerCase(),
      pending: request.status === "pending",
      request,
    }));

    const merged = [...endItems, ...userItems].sort((a, b) => b.activityAtMs - a.activityAtMs);
    if (!q) return merged;
    return merged.filter((item) => item.searchable.includes(q));
  }, [requests, search, userRequests]);

  const pendingUnifiedCount = useMemo(
    () => filteredUnifiedRequests.filter((item) => item.pending).length,
    [filteredUnifiedRequests]
  );

  const totalRequestsCount = requests.length + userRequests.length;

  const pendingEndCollaborationCount = useMemo(
    () => requests.filter((request) => request.status === "pending" || request.status === "processing").length,
    [requests]
  );

  const overdueUrgentCount = useMemo(
    () =>
      userRequests.filter((request) => buildAdminUserRequestSlaInfo(request, requestsNowMs).isOverdueUrgent)
        .length,
    [requestsNowMs, userRequests]
  );

  const filteredSubscriptionDirectoryRows = useMemo(() => {
    const query = subscriptionDirectorySearch.trim().toLowerCase();

    return subscriptionDirectoryRows.filter((row) => {
      if (subscriptionDirectoryFilter === "overdue" && row.flags?.isOverdue !== true) {
        return false;
      }
      if (subscriptionDirectoryFilter === "dueSoon" && row.flags?.isDueSoon !== true) {
        return false;
      }
      if (!query) return true;

      const name = (row.fullName || nameFromEmail(row.email)).toLowerCase();
      const email = row.email.toLowerCase();
      const managerEmail = (row.managerEmail || "").toLowerCase();
      return (
        name.includes(query) ||
        email.includes(query) ||
        managerEmail.includes(query)
      );
    });
  }, [subscriptionDirectoryFilter, subscriptionDirectoryRows, subscriptionDirectorySearch]);

  const subscriptionDirectoryStats = useMemo(() => {
    const total = subscriptionDirectoryRows.length;
    const overdue = subscriptionDirectoryRows.filter((row) => row.flags?.isOverdue === true).length;
    const dueSoon = subscriptionDirectoryRows.filter((row) => row.flags?.isDueSoon === true).length;
    const active = subscriptionDirectoryRows.filter(
      (row) => row.subscription.effectiveState === "active"
    ).length;
    return { total, overdue, dueSoon, active };
  }, [subscriptionDirectoryRows]);

  const filteredSecurityRows = useMemo(() => {
    const query = securitySearch.trim().toLowerCase();

    return securityRows.filter((row) => {
      if (securityFilter === "enabled" && !row.mfa.enabled) return false;
      if (securityFilter === "disabled" && row.mfa.enabled) return false;
      if (!query) return true;

      const name = (row.fullName || nameFromEmail(row.email)).toLowerCase();
      const email = row.email.toLowerCase();
      const position = (row.position || "").toLowerCase();
      const positionLabel = formatPositionLabel(row.position).toLowerCase();
      const accountTypeLabel = formatAccountTypeLabel(row.accountType).toLowerCase();
      return (
        name.includes(query) ||
        email.includes(query) ||
        position.includes(query) ||
        positionLabel.includes(query) ||
        accountTypeLabel.includes(query)
      );
    });
  }, [securityFilter, securityRows, securitySearch]);

  const securityStats = useMemo(() => {
    const total = securityRows.length;
    const mfaEnabled = securityRows.filter((row) => row.mfa.enabled).length;
    const mfaMissing = total - mfaEnabled;
    const emailVerified = securityRows.filter((row) => row.emailVerified).length;
    return { total, mfaEnabled, mfaMissing, emailVerified };
  }, [securityRows]);

  const adminUsersNameByEmail = useMemo(() => {
    const map = new Map<string, string>();
    adminUsersRows.forEach((row) => {
      const email = normalizeEmail(row.email);
      if (!email) return;
      map.set(email, row.fullName || nameFromEmail(row.email));
    });
    return map;
  }, [adminUsersRows]);

  const filteredAdminUsersRows = useMemo(() => {
    const query = adminUsersSearch.trim().toLowerCase();
    if (!query) return adminUsersRows;

    return adminUsersRows.filter((row) => {
      const title = (row.fullName || nameFromEmail(row.email)).toLowerCase();
      const email = row.email.toLowerCase();
      const agencyNumber = (row.agencyNumber || "").toLowerCase();
      const ico = (row.ico || "").toLowerCase();
      const phoneNumber = (row.phoneNumber || "").toLowerCase();
      const managerEmail = (row.managerEmail || "").toLowerCase();
      const tipRecipientEmail = (row.tipRecipientEmail || "").toLowerCase();
      const position = (row.position || "").toLowerCase();
      const positionLabel = formatPositionLabel(row.position).toLowerCase();
      const accountTypeLabel = formatAccountTypeLabel(row.accountType).toLowerCase();
      const specialistLabel = row.specialist ? "specialista dokumenty" : "";
      const onlineCardSlug = (row.onlineCard?.slug || "").toLowerCase();
      const onlineCardLabel = getAdminUserOnlineCardLabel(row).toLowerCase();
      const missingLabels = buildAdminUserMissingItems(row)
        .map((item) => item.label.toLowerCase())
        .join(" ");
      const relationEmail =
        row.accountType === "tipster" ? row.tipRecipientEmail : row.managerEmail;
      const relationName = relationEmail
        ? (adminUsersNameByEmail.get(normalizeEmail(relationEmail)) ?? "")
            .toLowerCase()
        : "";
      return (
        title.includes(query) ||
        email.includes(query) ||
        agencyNumber.includes(query) ||
        ico.includes(query) ||
        phoneNumber.includes(query) ||
        managerEmail.includes(query) ||
        tipRecipientEmail.includes(query) ||
        position.includes(query) ||
        positionLabel.includes(query) ||
        accountTypeLabel.includes(query) ||
        specialistLabel.includes(query) ||
        onlineCardSlug.includes(query) ||
        onlineCardLabel.includes(query) ||
        missingLabels.includes(query) ||
        relationName.includes(query)
      );
    });
  }, [adminUsersNameByEmail, adminUsersRows, adminUsersSearch]);

  const adminUsersStats = useMemo(() => {
    const total = adminUsersRows.length;
    const missingProfile = adminUsersRows.filter((row) => !row.profileExists).length;
    const disabled = adminUsersRows.filter((row) => row.disabled).length;
    const advisors = adminUsersRows.filter((row) => row.accountType === "advisor").length;
    const tipsters = adminUsersRows.filter((row) => row.accountType === "tipster").length;
    const incomplete = adminUsersRows.filter((row) => buildAdminUserMissingItems(row).length > 0).length;
    const complete = total - incomplete;
    return { total, missingProfile, disabled, advisors, tipsters, incomplete, complete };
  }, [adminUsersRows]);

  const broadcastRecipientOptions = useMemo(
    () =>
      adminUsersRows
        .map((row) => {
          const email = normalizeEmail(row.email);
          if (!email) return null;
          return {
            email,
            label: row.fullName || nameFromEmail(row.email),
            disabled: row.disabled,
          };
        })
        .filter(
          (row): row is { email: string; label: string; disabled: boolean } => row !== null
        )
        .sort((a, b) => a.label.localeCompare(b.label, "cs")),
    [adminUsersRows]
  );

  const broadcastGroupCounts = useMemo(
    () => ({
      advisors: adminUsersRows.filter(
        (row) => row.accountType === "advisor" && isAdvisorPositionKey(row.position)
      ).length,
      managers: adminUsersRows.filter(
        (row) => row.accountType === "advisor" && isManagerPositionKey(row.position)
      ).length,
      specialists: adminUsersRows.filter(
        (row) => row.specialist === true && row.accountType !== "tipster"
      ).length,
    }),
    [adminUsersRows]
  );

  const broadcastEffectiveTargetPath = useMemo(() => {
    const selected =
      broadcastTargetPath === "__custom__"
        ? broadcastCustomTargetPath.trim()
        : broadcastTargetPath === "/pomucky"
          ? broadcastToolTargetPath
          : broadcastTargetPath;
    return selected || "/";
  }, [broadcastCustomTargetPath, broadcastTargetPath, broadcastToolTargetPath]);

  const broadcastTargetLabel = useMemo(() => {
    if (broadcastTargetPath === "__custom__") return "Vlastní cesta";
    if (broadcastTargetPath === "/pomucky") {
      const toolLabel =
        ADMIN_BROADCAST_TOOL_TARGETS.find(
          (target) => target.path === broadcastToolTargetPath
        )?.label ?? "Pomůcky";
      return `Pomůcky: ${toolLabel}`;
    }
    return (
      ADMIN_BROADCAST_TARGETS.find((target) => target.path === broadcastTargetPath)?.label ??
      "Vybraná stránka"
    );
  }, [broadcastTargetPath, broadcastToolTargetPath]);

  const broadcastRecipientEmailNormalized = normalizeEmail(broadcastRecipientEmail);

  const broadcastRecipientLabel = useMemo(() => {
    if (broadcastRecipientMode === "all") return "Všichni s aktivním push tokenem";
    if (broadcastRecipientMode === "group") {
      const groupLabel =
        ADMIN_BROADCAST_GROUPS.find((group) => group.id === broadcastRecipientGroup)?.label ??
        "Vybraná skupina";
      return `${groupLabel} (${broadcastGroupCounts[broadcastRecipientGroup]} účtů)`;
    }
    const selected = broadcastRecipientOptions.find(
      (row) => row.email === broadcastRecipientEmailNormalized
    );
    if (selected) return `${selected.label} (${selected.email})`;
    return broadcastRecipientEmailNormalized || "Nevybráno";
  }, [
    broadcastRecipientEmailNormalized,
    broadcastRecipientGroup,
    broadcastRecipientMode,
    broadcastRecipientOptions,
    broadcastGroupCounts,
  ]);

  const broadcastScheduledAtMs = useMemo(() => {
    if (broadcastDeliveryMode !== "scheduled" || !broadcastScheduledAt) return null;
    const parsed = new Date(broadcastScheduledAt).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }, [broadcastDeliveryMode, broadcastScheduledAt]);
  const broadcastScheduledAtIso =
    broadcastScheduledAtMs != null ? new Date(broadcastScheduledAtMs).toISOString() : null;
  const broadcastScheduleIsValid =
    broadcastDeliveryMode === "now" ||
    (broadcastScheduledAtMs != null && broadcastScheduledAtMs > Date.now() + 30_000);
  const broadcastScheduleMinValue = useMemo(
    () => toDatetimeLocalInputValue(new Date(Date.now() + 60_000)),
    []
  );
  const broadcastDeliveryLabel =
    broadcastDeliveryMode === "scheduled" && broadcastScheduledAtIso
      ? `Naplánováno na ${formatAdminBroadcastDateTime(broadcastScheduledAtIso)}`
      : "Odeslat hned";

  const broadcastTitleTrimmed = broadcastTitle.trim();
  const broadcastMessageTrimmed = broadcastMessage.trim();
  const broadcastCanSubmit =
    isAllowedAdmin &&
    !broadcastSending &&
    broadcastConfirmed &&
    broadcastTitleTrimmed.length > 0 &&
    broadcastMessageTrimmed.length > 0 &&
    (broadcastRecipientMode !== "single" || Boolean(broadcastRecipientEmailNormalized)) &&
    (broadcastRecipientMode !== "group" || Boolean(broadcastRecipientGroup)) &&
    broadcastScheduleIsValid &&
    broadcastEffectiveTargetPath.startsWith("/") &&
    !broadcastEffectiveTargetPath.startsWith("//");

  useEffect(() => {
    if (broadcastRecipientMode !== "single") return;
    if (broadcastRecipientEmailNormalized) return;
    const first = broadcastRecipientOptions.find((row) => !row.disabled) ?? broadcastRecipientOptions[0];
    if (first) {
      setBroadcastRecipientEmail(first.email);
    }
  }, [
    broadcastRecipientEmailNormalized,
    broadcastRecipientMode,
    broadcastRecipientOptions,
  ]);

  const handleDecision = useCallback(
    async (requestId: string, action: "approve" | "reject") => {
      const user = auth.currentUser;
      if (!user) return;

      setBusyRequestId(requestId);
      setError(null);
      setActionMessage(null);
      try {
        await fetchAuthedJsonOrThrow(user, "/api/team-overview", {
          method: "PATCH",
          body: JSON.stringify(
            action === "approve"
              ? { action: "endCollaborationApprove", requestId }
              : { action: "endCollaborationReject", requestId }
          ),
        });
        setActionMessage(
          action === "approve"
            ? "Žádost byla schválena a ukončení spolupráce provedeno."
            : "Žádost byla odmítnuta."
        );
        await loadRequests();
      } catch (err: any) {
        if (typeof err?.message === "string" && err.message.trim()) {
          setError(err.message.trim());
        } else {
          setError("Akci se nepodařilo provést.");
        }
      } finally {
        setBusyRequestId(null);
      }
    },
    [loadRequests]
  );

  const handleUserRequestDecision = useCallback(
    async (
      request: UserRequestPayload,
      status: "accepted" | "rejected" | "needsInfo"
    ) => {
      const user = auth.currentUser;
      if (!user || !isAllowedAdmin) return;

      const feedback = (userRequestFeedbackDrafts[request.id] ?? "").trim();
      const tempPassword = (userRequestPasswordDrafts[request.id] ?? "").trim();
      if (status === "needsInfo" && feedback.length < 5) {
        setUserRequestsError("Pro vrácení k doplnění napiš zpětnou vazbu (min. 5 znaků).");
        return;
      }
      if (
        status === "accepted" &&
        request.subject === "userCreation" &&
        tempPassword.length < 8
      ) {
        setUserRequestsError("Před akceptací vyplň dočasné heslo (min. 8 znaků).");
        return;
      }

      setBusyUserRequestId(request.id);
      setUserRequestsError(null);
      setActionMessage(null);

      try {
        const payload = await fetchAuthedJsonOrThrow<UserRequestUpdateResponse>(
          user,
          "/api/user-requests",
          {
            method: "PATCH",
            body: JSON.stringify({
              id: request.id,
              status,
              feedback: feedback || null,
              tempPassword:
                status === "accepted" && request.subject === "userCreation"
                  ? tempPassword
                  : null,
            }),
          }
        );

        const updatedRequest = payload?.request;
        if (updatedRequest) {
          setUserRequests((prev) =>
            prev.map((item) => (item.id === request.id ? updatedRequest : item))
          );
        } else {
          await loadUserRequests();
        }

        setUserRequestFeedbackDrafts((prev) => {
          const next = { ...prev };
          delete next[request.id];
          return next;
        });
        setUserRequestPasswordDrafts((prev) => {
          const next = { ...prev };
          delete next[request.id];
          return next;
        });
        setActionMessage(
          status === "accepted"
            ? "Uživatelská žádost byla akceptována."
            : status === "rejected"
              ? "Uživatelská žádost byla odmítnuta."
              : "Žádost byla vrácena k doplnění."
        );
      } catch (err: any) {
        if (typeof err?.message === "string" && err.message.trim()) {
          setUserRequestsError(err.message.trim());
        } else {
          setUserRequestsError("Změnu stavu uživatelské žádosti se nepodařilo provést.");
        }
      } finally {
        setBusyUserRequestId(null);
      }
    },
    [isAllowedAdmin, loadUserRequests, userRequestFeedbackDrafts, userRequestPasswordDrafts]
  );

  const handleGenerateRequestPassword = useCallback((requestId: string) => {
    const nextPassword = generateTemporaryPassword();
    setUserRequestPasswordDrafts((prev) => ({
      ...prev,
      [requestId]: nextPassword,
    }));
    setActionMessage(null);
    setUserRequestsError(null);
  }, []);

  const handleCopyRequestPassword = useCallback(
    async (requestId: string) => {
      const value = (userRequestPasswordDrafts[requestId] ?? "").trim();
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
        setActionMessage("Dočasné heslo bylo zkopírováno.");
      } catch {
        setUserRequestsError("Heslo se nepodařilo zkopírovat.");
      }
    },
    [userRequestPasswordDrafts]
  );

  const handleGenerateNewUserPassword = useCallback(() => {
    setNewUserPassword(generateTemporaryPassword());
    setCreateUserStatus(null);
  }, []);

  const handleCopyNewUserPassword = useCallback(async () => {
    if (!newUserPassword) return;
    try {
      await navigator.clipboard.writeText(newUserPassword);
      setCreateUserStatus({
        type: "info",
        message: "Dočasné heslo zkopírováno.",
      });
    } catch {
      setCreateUserStatus({
        type: "error",
        message: "Heslo se nepodařilo zkopírovat.",
      });
    }
  }, [newUserPassword]);

  const handleCreateUser = useCallback(async () => {
    const user = auth.currentUser;
    if (!user || !canCreateUsers) return;

    const email = normalizeEmail(newUserEmail);
    const managerEmail = normalizeEmail(newUserManagerEmail);
    const agencyNumber = newUserAgencyNumber.trim();
    if (!email) {
      setCreateUserStatus({ type: "error", message: "Vyplň e-mail nového uživatele." });
      return;
    }
    if (agencyNumber.length > NEW_USER_AGENCY_NUMBER_MAX_LEN) {
      setCreateUserStatus({
        type: "error",
        message: `Agenturní číslo může mít maximálně ${NEW_USER_AGENCY_NUMBER_MAX_LEN} znaků.`,
      });
      return;
    }
    if (newUserPassword.length < 8) {
      setCreateUserStatus({
        type: "error",
        message: "Dočasné heslo musí mít alespoň 8 znaků.",
      });
      return;
    }
    if (managerEmail && managerEmail === email) {
      setCreateUserStatus({
        type: "error",
        message:
          newUserAccountType === "tipster"
            ? "Příjemce tipů nemůže být stejný jako nový uživatel."
            : "Nadřízený nemůže být stejný jako nový uživatel.",
      });
      return;
    }
    if (newUserAccountType === "tipster" && !managerEmail) {
      setCreateUserStatus({
        type: "error",
        message: "U tipaře vyplň příjemce tipů.",
      });
      return;
    }

    setCreateUserBusy(true);
    setCreateUserStatus(null);
    try {
      const payload = await fetchAuthedJsonOrThrow<CreateUserResponse>(
        user,
        "/api/user/create",
        {
          method: "POST",
          body: JSON.stringify({
            email,
            password: newUserPassword,
            fullName: newUserFullName,
            agencyNumber,
            accountType: newUserAccountType,
            managerEmail: newUserAccountType === "advisor" ? managerEmail : "",
            tipRecipientEmail:
              newUserAccountType === "tipster" ? managerEmail : "",
            commissionMode: newUserMode,
          }),
        }
      );

      setCreateUserStatus({
        type: "success",
        message: `Uživatel ${payload?.email ?? email} byl vytvořen.`,
      });
      setCreateUserCelebrationKey((prev) => prev + 1);
      setShowCreateUserCelebration(true);
      setNewUserEmail("");
      setNewUserFullName("");
      setNewUserAgencyNumber("");
      setNewUserMode("standard");
      setNewUserAccountType("advisor");
      const ownEmail = normalizeEmail(user.email);
      setNewUserManagerEmail(ownEmail || managerEmail);
    } catch (error) {
      setCreateUserStatus({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Nového uživatele se nepodařilo vytvořit.",
      });
    } finally {
      setCreateUserBusy(false);
    }
  }, [
    canCreateUsers,
    newUserEmail,
    newUserFullName,
    newUserAgencyNumber,
    newUserAccountType,
    newUserManagerEmail,
    newUserMode,
    newUserPassword,
  ]);

  const handleSendAdminBroadcast = useCallback(async () => {
    const user = auth.currentUser;
    if (!user || !isAllowedAdmin) return;

    const message = broadcastMessage.trim();
    const title = broadcastTitle.trim();
    const targetPath = broadcastEffectiveTargetPath.trim();
    const emoji = broadcastEmoji.trim();
    const recipientEmail = normalizeEmail(broadcastRecipientEmail);
    const scheduledAt = broadcastDeliveryMode === "scheduled" ? broadcastScheduledAtIso : null;

    if (!title) {
      setBroadcastStatus({
        type: "error",
        message: "Vyplň nadpis notifikace.",
      });
      return;
    }
    if (!message) {
      setBroadcastStatus({
        type: "error",
        message: "Vyplň text notifikace.",
      });
      return;
    }
    if (!targetPath.startsWith("/") || targetPath.startsWith("//")) {
      setBroadcastStatus({
        type: "error",
        message: "Cílová stránka musí být interní cesta začínající lomítkem.",
      });
      return;
    }
    if (broadcastRecipientMode === "single" && !recipientEmail) {
      setBroadcastStatus({
        type: "error",
        message: "Vyber uživatele, kterému chceš testovací notifikaci poslat.",
      });
      return;
    }
    if (broadcastRecipientMode === "group" && !broadcastRecipientGroup) {
      setBroadcastStatus({
        type: "error",
        message: "Vyber skupinu příjemců.",
      });
      return;
    }
    if (broadcastDeliveryMode === "scheduled" && !scheduledAt) {
      setBroadcastStatus({
        type: "error",
        message: "Vyber platný budoucí čas odeslání.",
      });
      return;
    }
    if (!broadcastConfirmed) {
      setBroadcastStatus({
        type: "error",
        message:
          broadcastRecipientMode === "single"
            ? "Potvrď odeslání notifikace vybranému uživateli."
            : broadcastRecipientMode === "group"
              ? "Potvrď odeslání notifikace vybrané skupině."
              : "Potvrď, že chceš notifikaci odeslat všem uživatelům.",
      });
      return;
    }

    setBroadcastSending(true);
    setBroadcastStatus(null);
    try {
      const payload = await fetchAuthedJsonOrThrow<AdminBroadcastResponse>(
        user,
        "/api/admin/broadcast-notification",
        {
          method: "POST",
          body: JSON.stringify({
            emoji,
            title,
            message,
            targetPath,
            targetMode: broadcastRecipientMode,
            recipientEmail:
              broadcastRecipientMode === "single" ? recipientEmail : undefined,
            recipientGroup:
              broadcastRecipientMode === "group" ? broadcastRecipientGroup : undefined,
            scheduledAt,
          }),
        }
      );

      if (payload?.scheduled) {
        setBroadcastStatus({
          type: "success",
          message: `Notifikace naplánována pro ${broadcastRecipientLabel} na ${formatAdminBroadcastDateTime(payload.scheduledAtIso ?? scheduledAt)}.`,
        });
        setBroadcastTitle("");
        setBroadcastMessage("");
        setBroadcastConfirmed(false);
        setBroadcastDeliveryMode("now");
        setBroadcastScheduledAt("");
        return;
      }

      const sent = typeof payload?.sent === "number" ? payload.sent : 0;
      const failed = typeof payload?.failed === "number" ? payload.failed : 0;
      const matched =
        typeof payload?.matchedUsers === "number" ? payload.matchedUsers : null;
      const recipients =
        typeof payload?.recipients === "number" ? payload.recipients : null;
      const tokens =
        typeof payload?.uniqueTokens === "number" ? payload.uniqueTokens : null;
      const skippedNoToken =
        typeof payload?.skippedNoToken === "number" ? payload.skippedNoToken : null;
      const skippedPushDisabled =
        typeof payload?.skippedPushDisabled === "number"
          ? payload.skippedPushDisabled
          : null;

      const details = [
        matched != null && broadcastRecipientMode === "group" ? `skupina ${matched}` : null,
        recipients != null ? `příjemci ${recipients}` : null,
        tokens != null ? `tokeny ${tokens}` : null,
        failed > 0 ? `chyby ${failed}` : null,
        skippedNoToken != null ? `bez tokenu ${skippedNoToken}` : null,
        skippedPushDisabled != null ? `push vypnutý ${skippedPushDisabled}` : null,
      ].filter(Boolean);

      setBroadcastStatus({
        type: "success",
        message:
          details.length > 0
            ? `Notifikace odeslána ${broadcastRecipientLabel}. Doručeno ${sent}. ${details.join(", ")}.`
            : `Notifikace odeslána ${broadcastRecipientLabel}. Doručeno ${sent}.`,
      });
      setBroadcastTitle("");
      setBroadcastMessage("");
      setBroadcastConfirmed(false);
    } catch (error) {
      setBroadcastStatus({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Hromadnou notifikaci se nepodařilo odeslat.",
      });
    } finally {
      setBroadcastSending(false);
    }
  }, [
    broadcastConfirmed,
    broadcastDeliveryMode,
    broadcastEffectiveTargetPath,
    broadcastEmoji,
    broadcastMessage,
    broadcastRecipientEmail,
    broadcastRecipientGroup,
    broadcastRecipientLabel,
    broadcastRecipientMode,
    broadcastScheduledAtIso,
    broadcastTitle,
    isAllowedAdmin,
  ]);

  const loadSubscriptionForEmail = useCallback(
    async (emailInput?: string) => {
      const user = auth.currentUser;
      if (!user || !isOwnerAdmin) return;

      const email = normalizeEmail(emailInput ?? subscriptionLookupEmail);
      if (!email) {
        setSubscriptionLookupError("Zadej e-mail uživatele.");
        setSubscriptionData(null);
        return;
      }

      setSubscriptionLookupLoading(true);
      setSubscriptionLookupError(null);
      setSubscriptionLookupStatus(null);
      try {
        const payload = await fetchAuthedJsonOrThrow<AdminSubscriptionLookupResponse>(
          user,
          `/api/admin/subscriptions?email=${encodeURIComponent(email)}`,
          { method: "GET" }
        );
        setSubscriptionLookupEmail(email);
        setSubscriptionData(payload);
        setSubscriptionEditingPaymentId(null);
        setSubscriptionSavingPaymentId(null);
        setSubscriptionDeletingPaymentId(null);
      } catch (error) {
        setSubscriptionData(null);
        setSubscriptionLookupError(
          error instanceof Error
            ? error.message
            : "Nepodařilo se načíst předplatné uživatele."
        );
      } finally {
        setSubscriptionLookupLoading(false);
      }
    },
    [isOwnerAdmin, subscriptionLookupEmail]
  );

  useEffect(() => {
    if (activeAdminSection !== "subscriptions") return;
    if (subscriptionDirectoryRows.length === 0) return;
    if (subscriptionLookupLoading) return;

    const selectedEmail = normalizeEmail(subscriptionLookupEmail);
    const hasSelection = selectedEmail
      ? subscriptionDirectoryRows.some((row) => row.email === selectedEmail)
      : false;
    if (hasSelection) return;

    const first = subscriptionDirectoryRows[0];
    if (!first) return;
    setSubscriptionLookupEmail(first.email);
    void loadSubscriptionForEmail(first.email);
  }, [
    activeAdminSection,
    loadSubscriptionForEmail,
    subscriptionDirectoryRows,
    subscriptionLookupEmail,
    subscriptionLookupLoading,
  ]);

  const handleAddSubscriptionPayment = useCallback(async () => {
    const user = auth.currentUser;
    if (!user || !isOwnerAdmin) return;
    const email = normalizeEmail(subscriptionLookupEmail);
    if (!email) {
      setSubscriptionLookupError("Zadej e-mail uživatele.");
      return;
    }

    setSubscriptionLookupLoading(true);
    setSubscriptionLookupError(null);
    setSubscriptionLookupStatus(null);
    try {
      await fetchAuthedJsonOrThrow(user, "/api/admin/subscriptions", {
        method: "PATCH",
        body: JSON.stringify({
          action: "addPayment",
          email,
          plan: subscriptionPlanDraft,
          periodFrom: subscriptionFromDraft || undefined,
          note: subscriptionNoteDraft || undefined,
        }),
      });
      const successMessage =
        subscriptionPlanDraft === "unlimited"
          ? "Tarif Neomezený byl nastavený a účet je aktivní bez časového omezení."
          : "Platba byla zapsaná a předplatné aktivované.";
      setSubscriptionNoteDraft("");
      await loadSubscriptionForEmail(email);
      await loadSubscriptionDirectory();
      setSubscriptionLookupStatus({
        type: "success",
        message: successMessage,
      });
    } catch (error) {
      setSubscriptionLookupError(
        error instanceof Error
          ? error.message
          : "Tarif nebo platbu se nepodařilo uložit."
      );
    } finally {
      setSubscriptionLookupLoading(false);
    }
  }, [
    isOwnerAdmin,
    loadSubscriptionDirectory,
    loadSubscriptionForEmail,
    subscriptionFromDraft,
    subscriptionLookupEmail,
    subscriptionNoteDraft,
    subscriptionPlanDraft,
  ]);

  const handleSetSubscriptionUnpaid = useCallback(async () => {
    const user = auth.currentUser;
    if (!user || !isOwnerAdmin) return;
    const email = normalizeEmail(subscriptionLookupEmail);
    if (!email) {
      setSubscriptionLookupError("Zadej e-mail uživatele.");
      return;
    }

    setSubscriptionLookupLoading(true);
    setSubscriptionLookupError(null);
    setSubscriptionLookupStatus(null);
    try {
      await fetchAuthedJsonOrThrow(user, "/api/admin/subscriptions", {
        method: "PATCH",
        body: JSON.stringify({
          action: "setUnpaid",
          email,
          note: subscriptionNoteDraft || undefined,
        }),
      });
      await loadSubscriptionForEmail(email);
      await loadSubscriptionDirectory();
      setSubscriptionLookupStatus({
        type: "info",
        message: "Účet byl označen jako nezaplacený.",
      });
    } catch (error) {
      setSubscriptionLookupError(
        error instanceof Error
          ? error.message
          : "Změnu stavu se nepodařilo uložit."
      );
    } finally {
      setSubscriptionLookupLoading(false);
    }
  }, [
    isOwnerAdmin,
    loadSubscriptionDirectory,
    loadSubscriptionForEmail,
    subscriptionLookupEmail,
    subscriptionNoteDraft,
  ]);

  const handleStartSubscriptionPaymentEdit = useCallback(
    (payment: AdminSubscriptionPaymentRow) => {
      const plan = isPaidSubscriptionPlanValue(payment.plan) ? payment.plan : "monthly";
      setSubscriptionEditingPaymentId(payment.id);
      setSubscriptionEditPlan(plan);
      setSubscriptionEditPeriodFrom(payment.periodFrom || "");
      setSubscriptionEditPeriodUntil(payment.periodUntil || "");
      setSubscriptionEditAmount(payment.amountCzk ? String(payment.amountCzk) : "");
      setSubscriptionEditNote(payment.note ?? "");
      setSubscriptionLookupError(null);
      setSubscriptionLookupStatus(null);
    },
    []
  );

  const handleCancelSubscriptionPaymentEdit = useCallback(() => {
    setSubscriptionEditingPaymentId(null);
    setSubscriptionEditPlan("monthly");
    setSubscriptionEditPeriodFrom("");
    setSubscriptionEditPeriodUntil("");
    setSubscriptionEditAmount("");
    setSubscriptionEditNote("");
  }, []);

  const handleUpdateSubscriptionPayment = useCallback(
    async (paymentId: string) => {
      const user = auth.currentUser;
      if (!user || !isOwnerAdmin) return;
      const email = normalizeEmail(subscriptionLookupEmail);
      if (!email) {
        setSubscriptionLookupError("Zadej e-mail uživatele.");
        return;
      }

      const amountCzk = Number(
        subscriptionEditAmount.trim().replace(/\s+/g, "").replace(",", ".")
      );
      if (!Number.isFinite(amountCzk) || amountCzk <= 0) {
        setSubscriptionLookupError("Částka musí být kladné číslo v Kč.");
        return;
      }
      if (!subscriptionEditPeriodFrom || !subscriptionEditPeriodUntil) {
        setSubscriptionLookupError("Vyplň začátek i konec období platby.");
        return;
      }
      if (subscriptionEditPeriodUntil < subscriptionEditPeriodFrom) {
        setSubscriptionLookupError("Konec období nesmí být před začátkem.");
        return;
      }

      setSubscriptionSavingPaymentId(paymentId);
      setSubscriptionLookupError(null);
      setSubscriptionLookupStatus(null);
      try {
        await fetchAuthedJsonOrThrow(user, "/api/admin/subscriptions", {
          method: "PATCH",
          body: JSON.stringify({
            action: "updatePayment",
            email,
            paymentId,
            plan: subscriptionEditPlan,
            amountCzk: Math.round(amountCzk),
            periodFrom: subscriptionEditPeriodFrom,
            periodUntil: subscriptionEditPeriodUntil,
            note: subscriptionEditNote || undefined,
          }),
        });
        handleCancelSubscriptionPaymentEdit();
        await loadSubscriptionForEmail(email);
        await loadSubscriptionDirectory();
        setSubscriptionLookupStatus({
          type: "success",
          message: "Platba byla upravena.",
        });
      } catch (error) {
        setSubscriptionLookupError(
          error instanceof Error ? error.message : "Platbu se nepodařilo upravit."
        );
      } finally {
        setSubscriptionSavingPaymentId(null);
      }
    },
    [
      handleCancelSubscriptionPaymentEdit,
      isOwnerAdmin,
      loadSubscriptionDirectory,
      loadSubscriptionForEmail,
      subscriptionEditAmount,
      subscriptionEditNote,
      subscriptionEditPeriodFrom,
      subscriptionEditPeriodUntil,
      subscriptionEditPlan,
      subscriptionLookupEmail,
    ]
  );

  const handleDeleteSubscriptionPayment = useCallback(
    async (payment: AdminSubscriptionPaymentRow) => {
      const user = auth.currentUser;
      if (!user || !isOwnerAdmin) return;
      const email = normalizeEmail(subscriptionLookupEmail);
      if (!email) {
        setSubscriptionLookupError("Zadej e-mail uživatele.");
        return;
      }

      const label = `${formatMoneyCzk(payment.amountCzk || 0)} za ${
        formatIsoDay(payment.periodFrom)
      } - ${formatIsoDay(payment.periodUntil)}`;
      if (!window.confirm(`Opravdu smazat platbu ${label}?`)) return;

      setSubscriptionDeletingPaymentId(payment.id);
      setSubscriptionLookupError(null);
      setSubscriptionLookupStatus(null);
      try {
        await fetchAuthedJsonOrThrow(user, "/api/admin/subscriptions", {
          method: "PATCH",
          body: JSON.stringify({
            action: "deletePayment",
            email,
            paymentId: payment.id,
          }),
        });
        if (subscriptionEditingPaymentId === payment.id) {
          handleCancelSubscriptionPaymentEdit();
        }
        await loadSubscriptionForEmail(email);
        await loadSubscriptionDirectory();
        setSubscriptionLookupStatus({
          type: "success",
          message: "Platba byla smazána.",
        });
      } catch (error) {
        setSubscriptionLookupError(
          error instanceof Error ? error.message : "Platbu se nepodařilo smazat."
        );
      } finally {
        setSubscriptionDeletingPaymentId(null);
      }
    },
    [
      handleCancelSubscriptionPaymentEdit,
      isOwnerAdmin,
      loadSubscriptionDirectory,
      loadSubscriptionForEmail,
      subscriptionEditingPaymentId,
      subscriptionLookupEmail,
    ]
  );

  const handleStartAdminUserEdit = useCallback((row: AdminUsersRow) => {
    setAdminUsersEditingEmail(row.email);
    setAdminUsersEditFullName(row.fullName ?? "");
    setAdminUsersEditAgencyNumber(row.agencyNumber ?? "");
    setAdminUsersEditIco(normalizeIcoInput(row.ico ?? ""));
    setAdminUsersEditPhoneNumber(row.phoneNumber ?? "");
    setAdminUsersEditAccountType(
      row.accountType === "advisor" || row.accountType === "tipster"
        ? row.accountType
        : ""
    );
    setAdminUsersEditSpecialist(row.specialist === true);
    setAdminUserSecurityConfirmKey(null);
    setAdminUsersStatus(null);
    setAdminUsersError(null);
  }, []);

  const handleCancelAdminUserEdit = useCallback(() => {
    setAdminUsersEditingEmail(null);
    setAdminUsersEditFullName("");
    setAdminUsersEditAgencyNumber("");
    setAdminUsersEditIco("");
    setAdminUsersEditPhoneNumber("");
    setAdminUsersEditAccountType("");
    setAdminUsersEditSpecialist(false);
    setAdminUserSecurityConfirmKey(null);
  }, []);

  const handleSaveAdminUser = useCallback(
    async (row: AdminUsersRow) => {
      const user = auth.currentUser;
      if (!user || !isAllowedAdmin) return;

      setAdminUsersSavingEmail(row.email);
      setAdminUsersStatus(null);
      setAdminUsersError(null);
      try {
        const nextIco = normalizeIcoInput(adminUsersEditIco);
        if (nextIco && nextIco.length !== ADMIN_USER_ICO_MAX_LEN) {
          setAdminUsersError(`IČO musí mít ${ADMIN_USER_ICO_MAX_LEN} číslic.`);
          return;
        }
        await fetchAuthedJsonOrThrow(user, "/api/admin/users", {
          method: "PATCH",
          body: JSON.stringify({
            email: row.email,
            fullName: adminUsersEditFullName,
            agencyNumber: adminUsersEditAgencyNumber,
            ico: nextIco,
            phoneNumber: adminUsersEditPhoneNumber.trim(),
            accountType: adminUsersEditAccountType,
            specialist: adminUsersEditSpecialist,
          }),
        });
        setAdminUsersStatus({
          type: "success",
          message: `Uživatel ${row.email} byl uložen.`,
        });
        setAdminUsersEditingEmail(null);
        setAdminUsersEditFullName("");
        setAdminUsersEditAgencyNumber("");
        setAdminUsersEditIco("");
        setAdminUsersEditPhoneNumber("");
        setAdminUsersEditAccountType("");
        setAdminUsersEditSpecialist(false);
        await loadAdminUsersRows();
      } catch (error) {
        setAdminUsersError(
          error instanceof Error ? error.message : "Uživatele se nepodařilo uložit."
        );
      } finally {
        setAdminUsersSavingEmail(null);
      }
    },
    [
      adminUsersEditAgencyNumber,
      adminUsersEditAccountType,
      adminUsersEditFullName,
      adminUsersEditIco,
      adminUsersEditPhoneNumber,
      adminUsersEditSpecialist,
      isAllowedAdmin,
      loadAdminUsersRows,
    ]
  );

  const handleAdminUserSecurityAction = useCallback(
    async (row: AdminUsersRow, action: AdminUserSecurityAction) => {
      const user = auth.currentUser;
      if (!user || !isAllowedAdmin) return;

      const actionKey = adminUserSecurityActionKey(row.email, action);
      const needsConfirmation = action === "resetMfa" || action === "revokeSessions";
      if (needsConfirmation && adminUserSecurityConfirmKey !== actionKey) {
        setAdminUserSecurityConfirmKey(actionKey);
        setAdminUsersStatus({
          type: "info",
          message: `Potvrď akci „${getAdminUserSecurityActionLabel(action)}“ druhým kliknutím.`,
        });
        setAdminUsersError(null);
        return;
      }

      setAdminUserSecurityBusyKey(actionKey);
      setAdminUsersStatus(null);
      setAdminUsersError(null);
      try {
        const payload = await fetchAuthedJsonOrThrow<AdminUserSecurityActionResponse>(
          user,
          "/api/admin/users/security",
          {
            method: "POST",
            body: JSON.stringify({
              targetEmail: row.email,
              action,
            }),
          }
        );
        setAdminUsersStatus({
          type: "success",
          message: getAdminUserSecurityActionSuccess(action, row.email, payload),
        });
        setAdminUserSecurityConfirmKey(null);
        await loadAdminUsersRows();
        if (securityRows.length > 0 || activeAdminSection === "security") {
          await loadSecurityRows();
        }
      } catch (error) {
        setAdminUsersError(
          error instanceof Error
            ? error.message
            : "Bezpečnostní akci se nepodařilo provést."
        );
      } finally {
        setAdminUserSecurityBusyKey(null);
      }
    },
    [
      activeAdminSection,
      adminUserSecurityConfirmKey,
      isAllowedAdmin,
      loadAdminUsersRows,
      loadSecurityRows,
      securityRows.length,
    ]
  );

  const handleOpenAdminUserDelete = useCallback((row: AdminUsersRow) => {
    if (!isOwnerAdmin) return;
    setAdminUsersDeleteTarget({
      email: row.email,
      fullName: row.fullName,
    });
    setAdminUsersDeleteConfirmed(false);
    setAdminUsersStatus(null);
    setAdminUsersError(null);
  }, [isOwnerAdmin]);

  const handleImpersonateAdminUser = useCallback(
    (row: AdminUsersRow) => {
      if (!isAllowedAdmin || typeof window === "undefined") return;
      const email = normalizeEmail(row.email);
      const ownEmail = normalizeEmail(currentUser?.email);
      const targetAdminRole = resolveAdminRoleFromClaims(email, null);
      if (!email || row.disabled || email === ownEmail || targetAdminRole) {
        return;
      }

      setAdminImpersonationState({
        email,
        name: row.fullName || nameFromEmail(row.email),
      });
      setAdminUsersStatus({
        type: "success",
        message: `Přepínám zobrazení za ${row.fullName || row.email}.`,
      });
      window.location.href = "/";
    },
    [currentUser?.email, isAllowedAdmin]
  );

  const handleDeleteAdminUser = useCallback(async () => {
    const user = auth.currentUser;
    const target = adminUsersDeleteTarget;
    if (!user || !isOwnerAdmin || !target) return;

    const email = normalizeEmail(target.email);
    if (!adminUsersDeleteConfirmed) {
      setAdminUsersError("Nejdřív potvrď, že chceš uživatele smazat.");
      return;
    }

    setAdminUsersDeletingEmail(email);
    setAdminUsersStatus(null);
    setAdminUsersError(null);
    try {
      await fetchAuthedJsonOrThrow(user, "/api/admin/users", {
        method: "DELETE",
        body: JSON.stringify({
          email,
          confirmEmail: email,
        }),
      });
      setAdminUsersStatus({
        type: "success",
        message: `Uživatel ${email} byl smazán z Auth a profilů.`,
      });
      setAdminUsersDeleteTarget(null);
      setAdminUsersDeleteConfirmed(false);
      await loadAdminUsersRows();
    } catch (error) {
      setAdminUsersError(
        error instanceof Error ? error.message : "Uživatele se nepodařilo smazat."
      );
    } finally {
      setAdminUsersDeletingEmail(null);
    }
  }, [
    adminUsersDeleteConfirmed,
    adminUsersDeleteTarget,
    isOwnerAdmin,
    loadAdminUsersRows,
  ]);

  const fieldClass =
    "w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-[0_8px_18px_rgba(15,23,42,0.04)] outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10";
  const createUserFieldClass =
    "w-full rounded-2xl border border-white/14 bg-white/[0.07] px-3 py-2.5 text-sm font-semibold !text-white shadow-[0_10px_24px_rgba(7,6,25,0.18)] outline-none transition placeholder:!text-violet-100/42 focus:border-violet-200/70 focus:bg-white/[0.1] focus:ring-2 focus:ring-violet-300/20 [caret-color:#f8fafc]";
  const createUserLabelClass =
    "text-[11px] font-semibold uppercase tracking-[0.16em] !text-violet-200/78";
  const adminDarkSectionClass =
    "relative overflow-hidden rounded-[30px] border border-violet-300/25 bg-[linear-gradient(155deg,#1b1032_0%,#130b27_54%,#0c0b1b_100%)] px-4 py-4 !text-white shadow-[0_34px_90px_rgba(7,6,25,0.46),inset_0_1px_0_rgba(196,181,253,0.18)] sm:px-6 sm:py-5";
  const adminDarkTopBarClass =
    "pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#7c3aed_0%,#a855f7_50%,#c084fc_100%)]";
  const adminDarkBadgeClass =
    "mb-3 inline-flex items-center gap-2 rounded-full border border-violet-300/35 bg-white/[0.06] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] !text-violet-100";
  const adminDarkPanelClass =
    "relative rounded-[24px] border border-white/14 bg-white/[0.055] p-4 shadow-[0_18px_44px_rgba(7,6,25,0.28)]";
  const adminDarkSoftPanelClass =
    "rounded-[24px] border border-white/12 bg-white/[0.07] p-4 shadow-[0_16px_38px_rgba(7,6,25,0.22)]";
  const adminDarkMetricClass =
    "rounded-2xl border border-white/14 bg-white/[0.07] px-3 py-3 shadow-[0_12px_28px_rgba(7,6,25,0.2)]";
  const adminDarkSubtleButtonClass =
    "inline-flex items-center gap-2 rounded-full border border-white/16 bg-white/[0.07] px-4 py-2 text-sm font-semibold !text-violet-100 transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-60";
  const adminDarkPrimaryButtonClass =
    "inline-flex items-center justify-center gap-2 rounded-2xl border border-violet-300/25 bg-[linear-gradient(120deg,#7c3aed_0%,#a855f7_55%,#c084fc_100%)] px-5 py-2.5 text-sm font-semibold !text-white shadow-[0_14px_30px_rgba(124,58,237,0.34)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60";
  const subscriptionHistoryFieldClass =
    "h-9 w-full min-w-[116px] rounded-xl border border-white/14 bg-white/[0.075] px-2 text-xs font-semibold !text-white outline-none transition placeholder:!text-violet-100/42 focus:border-violet-200/70 focus:bg-white/[0.11] focus:ring-2 focus:ring-violet-300/20 disabled:cursor-not-allowed disabled:opacity-60";
  const subscriptionHistoryIconButtonClass =
    "inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/14 bg-white/[0.075] !text-violet-100 transition hover:bg-white/[0.14] disabled:cursor-not-allowed disabled:opacity-55";
  const subscriptionHistoryDangerButtonClass =
    "inline-flex h-8 w-8 items-center justify-center rounded-xl border border-rose-300/30 bg-rose-500/12 text-rose-100 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-55";
  const selectedAdminUser = adminUsersEditingEmail
    ? adminUsersRows.find((row) => row.email === adminUsersEditingEmail) ?? null
    : null;
  const selectedAdminUserDraft = selectedAdminUser
    ? {
        ...selectedAdminUser,
        fullName: adminUsersEditFullName.trim() || null,
        agencyNumber: adminUsersEditAgencyNumber.trim() || null,
        ico: normalizeIcoInput(adminUsersEditIco) || null,
        phoneNumber: adminUsersEditPhoneNumber.trim() || null,
        accountType: adminUsersEditAccountType || null,
        specialist: adminUsersEditSpecialist,
      }
    : null;
  const selectedAdminUserMissingItems = selectedAdminUserDraft
    ? buildAdminUserMissingItems(selectedAdminUserDraft)
    : [];
  const selectedAdminUserOnlineCardSlug = selectedAdminUser?.onlineCard?.slug ?? null;
  const selectedAdminUserOnlineCardUrl = buildOnlineCardPublicUrl(
    selectedAdminUserOnlineCardSlug
  );
  const selectedAdminUserOnlineCardLabel = selectedAdminUser
    ? getAdminUserOnlineCardLabel(selectedAdminUser)
    : "";
  const selectedAdminUserOnlineCardBadgeClass =
    selectedAdminUser?.onlineCard?.ready === true
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : selectedAdminUserOnlineCardSlug
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-slate-200 bg-slate-50 text-slate-600";
  const selectedAdminUserMfaFactors = selectedAdminUser?.mfa?.factors ?? [];
  const selectedAdminUserMfaEnabled = selectedAdminUser?.mfa?.enabled === true;
  const selectedAdminUserResetPasswordKey = selectedAdminUser
    ? adminUserSecurityActionKey(selectedAdminUser.email, "sendPasswordReset")
    : "";
  const selectedAdminUserResetMfaKey = selectedAdminUser
    ? adminUserSecurityActionKey(selectedAdminUser.email, "resetMfa")
    : "";
  const selectedAdminUserVerifyEmailKey = selectedAdminUser
    ? adminUserSecurityActionKey(selectedAdminUser.email, "verifyEmail")
    : "";
  const selectedAdminUserRevokeSessionsKey = selectedAdminUser
    ? adminUserSecurityActionKey(selectedAdminUser.email, "revokeSessions")
    : "";

  useEffect(() => {
    if (!selectedAdminUserOnlineCardUrl) {
      setAdminUserOnlineCardQrDataUrl("");
      setAdminUserOnlineCardQrLoading(false);
      setAdminUserOnlineCardQrError(null);
      setAdminUserOnlineCardQrStatus(null);
      return;
    }

    let cancelled = false;
    setAdminUserOnlineCardQrDataUrl("");
    setAdminUserOnlineCardQrLoading(true);
    setAdminUserOnlineCardQrError(null);
    setAdminUserOnlineCardQrStatus(null);

    void import("qrcode")
      .then((qrCodeModule) =>
        qrCodeModule.default.toDataURL(selectedAdminUserOnlineCardUrl, {
          width: 520,
          margin: 2,
          errorCorrectionLevel: "M",
          color: {
            dark: "#0f172a",
            light: "#ffffff",
          },
        })
      )
      .then((dataUrl) => {
        if (!cancelled) {
          setAdminUserOnlineCardQrDataUrl(dataUrl);
        }
      })
      .catch((error) => {
        console.error("Chyba při generování QR kódu online vizitky v adminu:", error);
        if (!cancelled) {
          setAdminUserOnlineCardQrError("QR kód se nepodařilo vygenerovat.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setAdminUserOnlineCardQrLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedAdminUserOnlineCardUrl]);

  const handleCopySelectedAdminUserOnlineCardUrl = useCallback(async () => {
    if (!selectedAdminUserOnlineCardUrl) return;
    try {
      await navigator.clipboard.writeText(selectedAdminUserOnlineCardUrl);
      setAdminUserOnlineCardQrStatus("URL vizitky zkopírována.");
      setAdminUserOnlineCardQrError(null);
    } catch {
      setAdminUserOnlineCardQrError("URL vizitky se nepodařilo zkopírovat.");
      setAdminUserOnlineCardQrStatus(null);
    }
  }, [selectedAdminUserOnlineCardUrl]);

  const handleDownloadSelectedAdminUserOnlineCardQr = useCallback(() => {
    if (!adminUserOnlineCardQrDataUrl || typeof document === "undefined") return;

    const link = document.createElement("a");
    link.href = adminUserOnlineCardQrDataUrl;
    link.download = `vizitka-${selectedAdminUserOnlineCardSlug || "profil"}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setAdminUserOnlineCardQrStatus("QR kód stažen jako PNG.");
    setAdminUserOnlineCardQrError(null);
  }, [adminUserOnlineCardQrDataUrl, selectedAdminUserOnlineCardSlug]);

  return (
    <AppLayout active="admin">
      {showCreateUserCelebration ? (
        <div
          key={createUserCelebrationKey}
          className="admin-create-celebration pointer-events-none fixed inset-0 z-[90] flex items-center justify-center px-4"
          aria-live="polite"
          aria-atomic="true"
        >
          <div className="absolute inset-0 bg-slate-950/24 backdrop-blur-[5px]" />
          <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2">
            {CREATE_USER_CONFETTI_PIECES.map((piece, index) => (
              <span
                key={`${piece.x}-${piece.y}-${index}`}
                className={`admin-create-confetti-piece absolute left-1/2 top-1/2 ${piece.shapeClass}`}
                style={
                  {
                    "--admin-confetti-x": `${piece.x}px`,
                    "--admin-confetti-y": `${piece.y}px`,
                    "--admin-confetti-rotate": `${piece.rotate}deg`,
                    "--admin-confetti-color": piece.color,
                    animationDelay: `${piece.delayMs}ms`,
                  } as CSSProperties
                }
              />
            ))}
          </div>
          <div className="admin-create-success-stage relative flex min-h-[260px] flex-col items-center justify-center px-4 text-center">
            <span className="admin-create-success-aura absolute inset-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full" />
            <span className="admin-create-success-orbit absolute left-1/2 top-1/2 h-[210px] w-[210px] -translate-x-1/2 -translate-y-1/2 rounded-full" />
            <span className="admin-create-success-check relative mb-5 inline-flex h-24 w-24 items-center justify-center rounded-full !text-violet-100">
              <Check size={52} strokeWidth={2.7} aria-hidden="true" />
            </span>
            <p className="admin-create-success-kicker text-[12px] font-semibold uppercase tracking-[0.32em]">
              Hotovo
            </p>
            <p className="admin-create-success-title mt-2 font-bold tracking-[-0.02em]">
              Uživatel vytvořen !
            </p>
          </div>
        </div>
      ) : null}
      {adminUsersDeleteTarget ? (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center px-4"
          role="dialog"
          aria-modal="true"
          aria-label="Smazat uživatele"
        >
          <div
            className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
            onClick={() => {
              if (adminUsersDeletingEmail) return;
              setAdminUsersDeleteTarget(null);
              setAdminUsersDeleteConfirmed(false);
            }}
          />
          <section className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-rose-200 bg-white p-5 shadow-[0_30px_90px_rgba(15,23,42,0.35)]">
            <span className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-rose-500" />
            <div className="flex items-start gap-3">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-700">
                <AlertTriangle size={22} strokeWidth={2.2} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-slate-900">
                  Smazat uživatele?
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  Smaže se Firebase Auth účet a profil v databázi. Historické smlouvy a další
                  obchodní data se tímto krokem nemažou.
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
              <div className="text-sm font-semibold text-slate-900">
                {adminUsersDeleteTarget.fullName || nameFromEmail(adminUsersDeleteTarget.email)}
              </div>
              <div className="mt-0.5 text-sm text-slate-600">{adminUsersDeleteTarget.email}</div>
            </div>

            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-950 transition hover:border-rose-300 hover:bg-rose-100">
              <input
                type="checkbox"
                checked={adminUsersDeleteConfirmed}
                onChange={(event) => setAdminUsersDeleteConfirmed(event.target.checked)}
                disabled={Boolean(adminUsersDeletingEmail)}
                className="mt-0.5 h-5 w-5 rounded border-rose-300 text-rose-600 accent-rose-600 disabled:cursor-not-allowed"
              />
              <span>
                <span className="block font-semibold">
                  Rozumím, chci smazat tohoto uživatele.
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-rose-800">
                  Administrátorská akce smaže přihlášení a profily pro{" "}
                  <span className="font-semibold">{adminUsersDeleteTarget.email}</span>.
                </span>
              </span>
            </label>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setAdminUsersDeleteTarget(null);
                  setAdminUsersDeleteConfirmed(false);
                }}
                disabled={Boolean(adminUsersDeletingEmail)}
                className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <X size={15} strokeWidth={2.2} aria-hidden="true" />
                Zrušit
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteAdminUser()}
                disabled={
                  Boolean(adminUsersDeletingEmail) ||
                  !adminUsersDeleteConfirmed
                }
                className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-rose-600 bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {adminUsersDeletingEmail ? (
                  <Loader2 size={15} strokeWidth={2.2} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 size={15} strokeWidth={2.2} aria-hidden="true" />
                )}
                Smazat uživatele
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {selectedAdminUser ? (
        <div
          className="fixed inset-0 z-[92] flex items-center justify-center px-3 py-4"
          role="dialog"
          aria-modal="true"
          aria-label="Detail uživatele"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
            aria-label="Zavřít detail uživatele"
            onClick={handleCancelAdminUserEdit}
          />
          <form
            className="relative max-h-[calc(100vh-2rem)] w-full max-w-5xl overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-[0_34px_92px_rgba(15,23,42,0.34)]"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSaveAdminUser(selectedAdminUser);
            }}
          >
            <span className={adminDarkTopBarClass} />
            <div className="grid gap-0 lg:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.55fr)]">
              <aside className="relative overflow-hidden bg-slate-950 px-5 py-5 !text-white sm:px-6">
                <button
                  type="button"
                  onClick={handleCancelAdminUserEdit}
                  className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/14 bg-white/[0.08] text-white transition hover:bg-white/[0.14]"
                  aria-label="Zavřít detail"
                >
                  <X size={16} strokeWidth={2.2} aria-hidden="true" />
                </button>

                <div className="pr-10">
                  <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-white/18 bg-white text-xl font-bold text-slate-950">
                    {(selectedAdminUser.fullName || selectedAdminUser.email).charAt(0).toUpperCase()}
                  </span>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                        selectedAdminUserMissingItems.length === 0
                          ? "border-violet-200/55 bg-violet-300/18 !text-violet-50"
                          : "border-amber-200/55 bg-amber-300/18 !text-amber-50"
                      }`}
                    >
                      {selectedAdminUserMissingItems.length === 0 ? (
                        <CheckCircle2 size={13} strokeWidth={2.4} aria-hidden="true" />
                      ) : (
                        <AlertTriangle size={13} strokeWidth={2.4} aria-hidden="true" />
                      )}
                      {selectedAdminUserMissingItems.length === 0
                        ? "OK"
                        : `K doplnění ${selectedAdminUserMissingItems.length}`}
                    </span>
                    <span className="rounded-full border border-white/22 bg-white/[0.13] px-2.5 py-1 text-xs font-semibold !text-white">
                      {formatAccountTypeLabel(adminUsersEditAccountType || selectedAdminUser.accountType)}
                    </span>
                    {adminUsersEditSpecialist ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-cyan-200/55 bg-cyan-300/18 px-2.5 py-1 text-xs font-semibold !text-cyan-50">
                        <ShieldCheck size={13} strokeWidth={2.4} aria-hidden="true" />
                        Specialista
                      </span>
                    ) : null}
                  </div>
                  <h2 className="mt-4 break-words text-2xl font-bold leading-tight text-white">
                    {selectedAdminUser.fullName || nameFromEmail(selectedAdminUser.email)}
                  </h2>
                  <p className="mt-1 break-all text-sm font-semibold !text-slate-100">
                    {selectedAdminUser.email}
                  </p>
                </div>

                <div className="mt-5 space-y-2">
                  {selectedAdminUserMissingItems.length > 0 ? (
                    selectedAdminUserMissingItems.map((item) => (
                      <div
                        key={item.key}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200/40 bg-amber-300/16 px-3 py-2 text-sm font-semibold !text-amber-50"
                      >
                        <span>{item.label}</span>
                        <span className="rounded-full bg-amber-100/20 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] !text-amber-50">
                          Chybí
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="flex items-center gap-2 rounded-2xl border border-violet-200/40 bg-violet-300/16 px-3 py-3 text-sm font-semibold !text-violet-50">
                      <CheckCircle2 size={16} strokeWidth={2.3} aria-hidden="true" />
                      Profil má vyplněné hlavní údaje.
                    </div>
                  )}
                </div>

                <div className="mt-5 grid gap-2 text-xs !text-slate-100">
                  <div className="rounded-2xl border border-white/16 bg-white/[0.1] px-3 py-2">
                    <span className="block font-semibold uppercase tracking-[0.14em] !text-slate-200">
                      Auth
                    </span>
                    <span className="mt-1 block font-semibold !text-white">
                      {selectedAdminUser.disabled ? "Deaktivovaný" : "Aktivní"} ·{" "}
                      {selectedAdminUser.emailVerified ? "E-mail ověřen" : "E-mail neověřen"}
                    </span>
                  </div>
                  <div className="rounded-2xl border border-white/16 bg-white/[0.1] px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold uppercase tracking-[0.14em] !text-slate-200">
                        2FA
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                          selectedAdminUserMfaEnabled
                            ? "border-violet-200/55 bg-violet-300/18 !text-violet-50"
                            : "border-rose-200/55 bg-rose-300/18 !text-rose-50"
                        }`}
                      >
                        {selectedAdminUserMfaEnabled ? (
                          <ShieldCheck size={11} strokeWidth={2.3} aria-hidden="true" />
                        ) : (
                          <ShieldAlert size={11} strokeWidth={2.3} aria-hidden="true" />
                        )}
                        {selectedAdminUserMfaEnabled ? "Aktivní" : "Nenastavená"}
                      </span>
                    </div>
                    {selectedAdminUserMfaFactors.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {selectedAdminUserMfaFactors.map((factor) => (
                          <span
                            key={factor.uid}
                            className="inline-flex items-center gap-1 rounded-full border border-white/18 bg-white/[0.13] px-2 py-0.5 text-[11px] font-semibold !text-white"
                            title={
                              factor.enrollmentTime
                                ? `Zapsáno: ${formatAuthDateTime(factor.enrollmentTime)}`
                                : undefined
                            }
                          >
                            {getMfaFactorLabel(factor)}
                            {factor.displayName ? ` · ${factor.displayName}` : ""}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-[11px] leading-relaxed !text-slate-200">
                        Uživatel si při dalším vstupu do aplikace nastaví nové 2FA.
                      </p>
                    )}
                  </div>
                  <div className="rounded-2xl border border-white/16 bg-white/[0.1] px-3 py-3">
                    <span className="block font-semibold uppercase tracking-[0.14em] !text-slate-200">
                      Bezpečnostní akce
                    </span>
                    <div className="mt-3 grid gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          void handleAdminUserSecurityAction(
                            selectedAdminUser,
                            "sendPasswordReset"
                          )
                        }
                        disabled={Boolean(adminUserSecurityBusyKey)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-white/22 bg-white/[0.14] px-3 py-2 text-xs font-semibold !text-white transition hover:bg-white/[0.2] disabled:cursor-not-allowed disabled:opacity-75"
                      >
                        {adminUserSecurityBusyKey === selectedAdminUserResetPasswordKey ? (
                          <Loader2 size={13} strokeWidth={2.2} className="animate-spin" aria-hidden="true" />
                        ) : (
                          <KeyRound size={13} strokeWidth={2.2} aria-hidden="true" />
                        )}
                        Poslat reset hesla
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void handleAdminUserSecurityAction(selectedAdminUser, "resetMfa")
                        }
                        disabled={Boolean(adminUserSecurityBusyKey)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-amber-200/45 bg-amber-300/18 px-3 py-2 text-xs font-semibold !text-amber-50 transition hover:bg-amber-300/24 disabled:cursor-not-allowed disabled:opacity-75"
                      >
                        {adminUserSecurityBusyKey === selectedAdminUserResetMfaKey ? (
                          <Loader2 size={13} strokeWidth={2.2} className="animate-spin" aria-hidden="true" />
                        ) : (
                          <ShieldAlert size={13} strokeWidth={2.2} aria-hidden="true" />
                        )}
                        {adminUserSecurityConfirmKey === selectedAdminUserResetMfaKey
                          ? "Potvrdit reset 2FA"
                          : "Resetovat 2FA"}
                      </button>
                      {!selectedAdminUser.emailVerified ? (
                        <button
                          type="button"
                          onClick={() =>
                            void handleAdminUserSecurityAction(
                              selectedAdminUser,
                              "verifyEmail"
                            )
                          }
                          disabled={Boolean(adminUserSecurityBusyKey)}
                          className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-sky-200/45 bg-sky-300/18 px-3 py-2 text-xs font-semibold !text-sky-50 transition hover:bg-sky-300/24 disabled:cursor-not-allowed disabled:opacity-75"
                        >
                          {adminUserSecurityBusyKey === selectedAdminUserVerifyEmailKey ? (
                            <Loader2 size={13} strokeWidth={2.2} className="animate-spin" aria-hidden="true" />
                          ) : (
                            <Mail size={13} strokeWidth={2.2} aria-hidden="true" />
                          )}
                          Označit e-mail jako ověřený
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() =>
                          void handleAdminUserSecurityAction(
                            selectedAdminUser,
                            "revokeSessions"
                          )
                        }
                        disabled={Boolean(adminUserSecurityBusyKey)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-rose-200/45 bg-rose-300/18 px-3 py-2 text-xs font-semibold !text-rose-50 transition hover:bg-rose-300/24 disabled:cursor-not-allowed disabled:opacity-75"
                      >
                        {adminUserSecurityBusyKey === selectedAdminUserRevokeSessionsKey ? (
                          <Loader2 size={13} strokeWidth={2.2} className="animate-spin" aria-hidden="true" />
                        ) : (
                          <RefreshCcw size={13} strokeWidth={2.2} aria-hidden="true" />
                        )}
                        {adminUserSecurityConfirmKey === selectedAdminUserRevokeSessionsKey
                          ? "Potvrdit odhlášení"
                          : "Odhlásit relace"}
                      </button>
                    </div>
                  </div>
                </div>
              </aside>

              <div className="px-5 py-5 sm:px-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">
                      Profil uživatele
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Upravitelné kontaktní a identifikační údaje.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleCancelAdminUserEdit}
                      disabled={adminUsersSavingEmail === selectedAdminUser.email}
                      className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <X size={15} strokeWidth={2.2} aria-hidden="true" />
                      Zavřít
                    </button>
                    <button
                      type="submit"
                      disabled={adminUsersSavingEmail === selectedAdminUser.email}
                      className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-900 bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {adminUsersSavingEmail === selectedAdminUser.email ? (
                        <Loader2 size={15} strokeWidth={2.2} className="animate-spin" aria-hidden="true" />
                      ) : (
                        <Save size={15} strokeWidth={2.2} aria-hidden="true" />
                      )}
                      Uložit
                    </button>
                  </div>
                </div>

                {adminUsersStatus ? (
                  <div
                    className={`mt-4 rounded-2xl border px-3 py-2 text-sm font-semibold ${
                      adminUsersStatus.type === "success"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : adminUsersStatus.type === "info"
                          ? "border-sky-200 bg-sky-50 text-sky-700"
                          : "border-rose-200 bg-rose-50 text-rose-700"
                    }`}
                  >
                    {adminUsersStatus.message}
                  </div>
                ) : null}
                {adminUsersError ? (
                  <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                    {adminUsersError}
                  </div>
                ) : null}

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <label className="space-y-1.5">
                    <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-700">
                      <UserRound size={13} strokeWidth={2.2} aria-hidden="true" />
                      Jméno / název
                    </span>
                    <input
                      type="text"
                      value={adminUsersEditFullName}
                      onChange={(event) => setAdminUsersEditFullName(event.target.value)}
                      className={fieldClass}
                      placeholder="Jméno a příjmení"
                      maxLength={120}
                    />
                  </label>

                  <label className="space-y-1.5">
                    <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-700">
                      <UserPlus size={13} strokeWidth={2.2} aria-hidden="true" />
                      Typ účtu
                    </span>
                    <select
                      value={adminUsersEditAccountType}
                      onChange={(event) =>
                        setAdminUsersEditAccountType(
                          event.target.value as AdminUsersAccountTypeDraft
                        )
                      }
                      className={fieldClass}
                    >
                      <option value="">Bez typu účtu</option>
                      <option value="advisor">Vázaný zástupce</option>
                      <option value="tipster">Tipař</option>
                    </select>
                  </label>

                  <label className="space-y-1.5">
                    <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-700">
                      <IdCard size={13} strokeWidth={2.2} aria-hidden="true" />
                      Agenturní číslo
                    </span>
                    <input
                      type="text"
                      value={adminUsersEditAgencyNumber}
                      onChange={(event) => setAdminUsersEditAgencyNumber(event.target.value)}
                      className={fieldClass}
                      placeholder="Volitelné"
                      maxLength={NEW_USER_AGENCY_NUMBER_MAX_LEN}
                    />
                  </label>

                  <label className="space-y-1.5">
                    <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-700">
                      <Building2 size={13} strokeWidth={2.2} aria-hidden="true" />
                      IČO
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={adminUsersEditIco}
                      onChange={(event) => setAdminUsersEditIco(normalizeIcoInput(event.target.value))}
                      className={fieldClass}
                      placeholder="12345678"
                      maxLength={ADMIN_USER_ICO_MAX_LEN}
                    />
                  </label>

                  <label className="space-y-1.5 sm:col-span-2">
                    <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-700">
                      <PhoneCall size={13} strokeWidth={2.2} aria-hidden="true" />
                      Telefon
                    </span>
                    <input
                      type="tel"
                      inputMode="tel"
                      value={adminUsersEditPhoneNumber}
                      onChange={(event) =>
                        setAdminUsersEditPhoneNumber(
                          event.target.value.slice(0, ADMIN_USER_PHONE_MAX_LEN)
                        )
                      }
                      className={fieldClass}
                      placeholder="777 123 456"
                      maxLength={ADMIN_USER_PHONE_MAX_LEN}
                    />
                  </label>

                  <label className="flex items-start gap-3 rounded-2xl border border-cyan-200 bg-cyan-50 px-3 py-3 sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={adminUsersEditSpecialist}
                      onChange={(event) => setAdminUsersEditSpecialist(event.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-cyan-300 text-cyan-700 accent-cyan-700"
                    />
                    <span>
                      <span className="inline-flex items-center gap-1 text-sm font-semibold text-cyan-900">
                        <ShieldCheck size={14} strokeWidth={2.3} aria-hidden="true" />
                        Specialista
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-cyan-800">
                        Může v pomůcce Dokumenty spravovat dokumenty, upravovat položky a nahrávat PDF nebo obrázky.
                      </span>
                    </span>
                  </label>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {[
                    {
                      label: selectedAdminUser.accountType === "tipster" ? "Příjemce tipů" : "Nadřízený",
                      value:
                        selectedAdminUser.accountType === "tipster"
                          ? selectedAdminUser.tipRecipientEmail
                          : selectedAdminUser.managerEmail,
                    },
                    {
                      label: "Pozice",
                      value: formatPositionLabel(selectedAdminUser.position) || "—",
                    },
                    {
                      label: "Provizní režim",
                      value:
                        COMMISSION_MODES.find((mode) => mode.id === selectedAdminUser.commissionMode)
                          ?.label ??
                        selectedAdminUser.commissionMode ??
                        "—",
                    },
                    {
                      label: "Specialista",
                      value: adminUsersEditSpecialist ? "Ano" : "Ne",
                    },
                    {
                      label: "Dokončení setupu",
                      value: formatAuthDateTime(selectedAdminUser.accountSetupCompletedAt),
                    },
                    {
                      label: "Vytvořen",
                      value: formatAuthDateTime(selectedAdminUser.createdAt),
                    },
                    {
                      label: "Poslední přihlášení",
                      value: formatAuthDateTime(selectedAdminUser.lastSignInAt),
                    },
                    {
                      label: "Veřejný profil",
                      value: selectedAdminUser.profileExists ? "Ano" : "Ne",
                    },
                    {
                      label: "Online vizitka",
                      value: selectedAdminUserOnlineCardLabel,
                    },
                    {
                      label: "Slug vizitky",
                      value: selectedAdminUser.onlineCard?.slug ?? "—",
                    },
                    {
                      label: "Soukromý profil",
                      value: selectedAdminUser.privateProfileExists ? "Ano" : "Ne",
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3"
                    >
                      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        {item.label}
                      </div>
                      <div className="mt-1 break-words text-sm font-semibold text-slate-900">
                        {item.value || "—"}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-5 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">
                      <QrCode size={13} strokeWidth={2.2} aria-hidden="true" />
                      QR online vizitky
                    </div>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${selectedAdminUserOnlineCardBadgeClass}`}
                    >
                      {selectedAdminUserOnlineCardLabel}
                    </span>
                  </div>

                  {selectedAdminUserOnlineCardUrl ? (
                    <div className="grid gap-4 sm:grid-cols-[176px_minmax(0,1fr)] sm:items-start">
                      <div className="flex h-44 w-44 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-2">
                        {adminUserOnlineCardQrLoading ? (
                          <Loader2
                            size={26}
                            strokeWidth={2.2}
                            className="animate-spin text-slate-500"
                            aria-hidden="true"
                          />
                        ) : adminUserOnlineCardQrDataUrl ? (
                          <Image
                            src={adminUserOnlineCardQrDataUrl}
                            alt="QR kód online vizitky"
                            width={160}
                            height={160}
                            unoptimized
                            className="h-full w-full rounded-xl object-contain"
                          />
                        ) : (
                          <QrCode
                            size={32}
                            strokeWidth={2}
                            className="text-slate-400"
                            aria-hidden="true"
                          />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                            Veřejná URL
                          </div>
                          <div className="mt-1 break-all text-sm font-semibold text-slate-900">
                            {selectedAdminUserOnlineCardUrl}
                          </div>
                        </div>
                        {selectedAdminUser.onlineCard?.ready !== true ? (
                          <p className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                            QR je připravený pro slug vizitky, ale online vizitka není aktivně publikovaná.
                          </p>
                        ) : null}

                        {adminUserOnlineCardQrError ? (
                          <p className="mt-2 text-xs font-semibold text-rose-700">
                            {adminUserOnlineCardQrError}
                          </p>
                        ) : null}
                        {adminUserOnlineCardQrStatus ? (
                          <p className="mt-2 text-xs font-semibold text-violet-700">
                            {adminUserOnlineCardQrStatus}
                          </p>
                        ) : null}

                        <div className="mt-3 flex flex-wrap gap-2">
                          <a
                            href={selectedAdminUserOnlineCardUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                          >
                            <ExternalLink size={14} strokeWidth={2.2} aria-hidden="true" />
                            Otevřít
                          </a>
                          <button
                            type="button"
                            onClick={() => void handleCopySelectedAdminUserOnlineCardUrl()}
                            className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                          >
                            <Copy size={14} strokeWidth={2.2} aria-hidden="true" />
                            Kopírovat URL
                          </button>
                          <button
                            type="button"
                            onClick={handleDownloadSelectedAdminUserOnlineCardQr}
                            disabled={!adminUserOnlineCardQrDataUrl}
                            className="inline-flex items-center gap-1.5 rounded-2xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Download size={14} strokeWidth={2.2} aria-hidden="true" />
                            Stáhnout QR
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm font-semibold text-slate-600">
                      {selectedAdminUser.onlineCard?.enabled
                        ? "Vizitka je zapnutá, ale nemá platnou adresu nebo jméno."
                        : "Uživatel zatím nemá nastavený slug online vizitky."}
                    </div>
                  )}
                </div>

                {selectedAdminUser.positionTimeline.length > 0 ? (
                  <div className="mt-5 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                    <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">
                      <BriefcaseBusiness size={13} strokeWidth={2.2} aria-hidden="true" />
                      Kariérní historie
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {selectedAdminUser.positionTimeline.slice(0, 6).map((row) => (
                        <div
                          key={row.id}
                          className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                        >
                          <div className="font-semibold text-slate-900">
                            {formatPositionLabel(row.position) || row.position}
                          </div>
                          <div className="mt-0.5 text-xs text-slate-500">
                            {formatIsoDay(row.validFrom)} - {formatIsoDay(row.validTo)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {isOwnerAdmin ? (
                  <div className="mt-5 flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleOpenAdminUserDelete(selectedAdminUser)}
                      disabled={
                        normalizeEmail(currentUser?.email) === selectedAdminUser.email ||
                        Boolean(adminUsersSavingEmail)
                      }
                      className="inline-flex items-center gap-1.5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Trash2 size={15} strokeWidth={2.2} aria-hidden="true" />
                      Smazat uživatele
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </form>
        </div>
      ) : null}
      <div className="w-full max-w-[1200px] space-y-6 px-2 pb-8 sm:px-4">
        <section className={adminDarkSectionClass}>
          <div className={adminDarkTopBarClass} />

          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <span className={adminDarkBadgeClass}>
                Řídicí panel
              </span>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight !text-white sm:text-3xl">
                  Admin
                </h1>
                {canAccessAdminPanel ? (
                  <div className="flex w-fit max-w-full flex-wrap gap-1 overflow-x-auto rounded-full border border-white/14 bg-white/[0.06] p-1 shadow-[0_16px_34px_rgba(7,6,25,0.24)]">
                    {isAllowedAdmin ? (
                      <button
                        type="button"
                        onClick={() => setActiveAdminSection("requests")}
                        className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${
                          activeAdminSection === "requests"
                            ? "bg-[linear-gradient(135deg,#6d28d9_0%,#8b5cf6_100%)] !text-white shadow-[0_8px_18px_rgba(109,40,217,0.28)]"
                            : "!text-violet-100/72 hover:bg-white/[0.08] hover:!text-white"
                        }`}
                      >
                        Žádosti
                      </button>
                    ) : null}
                    {canCreateUsers ? (
                      <button
                        type="button"
                        onClick={() => setActiveAdminSection("createUser")}
                        className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${
                          activeAdminSection === "createUser"
                            ? "bg-[linear-gradient(135deg,#6d28d9_0%,#8b5cf6_100%)] !text-white shadow-[0_8px_18px_rgba(109,40,217,0.28)]"
                            : "!text-violet-100/72 hover:bg-white/[0.08] hover:!text-white"
                        }`}
                      >
                        Přidat uživatele
                      </button>
                    ) : null}
                    {isAllowedAdmin ? (
                      <button
                        type="button"
                        onClick={() => setActiveAdminSection("users")}
                        className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${
                          activeAdminSection === "users"
                            ? "bg-[linear-gradient(135deg,#6d28d9_0%,#8b5cf6_100%)] !text-white shadow-[0_8px_18px_rgba(109,40,217,0.28)]"
                            : "!text-violet-100/72 hover:bg-white/[0.08] hover:!text-white"
                        }`}
                      >
                        Uživatelé
                      </button>
                    ) : null}
                    {isAllowedAdmin ? (
                      <button
                        type="button"
                        onClick={() => setActiveAdminSection("broadcasts")}
                        className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${
                          activeAdminSection === "broadcasts"
                            ? "bg-[linear-gradient(135deg,#6d28d9_0%,#8b5cf6_100%)] !text-white shadow-[0_8px_18px_rgba(109,40,217,0.28)]"
                            : "!text-violet-100/72 hover:bg-white/[0.08] hover:!text-white"
                        }`}
                      >
                        Notifikace
                      </button>
                    ) : null}
                    {isOwnerAdmin ? (
                      <button
                        type="button"
                        onClick={() => setActiveAdminSection("subscriptions")}
                        className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${
                          activeAdminSection === "subscriptions"
                            ? "bg-[linear-gradient(135deg,#6d28d9_0%,#8b5cf6_100%)] !text-white shadow-[0_8px_18px_rgba(109,40,217,0.28)]"
                            : "!text-violet-100/72 hover:bg-white/[0.08] hover:!text-white"
                        }`}
                      >
                        Předplatné
                      </button>
                    ) : null}
                    {isAllowedAdmin ? (
                      <button
                        type="button"
                        onClick={() => setActiveAdminSection("security")}
                        className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${
                          activeAdminSection === "security"
                            ? "bg-[linear-gradient(135deg,#6d28d9_0%,#8b5cf6_100%)] !text-white shadow-[0_8px_18px_rgba(109,40,217,0.28)]"
                            : "!text-violet-100/72 hover:bg-white/[0.08] hover:!text-white"
                        }`}
                      >
                        Zabezpečení
                      </button>
                    ) : null}
                    {isAllowedAdmin ? (
                      <Link
                        href="/admin/data-health"
                        className="whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold !text-violet-100/72 transition hover:bg-white/[0.08] hover:!text-white"
                      >
                        Data Health
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
            {isAllowedAdmin && activeAdminSection === "requests" ? (
              <button
                type="button"
                onClick={() => void refreshAllRequests()}
                disabled={loading || userRequestsLoading}
                className={adminDarkSubtleButtonClass}
              >
                <RefreshCcw size={15} strokeWidth={2.2} aria-hidden="true" />
                Obnovit
              </button>
            ) : null}
          </div>

          {!canAccessAdminPanel ? (
            <div className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              Tato sekce je dostupná pouze pro účty s rolí owner, admin nebo accountCreator.
            </div>
          ) : (
            <>
              {isAllowedAdmin && activeAdminSection === "requests" ? (
                <div className="grid items-start gap-5 xl:grid-cols-[248px_minmax(0,1fr)]">
                  <aside className="space-y-3 xl:sticky xl:top-24">
                    <div className="overflow-hidden rounded-[24px] border border-violet-300/30 bg-[linear-gradient(145deg,#5b21b6_0%,#7c3aed_56%,#a855f7_100%)] p-4 text-white shadow-[0_22px_48px_rgba(109,40,217,0.28)]">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-100/80">
                        Žádosti
                      </div>
                      <div className="mt-3 flex items-end justify-between gap-3">
                        <div>
                          <div className="text-4xl font-bold leading-none">{pendingUnifiedCount}</div>
                          <div className="mt-1 text-xs font-medium text-violet-100">čeká na akci</div>
                        </div>
                        <div className="rounded-full border border-white/20 bg-white/15 px-2.5 py-1 text-xs font-semibold text-white">
                          {filteredUnifiedRequests.length}/{totalRequestsCount}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className={adminDarkMetricClass}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] !text-violet-200/78">
                            Celkem
                          </span>
                          <span className="text-xl font-bold !text-white">{totalRequestsCount}</span>
                        </div>
                      </div>
                      <div className={adminDarkMetricClass}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] !text-violet-200/78">
                            K vyřízení
                          </span>
                          <span className="text-xl font-bold !text-white">{pendingUnifiedCount}</span>
                        </div>
                      </div>
                      <div className={adminDarkMetricClass}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] !text-violet-200/78">
                            Ukončení
                          </span>
                          <span className="text-xl font-bold !text-white">{pendingEndCollaborationCount}</span>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3 shadow-[0_10px_24px_rgba(244,63,94,0.08)]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-700">
                            Po SLA
                          </span>
                          <span className="text-xl font-bold text-rose-900">{overdueUrgentCount}</span>
                        </div>
                      </div>
                    </div>
                  </aside>

                  <div className={`min-w-0 ${adminDarkPanelClass}`}>
                  <div className="mb-4 flex flex-col gap-3 border-b border-white/10 pb-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <span className="inline-flex rounded-full border border-violet-300/35 bg-white/[0.06] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] !text-violet-100">
                        Admin
                      </span>
                      <h2 className="mt-2 text-xl font-bold tracking-tight !text-white sm:text-2xl">
                        Žádosti
                      </h2>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
                      <div className="inline-flex items-center justify-center gap-2 rounded-full border border-violet-200 bg-violet-600 px-3 py-2 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(124,58,237,0.24)]">
                        <Clock3 size={15} strokeWidth={2.2} aria-hidden="true" />
                        {pendingUnifiedCount} čeká
                      </div>
                      <div className="inline-flex items-center justify-center rounded-full border border-white/14 bg-white/[0.07] px-3 py-2 text-sm font-semibold !text-violet-100">
                        {filteredUnifiedRequests.length} vidíš
                      </div>
                    </div>
                  </div>
                  <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                    <label className="relative block">
                      <Search
                        size={16}
                        strokeWidth={2.1}
                        aria-hidden="true"
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                      />
                      <input
                        type="search"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Hledat podle jména, e-mailu nebo textu"
                        className={`${createUserFieldClass} pl-10`}
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-2 sm:min-w-[280px]">
                      <div className="rounded-2xl border border-white/14 bg-white/[0.07] px-3 py-2 text-xs !text-violet-200/78">
                        SLA
                        <span className="ml-2 font-semibold !text-white">hlídané</span>
                      </div>
                      <div className="rounded-2xl border border-white/14 bg-white/[0.07] px-3 py-2 text-xs !text-violet-200/78">
                        Řazení
                        <span className="ml-2 font-semibold !text-white">nejnovější</span>
                      </div>
                    </div>
                  </div>

                  {actionMessage ? (
                    <div className="mb-3 rounded-2xl border border-violet-300/30 bg-violet-400/12 px-4 py-3 text-sm !text-violet-100">
                      {actionMessage}
                    </div>
                  ) : null}
                  {error ? (
                    <div className="mb-3 rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                      {error}
                    </div>
                  ) : null}
                  {userRequestsError ? (
                    <div className="mb-3 rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                      {userRequestsError}
                    </div>
                  ) : null}

                  {loading || userRequestsLoading ? (
                    <div className="rounded-2xl border border-white/14 bg-white/[0.05] px-4 py-8 text-center text-sm !text-violet-100/72">
                      <div className="inline-flex items-center gap-2 rounded-full bg-white/[0.08] px-3 py-1">
                        <RefreshCcw size={14} strokeWidth={2.2} className="animate-spin" />
                        Načítám žádosti...
                      </div>
                    </div>
                  ) : filteredUnifiedRequests.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/18 bg-white/[0.05] px-4 py-9 text-center text-sm !text-violet-100/72">
                      <div className="mx-auto mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.08] !text-violet-100">
                        <Inbox size={18} strokeWidth={2.1} aria-hidden="true" />
                      </div>
                      <p className="font-medium !text-violet-100">
                        {search.trim()
                          ? "Pro zadaný filtr nebyla nalezena žádná žádost."
                          : "V této chvíli tu nejsou žádné žádosti."}
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-[22px] border border-white/12 bg-white/[0.045]">
                      <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-white/[0.04] px-3 py-2.5">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] !text-violet-100">
                          Fronta žádostí
                        </p>
                        <span className="text-xs font-medium !text-violet-100/60">
                          {filteredUnifiedRequests.length} položky v seznamu
                        </span>
                      </div>
                      <div className="space-y-2 p-2">
                          {filteredUnifiedRequests.map((item) => {
                        if (item.kind === "endCollaboration") {
                          const request = item.request;
                          const pending = request.status === "pending";
                          const busy = busyRequestId === request.id;
                          const waitInfo = buildEndCollaborationWaitInfo(
                            request,
                            requestsNowMs
                          );
                          const toneBarClass =
                            request.status === "approved"
                              ? "bg-violet-500"
                            : request.status === "rejected"
                                ? "bg-violet-200"
                                : request.status === "failed"
                                  ? "bg-rose-400"
                                  : request.status === "processing"
                                    ? "bg-sky-400"
                                    : "bg-violet-500";
                          return (
                            <article
                              key={item.id}
                              className="relative w-full overflow-hidden rounded-2xl border border-white/12 bg-white/[0.07] shadow-[0_16px_34px_rgba(7,6,25,0.22)] transition hover:border-violet-300/30 hover:bg-white/[0.09]"
                            >
                              <div className={`pointer-events-none absolute inset-y-0 left-0 w-1.5 ${toneBarClass}`} />
                              <div className="px-4 py-4">
                                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                                  <div className="min-w-0 space-y-1 pl-1">
                                    <div className="inline-flex max-w-full items-center gap-2 text-base font-semibold !text-white">
                                      <UserCheck2 size={16} strokeWidth={2.2} aria-hidden="true" />
                                      <span className="truncate !text-white">{request.targetName}</span>
                                    </div>
                                    <div className="truncate text-sm !text-violet-100/58">{request.targetEmail}</div>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="inline-flex items-center rounded-full border border-violet-300/30 bg-violet-400/12 px-2.5 py-1 text-[11px] font-semibold !text-violet-100">
                                      Ukončení spolupráce
                                    </span>
                                    <span
                                      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusPillClass[request.status]}`}
                                    >
                                      {statusLabel[request.status]}
                                    </span>
                                  </div>
                                </div>

                                <div className="grid gap-x-5 gap-y-2 border-t border-white/10 pt-3 text-sm !text-violet-100/72 sm:grid-cols-2 xl:grid-cols-3 [&_.font-medium]:!text-white [&_span]:break-words">
                                  <div>
                                    <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-300">
                                      Žádá
                                    </span>
                                    <span className="font-medium text-slate-900">{request.requestedByEmail}</span>
                                  </div>
                                  <div>
                                    <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-300">
                                      Převod na
                                    </span>
                                    <span className="font-medium text-slate-900">
                                      {request.successorEmail || "—"}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-300">
                                      Rozsah
                                    </span>
                                    <span className="font-medium text-slate-900">
                                      {request.transferableContracts} smluv / {request.directSubordinates} podř.
                                    </span>
                                  </div>
                                  <div>
                                    <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-300">
                                      Vytvořeno
                                    </span>
                                    <span className="font-medium text-slate-900">
                                      {formatDateTime(request.createdAtMs)}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-300">
                                      Rozhodnuto
                                    </span>
                                    <span className="font-medium text-slate-900">
                                      {formatDateTime(request.decidedAtMs)}
                                    </span>
                                  </div>
                                  {waitInfo.waiting ? (
                                    <div>
                                      <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-300">
                                        Čeká
                                      </span>
                                      <span className="font-medium text-slate-900">
                                        {waitInfo.elapsedLabel}
                                      </span>
                                    </div>
                                  ) : null}
                                </div>

                                {request.failureReason ? (
                                  <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                                    Chyba: {request.failureReason}
                                  </div>
                                ) : null}
                                {request.decisionReason ? (
                                  <div className="mt-3 rounded-xl border border-violet-100 bg-violet-50 px-3 py-2 text-xs text-slate-700">
                                    Důvod zamítnutí: {request.decisionReason}
                                  </div>
                                ) : null}

                                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-violet-50 pt-3">
                                  <button
                                    type="button"
                                    onClick={() => void handleDecision(request.id, "approve")}
                                    disabled={!pending || busy}
                                    className="inline-flex items-center gap-1.5 rounded-full border border-violet-700 bg-violet-600 px-3 py-2 text-xs font-semibold text-white shadow-[0_10px_20px_rgba(124,58,237,0.22)] transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    <Check size={14} strokeWidth={2.3} aria-hidden="true" />
                                    Schválit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleDecision(request.id, "reject")}
                                    disabled={!pending || busy}
                                    className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-violet-800 transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    <X size={14} strokeWidth={2.3} aria-hidden="true" />
                                    Odmítnout
                                  </button>
                                </div>
                              </div>
                            </article>
                          );
                        }

                        const request = item.request;
                        const pending = request.status === "pending";
                        const busy = busyUserRequestId === request.id;
                        const feedbackDraft = userRequestFeedbackDrafts[request.id] ?? "";
                        const passwordDraft = userRequestPasswordDrafts[request.id] ?? "";
                        const isUserCreation = request.subject === "userCreation";
                        const slaInfo = buildAdminUserRequestSlaInfo(
                          request,
                          requestsNowMs
                        );
                        const userToneBarClass = slaInfo.isOverdueUrgent
                          ? "bg-rose-400"
                          : request.status === "accepted"
                            ? "bg-violet-500"
                            : request.status === "rejected"
                              ? "bg-violet-200"
                              : request.status === "needsInfo"
                                ? "bg-sky-400"
                                : "bg-violet-500";

                        return (
                          <article
                            key={item.id}
                            className={`relative w-full overflow-hidden rounded-2xl border bg-white/[0.07] shadow-[0_16px_34px_rgba(7,6,25,0.22)] transition hover:bg-white/[0.09] ${
                              slaInfo.isOverdueUrgent
                                ? "border-rose-300"
                                : "border-white/12 hover:border-violet-300/30"
                            }`}
                          >
                            <div
                              className={`pointer-events-none absolute inset-y-0 left-0 w-1.5 ${userToneBarClass}`}
                            />
                            <div className="px-4 py-4">
                            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0 space-y-1 pl-1">
                                <div className="truncate text-base font-semibold !text-white">
                                  {userRequestSubjectLabel[request.subject]}
                                </div>
                                <div className="truncate text-sm !text-violet-100/58">{request.requesterEmail}</div>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center rounded-full border border-violet-300/30 bg-violet-400/12 px-2.5 py-1 text-[11px] font-semibold !text-violet-100">
                                  Uživatelská žádost
                                </span>
                                <span
                                  className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${userRequestStatusPillClass[request.status]}`}
                                >
                                  {userRequestStatusLabel[request.status]}
                                </span>
                              </div>
                            </div>

                            <div className="grid gap-x-5 gap-y-2 border-t border-white/10 pt-3 text-sm !text-violet-100/72 sm:grid-cols-2 xl:grid-cols-3 [&_.font-medium]:!text-white [&_span]:break-words">
                              <div>
                                <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-300">
                                  Priorita
                                </span>
                                <span className="font-medium text-slate-900">
                                  {userRequestPriorityLabel[request.priority]}
                                </span>
                              </div>
                              {slaInfo.waiting ? (
                                <div>
                                  <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-300">
                                    Čeká / SLA
                                  </span>
                                  <span
                                    className={`font-medium ${
                                      slaInfo.isOverdueUrgent
                                        ? "text-rose-700"
                                        : "text-slate-900"
                                    }`}
                                  >
                                    {slaInfo.elapsedLabel} / {slaInfo.slaLimitLabel}
                                  </span>
                                </div>
                              ) : null}
                              <div>
                                <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-300">
                                  Firemní e-mail
                                </span>
                                <span className="font-medium text-slate-900">
                                  {request.requestedCorporateEmail || "—"}
                                </span>
                              </div>
                              {request.requestedUserDraft?.fullName ? (
                                <div>
                                  <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-300">
                                    Jméno
                                  </span>
                                  <span className="font-medium text-slate-900">
                                    {request.requestedUserDraft.fullName}
                                  </span>
                                </div>
                              ) : null}
                              {request.requestedUserDraft?.agencyNumber ? (
                                <div>
                                  <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-300">
                                    Agenturní číslo
                                  </span>
                                  <span className="font-medium text-slate-900">
                                    {request.requestedUserDraft.agencyNumber}
                                  </span>
                                </div>
                              ) : null}
                              {request.subject === "userCreation" ? (
                                request.requestedUserDraft?.position ? (
                                  <div>
                                    <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-300">
                                      Pozice
                                    </span>
                                    <span className="font-medium text-slate-900">
                                      {POSITIONS.find(
                                        (p) => p.id === request.requestedUserDraft?.position
                                      )?.label ?? request.requestedUserDraft.position}
                                    </span>
                                  </div>
                                ) : (
                                  <div>
                                    <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-300">
                                      Kariéra
                                    </span>
                                    <span className="font-medium text-slate-900">
                                      doplní uživatel ve stepperu
                                    </span>
                                  </div>
                                )
                              ) : null}
                              <div>
                                <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-300">
                                  Režim
                                </span>
                                <span className="font-medium text-slate-900">
                                  {request.requestedUserDraft
                                    ? (COMMISSION_MODES.find(
                                        (m) => m.id === request.requestedUserDraft?.commissionMode
                                      )?.label ?? request.requestedUserDraft.commissionMode)
                                    : "—"}
                                </span>
                              </div>
                              {request.requestedUserDraft?.managerEmail ? (
                                <div>
                                  <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-300">
                                    Nadřízený
                                  </span>
                                  <span className="font-medium text-slate-900">
                                    {request.requestedUserDraft.managerEmail}
                                  </span>
                                </div>
                              ) : null}
                              <div>
                                <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-300">
                                  Vytvořeno
                                </span>
                                <span className="font-medium text-slate-900">
                                  {formatDateTime(request.createdAtMs)}
                                </span>
                              </div>
                              <div>
                                <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-300">
                                  Rozhodnuto
                                </span>
                                <span className="font-medium text-slate-900">
                                  {formatDateTime(request.decidedAtMs)}
                                </span>
                              </div>
                              {request.createdUserEmail ? (
                                <div>
                                  <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-300">
                                    Vytvořený účet
                                  </span>
                                  <span className="font-medium text-slate-900">
                                    {request.createdUserEmail}
                                  </span>
                                </div>
                              ) : null}
                            </div>

                            <div className="mt-3 rounded-xl border border-white/12 bg-white/[0.055] px-3 py-2 text-sm !text-violet-100/82">
                              {request.message}
                            </div>

                            {pending ? (
                              <div className="mt-3 space-y-3 border-t border-white/10 pt-3">
                                {isUserCreation ? (
                                  <div className="space-y-1.5 rounded-xl border border-white/12 bg-white/[0.055] px-3 py-3">
                                    <label className="text-xs font-semibold uppercase tracking-wide text-violet-700">
                                      Dočasné heslo (povinné pro akceptaci)
                                    </label>
                                    <div className="flex gap-2">
                                      <input
                                        type="text"
                                        autoComplete="new-password"
                                        value={passwordDraft}
                                        onChange={(event) =>
                                          setUserRequestPasswordDrafts((prev) => ({
                                            ...prev,
                                            [request.id]: event.target.value,
                                          }))
                                        }
                                        placeholder="Min. 8 znaků"
                                        className={createUserFieldClass}
                                      />
                                      <button
                                        type="button"
                                        onClick={() => handleGenerateRequestPassword(request.id)}
                                        className="inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl border border-white/16 bg-white/[0.07] !text-violet-100 transition hover:bg-white/[0.12]"
                                        title="Vygenerovat heslo"
                                        aria-label="Vygenerovat heslo"
                                      >
                                        <RefreshCw size={14} strokeWidth={2.2} aria-hidden="true" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => void handleCopyRequestPassword(request.id)}
                                        disabled={!passwordDraft.trim()}
                                        className="inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl border border-white/16 bg-white/[0.07] !text-violet-100 transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-50"
                                        title="Zkopírovat heslo"
                                        aria-label="Zkopírovat heslo"
                                      >
                                        <Copy size={14} strokeWidth={2.2} aria-hidden="true" />
                                      </button>
                                    </div>
                                  </div>
                                ) : null}
                                <textarea
                                  value={feedbackDraft}
                                  onChange={(event) =>
                                    setUserRequestFeedbackDrafts((prev) => ({
                                      ...prev,
                                      [request.id]: event.target.value,
                                    }))
                                  }
                                  rows={3}
                                  maxLength={1200}
                                  placeholder="Volitelná zpětná vazba pro uživatele"
                                  className={createUserFieldClass}
                                />
                                <div className="flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => void handleUserRequestDecision(request, "accepted")}
                                    disabled={busy}
                                    className="inline-flex items-center gap-1.5 rounded-full border border-violet-700 bg-violet-600 px-3 py-2 text-xs font-semibold text-white shadow-[0_10px_20px_rgba(124,58,237,0.22)] transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    <Check size={14} strokeWidth={2.3} aria-hidden="true" />
                                    Akceptovat
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleUserRequestDecision(request, "rejected")}
                                    disabled={busy}
                                    className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-violet-800 transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    <X size={14} strokeWidth={2.3} aria-hidden="true" />
                                    Odmítnout
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleUserRequestDecision(request, "needsInfo")
                                    }
                                    disabled={busy}
                                    className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-violet-800 transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    <RefreshCw size={14} strokeWidth={2.3} aria-hidden="true" />
                                    Vrátit k doplnění
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="mt-3 rounded-xl border border-white/12 bg-white/[0.055] px-3 py-2 text-xs !text-violet-100/78">
                                {request.status === "needsInfo"
                                  ? "Požadované doplnění: "
                                  : "Zpětná vazba: "}
                                {request.feedback?.trim() || "Bez zpětné vazby."}
                              </div>
                            )}
                            </div>
                          </article>
                        );
                          })}
                      </div>
                    </div>
                  )}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </section>

        {canCreateUsers && activeAdminSection === "createUser" ? (
          <section className={adminDarkSectionClass}>
            <div className={adminDarkTopBarClass} />
            <div className="relative mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <span className={adminDarkBadgeClass}>
                  <ShieldCheck size={13} strokeWidth={2.2} aria-hidden="true" />
                  Správa účtů
                </span>
                <h2 className="inline-flex items-center gap-2 text-xl font-bold tracking-[-0.02em] !text-white sm:text-2xl">
                  <UserPlus size={20} strokeWidth={2.2} className="!text-violet-100" aria-hidden="true" />
                  <span>Přidat uživatele</span>
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed !text-violet-100/70">
                  Účet vznikne bez výchozí pozice. Kariérní historii si poradce doplní
                  v úvodním stepperu při prvním přihlášení.
                </p>
              </div>
              <div className="inline-flex shrink-0 items-center gap-2 rounded-2xl border border-violet-300/25 bg-violet-400/12 px-3 py-2 text-xs font-semibold !text-violet-100">
                <BriefcaseBusiness size={15} strokeWidth={2.2} aria-hidden="true" />
                Kariéra ve stepperu
              </div>
            </div>

            <form
              className={`${adminDarkPanelClass} grid gap-4 md:grid-cols-2 xl:grid-cols-3`}
              onSubmit={(event) => {
                event.preventDefault();
                void handleCreateUser();
              }}
            >
              <div className="space-y-1.5">
                <label className={`inline-flex items-center gap-1.5 ${createUserLabelClass}`}>
                  <Mail size={12} strokeWidth={2.2} aria-hidden="true" />
                  E-mail
                </label>
                <input
                  type="email"
                  autoComplete="off"
                  className={createUserFieldClass}
                  value={newUserEmail}
                  onChange={(event) => setNewUserEmail(event.target.value)}
                  placeholder="jmeno.prijmeni@bohemika.eu"
                />
              </div>

              <div className="space-y-1.5">
                <label className={createUserLabelClass}>
                  Jméno a příjmení / Název
                </label>
                <input
                  type="text"
                  autoComplete="off"
                  className={createUserFieldClass}
                  value={newUserFullName}
                  onChange={(event) => setNewUserFullName(event.target.value)}
                  placeholder="Jméno Příjmení nebo název firmy"
                />
              </div>

              <div className="space-y-1.5">
                <label className={createUserLabelClass}>
                  Agenturní číslo
                </label>
                <input
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  className={createUserFieldClass}
                  value={newUserAgencyNumber}
                  onChange={(event) => setNewUserAgencyNumber(event.target.value)}
                  placeholder="Volitelné agenturní číslo"
                  maxLength={NEW_USER_AGENCY_NUMBER_MAX_LEN}
                />
              </div>

              <div className="space-y-1.5 md:col-span-2 xl:col-span-3">
                <label className={createUserLabelClass}>
                  Typ účtu
                </label>
                <div
                  className="grid gap-2 sm:grid-cols-2"
                  role="radiogroup"
                  aria-label="Typ nového účtu"
                >
                  {ACCOUNT_TYPES.map((type) => {
                    const active = newUserAccountType === type.id;
                    return (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => {
                          setNewUserAccountType(type.id);
                          setCreateUserStatus(null);
                        }}
                        className={`rounded-2xl border px-4 py-3 text-left transition ${
                          active
                            ? "border-violet-200/60 bg-violet-400/22 !text-white shadow-[0_16px_34px_rgba(124,58,237,0.26)]"
                            : "border-white/14 bg-white/[0.04] !text-violet-100 hover:border-violet-300/42 hover:bg-white/[0.08]"
                        }`}
                        role="radio"
                        aria-checked={active}
                      >
                        <span className={`flex items-center gap-2 text-sm font-semibold ${active ? "!text-white" : "!text-violet-100"}`}>
                          <span
                            className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border ${
                              active
                                ? "border-violet-100/45 bg-white/14 !text-white"
                                : "border-white/14 bg-white/[0.05] !text-violet-100"
                            }`}
                          >
                            {type.id === "advisor" ? (
                              <UserCheck2 size={14} strokeWidth={2.2} aria-hidden="true" />
                            ) : (
                              <UserPlus size={14} strokeWidth={2.2} aria-hidden="true" />
                            )}
                          </span>
                          {type.label}
                        </span>
                        <span
                          className={`mt-1 block text-xs leading-relaxed ${
                            active ? "!text-violet-50/76" : "!text-violet-100/58"
                          }`}
                        >
                          {type.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className={`inline-flex items-center gap-1.5 ${createUserLabelClass}`}>
                  <KeyRound size={12} strokeWidth={2.2} aria-hidden="true" />
                  Dočasné heslo
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    autoComplete="new-password"
                    className={createUserFieldClass}
                    value={newUserPassword}
                    onChange={(event) => setNewUserPassword(event.target.value)}
                    placeholder="Min. 8 znaků"
                  />
                  <button
                    type="button"
                    onClick={handleGenerateNewUserPassword}
                    className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl border border-white/16 bg-white/[0.07] text-violet-100 transition hover:bg-white/[0.12]"
                    title="Vygenerovat heslo"
                    aria-label="Vygenerovat heslo"
                  >
                    <RefreshCw size={15} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCopyNewUserPassword()}
                    disabled={!newUserPassword}
                    className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl border border-white/16 bg-white/[0.07] text-violet-100 transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-50"
                    title="Zkopírovat heslo"
                    aria-label="Zkopírovat heslo"
                  >
                    <Copy size={15} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className={createUserLabelClass}>
                  {newUserAccountType === "tipster" ? "Příjemce tipů" : "Nadřízený"}
                </label>
                <input
                  type="email"
                  autoComplete="off"
                  className={createUserFieldClass}
                  value={newUserManagerEmail}
                  onChange={(event) => setNewUserManagerEmail(event.target.value)}
                  placeholder={
                    newUserAccountType === "tipster"
                      ? "E-mail uživatele, který dostane tipy"
                      : "Bez nadřízeného nech prázdné"
                  }
                />
              </div>

              {newUserAccountType === "advisor" ? (
                <>
                  <div className="space-y-1.5 md:col-span-2">
                    <label className={createUserLabelClass}>
                      Režim provizí
                    </label>
                    <div
                      className="inline-flex w-full rounded-2xl border border-white/14 bg-slate-950/28 p-1"
                      role="radiogroup"
                      aria-label="Režim provizí nového uživatele"
                    >
                      {COMMISSION_MODES.map((m) => {
                        const active = newUserMode === m.id;
                        const isAccelerated = m.id === "accelerated";
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setNewUserMode(m.id)}
                            className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                              active
                                ? "bg-[linear-gradient(120deg,#7c3aed_0%,#a855f7_58%,#c084fc_100%)] !text-white shadow-[0_10px_22px_rgba(124,58,237,0.28)]"
                                : "border border-transparent !text-violet-100/66 hover:!text-white"
                            }`}
                            role="radio"
                            aria-checked={active}
                          >
                            {isAccelerated ? (
                              <Zap size={14} strokeWidth={2.2} className={active ? "!text-white" : "text-amber-600"} aria-hidden="true" />
                            ) : (
                              <Snail size={14} strokeWidth={2.2} className={active ? "!text-white" : "text-violet-100/58"} aria-hidden="true" />
                            )}
                            {m.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-start gap-3 rounded-2xl border border-violet-300/25 bg-violet-400/10 px-4 py-3 text-sm leading-relaxed !text-violet-50/88">
                    <BriefcaseBusiness className="mt-0.5 h-5 w-5 shrink-0 !text-violet-100" strokeWidth={2.2} aria-hidden="true" />
                    <div>
                      <p className="font-semibold !text-white">Kariéra se nezadává při založení</p>
                      <p className="mt-0.5 !text-violet-50/72">
                        Poradce po prvním přihlášení vyplní historii pozic v onboardingovém
                        stepperu.
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border border-amber-200/35 bg-amber-300/12 px-4 py-3 text-sm !text-amber-50/90 md:col-span-2 xl:col-span-1">
                  Tipař po přihlášení uvidí pouze domovskou stránku s tlačítkem pro přidání tipu.
                </div>
              )}

              <div className="flex flex-col gap-2 pt-1 md:col-span-2 sm:flex-row sm:items-center sm:justify-between xl:col-span-3">
                {createUserStatus ? (
                  <p
                    className={`text-xs font-medium ${
                      createUserStatus.type === "success"
                        ? "!text-violet-100"
                        : createUserStatus.type === "info"
                          ? "!text-violet-100"
                          : "!text-rose-100"
                    }`}
                  >
                    {createUserStatus.message}
                  </p>
                ) : (
                  <span className="text-xs !text-violet-100/58">
                    Nový účet se po vytvoření může rovnou přihlásit do aplikace.
                  </span>
                )}
                <button
                  type="submit"
                  disabled={createUserBusy}
                  className={adminDarkPrimaryButtonClass}
                >
                  <UserPlus size={15} strokeWidth={2.2} aria-hidden="true" />
                  {createUserBusy ? "Vytvářím..." : "Vytvořit uživatele"}
                </button>
              </div>
            </form>
          </section>
        ) : null}

        {isAllowedAdmin && activeAdminSection === "broadcasts" ? (
          <section className={adminDarkSectionClass}>
            <div className={adminDarkTopBarClass} />

            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <span className={adminDarkBadgeClass}>
                  Hromadné upozornění
                </span>
                <h2 className="inline-flex items-center gap-1.5 text-xl font-bold tracking-[-0.02em] !text-white sm:text-2xl">
                  <Megaphone size={20} strokeWidth={2.1} className="!text-violet-100" aria-hidden="true" />
                  <span>Notifikace</span>
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed !text-violet-100/70">
                  Push zpráva se odešle na aktivní zařízení a kliknutí otevře vybranou stránku.
                </p>
              </div>
              <div className="inline-flex shrink-0 items-center gap-2 rounded-2xl border border-violet-300/25 bg-violet-400/12 px-3 py-2 text-xs font-semibold !text-violet-100">
                <BellRing size={15} strokeWidth={2.2} aria-hidden="true" />
                Web push
              </div>
            </div>

            <div className="mb-4 grid gap-2 md:grid-cols-3">
              {[
                {
                  label: "Příjemce",
                  value: broadcastRecipientLabel,
                  icon: UserRound,
                },
                {
                  label: "Odeslání",
                  value: broadcastDeliveryLabel,
                  icon: Clock3,
                },
                {
                  label: "Cíl",
                  value: broadcastTargetLabel,
                  icon: Link2,
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.label}
                    className="min-w-0 rounded-2xl border border-white/12 bg-white/[0.055] px-3 py-2.5 shadow-[0_12px_28px_rgba(7,6,25,0.16)]"
                  >
                    <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] !text-violet-200/62">
                      <Icon size={12} strokeWidth={2.2} aria-hidden="true" />
                      {item.label}
                    </div>
                    <div className="truncate text-sm font-semibold !text-white">
                      {item.value}
                    </div>
                  </div>
                );
              })}
            </div>

            <form
              className={`${adminDarkPanelClass} grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start`}
              onSubmit={(event) => {
                event.preventDefault();
                void handleSendAdminBroadcast();
              }}
            >
              <div className="space-y-3">
                <div className="rounded-[22px] border border-white/12 bg-white/[0.055] p-4 shadow-[0_14px_34px_rgba(7,6,25,0.2)]">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="inline-flex items-center gap-2">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-xl bg-violet-400/18 text-xs font-bold !text-violet-100 ring-1 ring-violet-200/20">
                        1
                      </span>
                      <span className={createUserLabelClass}>Obsah zprávy</span>
                    </div>
                    <span className="text-[11px] font-semibold !text-violet-100/56">
                      {broadcastTitle.length}/80 · {broadcastMessage.length}/220
                    </span>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[150px_minmax(0,1fr)]">
                    <div className="space-y-2">
                      <label className={createUserLabelClass}>Emoji</label>
                      <input
                        type="text"
                        value={broadcastEmoji}
                        onChange={(event) => {
                          setBroadcastEmoji(event.target.value.slice(0, 12));
                          setBroadcastStatus(null);
                        }}
                        className={`${createUserFieldClass} h-12 text-center text-2xl`}
                        maxLength={12}
                        aria-label="Emoji notifikace"
                      />
                      <div className="grid grid-cols-4 gap-1.5">
                        {ADMIN_BROADCAST_EMOJI_OPTIONS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => {
                              setBroadcastEmoji(emoji);
                              setBroadcastStatus(null);
                            }}
                            className={`inline-flex h-9 items-center justify-center rounded-xl border text-lg transition ${
                              broadcastEmoji === emoji
                                ? "border-violet-200 bg-violet-400/24 shadow-[0_8px_18px_rgba(124,58,237,0.18)]"
                                : "border-white/12 bg-white/[0.055] hover:bg-white/[0.1]"
                            }`}
                            aria-label={`Vybrat emoji ${emoji}`}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid gap-3">
                      <label className="space-y-2">
                        <span className={createUserLabelClass}>Nadpis notifikace</span>
                        <input
                          type="text"
                          value={broadcastTitle}
                          onChange={(event) => {
                            setBroadcastTitle(event.target.value.slice(0, 80));
                            setBroadcastStatus(null);
                          }}
                          maxLength={80}
                          className={createUserFieldClass}
                          placeholder="Nová pomůcka"
                        />
                      </label>

                      <label className="space-y-2">
                        <span className={createUserLabelClass}>Text notifikace</span>
                        <textarea
                          value={broadcastMessage}
                          onChange={(event) => {
                            setBroadcastMessage(event.target.value.slice(0, 220));
                            setBroadcastStatus(null);
                          }}
                          rows={4}
                          maxLength={220}
                          className={`${createUserFieldClass} min-h-[112px] resize-none leading-relaxed`}
                          placeholder="Krátká zpráva pro uživatele"
                        />
                      </label>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 2xl:grid-cols-3">
                  <div className="rounded-[22px] border border-white/12 bg-white/[0.055] p-3.5 shadow-[0_14px_34px_rgba(7,6,25,0.18)]">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div className="inline-flex items-center gap-2">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-xl bg-violet-400/18 text-xs font-bold !text-violet-100 ring-1 ring-violet-200/20">
                          2
                        </span>
                        <span className={createUserLabelClass}>Příjemci</span>
                      </div>
                      {broadcastRecipientMode === "single" ? (
                        <span className="text-[11px] font-semibold !text-violet-100/58">
                          {adminUsersLoading ? "Načítám..." : `${broadcastRecipientOptions.length} účtů`}
                        </span>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-3 rounded-2xl border border-white/12 bg-white/[0.06] p-1">
                      {[
                        { id: "all" as const, label: "Všem" },
                        { id: "group" as const, label: "Skupina" },
                        { id: "single" as const, label: "Osoba" },
                      ].map((mode) => (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() => {
                            setBroadcastRecipientMode(mode.id);
                            setBroadcastConfirmed(false);
                            setBroadcastStatus(null);
                          }}
                          className={`min-h-10 rounded-xl px-2 text-[13px] font-semibold transition ${
                            broadcastRecipientMode === mode.id
                              ? "bg-[linear-gradient(135deg,#6d28d9_0%,#8b5cf6_100%)] !text-white shadow-[0_8px_18px_rgba(109,40,217,0.26)]"
                              : "!text-violet-100/72 hover:bg-white/[0.08] hover:!text-white"
                          }`}
                        >
                          {mode.label}
                        </button>
                      ))}
                    </div>

                    <div className="mt-3">
                      {broadcastRecipientMode === "group" ? (
                        <select
                          value={broadcastRecipientGroup}
                          onChange={(event) => {
                            setBroadcastRecipientGroup(
                              event.target.value as AdminBroadcastRecipientGroup
                            );
                            setBroadcastConfirmed(false);
                            setBroadcastStatus(null);
                          }}
                          className={createUserFieldClass}
                        >
                          {ADMIN_BROADCAST_GROUPS.map((group) => (
                            <option key={group.id} value={group.id}>
                              {group.label} ({broadcastGroupCounts[group.id]})
                            </option>
                          ))}
                        </select>
                      ) : broadcastRecipientMode === "single" ? (
                        <select
                          value={broadcastRecipientEmail}
                          onChange={(event) => {
                            setBroadcastRecipientEmail(event.target.value);
                            setBroadcastConfirmed(false);
                            setBroadcastStatus(null);
                          }}
                          disabled={adminUsersLoading || broadcastRecipientOptions.length === 0}
                          className={`${createUserFieldClass} disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                          {broadcastRecipientOptions.length === 0 ? (
                            <option value="">
                              {adminUsersLoading ? "Načítám uživatele..." : "Žádný uživatel"}
                            </option>
                          ) : (
                            broadcastRecipientOptions.map((row) => (
                              <option key={row.email} value={row.email}>
                                {row.label} ({row.email}){row.disabled ? " - deaktivovaný" : ""}
                              </option>
                            ))
                          )}
                        </select>
                      ) : (
                        <div className="min-h-[46px] rounded-2xl border border-white/12 bg-white/[0.055] px-3 py-2 text-sm font-semibold leading-relaxed !text-violet-100/72">
                          Všichni uživatelé s aktivním push tokenem.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-[22px] border border-white/12 bg-white/[0.055] p-3.5 shadow-[0_14px_34px_rgba(7,6,25,0.18)]">
                    <div className="mb-3 inline-flex items-center gap-2">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-xl bg-violet-400/18 text-xs font-bold !text-violet-100 ring-1 ring-violet-200/20">
                        3
                      </span>
                      <span className={createUserLabelClass}>Po kliknutí</span>
                    </div>

                    <div className="grid gap-3">
                      <select
                        value={broadcastTargetPath}
                        onChange={(event) => {
                          setBroadcastTargetPath(event.target.value);
                          setBroadcastStatus(null);
                        }}
                        className={createUserFieldClass}
                        aria-label="Cílová stránka po kliknutí"
                      >
                        {ADMIN_BROADCAST_TARGETS.map((target) => (
                          <option key={target.path} value={target.path}>
                            {target.label}
                          </option>
                        ))}
                        <option value="__custom__">Vlastní cesta</option>
                      </select>

                      {broadcastTargetPath === "/pomucky" ? (
                        <select
                          value={broadcastToolTargetPath}
                          onChange={(event) => {
                            setBroadcastToolTargetPath(event.target.value);
                            setBroadcastStatus(null);
                          }}
                          className={createUserFieldClass}
                          aria-label="Konkrétní pomůcka"
                        >
                          {ADMIN_BROADCAST_TOOL_TARGETS.map((target) => (
                            <option key={target.path} value={target.path}>
                              {target.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={broadcastCustomTargetPath}
                          onChange={(event) => {
                            setBroadcastCustomTargetPath(event.target.value);
                            setBroadcastStatus(null);
                          }}
                          disabled={broadcastTargetPath !== "__custom__"}
                          className={`${createUserFieldClass} disabled:cursor-not-allowed disabled:opacity-50`}
                          placeholder="/pomucky/zlato"
                          aria-label="Vlastní cesta"
                        />
                      )}
                    </div>
                  </div>

                  <div className="rounded-[22px] border border-white/12 bg-white/[0.055] p-3.5 shadow-[0_14px_34px_rgba(7,6,25,0.18)]">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div className="inline-flex items-center gap-2">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-xl bg-violet-400/18 text-xs font-bold !text-violet-100 ring-1 ring-violet-200/20">
                          4
                        </span>
                        <span className={createUserLabelClass}>Odeslání</span>
                      </div>
                      <span className="text-[11px] font-semibold !text-violet-100/58">
                        {broadcastDeliveryMode === "scheduled" ? "Fronta" : "Ihned"}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 rounded-2xl border border-white/12 bg-white/[0.06] p-1">
                      {[
                        { id: "now" as const, label: "Hned" },
                        { id: "scheduled" as const, label: "Naplánovat" },
                      ].map((mode) => (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() => {
                            setBroadcastDeliveryMode(mode.id);
                            if (mode.id === "scheduled" && !broadcastScheduledAt) {
                              setBroadcastScheduledAt(
                                toDatetimeLocalInputValue(new Date(Date.now() + 10 * 60 * 1000))
                              );
                            }
                            setBroadcastConfirmed(false);
                            setBroadcastStatus(null);
                          }}
                          className={`min-h-10 rounded-xl px-2 text-sm font-semibold transition ${
                            broadcastDeliveryMode === mode.id
                              ? "bg-[linear-gradient(135deg,#6d28d9_0%,#8b5cf6_100%)] !text-white shadow-[0_8px_18px_rgba(109,40,217,0.26)]"
                              : "!text-violet-100/72 hover:bg-white/[0.08] hover:!text-white"
                          }`}
                        >
                          {mode.label}
                        </button>
                      ))}
                    </div>

                    <input
                      type="datetime-local"
                      value={broadcastScheduledAt}
                      min={broadcastScheduleMinValue}
                      onChange={(event) => {
                        setBroadcastScheduledAt(event.target.value);
                        setBroadcastConfirmed(false);
                        setBroadcastStatus(null);
                      }}
                      disabled={broadcastDeliveryMode !== "scheduled"}
                      className={`${createUserFieldClass} mt-3 disabled:cursor-not-allowed disabled:opacity-50`}
                    />
                  </div>
                </div>

                <label className="flex cursor-pointer items-start gap-3 rounded-[22px] border border-amber-300/30 bg-amber-300/10 px-3.5 py-3 shadow-[0_12px_28px_rgba(7,6,25,0.16)]">
                  <input
                    type="checkbox"
                    checked={broadcastConfirmed}
                    onChange={(event) => {
                      setBroadcastConfirmed(event.target.checked);
                      setBroadcastStatus(null);
                    }}
                    className="mt-1 h-4 w-4 rounded border-amber-200 text-amber-500 accent-amber-500"
                  />
                  <span>
                    <span className="block text-sm font-semibold !text-amber-50">
                      {broadcastDeliveryMode === "scheduled"
                        ? `Potvrzuji naplánování notifikace pro ${broadcastRecipientLabel}.`
                        : broadcastRecipientMode === "single"
                          ? "Potvrzuji odeslání pouze vybranému uživateli."
                          : broadcastRecipientMode === "group"
                            ? "Potvrzuji odeslání vybrané skupině."
                            : "Potvrzuji odeslání všem uživatelům s aktivním push tokenem."}
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed !text-amber-100/74">
                      Respektuje se vypnutý push kanál v nastavení uživatele.
                    </span>
                  </span>
                </label>

                {broadcastStatus ? (
                  <div
                    className={`rounded-2xl border px-3 py-2 text-sm font-semibold ${
                      broadcastStatus.type === "success"
                        ? "border-violet-300/30 bg-violet-400/12 !text-violet-100"
                        : broadcastStatus.type === "info"
                          ? "border-sky-300/30 bg-sky-400/12 !text-sky-100"
                          : "border-rose-200 bg-rose-50 text-rose-700"
                    }`}
                  >
                    {broadcastStatus.message}
                  </div>
                ) : null}

                <div className="flex flex-col gap-3 rounded-[22px] border border-white/10 bg-slate-950/20 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] !text-violet-200/58">
                      Připravený cíl
                    </span>
                    <span className="mt-0.5 block truncate text-sm font-semibold !text-violet-50">
                      {broadcastEffectiveTargetPath}
                    </span>
                  </div>
                  <button
                    type="submit"
                    disabled={!broadcastCanSubmit}
                    className={adminDarkPrimaryButtonClass}
                  >
                    {broadcastSending ? (
                      <Loader2 size={15} strokeWidth={2.2} className="animate-spin" aria-hidden="true" />
                    ) : (
                      <Send size={15} strokeWidth={2.2} aria-hidden="true" />
                    )}
                    {broadcastSending
                      ? "Odesílám..."
                      : broadcastDeliveryMode === "scheduled"
                        ? "Naplánovat"
                        : broadcastRecipientMode === "single"
                          ? "Odeslat osobě"
                          : broadcastRecipientMode === "group"
                            ? "Odeslat skupině"
                            : "Odeslat všem"}
                  </button>
                </div>
              </div>

              <aside className="self-start rounded-[24px] border border-white/14 bg-white/[0.07] p-4 shadow-[0_16px_38px_rgba(7,6,25,0.22)] xl:sticky xl:top-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] !text-violet-200/78">
                    Náhled
                  </span>
                  <span className="rounded-full border border-white/12 bg-white/[0.06] px-2 py-1 text-[10px] font-semibold !text-violet-100/70">
                    Web push
                  </span>
                </div>
                <div className="rounded-[22px] border border-white/16 bg-slate-950/55 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                  <div className="flex items-start gap-3">
                    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-2xl text-slate-950">
                      {broadcastEmoji || "📣"}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-bold !text-white">
                        {broadcastEmoji ? `${broadcastEmoji} ` : ""}
                        {broadcastTitleTrimmed || "Nadpis notifikace"}
                      </div>
                      <p className="mt-1 break-words text-sm leading-relaxed !text-violet-100/78">
                        {broadcastMessageTrimmed || "Text notifikace se zobrazí tady."}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid gap-2 text-xs">
                  <div className="rounded-2xl border border-white/12 bg-white/[0.055] px-3 py-2">
                    <span className="block font-semibold uppercase tracking-[0.14em] !text-violet-200/60">
                      Příjemce
                    </span>
                    <span className="mt-0.5 block break-words font-semibold !text-white">
                      {broadcastRecipientLabel}
                    </span>
                  </div>
                  <div className="rounded-2xl border border-white/12 bg-white/[0.055] px-3 py-2">
                    <span className="block font-semibold uppercase tracking-[0.14em] !text-violet-200/60">
                      Odeslání
                    </span>
                    <span className="mt-0.5 block break-words font-semibold !text-white">
                      {broadcastDeliveryLabel}
                    </span>
                  </div>
                  <div className="rounded-2xl border border-white/12 bg-white/[0.055] px-3 py-2">
                    <span className="block font-semibold uppercase tracking-[0.14em] !text-violet-200/60">
                      Stránka
                    </span>
                    <span className="mt-0.5 block font-semibold !text-white">
                      {broadcastTargetLabel}
                    </span>
                  </div>
                  <div className="rounded-2xl border border-white/12 bg-white/[0.055] px-3 py-2">
                    <span className="block font-semibold uppercase tracking-[0.14em] !text-violet-200/60">
                      Cesta
                    </span>
                    <span className="mt-0.5 block break-all font-semibold !text-white">
                      {broadcastEffectiveTargetPath}
                    </span>
                  </div>
                </div>
              </aside>
            </form>
          </section>
        ) : null}

        {isAllowedAdmin && activeAdminSection === "users" ? (
          <section className={adminDarkSectionClass}>
            <div className={adminDarkTopBarClass} />

            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <span className={adminDarkBadgeClass}>
                  Správa účtů
                </span>
                <h2 className="inline-flex items-center gap-1.5 text-xl font-bold tracking-[-0.02em] !text-white sm:text-2xl">
                  <UserCheck2 size={20} strokeWidth={2.1} className="!text-violet-100" aria-hidden="true" />
                  <span>Uživatelé</span>
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed !text-violet-100/70">
                  Karty zvýrazňují hlavně chybějící údaje. Kliknutím otevřeš detail a editaci.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadAdminUsersRows()}
                disabled={adminUsersLoading}
                className={adminDarkSubtleButtonClass}
              >
                {adminUsersLoading ? (
                  <Loader2 size={15} strokeWidth={2.2} className="animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw size={15} strokeWidth={2.2} aria-hidden="true" />
                )}
                Obnovit
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className={adminDarkMetricClass}>
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] !text-violet-200/78">
                  Celkem
                </div>
                <div className="mt-2 text-2xl font-bold !text-white">{adminUsersStats.total}</div>
              </div>
              <div className={adminDarkMetricClass}>
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] !text-violet-200/78">
                  OK
                </div>
                <div className="mt-2 text-2xl font-bold !text-white">{adminUsersStats.complete}</div>
              </div>
              <div className="rounded-2xl border border-amber-700 bg-amber-500 px-3 py-3 shadow-[0_10px_22px_rgba(245,158,11,0.24)]">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-50">
                  K doplnění
                </div>
                <div className="mt-2 text-2xl font-bold text-white">{adminUsersStats.incomplete}</div>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 shadow-[0_8px_18px_rgba(245,158,11,0.12)]">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-800">
                  Bez profilu
                </div>
                <div className="mt-2 text-2xl font-bold text-amber-900">{adminUsersStats.missingProfile}</div>
              </div>
              <div className={adminDarkMetricClass}>
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] !text-violet-200/78">
                  Deaktivovaní
                </div>
                <div className="mt-2 text-2xl font-bold !text-white">{adminUsersStats.disabled}</div>
              </div>
            </div>

            <div className={`mt-4 ${adminDarkSoftPanelClass}`}>
              <label className="relative block">
                <Search
                  size={14}
                  strokeWidth={2.1}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="search"
                  className={`${createUserFieldClass} pl-9`}
                  value={adminUsersSearch}
                  onChange={(event) => setAdminUsersSearch(event.target.value)}
                  placeholder="Hledat jméno, e-mail, IČO, telefon nebo chybějící položku..."
                />
              </label>

              {adminUsersStatus ? (
                <div
                  className={`mt-3 rounded-xl border px-3 py-2 text-sm ${
                    adminUsersStatus.type === "success"
                      ? "border-violet-300/30 bg-violet-400/12 !text-violet-100"
                    : adminUsersStatus.type === "info"
                        ? "border-sky-300/30 bg-sky-400/12 !text-sky-100"
                        : "border-rose-200 bg-rose-50 text-rose-700"
                  }`}
                >
                  {adminUsersStatus.message}
                </div>
              ) : null}

              {adminUsersError ? (
                <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {adminUsersError}
                </div>
              ) : null}
            </div>

            <div className="mt-4 space-y-3">
              {adminUsersLoading ? (
                <div className="rounded-2xl border border-white/14 bg-white/[0.05] px-4 py-8 text-center text-sm !text-violet-100/72">
                  Načítám uživatele…
                </div>
              ) : filteredAdminUsersRows.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/18 bg-white/[0.05] px-4 py-9 text-center text-sm !text-violet-100/72">
                  Pro zadaný filtr nejsou žádní uživatelé.
                </div>
              ) : (
                filteredAdminUsersRows.map((row) => {
                  const title = row.fullName || nameFromEmail(row.email);
                  const avatarInitial = (title.trim().charAt(0) || row.email.charAt(0)).toUpperCase();
                  const isCurrentUser = normalizeEmail(currentUser?.email) === row.email;
                  const accountTypeLabel = formatAccountTypeLabel(row.accountType);
                  const positionLabel = formatPositionLabel(row.position);
                  const missingItems = buildAdminUserMissingItems(row);
                  const complete = missingItems.length === 0;
                  const targetAdminRole = resolveAdminRoleFromClaims(row.email, null);
                  const canImpersonate =
                    isAllowedAdmin && !row.disabled && !isCurrentUser && !targetAdminRole;
                  const impersonateDisabledTitle = isCurrentUser
                    ? "Vlastní účet nejde zobrazit přes impersonaci."
                    : row.disabled
                      ? "Deaktivovaný účet nejde zobrazit přes impersonaci."
                      : targetAdminRole
                        ? "Administrátorský účet nejde zobrazit přes impersonaci."
                        : undefined;

                  return (
                    <article
                      key={row.uid || row.email}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleStartAdminUserEdit(row)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        handleStartAdminUserEdit(row);
                      }}
                      className={`group relative w-full overflow-hidden rounded-3xl border bg-white/[0.07] p-4 text-left shadow-[0_16px_34px_rgba(7,6,25,0.22)] transition hover:-translate-y-[1px] hover:bg-white/[0.09] ${
                        complete ? "border-violet-300/25" : "border-amber-300/35"
                      }`}
                    >
                      <span
                        className={`pointer-events-none absolute inset-x-0 top-0 h-1 ${
                          complete
                            ? "bg-[linear-gradient(90deg,#7c3aed_0%,#c084fc_100%)]"
                            : "bg-[linear-gradient(90deg,#f59e0b_0%,#ef4444_100%)]"
                        }`}
                      />
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                          <span
                            className={`mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-sm font-bold ${
                              complete
                                ? "border-violet-300/35 bg-violet-400/14 !text-violet-100"
                                : "border-amber-200 bg-amber-50 text-amber-700"
                            }`}
                          >
                            {avatarInitial}
                          </span>
                          <div className="min-w-0">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <span className="min-w-0 max-w-full truncate text-lg font-bold !text-white">
                                {title}
                              </span>
                              <span
                                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                                  row.accountType === "tipster"
                                    ? "border-violet-200 bg-violet-50 text-violet-700"
                                    : row.accountType === "advisor"
                                      ? "border-violet-300/30 bg-violet-400/12 !text-violet-100"
                                      : "border-slate-200 bg-slate-50 text-slate-600"
                                }`}
                              >
                                  {accountTypeLabel}
                                </span>
                              {row.specialist ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-[11px] font-semibold text-cyan-700">
                                  <ShieldCheck size={12} strokeWidth={2.4} aria-hidden="true" />
                                  Specialista
                                </span>
                              ) : null}
                              {positionLabel ? (
                                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                                  {positionLabel}
                                </span>
                              ) : null}
                            </div>
                            <div className="truncate text-sm !text-violet-100/58">{row.email}</div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                              complete
                                ? "border-violet-300/30 bg-violet-400/12 !text-violet-100"
                                : "border-amber-200 bg-amber-50 text-amber-800"
                            }`}
                          >
                            {complete ? (
                              <CheckCircle2 size={14} strokeWidth={2.4} aria-hidden="true" />
                            ) : (
                              <AlertTriangle size={14} strokeWidth={2.4} aria-hidden="true" />
                            )}
                            {complete ? "OK" : `K doplnění ${missingItems.length}`}
                          </span>
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/14 bg-white/[0.07] px-3 py-1.5 text-xs font-semibold !text-violet-100/78 transition group-hover:border-violet-300/35 group-hover:!text-white">
                            <Pencil size={13} strokeWidth={2.2} aria-hidden="true" />
                            Detail
                          </span>
                          {isAllowedAdmin ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleImpersonateAdminUser(row);
                              }}
                              disabled={!canImpersonate}
                              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                                canImpersonate
                                  ? "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
                                  : "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
                              }`}
                              title={impersonateDisabledTitle}
                            >
                              <UserRound size={13} strokeWidth={2.2} aria-hidden="true" />
                              Zobrazit jako
                            </button>
                          ) : null}
                          {isOwnerAdmin ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleOpenAdminUserDelete(row);
                              }}
                              disabled={isCurrentUser}
                              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                                isCurrentUser
                                  ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
                                  : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                              }`}
                              title={isCurrentUser ? "Vlastní účet nejde smazat." : undefined}
                            >
                              <Trash2 size={13} strokeWidth={2.2} aria-hidden="true" />
                              Smazat
                            </button>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-4">
                        {complete ? (
                          <div className="inline-flex items-center gap-2 rounded-2xl border border-violet-300/30 bg-violet-400/12 px-3 py-2 text-sm font-semibold !text-violet-100">
                            <CheckCircle2 size={15} strokeWidth={2.4} aria-hidden="true" />
                            Hlavní profilové údaje jsou vyplněné.
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {missingItems.map((item) => (
                              <span
                                key={item.key}
                                className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800"
                              >
                                <AlertTriangle size={12} strokeWidth={2.3} aria-hidden="true" />
                                {item.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded-2xl border border-white/12 bg-white/[0.055] px-3 py-2">
                          <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] !text-violet-200/60">
                            IČO
                          </span>
                          <span className="mt-0.5 block font-semibold !text-white">
                            {row.ico || "—"}
                          </span>
                        </div>
                        <div className="rounded-2xl border border-white/12 bg-white/[0.055] px-3 py-2">
                          <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] !text-violet-200/60">
                            Agenturní číslo
                          </span>
                          <span className="mt-0.5 block font-semibold !text-white">
                            {row.agencyNumber || "—"}
                          </span>
                        </div>
                        <div className="rounded-2xl border border-white/12 bg-white/[0.055] px-3 py-2">
                          <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] !text-violet-200/60">
                            Telefon
                          </span>
                          <span className="mt-0.5 block font-semibold !text-white">
                            {row.phoneNumber || "—"}
                          </span>
                        </div>
                        <div className="rounded-2xl border border-white/12 bg-white/[0.055] px-3 py-2">
                          <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] !text-violet-200/60">
                            Přihlášení
                          </span>
                          <span className="mt-0.5 block font-semibold !text-white">
                            {formatAuthDateTime(row.lastSignInAt)}
                          </span>
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>
        ) : null}

        {isOwnerAdmin && activeAdminSection === "subscriptions" ? (
          <section className={adminDarkSectionClass}>
            <div className={adminDarkTopBarClass} />
            <div className="mb-4">
              <span className={adminDarkBadgeClass}>
                Fakturace
              </span>
              <h2 className="inline-flex items-center gap-1.5 text-xl font-bold tracking-[-0.02em] !text-white sm:text-2xl">
                <Landmark size={20} strokeWidth={2} className="!text-violet-100" aria-hidden="true" />
                <span>Správa předplatného</span>
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed !text-violet-100/70">
                Přidej platbu nebo nastav neomezený tarif, zkontroluj historii a případně účet označ jako nezaplacený.
              </p>
            </div>

            <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
              <aside className={adminDarkPanelClass}>
                <span className={adminDarkTopBarClass} />
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold !text-white">
                    <Inbox size={14} strokeWidth={2.1} className="!text-violet-100" aria-hidden="true" />
                    Adresář předplatného
                  </h3>
                  <button
                    type="button"
                    onClick={() => void loadSubscriptionDirectory()}
                    disabled={subscriptionDirectoryLoading}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/16 bg-white/[0.07] px-2.5 py-1.5 text-xs font-semibold !text-violet-100 transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RefreshCw size={13} strokeWidth={2.2} aria-hidden="true" />
                    Obnovit
                  </button>
                </div>

                <div className="mb-3 grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-white/14 bg-white/[0.07] px-2.5 py-2 shadow-[0_12px_28px_rgba(7,6,25,0.2)]">
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] !text-violet-200/78">
                        Celkem
                      </div>
                      <Inbox size={14} strokeWidth={2.1} className="!text-violet-100/70" aria-hidden="true" />
                    </div>
                    <div className="mt-1.5 text-xl font-bold !text-white">{subscriptionDirectoryStats.total}</div>
                  </div>
                  <div className="rounded-xl border border-rose-700 bg-rose-600 px-2.5 py-2 shadow-[0_8px_18px_rgba(225,29,72,0.3)]">
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-100">
                        Po splatnosti
                      </div>
                      <Clock3 size={14} strokeWidth={2.1} className="text-rose-100" aria-hidden="true" />
                    </div>
                    <div className="mt-1.5 text-xl font-bold text-white">{subscriptionDirectoryStats.overdue}</div>
                  </div>
                  <div className="rounded-xl border border-orange-700 bg-orange-500 px-2.5 py-2 shadow-[0_8px_18px_rgba(249,115,22,0.3)]">
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-orange-50">
                        Brzy končí
                      </div>
                      <RefreshCcw size={14} strokeWidth={2.1} className="text-orange-50" aria-hidden="true" />
                    </div>
                    <div className="mt-1.5 text-xl font-bold text-white">{subscriptionDirectoryStats.dueSoon}</div>
                  </div>
                  <div className="rounded-xl border border-violet-500 bg-violet-500 px-2.5 py-2 shadow-[0_8px_18px_rgba(124,58,237,0.32)]">
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-50">
                        Aktivní
                      </div>
                      <Check size={14} strokeWidth={2.4} className="text-violet-50" aria-hidden="true" />
                    </div>
                    <div className="mt-1.5 text-xl font-bold text-white">{subscriptionDirectoryStats.active}</div>
                  </div>
                </div>

                <div
                  className="mb-3 inline-flex w-full rounded-2xl border border-white/14 bg-white/[0.06] p-1 shadow-[0_12px_28px_rgba(7,6,25,0.18)]"
                  role="tablist"
                  aria-label="Filtr předplatného"
                >
                  {SUBSCRIPTION_DIRECTORY_FILTERS.map((filterOption) => {
                    const active = subscriptionDirectoryFilter === filterOption.id;
                    return (
                      <button
                        key={filterOption.id}
                        type="button"
                        onClick={() => setSubscriptionDirectoryFilter(filterOption.id)}
                        className={`inline-flex flex-1 items-center justify-center gap-1 rounded-xl px-2 py-1.5 text-[11px] font-semibold transition ${
                          active
                            ? "border border-violet-300/35 bg-[linear-gradient(120deg,#7c3aed_0%,#a855f7_58%,#c084fc_100%)] !text-white shadow-[0_10px_18px_rgba(124,58,237,0.28)]"
                            : "border border-transparent !text-violet-100/66 hover:!text-white"
                        }`}
                      >
                        {filterOption.id === "all" ? (
                          <Inbox size={12} strokeWidth={2.2} aria-hidden="true" />
                        ) : filterOption.id === "overdue" ? (
                          <Clock3 size={12} strokeWidth={2.2} aria-hidden="true" />
                        ) : (
                          <RefreshCcw size={12} strokeWidth={2.2} aria-hidden="true" />
                        )}
                        {filterOption.label}
                      </button>
                    );
                  })}
                </div>

                <label className="relative mb-3 block">
                  <Search
                    size={14}
                    strokeWidth={2.1}
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="search"
                    className={`${createUserFieldClass} pl-9`}
                    value={subscriptionDirectorySearch}
                    onChange={(event) => setSubscriptionDirectorySearch(event.target.value)}
                    placeholder="Hledat uživatele..."
                  />
                </label>

                {subscriptionDirectoryError ? (
                  <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                    {subscriptionDirectoryError}
                  </div>
                ) : null}

                <div className="max-h-[620px] space-y-2 overflow-y-auto pr-1">
                  {subscriptionDirectoryLoading ? (
                    <div className="rounded-xl border border-white/14 bg-white/[0.05] px-3 py-5 text-center text-xs !text-violet-100/72">
                      Načítám seznam uživatelů…
                    </div>
                  ) : filteredSubscriptionDirectoryRows.length === 0 ? (
                    <div className="rounded-xl border border-white/14 bg-white/[0.05] px-3 py-5 text-center text-xs !text-violet-100/72">
                      Žádní uživatelé pro zvolený filtr.
                    </div>
                  ) : (
                    filteredSubscriptionDirectoryRows.map((row) => {
                      const selected = normalizeEmail(subscriptionLookupEmail) === row.email;
                      const stateLabel = getSubscriptionStateLabel(row);
                      const stateClass = getSubscriptionStatePillClass(row);
                      const planLabel =
                        row.subscription.plan &&
                        row.subscription.plan in SUBSCRIPTION_PLAN_LABELS
                          ? SUBSCRIPTION_PLAN_LABELS[
                              row.subscription.plan as SubscriptionPlanValue
                            ]
                          : "Bez tarifu";
                      const planClass = getSubscriptionPlanPillClass(row.subscription.plan);
                      const dueSoonLabel = row.flags?.isDueSoon
                        ? formatDaysUntilDue(row.flags?.daysUntilDue)
                        : "";
                      const title = row.fullName || nameFromEmail(row.email);
                      const avatarInitial = (title.trim().charAt(0) || row.email.charAt(0)).toUpperCase();

                      return (
                        <button
                          key={row.email}
                          type="button"
                          onClick={() => {
                            setSubscriptionLookupEmail(row.email);
                            setSubscriptionLookupError(null);
                            setSubscriptionLookupStatus(null);
                            void loadSubscriptionForEmail(row.email);
                          }}
                          className={`relative w-full overflow-hidden rounded-2xl border px-3 py-2.5 text-left transition ${
                            selected
                              ? "border-violet-300/45 bg-violet-400/14 !text-white shadow-[0_14px_30px_rgba(124,58,237,0.18)]"
                              : "border-white/12 bg-white/[0.055] !text-white hover:border-violet-300/30 hover:bg-white/[0.08]"
                          }`}
                        >
                          {selected ? (
                            <span className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-violet-400" />
                          ) : null}
                          <div className="flex items-start gap-2">
                            <span
                              className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                                selected
                                  ? "border-violet-300/45 bg-violet-400/16 !text-violet-100"
                                  : "border-white/14 bg-white/[0.07] !text-violet-100/78"
                              }`}
                            >
                              {avatarInitial}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-semibold">{title}</div>
                              <div
                                className={`truncate text-xs ${
                                  selected ? "!text-violet-100/72" : "!text-violet-100/54"
                                }`}
                              >
                                {row.email}
                              </div>
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                <span
                                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${stateClass}`}
                                >
                                  {stateLabel}
                                </span>
                                <span
                                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${planClass}`}
                                >
                                  {planLabel}
                                </span>
                                {dueSoonLabel ? (
                                  <span
                                    className="inline-flex items-center gap-1 rounded-full border border-orange-600 bg-orange-500 px-2 py-0.5 text-[10px] font-semibold text-white"
                                  >
                                    <Clock3 size={10} strokeWidth={2.4} aria-hidden="true" />
                                    {dueSoonLabel}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </aside>

              <div className="space-y-3">
                <div className={adminDarkPanelClass}>
                  <span className={adminDarkTopBarClass} />
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.2em] !text-violet-200/70">
                        <UserCheck2 size={12} strokeWidth={2.2} aria-hidden="true" />
                        Detail
                      </div>
                      <div className="mt-1 text-2xl font-bold leading-tight !text-white sm:text-3xl">
                        {subscriptionData?.user?.fullName ||
                          subscriptionData?.user?.email ||
                          (subscriptionLookupEmail ? nameFromEmail(subscriptionLookupEmail) : "Vyber uživatele")}
                      </div>
                      <p className="mt-1 text-sm !text-violet-100/58">
                        {subscriptionData?.user?.email || subscriptionLookupEmail || "Klikni vlevo na uživatele."}
                      </p>
                    </div>
                    {subscriptionData?.subscription ? (
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${getSubscriptionStatePillClass({
                          subscription: {
                            effectiveState: subscriptionData.subscription.effectiveState,
                            status: subscriptionData.subscription.status,
                          },
                        })}`}
                      >
                        {getSubscriptionStateLabel({
                          subscription: {
                            effectiveState: subscriptionData.subscription.effectiveState,
                            status: subscriptionData.subscription.status,
                          },
                        })}
                      </span>
                    ) : (
                      <span className="rounded-full border border-white/14 bg-white/[0.07] px-3 py-1 text-xs font-semibold !text-violet-100/72">
                        Bez výběru
                      </span>
                    )}
                  </div>
                </div>

                <div className={`${adminDarkSoftPanelClass} grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]`}>
                  <div className="space-y-1.5">
                    <label className={`inline-flex items-center gap-1.5 ${createUserLabelClass}`}>
                      <Landmark size={12} strokeWidth={2.2} aria-hidden="true" />
                      Tarif
                    </label>
                    <select
                      className={createUserFieldClass}
                      value={subscriptionPlanDraft}
                      onChange={(event) =>
                        setSubscriptionPlanDraft(event.target.value as SubscriptionPlanValue)
                      }
                    >
                      {(
                        Object.keys(SUBSCRIPTION_PLAN_LABELS) as SubscriptionPlanValue[]
                      ).map((planKey) => (
                        <option key={planKey} value={planKey}>
                          {SUBSCRIPTION_PLAN_LABELS[planKey]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className={`inline-flex items-center gap-1.5 ${createUserLabelClass}`}>
                      <Clock3 size={12} strokeWidth={2.2} aria-hidden="true" />
                      Začátek období (volitelné)
                    </label>
                    <input
                      type="date"
                      className={createUserFieldClass}
                      value={subscriptionFromDraft}
                      onChange={(event) => setSubscriptionFromDraft(event.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5 lg:col-span-2">
                    <label className={`inline-flex items-center gap-1.5 ${createUserLabelClass}`}>
                      <Copy size={12} strokeWidth={2.2} aria-hidden="true" />
                      Poznámka
                    </label>
                    <input
                      type="text"
                      className={createUserFieldClass}
                      value={subscriptionNoteDraft}
                      onChange={(event) => setSubscriptionNoteDraft(event.target.value)}
                      placeholder="např. uhrazeno převodem"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2 lg:col-span-2">
                    <button
                      type="button"
                      onClick={() => void handleAddSubscriptionPayment()}
                      disabled={subscriptionLookupLoading}
                      className={adminDarkPrimaryButtonClass}
                    >
                      <Check size={14} strokeWidth={2.4} aria-hidden="true" />
                      {subscriptionPlanDraft === "unlimited" ? "Nastavit neomezený" : "Zapsat platbu"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSetSubscriptionUnpaid()}
                      disabled={subscriptionLookupLoading}
                      className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-rose-500/80 bg-[linear-gradient(135deg,#fb7185_0%,#e11d48_100%)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_26px_rgba(225,29,72,0.3)] transition hover:-translate-y-0.5 hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <X size={14} strokeWidth={2.4} aria-hidden="true" />
                      Označit nezaplaceno
                    </button>
                  </div>

                  {subscriptionLookupStatus ? (
                    <p
                      className={`text-xs font-medium lg:col-span-2 ${
                        subscriptionLookupStatus.type === "success"
                          ? "!text-violet-100"
                        : subscriptionLookupStatus.type === "info"
                            ? "!text-violet-100/78"
                            : "text-rose-700"
                      }`}
                    >
                      {subscriptionLookupStatus.message}
                    </p>
                  ) : null}

                  {subscriptionLookupError ? (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 lg:col-span-2">
                      {subscriptionLookupError}
                    </div>
                  ) : null}
                </div>

                {subscriptionData?.subscription ? (
                  <div className="space-y-3">
                <div className={adminDarkSoftPanelClass}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold !text-white">
                        {subscriptionData.user?.fullName || subscriptionData.user?.email || "Uživatel"}
                      </p>
                      <p className="text-xs !text-violet-100/58">
                        {subscriptionData.user?.email || "—"}
                      </p>
                    </div>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                        subscriptionData.subscription.effectiveState === "active"
                          ? "border-violet-300/30 bg-violet-400/12 !text-violet-100"
                          : subscriptionData.subscription.effectiveState === "grace"
                            ? "border-amber-200 bg-amber-50 text-amber-700"
                            : subscriptionData.subscription.status === "unpaid"
                              ? "border-rose-200 bg-rose-50 text-rose-700"
                              : "border-slate-200 bg-slate-100 text-slate-700"
                      }`}
                    >
                      {subscriptionData.subscription.effectiveState === "active"
                        ? "Aktivní"
                        : subscriptionData.subscription.effectiveState === "grace"
                          ? "Ochranná lhůta"
                          : subscriptionData.subscription.status === "unpaid"
                            ? "Nezaplaceno"
                            : "Blokováno"}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-2 text-xs !text-violet-100/72 sm:grid-cols-3">
                    <div className="rounded-2xl border border-white/12 bg-white/[0.055] px-3 py-2.5">
                      <div className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] !text-violet-200/60">
                        <Landmark size={11} strokeWidth={2.2} aria-hidden="true" />
                        Tarif
                      </div>
                      <div className="mt-1 font-semibold !text-white">
                        {subscriptionData.subscription.plan &&
                        subscriptionData.subscription.plan in SUBSCRIPTION_PLAN_LABELS
                          ? SUBSCRIPTION_PLAN_LABELS[
                              subscriptionData.subscription.plan as SubscriptionPlanValue
                            ]
                          : "—"}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/12 bg-white/[0.055] px-3 py-2.5">
                      <div className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] !text-violet-200/60">
                        <Clock3 size={11} strokeWidth={2.2} aria-hidden="true" />
                        Od
                      </div>
                      <div className="mt-1 font-semibold !text-white">
                        {formatIsoDay(subscriptionData.subscription.paidFrom)}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/12 bg-white/[0.055] px-3 py-2.5">
                      <div className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] !text-violet-200/60">
                        <Clock3 size={11} strokeWidth={2.2} aria-hidden="true" />
                        Do
                      </div>
                      <div className="mt-1 font-semibold !text-white">
                        {subscriptionData.subscription.plan === "unlimited"
                          ? "Neomezeně"
                          : formatIsoDay(subscriptionData.subscription.paidUntil)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className={adminDarkSoftPanelClass}>
                  <h3 className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold !text-white">
                    <RefreshCcw size={14} strokeWidth={2.1} className="!text-violet-100" aria-hidden="true" />
                    Historie plateb
                  </h3>
                  {(subscriptionData.payments ?? []).length === 0 ? (
                    <div className="rounded-xl border border-white/12 bg-white/[0.055] px-3 py-3 text-sm !text-violet-100/72">
                      Zatím bez plateb.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-left text-xs !text-violet-100/78">
                        <thead>
                          <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.12em] !text-violet-200/60">
                            <th className="px-2 py-2">Tarif</th>
                            <th className="px-2 py-2">Částka</th>
                            <th className="px-2 py-2">Období</th>
                            <th className="px-2 py-2">Zapsal</th>
                            <th className="px-2 py-2">Poznámka</th>
                            <th className="px-2 py-2 text-right">Akce</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(subscriptionData.payments ?? []).map((payment) => {
                            const isEditing = subscriptionEditingPaymentId === payment.id;
                            const isSaving = subscriptionSavingPaymentId === payment.id;
                            const isDeleting = subscriptionDeletingPaymentId === payment.id;
                            const isPaymentBusy = isSaving || isDeleting;
                            const paymentPlanLabel = isPaidSubscriptionPlanValue(payment.plan)
                              ? SUBSCRIPTION_PLAN_LABELS[payment.plan]
                              : payment.plan || "—";

                            return (
                              <tr key={payment.id} className="border-b border-white/8 align-top">
                                <td className="px-2 py-2 font-semibold !text-white">
                                  {isEditing ? (
                                    <select
                                      className={subscriptionHistoryFieldClass}
                                      value={subscriptionEditPlan}
                                      onChange={(event) =>
                                        setSubscriptionEditPlan(
                                          event.target.value as PaidSubscriptionPlanValue
                                        )
                                      }
                                      disabled={isPaymentBusy}
                                      aria-label="Tarif platby"
                                    >
                                      {PAID_SUBSCRIPTION_PLAN_KEYS.map((planKey) => (
                                        <option key={planKey} value={planKey}>
                                          {SUBSCRIPTION_PLAN_LABELS[planKey]}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    paymentPlanLabel
                                  )}
                                </td>
                                <td className="px-2 py-2">
                                  {isEditing ? (
                                    <input
                                      type="number"
                                      min="1"
                                      step="1"
                                      inputMode="numeric"
                                      className={subscriptionHistoryFieldClass}
                                      value={subscriptionEditAmount}
                                      onChange={(event) =>
                                        setSubscriptionEditAmount(event.target.value)
                                      }
                                      disabled={isPaymentBusy}
                                      aria-label="Částka platby"
                                    />
                                  ) : (
                                    formatMoneyCzk(payment.amountCzk || 0)
                                  )}
                                </td>
                                <td className="px-2 py-2">
                                  {isEditing ? (
                                    <div className="grid min-w-[250px] gap-1 sm:grid-cols-2">
                                      <input
                                        type="date"
                                        className={subscriptionHistoryFieldClass}
                                        value={subscriptionEditPeriodFrom}
                                        onChange={(event) =>
                                          setSubscriptionEditPeriodFrom(event.target.value)
                                        }
                                        disabled={isPaymentBusy}
                                        aria-label="Začátek období platby"
                                      />
                                      <input
                                        type="date"
                                        className={subscriptionHistoryFieldClass}
                                        value={subscriptionEditPeriodUntil}
                                        onChange={(event) =>
                                          setSubscriptionEditPeriodUntil(event.target.value)
                                        }
                                        disabled={isPaymentBusy}
                                        aria-label="Konec období platby"
                                      />
                                    </div>
                                  ) : (
                                    <>
                                      {formatIsoDay(payment.periodFrom)} –{" "}
                                      {formatIsoDay(payment.periodUntil)}
                                    </>
                                  )}
                                </td>
                                <td className="px-2 py-2">
                                  <div>{payment.createdByEmail || "—"}</div>
                                  <div className="text-[10px] text-slate-500">
                                    {formatDateTime(payment.createdAtMs)}
                                  </div>
                                </td>
                                <td className="px-2 py-2">
                                  {isEditing ? (
                                    <input
                                      type="text"
                                      className={`${subscriptionHistoryFieldClass} min-w-[180px]`}
                                      value={subscriptionEditNote}
                                      onChange={(event) =>
                                        setSubscriptionEditNote(event.target.value)
                                      }
                                      disabled={isPaymentBusy}
                                      aria-label="Poznámka k platbě"
                                    />
                                  ) : (
                                    payment.note || "—"
                                  )}
                                </td>
                                <td className="px-2 py-2">
                                  <div className="flex justify-end gap-1.5">
                                    {isEditing ? (
                                      <>
                                        <button
                                          type="button"
                                          className={subscriptionHistoryIconButtonClass}
                                          onClick={() =>
                                            void handleUpdateSubscriptionPayment(payment.id)
                                          }
                                          disabled={isPaymentBusy || subscriptionLookupLoading}
                                          aria-label="Uložit platbu"
                                          title="Uložit platbu"
                                        >
                                          {isSaving ? (
                                            <Loader2
                                              size={14}
                                              strokeWidth={2.2}
                                              className="animate-spin"
                                              aria-hidden="true"
                                            />
                                          ) : (
                                            <Save size={14} strokeWidth={2.2} aria-hidden="true" />
                                          )}
                                        </button>
                                        <button
                                          type="button"
                                          className={subscriptionHistoryIconButtonClass}
                                          onClick={handleCancelSubscriptionPaymentEdit}
                                          disabled={isPaymentBusy}
                                          aria-label="Zrušit editaci"
                                          title="Zrušit editaci"
                                        >
                                          <X size={14} strokeWidth={2.2} aria-hidden="true" />
                                        </button>
                                      </>
                                    ) : (
                                      <>
                                        <button
                                          type="button"
                                          className={subscriptionHistoryIconButtonClass}
                                          onClick={() =>
                                            handleStartSubscriptionPaymentEdit(payment)
                                          }
                                          disabled={
                                            subscriptionLookupLoading ||
                                            Boolean(subscriptionSavingPaymentId) ||
                                            Boolean(subscriptionDeletingPaymentId)
                                          }
                                          aria-label="Upravit platbu"
                                          title="Upravit platbu"
                                        >
                                          <Pencil size={14} strokeWidth={2.2} aria-hidden="true" />
                                        </button>
                                        <button
                                          type="button"
                                          className={subscriptionHistoryDangerButtonClass}
                                          onClick={() =>
                                            void handleDeleteSubscriptionPayment(payment)
                                          }
                                          disabled={
                                            subscriptionLookupLoading ||
                                            Boolean(subscriptionSavingPaymentId) ||
                                            Boolean(subscriptionDeletingPaymentId)
                                          }
                                          aria-label="Smazat platbu"
                                          title="Smazat platbu"
                                        >
                                          {isDeleting ? (
                                            <Loader2
                                              size={14}
                                              strokeWidth={2.2}
                                              className="animate-spin"
                                              aria-hidden="true"
                                            />
                                          ) : (
                                            <Trash2
                                              size={14}
                                              strokeWidth={2.2}
                                              aria-hidden="true"
                                            />
                                          )}
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        {isAllowedAdmin && activeAdminSection === "security" ? (
          <section className={adminDarkSectionClass}>
            <div className={adminDarkTopBarClass} />

            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <span className={adminDarkBadgeClass}>
                  Zabezpečení
                </span>
                <h2 className="inline-flex items-center gap-1.5 text-xl font-bold tracking-[-0.02em] !text-white sm:text-2xl">
                  <ShieldCheck size={20} strokeWidth={2} className="!text-violet-100" aria-hidden="true" />
                  <span>2FA přehled uživatelů</span>
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed !text-violet-100/70">
                  Přehled čte aktivní druhé faktory přímo z Firebase Auth.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadSecurityRows()}
                disabled={securityLoading}
                className={adminDarkSubtleButtonClass}
              >
                <RefreshCw size={15} strokeWidth={2.2} aria-hidden="true" />
                Obnovit
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className={adminDarkMetricClass}>
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] !text-violet-200/78">
                    Celkem
                  </div>
                  <Inbox size={15} strokeWidth={2.1} className="!text-violet-100/70" aria-hidden="true" />
                </div>
                <div className="mt-2 text-2xl font-bold !text-white">{securityStats.total}</div>
              </div>
              <div className={adminDarkMetricClass}>
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] !text-violet-200/78">
                    2FA aktivní
                  </div>
                  <ShieldCheck size={15} strokeWidth={2.2} className="!text-violet-100" aria-hidden="true" />
                </div>
                <div className="mt-2 text-2xl font-bold !text-white">{securityStats.mfaEnabled}</div>
              </div>
              <div className="rounded-2xl border border-rose-700 bg-rose-600 px-3 py-3 shadow-[0_10px_22px_rgba(225,29,72,0.28)]">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-50">
                    Bez 2FA
                  </div>
                  <ShieldAlert size={15} strokeWidth={2.2} className="text-rose-50" aria-hidden="true" />
                </div>
                <div className="mt-2 text-2xl font-bold text-white">{securityStats.mfaMissing}</div>
              </div>
              <div className={adminDarkMetricClass}>
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] !text-violet-200/78">
                    Ověřený e-mail
                  </div>
                  <Check size={15} strokeWidth={2.3} className="!text-violet-100" aria-hidden="true" />
                </div>
                <div className="mt-2 text-2xl font-bold !text-white">{securityStats.emailVerified}</div>
              </div>
            </div>

            <div className={`mt-4 ${adminDarkSoftPanelClass}`}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div
                  className="inline-flex w-full rounded-2xl border border-white/14 bg-white/[0.06] p-1 shadow-[0_12px_28px_rgba(7,6,25,0.18)] lg:w-auto"
                  role="tablist"
                  aria-label="Filtr zabezpečení"
                >
                  {SECURITY_FILTERS.map((filterOption) => {
                    const active = securityFilter === filterOption.id;
                    return (
                      <button
                        key={filterOption.id}
                        type="button"
                        onClick={() => setSecurityFilter(filterOption.id)}
                        className={`inline-flex flex-1 items-center justify-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold transition lg:flex-none ${
                          active
                            ? "border border-violet-300/35 bg-[linear-gradient(120deg,#7c3aed_0%,#a855f7_58%,#c084fc_100%)] !text-white shadow-[0_10px_18px_rgba(124,58,237,0.28)]"
                            : "border border-transparent !text-violet-100/66 hover:!text-white"
                        }`}
                      >
                        {filterOption.id === "enabled" ? (
                          <ShieldCheck size={12} strokeWidth={2.2} aria-hidden="true" />
                        ) : filterOption.id === "disabled" ? (
                          <ShieldAlert size={12} strokeWidth={2.2} aria-hidden="true" />
                        ) : (
                          <Inbox size={12} strokeWidth={2.2} aria-hidden="true" />
                        )}
                        {filterOption.label}
                      </button>
                    );
                  })}
                </div>

                <label className="relative block w-full lg:max-w-sm">
                  <Search
                    size={14}
                    strokeWidth={2.1}
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="search"
                    className={`${createUserFieldClass} pl-9`}
                    value={securitySearch}
                    onChange={(event) => setSecuritySearch(event.target.value)}
                    placeholder="Hledat jméno, e-mail nebo pozici..."
                  />
                </label>
              </div>

              {securityError ? (
                <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {securityError}
                </div>
              ) : null}
            </div>

            <div className="mt-4 space-y-2">
              {securityLoading ? (
                <div className="rounded-2xl border border-white/14 bg-white/[0.05] px-4 py-8 text-center text-sm !text-violet-100/72">
                  Načítám zabezpečení uživatelů…
                </div>
              ) : filteredSecurityRows.length === 0 ? (
                <div className="rounded-2xl border border-white/14 bg-white/[0.05] px-4 py-8 text-center text-sm !text-violet-100/72">
                  Pro zvolený filtr nejsou žádní uživatelé.
                </div>
              ) : (
                filteredSecurityRows.map((row) => {
                  const title = row.fullName || nameFromEmail(row.email);
                  const avatarInitial = (title.trim().charAt(0) || row.email.charAt(0)).toUpperCase();
                  const mfaEnabled = row.mfa.enabled;
                  const accountTypeLabel = formatAccountTypeLabel(row.accountType);
                  const positionLabel = formatPositionLabel(row.position);

                  return (
                    <div
                      key={row.uid}
                      className="relative overflow-hidden rounded-3xl border border-white/12 bg-white/[0.07] p-4 shadow-[0_16px_34px_rgba(7,6,25,0.22)]"
                    >
                      <span
                        className={`pointer-events-none absolute inset-x-0 top-0 h-1 ${
                          mfaEnabled ? "bg-violet-500" : "bg-rose-500"
                        }`}
                      />
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                          <span
                            className={`mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm font-bold ${
                              mfaEnabled
                                ? "border-violet-300/35 bg-violet-400/14 !text-violet-100"
                                : "border-rose-200 bg-rose-50 text-rose-700"
                            }`}
                          >
                            {avatarInitial}
                          </span>
                          <div className="min-w-0">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <span className="min-w-0 max-w-full truncate text-lg font-bold !text-white">
                                {title}
                              </span>
                              <span
                                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                                  row.accountType === "tipster"
                                    ? "border-violet-200 bg-violet-50 text-violet-700"
                                    : row.accountType === "advisor"
                                      ? "border-violet-300/30 bg-violet-400/12 !text-violet-100"
                                      : "border-slate-200 bg-slate-50 text-slate-600"
                                }`}
                              >
                                {accountTypeLabel}
                              </span>
                              {positionLabel ? (
                                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                                  {positionLabel}
                                </span>
                              ) : null}
                            </div>
                            <div className="truncate text-sm !text-violet-100/58">{row.email}</div>
                            {row.disabled ? (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                <span className="rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                                  Deaktivovaný účet
                                </span>
                              </div>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-1.5 lg:justify-end">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${
                              mfaEnabled
                                ? "border-violet-300/30 bg-violet-400/12 !text-violet-100"
                                : "border-rose-200 bg-rose-50 text-rose-700"
                            }`}
                          >
                            {mfaEnabled ? (
                              <ShieldCheck size={13} strokeWidth={2.2} aria-hidden="true" />
                            ) : (
                              <ShieldAlert size={13} strokeWidth={2.2} aria-hidden="true" />
                            )}
                            {mfaEnabled ? "2FA aktivní" : "Bez 2FA"}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${
                              row.emailVerified
                                ? "border-sky-200 bg-sky-50 text-sky-700"
                                : "border-amber-200 bg-amber-50 text-amber-700"
                            }`}
                          >
                            {row.emailVerified ? (
                              <Check size={13} strokeWidth={2.3} aria-hidden="true" />
                            ) : (
                              <X size={13} strokeWidth={2.3} aria-hidden="true" />
                            )}
                            {row.emailVerified ? "E-mail ověřen" : "E-mail neověřen"}
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-2 text-xs !text-violet-100/72 sm:grid-cols-3">
                        <div className="rounded-2xl border border-white/12 bg-white/[0.055] px-3 py-2.5">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] !text-violet-200/60">
                            Vytvořen
                          </div>
                          <div className="mt-1 font-semibold !text-white">
                            {formatAuthDateTime(row.createdAt)}
                          </div>
                        </div>
                        <div className="rounded-2xl border border-white/12 bg-white/[0.055] px-3 py-2.5">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] !text-violet-200/60">
                            Poslední přihlášení
                          </div>
                          <div className="mt-1 font-semibold !text-white">
                            {formatAuthDateTime(row.lastSignInAt)}
                          </div>
                        </div>
                        <div className="rounded-2xl border border-white/12 bg-white/[0.055] px-3 py-2.5">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] !text-violet-200/60">
                            Druhé faktory
                          </div>
                          <div className="mt-1 font-semibold !text-white">
                            {row.mfa.factorCount > 0 ? `${row.mfa.factorCount} aktivní` : "Žádný"}
                          </div>
                        </div>
                      </div>

                      {row.mfa.factors.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {row.mfa.factors.map((factor) => (
                            <span
                              key={factor.uid}
                              className="inline-flex items-center gap-1.5 rounded-full border border-violet-300/30 bg-violet-400/12 px-3 py-1 text-xs font-semibold !text-violet-100"
                              title={
                                factor.enrollmentTime
                                  ? `Zapsáno: ${formatAuthDateTime(factor.enrollmentTime)}`
                                  : undefined
                              }
                            >
                              <ShieldCheck size={13} strokeWidth={2.2} aria-hidden="true" />
                              {getMfaFactorLabel(factor)}
                              {factor.displayName ? ` · ${factor.displayName}` : ""}
                              {factor.phoneNumber ? ` · ${factor.phoneNumber}` : ""}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </section>
        ) : null}

        {!authReady ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            Načítám přihlášení…
          </div>
        ) : null}

        {!canAccessAdminPanel && authReady ? (
          <div className="inline-flex items-start gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <ShieldAlert size={16} strokeWidth={2.2} aria-hidden="true" className="mt-0.5" />
            Pro tuto sekci je nutné přihlášení pod oprávněným účtem.
          </div>
        ) : null}
      </div>
    </AppLayout>
  );
}
