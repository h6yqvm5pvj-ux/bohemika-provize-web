// src/app/lib/parsePillowAutoPdf.ts
import { type PaymentFrequency } from "../types/domain";

export type PillowAutoPdfResult = {
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
  carAssistancePlan?: string | null;
  carHullSumInsured?: number | null;
  carHullSumInsuredText?: string | null;
  carHullDeductible?: number | null;
  carHullDeductibleText?: string | null;
  carHullRiskAccident?: boolean | null;
  carHullRiskTheft?: boolean | null;
  carHullRiskNatural?: boolean | null;
  carHullRiskVandalism?: boolean | null;
  carHullRiskAnimalCollision?: boolean | null;
  carAddonGlass?: boolean | null;
  carAddonNonFaultAccident?: boolean | null;
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

const toDateInput = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const m = value.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
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

const normalizeContractNumber = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const digits = value.replace(/\D+/g, "");
  return digits.length >= 6 ? digits : null;
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

const mapFrequency = (value: string | null | undefined): PaymentFrequency | null => {
  if (!value) return null;
  const normalized = stripDiacritics(value).toLowerCase();
  if (normalized.includes("mesicni")) return "monthly";
  if (normalized.includes("ctvrtletni")) return "quarterly";
  if (normalized.includes("pololetni")) return "semiannual";
  if (normalized.includes("rocni")) return "annual";
  return null;
};

const normalizeAssistancePlan = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const normalized = stripDiacritics(value)
    .toLowerCase()
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (/odtah\s*50\s*km\s*pri\s*nehode/.test(normalized)) {
    return "Odtah 50 km při nehodě";
  }
  if (/odtah\s*50\s*km\b/.test(normalized)) {
    return "Odtah 50 km";
  }
  if (/odtah\s*v\s*cr\s*neomezene/.test(normalized)) {
    return "Odtah v ČR neomezeně";
  }
  if (/odtah\s*i\s*ze\s*zahranici/.test(normalized)) {
    return "Odtah i ze zahraničí";
  }

  return null;
};

const PILLOW_TABLE_END_HINT_RE =
  /^(zpusob\s+prvni\s+platby|mesicni\s+platba|ctvrtletni\s+platba|pololetni\s+platba|rocni\s+platba|cislo\s+uctu|variabilni\s+symbol|splatnost\s+prvni\s+platby)\b/i;

const PILLOW_TABLE_ROW_START_RE =
  /^(povinne\s+ruceni|dopravni\s+nehoda|stret\s+se\s+zviretem|prirodni\s+udalosti?|kradez\s+vozidla|vandalismus|nezavinena\s+nehoda|skla|asistence|pravni\s+asistence|zavazadla|uraz)\b/i;

const readPillowTableRowChunkByLabel = (
  lines: string[],
  asciiLines: string[],
  label: RegExp
): string | null => {
  const tableEndIdx = asciiLines.findIndex((line) => PILLOW_TABLE_END_HINT_RE.test(line));
  const maxIdx = tableEndIdx >= 0 ? tableEndIdx : asciiLines.length;

  for (let idx = 0; idx < maxIdx; idx++) {
    const asciiLine = (asciiLines[idx] ?? "").trim();
    if (!label.test(asciiLine)) continue;

    const chunkParts: string[] = [lines[idx] ?? ""];
    for (let step = 1; step <= 3; step++) {
      const nextIdx = idx + step;
      if (nextIdx >= maxIdx) break;
      const nextAscii = (asciiLines[nextIdx] ?? "").trim();
      if (!nextAscii) continue;
      if (PILLOW_TABLE_END_HINT_RE.test(nextAscii)) break;
      if (PILLOW_TABLE_ROW_START_RE.test(nextAscii)) break;
      chunkParts.push(lines[nextIdx] ?? "");
    }

    const chunk = chunkParts.join(" ").replace(/\s+/g, " ").trim();
    if (chunk) return chunk;
  }

  return null;
};

const readPillowCoverageByLabel = (
  lines: string[],
  asciiLines: string[],
  label: RegExp
): boolean | null => {
  const chunk = readPillowTableRowChunkByLabel(lines, asciiLines, label);
  if (!chunk) return null;
  const chunkAscii = stripDiacritics(chunk).toLowerCase().replace(/\s+/g, " ").trim();
  if (!chunkAscii) return null;

  // V tabulce Pillow čtyři pomlčky znamenají, že riziko není sjednané.
  if (/-\s*-\s*-\s*-/i.test(chunkAscii)) return false;
  return true;
};

const normalizeShortText = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const cleaned = value
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s:;,\-–—]+|[\s:;,\-–—]+$/g, "")
    .trim();
  return cleaned || null;
};

