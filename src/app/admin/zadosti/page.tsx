"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  AlertTriangle,
  BriefcaseBusiness,
  Check,
  Clock3,
  Copy,
  IdCard,
  KeyRound,
  Loader2,
  Inbox,
  Landmark,
  Mail,
  Pencil,
  RefreshCcw,
  RefreshCw,
  Save,
  Search,
  ShieldAlert,
  ShieldCheck,
  Snail,
  Trash2,
  UserCheck2,
  UserPlus,
  X,
  Zap,
} from "lucide-react";
import { onAuthStateChanged, type User } from "firebase/auth";

import { AppLayout } from "@/components/AppLayout";
import { auth } from "@/app/firebase";
import { fetchAuthedJsonOrThrow } from "@/app/lib/authenticatedApi";
import type { CommissionMode, Position } from "@/app/types/domain";
import { ADMIN_PANEL_EMAILS_LABEL, isAdminPanelEmail } from "@/lib/adminAccess";

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
    return "border-emerald-600 bg-emerald-500 text-white";
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
  approved: "border-emerald-300 bg-emerald-50 text-emerald-800",
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
  accepted: "border-emerald-300 bg-emerald-50 text-emerald-800",
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

const NEW_USER_AGENCY_NUMBER_MAX_LEN = 80;
const CREATE_USER_CELEBRATION_MS = 2600;
const CREATE_USER_CONFETTI_COLORS = [
  "#c084fc",
  "#a855f7",
  "#22c55e",
  "#34d399",
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

type AdminSection = "requests" | "createUser" | "users" | "subscriptions" | "security";

type SubscriptionPlanValue = "monthly" | "semiannual" | "yearly" | "unlimited";

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
  position: string | null;
  accountType: string | null;
  managerEmail: string | null;
  tipRecipientEmail: string | null;
  commissionMode: string | null;
  disabled: boolean;
  emailVerified: boolean;
  createdAt: string | null;
  lastSignInAt: string | null;
  profileExists: boolean;
  privateProfileExists: boolean;
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

type AdminUsersDeleteTarget = {
  email: string;
  fullName: string | null;
};

type AdminUsersAccountTypeDraft = NewUserAccountType | "";

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
  const [adminUsersRows, setAdminUsersRows] = useState<AdminUsersRow[]>([]);
  const [adminUsersLoading, setAdminUsersLoading] = useState(false);
  const [adminUsersError, setAdminUsersError] = useState<string | null>(null);
  const [adminUsersStatus, setAdminUsersStatus] = useState<InlineStatus | null>(null);
  const [adminUsersSearch, setAdminUsersSearch] = useState("");
  const [adminUsersEditingEmail, setAdminUsersEditingEmail] = useState<string | null>(null);
  const [adminUsersEditFullName, setAdminUsersEditFullName] = useState("");
  const [adminUsersEditAgencyNumber, setAdminUsersEditAgencyNumber] = useState("");
  const [adminUsersEditAccountType, setAdminUsersEditAccountType] =
    useState<AdminUsersAccountTypeDraft>("");
  const [adminUsersSavingEmail, setAdminUsersSavingEmail] = useState<string | null>(null);
  const [adminUsersDeleteTarget, setAdminUsersDeleteTarget] =
    useState<AdminUsersDeleteTarget | null>(null);
  const [adminUsersDeleteConfirmed, setAdminUsersDeleteConfirmed] = useState(false);
  const [adminUsersDeletingEmail, setAdminUsersDeletingEmail] = useState<string | null>(null);
  const [subscriptionPlanDraft, setSubscriptionPlanDraft] =
    useState<SubscriptionPlanValue>("monthly");
  const [subscriptionFromDraft, setSubscriptionFromDraft] = useState("");
  const [subscriptionNoteDraft, setSubscriptionNoteDraft] = useState("");
  const [subscriptionData, setSubscriptionData] = useState<AdminSubscriptionLookupResponse | null>(null);
  const [requestsNowMs, setRequestsNowMs] = useState(() => Date.now());

  const isAllowedAdmin = isAdminPanelEmail(currentUser?.email);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

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
    if (!user || !isAllowedAdmin) {
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
  }, [isAllowedAdmin]);

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
    if (activeAdminSection !== "users") return;
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
      const managerEmail = (row.managerEmail || "").toLowerCase();
      const tipRecipientEmail = (row.tipRecipientEmail || "").toLowerCase();
      const position = (row.position || "").toLowerCase();
      const positionLabel = formatPositionLabel(row.position).toLowerCase();
      const accountTypeLabel = formatAccountTypeLabel(row.accountType).toLowerCase();
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
        managerEmail.includes(query) ||
        tipRecipientEmail.includes(query) ||
        position.includes(query) ||
        positionLabel.includes(query) ||
        accountTypeLabel.includes(query) ||
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
    return { total, missingProfile, disabled, advisors, tipsters };
  }, [adminUsersRows]);

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
    if (!user || !isAllowedAdmin) return;

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
    isAllowedAdmin,
    newUserEmail,
    newUserFullName,
    newUserAgencyNumber,
    newUserAccountType,
    newUserManagerEmail,
    newUserMode,
    newUserPassword,
  ]);

  const loadSubscriptionForEmail = useCallback(
    async (emailInput?: string) => {
      const user = auth.currentUser;
      if (!user || !isAllowedAdmin) return;

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
    [isAllowedAdmin, subscriptionLookupEmail]
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
    if (!user || !isAllowedAdmin) return;
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
      setSubscriptionLookupStatus({
        type: "success",
        message:
          subscriptionPlanDraft === "unlimited"
            ? "Tarif Neomezený byl nastavený a účet je aktivní bez časového omezení."
            : "Platba byla zapsaná a předplatné aktivované.",
      });
      setSubscriptionNoteDraft("");
      await loadSubscriptionForEmail(email);
      await loadSubscriptionDirectory();
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
    isAllowedAdmin,
    loadSubscriptionDirectory,
    loadSubscriptionForEmail,
    subscriptionFromDraft,
    subscriptionLookupEmail,
    subscriptionNoteDraft,
    subscriptionPlanDraft,
  ]);

  const handleSetSubscriptionUnpaid = useCallback(async () => {
    const user = auth.currentUser;
    if (!user || !isAllowedAdmin) return;
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
      setSubscriptionLookupStatus({
        type: "info",
        message: "Účet byl označen jako nezaplacený.",
      });
      await loadSubscriptionForEmail(email);
      await loadSubscriptionDirectory();
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
    isAllowedAdmin,
    loadSubscriptionDirectory,
    loadSubscriptionForEmail,
    subscriptionLookupEmail,
    subscriptionNoteDraft,
  ]);

  const handleStartAdminUserEdit = useCallback((row: AdminUsersRow) => {
    setAdminUsersEditingEmail(row.email);
    setAdminUsersEditFullName(row.fullName ?? "");
    setAdminUsersEditAgencyNumber(row.agencyNumber ?? "");
    setAdminUsersEditAccountType(
      row.accountType === "advisor" || row.accountType === "tipster"
        ? row.accountType
        : ""
    );
    setAdminUsersStatus(null);
    setAdminUsersError(null);
  }, []);

  const handleCancelAdminUserEdit = useCallback(() => {
    setAdminUsersEditingEmail(null);
    setAdminUsersEditFullName("");
    setAdminUsersEditAgencyNumber("");
    setAdminUsersEditAccountType("");
  }, []);

  const handleSaveAdminUser = useCallback(
    async (row: AdminUsersRow) => {
      const user = auth.currentUser;
      if (!user || !isAllowedAdmin) return;

      setAdminUsersSavingEmail(row.email);
      setAdminUsersStatus(null);
      setAdminUsersError(null);
      try {
        await fetchAuthedJsonOrThrow(user, "/api/admin/users", {
          method: "PATCH",
          body: JSON.stringify({
            email: row.email,
            fullName: adminUsersEditFullName,
            agencyNumber: adminUsersEditAgencyNumber,
            accountType: adminUsersEditAccountType,
          }),
        });
        setAdminUsersStatus({
          type: "success",
          message: `Uživatel ${row.email} byl uložen.`,
        });
        setAdminUsersEditingEmail(null);
        setAdminUsersEditFullName("");
        setAdminUsersEditAgencyNumber("");
        setAdminUsersEditAccountType("");
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
      isAllowedAdmin,
      loadAdminUsersRows,
    ]
  );

  const handleOpenAdminUserDelete = useCallback((row: AdminUsersRow) => {
    setAdminUsersDeleteTarget({
      email: row.email,
      fullName: row.fullName,
    });
    setAdminUsersDeleteConfirmed(false);
    setAdminUsersStatus(null);
    setAdminUsersError(null);
  }, []);

  const handleDeleteAdminUser = useCallback(async () => {
    const user = auth.currentUser;
    const target = adminUsersDeleteTarget;
    if (!user || !isAllowedAdmin || !target) return;

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
    isAllowedAdmin,
    loadAdminUsersRows,
  ]);

  const fieldClass =
    "w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-[0_8px_18px_rgba(15,23,42,0.04)] outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10";
  const createUserFieldClass =
    "w-full rounded-2xl border border-white/14 bg-white/[0.07] px-3 py-2.5 text-sm font-semibold !text-white shadow-[0_10px_24px_rgba(7,6,25,0.18)] outline-none transition placeholder:!text-violet-100/42 focus:border-violet-200/70 focus:bg-white/[0.1] focus:ring-2 focus:ring-violet-300/20 [caret-color:#f8fafc]";
  const createUserLabelClass =
    "text-[11px] font-semibold uppercase tracking-[0.16em] !text-violet-200/78";

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
            <span className="admin-create-success-check relative mb-5 inline-flex h-24 w-24 items-center justify-center rounded-full !text-emerald-100">
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
      <div className="w-full max-w-[1200px] space-y-6 px-2 pb-8 sm:px-4">
        <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-[linear-gradient(170deg,#ffffff_0%,#f8fbff_55%,#eff5fb_100%)] px-5 py-5 shadow-[0_22px_46px_rgba(15,23,42,0.1)] sm:px-6">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#0b1220_0%,#173a71_55%,#2c61af_100%)]" />

          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <span className="mb-2 inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold tracking-wide text-sky-800">
                Řídicí panel
              </span>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                  Admin
                </h1>
                {isAllowedAdmin ? (
                  <div className="flex w-fit max-w-full flex-wrap gap-1 overflow-x-auto rounded-full border border-slate-300 bg-white p-1 shadow-[0_10px_24px_rgba(15,23,42,0.1)]">
                    <button
                      type="button"
                      onClick={() => setActiveAdminSection("requests")}
                      className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${
                        activeAdminSection === "requests"
                          ? "bg-[linear-gradient(135deg,#0f766e_0%,#16a34a_100%)] !text-white shadow-[0_8px_18px_rgba(5,150,105,0.34)]"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      }`}
                    >
                      Žádosti
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveAdminSection("createUser")}
                      className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${
                        activeAdminSection === "createUser"
                          ? "bg-[linear-gradient(135deg,#0f766e_0%,#16a34a_100%)] !text-white shadow-[0_8px_18px_rgba(5,150,105,0.34)]"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      }`}
                    >
                      Přidat uživatele
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveAdminSection("users")}
                      className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${
                        activeAdminSection === "users"
                          ? "bg-[linear-gradient(135deg,#0f766e_0%,#16a34a_100%)] !text-white shadow-[0_8px_18px_rgba(5,150,105,0.34)]"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      }`}
                    >
                      Uživatelé
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveAdminSection("subscriptions")}
                      className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${
                        activeAdminSection === "subscriptions"
                          ? "bg-[linear-gradient(135deg,#0f766e_0%,#16a34a_100%)] !text-white shadow-[0_8px_18px_rgba(5,150,105,0.34)]"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      }`}
                    >
                      Předplatné
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveAdminSection("security")}
                      className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${
                        activeAdminSection === "security"
                          ? "bg-[linear-gradient(135deg,#0f766e_0%,#16a34a_100%)] !text-white shadow-[0_8px_18px_rgba(5,150,105,0.34)]"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      }`}
                    >
                      Zabezpečení
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
            {isAllowedAdmin && activeAdminSection === "requests" ? (
              <button
                type="button"
                onClick={() => void refreshAllRequests()}
                disabled={loading || userRequestsLoading}
                className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCcw size={15} strokeWidth={2.2} aria-hidden="true" />
                Obnovit
              </button>
            ) : null}
          </div>

          {!isAllowedAdmin ? (
            <div className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              Tato sekce je dostupná pouze pro {ADMIN_PANEL_EMAILS_LABEL}.
            </div>
          ) : (
            <>
              {activeAdminSection === "requests" ? (
                <div className="grid items-start gap-5 xl:grid-cols-[260px_minmax(0,1fr)]">
                  <aside className="space-y-2 xl:sticky xl:top-24">
                    <h2 className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">
                      Přehled
                    </h2>
                    <div className="space-y-2 rounded-2xl border border-slate-200 bg-white/90 p-2 shadow-sm">
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                          Celkem žádostí
                        </div>
                        <div className="mt-1 text-2xl font-bold text-slate-900">{totalRequestsCount}</div>
                      </div>
                      <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2.5">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700">
                          Čeká vyřízení
                        </div>
                        <div className="mt-1 text-2xl font-bold text-amber-900">{pendingUnifiedCount}</div>
                      </div>
                      <div className="rounded-xl border border-sky-200 bg-sky-50/70 px-3 py-2.5">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-700">
                          Ukončení spolupráce
                        </div>
                        <div className="mt-1 text-2xl font-bold text-sky-900">
                          {pendingEndCollaborationCount}
                        </div>
                      </div>
                      <div className="rounded-xl border border-rose-200 bg-rose-50/70 px-3 py-2.5">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-700">
                          Urgent po SLA
                        </div>
                        <div className="mt-1 text-2xl font-bold text-rose-900">{overdueUrgentCount}</div>
                      </div>
                    </div>
                  </aside>

                  <div className="min-w-0">
                  <h2 className="mb-2 inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">
                    Žádosti
                  </h2>
                  <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]">
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
                        className="w-full rounded-2xl border border-slate-300 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 shadow-[0_6px_16px_rgba(15,23,42,0.06)] outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10"
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
                        <Clock3 size={15} strokeWidth={2.2} aria-hidden="true" />
                        Čeká: <span className="font-semibold text-slate-900">{pendingUnifiedCount}</span>
                      </div>
                      <div className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700">
                        Vidíš:{" "}
                        <span className="font-semibold text-slate-900">
                          {filteredUnifiedRequests.length}
                        </span>
                      </div>
                    </div>
                  </div>

                  {actionMessage ? (
                    <div className="mb-3 rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
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
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-600">
                      <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1">
                        <RefreshCcw size={14} strokeWidth={2.2} className="animate-spin" />
                        Načítám žádosti...
                      </div>
                    </div>
                  ) : filteredUnifiedRequests.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-9 text-center text-sm text-slate-600">
                      <div className="mx-auto mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                        <Inbox size={18} strokeWidth={2.1} aria-hidden="true" />
                      </div>
                      <p className="font-medium text-slate-700">
                        {search.trim()
                          ? "Pro zadaný filtr nebyla nalezena žádná žádost."
                          : "V této chvíli tu nejsou žádné žádosti."}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                          Fronta žádostí
                        </p>
                        <span className="text-xs font-medium text-slate-500">
                          {filteredUnifiedRequests.length} položky v seznamu
                        </span>
                      </div>
                      <div className="space-y-3">
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
                              ? "bg-emerald-400"
                              : request.status === "rejected"
                                ? "bg-slate-300"
                                : request.status === "failed"
                                  ? "bg-rose-400"
                                  : request.status === "processing"
                                    ? "bg-sky-400"
                                    : "bg-amber-400";
                          return (
                            <article
                              key={item.id}
                              className="relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition hover:-translate-y-[1px] hover:shadow-[0_14px_28px_rgba(15,23,42,0.1)]"
                            >
                              <div className={`pointer-events-none absolute inset-x-0 top-0 h-1 ${toneBarClass}`} />
                              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                                <div className="space-y-1">
                                  <div className="inline-flex items-center gap-2 text-base font-semibold text-slate-900">
                                    <UserCheck2 size={16} strokeWidth={2.2} aria-hidden="true" />
                                    {request.targetName}
                                  </div>
                                  <div className="text-sm text-slate-600">{request.targetEmail}</div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                                    Ukončení spolupráce
                                  </span>
                                  <span
                                    className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${statusPillClass[request.status]}`}
                                  >
                                    {statusLabel[request.status]}
                                  </span>
                                </div>
                              </div>

                              <div className="grid gap-1 text-sm text-slate-700 sm:grid-cols-2 [&_span]:break-words">
                                <div>
                                  Žádá:{" "}
                                  <span className="font-medium text-slate-900">{request.requestedByEmail}</span>
                                </div>
                                <div>
                                  Převod na:{" "}
                                  <span className="font-medium text-slate-900">
                                    {request.successorEmail || "—"}
                                  </span>
                                </div>
                                <div>
                                  Smlouvy:{" "}
                                  <span className="font-medium text-slate-900">
                                    {request.transferableContracts}
                                  </span>
                                </div>
                                <div>
                                  Podřízení:{" "}
                                  <span className="font-medium text-slate-900">
                                    {request.directSubordinates}
                                  </span>
                                </div>
                                <div>
                                  Vytvořeno:{" "}
                                  <span className="font-medium text-slate-900">
                                    {formatDateTime(request.createdAtMs)}
                                  </span>
                                </div>
                                <div>
                                  Rozhodnuto:{" "}
                                  <span className="font-medium text-slate-900">
                                    {formatDateTime(request.decidedAtMs)}
                                  </span>
                                </div>
                                {waitInfo.waiting ? (
                                  <div>
                                    Čeká:{" "}
                                    <span className="font-medium text-slate-900">
                                      {waitInfo.elapsedLabel}
                                    </span>
                                  </div>
                                ) : null}
                              </div>

                              {request.failureReason ? (
                                <div className="mt-3 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                                  Chyba: {request.failureReason}
                                </div>
                              ) : null}
                              {request.decisionReason ? (
                                <div className="mt-3 rounded-xl border border-slate-300 bg-slate-100 px-3 py-2 text-xs text-slate-700">
                                  Důvod zamítnutí: {request.decisionReason}
                                </div>
                              ) : null}

                              <div className="mt-4 flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => void handleDecision(request.id, "approve")}
                                  disabled={!pending || busy}
                                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-700 bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <Check size={14} strokeWidth={2.3} aria-hidden="true" />
                                  Schválit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleDecision(request.id, "reject")}
                                  disabled={!pending || busy}
                                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-500 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <X size={14} strokeWidth={2.3} aria-hidden="true" />
                                  Odmítnout
                                </button>
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
                            ? "bg-emerald-400"
                            : request.status === "rejected"
                              ? "bg-slate-300"
                              : request.status === "needsInfo"
                                ? "bg-sky-400"
                                : "bg-amber-400";

                        return (
                          <article
                            key={item.id}
                            className={`relative w-full overflow-hidden rounded-2xl border bg-white px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition hover:-translate-y-[1px] hover:shadow-[0_14px_28px_rgba(15,23,42,0.1)] ${
                              slaInfo.isOverdueUrgent
                                ? "border-rose-300"
                                : "border-slate-200"
                            }`}
                          >
                            <div
                              className={`pointer-events-none absolute inset-x-0 top-0 h-1 ${userToneBarClass}`}
                            />
                            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                              <div className="space-y-1">
                                <div className="text-base font-semibold text-slate-900">
                                  {userRequestSubjectLabel[request.subject]}
                                </div>
                                <div className="text-sm text-slate-600">{request.requesterEmail}</div>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                                  Uživatelská žádost
                                </span>
                                <span
                                  className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${userRequestStatusPillClass[request.status]}`}
                                >
                                  {userRequestStatusLabel[request.status]}
                                </span>
                              </div>
                            </div>

                            <div className="grid gap-1 text-sm text-slate-700 sm:grid-cols-2 [&_span]:break-words">
                              <div>
                                Priorita:{" "}
                                <span className="font-medium text-slate-900">
                                  {userRequestPriorityLabel[request.priority]}
                                </span>
                              </div>
                              {slaInfo.waiting ? (
                                <div>
                                  Čeká:{" "}
                                  <span
                                    className={`font-medium ${
                                      slaInfo.isOverdueUrgent
                                        ? "text-rose-700"
                                        : "text-slate-900"
                                    }`}
                                  >
                                    {slaInfo.elapsedLabel} (SLA {slaInfo.slaLimitLabel})
                                  </span>
                                </div>
                              ) : null}
                              <div>
                                Firemní e-mail:{" "}
                                <span className="font-medium text-slate-900">
                                  {request.requestedCorporateEmail || "—"}
                                </span>
                              </div>
                              {request.requestedUserDraft?.fullName ? (
                                <div>
                                  Jméno:{" "}
                                  <span className="font-medium text-slate-900">
                                    {request.requestedUserDraft.fullName}
                                  </span>
                                </div>
                              ) : null}
                              {request.requestedUserDraft?.agencyNumber ? (
                                <div>
                                  Agenturní číslo:{" "}
                                  <span className="font-medium text-slate-900">
                                    {request.requestedUserDraft.agencyNumber}
                                  </span>
                                </div>
                              ) : null}
                              {request.subject === "userCreation" ? (
                                request.requestedUserDraft?.position ? (
                                  <div>
                                    Pozice:{" "}
                                    <span className="font-medium text-slate-900">
                                      {POSITIONS.find(
                                        (p) => p.id === request.requestedUserDraft?.position
                                      )?.label ?? request.requestedUserDraft.position}
                                    </span>
                                  </div>
                                ) : (
                                  <div>
                                    Kariéra:{" "}
                                    <span className="font-medium text-slate-900">
                                      doplní uživatel ve stepperu
                                    </span>
                                  </div>
                                )
                              ) : null}
                              <div>
                                Režim:{" "}
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
                                  Nadřízený:{" "}
                                  <span className="font-medium text-slate-900">
                                    {request.requestedUserDraft.managerEmail}
                                  </span>
                                </div>
                              ) : null}
                              <div>
                                Vytvořeno:{" "}
                                <span className="font-medium text-slate-900">
                                  {formatDateTime(request.createdAtMs)}
                                </span>
                              </div>
                              <div>
                                Rozhodnuto:{" "}
                                <span className="font-medium text-slate-900">
                                  {formatDateTime(request.decidedAtMs)}
                                </span>
                              </div>
                              {request.createdUserEmail ? (
                                <div>
                                  Vytvořený účet:{" "}
                                  <span className="font-medium text-slate-900">
                                    {request.createdUserEmail}
                                  </span>
                                </div>
                              ) : null}
                            </div>

                            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                              {request.message}
                            </div>

                            {pending ? (
                              <div className="mt-3 space-y-2">
                                {isUserCreation ? (
                                  <div className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">
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
                                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => handleGenerateRequestPassword(request.id)}
                                        className="inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-100"
                                        title="Vygenerovat heslo"
                                        aria-label="Vygenerovat heslo"
                                      >
                                        <RefreshCw size={14} strokeWidth={2.2} aria-hidden="true" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => void handleCopyRequestPassword(request.id)}
                                        disabled={!passwordDraft.trim()}
                                        className="inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
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
                                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500"
                                />
                                <div className="flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => void handleUserRequestDecision(request, "accepted")}
                                    disabled={busy}
                                    className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-700 bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    <Check size={14} strokeWidth={2.3} aria-hidden="true" />
                                    Akceptovat
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleUserRequestDecision(request, "rejected")}
                                    disabled={busy}
                                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-500 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
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
                                    className="inline-flex items-center gap-1.5 rounded-xl border border-sky-500 bg-white px-3 py-2 text-xs font-semibold text-sky-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    <RefreshCw size={14} strokeWidth={2.3} aria-hidden="true" />
                                    Vrátit k doplnění
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="mt-3 rounded-xl border border-slate-300 bg-slate-100 px-3 py-2 text-xs text-slate-700">
                                {request.status === "needsInfo"
                                  ? "Požadované doplnění: "
                                  : "Zpětná vazba: "}
                                {request.feedback?.trim() || "Bez zpětné vazby."}
                              </div>
                            )}
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

        {isAllowedAdmin && activeAdminSection === "createUser" ? (
          <section className="relative overflow-hidden rounded-[30px] border border-violet-300/25 bg-[linear-gradient(155deg,#1b1032_0%,#130b27_54%,#0c0b1b_100%)] px-4 py-4 !text-white shadow-[0_34px_90px_rgba(7,6,25,0.46),inset_0_1px_0_rgba(196,181,253,0.18)] sm:px-6 sm:py-5">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#7c3aed_0%,#a855f7_50%,#22c55e_100%)]" />
            <div className="relative mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-300/35 bg-white/[0.06] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] !text-violet-100">
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
              <div className="inline-flex shrink-0 items-center gap-2 rounded-2xl border border-emerald-300/25 bg-emerald-400/12 px-3 py-2 text-xs font-semibold !text-emerald-100">
                <BriefcaseBusiness size={15} strokeWidth={2.2} aria-hidden="true" />
                Kariéra ve stepperu
              </div>
            </div>

            <form
              className="relative grid gap-4 rounded-[24px] border border-white/14 bg-white/[0.055] p-4 shadow-[0_18px_44px_rgba(7,6,25,0.28)] md:grid-cols-2 xl:grid-cols-3"
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
                                ? "bg-[linear-gradient(120deg,#7c3aed_0%,#a855f7_58%,#22c55e_100%)] !text-white shadow-[0_10px_22px_rgba(124,58,237,0.28)]"
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

                  <div className="flex items-start gap-3 rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-4 py-3 text-sm leading-relaxed !text-emerald-50/88">
                    <BriefcaseBusiness className="mt-0.5 h-5 w-5 shrink-0 !text-emerald-100" strokeWidth={2.2} aria-hidden="true" />
                    <div>
                      <p className="font-semibold !text-white">Kariéra se nezadává při založení</p>
                      <p className="mt-0.5 !text-emerald-50/72">
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
                        ? "!text-emerald-100"
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
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-violet-300/25 bg-[linear-gradient(120deg,#7c3aed_0%,#a855f7_55%,#22c55e_100%)] px-5 py-2.5 text-sm font-semibold !text-white shadow-[0_14px_30px_rgba(124,58,237,0.34)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <UserPlus size={15} strokeWidth={2.2} aria-hidden="true" />
                  {createUserBusy ? "Vytvářím..." : "Vytvořit uživatele"}
                </button>
              </div>
            </form>
          </section>
        ) : null}

        {isAllowedAdmin && activeAdminSection === "users" ? (
          <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-[linear-gradient(170deg,#ffffff_0%,#f8fbff_55%,#eff5fb_100%)] px-5 py-5 shadow-[0_22px_46px_rgba(15,23,42,0.1)] sm:px-6">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#0b1220_0%,#173a71_55%,#2c61af_100%)]" />

            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <span className="mb-2 inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold tracking-wide text-sky-800">
                  Správa účtů
                </span>
                <h2 className="inline-flex items-center gap-1.5 text-base font-semibold text-slate-900 sm:text-lg">
                  <UserCheck2 size={15} strokeWidth={2.1} className="text-slate-600" aria-hidden="true" />
                  <span>Uživatelé</span>
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Uprav jméno a příjmení / název, agenturní číslo nebo smaž účet z Auth a profilů.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadAdminUsersRows()}
                disabled={adminUsersLoading}
                className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
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
              <div className="rounded-2xl border border-slate-300 bg-slate-100 px-3 py-3 shadow-[0_8px_18px_rgba(15,23,42,0.06)]">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                  Celkem
                </div>
                <div className="mt-2 text-2xl font-bold text-slate-900">{adminUsersStats.total}</div>
              </div>
              <div className="rounded-2xl border border-emerald-700 bg-emerald-600 px-3 py-3 shadow-[0_10px_22px_rgba(5,150,105,0.28)]">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-50">
                  Poradci
                </div>
                <div className="mt-2 text-2xl font-bold text-white">{adminUsersStats.advisors}</div>
              </div>
              <div className="rounded-2xl border border-violet-700 bg-violet-600 px-3 py-3 shadow-[0_10px_22px_rgba(124,58,237,0.26)]">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-50">
                  Tipaři
                </div>
                <div className="mt-2 text-2xl font-bold text-white">{adminUsersStats.tipsters}</div>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 shadow-[0_8px_18px_rgba(245,158,11,0.12)]">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-800">
                  Bez profilu
                </div>
                <div className="mt-2 text-2xl font-bold text-amber-900">{adminUsersStats.missingProfile}</div>
              </div>
              <div className="rounded-2xl border border-slate-300 bg-white px-3 py-3 shadow-[0_8px_18px_rgba(15,23,42,0.06)]">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                  Deaktivovaní
                </div>
                <div className="mt-2 text-2xl font-bold text-slate-900">{adminUsersStats.disabled}</div>
              </div>
            </div>

            <div className="mt-4 rounded-3xl border border-slate-200 bg-white/90 p-3 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
              <label className="relative block">
                <Search
                  size={14}
                  strokeWidth={2.1}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="search"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 shadow-[0_6px_14px_rgba(15,23,42,0.05)] outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10"
                  value={adminUsersSearch}
                  onChange={(event) => setAdminUsersSearch(event.target.value)}
                  placeholder="Hledat jméno, e-mail, agenturní číslo nebo nadřízeného..."
                />
              </label>

              {adminUsersStatus ? (
                <div
                  className={`mt-3 rounded-xl border px-3 py-2 text-sm ${
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
                <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {adminUsersError}
                </div>
              ) : null}
            </div>

            <div className="mt-4 space-y-3">
              {adminUsersLoading ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
                  Načítám uživatele…
                </div>
              ) : filteredAdminUsersRows.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-9 text-center text-sm text-slate-600">
                  Pro zadaný filtr nejsou žádní uživatelé.
                </div>
              ) : (
                filteredAdminUsersRows.map((row) => {
                  const editing = adminUsersEditingEmail === row.email;
                  const title = row.fullName || nameFromEmail(row.email);
                  const avatarInitial = (title.trim().charAt(0) || row.email.charAt(0)).toUpperCase();
                  const saving = adminUsersSavingEmail === row.email;
                  const isCurrentUser = normalizeEmail(currentUser?.email) === row.email;
                  const effectiveAccountType = editing ? adminUsersEditAccountType : row.accountType;
                  const accountTypeLabel = formatAccountTypeLabel(effectiveAccountType);
                  const positionLabel = formatPositionLabel(row.position);
                  const relationLabel =
                    effectiveAccountType === "tipster" ? "Příjemce tipů" : "Nadřízený";
                  const relationEmail =
                    effectiveAccountType === "tipster" ? row.tipRecipientEmail : row.managerEmail;
                  const relationDisplayName = relationEmail
                    ? adminUsersNameByEmail.get(normalizeEmail(relationEmail)) || relationEmail
                    : null;

                  return (
                    <article
                      key={row.uid || row.email}
                      className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)]"
                    >
                      <span className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#0f766e_0%,#2563eb_55%,#7c3aed_100%)]" />
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-sky-200 bg-sky-50 text-sm font-bold text-sky-700">
                            {avatarInitial}
                          </span>
                          <div className="min-w-0">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <span className="min-w-0 max-w-full truncate text-lg font-bold text-slate-900">
                                {title}
                              </span>
                              <span
                                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                                  effectiveAccountType === "tipster"
                                    ? "border-violet-200 bg-violet-50 text-violet-700"
                                    : effectiveAccountType === "advisor"
                                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
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
                            <div className="truncate text-sm text-slate-500">{row.email}</div>
                            {row.disabled || !row.profileExists ? (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                              {row.disabled ? (
                                <span className="rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                                  Deaktivovaný
                                </span>
                              ) : null}
                              {!row.profileExists ? (
                                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                                  Bez veřejného profilu
                                </span>
                              ) : null}
                              </div>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2 lg:justify-end">
                          {editing ? (
                            <>
                              <button
                                type="button"
                                onClick={() => void handleSaveAdminUser(row)}
                                disabled={saving}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-600 bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {saving ? (
                                  <Loader2 size={14} strokeWidth={2.2} className="animate-spin" aria-hidden="true" />
                                ) : (
                                  <Save size={14} strokeWidth={2.2} aria-hidden="true" />
                                )}
                                Uložit
                              </button>
                              <button
                                type="button"
                                onClick={handleCancelAdminUserEdit}
                                disabled={saving}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <X size={14} strokeWidth={2.2} aria-hidden="true" />
                                Zrušit
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => handleStartAdminUserEdit(row)}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                              >
                                <Pencil size={14} strokeWidth={2.2} aria-hidden="true" />
                                Upravit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenAdminUserDelete(row)}
                                disabled={isCurrentUser}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                                title={isCurrentUser ? "Vlastní účet nejde smazat." : undefined}
                              >
                                <Trash2 size={14} strokeWidth={2.2} aria-hidden="true" />
                                Smazat
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <label className="space-y-1.5">
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                            <IdCard size={11} strokeWidth={2.2} aria-hidden="true" />
                            Agenturní číslo
                          </span>
                          {editing ? (
                            <input
                              type="text"
                              value={adminUsersEditAgencyNumber}
                              onChange={(event) => setAdminUsersEditAgencyNumber(event.target.value)}
                              className={fieldClass}
                              placeholder="Volitelné"
                              maxLength={NEW_USER_AGENCY_NUMBER_MAX_LEN}
                            />
                          ) : (
                            <div className="min-h-[42px] rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-900">
                              {row.agencyNumber || "—"}
                            </div>
                          )}
                        </label>

                        <label className="space-y-1.5">
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                            <UserPlus size={11} strokeWidth={2.2} aria-hidden="true" />
                            Typ účtu
                          </span>
                          {editing ? (
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
                          ) : (
                            <div className="min-h-[42px] rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-900">
                              {accountTypeLabel}
                            </div>
                          )}
                        </label>

                        <div className="space-y-1.5">
                          <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                            {relationLabel}
                          </span>
                          <div className="min-h-[42px] truncate rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-900">
                            {relationDisplayName || "—"}
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                            Vytvořen / přihlášení
                          </span>
                          <div className="min-h-[42px] rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-900">
                            <div>{formatAuthDateTime(row.createdAt)}</div>
                            <div className="mt-0.5 text-slate-500">{formatAuthDateTime(row.lastSignInAt)}</div>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>
        ) : null}

        {isAllowedAdmin && activeAdminSection === "subscriptions" ? (
          <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-[linear-gradient(170deg,#ffffff_0%,#f8fbff_55%,#eff5fb_100%)] px-5 py-5 shadow-[0_22px_46px_rgba(15,23,42,0.1)] sm:px-6">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#0b1220_0%,#173a71_55%,#2c61af_100%)]" />
            <div className="mb-4">
              <span className="mb-2 inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold tracking-wide text-amber-800">
                Fakturace
              </span>
              <h2 className="inline-flex items-center gap-1.5 text-base font-semibold text-slate-900 sm:text-lg">
                <Landmark size={14} strokeWidth={2} className="text-slate-600" aria-hidden="true" />
                <span>Správa předplatného</span>
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Přidej platbu nebo nastav neomezený tarif, zkontroluj historii a případně účet označ jako nezaplacený.
              </p>
            </div>

            <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
              <aside className="relative overflow-hidden rounded-3xl border border-slate-200 bg-[linear-gradient(160deg,#ffffff_0%,#f8fbff_52%,#eef4ff_100%)] p-3 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
                <span className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#0b1220_0%,#173a71_55%,#2c61af_100%)]" />
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                    <Inbox size={14} strokeWidth={2.1} className="text-slate-500" aria-hidden="true" />
                    Adresář předplatného
                  </h3>
                  <button
                    type="button"
                    onClick={() => void loadSubscriptionDirectory()}
                    disabled={subscriptionDirectoryLoading}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RefreshCw size={13} strokeWidth={2.2} aria-hidden="true" />
                    Obnovit
                  </button>
                </div>

                <div className="mb-3 grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-slate-300 bg-slate-100 px-2.5 py-2 shadow-[0_6px_14px_rgba(15,23,42,0.08)]">
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                        Celkem
                      </div>
                      <Inbox size={14} strokeWidth={2.1} className="text-slate-500" aria-hidden="true" />
                    </div>
                    <div className="mt-1.5 text-xl font-bold text-slate-900">{subscriptionDirectoryStats.total}</div>
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
                  <div className="rounded-xl border border-emerald-700 bg-emerald-600 px-2.5 py-2 shadow-[0_8px_18px_rgba(5,150,105,0.32)]">
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-50">
                        Aktivní
                      </div>
                      <Check size={14} strokeWidth={2.4} className="text-emerald-50" aria-hidden="true" />
                    </div>
                    <div className="mt-1.5 text-xl font-bold text-white">{subscriptionDirectoryStats.active}</div>
                  </div>
                </div>

                <div
                  className="mb-3 inline-flex w-full rounded-2xl border border-slate-300 bg-white/80 p-1 shadow-[0_6px_14px_rgba(15,23,42,0.05)]"
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
                            ? "border border-emerald-600 bg-[linear-gradient(135deg,#0f766e_0%,#16a34a_100%)] text-white shadow-[0_10px_18px_rgba(5,150,105,0.28)]"
                            : "border border-transparent text-slate-600 hover:text-slate-900"
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
                    className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 shadow-[0_6px_14px_rgba(15,23,42,0.05)] outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10"
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
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-5 text-center text-xs text-slate-600">
                      Načítám seznam uživatelů…
                    </div>
                  ) : filteredSubscriptionDirectoryRows.length === 0 ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-5 text-center text-xs text-slate-600">
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
                              ? "border-slate-900 bg-slate-50 text-slate-900 shadow-[0_10px_24px_rgba(15,23,42,0.1)]"
                              : "border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50"
                          }`}
                        >
                          {selected ? (
                            <span className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-emerald-400" />
                          ) : null}
                          <div className="flex items-start gap-2">
                            <span
                              className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                                selected
                                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                                  : "border-slate-300 bg-slate-100 text-slate-700"
                              }`}
                            >
                              {avatarInitial}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-semibold">{title}</div>
                              <div
                                className={`truncate text-xs ${
                                  selected ? "text-slate-600" : "text-slate-500"
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
                <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
                  <span className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-slate-900" />
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.2em] text-slate-500">
                        <UserCheck2 size={12} strokeWidth={2.2} aria-hidden="true" />
                        Detail
                      </div>
                      <div className="mt-1 text-2xl font-bold leading-tight text-slate-900 sm:text-3xl">
                        {subscriptionData?.user?.fullName ||
                          subscriptionData?.user?.email ||
                          (subscriptionLookupEmail ? nameFromEmail(subscriptionLookupEmail) : "Vyber uživatele")}
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
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
                      <span className="rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                        Bez výběru
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid gap-3 rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="space-y-1.5">
                    <label className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700">
                      <Landmark size={12} strokeWidth={2.2} className="text-slate-500" aria-hidden="true" />
                      Tarif
                    </label>
                    <select
                      className={fieldClass}
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
                    <label className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700">
                      <Clock3 size={12} strokeWidth={2.2} className="text-slate-500" aria-hidden="true" />
                      Začátek období (volitelné)
                    </label>
                    <input
                      type="date"
                      className={fieldClass}
                      value={subscriptionFromDraft}
                      onChange={(event) => setSubscriptionFromDraft(event.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5 lg:col-span-2">
                    <label className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700">
                      <Copy size={12} strokeWidth={2.2} className="text-slate-500" aria-hidden="true" />
                      Poznámka
                    </label>
                    <input
                      type="text"
                      className={fieldClass}
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
                      className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-emerald-500/80 bg-[linear-gradient(135deg,#34d399_0%,#059669_100%)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_26px_rgba(5,150,105,0.28)] transition hover:-translate-y-0.5 hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
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
                          ? "text-emerald-700"
                          : subscriptionLookupStatus.type === "info"
                            ? "text-slate-700"
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
                <div className="rounded-3xl border border-slate-200 bg-slate-50/50 p-3 shadow-[0_6px_16px_rgba(15,23,42,0.05)]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {subscriptionData.user?.fullName || subscriptionData.user?.email || "Uživatel"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {subscriptionData.user?.email || "—"}
                      </p>
                    </div>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                        subscriptionData.subscription.effectiveState === "active"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
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
                  <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-700 sm:grid-cols-3">
                    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
                      <div className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-slate-500">
                        <Landmark size={11} strokeWidth={2.2} aria-hidden="true" />
                        Tarif
                      </div>
                      <div className="mt-1 font-semibold text-slate-900">
                        {subscriptionData.subscription.plan &&
                        subscriptionData.subscription.plan in SUBSCRIPTION_PLAN_LABELS
                          ? SUBSCRIPTION_PLAN_LABELS[
                              subscriptionData.subscription.plan as SubscriptionPlanValue
                            ]
                          : "—"}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
                      <div className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-slate-500">
                        <Clock3 size={11} strokeWidth={2.2} aria-hidden="true" />
                        Od
                      </div>
                      <div className="mt-1 font-semibold text-slate-900">
                        {formatIsoDay(subscriptionData.subscription.paidFrom)}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
                      <div className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-slate-500">
                        <Clock3 size={11} strokeWidth={2.2} aria-hidden="true" />
                        Do
                      </div>
                      <div className="mt-1 font-semibold text-slate-900">
                        {subscriptionData.subscription.plan === "unlimited"
                          ? "Neomezeně"
                          : formatIsoDay(subscriptionData.subscription.paidUntil)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-3 shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
                  <span className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#0b1220_0%,#173a71_55%,#2c61af_100%)]" />
                  <h3 className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                    <RefreshCcw size={14} strokeWidth={2.1} className="text-slate-600" aria-hidden="true" />
                    Historie plateb
                  </h3>
                  {(subscriptionData.payments ?? []).length === 0 ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                      Zatím bez plateb.
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
                          {(subscriptionData.payments ?? []).map((payment) => (
                            <tr key={payment.id} className="border-b border-slate-100 align-top">
                              <td className="px-2 py-2 font-semibold text-slate-900">
                                {payment.plan in SUBSCRIPTION_PLAN_LABELS
                                  ? SUBSCRIPTION_PLAN_LABELS[payment.plan as SubscriptionPlanValue]
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
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        {isAllowedAdmin && activeAdminSection === "security" ? (
          <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-[linear-gradient(170deg,#ffffff_0%,#f8fbff_55%,#eff5fb_100%)] px-5 py-5 shadow-[0_22px_46px_rgba(15,23,42,0.1)] sm:px-6">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#0b1220_0%,#173a71_55%,#2c61af_100%)]" />

            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <span className="mb-2 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold tracking-wide text-emerald-800">
                  Zabezpečení
                </span>
                <h2 className="inline-flex items-center gap-1.5 text-base font-semibold text-slate-900 sm:text-lg">
                  <ShieldCheck size={14} strokeWidth={2} className="text-slate-600" aria-hidden="true" />
                  <span>2FA přehled uživatelů</span>
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Přehled čte aktivní druhé faktory přímo z Firebase Auth.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadSecurityRows()}
                disabled={securityLoading}
                className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw size={15} strokeWidth={2.2} aria-hidden="true" />
                Obnovit
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-slate-300 bg-slate-100 px-3 py-3 shadow-[0_8px_18px_rgba(15,23,42,0.06)]">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                    Celkem
                  </div>
                  <Inbox size={15} strokeWidth={2.1} className="text-slate-500" aria-hidden="true" />
                </div>
                <div className="mt-2 text-2xl font-bold text-slate-900">{securityStats.total}</div>
              </div>
              <div className="rounded-2xl border border-emerald-700 bg-emerald-600 px-3 py-3 shadow-[0_10px_22px_rgba(5,150,105,0.28)]">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-50">
                    2FA aktivní
                  </div>
                  <ShieldCheck size={15} strokeWidth={2.2} className="text-emerald-50" aria-hidden="true" />
                </div>
                <div className="mt-2 text-2xl font-bold text-white">{securityStats.mfaEnabled}</div>
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
              <div className="rounded-2xl border border-sky-200 bg-sky-50 px-3 py-3 shadow-[0_8px_18px_rgba(14,165,233,0.12)]">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-800">
                    Ověřený e-mail
                  </div>
                  <Check size={15} strokeWidth={2.3} className="text-sky-700" aria-hidden="true" />
                </div>
                <div className="mt-2 text-2xl font-bold text-slate-900">{securityStats.emailVerified}</div>
              </div>
            </div>

            <div className="mt-4 rounded-3xl border border-slate-200 bg-white/90 p-3 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div
                  className="inline-flex w-full rounded-2xl border border-slate-300 bg-white/80 p-1 shadow-[0_6px_14px_rgba(15,23,42,0.05)] lg:w-auto"
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
                            ? "border border-emerald-600 bg-[linear-gradient(135deg,#0f766e_0%,#16a34a_100%)] text-white shadow-[0_10px_18px_rgba(5,150,105,0.28)]"
                            : "border border-transparent text-slate-600 hover:text-slate-900"
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
                    className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 shadow-[0_6px_14px_rgba(15,23,42,0.05)] outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10"
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
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
                  Načítám zabezpečení uživatelů…
                </div>
              ) : filteredSecurityRows.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
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
                      className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)]"
                    >
                      <span
                        className={`pointer-events-none absolute inset-x-0 top-0 h-1 ${
                          mfaEnabled ? "bg-emerald-500" : "bg-rose-500"
                        }`}
                      />
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                          <span
                            className={`mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm font-bold ${
                              mfaEnabled
                                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                                : "border-rose-200 bg-rose-50 text-rose-700"
                            }`}
                          >
                            {avatarInitial}
                          </span>
                          <div className="min-w-0">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <span className="min-w-0 max-w-full truncate text-lg font-bold text-slate-900">
                                {title}
                              </span>
                              <span
                                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                                  row.accountType === "tipster"
                                    ? "border-violet-200 bg-violet-50 text-violet-700"
                                    : row.accountType === "advisor"
                                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
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
                            <div className="truncate text-sm text-slate-500">{row.email}</div>
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
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
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

                      <div className="mt-4 grid gap-2 text-xs text-slate-700 sm:grid-cols-3">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                            Vytvořen
                          </div>
                          <div className="mt-1 font-semibold text-slate-900">
                            {formatAuthDateTime(row.createdAt)}
                          </div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                            Poslední přihlášení
                          </div>
                          <div className="mt-1 font-semibold text-slate-900">
                            {formatAuthDateTime(row.lastSignInAt)}
                          </div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                            Druhé faktory
                          </div>
                          <div className="mt-1 font-semibold text-slate-900">
                            {row.mfa.factorCount > 0 ? `${row.mfa.factorCount} aktivní` : "Žádný"}
                          </div>
                        </div>
                      </div>

                      {row.mfa.factors.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {row.mfa.factors.map((factor) => (
                            <span
                              key={factor.uid}
                              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
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

        {!isAllowedAdmin && authReady ? (
          <div className="inline-flex items-start gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <ShieldAlert size={16} strokeWidth={2.2} aria-hidden="true" className="mt-0.5" />
            Pro schvalování žádostí je nutné přihlášení pod administrátorským účtem.
          </div>
        ) : null}
      </div>
    </AppLayout>
  );
}
