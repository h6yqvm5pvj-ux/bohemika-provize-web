import { readPdfText, type PdfReadOptions } from "./pdfDocumentText";
// src/app/lib/parseDomexPdf.ts
import { type PaymentFrequency } from "../types/domain";
import { normalizeContractPaymentDetails, type ContractPaymentDetails } from "./contractPaymentDetails";

export type DomexPdfResult = {
  isRefresh?: boolean | null;
  refreshOriginalContractNumber?: string | null;
  contractNumber?: string | null;
  clientName?: string | null;
  policyStartDate?: string | null;
  policyEndDate?: string | null;
  /** Printed end of the current term, even when the policy renews automatically. */
  policyTermEndDate?: string | null;
  automaticRenewal?: boolean | null;
  contractSignedDate?: string | null;
  amount?: number | null;
  annualPremium?: number | null;
  frequency?: PaymentFrequency | null;
  pdfImportWarnings?: string[];
  paymentDetails?: ContractPaymentDetails | null;
  domexAddress?: string | null;
  domexPropertyType?: string | null;
  domexPropertyCoverage?: string | null;
  domexPropertySumInsured?: number | null;
  domexPropertyDeductible?: number | null;
  domexHouseholdType?: string | null;
  domexHouseholdCoverage?: string | null;
  domexHouseholdSumInsured?: number | null;
  domexHouseholdDeductible?: number | null;
  domexLiabilitySumInsured?: number | null;
  domexLiabilityDeductible?: number | null;
  domexLiabilityMobile?: boolean | null;
  domexLiabilityTenant?: boolean | null;
  domexLiabilityLandlord?: boolean | null;
  domexAssistancePlus?: boolean | null;
};

type PositionedTextItem = {
  str: string;
  x: number;
  y: number;
  width: number;
};

const LINE_Y_TOLERANCE = 2;
const WORD_GAP_THRESHOLD = 1.5;

const parseDomexPaymentDetails = (
  pages: string[][],
  contractNumber: string | null | undefined,
  allowContractNumberFallback: boolean,
): ContractPaymentDetails | null => {
  if (!contractNumber || !/^\d{6,10}$/.test(contractNumber)) return null;
  let payment: ContractPaymentDetails | null = null;
  const labelPattern = /^(castka\s+k\s+uhrade|cislo\s+uctu|variabilni\s+symbol|datum\s+splatnosti)\s*:?\s*(.*)$/;

  for (const page of pages) {
    const normalized = page.map(normalizeSearchText);
    for (let index = 0; index < normalized.length; index++) {
      if (!/^castka\s+k\s+uhrade\b/.test(normalized[index])) continue;
      const values = new Map<string, string>();
      // Payment labels and their values form one adjacent block on one page.
      for (let step = 0; step < 8 && index + step < normalized.length; step++) {
        const match = normalized[index + step].match(labelPattern);
        if (!match) break;
        const [, label, inline] = match;
        if (step > 0 && label === "castka k uhrade") break;
        if (values.has(label)) return null;
        let value = inline.trim();
        if (!value) {
          const next = normalized[index + step + 1];
          if (!next || labelPattern.test(next)) return null;
          value = next;
          step += 1;
        }
        values.set(label, value);
      }
      const rawAmount = values.get("castka k uhrade");
      const amountMatch = rawAmount?.match(/^((?:\d+|\d{1,3}(?: \d{3})+)(?:[.,]\d{1,2})?)\s*(?:kc|czk)$/);
      const amount = amountMatch ? Number(amountMatch[1].replace(/ /g, "").replace(",", ".")) : null;
      const explicitSymbol = values.get("variabilni symbol");
      if (explicitSymbol !== undefined && explicitSymbol !== contractNumber) return null;
      const rawDueDate = values.get("datum splatnosti");
      const dueDate = rawDueDate && /^\d{1,2}\.\s*\d{1,2}\.\s*\d{4}$/.test(rawDueDate) ? toDateInput(rawDueDate) : null;
      if (rawDueDate !== undefined && !dueDate) return null;
      const candidate = normalizeContractPaymentDetails({
        amount,
        accountNumber: values.get("cislo uctu"),
        variableSymbol: explicitSymbol ?? (allowContractNumberFallback ? contractNumber : null),
        dueDate,
      });
      if (!candidate) return null;
      if (payment && JSON.stringify(payment) !== JSON.stringify(candidate)) return null;
      payment = candidate;
    }
  }
  return payment;
};

