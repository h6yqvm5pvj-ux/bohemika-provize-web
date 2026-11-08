import type { PaymentFrequency } from "../types/domain";
import { normalizeContractPaymentDetails, type ContractPaymentDetails } from "./contractPaymentDetails";
import { readPdfText, type PdfReadOptions, type PdfTextPage } from "./pdfDocumentText";

export type KoopMajetekObcanPdfResult = {
  contractNumber?: string;
  clientName?: string;
  policyStartDate?: string;
  contractSignedDate?: string;
  amount?: number;
  annualPremium?: number;
  frequency?: PaymentFrequency;
  paymentDetails?: ContractPaymentDetails;
  insuredItems?: string[];
  insuredCoverages?: Array<{ name: string; variant: string | null; deductible: number | null; sumInsured: number | null }>;
  isRefresh?: boolean;
  refreshOriginalContractNumber?: string;
  pdfImportWarnings?: string[];
};
export type KoopMajetekCoverage = NonNullable<KoopMajetekObcanPdfResult["insuredCoverages"]>[number];

const stripDiacritics = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "");
const normalize = (value: string) => stripDiacritics(value).toLowerCase().replace(/\s+/g, " ").trim();

function extractLines(page: PdfTextPage): string[] {
  const rows: { y: number; items: Array<{ x: number; width: number; text: string }> }[] = [];
  for (const item of page.items) {
    if (!item.str.trim()) continue;
    const y = item.transform[5];
    let row = rows.find(candidate => Math.abs(candidate.y - y) <= 2);
    if (!row) {
      row = { y, items: [] };
      rows.push(row);
    }
    row.items.push({ x: item.transform[4], width: item.width, text: item.str.trim() });
  }
  return rows.sort((a, b) => b.y - a.y).map(row => {
    row.items.sort((a, b) => a.x - b.x);
    let text = "";
    let previousEnd = 0;
    for (const [index, item] of row.items.entries()) {
      if (index > 0 && item.x - previousEnd > 1.5) text += " ";
      text += item.text;
      previousEnd = item.x + item.width;
    }
    return text.replace(/\s+/g, " ").trim();
  }).filter(Boolean);
}

function findValue(lines: string[], label: RegExp, value: RegExp, startAt = 0, maxLookahead = 2): string | undefined {
  for (let index = startAt; index < lines.length; index++) {
    const match = label.exec(lines[index]);
    if (!match) continue;
    const inline = lines[index].slice(match.index + match[0].length);
    const inlineValue = inline.match(value)?.[0];
    if (inlineValue) return inlineValue.trim();
    for (let offset = 1; offset <= maxLookahead && index + offset < lines.length; offset++) {
      const next = lines[index + offset];
      if (/^(?:pojistnik|na jak dlouho|pojisteni|celkove rocni pojistne)\b/i.test(normalize(next))) break;
      const nextValue = next.match(value)?.[0];
      if (nextValue) return nextValue.trim();
    }
  }
  return undefined;
}

