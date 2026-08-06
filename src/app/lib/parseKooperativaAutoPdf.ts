// src/app/lib/parseKooperativaAutoPdf.ts
import { type PaymentFrequency } from "../types/domain";

export type KooperativaAutoPdfResult = {
  contractNumber?: string | null;
  clientName?: string | null;
  birthNumber?: string | null;
  policyholderBirthDate?: string | null;
  companyId?: string | null;
  policyholderType?: "legal_entity" | "natural_person" | null;
  policyStartDate?: string | null;
  contractSignedDate?: string | null;
  amount?: number | null;
  frequency?: PaymentFrequency | null;
  carMake?: string | null;
  carPlate?: string | null;
  carVin?: string | null;
  carOrv?: string | null;
  carLiabilityLimit?: number | null;
  carHullSumInsured?: number | null;
  carHullDeductible?: number | null;
  carHullRiskAccident?: boolean | null;
  carHullRiskTheft?: boolean | null;
  carHullRiskNatural?: boolean | null;
  carHullRiskVandalism?: boolean | null;
  carAssistancePlan?: string | null;
  carAddonGlass?: boolean | null;
  carAddonNatural?: boolean | null;
  carAddonAnimalDamage?: boolean | null;
  carAddonReplacementCar?: boolean | null;
  carAddonLuggage?: boolean | null;
  carAddonTransportedGoods?: boolean | null;
  carAddonPothole?: boolean | null;
  carAddonNonFaultAccident?: boolean | null;
};

const stripDiacritics = (text: string) =>
  text.normalize("NFD").replace(/\p{Diacritic}/gu, "");

const toDateInput = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const m = value.match(/(\d{1,2})\s*[./]\s*(\d{1,2})\s*[./]\s*(\d{4})/);
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
  const normalized = val.replace(/\u00A0/g, " ");
  const candidateMatch =
    normalized.match(/(\d[\d\s]*(?:[.,]\d{1,2})?)/)?.[1] ?? null;
  if (!candidateMatch) return null;
  const cleaned = candidateMatch.replace(/\s+/g, "").replace(",", ".").trim();
  const num = Number.parseFloat(cleaned);
  return Number.isFinite(num) ? Math.round(num) : null;
};

const normalizeContractNumber = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const digits = value.replace(/\D+/g, "");
  if (digits.length < 6) return null;
  return digits;
};

export const normalizeCzechBirthNumber = (
  value: string | null | undefined
): string | null => {
  if (!value) return null;
  const digits = value.replace(/\D+/g, "");
  return digits.length === 9 || digits.length === 10 ? digits : null;
};

export const normalizeCzechCompanyId = (
  value: string | null | undefined
): string | null => {
  if (!value) return null;
  const digits = value.replace(/\D+/g, "");
  return digits.length === 8 ? digits : null;
};

type PositionedTextItem = {
  page: number;
  text: string;
  x: number;
  y: number;
};

const readValueToRightOfLabel = (
  items: PositionedTextItem[],
  label: RegExp,
  normalize: (value: string | null | undefined) => string | null
): string | null => {
  const labels = items.filter((item) =>
    label.test(stripDiacritics(item.text).toLowerCase().trim())
  );

  for (const labelItem of labels) {
    const candidates = items
      .filter(
        (item) =>
          item.page === labelItem.page &&
          item.x > labelItem.x &&
          Math.abs(item.y - labelItem.y) <= 4
      )
      .sort((left, right) => left.x - right.x);
    for (const candidate of candidates) {
      const normalized = normalize(candidate.text);
      if (normalized) return normalized;
    }
  }

  return null;
};

