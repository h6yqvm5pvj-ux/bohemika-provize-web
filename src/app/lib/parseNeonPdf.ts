// src/app/lib/parseNeonPdf.ts
import { type PaymentFrequency } from "../types/domain";

export type NeonRiskFields = Partial<{
  version: string;
  deathType: string;
  deathAmount: string;
  death2Type: string;
  death2Amount: string;
  deathTerminalAmount: string;
  waiverInvalidity: boolean;
  waiverUnemployment: boolean;
  invalidityAType: string;
  invalidityA1: string;
  invalidityA2: string;
  invalidityA3: string;
  invalidityBType: string;
  invalidityB1: string;
  invalidityB2: string;
  invalidityB3: string;
  invalidityPension: boolean;
  criticalType: string;
  criticalVariant: string;
  criticalAmount: string;
  childSurgeryAmount: string;
  vaccinationCompAmount: string;
  diabetesAmount: string;
  deathAccidentAmount: string;
  injuryPermanentAmount: string;
  injuryPermanentFulfillmentFrom: string;
  injuryPermanentProgression: string;
  injuryPermanent2Amount: string;
  injuryPermanent2FulfillmentFrom: string;
  injuryPermanent2Progression: string;
  hospitalizationAmount: string;
  hospitalizationIllnessAmount: string;
  hospitalizationInjuryAmount: string;
  accidentDailyBenefitStart: string;
  accidentDailyBenefitBackpay: string;
  accidentDailyBenefit: string;
  workIncapacityStart: string;
  workIncapacityBackpay: string;
  workIncapacityAmount: string;
  workIncapacityInjury: boolean;
  workIncapacityIllness: boolean;
  workIncapacity2Start: string;
  workIncapacity2Backpay: string;
  workIncapacity2Amount: string;
  workIncapacity2Injury: boolean;
  workIncapacity2Illness: boolean;
  careDependencyAmount: string;
  specialAidAmount: string;
  caregivingAmount: string;
  reproductionCostAmount: string;
  cppHelp: boolean;
  liabilityCitizenLimit: string;
  liabilityEmployeeLimit: string;
  travelInsurance: boolean;
}>;

