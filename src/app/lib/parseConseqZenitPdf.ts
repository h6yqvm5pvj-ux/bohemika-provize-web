import type { PaymentFrequency } from "../types/domain";
import type { PdfOcrPage, PdfOcrProgress } from "./pdfOcr";

export type ConseqZenitPdfResult = {
  productDetected: boolean;
  contractNumber: string | null;
  clientName: string | null;
  amount: number | null;
  frequency: PaymentFrequency;
  contractSignedDate: string | null;
  policyStartDate: string | null;
  policyEndDate: string | null;
  clientBirthDate: string | null;
  targetAge: number | null;
  ocrTextUsed: boolean;
};

export type ConseqZenitPdfOptions = {
  onOcrStart?: () => void;
  onOcrProgress?: (progress: PdfOcrProgress) => void;
};

type Word = PdfOcrPage["words"][number];
type Row = { words: Word[]; text: string; y: number };
const ascii = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const spaces = (text: string) => text.replace(/\s+/g, " ").trim();

function rowsForPage(page: PdfOcrPage): Row[] {
  const rows: Row[] = [];
  for (const word of [...page.words].sort((a, b) => a.y - b.y || a.x - b.x)) {
    if (!word.text.trim()) continue;
    const center = word.y + word.height / 2;
    const row = rows.find((candidate) => Math.abs(candidate.y - center) <= 3.5);
    if (row) row.words.push(word);
    else rows.push({ words: [word], text: "", y: center });
  }
  for (const row of rows) {
    row.words.sort((a, b) => a.x - b.x);
    row.text = row.words.map((word) => spaces(word.text)).join(" ");
  }
  return rows.sort((a, b) => a.y - b.y);
}

function xAt(row: Row, offset: number): number {
  let start = 0;
  for (const word of row.words) {
    const text = spaces(word.text);
    if (offset <= start + text.length) return word.x + word.width * Math.max(0, offset - start) / Math.max(1, text.length);
    start += text.length + 1;
  }
  return Infinity;
}

// Adjacent columns are boundaries, never alternate sources for a missing value.
const COLUMN_LABEL = /(?:jmeno a prijm\w*|rodne cislo|datum narozeni|misto narozeni|statni prislusnost|predchozi smlouva|nazev predchozi|zvolena strategie|mesicni poplatek|mesicni prispevek|zaznam o elektronickem podpisu)/g;

function readField<T>(rows: Row[], label: RegExp, parse: (text: string) => T | null, maxDistance = 26): T | null {
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const normalized = ascii(row.text);
    const match = label.exec(normalized);
    if (!match) continue;
    const end = match.index + match[0].length;
    const nextLabel = [...normalized.matchAll(COLUMN_LABEL)].find((item) => item.index >= end);
    const right = nextLabel ? xAt(row, nextLabel.index) - 2 : Infinity;
    const inline = parse(row.text.slice(end, nextLabel?.index).replace(/^[\s:|=]+/, ""));
    if (inline != null) return inline;
    const left = xAt(row, match.index) - 4;
    for (const next of rows.slice(index + 1)) {
      if (next.y - row.y > maxDistance) break;
      const value = next.words.filter((word) => word.x >= left && word.x < right)
        .map((word) => word.text).join(" ");
      const parsed = parse(value);
      if (parsed != null) return parsed;
    }
    return null;
  }
  return null;
}

function section(rows: Row[], heading: RegExp, end: RegExp): Row[] {
  const start = rows.findIndex((row) => heading.test(ascii(row.text)));
  if (start < 0) return [];
  const rest = rows.slice(start + 1);
  const stop = rest.findIndex((row) => end.test(ascii(row.text)));
  return stop < 0 ? rest : rest.slice(0, stop);
}

function parseDate(text: string): string | null {
  const match = text.match(/\b(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\b/);
  if (!match) return null;
  const [, d, m, y] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (date.getUTCFullYear() !== Number(y) || date.getUTCMonth() !== Number(m) - 1 || date.getUTCDate() !== Number(d)) return null;
  return date.toISOString().slice(0, 10);
}

export function conseqZenitMaturityDate(birthDate: string | null, age: number | null): string | null {
  if (!birthDate || age == null || !Number.isInteger(age) || age < 1 || age > 120) return null;
  const match = birthDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match || !parseDate(`${match[3]}.${match[2]}.${match[1]}`)) return null;
  const year = Number(match[1]) + age;
  const month = Number(match[2]);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1, Math.min(Number(match[3]), lastDay))).toISOString().slice(0, 10);
}

const TITLE = /\b(?:ing\.?\s*arch\.?|ing\.?|mgr\.?|bc\.?a?\.?|mudr\.?|mddr\.?|mvdr\.?|judr\.?|rndr\.?|phdr\.?|paeddr\.?|pharmdr\.?|thdr\.?|thlic\.?|prof\.?|doc\.?|ph\.?\s*d\.?|th\.?\s*d\.?|csc\.?|drsc\.?|dis\.?|mba|msc\.?|ll\.?m\.?|dr\.?)(?=[\s,;]|$)/gi;

