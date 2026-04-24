// src/app/lib/parseCppAutoPdf.ts
import { type PaymentFrequency } from "../types/domain";

export type CppAutoPdfResult = {
  contractNumber?: string | null;
  clientName?: string | null;
  policyStartDate?: string | null;
  contractSignedDate?: string | null;
  amount?: number | null;
  frequency?: PaymentFrequency | null;
  carMake?: string | null;
  carPlate?: string | null;
  carVin?: string | null;
  carOrv?: string | null;
  carLiabilityLimit?: number | null;
  carHullDeductible?: number | null;
  carHullDeductibleText?: string | null;
  carHullRiskAccident?: boolean | null;
  carHullRiskTheft?: boolean | null;
  carHullRiskNatural?: boolean | null;
  carHullRiskVandalism?: boolean | null;
  carHullRiskAnimalCollision?: boolean | null;
  carAssistancePlan?: string | null;
  carAddonEso?: boolean | null;
  carAddonGlass?: boolean | null;
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

const normalizeVehicleMakeModel = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const cleaned = value
    .replace(/\s+/g, " ")
    .replace(/^[\s:;,\-–—]+|[\s:;,\-–—]+$/g, "")
    .trim();
  if (!cleaned || cleaned.length < 2) return null;
  if (!/[A-Za-zÀ-ž0-9]/.test(cleaned)) return null;
  return cleaned;
};

const normalizePlate = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const cleaned = value.replace(/\s+/g, "").trim().toUpperCase();
  if (cleaned.length < 3) return null;
  return cleaned;
};

const normalizeVin = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const cleaned = value.replace(/\s+/g, "").trim().toUpperCase();
  if (cleaned.length < 10) return null;
  if (!/^[A-HJ-NPR-Z0-9]+$/.test(cleaned)) return null;
  return cleaned;
};

const normalizeVehicleDocCode = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const cleaned = value.replace(/\s+/g, "").trim().toUpperCase();
  if (cleaned.length < 3) return null;
  return cleaned;
};

const LIABILITY_LIMIT_VALUES = new Set<number>([
  50_000_000,
  70_000_000,
  100_000_000,
  150_000_000,
  200_000_000,
  250_000_000,
]);

const normalizeLiabilityLimit = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const normalized = value.replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();

  const groupedMatches = normalized.match(/\d[\d\s]{4,}\d/g) ?? [];
  for (const candidate of groupedMatches) {
    const num = Number.parseInt(candidate.replace(/\s+/g, ""), 10);
    if (Number.isFinite(num) && LIABILITY_LIMIT_VALUES.has(num)) return num;
  }

  const slashMatch = normalized.match(
    /\b(50|70|100|150|200|250)\s*\/\s*(50|70|100|150|200|250)\b/
  );
  if (slashMatch?.[1] && slashMatch[1] === slashMatch[2]) {
    const mil = Number.parseInt(slashMatch[1], 10);
    if (Number.isFinite(mil)) return mil * 1_000_000;
  }

  const milMatch = normalized.match(/\b(50|70|100|150|200|250)\b\s*(?:mil(?:ionu?)?|mio)/i);
  if (milMatch?.[1]) {
    const mil = Number.parseInt(milMatch[1], 10);
    if (Number.isFinite(mil)) return mil * 1_000_000;
  }

  const compact = normalized.replace(/[^\d]/g, "");
  if (compact.length >= 7) {
    const num = Number.parseInt(compact, 10);
    if (Number.isFinite(num) && LIABILITY_LIMIT_VALUES.has(num)) return num;
  }

  return null;
};

const looksLikeStandaloneLabelLine = (value: string): boolean =>
  /[:：]\s*$/.test(value) ||
  /^(tovarni|obchodni|vin|registracni|serie|limit|pojistne|datum|rozsah|spoluucast|havarijni)\b/i.test(
    stripDiacritics(value).trim()
  );

const extractInlineValueAfterColon = (value: string): string | null => {
  const idx = value.indexOf(":");
  if (idx < 0) return null;
  const tail = value.slice(idx + 1).trim();
  return tail || null;
};

