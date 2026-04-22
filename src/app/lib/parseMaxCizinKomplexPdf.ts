// src/app/lib/parseMaxCizinKomplexPdf.ts
import {
  type PaymentFrequency,
  type MaxCizinKomplexVariant,
} from "../types/domain";

export type MaxCizinKomplexPdfResult = {
  contractNumber?: string | null;
  clientName?: string | null;
  policyStartDate?: string | null;
  contractSignedDate?: string | null;
  amount?: number | null;
  durationMonths?: number | null;
  frequency?: PaymentFrequency | null;
  maxCizinKomplexVariant?: MaxCizinKomplexVariant | null;
};

type PdfTextItem = {
  text: string;
  x: number;
  y: number;
  page: number;
};

const stripDiacritics = (text: string) =>
  text.normalize("NFD").replace(/\p{Diacritic}/gu, "");

const normalizeSpaces = (text: string) => text.replace(/\s+/g, " ").trim();

const extractDateToken = (value: string | null | undefined): string | null => {
  if (!value) return null;
  return value.match(/\b\d{1,2}\.\d{1,2}\.\d{4}\b/)?.[0] ?? null;
};

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

const parseAmount = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const m = value.match(/([0-9][0-9\s]*(?:[.,][0-9]+)?)/);
  if (!m?.[1]) return null;
  const cleaned = m[1].replace(/\s+/g, "").replace(",", ".");
  const num = Number.parseFloat(cleaned);
  return Number.isFinite(num) ? Math.round(num) : null;
};

const parseInteger = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const m = value.match(/(\d{1,4})/);
  if (!m?.[1]) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
};

const digitsOnly = (value: string | null | undefined): string => {
  if (!value) return "";
  return value.replace(/\D+/g, "");
};

const isLikelyContractNumber = (value: string | null | undefined): boolean => {
  const digits = digitsOnly(value);
  return digits.length >= 8 && digits.length <= 14;
};

const pickMostFrequent = (values: string[]): string | null => {
  if (values.length === 0) return null;
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const best = Array.from(counts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0].length - a[0].length;
  })[0]?.[0];
  return best ?? null;
};

const compactLines = (raw: string): string[] =>
  raw
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

function parseClientNameFromSurnameNameTitle(raw: string): string | null {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;

  const partsByComma = cleaned
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  let surname = "";
  let firstName = "";
  let title = "";

  if (partsByComma.length >= 3) {
    surname = partsByComma[0] ?? "";
    firstName = partsByComma[1] ?? "";
    title = partsByComma.slice(2).join(" ");
  } else if (partsByComma.length === 2) {
    const leftTokens = partsByComma[0].split(/\s+/).filter(Boolean);
    surname = leftTokens[0] ?? "";
    firstName = leftTokens.slice(1).join(" ") || partsByComma[1];
    const maybeTitle = partsByComma[1];
    if (/^[a-zA-Z.\s]+$/.test(maybeTitle) && maybeTitle.length <= 20) {
      title = maybeTitle;
      if (leftTokens.length >= 2) {
        firstName = leftTokens.slice(1).join(" ");
      }
    }
  } else {
    const tokens = cleaned.split(/\s+/).filter(Boolean);
    if (tokens.length === 1) return tokens[0];
    surname = tokens[0] ?? "";
    firstName = tokens[1] ?? "";
    title = tokens.slice(2).join(" ");
  }

  const finalName = [title, firstName, surname]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return finalName || cleaned;
}

function findValueNearLabel(
  lines: string[],
  asciiLines: string[],
  labelRegex: RegExp,
  valueRegex: RegExp,
  lookahead = 4
): string | null {
  const idx = asciiLines.findIndex((line) => labelRegex.test(line));
  if (idx === -1) return null;

  const onSameLine = lines[idx]?.match(valueRegex)?.[0];
  if (onSameLine) return onSameLine;

  for (let i = idx + 1; i <= Math.min(lines.length - 1, idx + lookahead); i++) {
    const hit = lines[i]?.match(valueRegex)?.[0];
    if (hit) return hit;
  }
  return null;
}