export const birthDateFromCzechBirthNumber = (
  value: string | null | undefined
): string | null => {
  const birthNumber = normalizeCzechBirthNumber(value);
  if (!birthNumber) return null;

  const yearSuffix = Number(birthNumber.slice(0, 2));
  const rawMonth = Number(birthNumber.slice(2, 4));
  const day = Number(birthNumber.slice(4, 6));
  if (!Number.isInteger(yearSuffix) || !Number.isInteger(day) || day < 1) return null;

  let month = rawMonth;
  if (rawMonth >= 71 && rawMonth <= 82) {
    month -= 70;
  } else if (rawMonth >= 51 && rawMonth <= 62) {
    month -= 50;
  } else if (rawMonth >= 21 && rawMonth <= 32) {
    month -= 20;
  }
  if (month < 1 || month > 12) return null;

  const currentYearSuffix = new Date().getFullYear() % 100;
  const year =
    birthNumber.length === 9
      ? 1900 + yearSuffix
      : yearSuffix <= currentYearSuffix
        ? 2000 + yearSuffix
        : 1900 + yearSuffix;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.${year}`;
};

const pickBestContractNumber = (candidates: string[]): string | null => {
  if (candidates.length === 0) return null;
  const unique = Array.from(new Set(candidates));
  unique.sort((a, b) => {
    const score = (value: string) =>
      (value.length >= 8 && value.length <= 12 ? 100 : 0) - Math.abs(value.length - 10);
    return score(b) - score(a);
  });
  return unique[0] ?? null;
};

const extractInlineValueAfterColon = (value: string): string | null => {
  const idx = value.indexOf(":");
  if (idx < 0) return null;
  const tail = value.slice(idx + 1).trim();
  return tail || null;
};

const looksLikeStandaloneLabelLine = (value: string): boolean =>
  /[:：]\s*$/.test(value) ||
  /^(pojistnik|pojisteny|nazev|jmeno|prijmeni|datum|frekvence|pojistne|typ osoby|ico|adresa|email|mobil|platce dph)\s*$/i.test(
    stripDiacritics(value).trim()
  ) ||
  stripDiacritics(value).toLowerCase().includes("nazev/jmeno a prijmeni") ||
  stripDiacritics(value).toLowerCase().includes("titul, jmeno, prijmeni");

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

const HULL_RISK_LABELS = [
  /^havarie\b/i,
  /^vandalismus\b/i,
  /^odcizeni\b/i,
  /^zivel\b/i,
];

const findHullRiskAnsweredYes = ({
  asciiLines,
  sectionStart,
  sectionEnd,
  label,
}: {
  asciiLines: string[];
  sectionStart: number;
  sectionEnd: number;
  label: RegExp;
}): boolean => {
  let riskIndex = -1;
  for (let i = sectionStart; i <= sectionEnd; i++) {
    if (label.test(asciiLines[i] ?? "")) {
      riskIndex = i;
      break;
    }
  }
  if (riskIndex < 0) return false;

  if (/\bano\b/i.test(asciiLines[riskIndex] ?? "")) return true;

  for (let step = 1; step <= 5 && riskIndex + step <= sectionEnd; step++) {
    const candidate = asciiLines[riskIndex + step] ?? "";
    if (!candidate) continue;
    if (/\bano\b/i.test(candidate)) return true;
    if (/\bne\b/i.test(candidate)) return false;
    if (HULL_RISK_LABELS.some((riskLabel) => riskLabel.test(candidate))) {
      break;
    }
  }

  return false;
};

const normalizeName = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const cleaned = value
    .replace(/\s+/g, " ")
    .replace(/^[\s:;,\-–—]+|[\s:;,\-–—]+$/g, "")
    .replace(/\d.*$/, "")
    .trim();
  if (!cleaned || cleaned.length < 3) return null;
  if (!/[A-Za-zÀ-ž]/.test(cleaned)) return null;

  const blockedPrefixes = [
    "adresa",
    "email",
    "telefon",
    "rodne cislo",
    "datum",
    "ulice",
    "psc",
    "obec",
    "variabilni symbol",
    "cislo smlouvy",
  ];
  const ascii = stripDiacritics(cleaned).toLowerCase();
  if (blockedPrefixes.some((prefix) => ascii.startsWith(prefix))) return null;

  const titleSet = new Set([
    "ing",
    "mgr",
    "bc",
    "phdr",
    "judr",
    "mudr",
    "pharmdr",
    "phd",
    "dis",
  ]);
  const withoutTitles = cleaned
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !titleSet.has(token.replace(/\./g, "").toLowerCase()))
    .join(" ");

  const result = withoutTitles.trim();
  return result.length >= 3 ? result : null;
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
  if (cleaned === "NENI" || cleaned === "NENÍ") return null;
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

const mapFrequencyWord = (word: string | null | undefined): PaymentFrequency | null => {
  if (!word) return null;
  const normalized = stripDiacritics(word).toLowerCase();
  if (normalized.includes("mesic")) return "monthly";
  if (normalized.includes("ctvrt")) return "quarterly";
  if (normalized.includes("polo")) return "semiannual";
  if (normalized.includes("roc")) return "annual";
  return null;
};

const normalizeHullDeductible = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const normalized = value.replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();

  // Prefer "minimálně X Kč" when participation is combined with percent (e.g. "15 %, minimálně 15 000 Kč").
  const minimumMatch = normalized.match(/min(?:im[aá]ln[eě]?)?\s*([0-9][0-9\s]*(?:[.,][0-9]{1,2})?)/i);
  const minimumValue = parseAmount(minimumMatch?.[1] ?? null);
  if (minimumValue != null) return minimumValue;

  const amountMatches = normalized.match(/[0-9][0-9\s]*(?:[.,][0-9]{1,2})?/g) ?? [];
  const parsedValues = amountMatches
    .map((candidate) => parseAmount(candidate))
    .filter((value): value is number => value != null);
  if (parsedValues.length === 0) return null;

  // If multiple numeric tokens are present, pick the highest Kč amount instead of percentage token.
  return Math.max(...parsedValues);
};

const normalizeAssistancePlan = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const normalized = stripDiacritics(value).toLowerCase().replace(/\s+/g, " ").trim();
  if (!normalized) return null;

  if (/^max\s*\+/.test(normalized)) return "MAX+";
  if (normalized.startsWith("zaklad")) return "ZÁKLAD";
  if (normalized.startsWith("ideal")) return "IDEÁL";
  if (normalized.startsWith("max")) return "MAX";

  if (normalized === "s") return "S";
  if (normalized === "m") return "M";
  if (normalized === "xl") return "XL";
  if (normalized === "vip") return "VIP";

  if (/^rozsirena\s+asistence\s+150\s*km$/i.test(normalized)) {
    return "Rozšířená asistence 150km";
  }
  if (/^rozsirena\s+asistence\s+750\s*km$/i.test(normalized)) {
    return "Rozšířená asistence 750km";
  }

  return null;
};

const findSectionStartIndexes = (
  asciiLines: string[],
  sectionLabel: RegExp,
  maxScanDistance = 8
): number[] => {
  const starts: number[] = [];
  for (let i = 0; i < asciiLines.length; i++) {
    if (!sectionLabel.test(asciiLines[i] ?? "")) continue;

    let hasHullSumLabel = false;
    let hasDeductibleLabel = false;
    for (let step = 1; step <= maxScanDistance; step++) {
      const candidate = asciiLines[i + step] ?? "";
      if (!candidate) continue;
      if (/^pojistna\s+castka\b/.test(candidate)) hasHullSumLabel = true;
      if (/^spoluucast\b/.test(candidate)) hasDeductibleLabel = true;
    }
    if (hasHullSumLabel || hasDeductibleLabel) {
      starts.push(i);
    }
  }
  return starts;
};

const readSectionValue = (
  lines: string[],
  asciiLines: string[],
  sectionStart: number,
  label: RegExp,
  maxLookahead = 10
): string | null => {
  const end = Math.min(asciiLines.length - 1, sectionStart + maxLookahead);
  for (let i = sectionStart + 1; i <= end; i++) {
    if (!label.test(asciiLines[i] ?? "")) continue;

    const inline = extractInlineValueAfterColon(lines[i] ?? "");
    if (inline) return inline;

    for (let step = 1; step <= 3 && i + step <= end; step++) {
      const next = lines[i + step]?.trim();
      if (!next) continue;
      if (looksLikeStandaloneLabelLine(next)) continue;
      return next;
    }
  }
  return null;
};

const parseFrequency = (value: string | null | undefined): PaymentFrequency | null => {
  if (!value) return null;
  const normalized = stripDiacritics(value).toLowerCase().replace(/\s+/g, " ").trim();

  const monthPeriodMatch = normalized.match(/\b(12|6|3|1)\s*mesic\w*\b/);
  const periodMonths = monthPeriodMatch?.[1] ? Number(monthPeriodMatch[1]) : null;
  if (periodMonths === 12) return "annual";
  if (periodMonths === 6) return "semiannual";
  if (periodMonths === 3) return "quarterly";
  if (periodMonths === 1) return "monthly";

  const byCount = normalized.match(/\b(1|2|4|12)\s*x\b/)?.[1];
  if (byCount === "12") return "monthly";
  if (byCount === "4") return "quarterly";
  if (byCount === "2") return "semiannual";
  if (byCount === "1") return "annual";

  const fromWord = mapFrequencyWord(normalized);
  if (fromWord) return fromWord;

  return null;
};

const inferFrequencyFromPremiumRatio = ({
  periodPremium,
  annualPremium,
}: {
  periodPremium: number | null;
  annualPremium: number | null;
}): PaymentFrequency | null => {
  if (periodPremium == null || annualPremium == null) return null;
  if (periodPremium <= 0 || annualPremium <= 0) return null;

  const ratio = annualPremium / periodPremium;
  const isClose = (target: number) => Math.abs(ratio - target) <= 0.08;
  if (isClose(1)) return "annual";
  if (isClose(2)) return "semiannual";
  if (isClose(4)) return "quarterly";
  if (isClose(12)) return "monthly";
  return null;
};

export async function parseKooperativaAutoPdf(
  file: File
): Promise<KooperativaAutoPdfResult> {
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
  const positionedTextItems: PositionedTextItem[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    content.items.forEach((item: any) => {
      if (typeof item?.str !== "string" || !item.str.trim()) return;
      positionedTextItems.push({
        page: i,
        text: item.str.trim(),
        x: Number(item.transform?.[4] ?? 0),
        y: Number(item.transform?.[5] ?? 0),
      });
    });
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
  const asciiText = stripDiacritics(fullText).toLowerCase().replace(/\s+/g, " ").trim();

  const result: KooperativaAutoPdfResult = {};

  const contractCandidates: string[] = [];
  const contractByLabel = normalizeContractNumber(
    readNearestValueByLabel(lines, asciiLines, /cislo\s+navrhu/i, 5) ??
      readNearestValueByLabel(lines, asciiLines, /cislo\s+pojistne\s+smlouvy/i, 5) ??
      readNearestValueByLabel(lines, asciiLines, /cislo\s+smlouvy/i, 5) ??
      readNearestValueByLabel(lines, asciiLines, /variabilni\s+symbol/i, 3)
  );
  if (contractByLabel) contractCandidates.push(contractByLabel);

  const contractByRegex =
    normalizeContractNumber(
      fullText.match(/Číslo\s+pojistné\s+smlouvy[^\d]*([\d\s]{6,30})/i)?.[1]
    ) ??
    normalizeContractNumber(
      fullText.match(/Číslo\s+smlouvy[^\d]*([\d\s]{6,30})/i)?.[1]
    );
  if (contractByRegex) contractCandidates.push(contractByRegex);

  if (contractCandidates.length === 0) {
    const digitMatches = asciiText.match(/\b\d{8,12}\b/g) ?? [];
    const counts = new Map<string, number>();
    digitMatches.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
    const ranked = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([value]) => value);
    contractCandidates.push(...ranked);
  }
  result.contractNumber = pickBestContractNumber(contractCandidates);

  const birthNumberByLabel =
    readNearestValueByLabel(lines, asciiLines, /rodne\s+cislo/i, 3) ??
    fullText.match(/Rodn[eé]\s+č[ií]slo\s*[:\-]?\s*(\d{6}\s*\/?\s*\d{3,4})/i)?.[1] ??
    null;
  const birthNumber = normalizeCzechBirthNumber(birthNumberByLabel);
  if (birthNumber) result.birthNumber = birthNumber;

  const policyholderTypeRaw = readNearestValueByLabel(
    lines,
    asciiLines,
    /typ\s+osoby/i,
    3
  );
  const policyholderType = stripDiacritics(policyholderTypeRaw ?? "").toLowerCase();
  if (/pravnicka\s+osoba/.test(policyholderType)) {
    result.policyholderType = "legal_entity";
  } else if (/fyzicka\s+osoba|obcan/.test(policyholderType)) {
    result.policyholderType = "natural_person";
  }

  const companyId =
    readValueToRightOfLabel(
      positionedTextItems,
      /^ic(?:o)?$/i,
      normalizeCzechCompanyId
    ) ??
    normalizeCzechCompanyId(
      readNearestValueByLabel(lines, asciiLines, /\bic(?:o)?\b/i, 3)
    );
  if (companyId) result.companyId = companyId;

  const policyholderBirthDate =
    readValueToRightOfLabel(
      positionedTextItems,
      /^datum\s+narozeni$/i,
      toDateInput
    ) ??
    toDateInput(readNearestValueByLabel(lines, asciiLines, /datum\s+narozeni/i, 3));
  if (policyholderBirthDate) result.policyholderBirthDate = policyholderBirthDate;

  const fullName =
    normalizeName(
      readNearestValueByLabel(lines, asciiLines, /nazev\/?jmeno\s+a\s+prijmeni/i, 4) ??
        readNearestValueByLabel(lines, asciiLines, /pojistnik\/?pojisteny/i, 4) ??
        readNearestValueByLabel(lines, asciiLines, /jmeno\s+a\s+prijmeni/i, 4) ??
        readNearestValueByLabel(lines, asciiLines, /pojistnik/i, 4)
    ) ?? null;

  if (fullName) {
    result.clientName = fullName;
  } else {
    const first = normalizeName(readNearestValueByLabel(lines, asciiLines, /^jmeno\b/i, 3));
    const last = normalizeName(readNearestValueByLabel(lines, asciiLines, /prijmeni/i, 3));
    const joined = normalizeName([first, last].filter(Boolean).join(" "));
    if (joined) result.clientName = joined;
  }

  const policyStartRaw =
    readNearestValueByLabel(lines, asciiLines, /pocatek\s+pojisteni/i, 4) ??
    readNearestValueByLabel(lines, asciiLines, /pocatek\s+pojistne\s+doby/i, 4) ??
    readNearestValueByLabel(lines, asciiLines, /pojisteni\s+od/i, 3);
  const policyStartDate = toDateInput(policyStartRaw);
  if (policyStartDate) {
    result.policyStartDate = policyStartDate;
  }

  const signedRaw =
    readNearestValueByLabel(lines, asciiLines, /datum\s+vzniku\s+navrhu\s+smlouvy/i, 4) ??
    readNearestValueByLabel(lines, asciiLines, /datum\s+sjednani/i, 4) ??
    readNearestValueByLabel(lines, asciiLines, /uzavrena?\s+dne/i, 4) ??
    readNearestValueByLabel(lines, asciiLines, /datum\s+vytvoreni/i, 4) ??
    readNearestValueByLabel(lines, asciiLines, /nabidka\s+vytvorena\s+dne/i, 4);
  const contractSignedDate = toDateInput(signedRaw);
  if (contractSignedDate) {
    result.contractSignedDate = contractSignedDate;
  }

  const manufacturer = normalizeVehicleMakeModel(
    readNearestValueByLabel(lines, asciiLines, /tovarni\s+znacka/i, 4)
  );
  const model = normalizeVehicleMakeModel(
    readNearestValueByLabel(lines, asciiLines, /obchodni\s+oznaceni/i, 4)
  );
  const mergedMakeModel = normalizeVehicleMakeModel(
    [manufacturer, model].filter(Boolean).join(" ")
  );
  if (mergedMakeModel) {
    result.carMake = mergedMakeModel;
  } else {
    const fallback = normalizeVehicleMakeModel(
      readNearestValueByLabel(lines, asciiLines, /znacka.*model/i, 4)
    );
    if (fallback) {
      result.carMake = fallback;
    }
  }

  const plate = normalizePlate(
    readNearestValueByLabel(lines, asciiLines, /registracni\s+znacka/i, 3)
  );
  if (plate) {
    result.carPlate = plate;
  }

  const vin = normalizeVin(readNearestValueByLabel(lines, asciiLines, /^vin$/i, 3));
  if (vin) {
    result.carVin = vin;
  }

  const orv = normalizeVehicleDocCode(
    readNearestValueByLabel(lines, asciiLines, /cislo\s+technicaku/i, 3)
  );
  if (orv) {
    result.carOrv = orv;
  }

  const liabilityLimit = normalizeLiabilityLimit(
    readNearestValueByLabel(
      lines,
      asciiLines,
      /limit\s+pro\s+ujmu\s+na\s+zdravi\s+nebo\s+na\s+zivote/i,
      4
    ) ??
      readNearestValueByLabel(lines, asciiLines, /limit\s+pro\s+ujmu\s+na\s+zdravi/i, 4)
  );
  if (liabilityLimit != null) {
    result.carLiabilityLimit = liabilityLimit;
  }

  const assistancePlanRaw =
    readNearestValueByLabel(lines, asciiLines, /asistencni\s+program/i, 4) ??
    asciiText.match(
      /asistencni\s+program[^a-z0-9]{0,12}(zaklad|ideal|max\s*\+|max|s|m|xl|vip|rozsirena\s+asistence\s+(?:150|750)\s*km)\b/i
    )?.[1] ??
    null;
  const assistancePlan = normalizeAssistancePlan(assistancePlanRaw);
  if (assistancePlan) {
    result.carAssistancePlan = assistancePlan;
  }

  const hullSectionStarts = findSectionStartIndexes(
    asciiLines,
    /^havarijni\s+pojisteni\b/i,
    10
  );
  for (const sectionStart of hullSectionStarts) {
    const sectionEnd = Math.min(asciiLines.length - 1, sectionStart + 70);
    const hullSumRaw = readSectionValue(
      lines,
      asciiLines,
      sectionStart,
      /^pojistna\s+castka\b/i,
      10
    );
    const hullSum = parseAmount(hullSumRaw);
    if (hullSum != null) {
      result.carHullSumInsured = hullSum;
    }

    const deductibleRaw = readSectionValue(
      lines,
      asciiLines,
      sectionStart,
      /^spoluucast\b/i,
      10
    );
    const deductible = normalizeHullDeductible(deductibleRaw);
    if (deductible != null) {
      result.carHullDeductible = deductible;
    }

    let hasHullRiskBlock = false;
    let hullRiskStart = -1;
    for (let i = sectionStart + 1; i <= sectionEnd; i++) {
      if (/^pojisteni\s+sjednavame\s+pro\s+pripady\b/i.test(asciiLines[i] ?? "")) {
        hasHullRiskBlock = true;
        hullRiskStart = i;
        break;
      }
    }

    if (hasHullRiskBlock && hullRiskStart >= 0) {
      result.carHullRiskAccident = findHullRiskAnsweredYes({
        asciiLines,
        sectionStart: hullRiskStart + 1,
        sectionEnd,
        label: /^havarie\b/i,
      });
      result.carHullRiskTheft = findHullRiskAnsweredYes({
        asciiLines,
        sectionStart: hullRiskStart + 1,
        sectionEnd,
        label: /^odcizeni\b/i,
      });
      result.carHullRiskNatural = findHullRiskAnsweredYes({
        asciiLines,
        sectionStart: hullRiskStart + 1,
        sectionEnd,
        label: /^zivel\b/i,
      });
      result.carHullRiskVandalism = findHullRiskAnsweredYes({
        asciiLines,
        sectionStart: hullRiskStart + 1,
        sectionEnd,
        label: /^vandalismus\b/i,
      });
    }

    if (
      result.carHullSumInsured != null ||
      result.carHullDeductible != null ||
      hasHullRiskBlock
    ) {
      break;
    }
  }

  result.carAddonGlass = /pojisteni\s+skel/i.test(asciiText);
  result.carAddonNatural = /zivelni\s+pojisteni/i.test(asciiText);
  result.carAddonAnimalDamage = /pojisteni\s+poskozeni\s+vozidla\s+zviretem/i.test(
    asciiText
  );
  result.carAddonLuggage = /pojisteni\s+zavazadel(?:,|\s)\s*nosicu\s+a\s+boxu/i.test(
    asciiText
  );
  result.carAddonReplacementCar = /pojisteni\s+nahradniho\s+vozidla/i.test(asciiText);
  result.carAddonTransportedGoods = /pojisteni\s+dopravovanych\s+veci/i.test(
    asciiText
  );

  result.carAddonPothole = /pojisteni\s+vymol/i.test(asciiText);
  result.carAddonNonFaultAccident = /pojisteni\s+nezavinene\s+nehody/i.test(
    asciiText
  );

  const amountSources = [
    readNearestValueByLabel(lines, asciiLines, /vyse\s+splatky/i, 4),
    readNearestValueByLabel(lines, asciiLines, /pojistne\s+za\s+pojistne\s+obdobi/i, 4),
    readNearestValueByLabel(lines, asciiLines, /castka\s+k\s+uhrade/i, 4),
    readNearestValueByLabel(lines, asciiLines, /rocni\s+pojistne/i, 4),
    readNearestValueByLabel(lines, asciiLines, /celkove\s+pojistne/i, 4),
    asciiText.match(
      /(?:castka k uhrade|vyse splatky|pojistne za pojistne obdobi)[^0-9]{0,20}([0-9][0-9\s]*(?:[.,][0-9]{1,2})?)/
    )?.[1] ?? null,
  ];

  for (const source of amountSources) {
    const amount = parseAmount(source);
    if (amount != null) {
      result.amount = amount;
      break;
    }
  }

  const insurancePeriodFrequency = parseFrequency(
    readNearestValueByLabel(lines, asciiLines, /pojistne\s+obdobi/i, 3)
  );
  const premiumRatioFrequency = inferFrequencyFromPremiumRatio({
    periodPremium: parseAmount(
      readNearestValueByLabel(lines, asciiLines, /pojistne\s+za\s+pojistne\s+obdobi/i, 4)
    ),
    annualPremium: parseAmount(
      readNearestValueByLabel(lines, asciiLines, /celkove\s+rocni\s+pojistne/i, 4) ??
        readNearestValueByLabel(lines, asciiLines, /rocni\s+pojistne/i, 4)
    ),
  });
  const freqSources = [
    insurancePeriodFrequency,
    premiumRatioFrequency,
    readNearestValueByLabel(lines, asciiLines, /frekvence\s+placeni/i, 3),
    readNearestValueByLabel(lines, asciiLines, /frekvence\s+platby/i, 3),
    readNearestValueByLabel(lines, asciiLines, /splatnost\s+pojistneho/i, 3),
    asciiText,
  ];
  for (const source of freqSources) {
    const freq =
      source === "monthly" ||
      source === "quarterly" ||
      source === "semiannual" ||
      source === "annual"
        ? source
        : parseFrequency(source);
    if (freq) {
      result.frequency = freq;
      break;
    }
  }

  return result;
}
