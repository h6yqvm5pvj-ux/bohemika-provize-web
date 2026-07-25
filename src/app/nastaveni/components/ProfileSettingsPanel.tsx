"use client";

import {
  Building2,
  CheckCircle2,
  Landmark,
  Mail,
  PhoneCall,
  ShieldCheck,
  UserRound,
  Wrench,
} from "lucide-react";

type InlineStatus = {
  type: "success" | "error" | "info";
  message: string;
};

type ProfileSettingsPanelProps = {
  profileInitial: string;
  profileDisplayName: string;
  profileStatus: InlineStatus | null;
  completionPercent: number;
  positionLabel: string;
  commissionModeLabel: string;
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
  fullNameMaxLength: number;
  agencyNumberMaxLength: number;
  icoMaxLength: number;
  phoneNumberMaxLength: number;
  onFullNameChange: (value: string) => void;
  onAgencyNumberChange: (value: string) => void;
  onIcoChange: (value: string) => void;
  onPhoneNumberChange: (value: string) => void;
  onClearAppCache: () => void | Promise<void>;
  onSaveProfile: () => void | Promise<void>;
};

const statusClass = (status: InlineStatus): string => {
  if (status.type === "success") return "border-violet-200 bg-violet-50 text-violet-800";
  if (status.type === "info") return "border-slate-200 bg-white text-slate-700";
  return "border-rose-200 bg-rose-50 text-rose-700";
};

