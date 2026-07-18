"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";

import type { CommissionMode, Product } from "../types/domain";

export type NeonCoefficientView = "current" | "historical" | "olderHistorical";

type CoefficientSummaryItem = {
  label: string;
  value: number;
};

type NeonDocumentAction = "download" | "open";

type PdfViewportLike = {
  width: number;
  height: number;
};

type PdfRenderTaskLike = {
  promise: Promise<void>;
};

type PdfPageLike = {
  getViewport: (params: { scale: number }) => PdfViewportLike;
  render: (params: {
    canvas: HTMLCanvasElement;
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfViewportLike;
    transform?: [number, number, number, number, number, number];
  }) => PdfRenderTaskLike;
};

type PdfDocumentLike = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPageLike>;
  destroy: () => Promise<void>;
};

type PdfLoadingTaskLike = {
  promise: Promise<unknown>;
  destroy: () => void;
};

type PdfPreviewPage = {
  pageNumber: number;
  width: number;
  height: number;
};

type CalculatorCoefficientModalProps = {
  isOpen: boolean;
  product: Product;
  productLabel: string;
  positionLabel: string;
  mode: CommissionMode;
  coefficientView: NeonCoefficientView;
  isNeonHistorical: boolean;
  isCppAutoHistorical: boolean;
  isAllianzAutoHistorical: boolean;
  isCsobAutoHistorical: boolean;
  isUniqaAutoHistorical: boolean;
  isUniqaAutoEarlyHistorical: boolean;
  isUniqaFlotilaHistorical: boolean;
  isPillowAutoHistorical: boolean;
  isKooperativaAutoHistorical: boolean;
  isDomexHistorical: boolean;
  isMaxEfekt5: boolean;
  isMaxEfekt7: boolean;
  coefExplanation: string;
  immediatePayoutInfo: string | null;
  coefList: CoefficientSummaryItem[];
  showAutoTermsValidityNote: boolean;
  showAutoTermsPreview: boolean;
  autoTermsPreviewUrl: string | null;
  showNeonTermsPreview: boolean;
  neonTermsPreviewUrl: string | null;
  neonPreviewBlobUrl: string | null;
  neonPreviewLoading: boolean;
  neonPreviewError: string | null;
  neonDocAction: NeonDocumentAction | null;
  onClose: () => void;
  onCoefficientViewChange: (view: NeonCoefficientView) => void;
  onNeonDocumentAction: (action: NeonDocumentAction) => void | Promise<void>;
};

const formatCoefficientNumber = (value: number | null | undefined): string => {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString("cs-CZ", { maximumFractionDigits: 6 });
};

