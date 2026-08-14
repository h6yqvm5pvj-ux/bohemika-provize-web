"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  Apple,
  AtSign,
  ExternalLink,
  Fingerprint,
  HelpCircle,
  History,
  KeyRound,
  Laptop,
  LogOut,
  MonitorSmartphone,
  Pencil,
  Play,
  QrCode as QrCodeIcon,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  X,
} from "lucide-react";

import type { PasskeyCredentialSummary } from "@/app/lib/passkeys";
import { formatDateTime } from "../subscriptionSettings";
import { getPasswordPolicyChecks } from "../passwordPolicy";

const MICROSOFT_AUTHENTICATOR_APP_STORE_URL =
  "https://apps.apple.com/cz/app/microsoft-authenticator/id983156458";
const MICROSOFT_AUTHENTICATOR_GOOGLE_PLAY_URL =
  "https://play.google.com/store/apps/details?id=com.azure.authenticator";
const MFA_CODE_LENGTH = 6;

type InlineStatus = {
  type: "success" | "error" | "info";
  message: string;
};

type AccountSessionSummary = {
  id: string;
  current: boolean;
  status: "active" | "expired" | "revoked";
  deviceLabel: string;
  browserLabel: string;
  osLabel: string;
  userAgent: string;
  locationLabel: string;
  ipLabel: string;
  createdAtMs: number;
  lastSeenAtMs: number;
  expiresAtMs: number;
  revokedAtMs: number | null;
};

type AccountSecurityPanelProps = {
  className: string;
  fieldClass: string;
  userEmail: string;
  userFullName: string;
  mfaEnabled: boolean;
  securityScoreLabel: string;
  securityScorePercent: number;
  passkeySummary: string;
  mfaLastVerifiedAt: string | null;
  showPasswordForm: boolean;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  changingPassword: boolean;
  passwordStatus: InlineStatus | null;
  passkeySupported: boolean;
  passkeyPlatformAvailable: boolean;
  passkeyCredentials: PasskeyCredentialSummary[];
  passkeysLoading: boolean;
  passkeyBusy: boolean;
  passkeyDeletingId: string | null;
  passkeyRenamingId: string | null;
  passkeyName: string;
  passkeyStatus: InlineStatus | null;
  accountSessions: AccountSessionSummary[];
  accountSessionsLoading: boolean;
  accountSessionsBusy: boolean;
  accountSessionsStatus: InlineStatus | null;
  mfaPassword: string;
  mfaBusy: boolean;
  mfaEnrollmentSecretKey: string | null;
  mfaEnrollmentCode: string;
  mfaQrCodeDataUrl: string;
  mfaQrCodeLoading: boolean;
  mfaQrCodeError: string | null;
  mfaQrCodeUri: string;
  mfaDisableConfirmOpen: boolean;
  mfaTotpLabel: string | null;
  mfaStatus: InlineStatus | null;
  onShowPasswordForm: () => void;
  onCancelPasswordChange: () => void;
  onCurrentPasswordChange: (value: string) => void;
  onNewPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onChangePassword: () => void | Promise<void>;
  onRefreshAccountSessions: () => void | Promise<void>;
  onRevokeOtherSessions: () => void | Promise<void>;
  onPasskeyNameChange: (value: string) => void;
  onCreatePasskey: () => void | Promise<void>;
  onDeletePasskey: (credentialId: string) => void | Promise<void>;
  onRenamePasskey: (credentialId: string, name: string) => void | Promise<void>;
  onMfaPasswordChange: (value: string) => void;
  onMfaEnrollmentCodeChange: (value: string) => void;
  onMfaReauthCodeChange: (value: string) => void;
  onStartMfaEnrollment: () => void | Promise<void>;
  onConfirmMfaEnrollment: () => void | Promise<void>;
  onCancelMfaEnrollment: () => void;
  onOpenDisableMfa: () => void;
  onCancelDisableMfa: () => void;
  onDisableMfa: () => void | Promise<void>;
};

const statusClass = (status: InlineStatus): string => {
  if (status.type === "success") return "border-violet-200 bg-violet-50 text-violet-800";
  if (status.type === "info") return "border-slate-200 bg-white text-slate-700";
  return "border-rose-200 bg-rose-50 text-rose-700";
};

