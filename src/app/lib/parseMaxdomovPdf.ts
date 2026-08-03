// src/app/lib/parseMaxdomovPdf.ts
import { type PaymentFrequency } from "../types/domain";

export type MaxdomovPdfResult = {
  contractNumber?: string | null;
  clientName?: string | null;
  policyStartDate?: string | null;
  contractSignedDate?: string | null;
  amount?: number | null;
  frequency?: PaymentFrequency | null;
  domexAddress?: string | null;
  domexPropertyType?: string | null;
  domexPropertySumInsured?: number | null;
  domexOutbuildingSumInsured?: number | null;
  domexHouseholdType?: string | null;
  domexHouseholdSumInsured?: number | null;
};

type PositionedTextItem = {
  str: string;
  x: number;
  y: number;
  width: number;
};

type LayoutRow = {
  y: number;
  items: PositionedTextItem[];
  text: string;
};

type LabelBox = {
  row: LayoutRow;
  rowIndex: number;
  xMin: number;
  xMax: number;
  y: number;
};

const LINE_Y_TOLERANCE = 2;

const stripDiacritics = (text: string) =>
  text.normalize("NFD").replace(/\p{Diacritic}/gu, "");

const normalizeSpaces = (text: string) => text.replace(/\s+/g, " ").trim();

const normalizeToken = (text: string) =>
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
  const ascii = stripDiacritics(value).replace(/\u00A0/g, " ");
  const matches = Array.from(
    ascii.matchAll(/([0-9]{1,3}(?:\s?[0-9]{3})*(?:[.,][0-9]{1,2})?)\s*Kc/gi)
  );
  const raw = matches[matches.length - 1]?.[1] ?? null;
  if (!raw) return null;
  const normalized = raw.replace(/\s+/g, "").replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
};

const parsePlainAmount = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const ascii = stripDiacritics(value).replace(/\u00A0/g, " ");
  const matches = Array.from(ascii.matchAll(/\b\d{1,3}(?:\s\d{3})+\b|\b\d{3,8}\b/g));
  const raw = matches[matches.length - 1]?.[0] ?? null;
  if (!raw) return null;
  const parsed = Number.parseInt(raw.replace(/\s+/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const mapFrequency = (value: string | null | undefined): PaymentFrequency | null => {
  if (!value) return null;
  const normalized = normalizeToken(value);
  if (normalized.includes("ctvrtletne")) return "quarterly";
  if (normalized.includes("pololetne")) return "semiannual";
  if (normalized.includes("mesicne")) return "monthly";
  if (normalized.includes("rocne") || normalized.includes("rocni")) return "annual";
  return null;
};

const NAME_TITLES = new Set([
  "bc",
  "dis",
  "doc",
  "ing",
  "judr",
  "mba",
  "mgr",
  "mudr",
  "pharmdr",
  "phd",
  "phdr",
  "prof",
  "rndr",
]);

function parseClientNameFromSurnameNameTitle(value: string | null | undefined): string | null {
  if (!value) return null;
  const parts = normalizeSpaces(value)
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => {
      const normalized = stripDiacritics(part).replace(/[.,]/g, "").toLowerCase();
      return !NAME_TITLES.has(normalized);
    });

  if (parts.length < 2) return parts[0] ?? null;

  const surname = parts[0];
  const firstNames = parts.slice(1);
  return [...firstNames, surname].join(" ").trim() || null;
}

function parseClientNameAsWritten(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = normalizeSpaces(
    value
      .replace(/\b\d{6}\/?\d{3,4}\b/g, " ")
      .replace(/\b\d{8,10}\b/g, " ")
  );
  return cleaned || null;
}

const itemMatchesPart = (item: PositionedTextItem, part: string): boolean => {
  const normalized = normalizeToken(item.str).replace(/:$/, "");
  const expected = normalizeToken(part);
  return normalized === expected || normalized.startsWith(`${expected}:`);
};

function buildRowText(items: PositionedTextItem[]): string {
  return normalizeSpaces(items.map((item) => item.str).join(" "));
}

async function extractLayoutRowsFromPage(page: any): Promise<LayoutRow[]> {
  const content = await page.getTextContent();
  const rawItems = (content?.items ?? []) as Array<{
    str?: unknown;
    transform?: number[];
    width?: number;
  }>;

  const items: PositionedTextItem[] = rawItems
    .map((item) => ({
      str: typeof item?.str === "string" ? item.str.replace(/\s+/g, " ").trim() : "",
      x: item?.transform?.[4] ?? 0,
      y: item?.transform?.[5] ?? 0,
      width: item?.width ?? 0,
    }))
    .filter((item) => item.str.length > 0)
    .sort((a, b) => {
      if (Math.abs(a.y - b.y) > LINE_Y_TOLERANCE) return b.y - a.y;
      return a.x - b.x;
    });

  const rows: { y: number; items: PositionedTextItem[] }[] = [];
  for (const item of items) {
    let row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= LINE_Y_TOLERANCE);
    if (!row) {
      row = { y: item.y, items: [] };
      rows.push(row);
    }
    row.items.push(item);
  }

  return rows
    .sort((a, b) => b.y - a.y)
    .map((row) => {
      row.items.sort((a, b) => a.x - b.x);
      const text = buildRowText(row.items);
      return {
        y: row.y,
        items: row.items,
        text,
      };
    })
    .filter((row) => row.text.length > 0);
}

