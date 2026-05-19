"use client";

import Image from "next/image";
import { ChevronDown, Package, UploadCloud } from "lucide-react";
import { type DragEvent, type RefObject } from "react";

type CalculatorProductAndPdfSectionProps = {
  canImportFromPdf: boolean;
  productOpen: boolean;
  currentProductLabel: string;
  productLogoSrc: string;
  productInstitutionId?: string | null;
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
  productInstitutionId,
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
  const isPillowGhost = productInstitutionId === "pillow";
  const isCppGhost = productInstitutionId === "cpp";

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
              className="group relative isolate flex min-h-[4.75rem] w-full items-center justify-between overflow-hidden rounded-2xl border border-slate-300 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_54%,#eef2f7_100%)] px-3.5 py-3 text-sm text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] outline-none transition hover:border-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900"
            >
              <span
                className={`pointer-events-none absolute inset-0 overflow-hidden ${
                  isPillowGhost || isCppGhost
                    ? "[mask-image:linear-gradient(90deg,black_0%,black_92%,transparent_100%)] [-webkit-mask-image:linear-gradient(90deg,black_0%,black_92%,transparent_100%)]"
                    : "[mask-image:linear-gradient(90deg,black_0%,black_82%,transparent_100%)] [-webkit-mask-image:linear-gradient(90deg,black_0%,black_82%,transparent_100%)]"
                }`}
                aria-hidden="true"
              >
                <span className="absolute inset-0 bg-[radial-gradient(circle_at_18%_22%,rgba(100,116,139,0.12)_0%,transparent_58%),radial-gradient(circle_at_44%_78%,rgba(148,163,184,0.1)_0%,transparent_56%)]" />
                <span
                  className={`absolute inset-y-0 right-0 ${
                    isPillowGhost ? "w-full" : isCppGhost ? "w-[112%]" : "w-[132%]"
                  }`}
                >
                  <Image
                    src={productLogoSrc}
                    alt=""
                    fill
                    aria-hidden="true"
                    sizes="(min-width: 768px) 320px, 220px"
                    className={
                      isPillowGhost
                        ? "object-contain object-right opacity-[0.24] [filter:grayscale(0.58)_contrast(1.04)]"
                        : isCppGhost
                          ? "object-contain object-right scale-[0.86] opacity-[0.2] [filter:grayscale(0.6)_contrast(1.04)]"
                          : `${productLogoImageClass} object-cover object-right opacity-[0.18] [filter:grayscale(0.68)_contrast(1.05)]`
                    }
                  />
                </span>
                <span className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.05)_0%,rgba(255,255,255,0.2)_38%,rgba(248,250,252,0.3)_68%,rgba(248,250,252,0.08)_100%)]" />
              </span>

              <span className="relative z-[1] flex min-w-0 items-center gap-3">
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
              <span className="relative z-[1] ml-3 inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition group-hover:text-slate-950">
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
