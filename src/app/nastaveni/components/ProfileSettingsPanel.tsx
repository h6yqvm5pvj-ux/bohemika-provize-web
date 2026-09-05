"use client";

import { useState } from "react";
import {
  Building2,
  Calculator,
  CheckCircle2,
  CircleAlert,
  Landmark,
  Loader2,
  Mail,
  PhoneCall,
  ShieldCheck,
  Snail,
  UserRound,
  Wrench,
  Zap,
} from "lucide-react";

import type { CommissionMode } from "../../types/domain";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { isValidProfileIco, isValidProfilePhone } from "@/lib/profileFields";
import type { AresIcoLookupState } from "@/components/profile/useAresIcoLookup";
import { ProfileAvatarPicker } from "./ProfileAvatarPicker";

type InlineStatus = {
  type: "success" | "error" | "info";
  message: string;
};

type ProfileSettingsPanelProps = {
  profileInitial: string;
  profileDisplayName: string;
  profileAvatar: string;
  profileStatus: InlineStatus | null;
  completionPercent: number;
  positionLabel: string;
  commissionMode: CommissionMode;
  commissionModes: { id: CommissionMode; label: string }[];
  managerNameDisplay: string;
  managerEmailDisplay: string;
  fieldClass: string;
  fullName: string;
  userEmail: string;
  agencyNumber: string;
  ico: string;
  phoneNumber: string;
  appCacheStatus: InlineStatus | null;
  appCacheClearing: boolean;
  profileSaving: boolean;
  profileDirty: boolean;
  aresIcoLookup: AresIcoLookupState;
  fullNameMaxLength: number;
  agencyNumberMaxLength: number;
  icoMaxLength: number;
  phoneNumberMaxLength: number;
  onFullNameChange: (value: string) => void;
  onProfileAvatarChange: (value: string) => void;
  onProfileAvatarUpload: (file: File) => Promise<void>;
  onAgencyNumberChange: (value: string) => void;
  onIcoChange: (value: string) => void;
  onPhoneNumberChange: (value: string) => void;
  onCommissionModeChange: (value: CommissionMode) => void | Promise<void>;
  onClearAppCache: () => void | Promise<void>;
  onSaveProfile: () => void | Promise<void>;
};

const statusClass = (status: InlineStatus): string => {
  if (status.type === "success") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (status.type === "info") {
    return "border-violet-200 bg-violet-50 text-violet-800";
  }
  return "border-rose-200 bg-rose-50 text-rose-700";
};

const fieldIconClass =
  "pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400";

