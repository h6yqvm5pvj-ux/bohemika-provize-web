"use client";

import Image from "next/image";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import {
  Apple,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleHelp,
  Copy,
  ExternalLink,
  Loader2,
  Landmark,
  PhoneCall,
  Play,
  Plus,
  QrCode,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from "lucide-react";

import type { User } from "firebase/auth";
import { PasswordField } from "./PasswordField";
import { AccountSetupSuccess } from "./AccountSetupSuccess";
import styles from "./authSurface.module.css";

import type { Position } from "@/app/types/domain";
import type { AresIcoLookupState } from "@/components/profile/useAresIcoLookup";
import { isValidProfilePhone } from "@/lib/profileFields";

type AccountSetupStepId = "phone" | "career" | "security";

type AccountSetupStep = {
  id: AccountSetupStepId;
  label: string;
};

type AccountSetupTimelineItem = {
  id: string;
  position: Position | "";
  validFrom: string;
  validTo: string;
  ongoing?: boolean;
};

type AccountSetupWizardProps = {
  user: User;
  completedStepIds: AccountSetupStepId[];
  careerDraftStatus: "none" | "saved" | "restored" | "unavailable";
  mfaAwaitingEmail: boolean;
  mfaEmailVerified: boolean;
  onComplete: () => void;
  onStepChange: (index: number) => void;
  ariaLabel: string;
  logoutLabel: string;
  steps: AccountSetupStep[];
  stepIndex: number;
  completed: boolean;
  currentStep: AccountSetupStepId;
  phone: string;
  phoneMaxLength: number;
  phoneSaving: boolean;
  ico: string;
  icoMaxLength: number;
  fullName: string;
  fullNameMaxLength: number;
  agencyNumber: string;
  agencyNumberMaxLength: number;
  aresIcoLookup: AresIcoLookupState;
  timelineDraft: AccountSetupTimelineItem[];
  timelineSaving: boolean;
  positions: { id: Position; label: string }[];
  mfaGraceActive: boolean;
  mfaGraceExpired: boolean;
  mfaGraceRemainingDays: number;
  mfaGraceDeadlineLabel: string;
  mfaEnabled: boolean;
  mfaPassword: string;
  mfaSecretKey: string | null;
  mfaQrLoading: boolean;
  mfaQrDataUrl: string;
  mfaQrError: string | null;
  mfaCode: string;
  mfaSaving: boolean;
  completionSaving: boolean;
  info: string | null;
  error: string | null;
  busy: boolean;
  hasInvalidRangeOrder: (validFrom: string, validTo: string) => boolean;
  onLogout: () => void;
  onPhoneChange: (value: string) => void;
  onIcoChange: (value: string) => void;
  onFullNameChange: (value: string) => void;
  onAgencyNumberChange: (value: string) => void;
  onTimelineRowChange: (
    rowId: string,
    patch: Partial<AccountSetupTimelineItem>
  ) => void;
  onRemoveTimelineRow: (rowId: string) => void;
  onAddTimelineRow: () => void;
  onMfaPasswordChange: (value: string) => void;
  onMfaCodeChange: (value: string) => void;
  onDismissGrace: () => void;
  onBack: () => void;
  onPrimaryAction: () => void;
};

const MICROSOFT_AUTHENTICATOR_APP_STORE_URL =
  "https://apps.apple.com/cz/app/microsoft-authenticator/id983156458";
const MICROSOFT_AUTHENTICATOR_GOOGLE_PLAY_URL =
  "https://play.google.com/store/apps/details?id=com.azure.authenticator";

const ACCOUNT_SETUP_FIELD_CLASS = styles.field;
const MFA_CODE_LENGTH = 6;

type MfaCodeInputProps = {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
};

function MfaCodeInput({ value, disabled, onChange }: MfaCodeInputProps) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const code = value.replace(/\D/g, "").slice(0, MFA_CODE_LENGTH);

  const focusDigit = (index: number) => {
    window.requestAnimationFrame(() => inputRefs.current[index]?.focus());
  };

  const updateFromInput = (index: number, rawValue: string) => {
    const enteredDigits = rawValue.replace(/\D/g, "");
    if (!enteredDigits) {
      onChange(`${code.slice(0, index)}${code.slice(index + 1)}`);
      return;
    }

    const nextCode = `${code.slice(0, index)}${enteredDigits}${code.slice(
      index + enteredDigits.length
    )}`.slice(0, MFA_CODE_LENGTH);
    onChange(nextCode);
    focusDigit(Math.min(index + enteredDigits.length, MFA_CODE_LENGTH - 1));
  };

  const handleChange = (index: number, event: ChangeEvent<HTMLInputElement>) => {
    updateFromInput(index, event.target.value);
  };

  const handlePaste = (index: number, event: ClipboardEvent<HTMLInputElement>) => {
    const pastedDigits = event.clipboardData.getData("text").replace(/\D/g, "");
    if (!pastedDigits) return;

    event.preventDefault();
    updateFromInput(index, pastedDigits);
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      focusDigit(index - 1);
      return;
    }
    if (event.key === "ArrowRight" && index < MFA_CODE_LENGTH - 1) {
      event.preventDefault();
      focusDigit(index + 1);
      return;
    }
    if (event.key === "Backspace" && !code[index] && index > 0) {
      event.preventDefault();
      onChange(code.slice(0, -1));
      focusDigit(index - 1);
    }
  };

  return (
    <div
      className="grid grid-cols-6 gap-2"
      role="group"
      aria-label="Šestimístný 2FA kód"
    >
      {Array.from({ length: MFA_CODE_LENGTH }, (_, index) => (
        <input
          key={index}
          ref={(element) => {
            inputRefs.current[index] = element;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          aria-label={`Číslice ${index + 1} z ${MFA_CODE_LENGTH} 2FA kódu`}
          value={code[index] ?? ""}
          onChange={(event) => handleChange(index, event)}
          onPaste={(event) => handlePaste(index, event)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onFocus={() => {
            const firstEmptyIndex = Math.min(code.length, MFA_CODE_LENGTH - 1);
            if (index > firstEmptyIndex) focusDigit(firstEmptyIndex);
          }}
          disabled={disabled}
          className="h-12 min-w-0 w-full rounded-xl border border-white/18 bg-white/[0.06] p-0 text-center font-mono text-lg font-bold text-white outline-none transition focus:border-violet-200/70 focus:bg-white/[0.09] focus:ring-2 focus:ring-violet-200/20 disabled:cursor-not-allowed disabled:opacity-55 sm:h-14"
        />
      ))}
    </div>
  );
}

type MfaHelpDialogProps = {
  onClose: () => void;
};

function MfaHelpDialog({ onClose }: MfaHelpDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => { dialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus(); }, []);
  return (
    <div
      ref={dialogRef}
      onKeyDown={event => {
        if (event.key === "Escape") { event.stopPropagation(); onClose(); }
        if (event.key !== "Tab") return;
        const elements = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button, a[href]") ?? []);
        if (event.shiftKey && document.activeElement === elements[0]) { event.preventDefault(); elements.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === elements.at(-1)) { event.preventDefault(); elements[0]?.focus(); }
      }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 px-4 py-5 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mfa-help-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="relative max-h-full w-full max-w-4xl overflow-y-auto rounded-[28px] border border-violet-200/25 bg-[linear-gradient(145deg,#1b1030_0%,#100a20_58%,#0b0717_100%)] p-4 text-white shadow-[0_32px_90px_rgba(4,3,18,0.72),inset_0_1px_0_rgba(255,255,255,0.13)] sm:p-6">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/16 bg-white/[0.06] text-violet-100 transition hover:bg-white/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-200/80 sm:right-6 sm:top-6"
          aria-label="Zavřít nápovědu"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_252px] lg:items-start">
          <div className="pr-10 sm:pr-12 lg:pr-0">
            <div className="inline-flex self-start items-center gap-2 rounded-full border border-sky-200/30 bg-sky-300/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-100">
              <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
              Rychlá nápověda
            </div>
            <h4 id="mfa-help-title" className="mt-6 text-xl font-bold tracking-[-0.02em] text-white sm:text-2xl">
              Jak přidat Bohemka.App do Authenticatoru?
            </h4>
            <p className="mt-3 text-sm leading-relaxed text-violet-100/72">
              Otevři si v mobilu nebo stáhni aplikaci{" "}
              <strong className="font-semibold text-white">Microsoft Authenticator</strong>.
              {" "}Pravděpodobně ji už máš, pokud využíváš portál SUS ČPP nebo KNZ
              KOOPERATIVA.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href={MICROSOFT_AUTHENTICATOR_APP_STORE_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-2 rounded-full border border-white/16 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-violet-50 transition hover:bg-white/[0.11]"
                aria-label="Otevřít Microsoft Authenticator v App Store"
              >
                <Apple className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
                App Store
                <ExternalLink className="h-3 w-3" strokeWidth={2.2} aria-hidden="true" />
              </a>
              <a
                href={MICROSOFT_AUTHENTICATOR_GOOGLE_PLAY_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-2 rounded-full border border-white/16 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-violet-50 transition hover:bg-white/[0.11]"
                aria-label="Otevřít Microsoft Authenticator v Google Play"
              >
                <Play className="h-3.5 w-3.5" strokeWidth={2.2} fill="currentColor" aria-hidden="true" />
                Google Play
                <ExternalLink className="h-3 w-3" strokeWidth={2.2} aria-hidden="true" />
              </a>
            </div>

            <div className="mt-8 border-t border-white/10 pt-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-200/70">
                Postup nastavení
              </p>
              <ol className="mt-3 space-y-3">
                <li className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.045] p-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-400/25 text-xs font-bold text-violet-50">
                    1
                  </span>
                  <p className="pt-0.5 text-sm leading-relaxed text-violet-100/82">
                    Otevři aplikaci. V jejím dolním pravém rohu najdi ikonu QR kódu.
                  </p>
                </li>
                <li className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.045] p-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-400/25 text-xs font-bold text-violet-50">
                    2
                  </span>
                  <p className="pt-0.5 text-sm leading-relaxed text-violet-100/82">
                    Klikni na ni a namiř fotoaparátem na QR kód zobrazený v tomto okně.
                  </p>
                </li>
                <li className="flex gap-3 rounded-2xl border border-emerald-200/20 bg-emerald-300/[0.08] p-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-400/25 text-xs font-bold text-emerald-50">
                    3
                  </span>
                  <p className="pt-0.5 text-sm leading-relaxed text-emerald-50/88">
                    Po naskenování je hotovo. V aplikaci najdeš unikátní šestimístný
                    číselný kód, který se každých 30 vteřin mění. Zadej ho sem do
                    aplikace.
                  </p>
                </li>
              </ol>
            </div>

          </div>

          <figure>
            <div className="flex h-[380px] items-center justify-center sm:h-[440px] lg:h-[470px]">
              <Image
                src="/icons/microsoft-authenticator-qr-help-purple.png"
                alt="Microsoft Authenticator s vyznačenou ikonou QR kódu v dolním pravém rohu"
                width={853}
                height={1844}
                className="h-full w-full object-contain"
              />
            </div>
            <figcaption className="px-1 pb-1 pt-2 text-center text-[11px] font-medium leading-relaxed text-violet-100/65">
              Ikona QR kódu v Microsoft Authenticatoru
            </figcaption>
          </figure>
        </div>
      </section>
    </div>
  );
}

export function AccountSetupWizard({
  user,
  completedStepIds,
  careerDraftStatus,
  mfaAwaitingEmail,
  mfaEmailVerified,
  onComplete,
  onStepChange,
  ariaLabel,
  logoutLabel,
  steps,
  stepIndex,
  completed,
  currentStep,
  phone,
  phoneMaxLength,
  phoneSaving,
  ico,
  icoMaxLength,
  fullName,
  fullNameMaxLength,
  agencyNumber,
  agencyNumberMaxLength,
  aresIcoLookup,
  timelineDraft,
  timelineSaving,
  positions,
  mfaGraceActive,
  mfaGraceExpired,
  mfaGraceRemainingDays,
  mfaGraceDeadlineLabel,
  mfaEnabled,
  mfaPassword,
  mfaSecretKey,
  mfaQrLoading,
  mfaQrDataUrl,
  mfaQrError,
  mfaCode,
  mfaSaving,
  completionSaving,
  info,
  error,
  busy,
  hasInvalidRangeOrder,
  onLogout,
  onPhoneChange,
  onIcoChange,
  onFullNameChange,
  onAgencyNumberChange,
  onTimelineRowChange,
  onRemoveTimelineRow,
  onAddTimelineRow,
  onMfaPasswordChange,
  onMfaCodeChange,
  onDismissGrace,
  onBack,
  onPrimaryAction,
}: AccountSetupWizardProps) {
  const [isMfaHelpOpen, setIsMfaHelpOpen] = useState(false);
  const [copyResult, setCopyResult] = useState<{ key: string; message: string } | null>(null);
  const copyStatus = copyResult?.key === mfaSecretKey ? copyResult?.message : null;
  const rootRef = useRef<HTMLDivElement>(null);
  const helpTrigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  useEffect(() => {
    rootRef.current?.querySelector<HTMLElement>("[data-setup-heading]")?.focus({ preventScroll: true });
    rootRef.current?.scrollTo?.({ top: 0 });
  }, [stepIndex, completed]);
  const copySecret = async () => {
    if (!mfaSecretKey) return;
    try { await navigator.clipboard.writeText(mfaSecretKey); setCopyResult({ key: mfaSecretKey, message: "Klíč zkopírován." }); }
    catch { setCopyResult({ key: mfaSecretKey, message: "Kopírování není dostupné. Označ a zkopíruj klíč ručně." }); }
  };
  const phoneValid = Boolean(phone.trim()) && isValidProfilePhone(phone);
  const icoValid = /^\d{8}$/.test(ico);
  const progress = completed ? 100 : (completedStepIds.length / steps.length) * 100;
  const lastStepIndex = steps.length - 1;
  const primaryLabel =
    currentStep === "phone"
      ? phoneSaving
        ? "Ukládám"
        : "Pokračovat"
      : currentStep === "career"
        ? timelineSaving
          ? "Ukládám"
          : "Pokračovat"
        : mfaAwaitingEmail
          ? mfaSaving ? "Ověřuji e-mail…" : "Ověřit e-mail a pokračovat"
        : mfaEnabled
          ? completionSaving
            ? "Dokončuji"
            : "Dokončit"
          : mfaSecretKey
            ? mfaSaving
              ? "Potvrzuji"
              : "Potvrdit kód"
            : mfaSaving
              ? "Spouštím 2FA"
              : "Zapnout 2FA";

  return (
    <div ref={rootRef} className={`${styles.page} ${styles.setup}`} role="dialog" aria-modal="true" aria-label={ariaLabel}
      onKeyDown={event => {
        if (event.key !== "Tab" || isMfaHelpOpen) return;
        const focusable = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]') ?? []).filter(element => element.getClientRects().length > 0);
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && (document.activeElement === first || !focusable.includes(document.activeElement as HTMLElement))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
      <header className={styles.setupHeader}>
        <p className={styles.brand}>Bohemka.App</p>
        {!completed && <button type="button" onClick={onLogout} disabled={busy} className={styles.secondary}>{logoutLabel}</button>}
      </header>
      {completed ? <AccountSetupSuccess user={user} onContinue={onComplete} /> : (
        <div className={styles.setupShell}>
          <aside className={styles.sidebar}>
            <h1>Připrav si účet</h1>
            <p className={styles.muted}>Tři kroky a můžeš začít. Údaje využijeme pro tvůj profil a provizní výpočty.</p>
            <nav aria-label="Postup nastavení účtu">
              <ol className={styles.steps}>
                {steps.map((step, index) => {
                  const done = completedStepIds.includes(step.id);
                  return <li key={step.id}>
                    <button type="button" className={styles.stepButton} data-active={index === stepIndex} data-done={done}
                      aria-current={index === stepIndex ? "step" : undefined} disabled={busy || index >= stepIndex}
                      onClick={() => onStepChange(index)}>
                      <span className={styles.stepNumber}>{done ? <CheckCircle2 size={16} aria-hidden="true" /> : index + 1}</span>
                      <span><span className={styles.stepLabel}>{step.label}<span className="sr-only">{done ? " – uloženo" : ""}</span></span>
                        <span className={styles.stepDescription}>{["Tvoje kontaktní údaje", "Pozice a jejich platnost", "Ochrana tvého účtu"][index]}</span></span>
                    </button>
                  </li>;
                })}
              </ol>
            </nav>
            <div className={styles.progress}>
              Krok {stepIndex + 1} ze {steps.length} · {completedStepIds.length} ze {steps.length} hotovo
              <div className={styles.progressTrack} role="progressbar" aria-label="Dokončení účtu" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={completedStepIds.length}>
                <div className={styles.progressFill} style={{ width: `${progress}%` }} />
              </div>
            </div>
          </aside>
          <form className={`${styles.card} ${styles.form}`} onSubmit={event => { event.preventDefault(); if (!busy) onPrimaryAction(); }}>
            <div className={styles.formBody}>
              {currentStep === "phone" ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-violet-300/30 bg-violet-400/10 text-violet-100">
                      <PhoneCall className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.17em] text-violet-200/85">
                        Základní profil
                      </p>
                      <h2 tabIndex={-1} data-setup-heading className="mt-1 text-xl font-semibold text-white outline-none">Tvoje kontaktní údaje</h2>
                      <p className="mt-1 text-sm leading-relaxed text-violet-100/66">
                        Tyto údaje se uloží do profilu a budou se používat v dokumentech,
                        týmu, poště i dalších částech aplikace.
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-2">
                      <span className="block text-sm font-medium text-violet-100/80">
                        Jméno a příjmení
                      </span>
                      <span className="relative block">
                        <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-200/55" aria-hidden="true" />
                        <input
                          type="text"
                          autoComplete="name"
                          value={fullName}
                          onChange={(event) =>
                            onFullNameChange(event.target.value.slice(0, fullNameMaxLength))
                          }
                          placeholder="Jméno a příjmení"
                          maxLength={fullNameMaxLength}
                          disabled={phoneSaving}
                          className={`${ACCOUNT_SETUP_FIELD_CLASS} ${styles.withIcon}`}
                        />
                      </span>
                    </label>

                    <label className="block space-y-2">
                      <span className="block text-sm font-medium text-violet-100/80">
                        Tel. číslo
                      </span>
                      <span className="relative block">
                        <PhoneCall className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-200/55" aria-hidden="true" />
                        <input
                          type="tel"
                          autoComplete="tel"
                          inputMode="tel"
                          aria-invalid={Boolean(phone.trim() && !phoneValid)}
                          value={phone}
                          onChange={(event) =>
                            onPhoneChange(event.target.value.slice(0, phoneMaxLength))
                          }
                          placeholder="777 123 456"
                          maxLength={phoneMaxLength}
                          disabled={phoneSaving}
                          className={`${ACCOUNT_SETUP_FIELD_CLASS} ${styles.withIcon} ${styles.withEndIcon}`}
                        />
                        {phoneValid ? (
                          <CheckCircle2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-300" aria-hidden="true" />
                        ) : null}
                      </span>
                    </label>

                    <label className="block space-y-2">
                      <span className="block text-sm font-medium text-violet-100/80">
                        Agenturní číslo <span className="normal-case tracking-normal text-violet-200/45">(volitelné)</span>
                      </span>
                      <span className="relative block">
                        <Landmark className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-200/55" aria-hidden="true" />
                        <input
                          type="text"
                          value={agencyNumber}
                          onChange={(event) =>
                            onAgencyNumberChange(event.target.value.slice(0, agencyNumberMaxLength))
                          }
                          placeholder="Agenturní číslo"
                          maxLength={agencyNumberMaxLength}
                          disabled={phoneSaving}
                          className={`${ACCOUNT_SETUP_FIELD_CLASS} ${styles.withIcon}`}
                        />
                      </span>
                    </label>

                    <label className="block space-y-2">
                      <span className="block text-sm font-medium text-violet-100/80">
                        IČO
                      </span>
                      <span className="relative block">
                        <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-200/55" aria-hidden="true" />
                        <input
                          type="text"
                          inputMode="numeric"
                          aria-invalid={Boolean(ico && !icoValid)}
                          value={ico}
                          onChange={(event) =>
                            onIcoChange(event.target.value.replace(/\D+/g, "").slice(0, icoMaxLength))
                          }
                          placeholder="12345678"
                          maxLength={icoMaxLength}
                          disabled={phoneSaving}
                          className={`${ACCOUNT_SETUP_FIELD_CLASS} ${styles.withIcon} ${
                            icoValid && aresIcoLookup.status !== "idle" ? styles.withStatus : ""
                          } ${
                            ico && !icoValid ? "border-rose-300/70" : ""
                          }`}
                          aria-describedby={
                            icoValid && aresIcoLookup.status !== "idle"
                              ? "account-setup-ico-ares-status"
                              : undefined
                          }
                        />
                        {icoValid && aresIcoLookup.status === "loading" ? (
                          <span
                            id="account-setup-ico-ares-status"
                            className="absolute right-2.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded-full border border-violet-200/25 bg-white/[0.07] px-2 py-1 text-[9px] font-bold text-violet-100"
                            role="status"
                          >
                            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                            Ověřuji
                          </span>
                        ) : icoValid && aresIcoLookup.status === "match" ? (
                          <span
                            id="account-setup-ico-ares-status"
                            className={`absolute right-2.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-bold ${
                              aresIcoLookup.entity.active
                                ? "border-emerald-300/30 bg-emerald-400/12 text-emerald-100"
                                : "border-amber-200/30 bg-amber-300/12 text-amber-100"
                            }`}
                            title={[aresIcoLookup.entity.companyName, aresIcoLookup.entity.address]
                              .filter(Boolean)
                              .join(" · ")}
                            role="status"
                          >
                            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                            ARES · {aresIcoLookup.entity.active ? "shoda" : "ukončeno"}
                          </span>
                        ) : icoValid && aresIcoLookup.status === "not-found" ? (
                          <span
                            id="account-setup-ico-ares-status"
                            className="absolute right-2.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded-full border border-amber-200/30 bg-amber-300/12 px-2 py-1 text-[9px] font-bold text-amber-100"
                            title="Pro toto IČO nebyla v ARESu nalezena shoda."
                            role="status"
                          >
                            <CircleAlert className="h-3 w-3" aria-hidden="true" />
                            Nenalezeno
                          </span>
                        ) : icoValid && aresIcoLookup.status === "error" ? (
                          <span
                            id="account-setup-ico-ares-status"
                            className="absolute right-2.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded-full border border-amber-200/30 bg-amber-300/12 px-2 py-1 text-[9px] font-bold text-amber-100"
                            title={aresIcoLookup.message}
                            role="status"
                          >
                            <CircleAlert className="h-3 w-3" aria-hidden="true" />
                            ARES offline
                          </span>
                        ) : null}
                      </span>
                    </label>
                  </div>
                </div>
              ) : null}

              {currentStep === "career" ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-violet-300/30 bg-violet-400/10 text-violet-100">
                      <BriefcaseBusiness className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.17em] text-violet-200/85">
                        Historie kariéry
                      </p>
                      <h2 tabIndex={-1} data-setup-heading className="mt-1 text-xl font-semibold text-white outline-none">Tvoje kariéra</h2>
                      <p className="mt-1 text-sm leading-relaxed text-violet-100/66">
                        Pozice podle období se používají pro předvyplnění kalkulačky
                        a přesné provizní výpočty.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-violet-300/20 bg-violet-400/5 px-4 py-3 text-sm leading-relaxed text-violet-100/80">
                    Historii pozic najdeš v portálu Maxx:{" "}
                    <a
                      href="https://sjednatel.bohemiaservis.cz/broker-card"
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 rounded-full border border-violet-200/30 bg-violet-300/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-white no-underline transition hover:bg-violet-300/20"
                    >
                      Otevřít kariéru v Maxxu
                      <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
                    </a>
                    {" "}v záložce Kariéra. Přepiš pozice a data od nejstarší po aktuální.
                  </div>

                  {careerDraftStatus !== "none" && <p role="status" className="text-xs leading-relaxed text-violet-100/70">
                    {careerDraftStatus === "restored" ? "Obnovili jsme rozepsanou kariéru z této karty prohlížeče." : careerDraftStatus === "saved" ? "Rozepsané změny jsou uložené v této kartě prohlížeče." : "Prohlížeč neumožňuje uložit rozepsané změny. Před obnovením stránky dokonči tento krok."}
                  </p>}
                  <div className="space-y-2.5">
                    {timelineDraft.map((row, rowIndex) => {
                      const rowRangeError = hasInvalidRangeOrder(
                        row.validFrom.trim(),
                        row.validTo.trim()
                      );
                      const isLastDraftRow = rowIndex === timelineDraft.length - 1;
                      const rowOpenEndedNotLast = !row.validTo.trim() && !isLastDraftRow;
                      const ongoing = isLastDraftRow && (row.ongoing ?? !row.validTo);
                      const overlap = Boolean(row.validFrom) && timelineDraft.some(other => other.id !== row.id && other.validFrom &&
                        other.validFrom < (row.validTo || "9999-12-31") && row.validFrom < (other.validTo || "9999-12-31"));
                      const submittedRowError = error?.startsWith(`Řádek ${rowIndex + 1}:`) ? error.split(": ").slice(1).join(": ") : null;
                      const rowIssue = rowRangeError ? "Konec období musí být stejný nebo pozdější než začátek." : rowOpenEndedNotLast ? "Doplň konec období. Jen poslední pozice může trvat dodnes." : overlap ? "Toto období se překrývá s jinou pozicí. Zkontroluj data." : submittedRowError;
                      const errorId = `career-row-${rowIndex}-error`;

                      return (
                        <div
                          key={row.id}
                          className={`rounded-2xl border bg-white/[0.05] px-3 py-3 shadow-[0_10px_24px_rgba(7,6,25,0.22)] ${
                            rowIssue
                              ? "border-rose-300/65"
                              : "border-white/14"
                          }`}
                        >
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <span className="text-xs font-semibold text-violet-100/65">Pozice {rowIndex + 1}</span>
                            <button type="button" onClick={() => onRemoveTimelineRow(row.id)} disabled={timelineSaving} aria-label={`Smazat pozici ${rowIndex + 1}`} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-xs text-violet-100/70 hover:bg-white/5"><Trash2 size={14} aria-hidden="true" /> Smazat</button>
                          </div>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <label className="space-y-1.5 sm:col-span-2">
                              <span className="block text-xs font-medium text-violet-100/75">
                                Pozice
                              </span>
                              <select
                                aria-describedby={rowIssue ? errorId : undefined}
                                aria-invalid={Boolean(submittedRowError && !row.position)}
                                value={row.position}
                                onChange={(event) =>
                                  onTimelineRowChange(row.id, {
                                    position: event.target.value as Position | "",
                                  })
                                }
                                disabled={timelineSaving}
                                className={`${ACCOUNT_SETUP_FIELD_CLASS} [color-scheme:dark]`}
                              >
                                <option value="">Vyber pozici</option>
                                {positions.map((positionItem) => (
                                  <option key={positionItem.id} value={positionItem.id}>
                                    {positionItem.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="space-y-1.5">
                              <span className="block text-xs font-medium text-violet-100/75">
                                Platí od
                              </span>
                              <input
                                type="date"
                                aria-describedby={rowIssue ? errorId : undefined}
                                aria-invalid={Boolean(rowIssue)}
                                value={row.validFrom}
                                onChange={(event) =>
                                  onTimelineRowChange(row.id, {
                                    validFrom: event.target.value,
                                  })
                                }
                                disabled={timelineSaving}
                                className={`${ACCOUNT_SETUP_FIELD_CLASS} [color-scheme:dark]`}
                              />
                            </label>
                            <label className="space-y-1.5">
                              <span className="block text-xs font-medium text-violet-100/75">
                                Platí do
                              </span>
                              <input
                                type="date"
                                aria-describedby={rowIssue ? errorId : undefined}
                                aria-invalid={Boolean(rowIssue)}
                                value={row.validTo}
                                onChange={(event) =>
                                  onTimelineRowChange(row.id, {
                                    validTo: event.target.value,
                                    ongoing: false,
                                  })
                                }
                                disabled={timelineSaving || ongoing}
                                className={`${ACCOUNT_SETUP_FIELD_CLASS} [color-scheme:dark]`}
                              />
                            </label>
                          </div>
                          {isLastDraftRow && <label className="mt-4 flex min-h-10 cursor-pointer items-center gap-3 text-sm text-violet-100/85">
                            <input type="checkbox" checked={Boolean(ongoing)} disabled={timelineSaving} className="h-4 w-4 accent-violet-400"
                              onChange={event => onTimelineRowChange(row.id, { ongoing: event.target.checked, ...(event.target.checked ? { validTo: "" } : {}) })} />
                            Na této pozici působím dodnes
                          </label>}
                          {rowIssue && <p id={errorId} className="mt-2 text-xs leading-relaxed text-rose-200">{rowIssue}</p>}
                        </div>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={onAddTimelineRow}
                    disabled={timelineSaving}
                    className="inline-flex items-center gap-2 rounded-full border border-white/18 bg-white/[0.05] px-3 py-2 text-xs font-semibold text-violet-100 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    <Plus className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                    Přidat pozici
                  </button>
                  {timelineDraft.some(row => row.position && row.validFrom) && <div className="pt-2">
                    <p className="mb-3 text-xs font-semibold text-violet-100/65">Přehled kariéry</p>
                    <ol className={styles.timeline} aria-label="Náhled časové osy kariéry">
                      {timelineDraft.filter(row => row.position && row.validFrom).slice().sort((a, b) => a.validFrom.localeCompare(b.validFrom)).map(row => {
                        const formatDate = (value: string) => value.split("-").reverse().join(".");
                        return <li key={row.id}><strong>{positions.find(position => position.id === row.position)?.label}</strong><span>{formatDate(row.validFrom)} – {row.validTo ? formatDate(row.validTo) : row.ongoing === false ? "doplň konec" : "dosud"}</span></li>;
                      })}
                    </ol>
                  </div>}
                </div>
              ) : null}

              {currentStep === "security" ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-violet-300/30 bg-violet-400/10 text-violet-100">
                      <ShieldCheck className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.17em] text-violet-200/85">
                        Zabezpečení účtu
                      </p>
                      <h2 tabIndex={-1} data-setup-heading className="mt-1 text-xl font-semibold text-white outline-none">Zabezpeč svůj účet</h2>
                      <p className="mt-1 text-sm leading-relaxed text-violet-100/66">
                        Dvoufázové ověření nastav přes Microsoft Authenticator nebo jinou
                        aplikaci pro jednorázové kódy.
                      </p>
                    </div>
                  </div>

                  {mfaGraceActive ? (
                    <div className="rounded-2xl border border-amber-200/35 bg-amber-300/12 px-3 py-3 text-sm leading-relaxed text-amber-50/90">
                      2FA je potřeba zapnout do {mfaGraceRemainingDays}{" "}
                      {mfaGraceRemainingDays === 1 ? "dne" : "dnů"}
                      {mfaGraceDeadlineLabel ? ` (${mfaGraceDeadlineLabel})` : ""}
                      . Do té doby můžeš pokračovat v aplikaci.
                    </div>
                  ) : null}

                  {mfaGraceExpired ? (
                    <div className="rounded-2xl border border-rose-200/35 bg-rose-400/14 px-3 py-3 text-sm leading-relaxed text-rose-50/90">
                      Lhůta pro zapnutí 2FA vypršela. Pro pokračování je potřeba účet
                      zabezpečit.
                    </div>
                  ) : null}

                  {mfaEnabled ? (
                    <div className="flex items-start gap-3 rounded-2xl border border-emerald-300/30 bg-emerald-400/12 px-3 py-3 text-sm text-emerald-50/90">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-100" aria-hidden="true" />
                      <div>
                        <p className="font-semibold text-white">2FA je zapnuté</p>
                        <p className="mt-0.5 text-emerald-50/74">
                          Účet je zabezpečený a můžeš dokončit nastavení.
                        </p>
                      </div>
                    </div>
                  ) : null}

                  <ol className={styles.securitySteps} aria-label="Nastavení zabezpečení">
                    <li aria-current={!mfaEmailVerified ? "step" : undefined}>{mfaEmailVerified ? <CheckCircle2 size={14} aria-hidden="true" /> : "1."} Ověř e-mail</li>
                    <li aria-current={mfaEmailVerified && !mfaCode && !mfaEnabled ? "step" : undefined}>2. Přidej účet</li>
                    <li aria-current={mfaSecretKey && mfaCode ? "step" : undefined}>3. Potvrď kód</li>
                  </ol>
                  {mfaAwaitingEmail && <div className="rounded-xl border border-violet-300/25 bg-violet-400/10 p-4">
                    <h3 className="font-semibold">Podívej se do své schránky</h3>
                    <p className="mt-2 text-sm leading-relaxed text-violet-100/80">Otevři ověřovací odkaz v e-mailu. Po návratu na tuto stránku ověření zkontrolujeme automaticky. Můžeš také použít tlačítko dole.</p>
                  </div>}
                  {!mfaEnabled && !mfaSecretKey && !mfaAwaitingEmail ? (
                    <div className="rounded-2xl border border-white/14 bg-white/[0.05] px-3 py-3">
                      <p className="text-sm leading-relaxed text-violet-100/68">
                        Nejdřív potvrď aktuální heslo. Pokud ještě nemáš ověřený
                        e-mail, pošleme ti odkaz do schránky. Po jeho potvrzení
                        se vrať sem a navážeme nastavením ověřovací aplikace.
                      </p>
                      <div className="mt-3 space-y-2">
                        <label htmlFor="setup-password" className="block text-sm font-medium text-violet-100">Aktuální heslo</label>
                        <PasswordField
                          id="setup-password"
                          autoComplete="current-password"
                          value={mfaPassword}
                          onChange={(event) => onMfaPasswordChange(event.target.value)}
                          placeholder="Aktuální heslo"
                          disabled={mfaSaving}
                        />
                      </div>
                    </div>
                  ) : null}

                  {!mfaEnabled && mfaSecretKey ? (
                    <div className="mt-1 grid gap-5 xl:grid-cols-[196px_minmax(0,1fr)] xl:items-center">
                      <div className="flex flex-col items-center lg:items-start">
                        <div className="flex h-[196px] w-[196px] items-center justify-center overflow-hidden rounded-[22px] border border-white/18 bg-white p-2 shadow-[0_18px_38px_rgba(3,2,13,0.34)]">
                          {mfaQrLoading ? (
                            <Loader2 className="h-7 w-7 animate-spin text-slate-500" aria-hidden="true" />
                          ) : mfaQrDataUrl ? (
                            <Image
                              src={mfaQrDataUrl}
                              alt="QR kód pro nastavení 2FA"
                              width={196}
                              height={196}
                              unoptimized
                              className="h-full w-full object-contain"
                            />
                          ) : (
                            <QrCode className="h-10 w-10 text-slate-400" aria-hidden="true" />
                          )}
                        </div>
                        <p className="mt-2 text-center text-[11px] font-medium text-violet-100/52 lg:text-left">
                          Naskenuj ho v aplikaci Authenticator
                        </p>
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-start gap-3">
                          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-violet-200/28 bg-violet-300/12 text-sm font-bold text-violet-50">
                            1
                          </span>
                          <div className="min-w-0 pt-0.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-base font-semibold text-white">Naskenuj QR kód</p>
                              <button
                                type="button"
                                onClick={(event) => { helpTrigger.current = event.currentTarget; setIsMfaHelpOpen(true); }}
                                className="inline-flex items-center gap-1.5 rounded-full border border-violet-200/25 bg-violet-300/10 px-2.5 py-1 text-[11px] font-semibold text-violet-50 transition hover:bg-violet-300/18 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-200/80"
                              >
                                <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
                                Nápověda
                              </button>
                            </div>
                            <p className="mt-1 text-sm leading-relaxed text-violet-100/66">
                              V Microsoft Authenticatoru otevři čtečku QR kódů a namiř ji
                              na tento kód.
                            </p>
                          </div>
                        </div>

                        {mfaQrError ? (
                          <p className="mt-3 rounded-2xl border border-amber-200/35 bg-amber-300/12 px-3 py-2 text-xs font-semibold text-amber-100">
                            {mfaQrError}
                          </p>
                        ) : null}

                        <div className="mt-5 flex items-start gap-3 border-t border-white/10 pt-4">
                          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-200/30 bg-emerald-300/12 text-sm font-bold text-emerald-50">
                            2
                          </span>
                          <label className="block min-w-0 space-y-2 pt-0.5">
                            <span className="block text-base font-semibold text-white">
                              Zadej šestimístný kód
                            </span>
                            <p className="text-sm leading-relaxed text-violet-100/66">
                              Po přidání účtu opiš aktuální kód z aplikace.
                            </p>
                            <MfaCodeInput
                              value={mfaCode}
                              disabled={mfaSaving}
                              onChange={onMfaCodeChange}
                            />
                          </label>
                        </div>

                        <div className="mt-5 rounded-xl border border-white/15 bg-white/[0.03] p-4">
                          <p className="text-sm font-semibold">Nastavuješ účet na stejném telefonu?</p>
                          <p className="mt-1 text-xs leading-relaxed text-violet-100/70">V Authenticatoru zvol ruční zadání účtu a vlož tento klíč.</p>
                          <code className="mt-3 block break-all select-all font-mono text-sm text-violet-50">{mfaSecretKey}</code>
                          <button type="button" className={`${styles.secondary} mt-3`} onClick={() => void copySecret()}><Copy size={14} aria-hidden="true" /> Kopírovat klíč</button>
                          {copyStatus && <p role="status" className="mt-2 text-xs text-violet-100">{copyStatus}</p>}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            {info ? <p role="status" className="mt-4 rounded-xl border border-violet-300/25 bg-violet-400/10 px-3 py-3 text-sm text-violet-100">{info}</p> : null}
            {error ? <p role="alert" className="mt-4 rounded-xl border border-rose-300/40 bg-rose-400/10 px-3 py-3 text-sm text-rose-100">{error}</p> : null}
            </div>
            <footer className={styles.footer}>
              <span className={styles.footerNote}>Údaje uložíme po potvrzení kroku.</span>
              <div className={styles.footerActions}>
                {mfaGraceActive && currentStep === "security" && <button type="button" onClick={onDismissGrace} disabled={busy} className={styles.secondary}>Připomenout později</button>}
                {stepIndex > 0 && <button type="button" onClick={onBack} disabled={busy} className={styles.secondary}><ChevronLeft size={16} aria-hidden="true" /> Zpět</button>}
                <button type="submit" disabled={busy} className={styles.primary}>
                  {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : stepIndex < lastStepIndex ? <ChevronRight size={16} aria-hidden="true" /> : <ShieldCheck size={16} aria-hidden="true" />}
                  {primaryLabel}
                </button>
              </div>
            </footer>
          </form>
        </div>
      )}
      {isMfaHelpOpen ? <MfaHelpDialog onClose={() => { setIsMfaHelpOpen(false); helpTrigger.current?.focus(); }} /> : null}
    </div>
  );
}
