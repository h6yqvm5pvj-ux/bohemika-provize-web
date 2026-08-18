"use client";

import { Download, Loader2 } from "lucide-react";

import { useSecureDocumentBlob } from "@/app/lib/secureDocuments";

type TermsDownloadProps = {
  error: string | null;
  fileName: string;
  label: string;
  loadingLabel: string;
  theme: "metlife" | "neon";
  url: string | null;
};

function TermsDownload({
  error,
  fileName,
  label,
  loadingLabel,
  theme,
  url,
}: TermsDownloadProps) {
  if (error) {
    return (
      <span className="inline-flex items-center rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-700">
        Dokument se nepodařilo načíst.
      </span>
    );
  }

  if (!url) {
    return (
      <span className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-500 shadow-[0_8px_20px_rgba(15,23,42,0.06)]">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {loadingLabel}
      </span>
    );
  }

  const themeClass =
    theme === "neon"
      ? "border-emerald-300/50 bg-[linear-gradient(135deg,#022c22_0%,#047857_55%,#14b8a6_100%)] shadow-[0_12px_26px_rgba(5,150,105,0.23)] focus-visible:ring-emerald-400"
      : "border-violet-300/35 bg-[linear-gradient(135deg,#020617_0%,#4c1d95_55%,#a21caf_100%)] shadow-[0_12px_26px_rgba(76,29,149,0.25)] focus-visible:ring-violet-400";

  return (
    <a
      href={url}
      download={fileName}
      className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-bold !text-white transition hover:-translate-y-0.5 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${themeClass}`}
    >
      <Download className="h-4 w-4" aria-hidden="true" />
      {label}
    </a>
  );
}

export function OneGuardTermsDownload() {
  const oneGuard = useSecureDocumentBlob("metlife-oneguard-conditions-2024");
  const neon = useSecureDocumentBlob("cpp-neon-conditions-2026");

  return (
    <div className="flex flex-wrap gap-2">
      <TermsDownload
        error={oneGuard.error}
        fileName="2024_09_OneGuard_Pojistne_podminky_PR059_PP_OGR0924.pdf"
        label="Pojistné podmínky OneGuard (09/2024)"
        loadingLabel="Načítám podmínky OneGuard…"
        theme="metlife"
        url={oneGuard.url}
      />
      <TermsDownload
        error={neon.error}
        fileName="cpp-neon-04-2026.pdf"
        label="Pojistné podmínky NEON Life (04/2026)"
        loadingLabel="Načítám podmínky NEON Life…"
        theme="neon"
        url={neon.url}
      />
    </div>
  );
}
