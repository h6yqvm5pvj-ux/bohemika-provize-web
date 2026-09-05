"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
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
  Mail,
  Pencil,
  PhoneCall,
  QrCode,
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
  UserRound,
  X,
  Zap,
} from "lucide-react";
import { onAuthStateChanged, type User } from "firebase/auth";
import Image from "next/image";

import adminStyles from "./adminConsole.module.css";

import { AppLayout } from "@/components/AppLayout";
import { auth } from "@/app/firebase";
import { setAdminImpersonationState } from "@/app/lib/adminImpersonation";
import {
  fetchAuthedBlobOrThrow,
  fetchAuthedJsonOrThrow,
} from "@/app/lib/authenticatedApi";
import type { CommissionMode, Position } from "@/app/types/domain";
import {
  adminRoleAtLeast,
  canCreateUserAccounts,
  resolveAdminRoleFromClaims,
  type AdminRole,
} from "@/lib/adminAccess";
import { AdminSecuritySection } from "./components/AdminSecuritySection";
import { AdminNavigation, type AdminSection } from "./components/AdminNavigation";
import { AdminBroadcastSection } from "./components/AdminBroadcastSection";
import { AdminSubscriptionsSection } from "./components/AdminSubscriptionsSection";
import {
  ADMIN_POSITIONS as POSITIONS,
  formatAccountTypeLabel,
  formatAuthDateTime,
  formatDateTime,
  formatIsoDay,
  formatPositionLabel,
  nameFromEmail,
} from "./adminFormatters";
import { getMfaFactorLabel } from "./adminSecurity";
import { useAdminSecurity } from "./useAdminSecurity";
import { useAdminBroadcast } from "./useAdminBroadcast";
import { useAdminSubscriptions } from "./useAdminSubscriptions";
import type { AdminUsersResponse, AdminUsersRow } from "./adminUsers";

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

type UserRequestSubject = "userCreation" | "problem" | "other";
type UserRequestPriority = "normal" | "urgent";
type UserRequestStatus = "pending" | "needsInfo" | "accepted" | "rejected";

type UserCreationRequestDraft = {
  fullName: string | null;
  agencyNumber: string | null;
  managerEmail: string | null;
  position: Position | null;
  commissionMode: CommissionMode;
};

