import { readPdfText, type PdfReadOptions } from "./pdfDocumentText";
// src/app/lib/parseCppAutoPdf.ts
import { type PaymentFrequency } from "../types/domain";
import { extractClientEmailFromPdfLines } from "./extractClientEmailFromPdf";
import { resolveCppAutoContractIdentity, type CppAutoContractIdentityLine, type CppAutoContractIdentityPage } from "./cppAutoContractIdentity";
import { extractCppAutoPolicyholderLines, resolveCppAutoPolicyholder } from "./cppAutoPolicyholder";
import { resolveCppAutoDates } from "./cppAutoDates";

export type CppAutoPdfResult = {
  isRefresh?: boolean | null;
  refreshOriginalContractNumber?: string | null;
  contractNumber?: string | null;
  clientName?: string | null;
  clientEmail?: string | null;
  personalId?: string | null;
  policyStartDate?: string | null;
  contractSignedDate?: string | null;
  amount?: number | null;
  frequency?: PaymentFrequency | null;
  pdfImportWarnings?: string[];
  carMake?: string | null;
  carPlate?: string | null;
  carVin?: string | null;
  carOrv?: string | null;
  carLiabilityLimit?: number | null;
  carHullSumInsured?: number | null;
  carHullDeductible?: number | null;
  carHullDeductibleText?: string | null;
  carHullRiskAccident?: boolean | null;
  carHullRiskTheft?: boolean | null;
  carHullRiskNatural?: boolean | null;
  carHullRiskVandalism?: boolean | null;
  carHullRiskAnimalCollision?: boolean | null;
  carAssistancePlan?: string | null;
  carAddonEso?: boolean | null;
  carAddonNaturalRisks?: boolean | null;
  carAddonGlass?: boolean | null;
  carAddonGlassLimit?: number | null;
  carAddonAnimalCollision?: boolean | null;
  carAddonAnimalCollisionLimit?: number | null;
};

type PositionedTextItem = {
  str: string;
  x: number;
  y: number;
  width: number;
};

const LINE_Y_TOLERANCE = 2;
const WORD_GAP_THRESHOLD = 1.5;

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

