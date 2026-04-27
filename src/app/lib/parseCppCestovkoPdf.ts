// src/app/lib/parseCppCestovkoPdf.ts
import { type PaymentFrequency } from "../types/domain";

export type CppCestovkoPdfResult = {
  contractNumber?: string | null;
  clientName?: string | null;
  policyStartDate?: string | null;
  policyEndDate?: string | null;
  contractSignedDate?: string | null;
  amount?: number | null;
  frequency?: PaymentFrequency | null;
};

const stripDiacritics = (text: string) =>
  text.normalize("NFD").replace(/\p{Diacritic}/gu, "");

const normalizeAscii = (text: string) => stripDiacritics(text).toLowerCase();

const toDateInput = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const m = value.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  if (!m) return null;
  const [, dRaw, mRaw, yRaw] = m;
  const d = Number(dRaw);
  const mm = Number(mRaw);
  const y = Number(yRaw);
  if (!d || !mm || !y) return null;
  return `${y.toString().padStart(4, "0")}-${mm
    .toString()
    .padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
};

const parseAmount = (val: string | null | undefined): number | null => {
  if (!val) return null;
  const cleaned = val.replace(/\s+/g, "").replace(",", ".").trim();
  const num = Number.parseFloat(cleaned);
  return Number.isFinite(num) ? Math.round(num) : null;
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

const extractDateToken = (value: string | null | undefined): string | null =>
  value?.match(/\b\d{1,2}\.\d{1,2}\.\d{4}\b/)?.[0] ?? null;

const extractInlineAfterColon = (value: string): string | null => {
  const idx = value.indexOf(":");
  if (idx < 0) return null;
  const tail = value.slice(idx + 1).trim();
  return tail || null;
};

const findSectionEndIndex = (
  asciiLines: string[],
  startIdx: number,
  endPatterns: RegExp[]
): number => {
  for (let i = startIdx + 1; i < asciiLines.length; i += 1) {
    if (endPatterns.some((pattern) => pattern.test(asciiLines[i] ?? ""))) {
      return i - 1;
    }
  }
  return asciiLines.length - 1;
};

const findFirstIndex = (asciiLines: string[], pattern: RegExp): number =>
  asciiLines.findIndex((line) => pattern.test(line));

const readValueAfterLabel = (
  lines: string[],
  asciiLines: string[],
  labelPattern: RegExp,
  rangeStart = 0,
  rangeEnd = asciiLines.length - 1,
  lookahead = 8
): string | null => {
  for (let i = rangeStart; i <= rangeEnd; i += 1) {
    const lineAscii = asciiLines[i] ?? "";
    if (!labelPattern.test(lineAscii)) continue;

    const inline = extractInlineAfterColon(lines[i] ?? "");
    if (inline) return inline;

    const sameLineDate = extractDateToken(lines[i] ?? "");
    if (sameLineDate) return sameLineDate;

    const sameLineAmount = (lines[i] ?? "").match(/([0-9][0-9\s]+(?:[.,][0-9]+)?)/)?.[1];
    if (sameLineAmount) return sameLineAmount;

    for (let step = 1; step <= lookahead; step += 1) {
      const nextIndex = i + step;
      if (nextIndex > rangeEnd) break;
      const nextLine = (lines[nextIndex] ?? "").trim();
      if (!nextLine) continue;
      if (labelPattern.test(asciiLines[nextIndex] ?? "")) continue;
      return nextLine;
    }
  }
  return null;
};

const pickContractNumberAroundHeading = (
  lines: string[],
  asciiLines: string[]
): string | null => {
  const labelPatterns = [
    /cislo navrhu pojistne smlouvy/i,
    /cislo pojistne smlouvy/i,
  ];

  for (const labelPattern of labelPatterns) {
    const startIdx = findFirstIndex(asciiLines, labelPattern);
    if (startIdx < 0) continue;

    for (let step = 0; step <= 8; step += 1) {
      const candidateLine = lines[startIdx + step] ?? "";
      const num = candidateLine.match(/\b(\d{6,14})\b/)?.[1] ?? null;
      if (num) return num;
    }
  }

  return null;
};

export async function parseCppCestovkoPdf(file: File): Promise<CppCestovkoPdfResult> {
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
  const pagesText: string[] = [];

  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item: any) => (typeof item?.str === "string" ? item.str : ""))
      .filter(Boolean)
      .join("\n");
    pagesText.push(text);
  }

  const fullText = pagesText.join("\n");
  const lines = fullText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const asciiLines = lines.map((line) => normalizeAscii(line));

  const result: CppCestovkoPdfResult = {
    frequency: "annual",
  };

  // Číslo smlouvy: z rámečku pod "Číslo návrhu pojistné smlouvy" nebo "Číslo pojistné smlouvy".
  const pageOneLines = (pagesText[0] ?? "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const pageOneAsciiLines = pageOneLines.map((line) => normalizeAscii(line));
  const headingContract = pickContractNumberAroundHeading(pageOneLines, pageOneAsciiLines);
  if (headingContract) {
    result.contractNumber = headingContract;
  } else {
    const fallbackByLabel =
      fullText.match(
        /c[íi]slo\s+(?:n[áa]vrhu\s+)?pojistn[eé]\s+smlouvy[\s\S]{0,100}?(\d{6,14})/i
      )?.[1] ??
      null;
    if (fallbackByLabel) {
      result.contractNumber = fallbackByLabel;
    }
  }

  // Jméno klienta: sekce POJISTNÍK -> Jméno a příjmení.
  const pojistnikStart = findFirstIndex(asciiLines, /^pojistnik$/i);
  if (pojistnikStart >= 0) {
    const pojistnikEnd = findSectionEndIndex(asciiLines, pojistnikStart, [
      /^pojisteny$/i,
      /^informace o pojisteni$/i,
    ]);
    const nameRaw = readValueAfterLabel(
      lines,
      asciiLines,
      /jmeno a prijmeni/i,
      pojistnikStart,
      pojistnikEnd,
      8
    );
    const normalized = normalizeName(nameRaw);
    if (normalized) result.clientName = normalized;
  }

  // Datum počátku + datum konce: sekce INFORMACE O POJIŠTĚNÍ.
  const infoStart = findFirstIndex(asciiLines, /^informace o pojisteni$/i);
  if (infoStart >= 0) {
    const infoEnd = findSectionEndIndex(asciiLines, infoStart, [
      /^pobytova cesta/i,
      /^spolecna ustanoveni$/i,
      /^zpracovani osobnich udaju$/i,
      /^zaverecna ustanoveni$/i,
      /tisk sus plus ws/i,
    ]);

    const startRaw = readValueAfterLabel(
      lines,
      asciiLines,
      /pocatek pojisteni/i,
      infoStart,
      infoEnd,
      6
    );
    const startIso = toDateInput(extractDateToken(startRaw));
    if (startIso) result.policyStartDate = startIso;

    const endRaw = readValueAfterLabel(
      lines,
      asciiLines,
      /konec pojisteni/i,
      infoStart,
      infoEnd,
      6
    );
    const endIso = toDateInput(extractDateToken(endRaw));
    if (endIso) result.policyEndDate = endIso;
  }

  // Datum sjednání: "Tisk SUS Plus WS, dd.mm.yyyy hh:mm" (na stránkách dole vpravo).
  const signedRaw =
    fullText.match(/Tisk\s+SUS\s+Plus\s+WS,\s*(\d{1,2}\.\d{1,2}\.\d{4})\s+\d{1,2}:\d{2}/i)?.[1] ??
    null;
  const signedIso = toDateInput(signedRaw);
  if (signedIso) result.contractSignedDate = signedIso;

  // Jednorázové pojistné: "Výše platby".
  const amountStart = findFirstIndex(asciiLines, /^spolecna ustanoveni$/i);
  const amountRaw = readValueAfterLabel(
    lines,
    asciiLines,
    /vyse platby/i,
    amountStart >= 0 ? amountStart : 0,
    asciiLines.length - 1,
    8
  );
  const parsedAmount = parseAmount(amountRaw);
  if (parsedAmount != null && parsedAmount > 0) {
    result.amount = parsedAmount;
  } else {
    const fallbackAmount =
      parseAmount(fullText.match(/vyse\s+platby[^\d]{0,30}([\d\s]+(?:[.,]\d{1,2})?)/i)?.[1]) ??
      parseAmount(fullText.match(/castka\s+k\s+uhrade[^\d]{0,30}([\d\s]+(?:[.,]\d{1,2})?)/i)?.[1]);
    if (fallbackAmount != null && fallbackAmount > 0) {
      result.amount = fallbackAmount;
    }
  }

  return result;
}
