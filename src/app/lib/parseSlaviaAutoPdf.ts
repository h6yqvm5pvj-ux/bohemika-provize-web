// src/app/lib/parseSlaviaAutoPdf.ts
import { type PaymentFrequency } from "../types/domain";

export type SlaviaAutoCoverageDetail = {
  liabilityVariant?: string | null;
  liabilityPropertyLimit?: number | null;
  priceGuarantee3Years?: boolean | null;
  driverInjury?: boolean | null;
  driverInjuryPermanentLimit?: number | null;
  driverInjuryDeathLimit?: number | null;
  tires?: boolean | null;
  tiresLimit?: number | null;
  tiresDeductible?: number | null;
  keyLossTheftLimit?: number | null;
  keyLossLimit?: number | null;
  keyLossTheftDeductible?: number | null;
  vandalismLimit?: number | null;
  vandalismDeductible?: number | null;
  animalDamageDeductible?: number | null;
};

export type SlaviaAutoPdfResult = {
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
  carOrv?: string | null;
  carLiabilityLimit?: number | null;
  carAssistancePlan?: string | null;
  carAddonGlass?: boolean | null;
  carAddonAnimalCollision?: boolean | null;
  carAddonAnimalDamage?: boolean | null;
  carAddonAnimalDamageLimit?: number | null;
  carAddonVandalism?: boolean | null;
  carAddonKeyLossTheft?: boolean | null;
  carSlaviaDetail?: SlaviaAutoCoverageDetail | null;
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
  const cleaned = val.replace(/\s+/g, "").replace(",", ".").trim();
  const num = Number.parseFloat(cleaned);
  return Number.isFinite(num) ? Math.round(num) : null;
};

