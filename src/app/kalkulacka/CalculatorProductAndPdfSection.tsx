"use client";

import Image from "next/image";
import { ChevronDown, Package, UploadCloud } from "lucide-react";
import { type DragEvent, type RefObject } from "react";

type CalculatorProductAndPdfSectionProps = {
  canImportFromPdf: boolean;
  productOpen: boolean;
  productSelected?: boolean;
  large?: boolean;
  currentProductLabel: string;
  productLogoSrc?: string | null;
  productInstitutionId?: string | null;
  productLogoImageClass?: string;
  productLogoFrameClass?: string;
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
  productSelected = true,
  large = false,
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
  const hasProductLogo = productSelected && Boolean(productLogoSrc);
  const isPillowGhost = hasProductLogo && productInstitutionId === "pillow";
  const isCppGhost = hasProductLogo && productInstitutionId === "cpp";
  const productButtonClass = large
    ? "group relative isolate flex min-h-[6.8rem] w-full items-center justify-between overflow-hidden rounded-2xl border border-slate-300 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_54%,#eef2f7_100%)] px-5 py-4 text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_20px_46px_rgba(15,23,42,0.08)] outline-none transition hover:border-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900"
    : "group relative isolate flex min-h-[3.9rem] w-full items-center justify-between overflow-hidden rounded-xl border border-slate-300 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_54%,#eef2f7_100%)] px-3 py-2.5 text-sm text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] outline-none transition hover:border-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900";
  const placeholderLogoClass = large
    ? "h-14 w-14 rounded-2xl"
    : "h-10 w-10 rounded-xl";
  const selectedLogoFrameClass =
    productLogoFrameClass ?? (large ? "h-14 w-14" : "h-10 w-10");
  const selectedLogoImageClass = productLogoImageClass ?? "object-contain";
  const labelText = productSelected ? "Vyber produkt" : "Produkt není vybraný";

  if (large) {
    return (
      <section className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-4 shadow-[0_28px_80px_rgba(15,23,42,0.12)] sm:p-5">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#0f172a_0%,#2563eb_48%,#14b8a6_100%)]"
          aria-hidden="true"
        />

        <div
          className={`grid gap-4 ${
            canImportFromPdf ? "lg:grid-cols-[0.98fr_1.02fr]" : "lg:grid-cols-1"
          }`}
        >
          <button
            type="button"
            onClick={onToggleProductPicker}
            className="group relative isolate flex min-h-[15rem] w-full flex-col justify-between overflow-hidden rounded-[1.55rem] border border-slate-900 bg-slate-950 p-5 text-left text-white shadow-[0_22px_46px_rgba(15,23,42,0.22)] outline-none transition hover:-translate-y-0.5 hover:shadow-[0_28px_56px_rgba(15,23,42,0.26)] focus:ring-2 focus:ring-slate-900 sm:p-6"
          >
            <span
              className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,#111827_0%,#0f172a_48%,#172554_100%)]"
              aria-hidden="true"
            />
            <span
              className="pointer-events-none absolute inset-0 opacity-[0.18] [background-image:linear-gradient(rgba(255,255,255,0.2)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.2)_1px,transparent_1px)] [background-size:28px_28px]"
              aria-hidden="true"
            />
            {hasProductLogo && productLogoSrc && (
              <span
                className="pointer-events-none absolute inset-y-0 right-0 w-[68%] opacity-20 [mask-image:linear-gradient(90deg,transparent_0%,black_30%,black_100%)] [-webkit-mask-image:linear-gradient(90deg,transparent_0%,black_30%,black_100%)]"
                aria-hidden="true"
              >
                <Image
                  src={productLogoSrc}
                  alt=""
                  fill
                  sizes="360px"
                  className={`${selectedLogoImageClass} object-contain object-right`}
                />
              </span>
            )}

            <span className="relative z-[1] flex items-start justify-between gap-4">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]">
                {hasProductLogo && productLogoSrc ? (
                  <span className="relative h-8 w-8 overflow-hidden rounded-lg bg-white">
                    <Image src={productLogoSrc} alt="" fill className={selectedLogoImageClass} />
                  </span>
                ) : (
                  <Package size={24} strokeWidth={2.2} aria-hidden="true" />
                )}
              </span>
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-sky-100 shadow-sm">
                Produkt
              </span>
            </span>

            <span className="relative z-[1] block">
              <span className="block text-3xl font-black leading-none tracking-normal text-white sm:text-4xl">
                {productSelected ? currentProductLabel : "Vybrat produkt"}
              </span>
              <span className="mt-3 block max-w-md text-sm font-semibold leading-6 text-sky-100/85">
                Zvol produkt ze seznamu a odemkni kalkulačku.
              </span>
            </span>

            <span className="relative z-[1] flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-sky-100/70">
                {labelText}
              </span>
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white shadow-sm transition group-hover:bg-white group-hover:text-slate-950">
                <ChevronDown
                  size={21}
                  strokeWidth={2.3}
                  className={`transition ${productOpen ? "rotate-180" : ""}`}
                  aria-hidden="true"
                />
              </span>
            </span>
          </button>

          {canImportFromPdf && (
            <div
              className={`relative flex min-h-[15rem] w-full flex-col justify-between rounded-[1.55rem] border-2 border-dashed p-5 transition sm:p-6 ${
                pdfDropActive
                  ? "border-slate-900 bg-slate-100 shadow-[0_22px_46px_rgba(15,23,42,0.14)]"
                  : "border-slate-300 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_100%)] hover:border-slate-400"
              }`}
              onDragEnter={onDragEnter}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
            >
              <div className="flex items-start justify-between gap-4">
                <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-800 shadow-sm">
                  <UploadCloud size={24} strokeWidth={2.2} aria-hidden="true" />
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500 shadow-sm">
                  PDF import
                </span>
              </div>

              <div>
                <h3 className="text-3xl font-black leading-none tracking-normal text-slate-950 sm:text-4xl">
                  Nahrát smlouvu
                </h3>
                <p className="mt-3 max-w-md text-sm font-semibold leading-6 text-slate-600">
                  Přetáhni PDF sem, nebo ho vyber ze souborů.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-xs font-semibold text-slate-500">
                  Soubor zůstane připravený k přiložení.
                </span>
                <button
                  type="button"
                  onClick={onOpenFileDialog}
                  disabled={pdfImporting}
                  className="ui-btn-primary ui-focus inline-flex shrink-0 items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <UploadCloud size={18} strokeWidth={2.2} className="shrink-0" aria-hidden="true" />
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
            </div>
          )}
        </div>

        {(pdfImportStatus || pdfImportError) && (
          <div className="mt-4 space-y-2">
            {pdfImportStatus && (
              <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                {pdfImportStatus}
              </p>
            )}
            {pdfImportError && (
              <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                {pdfImportError}
              </p>
            )}
          </div>
        )}
      </section>
    );
  }

  return (
    <section>
      <div className="space-y-2.5">
        <div className="space-y-1.5">
          <label className="block text-sm font-semibold text-slate-900">
            <span className="inline-flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-700">
                <Package size={14} strokeWidth={2.2} aria-hidden="true" />
              </span>
              <span>Produkt</span>
            </span>
          </label>
          <div>
            <button
              type="button"
              onClick={onToggleProductPicker}
              className={productButtonClass}
            >
              {hasProductLogo && productLogoSrc && (
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
                            : `${selectedLogoImageClass} object-cover object-right opacity-[0.18] [filter:grayscale(0.68)_contrast(1.05)]`
                      }
                    />
                  </span>
                  <span className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.05)_0%,rgba(255,255,255,0.2)_38%,rgba(248,250,252,0.3)_68%,rgba(248,250,252,0.08)_100%)]" />
                </span>
              )}

              <span className="relative z-[1] flex min-w-0 items-center gap-3">
                {hasProductLogo && productLogoSrc ? (
                  <div
                    className={`relative flex-shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ${selectedLogoFrameClass}`}
                  >
                    <Image src={productLogoSrc} alt="" fill className={selectedLogoImageClass} />
                  </div>
                ) : (
                  <span
                    className={`inline-flex flex-shrink-0 items-center justify-center border border-slate-200 bg-white text-slate-600 shadow-sm ${placeholderLogoClass}`}
                  >
                    <Package size={large ? 24 : 18} strokeWidth={2.2} aria-hidden="true" />
                  </span>
                )}
                <span className="flex min-w-0 flex-col items-start text-left leading-tight">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    {labelText}
                  </span>
                  <span
                    className={`truncate font-bold ${
                      large ? "text-xl sm:text-2xl" : "text-sm"
                    }`}
                  >
                    {currentProductLabel}
                  </span>
                </span>
              </span>
              <span
                className={`relative z-[1] ml-3 inline-flex flex-shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition group-hover:text-slate-950 ${
                  large ? "h-12 w-12" : "h-8 w-8"
                }`}
              >
                <ChevronDown
                  size={large ? 22 : 17}
                  strokeWidth={2.2}
                  className={`transition ${productOpen ? "rotate-180" : ""}`}
                  aria-hidden="true"
                />
              </span>
            </button>
          </div>
        </div>

      {canImportFromPdf && (
        <div className="space-y-1.5">
          <div
            className={`flex w-full flex-col items-start justify-between gap-2.5 border-2 border-dashed transition sm:flex-row sm:items-center ${
              large ? "min-h-[5.4rem] rounded-2xl px-5 py-4" : "min-h-[3.7rem] rounded-xl px-3 py-2.5"
            } ${
              pdfDropActive
                ? "border-slate-900 bg-slate-100 shadow-[0_14px_28px_rgba(15,23,42,0.10)]"
                : "border-slate-300 bg-white/80 hover:border-slate-400"
            }`}
            onDragEnter={onDragEnter}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            <div
              className={`flex min-w-0 items-center gap-3 font-semibold text-slate-900 ${
                large ? "text-lg sm:text-xl" : "text-sm"
              }`}
            >
              <span
                className={`inline-flex flex-shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 ${
                  large ? "h-12 w-12" : "h-8 w-8"
                }`}
              >
                <UploadCloud size={large ? 22 : 16} strokeWidth={2.2} aria-hidden="true" />
              </span>
              <span className="min-w-0">Nahraj smlouvu PDF nebo ji přetáhni sem.</span>
            </div>
            <button
              type="button"
              onClick={onOpenFileDialog}
              disabled={pdfImporting}
              className={`ui-btn-primary ui-focus inline-flex flex-shrink-0 items-center gap-2 rounded-full disabled:cursor-not-allowed disabled:opacity-60 ${
                large ? "px-5 py-2.5 text-base" : "px-3 py-1.5 text-sm"
              }`}
            >
              <UploadCloud
                size={large ? 19 : 16}
                strokeWidth={2.2}
                className="shrink-0"
                aria-hidden="true"
              />
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