function parseName(text: string): string | null {
  const titles: string[] = [];
  const name = spaces(text.replace(TITLE, (title) => { titles.push(spaces(title)); return ""; })
    .replace(/^[\s,;:|]+|[\s,;:|]+$/g, ""));
  if (!/^[\p{L}][\p{L}\s'’.-]+$/u.test(name) || name.split(/\s+/).length < 2) return null;
  if (/prijmeni|ucastnik|rodne cislo|trvaly pobyt|misto narozeni/.test(ascii(name))) return null;
  return [...titles, name].join(" ");
}

export function parseConseqZenitPages(pages: PdfOcrPage[], ocrTextUsed = false): ConseqZenitPdfResult {
  const pageRows = pages.map(rowsForPage);
  const rows = pageRows.flat();
  const text = ascii(pages.map((page) => page.text).join(" "));
  const parties = section(rows, /\bsmluvni strany\b/, /\b(?:specifikace|trvaly pobyt|korespondencni|zastupce ucastnika)\b/);
  const specification = section(rows, /\bspecifikace doplnkoveho penzijniho sporeni\b/, /\burcene osoby\b|\bprojev vule\b/);
  const clientBirthDate = readField(parties, /datum narozeni\s*:?/, parseDate);
  // Browser OCR can damage "Cílový" (e.g. "Clloy"); the remaining caption
  // identifies the field. Include the first word to keep its column boundary.
  const targetAge = readField(specification, /\b[a-z]+ vek strategie sporeni\s*:?/, (value) => {
    const match = value.match(/^\s*(\d{1,3})(?:\s*(?:let|roku|roky))?\s*$/i);
    return match ? Number(match[1]) : null;
  });
  return {
    productDetected: text.includes("conseq") && text.includes("zenit"),
    contractNumber: readField(rows, /cislo smlouvy\s*:?/, (value) => value.match(/^\s*(\d{6,14})\b/)?.[1] ?? null),
    clientName: readField(parties, /jmeno a prijm\w*(?:\s*,?\s*titul)?\s*:?/, parseName),
    // Identify the DPS contribution independently of OCR errors in "(Kč)".
    amount: readField(specification, /mesicni prispevek dps\b(?:\s*\([^)]{1,5}\))?\s*:?/, (value) => {
      const match = value.match(/^\s*(\d[\d\s]*(?:[,.]\d{1,2})?)\s*(?:K[čc]|CZK)?\s*$/i);
      const amount = match ? Number(match[1].replace(/\s/g, "").replace(",", ".")) : NaN;
      return Number.isFinite(amount) && amount >= 0 ? amount : null;
    }),
    frequency: "monthly",
    contractSignedDate: readField(pageRows[0] ?? [], /zaznam o elektronickem podpisu\s*:?/, parseDate, 85),
    policyStartDate: readField(specification, /pozadovany vznik doplnkoveho penzijniho sporeni\s*:?/, parseDate),
    policyEndDate: conseqZenitMaturityDate(clientBirthDate, targetAge),
    clientBirthDate,
    targetAge,
    ocrTextUsed,
  };
}

const cache = new WeakMap<File, Promise<ConseqZenitPdfResult>>();

export function parseConseqZenitPdf(file: File, options: ConseqZenitPdfOptions = {}): Promise<ConseqZenitPdfResult> {
  const existing = cache.get(file);
  if (existing) return existing;
  const pending = readPdf(file, options).catch((error) => { cache.delete(file); throw error; });
  cache.set(file, pending);
  return pending;
}

async function readPdf(file: File, options: ConseqZenitPdfOptions): Promise<ConseqZenitPdfResult> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: PdfOcrPage[] = [];
  try {
    for (let number = 1; number <= doc.numPages; number++) {
      const page = await doc.getPage(number);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const words: Word[] = content.items.flatMap((item) => {
        if (!("str" in item) || !item.str.trim()) return [];
        const height = item.height || Math.abs(item.transform[3]) || 8;
        return [{ text: item.str, x: item.transform[4], y: viewport.height - item.transform[5] - height, width: item.width, height }];
      });
      pages.push({ words, text: words.map((word) => word.text).join(" ") });
    }
  } finally {
    await doc.destroy();
  }
  const parsed = parseConseqZenitPages(pages);
  if (parsed.clientName && parsed.amount != null && parsed.policyEndDate && parsed.policyStartDate && parsed.contractSignedDate && parsed.contractNumber) return parsed;
  if (typeof document === "undefined") return parsed;
  options.onOcrStart?.();
  const { extractOcrLinesFromPdf } = await import("./pdfOcr");
  // The signature protocol and the DPS form precede the contractual terms.
  const ocr = await extractOcrLinesFromPdf(file, { maxPages: 2, removeTableLines: true, onProgress: options.onOcrProgress });
  const combined = pages.map((page, index) => ocr.pages[index] ?? page);
  const scanned = parseConseqZenitPages(combined, true);
  const clientBirthDate = parsed.clientBirthDate ?? scanned.clientBirthDate;
  const targetAge = parsed.targetAge ?? scanned.targetAge;
  return {
    ...scanned,
    productDetected: parsed.productDetected || scanned.productDetected,
    contractNumber: parsed.contractNumber ?? scanned.contractNumber,
    clientName: parsed.clientName ?? scanned.clientName,
    amount: parsed.amount ?? scanned.amount,
    contractSignedDate: parsed.contractSignedDate ?? scanned.contractSignedDate,
    policyStartDate: parsed.policyStartDate ?? scanned.policyStartDate,
    clientBirthDate,
    targetAge,
    policyEndDate: conseqZenitMaturityDate(clientBirthDate, targetAge),
  };
}
