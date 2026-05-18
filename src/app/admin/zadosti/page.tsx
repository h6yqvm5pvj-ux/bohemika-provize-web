"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Clock3,
  Copy,
  Inbox,
  RefreshCcw,
  RefreshCw,
  Search,
  ShieldAlert,
  Snail,
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

const formatDateTime = (valueMs: number | null | undefined): string => {
  if (!valueMs || !Number.isFinite(valueMs)) return "—";
  return new Date(valueMs).toLocaleString("cs-CZ");
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

type AdminSection = "requests" | "createUser";

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
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserManagerEmail, setNewUserManagerEmail] = useState("");
  const [newUserPosition, setNewUserPosition] = useState<Position>("poradce1");
  const [newUserMode, setNewUserMode] = useState<CommissionMode>("standard");
  const [createUserBusy, setCreateUserBusy] = useState(false);
  const [createUserStatus, setCreateUserStatus] = useState<InlineStatus | null>(null);
  const [activeAdminSection, setActiveAdminSection] = useState<AdminSection>("requests");
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
    if (!email) {
      setCreateUserStatus({ type: "error", message: "Vyplň e-mail nového uživatele." });
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
        message: "Nadřízený nemůže být stejný jako nový uživatel.",
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
            managerEmail,
            position: newUserPosition,
            commissionMode: newUserMode,
          }),
        }
      );

      setCreateUserStatus({
        type: "success",
        message: `Uživatel ${payload?.email ?? email} byl vytvořen.`,
      });
      setNewUserEmail("");
      setNewUserFullName("");
      setNewUserPosition("poradce1");
      setNewUserMode("standard");
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
    newUserManagerEmail,
    newUserMode,
    newUserPassword,
    newUserPosition,
  ]);
  const fieldClass =
    "w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-[0_8px_18px_rgba(15,23,42,0.04)] outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10";

  return (
    <AppLayout active="admin">
      <div className="w-full max-w-[1200px] space-y-6 px-2 pb-8 sm:px-4">
        <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-[linear-gradient(170deg,#ffffff_0%,#f8fbff_55%,#eff5fb_100%)] px-5 py-5 shadow-[0_22px_46px_rgba(15,23,42,0.1)] sm:px-6">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-300 via-sky-400 to-indigo-500" />

          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <span className="mb-2 inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold tracking-wide text-sky-800">
                Řídicí panel
              </span>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Admin
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Správa interních akcí a uživatelů.
              </p>
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
              <div className="mb-4 flex w-fit max-w-full flex-wrap gap-1 overflow-x-auto rounded-full border border-slate-300 bg-white p-1 shadow-[0_10px_24px_rgba(15,23,42,0.1)]">
                <button
                  type="button"
                  onClick={() => setActiveAdminSection("requests")}
                  className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${
                    activeAdminSection === "requests"
                      ? "bg-slate-900 text-white shadow-[0_8px_18px_rgba(15,23,42,0.2)]"
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
                      ? "bg-slate-900 text-white shadow-[0_8px_18px_rgba(15,23,42,0.2)]"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  Přidat uživatele
                </button>
              </div>

              <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Celkem žádostí
                  </div>
                  <div className="mt-1 text-2xl font-bold text-slate-900">{totalRequestsCount}</div>
                </div>
                <div className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 shadow-sm">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700">
                    Čeká vyřízení
                  </div>
                  <div className="mt-1 text-2xl font-bold text-amber-900">{pendingUnifiedCount}</div>
                </div>
                <div className="rounded-2xl border border-sky-200 bg-sky-50/70 px-4 py-3 shadow-sm">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700">
                    Ukončení spolupráce
                  </div>
                  <div className="mt-1 text-2xl font-bold text-sky-900">
                    {pendingEndCollaborationCount}
                  </div>
                </div>
                <div className="rounded-2xl border border-rose-200 bg-rose-50/70 px-4 py-3 shadow-sm">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-rose-700">
                    Urgent po SLA
                  </div>
                  <div className="mt-1 text-2xl font-bold text-rose-900">{overdueUrgentCount}</div>
                </div>
              </div>

              {activeAdminSection === "requests" ? (
                <>
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
                              className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition hover:-translate-y-[1px] hover:shadow-[0_14px_28px_rgba(15,23,42,0.1)]"
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

                              <div className="grid gap-1 text-sm text-slate-700 sm:grid-cols-2">
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
                            className={`relative overflow-hidden rounded-2xl border bg-white px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition hover:-translate-y-[1px] hover:shadow-[0_14px_28px_rgba(15,23,42,0.1)] ${
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

                            <div className="grid gap-1 text-sm text-slate-700 sm:grid-cols-2">
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
                              <div>
                                Pozice:{" "}
                                <span className="font-medium text-slate-900">
                                  {request.requestedUserDraft
                                    ? (POSITIONS.find(
                                        (p) => p.id === request.requestedUserDraft?.position
                                      )?.label ?? request.requestedUserDraft.position)
                                    : "—"}
                                </span>
                              </div>
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
                  )}
                </>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-600 shadow-sm">
                  Pro práci s uživateli přepni na sekci{" "}
                  <span className="font-semibold text-slate-900">Přidat uživatele</span>.
                </div>
              )}
            </>
          )}
        </section>

        {isAllowedAdmin && activeAdminSection === "createUser" ? (
          <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-[linear-gradient(170deg,#ffffff_0%,#f8fbff_55%,#eff5fb_100%)] px-5 py-5 shadow-[0_22px_46px_rgba(15,23,42,0.1)] sm:px-6">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-300 via-cyan-400 to-emerald-400" />
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <span className="mb-2 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold tracking-wide text-emerald-800">
                  Správa účtů
                </span>
                <h2 className="inline-flex items-center gap-1.5 text-base font-semibold text-slate-900 sm:text-lg">
                  <UserPlus size={14} strokeWidth={2} className="text-slate-600" aria-hidden="true" />
                  <span>Přidat uživatele</span>
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Vytvoří Firebase Auth účet, veřejný profil a aktivní interní profil.
                </p>
              </div>
            </div>

            <form
              className="grid gap-3 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm lg:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                void handleCreateUser();
              }}
            >
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                  E-mail
                </label>
                <input
                  type="email"
                  autoComplete="off"
                  className={fieldClass}
                  value={newUserEmail}
                  onChange={(event) => setNewUserEmail(event.target.value)}
                  placeholder="jmeno.prijmeni@bohemika.eu"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                  Jméno
                </label>
                <input
                  type="text"
                  autoComplete="off"
                  className={fieldClass}
                  value={newUserFullName}
                  onChange={(event) => setNewUserFullName(event.target.value)}
                  placeholder="Jméno Příjmení"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                  Dočasné heslo
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    autoComplete="new-password"
                    className={fieldClass}
                    value={newUserPassword}
                    onChange={(event) => setNewUserPassword(event.target.value)}
                    placeholder="Min. 8 znaků"
                  />
                  <button
                    type="button"
                    onClick={handleGenerateNewUserPassword}
                    className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-100"
                    title="Vygenerovat heslo"
                    aria-label="Vygenerovat heslo"
                  >
                    <RefreshCw size={15} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCopyNewUserPassword()}
                    disabled={!newUserPassword}
                    className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                    title="Zkopírovat heslo"
                    aria-label="Zkopírovat heslo"
                  >
                    <Copy size={15} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                  Nadřízený
                </label>
                <input
                  type="email"
                  autoComplete="off"
                  className={fieldClass}
                  value={newUserManagerEmail}
                  onChange={(event) => setNewUserManagerEmail(event.target.value)}
                  placeholder="Bez nadřízeného nech prázdné"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                  Výchozí pozice
                </label>
                <select
                  className={fieldClass}
                  value={newUserPosition}
                  onChange={(event) => setNewUserPosition(event.target.value as Position)}
                >
                  {POSITIONS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                  Režim provizí
                </label>
                <div
                  className="inline-flex w-full rounded-2xl border border-slate-300 bg-slate-100 p-1"
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
                            ? "border border-slate-900 bg-white text-slate-900 shadow-[0_4px_12px_rgba(15,23,42,0.1)]"
                            : "border border-transparent text-slate-600 hover:text-slate-900"
                        }`}
                        role="radio"
                        aria-checked={active}
                      >
                        {isAccelerated ? (
                          <Zap size={14} strokeWidth={2.2} className={active ? "text-amber-500" : "text-amber-600"} aria-hidden="true" />
                        ) : (
                          <Snail size={14} strokeWidth={2.2} className={active ? "text-slate-600" : "text-slate-500"} aria-hidden="true" />
                        )}
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-1 lg:col-span-2 sm:flex-row sm:items-center sm:justify-between">
                {createUserStatus ? (
                  <p
                    className={`text-xs font-medium ${
                      createUserStatus.type === "success"
                        ? "text-emerald-700"
                        : createUserStatus.type === "info"
                          ? "text-slate-700"
                          : "text-rose-700"
                    }`}
                  >
                    {createUserStatus.message}
                  </p>
                ) : (
                  <span className="text-xs text-slate-500">
                    Nový účet se po vytvoření může rovnou přihlásit do aplikace.
                  </span>
                )}
                <button
                  type="submit"
                  disabled={createUserBusy}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-900 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <UserPlus size={15} strokeWidth={2.2} aria-hidden="true" />
                  {createUserBusy ? "Vytvářím..." : "Vytvořit uživatele"}
                </button>
              </div>
            </form>
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