export function ProfileSettingsPanel({
  profileInitial,
  profileDisplayName,
  profileStatus,
  completionPercent,
  positionLabel,
  commissionModeLabel,
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
  fullNameMaxLength,
  agencyNumberMaxLength,
  icoMaxLength,
  phoneNumberMaxLength,
  onFullNameChange,
  onAgencyNumberChange,
  onIcoChange,
  onPhoneNumberChange,
  onClearAppCache,
  onSaveProfile,
}: ProfileSettingsPanelProps) {
  return (
    <section className="relative overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_14px_34px_rgba(15,23,42,0.08)] sm:rounded-[28px] sm:shadow-[0_26px_70px_rgba(15,23,42,0.10)] lg:col-span-2">
      <form
        className="flex min-w-0 flex-col bg-[linear-gradient(180deg,#ffffff_0%,#faf5ff_100%)]"
        onSubmit={(event) => {
          event.preventDefault();
          void onSaveProfile();
        }}
      >
        <div className="settings-profile-hero relative overflow-hidden bg-[#0b0717] px-4 py-4 text-white sm:px-7 sm:py-5">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#0b0717_0%,#7c3aed_56%,#c084fc_100%)]" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,rgba(124,58,237,0.24)_0%,rgba(11,7,23,0)_44%,rgba(168,85,247,0.16)_100%)]" />

          <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] border border-white/20 bg-white text-xl font-black text-slate-950 shadow-[0_16px_30px_rgba(0,0,0,0.26)] sm:h-[68px] sm:w-[68px] sm:rounded-[20px] sm:text-2xl">
                {profileInitial}
              </div>
              <div className="min-w-0">
                <div className="inline-flex items-center gap-2 rounded-full border border-violet-200/25 bg-white/10 px-3 py-1 text-xs font-semibold text-violet-100">
                  <UserRound size={14} strokeWidth={2} aria-hidden="true" />
                  Profil poradce
                </div>
                <p className="settings-profile-hero-name mt-2 break-words text-[1.45rem] font-black leading-tight text-white sm:text-[2rem]">
                  {profileDisplayName}
                </p>
                <p className="mt-1 text-sm font-semibold text-violet-100/75">
                  Kontaktní profil a údaje účtu
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center md:flex-col md:items-end">
              {profileStatus ? (
                <p className={`w-fit rounded-full border bg-white px-3 py-1.5 text-xs font-semibold ${statusClass(profileStatus)}`}>
                  {profileStatus.message}
                </p>
              ) : null}
              <div className="w-fit rounded-[18px] border border-white/12 bg-white/[0.08] px-3 py-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-slate-950">
                    <ShieldCheck size={17} strokeWidth={2} aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-100/65">
                      Bohemka.App
                    </p>
                    <p className="mt-0.5 text-sm font-semibold leading-snug text-white">
                      Osobní profil
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

          <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-7 sm:py-5">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-[16px] border border-violet-200 bg-violet-50 px-3 py-3 sm:rounded-[20px] sm:px-4 sm:py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-800">
                      Úplnost profilu
                    </p>
                    <p className="mt-1 text-xl font-black text-slate-950 sm:text-2xl">
                      {completionPercent} %
                    </p>
                  </div>
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-700 text-white shadow-[0_10px_20px_rgba(109,40,217,0.22)] sm:h-11 sm:w-11 sm:rounded-2xl">
                    <CheckCircle2 size={21} strokeWidth={2.2} aria-hidden="true" />
                  </span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                  <div
                    className="h-full rounded-full bg-violet-700"
                    style={{ width: `${completionPercent}%` }}
                  />
                </div>
              </div>

              <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-3 sm:rounded-[20px] sm:px-4 sm:py-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Pozice a režim
                </p>
                <p className="mt-2 text-sm font-black text-slate-950">{positionLabel}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Provize: {commissionModeLabel}
                </p>
              </div>

              <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-3 sm:rounded-[20px] sm:px-4 sm:py-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Přímý manažer
                </p>
                <p className="mt-2 text-sm font-black text-slate-950">{managerNameDisplay}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {managerEmailDisplay ? managerEmailDisplay : "Není doplněn v týmové hierarchii"}
                </p>
              </div>
            </div>
          </div>

          <div className="flex-1 space-y-4 px-4 py-4 sm:space-y-6 sm:px-7 sm:py-6">
            <div className="grid grid-cols-1 gap-3 sm:gap-4 xl:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-semibold text-slate-600">
                  Jméno a příjmení
                </label>
                <div className="relative">
                  <UserRound
                    size={17}
                    strokeWidth={2}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    type="text"
                    className={`${fieldClass} min-h-12 rounded-[16px] border-slate-200 pl-11 text-base shadow-none focus:border-violet-700 focus:ring-2 focus:ring-violet-200 sm:min-h-[54px] sm:rounded-[18px]`}
                    value={fullName}
                    onChange={(event) =>
                      onFullNameChange(event.target.value.slice(0, fullNameMaxLength))
                    }
                    placeholder="Jméno a příjmení"
                    maxLength={fullNameMaxLength}
                    disabled={profileSaving}
                  />
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-500">
                  Toto jméno se používá v PDF, pomůckách, exportech, notifikacích a týmových
                  přehledech.
                </p>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold text-slate-600">
                  E-mail
                </label>
                <div className="flex min-h-12 items-center gap-3 rounded-[16px] border border-slate-200 bg-slate-100/80 px-3 py-2.5 text-sm font-semibold text-slate-700 sm:min-h-[54px] sm:rounded-[18px] sm:px-4 sm:py-3">
                  <Mail size={17} strokeWidth={2} className="shrink-0 text-slate-500" aria-hidden="true" />
                  <span className="min-w-0 break-all">{userEmail}</span>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold text-slate-600">
                  Agenturní číslo
                </label>
                <div className="relative">
                  <Landmark
                    size={17}
                    strokeWidth={2}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    type="text"
                    inputMode="text"
                    className={`${fieldClass} min-h-12 rounded-[16px] border-slate-200 pl-11 text-base shadow-none focus:border-violet-700 focus:ring-2 focus:ring-violet-200 sm:min-h-[54px] sm:rounded-[18px]`}
                    value={agencyNumber}
                    onChange={(event) => onAgencyNumberChange(event.target.value)}
                    placeholder="Doplň agenturní číslo"
                    maxLength={agencyNumberMaxLength}
                    disabled={profileSaving}
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold text-slate-600">IČO</label>
                <div className="relative">
                  <Building2
                    size={17}
                    strokeWidth={2}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    className={`${fieldClass} min-h-12 rounded-[16px] border-slate-200 pl-11 pr-4 text-base shadow-none focus:border-violet-700 focus:ring-2 focus:ring-violet-200 sm:min-h-[54px] sm:rounded-[18px]`}
                    value={ico}
                    onChange={(event) =>
                      onIcoChange(event.target.value.replace(/\D+/g, "").slice(0, icoMaxLength))
                    }
                    placeholder="12345678"
                    maxLength={icoMaxLength}
                    disabled={profileSaving}
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold text-slate-600">
                  Tel. číslo
                </label>
                <div className="relative">
                  <PhoneCall
                    size={17}
                    strokeWidth={2}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    type="tel"
                    inputMode="tel"
                    className={`${fieldClass} min-h-12 rounded-[16px] border-slate-200 pl-11 pr-4 text-base shadow-none focus:border-violet-700 focus:ring-2 focus:ring-violet-200 sm:min-h-[54px] sm:rounded-[18px]`}
                    value={phoneNumber}
                    onChange={(event) => onPhoneNumberChange(event.target.value)}
                    placeholder="777 123 456"
                    maxLength={phoneNumberMaxLength}
                    disabled={profileSaving}
                  />
                </div>
              </div>

              <div className="rounded-[16px] border border-slate-200 bg-white p-3 shadow-[0_8px_18px_rgba(15,23,42,0.04)] sm:rounded-[18px] sm:p-4 sm:shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white">
                    <Wrench size={17} strokeWidth={2} aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-bold text-slate-950">Servis aplikace</h4>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">
                      Obnoví lokální PWA cache bez mazání profilu a smluv.
                    </p>
                    {appCacheStatus ? (
                      <p className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(appCacheStatus)}`}>
                        {appCacheStatus.message}
                      </p>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void onClearAppCache()}
                  disabled={appCacheClearing}
                  className="mt-4 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:border-slate-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Wrench size={16} strokeWidth={2} aria-hidden="true" />
                  {appCacheClearing ? "Obnovuji..." : "Obnovit cache aplikace"}
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-7 sm:py-4">
            <button
              type="submit"
              disabled={profileSaving}
              className="inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-2xl border border-violet-700 bg-violet-700 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_16px_30px_rgba(109,40,217,0.24)] transition hover:-translate-y-0.5 hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 sm:w-auto sm:min-w-[180px] [&_*]:!text-white"
            >
              <ShieldCheck size={17} strokeWidth={2} aria-hidden="true" />
              {profileSaving ? "Ukládám..." : "Uložit profil"}
            </button>
          </div>
      </form>
    </section>
  );
}
