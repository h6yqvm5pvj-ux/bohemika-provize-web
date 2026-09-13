let html2canvasProPromise: Promise<any> | null = null;
let jsPdfCtorPromise: Promise<any> | null = null;

async function getHtml2CanvasPro() {
  if (!html2canvasProPromise) {
    html2canvasProPromise = import("html2canvas-pro").then(
      (mod: unknown) =>
        (mod as { default?: unknown }).default ??
        (mod as Record<string, unknown>)
    );
  }
  return html2canvasProPromise;
}

async function getJsPdfCtor() {
  if (!jsPdfCtorPromise) {
    jsPdfCtorPromise = import("jspdf").then((mod: unknown) => {
      const typed = mod as {
        jsPDF?: unknown;
        default?: { jsPDF?: unknown } | unknown;
      };
      return (
        typed.jsPDF ??
        (typed.default &&
        typeof typed.default === "object" &&
        "jsPDF" in typed.default
          ? (typed.default as { jsPDF?: unknown }).jsPDF
          : typed.default)
      );
    });
  }
  return jsPdfCtorPromise;
}

// html2canvas neumí lab/oklch barvy → nahradíme je běžnými hex/barvami
export function stripUnsupportedColors(html: string): string {
  return html.replace(/(?:oklch|lab)\([^)]*\)/gi, "#0f172a");
}

type PdfBreakRange = {
  top: number;
  bottom: number;
  kind: "block" | "row";
};

export function collectPdfBreakRanges(sourceEl: HTMLElement): PdfBreakRange[] {
  const rootRect = sourceEl.getBoundingClientRect();
  const readRanges = (
    selector: string,
    kind: PdfBreakRange["kind"]
  ): PdfBreakRange[] =>
    Array.from(sourceEl.querySelectorAll(selector))
      .filter((node): node is HTMLElement => node.nodeType === 1)
      .map((node) => {
        const rect = node.getBoundingClientRect();
        const top = rect.top - rootRect.top;
        const bottom = top + rect.height;
        return { top, bottom, kind };
      })
      .filter(
        (range) =>
          Number.isFinite(range.top) &&
          Number.isFinite(range.bottom) &&
          range.bottom - range.top > 4
      );

  return [
    ...readRanges(
      ".report-hero, .info-card, .report-totals, .summary-list, .monthly-chart, .card-user, .footer-note",
      "block"
    ),
    ...readRanges(
      ".product-table thead, .product-table tbody tr, .category-line",
      "row"
    ),
    // A heading travels with the first item it describes, even in an iframe.
    ...Array.from(sourceEl.querySelectorAll(".section-title, .product-table thead")).map(node => {
      const next = node.matches("thead")
        ? node.parentElement?.querySelector("tbody tr")
        : node.nextElementSibling?.querySelector("tr, .category-line, .card-user") ?? node.nextElementSibling;
      return {
        top: node.getBoundingClientRect().top - rootRect.top,
        bottom: (next ?? node).getBoundingClientRect().bottom - rootRect.top,
        kind: "block" as const,
      };
    }),
  ].sort((a, b) => a.top - b.top || b.bottom - a.bottom);
}

export function choosePdfSliceEndCssY({
  startY,
  desiredEndY,
  contentEndY,
  pageCssHeight,
  ranges,
}: {
  startY: number;
  desiredEndY: number;
  contentEndY: number;
  pageCssHeight: number;
  ranges: PdfBreakRange[];
}): number {
  const pageEnd = Math.min(desiredEndY, contentEndY);
  if (pageEnd >= contentEndY - 1) return contentEndY;

  const minUsefulSliceHeight = Math.min(72, pageCssHeight * 0.18);
  const minRangeTop = startY + minUsefulSliceHeight;
  let sliceEnd = pageEnd;
  // Moving a block may expose an earlier keep-with-next range (e.g. its heading).
  // Re-evaluate the new boundary until it no longer separates either range.
  for (;;) {
    const containingRanges = ranges.filter((range) => {
      const height = range.bottom - range.top;
      return (
        range.top >= minRangeTop &&
        range.top < sliceEnd - 1 &&
        range.bottom > sliceEnd + 1 &&
        height <= pageCssHeight - 8
      );
    });

    const containingBlock = containingRanges
      .filter((range) => range.kind === "block")
      .sort((a, b) => a.top - b.top)[0];
    const containingRow = containingRanges
      .filter((range) => range.kind === "row")
      .sort((a, b) => b.top - a.top)[0];
    const containing = containingBlock ?? containingRow;
    if (!containing) return sliceEnd;
    sliceEnd = containing.top;
  }
}

