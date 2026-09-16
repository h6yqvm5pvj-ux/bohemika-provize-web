import type { Worker } from "tesseract.js";

export type PdfOcrProgress = {
  page: number;
  totalPages: number;
  status: string;
  progress: number;
};

export type PdfOcrResult = {
  text: string;
  lines: string[];
  pages: PdfOcrPage[];
};

export type PdfOcrPage = {
  text: string;
  words: { text: string; x: number; y: number; width: number; height: number }[];
};

export type PdfOcrOptions = {
  maxPages?: number;
  scale?: number;
  languages?: string | string[];
  onProgress?: (progress: PdfOcrProgress) => void;
  removeTableLines?: boolean;
  signal?: AbortSignal;
};

// Remove long table borders before OCR, preserving the text inside each cell.
function removeTableLines(context: CanvasRenderingContext2D, width: number, height: number) {
  const pixels = context.getImageData(0, 0, width, height);
  const data = pixels.data;
  const runs: number[][] = [];
  const dark = (x: number, y: number) => {
    const offset = (y * width + x) * 4;
    return data[offset] < 120 && data[offset + 1] < 120 && data[offset + 2] < 120;
  };
  for (let y = 0; y < height; y++) {
    let start = -1;
    for (let x = 0; x <= width; x++) {
      if (x < width && dark(x, y)) { if (start < 0) start = x; }
      else if (start >= 0) {
        if (x - start > width * 0.1) runs.push([start, y, x, y + 1]);
        start = -1;
      }
    }
  }
  for (let x = 0; x < width; x++) {
    let start = -1;
    for (let y = 0; y <= height; y++) {
      if (y < height && dark(x, y)) { if (start < 0) start = y; }
      else if (start >= 0) {
        if (y - start > height * 0.045) runs.push([x, start, x + 1, y]);
        start = -1;
      }
    }
  }
  for (const [x0, y0, x1, y1] of runs) {
    for (let y = Math.max(0, y0 - 1); y < Math.min(height, y1 + 1); y++) {
      for (let x = Math.max(0, x0 - 1); x < Math.min(width, x1 + 1); x++) {
        const offset = (y * width + x) * 4;
        data[offset] = data[offset + 1] = data[offset + 2] = 255;
      }
    }
  }
  context.putImageData(pixels, 0, 0);
}

const DEFAULT_OCR_LANGUAGES = "ces+eng";
const DEFAULT_OCR_SCALE = 2.6;
const DEFAULT_MAX_PAGES = 12;
const MAX_CANVAS_PIXELS = 4_000_000;
const MAX_CANVAS_SIDE = 4096;
const OCR_TIMEOUT_MS = 90_000;
const WORKER_START_TIMEOUT_MS = 30_000;

const normalizeOcrLine = (line: string) =>
  line
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const ocrLanguagesToTesseractValue = (languages: string | string[]) =>
  Array.isArray(languages) ? languages.join("+") : languages;

const reportProgress = (
  onProgress: PdfOcrOptions["onProgress"],
  progress: PdfOcrProgress
) => {
  if (!onProgress) return;
  const normalizedProgress = Number.isFinite(progress.progress)
    ? Math.max(0, Math.min(1, progress.progress))
    : 0;
  onProgress({
    ...progress,
    progress: normalizedProgress,
  });
};

