import { createHash } from "node:crypto";
import { investmentInstitutionId, type ProductInstitutionId } from "@/app/lib/productCatalog";
import { DEFAULT_STATEMENT_PRODUCT_MAPPING_INDEX } from "@/app/_provizni-vypisy/statementProductMap";
import { isLifeIncreaseCode } from "@/app/lib/lifePremiumIncrease";
import type { LifeIncreaseReceiptEvidence } from "@/app/lib/commissionReceipts";
import type { Product } from "@/app/types/domain";
import { StatementHtmlError, statementLinkHref, statementSectionHtml, statementTableCells, statementTableRows, statementHtmlText as stripHtmlText } from "./statementHtml";

const MONEY_MATCH_TOLERANCE = 0.01;

export const normalizeCommissionCodeKey = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

type CommissionStatementPayoutStatus = "paid" | "storno";
type CommissionStatementPayoutRowLayout =
  | "commission"
  | "own_storno"
  | "own_deduction";

export type CommissionStatementPayoutRow = {
  rowKey: string;
  rowId: string;
  detailUrl: string | null;
  contractNumber: string;
  client: string | null;
  productCode: string;
  commissionCode: string;
  baseAmount: number | null;
  commission: number;
  reserveFund: number | null;
  career: string | null;
  signedAt: string | null;
  validFrom: string | null;
  source: "own" | "manager";
  status: CommissionStatementPayoutStatus;
};

export const normalizeText = (value: unknown, maxLength = 220): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
};

