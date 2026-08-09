"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { Download, Globe, Maximize2, Minimize2, X } from "lucide-react";

import { AdvisorProfileSections } from "@/components/AdvisorProfileSections";
import {
  PremiumOnlineCardPreview,
  type PremiumOnlineCardValue,
} from "@/components/PremiumOnlineCardPreview";
import type { OnlineCardLocale, OnlineCardTranslatedFields } from "@/lib/onlineCardI18n";

type OnlineCardSettingsPanelProps = {
  className: string;
  draft: PremiumOnlineCardValue;
  publishPanel: ReactNode;
  officeSection: ReactNode;
  contactSection: ReactNode;
  fullscreen: boolean;
  saving: boolean;
  publishReady: boolean;
  qrOpen: boolean;
  qrLoading: boolean;
  qrDataUrl: string;
  qrError: string | null;
  publicUrl: string;
  onDraftPatch: (patch: Partial<PremiumOnlineCardValue>) => void;
  onPreviewMeetingCta: () => void;
  onFullscreenChange: (value: boolean) => void;
  onSave: () => void | Promise<void>;
  onQrClose: () => void;
  onDownloadQr: () => void;
};

export function OnlineCardSettingsPanel({
  className,
  draft,
  publishPanel,
  officeSection,
  contactSection,
  fullscreen,
  saving,
  publishReady,
  qrOpen,
  qrLoading,
  qrDataUrl,
  qrError,
  publicUrl,
  onDraftPatch,
  onPreviewMeetingCta,
  onFullscreenChange,
  onSave,
  onQrClose,
  onDownloadQr,
}: OnlineCardSettingsPanelProps) {
  const previewValue = {
    fullName: draft.fullName,
    title: draft.title,
    phone: draft.phone,
    email: draft.email,
    website: draft.website,
    ico: draft.ico,
    bio: draft.bio,
    location: draft.location,
    officeLabel: draft.officeLabel,
    officePhotos: draft.officePhotos,
    translations: draft.translations,
  };
  const updateTranslation = (
    locale: Exclude<OnlineCardLocale, "cs">,
    field: keyof OnlineCardTranslatedFields,
    value: string
  ) => {
    const maxLength = field === "bio" ? 1_000 : field === "officeLabel" ? 160 : 120;
    onDraftPatch({
      translations: {
        ...draft.translations,
        [locale]: {
          ...draft.translations?.[locale],
          [field]: value.slice(0, maxLength),
        },
      },
    });
  };

  return (
    <section className={`h-full space-y-3 sm:space-y-4 lg:col-span-2 ${className}`}>
      <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#4c1d95_0%,#7c3aed_48%,#c084fc_100%)]" />
      <div className="space-y-4 sm:space-y-5">
        {publishPanel}

        <div className="space-y-3 rounded-[20px] border border-violet-100 bg-white px-3 py-3 shadow-[0_12px_30px_rgba(88,28,135,0.06)] sm:space-y-4 sm:rounded-[30px] sm:px-5 sm:py-5 sm:shadow-[0_20px_60px_rgba(88,28,135,0.08)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">
                <Globe size={14} strokeWidth={2} className="text-slate-600" aria-hidden="true" />
                <span>Online Vizitka Studio</span>
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Klikni přímo do náhledu a upravuj obsah naživo. Pod hlavní vizitkou níže navazuje
                obsah profi stránky poradce.
              </p>
            </div>
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <span className="rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-700">
                Živý náhled
              </span>
              <button
                type="button"
                onClick={() => onFullscreenChange(true)}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-slate-900 bg-slate-900 px-3 py-1 text-[11px] font-semibold text-white transition hover:bg-black sm:flex-none"
              >
                <Maximize2 size={12} strokeWidth={2.2} aria-hidden="true" />
                Rozbalit editor
              </button>
            </div>
          </div>

          <div className="online-card-studio-preview overflow-hidden rounded-[28px] bg-[linear-gradient(180deg,#10081f_0%,#0f0b22_48%,#080715_100%)] shadow-[0_24px_70px_rgba(8,6,28,0.38)] sm:rounded-[34px]">
            <PremiumOnlineCardPreview
              editable
              layout="fullWidth"
              density="compact"
              surface="seamless"
              showContactSection={false}
              value={previewValue}
              meetingCta={{
                label: "Sjednat schůzku",
                onClick: onPreviewMeetingCta,
              }}
              onPatch={onDraftPatch}
            />

            <AdvisorProfileSections flush />
            {officeSection}
            {contactSection}
          </div>

          <details className="rounded-[20px] border border-violet-100 bg-violet-50/45 px-4 py-3 text-slate-900">
            <summary className="cursor-pointer text-sm font-bold marker:text-violet-700">
              Anglická a ukrajinská verze obsahu
            </summary>
            <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-600">
              Tyto texty se zobrazí po přepnutí jazyka na veřejné vizitce. Nevyplněné
              položky bezpečně použijí českou variantu.
            </p>
            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              {([
                { id: "en", label: "English", title: "Role / position", bio: "About me", location: "Location", office: "Office name or address" },
                { id: "uk", label: "Українська", title: "Посада / роль", bio: "Про мене", location: "Місто", office: "Назва або адреса офісу" },
              ] as const).map((language) => {
                const translation = draft.translations?.[language.id] ?? {};
                return (
                  <fieldset
                    key={language.id}
                    className="space-y-3 rounded-2xl border border-violet-100 bg-white p-3"
                  >
                    <legend className="px-1 text-sm font-bold text-violet-900">{language.label}</legend>
                    <label className="block text-xs font-semibold text-slate-700">
                      {language.title}
                      <input
                        type="text"
                        value={translation.title ?? ""}
                        onChange={(event) => updateTranslation(language.id, "title", event.target.value)}
                        maxLength={120}
                        className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                      />
                    </label>
                    <label className="block text-xs font-semibold text-slate-700">
                      {language.bio}
                      <textarea
                        value={translation.bio ?? ""}
                        onChange={(event) => updateTranslation(language.id, "bio", event.target.value)}
                        maxLength={1000}
                        rows={4}
                        className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                      />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block text-xs font-semibold text-slate-700">
                        {language.location}
                        <input
                          type="text"
                          value={translation.location ?? ""}
                          onChange={(event) => updateTranslation(language.id, "location", event.target.value)}
                          maxLength={120}
                          className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                        />
                      </label>
                      <label className="block text-xs font-semibold text-slate-700">
                        {language.office}
                        <input
                          type="text"
                          value={translation.officeLabel ?? ""}
                          onChange={(event) => updateTranslation(language.id, "officeLabel", event.target.value)}
                          maxLength={160}
                          className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                        />
                      </label>
                    </div>
                  </fieldset>
                );
              })}
            </div>
          </details>
        </div>
      </div>

      {fullscreen && (
        <div className="fixed inset-0 z-[80] bg-slate-950/25 p-1.5 backdrop-blur-[2px] sm:p-4">
          <div className="mx-auto flex h-full w-full max-w-[1560px] flex-col overflow-hidden rounded-[20px] border border-slate-200/80 bg-[linear-gradient(170deg,#f8fafc_0%,#f1f5f9_48%,#eef2ff_100%)] shadow-[0_24px_70px_rgba(15,23,42,0.18)] sm:rounded-[28px] sm:shadow-[0_32px_100px_rgba(15,23,42,0.2)]">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2.5 sm:px-4 sm:py-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600">
                  Online Vizitka Studio
                </p>
                <p className="text-xs text-slate-500">Režim přes celou stránku. Esc = zavřít.</p>
              </div>
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                <button
                  type="button"
                  onClick={() => void onSave()}
                  disabled={saving || !publishReady}
                  className="inline-flex flex-1 items-center justify-center rounded-full border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
                >
                  {saving ? "Ukládám..." : "Uložit vizitku"}
                </button>
                <button
                  type="button"
                  onClick={() => onFullscreenChange(false)}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 sm:flex-none"
                >
                  <Minimize2 size={12} strokeWidth={2.2} aria-hidden="true" />
                  Zavřít
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-2.5 sm:p-5">
              <div className="w-full space-y-4">
                <div className="online-card-studio-preview overflow-hidden rounded-[28px] bg-[linear-gradient(180deg,#10081f_0%,#0f0b22_48%,#080715_100%)] shadow-[0_24px_70px_rgba(8,6,28,0.38)] sm:rounded-[34px]">
                  <PremiumOnlineCardPreview
                    editable
                    layout="fullWidth"
                    surface="seamless"
                    showContactSection={false}
                    value={previewValue}
                    meetingCta={{
                      label: "Sjednat schůzku",
                      onClick: onPreviewMeetingCta,
                    }}
                    onPatch={onDraftPatch}
                  />
                  <AdvisorProfileSections flush />
                  {officeSection}
                  {contactSection}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {qrOpen ? (
        <div className="fixed inset-0 z-[92] flex items-end justify-center bg-slate-950/40 p-2 backdrop-blur-[2px] sm:items-center sm:p-4">
          <div className="w-full max-w-[460px] rounded-[22px] border border-slate-200 bg-white p-3.5 shadow-[0_24px_64px_rgba(15,23,42,0.28)] sm:rounded-[26px] sm:p-5 sm:shadow-[0_30px_80px_rgba(15,23,42,0.3)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  QR kód vizitky
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  Naskenuj nebo stáhni QR pro sdílení veřejné URL.
                </p>
              </div>
              <button
                type="button"
                onClick={onQrClose}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-100"
                aria-label="Zavřít QR dialog"
              >
                <X size={14} strokeWidth={2.2} />
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              {qrLoading ? (
                <p className="text-center text-xs text-slate-500">Generuji QR kód…</p>
              ) : null}

              {!qrLoading && qrDataUrl ? (
                <Image
                  src={qrDataUrl}
                  alt="QR kód veřejné vizitky"
                  width={340}
                  height={340}
                  className="mx-auto h-auto w-full max-w-[260px] rounded-xl border border-slate-200 bg-white p-2 sm:max-w-[340px]"
                />
              ) : null}

              {qrError ? <p className="text-center text-xs text-rose-700">{qrError}</p> : null}
            </div>

            <p className="mt-3 break-all text-[11px] text-slate-500">{publicUrl}</p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onDownloadQr}
                disabled={!qrDataUrl}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
              >
                Stáhnout QR
                <Download size={12} strokeWidth={2.2} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={onQrClose}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 sm:flex-none"
              >
                Zavřít
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
