// src/app/lib/parseNeonPdf.ts
import { type PaymentFrequency } from "../types/domain";

export type NeonPdfResult = {
  contractNumber?: string | null;
  clientName?: string | null;
  policyStartDate?: string | null;
  contractSignedDate?: string | null;
  amount?: number | null;
  durationYears?: number | null;
  frequency?: PaymentFrequency | null;
};

const toDateInput = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const m = value.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
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

const stripDiacritics = (text: string) =>
  text.normalize("NFD").replace(/\p{Diacritic}/gu, "");

const parseAmount = (val: string | null | undefined): number | null => {
  if (!val) return null;
  const cleaned = val.replace(/\s+/g, "").replace(",", ".").trim();
  const num = Number.parseFloat(cleaned);
  return Number.isFinite(num) ? Math.round(num) : null;
};

const digitsOnly = (val: string | null | undefined): string | null => {
  if (!val) return null;
  const digits = val.replace(/\D+/g, "");
  return digits.length > 0 ? digits : null;
};

export async function parseNeonPdf(file: File): Promise<NeonPdfResult> {
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
    pagesText.push(content.items.map((item) => item.str).join("\n"));
  }

  const fullText = pagesText.join("\n");
  const normalized = fullText.replace(/\s+/g, " ").trim();
  const ascii = stripDiacritics(normalized).toLowerCase();

  const result: NeonPdfResult = {};

  // Číslo pojistné smlouvy
  const contractMatch =
    fullText.match(/Číslo\s+pojistné\s+smlouvy:?\s*([\d\s]{6,30})/i)?.[1] ??
    ascii.match(/cislo pojistne smlouvy:?\s*([\d\s]{6,30})/i)?.[1];
  const contractCandidate = digitsOnly(contractMatch);
  const numberCandidates = [
    ...(fullText.match(/\b\d{8,12}\b/g) ?? []),
    contractCandidate ?? "",
  ].filter(Boolean) as string[];

  if (numberCandidates.length > 0) {
    const unique = Array.from(new Set(numberCandidates));
    const sorted = unique.sort((a, b) => {
      // prefer délku 10, pak 9/11, pak kratší
      const pref = (len: number) => (len === 10 ? 3 : len === 9 || len === 11 ? 2 : 1);
      const da = pref(a.length);
      const db = pref(b.length);
      if (da !== db) return db - da;
      return b.length - a.length;
    });
    result.contractNumber = sorted[0];
  }

  // Jméno a příjmení (pojistník)
  const nameMatch =
    fullText.match(/Jméno\s+a\s+příjmení[, ]+titul\s*([^\n]+)/i)?.[1]?.trim() ??
    ascii.match(/jmeno a prijmeni[, ]+titul\s*([^\n]+)/i)?.[1]?.trim();
  if (nameMatch) {
    result.clientName = nameMatch.replace(/\s+/g, " ").trim();
  }

  // Počátek pojištění
  const startMatch =
    fullText.match(/Počátek\s+pojištění\s*([0-9]{1,2}\.[0-9]{1,2}\.[0-9]{4})/i)?.[1] ??
    ascii.match(/pocatek pojisteni\s*([0-9]{1,2}\.[0-9]{1,2}\.[0-9]{4})/i)?.[1];
  const startIso = toDateInput(startMatch);
  if (startIso) {
    result.policyStartDate = startIso;
  }

  // Datum uzavření
  const signedMatch =
    fullText.match(/DATUM\s+UZAVŘENÍ\s*([0-9]{1,2}\.[0-9]{1,2}\.[0-9]{4})/i)?.[1] ??
    ascii.match(/datum uzavreni\s*([0-9]{1,2}\.[0-9]{1,2}\.[0-9]{4})/i)?.[1];
  const signedIso = toDateInput(signedMatch);
  if (signedIso) {
    result.contractSignedDate = signedIso;
  }

  // Doba trvání smlouvy
  const durationMatch =
    fullText.match(/Doba\s+trvání\s+smlouvy\s*([0-9]{1,2})/i)?.[1] ??
    ascii.match(/doba trvani smlouvy\s*([0-9]{1,2})/i)?.[1];
  if (durationMatch) {
    const yrs = Number.parseInt(durationMatch, 10);
    if (Number.isFinite(yrs)) {
      result.durationYears = Math.min(15, Math.max(1, yrs));
    }
  }

  // Měsíční pojistné včetně slev a přirážek
  const amountMatch =
    fullText.match(/Měsíční\s+pojistné\s+včetně\s+slev\s+a\s+přirážek\s+celkem\s+v\s+Kč\s*([0-9\s.,]+)/i)?.[1] ??
    ascii.match(/mesicni pojistne vcetne slev a prirazek celkem v kc\s*([0-9\s.,]+)/i)?.[1];
  const amount = parseAmount(amountMatch);
  if (amount != null) {
    result.amount = amount;
  }

  // NEON je měsíční frekvence
  result.frequency = "monthly";

  return result;
}
