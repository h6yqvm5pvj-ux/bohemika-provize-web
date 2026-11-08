import { readPdfText, type PdfReadOptions } from "./pdfDocumentText";
import { type PaymentFrequency } from "../types/domain";
import { normalizeContractPaymentDetails, type ContractPaymentDetails } from "./contractPaymentDetails";

export type KoopOdzamPdfResult = {
  contractNumber?: string | null;
  clientName?: string | null;
  policyStartDate?: string | null;
  contractSignedDate?: string | null;
  amount?: number | null;
  frequency?: PaymentFrequency | null;
  annualAmount?: number | null;
  paymentDetails?: ContractPaymentDetails | null;
  employeeLiabilityDetail?: KoopOdzamDetail | null;
  isRefresh?: boolean;
  refreshOriginalContractNumber?: string;
  pdfImportWarnings?: string[];
};

export type KoopOdzamDetail = {
  occupation: string | null;
  vehicleRelatedDamage: boolean | null;
  annualLimit: number | null;
  territorialScope: string | null;
  deductible: string | null;
};

type PositionedTextItem = {
  str: string;
  normalized: string;
  x: number;
  y: number;
  width: number;
  pageNumber: number;
};

const ROW_Y_TOLERANCE = 3;

const stripDiacritics = (text: string) =>
  text.normalize("NFD").replace(/\p{Diacritic}/gu, "");

const normalizeText = (text: string) =>
  stripDiacritics(text).toLowerCase().replace(/\s+/g, " ").trim();