function parseDate(value: string | undefined): string | undefined {
  const match = value?.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  if (!match) return undefined;
  const [, dayRaw, monthRaw, yearRaw] = match;
  const day = Number(dayRaw);
  const month = Number(monthRaw);
  const year = Number(yearRaw);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function parseAmount(value: string | undefined): number | undefined {
  const match = value?.replace(/\u00a0/g, " ").match(/([\d][\d\s]*(?:[.,]\d{1,2})?)/);
  if (!match) return undefined;
  const amount = Number(match[1].replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : undefined;
}

function parseCoverageAmount(value: string | undefined): number | undefined {
  const match = value?.replace(/\u00a0/g, " ").match(/([\d][\d\s]*(?:[.,]\d{1,2})?)/);
  if (!match) return undefined;
  const amount = Number(match[1].replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) / 100 : undefined;
}

function parseFrequency(value: string | undefined): PaymentFrequency | undefined {
  if (!value) return undefined;
  const period = normalize(value);
  if (/\b(?:rocni|rocne|12\s*mesicu|dvanact\s+mesicu)\b/.test(period)) return "annual";
  if (/\b(?:pololetni|pololetne|6\s*mesic(?:u|e|es)?|sest\s+mesicu)\b/.test(period)) return "semiannual";
  if (/\b(?:ctvrtletni|ctvrtletne|3\s*mesic(?:u|e|es)?|tri\s+mesice)\b/.test(period)) return "quarterly";
  if (/\b(?:mesicni|mesicne|1\s*mesic(?:u|e|es)?|jeden\s+mesic)\b/.test(period)) return "monthly";
  return undefined;
}

function parseClientName(lines: string[]): string | undefined {
  const policyholderIndex = lines.findIndex(line => /^pojistnik\b/i.test(normalize(line)));
  if (policyholderIndex < 0) return undefined;
  const sectionEnd = lines.findIndex((line, index) => index > policyholderIndex && /^(?:korespondencni adresa|na jak dlouho|co je pojisteno|pojisteni)\b/i.test(normalize(line)));
  const section = lines.slice(policyholderIndex, sectionEnd < 0 ? policyholderIndex + 10 : sectionEnd);
  const nameIndex = section.findIndex(line => /^jmeno\b|\bjmeno\s+a\s+prijmeni\b/i.test(normalize(line)));
  if (nameIndex < 0) return undefined;
  const line = section[nameIndex];
  const value = line.replace(/^.*?\bjméno(?:\s+a\s+příjmení)?\s*:?\s*/i, "").trim() || section[nameIndex + 1]?.trim();
  if (!value || value.length > 100 || /\d|@|\b(?:adresa|bydliště|rodné číslo|datum narození|telefon|e-?mail)\b/i.test(value)) return undefined;
  const cleaned = value.replace(/^[\s:;,–—-]+|[\s:;,–—-]+$/g, "").replace(/\s+/g, " ");
  return /[\p{L}].+\s+.+[\p{L}]/u.test(cleaned) ? cleaned : undefined;
}

function parseInsuredItems(lines: string[]): string[] {
  const start = lines.findIndex(line => /^co je pojisteno\b/i.test(normalize(line)));
  if (start < 0) return [];
  const end = lines.findIndex((line, index) => index > start && /celkove rocni pojistne\b/i.test(normalize(line)));
  const summary = lines.slice(start + 1, end < 0 ? start + 32 : end);
  const names: string[] = [];
  for (const line of summary) {
    const amountIndex = line.search(/\b\d[\d\s]*(?:[.,]\d{1,2})?\s*(?:Kč|CZK)(?!\p{L})/iu);
    if (amountIndex <= 0) continue;
    const name = line.slice(0, amountIndex)
      .replace(/\s+(?:---|—|–|MINI|OPTI|MAXI|KOMFORT|STANDARD|OPTIMUM|EXTRA|PLUS|IDEÁL|IDEAL)\s*$/i, "")
      .replace(/^[\s:;|–—-]+|[\s:;|–—-]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (name.length < 3 || name.length > 100 || !/\p{L}/u.test(name) || /\d|@/.test(name)) continue;
    if (!names.some(existing => normalize(existing) === normalize(name))) names.push(name);
    if (names.length >= 12) break;
  }
  return names;
}

function parseInsuredCoverages(lines: string[]): NonNullable<KoopMajetekObcanPdfResult["insuredCoverages"]> {
  const start = lines.findIndex(line => /^co je pojisteno\b/i.test(normalize(line)));
  if (start < 0) return [];
  const end = lines.findIndex((line, index) => index > start && /celkove rocni pojistne\b/i.test(normalize(line)));
  const rows = lines.slice(start + 1, end < 0 ? start + 32 : end);
  const money = /([\d][\d\s]*(?:[.,]\d{1,2})?)\s*(?:Kč|CZK)/giu;
  const variantPattern = /\b(MINI|OPTI|MAXI|KOMFORT|STANDARD|OPTIMUM|EXTRA|PLUS|IDEÁL|IDEAL)\b/i;
  const coverages: NonNullable<KoopMajetekObcanPdfResult["insuredCoverages"]> = [];
  for (const line of rows) {
    const amounts = [...line.matchAll(money)].map(match => parseCoverageAmount(match[1])).filter((value): value is number => value !== undefined);
    if (!amounts.length) continue;
    const firstAmountIndex = line.search(money);
    if (firstAmountIndex < 1) continue;
    const label = line.slice(0, firstAmountIndex).replace(/\s+(?:---|—|–)\s*$/i, "").replace(/^[\s:;|–—-]+|[\s:;|–—-]+$/g, "").trim();
    if (label.length < 3 || label.length > 100 || !/\p{L}/u.test(label) || /\d|@/.test(label)) continue;
    const variantMatch = label.match(variantPattern);
    const name = label.replace(variantPattern, "").replace(/\s+/g, " ").trim();
    if (!name) continue;
    coverages.push({
      name,
      variant: variantMatch?.[1]?.toUpperCase() ?? null,
      deductible: amounts[0] ?? null,
      sumInsured: amounts[1] ?? null,
    });
    if (coverages.length >= 12) break;
  }
  return coverages;
}

const numberValue = /\b\d{6,14}\b/;
const dateValue = /\d{1,2}\.\s*\d{1,2}\.\s*\d{4}/;
const amountValue = /[\d][\d\s]*(?:[.,]\d{1,2})?\s*(?:Kč|CZK)?/i;
const accountValue = /(?:\d{1,6}-)?\d{2,10}\/\d{4}/;

export function parseKoopMajetekObcanPages(pages: string[][]): KoopMajetekObcanPdfResult {
  const lines = pages.flat();
  const asciiLines = lines.map(normalize);
  const text = asciiLines.join("\n");
  const result: KoopMajetekObcanPdfResult = {};
  const warnings: string[] = [];

  const contractNumber = findValue(lines, /číslo\s+smlouvy/i, numberValue);
  if (contractNumber) result.contractNumber = contractNumber.replace(/\D/g, "");
  const clientName = parseClientName(lines);
  if (clientName) result.clientName = clientName;
  const insuredItems = parseInsuredItems(pages[0] ?? []);
  if (insuredItems.length) result.insuredItems = insuredItems;
  const insuredCoverages = parseInsuredCoverages(pages[0] ?? []);
  if (insuredCoverages.length) result.insuredCoverages = insuredCoverages;

  const startDate = parseDate(findValue(lines, /počátek\s+pojištění/i, dateValue));
  if (startDate) result.policyStartDate = startDate;
  const signedDate = parseDate(findValue(lines, /datum\s+uzavření\s+smlouvy/i, dateValue));
  if (signedDate) result.contractSignedDate = signedDate;

  const period = findValue(lines, /pojistné\s+období/i, /(?:roční|ročním|měsíční|měsíčně|čtvrtletní|pololetní|\d+\s*měsíc[^\s]*)/i);
  result.frequency = parseFrequency(period);

  const firstPeriodPremium = findValue(lines, /pojistné\s+za\s+první\s+pojistné\s+období/i, amountValue);
  const amount = parseAmount(firstPeriodPremium);
  if (amount !== undefined) result.amount = amount;

  const annualValues = lines.flatMap(line => {
    if (!normalize(line).includes("celkove rocni pojistne po sleve")) return [];
    const value = line.match(/celkové\s+roční\s+pojistné\s+po\s+slevě\s*:?[\s]*([\d][\d\s]*(?:[.,]\d{1,2})?)/i)?.[1];
    const parsed = parseAmount(value);
    return parsed === undefined ? [] : [parsed];
  });
  if (annualValues.length && annualValues.every(value => value === annualValues[0])) {
    result.annualPremium = annualValues[0];
  } else if (annualValues.length > 1) {
    warnings.push("Roční pojistné: hodnoty „Celkové roční pojistné po slevě“ se liší; ověř je ručně.");
  }

  const paymentStart = asciiLines.findIndex(line => /^castka k uhrade\b/.test(line));
  if (paymentStart >= 0) {
    const paymentAmount = parseAmount(findValue(lines, /částka\s+k\s+úhradě/i, amountValue, paymentStart));
    const accountNumber = findValue(lines, /číslo\s+účtu/i, accountValue, paymentStart);
    const variableSymbol = findValue(lines, /variabilní\s+symbol/i, /\b\d{1,10}\b/, paymentStart) ?? result.contractNumber;
    const dueDate = parseDate(findValue(lines, /datum\s+splatnosti/i, dateValue, paymentStart));
    const details = normalizeContractPaymentDetails({ amount: paymentAmount, accountNumber, variableSymbol, dueDate });
    if (details) result.paymentDetails = details;
  }

  const replacementPattern = /touto\s+smlouvou\s+nahrazujeme\s+vasi\s+predchozi\s+smlouvu\s+c\.?\s*([\d\s]{6,24})/i;
  const replacementMatch = text.match(replacementPattern);
  if (replacementMatch) {
    result.isRefresh = true;
    const originalNumber = replacementMatch[1].replace(/\D/g, "");
    if (originalNumber.length >= 6 && originalNumber.length <= 14) {
      result.refreshOriginalContractNumber = originalNumber;
    } else {
      warnings.push("Náhrada smlouvy: ověř číslo nahrazované smlouvy podle PDF.");
    }
  }

  const periodsPerYear: Partial<Record<PaymentFrequency, number>> = {
    monthly: 12,
    quarterly: 4,
    semiannual: 2,
    annual: 1,
  };
  const multiplier = result.frequency ? periodsPerYear[result.frequency] : undefined;
  if (result.amount !== undefined && result.annualPremium !== undefined && multiplier) {
    const expectedAnnual = result.amount * multiplier;
    const roundingTolerance = Math.max(1, multiplier / 2);
    if (Math.abs(expectedAnnual - result.annualPremium) > roundingTolerance) {
      warnings.push("Pojistné: částka za první období neodpovídá celkovému ročnímu pojistnému při zjištěné frekvenci; ověř hodnoty v PDF.");
    }
  }
  if (warnings.length) result.pdfImportWarnings = warnings;
  return result;
}

export async function parseKoopMajetekObcanPdf(
  file: File,
  options: PdfReadOptions = {},
): Promise<KoopMajetekObcanPdfResult> {
  const document = await readPdfText(file, options);
  return parseKoopMajetekObcanPages(document.pages.map(extractLines));
}
