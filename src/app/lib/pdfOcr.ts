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
      tessedit_pageseg_mode: options.removeTableLines ? PSM.AUTO : PSM.SINGLE_BLOCK,
      user_defined_dpi: "300",
    });

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
      if (options.removeTableLines) removeTableLines(context, canvas.width, canvas.height);
      const {
        data: { text, blocks },
      } = await worker.recognize(canvas, {}, { text: true, blocks: true });
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
      canvas.width = 0;
      canvas.height = 0;
    }

    const text = pageTexts.join("\n");
    const lines = text
      .split(/\n+/)
      .map(normalizeOcrLine)
      .filter(Boolean);

    return { text, lines, pages };
  } finally {
    await worker.terminate();
    await doc.destroy();
  }
}
