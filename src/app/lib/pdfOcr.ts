export type PdfOcrProgress = {
  page: number;
  totalPages: number;
  status: string;
  progress: number;
};

export type PdfOcrResult = {
  text: string;
  lines: string[];
};

export type PdfOcrOptions = {
  maxPages?: number;
  scale?: number;
  languages?: string | string[];
  onProgress?: (progress: PdfOcrProgress) => void;
};

const DEFAULT_OCR_LANGUAGES = "ces+eng";
const DEFAULT_OCR_SCALE = 2.6;
const DEFAULT_MAX_PAGES = 12;

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

  const buffer = await file.arrayBuffer();
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { createWorker, PSM } = await import("tesseract.js");

  if (pdfjsLib.GlobalWorkerOptions && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  }

  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const totalPages = Math.min(doc.numPages, options.maxPages ?? DEFAULT_MAX_PAGES);
  const scale = options.scale ?? DEFAULT_OCR_SCALE;
  const languages = ocrLanguagesToTesseractValue(options.languages ?? DEFAULT_OCR_LANGUAGES);

  let activePage = 0;
  const worker = await createWorker(languages, 1, {
    workerPath: "/ocr/worker.min.js",
    corePath: "/ocr/tesseract-core-lstm.wasm.js",
    langPath: "/ocr/lang",
    workerBlobURL: false,
    logger: (message) => {
      reportProgress(options.onProgress, {
        page: activePage,
        totalPages,
        status: message.status,
        progress: message.progress,
      });
    },
  });

  try {
    await worker.setParameters({
      preserve_interword_spaces: "1",
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      user_defined_dpi: "300",
    });

    const pageTexts: string[] = [];
    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
      activePage = pageNumber;
      reportProgress(options.onProgress, {
        page: pageNumber,
        totalPages,
        status: "rendering page",
        progress: 0,
      });

      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        throw new Error("Nepodařilo se připravit canvas pro OCR.");
      }

      await page.render({ canvas, canvasContext: context, viewport }).promise;
      const {
        data: { text },
      } = await worker.recognize(canvas);
      pageTexts.push(text ?? "");
      canvas.width = 0;
      canvas.height = 0;
    }

    const text = pageTexts.join("\n");
    const lines = text
      .split(/\n+/)
      .map(normalizeOcrLine)
      .filter(Boolean);

    return { text, lines };
  } finally {
    await worker.terminate();
  }
}
