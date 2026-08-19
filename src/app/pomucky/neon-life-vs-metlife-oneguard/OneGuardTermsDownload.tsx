"use client";

import { Download, FileText, Loader2 } from "lucide-react";

import { useSecureDocumentBlob } from "@/app/lib/secureDocuments";

type TermsDownloadProps = {
  error: string | null;
  fileName: string;
  loadingLabel: string;
  period: string;
  product: string;
  url: string | null;
};

function TermsDownload({
  error,
  fileName,
  loadingLabel,
  period,
  product,
  url,
}: TermsDownloadProps) {
  if (error) {
    return (
      <span className="flex min-h-[58px] items-center rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
        Dokument se nepodařilo načíst.
      </span>
    );
  }

  if (!url) {
    return (
      <span className="flex min-h-[58px] items-center gap-2.5 rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-xs font-bold text-slate-500 shadow-[0_8px_20px_rgba(15,23,42,0.06)]">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        </span>
        <span>{loadingLabel}</span>
      </span>
    );
  }

  return (
    <a
      href={url}
      download={fileName}
      className="group relative flex min-h-[58px] items-center gap-2.5 overflow-hidden rounded-xl border border-violet-300/40 bg-[linear-gradient(120deg,#7c3aed_0%,#a855f7_55%,#c084fc_100%)] px-3 py-2 !text-white shadow-[0_10px_22px_rgba(124,58,237,0.24)] transition-all duration-200 hover:-translate-y-0.5 hover:brightness-105 hover:shadow-[0_14px_28px_rgba(124,58,237,0.3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 [&_*]:!text-white"
    >
      <span className="absolute inset-x-0 top-0 h-[3px] bg-[linear-gradient(90deg,rgba(255,255,255,0.3),rgba(255,255,255,0.85),rgba(255,255,255,0.22))]" aria-hidden="true" />
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-white/14 text-white shadow-[0_6px_14px_rgba(46,16,101,0.22)]">
        <FileText className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[9px] font-black uppercase tracking-[0.13em] text-white/75">
          Pojistné podmínky · PDF
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-black leading-none text-white">
            {product}
          </span>
          <span className="rounded-full border border-white/20 bg-white/14 px-1.5 py-0.5 text-[9px] font-black tabular-nums text-white">
            {period}
          </span>
        </span>
      </span>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/25 bg-white/14 text-white shadow-sm transition-colors group-hover:bg-white/24">
        <Download className="h-3.5 w-3.5 transition-transform group-hover:translate-y-0.5" aria-hidden="true" />
      </span>
    </a>
  );
}

export function OneGuardTermsDownload() {
  const oneGuard = useSecureDocumentBlob("metlife-oneguard-conditions-2024");
  const neon = useSecureDocumentBlob("cpp-neon-conditions-2026");

  return (
    <div className="grid max-w-[640px] gap-2 sm:grid-cols-2">
      <TermsDownload
        error={oneGuard.error}
        fileName="2024_09_OneGuard_Pojistne_podminky_PR059_PP_OGR0924.pdf"
        loadingLabel="Načítám podmínky OneGuard…"
        period="09/2024"
        product="MetLife OneGuard"
        url={oneGuard.url}
      />
      <TermsDownload
        error={neon.error}
        fileName="cpp-neon-04-2026.pdf"
        loadingLabel="Načítám podmínky NEON Life…"
        period="04/2026"
        product="ČPP NEON Life"
        url={neon.url}
      />
    </div>
  );
}
