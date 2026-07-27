"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import {
  Apple,
  AtSign,
  ExternalLink,
  Fingerprint,
  HelpCircle,
  KeyRound,
  LogOut,
  MonitorSmartphone,
  Play,
  QrCode as QrCodeIcon,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";

import type { PasskeyCredentialSummary } from "@/app/lib/passkeys";
import { formatDateTime } from "../subscriptionSettings";
import { getPasswordPolicyChecks } from "../passwordPolicy";

const MICROSOFT_AUTHENTICATOR_APP_STORE_URL =
  "https://apps.apple.com/cz/app/microsoft-authenticator/id983156458";
const MICROSOFT_AUTHENTICATOR_GOOGLE_PLAY_URL =
  "https://play.google.com/store/apps/details?id=com.azure.authenticator";

type InlineStatus = {
  type: "success" | "error" | "info";
  message: string;
};

type AccountSessionSummary = {
  id: string;
  current: boolean;
  deviceLabel: string;
  browserLabel: string;
  osLabel: string;
  userAgent: string;
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
  mfaReauthCode: string;
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
  mfaReauthCode,
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
  const otherSessionsCount = accountSessions.filter((session) => !session.current).length;
  const revokeOtherSessionsDisabled = accountSessionsBusy || accountSessionsLoading;

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
          <p className="mt-2 text-lg font-black text-slate-950 sm:text-xl">120 minut</p>
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
            Microsoft Authenticator.
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

      <div className="grid gap-3 sm:gap-4 xl:grid-cols-[minmax(430px,1.12fr)_minmax(320px,0.88fr)] xl:items-start">
        <div className="xl:order-2">
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
                  Odhlášení najdeš dole v levém panelu.
                </p>
              </div>
            </div>

            <div className="mt-4 border-t border-slate-100 pt-4">
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

            <div className="mt-4 border-t border-slate-100 pt-4">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <MonitorSmartphone
                    size={13}
                    strokeWidth={2}
                    className="text-slate-500"
                    aria-hidden="true"
                  />
                  <span>Aktivní zařízení</span>
                </div>
                <button
                  type="button"
                  onClick={() => void onRefreshAccountSessions()}
                  disabled={accountSessionsLoading || accountSessionsBusy}
                  className="inline-flex min-h-8 w-fit items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCw
                    size={12}
                    strokeWidth={2.2}
                    className={accountSessionsLoading ? "animate-spin" : ""}
                    aria-hidden="true"
                  />
                  Obnovit
                </button>
              </div>

              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:rounded-2xl">
                {accountSessionsLoading ? (
                  <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
                    Načítám aktivní zařízení…
                  </div>
                ) : accountSessions.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
                    Zatím není evidovaná žádná aktivní relace.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {accountSessions.map((session) => (
                      <div
                        key={session.id}
                        className={`rounded-xl border px-3 py-3 sm:rounded-2xl ${
                          session.current
                            ? "border-violet-200 bg-violet-50"
                            : "border-slate-200 bg-white"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="min-w-0 break-words text-sm font-semibold text-slate-900">
                                {session.deviceLabel}
                              </p>
                              {session.current ? (
                                <span className="rounded-full border border-violet-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-800">
                                  Toto zařízení
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                              Naposledy {formatDateTime(session.lastSeenAtMs)} · platí do{" "}
                              {formatDateTime(session.expiresAtMs)}
                            </p>
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

                <button
                  type="button"
                  onClick={() => void onRevokeOtherSessions()}
                  disabled={revokeOtherSessionsDisabled}
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60 sm:rounded-2xl"
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

            <div className="mt-4 border-t border-slate-100 pt-4">
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

                  {passkeyCredentials.map((credential) => (
                    <div
                      key={credential.credentialId}
                    className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:rounded-2xl"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900">
                          {credential.name}
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-500">
                          Přidáno {formatDateTime(credential.createdAtMs)}
                          {credential.lastUsedAtMs
                            ? ` · použito ${formatDateTime(credential.lastUsedAtMs)}`
                            : ""}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void onDeletePasskey(credential.credentialId)}
                        disabled={passkeyDeletingId === credential.credentialId}
                        className="inline-flex min-h-[36px] shrink-0 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {passkeyDeletingId === credential.credentialId ? "Odebírám…" : "Odebrat"}
                      </button>
                    </div>
                  ))}
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

        <div className="overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-[0_12px_28px_rgba(15,23,42,0.06)] sm:rounded-[24px] sm:shadow-[0_18px_36px_rgba(15,23,42,0.08)] xl:order-1">
          <div className="mfa-security-hero bg-[linear-gradient(135deg,#0b0717_0%,#1d1238_52%,#5b21b6_100%)] px-3.5 py-4 text-white sm:px-5 sm:py-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10 shadow-[0_10px_24px_rgba(0,0,0,0.22)] sm:h-11 sm:w-11 sm:rounded-2xl">
                  <ShieldCheck size={22} strokeWidth={2} aria-hidden="true" />
                </span>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/75">
                    Zabezpečení
                  </div>
                  <h3 className="mt-0.5 text-lg font-black leading-tight tracking-normal text-white">
                    Microsoft Authenticator
                  </h3>
                  <p className="mt-1 max-w-md text-xs leading-relaxed text-white/80">
                    Po zadání hesla se přihlášení potvrzuje ještě jednorázovým kódem z aplikace.
                  </p>
                </div>
              </div>
              <span
                className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                  mfaEnabled
                    ? "border-violet-200/70 bg-violet-300/20 text-violet-50"
                    : "border-white/25 bg-white/10 text-white"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${mfaEnabled ? "bg-violet-200" : "bg-slate-300"}`}
                  aria-hidden="true"
                />
                {mfaEnabled ? "Zapnuto" : "Vypnuto"}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <a
                href={MICROSOFT_AUTHENTICATOR_APP_STORE_URL}
                target="_blank"
                rel="noreferrer"
                aria-label="Otevřít Microsoft Authenticator v App Store"
                className="group flex min-h-[58px] items-center gap-3 rounded-2xl border border-white/20 bg-white/10 px-3 py-2.5 text-left transition hover:border-white/40 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-slate-950">
                  <Apple size={18} strokeWidth={2.2} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.13em] text-white/60">
                    Stáhnout v
                  </span>
                  <span className="block text-sm font-bold text-white">App Store</span>
                </span>
                <ExternalLink
                  size={14}
                  strokeWidth={2}
                  className="text-white/50 transition group-hover:text-white"
                  aria-hidden="true"
                />
              </a>

              <a
                href={MICROSOFT_AUTHENTICATOR_GOOGLE_PLAY_URL}
                target="_blank"
                rel="noreferrer"
                aria-label="Otevřít Microsoft Authenticator v Google Play"
                className="group flex min-h-[58px] items-center gap-3 rounded-2xl border border-white/20 bg-white/10 px-3 py-2.5 text-left transition hover:border-white/40 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-700 text-white">
                  <Play size={17} strokeWidth={2.2} fill="currentColor" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.13em] text-white/60">
                    Stáhnout na
                  </span>
                  <span className="block text-sm font-bold text-white">Google Play</span>
                </span>
                <ExternalLink
                  size={14}
                  strokeWidth={2}
                  className="text-white/50 transition group-hover:text-white"
                  aria-hidden="true"
                />
              </a>
            </div>
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
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 sm:rounded-2xl">
                {!mfaDisableConfirmOpen ? (
                  <button
                    type="button"
                    onClick={onOpenDisableMfa}
                    disabled={mfaBusy}
                    className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-rose-700 bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60 sm:rounded-2xl"
                  >
                    Vypnout 2FA
                  </button>
                ) : (
                  <div className="space-y-3 rounded-xl border border-rose-200 bg-white px-3 py-3 sm:rounded-2xl">
                    <p className="text-[11px] text-slate-500">
                      {mfaTotpLabel
                        ? `Aktivní faktor: ${mfaTotpLabel}`
                        : "Aktivní faktor: Microsoft Authenticator"}
                    </p>
                    <p className="text-xs leading-relaxed text-slate-600">
                      Pro vypnutí potvrď změnu aktuálním heslem a kódem z aplikace.
                    </p>
                    <input
                      type="password"
                      autoComplete="current-password"
                      className={fieldClass}
                      placeholder="Aktuální heslo pro potvrzení"
                      value={mfaPassword}
                      onChange={(event) => onMfaPasswordChange(event.target.value)}
                    />
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      className={fieldClass}
                      placeholder="Aktuální 2FA kód"
                      value={mfaReauthCode}
                      onChange={(event) =>
                        onMfaReauthCodeChange(event.target.value.replace(/\D/g, "").slice(0, 8))
                      }
                    />
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <button
                        type="button"
                        onClick={() => void onDisableMfa()}
                        disabled={mfaBusy}
                        className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-rose-700 bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60 sm:rounded-2xl"
                      >
                        {mfaBusy ? "Vypínám 2FA…" : "Potvrdit vypnutí"}
                      </button>
                      <button
                        type="button"
                        onClick={onCancelDisableMfa}
                        disabled={mfaBusy}
                        className="inline-flex min-h-[40px] items-center justify-center rounded-xl px-3 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Zrušit
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {mfaStatus && (
              <div className={`rounded-2xl border px-3 py-2 text-xs ${statusClass(mfaStatus)}`}>
                {mfaStatus.message}
              </div>
            )}
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
