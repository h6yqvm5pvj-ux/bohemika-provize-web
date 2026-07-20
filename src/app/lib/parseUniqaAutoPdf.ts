// src/app/lib/parseUniqaAutoPdf.ts
import { type PaymentFrequency } from "../types/domain";

export type UniqaAutoPdfResult = {
  contractNumber?: string | null;
  clientName?: string | null;
  policyStartDate?: string | null;
  contractSignedDate?: string | null;
  amount?: number | null;
  frequency?: PaymentFrequency | null;
  carMake?: string | null;
  carPlate?: string | null;
  carVin?: string | null;
  carTp?: string | null;
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
  carAddonGlass?: boolean | null;
  carAddonGlassLimit?: number | null;
  carAddonReplacementCar?: boolean | null;
  carAddonLuggage?: boolean | null;
  carAddonPassengerInjury?: boolean | null;
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

const normalizeSpaces = (value: string) =>
  value
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const toDateInput = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const match = value.match(/(\d{1,2})\s*[./]\s*(\d{1,2})\s*[./]\s*(\d{4})/);
  if (!match) return null;
  const [, dayRaw, monthRaw, yearRaw] = match;
  const day = Number(dayRaw);
  const month = Number(monthRaw);
  const year = Number(yearRaw);
  if (!day || !month || !year) return null;
  return `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
};

const parseAmount = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const candidate =
    normalizeSpaces(value).match(/([0-9][0-9\s]*(?:[.,][0-9]{1,2})?)/)?.[1] ??
    null;
  if (!candidate) return null;
  const cleaned = candidate.replace(/\s+/g, "").replace(",", ".").trim();
  const number = Number.parseFloat(cleaned);
  return Number.isFinite(number) ? Math.round(number) : null;
};

const mapFrequency = (value: string | null | undefined): PaymentFrequency | null => {
  if (!value) return null;
  const normalized = stripDiacritics(value).toLowerCase();
  if (normalized.includes("mesic")) return "monthly";
  if (normalized.includes("ctvrt")) return "quarterly";
  if (normalized.includes("polo")) return "semiannual";
  if (normalized.includes("roc")) return "annual";
  return null;
};

const normalizeContractNumber = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const digits = value.replace(/\D+/g, "");
  return digits.length >= 6 ? digits : null;
};

const normalizeName = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const cleaned = normalizeSpaces(value)
    .replace(/\s+R[ČC]\s*:.*$/i, "")
    .replace(/\s+I[ČC]O\s*:.*$/i, "")
    .replace(/^[\s:;,\-–—]+|[\s:;,\-–—]+$/g, "")
    .trim();
  if (!cleaned || cleaned.length < 3) return null;
  if (!/[A-Za-zÀ-ž]/.test(cleaned)) return null;
  if (/\d/.test(cleaned)) return null;
  const ascii = stripDiacritics(cleaned).toLowerCase();
  if (/^(adresa|email|telefon|datum|pojistnik|pojistitel)\b/.test(ascii)) return null;
  return cleaned;
};

const normalizeVehicleMakeModel = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const cleaned = normalizeSpaces(value)
    .replace(/^[\s:;,\-–—]+|[\s:;,\-–—]+$/g, "")
    .trim();
  if (!cleaned || cleaned.length < 2) return null;
  if (!/[A-Za-zÀ-ž0-9]/.test(cleaned)) return null;
  return cleaned;
};

const normalizePlate = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const candidate = value.match(/[A-Z0-9]{3,12}/i)?.[0] ?? null;
  if (!candidate) return null;
  return candidate.replace(/\s+/g, "").toUpperCase();
};

const normalizeVin = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const candidate = value.match(/[A-HJ-NPR-Z0-9]{10,20}/i)?.[0] ?? null;
  if (!candidate) return null;
  const vin = candidate.toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]+$/.test(vin)) return null;
  return vin;
};

const normalizeVehicleDocCode = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const candidate = value.match(/[A-Za-z0-9\-\/]{3,40}/)?.[0] ?? null;
  if (!candidate) return null;
  return candidate.toUpperCase();
};

const LIABILITY_LIMIT_VALUES = new Set<number>([
  50_000_000,
  60_000_000,
  70_000_000,
  100_000_000,
  150_000_000,
  200_000_000,
  250_000_000,
]);

const normalizeLiabilityLimit = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const normalized = normalizeSpaces(value);

  const slashMatch = normalized.match(
    /\b(50|60|70|100|150|200|250)\s*\/\s*(50|60|70|100|150|200|250)\b/
  );
  if (slashMatch?.[1] && slashMatch[1] === slashMatch[2]) {
    return Number.parseInt(slashMatch[1], 10) * 1_000_000;
  }

  const milMatches = normalized.match(/\b(50|60|70|100|150|200|250)\b\s*mil\.?\s*K[čc]/gi) ?? [];
  for (const candidate of milMatches) {
    const number = Number.parseInt(candidate.replace(/[^\d]/g, ""), 10);
    const valueInCrowns = number * 1_000_000;
    if (LIABILITY_LIMIT_VALUES.has(valueInCrowns)) return valueInCrowns;
  }

  const compactMatches = normalized.match(/\d[\d\s]{4,}\d/g) ?? [];
  for (const candidate of compactMatches) {
    const number = Number.parseInt(candidate.replace(/\s+/g, ""), 10);
    if (Number.isFinite(number) && LIABILITY_LIMIT_VALUES.has(number)) return number;
  }

  return null;
};

const normalizeHullDeductibleText = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const cleaned = normalizeSpaces(value)
    .replace(/,\s*$/, "")
    .replace(/\bmin\.\s*/i, "min. ")
    .trim();
  return cleaned.length >= 2 ? cleaned : null;
};

const extractLayoutLinesFromPage = async (page: any): Promise<string[]> => {
  const content = await page.getTextContent();
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

  return rows
    .sort((a, b) => b.y - a.y)
    .map((row) => {
      row.items.sort((a, b) => a.x - b.x);
      let line = "";
      let prevEndX = 0;
      let hasPrev = false;
      row.items.forEach((item) => {
        if (hasPrev && item.x - prevEndX > WORD_GAP_THRESHOLD) line += " ";
        line += item.str;
        prevEndX = item.x + item.width;
        hasPrev = true;
      });
      return normalizeSpaces(line);
    })
    .filter(Boolean);
};

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
  maxLookahead = 5
): string | null => {
  const indexes = findLabelIndexes(asciiLines, label);
  for (const idx of indexes) {
    const inline = extractInlineValueAfterColon(lines[idx] ?? "");
    if (inline) return inline;

    for (let step = 1; step <= maxLookahead; step += 1) {
      const candidate = lines[idx + step]?.trim();
      if (!candidate) continue;
      return candidate;
    }
  }
  return null;
};

const findDateAfterSection = (
  lines: string[],
  asciiLines: string[],
  section: RegExp,
  label: RegExp,
  maxLookahead = 12
): string | null => {
  const sectionIndex = asciiLines.findIndex((line) => section.test(line));
  if (sectionIndex < 0) return null;
  const end = Math.min(lines.length - 1, sectionIndex + maxLookahead);
  for (let i = sectionIndex + 1; i <= end; i += 1) {
    if (!label.test(asciiLines[i] ?? "")) continue;
    const dateMatch = (lines[i] ?? "").match(
      /(\d{1,2}\s*[./]\s*\d{1,2}\s*[./]\s*\d{4})/
    )?.[1];
    if (dateMatch) return dateMatch;
    for (let step = 1; step <= 2 && i + step <= end; step += 1) {
      const nextDateMatch = (lines[i + step] ?? "").match(
        /(\d{1,2}\s*[./]\s*\d{1,2}\s*[./]\s*\d{4})/
      )?.[1];
      if (nextDateMatch) return nextDateMatch;
    }
  }
  return null;
};

const sectionChunk = (
  lines: string[],
  asciiLines: string[],
  start: RegExp,
  end: RegExp,
  fallbackSize = 80
): { text: string; ascii: string } => {
  const startIndex = asciiLines.findIndex((line) => start.test(line));
  if (startIndex < 0) return { text: "", ascii: "" };
  let endIndex = asciiLines.findIndex((line, idx) => idx > startIndex && end.test(line));
  if (endIndex < 0) endIndex = Math.min(lines.length, startIndex + fallbackSize);
  const text = lines.slice(startIndex, endIndex).join(" ");
  return {
    text,
    ascii: stripDiacritics(text).toLowerCase(),
  };
};

const readVehicleSumInsured = (lines: string[], asciiLines: string[]): number | null => {
  const labelIndex = asciiLines.findIndex((line) => /celkova\s+pojistna/.test(line));
  if (labelIndex < 0) return null;
  for (let step = 0; step <= 5; step += 1) {
    const candidate = lines[labelIndex + step] ?? "";
    const amount = parseAmount(candidate.match(/([0-9][0-9\s]*)\s*K[čc]/i)?.[1]);
    if (amount != null && amount > 10_000) return amount;
  }
  return null;
};

const hasUniqaCoverage = (asciiText: string, label: RegExp): boolean => {
  const index = asciiText.search(label);
  if (index < 0) return false;
  const tail = asciiText.slice(index);
  const nextCoverageIndex = tail.slice(12).search(/\bpojisteni\s+/i);
  const chunk =
    nextCoverageIndex >= 0
      ? tail.slice(0, nextCoverageIndex + 12)
      : tail.slice(0, 180);
  return !/\bnesjednano\b/.test(chunk);
};

const extractUniqaVehicleMake = (lines: string[], asciiLines: string[]): string | null => {
  for (let idx = 0; idx < asciiLines.length; idx += 1) {
    const asciiLine = asciiLines[idx] ?? "";
    if (!/znacka\s*:/.test(asciiLine) || !/model\s*:/.test(asciiLine)) continue;
    const line = lines[idx] ?? "";
    const match = line.match(
      /Značka\s*:\s*(.+?)\s+Model\s*:\s*(.+?)(?:\s+Druh\b|\s+Osobní\b|\s+automobil\b|$)/i
    );
    const make = normalizeVehicleMakeModel(match?.[1] ?? null);
    const model = normalizeVehicleMakeModel(match?.[2] ?? null);
    const merged = normalizeVehicleMakeModel([make, model].filter(Boolean).join(" "));
    if (merged) return merged;
  }
  return null;
};

export async function parseUniqaAutoPdf(file: File): Promise<UniqaAutoPdfResult> {
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
  const lines: string[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    lines.push(...(await extractLayoutLinesFromPage(page)));
  }

  const fullText = lines.join("\n");
  const normalized = normalizeSpaces(fullText);
  const asciiText = stripDiacritics(normalized).toLowerCase();
  const asciiLines = lines.map((line) => stripDiacritics(line).toLowerCase());

  const result: UniqaAutoPdfResult = {};

  const contractNumber =
    normalizeContractNumber(
      normalized.match(/Návrh\s+pojistné\s+smlouvy\s*č\.?\s*([0-9]{6,})/i)?.[1]
    ) ??
    normalizeContractNumber(
      asciiText.match(/navrh\s+pojistne\s+smlouvy\s*c\.?\s*([0-9]{6,})/i)?.[1]
    ) ??
    normalizeContractNumber(readNearestValueByLabel(lines, asciiLines, /variabilni\s+symbol/i, 3));
  if (contractNumber) result.contractNumber = contractNumber;

  const policyholderIndex = asciiLines.findIndex((line) => /pojistnik\s*\(vy\)/i.test(line));
  if (policyholderIndex >= 0) {
    for (let step = 1; step <= 6; step += 1) {
      const idx = policyholderIndex + step;
      if (!/jmeno\s+a\s+prijmeni/i.test(asciiLines[idx] ?? "")) continue;
      const name = normalizeName(extractInlineValueAfterColon(lines[idx] ?? ""));
      if (name) {
        result.clientName = name;
        break;
      }
    }
  }
  if (!result.clientName) {
    const name = normalizeName(readNearestValueByLabel(lines, asciiLines, /jmeno\s+a\s+prijmeni/i, 3));
    if (name) result.clientName = name;
  }

  const policyStartRaw =
    normalized.match(
      /Datum\s+a\s+čas\s+počátku\s+pojištění\s*:\s*(\d{1,2}\s*[./]\s*\d{1,2}\s*[./]\s*\d{4})/i
    )?.[1] ??
    readNearestValueByLabel(lines, asciiLines, /datum\s+a\s+cas\s+pocatku\s+pojisteni/i, 3);
  const policyStartDate = toDateInput(policyStartRaw);
  if (policyStartDate) result.policyStartDate = policyStartDate;

  const signedRaw =
    findDateAfterSection(lines, asciiLines, /^podpisy\b/i, /^datum\b/i, 8) ??
    normalized.match(/Datum\s+vystavení\s*:\s*(\d{1,2}\s*[./]\s*\d{1,2}\s*[./]\s*\d{4})/i)?.[1] ??
    null;
  const contractSignedDate = toDateInput(signedRaw);
  if (contractSignedDate) result.contractSignedDate = contractSignedDate;

  const installmentMatch = normalized.match(
    /SPLÁTKA\s+POJISTNÉHO\s*[-–]\s*([A-Za-zÀ-ž]+)\s+([0-9][0-9\s]*(?:[.,]\d{1,2})?)\s*K[čc]/i
  );
  const frequencyRaw =
    installmentMatch?.[1] ??
    readNearestValueByLabel(lines, asciiLines, /frekvence\s+placeni/i, 3);
  const frequency = mapFrequency(frequencyRaw);
  if (frequency) result.frequency = frequency;

  const amount =
    parseAmount(installmentMatch?.[2] ?? null) ??
    parseAmount(
      normalized.match(
        /Splátka\s+prvního\s+pojistného\s+([0-9][0-9\s]*(?:[.,]\d{1,2})?)\s*K[čc]/i
      )?.[1]
    ) ??
    parseAmount(
      normalized.match(
        /Roční\s+pojistné\s+po\s+slevách\s+CELKEM\s+([0-9][0-9\s]*(?:[.,]\d{1,2})?)\s*K[čc]/i
      )?.[1]
    );
  if (amount != null) result.amount = amount;

  const vehicleHeaderLine = lines.find((line) => /RZ\s*:/.test(line) && /VIN\s*:/.test(line));
  const plate = normalizePlate(vehicleHeaderLine?.match(/RZ\s*:\s*([A-Z0-9]+)/i)?.[1]);
  if (plate) result.carPlate = plate;
  const vin = normalizeVin(vehicleHeaderLine?.match(/VIN\s*:\s*([A-HJ-NPR-Z0-9]+)/i)?.[1]);
  if (vin) result.carVin = vin;
  const tp = normalizeVehicleDocCode(
    vehicleHeaderLine?.match(/Číslo\s+TP\s*:\s*([A-Z0-9\-\/]+)/i)?.[1]
  );
  if (tp) result.carTp = tp;

  const carMake = extractUniqaVehicleMake(lines, asciiLines);
  if (carMake) result.carMake = carMake;

  const liabilityIndex = asciiLines.findIndex((line) =>
    /pojisteni\s+odpovednosti\s+z\s+provozu/i.test(line)
  );
  if (liabilityIndex >= 0) {
    const chunk = lines.slice(Math.max(0, liabilityIndex - 3), liabilityIndex + 8).join(" ");
    const limit = normalizeLiabilityLimit(chunk);
    if (limit != null) result.carLiabilityLimit = limit;
  }

  const hull = sectionChunk(
    lines,
    asciiLines,
    /^havarijni\s+pojisteni\b/i,
    /^doplnkova\s+pojisteni\b/i
  );
  if (hull.text) {
    const hullSum = readVehicleSumInsured(lines, asciiLines);
    if (hullSum != null) result.carHullSumInsured = hullSum;

    const deductiblePercent = hull.text.match(/(\d{1,2}\s*%)/)?.[1] ?? null;
    const deductibleMinimum =
      hull.text.match(/min\.\s*([0-9][0-9\s]*)\s*K[čc]/i)?.[1] ??
      hull.text.match(/minim[aá]ln[eě]?\s*([0-9][0-9\s]*)\s*K[čc]/i)?.[1] ??
      null;
    const deductibleText = normalizeHullDeductibleText(
      deductiblePercent && deductibleMinimum
        ? `${deductiblePercent}, min. ${deductibleMinimum} Kč`
        : null
    );
    if (deductibleText) {
      result.carHullDeductibleText = deductibleText;
      const deductibleAmount = parseAmount(
        deductibleText.match(/min\.\s*([0-9][0-9\s]*)\s*K[čc]/i)?.[1] ?? null
      );
      if (deductibleAmount != null) result.carHullDeductible = deductibleAmount;
    }

    result.carHullRiskAccident = hasUniqaCoverage(hull.ascii, /pojisteni\s+havarie/i);
    result.carHullRiskTheft = hasUniqaCoverage(hull.ascii, /pojisteni\s+odcizeni/i);
    result.carHullRiskNatural = hasUniqaCoverage(hull.ascii, /pojisteni\s+zivlu/i);
    result.carHullRiskVandalism = hasUniqaCoverage(hull.ascii, /pojisteni\s+vandalismu/i);
    result.carHullRiskAnimalCollision = hasUniqaCoverage(
      hull.ascii,
      /pojisteni\s+poskozeni\s+zviretem/i
    );
  }

  const addons = sectionChunk(
    lines,
    asciiLines,
    /^doplnkova\s+pojisteni\b/i,
    /^pojisteni\s+asistencnich\s+sluzeb\b/i
  );
  if (addons.text) {
    result.carAddonGlass = hasUniqaCoverage(addons.ascii, /pojisteni\s+skel/i);
    result.carAddonLuggage = hasUniqaCoverage(addons.ascii, /pojisteni\s+zavazadel/i);
    result.carAddonReplacementCar = hasUniqaCoverage(
      addons.ascii,
      /pojisteni\s+nahradniho\s+vozidla/i
    );
    result.carAddonPassengerInjury = hasUniqaCoverage(
      addons.ascii,
      /pojisteni\s+ridice\s+ve\s+vozidle/i
    );
  }

  const assistance = sectionChunk(
    lines,
    asciiLines,
    /^pojisteni\s+asistencnich\s+sluzeb\b/i,
    /^pravni\s+asistence\b/i,
    18
  );
  if (/uniqa\s+asistence\s+plus/i.test(assistance.ascii)) {
    result.carAssistancePlan = "plus";
  }

  return result;
}
