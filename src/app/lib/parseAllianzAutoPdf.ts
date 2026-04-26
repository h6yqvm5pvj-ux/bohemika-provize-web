// src/app/lib/parseAllianzAutoPdf.ts
import { type PaymentFrequency } from "../types/domain";

export type AllianzAutoPdfResult = {
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
  carAllianzScope?: string | null;
  carLiabilityLimit?: number | null;
  carHullDeductible?: number | null;
  carHullDeductibleText?: string | null;
  carHullRiskAccident?: boolean | null;
  carHullRiskTheft?: boolean | null;
  carHullRiskNatural?: boolean | null;
  carHullRiskVandalism?: boolean | null;
  carHullRiskAnimalCollision?: boolean | null;
  carAssistancePlan?: string | null;
  carAddonGlass?: boolean | null;
  carAddonAnimalDamage?: boolean | null;
  carAddonVandalism?: boolean | null;
  carAddonNatural?: boolean | null;
  carAddonTheft?: boolean | null;
  carAddonGap?: boolean | null;
  carAddonFireExplosion?: boolean | null;
  carAddonLegalAdvice?: boolean | null;
};

const stripDiacritics = (text: string) =>
  text.normalize("NFD").replace(/\p{Diacritic}/gu, "");

type PositionedTextItem = {
  str: string;
  x: number;
  y: number;
  width: number;
};

const LINE_Y_TOLERANCE = 2;
const WORD_GAP_THRESHOLD = 1.5;

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
      return line.replace(/\s+/g, " ").trim();
    })
    .filter(Boolean);
}

const extractInlineValueAfterColon = (value: string): string | null => {
  const idx = value.indexOf(":");
  if (idx < 0) return null;
  const tail = value.slice(idx + 1).trim();
  return tail || null;
};

const looksLikeStandaloneLabelLine = (value: string): boolean =>
  /[:：]\s*$/.test(value) ||
  /^(datum|datum a cas|pojistnik|pojisteny|adresa|telefon|email|nabidka|pozadovany|cena|pojistne|frekvence)\b/i.test(
    stripDiacritics(value).trim()
  );

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
  const candidate =
    val
      .replace(/\u00A0/g, " ")
      .match(/([0-9][0-9\s]*(?:[.,][0-9]{1,2})?)/)?.[1] ?? null;
  if (!candidate) return null;
  const cleaned = candidate.replace(/\s+/g, "").replace(",", ".").trim();
  const num = Number.parseFloat(cleaned);
  return Number.isFinite(num) ? Math.round(num) : null;
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
  if (digits.length < 6) return null;
  return digits;
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

const normalizeClientName = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const cleaned = value
    .replace(/\s+/g, " ")
    .replace(/^[\s:;,\-–—]+|[\s:;,\-–—]+$/g, "")
    .trim();
  if (!cleaned || cleaned.length < 3) return null;
  if (!/[A-Za-zÀ-ž]/.test(cleaned)) return null;
  if (/\d/.test(cleaned)) return null;

  const ascii = stripDiacritics(cleaned).toLowerCase();
  const blockedPrefixes = [
    "adresa",
    "email",
    "telefon",
    "datum",
    "nabidka",
    "pojistne",
    "cena",
    "frekvence",
  ];
  if (blockedPrefixes.some((prefix) => ascii.startsWith(prefix))) return null;

  return cleaned;
};

const normalizeVehicleMakeModel = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const cleaned = value
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s:;,\-–—]+|[\s:;,\-–—]+$/g, "")
    .trim();
  if (!cleaned || cleaned.length < 2) return null;
  if (!/[A-Za-zÀ-ž0-9]/.test(cleaned)) return null;
  return cleaned;
};

const normalizePlate = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const cleaned = value
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  const beforeComma = cleaned.split(",")[0]?.trim() ?? "";
  if (!beforeComma) return null;
  const token = beforeComma.match(/[A-Za-z0-9]{3,12}/)?.[0] ?? beforeComma;
  const compact = token.replace(/\s+/g, "").toUpperCase();
  if (compact.length < 3) return null;
  return compact;
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
  const cleaned = value
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  const token = cleaned.match(/[A-Za-z0-9\-\/]{3,40}/)?.[0] ?? null;
  if (!token) return null;
  return token;
};

