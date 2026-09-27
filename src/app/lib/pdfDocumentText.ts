import type { TextItem } from "pdfjs-dist/types/src/display/api";
import type { PdfOcrPage, PdfOcrProgress } from "./pdfOcr";

export type PdfReadOptions = {
  allowOcr?: boolean;
  signal?: AbortSignal;
  onOcrStart?: () => void;
  onOcrProgress?: (progress: PdfOcrProgress) => void;
  /** Selected pages for a product-specific fallback on an incomplete text layer. */
  ocrPages?: number[];
};

export type PdfTextPage = { items: TextItem[]; width: number; height: number; needsOcr?: boolean; ocrWords?: PdfOcrPage["words"] };
export type PdfDocumentText = {
  pages: PdfTextPage[];
  ocrTextUsed: boolean;
  warnings: string[];
};

type Observer = Pick<PdfReadOptions, "onOcrStart" | "onOcrProgress">;
type ReadTask = {
  promise: Promise<PdfDocumentText>;
  controller: AbortController;
  observers: Set<Observer>;
  settled: boolean;
  ocrStarted: boolean;
};

// File identity separates uploads, including files with identical names. Only
// extracted text is retained; PDF documents, canvases and workers are released.
const cache = new WeakMap<File, Map<string, ReadTask>>();
const MAX_OCR_PAGES = 12;
const abortError = () => new DOMException("Načítání PDF bylo zrušeno.", "AbortError");

function sharedRead(
  file: File,
  key: string,
  options: PdfReadOptions,
  read: (signal: AbortSignal, notify: Observer) => Promise<PdfDocumentText>,
): Promise<PdfDocumentText> {
  if (options.signal?.aborted) return Promise.reject(abortError());
  let entries = cache.get(file);
  if (!entries) { entries = new Map(); cache.set(file, entries); }
  let task = entries.get(key);
  if (!task) {
    const controller = new AbortController();
    const observers = new Set<Observer>();
    const promise = Promise.resolve().then(() => read(controller.signal, {
      onOcrStart: () => {
        created.ocrStarted = true;
        observers.forEach(observer => observer.onOcrStart?.());
      },
      onOcrProgress: progress => observers.forEach(observer => observer.onOcrProgress?.(progress)),
    })).then(result => {
      created.settled = true;
      return result;
    }, error => {
      created.settled = true;
      if (entries.get(key) === created) entries.delete(key);
      throw error;
    });
    const created: ReadTask = { controller, observers, settled: false, ocrStarted: false, promise };
    task = created;
    entries.set(key, created);
  }
  const active = task;
  // Each caller owns its cancellation. Cancel shared work only when its last
  // caller leaves; a concurrent text-only import must not wait for OCR.
  return new Promise((resolve, reject) => {
    const observer: Observer = { onOcrStart: options.onOcrStart, onOcrProgress: options.onOcrProgress };
    active.observers.add(observer);
    let finished = false;
    const finish = () => {
      if (finished) return false;
      finished = true;
      options.signal?.removeEventListener("abort", abort);
      active.observers.delete(observer);
      return true;
    };
    const abort = () => {
      if (!finish()) return;
      reject(abortError());
      if (!active.settled && active.observers.size === 0) {
        if (entries.get(key) === active) entries.delete(key);
        active.controller.abort();
      }
    };
    options.signal?.addEventListener("abort", abort, { once: true });
    if (active.ocrStarted && !active.settled) observer.onOcrStart?.();
    active.promise.then(result => { if (finish()) resolve(result); }, error => { if (finish()) reject(error); });
  });
}

async function readNativeText(file: File, signal: AbortSignal): Promise<PdfDocumentText> {
  let task: import("pdfjs-dist/legacy/build/pdf.mjs").PDFDocumentLoadingTask | undefined;
  let doc: import("pdfjs-dist/legacy/build/pdf.mjs").PDFDocumentProxy | undefined;
  let rejectFailure!: (error: Error) => void;
  const failure = new Promise<never>((_, reject) => { rejectFailure = reject; });
  void failure.catch(() => {});
  const wait = <T,>(promise: Promise<T>) => Promise.race([promise, failure]);
  const abort = () => rejectFailure(abortError());
  signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => {
    const error = new Error("Čtení textu PDF trvalo příliš dlouho. Zkus menší PDF.");
    error.name = "PdfImportTimeoutError";
    rejectFailure(error);
  }, 15_000);
  try {
    if (signal.aborted) throw abortError();
    const [buffer, pdfjs] = await wait(Promise.all([file.arrayBuffer(), import("pdfjs-dist/legacy/build/pdf.mjs")]));
    if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    task = pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false });
    doc = await wait(task.promise);
    const pages: PdfTextPage[] = [];
    for (let number = 1; number <= doc.numPages; number++) {
      const page = await wait(doc.getPage(number));
      try {
        const content = await wait(page.getTextContent());
        const viewport = page.getViewport?.({ scale: 1 });
        const snapshot: PdfTextPage = {
          items: content.items.filter((item): item is TextItem => "str" in item),
          width: viewport?.width ?? 595,
          height: viewport?.height ?? 842,
        };
        if (textLength(snapshot) < 80) {
          // A short signature page or an empty sheet is not necessarily a scan.
          // Inspect only sparse pages; ordinary text pages need no operator read.
          const operators = await wait(page.getOperatorList?.() ?? Promise.resolve(null));
          if (operators) {
            const imageOperations = [pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject,
              pdfjs.OPS.paintImageXObjectRepeat, pdfjs.OPS.paintInlineImageXObjectGroup];
            snapshot.needsOcr = operators.fnArray.some(operation => imageOperations.includes(operation));
          } else snapshot.needsOcr = true;
        }
        pages.push(snapshot);
      } finally { page.cleanup?.(); }
    }
    return { pages, ocrTextUsed: false, warnings: [] };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
    if (task?.destroy) await task.destroy();
    else await doc?.destroy?.();
  }
}

