import { type PaymentFrequency } from "../types/domain";

export type KooperativaCestovkoPdfResult = {
  contractNumber?: string | null;
  clientName?: string | null;
  policyStartDate?: string | null;
  policyEndDate?: string | null;
  contractSignedDate?: string | null;
  amount?: number | null;
  frequency?: PaymentFrequency | null;
};

type PositionedTextItem = {
  page: number;
  text: string;
  x: number;
  y: number;
  width: number;
};

const stripDiacritics = (text: string) =>
  text.normalize("NFD").replace(/\p{Diacritic}/gu, "");

const normalizeAscii = (text: string) =>
  stripDiacritics(text).toLowerCase().replace(/\s+/g, " ").trim();

const extractDateToken = (value: string | null | undefined): string | null =>
  value?.match(/\b\d{1,2}\.\s*\d{1,2}\.\s*\d{4}\b/)?.[0] ?? null;

const toDateInput = (value: string | null | undefined): string | null => {
  const match = extractDateToken(value)?.match(
    /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/
  );
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
};

const parseCzkAmount = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const match = value.match(
    /([0-9][0-9\s\u00a0]*(?:[.,][0-9]{1,2})?)\s*(?:,-\s*)?(?:K[čc]|CZK)(?=$|\s|[.,;])/i
  );
  if (!match?.[1]) return null;

  const parsed = Number.parseFloat(
    match[1].replace(/[\s\u00a0]+/g, "").replace(",", ".")
  );
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
};

const normalizeName = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const cleaned = value
    .replace(/\s+/g, " ")
    .replace(/^[\s:;,\-–—]+|[\s:;,\-–—]+$/g, "")
    .trim();
  if (!cleaned || /\d/.test(cleaned)) return null;

  const wordCount = cleaned
    .split(/\s+/)
    .filter((word) => /[A-Za-zÀ-ž]/.test(word)).length;
  return wordCount >= 2 ? cleaned : null;
};

const findSectionRange = (
  asciiLines: string[],
  heading: RegExp,
  endHeadings: RegExp[]
): { start: number; end: number } | null => {
  const start = asciiLines.findIndex((line) => heading.test(line));
  if (start < 0) return null;

  for (let index = start + 1; index < asciiLines.length; index += 1) {
    if (endHeadings.some((pattern) => pattern.test(asciiLines[index] ?? ""))) {
      return { start, end: index - 1 };
    }
  }

  return { start, end: asciiLines.length - 1 };
};

const readValueToRight = <T>(
  items: PositionedTextItem[],
  labelItem: PositionedTextItem,
  parse: (value: string) => T | null
): T | null => {
  const candidates = items
    .filter(
      (item) =>
        item.page === labelItem.page &&
        item.x >= labelItem.x + labelItem.width - 2 &&
        Math.abs(item.y - labelItem.y) <= 3
    )
    .sort((left, right) => left.x - right.x);

  for (const candidate of candidates) {
    const parsed = parse(candidate.text);
    if (parsed != null) return parsed;
  }
  return null;
};

const pickContractNumber = (lines: string[], asciiLines: string[]): string | null => {
  const labelPatterns = [
    /^cislo navrhu\b/i,
    /^navrh pojistne smlouvy c\.?\b/i,
  ];

  for (let index = 0; index < asciiLines.length; index += 1) {
    if (!labelPatterns.some((pattern) => pattern.test(asciiLines[index] ?? ""))) {
      continue;
    }

    for (let step = 0; step <= 5; step += 1) {
      const number = (lines[index + step] ?? "").match(/\b(\d{6,14})\b/)?.[1];
      if (number) return number;
    }
  }

  return null;
};

const pickPolicyholderName = (
  items: PositionedTextItem[],
  lines: string[],
  asciiLines: string[]
): string | null => {
  const section = findSectionRange(asciiLines, /^pojistnik$/i, [
    /^pojistene osoby$/i,
    /^udaje o pojisteni$/i,
  ]);
  if (!section) return null;

  for (let index = section.start; index <= section.end; index += 1) {
    if (!/^titul,?\s*jmeno,?\s*prijmeni\b/i.test(asciiLines[index] ?? "")) {
      continue;
    }

    const rightValue = readValueToRight(items, items[index]!, normalizeName);
    if (rightValue) return rightValue;

    for (let step = 1; step <= 5 && index + step <= section.end; step += 1) {
      const value = normalizeName(lines[index + step]);
      if (value) return value;
    }
  }

  return null;
};

const pickDateByLabel = (
  items: PositionedTextItem[],
  lines: string[],
  asciiLines: string[],
  label: RegExp,
  rangeStart = 0,
  rangeEnd = asciiLines.length - 1
): string | null => {
  for (let index = rangeStart; index <= rangeEnd; index += 1) {
    if (!label.test(asciiLines[index] ?? "")) continue;

    const inlineDate = toDateInput(lines[index]);
    if (inlineDate) return inlineDate;

    const rightDate = readValueToRight(items, items[index]!, toDateInput);
    if (rightDate) return rightDate;

    for (let step = 1; step <= 6 && index + step <= rangeEnd; step += 1) {
      const date = toDateInput(lines[index + step]);
      if (date) return date;
    }
  }

  return null;
};