const toDateInput = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const match = value.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  if (!match) return null;
  const [, dayRaw, monthRaw, yearRaw] = match;
  const day = Number(dayRaw);
  const month = Number(monthRaw);
  const year = Number(yearRaw);
  if (!day || !month || !year) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;
  return `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
};

const extractDateToken = (value: string | null | undefined): string | null =>
  value?.match(/\b\d{1,2}\.\s*\d{1,2}\.\s*\d{4}\b/)?.[0] ?? null;

const extractContractNumber = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const digits = value.replace(/\D+/g, "");
  return digits.length >= 6 && digits.length <= 14 ? digits : null;
};

const parseAmount = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const normalized = value.replace(/\u00A0/g, " ");
  const match = normalized.match(/(\d[\d\s]*(?:[.,]\d+)?)(?:\s*K[čc])?/i)?.[1];
  if (!match) return null;
  const parsed = Number.parseFloat(match.replace(/\s+/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
};

const parsePaymentAmount = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const match = value.replace(/\u00a0/g, " ").match(/(\d[\d\s]*(?:[.,]\d{1,2})?)/)?.[1];
  if (!match) return null;
  const parsed = Number(match.replace(/\s+/g, "").replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : null;
};

const normalizeName = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const cleaned = value
    .replace(/\s+/g, " ")
    .replace(/^[\s:;,\-–—]+|[\s:;,\-–—]+$/g, "")
    .trim();
  if (!cleaned || cleaned.length < 3) return null;
  if (!/[A-Za-zÀ-ž]/.test(cleaned)) return null;
  return cleaned;
};

const mapFrequency = (value: string | null | undefined): PaymentFrequency | null => {
  if (!value) return null;
  const normalized = normalizeText(value);
  const monthMatch = normalized.match(/(\d+)\s*mesic/);
  if (monthMatch) {
    const months = Number(monthMatch[1]);
    if (months === 1) return "monthly";
    if (months === 3) return "quarterly";
    if (months === 6) return "semiannual";
    if (months === 12) return "annual";
  }
  const yearMatch = normalized.match(/(\d+)\s*rok/);
  if (yearMatch && Number(yearMatch[1]) === 1) return "annual";
  if (normalized.includes("mesic")) return "monthly";
  if (normalized.includes("ctvrtlet")) return "quarterly";
  if (normalized.includes("pololet")) return "semiannual";
  if (normalized.includes("rocni") || normalized.includes("rocne")) return "annual";
  return null;
};

const paymentsPerYear = (frequency: PaymentFrequency): number => {
  switch (frequency) {
    case "monthly":
      return 12;
    case "quarterly":
      return 4;
    case "semiannual":
      return 2;
    case "annual":
      return 1;
  }
};

const frequencyFromAmounts = (
  periodAmount: number | null,
  annualAmount: number | null
): PaymentFrequency | null => {
  if (!periodAmount || !annualAmount) return null;
  const ratio = annualAmount / periodAmount;
  if (Math.abs(ratio - 12) <= 0.25) return "monthly";
  if (Math.abs(ratio - 4) <= 0.25) return "quarterly";
  if (Math.abs(ratio - 2) <= 0.25) return "semiannual";
  if (Math.abs(ratio - 1) <= 0.25) return "annual";
  return null;
};

const sortItems = (items: PositionedTextItem[]) =>
  items.sort((a, b) => {
    if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
    if (Math.abs(a.y - b.y) > ROW_Y_TOLERANCE) return b.y - a.y;
    return a.x - b.x;
  });

async function extractPositionedItems(doc: any): Promise<PositionedTextItem[]> {
  const items: PositionedTextItem[] = [];

  for (let pageNumber = 1; pageNumber <= doc.pages.length; pageNumber += 1) {
    const page = doc.pages[pageNumber - 1];
    const content = { items: page.items };
    const rawItems = (content?.items ?? []) as Array<{
      str?: unknown;
      transform?: number[];
      width?: number;
    }>;

    rawItems.forEach((item) => {
      const str = typeof item?.str === "string" ? item.str.replace(/\s+/g, " ").trim() : "";
      if (!str) return;
      items.push({
        str,
        normalized: normalizeText(str),
        x: item?.transform?.[4] ?? 0,
        y: item?.transform?.[5] ?? 0,
        width: item?.width ?? 0,
        pageNumber,
      });
    });
  }

  return sortItems(items);
}

const findLabelItems = (
  items: PositionedTextItem[],
  matcher: (item: PositionedTextItem) => boolean
) => items.filter(matcher);

const findRightValue = (
  items: PositionedTextItem[],
  labelMatcher: (item: PositionedTextItem) => boolean,
  accept: (item: PositionedTextItem) => boolean
): string | null => {
  for (const label of findLabelItems(items, labelMatcher)) {
    const candidates = items
      .filter(
        (item) =>
          item.pageNumber === label.pageNumber &&
          Math.abs(item.y - label.y) <= ROW_Y_TOLERANCE &&
          item.x > label.x + Math.max(label.width, 8)
      )
      .sort((a, b) => a.x - b.x);

    const value = candidates.find(accept);
    if (value) return value.str;
  }

  return null;
};

const findBelowValue = (
  items: PositionedTextItem[],
  labelMatcher: (item: PositionedTextItem) => boolean,
  accept: (item: PositionedTextItem) => boolean
): string | null => {
  for (const label of findLabelItems(items, labelMatcher)) {
    const candidates = items
      .filter(
        (item) =>
          item.pageNumber === label.pageNumber &&
          item.y < label.y - ROW_Y_TOLERANCE &&
          label.y - item.y <= 45 &&
          item.x >= label.x - 15 &&
          item.x <= label.x + 180
      )
      .sort((a, b) => {
        if (Math.abs(a.y - b.y) > ROW_Y_TOLERANCE) return b.y - a.y;
        return a.x - b.x;
      });

    const value = candidates.find(accept);
    if (value) return value.str;
  }

  return null;
};

const findContractNumber = (items: PositionedTextItem[]): string | null => {
  for (const label of ["cislo pojistne smlouvy", "navrh pojistne smlouvy c.", "cislo navrhu"]) {
    const labelMatcher = (item: PositionedTextItem) => item.normalized.replace(/:$/, "") === label;
    const accept = (item: PositionedTextItem) => extractContractNumber(item.str) !== null;
    const raw = findRightValue(items, labelMatcher, accept) ?? findBelowValue(items, labelMatcher, accept);
    const number = extractContractNumber(raw);
    if (number) return number;
  }
  const printedNumber = items.find((item) => /\bps\s*\d{6,14}\b/i.test(item.str))?.str.match(/\bps\s*(\d{6,14})\b/i)?.[1];
  if (printedNumber) return printedNumber;
  return null;
};

const findClientName = (items: PositionedTextItem[]): string | null => {
  const sectionIndex = items.findIndex((item) => item.normalized === "pojistnik");
  const searchItems =
    sectionIndex >= 0
      ? items.slice(sectionIndex + 1).filter((item) => {
          if (item.pageNumber !== items[sectionIndex].pageNumber) return false;
          if (/^pojisteny\b/.test(item.normalized)) return false;
          return true;
        })
      : items;

  const value = findRightValue(
    searchItems,
    (item) => item.normalized === "titul, jmeno, prijmeni" || item.normalized === "jmeno",
    (item) => normalizeName(item.str) !== null
  );

  return normalizeName(value);
};

const findKoopOdzamDetail = (items: PositionedTextItem[]): KoopOdzamDetail | null => {
  const occupationRaw = findRightValue(
    items,
    (item) => item.normalized === "povolani",
    (item) => normalizeName(item.str) !== null
  );
  const vehicleRaw = findRightValue(
    items,
    (item) => item.normalized === "skoda souvisejici s rizenim a provozem dopravniho prostredku",
    (item) => item.normalized === "ano" || item.normalized === "ne"
  );
  const annualLimitRaw = findRightValue(
    items,
    (item) => item.normalized === "rocni limit plneni",
    (item) => parseAmount(item.str) !== null
  );
  const territorialScopeRaw = findRightValue(
    items,
    (item) => item.normalized === "uzemni rozsah",
    (item) => normalizeName(item.str) !== null
  );
  const deductibleRaw = findRightValue(
    items,
    (item) => item.normalized === "spoluucast",
    (item) => /\d|%/.test(item.str)
  );
  const occupation = normalizeName(occupationRaw);
  const vehicleRelatedDamage = vehicleRaw == null ? null : normalizeText(vehicleRaw) === "ano";
  const annualLimit = parseAmount(annualLimitRaw);
  const territorialScope = normalizeName(territorialScopeRaw);
  const deductible = deductibleRaw?.replace(/\s+/g, " ").trim() || null;
  if (occupation == null && vehicleRelatedDamage == null && annualLimit == null && territorialScope == null && deductible == null) return null;
  return { occupation, vehicleRelatedDamage, annualLimit, territorialScope, deductible };
};

const findKoopOdzamPaymentDetails = (
  items: PositionedTextItem[],
  contractNumber: string | null,
): ContractPaymentDetails | null => {
  const paymentStartIndex = items.findIndex((item) =>
    item.normalized === "castka k uhrade" || item.normalized.startsWith("castka k uhrade ") || item.normalized.startsWith("castka k uhrade:"),
  );
  if (paymentStartIndex < 0) return null;
  const paymentItems = items.slice(paymentStartIndex);

  const valueFor = (label: string, accept: (value: string) => boolean): string | null => {
    const normalizedLabel = normalizeText(label);
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const inlinePattern = new RegExp(`^\\s*${escapedLabel}\\s*:?\\s*(.+)$`, "i");
    for (const item of paymentItems) {
      const inline = item.str.match(inlinePattern)?.[1]?.trim();
      if (inline && accept(inline)) return inline;
    }
    const matcher = (item: PositionedTextItem) => item.normalized === normalizedLabel;
    return findRightValue(paymentItems, matcher, (item) => accept(item.str)) ??
      findBelowValue(paymentItems, matcher, (item) => accept(item.str));
  };

  const amountRaw = valueFor("Částka k úhradě", (value) => parsePaymentAmount(value) !== null);
  const accountNumber = valueFor("Číslo účtu", (value) => /(?:\d{1,6}-)?\d{2,10}\/\d{4}/.test(value));
  const variableSymbol = valueFor("Variabilní symbol", (value) => /\b\d{1,10}\b/.test(value)) ?? contractNumber;
  const dueDateRaw = valueFor("Datum splatnosti", (value) => extractDateToken(value) !== null);
  return normalizeContractPaymentDetails({
    amount: parsePaymentAmount(amountRaw),
    accountNumber,
    variableSymbol,
    dueDate: toDateInput(extractDateToken(dueDateRaw)),
  });
};

export async function parseKoopOdzamPdf(file: File, options: PdfReadOptions = {}): Promise<KoopOdzamPdfResult> {
  const doc = await readPdfText(file, options);
  const items = await extractPositionedItems(doc);
  const fullText = items.map((item) => item.str).join("\n");
  const fullTextAscii = stripDiacritics(fullText);
  const result: KoopOdzamPdfResult = {};
  const employeeLiabilityDetail = findKoopOdzamDetail(items);
  if (employeeLiabilityDetail) result.employeeLiabilityDetail = employeeLiabilityDetail;

  const contractNumber =
    findContractNumber(items) ??
    fullTextAscii.match(
      /(?:Cislo\s+pojistne\s+smlouvy|Navrh\s+pojistne\s+smlouvy\s+c\.|Cislo\s+navrhu|\bPS)\s*:?\s*(\d{6,14})\b/i
    )?.[1] ??
    null;
  if (contractNumber) result.contractNumber = contractNumber;
  const paymentDetails = findKoopOdzamPaymentDetails(items, contractNumber);
  if (paymentDetails) result.paymentDetails = paymentDetails;

  const clientName =
    findClientName(items) ??
    normalizeName(
      fullText.match(/Pojistník[\s\S]{0,160}?Titul,\s*jméno,\s*příjmení\s+(.+?)\s+Datum narození/i)?.[1] ??
        fullTextAscii.match(/Pojistnik[\s\S]{0,160}?Titul,\s*jmeno,\s*prijmeni\s+(.+?)\s+Datum narozeni/i)?.[1] ??
        null
    );
  if (clientName) result.clientName = clientName;

  const policyStartRaw = findRightValue(
    items,
    (item) => item.normalized === "pocatek pojisteni",
    (item) => extractDateToken(item.str) !== null
  );
  const policyStartDate = toDateInput(extractDateToken(policyStartRaw));
  if (policyStartDate) result.policyStartDate = policyStartDate;

  const frequencyRaw = findRightValue(
    items,
    (item) => item.normalized === "pojistne obdobi",
    (item) => mapFrequency(item.str) !== null
  );

  const annualRaw = findRightValue(
    items,
    (item) => item.normalized === "celkove rocni pojistne po sleve" || item.normalized === "celkove rocni pojistne",
    (item) => parseAmount(item.str) !== null
  );
  const annualAmount = parseAmount(annualRaw);
  if (annualAmount != null && annualAmount > 0) result.annualAmount = annualAmount;

  const periodRaw = findRightValue(
    items,
    (item) => item.normalized === "pojistne za pojistne obdobi",
    (item) => parseAmount(item.str) !== null
  );
  const amount = parseAmount(periodRaw);
  if (amount != null && amount > 0) result.amount = amount;

  const statedFrequency = mapFrequency(frequencyRaw);
  const amountFrequency = frequencyFromAmounts(amount, annualAmount);
  const frequency = statedFrequency ?? amountFrequency;
  if (frequency) result.frequency = frequency;

  const warnings: string[] = [];
  if (amount != null && annualAmount != null && frequency) {
    const expectedAnnual = amount * paymentsPerYear(frequency);
    if (Math.abs(expectedAnnual - annualAmount) > Math.max(1, annualAmount * 0.01)) {
      warnings.push("Pojistné: částka za pojistné období při uvedené frekvenci neodpovídá celkovému ročnímu pojistnému; ověř částky a frekvenci v PDF.");
    }
  }
  const signedRaw = findRightValue(
    items,
    (item) => item.normalized === "pojistna smlouva uzavrena dne" || item.normalized === "datum uzavreni smlouvy",
    (item) => extractDateToken(item.str) !== null
  );
  const proposalCreatedRaw = findRightValue(
    items,
    (item) => item.normalized === "datum vzniku navrhu pojistne smlouvy",
    (item) => extractDateToken(item.str) !== null
  );
  const contractSignedDate =
    toDateInput(extractDateToken(signedRaw)) ??
    toDateInput(
      fullTextAscii.match(
        /Pojistna\s+smlouva\s+uzavrena\s+dne[\s\S]{0,80}?(\d{1,2}\.\s*\d{1,2}\.\s*\d{4})/i
      )?.[1] ?? null
    ) ??
    toDateInput(
      fullTextAscii.match(
        /Datum\s+uzavreni\s+smlouvy\s*:?[\s\S]{0,80}?(\d{1,2}\.\s*\d{1,2}\.\s*\d{4})/i
      )?.[1] ?? null
    ) ??
    toDateInput(extractDateToken(proposalCreatedRaw)) ??
    toDateInput(
      fullTextAscii.match(
        /Datum\s+vzniku\s+navrhu\s+pojistne\s+smlouvy\s*:?\s*(\d{1,2}\.\s*\d{1,2}\.\s*\d{4})/i
      )?.[1] ?? null
    );
  if (contractSignedDate) result.contractSignedDate = contractSignedDate;

  const replacementMatch = fullTextAscii.match(
    /touto\s+smlouvou\s+nahrazujeme\s+vasi\s+predchozi\s+smlouvu\s+c\.?\s*([\d\s]{6,24})/i
  );
  if (replacementMatch) {
    result.isRefresh = true;
    const originalNumber = replacementMatch[1].replace(/\D/g, "");
    if (originalNumber.length >= 6 && originalNumber.length <= 14) {
      result.refreshOriginalContractNumber = originalNumber;
    }
  }

  if (warnings.length) result.pdfImportWarnings = warnings;

  return result;
}