const extractCurrencyTokens = (
  value: string | null | undefined
): Array<{ raw: string; amount: number }> => {
  if (!value) return [];
  const tokens: Array<{ raw: string; amount: number }> = [];
  const re = /([0-9][0-9\s]*(?:[.,][0-9]{1,2})?)\s*K[čc]/gi;
  let match: RegExpExecArray | null = null;
  while ((match = re.exec(value)) != null) {
    const rawAmount = match[1]?.trim() ?? "";
    if (!rawAmount) continue;
    const amount = parseAmount(rawAmount);
    if (amount == null) continue;
    tokens.push({ raw: `${rawAmount} Kč`, amount });
  }
  return tokens;
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
      return line.replace(/\s+/g, " ").trim();
    })
    .filter(Boolean);
}

export async function parsePillowAutoPdf(file: File): Promise<PillowAutoPdfResult> {
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

  const result: PillowAutoPdfResult = {};

  // Číslo smlouvy
  const contractCandidates: string[] = [];
  const contractFromProposal =
    fullText.match(/Návrh\s+pojistné\s+smlouvy\s+číslo[^\d]*([\d\s]{6,30})/i)?.[1] ??
    ascii.match(/navrh\s+pojistne\s+smlouvy\s+cislo[^\d]*([\d\s]{6,30})/i)?.[1];
  const normalizedProposal = normalizeContractNumber(contractFromProposal);
  if (normalizedProposal) contractCandidates.push(normalizedProposal);

  lines.forEach((line, idx) => {
    const asciiLine = asciiLines[idx] ?? "";
    if (!/^smlouva\b/i.test(asciiLine)) return;
    const normalizedSimple = normalizeContractNumber(line);
    if (normalizedSimple) contractCandidates.push(normalizedSimple);
  });

  const contractFromPolicyLabel =
    fullText.match(/Číslo\s+pojistné\s+smlouvy[^\d]*([\d\s]{6,30})/i)?.[1] ??
    ascii.match(/cislo\s+pojistne\s+smlouvy[^\d]*([\d\s]{6,30})/i)?.[1];
  const normalizedPolicy = normalizeContractNumber(contractFromPolicyLabel);
  if (normalizedPolicy) contractCandidates.push(normalizedPolicy);

  result.contractNumber = pickBestContractNumber(contractCandidates);

  // Počátek pojištění
  const startRaw =
    fullText.match(/Počátek\s+pojištění[^\d]*([0-9]{1,2}\.\s*[0-9]{1,2}\.\s*[0-9]{4})/i)?.[1] ??
    ascii.match(/pocatek\s+pojisteni[^\d]*([0-9]{1,2}\.\s*[0-9]{1,2}\.\s*[0-9]{4})/i)?.[1];
  const startIso = toDateInput(startRaw);
  if (startIso) {
    result.policyStartDate = startIso;
  }

  // Datum sjednání (obvykle "V Praze DD. MM. YYYY")
  const signedRaw =
    fullText.match(/V\s+Praze[^\d]*([0-9]{1,2}\.\s*[0-9]{1,2}\.\s*[0-9]{4})/i)?.[1] ??
    ascii.match(/v\s+praze[^\d]*([0-9]{1,2}\.\s*[0-9]{1,2}\.\s*[0-9]{4})/i)?.[1];
  const signedIso = toDateInput(signedRaw);
  if (signedIso) {
    result.contractSignedDate = signedIso;
  }

  // Klient: bereme jen jméno a příjmení před první čárkou
  for (let idx = 0; idx < lines.length; idx++) {
    const asciiLine = asciiLines[idx] ?? "";
    if (!/^klient\b/i.test(asciiLine)) continue;
    const rawClient = lines[idx]?.replace(/^Klient\s*/i, "").trim() ?? "";
    const nameOnly = rawClient.split(",")[0]?.trim() ?? "";
    const normalizedName = normalizeClientName(nameOnly);
    if (normalizedName) {
      result.clientName = normalizedName;
      break;
    }
  }

  // Parametry vozidla do detailu smlouvy
  for (let idx = 0; idx < lines.length; idx++) {
    const asciiLine = asciiLines[idx] ?? "";
    if (!/^pojistene\s+vozidlo\b/i.test(asciiLine)) continue;

    const vehicleChunk = [lines[idx], lines[idx + 1], lines[idx + 2]]
      .filter(Boolean)
      .join(" ");

    const makeRaw =
      vehicleChunk.match(/Pojištěné\s+vozidlo\s+(.+?)(?:\s*\(|,\s*RZ\b|$)/i)?.[1] ??
      vehicleChunk.match(/pojistene\s+vozidlo\s+(.+?)(?:\s*\(|,\s*rz\b|$)/i)?.[1] ??
      null;
    const plateRaw =
      vehicleChunk.match(/\bRZ\s*([A-Z0-9 ]{3,20})/i)?.[1] ??
      null;
    const vinRaw =
      vehicleChunk.match(/\bVIN\s*([A-HJ-NPR-Z0-9 ]{10,30})/i)?.[1] ??
      null;
    const orvRaw =
      vehicleChunk.match(/číslo\s+technického\s+průkazu\s*([A-Z0-9 ]{3,40})/i)?.[1] ??
      vehicleChunk.match(/cislo\s+technickeho\s+prukazu\s*([A-Z0-9 ]{3,40})/i)?.[1] ??
      null;

    const make = normalizeVehicleMakeModel(makeRaw);
    const plate = normalizePlate(plateRaw);
    const vin = normalizeVin(vinRaw);
    const orv = normalizeVehicleDocCode(orvRaw);

    if (make) result.carMake = make;
    if (plate) result.carPlate = plate;
    if (vin) result.carVin = vin;
    if (orv) result.carOrv = orv;
    break;
  }

  // Roční nájezd do detailu smlouvy
  let annualMileageRaw: string | null = null;
  for (let idx = 0; idx < lines.length; idx++) {
    const asciiLine = asciiLines[idx] ?? "";
    if (!/vas\s+rocni\s+najezd/i.test(asciiLine) && !/^rocni\s+najezd\b/i.test(asciiLine)) {
      continue;
    }
    annualMileageRaw = [
      lines[idx],
      lines[idx + 1],
      lines[idx + 2],
      lines[idx + 3],
      lines[idx + 4],
      lines[idx + 5],
    ]
      .filter(Boolean)
      .join(" ");
    break;
  }
  if (!annualMileageRaw) {
    annualMileageRaw =
      normalized.match(/V[aá][šs]\s+ro[čc]n[íi]\s+n[aá]jezd[^:]*:\s*([^:]{0,140}?km)/i)?.[1] ??
      normalized.match(/V[aá][šs]\s+ro[čc]n[íi]\s+n[aá]jezd[^]{0,120}?(\d[\d\s]*(?:\s*[–-]\s*\d[\d\s]*)?\s*km)/i)?.[1] ??
      ascii.match(/vas\s+rocni\s+najezd[^]{0,120}?(\d[\d\s]*(?:\s*[–-]\s*\d[\d\s]*)?\s*km)/i)?.[1] ??
      null;
  }
  const annualMileage = normalizeAnnualMileage(annualMileageRaw);
  if (annualMileage) result.carAnnualMileage = annualMileage;

  // Limity povinného ručení do detailu smlouvy
  let liabilityLimit: number | null = null;
  for (let idx = 0; idx < lines.length; idx++) {
    const asciiLine = asciiLines[idx] ?? "";
    if (!/\bpovinne\s+ruceni\b/i.test(asciiLine)) continue;
    const rowChunk = [
      lines[idx],
      lines[idx + 1],
      lines[idx + 2],
      lines[idx + 3],
      lines[idx + 4],
      lines[idx + 5],
    ]
      .filter(Boolean)
      .join(" ");
    liabilityLimit = normalizeLiabilityLimit(rowChunk);
    if (liabilityLimit != null) break;
  }
  if (liabilityLimit == null) {
    liabilityLimit = normalizeLiabilityLimit(
      normalized.match(
        /Povinn[ée]\s+ru[čc]en[íi][^]{0,220}?Limit\s*(50|70|100|150|200|250)(?:\s*\/\s*\1)?\s*mil(?:ion[ůu])?\s*K[čc]/i
      )?.[0] ??
        ascii.match(
          /povinne\s+ruceni[^]{0,220}?limit\s*(50|70|100|150|200|250)(?:\s*\/\s*\1)?\s*mil(?:ionu)?\s*k[c]/i
        )?.[0] ??
        null
    );
  }
  if (liabilityLimit != null) {
    result.carLiabilityLimit = liabilityLimit;
  }

  // Asistence (řádek "Asistence" v tabulce + hodnota vpravo / na dalším řádku)
  let assistancePlan: string | null = null;
  for (let idx = 0; idx < lines.length; idx++) {
    const asciiLine = (asciiLines[idx] ?? "").trim();
    if (!/^asistence\b/i.test(asciiLine)) continue;

    const rowChunk = [lines[idx], lines[idx + 1], lines[idx + 2], lines[idx + 3]]
      .filter(Boolean)
      .join(" ");
    assistancePlan = normalizeAssistancePlan(rowChunk);
    if (assistancePlan) break;
  }

  if (!assistancePlan) {
    assistancePlan = normalizeAssistancePlan(
      normalized.match(
        /Asistence[^]{0,120}?(Odtah\s*50\s*km\s*p[řr]i\s*nehod[ěe]|Odtah\s*50\s*km|Odtah\s*v\s*[ČC]R\s*neomezen[ěe]|Odtah\s*i\s*ze\s*zahrani[čc][íi])/i
      )?.[1] ??
        ascii.match(
          /asistence[^]{0,120}?(odtah\s*50\s*km\s*pri\s*nehode|odtah\s*50\s*km|odtah\s*v\s*cr\s*neomezene|odtah\s*i\s*ze\s*zahranici)/i
        )?.[1] ??
        null
    );
  }

  if (assistancePlan) {
    result.carAssistancePlan = assistancePlan;
  }

  // Havarijní část z tabulky (Dopravní nehoda + navázaná rizika)
  const hasAccidentCoverage = readPillowCoverageByLabel(lines, asciiLines, /^dopravni\s+nehoda\b/i);
  if (hasAccidentCoverage === true) {
    result.carHullRiskAccident = true;

    const accidentRowChunk =
      readPillowTableRowChunkByLabel(lines, asciiLines, /^dopravni\s+nehoda\b/i) ?? "";
    const accidentRowAscii = stripDiacritics(accidentRowChunk)
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    const currencyTokens = extractCurrencyTokens(accidentRowChunk);

    const hasObvyklaCena = /obvykla\s+cena\s+vozidla/.test(accidentRowAscii);
    if (hasObvyklaCena) {
      result.carHullSumInsuredText = "Obvyklá cena vozidla";
    } else if (currencyTokens[0]) {
      result.carHullSumInsured = currencyTokens[0].amount;
    }

    if (/bez\s+spoluucasti/.test(accidentRowAscii)) {
      result.carHullDeductibleText = "Bez spoluúčasti";
    } else {
      const deductibleToken = hasObvyklaCena ? currencyTokens[0] : currencyTokens[1];
      if (deductibleToken) {
        result.carHullDeductible = deductibleToken.amount;
        result.carHullDeductibleText = normalizeShortText(deductibleToken.raw);
      }
    }

    if (readPillowCoverageByLabel(lines, asciiLines, /^stret\s+se\s+zviretem\b/i) === true) {
      result.carHullRiskAnimalCollision = true;
    }
    if (readPillowCoverageByLabel(lines, asciiLines, /^prirodni\s+udalosti?\b/i) === true) {
      result.carHullRiskNatural = true;
    }
    if (readPillowCoverageByLabel(lines, asciiLines, /^kradez\s+vozidla\b/i) === true) {
      result.carHullRiskTheft = true;
    }
    if (readPillowCoverageByLabel(lines, asciiLines, /^vandalismus\b/i) === true) {
      result.carHullRiskVandalism = true;
    }
  }

  if (readPillowCoverageByLabel(lines, asciiLines, /^nezavinena\s+nehoda\b/i) === true) {
    result.carAddonNonFaultAccident = true;
  }

  // Připojištění skel z tabulky: označit jen když není "- - - -"
  const hasGlassAddon = readPillowCoverageByLabel(lines, asciiLines, /^skla\b/i);
  if (hasGlassAddon === true) {
    result.carAddonGlass = true;
  }

  // Frekvence + částka z boxu "Měsíční/Čtvrtletní/Pololetní/Roční platba ..."
  const paymentMatch =
    fullText.match(
      /(Měsíční|Čtvrtletní|Pololetní|Roční)\s+platba[^\d]*([0-9][0-9\s.,]{0,24})\s*K[čc]/i
    ) ??
    ascii.match(
      /(mesicni|ctvrtletni|pololetni|rocni)\s+platba[^\d]*([0-9][0-9\s.,]{0,24})\s*k[c]/i
    );

  if (paymentMatch) {
    const freq = mapFrequency(paymentMatch[1]);
    if (freq) result.frequency = freq;
    const amount = parseAmount(paymentMatch[2]);
    if (amount != null) result.amount = amount;
  }

  if (result.amount == null || !result.frequency) {
    for (let idx = 0; idx < lines.length; idx++) {
      const asciiLine = asciiLines[idx] ?? "";
      const freqLineMatch = asciiLine.match(/(mesicni|ctvrtletni|pololetni|rocni)\s+platba/i);
      if (!freqLineMatch) continue;

      if (!result.frequency) {
        const freq = mapFrequency(freqLineMatch[1]);
        if (freq) result.frequency = freq;
      }
      if (result.amount == null) {
        const amount = parseAmount(lines[idx] ?? "");
        if (amount != null) result.amount = amount;
      }
      if (result.amount != null && result.frequency) break;
    }
  }

  return result;
}
