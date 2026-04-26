// src/app/lib/parseCsobAutoPdf.ts
import { type PaymentFrequency } from "../types/domain";

export type CsobAutoPdfResult = {
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
  carAnnualMileage?: string | null;
  carLiabilityLimit?: number | null;
  carHullSumInsured?: number | null;
  carHullSumInsuredText?: string | null;
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
  carAddonAnimalCollision?: boolean | null;
  carAddonAnimalDamage?: boolean | null;
  carAddonVandalism?: boolean | null;
  carAddonTheft?: boolean | null;
  carAddonNatural?: boolean | null;
  carAddonGap?: boolean | null;
  carAddonFireExplosion?: boolean | null;
  carAddonLegalAdvice?: boolean | null;
  carAddonReplacementCar?: boolean | null;
  carAddonLuggage?: boolean | null;
  carAddonTransportedGoods?: boolean | null;
  carAddonPothole?: boolean | null;
  carAddonNonFaultAccident?: boolean | null;
  carAddonKeyLossTheft?: boolean | null;
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
  const match = value.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  if (!match) return null;
  const [, dayRaw, monthRaw, yearRaw] = match;
  const day = Number(dayRaw);
  const month = Number(monthRaw);
  const year = Number(yearRaw);
  if (!day || !month || !year) return null;
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
    .toString()
    .padStart(2, "0")}`;
};

const parseAmount = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const normalized = normalizeSpaces(value);
  const amountMatch =
    normalized.match(/([0-9][0-9\s]*(?:[.,][0-9]{1,2})?)\s*(?:k[cč]|czk)\b/i)?.[1] ??
    normalized.match(/([0-9][0-9\s]{2,}(?:[.,][0-9]{1,2})?)/)?.[1] ??
    null;
  if (!amountMatch) return null;
  const cleaned = amountMatch.replace(/\s+/g, "").replace(",", ".").trim();
  const number = Number.parseFloat(cleaned);
  if (!Number.isFinite(number)) return null;
  return Math.round(number);
};

const mapFrequency = (value: string | null | undefined): PaymentFrequency | null => {
  if (!value) return null;
  const normalized = stripDiacritics(value).toLowerCase();
  if (normalized.includes("ctvrtlet")) return "quarterly";
  if (normalized.includes("pololet")) return "semiannual";
  if (normalized.includes("rocni")) return "annual";
  if (normalized.includes("mesicni")) return "monthly";
  return null;
};

const normalizeNamePart = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const cleaned = normalizeSpaces(value)
    .replace(/^[\s:;,\-–—]+|[\s:;,\-–—]+$/g, "")
    .trim();
  if (!cleaned) return null;
  if (!/[A-Za-zÀ-ž]/.test(cleaned)) return null;
  if (/\d/.test(cleaned)) return null;
  return cleaned;
};

const normalizeContractNumber = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const digits = value.replace(/\D+/g, "");
  return digits.length >= 6 ? digits : null;
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
  const cleaned = normalizeSpaces(value).toUpperCase();
  if (cleaned.length < 3) return null;
  if (!/[A-Z0-9]/.test(cleaned)) return null;
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

const TITLE_TOKENS = new Set<string>([
  "bc",
  "mgr",
  "ing",
  "judr",
  "mudr",
  "mvdr",
  "rndr",
  "phdr",
  "paeddr",
  "thdr",
  "doc",
  "prof",
]);

const cleanupNameToken = (token: string): string =>
  token.replace(/^[^A-Za-zÀ-ž.]+|[^A-Za-zÀ-ž.]+$/gu, "");

const findSectionStart = (asciiLines: string[], pattern: RegExp): number =>
  asciiLines.findIndex((line) => pattern.test(line));

const findSectionEnd = (
  asciiLines: string[],
  sectionStart: number,
  nextSectionPatterns: RegExp[]
): number => {
  if (sectionStart < 0) return -1;
  for (let idx = sectionStart + 1; idx < asciiLines.length; idx++) {
    const line = asciiLines[idx] ?? "";
    if (nextSectionPatterns.some((pattern) => pattern.test(line))) {
      return idx - 1;
    }
  }
  return asciiLines.length - 1;
};

const findNextNonEmptyLine = (
  lines: string[],
  asciiLines: string[],
  fromIndex: number,
  toIndex: number,
  skipPattern?: RegExp
): string | null => {
  for (let idx = fromIndex; idx <= toIndex; idx++) {
    const raw = lines[idx]?.trim();
    if (!raw) continue;
    const ascii = asciiLines[idx] ?? "";
    if (skipPattern?.test(ascii)) continue;
    return raw;
  }
  return null;
};

const extractNameFromHeaderAndRow = (
  headerLine: string,
  headerAscii: string,
  valueLine: string
): { title: string | null; firstName: string | null; lastName: string | null } => {
  const titleIdx = headerAscii.indexOf("titul");
  const firstNameIdx = headerAscii.indexOf("jmeno");
  const lastNameIdx = headerAscii.indexOf("prijmeni");

  if (titleIdx < 0 || firstNameIdx < 0 || lastNameIdx < 0) {
    return { title: null, firstName: null, lastName: null };
  }
  if (!(titleIdx < firstNameIdx && firstNameIdx < lastNameIdx)) {
    return { title: null, firstName: null, lastName: null };
  }

  const value = valueLine.padEnd(Math.max(valueLine.length, headerLine.length), " ");
  const titleRaw = value.slice(titleIdx, firstNameIdx).trim();
  const firstNameRaw = value.slice(firstNameIdx, lastNameIdx).trim();
  const lastNameRaw = value.slice(lastNameIdx).trim();

  return {
    title: normalizeNamePart(titleRaw),
    firstName: normalizeNamePart(firstNameRaw),
    lastName: normalizeNamePart(lastNameRaw),
  };
};

const extractNameFromRowByTitleToken = (
  valueLine: string
): { title: string | null; firstName: string | null; lastName: string | null } | null => {
  const normalizedLine = normalizeSpaces(valueLine);
  if (!normalizedLine) return null;
  const tokens = normalizedLine.split(" ").filter(Boolean);
  if (tokens.length < 3) return null;

  for (let idx = 0; idx <= tokens.length - 3; idx++) {
    const rawTitle = cleanupNameToken(tokens[idx] ?? "");
    if (!rawTitle) continue;
    const normalizedTitle = stripDiacritics(rawTitle)
      .toLowerCase()
      .replace(/\./g, "");
    if (!TITLE_TOKENS.has(normalizedTitle)) continue;

    const firstRaw = cleanupNameToken(tokens[idx + 1] ?? "");
    const lastRaw = cleanupNameToken(tokens[idx + 2] ?? "");
    const title = normalizeNamePart(rawTitle);
    const firstName = normalizeNamePart(firstRaw);
    const lastName = normalizeNamePart(lastRaw);
    if (!firstName || !lastName) continue;

    return { title, firstName, lastName };
  }

  const tailMatch = normalizedLine.match(
    /([A-Za-zÀ-ž]{2,}\.?)\s+([A-Za-zÀ-ž][A-Za-zÀ-ž'’-]*)\s+([A-Za-zÀ-ž][A-Za-zÀ-ž'’-]*)$/u
  );
  if (!tailMatch) return null;

  const title = normalizeNamePart(tailMatch[1] ?? null);
  const firstName = normalizeNamePart(tailMatch[2] ?? null);
  const lastName = normalizeNamePart(tailMatch[3] ?? null);
  if (!firstName || !lastName) return null;
  return { title, firstName, lastName };
};

const extractClientName = (lines: string[], asciiLines: string[]): string | null => {
  const sectionStart = findSectionStart(asciiLines, /\bpojistnik\b/);
  if (sectionStart < 0) return null;
  const sectionEnd = findSectionEnd(asciiLines, sectionStart, [
    /\bpojistny\s+zajem\b/,
    /\bvlastnik\s+vozidla\b/,
    /\bpojistna\s+doba\b/,
  ]);
  if (sectionEnd < sectionStart) return null;

  for (let idx = sectionStart; idx <= Math.min(sectionEnd, sectionStart + 20); idx++) {
    const ascii = asciiLines[idx] ?? "";
    if (!(ascii.includes("titul") && ascii.includes("jmeno") && ascii.includes("prijmeni"))) {
      continue;
    }

    const row = findNextNonEmptyLine(lines, asciiLines, idx + 1, Math.min(sectionEnd, idx + 4));
    if (!row) continue;

    const tokenBased = extractNameFromRowByTitleToken(row);
    if (tokenBased?.firstName && tokenBased.lastName) {
      return [tokenBased.title, tokenBased.firstName, tokenBased.lastName]
        .filter((part): part is string => Boolean(part))
        .join(" ")
        .trim();
    }

    const extracted = extractNameFromHeaderAndRow(lines[idx] ?? "", ascii, row);
    if (extracted.firstName && extracted.lastName) {
      return [extracted.title, extracted.firstName, extracted.lastName]
        .filter((part): part is string => Boolean(part))
        .join(" ")
        .trim();
    }
  }

  return null;
};

const extractVehicleDetails = (
  lines: string[],
  asciiLines: string[]
): {
  carMake: string | null;
  carPlate: string | null;
  carVin: string | null;
  carOrv: string | null;
} => {
  const sectionStart = findSectionStart(asciiLines, /\budaje\s+o\s+vozidle\b/);
  if (sectionStart < 0) {
    return { carMake: null, carPlate: null, carVin: null, carOrv: null };
  }

  const sectionEnd = findSectionEnd(asciiLines, sectionStart, [
    /\bzakladni\s+udaje\s+pro\s+vypocet\b/,
    /\bpovinne\s+ruceni\b/,
    /\bhavarijni\s+pojisteni\b/,
    /\bplaceni\s+pojistneho\b/,
  ]);
  if (sectionEnd < sectionStart) {
    return { carMake: null, carPlate: null, carVin: null, carOrv: null };
  }

  let carPlate: string | null = null;
  let carOrv: string | null = null;
  let carVin: string | null = null;
  let carMake: string | null = null;

  for (let idx = sectionStart; idx <= sectionEnd; idx++) {
    const ascii = asciiLines[idx] ?? "";
    if (!ascii.includes("prukazu/cislo orv")) continue;

    const valueLine = findNextNonEmptyLine(
      lines,
      asciiLines,
      idx + 1,
      Math.min(sectionEnd, idx + 3),
      /registracni\s+znacka|prukazu\/cislo\s+orv|cislo\s+karoserie|tovarni\s+znacka|typ\s+a\s+provedeni/
    );
    if (!valueLine) continue;

    const upperRow = normalizeSpaces(valueLine).toUpperCase();
    const vinCandidate = upperRow.match(/\b[A-HJ-NPR-Z0-9]{10,20}\b/g)?.at(-1) ?? null;
    const normalizedVin = normalizeVin(vinCandidate);
    if (normalizedVin) {
      carVin = normalizedVin;
    }

    const rowWithoutVin = normalizedVin
      ? normalizeSpaces(upperRow.replace(normalizedVin, " "))
      : upperRow;

    const orvCandidate = rowWithoutVin.match(/\b[A-Z]{1,5}\d{4,12}\b/)?.[0] ?? null;
    const normalizedOrv = normalizeVehicleDocCode(orvCandidate);
    if (normalizedOrv) {
      carOrv = normalizedOrv;
    }

    let plateCandidate: string | null = null;
    if (normalizedOrv) {
      const splitIdx = rowWithoutVin.indexOf(normalizedOrv);
      if (splitIdx > 0) {
        plateCandidate = rowWithoutVin.slice(0, splitIdx).trim();
      }
    }
    if (!plateCandidate) {
      plateCandidate =
        rowWithoutVin.match(/^([0-9A-Z]{1,4}\s+[0-9A-Z]{2,6}|[0-9A-Z]{5,10})\b/)?.[1] ?? null;
    }
    const normalizedPlate = normalizePlate(plateCandidate);
    if (normalizedPlate) {
      carPlate = normalizedPlate;
    }

    break;
  }

  for (let idx = sectionStart; idx <= sectionEnd; idx++) {
    const ascii = asciiLines[idx] ?? "";
    if (!(ascii.includes("tovarni znacka") && ascii.includes("typ a provedeni"))) continue;

    const valueLine = findNextNonEmptyLine(
      lines,
      asciiLines,
      idx + 1,
      Math.min(sectionEnd, idx + 3),
      /tovarni\s+znacka|typ\s+a\s+provedeni|datum\s+uvedeni\s+do\s+provozu/
    );
    if (!valueLine) continue;

    const normalizedValue = normalizeSpaces(valueLine);
    const tokens = normalizedValue.split(" ").filter(Boolean);
    let cutIndex = tokens.length;
    for (let i = tokens.length - 1; i >= 0; i--) {
      if (/^\d[\d.,]*$/.test(tokens[i] ?? "")) continue;
      cutIndex = i + 1;
      break;
    }

    const candidateFromTokenTail =
      cutIndex < tokens.length ? tokens.slice(0, cutIndex).join(" ") : normalizedValue;
    const cleanedCandidate = normalizeVehicleMakeModel(candidateFromTokenTail);
    if (cleanedCandidate) {
      carMake = cleanedCandidate;
      break;
    }

    const fallback = normalizeVehicleMakeModel(
      normalizedValue.replace(/(?:\s+\d[\d.,]*){2,}\s*$/, "")
    );
    if (fallback) {
      carMake = fallback;
    }

    break;
  }

  return { carMake, carPlate, carVin, carOrv };
};

const extractContractNumber = (lines: string[], asciiLines: string[]): string | null => {
  for (let idx = 0; idx < asciiLines.length; idx++) {
    const ascii = asciiLines[idx] ?? "";
    if (!ascii.includes("cislo navrhu ps")) continue;

    const line = lines[idx] ?? "";
    const afterColon = line.includes(":") ? line.split(":").slice(1).join(":") : line;
    const fromAfterColon = normalizeContractNumber(afterColon);
    if (fromAfterColon) return fromAfterColon;

    const inlineMatch = line.match(/\b\d{6,}\b/g);
    if (inlineMatch?.length) {
      const fromInline = normalizeContractNumber(inlineMatch[0]);
      if (fromInline) return fromInline;
    }

    for (let step = 1; step <= 2; step++) {
      const next = lines[idx + step] ?? "";
      const parsed = normalizeContractNumber(next);
      if (parsed) return parsed;
    }
  }
  return null;
};

const extractDates = (
  lines: string[],
  asciiLines: string[]
): { contractSignedDate: string | null; policyStartDate: string | null } => {
  const sectionStart = findSectionStart(asciiLines, /\bpojistna\s+doba\b/);
  if (sectionStart < 0) {
    return { contractSignedDate: null, policyStartDate: null };
  }
  const sectionEnd = findSectionEnd(asciiLines, sectionStart, [
    /\budaje\s+o\s+vozidle\b/,
    /\bplaceni\s+pojistneho\b/,
    /\bzaverecna\s+ujednani\b/,
  ]);

  for (let idx = sectionStart; idx <= sectionEnd; idx++) {
    const ascii = asciiLines[idx] ?? "";
    if (
      !(
        ascii.includes("datum vyhotoveni navrhu pojistne smlouvy") &&
        ascii.includes("pocatek pojisteni")
      )
    ) {
      continue;
    }

    const candidateLine = findNextNonEmptyLine(
      lines,
      asciiLines,
      idx + 1,
      Math.min(sectionEnd, idx + 4),
      /datum vyhotoveni navrhu pojistne smlouvy|pocatek pojisteni/
    );
    if (!candidateLine) break;

    const matches = candidateLine.match(/\d{1,2}\.\s*\d{1,2}\.\s*\d{4}/g) ?? [];
    if (matches.length >= 2) {
      return {
        contractSignedDate: toDateInput(matches[0]),
        policyStartDate: toDateInput(matches[1]),
      };
    }
  }

  return { contractSignedDate: null, policyStartDate: null };
};

const extractFrequencyAndAmount = (
  lines: string[],
  asciiLines: string[]
): { frequency: PaymentFrequency | null; amount: number | null } => {
  const sectionStart = findSectionStart(asciiLines, /\bplaceni\s+pojistneho\b/);
  if (sectionStart < 0) return { frequency: null, amount: null };
  const sectionEnd = findSectionEnd(asciiLines, sectionStart, [
    /\blhuta\s+k\s+prijeti\b/,
    /\bprilohy\b/,
    /\bzaverecna\s+ujednani\b/,
  ]);

  let frequency: PaymentFrequency | null = null;
  let amount: number | null = null;

  for (let idx = sectionStart; idx <= sectionEnd; idx++) {
    const ascii = asciiLines[idx] ?? "";

    if (!frequency && ascii.includes("cetnost placeni")) {
      const inline = mapFrequency(lines[idx]);
      if (inline) {
        frequency = inline;
      } else {
        for (let step = 1; step <= 3; step++) {
          const nextIdx = idx + step;
          if (nextIdx > sectionEnd) break;
          const line = lines[nextIdx] ?? "";
          const parsed = mapFrequency(line);
          if (parsed) {
            frequency = parsed;
            break;
          }
        }
      }
    }

    if (!amount && /^pojistne\b/.test(ascii)) {
      for (let step = 1; step <= 5; step++) {
        const nextIdx = idx + step;
        if (nextIdx > sectionEnd) break;
        const candidateLine = lines[nextIdx] ?? "";
        const parsedAmount = parseAmount(candidateLine);
        if (parsedAmount !== null) {
          amount = parsedAmount;
          break;
        }
      }
    }

    if (frequency && amount !== null) break;
  }

  return { frequency, amount };
};

const extractLiabilityLimit = (lines: string[], asciiLines: string[]): number | null => {
  const sectionStart = findSectionStart(
    asciiLines,
    /\bpojisteni\s+odpovednosti\s+za\s+ujmu\s+zpusobenou\s+provozem\s+vozidla\b/
  );
  const sectionEnd =
    sectionStart >= 0
      ? findSectionEnd(asciiLines, sectionStart, [
          /\bhavarijni\s+pojisteni\b/,
          /\bdoplnkova\s+pojisteni\b/,
          /\brekapitulace\s+pojistneho\b/,
          /\bplaceni\s+pojistneho\b/,
        ])
      : -1;

  const labelIndexes: number[] = [];
  for (let idx = 0; idx < asciiLines.length; idx++) {
    const ascii = asciiLines[idx] ?? "";
    if (!ascii.includes("limit pojistneho plneni")) continue;
    if (!(ascii.includes("ujma na zdravi") || ascii.includes("ujma na vecech"))) continue;
    if (sectionStart >= 0 && sectionEnd >= sectionStart && (idx < sectionStart || idx > sectionEnd)) {
      continue;
    }
    labelIndexes.push(idx);
  }

  for (const idx of labelIndexes) {
    const inline = normalizeLiabilityLimit(lines[idx] ?? "");
    if (inline != null) return inline;

    for (let step = 1; step <= 3; step++) {
      const candidate = lines[idx + step] ?? "";
      const parsed = normalizeLiabilityLimit(candidate);
      if (parsed != null) return parsed;
    }
  }

  if (sectionStart >= 0 && sectionEnd >= sectionStart) {
    for (let idx = sectionStart; idx <= sectionEnd; idx++) {
      const ascii = asciiLines[idx] ?? "";
      if (!/\b\d[\d\s]{5,}\d\b/.test(ascii) || !ascii.includes("/")) continue;
      const parsed = normalizeLiabilityLimit(lines[idx] ?? "");
      if (parsed != null) return parsed;
    }
  }

  return null;
};

const extractHullDetailsAndAddons = (
  lines: string[],
  asciiLines: string[]
): {
  carHullSumInsured: number | null;
  carHullDeductible: number | null;
  carAddonGlass: boolean;
} => {
  const havStart = findSectionStart(asciiLines, /\bhavarijni\s+pojisteni\b/);
  const havEnd =
    havStart >= 0
      ? findSectionEnd(asciiLines, havStart, [
          /\bdoplnkova\s+pojisteni\b/,
          /\brekapitulace\s+pojistneho\b/,
          /\bplaceni\s+pojistneho\b/,
        ])
      : -1;

  let carHullDeductible: number | null = null;
  if (havStart >= 0 && havEnd >= havStart) {
    for (let idx = havStart; idx <= havEnd; idx++) {
      const ascii = asciiLines[idx] ?? "";
      if (!/^spoluucast\b/.test(ascii)) continue;

      const inline = parseAmount(lines[idx] ?? "");
      if (inline != null) {
        carHullDeductible = inline;
        break;
      }

      for (let step = 1; step <= 4; step++) {
        const candidate = lines[idx + step] ?? "";
        const parsed = parseAmount(candidate);
        if (parsed != null) {
          carHullDeductible = parsed;
          break;
        }
      }
      if (carHullDeductible != null) break;
    }
  }

  let carHullSumInsured: number | null = null;
  const sumLabelIndexes: number[] = [];
  for (let idx = 0; idx < asciiLines.length; idx++) {
    const ascii = asciiLines[idx] ?? "";
    if (!ascii.includes("pojistna castka vcetne")) continue;
    if (!ascii.includes("mimor")) continue;
    sumLabelIndexes.push(idx);
  }

  if (sumLabelIndexes.length > 0) {
    const orderedIndexes =
      havStart >= 0
        ? [...sumLabelIndexes].sort((a, b) => {
            const aPenalty = a <= havStart ? 0 : 1_000_000;
            const bPenalty = b <= havStart ? 0 : 1_000_000;
            return aPenalty + Math.abs(havStart - a) - (bPenalty + Math.abs(havStart - b));
          })
        : sumLabelIndexes;

    for (const idx of orderedIndexes) {
      const inline = parseAmount(lines[idx] ?? "");
      if (inline != null) {
        carHullSumInsured = inline;
        break;
      }

      for (let step = 1; step <= 4; step++) {
        const candidate = lines[idx + step] ?? "";
        const parsed = parseAmount(candidate);
        if (parsed != null) {
          carHullSumInsured = parsed;
          break;
        }
      }
      if (carHullSumInsured != null) break;
    }
  }

  const carAddonGlass = asciiLines.some((line) =>
    /\bpojisteni\s+okennich\s+skel\s+vozidla\b/.test(line)
  );

  return { carHullSumInsured, carHullDeductible, carAddonGlass };
};

const normalizeAssistancePlan = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const normalized = stripDiacritics(value).toLowerCase().replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  if (normalized.includes("nadstandard")) return "Nadstandard";
  if (normalized.includes("bez limitu")) return "Bez limitu";
  if (/\bstandard\b/.test(normalized)) return "standard";
  return null;
};

const extractAssistancePlan = (lines: string[], asciiLines: string[]): string => {
  const indexes: number[] = [];
  for (let idx = 0; idx < asciiLines.length; idx++) {
    const ascii = asciiLines[idx] ?? "";
    if (ascii.includes("asistencni sluzby")) {
      indexes.push(idx);
    }
  }

  for (const idx of indexes) {
    const line = lines[idx] ?? "";
    const inlineTail =
      line.match(/Asisten[čc]n[íi]\s+slu[zž]by\s*[–—-]\s*(.+)$/i)?.[1] ??
      line.match(/asistencni\s+sluzby\s*[–—-]\s*(.+)$/i)?.[1] ??
      null;
    const inlinePlan = normalizeAssistancePlan(inlineTail ?? line);
    if (inlinePlan) return inlinePlan;

    for (let step = 1; step <= 2; step++) {
      const candidate = lines[idx + step] ?? "";
      const parsed = normalizeAssistancePlan(candidate);
      if (parsed) return parsed;
    }
  }

  // Zadání: pokud v PDF varianta asistence nenajde, použij Standard.
  return "standard";
};

async function extractLayoutLinesFromPage(page: any): Promise<string[]> {
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
      return normalizeSpaces(line);
    })
    .filter(Boolean);
}

export async function parseCsobAutoPdf(file: File): Promise<CsobAutoPdfResult> {
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

  const loadingTask = pdfjsLib.getDocument({ data: buffer });
  const pdf = await loadingTask.promise;

  try {
    const allLines: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const pageLines = await extractLayoutLinesFromPage(page);
      allLines.push(...pageLines);
    }

    const asciiLines = allLines.map((line) => stripDiacritics(line).toLowerCase());

    const contractNumber = extractContractNumber(allLines, asciiLines);
    const clientName = extractClientName(allLines, asciiLines);
    const { contractSignedDate, policyStartDate } = extractDates(allLines, asciiLines);
    const { frequency, amount } = extractFrequencyAndAmount(allLines, asciiLines);
    const carLiabilityLimit = extractLiabilityLimit(allLines, asciiLines);
    const { carHullSumInsured, carHullDeductible, carAddonGlass } = extractHullDetailsAndAddons(
      allLines,
      asciiLines
    );
    const carAssistancePlan = extractAssistancePlan(allLines, asciiLines);
    const { carMake, carPlate, carVin, carOrv } = extractVehicleDetails(allLines, asciiLines);

    return {
      contractNumber,
      clientName,
      contractSignedDate,
      policyStartDate,
      frequency,
      amount,
      carLiabilityLimit,
      carHullSumInsured,
      carHullDeductible,
      carAddonGlass,
      carAssistancePlan,
      carMake,
      carPlate,
      carVin,
      carOrv,
    };
  } finally {
    await pdf.cleanup();
    await pdf.destroy();
  }
}