type UserRequestScreenshotPayload = {
  kind: "userRequestScreenshot";
  id: string;
  hasFile: true;
  originalName: string;
  contentType: "image/png" | "image/jpeg";
  sizeBytes: number;
  sha256: string;
  uploadedAtMs: number;
  uploadedBy: string;
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
  screenshots: UserRequestScreenshotPayload[];
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

type ContractTransferRequestStatus =
  | "pending"
  | "scheduled"
  | "approved"
  | "rejected";

type ContractTransferRequestPayload = {
  id: string;
  status: ContractTransferRequestStatus;
  requestedByEmail: string;
  requestedByActorEmail: string;
  toOwnerEmail: string;
  toOwnerName: string | null;
  effectiveDate: string | null;
  entries: Array<{ ownerEmail: string; entryId: string }>;
  contractCount: number;
  resolvedEntryCount: number;
  contractSummaries: Array<{
    ownerEmail?: string;
    entryId?: string;
    contractNumber?: string | null;
    clientName?: string | null;
    productKey?: string | null;
  }>;
  createdAtMs: number;
  updatedAtMs: number;
  decidedAtMs: number | null;
  completedAtMs: number | null;
  decidedByEmail: string | null;
  decisionReason: string | null;
  failureReason: string | null;
  summary: {
    toOwnerEmail?: string;
    transferredContracts?: number;
    transferredEntries?: number;
    transferredAtMs?: number;
  } | null;
};

type ContractTransferRequestsApiSuccess = {
  ok?: boolean;
  requests?: ContractTransferRequestPayload[];
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
    }
  | {
      kind: "contractTransfer";
      id: string;
      createdAtMs: number;
      activityAtMs: number;
      searchable: string;
      pending: boolean;
      request: ContractTransferRequestPayload;
    };

const normalizeEmail = (value: string | null | undefined): string =>
  (value ?? "").trim().toLowerCase();

const normalizeSearchText = (value: string | null | undefined): string =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

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
  problem: "Nahlásit problém",
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

const contractTransferStatusPillClass: Record<
  ContractTransferRequestStatus,
  string
> = {
  pending: "border-amber-300 bg-amber-50 text-amber-800",
  scheduled: "border-sky-300 bg-sky-50 text-sky-800",
  approved: "border-violet-300 bg-violet-50 text-violet-800",
  rejected: "border-slate-300 bg-slate-100 text-slate-700",
};

const contractTransferStatusLabel: Record<
  ContractTransferRequestStatus,
  string
> = {
  pending: "Čeká na schválení",
  scheduled: "Schváleno · naplánováno",
  approved: "Převedeno",
  rejected: "Odmítnuto",
};

const COMMISSION_MODES: { id: CommissionMode; label: string }[] = [
  { id: "accelerated", label: "Zrychlený" },
  { id: "standard", label: "Běžný" },
];

const ONLINE_CARD_PUBLIC_BASE_URL = "https://bohemka.app";

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

type UserDirectorySuggestion = {
  email: string;
  name: string;
  managerEmail: string | null;
  accountType: "advisor" | "tipster";
};

type UserDirectorySearchResponse = {
  ok: true;
  users: UserDirectorySuggestion[];
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
type AdminUsersAccountFilter = "all" | "advisor" | "tipster";

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
  const [contractTransferRequests, setContractTransferRequests] = useState<
    ContractTransferRequestPayload[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [userRequestsLoading, setUserRequestsLoading] = useState(true);
  const [contractTransferRequestsLoading, setContractTransferRequestsLoading] =
    useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userRequestsError, setUserRequestsError] = useState<string | null>(null);
  const [contractTransferRequestsError, setContractTransferRequestsError] =
    useState<string | null>(null);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [busyUserRequestId, setBusyUserRequestId] = useState<string | null>(null);
  const [busyContractTransferRequestId, setBusyContractTransferRequestId] =
    useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [requestQueueView, setRequestQueueView] = useState<"pending" | "resolved">("pending");
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
  const [newUserManagerQuery, setNewUserManagerQuery] = useState("");
  const [newUserManagerSuggestions, setNewUserManagerSuggestions] = useState<
    UserDirectorySuggestion[]
  >([]);
  const [newUserManagerSearchLoading, setNewUserManagerSearchLoading] = useState(false);
  const [newUserManagerSearchError, setNewUserManagerSearchError] = useState<string | null>(null);
  const [newUserManagerSuggestionsOpen, setNewUserManagerSuggestionsOpen] = useState(false);
  const [newUserMode, setNewUserMode] = useState<CommissionMode>("standard");
  const [newUserAccountType, setNewUserAccountType] =
    useState<NewUserAccountType>("advisor");
  const [createUserBusy, setCreateUserBusy] = useState(false);
  const [createUserStatus, setCreateUserStatus] = useState<InlineStatus | null>(null);
  const [showCreateUserCelebration, setShowCreateUserCelebration] = useState(false);
  const [createUserCelebrationKey, setCreateUserCelebrationKey] = useState(0);
  const [activeAdminSection, setActiveAdminSection] = useState<AdminSection>("requests");
  const [adminUsersRows, setAdminUsersRows] = useState<AdminUsersRow[]>([]);
  const [adminUsersLoading, setAdminUsersLoading] = useState(false);
  const [adminUsersError, setAdminUsersError] = useState<string | null>(null);
  const [adminUsersStatus, setAdminUsersStatus] = useState<InlineStatus | null>(null);
  const [adminUsersSearch, setAdminUsersSearch] = useState("");
  const [adminUsersAccountFilter, setAdminUsersAccountFilter] =
    useState<AdminUsersAccountFilter>("all");
  const [adminUsersSelectedEmail, setAdminUsersSelectedEmail] = useState<string | null>(null);
  const [adminUsersEditingEmail, setAdminUsersEditingEmail] = useState<string | null>(null);
  const [adminUsersEditFullName, setAdminUsersEditFullName] = useState("");
  const [adminUsersEditAgencyNumber, setAdminUsersEditAgencyNumber] = useState("");
  const [adminUsersEditIco, setAdminUsersEditIco] = useState("");
  const [adminUsersEditPhoneNumber, setAdminUsersEditPhoneNumber] = useState("");
  const [adminUsersEditAccountType, setAdminUsersEditAccountType] =
    useState<AdminUsersAccountTypeDraft>("");
  const [adminUsersEditSpecialist, setAdminUsersEditSpecialist] = useState(false);
  const [adminUsersSavingEmail, setAdminUsersSavingEmail] = useState<string | null>(null);
  const [adminUsersOnlineCardSavingEmail, setAdminUsersOnlineCardSavingEmail] =
    useState<string | null>(null);
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
  const [requestsNowMs, setRequestsNowMs] = useState(() => Date.now());
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null);
  const [canCreateUsers, setCanCreateUsers] = useState(false);

  const isAllowedAdmin = adminRoleAtLeast(adminRole, "admin");
  const isOwnerAdmin = adminRoleAtLeast(adminRole, "owner");
  const canAccessAdminPanel = isAllowedAdmin || canCreateUsers;
  const adminSecurity = useAdminSecurity({
    active: activeAdminSection === "security",
    isAllowedAdmin,
  });
  const {
    rows: adminSecurityRows,
    refresh: refreshAdminSecurity,
  } = adminSecurity;
  const adminBroadcast = useAdminBroadcast({
    isAllowedAdmin,
    users: adminUsersRows,
    usersLoading: adminUsersLoading,
  });
  const adminSubscriptions = useAdminSubscriptions({
    active: activeAdminSection === "subscriptions",
    isOwnerAdmin,
  });

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
    const query = newUserManagerQuery.trim();
    if (!currentUser || newUserManagerEmail || query.length < 2) {
      setNewUserManagerSuggestions([]);
      setNewUserManagerSearchLoading(false);
      setNewUserManagerSearchError(null);
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      setNewUserManagerSearchLoading(true);
      setNewUserManagerSearchError(null);

      void fetchAuthedJsonOrThrow<UserDirectorySearchResponse>(
        currentUser,
        `/api/user/search?q=${encodeURIComponent(query)}&includeSelf=1`
      )
        .then((payload) => {
          if (cancelled) return;
          setNewUserManagerSuggestions(
            payload.users.filter((suggestion) => suggestion.accountType === "advisor")
          );
          setNewUserManagerSuggestionsOpen(true);
        })
        .catch((searchError) => {
          if (cancelled) return;
          setNewUserManagerSuggestions([]);
          setNewUserManagerSearchError(
            searchError instanceof Error
              ? searchError.message
              : "Návrhy nadřízených se nepodařilo načíst."
          );
          setNewUserManagerSuggestionsOpen(true);
        })
        .finally(() => {
          if (!cancelled) setNewUserManagerSearchLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [currentUser, newUserManagerEmail, newUserManagerQuery]);

  useEffect(() => {
    if (!showCreateUserCelebration) return;
    const timeoutId = window.setTimeout(() => {
      setShowCreateUserCelebration(false);
    }, CREATE_USER_CELEBRATION_MS);
    return () => window.clearTimeout(timeoutId);
  }, [createUserCelebrationKey, showCreateUserCelebration]);

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

  const loadContractTransferRequests = useCallback(async () => {
    const user = auth.currentUser;
    if (!user || !isAllowedAdmin) {
      setContractTransferRequests([]);
      setContractTransferRequestsLoading(false);
      return;
    }

    setContractTransferRequestsLoading(true);
    setContractTransferRequestsError(null);
    try {
      const payload =
        await fetchAuthedJsonOrThrow<ContractTransferRequestsApiSuccess>(
          user,
          "/api/contracts/transfer",
          { method: "GET" }
        );
      setContractTransferRequests(
        Array.isArray(payload.requests) ? payload.requests : []
      );
    } catch (err: any) {
      setContractTransferRequestsError(
        typeof err?.message === "string" && err.message.trim()
          ? err.message.trim()
          : "Nepodařilo se načíst žádosti o převod smluv."
      );
    } finally {
      setContractTransferRequestsLoading(false);
    }
  }, [isAllowedAdmin]);

  const refreshAllRequests = useCallback(async () => {
    await Promise.all([
      loadRequests(),
      loadUserRequests(),
      loadContractTransferRequests(),
    ]);
  }, [loadContractTransferRequests, loadRequests, loadUserRequests]);

  useEffect(() => {
    if (!authReady) return;
    if (!isAllowedAdmin) {
      setLoading(false);
      setUserRequestsLoading(false);
      setContractTransferRequestsLoading(false);
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

    const transferItems: UnifiedRequestItem[] = contractTransferRequests.map(
      (request) => ({
        kind: "contractTransfer",
        id: `contract-transfer-${request.id}`,
        createdAtMs: request.createdAtMs,
        activityAtMs: Math.max(
          request.updatedAtMs || 0,
          request.createdAtMs || 0
        ),
        searchable: [
          "prevod smlouvy",
          request.requestedByEmail,
          request.toOwnerName ?? "",
          request.toOwnerEmail,
          request.effectiveDate ?? "",
          ...request.contractSummaries.flatMap((summary) => [
            summary.clientName ?? "",
            summary.contractNumber ?? "",
            summary.ownerEmail ?? "",
          ]),
        ]
          .join(" ")
          .toLowerCase(),
        pending: request.status === "pending",
        request,
      })
    );

    const merged = [...endItems, ...userItems, ...transferItems].sort(
      (a, b) => b.activityAtMs - a.activityAtMs
    );
    if (!q) return merged;
    return merged.filter((item) => item.searchable.includes(q));
  }, [contractTransferRequests, requests, search, userRequests]);

  const totalRequestsCount =
    requests.length + userRequests.length + contractTransferRequests.length;

  const pendingUnifiedCount = useMemo(
    () =>
      requests.filter(
        (request) => request.status === "pending" || request.status === "processing"
      ).length +
      userRequests.filter((request) => request.status === "pending").length +
      contractTransferRequests.filter((request) => request.status === "pending").length,
    [contractTransferRequests, requests, userRequests]
  );

  const resolvedUnifiedCount = Math.max(0, totalRequestsCount - pendingUnifiedCount);

  const visibleUnifiedRequests = useMemo(
    () =>
      filteredUnifiedRequests.filter((item) =>
        requestQueueView === "pending" ? item.pending : !item.pending
      ),
    [filteredUnifiedRequests, requestQueueView]
  );

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

  const filteredAdminUsersRows = useMemo(() => {
    const query = normalizeSearchText(adminUsersSearch);

    return adminUsersRows.filter((row) => {
      if (adminUsersAccountFilter !== "all" && row.accountType !== adminUsersAccountFilter) {
        return false;
      }
      if (!query) return true;

      const searchableIdentity = [
        row.fullName || nameFromEmail(row.email),
        row.email,
        row.agencyNumber,
        row.ico,
        row.phoneNumber,
      ]
        .map((value) => normalizeSearchText(value))
        .filter(Boolean)
        .join(" ");

      return searchableIdentity.includes(query);
    });
  }, [adminUsersAccountFilter, adminUsersRows, adminUsersSearch]);

  const selectedAdminDirectoryUser =
    filteredAdminUsersRows.find((row) => row.email === adminUsersSelectedEmail) ??
    filteredAdminUsersRows[0] ??
    null;

  useEffect(() => {
    const nextEmail = selectedAdminDirectoryUser?.email ?? null;
    if (nextEmail !== adminUsersSelectedEmail) {
      setAdminUsersSelectedEmail(nextEmail);
    }
  }, [adminUsersSelectedEmail, selectedAdminDirectoryUser?.email]);

  useEffect(() => {
    if (!selectedAdminDirectoryUser) return;
    setAdminUsersEditFullName(selectedAdminDirectoryUser.fullName ?? "");
    setAdminUsersEditAgencyNumber(selectedAdminDirectoryUser.agencyNumber ?? "");
    setAdminUsersEditIco(normalizeIcoInput(selectedAdminDirectoryUser.ico ?? ""));
    setAdminUsersEditPhoneNumber(selectedAdminDirectoryUser.phoneNumber ?? "");
    setAdminUsersEditAccountType(
      selectedAdminDirectoryUser.accountType === "advisor" ||
        selectedAdminDirectoryUser.accountType === "tipster"
        ? selectedAdminDirectoryUser.accountType
        : ""
    );
    setAdminUsersEditSpecialist(selectedAdminDirectoryUser.specialist === true);
    setAdminUserSecurityConfirmKey(null);
  }, [selectedAdminDirectoryUser]);

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

  const handleContractTransferDecision = useCallback(
    async (request: ContractTransferRequestPayload, action: "approve" | "reject") => {
      const user = auth.currentUser;
      if (!user || !isAllowedAdmin) return;

      setBusyContractTransferRequestId(request.id);
      setContractTransferRequestsError(null);
      setActionMessage(null);
      try {
        const payload = await fetchAuthedJsonOrThrow<{
          ok?: boolean;
          scheduled?: boolean;
          error?: string;
        }>(user, "/api/contracts/transfer", {
          method: "PATCH",
          body: JSON.stringify({
            requestAction: action,
            requestId: request.id,
          }),
        });
        setActionMessage(
          action === "reject"
            ? "Žádost o převod smluv byla odmítnuta."
            : payload.scheduled
              ? `Žádost byla schválena. Převod se provede automaticky k ${formatIsoDay(
                  request.effectiveDate
                )}.`
              : "Žádost byla schválena a převod smluv byl proveden."
        );
        await loadContractTransferRequests();
      } catch (err: any) {
        setContractTransferRequestsError(
          typeof err?.message === "string" && err.message.trim()
            ? err.message.trim()
            : "Žádost o převod se nepodařilo vyřídit."
        );
      } finally {
        setBusyContractTransferRequestId(null);
      }
    },
    [isAllowedAdmin, loadContractTransferRequests]
  );

  const handleOpenUserRequestScreenshot = useCallback(
    async (
      request: UserRequestPayload,
      screenshot: UserRequestScreenshotPayload
    ) => {
      const user = auth.currentUser;
      if (!user || !isAllowedAdmin) return;
      const previewWindow = window.open("about:blank", "_blank");
      if (previewWindow) previewWindow.opener = null;
      try {
        const blob = await fetchAuthedBlobOrThrow(
          user,
          `/api/user-requests/attachment?requestId=${encodeURIComponent(
            request.id
          )}&screenshotId=${encodeURIComponent(screenshot.id)}`
        );
        const objectUrl = URL.createObjectURL(blob);
        if (previewWindow) {
          previewWindow.location.href = objectUrl;
        } else {
          const link = document.createElement("a");
          link.href = objectUrl;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.click();
        }
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      } catch (error) {
        previewWindow?.close();
        setUserRequestsError(
          error instanceof Error
            ? error.message
            : "Screenshot se nepodařilo otevřít."
        );
      }
    },
    [isAllowedAdmin]
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
    const managerQuery = newUserManagerQuery.trim();
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
    if (managerQuery && !managerEmail) {
      setCreateUserStatus({
        type: "error",
        message:
          newUserAccountType === "tipster"
            ? "Vyber příjemce tipů z nabídky uživatelů."
            : "Vyber nadřízeného z nabídky uživatelů, nebo pole nech prázdné.",
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
      setNewUserManagerEmail("");
      setNewUserManagerQuery("");
      setNewUserManagerSuggestions([]);
      setNewUserManagerSuggestionsOpen(false);
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
    newUserManagerQuery,
    newUserMode,
    newUserPassword,
  ]);

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

  const handleToggleAdminUserOnlineCard = useCallback(
    async (row: AdminUsersRow, enabled: boolean) => {
      const user = auth.currentUser;
      if (!user || !isAllowedAdmin) return;

      setAdminUsersOnlineCardSavingEmail(row.email);
      setAdminUsersStatus(null);
      setAdminUsersError(null);
      try {
        await fetchAuthedJsonOrThrow(user, "/api/admin/users", {
          method: "PATCH",
          body: JSON.stringify({
            email: row.email,
            fullName: row.fullName ?? "",
            agencyNumber: row.agencyNumber ?? "",
            ico: row.ico ?? "",
            phoneNumber: row.phoneNumber ?? "",
            accountType: row.accountType ?? "",
            specialist: row.specialist,
            onlineCardEnabled: enabled,
          }),
        });
        await loadAdminUsersRows();
        setAdminUsersStatus({
          type: "success",
          message: enabled
            ? `Online vizitka uživatele ${row.email} byla zapnuta.`
            : `Online vizitka uživatele ${row.email} byla vypnuta.`,
        });
      } catch (error) {
        setAdminUsersError(
          error instanceof Error
            ? error.message
            : "Stav online vizitky se nepodařilo změnit."
        );
      } finally {
        setAdminUsersOnlineCardSavingEmail(null);
      }
    },
    [isAllowedAdmin, loadAdminUsersRows]
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
        if (adminSecurityRows.length > 0 || activeAdminSection === "security") {
          await refreshAdminSecurity();
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
      adminSecurityRows.length,
      isAllowedAdmin,
      loadAdminUsersRows,
      refreshAdminSecurity,
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
    "w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 shadow-[0_6px_16px_rgba(15,23,42,0.04)] outline-none transition placeholder:text-slate-400 focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10 [caret-color:#7c3aed]";
  const createUserLabelClass =
    "text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600";
  const adminDarkSectionClass =
    "relative overflow-hidden rounded-[24px] border border-slate-200 bg-[radial-gradient(circle_at_100%_0%,rgba(237,233,254,0.78),transparent_25%),linear-gradient(180deg,#ffffff_0%,#faf9ff_100%)] px-4 py-4 text-slate-900 shadow-[0_20px_60px_rgba(76,29,149,0.09)] sm:rounded-[28px] sm:px-6 sm:py-5";
  const adminDarkTopBarClass =
    "pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#7c3aed_0%,#a855f7_50%,#c084fc_100%)]";
  const adminDarkBadgeClass =
    "mb-3 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700";
  const adminDarkPanelClass =
    "relative rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_12px_32px_rgba(15,23,42,0.06)]";
  const adminDarkSoftPanelClass =
    "rounded-[22px] border border-slate-200 bg-slate-50/80 p-4 shadow-[0_8px_22px_rgba(15,23,42,0.04)]";
  const adminDarkMetricClass =
    "rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-[0_8px_20px_rgba(15,23,42,0.05)]";
  const adminDarkSubtleButtonClass =
    "inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-800 disabled:cursor-not-allowed disabled:opacity-60";
  const adminDarkPrimaryButtonClass =
    "admin-on-violet inline-flex items-center justify-center gap-2 rounded-2xl border border-violet-300/25 bg-[linear-gradient(120deg,#7c3aed_0%,#a855f7_55%,#c084fc_100%)] px-5 py-2.5 text-sm font-semibold !text-white shadow-[0_14px_30px_rgba(124,58,237,0.34)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60";
  const subscriptionHistoryFieldClass =
    "h-9 w-full min-w-[116px] rounded-xl border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:cursor-not-allowed disabled:opacity-60";
  const subscriptionHistoryIconButtonClass =
    "inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-55";
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
      <div className={`${adminStyles.console} w-full max-w-[1200px] space-y-6 px-2 pb-8 sm:px-4`}>
        <section className={adminDarkSectionClass}>
          <div className={adminDarkTopBarClass} />

          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <span className={adminDarkBadgeClass}>
                Řídicí panel
              </span>
              <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
                Admin
              </h1>
            </div>
            {isAllowedAdmin && activeAdminSection === "requests" ? (
              <button
                type="button"
                onClick={() => void refreshAllRequests()}
                disabled={
                  loading || userRequestsLoading || contractTransferRequestsLoading
                }
                className={adminDarkSubtleButtonClass}
              >
                <RefreshCcw size={15} strokeWidth={2.2} aria-hidden="true" />
                Obnovit
              </button>
            ) : null}
          </div>

          {canAccessAdminPanel ? (
            <AdminNavigation
              activeSection={activeAdminSection}
              onSectionChange={setActiveAdminSection}
              isAllowedAdmin={isAllowedAdmin}
              canCreateUsers={canCreateUsers}
              isOwnerAdmin={isOwnerAdmin}
            />
          ) : null}

          {!canAccessAdminPanel ? (
            <div className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              Tato sekce je dostupná pouze pro účty s rolí owner, admin nebo accountCreator.
            </div>
          ) : (
            <>
              {isAllowedAdmin && activeAdminSection === "requests" ? (
                <div className="space-y-4">
                  <aside className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.25fr_repeat(4,minmax(0,1fr))]">
                    <div className="admin-on-violet overflow-hidden rounded-[24px] border border-violet-300/30 bg-[linear-gradient(145deg,#5b21b6_0%,#7c3aed_56%,#a855f7_100%)] p-4 text-white shadow-[0_22px_48px_rgba(109,40,217,0.28)]">
                      <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-100/80">
                        <Inbox size={13} strokeWidth={2.2} aria-hidden="true" />
                        Žádosti
                      </div>
                      <div className="mt-3 flex items-end justify-between gap-3">
                        <div>
                          <div className="text-4xl font-bold leading-none">{pendingUnifiedCount}</div>
                          <div className="mt-1 text-xs font-medium text-violet-100">čeká na akci</div>
                        </div>
                        <div className="rounded-full border border-white/20 bg-white/15 px-2.5 py-1 text-xs font-semibold text-white">
                          {pendingUnifiedCount}/{totalRequestsCount}
                        </div>
                      </div>
                    </div>
                    <div className="contents">
                      <div className={adminDarkMetricClass}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                            <Inbox size={13} strokeWidth={2.2} aria-hidden="true" />
                            Celkem
                          </span>
                          <span className="text-xl font-black text-slate-950">{totalRequestsCount}</span>
                        </div>
                      </div>
                      <div className={adminDarkMetricClass}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                            <Clock3 size={13} strokeWidth={2.2} aria-hidden="true" />
                            K vyřízení
                          </span>
                          <span className="text-xl font-black text-slate-950">{pendingUnifiedCount}</span>
                        </div>
                      </div>
                      <div className={adminDarkMetricClass}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                            <UserCheck2 size={13} strokeWidth={2.2} aria-hidden="true" />
                            Ukončení
                          </span>
                          <span className="text-xl font-black text-slate-950">{pendingEndCollaborationCount}</span>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3 shadow-[0_10px_24px_rgba(244,63,94,0.08)]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-700">
                            <AlertTriangle size={13} strokeWidth={2.2} aria-hidden="true" />
                            Po SLA
                          </span>
                          <span className="text-xl font-bold text-rose-900">{overdueUrgentCount}</span>
                        </div>
                      </div>
                    </div>
                  </aside>

                  <div className={`min-w-0 ${adminDarkPanelClass}`}>
                  <div className="mb-4 flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-700">
                        Pracovní fronta
                      </span>
                      <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950 sm:text-2xl">
                        Žádosti
                      </h2>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
                      <div className="inline-flex items-center justify-center gap-2 rounded-full border border-violet-200 bg-violet-600 px-3 py-2 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(124,58,237,0.24)]">
                        <Clock3 size={15} strokeWidth={2.2} aria-hidden="true" />
                        {pendingUnifiedCount} čeká
                      </div>
                      <div className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600">
                        {resolvedUnifiedCount} vyřízeno
                      </div>
                    </div>
                  </div>
                  <div className="mb-4 inline-flex w-full flex-col gap-1 rounded-2xl border border-slate-200 bg-slate-100 p-1 sm:w-auto sm:flex-row">
                    <button
                      type="button"
                      onClick={() => setRequestQueueView("pending")}
                      className={`inline-flex min-w-[170px] items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                        requestQueueView === "pending"
                          ? "bg-white text-slate-950 shadow-sm ring-1 ring-slate-200"
                          : "text-slate-500 hover:bg-white/70 hover:text-slate-900"
                      }`}
                    >
                      <Clock3 size={15} strokeWidth={2.2} aria-hidden="true" />
                      K vyřízení
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          requestQueueView === "pending"
                            ? "bg-violet-100 text-violet-700"
                            : "bg-slate-200 text-slate-600"
                        }`}
                      >
                        {pendingUnifiedCount}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRequestQueueView("resolved")}
                      className={`inline-flex min-w-[170px] items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                        requestQueueView === "resolved"
                          ? "bg-white text-slate-950 shadow-sm ring-1 ring-slate-200"
                          : "text-slate-500 hover:bg-white/70 hover:text-slate-900"
                      }`}
                    >
                      <CheckCircle2 size={15} strokeWidth={2.2} aria-hidden="true" />
                      Vyřízené
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          requestQueueView === "resolved"
                            ? "bg-violet-100 text-violet-700"
                            : "bg-slate-200 text-slate-600"
                        }`}
                      >
                        {resolvedUnifiedCount}
                      </span>
                    </button>
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
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                        SLA
                        <span className="ml-2 font-semibold text-slate-900">hlídané</span>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                        Řazení
                        <span className="ml-2 font-semibold text-slate-900">nejnovější</span>
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
                  {contractTransferRequestsError ? (
                    <div className="mb-3 rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                      {contractTransferRequestsError}
                    </div>
                  ) : null}

                  {loading || userRequestsLoading || contractTransferRequestsLoading ? (
                    <div className="rounded-2xl border border-white/14 bg-white/[0.05] px-4 py-8 text-center text-sm !text-violet-100/72">
                      <div className="inline-flex items-center gap-2 rounded-full bg-white/[0.08] px-3 py-1">
                        <RefreshCcw size={14} strokeWidth={2.2} className="animate-spin" />
                        Načítám žádosti...
                      </div>
                    </div>
                  ) : visibleUnifiedRequests.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/18 bg-white/[0.05] px-4 py-9 text-center text-sm !text-violet-100/72">
                      <div className="mx-auto mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.08] !text-violet-100">
                        <Inbox size={18} strokeWidth={2.1} aria-hidden="true" />
                      </div>
                      <p className="font-medium !text-violet-100">
                        {search.trim()
                          ? "Pro zadaný filtr nebyla nalezena žádná žádost."
                          : requestQueueView === "pending"
                            ? "Momentálně nejsou žádné žádosti k vyřízení."
                            : "Zatím nejsou žádné vyřízené žádosti."}
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-slate-50/70">
                      <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2.5">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">
                          {requestQueueView === "pending" ? "Fronta žádostí" : "Vyřízené žádosti"}
                        </p>
                        <span className="text-xs font-medium text-slate-500">
                          {visibleUnifiedRequests.length}{" "}
                          {visibleUnifiedRequests.length === 1 ? "položka" : "položek"} v seznamu
                        </span>
                      </div>
                      <div className="space-y-2 p-2">
                          {visibleUnifiedRequests.map((item) => {
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
                              className="relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_22px_rgba(15,23,42,0.05)] transition hover:border-violet-300 hover:shadow-[0_12px_28px_rgba(76,29,149,0.08)]"
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

                                <div className="grid gap-x-5 gap-y-2 border-t border-slate-100 pt-3 text-sm text-slate-600 sm:grid-cols-2 xl:grid-cols-3 [&_.font-medium]:!text-slate-900 [&_span]:break-words">
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

                        if (item.kind === "contractTransfer") {
                          const request = item.request;
                          const pending = request.status === "pending";
                          const canReject =
                            request.status === "pending" || request.status === "scheduled";
                          const busy = busyContractTransferRequestId === request.id;
                          const targetLabel =
                            request.toOwnerName || nameFromEmail(request.toOwnerEmail);
                          const toneBarClass =
                            request.status === "approved"
                              ? "bg-violet-500"
                              : request.status === "scheduled"
                                ? "bg-sky-400"
                                : request.status === "rejected"
                                  ? "bg-slate-300"
                                  : "bg-violet-500";
                          return (
                            <article
                              key={item.id}
                              className="relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_22px_rgba(15,23,42,0.05)] transition hover:border-violet-300 hover:shadow-[0_12px_28px_rgba(76,29,149,0.08)]"
                            >
                              <div
                                className={`pointer-events-none absolute inset-y-0 left-0 w-1.5 ${toneBarClass}`}
                              />
                              <div className="px-4 py-4">
                                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                                  <div className="min-w-0 space-y-1 pl-1">
                                    <div className="inline-flex max-w-full items-center gap-2 text-base font-semibold text-slate-950">
                                      <ArrowRightLeft size={16} strokeWidth={2.2} aria-hidden="true" />
                                      <span className="truncate">
                                        Převod {request.contractCount || request.entries.length}{" "}
                                        {request.contractCount === 1 ? "smlouvy" : "smluv"}
                                      </span>
                                    </div>
                                    <div className="truncate text-sm text-slate-500">
                                      na {targetLabel} · {request.toOwnerEmail}
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-800">
                                      Převod smluv
                                    </span>
                                    <span
                                      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${contractTransferStatusPillClass[request.status]}`}
                                    >
                                      {contractTransferStatusLabel[request.status]}
                                    </span>
                                  </div>
                                </div>

                                <div className="grid gap-x-5 gap-y-2 border-t border-slate-100 pt-3 text-sm text-slate-600 sm:grid-cols-2 xl:grid-cols-4">
                                  <div>
                                    <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-600">
                                      Žádá
                                    </span>
                                    <span className="font-medium text-slate-900">
                                      {request.requestedByEmail}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-600">
                                      Nový správce
                                    </span>
                                    <span className="font-medium text-slate-900">
                                      {targetLabel}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-600">
                                      Účinnost
                                    </span>
                                    <span className="font-medium text-slate-900">
                                      {formatIsoDay(request.effectiveDate)}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-600">
                                      Vytvořeno
                                    </span>
                                    <span className="font-medium text-slate-900">
                                      {formatDateTime(request.createdAtMs)}
                                    </span>
                                  </div>
                                </div>

                                {request.contractSummaries.length ? (
                                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                                    <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                      Smlouvy v žádosti
                                    </span>
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                      {request.contractSummaries.slice(0, 8).map((summary) => (
                                        <span
                                          key={`${summary.ownerEmail ?? ""}-${summary.entryId ?? ""}`}
                                          className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700"
                                        >
                                          {summary.clientName || "Klient neuveden"}
                                          {summary.contractNumber
                                            ? ` · ${summary.contractNumber}`
                                            : ""}
                                        </span>
                                      ))}
                                      {request.contractSummaries.length > 8 ? (
                                        <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600">
                                          +{request.contractSummaries.length - 8} dalších
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                ) : null}

                                {request.failureReason ? (
                                  <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                                    Poslední pokus: {request.failureReason}
                                  </div>
                                ) : null}

                                {canReject ? (
                                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-violet-50 pt-3">
                                    {pending ? (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          void handleContractTransferDecision(request, "approve")
                                        }
                                        disabled={busy}
                                        className="inline-flex items-center gap-1.5 rounded-full border border-violet-700 bg-violet-600 px-3 py-2 text-xs font-semibold text-white shadow-[0_10px_20px_rgba(124,58,237,0.22)] transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        <Check size={14} strokeWidth={2.3} aria-hidden="true" />
                                        {busy ? "Zpracovávám…" : "Schválit"}
                                      </button>
                                    ) : null}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void handleContractTransferDecision(request, "reject")
                                      }
                                      disabled={busy}
                                      className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-violet-800 transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      <X size={14} strokeWidth={2.3} aria-hidden="true" />
                                      {request.status === "scheduled"
                                        ? "Zrušit naplánovaný převod"
                                        : "Odmítnout"}
                                    </button>
                                  </div>
                                ) : null}
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
                            className={`relative w-full overflow-hidden rounded-2xl border bg-white shadow-[0_8px_22px_rgba(15,23,42,0.05)] transition hover:shadow-[0_12px_28px_rgba(76,29,149,0.08)] ${
                              slaInfo.isOverdueUrgent
                                ? "border-rose-300"
                                : "border-slate-200 hover:border-violet-300"
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

                            <div className="grid gap-x-5 gap-y-2 border-t border-slate-100 pt-3 text-sm text-slate-600 sm:grid-cols-2 xl:grid-cols-3 [&_.font-medium]:!text-slate-900 [&_span]:break-words">
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

                            {request.screenshots.length > 0 ? (
                              <div className="mt-3 rounded-xl border border-violet-100 bg-violet-50/70 px-3 py-3">
                                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-700">
                                  Přiložené screenshoty
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {request.screenshots.map((screenshot, index) => (
                                    <button
                                      key={screenshot.id}
                                      type="button"
                                      onClick={() =>
                                        void handleOpenUserRequestScreenshot(
                                          request,
                                          screenshot
                                        )
                                      }
                                      className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white px-3 py-1.5 text-xs font-semibold text-violet-800 transition hover:border-violet-300 hover:bg-violet-100"
                                    >
                                      <ExternalLink
                                        className="h-3.5 w-3.5"
                                        strokeWidth={2.2}
                                        aria-hidden="true"
                                      />
                                      Screenshot {index + 1}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ) : null}

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
                <div className="relative">
                  <Search
                    size={15}
                    strokeWidth={2.1}
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-[21px] z-10 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="text"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={newUserManagerSuggestionsOpen && !newUserManagerEmail}
                    aria-controls="new-user-manager-suggestions"
                    autoComplete="off"
                    className={`${createUserFieldClass} pl-9 pr-10`}
                    value={newUserManagerQuery}
                    onFocus={() => {
                      if (newUserManagerQuery.trim().length >= 2 && !newUserManagerEmail) {
                        setNewUserManagerSuggestionsOpen(true);
                      }
                    }}
                    onBlur={() => {
                      window.setTimeout(() => setNewUserManagerSuggestionsOpen(false), 120);
                    }}
                    onChange={(event) => {
                      setNewUserManagerQuery(event.target.value);
                      setNewUserManagerEmail("");
                      setNewUserManagerSuggestionsOpen(true);
                      setCreateUserStatus(null);
                    }}
                    placeholder={
                      newUserAccountType === "tipster"
                        ? "Hledat příjemce podle jména nebo e-mailu"
                        : "Hledat podle jména nebo e-mailu"
                    }
                  />
                  {newUserManagerSearchLoading ? (
                    <Loader2
                      size={16}
                      strokeWidth={2.1}
                      className="pointer-events-none absolute right-3 top-[21px] -translate-y-1/2 animate-spin text-violet-600"
                      aria-hidden="true"
                    />
                  ) : newUserManagerEmail ? (
                    <button
                      type="button"
                      onClick={() => {
                        setNewUserManagerEmail("");
                        setNewUserManagerQuery("");
                        setNewUserManagerSuggestions([]);
                        setNewUserManagerSuggestionsOpen(false);
                        setCreateUserStatus(null);
                      }}
                      className="absolute right-2 top-[21px] inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                      aria-label="Odebrat vybraného nadřízeného"
                      title="Odebrat výběr"
                    >
                      <X size={14} strokeWidth={2.2} aria-hidden="true" />
                    </button>
                  ) : null}

                  {newUserManagerSuggestionsOpen &&
                  !newUserManagerEmail &&
                  newUserManagerQuery.trim().length >= 2 ? (
                    <div
                      id="new-user-manager-suggestions"
                      role="listbox"
                      className="absolute inset-x-0 top-[calc(100%+8px)] z-40 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_18px_44px_rgba(15,23,42,0.16)]"
                    >
                      {newUserManagerSearchLoading ? (
                        <div className="flex items-center gap-2 px-3 py-3 text-sm text-slate-500">
                          <Loader2 size={15} className="animate-spin" aria-hidden="true" />
                          Hledám shody…
                        </div>
                      ) : newUserManagerSearchError ? (
                        <div className="px-3 py-3 text-sm text-rose-700">
                          {newUserManagerSearchError}
                        </div>
                      ) : newUserManagerSuggestions.length === 0 ? (
                        <div className="px-3 py-3 text-sm text-slate-500">
                          V systému nebyla nalezena žádná shoda.
                        </div>
                      ) : (
                        <div className="max-h-60 overflow-y-auto">
                          {newUserManagerSuggestions.map((suggestion) => (
                            <button
                              key={suggestion.email}
                              type="button"
                              role="option"
                              aria-selected={false}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => {
                                setNewUserManagerEmail(suggestion.email);
                                setNewUserManagerQuery(suggestion.name || suggestion.email);
                                setNewUserManagerSuggestionsOpen(false);
                                setNewUserManagerSuggestions([]);
                                setNewUserManagerSearchError(null);
                                setCreateUserStatus(null);
                              }}
                              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-violet-50 focus:bg-violet-50 focus:outline-none"
                            >
                              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-sm font-bold text-violet-700">
                                {(suggestion.name || suggestion.email).trim().charAt(0).toUpperCase()}
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-semibold text-slate-900">
                                  {suggestion.name || nameFromEmail(suggestion.email)}
                                </span>
                                <span className="block truncate text-xs text-slate-500">
                                  {suggestion.email}
                                </span>
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
                {newUserManagerEmail ? (
                  <p className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                    <CheckCircle2 size={13} strokeWidth={2.3} aria-hidden="true" />
                    Vybráno: {newUserManagerEmail}
                  </p>
                ) : (
                  <p className="text-xs text-slate-500">
                    {newUserAccountType === "tipster"
                      ? "Vyber existujícího uživatele, kterému se budou předávat tipy."
                      : "Volitelné — bez nadřízeného nech pole prázdné."}
                  </p>
                )}
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
                                ? "admin-on-violet bg-[linear-gradient(120deg,#7c3aed_0%,#a855f7_58%,#c084fc_100%)] !text-white shadow-[0_10px_22px_rgba(124,58,237,0.28)]"
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
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 md:col-span-2 xl:col-span-1">
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
                          : "text-rose-700"
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
          <AdminBroadcastSection
            controller={adminBroadcast}
            classes={{
              section: adminDarkSectionClass,
              topBar: adminDarkTopBarClass,
              badge: adminDarkBadgeClass,
              panel: adminDarkPanelClass,
              field: createUserFieldClass,
              label: createUserLabelClass,
              primaryButton: adminDarkPrimaryButtonClass,
            }}
          />
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

            <div className="mt-4 grid gap-4 lg:grid-cols-[330px_minmax(0,1fr)] lg:items-start">
            <aside className="relative overflow-hidden rounded-3xl border border-violet-100 bg-white p-3 shadow-[0_18px_48px_rgba(76,29,149,0.08)]">
              <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-300 via-purple-400 to-indigo-300" />
            <div className="rounded-2xl bg-slate-50/80 p-2.5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <label className="relative block min-w-0 flex-1">
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
                    placeholder="Hledat jméno, e-mail, IČO, telefon nebo agenturní číslo…"
                  />
                </label>
                <span className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-2 text-center text-xs font-semibold text-slate-600">
                  {adminUsersSearch.trim()
                    ? `${filteredAdminUsersRows.length} z ${adminUsersRows.length}`
                    : `${adminUsersRows.length} uživatelů`}
                </span>
              </div>

              <div
                className="mt-2 grid grid-cols-3 gap-1 rounded-xl border border-slate-200 bg-white p-1"
                role="tablist"
                aria-label="Typ uživatelského účtu"
              >
                {[
                  { id: "all" as const, label: "Všichni", count: adminUsersStats.total },
                  { id: "advisor" as const, label: "Zástupci", count: adminUsersStats.advisors },
                  { id: "tipster" as const, label: "Tipaři", count: adminUsersStats.tipsters },
                ].map((option) => {
                  const active = adminUsersAccountFilter === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setAdminUsersAccountFilter(option.id)}
                      className={`rounded-lg px-2 py-2 text-[11px] font-semibold transition ${
                        active
                          ? "bg-violet-600 text-white shadow-sm"
                          : "text-slate-500 hover:bg-violet-50 hover:text-violet-700"
                      }`}
                    >
                      <span className="block truncate">{option.label}</span>
                      <span className={`mt-0.5 block text-[10px] ${active ? "text-violet-100" : "text-slate-400"}`}>
                        {option.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {adminUsersStatus ? (
                <div
                  className={`mt-3 rounded-xl border px-3 py-2 text-sm ${
                    adminUsersStatus.type === "success"
                      ? "border-violet-300/30 bg-violet-400/12 !text-violet-100"
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

            <div className="mt-3 grid max-h-[640px] grid-cols-1 gap-2 overflow-y-auto pr-1">
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
                  const isSelected = selectedAdminDirectoryUser?.email === row.email;
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
                      onClick={() => setAdminUsersSelectedEmail(row.email)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        setAdminUsersSelectedEmail(row.email);
                      }}
                      className={`group relative w-full overflow-hidden rounded-xl border p-2.5 text-left transition ${
                        isSelected
                          ? "border-violet-300 bg-violet-50/80 shadow-[0_12px_28px_rgba(76,29,149,0.12)]"
                          : complete
                            ? "border-violet-100 bg-white hover:border-violet-200 hover:bg-violet-50/40"
                            : "border-amber-200 bg-amber-50/40 hover:border-amber-300 hover:bg-amber-50"
                      }`}
                    >
                      <span
                        className={`pointer-events-none absolute inset-y-0 left-0 w-1 ${
                          isSelected
                            ? "bg-violet-500"
                            : complete
                              ? "bg-violet-200"
                              : "bg-amber-400"
                        }`}
                      />
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-start gap-3">
                          <span
                            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                              complete
                                ? "border-violet-300/35 bg-violet-400/14 !text-violet-100"
                                : "border-amber-200 bg-amber-50 text-amber-700"
                            }`}
                          >
                            {avatarInitial}
                          </span>
                          <div className="min-w-0">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <span className="min-w-0 max-w-full truncate text-sm font-bold !text-white">
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
                                <span className="hidden items-center gap-1 rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-[11px] font-semibold text-cyan-700">
                                  <ShieldCheck size={12} strokeWidth={2.4} aria-hidden="true" />
                                  Specialista
                                </span>
                              ) : null}
                              {positionLabel ? (
                                <span className="hidden rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                                  {positionLabel}
                                </span>
                              ) : null}
                            </div>
                            <div className="truncate text-xs !text-violet-100/58">{row.email}</div>
                          </div>
                        </div>

                        <span
                          className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
                            complete
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-amber-200 bg-amber-50 text-amber-700"
                          }`}
                          title={complete ? "Profil je kompletní" : `K doplnění: ${missingItems.length}`}
                        >
                          {complete ? (
                            <CheckCircle2 size={14} strokeWidth={2.3} aria-hidden="true" />
                          ) : (
                            <AlertTriangle size={14} strokeWidth={2.3} aria-hidden="true" />
                          )}
                        </span>

                        <div className="hidden flex-wrap items-center gap-2 lg:justify-end">
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

                      <div className="hidden">
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

                      <div className="hidden grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
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
            </aside>

            {selectedAdminDirectoryUser ? (() => {
              const row = selectedAdminDirectoryUser;
              const title = row.fullName || nameFromEmail(row.email);
              const avatarInitial = (title.trim().charAt(0) || row.email.charAt(0)).toUpperCase();
              const missingItems = buildAdminUserMissingItems(row);
              const complete = missingItems.length === 0;
              const isCurrentUser = normalizeEmail(currentUser?.email) === row.email;
              const targetAdminRole = resolveAdminRoleFromClaims(row.email, null);
              const canImpersonate =
                isAllowedAdmin && !row.disabled && !isCurrentUser && !targetAdminRole;
              const resetPasswordKey = adminUserSecurityActionKey(row.email, "sendPasswordReset");
              const resetMfaKey = adminUserSecurityActionKey(row.email, "resetMfa");
              const verifyEmailKey = adminUserSecurityActionKey(row.email, "verifyEmail");
              const revokeSessionsKey = adminUserSecurityActionKey(row.email, "revokeSessions");
              const relationEmail = normalizeEmail(
                row.accountType === "tipster" ? row.tipRecipientEmail : row.managerEmail
              );
              const relationUser = relationEmail
                ? adminUsersRows.find((candidate) => normalizeEmail(candidate.email) === relationEmail)
                : null;
              const relationLabel = relationUser
                ? relationUser.fullName || nameFromEmail(relationUser.email)
                : relationEmail || "Nenastaveno";

              return (
                <section className="overflow-hidden rounded-[28px] border border-violet-100 bg-white shadow-[0_24px_58px_rgba(76,29,149,0.10)]">
                  <div className="admin-on-violet relative overflow-hidden bg-[linear-gradient(135deg,#2e1065_0%,#6d28d9_52%,#a855f7_100%)] px-5 py-5 text-white">
                    <span className="pointer-events-none absolute -right-16 -top-24 h-44 w-44 rounded-full bg-white/20 blur-3xl" />
                    <span className="pointer-events-none absolute -bottom-24 -left-16 h-40 w-40 rounded-full bg-fuchsia-300/20 blur-3xl" />
                    <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center">
                      <span className="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-white/25 bg-white/15 text-2xl font-black shadow-[0_14px_30px_rgba(30,10,70,0.24)]">
                        {avatarInitial}
                      </span>
                      <div className="min-w-0">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-violet-100/80">
                          Profil uživatele
                        </div>
                        <h3 className="mt-1 break-words text-3xl font-black leading-tight text-white">
                          {title}
                        </h3>
                        <p className="mt-1 break-all text-sm text-violet-100/85">{row.email}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className="rounded-full border border-white/20 bg-white/15 px-2.5 py-1 text-xs font-semibold text-white">
                            {formatAccountTypeLabel(row.accountType)}
                          </span>
                          {row.position ? (
                            <span className="rounded-full border border-white/20 bg-white/15 px-2.5 py-1 text-xs font-semibold text-white">
                              {formatPositionLabel(row.position)}
                            </span>
                          ) : null}
                          <span className="rounded-full border border-white/20 bg-white/15 px-2.5 py-1 text-xs font-semibold text-white">
                            {row.disabled ? "Deaktivovaný" : "Aktivní účet"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 p-4 sm:p-5">
                    <form
                      className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void handleSaveAdminUser(row);
                      }}
                    >
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-600">
                            Profilové údaje
                          </div>
                          <p className="mt-1 text-sm text-slate-500">
                            Změny uložíš přímo bez otevírání dalšího okna.
                          </p>
                        </div>
                        <button
                          type="submit"
                          disabled={adminUsersSavingEmail === row.email}
                          className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {adminUsersSavingEmail === row.email ? (
                            <Loader2 size={15} className="animate-spin" aria-hidden="true" />
                          ) : (
                            <Save size={15} strokeWidth={2.2} aria-hidden="true" />
                          )}
                          Uložit změny
                        </button>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="space-y-1.5">
                          <span className={createUserLabelClass}>Jméno / název</span>
                          <input
                            type="text"
                            value={adminUsersEditFullName}
                            onChange={(event) => setAdminUsersEditFullName(event.target.value)}
                            className={createUserFieldClass}
                            maxLength={120}
                          />
                        </label>
                        <label className="space-y-1.5">
                          <span className={createUserLabelClass}>Typ účtu</span>
                          <select
                            value={adminUsersEditAccountType}
                            onChange={(event) =>
                              setAdminUsersEditAccountType(
                                event.target.value as AdminUsersAccountTypeDraft
                              )
                            }
                            className={createUserFieldClass}
                          >
                            <option value="">Nenastaveno</option>
                            <option value="advisor">Vázaný zástupce</option>
                            <option value="tipster">Tipař</option>
                          </select>
                        </label>
                        <label className="space-y-1.5">
                          <span className={createUserLabelClass}>Agenturní číslo</span>
                          <input
                            type="text"
                            value={adminUsersEditAgencyNumber}
                            onChange={(event) => setAdminUsersEditAgencyNumber(event.target.value)}
                            className={createUserFieldClass}
                            maxLength={80}
                          />
                        </label>
                        <label className="space-y-1.5">
                          <span className={createUserLabelClass}>IČO</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={adminUsersEditIco}
                            onChange={(event) =>
                              setAdminUsersEditIco(normalizeIcoInput(event.target.value))
                            }
                            className={createUserFieldClass}
                            maxLength={ADMIN_USER_ICO_MAX_LEN}
                          />
                        </label>
                        <label className="space-y-1.5 sm:col-span-2">
                          <span className={createUserLabelClass}>Telefon</span>
                          <input
                            type="tel"
                            value={adminUsersEditPhoneNumber}
                            onChange={(event) => setAdminUsersEditPhoneNumber(event.target.value)}
                            className={createUserFieldClass}
                            maxLength={40}
                          />
                        </label>
                      </div>

                      <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-2xl border border-cyan-200 bg-cyan-50 px-3.5 py-3">
                        <input
                          type="checkbox"
                          checked={adminUsersEditSpecialist}
                          onChange={(event) => setAdminUsersEditSpecialist(event.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded border-cyan-300 accent-cyan-600"
                        />
                        <span>
                          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-900">
                            <ShieldCheck size={15} strokeWidth={2.2} aria-hidden="true" />
                            Specialista dokumentů
                          </span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-cyan-700">
                            Uživatel může spravovat dokumenty a nahrávat jejich soubory.
                          </span>
                        </span>
                      </label>
                    </form>

                    <div className="flex flex-wrap items-center gap-2">
                      {isAllowedAdmin ? (
                        <button
                          type="button"
                          onClick={() => handleImpersonateAdminUser(row)}
                          disabled={!canImpersonate}
                          className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
                            canImpersonate
                              ? "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
                              : "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
                          }`}
                          title={
                            isCurrentUser
                              ? "Vlastní účet nejde zobrazit přes impersonaci."
                              : row.disabled
                                ? "Deaktivovaný účet nejde zobrazit přes impersonaci."
                                : targetAdminRole
                                  ? "Administrátorský účet nejde zobrazit přes impersonaci."
                                  : undefined
                          }
                        >
                          <UserRound size={15} strokeWidth={2.2} aria-hidden="true" />
                          Zobrazit jako
                        </button>
                      ) : null}
                      {isOwnerAdmin ? (
                        <button
                          type="button"
                          onClick={() => handleOpenAdminUserDelete(row)}
                          disabled={isCurrentUser}
                          className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
                            isCurrentUser
                              ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
                              : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                          }`}
                        >
                          <Trash2 size={15} strokeWidth={2.2} aria-hidden="true" />
                          Smazat
                        </button>
                      ) : null}
                    </div>

                    <div className="grid gap-3 xl:grid-cols-2">
                      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="inline-flex items-center gap-2 text-sm font-bold text-slate-900">
                              <ShieldCheck size={16} strokeWidth={2.2} className="text-violet-600" aria-hidden="true" />
                              Bezpečnostní akce
                            </div>
                            <p className="mt-1 text-xs text-slate-500">
                              E-mail {row.emailVerified ? "je ověřený" : "není ověřený"} · {row.mfa.enabled ? `2FA aktivní (${row.mfa.factorCount})` : "bez 2FA"}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <button
                            type="button"
                            onClick={() =>
                              void handleAdminUserSecurityAction(row, "sendPasswordReset")
                            }
                            disabled={Boolean(adminUserSecurityBusyKey)}
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {adminUserSecurityBusyKey === resetPasswordKey ? (
                              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                            ) : (
                              <KeyRound size={14} strokeWidth={2.2} aria-hidden="true" />
                            )}
                            Poslat reset hesla
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleAdminUserSecurityAction(row, "resetMfa")}
                            disabled={Boolean(adminUserSecurityBusyKey)}
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {adminUserSecurityBusyKey === resetMfaKey ? (
                              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                            ) : (
                              <ShieldAlert size={14} strokeWidth={2.2} aria-hidden="true" />
                            )}
                            {adminUserSecurityConfirmKey === resetMfaKey
                              ? "Potvrdit reset 2FA"
                              : "Resetovat 2FA"}
                          </button>
                          {!row.emailVerified ? (
                            <button
                              type="button"
                              onClick={() => void handleAdminUserSecurityAction(row, "verifyEmail")}
                              disabled={Boolean(adminUserSecurityBusyKey)}
                              className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {adminUserSecurityBusyKey === verifyEmailKey ? (
                                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                              ) : (
                                <Mail size={14} strokeWidth={2.2} aria-hidden="true" />
                              )}
                              Ověřit e-mail
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() =>
                              void handleAdminUserSecurityAction(row, "revokeSessions")
                            }
                            disabled={Boolean(adminUserSecurityBusyKey)}
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {adminUserSecurityBusyKey === revokeSessionsKey ? (
                              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                            ) : (
                              <RefreshCcw size={14} strokeWidth={2.2} aria-hidden="true" />
                            )}
                            {adminUserSecurityConfirmKey === revokeSessionsKey
                              ? "Potvrdit odhlášení"
                              : "Odhlásit relace"}
                          </button>
                        </div>
                      </section>

                      <section className="rounded-2xl border border-violet-200 bg-violet-50/60 p-4 shadow-[0_10px_28px_rgba(76,29,149,0.06)]">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="inline-flex items-center gap-2 text-sm font-bold text-slate-900">
                              <ExternalLink size={16} strokeWidth={2.2} className="text-violet-600" aria-hidden="true" />
                              Online vizitka
                            </div>
                            <p className="mt-1 text-xs leading-relaxed text-slate-500">
                              {row.onlineCard.enabled
                                ? "Vizitka je veřejně dostupná. Uživatel si může doplnit její obsah v Nastavení."
                                : "Zapnutím vytvoříš veřejnou vizitku a automaticky rezervuješ její URL."}
                            </p>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={row.onlineCard.enabled}
                            onClick={() =>
                              void handleToggleAdminUserOnlineCard(row, !row.onlineCard.enabled)
                            }
                            disabled={adminUsersOnlineCardSavingEmail === row.email}
                            className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition ${
                              row.onlineCard.enabled
                                ? "border-violet-600 bg-violet-600"
                                : "border-slate-300 bg-slate-200"
                            } disabled:cursor-not-allowed disabled:opacity-60`}
                            aria-label={`${row.onlineCard.enabled ? "Vypnout" : "Zapnout"} online vizitku`}
                          >
                            <span
                              className={`inline-flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-sm transition ${
                                row.onlineCard.enabled ? "translate-x-7" : "translate-x-1"
                              }`}
                            >
                              {adminUsersOnlineCardSavingEmail === row.email ? (
                                <Loader2 size={12} className="animate-spin text-violet-600" aria-hidden="true" />
                              ) : null}
                            </span>
                          </button>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                              row.onlineCard.enabled
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-slate-200 bg-white text-slate-600"
                            }`}
                          >
                            {row.onlineCard.enabled ? "Zapnuto" : "Vypnuto"}
                          </span>
                          {row.onlineCard.slug ? (
                            <a
                              href={`/vizitka/${row.onlineCard.slug}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-violet-200 bg-white px-2.5 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-100"
                            >
                              <ExternalLink size={12} strokeWidth={2.2} aria-hidden="true" />
                              <span className="truncate">/vizitka/{row.onlineCard.slug}</span>
                            </a>
                          ) : null}
                        </div>
                      </section>
                    </div>

                    <div
                      className={`rounded-2xl border px-4 py-3 ${
                        complete
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : "border-amber-200 bg-amber-50 text-amber-900"
                      }`}
                    >
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        {complete ? (
                          <CheckCircle2 size={16} strokeWidth={2.3} aria-hidden="true" />
                        ) : (
                          <AlertTriangle size={16} strokeWidth={2.3} aria-hidden="true" />
                        )}
                        {complete
                          ? "Profil je kompletní"
                          : `${missingItems.length} ${missingItems.length === 1 ? "údaj je potřeba doplnit" : "údaje je potřeba doplnit"}`}
                      </div>
                      {!complete ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {missingItems.map((item) => (
                            <span
                              key={item.key}
                              className="rounded-full border border-amber-200 bg-white/70 px-2.5 py-1 text-xs font-semibold text-amber-800"
                            >
                              {item.label}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {[
                        { label: "Agenturní číslo", value: row.agencyNumber || "—", icon: IdCard },
                        { label: "IČO", value: row.ico || "—", icon: Building2 },
                        { label: "Telefon", value: row.phoneNumber || "—", icon: PhoneCall },
                        {
                          label: row.accountType === "tipster" ? "Příjemce tipů" : "Nadřízený",
                          value: relationLabel,
                          icon: UserCheck2,
                        },
                        {
                          label: "Pozice",
                          value: row.position ? formatPositionLabel(row.position) : "—",
                          icon: BriefcaseBusiness,
                        },
                        {
                          label: "Provizní režim",
                          value:
                            COMMISSION_MODES.find((mode) => mode.id === row.commissionMode)
                              ?.label ?? row.commissionMode ?? "—",
                          icon: Zap,
                        },
                        {
                          label: "Dokončení setupu",
                          value: formatAuthDateTime(row.accountSetupCompletedAt),
                          icon: CheckCircle2,
                        },
                        { label: "Poslední přihlášení", value: formatAuthDateTime(row.lastSignInAt), icon: Clock3 },
                        { label: "Účet vytvořen", value: formatAuthDateTime(row.createdAt), icon: UserPlus },
                        {
                          label: "Veřejný profil",
                          value: row.profileExists ? "Ano" : "Ne",
                          icon: UserRound,
                        },
                        {
                          label: "Soukromý profil",
                          value: row.privateProfileExists ? "Ano" : "Ne",
                          icon: ShieldCheck,
                        },
                      ].map((item) => {
                        const Icon = item.icon;
                        return (
                          <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                              <Icon size={13} strokeWidth={2.1} aria-hidden="true" />
                              {item.label}
                            </div>
                            <div className="mt-1.5 break-words text-sm font-semibold text-slate-900">
                              {item.value}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-violet-100 bg-violet-50/60 p-3">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-600">E-mail</div>
                        <div className="mt-1.5 text-sm font-semibold text-slate-900">
                          {row.emailVerified ? "Ověřený" : "Neověřený"}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-violet-100 bg-violet-50/60 p-3">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-600">Zabezpečení</div>
                        <div className="mt-1.5 text-sm font-semibold text-slate-900">
                          {row.mfa.enabled ? `2FA aktivní (${row.mfa.factorCount})` : "Bez 2FA"}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-violet-100 bg-violet-50/60 p-3">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-600">Online vizitka</div>
                        <div className="mt-1.5 text-sm font-semibold text-slate-900">
                          {getAdminUserOnlineCardLabel(row)}
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              );
            })() : (
              <div className="flex min-h-[420px] items-center justify-center rounded-[28px] border border-dashed border-violet-200 bg-violet-50/40 p-8 text-center">
                <div>
                  <UserRound className="mx-auto h-10 w-10 text-violet-400" aria-hidden="true" />
                  <p className="mt-3 font-semibold text-slate-900">Vyber uživatele ze seznamu</p>
                  <p className="mt-1 text-sm text-slate-500">Jeho profil a dostupné akce se zobrazí tady.</p>
                </div>
              </div>
            )}
            </div>
          </section>
        ) : null}

        {isOwnerAdmin && activeAdminSection === "subscriptions" ? (
          <AdminSubscriptionsSection
            controller={adminSubscriptions}
            classes={{
              section: adminDarkSectionClass,
              topBar: adminDarkTopBarClass,
              badge: adminDarkBadgeClass,
              panel: adminDarkPanelClass,
              softPanel: adminDarkSoftPanelClass,
              field: createUserFieldClass,
              label: createUserLabelClass,
              primaryButton: adminDarkPrimaryButtonClass,
              historyField: subscriptionHistoryFieldClass,
              historyIconButton: subscriptionHistoryIconButtonClass,
              historyDangerButton: subscriptionHistoryDangerButtonClass,
            }}
          />
        ) : null}
        {isAllowedAdmin && activeAdminSection === "security" ? (
          <AdminSecuritySection
            rows={adminSecurity.rows}
            loading={adminSecurity.loading}
            error={adminSecurity.error}
            filter={adminSecurity.filter}
            search={adminSecurity.search}
            onRefresh={() => void adminSecurity.refresh()}
            onFilterChange={adminSecurity.setFilter}
            onSearchChange={adminSecurity.setSearch}
            classes={{
              section: adminDarkSectionClass,
              topBar: adminDarkTopBarClass,
              badge: adminDarkBadgeClass,
              softPanel: adminDarkSoftPanelClass,
              metric: adminDarkMetricClass,
              subtleButton: adminDarkSubtleButtonClass,
              field: createUserFieldClass,
            }}
          />
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