export const extractCppAutoPolicyholderPersonalId = (
  lines: string[],
): string | null => {
  const asciiLines = lines.map((line) => stripDiacritics(line).toLowerCase());
  const policyholderStart = asciiLines.findIndex((line) =>
    /^pojistnik\b/i.test(line),
  );
  if (policyholderStart < 0) return null;

  const sectionEndOffset = asciiLines
    .slice(policyholderStart + 1, policyholderStart + 45)
    .findIndex((line) =>
      /^(pojisteny|provozovatel|vlastnik|udaje\s+o\s+vozidle|vozidlo|predmet\s+pojisteni)\b/i.test(
        line,
      ),
    );
  const sectionEnd =
    sectionEndOffset >= 0
      ? policyholderStart + 1 + sectionEndOffset
      : Math.min(lines.length, policyholderStart + 45);
  const sectionText = lines.slice(policyholderStart, sectionEnd).join(" ");

  const companyId = sectionText.match(
    /(?:^|\s)I[ČC](?:O)?\s*:?\s*((?:\d[\u00a0 \t]*){8})(?!\d)/i,
  )?.[1];
  if (companyId) return companyId.replace(/\D/g, "");

  const birthNumber = sectionText.match(
    /(?:rodn[eé]\s+[čc][ií]slo|R[ČC])\s*:?\s*(\d{6})\s*\/?\s*(\d{3,4})/i,
  );
  return birthNumber ? `${birthNumber[1]}/${birthNumber[2]}` : null;
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
  /^(tovarni|obchodni|vin|registracni|serie|limit|pojistne|datum|rozsah|spoluucast|havarijni|nazev|jmeno|prijmeni|titul|platce|ico|ic|adresa|email|telefon)\b/i.test(
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

const extractLayoutLinesFromTextItems = (
  rawItems: Array<{ str?: unknown; transform?: number[]; width?: number }>
): CppAutoContractIdentityLine[] => {
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
      return { text: line.replace(/\s+/g, " ").trim(), items: row.items };
    })
    .filter(line => Boolean(line.text));
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

export async function parseCppAutoPdf(file: File, options: PdfReadOptions = {}): Promise<CppAutoPdfResult> {
  const doc = await readPdfText(file, options);
  const pagesText: string[] = [];
  const layoutPages: CppAutoContractIdentityPage[] = [];

  for (let i = 1; i <= doc.pages.length; i++) {
    const page = doc.pages[i - 1];
    const content = { items: page.items };
    const rawItems = (content.items ?? []) as Array<{
      str?: unknown;
      transform?: number[];
      width?: number;
    }>;
    const text = rawItems
      .map((item) => (typeof item?.str === "string" ? item.str : ""))
      .filter(Boolean)
      .join("\n");
    pagesText.push(text);
    const pageLines = extractLayoutLinesFromTextItems(rawItems);
    layoutPages.push(pageLines);
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
  const identity = resolveCppAutoContractIdentity(layoutPages);
  if (identity.replacementOriginalContractNumber) {
    result.isRefresh = true;
    result.refreshOriginalContractNumber = identity.replacementOriginalContractNumber;
  }
  if (identity.contractNumber) result.contractNumber = identity.contractNumber;

  const policyholder = resolveCppAutoPolicyholder(layoutPages);
  if (policyholder.clientName) result.clientName = policyholder.clientName;
  if (policyholder.personalId) result.personalId = policyholder.personalId;

  if (result.clientName) {
    const contact = extractClientEmailFromPdfLines(extractCppAutoPolicyholderLines(layoutPages), result.clientName);
    if (contact.status === "found") result.clientEmail = contact.email;
  }

  const dates = resolveCppAutoDates(layoutPages.map(page => page.map(line => line.text)));
  if (dates.policyStartDate) result.policyStartDate = dates.policyStartDate;
  if (dates.contractSignedDate) result.contractSignedDate = dates.contractSignedDate;
  const identityWarningMessages: Record<string, string> = {
    cpp_auto_contract_number_missing: "ČPP Auto: Číslo pojistné smlouvy se nepodařilo spolehlivě přečíst.",
    cpp_auto_contract_number_ambiguous: "ČPP Auto: Číslo pojistné smlouvy je nejednoznačné; ověř ho podle PDF.",
    cpp_auto_replacement_number_missing: "ČPP Auto: Náhrada smlouvy nemá čitelné číslo; ověř, zda jde o náhradu.",
    cpp_auto_replacement_number_ambiguous: "ČPP Auto: Číslo nahrazované smlouvy je nejednoznačné; ověř ho podle PDF.",
    cpp_auto_replacement_matches_contract: "ČPP Auto: Číslo náhrady je shodné s novou smlouvou; náhrada nebyla nastavena.",
  };
  const warnings = [...new Set([
    ...identity.warnings.map(code => identityWarningMessages[code] ?? "ČPP Auto: Čísla smluv vyžadují ruční kontrolu."),
    ...policyholder.warnings,
    ...dates.warnings,
  ])];
  if (warnings.length) result.pdfImportWarnings = warnings;

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

  const hullSumInsured = parseAmount(
    readNearestValueByLabel(
      lines,
      asciiLines,
      /pojistna\s+castka\s+vozidla\s+ve\s+vysi/i,
      4
    )
  );
  if (hullSumInsured != null && hullSumInsured > 0) {
    result.carHullSumInsured = hullSumInsured;
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

  const naturalRisksSectionStarts = findLabelIndexes(
    asciiLines,
    /^pojisteni\s+prirodnich\s+rizik\b/i
  );
  result.carAddonNaturalRisks =
    naturalRisksSectionStarts.length > 0 || /^pojisteni\s+prirodnich\s+rizik\b/im.test(ascii);
  for (const sectionStart of naturalRisksSectionStarts) {
    const naturalRisksLimit = parseAmount(
      readSectionValue(lines, asciiLines, sectionStart, /^limit\s+plneni\b/i, 6, 45)
    );
    if (naturalRisksLimit != null && naturalRisksLimit > 0) {
      result.carAddonAnimalCollisionLimit = naturalRisksLimit;
    }

    const sectionText = asciiLines
      .slice(sectionStart, Math.min(asciiLines.length, sectionStart + 45))
      .join(" ");
    if (/\bminippr\b/i.test(sectionText) || /stret\s+se\s+zv(?:iretem|eri)\b/i.test(sectionText)) {
      result.carAddonAnimalCollision = true;
    }

    if (result.carAddonAnimalCollision || result.carAddonAnimalCollisionLimit != null) {
      break;
    }
  }

  const glassSectionStarts = findLabelIndexes(asciiLines, /pojisteni\s+skel\s+vozidla/i);
  result.carAddonGlass =
    glassSectionStarts.length > 0 || /pojisteni\s+skel\s+vozidla/i.test(ascii);
  for (const sectionStart of glassSectionStarts) {
    const glassLimit = parseAmount(
      readSectionValue(lines, asciiLines, sectionStart, /^limit\s+plneni\b/i, 6, 40)
    );
    if (glassLimit != null && glassLimit > 0) {
      result.carAddonGlassLimit = glassLimit;
      break;
    }
  }

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