const normalizeContractNumber = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const digits = value.replace(/\D+/g, "");
  if (digits.length < 6) return null;
  return digits;
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

  const titleCasePart = (part: string): string => {
    if (!part) return part;
    if (!/[A-Za-zÀ-ž]/.test(part)) return part;
    const lower = part.toLocaleLowerCase("cs-CZ");
    return `${lower.charAt(0).toLocaleUpperCase("cs-CZ")}${lower.slice(1)}`;
  };

  return cleaned
    .split(/\s+/)
    .map((word) =>
      word
        .split(/([-'])/)
        .map((part) => (part === "-" || part === "'" ? part : titleCasePart(part)))
        .join("")
    )
    .join(" ");
};

const mapFrequencyWord = (word: string | null | undefined): PaymentFrequency | null => {
  if (!word) return null;
  const w = stripDiacritics(word).toLowerCase();
  if (w.startsWith("mesic")) return "monthly";
  if (w.startsWith("ctvrt")) return "quarterly";
  if (w.startsWith("polo")) return "semiannual";
  if (w.startsWith("roc")) return "annual";
  return null;
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

const looksLikeStandaloneLabelLine = (value: string): boolean =>
  /[:：]\s*$/.test(value) || /^pojistnik$/i.test(stripDiacritics(value).trim());

const extractInlineValueAfterColon = (value: string): string | null => {
  const idx = value.indexOf(":");
  if (idx < 0) return null;
  const tail = value.slice(idx + 1).trim();
  return tail || null;
};

const findLabelIndexes = (asciiLines: string[], label: RegExp): number[] => {
  const out: number[] = [];
  asciiLines.forEach((line, idx) => {
    if (label.test(line)) out.push(idx);
  });
  return out;
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

const readContractNumberByPrimaryLabel = (
  lines: string[],
  asciiLines: string[]
): string | null => {
  const indexes = findLabelIndexes(
    asciiLines,
    /navrh\s+pojistne\s+smlouvy\s*(?:c\.?|cislo)?\s*:?\s*$/i
  );
  for (const idx of indexes) {
    for (let step = 1; step <= 7; step++) {
      const candidateLine = lines[idx + step] ?? "";
      const candidate = normalizeContractNumber(candidateLine);
      if (candidate) return candidate;
    }
  }
  return null;
};

const parseFrequencyFromInstallmentLine = (value: string | null | undefined): PaymentFrequency | null => {
  if (!value) return null;
  const normalized = stripDiacritics(value).toLowerCase().replace(/\s+/g, " ").trim();
  const match = normalized.match(
    /(\d{1,2})\s*x\s*(mesicne|mesicni|ctvrtletne|ctvrtletni|pololetne|pololetni|rocne|rocni)?/
  );
  if (!match) return null;
  const count = Number(match[1]);
  const word = match[2] ?? "";
  const fromWord = mapFrequencyWord(word);
  if (fromWord) return fromWord;
  if (count === 1) return "annual";
  if (count === 2) return "semiannual";
  if (count === 4) return "quarterly";
  if (count === 12) return "monthly";
  return null;
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

const extractDateByLabel = (
  lines: string[],
  asciiLines: string[],
  label: RegExp
): string | null => {
  const raw = readNearestValueByLabel(lines, asciiLines, label, 4);
  return toDateInput(raw);
};

const moneyAmountsFromLines = (values: string[]): number[] => {
  const matches = values.join(" ").matchAll(/(\d[\d\s\u00a0]*)\s*Kc\b/gi);
  const amounts: number[] = [];
  for (const match of matches) {
    const amount = Number.parseInt((match[1] ?? "").replace(/\s+/g, ""), 10);
    if (Number.isFinite(amount)) amounts.push(amount);
  }
  return amounts;
};

const sectionLinesBetween = (
  lines: string[],
  asciiLines: string[],
  startLabel: RegExp,
  endLabel: RegExp
): { lines: string[]; asciiLines: string[] } | null => {
  const start = asciiLines.findIndex((line) => startLabel.test(line));
  if (start < 0) return null;
  const relativeEnd = asciiLines.slice(start + 1).findIndex((line) => endLabel.test(line));
  const end = relativeEnd >= 0 ? start + 1 + relativeEnd : asciiLines.length;
  return {
    lines: lines.slice(start + 1, end),
    asciiLines: asciiLines.slice(start + 1, end),
  };
};

type SelectedCoverage = {
  selected: boolean;
  amounts: number[];
};

const selectedCoverageByLabel = (
  asciiLines: string[],
  label: RegExp
): SelectedCoverage => {
  const start = asciiLines.findIndex((line) => label.test(line));
  if (start < 0) return { selected: false, amounts: [] };

  const relativeEnd = asciiLines
    .slice(start + 1)
    .findIndex((line) => /:\s*$/.test(line));
  const end = relativeEnd >= 0 ? start + 1 + relativeEnd : asciiLines.length;
  const asciiValueLines = asciiLines.slice(start + 1, end);
  return {
    selected: asciiValueLines.some((line) => /^sjednano\b/.test(line)),
    amounts: moneyAmountsFromLines(asciiValueLines),
  };
};

const readSectionValue = (
  section: { lines: string[]; asciiLines: string[] } | null,
  label: RegExp,
  maxLookahead = 3
): string | null => {
  if (!section) return null;
  return readNearestValueByLabel(section.lines, section.asciiLines, label, maxLookahead);
};

export async function parseSlaviaAutoPdf(file: File): Promise<SlaviaAutoPdfResult> {
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
  const lines = fullText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const asciiLines = lines.map((line) => stripDiacritics(line).toLowerCase());
  const asciiText = stripDiacritics(fullText).toLowerCase().replace(/\s+/g, " ").trim();

  const result: SlaviaAutoPdfResult = {};

  const contractCandidates: string[] = [];
  const primaryContractNumber = readContractNumberByPrimaryLabel(lines, asciiLines);
  if (primaryContractNumber) {
    contractCandidates.push(primaryContractNumber);
  }
  const fallbackContractByVs = normalizeContractNumber(
    readNearestValueByLabel(lines, asciiLines, /variabilni\s+symbol/i, 3)
  );
  if (fallbackContractByVs) {
    contractCandidates.push(fallbackContractByVs);
  }
  if (contractCandidates.length === 0) {
    const fallbackDigits = asciiText.match(/\b\d{8,12}\b/g) ?? [];
    const counts = new Map<string, number>();
    fallbackDigits.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) {
      contractCandidates.push(sorted[0][0]);
    }
  }
  result.contractNumber = pickBestContractNumber(contractCandidates);

  const fullName =
    normalizeName(
      readNearestValueByLabel(lines, asciiLines, /jmeno\s+a\s+prijmeni/i, 4) ??
        readNearestValueByLabel(lines, asciiLines, /pojistnik\/?pojis?teny/i, 4) ??
        readNearestValueByLabel(lines, asciiLines, /pojistnik/i, 4)
    ) ?? null;

  if (fullName) {
    result.clientName = fullName;
  } else {
    const firstName = normalizeName(readNearestValueByLabel(lines, asciiLines, /jmeno/i, 2));
    const lastName = normalizeName(readNearestValueByLabel(lines, asciiLines, /prijmeni/i, 2));
    const joined = normalizeName([firstName, lastName].filter(Boolean).join(" "));
    if (joined) {
      result.clientName = joined;
    }
  }

  result.policyStartDate = extractDateByLabel(lines, asciiLines, /datum\s+vzniku\s+pojisteni/i);
  result.contractSignedDate = extractDateByLabel(
    lines,
    asciiLines,
    /datum\s+vytvoreni\s+navrhu/i
  );

  const amountRaw = readNearestValueByLabel(lines, asciiLines, /vyse\s+splatky/i, 4);
  const amount = parseAmount(amountRaw);
  if (amount != null) {
    result.amount = amount;
  }

  const installmentLineByAmount = (() => {
    const amountLabelIndexes = findLabelIndexes(asciiLines, /vyse\s+splatky/i);
    for (const idx of amountLabelIndexes) {
      for (let step = 1; step <= 4; step++) {
        const candidate = lines[idx + step]?.trim();
        if (!candidate) continue;
        if (/^\d+\s*x\s+/i.test(stripDiacritics(candidate))) {
          return candidate;
        }
      }
    }
    return null;
  })();
  const installmentLineGlobal =
    installmentLineByAmount ??
    readNearestValueByLabel(lines, asciiLines, /^\d+\s*x\s+/i, 1) ??
    lines.find((line) => /^\d+\s*x\s+/i.test(stripDiacritics(line)));
  const frequencyByCount = parseFrequencyFromInstallmentLine(installmentLineGlobal);

  const frequencyByText =
    mapFrequencyWord(
      readNearestValueByLabel(lines, asciiLines, /frekvence(?:\s+placeni)?/i, 3) ??
        readNearestValueByLabel(lines, asciiLines, /pojistne\s+obdobi/i, 3)
    ) ??
    mapFrequencyWord(
      asciiText.match(/\b(mesicni|mesicne|ctvrtletni|ctvrtletne|pololetni|pololetne|rocni|rocne)\b/i)?.[1]
    );
  result.frequency = frequencyByCount ?? frequencyByText ?? null;

  result.carMake = normalizeVehicleMakeModel(
    readNearestValueByLabel(lines, asciiLines, /tovarni\s+znacka\s+a\s+model/i, 4)
  );
  result.carPlate = normalizePlate(
    readNearestValueByLabel(lines, asciiLines, /registracni\s+znacka/i, 3)
  );
  result.carVin = normalizeVin(readNearestValueByLabel(lines, asciiLines, /^vin\s*:?\s*$/i, 3));
  result.carTp = normalizeVehicleDocCode(
    readNearestValueByLabel(lines, asciiLines, /cislo\s+tp/i, 3)
  );
  result.carOrv = normalizeVehicleDocCode(
    readNearestValueByLabel(lines, asciiLines, /cislo\s+orv/i, 3)
  );
  result.carLiabilityLimit = normalizeLiabilityLimit(
    readNearestValueByLabel(
      lines,
      asciiLines,
      /limit\s+plneni(?:\s+pro)?\s+ujmu\s+na\s+zdravi/i,
      4
    )
  );

  const liabilitySection = sectionLinesBetween(
    lines,
    asciiLines,
    /^povinne\s+ruceni$/i,
    /^asistence$/i
  );
  const assistanceSection = sectionLinesBetween(
    lines,
    asciiLines,
    /^asistence$/i,
    /^cena\s+pov\s*:/i
  );
  const coverageSection = sectionLinesBetween(
    lines,
    asciiLines,
    /^doplnkova\s+pojisteni$/i,
    /^cena\s+za\s+doplnkova\s+pojisteni\s*:/i
  );

  const slaviaDetail: SlaviaAutoCoverageDetail = {};
  const liabilityVariant = readSectionValue(liabilitySection, /^varianta\s*:/i);
  if (liabilityVariant) slaviaDetail.liabilityVariant = liabilityVariant;
  const liabilityPropertyLimit = normalizeLiabilityLimit(
    readSectionValue(
      liabilitySection,
      /limit\s+plneni\s+pro\s+skodu\s+na\s+majetku\s+a\s+usly\s+zisk/i,
      3
    )
  );
  if (liabilityPropertyLimit != null) {
    slaviaDetail.liabilityPropertyLimit = liabilityPropertyLimit;
  }
  const priceGuarantee = readSectionValue(
    liabilitySection,
    /garance\s+ceny\s+na\s+3\s+roky/i
  );
  if (priceGuarantee) {
    slaviaDetail.priceGuarantee3Years = /^sjednano\b/i.test(
      stripDiacritics(priceGuarantee).trim()
    );
  }

  const assistanceVariant = readSectionValue(assistanceSection, /^varianta\s*:/i);
  if (assistanceVariant) result.carAssistancePlan = assistanceVariant;

  if (coverageSection) {
    const driverInjury = selectedCoverageByLabel(
      coverageSection.asciiLines,
      /^uraz\s+ridice\s*:/i
    );
    const tires = selectedCoverageByLabel(
      coverageSection.asciiLines,
      /^pojisteni\s+pneumatik\s*:/i
    );
    const keyLossTheft = selectedCoverageByLabel(
      coverageSection.asciiLines,
      /^ztrata\s+a\s+odcizeni\s+klicu\s+od\s+vozidla\s*:/i
    );
    const vandalism = selectedCoverageByLabel(
      coverageSection.asciiLines,
      /^vandalismus\s*:/i
    );
    const animalDamage = selectedCoverageByLabel(
      coverageSection.asciiLines,
      /^poskozeni\s+kabelu\s+vozidla\s+zviretem\s*:/i
    );
    const glass = selectedCoverageByLabel(
      coverageSection.asciiLines,
      /^pojisteni\s+skel\s*:/i
    );
    const animalCollision = selectedCoverageByLabel(
      coverageSection.asciiLines,
      /^pojisteni\s+stretu\s+se\s+(?:zviretem|zveri)\s*:/i
    );

    slaviaDetail.driverInjury = driverInjury.selected;
    slaviaDetail.driverInjuryPermanentLimit = driverInjury.amounts[0] ?? null;
    slaviaDetail.driverInjuryDeathLimit = driverInjury.amounts[1] ?? null;
    slaviaDetail.tires = tires.selected;
    slaviaDetail.tiresLimit = tires.amounts[0] ?? null;
    slaviaDetail.tiresDeductible = tires.amounts[1] ?? null;
    slaviaDetail.keyLossTheftLimit = keyLossTheft.amounts[0] ?? null;
    slaviaDetail.keyLossLimit = keyLossTheft.amounts[1] ?? null;
    slaviaDetail.keyLossTheftDeductible = keyLossTheft.amounts[2] ?? null;
    slaviaDetail.vandalismLimit = vandalism.amounts[0] ?? null;
    slaviaDetail.vandalismDeductible = vandalism.amounts[1] ?? null;
    slaviaDetail.animalDamageDeductible = animalDamage.amounts[1] ?? null;

    result.carAddonKeyLossTheft = keyLossTheft.selected;
    result.carAddonGlass = glass.selected;
    result.carAddonAnimalCollision = animalCollision.selected;
    result.carAddonVandalism = vandalism.selected;
    result.carAddonAnimalDamage = animalDamage.selected;
    result.carAddonAnimalDamageLimit = animalDamage.amounts[0] ?? null;
  }

  if (Object.keys(slaviaDetail).length > 0) {
    result.carSlaviaDetail = slaviaDetail;
  }

  if (!result.carVin) {
    // Fallback, když je VIN v jednom řádku i s labelem.
    const vinInline = readNearestValueByLabel(lines, asciiLines, /vin/i, 2);
    result.carVin = normalizeVin(vinInline);
  }

  if (!result.contractNumber) {
    const fallbackContract = normalizeContractNumber(
      readNearestValueByLabel(
        lines,
        asciiLines,
        /(?:cislo|c\.)\s*(?:pojistne\s*)?(?:smlouvy|navrhu|navrh(?:u|y)?)/i,
        5
      )
    );
    if (fallbackContract) {
      result.contractNumber = fallbackContract;
    }
  }

  if (!result.clientName) {
    const fallbackName = normalizeName(
      readNearestValueByLabel(lines, asciiLines, /jmeno\s+a\s+prijmeni/i, 5)
    );
    if (fallbackName) {
      result.clientName = fallbackName;
    }
  }

  if (!result.policyStartDate) {
    result.policyStartDate = extractDateByLabel(
      lines,
      asciiLines,
      /(?:pocatek|datum\s+vzniku)\s+pojisteni/i
    );
  }

  if (!result.contractSignedDate) {
    result.contractSignedDate = extractDateByLabel(
      lines,
      asciiLines,
      /(?:datum\s+sjednani|sjednano\s+dne|uzavreno\s+dne)/i
    );
  }

  return result;
}
