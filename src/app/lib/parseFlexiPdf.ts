// src/app/lib/parseFlexiPdf.ts
import { type PaymentFrequency } from "../types/domain";

export type FlexiPdfResult = {
  contractNumber?: string | null;
  clientName?: string | null;
  policyStartDate?: string | null;
  contractSignedDate?: string | null;
  amount?: number | null;
  frequency?: PaymentFrequency | null;
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

export async function parseFlexiPdf(file: File): Promise<FlexiPdfResult> {
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

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
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
