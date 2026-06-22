"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { Download, Globe, Maximize2, Minimize2, X } from "lucide-react";

import { AdvisorProfileSections } from "@/components/AdvisorProfileSections";
import {
  PremiumOnlineCardPreview,
  type PremiumOnlineCardValue,
} from "@/components/PremiumOnlineCardPreview";

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
  };

  return (
    <section className={`h-full space-y-4 lg:col-span-2 ${className}`}>
      <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#4c1d95_0%,#7c3aed_48%,#c084fc_100%)]" />
      <div className="space-y-5">
        {publishPanel}

        <div className="space-y-4 rounded-[30px] border border-violet-100 bg-white px-4 py-4 shadow-[0_20px_60px_rgba(88,28,135,0.08)] sm:px-5 sm:py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold uppercase tracking-[0.18em] text-slate-900">
                <Globe size={14} strokeWidth={2} className="text-slate-600" aria-hidden="true" />
                <span>Online Vizitka Studio</span>
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Klikni přímo do náhledu a upravuj obsah naživo. Pod hlavní vizitkou níže najdeš i
                sekce profi stránky poradce.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-700">
                Živý náhled
              </span>
              <button
                type="button"
                onClick={() => onFullscreenChange(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-900 bg-slate-900 px-3 py-1 text-[11px] font-semibold text-white transition hover:bg-black"
              >
                <Maximize2 size={12} strokeWidth={2.2} aria-hidden="true" />
                Rozbalit editor
              </button>
            </div>
          </div>

          <div className="online-card-studio-preview space-y-4">
            <PremiumOnlineCardPreview
              editable
              layout="fullWidth"
              density="compact"
              showContactSection={false}
              value={previewValue}
              meetingCta={{
                label: "Sjednat schůzku",
                onClick: onPreviewMeetingCta,
              }}
              onPatch={onDraftPatch}
            />

            <p className="text-[11px] text-slate-500">
              Přímá editace náhledu upravuje pole vizitky. Odeslání změn do profilu proveď
              tlačítkem Uložit vizitku.
            </p>

            <AdvisorProfileSections />
            {officeSection}
            {contactSection}
          </div>
        </div>
      </div>

      {fullscreen && (
        <div className="fixed inset-0 z-[80] bg-slate-950/25 p-2 backdrop-blur-[2px] sm:p-4">
          <div className="mx-auto flex h-full w-full max-w-[1560px] flex-col overflow-hidden rounded-[28px] border border-slate-200/80 bg-[linear-gradient(170deg,#f8fafc_0%,#f1f5f9_48%,#eef2ff_100%)] shadow-[0_32px_100px_rgba(15,23,42,0.2)]">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600">
                  Online Vizitka Studio
                </p>
                <p className="text-xs text-slate-500">Režim přes celou stránku. Esc = zavřít.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void onSave()}
                  disabled={saving || !publishReady}
                  className="inline-flex items-center justify-center rounded-full border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Ukládám..." : "Uložit vizitku"}
                </button>
                <button
                  type="button"
                  onClick={() => onFullscreenChange(false)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  <Minimize2 size={12} strokeWidth={2.2} aria-hidden="true" />
                  Zavřít
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-3 sm:p-5">
              <div className="w-full space-y-4">
                <div className="online-card-studio-preview space-y-4">
                  <PremiumOnlineCardPreview
                    editable
                    layout="fullWidth"
                    showContactSection={false}
                    value={previewValue}
                    meetingCta={{
                      label: "Sjednat schůzku",
                      onClick: onPreviewMeetingCta,
                    }}
                    onPatch={onDraftPatch}
                  />
                  <AdvisorProfileSections />
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
          <div className="w-full max-w-[460px] rounded-[26px] border border-slate-200 bg-white p-4 shadow-[0_30px_80px_rgba(15,23,42,0.3)] sm:p-5">
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
                  className="mx-auto h-auto w-full max-w-[340px] rounded-xl border border-slate-200 bg-white p-2"
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
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
              >
                Stáhnout QR
                <Download size={12} strokeWidth={2.2} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={onQrClose}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
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