const toDateInput = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const m = value.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  if (!m) return null;
  const [, dRaw, mRaw, yRaw] = m;
  const d = Number(dRaw);
  const mm = Number(mRaw);
  const y = Number(yRaw);
  const date = new Date(Date.UTC(y, mm - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mm - 1 || date.getUTCDate() !== d) return null;
  return `${y.toString().padStart(4, "0")}-${mm.toString().padStart(2, "0")}-${d
    .toString()
    .padStart(2, "0")}`;
};

const parseAmount = (val: string | null | undefined): number | null => {
  if (!val) return null;
  const candidate =
    val
      .replace(/\u00A0/g, " ")
      .match(/([0-9][0-9\s]*(?:[.,][0-9]{1,2})?)/)?.[1] ?? null;
  if (!candidate) return null;
  const cleaned = candidate.replace(/\s+/g, "").replace(",", ".").trim();
  const num = Number.parseFloat(cleaned);
  return Number.isFinite(num) ? Math.round(num * 100) / 100 : null;
};

const stripDiacritics = (text: string) =>
  text.normalize("NFD").replace(/\p{Diacritic}/gu, "");

const normalizeSearchText = (text: string) =>
  stripDiacritics(text)
    .toLowerCase()
    .replace(/\bpfijmeni\b/g, "prijmeni")
    .replace(/\bpfedmet\b/g, "predmet")
    .replace(/\bpfedmetu\b/g, "predmetu")
    .replace(/\s+/g, " ")
    .trim();

const findLabelIndexes = (asciiLines: string[], label: RegExp): number[] => {
  const indexes: number[] = [];
  asciiLines.forEach((line, idx) => {
    if (label.test(line)) indexes.push(idx);
  });
  return indexes;
};

const normalizeDomexPropertyType = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const ascii = stripDiacritics(value).toLowerCase();
  if (ascii.includes("rodinny dum")) return "dum";
  if (ascii.includes("byt")) return "byt";
  if (ascii.includes("vedlejsi stavba") || ascii.includes("garaz")) return "ostatni";
  if (ascii.includes("rekreacni stavba")) return "rekreace";
  return null;
};

const normalizeDomexHouseholdType = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const ascii = stripDiacritics(value).toLowerCase();
  if (ascii.includes("trvale obydlena domacnost")) return "trvale";
  if (ascii.includes("rekreacni domacnost")) return "rekreacni";
  return null;
};

const normalizeDomexCoverage = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const ascii = stripDiacritics(value).toLowerCase();
  if (/\bmini\b/.test(ascii)) return "mini";
  if (/\bopti\b/.test(ascii)) return "opti";
  if (/\bmaxi\b/.test(ascii)) return "maxi";
  if (/\bnop\b/.test(ascii)) return "nop";
  return null;
};

const pickLastLongNumber = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const matches = value.match(/\b\d{6,}\b/g);
  if (!matches?.length) return null;
  return matches[matches.length - 1] ?? null;
};

const pickFirstLongNumber = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const matches = value.match(/\b\d{6,}\b/g);
  if (!matches?.length) return null;
  return matches[0] ?? null;
};

const normalizeDomexClientName = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const cleaned = value
    .replace(/\s+(?:Rodn[eé]|Rodne)\s+c[ií]s(?:lo|io)\b.*$/i, "")
    .replace(/\s+R[ČC]\b.*$/i, "")
    .replace(/\s+Telefon\b.*$/i, "")
    .replace(/\s+E-?mail\b.*$/i, "")
    .replace(/\s+Trval[ýy]\s+pobyt\b.*$/i, "")
    .replace(/\s+Datum\s+narozen[ií]\b.*$/i, "")
    .replace(/^[\s:;,\-–—]+|[\s:;,\-–—]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length < 3) return null;
  if (/\d/.test(cleaned)) return null;
  if (!/[A-Za-zÀ-ž]/.test(cleaned)) return null;
  return cleaned;
};

const pickDomexValueAfterLabel = (
  lines: string[],
  asciiLines: string[],
  label: RegExp,
  stripLabel: RegExp,
  maxLookahead = 4
): string | null => {
  for (let idx = 0; idx < asciiLines.length; idx++) {
    if (!label.test(asciiLines[idx] ?? "")) continue;

    const current = (lines[idx] ?? "").replace(stripLabel, "").trim();
    if (current && !label.test(normalizeSearchText(current))) return current;

    for (let step = 1; step <= maxLookahead; step++) {
      const next = lines[idx + step]?.trim();
      const nextAscii = asciiLines[idx + step] ?? "";
      if (!next) continue;
      if (
        /^(rodne\s+cis(?:lo|io)|datum\s+narozeni|telefon|e-?mail|trvaly\s+pobyt|bydliste|statni\s+prislusnost|elektronicka\s+komunikace|pojisteny|misto\s+pojisteni|adresa|tarifni\s+zona)\b/.test(
          nextAscii
        )
      ) {
        break;
      }
      return next;
    }
  }
  return null;
};