const findLabelIndexes = (asciiLines: string[], label: RegExp): number[] => {
  const indexes: number[] = [];
  asciiLines.forEach((line, idx) => {
    if (label.test(line)) indexes.push(idx);
  });
  return indexes;
};

const readNearestValueByLabel = (
  lines: string[],
  asciiLines: string[],
  label: RegExp,
  maxLookahead = 6
): string | null => {
  const indexes = findLabelIndexes(asciiLines, label);
  for (const idx of indexes) {
    const line = lines[idx] ?? "";
    const inline = extractInlineValueAfterColon(line);
    if (inline) return inline;

    for (let step = 1; step <= maxLookahead; step++) {
      const next = lines[idx + step]?.trim();
      if (!next) continue;
      if (looksLikeStandaloneLabelLine(next)) continue;
      return next;
    }
  }
  return null;
};

const readSectionValue = (
  lines: string[],
  asciiLines: string[],
  sectionStart: number,
  label: RegExp,
  maxLookahead = 8,
  sectionWindow = 70
): string | null => {
  const sectionEnd = Math.min(lines.length - 1, sectionStart + sectionWindow);
  for (let idx = sectionStart; idx <= sectionEnd; idx++) {
    if (!label.test(asciiLines[idx] ?? "")) continue;

    const inline = extractInlineValueAfterColon(lines[idx] ?? "");
    if (inline) return inline;

    for (let step = 1; step <= maxLookahead; step++) {
      const nextIdx = idx + step;
      if (nextIdx > sectionEnd) break;
      const next = lines[nextIdx]?.trim();
      if (!next) continue;
      if (label.test(asciiLines[nextIdx] ?? "")) continue;
      if (looksLikeStandaloneLabelLine(next)) continue;
      return next;
    }
  }
  return null;
};

const normalizeHullDeductibleText = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const cleaned = value
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s:;,\-–—]+|[\s:;,\-–—]+$/g, "")
    .trim();
  if (!cleaned || cleaned.length < 2) return null;
  return cleaned;
};

