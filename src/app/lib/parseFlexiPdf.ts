import { readPdfText, type PdfReadOptions } from "./pdfDocumentText";
// src/app/lib/parseFlexiPdf.ts
import { type PaymentFrequency } from "../types/domain";
import { normalizeContractPaymentDetails, type ContractPaymentDetails } from "./contractPaymentDetails";

export type FlexiPdfResult = {
  contractNumber?: string | null;
  clientName?: string | null;
  policyStartDate?: string | null;
  contractSignedDate?: string | null;
  durationYears?: number | null;
  amount?: number | null;
  paymentDetails?: ContractPaymentDetails | null;
  frequency?: PaymentFrequency | null;
  isRefresh?: boolean;
  refreshOriginalContractNumber?: string | null;
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
  return `${y.toString().padStart(4, "0")}-${mm.toString().padStart(2, "0")}-${d
    .toString()
    .padStart(2, "0")}`;
};

const parseAmount = (val: string | null | undefined): number | null => {
  if (!val) return null;
  const cleaned = val.replace(/\s+/g, "").replace(",", ".").trim();
  const num = Number.parseFloat(cleaned);
  return Number.isFinite(num) ? Math.round(num) : null;
};

const parseYearFromIso = (isoDate: string | null | undefined): number | null => {
  if (!isoDate) return null;
  const year = Number.parseInt(isoDate.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
};

const parseFlexiPaymentDetails = (
  fullText: string,
  contractNumber: string | null | undefined,
): ContractPaymentDetails | null => {
  if (!contractNumber || !/^\d{6,10}$/.test(contractNumber)) return null;
  const lines = fullText.split(/\n+/).map(line => line.trim()).filter(Boolean);
  const asciiLines = lines.map(line => line.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase());
  const sectionStart = asciiLines.findIndex(line => /^kolik nam za pojisteni zaplatite\b/.test(line));
  if (sectionStart < 0) return null;
  const sectionEnd = asciiLines.findIndex((line, index) => index > sectionStart &&
    /^(?:na jak dlouho pojisteni sjednavame|obmyslene osoby|co nam jako pojistnik potvrzujete)\b/.test(line));
  const section = asciiLines.slice(sectionStart, sectionEnd < 0 ? undefined : sectionEnd).join(" ").replace(/\s+/g, " ");
  const amountMatch = /castka k uhrade\s*:?\s*((?:\d{1,3}(?:\s\d{3})+|\d+)(?:[,.]\d{1,2})?)\s*k[cc]\b/.exec(section);
  const accountMatch = /cislo uctu\s*:?\s*((?:\d{1,6}-)?\d{2,10}\/\d{4})\b/.exec(section);
  const variableSymbolMatch = /variabilni symbol\s*:?\s*(\d{1,10})\b/.exec(section);
  const dueDateMatch = /datum splatnosti\s*:?\s*(\d{1,2}\.\s*\d{1,2}\.\s*\d{4})\b/.exec(section);
  const variableSymbol = variableSymbolMatch?.[1];
  if (!amountMatch?.[1] || !accountMatch?.[1] || !dueDateMatch?.[1] || variableSymbol !== contractNumber) return null;
  const [, day, month, year] = dueDateMatch[1].match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/) ?? [];
  if (!day || !month || !year) return null;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) return null;
  const amount = Number(amountMatch[1].replace(/\s/g, "").replace(",", "."));
  const dueDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  return normalizeContractPaymentDetails({ amount, accountNumber: accountMatch[1], variableSymbol, dueDate });
};

const stripTitles = (name: string): string => {
  const titles = new Set([
    "ing",
    "mgr",
    "bc",
    "phdr",
    "judr",
    "mudr",
    "rnDr",
    "pharmdr",
    "phd",
    "dis",
  ]);
  const parts = name
    .split(/\s+/)
    .filter(Boolean)
    .filter((p) => {
      const plain = p.replace(/\./g, "").toLowerCase();
      return !titles.has(plain);
    });
  return parts.join(" ").trim();
};

