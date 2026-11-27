"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, ExternalLink } from "lucide-react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { Spinner } from "./ContractDetailUi";

function PreviewPage({ pdf, number, onFirstPageSettled }: {
  pdf: PDFDocumentProxy;
  number: number;
  onFirstPageSettled?: () => void;
}) {
  const wrapper = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [nearViewport, setNearViewport] = useState(number === 1);
  const [aspectRatio, setAspectRatio] = useState("210 / 297");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (number === 1 || !wrapper.current) return;
    if (typeof IntersectionObserver === "undefined") {
      setNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setNearViewport(entry.isIntersecting), {
      root: wrapper.current.closest("[data-pdf-scroll]"),
      rootMargin: "700px 0px",
    });
    observer.observe(wrapper.current);
    return () => observer.disconnect();
  }, [number]);

  useEffect(() => {
    const target = canvas.current;
    if (!nearViewport || !target) return;
    let cancelled = false;
    let task: RenderTask | undefined;
    async function renderPage(target: HTMLCanvasElement) {
      try {
        const page = await pdf.getPage(number);
        if (cancelled) return;
        const size = page.getViewport({ scale: 1 });
        setAspectRatio(`${size.width} / ${size.height}`);
        // Bound the bitmap for unusually large paper sizes while keeping text sharp.
        const scale = Math.min(2.35, 4096 / Math.max(size.width, size.height));
        const viewport = page.getViewport({ scale });
        target.width = Math.max(1, Math.floor(viewport.width));
        target.height = Math.max(1, Math.floor(viewport.height));
        const context = target.getContext("2d", { alpha: false });
        if (!context) throw new Error("Canvas unavailable");
        task = page.render({ canvas: target, canvasContext: context, viewport });
        await task.promise;
        if (!cancelled) setFailed(false);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) onFirstPageSettled?.();
      }
    }
    void renderPage(target);
    return () => {
      cancelled = true;
      task?.cancel();
      target.width = target.height = 0;
    };
  }, [nearViewport, number, onFirstPageSettled, pdf]);

  return (
    <div ref={wrapper} style={{ aspectRatio }}
      className="relative mx-auto w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_18px_42px_rgba(15,23,42,0.18)]">
      {nearViewport && <canvas ref={canvas} className="absolute inset-0 h-full w-full"
        aria-label={`Stránka PDF smlouvy ${number}`} />}
      {failed && <p role="alert" className="absolute inset-0 grid place-items-center bg-white text-sm text-rose-800">
        Stranu {number} se nepodařilo zobrazit.
      </p>}
    </div>
  );
}

export function ContractPdfPreviewDialog({ fileName, loadPdf, onClose }: {
  fileName: string;
  loadPdf: (signal: AbortSignal) => Promise<Blob>;
  onClose: () => void;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [documentError, setDocumentError] = useState(false);
  const [firstPageSettled, setFirstPageSettled] = useState(false);
  const revealPages = useCallback(() => setFirstPageSettled(true), []);

  useEffect(() => {
    const controller = new AbortController();
    let url: string | undefined;
    let task: PDFDocumentLoadingTask | undefined;
    setBlobUrl(null);
    setPdf(null);
    setDocumentError(false);
    setFirstPageSettled(false);

    async function load() {
      try {
        const [pdfjs, bytes] = await Promise.all([
          import("pdfjs-dist/legacy/build/pdf.mjs"),
          loadPdf(controller.signal).then(blob => {
            if (controller.signal.aborted) return;
            url = URL.createObjectURL(blob);
            setBlobUrl(url);
            return blob.arrayBuffer();
          }),
        ]);
        if (controller.signal.aborted || !bytes) return;
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        task = pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false });
        const document = await task.promise;
        if (!controller.signal.aborted) setPdf(document);
      } catch {
        if (!controller.signal.aborted) setDocumentError(true);
      }
    }
    void load();
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
      void task?.destroy().catch(() => {});
    };
  }, [loadPdf]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <button
        type="button"
        className="absolute inset-0 h-full w-full bg-black/70 backdrop-blur-sm"
        aria-label="Zavřít náhled smlouvy"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Náhled PDF smlouvy"
        className="relative z-10 flex h-[94vh] w-full max-w-[min(96vw,1680px)] flex-col overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-2xl shadow-slate-300/40"
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-2">
          <div className="min-w-0">
            <h3 className="text-base font-semibold tracking-tight text-slate-900 sm:text-lg">
              PDF smlouvy
            </h3>
            <p className="mt-0.5 truncate text-xs text-slate-600 sm:text-sm">
              {fileName}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {blobUrl && (
              <>
                <a
                  href={blobUrl}
                  download="Smlouva.pdf"
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
                >
                  <Download size={15} strokeWidth={2.2} aria-hidden="true" />
                  <span>Stáhnout</span>
                </a>
                <a
                  href={blobUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
                >
                  <ExternalLink size={15} strokeWidth={2.2} aria-hidden="true" />
                  <span>Otevřít v nové kartě</span>
                </a>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
            >
              Zavřít
            </button>
          </div>
        </div>

        <div data-pdf-scroll className="relative min-h-0 flex-1 overflow-y-auto bg-slate-100 px-2 py-3 sm:px-4">
          {documentError ? (
            <p role="alert" className="grid h-full place-items-center px-4 text-sm text-rose-800">
              Náhled PDF smlouvy se nepodařilo načíst.
            </p>
          ) : (
            <>
              {!firstPageSettled && (
                <div role="status" className="absolute inset-0 z-10 flex items-center justify-center gap-3 bg-white/85 text-sm font-semibold text-slate-800">
                  <Spinner className="h-4 w-4" /> Načítám PDF smlouvy…
                </div>
              )}
              {pdf && (
                <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-5">
                  <PreviewPage pdf={pdf} number={1} onFirstPageSettled={revealPages} />
                  {firstPageSettled && Array.from({ length: pdf.numPages - 1 }, (_, index) => (
                    <PreviewPage key={index + 2} pdf={pdf} number={index + 2} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
