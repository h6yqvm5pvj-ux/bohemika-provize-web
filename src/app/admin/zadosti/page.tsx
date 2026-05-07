"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Clock3,
  Copy,
  RefreshCcw,
  RefreshCw,
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
type UserRequestStatus = "pending" | "accepted" | "rejected";

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

const ADMIN_REQUESTS_EMAIL = "jakub.rauscher@bohemika.eu";

const normalizeEmail = (value: string | null | undefined): string =>
  (value ?? "").trim().toLowerCase();

const formatDateTime = (valueMs: number | null | undefined): string => {
  if (!valueMs || !Number.isFinite(valueMs)) return "—";
  return new Date(valueMs).toLocaleString("cs-CZ");
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
  accepted: "border-emerald-300 bg-emerald-50 text-emerald-800",
  rejected: "border-slate-300 bg-slate-100 text-slate-700",
};

const userRequestStatusLabel: Record<UserRequestStatus, string> = {
  pending: "Čeká",
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
  const [userRequestSearch, setUserRequestSearch] = useState("");
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

  const isAllowedAdmin = normalizeEmail(currentUser?.email) === ADMIN_REQUESTS_EMAIL;

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthReady(true);
    });
    return () => unsub();
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
      setUserRequests(rows.sort((a, b) => b.createdAtMs - a.createdAtMs));
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

  const filteredRequests = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter((request) => {
      const haystack = [
        request.targetName,
        request.targetEmail,
        request.requestedByEmail,
        request.successorEmail,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [requests, search]);

  const pendingCount = useMemo(
    () =>
      filteredRequests.filter(
        (request) => request.status === "pending" || request.status === "processing"
      ).length,
    [filteredRequests]
  );

  const filteredUserRequests = useMemo(() => {
    const q = userRequestSearch.trim().toLowerCase();
    if (!q) return userRequests;
    return userRequests.filter((request) => {
      const haystack = [
        request.requesterEmail,
        request.requestedCorporateEmail ?? "",
        userRequestSubjectLabel[request.subject],
        request.message,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [userRequests, userRequestSearch]);

  const pendingUserRequestCount = useMemo(
    () => filteredUserRequests.filter((request) => request.status === "pending").length,
    [filteredUserRequests]
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
    async (request: UserRequestPayload, status: "accepted" | "rejected") => {
      const user = auth.currentUser;
      if (!user || !isAllowedAdmin) return;

      const feedback = (userRequestFeedbackDrafts[request.id] ?? "").trim();
      const tempPassword = (userRequestPasswordDrafts[request.id] ?? "").trim();
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
            : "Uživatelská žádost byla odmítnuta."
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
    "w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-[0_8px_18px_rgba(15,23,42,0.04)] outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10";

  return (
    <AppLayout active="admin">
      <div className="w-full max-w-[1200px] space-y-5 px-2 pb-8 sm:px-4">
        <section className="rounded-3xl border border-slate-300 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_60%,#eef2f7_100%)] px-5 py-5 shadow-[0_18px_44px_rgba(15,23,42,0.08)] sm:px-6">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold text-slate-900 sm:text-xl">
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
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCcw size={15} strokeWidth={2.2} aria-hidden="true" />
                Obnovit
              </button>
            ) : null}
          </div>

          {!isAllowedAdmin ? (
            <div className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              Tato sekce je dostupná pouze pro {ADMIN_REQUESTS_EMAIL}.
            </div>
          ) : (
            <>
              <div className="mb-4 flex w-fit max-w-full flex-wrap gap-1 overflow-x-auto rounded-full border border-slate-900 bg-slate-950 p-1 shadow-[0_16px_34px_rgba(15,23,42,0.16)]">
                <button
                  type="button"
                  onClick={() => setActiveAdminSection("requests")}
                  className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${
                    activeAdminSection === "requests"
                      ? "bg-white text-slate-950"
                      : "text-white hover:bg-white/10"
                  }`}
                >
                  Žádosti
                </button>
                <button
                  type="button"
                  onClick={() => setActiveAdminSection("createUser")}
                  className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${
                    activeAdminSection === "createUser"
                      ? "bg-white text-slate-950"
                      : "text-white hover:bg-white/10"
                  }`}
                >
                  Přidat uživatele
                </button>
              </div>

              {activeAdminSection === "requests" ? (
                <>
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                    Ukončení spolupráce
                  </h2>
                  <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
                    <input
                      type="search"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Hledat podle jména nebo e-mailu"
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-[0_6px_16px_rgba(15,23,42,0.06)] outline-none transition focus:border-slate-500"
                    />
                    <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-700">
                      <Clock3 size={15} strokeWidth={2.2} aria-hidden="true" />
                      Čeká: <span className="font-semibold text-slate-900">{pendingCount}</span>
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

                  {loading ? (
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-600">
                      Načítám žádosti…
                    </div>
                  ) : filteredRequests.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-600">
                      V této chvíli tu nejsou žádné položky.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {filteredRequests.map((request) => {
                        const pending = request.status === "pending";
                        const busy = busyRequestId === request.id;
                        return (
                          <article
                            key={request.id}
                            className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)]"
                          >
                            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                              <div className="space-y-1">
                                <div className="inline-flex items-center gap-2 text-base font-semibold text-slate-900">
                                  <UserCheck2 size={16} strokeWidth={2.2} aria-hidden="true" />
                                  {request.targetName}
                                </div>
                                <div className="text-sm text-slate-600">{request.targetEmail}</div>
                              </div>
                              <span
                                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${statusPillClass[request.status]}`}
                              >
                                {statusLabel[request.status]}
                              </span>
                            </div>

                            <div className="grid gap-1 text-sm text-slate-700 sm:grid-cols-2">
                              <div>
                                Žádá: <span className="font-medium text-slate-900">{request.requestedByEmail}</span>
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
                      })}
                    </div>
                  )}

                  <div className="my-5 h-px bg-slate-200" />

                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                    Uživatelské žádosti
                  </h2>
                  <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
                    <input
                      type="search"
                      value={userRequestSearch}
                      onChange={(event) => setUserRequestSearch(event.target.value)}
                      placeholder="Hledat podle e-mailu nebo textu"
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-[0_6px_16px_rgba(15,23,42,0.06)] outline-none transition focus:border-slate-500"
                    />
                    <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-700">
                      <Clock3 size={15} strokeWidth={2.2} aria-hidden="true" />
                      Čeká:{" "}
                      <span className="font-semibold text-slate-900">
                        {pendingUserRequestCount}
                      </span>
                    </div>
                  </div>

                  {userRequestsError ? (
                    <div className="mb-3 rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                      {userRequestsError}
                    </div>
                  ) : null}

                  {userRequestsLoading ? (
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-600">
                      Načítám uživatelské žádosti…
                    </div>
                  ) : filteredUserRequests.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-600">
                      Žádný uživatel zatím neposlal obecnou žádost.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {filteredUserRequests.map((request) => {
                        const pending = request.status === "pending";
                        const busy = busyUserRequestId === request.id;
                        const feedbackDraft = userRequestFeedbackDrafts[request.id] ?? "";
                        const passwordDraft = userRequestPasswordDrafts[request.id] ?? "";
                        const isUserCreation = request.subject === "userCreation";

                        return (
                          <article
                            key={request.id}
                            className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)]"
                          >
                            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                              <div className="space-y-1">
                                <div className="text-base font-semibold text-slate-900">
                                  {userRequestSubjectLabel[request.subject]}
                                </div>
                                <div className="text-sm text-slate-600">{request.requesterEmail}</div>
                              </div>
                              <span
                                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${userRequestStatusPillClass[request.status]}`}
                              >
                                {userRequestStatusLabel[request.status]}
                              </span>
                            </div>

                            <div className="grid gap-1 text-sm text-slate-700 sm:grid-cols-2">
                              <div>
                                Priorita:{" "}
                                <span className="font-medium text-slate-900">
                                  {userRequestPriorityLabel[request.priority]}
                                </span>
                              </div>
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
                                        (m) =>
                                          m.id === request.requestedUserDraft?.commissionMode
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
                                    onClick={() =>
                                      void handleUserRequestDecision(request, "accepted")
                                    }
                                    disabled={busy}
                                    className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-700 bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    <Check size={14} strokeWidth={2.3} aria-hidden="true" />
                                    Akceptovat
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleUserRequestDecision(request, "rejected")
                                    }
                                    disabled={busy}
                                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-500 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    <X size={14} strokeWidth={2.3} aria-hidden="true" />
                                    Odmítnout
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="mt-3 rounded-xl border border-slate-300 bg-slate-100 px-3 py-2 text-xs text-slate-700">
                                Zpětná vazba: {request.feedback?.trim() || "Bez zpětné vazby."}
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-600">
                  Pro práci s uživateli přepni na sekci <span className="font-semibold text-slate-900">Přidat uživatele</span>.
                </div>
              )}
            </>
          )}
        </section>

        {isAllowedAdmin && activeAdminSection === "createUser" ? (
          <section className="rounded-3xl border border-slate-300 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_60%,#eef2f7_100%)] px-5 py-5 shadow-[0_18px_44px_rgba(15,23,42,0.08)] sm:px-6">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">
                  <UserPlus size={14} strokeWidth={2} className="text-slate-600" aria-hidden="true" />
                  <span>Přidat uživatele</span>
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Vytvoří Firebase Auth účet, veřejný profil a aktivní interní profil.
                </p>
              </div>
            </div>

            <form
              className="grid gap-3 lg:grid-cols-2"
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
