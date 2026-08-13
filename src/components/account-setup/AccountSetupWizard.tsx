"use client";

import Image from "next/image";
import {
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import {
  Apple,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ExternalLink,
  Loader2,
  PhoneCall,
  Play,
  Plus,
  QrCode,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import type { Position } from "@/app/types/domain";

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
};

type AccountSetupWizardProps = {
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

const ACCOUNT_SETUP_FIELD_CLASS =
  "w-full rounded-2xl border border-white/18 bg-white/[0.06] px-3 py-2.5 text-sm font-semibold text-white outline-none transition placeholder:text-violet-100/38 focus:border-violet-200/70 focus:bg-white/[0.09] focus:ring-2 focus:ring-violet-200/20";
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
      className="flex gap-2 sm:gap-3"
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
          className="h-12 w-10 rounded-xl border border-white/18 bg-white/[0.06] p-0 text-center font-mono text-lg font-bold text-white outline-none transition focus:border-violet-200/70 focus:bg-white/[0.09] focus:ring-2 focus:ring-violet-200/20 disabled:cursor-not-allowed disabled:opacity-55 sm:h-14 sm:w-12"
        />
      ))}
    </div>
  );
}

type MfaHelpDialogProps = {
  onClose: () => void;
};

function MfaHelpDialog({ onClose }: MfaHelpDialogProps) {
  return (
    <div
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
  const progress = completed ? 100 : ((stepIndex + 1) / steps.length) * 100;
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
        : mfaEnabled
          ? completionSaving
            ? "Dokončuji"
            : "Dokončit"
          : mfaSecretKey
            ? mfaSaving
              ? "Potvrzuji"
              : "Potvrdit 2FA"
            : mfaSaving
              ? "Spouštím 2FA"
              : "Zapnout 2FA";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-3 py-4 backdrop-blur-sm sm:px-4"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      <section className="vizitka-anim-up max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-[28px] border border-violet-300/25 bg-[linear-gradient(155deg,#160c2a_0%,#100b21_100%)] p-4 text-[#f8fafc] shadow-[0_34px_90px_rgba(7,6,25,0.72),inset_0_1px_0_rgba(196,181,253,0.2)] sm:p-6">
        {completed ? (
          <div className="flex min-h-[360px] flex-col items-center justify-center py-8 text-center">
            <div className="relative mb-6 flex h-24 w-24 items-center justify-center rounded-full border border-emerald-300/55 bg-emerald-400/18 text-emerald-100 shadow-[0_0_42px_rgba(52,211,153,0.28)]">
              <span className="absolute inset-0 rounded-full border border-emerald-300/45 motion-safe:animate-ping" />
              <span className="absolute inset-3 rounded-full bg-emerald-300/14 motion-safe:animate-pulse" />
              <CheckCircle2 className="relative h-12 w-12" strokeWidth={2.4} />
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-200/85">
              Hotovo
            </p>
            <h2 className="mt-2 text-2xl font-bold tracking-[-0.02em] text-white sm:text-3xl">
              Účet úspěšně otevřen
            </h2>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-violet-100/72">
              Telefon, kariéra a 2FA jsou nastavené. Aplikace je připravená na přesné
              výpočty a předvyplnění pozice.
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-200/80">
                  Vítej v aplikaci!
                </p>
                <h2 className="mt-2 text-xl font-bold tracking-[-0.02em] text-white sm:text-2xl">
                  Nejprve je potřeba nastavit účet pro hladký chod.
                </h2>
              </div>
              <div className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/14 bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-violet-100/75">
                Krok {stepIndex + 1} / {steps.length}
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-white/14 bg-white/[0.04] px-3 py-3">
              <div
                className="grid gap-2"
                style={{
                  gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`,
                }}
              >
                {steps.map((stepItem, index) => {
                  const stepDone = stepIndex > index || completed;
                  const stepActive = stepIndex === index && !completed;

                  return (
                    <div key={stepItem.id} className="flex flex-col items-center gap-1 text-center">
                      <span
                        className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold transition ${
                          stepDone
                            ? "border-emerald-300/70 bg-emerald-400/25 text-emerald-100"
                            : stepActive
                              ? "border-violet-200/70 bg-violet-400/30 text-[#f8fafc]"
                              : "border-white/20 bg-white/[0.03] text-violet-200/70"
                        }`}
                      >
                        {stepDone ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                      </span>
                      <span
                        className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${
                          stepActive || stepDone ? "text-[#f4f0ff]" : "text-violet-200/60"
                        }`}
                      >
                        {stepItem.label}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 h-1.5 rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#10b981_0%,#22c55e_55%,#86efac_100%)] transition-[width] duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <div className="mt-5">
              {currentStep === "phone" ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-300/45 bg-emerald-400/14 text-emerald-100">
                      <PhoneCall className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.17em] text-violet-200/85">
                        Kontaktní údaje
                      </p>
                      <h3 className="mt-1 text-base font-semibold text-white">Telefon a IČO</h3>
                      <p className="mt-1 text-sm leading-relaxed text-violet-100/66">
                        Údaje se uloží do profilu a použijí se tam, kde aplikace pracuje
                        s identifikací a kontaktem poradce.
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-2">
                      <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-violet-200/78">
                        Tel. číslo
                      </span>
                      <input
                        type="tel"
                        inputMode="tel"
                        value={phone}
                        onChange={(event) =>
                          onPhoneChange(event.target.value.slice(0, phoneMaxLength))
                        }
                        placeholder="777 123 456"
                        maxLength={phoneMaxLength}
                        disabled={phoneSaving}
                        className={ACCOUNT_SETUP_FIELD_CLASS}
                      />
                    </label>

                    <label className="block space-y-2">
                      <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-violet-200/78">
                        IČO
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={ico}
                        onChange={(event) =>
                          onIcoChange(event.target.value.replace(/\D+/g, "").slice(0, icoMaxLength))
                        }
                        placeholder="12345678"
                        maxLength={icoMaxLength}
                        disabled={phoneSaving}
                        className={ACCOUNT_SETUP_FIELD_CLASS}
                      />
                    </label>
                  </div>
                </div>
              ) : null}

              {currentStep === "career" ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-300/45 bg-emerald-400/14 text-emerald-100">
                      <BriefcaseBusiness className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.17em] text-violet-200/85">
                        Historie kariéry
                      </p>
                      <h3 className="mt-1 text-base font-semibold text-white">Nastavení kariéry</h3>
                      <p className="mt-1 text-sm leading-relaxed text-violet-100/66">
                        Pozice podle období se používají pro předvyplnění kalkulačky
                        a přesné provizní výpočty.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-3 py-3 text-sm leading-relaxed text-emerald-50/88">
                    Historii kariéry najdeš v Maxxu pod odkazem{" "}
                    <a
                      href="https://sjednatel.bohemiaservis.cz/broker-card"
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 rounded-full border border-emerald-200/40 bg-emerald-300/18 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-white no-underline transition hover:bg-emerald-300/28"
                    >
                      KLIKNI ZDE
                      <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
                    </a>
                    , záložka Kariéra. Řádky zadávej od nejstarší pozice po aktuální.
                    Datumy zadávej totožné.
                  </div>

                  <div className="space-y-2.5">
                    {timelineDraft.map((row, rowIndex) => {
                      const rowRangeError = hasInvalidRangeOrder(
                        row.validFrom.trim(),
                        row.validTo.trim()
                      );
                      const isLastDraftRow = rowIndex === timelineDraft.length - 1;
                      const rowOpenEndedNotLast = !row.validTo.trim() && !isLastDraftRow;

                      return (
                        <div
                          key={row.id}
                          className={`rounded-2xl border bg-white/[0.05] px-3 py-3 shadow-[0_10px_24px_rgba(7,6,25,0.22)] ${
                            rowRangeError || rowOpenEndedNotLast
                              ? "border-rose-300/65"
                              : "border-white/14"
                          }`}
                        >
                          <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_150px_150px_auto]">
                            <label className="space-y-1.5">
                              <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-200/66">
                                Pozice
                              </span>
                              <select
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
                              <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-200/66">
                                Platí od
                              </span>
                              <input
                                type="date"
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
                              <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-200/66">
                                Platí do
                              </span>
                              <input
                                type="date"
                                value={row.validTo}
                                onChange={(event) =>
                                  onTimelineRowChange(row.id, {
                                    validTo: event.target.value,
                                  })
                                }
                                disabled={timelineSaving}
                                className={`${ACCOUNT_SETUP_FIELD_CLASS} [color-scheme:dark]`}
                              />
                            </label>
                            <div className="flex items-end">
                              <button
                                type="button"
                                onClick={() => onRemoveTimelineRow(row.id)}
                                disabled={timelineSaving}
                                className="inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-2xl border border-white/18 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-violet-100 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-55 md:w-auto"
                              >
                                <Trash2 className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
                                Smazat
                              </button>
                            </div>
                          </div>

                          {rowRangeError ? (
                            <p className="mt-2 text-xs font-medium text-rose-100">
                              Datum DO nemůže být dřív než datum OD.
                            </p>
                          ) : null}
                          {rowOpenEndedNotLast ? (
                            <p className="mt-2 text-xs font-medium text-rose-100">
                              Současnost (prázdné DO) může být jen u posledního řádku.
                            </p>
                          ) : null}
                          {isLastDraftRow && !row.validTo.trim() ? (
                            <div className="mt-2">
                              <span className="rounded-full border border-emerald-300/40 bg-emerald-400/14 px-2.5 py-1 text-[11px] font-semibold text-emerald-100">
                                Poslední pozice běží do současnosti
                              </span>
                            </div>
                          ) : null}
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
                </div>
              ) : null}

              {currentStep === "security" ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-300/45 bg-emerald-400/14 text-emerald-100">
                      <ShieldCheck className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.17em] text-violet-200/85">
                        Zabezpečení účtu
                      </p>
                      <h3 className="mt-1 text-base font-semibold text-white">Zapnutí 2FA</h3>
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

                  {!mfaEnabled && !mfaSecretKey ? (
                    <div className="rounded-2xl border border-white/14 bg-white/[0.05] px-3 py-3">
                      <p className="text-sm leading-relaxed text-violet-100/68">
                        Nejdřív potvrď aktuální heslo. Potom se zobrazí QR kód pro
                        přidání účtu do aplikace s ověřovacími kódy.
                      </p>
                      <label className="mt-3 block space-y-2">
                        <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-violet-200/78">
                          Aktuální heslo
                        </span>
                        <input
                          type="password"
                          autoComplete="current-password"
                          value={mfaPassword}
                          onChange={(event) => onMfaPasswordChange(event.target.value)}
                          placeholder="Aktuální heslo"
                          disabled={mfaSaving}
                          className={ACCOUNT_SETUP_FIELD_CLASS}
                        />
                      </label>
                    </div>
                  ) : null}

                  {!mfaEnabled && mfaSecretKey ? (
                    <div className="mt-1 grid gap-5 lg:grid-cols-[216px_minmax(0,1fr)] lg:items-center">
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
                                onClick={() => setIsMfaHelpOpen(true)}
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

                        <details className="group mt-4 border-t border-white/10 pt-3">
                          <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-violet-100/66 transition hover:text-violet-50 [&::-webkit-details-marker]:hidden">
                            <ChevronRight className="h-3.5 w-3.5 transition group-open:rotate-90" aria-hidden="true" />
                            Nemůžeš QR kód naskenovat? Použij ruční klíč.
                          </summary>
                          <div className="mt-2 rounded-xl border border-white/10 bg-slate-950/30 px-3 py-2">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-200/62">
                              Ruční klíč
                            </p>
                            <p className="mt-1 break-all font-mono text-xs font-semibold text-violet-50">
                              {mfaSecretKey}
                            </p>
                          </div>
                        </details>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            {info ? (
              <p className="mt-4 rounded-2xl border border-emerald-300/35 bg-emerald-400/14 px-3 py-2 text-xs font-semibold text-emerald-100">
                {info}
              </p>
            ) : null}

            {error ? (
              <p className="mt-4 rounded-2xl border border-rose-300/45 bg-rose-400/15 px-3 py-2 text-xs font-semibold text-rose-100">
                {error}
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={onLogout}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-full border border-white/14 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-violet-100/72 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-55"
              >
                {logoutLabel}
              </button>

              <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                {mfaGraceActive && currentStep === "security" ? (
                  <button
                    type="button"
                    onClick={onDismissGrace}
                    disabled={busy}
                    className="inline-flex items-center gap-2 rounded-full border border-white/18 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-violet-100 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    Připomenout později
                  </button>
                ) : null}

                {stepIndex > 0 ? (
                  <button
                    type="button"
                    onClick={onBack}
                    disabled={busy}
                    className="inline-flex items-center gap-2 rounded-full border border-white/22 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-violet-100 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    Zpět
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={onPrimaryAction}
                  disabled={busy}
                  className="inline-flex min-w-[154px] items-center justify-center gap-2 rounded-full border border-emerald-300/25 bg-[linear-gradient(120deg,#059669_0%,#10b981_55%,#34d399_100%)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(16,185,129,0.32)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : stepIndex < lastStepIndex ? (
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                  )}
                  {primaryLabel}
                </button>
              </div>
            </div>
          </>
        )}
      </section>
      {isMfaHelpOpen ? <MfaHelpDialog onClose={() => setIsMfaHelpOpen(false)} /> : null}
    </div>
  );
}