const normalizeAnnualMileage = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const cleaned = value
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  const rangeMatch =
    cleaned.match(/((?:nad|do|od)?\s*\d[\d\s]*(?:\s*[–-]\s*\d[\d\s]*)?\s*km)/i)?.[1] ??
    cleaned.match(/((?:nad|do|od)\s+\d[\d\s]*\s*km)/i)?.[1] ??
    cleaned.match(/([^:]{1,100}?km)/i)?.[1] ??
    cleaned;
  const normalized = rangeMatch.replace(/\s+/g, " ").trim();
  return normalized || null;
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

const normalizeAllianzScope = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const normalized = stripDiacritics(value).toLowerCase();
  if (/\bkomfort\b/.test(normalized)) return "Komfort";
  if (/\bplus\b/.test(normalized)) return "Plus";
  if (/\bextra\b/.test(normalized)) return "Extra";
  if (/\bmax\b/.test(normalized)) return "Max";
  return null;
};

const COVERAGE_TABLE_LABEL_STOP_RE =
  /^(povinne\s+ruceni|rozsirena\s+asistence|prirodni\s+udalosti|pozar\s+a\s+vybuch|poskozeni\s+zviretem|kradez|skla|vandalismus|havarie|doplatek\s+na\s+nove|gap)\b/i;

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

const coverageDecisionByLabel = (
  lines: string[],
  asciiLines: string[],
  label: RegExp
): boolean | null => {
  const indexes = findLabelIndexes(asciiLines, label);
  for (const idx of indexes) {
    const line = asciiLines[idx] ?? "";
    if (/\bano\b/.test(line)) return true;
    if (/\bne\b/.test(line)) return false;

    const rowChunkAscii = [
      asciiLines[idx],
      asciiLines[idx + 1],
      asciiLines[idx + 2],
      asciiLines[idx + 3],
    ]
      .filter(Boolean)
      .join(" ");
    if (/\bano\b/.test(rowChunkAscii)) return true;
    if (/\bne\b/.test(rowChunkAscii)) return false;

    for (let step = 1; step <= 5; step++) {
      const nextIdx = idx + step;
      const nextAscii = asciiLines[nextIdx] ?? "";
      if (!nextAscii) continue;
      if (label.test(nextAscii)) continue;
      if (/\bano\b/.test(nextAscii)) return true;
      if (/\bne\b/.test(nextAscii)) return false;
      if (COVERAGE_TABLE_LABEL_STOP_RE.test(nextAscii)) break;
      const nextOriginal = lines[nextIdx] ?? "";
      if (looksLikeStandaloneLabelLine(nextOriginal)) continue;
    }
  }
  return null;
};

const readCoverageAmountWhenYes = (
  lines: string[],
  asciiLines: string[],
  label: RegExp
): { amount: number | null; text: string | null } => {
  const indexes = findLabelIndexes(asciiLines, label);
  for (const idx of indexes) {
    const chunkOriginal = [
      lines[idx],
      lines[idx + 1],
      lines[idx + 2],
      lines[idx + 3],
      lines[idx + 4],
    ]
      .filter(Boolean)
      .join(" ");
    const chunkAscii = stripDiacritics(chunkOriginal).toLowerCase();
    if (!/\bano\b/.test(chunkAscii)) continue;

    const amountRaw =
      chunkOriginal.match(/([0-9][0-9\s]*(?:[.,][0-9]{1,2})?)\s*K[čc]/i)?.[0] ??
      chunkOriginal.match(/([0-9][0-9\s]*(?:[.,][0-9]{1,2})?)/)?.[1] ??
      null;
    const amount = parseAmount(amountRaw);
    const text = normalizeHullDeductibleText(amountRaw);
    if (amount != null || text) {
      return { amount, text };
    }
  }
  return { amount: null, text: null };
};