const textLength = (page: PdfTextPage) => page.items.map(item => item.str).join("").replace(/[^\p{L}\p{N}]/gu, "").length;

/** Adapt OCR coordinates to the PDF coordinates used by the existing parsers. */
export function ocrPageToTextPage(page: PdfOcrPage, size: PdfTextPage): PdfTextPage {
  const rows: { y: number; words: PdfOcrPage["words"] }[] = [];
  for (const word of [...page.words].sort((a, b) => a.y - b.y || a.x - b.x)) {
    if (!word.text.trim()) continue;
    const center = word.y + word.height / 2;
    const row = rows.find(row => Math.abs(row.y - center) <= 3.5);
    if (row) row.words.push(word);
    else rows.push({ y: center, words: [word] });
  }
  const items: TextItem[] = [];
  for (const row of rows.sort((a, b) => a.y - b.y)) {
    // OCR boxes follow individual glyphs (e.g. descending letters). Give all
    // chunks on a visual row one baseline, as the PDF layout parsers expect.
    const rowBottom = Math.max(...row.words.map(word => word.y + word.height));
    let group: PdfOcrPage["words"] = [];
    const flush = () => {
      if (!group.length) return;
      const x = group[0].x;
      const top = Math.min(...group.map(word => word.y));
      const bottom = Math.max(...group.map(word => word.y + word.height));
      items.push({ str: group.map(word => word.text.trim()).join(" "),
        transform: [1, 0, 0, bottom - top, x, size.height - rowBottom],
        width: Math.max(...group.map(word => word.x + word.width)) - x,
        height: bottom - top, dir: "ltr", fontName: "ocr", hasEOL: true });
      group = [];
    };
    for (const word of row.words.sort((a, b) => a.x - b.x)) {
      const previous = group.at(-1);
      if (previous && (word.x - previous.x - previous.width > Math.max(12, word.height * 1.5) || /:$/.test(previous.text))) flush();
      group.push(word);
    }
    flush();
  }
  return { ...size, items, ocrWords: page.words };
}

export async function readPdfText(file: File, options: PdfReadOptions = {}): Promise<PdfDocumentText> {
  const native = await sharedRead(file, "text", options, signal => readNativeText(file, signal));
  if (!options.allowOcr || typeof document === "undefined") return native;
  const candidates = options.ocrPages ?? native.pages.flatMap((page, index) => page.needsOcr ? [index + 1] : []);
  const requested = [...new Set(candidates)].filter(number => Number.isInteger(number) && number >= 1 && number <= native.pages.length).sort((a, b) => a - b);
  if (!requested.length) return native;
  const pageNumbers = requested.slice(0, MAX_OCR_PAGES);
  return sharedRead(file, `ocr:${requested.join(",")}`, options, async (signal, notify) => {
    notify.onOcrStart?.();
    const { extractOcrLinesFromPdf } = await import("./pdfOcr");
    const ocr = await extractOcrLinesFromPdf(file, { pageNumbers, removeTableLines: true, signal, onProgress: notify.onOcrProgress });
    const pages = [...native.pages];
    let ocrTextUsed = false;
    ocr.pages.forEach((page, index) => {
      const number = pageNumbers[index];
      if (!number) return;
      const replacement = ocrPageToTextPage(page, pages[number - 1]);
      if (replacement.items.length && (options.ocrPages || textLength(replacement) > textLength(pages[number - 1]))) {
        pages[number - 1] = replacement;
        ocrTextUsed = true;
      }
    });
    const warnings: string[] = [];
    if (ocrTextUsed) warnings.push("Údaje byly načteny ze skenu. Zkontroluj číslo smlouvy, pojistníka, pojistné a data podle PDF.");
    if (requested.length > MAX_OCR_PAGES) warnings.push(`OCR zpracovalo jen ${MAX_OCR_PAGES} z ${requested.length} stran bez dostatečného textu. Další údaje zkontroluj a doplň ručně.`);
    if (!ocrTextUsed) warnings.push("Ze skenovaných stran se nepodařilo získat další čitelné údaje. Doplň je podle PDF.");
    return { pages, ocrTextUsed, warnings };
  });
}
