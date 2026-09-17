import type { PaymentFrequency } from "../types/domain";

export type CppKomplexPdfResult = {
  contractNumber?: string;
  clientName?: string;
  companyId?: string;
  policyStartDate?: string;
  policyEndDate?: string;
  contractSignedDate?: string;
  annualPremium?: number;
  amount?: number;
  frequency?: PaymentFrequency;
  pdfImportWarnings?: string[];
};

const clean = (value: string) => value.normalize("NFC").replace(/\s+/g, " ").trim();
const ascii = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const datePattern = "(\\d{1,2}\\.\\s*\\d{1,2}\\.\\s*\\d{4})";
const moneyPattern = "(\\d[\\d \\u00a0\\u202f]*(?:[,.]\\d{1,2})?)\\s*K[cč]\\b";

function dateAfter(text: string, label: string): string | undefined {
  const raw = text.match(new RegExp(`${label}\\s*:?\\s*${datePattern}`, "i"))?.[1];
  if (!raw) return undefined;
  const [day, month, year] = raw.split(".").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return date.toISOString().slice(0, 10);
}

function moneyAfter(text: string, label: string): number | undefined {
  const raw = text.match(new RegExp(`${label}\\s*:?\\s*${moneyPattern}`, "i"))?.[1];
  if (!raw) return undefined;
  const value = Number(raw.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(value) ? value : undefined;
}

const policyholderStart = /^pojistnik(?:\s*\([^)]*\))?\s*:\s*/im;
const policyholderEnd = /\b(?:sidlo|bydliste|adresa|ico|ic|rodne cislo|datum narozeni|platce dph|telefon|e-mail|jednajici osoba)\s*:/i;

/** Only labelled policyholder sections can supply identity data. Insurer and
 * distributor identifiers elsewhere in the contract are never fallbacks. */
export function extractCppKomplexPolicyholder(lines: readonly string[]): { clientName?: string; companyId?: string } {
  const text = lines.map(clean).filter(Boolean).join("\n");
  const normalized = ascii(text);
  const opening = normalized.match(policyholderStart);
  if (opening?.index == null) return {};
  const offset = opening.index + opening[0].length;
  const tail = text.slice(offset);
  const normalizedTail = ascii(tail);
  const boundary = normalizedTail.search(/(?:^|\n)(?:pojisteny(?:\s*\([^)]*\))?\s*:|pojistitel\b|distributor\b|clanek\b|pocatek pojisteni\s*:|pojistnik\b)/i);
  const section = tail.slice(0, boundary < 0 ? 2000 : Math.min(boundary, 2000));
  const endOfName = ascii(section).search(policyholderEnd);
  const name = clean(endOfName < 0 ? section.split("\n")[0] : section.slice(0, endOfName))
    .replace(/^(?:obchodn[ií] (?:jm[eé]no|firma)|n[aá]zev(?: firmy)?|jm[eé]no a p[řr][ií]jmen[ií])\s*:\s*/i, "");
  const companyIds = [...ascii(section).matchAll(/\bico\s*:\s*((?:\d[ \t]*){8})(?!\d)/g)]
    .map(match => match[1].replace(/\s/g, ""));
  const uniqueIds = new Set(companyIds);
  return {
    ...(/[\p{L}]/u.test(name) && name.length <= 200 ? { clientName: name } : {}),
    ...(uniqueIds.size === 1 ? { companyId: [...uniqueIds][0] } : {}),
  };
}

export function parseCppKomplexLines(lines: readonly string[]): CppKomplexPdfResult {
  const normalized = ascii(lines.map(clean).join("\n"));
  if (!/ceska\s+podnikatelska\s+pojistovna/.test(normalized) || !/\bkomplex\b/.test(normalized)) return {};
  const result: CppKomplexPdfResult = extractCppKomplexPolicyholder(lines);
  // The barcode above this label has extra digits; preserve the leading zeros
  // of the labelled policy number instead.
  result.contractNumber = normalized.match(/cislo\s+(?:nabidky\s+)?pojistne\s+smlouvy\s*:?\s*(\d{6,14})(?!\d)/)?.[1];
  result.policyStartDate = dateAfter(normalized, "pocatek\\s+pojisteni");
  result.policyEndDate = dateAfter(normalized, "konec\\s+pojisteni");
  result.contractSignedDate = dateAfter(normalized, "(?:datum\\s+sjednani|smlouva\\s+uzavrena\\s+dne)")
    ?? dateAfter(normalized, "nabidka\\s+vytvorena\\s+dne");
  result.annualPremium = moneyAfter(normalized, "celkove\\s+pojistne\\s+za\\s+sjednane\\s+pojistne\\s+obdobi\\s+po\\s+slevach");

  // Do not scan boilerplate for frequency words: all three can occur there.
  const frequencyText = normalized.match(/frekvence\s+plateb\s*:\s*((?:\d+\s+splat\w*\s*)?(?:\(\s*)?(?:ctvrtletni|pololetni|rocni)?(?:\s*\))?)/)?.[1] ?? "";
  const count = frequencyText.match(/^(\d+)\s+splat/)?.[1];
  const fromCount = count === "1" ? "annual" : count === "2" ? "semiannual" : count === "4" ? "quarterly" : undefined;
  const fromName = /ctvrtletni/.test(frequencyText) ? "quarterly" : /pololetni/.test(frequencyText) ? "semiannual" : /rocni/.test(frequencyText) ? "annual" : undefined;
  if ((count && !fromCount) || (fromCount && fromName && fromCount !== fromName)) {
    result.pdfImportWarnings = ["Frekvence plateb: počet splátek a uvedené období si neodpovídají."];
  } else {
    result.frequency = fromCount ?? fromName;
  }
  const periods = result.frequency === "quarterly" ? 4 : result.frequency === "semiannual" ? 2 : result.frequency === "annual" ? 1 : null;
  const installment = moneyAfter(normalized, "prvni\\s+splatka\\s+pojistneho");
  result.amount = installment ?? (periods && result.annualPremium != null ? Math.round(result.annualPremium / periods * 100) / 100 : undefined);
  if (periods && installment != null && result.annualPremium != null && Math.abs(installment * periods - result.annualPremium) > periods / 2) {
    result.pdfImportWarnings = ["Pojistné: součet splátek se liší od ročního pojistného po slevách."];
  }
  return result;
}

export async function parseCppKomplexPdf(file: File): Promise<CppKomplexPdfResult> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  }
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false });
  try {
    const document = await task.promise;
    const lines: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const rows: { y: number; items: { x: number; text: string }[] }[] = [];
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        const y = item.transform[5];
        let row = rows.find(candidate => Math.abs(candidate.y - y) < 2);
        if (!row) { row = { y, items: [] }; rows.push(row); }
        row.items.push({ x: item.transform[4], text: item.str });
      }
      lines.push(...rows.sort((a, b) => b.y - a.y).map(row => row.items.sort((a, b) => a.x - b.x).map(item => item.text).join(" ")));
      page.cleanup();
    }
    return parseCppKomplexLines(lines);
  } finally {
    await task.destroy();
  }
}