function PdfTermsPreview({ url, title }: { url: string; title: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState<PdfPreviewPage[]>([]);
  const pdfDocumentRef = useRef<PdfDocumentLike | null>(null);
  const canvasRefs = useRef<Array<HTMLCanvasElement | null>>([]);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: PdfLoadingTaskLike | null = null;

    setLoading(true);
    setError(null);
    setPages([]);
    canvasRefs.current = [];

    if (pdfDocumentRef.current) {
      void pdfDocumentRef.current.destroy();
      pdfDocumentRef.current = null;
    }

    const loadPdf = async () => {
      try {
        const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
        if (pdfjsLib.GlobalWorkerOptions) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        }

        loadingTask = pdfjsLib.getDocument({
          url,
          isEvalSupported: false,
        }) as PdfLoadingTaskLike;
        const pdf = (await loadingTask.promise) as PdfDocumentLike;

        if (cancelled) {
          void pdf.destroy();
          return;
        }

        pdfDocumentRef.current = pdf;
        const nextPages: PdfPreviewPage[] = [];
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 1 });
          nextPages.push({
            pageNumber,
            width: viewport.width,
            height: viewport.height,
          });
        }

        if (!cancelled) {
          setPages(nextPages);
          setLoading(false);
        }
      } catch (loadError) {
        if (cancelled) return;
        setLoading(false);
        setError(
          loadError instanceof Error && loadError.message.trim()
            ? loadError.message.trim()
            : "PDF náhled se nepodařilo načíst."
        );
      }
    };

    void loadPdf();

    return () => {
      cancelled = true;
      loadingTask?.destroy();
      if (pdfDocumentRef.current) {
        void pdfDocumentRef.current.destroy();
        pdfDocumentRef.current = null;
      }
    };
  }, [url]);

  useEffect(() => {
    if (pages.length === 0) return;

    let cancelled = false;

    const renderPages = async () => {
      const pdf = pdfDocumentRef.current;
      if (!pdf) return;

      for (let index = 0; index < pages.length; index += 1) {
        if (cancelled) return;
        const pageInfo = pages[index];
        const canvas = canvasRefs.current[index];
        const context = canvas?.getContext("2d", { alpha: false });
        if (!canvas || !context) continue;

        const page = await pdf.getPage(pageInfo.pageNumber);
        const viewport = page.getViewport({ scale: 1.65 });
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);

        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);

        await page.render({
          canvas,
          canvasContext: context,
          viewport,
          transform:
            outputScale === 1
              ? undefined
              : [outputScale, 0, 0, outputScale, 0, 0],
        }).promise;
      }
    };

    void renderPages();

    return () => {
      cancelled = true;
    };
  }, [pages]);

  if (loading) {
    return (
      <div className="flex min-h-[440px] items-center justify-center rounded-md bg-white px-4 text-sm text-slate-600">
        Načítám PDF náhled...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[440px] items-center justify-center rounded-md bg-white px-4 text-center text-sm font-semibold text-rose-700">
        {error}
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      {pages.map((page, index) => (
        <div
          key={page.pageNumber}
          className="relative mx-auto w-full overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm"
          style={{ aspectRatio: `${page.width} / ${page.height}` }}
        >
          <canvas
            ref={(node) => {
              canvasRefs.current[index] = node;
            }}
            className="absolute inset-0 h-full w-full"
            aria-label={`${title} - strana ${page.pageNumber}`}
          />
        </div>
      ))}
    </div>
  );
}