export type NeonPdfResult = {
  contractNumber?: string | null;
  isRefresh?: boolean | null;
  refreshOriginalContractNumber?: string | null;
  clientName?: string | null;
  policyStartDate?: string | null;
  contractSignedDate?: string | null;
  amount?: number | null;
  durationYears?: number | null;
  frequency?: PaymentFrequency | null;
  riskFields?: NeonRiskFields;
  risks?: { title: string; variant?: string | null; amount?: number | null }[];
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
  return `${y.toString().padStart(4, "0")}-${mm
    .toString()
    .padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
};

const stripDiacritics = (text: string) =>
  text.normalize("NFD").replace(/\p{Diacritic}/gu, "");

const parseAmount = (val: string | null | undefined): number | null => {
  if (!val) return null;
  const cleaned = val.replace(/\s+/g, "").replace(",", ".").trim();
  const num = Number.parseFloat(cleaned);
  return Number.isFinite(num) ? Math.round(num) : null;
};

const pickContractNumberFromText = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const compact = value.replace(/\D+/g, "");
  if (compact.length >= 8 && compact.length <= 12) return compact;

  const direct = value.match(/\b\d{8,12}\b/);
  if (direct?.[0]) return direct[0];

  return null;
};

const pickContractNumberAfterLabel = (
  lines: string[],
  asciiLines: string[],
  label: RegExp,
  maxLookahead = 6
): string | null => {
  for (let idx = 0; idx < asciiLines.length; idx += 1) {
    const asciiLine = asciiLines[idx] ?? "";
    if (!label.test(asciiLine)) continue;

    const sameLine = lines[idx] ?? "";
    const afterLabel = sameLine.replace(label, " ");
    const sameLineCandidate = pickContractNumberFromText(afterLabel);
    if (sameLineCandidate) return sameLineCandidate;

    for (let step = 1; step <= maxLookahead; step += 1) {
      const candidate = pickContractNumberFromText(lines[idx + step] ?? "");
      if (candidate) return candidate;
    }
  }
  return null;
};

const pickNeonContractNumberFromBarcode = (fullText: string): string | null => {
  const barcode = fullText.match(/\*(\d{10})\d{0,12}\*/);
  return barcode?.[1] ?? null;
};

const pickMostFrequentContractNumber = (
  fullText: string,
  exclude: string | null | undefined
): string | null => {
  const excluded = exclude?.trim() ?? "";
  const matches = fullText.match(/\b\d{10}\b/g) ?? [];
  const counts = new Map<string, number>();
  matches.forEach((candidate) => {
    if (candidate === excluded) return;
    counts.set(candidate, (counts.get(candidate) ?? 0) + 1);
  });
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] ?? null;
};

export async function parseNeonPdf(file: File): Promise<NeonPdfResult> {
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
  // Zachováme řádky, jen odstaníme diakritiku pro hledání.
  const asciiLines = lines.map((l) => stripDiacritics(l).toLowerCase().trim());
  const asciiText = stripDiacritics(fullText).toLowerCase();
  const detectedVersion = /\b(?:rizikove\s+pojisteni\s+)?neon\s+risk\b/.test(asciiText)
    ? "neon_risk"
    : null;

  const result: NeonPdfResult = {};
  const riskFields: NeonRiskFields = {};
  const risks: { title: string; variant?: string | null; amount?: number | null }[] = [];

  const parseStandaloneAmountLine = (text: string): number | null => {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (!/^\d[\d\s.,]*$/.test(normalized)) return null;
    const value = parseAmount(normalized);
    // V tabulkách NEON bývá před částkou ještě pojistná doba (např. 14)
    // a za částkou měsíční pojistné (např. 142). Samostatnou částku bereme
    // až od 500 Kč, aby se tyto sloupce nepletly s pojistnou částkou.
    if (value == null || value < 500) return null;
    return value;
  };

  const findAmountAfter = (labelRegex: RegExp, maxLookahead = 6): number | null => {
    for (let idx = 0; idx < asciiLines.length; idx += 1) {
      if (!labelRegex.test(asciiLines[idx])) continue;

      for (let i = idx + 1; i <= Math.min(asciiLines.length - 1, idx + maxLookahead); i++) {
        const m = asciiLines[i].match(/([\d\s]+)(k[cč])/);
        if (m?.[1]) {
          const val = parseAmount(m[1]);
          if (val != null) return val;
        }

        const standalone = parseStandaloneAmountLine(asciiLines[i]);
        if (standalone != null) return standalone;
      }
    }

    // fallback: v celém textu najdi číslo v dosahu 100 znaků po labelu
    const m2 = asciiText.match(new RegExp(`${labelRegex.source}[^\\d]{0,100}([\\d\\s]+)k[cč]`, "i"));
    if (m2?.[1]) {
      const val = parseAmount(m2[1]);
      if (val != null) return val;
    }

    return null;
  };

  const findLiabilityLimitAfter = (labelRegex: RegExp): number | null => {
    const parseAmountsFromLine = (line: string) =>
      Array.from(line.matchAll(/([\d\s]+)\s*k[cč]/g))
        .map((match) => parseAmount(match[1]))
        .filter((value): value is number => value != null && value >= 100_000);

    const blockEndRegex =
      /^(slevy z celkove|placeni pojistneho|bankovni spojeni|pojistne plneni|pripojisteni pro pripad|pojisteni pro pripad|ostatni pripojisteni)$/;
    const nextLiabilityRegex = /^pripojisteni odpovednosti /;

    for (let idx = 0; idx < asciiLines.length; idx += 1) {
      const titleWindow = asciiLines
        .slice(idx, Math.min(asciiLines.length, idx + 3))
        .join(" ")
        .replace(/\s+/g, " ");
      if (!labelRegex.test(titleWindow)) continue;

      let end = Math.min(asciiLines.length, idx + 14);
      for (let nextIdx = idx + 1; nextIdx < end; nextIdx += 1) {
        const nextLine = asciiLines[nextIdx] ?? "";
        if (blockEndRegex.test(nextLine) || nextLiabilityRegex.test(nextLine)) {
          end = nextIdx;
          break;
        }
      }

      const window = asciiLines.slice(idx, end);
      for (let lineIdx = 0; lineIdx < window.length; lineIdx += 1) {
        if (!/limit\s+plneni/.test(window[lineIdx])) continue;

        const sameLineAmount = parseAmountsFromLine(window[lineIdx])[0];
        if (sameLineAmount != null) return sameLineAmount;

        for (let offset = 1; offset <= 3; offset += 1) {
          const nextLineAmount = parseAmountsFromLine(window[lineIdx + offset] ?? "")[0];
          if (nextLineAmount != null) return nextLineAmount;
        }
      }

      for (const line of window) {
        if (isDateLike(line)) continue;
        const fallbackAmount = parseAmountsFromLine(line)[0];
        if (fallbackAmount != null) return fallbackAmount;
      }
    }

    return null;
  };

  const findInjuryPermanentEntries = (): Array<{
    amount: number | null;
    fulfillmentFrom: string | null;
    progression: string | null;
  }> => {
    const entries: Array<{
      amount: number | null;
      fulfillmentFrom: string | null;
      progression: string | null;
    }> = [];
    const seen = new Set<string>();

    const blockStart = asciiLines.findIndex((line) => /urazove pripojisteni/.test(line));
    const scanStart = blockStart >= 0 ? blockStart : 0;
    const blockEnd =
      blockStart >= 0
        ? asciiLines.findIndex(
            (line, index) =>
              index > blockStart &&
              /pripojisteni pro pripad pracovni neschopnosti|pripojisteni pro pripad hospitalizace|pojisteni pro pripad hospitalizace|pripojisteni pro pripad zavaznych|pojisteni pro pripad zavaznych/.test(
                line
              )
          )
        : -1;
    const scanEnd = blockEnd > scanStart ? blockEnd : asciiLines.length;

    for (let idx = scanStart; idx < scanEnd; idx += 1) {
      if (!/trvale nasledky urazu/.test(asciiLines[idx])) continue;

      let amount: number | null = null;
      let fulfillmentFrom: string | null = null;
      let progression: string | null = null;
      const currencyHits: number[] = [];
      const standaloneHits: number[] = [];

      for (let i = idx + 1; i <= Math.min(scanEnd - 1, idx + 10); i += 1) {
        const line = asciiLines[i].replace(/\s+/g, " ").trim();
        if (!progression) {
          if (/bez progrese/.test(line)) progression = "bez_progrese";
          else if (/petinasobna progrese|5\s*x\s*progrese|5x\s*progrese/.test(line)) {
            progression = "progrese_5x";
          } else if (/desetinasobna progrese|10\s*x\s*progrese|10x\s*progrese|top progrese/.test(line)) {
            progression = "progrese_10x";
          }
        }

        if (!fulfillmentFrom) {
          if (/od\s+0[,.]0*01\s*%/.test(line)) fulfillmentFrom = "0.001";
          else if (/od\s+10\s*%/.test(line)) fulfillmentFrom = "10";
        }

        const currencyMatch = line.match(/([\d\s]+)(k[cč])/);
        const currencyValue = parseAmount(currencyMatch?.[1]);
        if (currencyValue != null) currencyHits.push(currencyValue);

        const standalone = parseStandaloneAmountLine(line);
        if (standalone != null) standaloneHits.push(standalone);
      }

      if (currencyHits.length >= 2) amount = currencyHits[0];
      else if (currencyHits.length === 1 && currencyHits[0] >= 500) amount = currencyHits[0];
      else if (standaloneHits.length > 0) amount = standaloneHits[0];

      if (amount == null && !fulfillmentFrom && !progression) continue;

      const dedupeKey = `${amount ?? ""}|${fulfillmentFrom ?? ""}|${progression ?? ""}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      entries.push({ amount, fulfillmentFrom, progression });
    }

    return entries;
  };

  const parseStandaloneBenefitAmount = (text: string): number | null => {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (!/^\d[\d\s.,]*$/.test(normalized)) return null;
    const value = parseAmount(normalized);
    if (value == null || value < 50) return null;
    return value;
  };

  const parseBenefitAmountFromTableWindow = (window: string[]): number | null => {
    const currencyValues: number[] = [];
    const standaloneValues: number[] = [];

    for (const line of window.slice(1)) {
      if (isDateLike(line)) continue;

      const currencyMatches = Array.from(line.matchAll(/([\d\s]+)k[cč]/g));
      if (currencyMatches.length > 0) {
        currencyMatches.forEach((match) => {
          const value = parseAmount(match[1]);
          if (value != null && value >= 50) currencyValues.push(value);
        });
        continue;
      }

      const normalized = line.replace(/\s+/g, " ").trim();
      if (!/^\d[\d\s.,]*$/.test(normalized)) continue;
      const value = parseAmount(normalized);
      if (value != null && value > 0) standaloneValues.push(value);
    }

    // V modelaci bývá částka i pojistné s "Kč": první měnová hodnota je pojistná částka.
    if (currencyValues.length > 0) return currencyValues[0];

    // V návrhu smlouvy jsou sloupce bez "Kč": doba / pojistná částka / měsíční pojistné.
    if (standaloneValues.length >= 3) return standaloneValues[1];
    if (standaloneValues.length === 2) {
      return standaloneValues[0] <= 99 && standaloneValues[1] >= 100
        ? standaloneValues[1]
        : standaloneValues[0];
    }
    return standaloneValues[0] != null && standaloneValues[0] >= 50 ? standaloneValues[0] : null;
  };

  const parseDailyBenefitFromLine = (line: string): number | null => {
    if (isDateLike(line)) return null;

    const currencyValues = Array.from(line.matchAll(/([\d\s]+)k[cč]/g))
      .map((match) => parseAmount(match[1]))
      .filter((value): value is number => value != null && value >= 50);
    if (currencyValues.length > 0) return currencyValues[0];

    const numberMatches = line.match(/\b\d{1,6}(?:[.,]\d+)?\b/g) ?? [];
    if (numberMatches.length > 1) {
      const numbers = numberMatches
        .map((match) => parseAmount(match))
        .filter((value): value is number => value != null && value >= 50);
      return numbers.find((value) => value >= 100) ?? numbers[0] ?? null;
    }

    return parseStandaloneBenefitAmount(line);
  };

  const findHospitalizationEntries = (): Array<{
    illness: boolean;
    injury: boolean;
    amount: number | null;
  }> => {
    const isHospitalLine = (line: string) => /denni odskodne za pobyt v nemocnici/.test(line);
    const blockStartRegex = /^(ostatni pripojisteni|dalsi pripojisteni)$/;
    const blockEndRegex =
      /^(slevy z celkove|slevy z|placeni pojistneho|bankovni spojeni|prehled vyvoje|dalsi smluvni ujednani|prohlaseni pojistnika|pripojisteni pro pripad|pojisteni pro pripad)/;

    const collectFromBlock = (
      startIndex: number,
      endIndex: number
    ): Array<{ illness: boolean; injury: boolean; amount: number | null }> => {
      const entries: Array<{ illness: boolean; injury: boolean; amount: number | null }> = [];

      for (let idx = startIndex; idx < endIndex; idx += 1) {
        if (!isHospitalLine(asciiLines[idx])) continue;

        let entryEnd = Math.min(endIndex, idx + 12);
        for (let nextIdx = idx + 1; nextIdx < entryEnd; nextIdx += 1) {
          if (isHospitalLine(asciiLines[nextIdx])) {
            entryEnd = nextIdx;
            break;
          }
        }

        const window = asciiLines.slice(idx, entryEnd);
        const text = window.join(" ").replace(/\s+/g, " ").trim();
        const illness = /nemoc/.test(text);
        const injury = /uraz/.test(text);
        let amount: number | null = parseBenefitAmountFromTableWindow(window);

        if (amount == null) {
          for (const line of window.slice(1)) {
            const value = parseDailyBenefitFromLine(line);
            if (value != null) {
              amount = value;
              break;
            }
          }
        }

        if (amount == null && !illness && !injury) continue;
        entries.push({ illness, injury, amount });
      }

      return entries;
    };

    const blockStarts = asciiLines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => blockStartRegex.test(line));

    for (const { index: blockStart } of blockStarts) {
      const blockEnd = asciiLines.findIndex(
        (line, index) => index > blockStart && blockEndRegex.test(line)
      );
      const entries = collectFromBlock(
        blockStart,
        blockEnd > blockStart ? blockEnd : Math.min(asciiLines.length, blockStart + 80)
      );
      if (entries.some((entry) => entry.amount != null)) {
        return entries;
      }
    }

    return [];
  };

  const findCriticalIllnessVariant = (): string | null => {
    for (let idx = 0; idx < asciiLines.length; idx += 1) {
      if (!/zavazna onemocneni/.test(asciiLines[idx])) continue;

      const text = asciiLines
        .slice(idx, Math.min(asciiLines.length, idx + 10))
        .join(" ")
        .replace(/\s+/g, " ");

      if (/maxi/.test(text) && /in situ/.test(text)) return "maxi_in_situ";
      if (/rozsiren/.test(text) && /in situ/.test(text)) return "rozsirena_in_situ";
      if (/zakladn/.test(text)) return "zakladni";
    }

    return null;
  };

  const findAccidentDailyBenefitEntry = (): {
    start: string | null;
    backpay: string | null;
    amount: number | null;
  } | null => {
    const isAccidentDailyLine = (line: string) =>
      /denni odskodne za dobu leceni urazu/.test(line);

    for (let idx = 0; idx < asciiLines.length; idx += 1) {
      if (!isAccidentDailyLine(asciiLines[idx])) continue;

      const window = asciiLines.slice(idx, Math.min(asciiLines.length, idx + 10));
      const text = window.join(" ").replace(/\s+/g, " ").trim();
      const startMatch = text.match(/plneni\s+od\s*(\d{1,3})\.\s*dne/);
      const rawStart = startMatch?.[1] ?? null;
      const start = rawStart === "1" || rawStart === "22" ? rawStart : null;
      const backpay = /zpetne\s+s\s+progres/.test(text)
        ? "zpetne_progrese"
        : /zpetne\s+od\s+1\.\s*dne|zpetne/.test(text)
          ? "zpetne"
          : null;
      let amount: number | null = parseBenefitAmountFromTableWindow(window);

      if (amount == null) {
        for (const line of window.slice(1)) {
          const value = parseDailyBenefitFromLine(line);
          if (value != null) {
            amount = value;
            break;
          }
        }
      }

      if (start || backpay || amount != null) {
        return { start, backpay, amount };
      }
    }

    return null;
  };

  const findWorkIncapacityEntries = (): Array<{
    illness: boolean;
    injury: boolean;
    start: string | null;
    backpay: string | null;
    amount: number | null;
  }> => {
    const parsedEntries: Array<{
      illness: boolean;
      injury: boolean;
      start: string | null;
      backpay: string | null;
      amount: number | null;
    }> = [];
    const isWorkLine = (line: string) => /denni odskodne za pracovni neschopnost/.test(line);
    const blockStart = asciiLines.findIndex((line) =>
      /pripojisteni pro pripad pracovni neschopnosti/.test(line)
    );
    const scanStart = blockStart >= 0 ? blockStart : 0;
    const blockEnd =
      blockStart >= 0
        ? asciiLines.findIndex(
            (line, index) =>
              index > blockStart &&
              /ostatni pripojisteni|dalsi pripojisteni|pripojisteni pro pripad hospitalizace|pojisteni pro pripad hospitalizace|zprosteni od placeni/.test(
                line
              )
          )
        : -1;
    const scanEnd = blockEnd > scanStart ? blockEnd : asciiLines.length;

    for (let idx = scanStart; idx < scanEnd; idx += 1) {
      if (!isWorkLine(asciiLines[idx])) continue;

      let entryEnd = Math.min(scanEnd, idx + 10);
      for (let nextIdx = idx + 1; nextIdx < entryEnd; nextIdx += 1) {
        if (isWorkLine(asciiLines[nextIdx])) {
          entryEnd = nextIdx;
          break;
        }
      }

      const window = asciiLines.slice(idx, entryEnd);
      const text = window.join(" ").replace(/\s+/g, " ").trim();
      const illness = /nemoc/.test(text);
      const injury = /uraz/.test(text);
      const start = text.match(/(?:plneni\s+od|od)\s*(\d{1,3})\.\s*dne/)?.[1] ?? null;
      const backpay = /nezpetne/.test(text) ? "nezpetne" : /zpetne/.test(text) ? "zpetne" : null;
      let amount: number | null = parseBenefitAmountFromTableWindow(window);

      if (amount == null) {
        for (const line of window.slice(1)) {
          const value = parseDailyBenefitFromLine(line);
          if (value != null) {
            amount = value;
            break;
          }
        }
      }

      if (amount == null && !start && !backpay && !illness && !injury) continue;

      parsedEntries.push({ illness, injury, start, backpay, amount });
    }

    const groupedEntries: typeof parsedEntries = [];
    for (const entry of parsedEntries) {
      const existing = groupedEntries.find(
        (item) =>
          item.start === entry.start &&
          item.backpay === entry.backpay &&
          item.amount === entry.amount
      );
      if (existing) {
        existing.illness = existing.illness || entry.illness;
        existing.injury = existing.injury || entry.injury;
      } else {
        groupedEntries.push({ ...entry });
      }
    }

    return groupedEntries.slice(0, 2);
  };

  const addRiskRow = (title: string | null | undefined, variant?: string | null, amount?: number | null) => {
    const t = title?.trim();
    if (!t) return;
    risks.push({ title: t, variant: variant?.trim() || null, amount: amount ?? null });
  };

  // Obecné čtení tabulky Pojisteni / Varianta / Pojistna castka
  const isHeader = (txt: string) =>
    /pojisteni si prenana pri|pojisteny|pojisteni|pojistna doba|pojistna castka|pojistne kc|mesicni pojistne|strana|verze|kalkulator|vytvoreno/i.test(
      txt
    );
  const isCurrency = (txt: string) => /[\d\s]+k[cč]/.test(txt);
  const isDateLike = (txt: string) => /\d{1,2}\s*\.\s*\d{1,2}\s*\.\s*\d{2,4}/.test(txt);
  const isPureNumber = (txt: string) => /^\d+([.,]\d+)?$/.test(txt);
  const hasLetters = (txt: string) => /[a-z]/i.test(txt);
  const normalize = (txt: string) => stripDiacritics(txt).toLowerCase();
  const allowedRiskTitles = [
    "zakladni pojisteni pro pripad smrti s konstantni pojistnou castkou",
    "invalidita iii. stupne s konstantni pc",
    "invalidita ii. stupne s konstantni pc",
    "invalidita i. stupne s konstantni pc",
    "invalidita iii. stupne s linearne klesajici pc",
    "invalidita ii. stupne s linearne klesajici pc",
    "invalidita i. stupne s linearne klesajici pc",
    "zavazna onemocneni a poraneni s konstantni pc",
    "zavazna onemocneni a poraneni s linearne klesajici pc",
    "zavazna onemocneni a poraneni s klesajici pc dle uroku z uveru",
    "operace ditete s vrozenou vadou",
    "zavazne nasledky ockovani",
    "cukrovka a jeji komplikace",
    "smrt urazem",
    "trvale nasledky urazu",
    "denni odskodne za dobu leceni urazu",
    "denni odskodne za pobyt v nemocnici z duvodu urazu",
    "denni odskodne za pobyt v nemocnici z duvodu nemoci",
    "denni odskodne za pracovni neschopnost nemoci",
    "denni odskodne za pracovni neschopnost urazem plus",
    "zavislost na peci ii. - iv. stupne",
    "prispevek na porizeni zvlastni pomucky",
    "celodenni osetrovani pojisteneho",
    "zdravotni a socialni asistence",
    "cpp pomoc",
    "cestovni pripojisteni vcetne covidu plus",
    "pripojisteni odpovednosti obcana v beznem obcanskem zivote vc. ujmy na mobilnim elektronickem zarizeni",
    "pripojisteni odpovednosti zamestnance pri vykonu povolani",
  ];

  let i = 0;
  while (i < asciiLines.length) {
    const line = asciiLines[i];
    if (
      !line ||
      !hasLetters(line) ||
      isHeader(line) ||
      isCurrency(line) ||
      isDateLike(line) ||
      isPureNumber(line)
    ) {
      i++;
      continue;
    }

    const title = line;
    const normTitle = normalize(title);
    const allowed = allowedRiskTitles.some((p) => normTitle.includes(p));
    if (!allowed) {
      i++;
      continue;
    }
    const variantParts: string[] = [];
    let cursor = i + 1;

    // posbírej variantu, ale zastav se na číslech/datel/částkách
    while (cursor < asciiLines.length && cursor <= i + 6) {
      const next = asciiLines[cursor];
      if (!next) {
        cursor++;
        continue;
      }
      if (isHeader(next) || isCurrency(next)) break;
      if (isDateLike(next) || isPureNumber(next)) break;
      if (hasLetters(next)) variantParts.push(next);
      cursor++;
    }

    // hledej pojistnou částku – první z více částek v řádku tabulky; jedinou částku bereme jen pokud je rozumně velká
    const currencyHits: number[] = [];
    for (let k = cursor; k < asciiLines.length && k <= i + 10; k++) {
      const txt = asciiLines[k];
      if (isHeader(txt)) break;
      if (isCurrency(txt)) {
        const m = txt.match(/([\d\s]+)k[cč]/);
        const val = parseAmount(m?.[1]);
        if (val != null) currencyHits.push(val);
      }
      if (isDateLike(txt)) continue;
    }

    let amount: number | null = null;
    if (currencyHits.length >= 2) {
      amount = currencyHits[0];
    } else if (currencyHits.length === 1 && currencyHits[0] >= 500) {
      // Jedna nízká částka bývá často měsíční pojistné – tu vynecháme.
      amount = currencyHits[0];
    }

    // Speciálně pro PN: částky bývají bez "Kč"
    if (
      amount == null &&
      /denni odskodne za pracovni neschopnost/.test(title) &&
      cursor < asciiLines.length
    ) {
      const numHits: number[] = [];
      for (let k = cursor; k <= Math.min(i + 8, asciiLines.length - 1); k++) {
        const t = asciiLines[k];
        if (isPureNumber(t)) {
          const val = parseAmount(t);
          if (val != null) numHits.push(val);
        }
        if (isCurrency(t)) break;
      }
      const overHundred = numHits.filter((n) => n >= 100);
      const candidate = overHundred[0] ?? numHits[0];
      if (candidate != null) amount = candidate;
    }

    addRiskRow(title, variantParts.length ? variantParts.join(" / ") : null, amount);
    i = Math.max(cursor, i + 1);
  }

  // Namapuj vybrané invalidity do pickerů
  const setInvalidity = (degree: 1 | 2 | 3, type: "konstantni" | "klesajici" | "klesajici_urok", amount?: number | null) => {
    const amountStr = amount != null ? String(amount) : undefined;
    if (!riskFields.invalidityAType) {
      riskFields.invalidityAType = type;
    }
    // nepřepisuj, pokud je už vyplněno
    if (degree === 1 && amountStr && !riskFields.invalidityA1) riskFields.invalidityA1 = amountStr;
    if (degree === 2 && amountStr && !riskFields.invalidityA2) riskFields.invalidityA2 = amountStr;
    if (degree === 3 && amountStr && !riskFields.invalidityA3) riskFields.invalidityA3 = amountStr;
  };

  for (const r of risks) {
    const norm = normalize(r.title);
    let degree: 1 | 2 | 3 | null = null;
    if (/iii|3\./.test(norm)) degree = 3;
    else if (/ii\b|2\./.test(norm)) degree = 2;
    else if (/\bi\b|1\./.test(norm)) degree = 1;

    if (degree) {
      if (/konstantn/i.test(norm)) {
        setInvalidity(degree, "konstantni", r.amount);
      } else if (/linearne|klesajici pc/.test(norm) && !/uroku/.test(norm)) {
        setInvalidity(degree, "klesajici", r.amount);
      } else if (/uroku/.test(norm)) {
        setInvalidity(degree, "klesajici_urok", r.amount);
      }
    }

    // Trvalé následky úrazu – základní fallback, podrobné nastavení řeší scanner níže.
    if (norm.includes("trvale nasledky urazu") && r.amount != null && !riskFields.injuryPermanentAmount) {
      riskFields.injuryPermanentAmount = String(r.amount);
    }

    // Denní odškodné za dobu léčení úrazu – denní částka
    if (norm.includes("denni odskodne za dobu leceni urazu") && r.amount != null) {
      riskFields.accidentDailyBenefit = String(r.amount);
    }

    // Základní pojištění pro případ smrti s konstantní PČ
    if (norm.includes("zakladni pojisteni pro pripad smrti s konstantni pojistnou castkou")) {
      if (r.amount != null) riskFields.deathAmount = String(r.amount);
      riskFields.deathType = riskFields.deathType ?? "konstantni";
    }
  }

  // Refresh / náhrada původní smlouvy
  const refreshOriginalContractNumber = pickContractNumberAfterLabel(
    lines,
    asciiLines,
    /nahrada\s+pojistne\s+smlouvy\s*c\.?/i,
    6
  );
  const isRefresh =
    /nahrada\s*-\s*refresh/i.test(asciiText) ||
    Boolean(refreshOriginalContractNumber);
  if (isRefresh) {
    result.isRefresh = true;
  }
  if (refreshOriginalContractNumber) {
    result.refreshOriginalContractNumber = refreshOriginalContractNumber;
  }

  // Číslo nově sjednávané pojistné smlouvy
  const contractCandidate =
    pickContractNumberAfterLabel(lines, asciiLines, /cislo\s+pojistne\s+smlouvy:?/i, 5) ??
    pickNeonContractNumberFromBarcode(fullText) ??
    pickMostFrequentContractNumber(fullText, refreshOriginalContractNumber);

  if (contractCandidate) {
    result.contractNumber = contractCandidate;
  }

  // Jméno a příjmení (pojistník)
  const nameMatch =
    fullText.match(/Jméno\s+a\s+příjmení[, ]+titul\s*([^\n]+)/i)?.[1]?.trim() ??
    asciiText.match(/jmeno a prijmeni[, ]+titul\s*([^\n]+)/i)?.[1]?.trim();
  if (nameMatch) {
    result.clientName = nameMatch.replace(/\s+/g, " ").trim();
  }

  // Počátek pojištění
  const startMatch =
    fullText.match(/Počátek\s+pojištění\s*([0-9]{1,2}\.[0-9]{1,2}\.[0-9]{4})/i)?.[1] ??
    asciiText.match(/pocatek pojisteni\s*([0-9]{1,2}\.[0-9]{1,2}\.[0-9]{4})/i)?.[1];
  const startIso = toDateInput(startMatch);
  if (startIso) {
    result.policyStartDate = startIso;
  }

  // Datum uzavření
  const signedMatch =
    fullText.match(/DATUM\s+UZAVŘENÍ\s*([0-9]{1,2}\.[0-9]{1,2}\.[0-9]{4})/i)?.[1] ??
    asciiText.match(/datum uzavreni\s*([0-9]{1,2}\.[0-9]{1,2}\.[0-9]{4})/i)?.[1];
  const signedIso = toDateInput(signedMatch);
  if (signedIso) {
    result.contractSignedDate = signedIso;
  }

  // Doba trvání smlouvy
  const durationMatch =
    fullText.match(/Doba\s+trvání\s+smlouvy\s*([0-9]{1,3})/i)?.[1] ??
    asciiText.match(/doba trvani smlouvy\s*([0-9]{1,3})/i)?.[1];
  if (durationMatch) {
    const yrs = Number.parseInt(durationMatch, 10);
    if (Number.isFinite(yrs)) {
      result.durationYears = Math.max(1, yrs);
    }
  }

  // Měsíční pojistné včetně slev a přirážek
  const amountMatch =
    fullText.match(/Měsíční\s+pojistné\s+včetně\s+slev\s+a\s+přirážek\s+celkem\s+v\s+Kč\s*([0-9\s.,]+)/i)?.[1] ??
    asciiText.match(/mesicni pojistne vcetne slev a prirazek celkem v kc\s*([0-9\s.,]+)/i)?.[1];
  const amount = parseAmount(amountMatch);
  if (amount != null) {
    result.amount = amount;
  }

  // NEON je měsíční frekvence
  result.frequency = "monthly";

  // ---------- Rizika ----------
  // Smrt
  const deathConst = findAmountAfter(/smrt s konstantni/i);
  if (deathConst != null) {
    riskFields.deathAmount = String(deathConst);
    riskFields.deathType = "konstantni";
  }
  const deathLinear = findAmountAfter(/klesajici pojistna castka line/i);
  if (deathLinear != null) {
    riskFields.death2Amount = String(deathLinear);
    riskFields.death2Type = "klesajici";
  }
  const deathInterest = findAmountAfter(/klesajici pojistna castka dle urok/i);
  if (deathInterest != null) {
    riskFields.death2Amount = String(deathInterest);
    riskFields.death2Type = "klesajici_urok";
  }
  const deathTerminal = findAmountAfter(/smrt nebo terminalni/i);
  if (deathTerminal != null) {
    riskFields.deathTerminalAmount = String(deathTerminal);
  }

  // Invalidity – konstantní
  const invConst3 = findAmountAfter(/invalidita iii.*konstantni/i);
  const invConst2 = findAmountAfter(/invalidita ii.*konstantni/i);
  const invConst1 = findAmountAfter(/invalidita i.*konstantni/i);
  if (invConst1 != null || invConst2 != null || invConst3 != null) {
    riskFields.invalidityAType = "konstantni";
    if (invConst1 != null) riskFields.invalidityA1 = String(invConst1);
    if (invConst2 != null) riskFields.invalidityA2 = String(invConst2);
    if (invConst3 != null) riskFields.invalidityA3 = String(invConst3);
  }

  // Invalidity – lineárně klesající
  const invLin3 = findAmountAfter(/invalidita iii.*linear/i);
  const invLin2 = findAmountAfter(/invalidita ii.*linear/i);
  const invLin1 = findAmountAfter(/invalidita i.*linear/i);
  if (invLin1 != null || invLin2 != null || invLin3 != null) {
    riskFields.invalidityAType = "klesajici";
    if (invLin1 != null) riskFields.invalidityA1 = String(invLin1);
    if (invLin2 != null) riskFields.invalidityA2 = String(invLin2);
    if (invLin3 != null) riskFields.invalidityA3 = String(invLin3);
  }

  // Invalidity – dle úroku
  const invInt3 = findAmountAfter(/invalidita iii.*dle uroku/i);
  const invInt2 = findAmountAfter(/invalidita ii.*dle uroku/i);
  const invInt1 = findAmountAfter(/invalidita i.*dle uroku/i);
  if (invInt1 != null || invInt2 != null || invInt3 != null) {
    riskFields.invalidityBType = "klesajici_urok";
    if (invInt1 != null) riskFields.invalidityB1 = String(invInt1);
    if (invInt2 != null) riskFields.invalidityB2 = String(invInt2);
    if (invInt3 != null) riskFields.invalidityB3 = String(invInt3);
  }

  // Invalidita s výplatou důchodu
  const invPension = findAmountAfter(/invalidity s vyplatou duchodu/i);
  if (invPension != null) {
    riskFields.invalidityPension = true;
  }

  // Závažná onemocnění
  const criticalVariant = findCriticalIllnessVariant();
  if (criticalVariant) {
    riskFields.criticalVariant = criticalVariant;
  }
  const criticalConst = findAmountAfter(/zavazna onemocneni.*konstantni/i);
  const criticalLinear = findAmountAfter(/zavazna onemocneni.*linear/i);
  const criticalInterest = findAmountAfter(/zavazna onemocneni.*dle uroku/i);
  if (criticalConst != null) {
    riskFields.criticalType = "konstantni";
    riskFields.criticalAmount = String(criticalConst);
  } else if (criticalLinear != null) {
    riskFields.criticalType = "klesajici";
    riskFields.criticalAmount = String(criticalLinear);
  } else if (criticalInterest != null) {
    riskFields.criticalType = "klesajici_urok";
    riskFields.criticalAmount = String(criticalInterest);
  }

  const childSurgery = findAmountAfter(/operace ditete/i);
  if (childSurgery != null) riskFields.childSurgeryAmount = String(childSurgery);
  const vaccination = findAmountAfter(/nasledky ockovani/i);
  if (vaccination != null) riskFields.vaccinationCompAmount = String(vaccination);
  const diabetes = findAmountAfter(/cukrovka/i);
  if (diabetes != null) riskFields.diabetesAmount = String(diabetes);

  // Úrazová část
  const deathAcc = findAmountAfter(/smrt urazem/i);
  if (deathAcc != null) riskFields.deathAccidentAmount = String(deathAcc);

  const injuryPermanentEntries = findInjuryPermanentEntries();
  if (injuryPermanentEntries.length > 0) {
    const [firstEntry, secondEntry] = injuryPermanentEntries;
    if (firstEntry?.amount != null) riskFields.injuryPermanentAmount = String(firstEntry.amount);
    if (firstEntry?.fulfillmentFrom) {
      riskFields.injuryPermanentFulfillmentFrom = firstEntry.fulfillmentFrom;
    }
    if (firstEntry?.progression) riskFields.injuryPermanentProgression = firstEntry.progression;
    if (secondEntry?.amount != null) riskFields.injuryPermanent2Amount = String(secondEntry.amount);
    if (secondEntry?.fulfillmentFrom) {
      riskFields.injuryPermanent2FulfillmentFrom = secondEntry.fulfillmentFrom;
    }
    if (secondEntry?.progression) riskFields.injuryPermanent2Progression = secondEntry.progression;
  } else {
    const injuryPermanent = findAmountAfter(/trvale nasledky urazu/i);
    if (injuryPermanent != null) riskFields.injuryPermanentAmount = String(injuryPermanent);
  }

  const accidentDailyEntry = findAccidentDailyBenefitEntry();
  if (accidentDailyEntry) {
    if (accidentDailyEntry.start) {
      riskFields.accidentDailyBenefitStart = accidentDailyEntry.start;
    }
    if (accidentDailyEntry.backpay) {
      riskFields.accidentDailyBenefitBackpay = accidentDailyEntry.backpay;
    }
    if (accidentDailyEntry.amount != null) {
      riskFields.accidentDailyBenefit = String(accidentDailyEntry.amount);
    }
  } else {
    const accidentDaily = findAmountAfter(/denni odskodne za dobu leceni urazu/i);
    if (accidentDaily != null) riskFields.accidentDailyBenefit = String(accidentDaily);
  }

  // Hospitalizace – ber jen sjednané položky z tabulek, ne obecné podmínky v PDF.
  const hospitalizationEntries = findHospitalizationEntries();
  if (hospitalizationEntries.length > 0) {
    delete riskFields.hospitalizationAmount;
    delete riskFields.hospitalizationIllnessAmount;
    delete riskFields.hospitalizationInjuryAmount;

    for (const entry of hospitalizationEntries) {
      if (entry.amount == null) continue;
      if (entry.illness) {
        riskFields.hospitalizationIllnessAmount = String(entry.amount);
      } else if (entry.injury) {
        riskFields.hospitalizationInjuryAmount = String(entry.amount);
      } else if (!riskFields.hospitalizationAmount) {
        riskFields.hospitalizationAmount = String(entry.amount);
      }
    }
  } else {
    delete riskFields.hospitalizationAmount;
    delete riskFields.hospitalizationIllnessAmount;
    delete riskFields.hospitalizationInjuryAmount;
  }

  // Pracovní neschopnost – může být sjednaná zvlášť pro nemoc a úraz.
  const workIncapacityEntries = findWorkIncapacityEntries();
  if (workIncapacityEntries.length > 0) {
    delete riskFields.workIncapacityStart;
    delete riskFields.workIncapacityBackpay;
    delete riskFields.workIncapacityAmount;
    delete riskFields.workIncapacityIllness;
    delete riskFields.workIncapacityInjury;
    delete riskFields.workIncapacity2Start;
    delete riskFields.workIncapacity2Backpay;
    delete riskFields.workIncapacity2Amount;
    delete riskFields.workIncapacity2Illness;
    delete riskFields.workIncapacity2Injury;

    const [firstEntry, secondEntry] = workIncapacityEntries;
    if (firstEntry) {
      if (firstEntry.start) riskFields.workIncapacityStart = firstEntry.start;
      if (firstEntry.backpay) riskFields.workIncapacityBackpay = firstEntry.backpay;
      if (firstEntry.amount != null) riskFields.workIncapacityAmount = String(firstEntry.amount);
      if (firstEntry.illness) riskFields.workIncapacityIllness = true;
      if (firstEntry.injury) riskFields.workIncapacityInjury = true;
    }
    if (secondEntry) {
      if (secondEntry.start) riskFields.workIncapacity2Start = secondEntry.start;
      if (secondEntry.backpay) riskFields.workIncapacity2Backpay = secondEntry.backpay;
      if (secondEntry.amount != null) riskFields.workIncapacity2Amount = String(secondEntry.amount);
      if (secondEntry.illness) riskFields.workIncapacity2Illness = true;
      if (secondEntry.injury) riskFields.workIncapacity2Injury = true;
    }
  }

  // Zproštění od placení – invalidita
  let waiverInvalidityFound = false;
  let waiverUnemploymentFound = false;
  if (
    asciiLines.some((l) => /zprosteni.*invalidn/i.test(l)) ||
    asciiText.includes("zprosteni z duvodu priznani invalidniho duchodu")
  ) {
    waiverInvalidityFound = true;
  }
  if (asciiLines.some((l) => /zprosteni.*ztrat[yu] zamestnani/i.test(l))) {
    waiverUnemploymentFound = true;
  }
  riskFields.waiverInvalidity = waiverInvalidityFound;
  riskFields.waiverUnemployment = waiverUnemploymentFound;

  // Péče a další připojištění
  const careDependency = findAmountAfter(/zavislost na peci/i);
  if (careDependency != null) riskFields.careDependencyAmount = String(careDependency);
  const specialAid = findAmountAfter(/prispevek na porizeni zvlastni pomucky/i);
  if (specialAid != null) {
    riskFields.specialAidAmount = String(specialAid);
  } else if (asciiLines.some((l) => /prispevek na porizeni zvlastni pomucky/i.test(l))) {
    // pokud částka není uvedena, nastav default 100000
    riskFields.specialAidAmount = "100000";
  }
  const caregiving = findAmountAfter(/celodenni osetrovani/i);
  if (caregiving != null) riskFields.caregivingAmount = String(caregiving);

  // Asistence a cestovní
  if (asciiLines.some((l) => /asistence .*cpp pomoc/i.test(l))) {
    riskFields.cppHelp = true;
  }
  if (asciiLines.some((l) => /cestovni pripojisteni/i.test(l))) {
    riskFields.travelInsurance = true;
  }

  // Odpovědnost
  const liabilityCitizen =
    findLiabilityLimitAfter(/pripojisteni\s+odpovednosti\s+obcana|odpovednosti\s+obcana\s+v\s+beznem/i) ??
    findAmountAfter(/odpovednost[i]?\s+obcana/i);
  if (liabilityCitizen != null) riskFields.liabilityCitizenLimit = String(liabilityCitizen);
  const liabilityEmployee =
    findLiabilityLimitAfter(/pripojisteni\s+odpovednosti\s+zamestnance|odpovednosti\s+zamestnance\s+pri\s+vykonu/i) ??
    findAmountAfter(/odpovednost[i]?\s+zamestnance/i);
  if (liabilityEmployee != null) riskFields.liabilityEmployeeLimit = String(liabilityEmployee);

  if (detectedVersion) {
    riskFields.version = detectedVersion;
  }
  if (Object.keys(riskFields).length > 0) {
    riskFields.version = riskFields.version || "neon_life";
    result.riskFields = riskFields;
  }

  if (risks.length > 0) {
    result.risks = risks;
  }

  return result;
}