const parseAmountAtOrAfterLine = (
  lines: string[],
  startIndex: number,
  maxLookahead = 2
): number | null => {
  for (let step = 0; step <= maxLookahead; step++) {
    const amount = parseAmount(lines[startIndex + step] ?? "");
    if (amount != null) return amount;
  }
  return null;
};

const pickDomexReplacementOriginalContractNumber = (
  lines: string[],
  asciiLines: string[]
): string | null => {
  for (let idx = 0; idx < asciiLines.length; idx++) {
    const asciiLine = asciiLines[idx] ?? "";
    if (!/nahrada\s+smlouvy/i.test(asciiLine)) continue;

    const currentLineNumber = pickFirstLongNumber(lines[idx] ?? "");
    if (currentLineNumber) return currentLineNumber;

    // V horním bloku náhrady je pod spojenými popisky řádek se dvěma čísly.
    // Levý sloupec patří nahrazované smlouvě, pravý nové pojistné smlouvě.
    for (let step = 1; step <= 3; step++) {
      const nextLine = lines[idx + step] ?? "";
      if (!nextLine) continue;
      const nextLineNumber = pickFirstLongNumber(nextLine);
      if (nextLineNumber) return nextLineNumber;
    }
  }
  return null;
};

const pickDomexPolicyContractNumber = (lines: string[], asciiLines: string[]): string | null => {
  for (let idx = 0; idx < asciiLines.length; idx++) {
    const asciiLine = asciiLines[idx] ?? "";
    if (!/cislo\s+pojistne\s+smlouvy/i.test(asciiLine)) continue;

    const currentLineNumber = pickLastLongNumber(lines[idx] ?? "");
    if (currentLineNumber) return currentLineNumber;

    // V náhradách bývá na dalším řádku víc čísel (např. "náhrada" + nová smlouva).
    // Bereme vždy poslední číslo na řádku, tj. pravý sloupec "Číslo pojistné smlouvy".
    for (let step = 1; step <= 3; step++) {
      const nextLine = lines[idx + step] ?? "";
      if (!nextLine) continue;
      const nextLineNumber = pickLastLongNumber(nextLine);
      if (nextLineNumber) return nextLineNumber;
    }
  }
  return null;
};

async function extractLayoutLinesFromPage(page: any): Promise<string[]> {
  const content = { items: page.items };
  const rawItems = (content?.items ?? []) as Array<{
    str?: unknown;
    transform?: number[];
    width?: number;
  }>;

  const items: PositionedTextItem[] = rawItems
    .map((item) => {
      const str = typeof item?.str === "string" ? item.str : "";
      return {
        str: str.trim(),
        x: item?.transform?.[4] ?? 0,
        y: item?.transform?.[5] ?? 0,
        width: item?.width ?? 0,
      };
    })
    .filter((item) => item.str.length > 0)
    .sort((a, b) => {
      if (Math.abs(a.y - b.y) > LINE_Y_TOLERANCE) return b.y - a.y;
      return a.x - b.x;
    });

  const rows: { y: number; items: PositionedTextItem[] }[] = [];
  items.forEach((item) => {
    let row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= LINE_Y_TOLERANCE);
    if (!row) {
      row = { y: item.y, items: [] };
      rows.push(row);
    }
    row.items.push(item);
  });
  rows.sort((a, b) => b.y - a.y);

  return rows
    .map((row) => {
      row.items.sort((a, b) => a.x - b.x);
      let line = "";
      let prevEndX = 0;
      let hasPrev = false;
      row.items.forEach((item) => {
        if (!hasPrev) {
          line += item.str;
          prevEndX = item.x + item.width;
          hasPrev = true;
          return;
        }
        const gap = item.x - prevEndX;
        if (gap > WORD_GAP_THRESHOLD) line += " ";
        line += item.str;
        prevEndX = item.x + item.width;
      });
      return line.replace(/\s+/g, " ").trim();
    })
    .filter(Boolean);
}

