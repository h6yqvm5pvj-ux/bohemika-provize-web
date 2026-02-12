// src/app/lib/parseComfortPdf.ts

export type ComfortPdfResult = {
  contractNumber?: string | null;
  clientName?: string | null;
  amount?: number | null;
  comfortPayment?: number | null;
};

const stripDiacritics = (text: string) =>
  text.normalize("NFD").replace(/\p{Diacritic}/gu, "");

const parseAmount = (val: string | null | undefined): number | null => {
  if (!val) return null;
  const cleaned = val.replace(/\s+/g, "").replace(",", ".").trim();
  const num = Number.parseFloat(cleaned);
  return Number.isFinite(num) ? Math.round(num) : null;
};

const compactLines = (raw: string | null | undefined): string[] =>
  (raw ?? "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

const lastLineOrNull = (raw: string | null | undefined): string | null => {
  const lines = compactLines(raw);
  return lines.length > 0 ? lines[lines.length - 1] : null;
};

const looksLikeAmountLine = (line: string): boolean =>
  /[0-9]/.test(line) && /kč|kc/i.test(line);

const parseAmountFromLine = (line: string | null | undefined): number | null => {
  if (!line) return null;
  const m = line.match(/([0-9][0-9\s]*(?:[.,][0-9]+)?)\s*(?:kč|kc)/i)?.[1];
  return parseAmount(m ?? null);
};

const previousNonEmptyLine = (lines: string[], fromIndex: number): string | null => {
  for (let i = fromIndex - 1; i >= 0; i--) {
    const line = lines[i]?.trim();
    if (line) return line;
  }
  return null;
};

export async function parseComfortPdf(file: File): Promise<ComfortPdfResult> {
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
  const lines = compactLines(fullText);
  const asciiLines = lines.map((line) => stripDiacritics(line).toLowerCase());
  const result: ComfortPdfResult = {};

  // 1) Jméno klienta: řádek nad "Titul Jméno Příjmení / Společnost"
  const titleLineIdx = asciiLines.findIndex((line) =>
    /titul\s+jmeno\s+prijmeni\s*\/\s*spolecnost/.test(line)
  );
  if (titleLineIdx >= 0) {
    const candidateName = previousNonEmptyLine(lines, titleLineIdx);
    if (candidateName && !/^kupujici:?$/i.test(stripDiacritics(candidateName))) {
      result.clientName = candidateName;
    }
  } else {
    const clientBlock =
      fullText.match(
        /Kupující:\s*([\s\S]{0,220}?)Titul\s+Jméno\s+Příjmení\s*\/\s*Společnost/i
      )?.[1] ??
      fullText.match(
        /Kupujici:\s*([\s\S]{0,220}?)Titul\s+Jmeno\s+Prijmeni\s*\/\s*Spolecnost/i
      )?.[1];
    const clientName = lastLineOrNull(clientBlock);
    if (clientName) result.clientName = clientName;
  }

  // 2) Číslo smlouvy: číslo nad textem "Variabilní symbol"
  for (let i = 0; i < asciiLines.length; i++) {
    if (!/variabilni\s+symbol/.test(asciiLines[i])) continue;
    const prev = previousNonEmptyLine(lines, i);
    const digits = (prev ?? "").replace(/\D+/g, "");
    if (digits.length >= 6) {
      result.contractNumber = digits;
      break;
    }
  }

  // 3) Pravidelná platba: v sekci "TRVALÝ PŘÍKAZ K ÚHRADĚ", sloupec "Částka"
  let regularPayment: number | null = null;
  const standingOrderIdx = asciiLines.findIndex((line) =>
    /trvaly\s+prikaz\s+k\s+uhrade/.test(line)
  );
  if (standingOrderIdx >= 0) {
    for (let i = standingOrderIdx + 1; i < lines.length; i++) {
      if (looksLikeAmountLine(lines[i])) {
        regularPayment = parseAmountFromLine(lines[i]);
        if (regularPayment != null) break;
      }
      // bezpečnostní stop, kdyby layout byl úplně jiný
      if (i > standingOrderIdx + 60) break;
    }
  }
  if (regularPayment != null) {
    result.comfortPayment = regularPayment;
  }

  // 4) Poplatek: "1. platba v celkové výši" MINUS "částka" z tabulky
  let firstPayment: number | null = null;
  const firstPaymentIdx = asciiLines.findIndex((line) =>
    /1\.\s*platba\s+v\s+celkove\s+vysi/.test(line)
  );
  if (firstPaymentIdx >= 0) {
    const prevLine = previousNonEmptyLine(lines, firstPaymentIdx);
    firstPayment = parseAmountFromLine(prevLine);
  }

  if (firstPayment != null && regularPayment != null) {
    const fee = firstPayment - regularPayment;
    if (Number.isFinite(fee) && fee > 0) {
      result.amount = Math.round(fee);
    }
  }

  return result;
}
