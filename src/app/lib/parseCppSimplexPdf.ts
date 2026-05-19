// src/app/lib/parseCppSimplexPdf.ts
import { type PaymentFrequency } from "../types/domain";

export type CppSimplexPdfResult = {
  contractNumber?: string | null;
  clientName?: string | null;
  policyStartDate?: string | null;
  contractSignedDate?: string | null;
  amount?: number | null;
  frequency?: PaymentFrequency | null;
};

type FlatToken = {
  raw: string;
  normalized: string;
};

const stripDiacritics = (text: string) =>
  text.normalize("NFD").replace(/\p{Diacritic}/gu, "");

const normalizeToken = (text: string) =>
  stripDiacritics(text).toLowerCase().replace(/\s+/g, " ").trim();

const extractDigits = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const digits = value.replace(/\D+/g, "");
  return digits.length > 0 ? digits : null;
};

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
  value?.match(/\b\d{1,2}\.\d{1,2}\.\d{4}\b/)?.[0] ?? null;

const parseAmount = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const amountMatch = value.match(/(\d[\d\s]*(?:[.,]\d+)?)/)?.[1] ?? null;
  if (!amountMatch) return null;
  const normalized = amountMatch.replace(/\s+/g, "").replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
};

const mapFrequency = (value: string | null | undefined): PaymentFrequency | null => {
  if (!value) return null;
  const normalized = normalizeToken(value);
  if (normalized.includes("ctvrtlet")) return "quarterly";
  if (normalized.includes("pololet") || normalized.includes("pulroc")) return "semiannual";
  if (normalized.includes("mesic")) return "monthly";
  if (normalized.includes("rocni")) return "annual";
  return null;
};

const isLabelToken = (token: FlatToken, labelNormalized: string): boolean =>
  token.normalized === labelNormalized || token.normalized.startsWith(`${labelNormalized}:`);

const findTokenAfterLabel = (
  tokens: FlatToken[],
  label: string,
  accept: (token: FlatToken) => boolean,
  lookahead = 10
): FlatToken | null => {
  const labelNormalized = normalizeToken(label);

  for (let i = 0; i < tokens.length; i += 1) {
    if (!isLabelToken(tokens[i], labelNormalized)) continue;
    for (let j = i + 1; j < tokens.length && j <= i + lookahead; j += 1) {
      const token = tokens[j];
      if (isLabelToken(token, labelNormalized)) continue;
      if (accept(token)) return token;
    }
  }

  return null;
};

export async function parseCppSimplexPdf(file: File): Promise<CppSimplexPdfResult> {
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
  const tokens: FlatToken[] = [];
  const pageTexts: string[] = [];

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageItems = content.items
      .map((item: any) => (typeof item?.str === "string" ? item.str : ""))
      .filter(Boolean);
    pageTexts.push(pageItems.join("\n"));

    for (const item of pageItems) {
      const raw = item.replace(/\s+/g, " ").trim();
      if (!raw) continue;
      tokens.push({ raw, normalized: normalizeToken(raw) });
    }
  }

  const fullText = pageTexts.join("\n");
  const fullTextAscii = stripDiacritics(fullText);
  const result: CppSimplexPdfResult = {};

  const contractToken = findTokenAfterLabel(
    tokens,
    "Číslo nabídky pojistné smlouvy",
    (token) => {
      const digits = extractDigits(token.raw);
      return Boolean(digits && digits.length >= 6 && digits.length <= 14);
    },
    8
  );
  const contractNumber =
    (contractToken ? extractDigits(contractToken.raw) : null) ??
    fullTextAscii.match(/Cislo\s+nabidky\s+pojistne\s+smlouvy[\s\S]{0,120}?(\d{6,14})/i)?.[1] ??
    extractDigits(tokens.find((token) => /^\*?\d{8,14}\*?$/.test(token.raw))?.raw ?? null);
  if (contractNumber) result.contractNumber = contractNumber;

  const clientNameStopLabels = new Set([
    normalizeToken("IČO"),
    normalizeToken("Plátce DPH"),
    normalizeToken("Sídlo"),
    normalizeToken("Zápis v OR / ŽR"),
    normalizeToken("Bankovní spojení"),
    normalizeToken("Pověřený zástupce"),
    normalizeToken("E-mail"),
    normalizeToken("Telefon"),
  ]);
  const clientLabelNormalized = normalizeToken("Obchodní jméno");
  for (let i = 0; i < tokens.length; i += 1) {
    if (!isLabelToken(tokens[i], clientLabelNormalized)) continue;

    for (let j = i + 1; j < tokens.length && j <= i + 12; j += 1) {
      const candidate = tokens[j];
      if (clientNameStopLabels.has(candidate.normalized)) break;
      if (/[A-Za-zÀ-ž]/.test(candidate.raw)) {
        result.clientName = candidate.raw;
        break;
      }
    }

    if (result.clientName) break;
  }

  const policyStartToken = findTokenAfterLabel(
    tokens,
    "Počátek pojištění",
    (token) => /\b\d{1,2}\.\d{1,2}\.\d{4}\b/.test(token.raw),
    8
  );
  const policyStartDate = toDateInput(extractDateToken(policyStartToken?.raw ?? null));
  if (policyStartDate) result.policyStartDate = policyStartDate;

  const frequencyToken = findTokenAfterLabel(
    tokens,
    "Frekvence splátek pojistného",
    (token) => mapFrequency(token.raw) !== null,
    8
  );
  const frequency = mapFrequency(frequencyToken?.raw ?? null);
  if (frequency) result.frequency = frequency;

  const amountToken = findTokenAfterLabel(
    tokens,
    "Výše platby",
    (token) => parseAmount(token.raw) !== null,
    8
  );
  const amount = parseAmount(amountToken?.raw ?? null);
  if (amount != null) result.amount = amount;

  const signedDateRaw =
    tokens.find((token) => token.normalized.includes(normalizeToken("Nabídka vytvořena dne")))?.raw ??
    fullTextAscii.match(/Nabidka\s+vytvorena\s+dne:\s*(\d{1,2}\.\d{1,2}\.\d{4})/i)?.[1] ??
    null;
  const contractSignedDate = toDateInput(extractDateToken(signedDateRaw));
  if (contractSignedDate) result.contractSignedDate = contractSignedDate;

  return result;
}
