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
  if (status.type === "success") return "border-emerald-200 bg-emerald-50 text-emerald-700";
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
    <section className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_26px_70px_rgba(15,23,42,0.10)] lg:col-span-2">
      <div className="grid min-h-[460px] lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="relative overflow-hidden bg-[#07111f] p-5 text-white sm:p-6">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#38bdf8_0%,#34d399_52%,#a3e635_100%)]" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,rgba(14,165,233,0.16)_0%,rgba(7,17,31,0)_38%,rgba(52,211,153,0.13)_100%)]" />

          <div className="relative z-10 flex h-full flex-col justify-between gap-8">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-emerald-100">
                <UserRound size={14} strokeWidth={2} aria-hidden="true" />
                Profil poradce
              </div>

              <div className="space-y-4">
                <div className="flex h-[68px] w-[68px] shrink-0 items-center justify-center rounded-[20px] border border-white/20 bg-white text-2xl font-bold text-slate-950 shadow-[0_18px_36px_rgba(0,0,0,0.28)]">
                  {profileInitial}
                </div>
                <h2 className="break-words text-[1.85rem] font-bold leading-tight text-white">
                  {profileDisplayName}
                </h2>
              </div>
            </div>

            <div className="rounded-[22px] border border-white/12 bg-white/[0.07] p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-950">
                  <ShieldCheck size={17} strokeWidth={2} aria-hidden="true" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                    Bohemka.App
                  </p>
                  <p className="mt-1 text-sm font-semibold leading-snug text-slate-100">
                    Osobní profil
                  </p>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <form
          className="flex min-w-0 flex-col bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)]"
          onSubmit={(event) => {
            event.preventDefault();
            void onSaveProfile();
          }}
        >
          <div className="border-b border-slate-200 px-5 py-5 sm:px-7">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-[0_8px_18px_rgba(15,23,42,0.05)]">
                  <ShieldCheck
                    size={14}
                    strokeWidth={2}
                    className="text-emerald-600"
                    aria-hidden="true"
                  />
                  Údaje účtu
                </div>
                <h3 className="mt-3 text-2xl font-bold leading-tight text-slate-950">
                  Kontaktní profil
                </h3>
              </div>

              {profileStatus ? (
                <p className={`w-fit rounded-full border px-3 py-1.5 text-xs font-semibold ${statusClass(profileStatus)}`}>
                  {profileStatus.message}
                </p>
              ) : null}
            </div>
          </div>

          <div className="border-b border-slate-200 bg-white px-5 py-5 sm:px-7">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                      Úplnost profilu
                    </p>
                    <p className="mt-1 text-2xl font-black text-emerald-950">
                      {completionPercent} %
                    </p>
                  </div>
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-emerald-700 shadow-[0_10px_20px_rgba(16,185,129,0.16)]">
                    <CheckCircle2 size={21} strokeWidth={2.2} aria-hidden="true" />
                  </span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-emerald-100">
                  <div
                    className="h-full rounded-full bg-emerald-600"
                    style={{ width: `${completionPercent}%` }}
                  />
                </div>
              </div>

              <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Pozice a režim
                </p>
                <p className="mt-2 text-sm font-black text-slate-950">{positionLabel}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Provize: {commissionModeLabel}
                </p>
              </div>

              <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-4">
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

          <div className="flex-1 space-y-6 px-5 py-5 sm:px-7 sm:py-6">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div className="xl:col-span-2">
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
                    className={`${fieldClass} min-h-[54px] rounded-[18px] border-slate-200 pl-11 text-base shadow-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10`}
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

              <div className="xl:col-span-2">
                <label className="mb-2 block text-xs font-semibold text-slate-600">
                  E-mail
                </label>
                <div className="flex min-h-[54px] items-center gap-3 rounded-[18px] border border-slate-200 bg-slate-100/80 px-4 py-3 text-sm font-semibold text-slate-700">
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
                    className={`${fieldClass} min-h-[54px] rounded-[18px] border-slate-200 pl-11 text-base shadow-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10`}
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
                    className={`${fieldClass} min-h-[54px] rounded-[18px] border-slate-200 pl-11 pr-4 text-base shadow-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10`}
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
                    className={`${fieldClass} min-h-[54px] rounded-[18px] border-slate-200 pl-11 pr-4 text-base shadow-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10`}
                    value={phoneNumber}
                    onChange={(event) => onPhoneNumberChange(event.target.value)}
                    placeholder="777 123 456"
                    maxLength={phoneNumberMaxLength}
                    disabled={profileSaving}
                  />
                </div>
              </div>

              <div className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
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

          <div className="flex flex-col gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-7">
            <button
              type="submit"
              disabled={profileSaving}
              className="inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-2xl border border-slate-950 bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_16px_30px_rgba(15,23,42,0.22)] transition hover:-translate-y-0.5 hover:bg-black disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 sm:w-auto sm:min-w-[180px]"
            >
              <ShieldCheck size={17} strokeWidth={2} aria-hidden="true" />
              {profileSaving ? "Ukládám..." : "Uložit profil"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
