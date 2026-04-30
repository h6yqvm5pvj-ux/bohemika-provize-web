"use client";

import Image from "next/image";
import { Package } from "lucide-react";
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
    <section className={`w-full space-y-3 ${canImportFromPdf ? "md:max-w-xl" : ""}`}>
      <div className="space-y-1">
        <label className="mb-1 block text-sm font-medium">
          <span className="inline-flex items-center gap-1.5">
            <Package size={14} strokeWidth={2} className="text-slate-600" aria-hidden="true" />
            <span>Produkt</span>
          </span>
        </label>
        <div>
          <button
            type="button"
            onClick={onToggleProductPicker}
            className="flex w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900"
          >
            <span className="flex min-w-0 items-center gap-3">
              <div
                className={`relative flex-shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white ${productLogoFrameClass}`}
              >
                <Image src={productLogoSrc} alt="" fill className={productLogoImageClass} />
              </div>
              <span className="flex min-w-0 flex-col items-start text-left leading-tight">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Vyber produkt
                </span>
                <span className="truncate font-medium">{currentProductLabel}</span>
              </span>
            </span>
            <span className="ml-3 text-xs text-slate-400">{productOpen ? "Skrýt" : "Otevřít"}</span>
          </button>
        </div>
      </div>

      {canImportFromPdf && (
        <div className="space-y-2">
          <div
            className={`ui-card ui-card-quiet flex h-full items-center justify-between gap-3 rounded-xl border-2 border-dashed px-3 py-2.5 transition ${
              pdfDropActive ? "border-slate-900 bg-slate-100" : "border-slate-300 bg-white"
            }`}
            onDragEnter={onDragEnter}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            <div className="text-sm font-semibold text-slate-900">
              Nahraj smlouvu PDF nebo ji přetáhni sem.
            </div>
            <button
              type="button"
              onClick={onOpenFileDialog}
              disabled={pdfImporting}
              className="ui-btn-primary ui-focus inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M14 3v5h5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M8.5 16h7M8.5 12.5h3.8"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
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
    </section>
  );
}
