// src/app/lib/parseCppAutoPdf.ts
import { type PaymentFrequency } from "../types/domain";

export type CppAutoPdfResult = {
  contractNumber?: string | null;
  clientName?: string | null;
  policyStartDate?: string | null;
  contractSignedDate?: string | null;
  amount?: number | null;
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
  const iso = `${y.toString().padStart(4, "0")}-${mm
    .toString()
    .padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
  return iso;
};

const stripDiacritics = (text: string) =>
  text.normalize("NFD").replace(/\p{Diacritic}/gu, "");

const parseAmount = (val: string | null | undefined): number | null => {
  if (!val) return null;
  const cleaned = val.replace(/\s+/g, "").replace(",", ".").trim();
  const num = Number.parseFloat(cleaned);
  return Number.isFinite(num) ? Math.round(num) : null;
};

export async function parseCppAutoPdf(file: File): Promise<CppAutoPdfResult> {
  const buffer = await file.arrayBuffer();
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

  // Worker z public/ prohlížeče, aby se nic nestahovalo externě.
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

  const result: CppAutoPdfResult = {};

  // Číslo smlouvy – vezmeme poslední číslo po hlavičce "Číslo návrhu..."
  const pageOne = pagesText[0] ?? "";
  const splitAfterHeading = pageOne.split(/Číslo\s+n[áa]vrhu\s+pojistn[eé]\s+smlouvy/i);
  if (splitAfterHeading.length > 1) {
    const nums = splitAfterHeading[1].match(/\b\d{6,}\b/g);
    if (nums?.length) {
      result.contractNumber = nums[nums.length - 1];
    }
  }
  // Fallback: nejčastější 10místné číslo v celém PDF
  if (!result.contractNumber) {
    const matches = fullText.match(/\b\d{8,12}\b/g) ?? [];
    const counts = new Map<string, number>();
    matches.forEach((n) => counts.set(n, (counts.get(n) ?? 0) + 1));
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) {
      result.contractNumber = sorted[0][0];
    }
  }

  // Jméno + příjmení
  const firstName =
    pageOne.match(/Jm[eé]no:\s*([^\n]+)/i)?.[1]?.trim() ??
    pageOne.match(/Jmeno:\s*([^\n]+)/i)?.[1]?.trim();
  const lastName =
    pageOne.match(/Př[ií]jmen[ií]:\s*([^\n]+)/i)?.[1]?.trim() ??
    pageOne.match(/Prijmeni:\s*([^\n]+)/i)?.[1]?.trim();
  if (firstName || lastName) {
    result.clientName = [firstName, lastName].filter(Boolean).join(" ").trim() || null;
  }

  // Počátek pojištění
  const startDateMatch =
    fullText.match(/Počátek\s+pojištění:\s*([0-9]{1,2}\.[0-9]{1,2}\.[0-9]{4})/i)?.[1] ??
    ascii.match(/pocatek pojisteni:\s*([0-9]{1,2}\.[0-9]{1,2}\.[0-9]{4})/i)?.[1];
  const startIso = toDateInput(startDateMatch);
  if (startIso) {
    result.policyStartDate = startIso;
  }

  // Datum sjednání
  const signedMatch = fullText.match(
    /N[áa]vrh\s+pojistn[eé]\s+smlouvy\s+vyhotoven\s+dne:\s*([0-9]{1,2}\.[0-9]{1,2}\.[0-9]{4})/i
  )?.[1];
  const signedIso = toDateInput(signedMatch);
  if (signedIso) {
    result.contractSignedDate = signedIso;
  }

  // Frekvence platby
  const freqMatch = ascii.match(/pojistne obdobi:\s*([a-z]+)/i);
  if (freqMatch?.[1]) {
    const word = freqMatch[1];
    if (word.startsWith("ctvrt")) result.frequency = "quarterly";
    else if (word.startsWith("polo")) result.frequency = "semiannual";
    else if (word.startsWith("roc")) result.frequency = "annual";
    else if (word.startsWith("mesic")) result.frequency = "monthly";
  }

  // Částka k úhradě
  const amountMatch =
    ascii.match(/pojistne za pojistne obdobi[^0-9]+([0-9\s]+(?:[.,]\d+)?)/i)?.[1] ??
    ascii.match(/castka k uhrade[^0-9]+([0-9\s]+(?:[.,]\d+)?)/i)?.[1];
  const amount = parseAmount(amountMatch);
  if (amount != null) {
    result.amount = amount;
  }

  return result;
}