function applyCoordinateFallbacks(items: PdfTextItem[], result: MaxCizinKomplexPdfResult) {
  const pageOneItems = items.filter((item) => item.page === 1);
  if (pageOneItems.length === 0) return;

  if (!result.maxCizinKomplexVariant) {
    const topAscii = pageOneItems
      .filter((item) => item.y >= 760)
      .map((item) => stripDiacritics(item.text).toLowerCase())
      .join(" ");

    if (/\bpremium\b|\bpreium\b/.test(topAscii)) {
      result.maxCizinKomplexVariant = "premium";
    } else if (/\bexclusive\b|\bstandard\b/.test(topAscii)) {
      result.maxCizinKomplexVariant = "exclusiveStandard";
    }
  }

  if (!result.contractNumber) {
    const contractCandidates = pageOneItems
      .filter((item) => item.y >= 700)
      .map((item) => digitsOnly(item.text))
      .filter((digits) => isLikelyContractNumber(digits));
    const picked = pickMostFrequent(contractCandidates);
    if (picked) result.contractNumber = picked;
  }

  if (!result.contractSignedDate) {
    const signedDateRaw =
      pageOneItems
        .filter((item) => item.x >= 450 && item.y >= 730)
        .map((item) => extractDateToken(item.text))
        .find((value): value is string => Boolean(value)) ?? null;
    const signedIso = toDateInput(signedDateRaw);
    if (signedIso) result.contractSignedDate = signedIso;
  }

  const paramRowItems = pageOneItems.filter((item) => item.y >= 500 && item.y <= 535);

  if (!result.policyStartDate) {
    const startRaw =
      paramRowItems
        .filter((item) => item.x <= 95)
        .map((item) => extractDateToken(item.text))
        .find((value): value is string => Boolean(value)) ?? null;
    const startIso = toDateInput(startRaw);
    if (startIso) result.policyStartDate = startIso;
  }

  if (result.durationMonths == null) {
    const monthsRaw =
      paramRowItems
        .filter((item) => item.x >= 170 && item.x <= 260)
        .map((item) => normalizeSpaces(item.text))
        .find((text) => /^\d{1,3}$/.test(text)) ?? null;
    const months = parseInteger(monthsRaw);
    if (months != null && months > 0) result.durationMonths = months;
  }

  if (result.amount == null) {
    const amountRaw =
      paramRowItems
        .filter((item) => item.x >= 470)
        .map((item) => normalizeSpaces(item.text))
        .find((text) => /[0-9]/.test(text)) ?? null;
    const amount = parseAmount(amountRaw);
    if (amount != null) result.amount = amount;
  }

  if (!result.clientName) {
    const nameRaw =
      pageOneItems
        .filter((item) => item.x <= 320 && item.y >= 620 && item.y <= 735)
        .map((item) => normalizeSpaces(item.text))
        .find(
          (text) =>
            text.length >= 5 &&
            text.length <= 80 &&
            /[a-zA-Z]/.test(text) &&
            !/\d/.test(text) &&
            !/^(x|standard|premium|exclusive)$/i.test(stripDiacritics(text))
        ) ?? null;

    if (nameRaw) {
      const parsedName = parseClientNameFromSurnameNameTitle(nameRaw);
      if (parsedName) result.clientName = parsedName;
    }
  }
}

