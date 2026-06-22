import type { CommissionMode, Position } from "../types/domain";

export type UserRequestSubject = "userCreation" | "other";
export type UserRequestPriority = "normal" | "urgent";
export type UserRequestStatus = "pending" | "needsInfo" | "accepted" | "rejected";
export type UserRequestsView = "create" | "history";

export type UserCreationRequestDraft = {
  fullName: string | null;
  agencyNumber: string | null;
  managerEmail: string | null;
  position: Position | null;
  commissionMode: CommissionMode;
};

export type UserRequestPayload = {
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

export type UserRequestsApiResponse = {
  ok?: boolean;
  requests?: UserRequestPayload[];
};

export type UserRequestCreateApiResponse = {
  ok?: boolean;
  request?: UserRequestPayload;
  error?: string;
};

export type UserRequestUpdateApiResponse = {
  ok?: boolean;
  request?: UserRequestPayload;
  error?: string;
};

export type UserRequestDeleteApiResponse = {
  ok?: boolean;
  id?: string;
  error?: string;
};

export const USER_REQUEST_MESSAGE_MIN_LEN = 5;
export const USER_REQUEST_MESSAGE_MAX_LEN = 2500;
export const USER_REQUEST_CORPORATE_EMAIL_MAX_LEN = 180;
export const USER_REQUEST_MANAGER_EMAIL_MAX_LEN = 180;
export const USER_REQUEST_FULL_NAME_MAX_LEN = 120;
export const USER_REQUEST_AGENCY_NUMBER_MAX_LEN = 80;

export const USER_REQUEST_SUBJECT_LABEL: Record<UserRequestSubject, string> = {
  userCreation: "Založení uživatele",
  other: "Jiné",
};

export const USER_REQUEST_PRIORITY_LABEL: Record<UserRequestPriority, string> = {
  normal: "Běžná",
  urgent: "Urgentní",
};

export const USER_REQUEST_STATUS_LABEL: Record<UserRequestStatus, string> = {
  pending: "Čeká",
  needsInfo: "Potřeba doplnit",
  accepted: "Akceptováno",
  rejected: "Odmítnuto",
};

export const USER_REQUEST_STATUS_CLASS: Record<UserRequestStatus, string> = {
  pending: "border-amber-300 bg-amber-50 text-amber-800",
  needsInfo: "border-sky-300 bg-sky-50 text-sky-800",
  accepted: "border-emerald-300 bg-emerald-50 text-emerald-700",
  rejected: "border-rose-300 bg-rose-50 text-rose-700",
};

export const USER_REQUEST_STEPS = [
  { id: "type", label: "Typ" },
  { id: "details", label: "Údaje" },
  { id: "message", label: "Odeslání" },
] as const;

const USER_REQUEST_SLA_NORMAL_MS = 72 * 60 * 60 * 1000;
const USER_REQUEST_SLA_URGENT_MS = 8 * 60 * 60 * 1000;

export const sortUserRequestsByActivity = (
  rows: UserRequestPayload[]
): UserRequestPayload[] =>
  [...rows].sort((a, b) => {
    const aActivity = Math.max(a.updatedAtMs || 0, a.createdAtMs || 0);
    const bActivity = Math.max(b.updatedAtMs || 0, b.createdAtMs || 0);
    return bActivity - aActivity;
  });

export const formatDurationCompact = (durationMs: number): string => {
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

export const buildUserRequestSlaInfo = (
  request: UserRequestPayload,
  nowMs: number
) => {
  const status = request.status;
  const waitingStatuses: UserRequestStatus[] = ["pending", "needsInfo"];
  const waiting = waitingStatuses.includes(status);
  const sinceMs = waiting ? request.updatedAtMs || request.createdAtMs : null;
  const elapsedMs =
    sinceMs && Number.isFinite(sinceMs) ? Math.max(0, nowMs - sinceMs) : 0;

  const slaLimitMs =
    request.priority === "urgent" ? USER_REQUEST_SLA_URGENT_MS : USER_REQUEST_SLA_NORMAL_MS;
  const isUrgentPending = status === "pending" && request.priority === "urgent";
  const isOverdueUrgent = isUrgentPending && elapsedMs > slaLimitMs;

  return {
    waiting,
    elapsedLabel: formatDurationCompact(elapsedMs),
    slaLimitLabel: formatSlaLimit(request.priority),
    isOverdueUrgent,
  };
};