export async function extractOcrLinesFromPdf(
  file: File,
  options: PdfOcrOptions = {}
): Promise<PdfOcrResult> {
  if (typeof document === "undefined") {
    throw new Error("OCR PDF import je dostupný pouze v prohlížeči.");
  }

  let finished = false;
  let worker: Worker | null = null;
  let loadingTask: import("pdfjs-dist/legacy/build/pdf.mjs").PDFDocumentLoadingTask | null = null;
  let rejectFailure!: (error: Error) => void;
  const failure = new Promise<never>((_, reject) => { rejectFailure = reject; });
  // Errors from worker startup can arrive before createWorker's promise settles.
  void failure.catch(() => {});
  const wait = <T,>(task: Promise<T>): Promise<T> => Promise.race([task, failure]);
  const timeout = () => {
    const error = new Error("Rozpoznávání skenu trvalo příliš dlouho. Zkus menší nebo čitelnější PDF.");
    error.name = "PdfImportTimeoutError";
    rejectFailure(error);
  };
  const abort = () => rejectFailure(new DOMException("Rozpoznávání skenu bylo zrušeno.", "AbortError"));
  const timeoutId = setTimeout(timeout, OCR_TIMEOUT_MS);
  let startupTimer: ReturnType<typeof setTimeout> | undefined;
  options.signal?.addEventListener("abort", abort, { once: true });
  try {
    if (options.signal?.aborted) throw new DOMException("Rozpoznávání skenu bylo zrušeno.", "AbortError");
    const buffer = await wait(file.arrayBuffer());
    const [pdfjsLib, { createWorker, PSM }] = await wait(Promise.all([
      import("pdfjs-dist/legacy/build/pdf.mjs"), import("tesseract.js"),
    ]));
    if (pdfjsLib.GlobalWorkerOptions && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    }
    loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
    const doc = await wait(loadingTask.promise);
    const maxPages = Number.isFinite(options.maxPages) ? Math.max(1, Math.floor(options.maxPages!)) : DEFAULT_MAX_PAGES;
    const totalPages = Math.min(doc.numPages, maxPages);
    const requestedScale = Number.isFinite(options.scale) && options.scale! > 0 ? options.scale! : DEFAULT_OCR_SCALE;
    const languages = ocrLanguagesToTesseractValue(options.languages ?? DEFAULT_OCR_LANGUAGES);
    let activePage = 0;
    startupTimer = setTimeout(timeout, WORKER_START_TIMEOUT_MS);
    const pendingWorker = createWorker(languages, 1, {
      // Bust cached worker responses carrying the old CSP that blocked WebAssembly.
      workerPath: "/ocr/worker.min.js?v=7.0.0-ocr2",
      // Let Tesseract select scalar, SIMD or relaxed SIMD for this browser.
      corePath: "/ocr",
      langPath: "/ocr/lang",
      workerBlobURL: false,
      errorHandler: () => rejectFailure(new Error("Rozpoznávání skenu se nepodařilo spustit nebo dokončit. Zkus PDF načíst znovu.")),
      logger: (message) => {
        if (!finished) reportProgress(options.onProgress, {
          page: activePage, totalPages, status: message.status, progress: message.progress,
        });
      },
    }).then(async (created) => {
      // An aborted startup must not leave a worker running if it finishes later.
      if (finished) await created.terminate();
      else worker = created;
      return created;
    });
    worker = await wait(pendingWorker);
    clearTimeout(startupTimer);
    await wait(worker.setParameters({
      preserve_interword_spaces: "1",
      tessedit_pageseg_mode: options.removeTableLines ? PSM.AUTO : PSM.SINGLE_BLOCK,
      user_defined_dpi: "300",
    }));

    const pageTexts: string[] = [];
    const pages: PdfOcrPage[] = [];
    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
      activePage = pageNumber;
      reportProgress(options.onProgress, {
        page: pageNumber,
        totalPages,
        status: "rendering page",
        progress: 0,
      });

      const page = await wait(doc.getPage(pageNumber));
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(requestedScale, Math.sqrt(MAX_CANVAS_PIXELS / (base.width * base.height)), MAX_CANVAS_SIDE / base.width, MAX_CANVAS_SIDE / base.height);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      try {
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) {
          throw new Error("Nepodařilo se připravit canvas pro OCR.");
        }

        await wait(page.render({ canvas, canvasContext: context, viewport }).promise);
        if (options.removeTableLines) removeTableLines(context, canvas.width, canvas.height);
        const {
          data: { text, blocks },
        } = await wait(worker.recognize(canvas, {}, { text: true, blocks: true }));
        pageTexts.push(text ?? "");
        pages.push({
          text: text ?? "",
          words: (blocks ?? []).flatMap((block) => block.paragraphs.flatMap((paragraph) =>
            paragraph.lines.flatMap((line) => line.words.map((word) => ({
              text: word.text,
              x: word.bbox.x0 / scale,
              y: word.bbox.y0 / scale,
              width: (word.bbox.x1 - word.bbox.x0) / scale,
              height: (word.bbox.y1 - word.bbox.y0) / scale,
            })))
          )),
        });
      } finally {
        canvas.width = 0;
        canvas.height = 0;
        page.cleanup();
      }
    }

    const text = pageTexts.join("\n");
    const lines = text
      .split(/\n+/)
      .map(normalizeOcrLine)
      .filter(Boolean);

    return { text, lines, pages };
  } finally {
    finished = true;
    clearTimeout(timeoutId);
    clearTimeout(startupTimer);
    options.signal?.removeEventListener("abort", abort);
    try { await worker?.terminate(); }
    finally { await loadingTask?.destroy(); }
  }
}