const pickPremiumByLabel = (
  items: PositionedTextItem[],
  lines: string[],
  asciiLines: string[],
  labelIndex: number,
  rangeEnd: number
): number | null => {
  const inlineAmount = parseCzkAmount(lines[labelIndex]);
  if (inlineAmount != null) return inlineAmount;

  const rightAmount = readValueToRight(items, items[labelIndex]!, parseCzkAmount);
  if (rightAmount != null) return rightAmount;

  for (let step = 1; step <= 5 && labelIndex + step <= rangeEnd; step += 1) {
    const amount = parseCzkAmount(lines[labelIndex + step]);
    if (amount != null) return amount;
  }

  return null;
};

const pickDiscountedPremium = (
  items: PositionedTextItem[],
  lines: string[],
  asciiLines: string[]
): number | null => {
  const section = findSectionRange(asciiLines, /^udaje o pojistnem$/i, [
    /^cekaci doba$/i,
    /^prohlaseni pojistnika$/i,
  ]);
  const start = section?.start ?? 0;
  const end = section?.end ?? asciiLines.length - 1;

  for (let index = start; index <= end; index += 1) {
    const line = asciiLines[index] ?? "";
    if (!/^celkove jednorazove pojistne\b/i.test(line)) continue;

    let isDiscountedLabel = /po sleve\b/i.test(line);
    for (let step = 1; !isDiscountedLabel && step <= 3; step += 1) {
      const candidate = asciiLines[index + step] ?? "";
      if (/^celkove jednorazove pojistne\b/i.test(candidate)) break;
      if (/^po sleve\b/i.test(candidate)) isDiscountedLabel = true;
    }
    if (!isDiscountedLabel) continue;

    const amount = pickPremiumByLabel(items, lines, asciiLines, index, end);
    if (amount != null && amount > 0) return amount;
  }

  // U dokumentů bez samostatně čitelného řádku „po slevě“ je částka k úhradě
  // spolehlivá náhradní hodnota jednorázového pojistného po slevě.
  for (let index = start; index <= end; index += 1) {
    if (!/^castka k uhrade\b/i.test(asciiLines[index] ?? "")) continue;
    const amount = pickPremiumByLabel(items, lines, asciiLines, index, end);
    if (amount != null && amount > 0) return amount;
  }

  return null;
};

export async function parseKooperativaCestovkoPdf(
  file: File
): Promise<KooperativaCestovkoPdfResult> {
  const buffer = await file.arrayBuffer();
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

  if (typeof window !== "undefined" && pdfjsLib.GlobalWorkerOptions) {
    try {
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      }
    } catch (error) {
      console.warn("PDF worker src nebylo možné nastavit", error);
    }
  }

  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const items: PositionedTextItem[] = [];

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    for (const rawItem of content.items ?? []) {
      if (!("str" in rawItem) || typeof rawItem.str !== "string") continue;
      const text = rawItem.str.trim();
      if (!text) continue;
      items.push({
        page: pageNumber,
        text,
        x: rawItem.transform?.[4] ?? 0,
        y: rawItem.transform?.[5] ?? 0,
        width: rawItem.width ?? 0,
      });
    }
  }

  const lines = items.map((item) => item.text);
  const asciiLines = lines.map((line) => normalizeAscii(line));
  const durationSection = findSectionRange(
    asciiLines,
    /^doba trvani pojisteni,?\s*pojistne obdobi$/i,
    [/^udaje o pojistnem$/i]
  );
  const signedSection = findSectionRange(
    asciiLines,
    /^uzavreni pojistne smlouvy$/i,
    [/^hlaseni skody$/i]
  );

  return {
    contractNumber: pickContractNumber(lines, asciiLines),
    clientName: pickPolicyholderName(items, lines, asciiLines),
    policyStartDate: pickDateByLabel(
      items,
      lines,
      asciiLines,
      /^pocatek pojisteni\b/i,
      durationSection?.start,
      durationSection?.end
    ),
    policyEndDate: pickDateByLabel(
      items,
      lines,
      asciiLines,
      /^konec pojisteni\b/i,
      durationSection?.start,
      durationSection?.end
    ),
    contractSignedDate: pickDateByLabel(
      items,
      lines,
      asciiLines,
      /^termin pro prijeti navrhu pojistne smlouvy pojistnikem\b/i,
      signedSection?.start,
      signedSection?.end
    ),
    amount: pickDiscountedPremium(items, lines, asciiLines),
    frequency: "annual",
  };
}
