import { type Product } from "../types/domain";

export type PdfProductDetection = {
  product: Product;
  confidence: "high" | "medium";
  reason: string;
};

type DetectionRule = {
  product: Product;
  page?: number;
  allOf?: string[];
  mustContain?: { page: number | "last" | "any"; text: string }[];
  confidence: PdfProductDetection["confidence"];
  reason: string;
};

const stripDiacritics = (text: string) =>
  text.normalize("NFD").replace(/\p{Diacritic}/gu, "");

const normalizeText = (text: string) =>
  stripDiacritics(text).toUpperCase().replace(/\s+/g, " ").trim();

const normalizeLooseText = (text: string) =>
  normalizeText(text).replace(/[^A-Z0-9]+/g, "");

const DETECTION_RULES: DetectionRule[] = [
  {
    product: "cppAuto",
    page: 1,
    allOf: [
      normalizeText("Česká podnikatelská pojišťovna, a. s."),
      normalizeText("AUTOPOJIŠTĚNÍ"),
    ],
    confidence: "high",
    reason:
      "Na 1. stránce jsou texty „Česká podnikatelská pojišťovna, a. s.“ a „AUTOPOJIŠTĚNÍ“.",
  },
  {
    product: "cppAuto",
    page: 1,
    allOf: [
      normalizeText("Česká podnikatelská pojišťovna, a. s."),
      normalizeText("COMBI PLUS"),
    ],
    confidence: "high",
    reason:
      "Na 1. stránce jsou texty „Česká podnikatelská pojišťovna, a. s.“ a „COMBI PLUS“.",
  },
  {
    product: "cppcestovko",
    page: 1,
    allOf: [
      normalizeText("Česká podnikatelská pojišťovna"),
      normalizeText("CESTOVNÍ POJIŠTĚNÍ"),
    ],
    confidence: "high",
    reason:
      "Na 1. stránce jsou texty „Česká podnikatelská pojišťovna“ a „CESTOVNÍ POJIŠTĚNÍ“.",
  },
  {
    product: "cppsimplex",
    mustContain: [
      { page: "any", text: normalizeText("Česká podnikatelská pojišťovna") },
      { page: "any", text: normalizeText("SIMPLEX") },
    ],
    confidence: "high",
    reason:
      "V PDF jsou nalezeny texty „Česká podnikatelská pojišťovna“ a „SIMPLEX“.",
  },
  {
    product: "slaviaauto",
    mustContain: [
      { page: 1, text: normalizeText("Pojištění vozidel") },
      { page: "last", text: normalizeText("Slavia pojišťovna") },
    ],
    confidence: "high",
    reason:
      "Na 1. stránce je text „Pojištění vozidel“ a na poslední stránce text „Slavia pojišťovna“.",
  },
  {
    product: "slaviaauto",
    mustContain: [
      { page: 1, text: normalizeText("Povinné ručení") },
      { page: "last", text: normalizeText("Slavia pojišťovna") },
    ],
    confidence: "high",
    reason:
      "Na 1. stránce je text „Povinné ručení“ a na poslední stránce text „Slavia pojišťovna“.",
  },
  {
    product: "kooperativaAuto",
    mustContain: [
      { page: 1, text: normalizeText("Kooperativa pojišťovna") },
      { page: 1, text: normalizeText("Autopojištění") },
    ],
    confidence: "high",
    reason:
      "Na 1. stránce jsou texty „Kooperativa pojišťovna“ a „Autopojištění“.",
  },
  {
    product: "kooperativaAuto",
    mustContain: [
      { page: 1, text: normalizeText("Kooperativa pojišťovna") },
      { page: 2, text: normalizeText("Povinné ručení") },
    ],
    confidence: "high",
    reason:
      "Na 1. stránce je text „Kooperativa pojišťovna“ a na 2. stránce text „Povinné ručení“.",
  },
  {
    product: "flexi",
    page: 1,
    allOf: [normalizeText("životní pojištění FLEXI"), normalizeText("Kooperativa pojišťovna")],
    confidence: "high",
    reason:
      "Na 1. stránce jsou texty „životní pojištění FLEXI“ a „Kooperativa pojišťovna“.",
  },
  {
    product: "comfortcc",
    mustContain: [{ page: "any", text: normalizeText("COMFORT COMMODITY") }],
    confidence: "high",
    reason: "V PDF je nalezen text „COMFORT COMMODITY“.",
  },
  {
    product: "domex",
    page: 1,
    allOf: [normalizeText("Česká podnikatelská pojišťovna, a.s."), normalizeText("DOMEX")],
    confidence: "high",
    reason: "Na 1. stránce jsou texty „Česká podnikatelská pojišťovna, a.s.“ a „DOMEX“.",
  },
  {
    product: "allianzAuto",
    page: 2,
    allOf: [normalizeText("Allianz pojišťovna, a.s."), normalizeText("MojeAuto")],
    confidence: "high",
    reason: "Na 2. stránce jsou texty „Allianz pojišťovna, a.s.“ a „MojeAuto“.",
  },
  {
    product: "allianzAuto",
    page: 2,
    allOf: [normalizeText("Allianz pojišťovna, a.s."), normalizeText("Pojištěné vozidlo")],
    confidence: "high",
    reason: "Na 2. stránce jsou texty „Allianz pojišťovna, a.s.“ a „Pojištěné vozidlo“.",
  },
  {
    product: "csobAuto",
    page: 1,
    allOf: [normalizeText("ČSOB Pojišťovna"), normalizeText("NAŠE AUTO")],
    confidence: "high",
    reason: "Na 1. stránce jsou texty „ČSOB Pojišťovna“ a „NAŠE AUTO“.",
  },
  {
    product: "csobAuto",
    page: 1,
    allOf: [normalizeText("ČSOB Pojišťovna"), normalizeText("Vlastník vozidla")],
    confidence: "high",
    reason: "Na 1. stránce jsou texty „ČSOB Pojišťovna“ a „Vlastník vozidla“.",
  },
  {
    product: "uniqaAuto",
    page: 1,
    allOf: [normalizeText("UNIQA pojišťovna"), normalizeText("Auto & pohoda")],
    confidence: "high",
    reason: "Na 1. stránce jsou texty „UNIQA pojišťovna“ a „Auto & pohoda“.",
  },
  {
    product: "uniqaAuto",
    page: 1,
    allOf: [normalizeText("UNIQA pojišťovna"), normalizeText("Vlastník vozidla")],
    confidence: "high",
    reason: "Na 1. stránce jsou texty „UNIQA pojišťovna“ a „Vlastník vozidla“.",
  },
  {
    product: "neon",
    page: 1,
    allOf: [normalizeText("ŽIVOTNÍ POJIŠTĚNÍ NEON"), normalizeText("Česká podnikatelská pojišťovna")],
    confidence: "high",
    reason:
      "Na 1. stránce jsou texty „ŽIVOTNÍ POJIŠTĚNÍ NEON“ a „Česká podnikatelská pojišťovna“.",
  },
  {
    product: "pillowAuto",
    mustContain: [
      { page: 1, text: normalizeText("Pojištění vozidla") },
      { page: 3, text: normalizeText("Pillow pojišťovna") },
    ],
    confidence: "high",
    reason:
      "Na 1. stránce je text „Pojištění vozidla“ a na 3. stránce text „Pillow pojišťovna“.",
  },
];