function findLabelBox(
  rows: LayoutRow[],
  parts: string[],
  startRowIndex = 0
): LabelBox | null {
  for (let rowIndex = startRowIndex; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    for (let start = 0; start <= row.items.length - parts.length; start += 1) {
      const candidateItems = row.items.slice(start, start + parts.length);
      const matches = candidateItems.every((item, idx) => itemMatchesPart(item, parts[idx]));
      if (!matches) continue;

      const xMin = Math.min(...candidateItems.map((item) => item.x));
      const xMax = Math.max(...candidateItems.map((item) => item.x + item.width));
      return { row, rowIndex, xMin, xMax, y: row.y };
    }
  }
  return null;
}

function textInRange(row: LayoutRow, left: number, right: number): string | null {
  const text = row.items
    .filter((item) => item.x + item.width >= left && item.x <= right)
    .map((item) => item.str)
    .join(" ");
  const normalized = normalizeSpaces(text);
  return normalized || null;
}

function findTextRightOfLabel(label: LabelBox, rightPadding = 180): string | null {
  return textInRange(label.row, label.xMax + 1, label.xMax + rightPadding);
}

function findTextBelowLabel(
  rows: LayoutRow[],
  label: LabelBox,
  options: { maxDeltaY?: number; rightPadding?: number; minWidth?: number } = {}
): string | null {
  const maxDeltaY = options.maxDeltaY ?? 35;
  const rightPadding = options.rightPadding ?? 120;
  const minWidth = options.minWidth ?? 160;
  const left = label.xMin - 10;
  const right = Math.max(label.xMax + rightPadding, label.xMin + minWidth);

  for (let rowIndex = label.rowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const deltaY = label.y - row.y;
    if (deltaY <= 0) continue;
    if (deltaY > maxDeltaY) break;

    const value = textInRange(row, left, right);
    if (value) return value;
  }

  return null;
}

function rowsToText(rows: LayoutRow[]): string {
  return rows.map((row) => row.text).join("\n");
}

function findRowIndexContaining(rows: LayoutRow[], pattern: RegExp): number {
  return rows.findIndex((row) => pattern.test(normalizeToken(row.text)));
}

const findFirstItemMatching = (
  rows: LayoutRow[],
  predicate: (item: PositionedTextItem) => boolean
): PositionedTextItem | null => {
  for (const row of rows) {
    const item = row.items.find(predicate);
    if (item) return item;
  }
  return null;
};

function formatInsurancePlaceAddress(
  street: string | null,
  postalCode: string | null,
  city: string | null
): string | null {
  const streetPart = normalizeSpaces(street ?? "");
  const postalCodePart = normalizeSpaces(postalCode ?? "");
  const cityPart = normalizeSpaces(city ?? "");
  const cityLine = [postalCodePart, cityPart].filter(Boolean).join(" ").trim();
  return [streetPart, cityLine].filter(Boolean).join(", ").trim() || null;
}

function normalizeMaxdomovPropertyType(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = normalizeToken(value);
  if (/rodinny\s+dum/.test(normalized)) return "dum";
  if (/\bbyt\b/.test(normalized)) return "byt";
  if (/rekreacni|chata|chalupa/.test(normalized)) return "rekreace";
  return null;
}

function normalizeMaxdomovHouseholdType(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = normalizeToken(value);
  if (/trvale\s+bydleni|trvale\s+uzivana|trvale\s+obydlena/.test(normalized)) {
    return "trvale";
  }
  if (/rekreacni/.test(normalized)) return "rekreacni";
  return null;
}

