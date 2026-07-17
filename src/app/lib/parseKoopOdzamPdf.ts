import { type PaymentFrequency } from "../types/domain";

export type KoopOdzamPdfResult = {
  contractNumber?: string | null;
  clientName?: string | null;
  policyStartDate?: string | null;
  contractSignedDate?: string | null;
  amount?: number | null;
  frequency?: PaymentFrequency | null;
  annualAmount?: number | null;
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

const extractContractNumber = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const digits = value.replace(/\D+/g, "");
  return digits.length >= 6 && digits.length <= 14 ? digits : null;
};

const parseAmount = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const normalized = value.replace(/\u00A0/g, " ");
  const match = normalized.match(/(\d[\d\s]*(?:[.,]\d+)?)(?:\s*K[čc])?/i)?.[1];
  if (!match) return null;
  const parsed = Number.parseFloat(match.replace(/\s+/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
};

const normalizeName = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const cleaned = value
    .replace(/\s+/g, " ")
    .replace(/^[\s:;,\-–—]+|[\s:;,\-–—]+$/g, "")
    .trim();
  if (!cleaned || cleaned.length < 3) return null;
  if (!/[A-Za-zÀ-ž]/.test(cleaned)) return null;
  return cleaned;
};

const mapFrequency = (value: string | null | undefined): PaymentFrequency | null => {
  if (!value) return null;
  const normalized = normalizeText(value);
  const monthMatch = normalized.match(/(\d+)\s*mesic/);
  if (monthMatch) {
    const months = Number(monthMatch[1]);
    if (months === 1) return "monthly";
    if (months === 3) return "quarterly";
    if (months === 6) return "semiannual";
    if (months === 12) return "annual";
  }
  const yearMatch = normalized.match(/(\d+)\s*rok/);
  if (yearMatch && Number(yearMatch[1]) === 1) return "annual";
  if (normalized.includes("mesic")) return "monthly";
  if (normalized.includes("ctvrtlet")) return "quarterly";
  if (normalized.includes("pololet")) return "semiannual";
  if (normalized.includes("rocni") || normalized.includes("rocne")) return "annual";
  return null;
};

const paymentsPerYear = (frequency: PaymentFrequency): number => {
  switch (frequency) {
    case "monthly":
      return 12;
    case "quarterly":
      return 4;
    case "semiannual":
      return 2;
    case "annual":
      return 1;
  }
};

const frequencyFromAmounts = (
  periodAmount: number | null,
  annualAmount: number | null
): PaymentFrequency | null => {
  if (!periodAmount || !annualAmount) return null;
  const ratio = annualAmount / periodAmount;
  if (Math.abs(ratio - 12) <= 0.25) return "monthly";
  if (Math.abs(ratio - 4) <= 0.25) return "quarterly";
  if (Math.abs(ratio - 2) <= 0.25) return "semiannual";
  if (Math.abs(ratio - 1) <= 0.25) return "annual";
  return null;
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

const findBelowValue = (
  items: PositionedTextItem[],
  labelMatcher: (item: PositionedTextItem) => boolean,
  accept: (item: PositionedTextItem) => boolean
): string | null => {
  for (const label of findLabelItems(items, labelMatcher)) {
    const candidates = items
      .filter(
        (item) =>
          item.pageNumber === label.pageNumber &&
          item.y < label.y - ROW_Y_TOLERANCE &&
          label.y - item.y <= 45 &&
          item.x >= label.x - 15 &&
          item.x <= label.x + 180
      )
      .sort((a, b) => {
        if (Math.abs(a.y - b.y) > ROW_Y_TOLERANCE) return b.y - a.y;
        return a.x - b.x;
      });

    const value = candidates.find(accept);
    if (value) return value.str;
  }

  return null;
};

const findContractNumber = (items: PositionedTextItem[]): string | null =>
  findBelowValue(
    items,
    (item) => item.pageNumber === 1 && item.normalized === "cislo pojistne smlouvy",
    (item) => extractContractNumber(item.str) !== null
  ) ?? null;

const findClientName = (items: PositionedTextItem[]): string | null => {
  const sectionIndex = items.findIndex((item) => item.normalized === "pojistnik");
  const searchItems =
    sectionIndex >= 0
      ? items.slice(sectionIndex + 1).filter((item) => {
          if (item.pageNumber !== items[sectionIndex].pageNumber) return false;
          if (/^pojisteny\b/.test(item.normalized)) return false;
          return true;
        })
      : items;

  const value = findRightValue(
    searchItems,
    (item) => item.normalized === "titul, jmeno, prijmeni",
    (item) => normalizeName(item.str) !== null
  );

  return normalizeName(value);
};

export async function parseKoopOdzamPdf(file: File): Promise<KoopOdzamPdfResult> {
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
  const result: KoopOdzamPdfResult = {};

  const contractNumber =
    findContractNumber(items) ??
    fullTextAscii.match(/Cislo\s+pojistne\s+smlouvy[\s\S]{0,80}?(\d{6,14})/i)?.[1] ??
    null;
  if (contractNumber) result.contractNumber = contractNumber;

  const clientName =
    findClientName(items) ??
    normalizeName(
      fullText.match(/Pojistník[\s\S]{0,160}?Titul,\s*jméno,\s*příjmení\s+(.+?)\s+Datum narození/i)?.[1] ??
        fullTextAscii.match(/Pojistnik[\s\S]{0,160}?Titul,\s*jmeno,\s*prijmeni\s+(.+?)\s+Datum narozeni/i)?.[1] ??
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

  const frequencyRaw = findRightValue(
    items,
    (item) => item.normalized === "pojistne obdobi",
    (item) => mapFrequency(item.str) !== null
  );

  const annualRaw = findRightValue(
    items,
    (item) => item.normalized === "celkove rocni pojistne",
    (item) => parseAmount(item.str) !== null
  );
  const annualAmount = parseAmount(annualRaw);
  if (annualAmount != null && annualAmount > 0) result.annualAmount = annualAmount;

  const periodRaw = findRightValue(
    items,
    (item) => item.normalized === "pojistne za pojistne obdobi",
    (item) => parseAmount(item.str) !== null
  );
  const amount = parseAmount(periodRaw);
  if (amount != null && amount > 0) result.amount = amount;

  const frequency = mapFrequency(frequencyRaw) ?? frequencyFromAmounts(amount, annualAmount);
  if (frequency) result.frequency = frequency;

  if (amount != null && annualAmount != null && frequency) {
    const expectedAnnual = amount * paymentsPerYear(frequency);
    if (Math.abs(expectedAnnual - annualAmount) > Math.max(5, annualAmount * 0.01)) {
      const amountFrequency = frequencyFromAmounts(amount, annualAmount);
      if (amountFrequency) result.frequency = amountFrequency;
    }
  }

  const signedRaw = findRightValue(
    items,
    (item) => item.normalized === "pojistna smlouva uzavrena dne",
    (item) => extractDateToken(item.str) !== null
  );
  const contractSignedDate =
    toDateInput(extractDateToken(signedRaw)) ??
    toDateInput(
      fullTextAscii.match(
        /Pojistna\s+smlouva\s+uzavrena\s+dne[\s\S]{0,80}?(\d{1,2}\.\s*\d{1,2}\.\s*\d{4})/i
      )?.[1] ?? null
    );
  if (contractSignedDate) result.contractSignedDate = contractSignedDate;

  return result;
}