const isVehicleNoiseLine = (line: string): boolean => {
  const ascii = stripDiacritics(line).toLowerCase();
  return (
    ascii.includes("druh:") ||
    ascii.includes("ucel pouziti") ||
    ascii.includes("spz:") ||
    ascii.includes("datum 1. registrace") ||
    ascii.includes("cislo tp/orv") ||
    ascii.includes("vin:") ||
    ascii.includes("celkova hmotnost") ||
    ascii.includes("zdvihovy objem") ||
    ascii.includes("palivo") ||
    ascii.includes("vykon")
  );
};

export async function parseAllianzAutoPdf(file: File): Promise<AllianzAutoPdfResult> {
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
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const pageLines = await extractLayoutLinesFromPage(page);
    lines.push(...pageLines);
  }

  const fullText = lines.join("\n");
  const asciiLines = lines.map((line) => stripDiacritics(line).toLowerCase());
  const normalized = fullText.replace(/\s+/g, " ").trim();
  const ascii = stripDiacritics(normalized).toLowerCase();

  const result: AllianzAutoPdfResult = {};

  const contractCandidates: string[] = [];
  const explicitContractMatches = [
    normalized.match(
      /Nab[íi]dka\s+pojistitele\s+na\s+uzav[řr]en[íi]\s+pojistn[eé]\s+smlouvy\s*č\.?\s*([0-9]{6,})/i
    )?.[1] ?? null,
    normalized.match(/Nab[íi]dka\s+pojistitele\s*č\.?\s*([0-9]{6,})/i)?.[1] ?? null,
    ascii.match(
      /nabidka\s+pojistitele\s+na\s+uzavreni\s+pojistne\s+smlouvy\s*c\.?\s*([0-9]{6,})/i
    )?.[1] ?? null,
    ascii.match(/nabidka\s+pojistitele\s*c\.?\s*([0-9]{6,})/i)?.[1] ?? null,
  ];
  explicitContractMatches.forEach((candidate) => {
    const normalizedCandidate = normalizeContractNumber(candidate);
    if (normalizedCandidate) contractCandidates.push(normalizedCandidate);
  });

  const contractLabelIndexes = findLabelIndexes(
    asciiLines,
    /nabidka\s+pojistitele(?:\s+na\s+uzavreni\s+pojistne\s+smlouvy)?/
  );
  contractLabelIndexes.forEach((idx) => {
    const windowText = [lines[idx], lines[idx + 1], lines[idx + 2], lines[idx + 3]]
      .filter(Boolean)
      .join(" ");
    const matches = windowText.match(/\b[0-9]{6,}\b/g) ?? [];
    matches.forEach((candidate) => {
      const normalizedCandidate = normalizeContractNumber(candidate);
      if (normalizedCandidate) contractCandidates.push(normalizedCandidate);
    });
  });

  const bestContract = pickBestContractNumber(contractCandidates);
  if (bestContract) {
    result.contractNumber = bestContract;
  }

  let clientCandidate: string | null = null;
  const clientLabelIndexes = findLabelIndexes(asciiLines, /pojistnik\s*\(vy\)/i);
  for (const idx of clientLabelIndexes) {
    const nearbyLines = [lines[idx], lines[idx + 1], lines[idx + 2]].filter(Boolean) as string[];
    for (const candidateLine of nearbyLines) {
      const tailName =
        candidateLine.match(/(\p{Lu}[\p{L}'’-]+(?:\s+\p{Lu}[\p{L}'’-]+){1,3})\s*$/u)?.[1] ??
        null;
      if (tailName) {
        clientCandidate = tailName;
        break;
      }
    }
    if (clientCandidate) break;
  }
  if (!clientCandidate) {
    const rawCandidate =
      readNearestValueByLabel(lines, asciiLines, /pojistnik\s*\(vy\)/i, 6) ??
      normalized.match(/Pojistn[íi]k\s*\(Vy\)\s*([A-Za-zÀ-ž][^0-9:]{2,})/i)?.[1] ??
      ascii.match(/pojistnik\s*\(vy\)\s*([a-z][^0-9:]{2,})/i)?.[1] ??
      null;
    if (rawCandidate) {
      clientCandidate = rawCandidate
        .replace(/^Allianz[^,]*,\s*a\.s\.\s*/i, "")
        .trim();
    }
  }
  const clientName = normalizeClientName(clientCandidate);
  if (clientName) {
    result.clientName = clientName;
  }

  let startCandidate: string | null = null;
  const startLabelIndexes = findLabelIndexes(asciiLines, /pozadovany\s+pocatek\s+pojisteni/i);
  for (const idx of startLabelIndexes) {
    for (let step = 0; step <= 6; step++) {
      const candidateLine = lines[idx + step];
      if (!candidateLine) continue;
      const dateMatch = candidateLine.match(
        /(\d{1,2}\s*[./]\s*\d{1,2}\s*[./]\s*\d{4})/
      )?.[1];
      if (!dateMatch) continue;
      startCandidate = dateMatch;
      break;
    }
    if (startCandidate) break;
  }
  if (!startCandidate) {
    startCandidate =
      normalized.match(
        /Po[žz]adovan[ýy]\s+po[čc][áa]tek\s+poji[šs]t[ěe]n[íi][^\d]*(\d{1,2}\s*[./]\s*\d{1,2}\s*[./]\s*\d{4})/i
      )?.[1] ??
      ascii.match(
        /pozadovany\s+pocatek\s+pojisteni[^\d]*(\d{1,2}\s*[./]\s*\d{1,2}\s*[./]\s*\d{4})/i
      )?.[1] ??
      normalized.match(
        /Pro\s+po[žz]adovan[ýy]\s+po[čc][áa]tek\s+poji[šs]t[ěe]n[íi]\s+dne\s+(\d{1,2}\s*[./]\s*\d{1,2}\s*[./]\s*\d{4})/i
      )?.[1] ??
      null;
  }
  const startIso = toDateInput(startCandidate);
  if (startIso) result.policyStartDate = startIso;

  const signedCandidate =
    readNearestValueByLabel(lines, asciiLines, /datum\s+a\s+cas\s+vytvoreni\s+nabidky/i, 3) ??
    normalized.match(
      /Datum\s+a\s+čas\s+vytvořen[íi]\s+nab[íi]dky[^\d]*(\d{1,2}\s*[./]\s*\d{1,2}\s*[./]\s*\d{4})/i
    )?.[1] ??
    ascii.match(
      /datum\s+a\s+cas\s+vytvoreni\s+nabidky[^\d]*(\d{1,2}\s*[./]\s*\d{1,2}\s*[./]\s*\d{4})/i
    )?.[1] ??
    null;
  const signedIso = toDateInput(signedCandidate);
  if (signedIso) result.contractSignedDate = signedIso;

  let amountCandidate: string | null = null;
  let frequencyCandidate: string | null = null;

  const priceLabelIndexes = findLabelIndexes(asciiLines, /cena\s+pojisteni/);
  for (const idx of priceLabelIndexes) {
    const windowText = [lines[idx], lines[idx + 1], lines[idx + 2], lines[idx + 3], lines[idx + 4]]
      .filter(Boolean)
      .join(" ");
    if (!amountCandidate) {
      amountCandidate = windowText.match(/([0-9][0-9\s]*(?:[.,][0-9]{1,2})?)\s*K[čc]/i)?.[1] ?? null;
    }
    if (!frequencyCandidate) {
      const asciiWindow = stripDiacritics(windowText).toLowerCase();
      if (asciiWindow.includes("mesicn")) frequencyCandidate = "mesicne";
      else if (asciiWindow.includes("ctvrtletn")) frequencyCandidate = "ctvrtletne";
      else if (asciiWindow.includes("pololetn")) frequencyCandidate = "pololetne";
      else if (asciiWindow.includes("rocn")) frequencyCandidate = "rocne";
    }
    if (amountCandidate && frequencyCandidate) break;
  }

  if (!amountCandidate || !frequencyCandidate) {
    const normalizedMatch =
      normalized.match(
        /Cena\s+poji[šs]t[ěe]n[íi]\s*([0-9][0-9\s]*(?:[.,][0-9]{1,2})?)\s*K[čc]\s*(M[ěe]s[íi][čc]n[ěe]|[ČC]tvrtletn[ěe]|Pololetn[ěe]|Ro[čc]n[ěe])/i
      ) ??
      ascii.match(
        /cena\s+pojisteni\s*([0-9][0-9\s]*(?:[.,][0-9]{1,2})?)\s*k[cc]\s*(mesicne|ctvrtletne|pololetne|rocne)/i
      );
    if (normalizedMatch) {
      if (!amountCandidate) amountCandidate = normalizedMatch[1] ?? null;
      if (!frequencyCandidate) frequencyCandidate = normalizedMatch[2] ?? null;
    }
  }
  if (!frequencyCandidate) {
    const asciiText = stripDiacritics(normalized).toLowerCase();
    const priceSection =
      asciiText.match(/cena\s+pojisteni(.{0,240})/)?.[1] ??
      asciiText;
    if (priceSection.includes("mesicn")) frequencyCandidate = "mesicne";
    else if (priceSection.includes("ctvrtletn")) frequencyCandidate = "ctvrtletne";
    else if (priceSection.includes("pololetn")) frequencyCandidate = "pololetne";
    else if (priceSection.includes("rocn")) frequencyCandidate = "rocne";
  }

  const amount = parseAmount(amountCandidate);
  if (amount != null) result.amount = amount;

  const frequency = mapFrequency(frequencyCandidate);
  if (frequency) result.frequency = frequency;

  const vehicleLabelIndexes = findLabelIndexes(asciiLines, /pojistene\s+vozidlo\b/);
  let makeCandidate: string | null = null;
  for (const idx of vehicleLabelIndexes) {
    const line = lines[idx] ?? "";
    const inlineMake =
      line.match(/Poji[šs]t[ěe]n[eé]\s+vozidlo\s+(.+)/i)?.[1] ??
      null;
    if (inlineMake && !/\bdruh\s*:/i.test(inlineMake)) {
      const trimmedInline = inlineMake
        .split(/\b(?:SPZ|Druh|Celkov[aá]|Datum|[ČC]íslo\s*TP\/ORV|VIN)\b/i)[0]
        ?.trim();
      const normalizedInline = normalizeVehicleMakeModel(trimmedInline);
      if (normalizedInline) {
        makeCandidate = normalizedInline;
        break;
      }
    }

    for (let step = 1; step <= 8; step++) {
      const candidateLine = lines[idx + step];
      if (!candidateLine) continue;
      if (isVehicleNoiseLine(candidateLine)) continue;
      const trimmedCandidate = candidateLine
        .split(/\b(?:SPZ|Druh|Celkov[aá]|Datum|[ČC]íslo\s*TP\/ORV|VIN)\b/i)[0]
        ?.trim();
      const normalizedCandidate = normalizeVehicleMakeModel(trimmedCandidate);
      if (normalizedCandidate) {
        makeCandidate = normalizedCandidate;
        break;
      }
    }
    if (makeCandidate) break;
  }
  if (!makeCandidate) {
    makeCandidate = normalizeVehicleMakeModel(
      normalized.match(/Poji[šs]t[ěe]n[eé]\s+vozidlo\s+([A-Za-zÀ-ž0-9][^:\n]{1,80}?)(?=\s+(?:SPZ|Druh|Celkov[aá]|Datum|[ČC]íslo\s*TP\/ORV|VIN))/i)?.[1] ??
        null
    );
  }
  if (makeCandidate) result.carMake = makeCandidate;

  const plateRaw =
    readNearestValueByLabel(lines, asciiLines, /^spz\s*:/i, 2) ??
    normalized.match(/SPZ\s*:\s*([^,\n]{1,30}(?:,\s*[^,\n]{1,40})?)/i)?.[1] ??
    ascii.match(/spz\s*:\s*([^,\n]{1,30}(?:,\s*[^,\n]{1,40})?)/i)?.[1] ??
    null;
  const plate = normalizePlate(plateRaw);
  if (plate) result.carPlate = plate;

  const vinRaw =
    readNearestValueByLabel(lines, asciiLines, /^vin\s*:/i, 2) ??
    normalized.match(/VIN\s*:\s*([A-HJ-NPR-Z0-9]{10,20})/i)?.[1] ??
    ascii.match(/vin\s*:\s*([a-hj-npr-z0-9]{10,20})/i)?.[1] ??
    null;
  const vin = normalizeVin(vinRaw);
  if (vin) result.carVin = vin;

  const orvRaw =
    readNearestValueByLabel(lines, asciiLines, /^(?:c|č)islo\s*tp\/orv\s*:/i, 2) ??
    normalized.match(/(?:Číslo|Cislo)\s*TP\/ORV\s*:\s*([A-Za-z0-9\-\/]{3,40})/i)?.[1] ??
    ascii.match(/cislo\s*tp\/orv\s*:\s*([a-z0-9\-\/]{3,40})/i)?.[1] ??
    null;
  const orv = normalizeVehicleDocCode(orvRaw);
  if (orv) result.carOrv = orv;

  const annualMileageRaw =
    readNearestValueByLabel(lines, asciiLines, /rocni\s+najezd/i, 3) ??
    normalized.match(/Ro[čc]n[íi]\s+n[aá]jezd\s*:\s*([^:]{0,120}?km)/i)?.[1] ??
    ascii.match(/rocni\s+najezd\s*:\s*([^:]{0,120}?km)/i)?.[1] ??
    null;
  const annualMileage = normalizeAnnualMileage(annualMileageRaw);
  if (annualMileage) result.carAnnualMileage = annualMileage;

  let scopeCandidate =
    normalizeAllianzScope(
      readNearestValueByLabel(lines, asciiLines, /sjednany\s+balicek/i, 4)
    ) ??
    normalizeAllianzScope(
      readNearestValueByLabel(lines, asciiLines, /balicek\s*:/i, 3)
    ) ??
    normalizeAllianzScope(
      normalized.match(
        /Sjednan[ýy]\s+bal[íi][čc]ek\s*:\s*(Komfort|Plus|Extra|Max)\b/i
      )?.[1] ?? null
    ) ??
    normalizeAllianzScope(
      normalized.match(/bal[íi][čc]ek\s*:\s*(Komfort|Plus|Extra|Max)\b/i)?.[1] ?? null
    ) ??
    normalizeAllianzScope(
      ascii.match(/sjednany\s+balicek\s*:\s*(komfort|plus|extra|max)\b/i)?.[1] ?? null
    ) ??
    normalizeAllianzScope(
      ascii.match(/balicek\s*:\s*(komfort|plus|extra|max)\b/i)?.[1] ?? null
    );

  if (!scopeCandidate) {
    const scopeLabelIndexes = findLabelIndexes(asciiLines, /sjednany\s+balicek/i);
    for (const idx of scopeLabelIndexes) {
      const chunk = [lines[idx], lines[idx + 1], lines[idx + 2], lines[idx + 3]]
        .filter(Boolean)
        .join(" ");
      const scope = normalizeAllianzScope(chunk);
      if (scope) {
        scopeCandidate = scope;
        break;
      }
    }
  }
  if (scopeCandidate) {
    result.carAllianzScope = scopeCandidate;
  }

  let liabilityLimit: number | null = null;
  const povinneRuceniIndexes = findLabelIndexes(asciiLines, /povinne\s+ruceni/i);
  for (const idx of povinneRuceniIndexes) {
    const rowChunk = [lines[idx], lines[idx + 1], lines[idx + 2], lines[idx + 3], lines[idx + 4]]
      .filter(Boolean)
      .join(" ");
    liabilityLimit = normalizeLiabilityLimit(rowChunk);
    if (liabilityLimit != null) break;
  }
  if (liabilityLimit == null) {
    liabilityLimit = normalizeLiabilityLimit(
      normalized.match(
        /Povinn[ée]\s+ru[čc]en[íi][^]{0,220}?Limit\s*(50|70|100|150|200|250)\s*\/\s*\1\s*mil\.?\s*K[čc]/i
      )?.[0] ??
        ascii.match(
          /povinne\s+ruceni[^]{0,220}?limit\s*(50|70|100|150|200|250)\s*\/\s*\1\s*mil\.?\s*k[cc]/i
        )?.[0] ??
        normalized.match(/Limit\s*(50|70|100|150|200|250)\s*\/\s*\1\s*mil\.?\s*K[čc]/i)?.[0] ??
        ascii.match(/limit\s*(50|70|100|150|200|250)\s*\/\s*\1\s*mil\.?\s*k[cc]/i)?.[0] ??
        null
    );
  }
  if (liabilityLimit != null) {
    result.carLiabilityLimit = liabilityLimit;
  }

  const hasExtendedAssistance = coverageDecisionByLabel(
    lines,
    asciiLines,
    /rozsirena\s+asistence/i
  );
  if (hasExtendedAssistance === true) {
    result.carAssistancePlan = "Rozšířená asistence 150km";
  }

  const hasNaturalEvents = coverageDecisionByLabel(
    lines,
    asciiLines,
    /prirodni\s+udalosti/i
  );
  if (hasNaturalEvents === true) {
    result.carAddonNatural = true;
  }

  const hasFireExplosion = coverageDecisionByLabel(
    lines,
    asciiLines,
    /pozar\s+a\s+vybuch/i
  );
  if (hasFireExplosion === true) {
    result.carAddonFireExplosion = true;
  }

  const hasLegalAdvice = coverageDecisionByLabel(
    lines,
    asciiLines,
    /pravni\s+poradenstvi/i
  );
  if (hasLegalAdvice === true) {
    result.carAddonLegalAdvice = true;
  }

  const hasAnimalDamage = coverageDecisionByLabel(
    lines,
    asciiLines,
    /poskozeni\s+zviretem/i
  );
  if (hasAnimalDamage === true) {
    result.carAddonAnimalDamage = true;
  }

  const hasTheft = coverageDecisionByLabel(lines, asciiLines, /kradez/i);
  if (hasTheft === true) {
    result.carAddonTheft = true;
  }

  const hasGlass = coverageDecisionByLabel(lines, asciiLines, /^skla\b/i);
  if (hasGlass === true) {
    result.carAddonGlass = true;
  }

  const hasVandalism = coverageDecisionByLabel(lines, asciiLines, /vandalismus/i);
  if (hasVandalism === true) {
    result.carAddonVandalism = true;
  }

  const hasGap = coverageDecisionByLabel(
    lines,
    asciiLines,
    /doplatek\s+na\s+nove(?:\s*\(gap\))?/i
  );
  if (hasGap === true) {
    result.carAddonGap = true;
  }

  const hasHullCoverage = coverageDecisionByLabel(lines, asciiLines, /^havarie\b/i);
  if (hasHullCoverage === true) {
    result.carHullRiskAccident = true;
    result.carHullRiskTheft = true;
    result.carHullRiskNatural = true;
    result.carHullRiskVandalism = true;
    result.carHullRiskAnimalCollision = true;

    const hullDeductible = readCoverageAmountWhenYes(lines, asciiLines, /^havarie\b/i);
    if (hullDeductible.amount != null) {
      result.carHullDeductible = hullDeductible.amount;
    }
    if (hullDeductible.text) {
      result.carHullDeductibleText = hullDeductible.text;
    } else if (hullDeductible.amount != null) {
      result.carHullDeductibleText = `${hullDeductible.amount.toLocaleString("cs-CZ")} Kč`;
    }
  }

  return result;
}