function findMainBuildingPropertyType(rows: LayoutRow[]): string | null {
  const mainBuildingLabel =
    findLabelBox(rows, ["a:", "hlavni stavba"]) ?? findLabelBox(rows, ["hlavni stavba"]);
  if (!mainBuildingLabel) return null;

  const rawType = findTextBelowLabel(rows, mainBuildingLabel, {
    maxDeltaY: 45,
    rightPadding: 140,
    minWidth: 220,
  });
  return normalizeMaxdomovPropertyType(rawType);
}

function findMainBuildingSumInsured(rows: LayoutRow[]): number | null {
  const mainBuildingLabel =
    findLabelBox(rows, ["a:", "hlavni stavba"]) ?? findLabelBox(rows, ["hlavni stavba"]);
  if (!mainBuildingLabel) return null;

  const sumInsuredLabel = findLabelBox(rows, ["pojistna castka"], mainBuildingLabel.rowIndex);
  if (!sumInsuredLabel) return null;

  return parseAmount(
    findTextBelowLabel(rows, sumInsuredLabel, {
      maxDeltaY: 45,
      rightPadding: 170,
      minWidth: 170,
    })
  );
}

function findHouseholdType(rows: LayoutRow[]): string | null {
  const householdUseLabel = findLabelBox(rows, ["zpusob uzivani pojistene domacnosti"]);
  if (!householdUseLabel) return null;

  return normalizeMaxdomovHouseholdType(findTextRightOfLabel(householdUseLabel, 160));
}

function findHouseholdSumInsured(rows: LayoutRow[]): number | null {
  const householdSectionRowIndex = findRowIndexContaining(
    rows,
    /d\.\s+pojisteni\s+domacnosti/
  );
  if (householdSectionRowIndex < 0) return null;

  const sumInsuredLabel =
    findLabelBox(rows, ["pojistna", "castka"], householdSectionRowIndex + 1) ??
    findLabelBox(rows, ["pojistna castka"], householdSectionRowIndex + 1);
  if (!sumInsuredLabel) return null;

  return parseAmount(
    findTextBelowLabel(rows, sumInsuredLabel, {
      maxDeltaY: 35,
      rightPadding: 170,
      minWidth: 170,
    })
  );
}

function findOutbuildingSumInsured(rows: LayoutRow[]): number | null {
  const outbuildingRowIndex = findRowIndexContaining(
    rows,
    /b:\s+vedlejsi\s+stavby.*soubor\s+staveb/
  );
  if (outbuildingRowIndex < 0) return null;

  const outbuildingRow = rows[outbuildingRowIndex];
  const amountOnRow =
    parseAmount(textInRange(outbuildingRow, 420, 590)) ?? parseAmount(outbuildingRow.text);
  if (amountOnRow != null) return amountOnRow;

  const limitLabel = findLabelBox(
    rows,
    ["limit plneni na pojistnou udalost"],
    Math.max(0, outbuildingRowIndex - 5)
  );
  if (!limitLabel) return null;

  return parseAmount(
    findTextBelowLabel(rows, limitLabel, {
      maxDeltaY: 60,
      rightPadding: 170,
      minWidth: 170,
    })
  );
}

function findOldMaxdomov3ContractNumber(rows: LayoutRow[]): string | null {
  const item = findFirstItemMatching(rows, (candidate) => {
    if (candidate.x < 80 || candidate.x > 190 || candidate.y < 720) return false;
    return /^\d{6,14}$/.test(candidate.str.replace(/\D+/g, ""));
  });
  return extractContractNumber(item?.str);
}

function findOldMaxdomov3ClientName(rows: LayoutRow[]): string | null {
  const row = rows.find((candidate) => candidate.y >= 630 && candidate.y <= 680);
  if (!row) return null;
  return parseClientNameAsWritten(textInRange(row, 0, 330));
}

function findOldMaxdomov3PolicyStartDate(rows: LayoutRow[]): string | null {
  const item = findFirstItemMatching(rows, (candidate) => {
    if (candidate.x < 70 || candidate.x > 170 || candidate.y < 175 || candidate.y > 220) {
      return false;
    }
    return /\b\d{1,2}\.\s*\d{1,2}\.\s*\d{4}\b/.test(candidate.str);
  });
  return toDateInput(extractDateToken(item?.str));
}

function findOldMaxdomov3ContractSignedDate(rows: LayoutRow[]): string | null {
  const item = findFirstItemMatching(rows, (candidate) => {
    if (candidate.x < 380 || candidate.x > 480 || candidate.y < 90 || candidate.y > 150) {
      return false;
    }
    return /\b\d{1,2}\.\s*\d{1,2}\.\s*\d{4}\b/.test(candidate.str);
  });
  return toDateInput(extractDateToken(item?.str));
}

