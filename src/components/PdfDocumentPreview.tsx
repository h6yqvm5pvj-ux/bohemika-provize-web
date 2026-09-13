"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";

type PdfRenderedPage = {
  pageNumber: number;
  dataUrl: string;
  width: number;
  height: number;
};

function PdfPagePreview({
  pageNumber,
  page,
  error,
  onRender,
}: {
  pageNumber: number;
  page: PdfRenderedPage | undefined;
  error: string | undefined;
  onRender: (pageNumber: number) => void;
}) {
  const pageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (page || error) return;
    const node = pageRef.current;
    if (!node) return;

    if (pageNumber === 1 || typeof IntersectionObserver === "undefined") {
      onRender(pageNumber);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onRender(pageNumber);
          observer.disconnect();
        }
      },
      { rootMargin: "900px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [error, onRender, page, pageNumber]);

  return (
    <div
      ref={pageRef}
      className="w-full max-w-[920px] overflow-hidden rounded-xl bg-white shadow-[0_14px_44px_rgba(15,23,42,0.14)] ring-1 ring-slate-200"
      style={{ aspectRatio: page ? `${page.width} / ${page.height}` : "210 / 297" }}
    >
      {page ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={page.dataUrl}
          alt={`Strana ${page.pageNumber}`}
          className="h-auto w-full"
          style={{ aspectRatio: `${page.width} / ${page.height}` }}
        />
      ) : error ? (
        <div className="flex h-full min-h-40 items-center justify-center px-4 text-center text-xs font-semibold text-red-700">
          {error}
        </div>
      ) : (
        <div className="flex h-full min-h-40 items-center justify-center">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Strana {pageNumber}
          </div>
        </div>
      )}
    </div>
  );
}

export function PdfDocumentPreview({
  pdfData,
  name,
}: {
  pdfData: Uint8Array;
  name: string;
}) {
  const [pagesByNumber, setPagesByNumber] = useState<Record<number, PdfRenderedPage>>({});
  const [pageErrorsByNumber, setPageErrorsByNumber] = useState<Record<number, string>>({});
  const [loadingDocument, setLoadingDocument] = useState(true);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const pdfDocumentRef = useRef<PDFDocumentProxy | null>(null);
  const renderingPagesRef = useRef<Set<number>>(new Set());
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: { destroy: () => void } | null = null;

    setPagesByNumber({});
    setPageErrorsByNumber({});
    setLoadingDocument(true);
    setDocumentError(null);
    setTotalPages(0);
    renderingPagesRef.current.clear();

    if (pdfDocumentRef.current) {
      void pdfDocumentRef.current.destroy();
      pdfDocumentRef.current = null;
    }

    const loadPdf = async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        if (!pdfjs.GlobalWorkerOptions.workerSrc) {
          pdfjs.GlobalWorkerOptions.workerSrc = new URL(
            "pdfjs-dist/build/pdf.worker.min.mjs",
            import.meta.url
          ).toString();
        }

        if (cancelled) return;

        // Supplying bytes avoids a second fetch of a blob: URL. That fetch
        // works in desktop Chromium but returns response 0 in iOS WebKit on
        // the public domain. Pass a copy because PDF.js may transfer its
        // input buffer to the worker.
        const task = pdfjs.getDocument({ data: pdfData.slice() });
        loadingTask = task;
        const pdf = await task.promise;
        if (cancelled) {
          void pdf.destroy();
          return;
        }

        pdfDocumentRef.current = pdf;
        setTotalPages(pdf.numPages);
        setLoadingDocument(false);
      } catch (loadError) {
        if (cancelled) return;
        setLoadingDocument(false);
        setDocumentError(
          loadError instanceof Error ? loadError.message : "PDF se nepodařilo načíst."
        );
      }
    };

    void loadPdf();

    return () => {
      cancelled = true;
      void loadingTask?.destroy();
      pdfDocumentRef.current = null;
    };
  }, [pdfData]);

  const renderPage = useCallback(
    async (pageNumber: number) => {
      const pdf = pdfDocumentRef.current;
      if (!pdf || pageNumber < 1 || pageNumber > pdf.numPages) return;
      if (pagesByNumber[pageNumber] || renderingPagesRef.current.has(pageNumber)) return;

      renderingPagesRef.current.add(pageNumber);
      setPageErrorsByNumber((prev) => {
        if (!prev[pageNumber]) return prev;
        const next = { ...prev };
        delete next[pageNumber];
        return next;
      });

      try {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1.55 });
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        if (!context) {
          throw new Error("Prohlížeč nepodporuje canvas náhled PDF.");
        }

        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);

        await page.render({
          canvas,
          canvasContext: context,
          viewport,
          transform:
            outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
        }).promise;

        const renderedPage: PdfRenderedPage = {
          pageNumber,
          dataUrl: canvas.toDataURL("image/png"),
          width: viewport.width,
          height: viewport.height,
        };

        if (mountedRef.current && pdfDocumentRef.current === pdf) {
          setPagesByNumber((prev) => ({ ...prev, [pageNumber]: renderedPage }));
        }
      } catch (renderError) {
        if (!mountedRef.current || pdfDocumentRef.current !== pdf) return;
        setPageErrorsByNumber((prev) => ({
          ...prev,
          [pageNumber]:
            renderError instanceof Error
              ? renderError.message
              : "Stranu se nepodařilo zobrazit.",
        }));
      } finally {
        if (pdfDocumentRef.current === pdf) renderingPagesRef.current.delete(pageNumber);
      }
    },
    [pagesByNumber]
  );

  useEffect(() => {
    if (!loadingDocument && totalPages > 0) {
      void renderPage(1);
    }
  }, [loadingDocument, renderPage, totalPages]);

  if (documentError) {
    return (
      <div role="alert" className="flex min-h-[54vh] items-center justify-center rounded-2xl border border-red-200 bg-red-50 px-5 text-center text-sm font-semibold text-red-700">
        {documentError}
      </div>
    );
  }

  if (loadingDocument && totalPages === 0) {
    return (
      <div className="flex min-h-[54vh] items-center justify-center rounded-2xl bg-white">
        <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          Připravuji PDF náhled
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-4">
      <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500">
        {name} • {totalPages} {totalPages === 1 ? "strana" : "stran"}
      </div>

      {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
        <PdfPagePreview
          key={pageNumber}
          pageNumber={pageNumber}
          page={pagesByNumber[pageNumber]}
          error={pageErrorsByNumber[pageNumber]}
          onRender={(nextPageNumber) => {
            void renderPage(nextPageNumber);
          }}
        />
      ))}
    </div>
  );
}