export const parseMoneyOrNull = (value: string): number | null => {
  const normalized = stripHtmlText(value)
    .replace(/Kč/gi, "")
    .replace(/[−–]/g, "-")
    .replace(/\s/g, "")
    .replace(",", ".")
    .trim();
  if (!/\d/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
};

const decodeHtmlAttribute = (value: string): string =>
  value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .trim();

export const normalizeExternalHref = (href: string | null | undefined): string | null => {
  const normalized = decodeHtmlAttribute(String(href ?? ""));
  if (!normalized || normalized.toLowerCase().startsWith("javascript:")) return null;

  try {
    const parsed = new URL(normalized, "https://sjednatel.bohemiaservis.cz/");
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
};

const firstCellHrefFromRowHtml = (rowHtml: string): string | null => {
  const firstCell = statementTableCells(rowHtml)[0] ?? "";
  return normalizeExternalHref(statementLinkHref(firstCell));
};

export const normalizeContractNumber = (value: string | null | undefined): string | null => {
  const normalized = String(value ?? "").replace(/\D+/g, "").trim();
  if (normalized.length > 64) throw new StatementHtmlError();
  return normalized.length >= 6 ? normalized : null;
};

export const normalizeProductCode = (value: string | null | undefined): string =>
  stripHtmlText(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, "");

export const investmentInstitutionFromStatementCode = (code: string): ProductInstitutionId | null =>
  investmentInstitutionId(DEFAULT_STATEMENT_PRODUCT_MAPPING_INDEX.products[code]?.productKey);

export const compactHash = (value: string, length = 24): string =>
  createHash("sha256").update(value).digest("hex").slice(0, length);

export function statementPayoutKey(statementId: string, row: CommissionStatementPayoutRow): string {
  return compactHash(`${statementId}:${row.rowKey}:${row.contractNumber}:${row.commissionCode}`, 32);
}

const LIFE_STATEMENT_PRODUCT_KEYS: Record<string, Product> = {
  CPP_N_LIFE: "neon",
  CPP_N_RISK: "neon",
  CPP_NEON: "neon",
  CPP_NEONRF: "neon",
  CPP_NRF_LF: "neon",
  CPP_NRF_IN: "neon",
  KOOP_FLEXI: "flexi",
  BHMK_PILLOW_UR_NM: "pillowInjury",
};

export function lifeProductKeyFromStatementCode(value: string | null | undefined): Product | null {
  const code = normalizeProductCode(value);
  if (Object.hasOwn(LIFE_STATEMENT_PRODUCT_KEYS, code)) return LIFE_STATEMENT_PRODUCT_KEYS[code];
  if (/NEON|N_LIFE|N_RISK/.test(code)) return "neon";
  if (/FLEXI/.test(code)) return "flexi";
  if (/PILLOW.*(?:UR|NM)/.test(code)) return "pillowInjury";
  return null;
}

export function lifeIncreaseReceiptEvidence(statementId: string, rows: CommissionStatementPayoutRow[]): LifeIncreaseReceiptEvidence[] {
  return rows.flatMap(row => {
    if (row.status !== "paid" || row.commission <= 0 || !row.validFrom || !isLifeIncreaseCode(row.commissionCode)) return [];
    const productKey = lifeProductKeyFromStatementCode(row.productCode);
    if (!productKey) return [];
    return [{ key: statementPayoutKey(statementId, row), contractNumber: row.contractNumber, productKey,
      source: row.source, code: row.commissionCode, amount: row.commission, validFrom: row.validFrom,
      signedAt: row.signedAt, baseAmount: row.baseAmount }];
  });
}

const parseCommissionPayoutRow = (
  cells: string[],
  source: CommissionStatementPayoutRow["source"],
  layout: CommissionStatementPayoutRowLayout = "commission",
  detailUrl: string | null = null,
  includeZero = false
): CommissionStatementPayoutRow | null => {
  const isManagerRow = source === "manager";
  const isOwnDeductionRow = layout === "own_deduction";
  const minimumCells = isManagerRow || isOwnDeductionRow ? 13 : 14;
  if (cells.length < minimumCells || !/^\d+$/.test(cells[0] ?? "")) return null;

  const rowId = cells[0] ?? "";
  const contractNumber = normalizeContractNumber(cells[1]);
  const commissionIndex = isManagerRow ? 11 : isOwnDeductionRow ? 11 : 12;
  const commission = parseMoneyOrNull(cells[commissionIndex] ?? "");
  if (!contractNumber || commission == null || (!includeZero && Math.abs(commission) < 0.005)) return null;

  const productIndex =
    layout === "own_storno" || isOwnDeductionRow ? 5 : isManagerRow ? 5 : 6;
  const commissionCodeIndex =
    layout === "own_storno" || isOwnDeductionRow ? 6 : isManagerRow ? 6 : 7;
  const baseIndex = isManagerRow ? 7 : isOwnDeductionRow ? 7 : 8;
  const reserveFundIndex = isManagerRow ? 12 : isOwnDeductionRow ? 12 : 13;
  const careerIndex = isManagerRow ? 10 : isOwnDeductionRow ? 10 : 11;
  const clientIndex = isOwnDeductionRow ? 3 : layout === "own_storno" ? 3 : isManagerRow ? 3 : 4;
  const productCode = normalizeProductCode(cells[productIndex]);
  const commissionCode = stripHtmlText(cells[commissionCodeIndex] ?? "").toUpperCase();
  const baseAmount = parseMoneyOrNull(cells[baseIndex] ?? "");
  const reserveFund = parseMoneyOrNull(cells[reserveFundIndex] ?? "");
  const career = normalizeText(cells[careerIndex], 24);
  const status: CommissionStatementPayoutStatus =
    layout !== "commission" || commission < 0 ? "storno" : "paid";
  const rowKey = compactHash(
    [
      source,
      layout,
      rowId,
      contractNumber,
      productCode,
      commissionCode,
      baseAmount ?? "",
      commission,
      status,
    ].join(":")
  );

  return {
    rowKey,
    rowId,
    detailUrl,
    contractNumber,
    client: normalizeText(cells[clientIndex], 180),
    productCode,
    commissionCode,
    baseAmount,
    commission: Math.round(commission * 100) / 100,
    reserveFund,
    career,
    signedAt: normalizeText(cells[2], 32),
    validFrom:
      isManagerRow || layout !== "commission" ? null : normalizeText(cells[3], 32),
    source,
    status,
  };
};

const extractRowsFromStatementSection = (
  sectionHtml: string,
  source: CommissionStatementPayoutRow["source"],
  layout: CommissionStatementPayoutRowLayout = "commission",
  includeZero = false
): CommissionStatementPayoutRow[] => {
  const rowMatches = statementTableRows(sectionHtml);
  const rows: CommissionStatementPayoutRow[] = [];

  for (const rowHtml of rowMatches) {
    const cells = statementTableCells(rowHtml).map(stripHtmlText);
    const row = parseCommissionPayoutRow(
      cells,
      source,
      layout,
      firstCellHrefFromRowHtml(rowHtml),
      includeZero
    );
    if (row) rows.push(row);
  }

  return rows;
};

const extractB36HalfPayoutRowsFromOtherPayments = (
  html: string | null
): CommissionStatementPayoutRow[] => {
  if (!html) return [];
  const otherPaymentsHtml = statementSectionHtml(html, "ostatni_platby");
  const rowMatches = statementTableRows(otherPaymentsHtml);
  const rows: CommissionStatementPayoutRow[] = [];
  const seenRows = new Set<string>();

  const addRow = ({
    contractNumber,
    commissionCode,
    amount,
    rowId,
  }: {
    contractNumber: string | null;
    commissionCode: string;
    amount: number | null;
    rowId: string;
  }) => {
    if (!contractNumber || amount == null || amount <= MONEY_MATCH_TOLERANCE) {
      return;
    }

    const seenKey = `${contractNumber}:${commissionCode}:${amount.toFixed(2)}`;
    if (seenRows.has(seenKey)) {
      return;
    }
    seenRows.add(seenKey);

    const rowKey = compactHash(
      [
        "own",
        "other_payment_b36_half",
        rowId,
        contractNumber,
        commissionCode,
        amount,
      ].join(":")
    );

    rows.push({
      rowKey,
      rowId,
      detailUrl: null,
      contractNumber,
      client: null,
      productCode: "",
      commissionCode,
      baseAmount: null,
      commission: Math.round(amount * 100) / 100,
      reserveFund: null,
      career: null,
      signedAt: null,
      validFrom: null,
      source: "own",
      status: "paid",
    });
  };

  rowMatches.forEach((rowHtml, index) => {
    const cells = statementTableCells(rowHtml).map(stripHtmlText);
    if (cells.length < 2) return;

    const description = normalizeText(cells[0]);
    if (!description || /^Popis$/i.test(description) || /^Počet položek:/i.test(description)) {
      return;
    }

    if (!/\b50\s*%/i.test(description) || !/\bB(?:36|3601)\b/i.test(description)) {
      return;
    }

    const commissionCode = /\bB3601\b/i.test(description) ? "B3601_HALF" : "B36_HALF";
    addRow({
      contractNumber: normalizeContractNumber(
        description.match(/smlouvy\s+(\d{6,})/i)?.[1] ?? null
      ),
      commissionCode,
      amount: parseMoneyOrNull(cells[1]),
      rowId: `ostatni-b36-${index + 1}`,
    });
  });

  if (rows.length === 0) {
    const sectionText = normalizeText(otherPaymentsHtml) ?? "";
    const textMatches = sectionText.matchAll(
      /smlouvy\s+(\d{6,})\s+50\s*%\s*(?:provize\s*)?B(3601|36)\b(?:\s*\([^)]*\))?(?:\s+\d{1,2}\.\d{1,2}\.\d{4})?\s+(-?\s*\d{1,3}(?:\s\d{3})*,\d{2})/giu
    );
    let textIndex = 0;
    for (const match of textMatches) {
      textIndex += 1;
      addRow({
        contractNumber: normalizeContractNumber(match[1] ?? null),
        commissionCode: match[2]?.toUpperCase() === "3601" ? "B3601_HALF" : "B36_HALF",
        amount: parseMoneyOrNull(match[3] ?? ""),
        rowId: `ostatni-b36-text-${textIndex}`,
      });
    }
  }

  return rows;
};

const moneyAmountsMatch = (left: number | null | undefined, right: number | null | undefined): boolean => {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  return (
    Number.isFinite(leftNumber) &&
    Number.isFinite(rightNumber) &&
    Math.abs(leftNumber - rightNumber) <= MONEY_MATCH_TOLERANCE
  );
};

const deductionOffsetsPayoutRow = (
  row: CommissionStatementPayoutRow,
  deduction: CommissionStatementPayoutRow
): boolean =>
  row.status === "paid" &&
  row.commission > 0 &&
  deduction.status === "storno" &&
  deduction.commission < 0 &&
  row.source === deduction.source &&
  row.contractNumber === deduction.contractNumber &&
  !investmentInstitutionFromStatementCode(row.productCode) &&
  normalizeProductCode(row.productCode) === normalizeProductCode(deduction.productCode) &&
  normalizeCommissionCodeKey(row.commissionCode) ===
    normalizeCommissionCodeKey(deduction.commissionCode) &&
  normalizeText(row.career, 24) === normalizeText(deduction.career, 24) &&
  moneyAmountsMatch(row.baseAmount, deduction.baseAmount) &&
  moneyAmountsMatch(row.commission, Math.abs(deduction.commission)) &&
  moneyAmountsMatch(row.reserveFund, Math.abs(deduction.reserveFund ?? 0));

export const payoutRowCanReplaceDeduction = (
  row: CommissionStatementPayoutRow,
  deduction: CommissionStatementPayoutRow
): boolean =>
  row.status === "paid" &&
  row.commission > 0 &&
  deduction.status === "storno" &&
  deduction.commission < 0 &&
  row.source === deduction.source &&
  row.contractNumber === deduction.contractNumber &&
  normalizeProductCode(row.productCode) === normalizeProductCode(deduction.productCode) &&
  normalizeCommissionCodeKey(row.commissionCode) ===
    normalizeCommissionCodeKey(deduction.commissionCode) &&
  moneyAmountsMatch(row.baseAmount, deduction.baseAmount) &&
  !deductionOffsetsPayoutRow(row, deduction);

const splitPayoutRowsOffsetByDeductions = (
  payoutRows: CommissionStatementPayoutRow[],
  deductionRows: CommissionStatementPayoutRow[]
): {
  payoutRows: CommissionStatementPayoutRow[];
  deductionRows: CommissionStatementPayoutRow[];
} => {
  if (deductionRows.length === 0) {
    return { payoutRows, deductionRows: [] };
  }

  const usedDeductionIndexes = new Set<number>();
  const filteredPayoutRows = payoutRows.filter((row) => {
    const matchIndex = deductionRows.findIndex(
      (deduction, index) =>
        !usedDeductionIndexes.has(index) && deductionOffsetsPayoutRow(row, deduction)
    );
    if (matchIndex < 0) return true;

    usedDeductionIndexes.add(matchIndex);
    return false;
  });

  return {
    payoutRows: filteredPayoutRows,
    deductionRows: deductionRows.filter((_, index) => !usedDeductionIndexes.has(index)),
  };
};

export const extractCommissionPayoutRowsFromStoredHtml = (
  html: string | null,
  { includeZeroOwnCommissions = false } = {}
): CommissionStatementPayoutRow[] => {
  if (!html) return [];

  const ownCommissionHtml = statementSectionHtml(html, "provize");
  const ownMainHtml = ownCommissionHtml.replace(/<b>\s*STORNA\s*<\/b>[\s\S]*$/i, "");
  const ownStornoHtml = ownCommissionHtml.match(/<b>\s*STORNA\s*<\/b>[\s\S]*$/i)?.[0] ?? "";
  const ownStornoSectionHtml = statementSectionHtml(html, "storna");
  const ownDeductionSectionHtml = statementSectionHtml(html, "odecty");
  const managerCommissionHtml = statementSectionHtml(html, "manazer");
  const ownRows = splitPayoutRowsOffsetByDeductions(
    extractRowsFromStatementSection(ownMainHtml, "own", "commission", includeZeroOwnCommissions),
    extractRowsFromStatementSection(ownDeductionSectionHtml, "own", "own_deduction")
  );
  const allManagerRows = extractRowsFromStatementSection(managerCommissionHtml, "manager");
  const managerRows = splitPayoutRowsOffsetByDeductions(
    allManagerRows.filter((row) => row.status === "paid"),
    allManagerRows.filter((row) => row.status === "storno")
  );
  const rows = [
    ...ownRows.payoutRows,
    ...extractB36HalfPayoutRowsFromOtherPayments(html),
    ...ownRows.deductionRows,
    ...extractRowsFromStatementSection(ownStornoHtml, "own", "own_storno"),
    ...extractRowsFromStatementSection(ownStornoSectionHtml, "own", "own_storno"),
    ...managerRows.payoutRows,
    ...managerRows.deductionRows,
  ];

  const uniqueRows = new Map<string, CommissionStatementPayoutRow>();
  for (const row of rows) {
    if (!uniqueRows.has(row.rowKey)) uniqueRows.set(row.rowKey, row);
  }

  return [...uniqueRows.values()].sort((a, b) => {
    const contractCompare = a.contractNumber.localeCompare(b.contractNumber, "cs");
    if (contractCompare !== 0) return contractCompare;
    return a.rowKey.localeCompare(b.rowKey, "cs");
  });
};
