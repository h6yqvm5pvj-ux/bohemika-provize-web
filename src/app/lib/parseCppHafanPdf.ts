// src/app/lib/parseCppHafanPdf.ts
import { type PaymentFrequency } from "../types/domain";

export type CppHafanPdfResult = {
  contractNumber?: string | null;
  clientName?: string | null;
  policyStartDate?: string | null;
  contractSignedDate?: string | null;
  amount?: number | null;
  frequency?: PaymentFrequency | null;
};

type PositionedTextItem = {
  str: string;
  normalized: string;
  x: number;
  y: number;
  width: number;
  pageNumber: number;
};

const ROW_Y_TOLERANCE = 3;

const stripDiacritics = (text: string) =>
  text.normalize("NFD").replace(/\p{Diacritic}/gu, "");

const normalizeText = (text: string) =>
  stripDiacritics(text).toLowerCase().replace(/\s+/g, " ").trim();

const toDateInput = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const match = value.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  if (!match) return null;
  const [, dayRaw, monthRaw, yearRaw] = match;
  const day = Number(dayRaw);
  const month = Number(monthRaw);
  const year = Number(yearRaw);
  if (!day || !month || !year) return null;
  return `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
};

const extractDateToken = (value: string | null | undefined): string | null =>
  value?.match(/\b\d{1,2}\.\s*\d{1,2}\.\s*\d{4}\b/)?.[0] ?? null;

const parseAmount = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const amountMatch = value.replace(/\u00A0/g, " ").match(/(\d[\d\s]*(?:[.,]\d+)?)/)?.[1];
  if (!amountMatch) return null;
  const normalized = amountMatch.replace(/\s+/g, "").replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
};

const mapFrequency = (value: string | null | undefined): PaymentFrequency | null => {
  if (!value) return null;
  const normalized = normalizeText(value);
  if (normalized.includes("ctvrtlet")) return "quarterly";
  if (normalized.includes("pololet") || normalized.includes("pulroc")) return "semiannual";
  if (normalized.includes("mesic")) return "monthly";
  if (normalized.includes("rocni")) return "annual";
  return null;
};

const normalizeName = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const cleaned = value
    .replace(/\s+/g, " ")
    .replace(/^[\s:;,\-–—]+|[\s:;,\-–—]+$/g, "")
    .trim();
  if (!cleaned || cleaned.length < 3) return null;
  if (!/[A-Za-zÀ-ž]/.test(cleaned)) return null;
  if (/rodn[eé]\s+[čc]?[íi]slo/i.test(cleaned)) return null;
  return cleaned;
};

const extractContractNumber = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const digits = value.replace(/\D+/g, "");
  return digits.length >= 6 && digits.length <= 14 ? digits : null;
};

const sortItems = (items: PositionedTextItem[]) =>
  items.sort((a, b) => {
    if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
    if (Math.abs(a.y - b.y) > ROW_Y_TOLERANCE) return b.y - a.y;
    return a.x - b.x;
  });

async function extractPositionedItems(doc: any): Promise<PositionedTextItem[]> {
  const items: PositionedTextItem[] = [];

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const rawItems = (content?.items ?? []) as Array<{
      str?: unknown;
      transform?: number[];
      width?: number;
    }>;

    rawItems.forEach((item) => {
      const str = typeof item?.str === "string" ? item.str.replace(/\s+/g, " ").trim() : "";
      if (!str) return;
      items.push({
        str,
        normalized: normalizeText(str),
        x: item?.transform?.[4] ?? 0,
        y: item?.transform?.[5] ?? 0,
        width: item?.width ?? 0,
        pageNumber,
      });
    });
  }

  return sortItems(items);
}

const findLabelItems = (
  items: PositionedTextItem[],
  matcher: (item: PositionedTextItem) => boolean
) => items.filter(matcher);

const findRightValue = (
  items: PositionedTextItem[],
  labelMatcher: (item: PositionedTextItem) => boolean,
  accept: (item: PositionedTextItem) => boolean
): string | null => {
  for (const label of findLabelItems(items, labelMatcher)) {
    const candidates = items
      .filter(
        (item) =>
          item.pageNumber === label.pageNumber &&
          Math.abs(item.y - label.y) <= ROW_Y_TOLERANCE &&
          item.x > label.x + Math.max(label.width, 8)
      )
      .sort((a, b) => a.x - b.x);

    const value = candidates.find(accept);
    if (value) return value.str;
  }

  return null;
};

const findContractNumber = (items: PositionedTextItem[]): string | null => {
  const contractLabel = (item: PositionedTextItem) =>
    item.normalized === "cislo nabidky pojistne smlouvy" ||
    item.normalized === "cislo pojistne smlouvy";

  for (const label of findLabelItems(items, contractLabel)) {
    const sameOrLowerCandidates = items
      .filter(
        (item) =>
          item.pageNumber === label.pageNumber &&
          item.y <= label.y + ROW_Y_TOLERANCE &&
          label.y - item.y <= 45 &&
          item.x >= label.x - 80 &&
          item.x <= label.x + 180
      )
      .sort((a, b) => {
        if (Math.abs(a.y - b.y) > ROW_Y_TOLERANCE) return b.y - a.y;
        return a.x - b.x;
      });

    for (const candidate of sameOrLowerCandidates) {
      const contractNumber = extractContractNumber(candidate.str);
      if (contractNumber) return contractNumber;
    }

    const labelIndex = items.indexOf(label);
    for (let offset = 1; offset <= 10; offset += 1) {
      const candidate = items[labelIndex + offset];
      if (!candidate || candidate.pageNumber !== label.pageNumber) break;
      const contractNumber = extractContractNumber(candidate.str);
      if (contractNumber) return contractNumber;
    }
  }

  return null;
};

const findClientName = (items: PositionedTextItem[]): string | null => {
  const sectionIndex = items.findIndex((item) => item.normalized === "pojistnik");
  const searchItems =
    sectionIndex >= 0
      ? items.slice(sectionIndex + 1).filter((item) => {
          if (item.pageNumber !== items[sectionIndex].pageNumber) return false;
          if (/^pojisteny\b/.test(item.normalized) || /^misto chovu\b/.test(item.normalized)) {
            return false;
          }
          return true;
        })
      : items;

  const value = findRightValue(
    searchItems,
    (item) => item.normalized === "jmeno a prijmeni",
    (item) => normalizeName(item.str) !== null
  );

  return normalizeName(value);
};

export async function parseCppHafanPdf(file: File): Promise<CppHafanPdfResult> {
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
  const items = await extractPositionedItems(doc);
  const fullText = items.map((item) => item.str).join("\n");
  const fullTextAscii = stripDiacritics(fullText);
  const result: CppHafanPdfResult = {};

  const contractNumber =
    findContractNumber(items) ??
    fullTextAscii.match(
      /Cislo\s+(?:nabidky\s+)?pojistne\s+smlouvy[\s\S]{0,120}?(\d{6,14})/i
    )?.[1] ??
    null;
  if (contractNumber) result.contractNumber = contractNumber;

  const clientName =
    findClientName(items) ??
    normalizeName(
      fullText.match(/POJISTNÍK[\s\S]{0,240}?Jméno\s+a\s+příjmení\s+(.+?)\s+Rodné\s+číslo/i)?.[1] ??
        fullTextAscii.match(/POJISTNIK[\s\S]{0,240}?Jmeno\s+a\s+prijmeni\s+(.+?)\s+Rodne\s+cislo/i)?.[1] ??
        null
    );
  if (clientName) result.clientName = clientName;

  const policyStartRaw = findRightValue(
    items,
    (item) => item.normalized === "pocatek pojisteni",
    (item) => extractDateToken(item.str) !== null
  );
  const policyStartDate = toDateInput(extractDateToken(policyStartRaw));
  if (policyStartDate) result.policyStartDate = policyStartDate;

  const signedRaw =
    items.find((item) => item.normalized.includes("nabidka vytvorena dne"))?.str ??
    fullTextAscii.match(/Nabidka\s+vytvorena\s+dne:?\s*(\d{1,2}\.\s*\d{1,2}\.\s*\d{4})/i)?.[1] ??
    null;
  const contractSignedDate = toDateInput(extractDateToken(signedRaw));
  if (contractSignedDate) result.contractSignedDate = contractSignedDate;

  const frequencyRaw = findRightValue(
    items,
    (item) => item.normalized === "frekvence splatek pojistneho",
    (item) => mapFrequency(item.str) !== null
  );
  const frequency = mapFrequency(frequencyRaw);
  if (frequency) result.frequency = frequency;

  const amountRaw = findRightValue(
    items,
    (item) => item.normalized === "vyse platby",
    (item) => parseAmount(item.str) !== null
  );
  const amount = parseAmount(amountRaw);
  if (amount != null && amount > 0) result.amount = amount;

  return result;
}
