"use client";

import Image from "next/image";
import { ChevronDown, Package, UploadCloud } from "lucide-react";
import { type DragEvent, type RefObject } from "react";

type CalculatorProductAndPdfSectionProps = {
  canImportFromPdf: boolean;
  productOpen: boolean;
  currentProductLabel: string;
  productLogoSrc: string;
  productLogoImageClass: string;
  productLogoFrameClass: string;
  pdfDropActive: boolean;
  pdfImporting: boolean;
  pdfImportStatus: string | null;
  pdfImportError: string | null;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onToggleProductPicker: () => void;
  onOpenFileDialog: () => void;
  onFileInputChange: (file: File | null) => void;
  onDragEnter: (event: DragEvent<HTMLDivElement>) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
};

export function CalculatorProductAndPdfSection({
  canImportFromPdf,
  productOpen,
  currentProductLabel,
  productLogoSrc,
  productLogoImageClass,
  productLogoFrameClass,
  pdfDropActive,
  pdfImporting,
  pdfImportStatus,
  pdfImportError,
  fileInputRef,
  onToggleProductPicker,
  onOpenFileDialog,
  onFileInputChange,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
}: CalculatorProductAndPdfSectionProps) {
  return (
    <section className="relative overflow-hidden rounded-[1.35rem] border border-slate-300 bg-white/90 p-4 shadow-[0_16px_34px_rgba(15,23,42,0.07)]">
      <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#d4af37_0%,#cbd5e1_56%,#0f172a_100%)]" aria-hidden="true" />
      <div className="relative space-y-3">
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-slate-900">
            <span className="inline-flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-700">
                <Package size={14} strokeWidth={2.2} aria-hidden="true" />
              </span>
              <span>Produkt</span>
            </span>
          </label>
          <div>
            <button
              type="button"
              onClick={onToggleProductPicker}
              className="group flex min-h-[4.75rem] w-full items-center justify-between rounded-2xl border border-slate-300 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_54%,#eef2f7_100%)] px-3.5 py-3 text-sm text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] outline-none transition hover:border-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900"
            >
              <span className="flex min-w-0 items-center gap-3">
                <div
                  className={`relative flex-shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ${productLogoFrameClass}`}
                >
                  <Image src={productLogoSrc} alt="" fill className={productLogoImageClass} />
                </div>
                <span className="flex min-w-0 flex-col items-start text-left leading-tight">
                  <span className="text-[10px] font-semibold uppercase text-slate-500">
                    Vyber produkt
                  </span>
                  <span className="truncate text-base font-bold">{currentProductLabel}</span>
                </span>
              </span>
              <span className="ml-3 inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition group-hover:text-slate-950">
                <ChevronDown
                  size={18}
                  strokeWidth={2.2}
                  className={`transition ${productOpen ? "rotate-180" : ""}`}
                  aria-hidden="true"
                />
              </span>
            </button>
          </div>
        </div>

      {canImportFromPdf && (
        <div className="space-y-2">
          <div
            className={`flex min-h-[4.75rem] w-full flex-col items-start justify-between gap-3 rounded-2xl border-2 border-dashed px-4 py-3 transition sm:flex-row sm:items-center ${
              pdfDropActive
                ? "border-slate-900 bg-slate-100 shadow-[0_14px_28px_rgba(15,23,42,0.10)]"
                : "border-slate-300 bg-white/80 hover:border-slate-400"
            }`}
            onDragEnter={onDragEnter}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            <div className="flex min-w-0 items-center gap-3 text-sm font-semibold text-slate-900">
              <span className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-700">
                <UploadCloud size={18} strokeWidth={2.2} aria-hidden="true" />
              </span>
              <span className="min-w-0">Nahraj smlouvu PDF nebo ji přetáhni sem.</span>
            </div>
            <button
              type="button"
              onClick={onOpenFileDialog}
              disabled={pdfImporting}
              className="ui-btn-primary ui-focus inline-flex flex-shrink-0 items-center gap-2 rounded-full px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              <UploadCloud size={16} strokeWidth={2.2} className="shrink-0" aria-hidden="true" />
              {pdfImporting ? "Načítám…" : "Nahrát PDF"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(event) => onFileInputChange(event.target.files?.[0] ?? null)}
            />
          </div>
          {pdfImportStatus && <p className="text-[12px] text-slate-700">{pdfImportStatus}</p>}
          {pdfImportError && <p className="text-[12px] text-rose-700">{pdfImportError}</p>}
        </div>
      )}
      </div>
    </section>
  );
}