async function withIsolatedPdfSource<T>(
  html: string,
  work: (element: HTMLElement) => Promise<T>
): Promise<T> {
  if (typeof document === "undefined") {
    throw new Error("PDF export je dostupný jen v prohlížeči.");
  }

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:fixed;left:-10000px;top:0;width:0;height:0;opacity:0;pointer-events:none;border:0;";
  document.body.appendChild(iframe);

  try {
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      iframe.addEventListener("load", finish, { once: true });
      iframe.srcdoc = html;
      window.setTimeout(finish, 900);
    });

    const doc = iframe.contentDocument;
    if (!doc) {
      throw new Error("Nepodařilo se připravit izolovaný dokument pro export.");
    }

    const pickPageCandidate = () =>
      doc.querySelector(".page") ??
      doc.querySelector(".report-page") ??
      doc.body?.querySelector(".page") ??
      doc.body?.querySelector(".report-page") ??
      doc.body?.firstElementChild ??
      doc.body;

    const isElementNode = (value: unknown): value is HTMLElement =>
      !!value &&
      typeof value === "object" &&
      "nodeType" in value &&
      (value as { nodeType?: unknown }).nodeType === 1 &&
      "querySelectorAll" in value &&
      typeof (value as { querySelectorAll?: unknown }).querySelectorAll ===
        "function";

    let pageCandidate: unknown = pickPageCandidate();
    if (!isElementNode(pageCandidate)) {
      const waitStart = Date.now();
      while (Date.now() - waitStart < 1500) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 40));
        pageCandidate = pickPageCandidate();
        if (isElementNode(pageCandidate)) break;
      }
    }

    if (!isElementNode(pageCandidate)) {
      throw new Error("Nepodařilo se připravit obsah PDF pro export.");
    }
    const page = pageCandidate;

    const images = Array.from(
      page.querySelectorAll("img")
    ) as HTMLImageElement[];
    await Promise.all(
      images.map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise<void>((resolve) => {
          const done = () => resolve();
          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });
          window.setTimeout(done, 1200);
        });
      })
    );

    return await work(page);
  } finally {
    iframe.remove();
  }
}

async function withInlinePdfSource<T>(
  html: string,
  work: (element: HTMLElement) => Promise<T>
): Promise<T> {
  if (typeof document === "undefined") {
    throw new Error("PDF export je dostupný jen v prohlížeči.");
  }
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const sandbox = document.createElement("div");
  sandbox.setAttribute("aria-hidden", "true");
  sandbox.style.cssText =
    "position:fixed;left:-10000px;top:0;width:820px;opacity:0;pointer-events:none;z-index:-1;";
  const styles = Array.from(parsed.head.querySelectorAll("style"))
    .map((node) => node.outerHTML)
    .join("");
  sandbox.innerHTML = `${styles}<div data-pdf-inline-root>${parsed.body.innerHTML}</div>`;
  document.body.appendChild(sandbox);

  try {
    const pageCandidate =
      sandbox.querySelector(".page") ??
      sandbox.querySelector(".report-page") ??
      sandbox.firstElementChild ??
      sandbox;
    if (!(pageCandidate instanceof HTMLElement)) {
      throw new Error("Nepodařilo se připravit obsah PDF pro export.");
    }

    const page = pageCandidate;
    const images = Array.from(
      page.querySelectorAll("img")
    ) as HTMLImageElement[];
    await Promise.all(
      images.map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise<void>((resolve) => {
          const done = () => resolve();
          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });
          window.setTimeout(done, 1200);
        });
      })
    );

    return await work(page);
  } finally {
    sandbox.remove();
  }
}

export async function withBestPdfSource<T>(
  html: string,
  work: (element: HTMLElement) => Promise<T>
): Promise<T> {
  try {
    return await withIsolatedPdfSource(html, work);
  } catch (isolatedErr) {
    console.warn(
      "PDF export: izolovaný iframe selhal, přepínám na inline fallback.",
      isolatedErr
    );
    return await withInlinePdfSource(html, work);
  }
}