function findOldMaxdomov3Frequency(rows: LayoutRow[]): PaymentFrequency | null {
  const selected = findFirstItemMatching(rows, (candidate) => {
    if (normalizeToken(candidate.str) !== "x") return false;
    return candidate.y >= 105 && candidate.y <= 145 && candidate.x >= 100 && candidate.x <= 340;
  });
  if (!selected) return null;
  if (selected.x < 180) return "annual";
  if (selected.x < 260) return "semiannual";
  return "quarterly";
}

function findOldMaxdomov3Amount(rows: LayoutRow[]): number | null {
  const amountItems = rows
    .flatMap((row) => row.items)
    .filter(
      (candidate) =>
        candidate.x >= 520 && candidate.x <= 585 && candidate.y >= 15 && candidate.y <= 60
    )
    .sort((a, b) => a.y - b.y);
  for (const item of amountItems) {
    const amount = parsePlainAmount(item.str);
    if (amount != null) return amount;
  }
  return null;
}

function applyOldMaxdomov3Fallback(
  result: MaxdomovPdfResult,
  rows: {
    firstPageRows: LayoutRow[];
    fourthPageRows: LayoutRow[] | null;
    lastPageRows: LayoutRow[];
  }
) {
  if (!rows.fourthPageRows) return;

  const contractNumber = findOldMaxdomov3ContractNumber(rows.firstPageRows);
  const clientName = findOldMaxdomov3ClientName(rows.firstPageRows);
  const policyStartDate = findOldMaxdomov3PolicyStartDate(rows.fourthPageRows);
  const amount = findOldMaxdomov3Amount(rows.fourthPageRows);
  const looksLikeOldMaxdomov3 =
    Boolean(contractNumber && clientName) && Boolean(policyStartDate || amount != null);
  if (!looksLikeOldMaxdomov3) return;

  const contractSignedDate = findOldMaxdomov3ContractSignedDate(rows.lastPageRows);
  const frequency = findOldMaxdomov3Frequency(rows.fourthPageRows);

  result.contractNumber ??= contractNumber;
  result.clientName ??= clientName;
  result.policyStartDate ??= policyStartDate;
  result.contractSignedDate ??= contractSignedDate;
  result.frequency ??= frequency;
  result.amount ??= amount;
}

