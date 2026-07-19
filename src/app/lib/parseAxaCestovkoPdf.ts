// src/app/lib/parseAxaCestovkoPdf.ts
import { type PaymentFrequency } from "../types/domain";

export type AxaCestovkoPdfResult = {
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

const normalizeAscii = (text: string) =>
  stripDiacritics(text).toLowerCase().replace(/\s+/g, " ").trim();

const toDateInput = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const match = value.match(/\b(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\b/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (!day || !month || !year) return null;

  return `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
};

const parseAmount = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const match = value.match(
    /([0-9][0-9\s]*(?:[.,][0-9]{1,2})?)\s*(?:,-)?\s*(?:k[cč]|czk)/i
  );
  const source = match?.[1] ?? value;
  const normalized = source.replace(/\s+/g, "").replace(",", ".").trim();
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
};

const extractDateToken = (value: string | null | undefined): string | null =>
  value?.match(/\b\d{1,2}\.\s*\d{1,2}\.\s*\d{4}\b/)?.[0] ?? null;

const normalizeName = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const cleaned = value
    .replace(/\s+/g, " ")
    .replace(/^[\s:;,\-–—]+|[\s:;,\-–—]+$/g, "")
    .trim();
  if (!cleaned || cleaned.length < 3) return null;
  if (!/[A-Za-zÀ-ž]/.test(cleaned)) return null;

  if (cleaned.includes(",")) {
    const [surnameRaw, ...givenParts] = cleaned.split(",");
    const surname = surnameRaw.trim();
    const givenNames = givenParts.join(" ").trim();
    if (surname && givenNames) {
      return `${givenNames} ${surname}`.replace(/\s+/g, " ").trim();
    }
  }

  return cleaned;
};

const findFirstIndex = (asciiLines: string[], pattern: RegExp): number =>
  asciiLines.findIndex((line) => pattern.test(line));

const findNextDate = (
  lines: string[],
  startIndex: number,
  lookahead: number
): string | null => {
  for (let index = startIndex; index <= startIndex + lookahead; index += 1) {
    const token = extractDateToken(lines[index] ?? "");
    if (token) return token;
  }
  return null;
};

const pickContractNumber = (lines: string[], asciiLines: string[]): string | null => {
  const labelIndex = findFirstIndex(asciiLines, /^cislo pojistne smlouvy:?$/i);
  if (labelIndex < 0) return null;

  for (let step = 1; step <= 10; step += 1) {
    const candidate = lines[labelIndex + step] ?? "";
    const match = candidate.match(/\b(\d{6,14})\b/);
    if (match?.[1]) return match[1];
  }

  return null;
};

const pickPolicyholderName = (
  lines: string[],
  asciiLines: string[]
): string | null => {
  const sectionStart = findFirstIndex(asciiLines, /^pojistnik\b/i);
  if (sectionStart < 0) return null;

  const labelIndex = asciiLines.findIndex(
    (line, index) =>
      index > sectionStart &&
      index <= sectionStart + 20 &&
      /prijmeni,\s*jmeno\s*\/\s*nazev spolecnosti/i.test(line)
  );
  if (labelIndex < 0) return null;

  for (let step = 1; step <= 12; step += 1) {
    const candidate = (lines[labelIndex + step] ?? "").trim();
    const candidateAscii = asciiLines[labelIndex + step] ?? "";
    if (!candidate) continue;
    if (/name and surname|company name|rodne cislo|datum narozeni|personal id/i.test(candidateAscii)) {
      continue;
    }
    const normalized = normalizeName(candidate);
    if (normalized) return normalized;
  }

  return null;
};

const pickTravelPeriod = (
  lines: string[],
  asciiLines: string[]
): { start: string | null; end: string | null } => {
  const travelIndex = asciiLines.findIndex((line) => line === "cestovni pojisteni");
  if (travelIndex < 0) return { start: null, end: null };

  const dates: string[] = [];
  for (let step = 1; step <= 24; step += 1) {
    const line = lines[travelIndex + step] ?? "";
    const token = extractDateToken(line);
    if (token) {
      dates.push(token);
      if (dates.length >= 2) break;
    }
  }

  return {
    start: toDateInput(dates[0]),
    end: toDateInput(dates[1]),
  };
};

const pickSignedDate = (lines: string[], asciiLines: string[]): string | null => {
  const labelIndex = findFirstIndex(asciiLines, /pojistna smlouva byla uzavrena/i);
  if (labelIndex < 0) return null;
  return toDateInput(findNextDate(lines, labelIndex, 10));
};

const pickTotalPremium = (lines: string[], asciiLines: string[]): number | null => {
  const labelIndex = findFirstIndex(asciiLines, /^celkove pojistne$/i);
  if (labelIndex < 0) return null;

  for (let step = 0; step <= 10; step += 1) {
    const amount = parseAmount(lines[labelIndex + step] ?? "");
    if (amount != null && amount > 0) return amount;
  }

  return null;
};

export async function parseAxaCestovkoPdf(file: File): Promise<AxaCestovkoPdfResult> {
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

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item: any) => (typeof item?.str === "string" ? item.str : ""))
      .filter(Boolean)
      .join("\n");
    pagesText.push(text);
  }

  const lines = pagesText
    .join("\n")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const asciiLines = lines.map((line) => normalizeAscii(line));

  const travelPeriod = pickTravelPeriod(lines, asciiLines);

  return {
    contractNumber: pickContractNumber(lines, asciiLines),
    clientName: pickPolicyholderName(lines, asciiLines),
    policyStartDate: travelPeriod.start,
    policyEndDate: travelPeriod.end,
    contractSignedDate: pickSignedDate(lines, asciiLines),
    amount: pickTotalPremium(lines, asciiLines),
    frequency: "annual",
  };
}
