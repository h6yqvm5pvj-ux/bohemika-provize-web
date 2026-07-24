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

function PdfImportProgressBar({ large = false }: { large?: boolean }) {
  return (
    <div
      role="progressbar"
      aria-label="Načítání PDF"
      aria-valuetext="Načítání PDF"
      className={`rounded-2xl border border-violet-200/75 bg-violet-50/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] ${
        large ? "px-4 py-4" : "px-3 py-2.5"
      }`}
    >
      <div
        className={`relative overflow-hidden rounded-full bg-violet-100/95 ring-1 ring-violet-200/70 ${
          large ? "h-3" : "h-2.5"
        }`}
      >
        <span
          className="absolute inset-y-0 left-0 w-[42%] rounded-full bg-[linear-gradient(90deg,#020617_0%,#4c1d95_100%)] shadow-[0_0_16px_rgba(76,29,149,0.42)] motion-safe:animate-[calculator-pdf-import-progress_1.15s_ease-in-out_infinite] motion-reduce:w-2/3"
          aria-hidden="true"
        />
        <span
          className="absolute inset-y-0 left-0 w-[18%] rounded-full bg-white/50 blur-[2px] motion-safe:animate-[calculator-pdf-import-glint_1.15s_ease-in-out_infinite] motion-reduce:hidden"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

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
    ? "group relative isolate flex min-h-[6.8rem] w-full items-center justify-between overflow-hidden rounded-2xl border border-violet-200 bg-white/90 px-5 py-4 text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_18px_38px_rgba(15,23,42,0.08)] outline-none backdrop-blur transition hover:border-violet-300 focus:border-violet-700 focus:ring-2 focus:ring-violet-700"
    : "group relative isolate flex min-h-[3.9rem] w-full items-center justify-between overflow-hidden rounded-xl border border-violet-200 bg-white/90 px-3 py-2.5 text-sm text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_10px_22px_rgba(15,23,42,0.06)] outline-none backdrop-blur transition hover:border-violet-300 focus:border-violet-700 focus:ring-2 focus:ring-violet-700";
  const placeholderLogoClass = large
    ? "h-14 w-14 rounded-2xl"
    : "h-10 w-10 rounded-xl";
  const selectedLogoFrameClass =
    productLogoFrameClass ?? (large ? "h-14 w-14" : "h-10 w-10");
  const selectedLogoImageClass = productLogoImageClass ?? "object-contain";
  const labelText = productSelected ? "Vyber produkt" : "Produkt není vybraný";

  if (large) {
    return (
      <section className="relative overflow-hidden rounded-[2rem] border border-white/80 bg-white/85 shadow-[0_28px_80px_rgba(15,23,42,0.10)] backdrop-blur-xl">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-[2] h-1 bg-[linear-gradient(90deg,#020617_0%,#4c1d95_100%)]"
          aria-hidden="true"
        />

        <div
          className={`grid ${
            canImportFromPdf ? "lg:grid-cols-[1.1fr_0.9fr]" : "lg:grid-cols-1"
          }`}
        >
          {canImportFromPdf && (
            <div
              className={`relative flex min-h-[19rem] w-full flex-col justify-between p-6 transition sm:p-7 ${
                pdfDropActive ? "bg-violet-50/70" : "bg-white/76 hover:bg-white"
              }`}
              onDragEnter={onDragEnter}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
            >
              <div className="flex items-start justify-between gap-4">
                <span
                  className={`inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border bg-white text-slate-950 shadow-[0_12px_26px_rgba(15,23,42,0.09)] ${
                    pdfDropActive ? "border-violet-400" : "border-violet-200"
                  }`}
                >
                  <UploadCloud size={27} strokeWidth={2.2} aria-hidden="true" />
                </span>
                <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-bold uppercase text-violet-700 shadow-sm">
                  PDF import
                </span>
              </div>

              <div>
                <p className="max-w-md text-4xl font-black leading-none text-slate-950 sm:text-5xl">
                  Přetáhni smlouvu sem
                </p>
                <p className="mt-4 max-w-md text-sm font-semibold leading-6 text-slate-600">
                  nebo vyber PDF soubor ze zařízení.
                </p>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={onOpenFileDialog}
                  disabled={pdfImporting}
                  className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-full border border-violet-700 bg-violet-700 px-6 py-3 text-sm font-black !text-white shadow-[0_16px_32px_rgba(109,40,217,0.20)] transition hover:-translate-y-0.5 hover:bg-violet-800 hover:shadow-[0_20px_42px_rgba(109,40,217,0.24)] disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60"
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

          <button
            type="button"
            onClick={onToggleProductPicker}
            className="group relative isolate flex min-h-[19rem] w-full flex-col justify-between overflow-hidden bg-violet-800 p-6 text-left !text-white outline-none transition hover:bg-violet-900 focus:ring-2 focus:ring-violet-700 focus:ring-offset-2 sm:p-7"
          >
            <span
              className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,#2e1065_0%,#4c1d95_58%,#5b21b6_100%)]"
              aria-hidden="true"
            />
            <span
              className="pointer-events-none absolute inset-0 opacity-[0.16] [background-image:linear-gradient(rgba(255,255,255,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.18)_1px,transparent_1px)] [background-size:28px_28px]"
              aria-hidden="true"
            />
            <span
              className="pointer-events-none absolute inset-y-0 right-0 w-px bg-white/10"
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
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-white/15 bg-white/10 !text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16)]">
                {hasProductLogo && productLogoSrc ? (
                  <span className="relative h-9 w-9 overflow-hidden rounded-xl bg-white">
                    <Image src={productLogoSrc} alt="" fill className={selectedLogoImageClass} />
                  </span>
                ) : (
                  <Package size={27} strokeWidth={2.2} aria-hidden="true" />
                )}
              </span>
              <span className="rounded-full border border-violet-300/30 bg-violet-400/15 px-3 py-1 text-xs font-bold uppercase !text-white">
                Produkt
              </span>
            </span>

            <span className="relative z-[1] block">
              <span className="block max-w-sm text-4xl font-black leading-none !text-white sm:text-5xl">
                {productSelected ? currentProductLabel : "Vybrat produkt"}
              </span>
              <span className="mt-4 block max-w-md text-sm font-semibold leading-6 !text-white/80">
                Zvol produkt ze seznamu a odemkni kalkulačku.
              </span>
            </span>

            <span className="relative z-[1] flex items-center justify-between gap-3">
              <span className="text-xs font-semibold !text-white/70">
                {productSelected ? "Vybraný produkt" : "Produkt není vybraný"}
              </span>
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/10 !text-white shadow-sm transition group-hover:bg-white/18">
                <ChevronDown
                  size={22}
                  strokeWidth={2.3}
                  className={`!text-white transition ${productOpen ? "rotate-180" : ""}`}
                  aria-hidden="true"
                />
              </span>
            </span>
          </button>
        </div>

        {(pdfImporting || pdfImportStatus || pdfImportError) && (
          <div className="space-y-2 border-t border-violet-100 bg-white/80 px-6 py-4 sm:px-7">
            {pdfImporting ? (
              <PdfImportProgressBar large />
            ) : pdfImportStatus ? (
              <p className="rounded-2xl border border-violet-100 bg-white/80 px-4 py-3 text-sm font-semibold text-slate-700">
                {pdfImportStatus}
              </p>
            ) : null}
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
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-violet-200 bg-white text-slate-900 shadow-sm">
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
                  <span className="absolute inset-0 bg-[linear-gradient(135deg,rgba(124,58,237,0.08)_0%,rgba(15,23,42,0.05)_54%,rgba(255,255,255,0.08)_100%)]" />
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
                    className={`relative flex-shrink-0 overflow-hidden rounded-xl border border-violet-100 bg-white shadow-sm ${selectedLogoFrameClass}`}
                  >
                    <Image src={productLogoSrc} alt="" fill className={selectedLogoImageClass} />
                  </div>
                ) : (
                  <span
                    className={`inline-flex flex-shrink-0 items-center justify-center border border-violet-200 bg-white text-slate-700 shadow-sm ${placeholderLogoClass}`}
                  >
                    <Package size={large ? 24 : 18} strokeWidth={2.2} aria-hidden="true" />
                  </span>
                )}
                <span className="flex min-w-0 flex-col items-start text-left leading-tight">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-600">
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
                className={`relative z-[1] ml-3 inline-flex flex-shrink-0 items-center justify-center rounded-full border border-violet-200 bg-white text-slate-600 shadow-sm transition group-hover:border-violet-300 group-hover:text-slate-950 ${
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
                ? "border-violet-400 bg-violet-50/80 shadow-[0_14px_28px_rgba(76,29,149,0.12)]"
                : "border-violet-200 bg-white/70 hover:border-violet-300 hover:bg-white"
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
                className={`inline-flex flex-shrink-0 items-center justify-center rounded-xl border border-violet-200 bg-white text-slate-800 shadow-sm ${
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
              className={`ui-focus inline-flex flex-shrink-0 items-center gap-2 rounded-full border border-violet-700 bg-violet-700 font-black !text-white shadow-[0_12px_28px_rgba(109,40,217,0.18)] transition hover:-translate-y-0.5 hover:bg-violet-800 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60 ${
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
          {pdfImporting ? (
            <PdfImportProgressBar />
          ) : (
            pdfImportStatus && <p className="text-[12px] text-slate-700">{pdfImportStatus}</p>
          )}
          {pdfImportError && <p className="text-[12px] text-rose-700">{pdfImportError}</p>}
        </div>
      )}
      </div>
    </section>
  );
}