export async function parseDomexPdf(file: File, options: PdfReadOptions = {}): Promise<DomexPdfResult> {
  const doc = await readPdfText(file, options);
  const lines: string[] = [];
  const pages: string[][] = [];

  for (let i = 1; i <= doc.pages.length; i++) {
    const page = doc.pages[i - 1];
    const pageLines = await extractLayoutLinesFromPage(page);
    pages.push(pageLines);
    lines.push(...pageLines);
  }

  const fullText = lines.join("\n");
  const asciiLines = lines.map(normalizeSearchText);
  const normalized = fullText.replace(/\s+/g, " ").trim();
  const ascii = normalizeSearchText(normalized);

  const result: DomexPdfResult = {};
  const warnings: string[] = [];
  const sharedSectionIndex = asciiLines.findIndex((line) => /^spolecna\s+ustanoveni\b/.test(line));
  const sharedText = normalizeSearchText(
    (sharedSectionIndex >= 0 ? lines.slice(sharedSectionIndex) : lines).join(" ")
  );

  // Náhrada smlouvy -> číslo nahrazované smlouvy.
  const replacementOriginalContractNumber = pickDomexReplacementOriginalContractNumber(
    lines,
    asciiLines
  );
  if (replacementOriginalContractNumber) {
    result.isRefresh = true;
    result.refreshOriginalContractNumber = replacementOriginalContractNumber;
  }

  // Číslo smlouvy / nabídky
  const contractFromPolicyLabel = pickDomexPolicyContractNumber(lines, asciiLines);
  if (contractFromPolicyLabel) {
    result.contractNumber = contractFromPolicyLabel;
  } else {
    const contractMatch =
      fullText.match(/Číslo\s+pojistné\s+smlouvy[^\d]*([\d\s]{6,30})/i)?.[1] ??
      ascii.match(/cislo pojistne smlouvy[^\d]*([\d\s]{6,30})/i)?.[1] ??
      fullText.match(/Číslo\s+nabídky\s+pojistné\s+smlouvy[^\d]*([\d\s]{6,30})/i)?.[1] ??
      ascii.match(/cislo nabidky pojistne smlouvy[^\d]*([\d\s]{6,30})/i)?.[1];
    const digits = pickLastLongNumber(contractMatch);
    if (digits) result.contractNumber = digits;
  }
  const paymentDetails = parseDomexPaymentDetails(pages, result.contractNumber, Boolean(contractFromPolicyLabel));
  if (paymentDetails) result.paymentDetails = paymentDetails;

  // Jméno a příjmení pojistníka
  // An agent or an insured person can have the same label elsewhere in the PDF.
  const policyholderStart = asciiLines.findIndex((line) => /^pojistnik\s*:?$/.test(line));
  const policyholderEnd = policyholderStart >= 0
    ? asciiLines.findIndex((line, index) => index > policyholderStart && /^(?:pojisteny|misto\s+pojisteni|pojisteni\s+staveb|spolecna\s+ustanoveni)\b/.test(line))
    : -1;
  const nameLines = policyholderStart >= 0
    ? lines.slice(policyholderStart + 1, policyholderEnd >= 0 ? policyholderEnd : undefined)
    : lines;
  const nameAsciiLines = nameLines.map(normalizeSearchText);
  const nameMatch =
    normalizeDomexClientName(
      pickDomexValueAfterLabel(
        nameLines,
        nameAsciiLines,
        /jmeno\s+a\s+prijmeni\b/i,
        /Jm[eé]no\s+a\s+(?:př[ií]jmen[ií]|prijmeni|pfijmeni)\s*:?\s*/i,
        4
      )
    ) ??
    normalizeDomexClientName(
      nameLines.join(" ").match(/Jm[eé]no\s+a\s+př[ií]jmen[ií]\s*:?\s+(.+?)(?:\s+Rodn[eé]\s+č[ií]slo|$)/i)?.[1]
    );
  if (nameMatch) {
    result.clientName = nameMatch;
  }

  // Počátek pojištění
  const startMatch = sharedText.match(/pocatek\s+pojisteni\s*:?\s*(\d{1,2}\.\s*\d{1,2}\.\s*\d{4})/i)?.[1];
  const startIso = toDateInput(startMatch);
  if (startIso) {
    result.policyStartDate = startIso;
  }

  const endMatch = sharedText.match(/konec\s+pojisteni\s*:?\s*(\d{1,2}\.\s*\d{1,2}\.\s*\d{4})/i)?.[1];
  const endIso = toDateInput(endMatch);
  const renewalLabel = /automaticka\s+obnova\s+ke\s+konci\s+pojistneho\s+obdobi\s*:?\s*(ano|ne)\b/i;
  const renewalMatch = sharedText.match(renewalLabel)?.[1];
  if (renewalMatch) result.automaticRenewal = renewalMatch === "ano";
  if (endIso) result.policyTermEndDate = endIso;
  if (result.automaticRenewal === true) {
    result.policyEndDate = null;
  } else if (result.automaticRenewal === false) {
    result.policyEndDate = endIso;
    if (!endIso) warnings.push("Prolongace: smlouva se automaticky neobnovuje, ale datum konce pojištění chybí nebo je neplatné.");
  } else if (endIso || /automaticka\s+obnova\s+ke\s+konci\s+pojistneho\s+obdobi/i.test(sharedText)) {
    // A term end alone does not say whether an automatically renewed policy ends.
    warnings.push("Prolongace: ověř ANO / NE a datum konce pojištění podle PDF.");
  }

  // The actual signing date takes priority over creation/printing dates.
  const signedMatch =
    ascii.match(/pojistna\s+smlouva\s+uzavrena\s+dne\s*:?\s*([0-9]{1,2}\.\s*[0-9]{1,2}\.\s*[0-9]{4})/i)?.[1] ??
    fullText.match(/Nabídka\s+vytvořena\s+dne:?\s*([0-9]{1,2}\.\s*[0-9]{1,2}\.\s*[0-9]{4})/i)?.[1] ??
    ascii.match(/nabidka vytvorena dne:?\s*([0-9]{1,2}\.\s*[0-9]{1,2}\.\s*[0-9]{4})/i)?.[1];
  const signedFallbackFromFooter =
    fullText.match(/Tisk\s+SUS\s+Plus[^\d]*([0-9]{1,2}\.\s*[0-9]{1,2}\.\s*[0-9]{4})/i)?.[1] ??
    ascii.match(/tisk\s+sus\s+plus[^\d]*([0-9]{1,2}\.\s*[0-9]{1,2}\.\s*[0-9]{4})/i)?.[1];
  const signedIso = toDateInput(signedMatch ?? signedFallbackFromFooter);
  if (signedIso) {
    result.contractSignedDate = signedIso;
  }

  // Frekvence splátek
  const freqMatch =
    sharedText.match(/frekvence\s+placeni\s*:?\s*([a-z]+)/i)?.[1] ??
    sharedText.match(/frekvence\s+splatek\s+pojistneho\s*:?\s*([a-z]+)/i)?.[1] ??
    // In Neuron the annual insurance term is independent of payment frequency.
    (!/frekvence\s+placeni\b/i.test(sharedText)
      ? sharedText.match(/pojistne\s+obdobi\s*:?\s*([a-z]+)/i)?.[1]
      : undefined);
  if (freqMatch) {
    if (freqMatch.startsWith("ctvrt")) result.frequency = "quarterly";
    else if (freqMatch.startsWith("polo")) result.frequency = "semiannual";
    else if (freqMatch.startsWith("roc")) result.frequency = "annual";
    else if (freqMatch.startsWith("mesic")) result.frequency = "monthly";
  }

  // Výše platby
  const amountMatch =
    sharedText.match(/vyse\s+pravidelne\s+platby\s*:?\s*([\d\s.,]+)/i)?.[1] ??
    sharedText.match(/vyse\s+platby\s*:?\s*([\d\s.,]+)/i)?.[1];
  const amount = parseAmount(amountMatch);
  if (amount != null) {
    result.amount = amount;
  }

  const annualPremium = parseAmount(sharedText.match(/rocni\s+pojistne\s+po\s+slevach\s+a\s+prirazkach\s*:?\s*([\d\s.,]+)/i)?.[1]);
  if (annualPremium != null) result.annualPremium = annualPremium;
  const periods = result.frequency === "quarterly" ? 4 : result.frequency === "semiannual" ? 2 : result.frequency === "annual" ? 1 : result.frequency === "monthly" ? 12 : null;
  if (amount != null && annualPremium != null && periods && Math.abs(amount * periods - annualPremium) > periods / 2) {
    warnings.push("Pojistné: součet pravidelných plateb podle frekvence se liší od ročního pojistného po slevách a přirážkách.");
  }
  if (warnings.length) result.pdfImportWarnings = warnings;

  // Místo pojištění -> adresa
  const placeIndexes = findLabelIndexes(asciiLines, /misto\s+pojisteni/i);
  for (const idx of placeIndexes) {
    for (let step = 1; step <= 8; step++) {
      const line = lines[idx + step]?.trim();
      const asciiLine = asciiLines[idx + step] ?? "";
      if (!line) continue;
      if (!/^adresa\b/i.test(asciiLine)) continue;
      const inline = line.replace(/^Adresa\s*/i, "").trim();
      if (inline) {
        result.domexAddress = inline;
      } else {
        const nextLine = lines[idx + step + 1]?.trim() ?? "";
        if (nextLine) result.domexAddress = nextLine;
      }
      break;
    }
    if (result.domexAddress) break;
  }

  // Pojištění staveb -> předmět pojištění (typ nemovitosti)
  const buildingIndexes = findLabelIndexes(asciiLines, /pojisteni\s+staveb/i);
  for (const idx of buildingIndexes) {
    for (let step = 1; step <= 12; step++) {
      const line = lines[idx + step]?.trim();
      const asciiLine = asciiLines[idx + step] ?? "";
      if (!line) continue;
      if (!/^predmet\s+pojisteni\b/i.test(asciiLine)) continue;
      const rawType = line.replace(/^Předmět\s+pojištění\s*/i, "").trim();
      const typeCandidates = [
        rawType,
        lines[idx + step + 1],
        lines[idx + step + 2],
        lines[idx + step + 3],
      ];
      for (const candidate of typeCandidates) {
        const normalizedType = normalizeDomexPropertyType(candidate);
        if (normalizedType) {
          result.domexPropertyType = normalizedType;
          break;
        }
      }
      break;
    }
    if (result.domexPropertyType) break;
  }

  // Pojištění domácnosti -> předmět pojištění (typ domácnosti)
  const householdIndexes = findLabelIndexes(asciiLines, /pojisteni\s+domacnosti/i);
  for (const idx of householdIndexes) {
    for (let step = 1; step <= 16; step++) {
      const line = lines[idx + step]?.trim();
      const asciiLine = asciiLines[idx + step] ?? "";
      if (!line) continue;
      if (!/^predmet\s+pojisteni\b/i.test(asciiLine)) continue;
      const rawType = line.replace(/^Předmět\s+pojištění\s*/i, "").trim();
      const typeCandidates = [
        rawType,
        lines[idx + step + 1],
        lines[idx + step + 2],
        lines[idx + step + 3],
      ];
      for (const candidate of typeCandidates) {
        const normalizedType = normalizeDomexHouseholdType(candidate);
        if (normalizedType) {
          result.domexHouseholdType = normalizedType;
          break;
        }
      }
      break;
    }
    if (result.domexHouseholdType) break;
  }

  // Rozsah pojištění -> MINI/OPTI/MAXI/NOP (samostatně pro stavby a domácnost)
  for (const idx of buildingIndexes) {
    for (let step = 1; step <= 260; step++) {
      const pos = idx + step;
      const asciiLine = asciiLines[pos] ?? "";
      if (!asciiLine) continue;
      if (!/rozsah\s+pojisteni/i.test(asciiLine)) continue;

      const scopeChunk = [
        lines[pos],
        lines[pos + 1],
        lines[pos + 2],
        lines[pos + 3],
        lines[pos + 4],
        lines[pos + 5],
        lines[pos + 6],
      ]
        .filter(Boolean)
        .join(" ");
      const coverage = normalizeDomexCoverage(scopeChunk);
      if (coverage) {
        result.domexPropertyCoverage = coverage;
        break;
      }
    }
    if (result.domexPropertyCoverage) break;
  }

  for (const idx of householdIndexes) {
    for (let step = 1; step <= 260; step++) {
      const pos = idx + step;
      const asciiLine = asciiLines[pos] ?? "";
      if (!asciiLine) continue;
      if (!/rozsah\s+pojisteni/i.test(asciiLine)) continue;

      const scopeChunk = [
        lines[pos],
        lines[pos + 1],
        lines[pos + 2],
        lines[pos + 3],
        lines[pos + 4],
        lines[pos + 5],
        lines[pos + 6],
      ]
        .filter(Boolean)
        .join(" ");
      const coverage = normalizeDomexCoverage(scopeChunk);
      if (coverage) {
        result.domexHouseholdCoverage = coverage;
        break;
      }
    }
    if (result.domexHouseholdCoverage) break;
  }

  // Fallback: pokud není jasně rozlišitelné, vezmi první nalezený rozsah aspoň pro stavby.
  if (!result.domexPropertyCoverage && (result.domexPropertyType || buildingIndexes.length > 0)) {
    const scopeIndexes = findLabelIndexes(asciiLines, /rozsah\s+pojisteni/i);
    for (const idx of scopeIndexes) {
      const scopeChunk = [
        lines[idx],
        lines[idx + 1],
        lines[idx + 2],
        lines[idx + 3],
        lines[idx + 4],
        lines[idx + 5],
      ]
        .filter(Boolean)
        .join(" ");
      const coverage = normalizeDomexCoverage(scopeChunk);
      if (coverage) {
        result.domexPropertyCoverage = coverage;
        break;
      }
    }
  }

  // Pojistné částky, pojistné a spoluúčast -> částky samostatně pro stavby/domácnost
  const insuredSectionIndexes = findLabelIndexes(
    asciiLines,
    /pojistne\s+castky,\s*pojistne\s+a\s+spoluucast/i
  );
  for (const idx of insuredSectionIndexes) {
    let sectionContext: "building" | "household" | null = null;
    for (let step = 1; step <= 20; step++) {
      const line = lines[idx + step]?.trim() ?? "";
      const asciiLine = asciiLines[idx + step] ?? "";
      if (!line) continue;

      if (/hlavni\s+stavba\b/i.test(asciiLine)) {
        sectionContext = "building";
      } else if (
        /trvale\s+obydlena\s+domacnost\b/i.test(asciiLine) ||
        /rekreacni\s+domacnost\b/i.test(asciiLine)
      ) {
        sectionContext = "household";
        if (!result.domexHouseholdType) {
          const normalizedType = normalizeDomexHouseholdType(line);
          if (normalizedType) result.domexHouseholdType = normalizedType;
        }
      } else if (/pojisteni\s+odpovednosti\b/i.test(asciiLine)) {
        break;
      }

      if (!/pojistna\s+castka\b/i.test(asciiLine)) continue;
      const amountFromLine = parseAmountAtOrAfterLine(lines, idx + step, 2);
      if (amountFromLine == null) continue;

      if (sectionContext === "household") {
        if (result.domexHouseholdSumInsured == null) {
          result.domexHouseholdSumInsured = amountFromLine;
        }
      } else if (sectionContext === "building") {
        if (result.domexPropertySumInsured == null) {
          result.domexPropertySumInsured = amountFromLine;
        }
      }
    }
  }

  for (const idx of insuredSectionIndexes) {
    let sectionContext: "building" | "household" | null = null;
    for (let step = 1; step <= 20; step++) {
      const line = lines[idx + step]?.trim() ?? "";
      const asciiLine = asciiLines[idx + step] ?? "";
      if (!line) continue;

      if (/hlavni\s+stavba\b/i.test(asciiLine)) {
        sectionContext = "building";
      } else if (
        /trvale\s+obydlena\s+domacnost\b/i.test(asciiLine) ||
        /rekreacni\s+domacnost\b/i.test(asciiLine)
      ) {
        sectionContext = "household";
      } else if (/pojisteni\s+odpovednosti\b/i.test(asciiLine)) {
        break;
      }

      if (!/spoluucast\b/i.test(asciiLine)) continue;
      const deductibleFromLine = parseAmountAtOrAfterLine(lines, idx + step, 2);
      if (deductibleFromLine == null) continue;

      if (sectionContext === "household") {
        if (result.domexHouseholdDeductible == null) {
          result.domexHouseholdDeductible = deductibleFromLine;
        }
      } else if (sectionContext === "building") {
        if (result.domexPropertyDeductible == null) {
          result.domexPropertyDeductible = deductibleFromLine;
        }
      }
    }
  }

  // Fallbacky při PDF bez jasného kontextu "hlavni stavba/domacnost"
  if (
    (result.domexPropertySumInsured == null || result.domexPropertyDeductible == null) &&
    (result.domexPropertyType || buildingIndexes.length > 0)
  ) {
    for (const idx of insuredSectionIndexes) {
      for (let step = 1; step <= 20; step++) {
        const line = lines[idx + step]?.trim() ?? "";
        const asciiLine = asciiLines[idx + step] ?? "";
        if (!line) continue;
        if (/pojisteni\s+odpovednosti\b/i.test(asciiLine)) break;

        if (
          result.domexPropertySumInsured == null &&
          /pojistna\s+castka\b/i.test(asciiLine)
        ) {
          const amountFromLine = parseAmountAtOrAfterLine(lines, idx + step, 2);
          if (amountFromLine != null) {
            result.domexPropertySumInsured = amountFromLine;
          }
        }

        if (
          result.domexPropertyDeductible == null &&
          /spoluucast\b/i.test(asciiLine)
        ) {
          const deductibleFromLine = parseAmountAtOrAfterLine(lines, idx + step, 2);
          if (deductibleFromLine != null) {
            result.domexPropertyDeductible = deductibleFromLine;
          }
        }
      }
      if (result.domexPropertySumInsured != null && result.domexPropertyDeductible != null) {
        break;
      }
    }
  }

  // Fallback: u samostatné domácnosti (bez staveb) vezmi první sekci jako domácnost.
  if (
    (result.domexHouseholdSumInsured == null || result.domexHouseholdDeductible == null) &&
    insuredSectionIndexes.length > 0 &&
    !result.domexPropertyType
  ) {
    const firstIdx = insuredSectionIndexes[0];
    for (let step = 1; step <= 20; step++) {
      const line = lines[firstIdx + step]?.trim() ?? "";
      const asciiLine = asciiLines[firstIdx + step] ?? "";
      if (!line) continue;

      if (
        result.domexHouseholdSumInsured == null &&
        /pojistna\s+castka\b/i.test(asciiLine)
      ) {
        const amountFromLine = parseAmountAtOrAfterLine(lines, firstIdx + step, 2);
        if (amountFromLine != null) {
          result.domexHouseholdSumInsured = amountFromLine;
        }
      }

      if (
        result.domexHouseholdDeductible == null &&
        /spoluucast\b/i.test(asciiLine)
      ) {
        const deductibleFromLine = parseAmountAtOrAfterLine(lines, firstIdx + step, 2);
        if (deductibleFromLine != null) {
          result.domexHouseholdDeductible = deductibleFromLine;
        }
      }
    }
  }

  // Pojištění odpovědnosti občana v běžném občanském životě
  const liabilitySectionIndexes = findLabelIndexes(
    asciiLines,
    /pojisteni\s+odpovednosti\s+obcana\s+v\s+beznem\s+obcanskem\s+zivote/i
  );
  for (const idx of liabilitySectionIndexes) {
    for (let step = 1; step <= 120; step++) {
      const pos = idx + step;
      const line = lines[pos]?.trim() ?? "";
      const asciiLine = asciiLines[pos] ?? "";
      if (!line) continue;

      if (
        /asistencni\s+sluzba/i.test(asciiLine) ||
        /rozsah\s+poskytovani\s+asistencnich\s+sluzeb/i.test(asciiLine)
      ) {
        break;
      }

      if (result.domexLiabilitySumInsured == null && /^limit\s+pojistneho\s+plneni\b/i.test(asciiLine)) {
        let limit = parseAmount(line);
        if (limit == null) {
          limit = parseAmount(lines[pos + 1] ?? "");
        }
        if (limit != null) {
          result.domexLiabilitySumInsured = limit;
        }
        continue;
      }

      if (result.domexLiabilityDeductible == null && /^spoluucast\b/i.test(asciiLine)) {
        let deductible = parseAmount(line);
        if (deductible == null) {
          deductible = parseAmount(lines[pos + 1] ?? "");
        }
        if (deductible != null) {
          result.domexLiabilityDeductible = deductible;
        }
      }
    }
    if (result.domexLiabilitySumInsured != null && result.domexLiabilityDeductible != null) {
      break;
    }
  }

  // Připojištění odpovědnosti
  if (
    /nahrada\s+ujmy\s+na\s+mobilnim\s+telefonu,?\s*tabletu\s+a\s+notebooku?[\s\S]{0,220}dppboz/i.test(
      ascii
    )
  ) {
    result.domexLiabilityMobile = true;
  }
  if (
    /odpovednost\s+najemce(?:\s+na)?\s+veci\s+nemovite[\s\S]{0,220}dppboz/i.test(
      ascii
    )
  ) {
    result.domexLiabilityTenant = true;
  }
  if (/odpovednost\s+pronajimatele[\s\S]{0,220}dppboz/i.test(ascii)) {
    result.domexLiabilityLandlord = true;
  }

  // Asistence
  if (/domaci\s+asistence\s+plus/i.test(ascii)) {
    result.domexAssistancePlus = true;
  }

  return result;
}