export function ProfileSettingsPanel({
  profileInitial,
  profileDisplayName,
  profileAvatar,
  profileStatus,
  completionPercent,
  positionLabel,
  commissionMode,
  commissionModes,
  managerNameDisplay,
  managerEmailDisplay,
  fieldClass,
  fullName,
  userEmail,
  agencyNumber,
  ico,
  phoneNumber,
  appCacheStatus,
  appCacheClearing,
  profileSaving,
  profileDirty,
  aresIcoLookup,
  fullNameMaxLength,
  agencyNumberMaxLength,
  icoMaxLength,
  phoneNumberMaxLength,
  onFullNameChange,
  onProfileAvatarChange,
  onProfileAvatarUpload,
  onAgencyNumberChange,
  onIcoChange,
  onPhoneNumberChange,
  onCommissionModeChange,
  onClearAppCache,
  onSaveProfile,
}: ProfileSettingsPanelProps) {
  const [completionOpen, setCompletionOpen] = useState(false);
  const ProfileStatusIcon =
    profileStatus?.type === "error" ? CircleAlert : CheckCircle2;
  const fullNameError = fullName.trim() ? "" : "Doplň jméno a příjmení.";
  const agencyNumberError =
    agencyNumber.length > agencyNumberMaxLength
      ? `Maximálně ${agencyNumberMaxLength} znaků.`
      : "";
  const icoError = isValidProfileIco(ico) ? "" : `IČO musí mít ${icoMaxLength} číslic.`;
  const phoneError = isValidProfilePhone(phoneNumber)
    ? ""
    : "Telefonní číslo musí obsahovat alespoň 9 číslic.";
  const profileValid = !fullNameError && !agencyNumberError && !icoError && !phoneError;
  const savedJustNow = profileStatus?.type === "success" && !profileDirty;
  const saveDisabled = profileSaving || !profileDirty || !profileValid;
  const saveButtonLabel = profileSaving
    ? "Ukládám…"
    : savedJustNow
      ? "Uloženo"
      : "Uložit změny";
  const saveButtonTone = savedJustNow
    ? "border-emerald-600 bg-emerald-600 shadow-[0_14px_30px_rgba(5,150,105,0.24)]"
    : profileDirty && profileValid
      ? "border-violet-700 bg-[linear-gradient(135deg,#7c3aed_0%,#6d28d9_100%)] shadow-[0_14px_30px_rgba(109,40,217,0.28)] hover:-translate-y-0.5 hover:shadow-[0_18px_36px_rgba(109,40,217,0.34)]"
      : "border-slate-200 bg-slate-100 shadow-none";
  const completionItems = [
    { label: "Jméno a příjmení", complete: Boolean(fullName.trim()) },
    { label: "Agenturní číslo", complete: Boolean(agencyNumber.trim()) },
    { label: "IČO", complete: Boolean(ico.trim()) && !icoError },
    { label: "Telefonní číslo", complete: Boolean(phoneNumber.trim()) && !phoneError },
  ];

  return (
    <section className="relative rounded-[24px] border border-slate-200/90 bg-white shadow-[0_22px_70px_rgba(15,23,42,0.10)] sm:rounded-[32px] lg:col-span-2">
      {savedJustNow ? (
        <div
          className="fixed right-4 top-4 z-[120] flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-bold text-emerald-800 shadow-[0_20px_60px_rgba(5,150,105,0.24)] sm:right-6 sm:top-6"
          role="status"
          aria-live="polite"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
            <CheckCircle2 size={17} strokeWidth={2.4} aria-hidden="true" />
          </span>
          Profil byl úspěšně uložen
        </div>
      ) : null}
      <form
        className="min-w-0 pb-24 sm:pb-0"
        onSubmit={(event) => {
          event.preventDefault();
          void onSaveProfile();
        }}
      >
        <header className="relative overflow-hidden rounded-t-[23px] bg-[#0d071c] px-4 py-5 text-white sm:rounded-t-[31px] sm:px-7 sm:py-7 lg:px-8">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#7c3aed_0%,#a855f7_55%,#d8b4fe_100%)]"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -right-24 -top-32 h-72 w-72 rounded-full bg-violet-600/25 blur-3xl"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -bottom-32 left-1/4 h-56 w-56 rounded-full bg-fuchsia-500/10 blur-3xl"
            aria-hidden="true"
          />

          <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-4 sm:gap-5">
              <ProfileAvatar
                src={profileAvatar}
                name={profileDisplayName || profileInitial}
                className="h-[68px] w-[68px] rounded-[21px] border-2 border-white/25 text-[4.25rem] shadow-[0_18px_40px_rgba(0,0,0,0.34)] sm:h-20 sm:w-20 sm:rounded-[24px] sm:text-[5rem]"
                fallbackClassName="bg-white text-slate-950"
                sizes="80px"
                priority
              />
              <div className="min-w-0">
                <div className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.08] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-violet-100">
                  <ShieldCheck size={12} strokeWidth={2.2} aria-hidden="true" />
                  Osobní profil
                </div>
                <h2 className="mt-2 break-words text-[1.55rem] font-black leading-tight tracking-[-0.025em] !text-white sm:text-[2rem]">
                  {profileDisplayName}
                </h2>
                <p className="mt-1 text-xs font-medium text-violet-100/65 sm:text-sm">
                  Správa identity a kontaktních údajů
                </p>
              </div>
            </div>

            <div className="w-full rounded-[20px] border border-white/10 bg-white/[0.07] p-2 backdrop-blur-sm lg:w-[280px]">
              <button
                type="button"
                onClick={() => setCompletionOpen((current) => !current)}
                className="w-full rounded-2xl p-2 text-left transition hover:bg-white/[0.06]"
                aria-expanded={completionOpen}
                aria-controls="profile-completion-details"
              >
                <span className="flex items-center justify-between gap-4">
                  <span>
                    <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-violet-100/60">
                      Úplnost profilu
                    </span>
                    <span className="mt-1 block text-2xl font-black tracking-tight !text-white">
                      {completionPercent} %
                    </span>
                  </span>
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-violet-700 shadow-[0_12px_28px_rgba(0,0,0,0.18)]">
                    <CheckCircle2 size={22} strokeWidth={2.3} aria-hidden="true" />
                  </span>
                </span>
                <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-white/10">
                  <span
                    className="block h-full rounded-full bg-[linear-gradient(90deg,#a78bfa_0%,#e9d5ff_100%)] transition-[width] duration-500"
                    style={{ width: `${completionPercent}%` }}
                  />
                </span>
                <span className="mt-2 block text-[10px] font-semibold text-violet-100/60">
                  Kliknutím zobrazíš, co ještě chybí
                </span>
              </button>

              {completionOpen ? (
                <div
                  id="profile-completion-details"
                  className="mx-2 mb-2 mt-1 space-y-1.5 border-t border-white/10 pt-3"
                >
                  {completionItems.map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between gap-3 text-xs"
                    >
                      <span className="font-medium text-violet-50/80">{item.label}</span>
                      <span
                        className={`inline-flex items-center gap-1 font-bold ${
                          item.complete ? "text-emerald-300" : "text-amber-300"
                        }`}
                      >
                        {item.complete ? (
                          <CheckCircle2 size={13} aria-hidden="true" />
                        ) : (
                          <CircleAlert size={13} aria-hidden="true" />
                        )}
                        {item.complete ? "Hotovo" : "Chybí"}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <div className="rounded-b-[23px] bg-[linear-gradient(145deg,#f8fafc_0%,#ffffff_46%,#faf5ff_100%)] p-4 sm:rounded-none sm:p-6 lg:p-7">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.75fr)] lg:items-start">
            <div className="space-y-5">
              <section className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_10px_32px_rgba(15,23,42,0.05)] sm:p-5">
                <div className="mb-5 flex items-start gap-3 border-b border-slate-100 pb-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                    <UserRound size={18} strokeWidth={2.2} aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-violet-700">
                      Osobní údaje
                    </p>
                    <h3 className="mt-1 text-base font-black text-slate-950 sm:text-lg">
                      Kontaktní a firemní informace
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">
                      Údaje používáme v dokumentech, exportech, notifikacích a týmových přehledech.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-x-4 gap-y-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-xs font-bold text-slate-600">
                      Jméno a příjmení
                    </label>
                    <div className="relative">
                      <UserRound
                        size={17}
                        strokeWidth={2}
                        className={fieldIconClass}
                        aria-hidden="true"
                      />
                      <input
                        type="text"
                        className={`${fieldClass} min-h-[52px] rounded-2xl pl-11 pr-11 shadow-none ${
                          fullNameError
                            ? "border-rose-300 focus:border-rose-500 focus:ring-4 focus:ring-rose-100"
                            : "border-slate-200 focus:border-violet-600 focus:ring-4 focus:ring-violet-100"
                        }`}
                        value={fullName}
                        onChange={(event) =>
                          onFullNameChange(event.target.value.slice(0, fullNameMaxLength))
                        }
                        placeholder="Jméno a příjmení"
                        maxLength={fullNameMaxLength}
                        disabled={profileSaving}
                        aria-invalid={Boolean(fullNameError)}
                        aria-describedby={fullNameError ? "profile-name-error" : undefined}
                      />
                      {!fullNameError ? (
                        <CheckCircle2
                          size={17}
                          className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-emerald-500"
                          aria-hidden="true"
                        />
                      ) : null}
                    </div>
                    {fullNameError ? (
                      <p id="profile-name-error" className="mt-1.5 text-[11px] font-semibold text-rose-600">
                        {fullNameError}
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-bold text-slate-600">
                      Přihlašovací e-mail
                    </label>
                    <div className="flex min-h-[52px] items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
                      <Mail size={17} strokeWidth={2} className="shrink-0 text-slate-400" aria-hidden="true" />
                      <span className="min-w-0 break-all">{userEmail}</span>
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-bold text-slate-600">
                      Agenturní číslo
                    </label>
                    <div className="relative">
                      <Landmark
                        size={17}
                        strokeWidth={2}
                        className={fieldIconClass}
                        aria-hidden="true"
                      />
                      <input
                        type="text"
                        inputMode="text"
                        className={`${fieldClass} min-h-[52px] rounded-2xl pl-11 pr-11 shadow-none ${
                          agencyNumberError
                            ? "border-rose-300 focus:border-rose-500 focus:ring-4 focus:ring-rose-100"
                            : "border-slate-200 focus:border-violet-600 focus:ring-4 focus:ring-violet-100"
                        }`}
                        value={agencyNumber}
                        onChange={(event) => onAgencyNumberChange(event.target.value)}
                        placeholder="Doplň agenturní číslo"
                        maxLength={agencyNumberMaxLength}
                        disabled={profileSaving}
                        aria-invalid={Boolean(agencyNumberError)}
                      />
                      {agencyNumber.trim() && !agencyNumberError ? (
                        <CheckCircle2
                          size={17}
                          className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-emerald-500"
                          aria-hidden="true"
                        />
                      ) : null}
                    </div>
                    {agencyNumberError ? (
                      <p className="mt-1.5 text-[11px] font-semibold text-rose-600">
                        {agencyNumberError}
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <label htmlFor="profile-ico" className="mb-2 block text-xs font-bold text-slate-600">
                      IČO
                    </label>
                    <div className="relative">
                      <Building2
                        size={17}
                        strokeWidth={2}
                        className={fieldIconClass}
                        aria-hidden="true"
                      />
                      <input
                        id="profile-ico"
                        type="text"
                        inputMode="numeric"
                        className={`${fieldClass} min-h-[52px] rounded-2xl pl-11 ${
                          !icoError && aresIcoLookup.status !== "idle" ? "pr-36" : "pr-11"
                        } shadow-none ${
                          icoError
                            ? "border-rose-300 focus:border-rose-500 focus:ring-4 focus:ring-rose-100"
                            : "border-slate-200 focus:border-violet-600 focus:ring-4 focus:ring-violet-100"
                        }`}
                        value={ico}
                        onChange={(event) =>
                          onIcoChange(event.target.value.replace(/\D+/g, "").slice(0, icoMaxLength))
                        }
                        placeholder="12345678"
                        maxLength={icoMaxLength}
                        disabled={profileSaving}
                        aria-invalid={Boolean(icoError)}
                        aria-describedby={
                          icoError
                            ? "profile-ico-error"
                            : aresIcoLookup.status !== "idle"
                              ? "profile-ico-ares-status"
                              : undefined
                        }
                      />
                      {!icoError && aresIcoLookup.status === "loading" ? (
                        <span
                          id="profile-ico-ares-status"
                          className="absolute right-3 top-1/2 inline-flex -translate-y-1/2 items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-bold text-violet-700"
                          role="status"
                        >
                          <Loader2 size={11} className="animate-spin" aria-hidden="true" />
                          Ověřuji
                        </span>
                      ) : !icoError && aresIcoLookup.status === "match" ? (
                        <span
                          id="profile-ico-ares-status"
                          className={`absolute right-3 top-1/2 inline-flex -translate-y-1/2 items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-bold ${
                            aresIcoLookup.entity.active
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-amber-200 bg-amber-50 text-amber-700"
                          }`}
                          title={[aresIcoLookup.entity.companyName, aresIcoLookup.entity.address]
                            .filter(Boolean)
                            .join(" · ")}
                          role="status"
                        >
                          <CheckCircle2 size={11} aria-hidden="true" />
                          ARES · {aresIcoLookup.entity.active ? "shoda" : "ukončeno"}
                        </span>
                      ) : !icoError && aresIcoLookup.status === "not-found" ? (
                        <span
                          id="profile-ico-ares-status"
                          className="absolute right-3 top-1/2 inline-flex -translate-y-1/2 items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700"
                          title="Pro toto IČO nebyla v ARESu nalezena shoda."
                          role="status"
                        >
                          <CircleAlert size={11} aria-hidden="true" />
                          Nenalezeno
                        </span>
                      ) : !icoError && aresIcoLookup.status === "error" ? (
                        <span
                          id="profile-ico-ares-status"
                          className="absolute right-3 top-1/2 inline-flex -translate-y-1/2 items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700"
                          title={aresIcoLookup.message}
                          role="status"
                        >
                          <CircleAlert size={11} aria-hidden="true" />
                          ARES offline
                        </span>
                      ) : null}
                    </div>
                    {icoError ? (
                      <p id="profile-ico-error" className="mt-1.5 text-[11px] font-semibold text-rose-600">
                        {icoError}
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-bold text-slate-600">
                      Telefonní číslo
                    </label>
                    <div className="relative">
                      <PhoneCall
                        size={17}
                        strokeWidth={2}
                        className={fieldIconClass}
                        aria-hidden="true"
                      />
                      <input
                        type="tel"
                        inputMode="tel"
                        className={`${fieldClass} min-h-[52px] rounded-2xl pl-11 pr-11 shadow-none ${
                          phoneError
                            ? "border-rose-300 focus:border-rose-500 focus:ring-4 focus:ring-rose-100"
                            : "border-slate-200 focus:border-violet-600 focus:ring-4 focus:ring-violet-100"
                        }`}
                        value={phoneNumber}
                        onChange={(event) => onPhoneNumberChange(event.target.value)}
                        placeholder="777 123 456"
                        maxLength={phoneNumberMaxLength}
                        disabled={profileSaving}
                        aria-invalid={Boolean(phoneError)}
                        aria-describedby={phoneError ? "profile-phone-error" : undefined}
                      />
                      {phoneNumber.trim() && !phoneError ? (
                        <CheckCircle2
                          size={17}
                          className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-emerald-500"
                          aria-hidden="true"
                        />
                      ) : null}
                    </div>
                    {phoneError ? (
                      <p id="profile-phone-error" className="mt-1.5 text-[11px] font-semibold text-rose-600">
                        {phoneError}
                      </p>
                    ) : null}
                  </div>
                </div>
              </section>

              <section className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_10px_32px_rgba(15,23,42,0.05)] sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                      <Calculator size={18} strokeWidth={2.2} aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-amber-700">
                        Výchozí kalkulačka
                      </p>
                      <h3 className="mt-1 text-sm font-black text-slate-950 sm:text-base">
                        Režim provizí životního pojištění
                      </h3>
                      <p className="mt-1 max-w-lg text-xs leading-relaxed text-slate-500">
                        Předvyplní se u nového výpočtu. V kalkulačce ho můžeš kdykoli změnit.
                      </p>
                    </div>
                  </div>

                  <div
                    className="grid w-full shrink-0 grid-cols-2 rounded-2xl border border-violet-200 bg-violet-50 p-1 lg:w-[300px]"
                    role="radiogroup"
                    aria-label="Výchozí režim provizí"
                  >
                    {commissionModes.map((modeItem) => {
                      const active = commissionMode === modeItem.id;
                      const isAccelerated = modeItem.id === "accelerated";

                      return (
                        <button
                          key={modeItem.id}
                          type="button"
                          onClick={() => void onCommissionModeChange(modeItem.id)}
                          className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition ${
                            active
                              ? "border-violet-200 bg-white text-slate-950 shadow-[0_5px_14px_rgba(76,29,149,0.12)]"
                              : "border-transparent text-slate-500 hover:text-violet-800"
                          }`}
                          role="radio"
                          aria-checked={active}
                        >
                          {isAccelerated ? (
                            <Zap
                              size={14}
                              strokeWidth={2.3}
                              className="text-amber-500"
                              aria-hidden="true"
                            />
                          ) : (
                            <Snail
                              size={14}
                              strokeWidth={2.3}
                              className={active ? "text-violet-600" : "text-slate-400"}
                              aria-hidden="true"
                            />
                          )}
                          {modeItem.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>
            </div>

            <aside className="space-y-5">
              <ProfileAvatarPicker
                value={profileAvatar}
                displayName={profileDisplayName}
                disabled={profileSaving}
                onChange={onProfileAvatarChange}
                onUpload={onProfileAvatarUpload}
              />

              <section className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_10px_32px_rgba(15,23,42,0.05)] sm:p-5">
                <div className="mb-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-violet-700">
                    Pracovní profil
                  </p>
                  <h3 className="mt-1 text-base font-black text-slate-950">
                    Zařazení v týmu
                  </h3>
                </div>

                <div className="space-y-2.5">
                  <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                      <Building2 size={16} strokeWidth={2.2} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                        Aktuální pozice
                      </p>
                      <p className="mt-0.5 truncate text-sm font-black text-slate-900">
                        {positionLabel}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                      <UserRound size={16} strokeWidth={2.2} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                        Přímý manažer
                      </p>
                      <p className="mt-0.5 truncate text-sm font-black text-slate-900">
                        {managerNameDisplay}
                      </p>
                      <p className="truncate text-[11px] font-medium text-slate-500">
                        {managerEmailDisplay || "Není doplněn v týmové hierarchii"}
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_10px_32px_rgba(15,23,42,0.05)] sm:p-5">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white">
                    <Wrench size={17} strokeWidth={2} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-black text-slate-950">Servis aplikace</h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">
                      Obnoví lokální PWA cache. Profil ani smlouvy se nesmažou.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void onClearAppCache()}
                  disabled={appCacheClearing}
                  className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-xs font-bold text-slate-800 transition hover:border-slate-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {appCacheClearing ? (
                    <Loader2 size={15} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Wrench size={15} strokeWidth={2} aria-hidden="true" />
                  )}
                  {appCacheClearing ? "Obnovuji…" : "Obnovit cache aplikace"}
                </button>
                {appCacheStatus ? (
                  <p className={`mt-3 rounded-xl border px-3 py-2 text-xs font-semibold ${statusClass(appCacheStatus)}`}>
                    {appCacheStatus.message}
                  </p>
                ) : null}
              </section>
            </aside>
          </div>
        </div>

        <footer className="hidden rounded-b-[31px] border-t border-slate-200 bg-white px-4 py-4 sm:flex sm:items-center sm:justify-between sm:gap-3 sm:px-6 lg:px-7">
          <div className="min-w-0">
            {profileStatus ? (
              <p
                className={`inline-flex max-w-full items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${statusClass(profileStatus)}`}
                role={profileStatus.type === "error" ? "alert" : "status"}
              >
                <ProfileStatusIcon size={15} className="shrink-0" aria-hidden="true" />
                <span>{profileStatus.message}</span>
              </p>
            ) : (
              <p className={`inline-flex items-center gap-2 text-xs font-semibold ${profileDirty ? "text-amber-700" : "text-slate-500"}`}>
                <span className={`h-2 w-2 rounded-full ${profileDirty ? "bg-amber-500" : "bg-emerald-500"}`} />
                {profileDirty
                  ? "Máš neuložené změny."
                  : "Všechny změny jsou uložené."}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={saveDisabled}
            className={`inline-flex min-h-[50px] w-full shrink-0 items-center justify-center gap-2 rounded-2xl border px-6 text-sm font-bold transition disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:translate-y-0 sm:w-auto sm:min-w-[190px] ${saveButtonTone} ${savedJustNow || (profileDirty && profileValid) ? "!text-white [&_*]:!text-white [&_svg]:!stroke-white" : "text-slate-400"}`}
          >
            {profileSaving ? (
              <Loader2 size={17} className="animate-spin" aria-hidden="true" />
            ) : savedJustNow ? (
              <CheckCircle2 size={17} strokeWidth={2.3} aria-hidden="true" />
            ) : (
              <ShieldCheck size={17} strokeWidth={2.2} aria-hidden="true" />
            )}
            {saveButtonLabel}
          </button>
        </footer>

        <div className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-[80] flex items-center gap-3 rounded-[20px] border border-slate-200/90 bg-white/95 p-2.5 shadow-[0_22px_70px_rgba(15,23,42,0.24)] backdrop-blur-xl sm:hidden">
          <div className="min-w-0 flex-1 pl-1">
            <p className={`truncate text-[11px] font-bold ${!profileValid ? "text-rose-700" : profileDirty ? "text-amber-700" : "text-slate-500"}`}>
              {!profileValid
                ? "Oprav označené údaje"
                : profileDirty
                  ? "Neuložené změny"
                  : savedJustNow
                    ? "Profil uložen"
                    : "Vše je uložené"}
            </p>
          </div>
          <button
            type="submit"
            disabled={saveDisabled}
            className={`inline-flex min-h-11 min-w-[154px] shrink-0 items-center justify-center gap-2 rounded-2xl border px-4 text-xs font-bold transition disabled:cursor-not-allowed disabled:text-slate-400 ${saveButtonTone} ${savedJustNow || (profileDirty && profileValid) ? "!text-white [&_*]:!text-white [&_svg]:!stroke-white" : "text-slate-400"}`}
          >
            {profileSaving ? (
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            ) : savedJustNow ? (
              <CheckCircle2 size={16} aria-hidden="true" />
            ) : (
              <ShieldCheck size={16} aria-hidden="true" />
            )}
            {saveButtonLabel}
          </button>
        </div>
      </form>
    </section>
  );
}