export async function parseMaxdomovPdf(file: File): Promise<MaxdomovPdfResult> {
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
  const result: MaxdomovPdfResult = {};
  if (doc.numPages < 1) return result;

  const firstPage = await doc.getPage(1);
  const firstPageRows = await extractLayoutRowsFromPage(firstPage);
  const firstPageText = rowsToText(firstPageRows);
  const firstPageAscii = stripDiacritics(firstPageText).toLowerCase();
  const pageRowsByNumber = new Map<number, LayoutRow[]>([[1, firstPageRows]]);
  const getPageRows = async (pageNumber: number): Promise<LayoutRow[]> => {
    const existing = pageRowsByNumber.get(pageNumber);
    if (existing) return existing;
    const rows = await extractLayoutRowsFromPage(await doc.getPage(pageNumber));
    pageRowsByNumber.set(pageNumber, rows);
    return rows;
  };

  if (/b\.\s+pojisteni\s+staveb/.test(firstPageAscii)) {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const pageRows = await getPageRows(pageNumber);
      const propertyType = findMainBuildingPropertyType(pageRows);
      const sumInsured = findMainBuildingSumInsured(pageRows);
      const outbuildingSumInsured = findOutbuildingSumInsured(pageRows);
      if (propertyType) {
        result.domexPropertyType = propertyType;
      }
      if (sumInsured != null) {
        result.domexPropertySumInsured = sumInsured;
      }
      if (outbuildingSumInsured != null) {
        result.domexOutbuildingSumInsured = outbuildingSumInsured;
      }
      if (
        result.domexPropertyType &&
        result.domexPropertySumInsured != null &&
        result.domexOutbuildingSumInsured != null
      ) {
        break;
      }
    }
  }

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const pageRows = await getPageRows(pageNumber);
    const householdType = findHouseholdType(pageRows);
    const householdSumInsured = findHouseholdSumInsured(pageRows);
    if (householdType) {
      result.domexHouseholdType = householdType;
    }
    if (householdSumInsured != null) {
      result.domexHouseholdSumInsured = householdSumInsured;
    }
    if (result.domexHouseholdType && result.domexHouseholdSumInsured != null) {
      break;
    }
  }

  const insurancePlaceRowIndex = findRowIndexContaining(
    firstPageRows,
    /3\.1\.\s*misto\s+pojisteni\s+c\.\s*1/
  );
  if (insurancePlaceRowIndex >= 0) {
    const streetLabel = findLabelBox(
      firstPageRows,
      ["ulice, cislo popisne"],
      insurancePlaceRowIndex + 1
    );
    const postalCodeLabel = findLabelBox(firstPageRows, ["psc"], insurancePlaceRowIndex + 1);
    const cityLabel = findLabelBox(firstPageRows, ["obec"], insurancePlaceRowIndex + 1);
    const insurancePlaceAddress = formatInsurancePlaceAddress(
      streetLabel ? findTextBelowLabel(firstPageRows, streetLabel) : null,
      postalCodeLabel
        ? findTextBelowLabel(firstPageRows, postalCodeLabel, {
            rightPadding: 45,
            minWidth: 65,
          })
        : null,
      cityLabel
        ? findTextBelowLabel(firstPageRows, cityLabel, {
            rightPadding: 120,
            minWidth: 120,
          })
        : null
    );
    if (insurancePlaceAddress) result.domexAddress = insurancePlaceAddress;
  }

  const clientNameLabel = findLabelBox(firstPageRows, ["prijmeni, jmeno, titul"]);
  const clientName = parseClientNameFromSurnameNameTitle(
    clientNameLabel ? findTextBelowLabel(firstPageRows, clientNameLabel) : null
  );
  if (clientName) result.clientName = clientName;

  const contractLabel = findLabelBox(firstPageRows, ["cislo nabidky"]);
  const contractNumber =
    extractContractNumber(contractLabel ? findTextRightOfLabel(contractLabel, 200) : null) ??
    firstPageAscii.match(/cislo\s+nabidky\s+(\d{6,14})/)?.[1] ??
    null;
  if (contractNumber) result.contractNumber = contractNumber;

  const policyStartLabel = findLabelBox(firstPageRows, ["pocatek", "pojisteni"]);
  const policyStartDate =
    toDateInput(extractDateToken(policyStartLabel ? findTextBelowLabel(firstPageRows, policyStartLabel) : null)) ??
    toDateInput(
      firstPageAscii.match(
        /pocatek\s+pojisteni[\s\S]{0,180}?(\d{1,2}\.\s*\d{1,2}\.\s*\d{4})/
      )?.[1]
    );
  if (policyStartDate) result.policyStartDate = policyStartDate;

  const frequencyLabel = findLabelBox(firstPageRows, ["frekvence placeni"]);
  const frequency =
    mapFrequency(frequencyLabel ? findTextBelowLabel(firstPageRows, frequencyLabel) : null) ??
    mapFrequency(
      firstPageAscii.match(
        /frekvence\s+placeni[\s\S]{0,120}?(rocne|pololetne|ctvrtletne|mesicne)/
      )?.[1]
    );
  if (frequency) result.frequency = frequency;

  const amountLabel = findLabelBox(firstPageRows, ["splatka pojistneho"]);
  const amount = parseAmount(amountLabel ? findTextBelowLabel(firstPageRows, amountLabel) : null);
  if (amount != null) result.amount = amount;

  const lastPageRows = await getPageRows(doc.numPages);
  const lastPageText = rowsToText(lastPageRows);
  const lastPageAscii = stripDiacritics(lastPageText).toLowerCase();

  const signaturesLabel = findLabelBox(lastPageRows, ["podpisy smluvnich stran"]);
  const signedDateLabel = signaturesLabel
    ? findLabelBox(lastPageRows, ["dne"], signaturesLabel.rowIndex + 1)
    : findLabelBox(lastPageRows, ["dne"]);
  const contractSignedDate =
    toDateInput(
      extractDateToken(
        signedDateLabel ? findTextBelowLabel(lastPageRows, signedDateLabel) : null
      )
    ) ??
    toDateInput(
      lastPageAscii.match(
        /podpisy\s+smluvnich\s+stran[\s\S]{0,80}?dne[\s\S]{0,50}?(\d{1,2}\.\s*\d{1,2}\.\s*\d{4})/
      )?.[1]
  );
  if (contractSignedDate) result.contractSignedDate = contractSignedDate;

  applyOldMaxdomov3Fallback(result, {
    firstPageRows,
    fourthPageRows: doc.numPages >= 4 ? await getPageRows(4) : null,
    lastPageRows,
  });

  return result;
}
