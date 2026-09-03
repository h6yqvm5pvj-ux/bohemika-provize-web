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
  mustContain?: DetectionRequirement[];
  confidence: PdfProductDetection["confidence"];
  reason: string;
};

type DetectionRequirement = {
  page: number | "last" | "any";
  text: string;
  wholeWord?: boolean;
};

type PositionedTextItem = {
  str: string;
  x: number;
  y: number;
  width: number;
};

const stripDiacritics = (text: string) =>
  text.normalize("NFD").replace(/\p{Diacritic}/gu, "");

const normalizeText = (text: string) =>
  stripDiacritics(text).toUpperCase().replace(/\s+/g, " ").trim();

const normalizeLooseText = (text: string) =>
  normalizeText(text).replace(/[^A-Z0-9]+/g, "");

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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
    product: "axacestovko",
    mustContain: [
      { page: "any", text: normalizeText("Inter Partner Assistance") },
      { page: "any", text: normalizeText("cestovní pojištění") },
    ],
    confidence: "high",
    reason:
      "V PDF jsou nalezeny texty „Inter Partner Assistance“ a „cestovní pojištění“.",
  },
  {
    product: "axacestovko",
    mustContain: [
      { page: "any", text: normalizeText("Inter Partner Assistance") },
      { page: "any", text: normalizeText("cestovního pojištění") },
    ],
    confidence: "high",
    reason:
      "V PDF jsou nalezeny texty „Inter Partner Assistance“ a „cestovního pojištění“.",
  },
  {
    product: "axacestovko",
    mustContain: [
      { page: "any", text: normalizeText("Inter Partner Assistance") },
      { page: "any", text: normalizeText("travel insurance") },
    ],
    confidence: "high",
    reason:
      "V PDF jsou nalezeny texty „Inter Partner Assistance“ a „travel insurance“.",
  },
  {
    product: "koopcestovko",
    mustContain: [
      { page: "any", text: normalizeText("Kooperativa") },
      { page: "any", text: normalizeText("Cestovní pojištění KOLUMBUS") },
    ],
    confidence: "high",
    reason:
      "V PDF jsou nalezeny texty „Kooperativa“ a „Cestovní pojištění KOLUMBUS“.",
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
    product: "zamex",
    mustContain: [
      { page: "any", text: normalizeText("Česká podnikatelská pojišťovna") },
      { page: "any", text: normalizeText("ZAMEX") },
    ],
    confidence: "high",
    reason:
      "V PDF jsou nalezeny texty „Česká podnikatelská pojišťovna“ a „ZAMEX“.",
  },
  {
    product: "cppbytex",
    mustContain: [
      { page: "any", text: normalizeText("Česká podnikatelská pojišťovna") },
      { page: "any", text: normalizeText("BYTEX") },
    ],
    confidence: "high",
    reason:
      "V PDF jsou nalezeny texty „Česká podnikatelská pojišťovna“ a „BYTEX“ nebo „BYTEX+“.",
  },
  {
    product: "cpphafan",
    mustContain: [
      { page: "any", text: normalizeText("Česká podnikatelská pojišťovna") },
      { page: "any", text: normalizeText("HAFAN") },
    ],
    confidence: "high",
    reason:
      "V PDF jsou nalezeny texty „Česká podnikatelská pojišťovna“ a „HAFAN“.",
  },
  {
    product: "koopodzam",
    mustContain: [
      { page: "any", text: normalizeText("Kooperativa pojišťovna") },
      {
        page: "any",
        text: normalizeText(
          "pojištění odpovědnosti za škodu způsobenou zaměstnavateli"
        ),
      },
    ],
    confidence: "high",
    reason:
      "V PDF jsou nalezeny texty „Kooperativa pojišťovna“ a „pojištění odpovědnosti za škodu způsobenou zaměstnavateli“.",
  },
  {
    product: "koopfit",
    mustContain: [
      { page: "any", text: normalizeText("Kooperativa pojišťovna") },
      { page: "any", text: normalizeText("pojištění sportovní výbavy FIT") },
    ],
    confidence: "high",
    reason:
      "V PDF jsou nalezeny texty „Kooperativa pojišťovna“ a „pojištění sportovní výbavy FIT“.",
  },
  {
    product: "koopfit",
    mustContain: [
      { page: "any", text: normalizeText("Kooperativa pojišťovna") },
      { page: "any", text: normalizeText("sportovní výbavy") },
    ],
    confidence: "high",
    reason:
      "V PDF jsou nalezeny texty „Kooperativa pojišťovna“ a „sportovní výbavy“.",
  },
  {
    product: "koopfit",
    mustContain: [
      { page: "any", text: normalizeText("Kooperativa pojišťovna") },
      { page: "any", text: normalizeText("FIT") },
    ],
    confidence: "medium",
    reason:
      "V PDF jsou nalezeny texty „Kooperativa pojišťovna“ a „FIT“.",
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
    product: "domexneuron",
    page: 1,
    allOf: [
      normalizeText("Česká podnikatelská pojišťovna, a.s."),
      normalizeText("DOMEX NEURON"),
    ],
    confidence: "high",
    reason:
      "Na 1. stránce jsou texty „Česká podnikatelská pojišťovna, a.s.“ a „DOMEX NEURON“.",
  },
  {
    product: "domex",
    page: 1,
    allOf: [normalizeText("Česká podnikatelská pojišťovna, a.s."), normalizeText("DOMEX")],
    confidence: "high",
    reason: "Na 1. stránce jsou texty „Česká podnikatelská pojišťovna, a.s.“ a „DOMEX“.",
  },
  {
    product: "maxdomov",
    mustContain: [
      { page: "any", text: normalizeText("MAXDOMOV 3") },
      { page: "any", text: normalizeText("MAXIMA") },
    ],
    confidence: "high",
    reason: "V PDF jsou nalezeny texty „MAXDOMOV 3“ a „MAXIMA“.",
  },
  {
    product: "maxdomov",
    mustContain: [
      { page: "any", text: normalizeText("MAXDOMOV") },
      { page: "any", text: normalizeText("MAXIMA") },
    ],
    confidence: "high",
    reason: "V PDF jsou nalezeny texty „MAXDOMOV“ a „MAXIMA“.",
  },
  {
    product: "allianzAuto",
    mustContain: [
      { page: "any", text: normalizeText("ALLIANZ") },
      { page: "any", text: normalizeText("MOJEAUTO") },
    ],
    confidence: "high",
    reason: "V PDF jsou nalezeny texty „ALLIANZ“ a „MOJEAUTO“.",
  },
  {
    product: "allianzAuto",
    mustContain: [
      { page: "any", text: normalizeText("ALLIANZ") },
      { page: "any", text: normalizeText("AUTO"), wholeWord: true },
    ],
    confidence: "high",
    reason: "V PDF jsou nalezeny texty „ALLIANZ“ a samostatné slovo „AUTO“.",
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
    mustContain: [
      { page: "any", text: normalizeText("UNIQA pojišťovna") },
      { page: "any", text: normalizeText("Pojištění vozidel") },
    ],
    confidence: "high",
    reason:
      "V PDF jsou nalezeny texty „UNIQA pojišťovna“ a „Pojištění vozidel“.",
  },
  {
    product: "uniqaAuto",
    mustContain: [
      { page: "any", text: normalizeText("UNIQA pojišťovna") },
      { page: "any", text: normalizeText("Auto"), wholeWord: true },
    ],
    confidence: "medium",
    reason: "V PDF jsou nalezeny texty „UNIQA pojišťovna“ a samostatné slovo „Auto“.",
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
    product: "neon",
    page: 1,
    allOf: [
      normalizeText("RIZIKOVÉ POJIŠTĚNÍ NEON RISK"),
      normalizeText("Česká podnikatelská pojišťovna"),
    ],
    confidence: "high",
    reason:
      "Na 1. stránce jsou texty „RIZIKOVÉ POJIŠTĚNÍ NEON RISK“ a „Česká podnikatelská pojišťovna“.",
  },
  {
    product: "neon",
    mustContain: [
      { page: "any", text: normalizeText("Česká podnikatelská pojišťovna") },
      { page: "any", text: normalizeText("NEON"), wholeWord: true },
      { page: "any", text: normalizeText("Žádanka o změnu") },
    ],
    confidence: "high",
    reason:
      "V PDF jsou nalezeny texty „Česká podnikatelská pojišťovna“, „NEON“ a „Žádanka o změnu“.",
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

const extractPageItems = async (doc: any, pageNumber: number): Promise<PositionedTextItem[]> => {
  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();
  return (content.items ?? [])
    .map((item: any) => ({
      str: typeof item?.str === "string" ? item.str.replace(/\s+/g, " ").trim() : "",
      x: item?.transform?.[4] ?? 0,
      y: item?.transform?.[5] ?? 0,
      width: item?.width ?? 0,
    }))
    .filter((item: PositionedTextItem) => item.str.length > 0);
};

const looksLikeOldMaxdomov3Layout = async (
  doc: any,
  ensurePageItems: (pageNumber: number) => Promise<PositionedTextItem[]>
): Promise<boolean> => {
  if (doc.numPages < 5) return false;

  const firstPageItems = await ensurePageItems(1);
  const fourthPageItems = await ensurePageItems(4);

  const hasHeaderContractNumber = firstPageItems.some((item) => {
    if (item.x < 80 || item.x > 190 || item.y < 720) return false;
    return /^\d{6,14}$/.test(item.str.replace(/\D+/g, ""));
  });
  const hasPolicyholderName = firstPageItems.some((item) => {
    if (item.x < 0 || item.x > 160 || item.y < 630 || item.y > 680) return false;
    return /[A-Za-zÁ-Žá-ž]/.test(item.str) && item.str.trim().split(/\s+/).length >= 2;
  });
  const hasPolicyStartDate = fourthPageItems.some((item) => {
    if (item.x < 70 || item.x > 170 || item.y < 175 || item.y > 220) return false;
    return /\b\d{1,2}\.\s*\d{1,2}\.\s*\d{4}\b/.test(item.str);
  });
  const hasPaymentFrequencyMark = fourthPageItems.some((item) => {
    if (normalizeText(item.str) !== "X") return false;
    return item.x >= 100 && item.x <= 340 && item.y >= 105 && item.y <= 145;
  });
  const hasPaymentAmount = fourthPageItems.some((item) => {
    if (item.x < 520 || item.x > 585 || item.y < 15 || item.y > 60) return false;
    return /\b\d{1,3}(?:\s\d{3})+\b|\b\d{3,8}\b/.test(item.str);
  });

  return (
    hasHeaderContractNumber &&
    hasPolicyholderName &&
    hasPolicyStartDate &&
    hasPaymentFrequencyMark &&
    hasPaymentAmount
  );
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
  const pageItemsByNumber = new Map<number, PositionedTextItem[]>();
  const pageContainsText = (
    pageText: { strict: string; loose: string },
    text: string,
    wholeWord = false
  ) => {
    if (wholeWord) {
      return new RegExp(`(^|[^A-Z0-9])${escapeRegExp(text)}([^A-Z0-9]|$)`).test(
        pageText.strict
      );
    }
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
  const ensurePageItems = async (pageNumber: number) => {
    if (pageItemsByNumber.has(pageNumber)) {
      return pageItemsByNumber.get(pageNumber)!;
    }
    const pageItems = await extractPageItems(doc, pageNumber);
    pageItemsByNumber.set(pageNumber, pageItems);
    return pageItems;
  };

  for (const rule of DETECTION_RULES) {
    const requirements: DetectionRequirement[] =
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
          if (
            pageContainsText(
              normalizedPageText,
              requirement.text,
              requirement.wholeWord
            )
          ) {
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
      if (
        !pageContainsText(
          normalizedPageText,
          requirement.text,
          requirement.wholeWord
        )
      ) {
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

  if (await looksLikeOldMaxdomov3Layout(doc, ensurePageItems)) {
    return {
      product: "maxdomov",
      confidence: "high",
      reason:
        "PDF odpovídá staršímu formuláři MAXDOMOV 3 podle vyplněných polí.",
    };
  }

  return null;
}