export async function parseMaxCizinKomplexPdf(
  file: File
): Promise<MaxCizinKomplexPdfResult> {
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
  const textItems: PdfTextItem[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageItems: PdfTextItem[] = content.items
      .map((item: any) => {
        const text = typeof item?.str === "string" ? item.str : "";
        const transform = Array.isArray(item?.transform) ? item.transform : [];
        const x = Number(transform[4] ?? 0);
        const y = Number(transform[5] ?? 0);
        return { text: normalizeSpaces(text), x, y, page: i };
      })
      .filter((item) => Boolean(item.text))
      .sort((a, b) => {
        if (b.y !== a.y) return b.y - a.y;
        return a.x - b.x;
      });
    textItems.push(...pageItems);
    const text = pageItems
      .map((item) => item.text)
      .join("\n");
    pagesText.push(text);
  }

  const fullText = pagesText.join("\n");
  const lines = compactLines(fullText);
  const asciiLines = lines.map((line) => stripDiacritics(line).toLowerCase());
  const asciiText = stripDiacritics(fullText).toLowerCase();
  const topAscii = asciiLines.slice(0, 160).join(" ");

  const result: MaxCizinKomplexPdfResult = {
    frequency: "annual",
  };

  // Varianta produktu: nahoře STANDARD / EXCLUSIVE / PREMIUM.
  if (/\bpremium\b|\bpreium\b/.test(topAscii)) {
    result.maxCizinKomplexVariant = "premium";
  } else if (/\bexclusive\b|\bstandard\b/.test(topAscii)) {
    result.maxCizinKomplexVariant = "exclusiveStandard";
  }

  // Číslo pojistné smlouvy.
  const contractNumberRaw =
    findValueNearLabel(
      lines,
      asciiLines,
      /cislo\s+pojistne\s+smlouvy/i,
      /\d[\d\s]{5,30}/,
      3
    ) ??
    asciiText.match(/cislo\s+pojistne\s+smlouvy[^\d]{0,40}(\d[\d\s]{5,30})/i)?.[1] ??
    null;
  if (contractNumberRaw) {
    const digits = contractNumberRaw.replace(/\D+/g, "");
    if (digits) result.contractNumber = digits;
  }

  // Datum sjednání smlouvy (vpravo nahoře "Dne").
  const signedRaw =
    topAscii.match(/\bdne\b[^0-9]{0,10}(\d{1,2}\.\d{1,2}\.\d{4})/)?.[1] ??
    findValueNearLabel(
      lines,
      asciiLines,
      /\b(dne|datum)\b/i,
      /\d{1,2}\.\d{1,2}\.\d{4}/,
      3
    ) ??
    null;
  const signedIso = toDateInput(signedRaw);
  if (signedIso) result.contractSignedDate = signedIso;

  // Pojistník: "Příjmení, jméno, titul" -> přehodit na "Titul Jméno Příjmení".
  const nameRaw =
    findValueNearLabel(
      lines,
      asciiLines,
      /prijmeni,\s*jmeno,\s*titul/i,
      /.+/,
      2
    ) ??
    null;
  if (nameRaw) {
    const parsedName = parseClientNameFromSurnameNameTitle(nameRaw);
    if (parsedName) result.clientName = parsedName;
  }

  // Jednorázové pojistné.
  const amountRaw =
    findValueNearLabel(
      lines,
      asciiLines,
      /jednorazove\s+pojistne/i,
      /[0-9][0-9\s]*(?:[.,][0-9]+)?\s*(?:k[cč])?/i,
      3
    ) ??
    null;
  const amount = parseAmount(amountRaw);
  if (amount != null) result.amount = amount;

  // Počátek pojištění.
  const startRaw =
    findValueNearLabel(
      lines,
      asciiLines,
      /pocatek\s+pojisteni/i,
      /\d{1,2}\.\d{1,2}\.\d{4}/,
      3
    ) ??
    null;
  const startIso = toDateInput(startRaw);
  if (startIso) result.policyStartDate = startIso;

  // Pojistná doba (měsíce).
  const monthsRaw =
    findValueNearLabel(
      lines,
      asciiLines,
      /pojistna\s+doba.*mesic/i,
      /\d{1,4}/,
      3
    ) ??
    null;
  const months = parseInteger(monthsRaw);
  if (months != null && months > 0) result.durationMonths = months;

  // Fallback pro PDF, kde se nevytáhnou textové labely polí (jen hodnoty).
  applyCoordinateFallbacks(textItems, result);

  return result;
}