const extractPageText = async (doc: any, pageNumber: number): Promise<string> => {
  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();
  return content.items
    .map((item: any) => (typeof item?.str === "string" ? item.str : ""))
    .filter(Boolean)
    .join(" ");
};

export async function detectProductFromPdf(file: File): Promise<PdfProductDetection | null> {
  if (!file) return null;

  const buffer = await file.arrayBuffer();
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

  if (typeof window !== "undefined" && pdfjsLib.GlobalWorkerOptions) {
    try {
      const workerSrc = "/pdf.worker.min.mjs";
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
      }
    } catch (err) {
      console.warn("PDF worker src nebylo možné nastavit", err);
    }
  }

  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  if (doc.numPages < 1) return null;

  const pageTextByNumber = new Map<number, { strict: string; loose: string }>();
  const pageContainsText = (
    pageText: { strict: string; loose: string },
    text: string
  ) => {
    if (pageText.strict.includes(text)) return true;
    return pageText.loose.includes(normalizeLooseText(text));
  };
  const ensurePageText = async (pageNumber: number) => {
    if (pageTextByNumber.has(pageNumber)) {
      return pageTextByNumber.get(pageNumber)!;
    }
    const pageText = await extractPageText(doc, pageNumber);
    const strict = normalizeText(pageText);
    const normalized = {
      strict,
      loose: normalizeLooseText(strict),
    };
    pageTextByNumber.set(pageNumber, normalized);
    return normalized;
  };

  for (const rule of DETECTION_RULES) {
    const requirements =
      rule.mustContain ??
      (typeof rule.page === "number" && rule.allOf
        ? rule.allOf.map((text) => ({ page: rule.page as number, text }))
        : []);
    if (requirements.length === 0) continue;

    let matched = true;
    for (const requirement of requirements) {
      if (requirement.page === "any") {
        let foundOnSomePage = false;
        for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
          const normalizedPageText = await ensurePageText(pageNumber);
          if (pageContainsText(normalizedPageText, requirement.text)) {
            foundOnSomePage = true;
            break;
          }
        }
        if (!foundOnSomePage) {
          matched = false;
          break;
        }
        continue;
      }

      const requiredPage = requirement.page === "last" ? doc.numPages : requirement.page;
      if (requiredPage < 1 || requiredPage > doc.numPages) {
        matched = false;
        break;
      }

      const normalizedPageText = await ensurePageText(requiredPage);
      if (!pageContainsText(normalizedPageText, requirement.text)) {
        matched = false;
        break;
      }
    }

    if (matched) {
      return {
        product: rule.product,
        confidence: rule.confidence,
        reason: rule.reason,
      };
    }
  }

  return null;
}