export function AccountSecurityPanel({
  className,
  fieldClass,
  userEmail,
  userFullName,
  mfaEnabled,
  securityScoreLabel,
  securityScorePercent,
  passkeySummary,
  mfaLastVerifiedAt,
  showPasswordForm,
  currentPassword,
  newPassword,
  confirmPassword,
  changingPassword,
  passwordStatus,
  passkeySupported,
  passkeyPlatformAvailable,
  passkeyCredentials,
  passkeysLoading,
  passkeyBusy,
  passkeyDeletingId,
  passkeyRenamingId,
  passkeyName,
  passkeyStatus,
  accountSessions,
  accountSessionsLoading,
  accountSessionsBusy,
  accountSessionsStatus,
  mfaPassword,
  mfaBusy,
  mfaEnrollmentSecretKey,
  mfaEnrollmentCode,
  mfaQrCodeDataUrl,
  mfaQrCodeLoading,
  mfaQrCodeError,
  mfaQrCodeUri,
  mfaDisableConfirmOpen,
  mfaTotpLabel,
  mfaStatus,
  onShowPasswordForm,
  onCancelPasswordChange,
  onCurrentPasswordChange,
  onNewPasswordChange,
  onConfirmPasswordChange,
  onChangePassword,
  onRefreshAccountSessions,
  onRevokeOtherSessions,
  onPasskeyNameChange,
  onCreatePasskey,
  onDeletePasskey,
  onRenamePasskey,
  onMfaPasswordChange,
  onMfaEnrollmentCodeChange,
  onMfaReauthCodeChange,
  onStartMfaEnrollment,
  onConfirmMfaEnrollment,
  onCancelMfaEnrollment,
  onOpenDisableMfa,
  onCancelDisableMfa,
  onDisableMfa,
}: AccountSecurityPanelProps) {
  const [passkeyHelpOpen, setPasskeyHelpOpen] = useState(false);
  const [sessionHistoryOpen, setSessionHistoryOpen] = useState(false);
  const [editingPasskeyId, setEditingPasskeyId] = useState<string | null>(null);
  const [editingPasskeyName, setEditingPasskeyName] = useState("");
  const mfaReauthInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [mfaReauthDigits, setMfaReauthDigits] = useState<string[]>(() =>
    Array.from({ length: MFA_CODE_LENGTH }, () => "")
  );
  const passwordPolicyChecks = useMemo(
    () =>
      getPasswordPolicyChecks({
        password: newPassword,
        confirmPassword,
        userFullName,
        userEmail,
      }),
    [confirmPassword, newPassword, userEmail, userFullName]
  );
  const passwordInputTouched = newPassword.length > 0 || confirmPassword.length > 0;
  const passwordPolicyPassed = passwordPolicyChecks.every((check) => check.passed);
  const passwordSubmitDisabled =
    changingPassword || currentPassword.length === 0 || !passwordPolicyPassed;
  const activeAccountSessions = accountSessions.filter((session) => session.status === "active");
  const historicalAccountSessions = accountSessions.filter(
    (session) => session.status !== "active"
  );
  const otherSessionsCount = activeAccountSessions.filter((session) => !session.current).length;
  const revokeOtherSessionsDisabled = accountSessionsBusy || accountSessionsLoading;
  const mfaLastVerifiedAtMs = mfaLastVerifiedAt ? Date.parse(mfaLastVerifiedAt) : Number.NaN;
  const mfaLastVerifiedLabel = Number.isFinite(mfaLastVerifiedAtMs)
    ? formatDateTime(mfaLastVerifiedAtMs)
    : "Zatím nezaznamenáno";

  const updateMfaReauthDigits = (nextDigits: string[]) => {
    setMfaReauthDigits(nextDigits);
    onMfaReauthCodeChange(nextDigits.join(""));
  };

  const resetMfaReauthDigits = () => {
    setMfaReauthDigits(Array.from({ length: MFA_CODE_LENGTH }, () => ""));
  };

  const handleOpenDisableMfa = () => {
    resetMfaReauthDigits();
    onOpenDisableMfa();
  };

  const handleCancelDisableMfa = () => {
    resetMfaReauthDigits();
    onCancelDisableMfa();
  };

  const focusMfaReauthInput = (index: number) => {
    mfaReauthInputRefs.current[Math.max(0, Math.min(index, MFA_CODE_LENGTH - 1))]?.focus();
  };

  const handleMfaReauthDigitChange = (index: number, rawValue: string) => {
    const digits = rawValue.replace(/\D/g, "").slice(0, MFA_CODE_LENGTH - index);
    const nextDigits = [...mfaReauthDigits];

    if (!digits) {
      nextDigits[index] = "";
      updateMfaReauthDigits(nextDigits);
      return;
    }

    digits.split("").forEach((digit, offset) => {
      nextDigits[index + offset] = digit;
    });
    updateMfaReauthDigits(nextDigits);
    focusMfaReauthInput(Math.min(index + digits.length, MFA_CODE_LENGTH - 1));
  };

  return (
    <section className={`space-y-4 sm:space-y-5 ${className}`}>
      <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#0b0717_0%,#7c3aed_56%,#c084fc_100%)]" />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">
            <ShieldCheck size={14} strokeWidth={2} className="text-slate-600" aria-hidden="true" />
            <span>Zabezpečení</span>
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Přihlašovací údaje, heslo a druhý faktor pro tento účet.
          </p>
        </div>
        <span
          className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] ${
            mfaEnabled
              ? "border-violet-200 bg-violet-50 text-violet-800"
              : "border-slate-200 bg-slate-50 text-slate-700"
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${mfaEnabled ? "bg-violet-700" : "bg-slate-500"}`}
            aria-hidden="true"
          />
          2FA {mfaEnabled ? "zapnuto" : "vypnuto"}
        </span>
      </div>

      <div className="grid gap-2.5 sm:gap-3 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-[18px] border border-slate-200 bg-white px-3 py-3 shadow-[0_8px_18px_rgba(15,23,42,0.04)] sm:rounded-[22px] sm:px-4 sm:py-4 sm:shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Stav ochrany
              </p>
              <p className="mt-1 text-xl font-black text-slate-950 sm:text-2xl">{securityScoreLabel}</p>
            </div>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-white sm:h-11 sm:w-11 sm:rounded-2xl">
              <ShieldCheck size={21} strokeWidth={2.2} aria-hidden="true" />
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#0f172a_0%,#7c3aed_100%)]"
              style={{ width: `${securityScorePercent}%` }}
            />
          </div>
        </article>

        <article className="rounded-[18px] border border-slate-200 bg-white px-3 py-3 shadow-[0_8px_18px_rgba(15,23,42,0.04)] sm:rounded-[22px] sm:px-4 sm:py-4 sm:shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Automatické odhlášení
          </p>
          <p className="mt-2 text-lg font-black text-slate-950 sm:text-xl">12 hodin</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Neaktivní relace se sama ukončí.
          </p>
        </article>

        <article className="rounded-[18px] border border-slate-200 bg-white px-3 py-3 shadow-[0_8px_18px_rgba(15,23,42,0.04)] sm:rounded-[22px] sm:px-4 sm:py-4 sm:shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Dvoufaktor
          </p>
          <p className={`mt-2 text-lg font-black sm:text-xl ${mfaEnabled ? "text-violet-800" : "text-slate-700"}`}>
            {mfaEnabled ? "Zapnuto" : "Vypnuto"}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            {mfaEnabled ? `Naposledy ověřeno ${mfaLastVerifiedLabel}.` : "Microsoft Authenticator."}
          </p>
        </article>

        <article className="rounded-[18px] border border-slate-200 bg-white px-3 py-3 shadow-[0_8px_18px_rgba(15,23,42,0.04)] sm:rounded-[22px] sm:px-4 sm:py-4 sm:shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Přístupový klíč
          </p>
          <p className={`mt-2 text-lg font-black sm:text-xl ${passkeyCredentials.length > 0 ? "text-violet-800" : "text-slate-950"}`}>
            {passkeySummary}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Face ID, Touch ID nebo PIN zařízení.
          </p>
        </article>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(430px,1.08fr)_minmax(340px,0.92fr)] xl:items-start">
        <div className="order-2 space-y-4 xl:order-2">
          <div className="rounded-[20px] border border-slate-200 bg-white p-3.5 shadow-[0_10px_24px_rgba(15,23,42,0.05)] sm:rounded-[24px] sm:p-4 sm:shadow-[0_14px_30px_rgba(15,23,42,0.06)]">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 sm:h-11 sm:w-11 sm:rounded-2xl">
                <AtSign size={20} strokeWidth={2} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  E-mail účtu
                </div>
                <div className="mt-1 break-all text-base font-bold text-slate-950">{userEmail}</div>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  Hlavní odhlášení najdeš v navigaci aplikace.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-[20px] border border-slate-200 bg-white p-3.5 shadow-[0_10px_24px_rgba(15,23,42,0.05)] sm:rounded-[24px] sm:p-4 sm:shadow-[0_14px_30px_rgba(15,23,42,0.06)]">
            <div>
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <KeyRound size={12} strokeWidth={2} className="text-slate-500" aria-hidden="true" />
                  <span>Změna hesla</span>
                </div>
                {!showPasswordForm && (
                  <span className="text-xs text-slate-500">Ověření původním heslem</span>
                )}
              </div>

              <button
                type="button"
                onClick={onShowPasswordForm}
                className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-slate-900 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(15,23,42,0.16)] transition hover:bg-black sm:min-h-[48px] sm:rounded-2xl sm:py-3 sm:shadow-[0_12px_24px_rgba(15,23,42,0.18)]"
              >
                <KeyRound size={15} strokeWidth={2} className="shrink-0" aria-hidden="true" />
                Změnit heslo
              </button>

              {passwordStatus && !showPasswordForm ? (
                <div
                  className={`mt-2 rounded-2xl border px-3 py-2 text-xs font-semibold ${statusClass(passwordStatus)}`}
                >
                  {passwordStatus.message}
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-[20px] border border-slate-200 bg-white p-3.5 shadow-[0_10px_24px_rgba(15,23,42,0.05)] sm:rounded-[24px] sm:p-4 sm:shadow-[0_14px_30px_rgba(15,23,42,0.06)]">
            <div>
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <Fingerprint size={13} strokeWidth={2} className="text-slate-500" aria-hidden="true" />
                    <span>Přístupový klíč</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPasskeyHelpOpen(true)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                    aria-label="Co je přístupový klíč?"
                  >
                    <HelpCircle size={14} strokeWidth={2} aria-hidden="true" />
                  </button>
                </div>
                <span
                  className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                    passkeyCredentials.length > 0
                      ? "border-violet-200 bg-violet-50 text-violet-800"
                      : "border-slate-200 bg-slate-50 text-slate-500"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      passkeyCredentials.length > 0 ? "bg-violet-700" : "bg-slate-400"
                    }`}
                    aria-hidden="true"
                  />
                  {passkeyCredentials.length > 0 ? "Aktivní" : "Nenastaveno"}
                </span>
              </div>

              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:rounded-2xl">
                {passkeySupported ? (
                  <>
                    <input
                      type="text"
                      className={fieldClass}
                      placeholder={passkeyPlatformAvailable ? "Název zařízení (např. iPhone)" : "Název přístupového klíče"}
                      value={passkeyName}
                      onChange={(event) => onPasskeyNameChange(event.target.value)}
                      disabled={passkeyBusy}
                    />
                    <button
                      type="button"
                      onClick={() => void onCreatePasskey()}
                      disabled={passkeyBusy}
                      className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-900 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60 sm:rounded-2xl"
                    >
                      <Fingerprint size={16} strokeWidth={2} aria-hidden="true" />
                      {passkeyBusy ? "Otevírám ověření…" : "Zapnout přístupový klíč"}
                    </button>
                  </>
                ) : (
                  <div className="rounded-2xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-800">
                    Tento prohlížeč přístupové klíče nepodporuje.
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    <span>Uložené přístupové klíče</span>
                    {passkeysLoading ? <span>Načítám…</span> : null}
                  </div>

                  {!passkeysLoading && passkeyCredentials.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
                      Zatím není uložený žádný přístupový klíč.
                    </div>
                  ) : null}

                  {passkeyCredentials.map((credential) => {
                    const normalizedName = credential.name.toLocaleLowerCase("cs-CZ");
                    const DeviceIcon = /iphone|android|telefon|phone|mobil|ipad|tablet/.test(normalizedName)
                      ? Smartphone
                      : /mac|book|notebook|pc|windows|linux/.test(normalizedName)
                        ? Laptop
                        : KeyRound;
                    const isEditing = editingPasskeyId === credential.credentialId;
                    const isRenaming = passkeyRenamingId === credential.credentialId;

                    return (
                      <div
                        key={credential.credentialId}
                        className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 sm:rounded-2xl"
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-violet-100 bg-violet-50 text-violet-700">
                            <DeviceIcon size={17} strokeWidth={2.2} aria-hidden="true" />
                          </span>
                          <div className="min-w-0 flex-1">
                            {isEditing ? (
                              <div className="flex flex-col gap-2 sm:flex-row">
                                <input
                                  type="text"
                                  value={editingPasskeyName}
                                  onChange={(event) => setEditingPasskeyName(event.target.value.slice(0, 80))}
                                  className="min-w-0 flex-1 rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-violet-600 focus:ring-2 focus:ring-violet-100"
                                  aria-label="Název přístupového klíče"
                                  autoFocus
                                />
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void (async () => {
                                        try {
                                          await onRenamePasskey(
                                            credential.credentialId,
                                            editingPasskeyName
                                          );
                                          setEditingPasskeyId(null);
                                        } catch {
                                          // Chybu zobrazí nadřazená obrazovka; formulář necháme otevřený.
                                        }
                                      })();
                                    }}
                                    disabled={isRenaming || editingPasskeyName.trim().length === 0}
                                    className="inline-flex min-h-9 items-center justify-center rounded-xl bg-violet-700 px-3 text-xs font-bold text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {isRenaming ? "Ukládám…" : "Uložit"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingPasskeyId(null)}
                                    disabled={isRenaming}
                                    className="inline-flex min-h-9 items-center justify-center rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    Zrušit
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <div className="truncate text-sm font-semibold text-slate-900">{credential.name}</div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingPasskeyId(credential.credentialId);
                                    setEditingPasskeyName(credential.name);
                                  }}
                                  className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold text-violet-700 transition hover:bg-violet-50"
                                >
                                  <Pencil size={11} strokeWidth={2.2} aria-hidden="true" />
                                  Přejmenovat
                                </button>
                              </div>
                            )}
                            <div className="mt-1 text-[11px] text-slate-500">
                              Přidáno {formatDateTime(credential.createdAtMs)}
                              {credential.lastUsedAtMs
                                ? ` · použito ${formatDateTime(credential.lastUsedAtMs)}`
                                : ""}
                            </div>
                          </div>
                        </div>
                        {!isEditing ? (
                          <button
                            type="button"
                            onClick={() => void onDeletePasskey(credential.credentialId)}
                            disabled={passkeyDeletingId === credential.credentialId}
                            className="inline-flex min-h-[36px] w-fit shrink-0 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60 sm:self-end"
                          >
                            {passkeyDeletingId === credential.credentialId ? "Odebírám…" : "Odebrat"}
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                {passkeyStatus && (
                  <div className={`rounded-2xl border px-3 py-2 text-xs ${statusClass(passkeyStatus)}`}>
                    {passkeyStatus.message}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="order-1 space-y-4 xl:order-1">
        <div className="overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-[0_12px_28px_rgba(15,23,42,0.06)] sm:rounded-[24px] sm:shadow-[0_18px_36px_rgba(15,23,42,0.08)]">
          <div className="border-b border-slate-100 bg-[linear-gradient(135deg,#ffffff_0%,#fafafa_62%,#f5f3ff_100%)] px-3.5 py-4 sm:px-5 sm:py-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-violet-100 bg-violet-50 text-violet-800 sm:h-11 sm:w-11 sm:rounded-2xl">
                  <ShieldCheck size={22} strokeWidth={2.2} aria-hidden="true" />
                </span>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Ověřovací aplikace
                  </div>
                  <h3 className="mt-0.5 text-lg font-black leading-tight tracking-normal text-slate-950">
                    Microsoft Authenticator
                  </h3>
                  <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-500">
                    {mfaEnabled
                      ? "Druhý faktor je aktivní a chrání přihlášení k účtu."
                      : "Pro přihlášení budeš potvrzovat jednorázový kód z aplikace."}
                  </p>
                </div>
              </div>
              <span
                className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                  mfaEnabled
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-slate-200 bg-slate-50 text-slate-600"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${mfaEnabled ? "bg-emerald-500" : "bg-slate-400"}`}
                  aria-hidden="true"
                />
                {mfaEnabled ? "Zapnuto" : "Vypnuto"}
              </span>
            </div>

            {!mfaEnabled && !mfaEnrollmentSecretKey ? (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="mr-1 text-xs text-slate-500">Stáhnout aplikaci:</span>
                <a
                  href={MICROSOFT_AUTHENTICATOR_APP_STORE_URL}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Otevřít Microsoft Authenticator v App Store"
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-800"
                >
                  <Apple size={14} strokeWidth={2.2} aria-hidden="true" />
                  App Store
                  <ExternalLink size={12} strokeWidth={2} aria-hidden="true" />
                </a>
                <a
                  href={MICROSOFT_AUTHENTICATOR_GOOGLE_PLAY_URL}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Otevřít Microsoft Authenticator v Google Play"
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-800"
                >
                  <Play size={13} strokeWidth={2.2} fill="currentColor" aria-hidden="true" />
                  Google Play
                  <ExternalLink size={12} strokeWidth={2} aria-hidden="true" />
                </a>
              </div>
            ) : null}
          </div>

          <div className="space-y-3 px-3.5 py-4 sm:px-5 sm:py-5">
            {!mfaEnabled && !mfaEnrollmentSecretKey && (
              <>
                <input
                  type="password"
                  autoComplete="current-password"
                  className={fieldClass}
                  placeholder="Aktuální heslo pro potvrzení"
                  value={mfaPassword}
                  onChange={(event) => onMfaPasswordChange(event.target.value)}
                />
                <button
                  type="button"
                  onClick={() => void onStartMfaEnrollment()}
                  disabled={mfaBusy}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-slate-950 bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(15,23,42,0.18)] transition hover:-translate-y-0.5 hover:bg-black disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 sm:min-h-[48px] sm:rounded-2xl sm:shadow-[0_12px_24px_rgba(15,23,42,0.22)]"
                >
                  {mfaBusy ? "Spouštím 2FA…" : "Zapnout 2FA"}
                </button>
              </>
            )}

            {mfaEnrollmentSecretKey && (
              <div className="space-y-3 rounded-xl border border-violet-200 bg-violet-50/70 p-3 sm:rounded-2xl">
                <div className="flex items-start gap-2 text-xs leading-relaxed text-slate-700">
                  <QrCodeIcon
                    size={16}
                    strokeWidth={2}
                    className="mt-0.5 shrink-0 text-violet-800"
                    aria-hidden="true"
                  />
                  <span>V Microsoft Authenticator zvol Přidat účet a naskenuj QR kód.</span>
                </div>

                <div className="flex flex-col items-center gap-2 rounded-2xl border border-violet-200 bg-white px-3 py-3">
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
                      className="rounded-xl border border-slate-200 bg-white p-1 shadow-sm"
                    />
                  )}
                  {mfaQrCodeError && <p className="text-xs text-rose-700">{mfaQrCodeError}</p>}
                  <p className="text-center text-[11px] text-slate-500">
                    Pokud skenování nefunguje, použij setup key níže.
                  </p>
                </div>

                <div className="rounded-2xl border border-violet-200 bg-white px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Setup key
                  </div>
                  <div className="mt-1 break-all text-xs font-semibold text-slate-900">
                    {mfaEnrollmentSecretKey}
                  </div>
                </div>

                <details className="rounded-2xl border border-violet-200 bg-white px-3 py-2">
                  <summary className="cursor-pointer text-[11px] font-semibold text-slate-700">
                    Zobrazit QR URI (pokročilé)
                  </summary>
                  <p className="mt-2 break-all text-[10px] text-slate-600">{mfaQrCodeUri}</p>
                </details>

                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className={fieldClass}
                  placeholder="6místný kód z aplikace"
                  value={mfaEnrollmentCode}
                  onChange={(event) =>
                    onMfaEnrollmentCodeChange(event.target.value.replace(/\D/g, "").slice(0, 8))
                  }
                />

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    onClick={() => void onConfirmMfaEnrollment()}
                    disabled={mfaBusy}
                    className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-violet-700 bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:rounded-2xl"
                  >
                    {mfaBusy ? "Potvrzuji…" : "Potvrdit a zapnout"}
                  </button>
                  <button
                    type="button"
                    onClick={onCancelMfaEnrollment}
                    className="inline-flex min-h-[36px] items-center justify-center rounded-xl px-3 text-xs font-semibold text-slate-500 transition hover:bg-white hover:text-slate-900"
                  >
                    Zrušit
                  </button>
                </div>
              </div>
            )}

            {mfaEnabled && !mfaEnrollmentSecretKey && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/75 px-3 py-3 sm:rounded-2xl">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700">
                      <ShieldCheck size={16} strokeWidth={2.2} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">
                        {mfaTotpLabel || "Microsoft Authenticator"}
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                        Kód z aplikace se vyžaduje při přihlášení přes heslo.
                      </p>
                      <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-violet-100 bg-white px-2.5 py-1 text-[11px] font-semibold text-violet-800">
                        <History size={12} strokeWidth={2.2} aria-hidden="true" />
                        Poslední ověření: {mfaLastVerifiedLabel}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenDisableMfa}
                    disabled={mfaBusy}
                    className="inline-flex min-h-9 w-fit shrink-0 items-center justify-center rounded-full border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Vypnout 2FA
                  </button>
                </div>
              </div>
            )}

            {mfaStatus && !mfaDisableConfirmOpen && (
              <div className={`rounded-2xl border px-3 py-2 text-xs ${statusClass(mfaStatus)}`}>
                {mfaStatus.message}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-[20px] border border-slate-200 bg-white p-3.5 shadow-[0_10px_24px_rgba(15,23,42,0.05)] sm:rounded-[24px] sm:p-4 sm:shadow-[0_14px_30px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-violet-100 bg-violet-50 text-violet-800">
                <MonitorSmartphone size={18} strokeWidth={2.2} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                  Zařízení a relace
                </p>
                <h3 className="mt-1 text-lg font-black text-slate-950">
                  Aktuální přihlášení
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  Zařízení, kde je účet právě přihlášený. Starší relace najdeš v historii.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void onRefreshAccountSessions()}
              disabled={accountSessionsLoading || accountSessionsBusy}
              className="inline-flex min-h-9 w-fit items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw
                size={13}
                strokeWidth={2.2}
                className={accountSessionsLoading ? "animate-spin" : ""}
                aria-hidden="true"
              />
              Obnovit
            </button>
          </div>

          <div className="mt-4 space-y-3 rounded-[18px] border border-slate-200 bg-slate-50 p-3">
            {accountSessionsLoading ? (
              <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-500">
                Načítám zařízení…
              </div>
            ) : accountSessions.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-500">
                Zatím není evidované žádné zařízení.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                    <span>Aktuálně přihlášeno</span>
                    <span>{activeAccountSessions.length}</span>
                  </div>

                  {activeAccountSessions.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-500">
                      Momentálně není evidovaná žádná aktivní relace.
                    </div>
                  ) : (
                    <div className="grid gap-2">
                      {activeAccountSessions.map((session) => (
                        <div
                          key={session.id}
                          className={`rounded-2xl border px-3 py-3 ${
                            session.current
                              ? "border-violet-200 bg-violet-50"
                              : "border-slate-200 bg-white"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="min-w-0 break-words text-sm font-bold text-slate-950">
                                  {session.deviceLabel}
                                </p>
                                {session.current ? (
                                  <span className="rounded-full border border-violet-200 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-violet-800">
                                    Toto zařízení
                                  </span>
                                ) : null}
                              </div>
                              <div className="mt-2 grid gap-1 text-[11px] leading-relaxed text-slate-500 sm:grid-cols-2">
                                <p>
                                  <span className="font-semibold text-slate-600">Naposledy:</span>{" "}
                                  {formatDateTime(session.lastSeenAtMs)}
                                </p>
                                <p>
                                  <span className="font-semibold text-slate-600">Platí do:</span>{" "}
                                  {formatDateTime(session.expiresAtMs)}
                                </p>
                                <p className="sm:col-span-2">
                                  <span className="font-semibold text-slate-600">Odkud:</span>{" "}
                                  {session.locationLabel || "Lokace není dostupná"}
                                </p>
                                <p className="sm:col-span-2">
                                  <span className="font-semibold text-slate-600">IP:</span>{" "}
                                  {session.ipLabel || "IP není dostupná"}
                                </p>
                              </div>
                            </div>
                            <span
                              className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                                session.current ? "bg-violet-700" : "bg-emerald-500"
                              }`}
                              aria-hidden="true"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setSessionHistoryOpen(true)}
                  className="inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-800"
                >
                  <History size={16} strokeWidth={2.2} aria-hidden="true" />
                  Zobrazit historii zařízení ({historicalAccountSessions.length})
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => void onRevokeOtherSessions()}
              disabled={revokeOtherSessionsDisabled}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-bold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <LogOut size={16} strokeWidth={2.2} aria-hidden="true" />
              {accountSessionsBusy
                ? "Odhlašuji…"
                : otherSessionsCount > 0
                  ? `Odhlásit ostatní zařízení (${otherSessionsCount})`
                  : "Odhlásit ostatní zařízení"}
            </button>

            {accountSessionsStatus ? (
              <div
                className={`rounded-2xl border px-3 py-2 text-xs font-semibold ${statusClass(accountSessionsStatus)}`}
              >
                {accountSessionsStatus.message}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      </div>
      {showPasswordForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-3 py-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-md"
            aria-label="Zavřít změnu hesla"
            onClick={changingPassword ? undefined : onCancelPasswordChange}
          />
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="change-password-title"
            className="relative z-10 max-h-[calc(100dvh-1rem)] w-full max-w-xl overflow-y-auto rounded-[24px] border border-slate-200 bg-white shadow-[0_28px_90px_rgba(2,6,23,0.42)] sm:rounded-[30px]"
            onSubmit={(event) => {
              event.preventDefault();
              if (!passwordSubmitDisabled) void onChangePassword();
            }}
          >
            <div className="settings-password-modal-hero relative overflow-hidden bg-[#0b0717] px-4 py-4 text-white sm:px-5">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#0b0717_0%,#7c3aed_56%,#c084fc_100%)]" />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,rgba(124,58,237,0.22)_0%,rgba(11,7,23,0)_46%,rgba(168,85,247,0.16)_100%)]" />
              <div className="relative z-10 flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white text-slate-950">
                    <KeyRound size={18} strokeWidth={2.2} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-violet-100/70">
                      Změna hesla
                    </p>
                    <h3 id="change-password-title" className="mt-1 text-xl font-black text-white">
                      Nastavit nové heslo
                    </h3>
                    <p className="mt-1 text-xs font-semibold leading-relaxed text-violet-100/75">
                      Změnu potvrdíš původním heslem. Nové heslo musí splnit bezpečnostní zásady.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onCancelPasswordChange}
                  disabled={changingPassword}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Zavřít změnu hesla"
                >
                  <X size={16} strokeWidth={2.2} aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="space-y-4 px-4 py-4 sm:px-5 sm:py-5">
              <div className="space-y-3">
                <input
                  type="password"
                  autoComplete="current-password"
                  className={fieldClass}
                  placeholder="Původní heslo"
                  value={currentPassword}
                  onChange={(event) => onCurrentPasswordChange(event.target.value)}
                  disabled={changingPassword}
                />
                <input
                  type="password"
                  autoComplete="new-password"
                  className={fieldClass}
                  placeholder="Nové heslo"
                  value={newPassword}
                  onChange={(event) => onNewPasswordChange(event.target.value)}
                  disabled={changingPassword}
                />
                <input
                  type="password"
                  autoComplete="new-password"
                  className={fieldClass}
                  placeholder="Potvrď nové heslo"
                  value={confirmPassword}
                  onChange={(event) => onConfirmPasswordChange(event.target.value)}
                  disabled={changingPassword}
                />
              </div>

              <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-3 py-3">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                  Zásady bezpečného hesla
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {passwordPolicyChecks.map((check) => {
                    const failed = passwordInputTouched && !check.passed;
                    return (
                      <div
                        key={check.id}
                        className={`flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-semibold ${
                          check.passed
                            ? "border-violet-200 bg-violet-50 text-violet-800"
                            : failed
                              ? "border-rose-200 bg-rose-50 text-rose-700"
                              : "border-slate-200 bg-white text-slate-600"
                        }`}
                      >
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-black ${
                            check.passed
                              ? "bg-violet-700 text-white"
                              : failed
                                ? "bg-rose-100 text-rose-700"
                                : "bg-slate-100 text-slate-400"
                          }`}
                          aria-hidden="true"
                        >
                          {check.passed ? "✓" : "•"}
                        </span>
                        <span>{check.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {passwordStatus ? (
                <div
                  className={`rounded-2xl border px-3 py-2 text-xs font-semibold ${statusClass(passwordStatus)}`}
                >
                  {passwordStatus.message}
                </div>
              ) : null}
            </div>

            <div className="flex flex-col gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-5">
              <button
                type="button"
                onClick={onCancelPasswordChange}
                disabled={changingPassword}
                className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Zrušit
              </button>
              <button
                type="submit"
                disabled={passwordSubmitDisabled}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-violet-700 bg-violet-700 px-5 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(109,40,217,0.24)] transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <KeyRound size={15} strokeWidth={2.2} aria-hidden="true" />
                {changingPassword ? "Měním heslo..." : "Potvrdit změnu"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {sessionHistoryOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-3 py-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-md"
            aria-label="Zavřít historii zařízení"
            onClick={() => setSessionHistoryOpen(false)}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="session-history-title"
            className="relative z-10 max-h-[calc(100dvh-1rem)] w-full max-w-3xl overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_28px_90px_rgba(2,6,23,0.42)] sm:rounded-[30px]"
          >
            <div className="relative overflow-hidden bg-[#0b0717] px-4 py-4 text-white sm:px-5">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#0b0717_0%,#7c3aed_56%,#c084fc_100%)]" />
              <div className="relative z-10 flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-white">
                    <History size={18} strokeWidth={2.2} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-violet-100/70">
                      Historie zařízení
                    </p>
                    <h3 id="session-history-title" className="mt-1 text-xl font-black text-white">
                      Starší přihlášení
                    </h3>
                    <p className="mt-1 text-xs font-semibold leading-relaxed text-violet-100/75">
                      U nových relací ukládáme přibližnou lokaci a maskovanou IP adresu.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSessionHistoryOpen(false)}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition hover:bg-white/15"
                  aria-label="Zavřít historii zařízení"
                >
                  <X size={16} strokeWidth={2.2} aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="max-h-[calc(100dvh-12rem)] overflow-y-auto px-4 py-4 sm:px-5">
              {historicalAccountSessions.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                  Zatím tu není žádná starší relace.
                </div>
              ) : (
                <div className="space-y-2">
                  {historicalAccountSessions.map((session) => (
                    <div
                      key={session.id}
                      className="rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-[0_8px_18px_rgba(15,23,42,0.04)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="min-w-0 break-words text-sm font-bold text-slate-950">
                              {session.deviceLabel}
                            </p>
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                              {session.status === "revoked" ? "Odhlášeno" : "Vypršelo"}
                            </span>
                          </div>
                          <div className="mt-2 grid gap-1 text-[11px] leading-relaxed text-slate-500 sm:grid-cols-2">
                            <p>
                              <span className="font-semibold text-slate-600">Naposledy:</span>{" "}
                              {formatDateTime(session.lastSeenAtMs)}
                            </p>
                            <p>
                              <span className="font-semibold text-slate-600">
                                {session.status === "revoked" ? "Odhlášeno:" : "Platilo do:"}
                              </span>{" "}
                              {formatDateTime(session.revokedAtMs ?? session.expiresAtMs)}
                            </p>
                            <p>
                              <span className="font-semibold text-slate-600">Odkud:</span>{" "}
                              {session.locationLabel || "Lokace není dostupná"}
                            </p>
                            <p>
                              <span className="font-semibold text-slate-600">IP:</span>{" "}
                              {session.ipLabel || "IP není dostupná"}
                            </p>
                          </div>
                        </div>
                        <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-slate-300" aria-hidden="true" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}
      {mfaDisableConfirmOpen ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-3 py-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-md"
            aria-label="Zavřít vypnutí 2FA"
            onClick={mfaBusy ? undefined : handleCancelDisableMfa}
          />
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="disable-mfa-title"
            className="relative z-10 w-full max-w-lg overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_28px_90px_rgba(2,6,23,0.42)] sm:rounded-[30px]"
            onSubmit={(event) => {
              event.preventDefault();
              if (!mfaBusy) void onDisableMfa();
            }}
          >
            <div className="relative overflow-hidden bg-[#1c0710] px-4 py-4 !text-white sm:px-5">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#1c0710_0%,#e11d48_56%,#fb7185_100%)]" />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,rgba(244,63,94,0.22)_0%,rgba(28,7,16,0)_48%,rgba(251,113,133,0.12)_100%)]" />
              <div className="relative z-10 flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/10 !text-white [&_svg]:!stroke-white">
                    <ShieldCheck size={18} strokeWidth={2.2} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-black uppercase tracking-[0.16em] !text-rose-100/85">
                      Zabezpečení účtu
                    </p>
                    <h3 id="disable-mfa-title" className="mt-1 text-xl font-black !text-white">
                      Vypnout dvoufázové ověření?
                    </h3>
                    <p className="mt-1 text-xs font-semibold leading-relaxed !text-rose-100/90">
                      Přihlašování přes heslo už nebude chráněné kódem z aplikace.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCancelDisableMfa}
                  disabled={mfaBusy}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 !text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:!stroke-white"
                  aria-label="Zavřít vypnutí 2FA"
                >
                  <X size={16} strokeWidth={2.2} aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="space-y-4 px-4 py-4 sm:px-5 sm:py-5">
              <div className="rounded-2xl border border-rose-100 bg-rose-50/60 px-3 py-2.5 text-xs leading-relaxed text-slate-600">
                <span className="font-semibold text-slate-800">Aktivní faktor: </span>
                {mfaTotpLabel || "Microsoft Authenticator"}
              </div>
              <p className="text-sm leading-relaxed text-slate-600">
                Pro vypnutí potvrď svou identitu aktuálním heslem a šestimístným kódem
                z Microsoft Authenticatoru.
              </p>
              <div className="space-y-3">
                <input
                  type="password"
                  autoComplete="current-password"
                  className={fieldClass}
                  placeholder="Aktuální heslo"
                  value={mfaPassword}
                  onChange={(event) => onMfaPasswordChange(event.target.value)}
                  disabled={mfaBusy}
                  autoFocus
                />
                <div>
                  <p className="mb-2 text-xs font-semibold text-slate-700">Ověřovací kód</p>
                  <div
                    className="flex max-w-[320px] items-center justify-between gap-1.5 sm:gap-2"
                    role="group"
                    aria-label="Šestimístný ověřovací kód z aplikace Microsoft Authenticator"
                  >
                    {mfaReauthDigits.map((digit, index) => (
                      <input
                        key={index}
                        ref={(element) => {
                          mfaReauthInputRefs.current[index] = element;
                        }}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        autoComplete={index === 0 ? "one-time-code" : "off"}
                        maxLength={index === 0 ? undefined : 1}
                        className="h-12 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white text-center text-xl font-bold text-slate-950 outline-none transition placeholder:text-slate-300 focus:border-rose-500 focus:ring-4 focus:ring-rose-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 sm:h-14 sm:text-2xl"
                        aria-label={`Číslice ${index + 1} z ${MFA_CODE_LENGTH}`}
                        value={digit}
                        onChange={(event) => handleMfaReauthDigitChange(index, event.target.value)}
                        onPaste={(event) => {
                          event.preventDefault();
                          handleMfaReauthDigitChange(index, event.clipboardData.getData("text"));
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Backspace" && !mfaReauthDigits[index] && index > 0) {
                            focusMfaReauthInput(index - 1);
                          }
                          if (event.key === "ArrowLeft" && index > 0) {
                            event.preventDefault();
                            focusMfaReauthInput(index - 1);
                          }
                          if (event.key === "ArrowRight" && index < MFA_CODE_LENGTH - 1) {
                            event.preventDefault();
                            focusMfaReauthInput(index + 1);
                          }
                        }}
                        onFocus={(event) => event.currentTarget.select()}
                        disabled={mfaBusy}
                      />
                    ))}
                  </div>
                </div>
              </div>
              {mfaStatus ? (
                <div className={`rounded-2xl border px-3 py-2 text-xs ${statusClass(mfaStatus)}`}>
                  {mfaStatus.message}
                </div>
              ) : null}
            </div>

            <div className="flex flex-col gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-5">
              <button
                type="button"
                onClick={handleCancelDisableMfa}
                disabled={mfaBusy}
                className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Zrušit
              </button>
              <button
                type="submit"
                disabled={mfaBusy}
                className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-rose-700 bg-rose-600 px-5 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(225,29,72,0.22)] transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {mfaBusy ? "Vypínám 2FA…" : "Vypnout 2FA"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {passkeyHelpOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-3 py-4">
          <div className="max-h-[calc(100dvh-1rem)] w-full max-w-lg overflow-y-auto rounded-[22px] border border-slate-200 bg-white shadow-[0_24px_64px_rgba(15,23,42,0.32)] sm:rounded-[28px] sm:shadow-[0_28px_80px_rgba(15,23,42,0.35)]">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:gap-4 sm:px-5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-violet-200 bg-violet-50 text-violet-800 sm:h-10 sm:w-10 sm:rounded-2xl">
                  <Fingerprint size={18} strokeWidth={2.2} aria-hidden="true" />
                </span>
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                    Nápověda
                  </p>
                  <h3 className="mt-1 text-lg font-bold text-slate-950">
                    Co je přístupový klíč?
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPasskeyHelpOpen(false)}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
                aria-label="Zavřít nápovědu"
              >
                <X size={16} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
            <div className="space-y-3 px-4 py-4 text-sm leading-relaxed text-slate-600 sm:px-5 sm:py-5">
              <p>
                Přístupový klíč je bezpečné přihlášení uložené v konkrétním
                zařízení nebo ve správci hesel. Při přihlášení se ověříš přes
                Face ID, Touch ID, otisk prstu, PIN nebo heslo zařízení.
              </p>
              <p>
                Po nastavení můžeš na daném zařízení používat přístupový klíč
                místo opisování kódu z Microsoft Authenticatoru. Heslo ani
                jednorázový kód se při tomto způsobu přihlášení nezadává.
              </p>
              <p>
                Pro nejlepší dostupnost si ulož přístupový klíč na každém
                zařízení, ze kterého se běžně přihlašuješ.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
