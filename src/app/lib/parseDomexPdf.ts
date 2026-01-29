// src/app/lib/parseDomexPdf.ts
import { type PaymentFrequency } from "../types/domain";

export type DomexPdfResult = {
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

const stripDiacritics = (text: string) =>
  text.normalize("NFD").replace(/\p{Diacritic}/gu, "");

export async function parseDomexPdf(file: File): Promise<DomexPdfResult> {
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
  const normalized = fullText.replace(/\s+/g, " ").trim();
  const ascii = stripDiacritics(normalized).toLowerCase();

  const result: DomexPdfResult = {};

  // Číslo smlouvy / nabídky
  const contractMatch =
    fullText.match(/Číslo\s+nabídky\s+pojistné\s+smlouvy[^\d]*([\d\s]{6,30})/i)?.[1] ??
    fullText.match(/Číslo\s+pojistné\s+smlouvy[^\d]*([\d\s]{6,30})/i)?.[1] ??
    ascii.match(/cislo nabidky pojistne smlouvy[^\d]*([\d\s]{6,30})/i)?.[1] ??
    ascii.match(/cislo pojistne smlouvy[^\d]*([\d\s]{6,30})/i)?.[1];
  if (contractMatch) {
    const digits = contractMatch.replace(/\D+/g, "");
    if (digits) result.contractNumber = digits;
  }

  // Jméno a příjmení pojistníka
  const nameMatch =
    fullText.match(/Jméno\s+a\s+příjmení\s*\n\s*([^\n]+)/i)?.[1]?.trim() ??
    ascii.match(/jmeno a prijmeni\s*\n\s*([^\n]+)/i)?.[1]?.trim();
  if (nameMatch) {
    result.clientName = nameMatch.replace(/\s+/g, " ").trim();
  }

  // Počátek pojištění
  const startMatch =
    fullText.match(/Počátek\s+pojištění[^\d]*(\d{1,2}\.\s*\d{1,2}\.\s*\d{4})/i)?.[1] ??
    ascii.match(/pocatek pojisteni[^\d]*(\d{1,2}\.\s*\d{1,2}\.\s*\d{4})/i)?.[1];
  const startIso = toDateInput(startMatch);
  if (startIso) {
    result.policyStartDate = startIso;
  }

  // Datum sjednání (nabídka vytvořena)
  const signedMatch =
    fullText.match(/Nabídka\s+vytvořena\s+dne:?\s*([0-9]{1,2}\.\s*[0-9]{1,2}\.\s*[0-9]{4})/i)?.[1] ??
    ascii.match(/nabidka vytvorena dne:?\s*([0-9]{1,2}\.\s*[0-9]{1,2}\.\s*[0-9]{4})/i)?.[1];
  const signedIso = toDateInput(signedMatch);
  if (signedIso) {
    result.contractSignedDate = signedIso;
  }

  // Frekvence splátek
  const freqMatch =
    ascii.match(/frekvence splatek pojistneho\s*([a-z]+)/i)?.[1] ??
    ascii.match(/pojistne obdobi\s*([a-z]+)/i)?.[1];
  if (freqMatch) {
    if (freqMatch.startsWith("ctvrt")) result.frequency = "quarterly";
    else if (freqMatch.startsWith("polo")) result.frequency = "semiannual";
    else if (freqMatch.startsWith("roc")) result.frequency = "annual";
    else if (freqMatch.startsWith("mesic")) result.frequency = "monthly";
  }

  // Výše platby
  const amountMatch =
    fullText.match(/Výše\s+platby[^\d]*([\d\s.,]+)/i)?.[1] ??
    ascii.match(/vyse platby[^\d]*([\d\s.,]+)/i)?.[1];
  const amount = parseAmount(amountMatch);
  if (amount != null) {
    result.amount = amount;
  }

  return result;
}