export function CalculatorCoefficientModal({
  isOpen,
  product,
  productLabel,
  positionLabel,
  mode,
  coefficientView,
  isNeonHistorical,
  isCppAutoHistorical,
  isAllianzAutoHistorical,
  isCsobAutoHistorical,
  isUniqaAutoHistorical,
  isUniqaAutoEarlyHistorical,
  isUniqaFlotilaHistorical,
  isPillowAutoHistorical,
  isKooperativaAutoHistorical,
  isDomexHistorical,
  isMaxEfekt5,
  isMaxEfekt7,
  coefExplanation,
  immediatePayoutInfo,
  coefList,
  showAutoTermsValidityNote,
  showAutoTermsPreview,
  autoTermsPreviewUrl,
  showNeonTermsPreview,
  neonTermsPreviewUrl,
  neonPreviewBlobUrl,
  neonPreviewLoading,
  neonPreviewError,
  neonDocAction,
  onClose,
  onCoefficientViewChange,
  onNeonDocumentAction,
}: CalculatorCoefficientModalProps) {
  if (!isOpen) return null;

  const hasCoefficientViewToggle =
    product === "neon" ||
    product === "maximaMaxEfekt" ||
    product === "domex" ||
    product === "cppAuto" ||
    product === "allianzAuto" ||
    product === "csobAuto" ||
    product === "uniqaAuto" ||
    product === "uniqaflotila" ||
    product === "pillowAuto" ||
    product === "kooperativaAuto";
  const productPeriodText =
    product === "neon"
      ? isNeonHistorical
        ? "Historické koeficienty – platnost 01.10.2019 až 30.06.2024"
        : "Aktuální koeficienty – platnost od 01.07.2024"
      : product === "cppAuto"
      ? isCppAutoHistorical
        ? "Historické koeficienty – platnost 01.08.2020 až 31.03.2026"
        : "Aktuální koeficienty – platnost od 01.04.2026"
      : product === "allianzAuto"
      ? isAllianzAutoHistorical
        ? "Historické koeficienty – platnost 01.08.2019 až 31.03.2026"
        : "Aktuální koeficienty – platnost od 01.04.2026"
      : product === "csobAuto"
      ? isCsobAutoHistorical
        ? "Historické koeficienty – platnost 01.05.2024 až 31.03.2026"
        : "Aktuální koeficienty – platnost od 01.04.2026"
      : product === "uniqaAuto"
      ? isUniqaAutoEarlyHistorical
        ? "Historické koeficienty – platnost 01.02.2023 až 30.04.2024"
        : isUniqaAutoHistorical
        ? "Historické koeficienty – platnost 01.05.2024 až 31.03.2026"
        : "Aktuální koeficienty – platnost od 01.04.2026"
      : product === "uniqaflotila"
      ? isUniqaFlotilaHistorical
        ? "Historické koeficienty – platnost 01.05.2024 až 31.03.2026"
        : "Aktuální koeficienty – platnost od 01.04.2026"
      : product === "pillowAuto"
      ? isPillowAutoHistorical
        ? "Historické koeficienty – platnost 01.10.2023 až 31.03.2026"
        : "Aktuální koeficienty – platnost od 01.04.2026"
      : product === "pillowInjury"
      ? "Pillow Úraz / Nemoc – koeficienty platné od 01.10.2023"
      : product === "pillowmajetek"
      ? "Pillow Majetek – koeficienty platné od 01.10.2023"
      : product === "domex"
      ? isDomexHistorical
        ? "ČPP DOMEX – historické koeficienty – platnost 01.06.2023 až 31.08.2024"
        : "ČPP DOMEX – aktuální koeficienty – platnost od 01.09.2024"
      : product === "cpphafan"
      ? "ČPP HAFAN – koeficienty platné od 01.01.2017"
      : product === "kooppmop"
      ? "Kooperativa PMOP – koeficienty platné od 01.08.2021"
      : product === "cppcestovko"
      ? "ČPP Cestovko – koeficienty platné od 01.09.2019"
      : product === "koopcestovko"
      ? "Kooperativa Cestovko – koeficienty platné od 01.09.2019"
      : product === "axacestovko"
      ? "AXA Cestovko – koeficienty platné od 15.04.2021"
      : product === "zamex"
      ? "ČPP ZAMEX – koeficienty platné od 15.04.2023"
      : product === "cppsimplex"
      ? "ČPP Simplex – koeficienty platné od 01.09.2021"
      : product === "cppPPRbez"
      ? "ČPP PPR bez ÚPIS – koeficienty platné od 01.06.2023"
      : product === "cppPPRs"
      ? "ČPP PPR ÚPIS – koeficienty platné od 01.06.2023"
      : product === "kooperativaAuto"
      ? isKooperativaAutoHistorical
        ? "Historické koeficienty – platnost 01.07.2021 až 31.03.2026"
        : "Aktuální koeficienty – platnost od 01.04.2026"
      : product === "maxdomov"
      ? "Aktuální koeficienty – platnost od 01.09.2024"
      : product === "maximaMaxEfekt" && isMaxEfekt5
      ? "MAXEFEKT 5 – historické koeficienty – platnost 21.04.2023 až 22.04.2026"
      : product === "maximaMaxEfekt" && isMaxEfekt7
      ? "MAXEFEKT 7 – platnost od 23.04.2026"
      : null;
  const productModeText =
    product === "neon" && isNeonHistorical
      ? "historické podmínky (bez režimu)"
      : product === "cppAuto" ||
        product === "allianzAuto" ||
        product === "csobAuto" ||
        product === "uniqaAuto" ||
        product === "uniqaflotila" ||
        product === "pillowAuto" ||
        product === "kooperativaAuto"
      ? isCppAutoHistorical ||
        isAllianzAutoHistorical ||
        isCsobAutoHistorical ||
        isUniqaAutoHistorical ||
        isUniqaFlotilaHistorical ||
        isPillowAutoHistorical ||
        isKooperativaAutoHistorical
        ? "historické podmínky"
        : "aktuální podmínky"
      : `režim ${mode}`;
  const autoTermsPreviewIsPdf = /\.pdf(?:[?#]|$)/i.test(
    autoTermsPreviewUrl ?? ""
  );

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto px-4 py-6">
      <button
        type="button"
        className="absolute inset-0 h-full w-full bg-black/70 backdrop-blur-sm"
        aria-label="Zavřít koeficienty"
        onClick={onClose}
      />
      <div
        className={`relative z-50 w-full max-h-[calc(100vh-3rem)] overflow-y-auto rounded-2xl border border-slate-300 bg-white p-6 shadow-2xl shadow-black/30 ${
          showAutoTermsPreview || showNeonTermsPreview ? "max-w-6xl" : "max-w-md"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-900">Koeficienty</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-2 text-slate-500 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
            aria-label="Zavřít"
          >
            ×
          </button>
        </div>

        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm text-slate-600">
              {productLabel} · pozice {positionLabel} · {productModeText}
            </p>
            {productPeriodText && (
              <p className="text-xs font-semibold text-rose-700">
                {productPeriodText}
              </p>
            )}
            {showAutoTermsValidityNote && (
              <p className="text-xs font-semibold text-rose-700">
                Provizní podmínky aktuální od 01.04.2026
              </p>
            )}
          </div>

          {hasCoefficientViewToggle && (
            <div className="inline-flex items-center gap-1 rounded-xl border border-slate-300 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => onCoefficientViewChange("current")}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  coefficientView === "current"
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-white"
                }`}
              >
                Aktuální
              </button>
              <button
                type="button"
                onClick={() => onCoefficientViewChange("historical")}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  coefficientView === "historical"
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-white"
                }`}
              >
                {product === "uniqaAuto" || product === "uniqaflotila"
                  ? "Hist. 2024"
                  : "Historické"}
              </button>
              {product === "uniqaAuto" && (
                <button
                  type="button"
                  onClick={() => onCoefficientViewChange("olderHistorical")}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    coefficientView === "olderHistorical"
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-white"
                  }`}
                >
                  Hist. 2023
                </button>
              )}
            </div>
          )}
        </div>

        <div
          className={`mt-4 ${
            showNeonTermsPreview
              ? "grid gap-4 lg:grid-cols-[minmax(320px,0.68fr)_minmax(620px,1.32fr)]"
              : ""
          }`}
        >
          <section className="order-1 rounded-xl border border-slate-300 bg-slate-50 p-3 space-y-3">
            {product === "neon" ? (
              <div className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs leading-relaxed text-slate-700">
                <p className="font-bold uppercase tracking-wide text-slate-900">
                  JAK FUNGUJE VÝPOČET?
                </p>
                <p className="mt-1">
                  Měsíční pojistné x 12 x doba trvání smlouvy (maximálně{" "}
                  {isNeonHistorical ? "20" : "15"}) x koeficient %.
                </p>
                <p className="mt-1">
                  Pro následnou a pečovatelskou provizi: pojistné x 12 x
                  koeficient %.
                </p>
              </div>
            ) : (
              coefExplanation && (
                <p className="text-xs text-slate-600 leading-relaxed">
                  {coefExplanation}
                </p>
              )
            )}

            {(product === "neon" ||
              product === "flexi" ||
              product === "maximaMaxEfekt" ||
              product === "pillowInjury") && (
              <p className="text-xs font-semibold text-rose-700">
                UPOZORNĚNÍ: Výpočet okamžité provize počítá s tím, že je
                zpracována karta klienta dle podmínek!
              </p>
            )}
            {immediatePayoutInfo && (
              <p className="text-xs text-slate-700 leading-relaxed">
                {immediatePayoutInfo}
              </p>
            )}

            <div className="space-y-2 pt-1">
              {coefList.length > 0 ? (
                coefList.map((c, idx) => (
                  <div
                    key={`${c.label}-${idx}`}
                    className="flex w-full max-w-[500px] items-center justify-between rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  >
                    <span className="min-w-0 pr-3 text-slate-600">{c.label}</span>
                    <span className="shrink-0 font-semibold">
                      {formatCoefficientNumber(c.value)}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-600">
                  Pro tento produkt nebo pozici nemám koeficienty k zobrazení.
                </p>
              )}
            </div>

            {showAutoTermsPreview && autoTermsPreviewUrl && (
              <div className="rounded-xl border border-slate-300 bg-slate-50 p-2 sm:p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                    Provizní podmínky {productLabel || "Auto"} (náhled)
                  </p>
                  <a
                    href={autoTermsPreviewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-slate-700 underline underline-offset-2 hover:text-slate-900"
                  >
                    Otevřít v nové kartě
                  </a>
                </div>
                <div className="h-[62vh] min-h-[460px] overflow-auto rounded-lg border border-slate-300 bg-slate-100 p-2">
                  {autoTermsPreviewIsPdf ? (
                    <PdfTermsPreview
                      url={autoTermsPreviewUrl}
                      title={`Provizní podmínky ${productLabel || "Auto"}`}
                    />
                  ) : (
                    <Image
                      src={autoTermsPreviewUrl}
                      alt={`Provizní podmínky ${productLabel || "Auto"}`}
                      width={1600}
                      height={2400}
                      className="mx-auto h-auto w-full rounded-md"
                      sizes="(max-width: 1024px) 100vw, 1200px"
                      priority
                    />
                  )}
                </div>
              </div>
            )}
          </section>

          {showNeonTermsPreview && neonTermsPreviewUrl && (
            <aside className="order-2 rounded-xl border border-slate-300 bg-slate-50 p-2 sm:p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                  Provizní podmínky NEON
                </p>
                <button
                  type="button"
                  onClick={() => void onNeonDocumentAction("download")}
                  disabled={neonDocAction !== null}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Download
                    size={12}
                    strokeWidth={2}
                    className="shrink-0"
                    aria-hidden="true"
                  />
                  {neonDocAction === "download"
                    ? "Stahuji..."
                    : "Stáhnout provizní podmínky"}
                </button>
              </div>
              <div className="mb-2 text-[11px] text-slate-600">
                <button
                  type="button"
                  onClick={() => void onNeonDocumentAction("open")}
                  disabled={neonDocAction !== null}
                  className="font-semibold underline underline-offset-2 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {neonDocAction === "open"
                    ? "Otevírám PDF..."
                    : "Kompletní PDF: Otevřít v nové kartě"}
                </button>
              </div>

              {neonPreviewError && (
                <p className="mb-2 text-xs font-semibold text-rose-700">
                  {neonPreviewError}
                </p>
              )}

              <div className="relative h-[70vh] min-h-[540px] overflow-hidden rounded-lg border border-slate-300 bg-white">
                {neonPreviewLoading ? (
                  <div className="flex h-full items-center justify-center px-4 text-sm text-slate-600">
                    Načítám náhled provizních podmínek...
                  </div>
                ) : neonPreviewBlobUrl ? (
                  <Image
                    src={neonPreviewBlobUrl}
                    alt={
                      coefficientView === "historical"
                        ? "Náhled provizních podmínek NEON 2019"
                        : "Náhled provizních podmínek NEON 2024"
                    }
                    fill
                    sizes="100vw"
                    unoptimized
                    className="object-contain"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center px-4 text-center text-sm text-slate-600">
                    Náhled se nepodařilo načíst.
                  </div>
                )}
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