export async function parseFlexiPdf(file: File, options: PdfReadOptions = {}): Promise<FlexiPdfResult> {
  const doc = await readPdfText(file, options);
  const pagesText: string[] = [];

  for (let i = 1; i <= doc.pages.length; i++) {
    const page = doc.pages[i - 1];
    const content = { items: page.items };
    const text = content.items
      .map((item: any) => (typeof item?.str === "string" ? item.str : ""))
      .filter(Boolean)
      .join("\n");
    pagesText.push(text);
  }

  const fullText = pagesText.join("\n");
  const ascii = fullText.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

  const result: FlexiPdfResult = {};

  // Číslo smlouvy
  const contractMatch =
    fullText.match(/Číslo\s+pojistné\s+smlouvy[^\d]*([\d\s]{6,30})/i)?.[1] ??
    ascii.match(/cislo pojistne smlouvy[^\d]*([\d\s]{6,30})/i)?.[1];
  if (contractMatch) {
    const digits = contractMatch.replace(/\D+/g, "");
    if (digits) result.contractNumber = digits;
  }
  const paymentDetails = parseFlexiPaymentDetails(fullText, result.contractNumber);
  if (paymentDetails) result.paymentDetails = paymentDetails;

  // Renovace: číslo nahrazované smlouvy je jiné než číslo nové smlouvy v záhlaví.
  const renovationMatch = ascii.match(
    /tato\s+smlouva\s+nahrazuje\s+puvodni\s+pojistnou\s+smlouvu\s+c\b\.?\s*:?\s*(\d(?:\s*\d){5,13}\b)?/
  );
  if (renovationMatch) {
    result.isRefresh = true;
    if (renovationMatch[1]) {
      result.refreshOriginalContractNumber = renovationMatch[1].replace(/\s+/g, "");
    }
  }

  // Jméno a příjmení pojistníka
  const nameLine =
    fullText.match(/Titul,\s*jméno,\s*příjmení\s*\n\s*([^\n]+)/i)?.[1]?.trim() ??
    ascii.match(/titul,\s*jmeno,\s*prijmeni\s*\n\s*([^\n]+)/i)?.[1]?.trim();
  if (nameLine) {
    result.clientName = stripTitles(nameLine.replace(/\s+/g, " "));
  }

  // Počátek pojištění
  const startMatch =
    fullText.match(/Počátek\s+pojištění[^\d]*(\d{1,2}\.\s*\d{1,2}\.\s*\d{4})/i)?.[1] ??
    ascii.match(/pocatek pojisteni[^\d]*(\d{1,2}\.\s*\d{1,2}\.\s*\d{4})/i)?.[1];
  const startIso = toDateInput(startMatch);
  if (startIso) {
    result.policyStartDate = startIso;
  }

  // Konec pojištění (pro výpočet doby trvání smlouvy)
  const endMatch =
    fullText.match(/Konec\s+pojištění[^\d]*(\d{1,2}\.\s*\d{1,2}\.\s*\d{4})/i)?.[1] ??
    ascii.match(/konec pojisteni[^\d]*(\d{1,2}\.\s*\d{1,2}\.\s*\d{4})/i)?.[1];
  const endYearOnlyMatch =
    fullText.match(/konec\s+pojištění[\s\S]{0,120}?(\d{4})/i)?.[1] ??
    ascii.match(/konec pojisteni[\s\S]{0,120}?(\d{4})/i)?.[1] ??
    ascii.match(/konci v roce[\s:]*([12]\d{3})/i)?.[1];
  const endIso = toDateInput(endMatch);
  const startYear = parseYearFromIso(startIso);
  const endYear =
    parseYearFromIso(endIso) ??
    (endYearOnlyMatch ? Number.parseInt(endYearOnlyMatch, 10) : null);
  if (startYear != null && endYear != null) {
    const years = endYear - startYear;
    if (years > 0) {
      result.durationYears = years;
    }
  }

  // Datum sjednání / uzavření
  const signedMatch =
    fullText.match(/Pojistná\s+smlouva\s+uzavřena\s+dne[^\d]*(\d{1,2}\.\s*\d{1,2}\.\s*\d{4})/i)?.[1] ??
    ascii.match(/pojistna smlouva uzavrena dne[^\d]*(\d{1,2}\.\s*\d{1,2}\.\s*\d{4})/i)?.[1];
  const signedIso = toDateInput(signedMatch);
  if (signedIso) {
    result.contractSignedDate = signedIso;
  }

  // Částka k úhradě
  const amountMatch =
    fullText.match(/Částka\s+k\s+úhradě[^\d]*([\d\s.,]+)/i)?.[1] ??
    ascii.match(/castka k uhrade[^\d]*([\d\s.,]+)/i)?.[1];
  const amount = parseAmount(amountMatch);
  if (amount != null) {
    result.amount = amount;
  }

  result.frequency = "monthly";

  return result;
}