const normalizeCppAssistancePlan = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const normalized = stripDiacritics(value).toLowerCase().replace(/\s+/g, " ").trim();
  if (!normalized) return null;

  if (/plus\s*-\s*dvojnasobn(?:y|eho)?\s+limit/.test(normalized) || /\bdvojnasobn/.test(normalized)) {
    return "plus_dvojnasob";
  }
  if (/car\s+premium/.test(normalized)) return "evropa_cr_bez_limitu";
  if (/car\s+plus/.test(normalized)) return "cr_bez_limitu";
  if (/\basistence\s+plus\b/.test(normalized) || /^plus\b/.test(normalized)) return "plus";
  if (/\bstandard\b/.test(normalized)) return "standard";
  return null;
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
    const text = content.items
      .map((item: any) => (typeof item?.str === "string" ? item.str : ""))
      .filter(Boolean)
      .join("\n");
    pagesText.push(text);
  }

  const fullText = pagesText.join("\n");
  const lines = fullText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const asciiLines = lines.map((line) => stripDiacritics(line).toLowerCase());
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
  const frequencyRaw =
    readNearestValueByLabel(lines, asciiLines, /pojistne\s+obdobi/i, 4) ??
    ascii.match(/pojistne obdobi:\s*([a-z]+)/i)?.[1] ??
    null;
  if (frequencyRaw) {
    const word = stripDiacritics(frequencyRaw).toLowerCase();
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

  const manufacturer = normalizeVehicleMakeModel(
    readNearestValueByLabel(lines, asciiLines, /tovarni\s+znacka/i, 4)
  );
  const model = normalizeVehicleMakeModel(
    readNearestValueByLabel(lines, asciiLines, /obchodni\s+oznaceni\s*\/\s*typ/i, 4) ??
      readNearestValueByLabel(lines, asciiLines, /obchodni\s+oznaceni/i, 4)
  );
  const mergedMakeModel = normalizeVehicleMakeModel(
    [manufacturer, model].filter(Boolean).join(" ")
  );
  if (mergedMakeModel) {
    result.carMake = mergedMakeModel;
  } else if (manufacturer) {
    result.carMake = manufacturer;
  }

  const vin = normalizeVin(
    readNearestValueByLabel(lines, asciiLines, /vin\s*\(vyrobni\s+cislo\s+karoserie\)/i, 4) ??
      readNearestValueByLabel(lines, asciiLines, /^vin\b/i, 4)
  );
  if (vin) {
    result.carVin = vin;
  }

  const plate = normalizePlate(
    readNearestValueByLabel(lines, asciiLines, /registracni\s+znacka(?:\s*\(spz\))?/i, 4)
  );
  if (plate) {
    result.carPlate = plate;
  }

  const orv = normalizeVehicleDocCode(
    readNearestValueByLabel(lines, asciiLines, /serie\s+a\s+cislo\s+orv/i, 4)
  );
  if (orv) {
    result.carOrv = orv;
  }

  const liabilityRaw =
    readNearestValueByLabel(
      lines,
      asciiLines,
      /limit\s+pojistneho\s+plneni\s*\(skody\s+na\s+zdravi\s*\/\s*majetku\)/i,
      4
    ) ?? readNearestValueByLabel(lines, asciiLines, /limit\s+pojistneho\s+plneni/i, 4);
  const liability = normalizeLiabilityLimit(liabilityRaw);
  if (liability != null) {
    result.carLiabilityLimit = liability;
  }

  const assistanceLabelIndexes = findLabelIndexes(asciiLines, /pojisteni\s+asistence/i);
  const hasAssistanceSection =
    assistanceLabelIndexes.length > 0 || /pojisteni\s+asistence/i.test(ascii);
  let assistancePlan: string | null = null;
  for (const idx of assistanceLabelIndexes) {
    const chunk = lines.slice(idx, Math.min(lines.length, idx + 12)).join(" ");
    assistancePlan = normalizeCppAssistancePlan(chunk);
    if (assistancePlan) break;
  }
  if (!assistancePlan) {
    const sectionCandidate =
      ascii.match(/pojisteni\s+asistence\s+(.{0,260})/i)?.[1] ??
      readNearestValueByLabel(lines, asciiLines, /pojisteni\s+asistence/i, 10);
    assistancePlan = normalizeCppAssistancePlan(sectionCandidate);
  }
  if (!assistancePlan) {
    assistancePlan = normalizeCppAssistancePlan(ascii);
  }
  if (!assistancePlan && hasAssistanceSection) {
    assistancePlan = "standard";
  }
  if (assistancePlan) {
    result.carAssistancePlan = assistancePlan;
  }

  result.carAddonEso = /pojisteni\s+eso/i.test(ascii);
  result.carAddonGlass = /pojisteni\s+skel\s+vozidla/i.test(ascii);

  const hullSectionStarts = findLabelIndexes(asciiLines, /^havarijni\s+pojisteni\b/i);
  for (const sectionStart of hullSectionStarts) {
    const scopeRaw = readSectionValue(
      lines,
      asciiLines,
      sectionStart,
      /^rozsah\s+pojisteni\b/i,
      10,
      60
    );
    if (scopeRaw) {
      const scopeAscii = stripDiacritics(scopeRaw).toLowerCase();
      if (/\bhavarie\b/i.test(scopeAscii)) result.carHullRiskAccident = true;
      if (/\bodcizeni\b/i.test(scopeAscii)) result.carHullRiskTheft = true;
      if (/\bzivel\b/i.test(scopeAscii)) result.carHullRiskNatural = true;
      if (/\bvandalismus\b/i.test(scopeAscii)) result.carHullRiskVandalism = true;
      if (/stret\s+se\s+zv(?:iretem|eri)\b/i.test(scopeAscii)) {
        result.carHullRiskAnimalCollision = true;
      }
    }

    const deductibleRaw = readSectionValue(
      lines,
      asciiLines,
      sectionStart,
      /^spoluucast\b/i,
      10,
      60
    );
    const deductibleText = normalizeHullDeductibleText(deductibleRaw);
    if (deductibleText) {
      result.carHullDeductibleText = deductibleText;
      if (!/%/.test(deductibleText)) {
        const deductibleAmount = parseAmount(deductibleText);
        if (deductibleAmount != null) {
          result.carHullDeductible = deductibleAmount;
        }
      }
    }

    if (scopeRaw || deductibleText) {
      break;
    }
  }

  return result;
}