export async function renderPdfBlobFromElement(
  sourceEl: HTMLElement,
  options?: { marginPt?: number; scale?: number; title?: string; subject?: string }
): Promise<Blob> {
  const [html2canvas, JsPdfCtor] = await Promise.all([getHtml2CanvasPro(), getJsPdfCtor()]);
  if (typeof html2canvas !== "function" || typeof JsPdfCtor !== "function") {
    throw new Error("Nepodařilo se načíst nástroje pro vytvoření PDF.");
  }
  const marginPt = Number.isFinite(options?.marginPt) ? Math.max(0, options!.marginPt!) : 18;
  const scale = Number.isFinite(options?.scale) ? Math.max(1, options!.scale!) : 3;
  const pdf = new JsPdfCtor({ unit: "pt", format: "a4", orientation: "portrait", compress: true }) as import("jspdf").jsPDF;
  pdf.setProperties({ title: options?.title ?? "Přehled produkce — Bohemika", subject: options?.subject ?? "Produkční report", creator: "Bohemka.App" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pageWidth - marginPt * 2;
  const sourceWidth = sourceEl.getBoundingClientRect().width || 760;
  const cssToPt = contentWidth / sourceWidth;
  const capture = (element: HTMLElement): Promise<HTMLCanvasElement> => html2canvas(element, {
    scale, backgroundColor: "#ffffff", useCORS: true, imageTimeout: 20000, logging: false,
  });
  const header = sourceEl.querySelector<HTMLElement>(".report-hero");
  const headerDisplay = header?.style.display ?? "";
  const headerRect = header?.getBoundingClientRect();
  const sourceRect = sourceEl.getBoundingClientRect();

  try {
    const headerCanvas = header ? await capture(header) : null;
    const headerHeight = (headerRect?.height ?? 0) * cssToPt;
    const bodyTop = marginPt + headerHeight + (header ? 8 : 0);
    const bodyHeight = pageHeight - bodyTop - marginPt - 20;
    if (header) header.style.display = "none";
    const bodyCanvas = await capture(sourceEl);
    const pxPerCss = bodyCanvas.width / sourceWidth;
    const bodyRect = sourceEl.getBoundingClientRect();
    const lastContent = sourceEl.querySelector<HTMLElement>(".footer-note");
    // Exclude bottom paper padding so it cannot create an empty trailing page.
    const sourceHeight = Math.min(bodyCanvas.height / pxPerCss, lastContent ? lastContent.getBoundingClientRect().bottom - bodyRect.top + 2 : Infinity);
    const pageCssHeight = bodyHeight / cssToPt;
    const breakRanges = collectPdfBreakRanges(sourceEl);
    const tables = await Promise.all(Array.from(sourceEl.querySelectorAll<HTMLTableElement>(".product-table")).map(async table => {
      const head = table.querySelector<HTMLElement>("thead");
      if (!head) return null;
      const rect = table.getBoundingClientRect();
      const headRect = head.getBoundingClientRect();
      return { top: rect.top - bodyRect.top, bottom: rect.bottom - bodyRect.top, left: rect.left - bodyRect.left, width: rect.width, headHeight: headRect.height, canvas: await capture(head) };
    }));
    let startY = 0;
    let pageIndex = 0;
    while (startY < sourceHeight - 1) {
      const continuedTable = tables.find(table => table && startY >= table.top + table.headHeight - 1 && startY < table.bottom - 1);
      const repeatedHeight = continuedTable?.headHeight ?? 0;
      const availableCssHeight = pageCssHeight - repeatedHeight;
      let endY = choosePdfSliceEndCssY({startY, desiredEndY: startY + availableCssHeight, contentEndY: sourceHeight, pageCssHeight: availableCssHeight, ranges: breakRanges});
      if (endY <= startY + 1) endY = Math.min(startY + availableCssHeight, sourceHeight);
      const sourceY = Math.round(startY * pxPerCss);
      const endPx = Math.min(bodyCanvas.height, Math.round(endY * pxPerCss));
      const slice = document.createElement("canvas");
      slice.width = bodyCanvas.width;
      slice.height = Math.max(1, endPx - sourceY);
      const ctx = slice.getContext("2d");
      if (!ctx) throw new Error("Nepodařilo se připravit stránku PDF.");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(bodyCanvas, 0, sourceY, bodyCanvas.width, slice.height, 0, 0, slice.width, slice.height);
      if (pageIndex > 0) pdf.addPage();
      if (headerCanvas && headerRect) {
        pdf.addImage(headerCanvas, "PNG", marginPt + (headerRect.left - sourceRect.left) * cssToPt, marginPt, headerRect.width * cssToPt, headerHeight, "company-letterhead", "FAST");
      }
      if (continuedTable) {
        pdf.addImage(continuedTable.canvas, "PNG", marginPt + continuedTable.left * cssToPt, bodyTop, continuedTable.width * cssToPt, repeatedHeight * cssToPt, undefined, "FAST");
      }
      pdf.addImage(slice, "PNG", marginPt, bodyTop + repeatedHeight * cssToPt, contentWidth, Math.min(bodyHeight - repeatedHeight * cssToPt, slice.height / pxPerCss * cssToPt), undefined, "FAST");
      pageIndex += 1;
      startY = endY;
    }
    for (let page = 1; page <= pdf.getNumberOfPages(); page += 1) {
      pdf.setPage(page);
      pdf.setDrawColor(218, 229, 236);
      pdf.setLineWidth(.5);
      pdf.line(marginPt + 24, pageHeight - marginPt - 15, pageWidth - marginPt - 24, pageHeight - marginPt - 15);
      pdf.setTextColor(121, 141, 153);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.text("bohemka.app", marginPt + 24, pageHeight - marginPt - 3);
      pdf.text(`${page} / ${pdf.getNumberOfPages()}`, pageWidth - marginPt - 24, pageHeight - marginPt - 3, {align: "right"});
    }
    return pdf.output("blob");
  } finally {
    if (header) header.style.display = headerDisplay;
  }
}

export function downloadBlobFile(blob: Blob, filename: string) {
  if (typeof window === "undefined") return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
