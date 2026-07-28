import { createHash } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import type {
  CommissionMode,
  CommissionCoefficientSet,
  CommissionResultItemDTO,
  PaymentFrequency,
  Position,
  Product,
} from "@/app/types/domain";
import {
  hasContractAccess,
  requireContractsEntryGuard,
} from "@/app/api/contracts/_lib/contractsApi";
import type { ContractDoc } from "@/app/api/contracts/_lib/contractsApi.types";
import { totalWithMultipliers } from "@/app/lib/commissionTotals";
import { isAnnualAutoPayoutProduct, isAutoProduct } from "@/app/lib/productCatalog";
import {
  calculateAllianzAuto,
  calculateCppAuto,
  calculateCsobAuto,
  calculateKooperativaAuto,
  calculatePillowAuto,
  calculateSlaviaFlotila,
  calculateSlaviaAuto,
  calculateUniqaAuto,
  calculateUniqaFlotila,
  calculateKoopFlotila,
} from "@/app/lib/productFormulas";
import {
  autoSubsequentCoefficientForProduct,
  isAutoSubsequentCommissionCode,
} from "@/app/lib/productFormulas/autoCommission";
import {
  candidateCoefficientSetsForProduct,
  defaultCoefficientSetForProduct,
  normalizeCommissionCoefficientSet,
  productSupportsCoefficientSetOverride,
  signedDateForCoefficientSetOverride,
} from "@/app/lib/productFormulas/coefficientSets";
import {
  calculateNeon,
  normalizeNeonDurationYears,
} from "@/app/lib/productFormulas/neon";
import { periodsPerYear } from "@/app/lib/productFormulas/shared";
import { requireAuthedRateLimited, withRateLimitHeaders } from "@/lib/server/apiEntryGuard";
import { adminDb } from "@/lib/server/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATEMENTS_RATE_LIMIT = 80;
const STATEMENTS_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_LIST_LIMIT = 120;
const MAX_LIST_LIMIT = 240;
const MAX_HTML_LENGTH = 850_000;
const CONTRACT_REFS_COLLECTION = "contractRefs";
const PREMIUM_CHANGE_TOLERANCE = 12;
const COMMISSION_DIFFERENCE_TOLERANCE = 10;
const MANAGER_COMMISSION_DIFFERENCE_TOLERANCE = 10;
const MONEY_MATCH_TOLERANCE = 0.01;
const AUTO_PREMIUM_ANNIVERSARY_TOLERANCE_MONTHS = 2;
const MAX_STORED_CONTRACT_PAYOUTS = 400;
const MAX_STORED_PREMIUM_HISTORY = 120;

type StatementHeaderPayload = {
  advisorNumber?: unknown;
  period?: unknown;
  statementNumber?: unknown;
  statementDate?: unknown;
};

type StatementSummaryPayload = {
  commissionRowCount?: unknown;
  commissionTotal?: unknown;
  reserveFundTotal?: unknown;
  payoutTotal?: unknown;
  otherPaymentsCount?: unknown;
  otherPaymentsTotal?: unknown;
  managerAdvisorCount?: unknown;
  managerRowCount?: unknown;
  managerCommissionTotal?: unknown;
  stornoRowCount?: unknown;
  stornoTotal?: unknown;
};

type FirestoreTimestamp = {
  seconds: number;
  nanoseconds: number;
  toDate?: () => Date;
};

type AutoPremiumStatementRow = {
  premiumKind: "auto_change" | "life_increase";
  rowId: string;
  detailUrl: string | null;
  contractNumber: string;
  client: string | null;
  productCode: string;
  productKey: Product | null;
  commissionCode: string;
  basePremium: number;
  commission: number | null;
  signedAt: string | null;
  validFrom: string | null;
  source: "own" | "manager";
};

type CommissionStatementPayoutStatus = "paid" | "storno";
type CommissionStatementPayoutRowLayout =
  | "commission"
  | "own_storno"
  | "own_deduction";

type CommissionStatementPayoutRow = {
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

type StatementPayoutCorrectionInfo = {
  detail: string;
};

type ContractCommissionPayoutDifferenceReason =
  | "career_mismatch"
  | "premium_base_mismatch"
  | "commission_amount_mismatch"
  | "storno";

type ContractCommissionPayoutRecord = {
  key: string;
  code: string | null;
  title: string | null;
  amount: number;
  expectedAmount: number | null;
  difference: number | null;
  differenceReason: ContractCommissionPayoutDifferenceReason | null;
  career: string | null;
  detail: string | null;
  status: "paid" | "difference" | "storno";
  statementId: string;
  statementNumber: string | null;
  statementPeriod: string | null;
  statementDate: string | null;
  statementChronologyMs: number | null;
  payoutMonthKey: string | null;
  writtenAtMs: number;
  writtenBy: string;
};

type ContractCommissionStornoSummaryRecord = {
  totalAmount: number;
  totalAbsAmount: number;
  count: number;
  latestStatementId: string | null;
  latestStatementNumber: string | null;
  latestStatementPeriod: string | null;
  latestStatementDate: string | null;
  latestStatementChronologyMs: number | null;
  latestPayoutMonthKey: string | null;
  updatedAtMs: number;
  updatedBy: string;
};

type ContractPremiumStatementHistoryEntry = {
  key: string;
  premiumKind: AutoPremiumStatementRow["premiumKind"] | "auto_initial";
  statementId: string;
  statementNumber: string | null;
  statementPeriod: string | null;
  statementDate: string | null;
  statementChronologyMs: number | null;
  payoutMonthKey: string | null;
  anniversaryNumber: number;
  anniversaryDate: string;
  previousPremium: number | null;
  newPremium: number;
  difference: number | null;
  previousAnnualPremium?: number | null;
  newAnnualPremium?: number | null;
  differenceAnnual?: number | null;
  basePremiumPeriod?: "annual" | "payment" | null;
  productCode: string;
  commissionCode: string | null;
  rowId: string;
  validFrom: string | null;
  source: AutoPremiumStatementRow["source"];
  writtenAtMs: number;
  writtenBy: string;
};

type ProcessingResult = {
  payoutRows: number;
  contractsMatched: number;
  contractsUpdated: number;
  contractsWithPayoutChanges: number;
  payoutRecordsAdded: number;
  payoutRecordsExisting: number;
  payoutRecordsUpdated: number;
  coefficientOverridesApplied: number;
  duplicatePayoutRowsSkipped: number;
  premiumUpdates: number;
  premiumHistoryBackfills: number;
  olderPremiumUpdatesSkipped: number;
  accountingRepairDrafts: number;
  externalUpdateTasks: number;
  notFoundContracts: string[];
  ambiguousContracts: string[];
  skippedContracts: string[];
  errors: string[];
};

const AUTO_STATEMENT_PRODUCT_KEYS: Record<string, Product> = {
  CPP_ACPIII: "cppAuto",
  CPP_ACPIV: "cppAuto",
  CPP_ACPIVZ: "cppAuto",
  ALLMOJEAUT: "allianzAuto",
  CSOBP_AU_Z: "csobAuto",
  UNIQA_AUTO: "uniqaAuto",
  PIL_AUTOZ: "pillowAuto",
  SLA_AUTOZ: "slaviaauto",
  KOO_NAMIRU: "kooperativaAuto",
};

const LIFE_STATEMENT_PRODUCT_KEYS: Record<string, Product> = {
  CPP_N_LIFE: "neon",
  CPP_N_RISK: "neon",
  CPP_NEON: "neon",
  CPP_NRF_LF: "neon",
  KOOP_FLEXI: "flexi",
  BHMK_PILLOW_UR_NM: "pillowInjury",
};

const POSITION_VALUES: Position[] = [
  "poradce1",
  "poradce2",
  "poradce3",
  "poradce4",
  "poradce5",
  "poradce6",
  "poradce7",
  "poradce8",
  "poradce9",
  "poradce10",
  "manazer4",
  "manazer5",
  "manazer6",
  "manazer7",
  "manazer8",
  "manazer9",
  "manazer10",
];
const POSITION_SET = new Set<string>(POSITION_VALUES);

const normalizeText = (value: unknown, maxLength = 220): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
};

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizeNumber = (value: unknown): number => {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
};

const normalizeNullableNumber = (value: unknown): number | null => {
  if (value == null || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
};

const stripHtmlText = (value: string): string =>
  value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();

const normalizeStatementLabel = (value: string): string =>
  stripHtmlText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();

const parseMoneyOrNull = (value: string): number | null => {
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

const normalizeExternalHref = (href: string | null | undefined): string | null => {
  const normalized = decodeHtmlAttribute(String(href ?? ""));
  if (!normalized || normalized.toLowerCase().startsWith("javascript:")) return null;

  try {
    return new URL(normalized, "https://sjednatel.bohemiaservis.cz/").toString();
  } catch {
    return normalized;
  }
};

const firstCellHrefFromRowHtml = (rowHtml: string): string | null => {
  const firstCell = rowHtml.match(/<t[dh]\b[\s\S]*?<\/t[dh]>/i)?.[0] ?? "";
  const quotedHref = firstCell.match(/<a\b[^>]*\bhref=(["'])(.*?)\1/i)?.[2];
  if (quotedHref) return normalizeExternalHref(quotedHref);

  const unquotedHref = firstCell.match(/<a\b[^>]*\bhref=([^\s>]+)/i)?.[1];
  return normalizeExternalHref(unquotedHref);
};

const normalizeSjednatelExtranetParam = (
  value: string | number | null | undefined
): string | null => {
  const normalized = String(value ?? "").trim();
  return /^\d+$/.test(normalized) ? normalized : null;
};

const extranetEntityIdFromContractDetailUrl = (
  detailUrl: string | null | undefined
): string | null => {
  const normalizedUrl = normalizeExternalHref(detailUrl);
  if (!normalizedUrl) return null;

  try {
    return normalizeSjednatelExtranetParam(
      new URL(normalizedUrl).searchParams.get("sml")
    );
  } catch {
    return null;
  }
};

const hasSjednatelExtranetFromProductCode = (
  productCode: string | null | undefined
): boolean => {
  const code = normalizeProductCode(productCode);
  return code.startsWith("CPP") || code.startsWith("UNIQA");
};

const extractPayoutTotalFromStoredHtml = (html: string | null): number | null => {
  if (!html) return null;
  const summaryEnd = html.search(
    /<div\b[^>]*class=["'][^"']*\bvypis_sekce_toggle\b|id=["']zadrzny_fond["']/i
  );
  const summaryHtml = summaryEnd > 0 ? html.slice(0, summaryEnd) : html;
  const rowMatches = summaryHtml.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? [];

  for (const rowHtml of [...rowMatches].reverse()) {
    const cells = rowHtml.match(/<t[dh]\b[\s\S]*?<\/t[dh]>/gi) ?? [];
    if (cells.length < 2) continue;
    if (!cells.some((cell) => normalizeStatementLabel(cell) === "celkem")) continue;

    const payoutTotal = parseMoneyOrNull(cells[cells.length - 1] ?? "");
    if (payoutTotal != null) return payoutTotal;
  }

  return null;
};

const normalizeContractNumber = (value: string | null | undefined): string | null => {
  const normalized = String(value ?? "").replace(/\D+/g, "").trim();
  return normalized.length >= 6 ? normalized : null;
};

const normalizeContractNumberLoose = (value: string | null | undefined): string =>
  String(value ?? "")
    .replace(/\D+/g, "")
    .replace(/^0+/, "")
    .trim();

const normalizeProductCode = (value: string | null | undefined): string =>
  stripHtmlText(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, "");

const autoProductKeyFromStatementCode = (value: string | null | undefined): Product | null => {
  const code = normalizeProductCode(value);
  if (AUTO_STATEMENT_PRODUCT_KEYS[code]) return AUTO_STATEMENT_PRODUCT_KEYS[code];
  if (/^CPP_ACP/.test(code)) return "cppAuto";
  return null;
};

const lifeProductKeyFromStatementCode = (value: string | null | undefined): Product | null => {
  const code = normalizeProductCode(value);
  if (LIFE_STATEMENT_PRODUCT_KEYS[code]) return LIFE_STATEMENT_PRODUCT_KEYS[code];
  if (/NEON|N_LIFE|N_RISK/.test(code)) return "neon";
  if (/FLEXI/.test(code)) return "flexi";
  if (/PILLOW.*(?:UR|NM)/.test(code)) return "pillowInjury";
  return null;
};

const isNeonRefreshStatementProductCode = (value: string | null | undefined): boolean =>
  normalizeProductCode(value) === "CPP_NRF_LF";

const isLifePremiumIncreaseCommissionCode = (
  value: string | null | undefined
): boolean => {
  const code = normalizeCommissionCodeKey(value);
  return /^(?:NV(?:PZ?|Z)?|NB)\d+/.test(code);
};

const extractStatementSectionHtml = (html: string, id: string): string => {
  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(
    new RegExp(
      `<div\\b[^>]*id=["']${escapedId}["'][^>]*>[\\s\\S]*?(?=<div\\b[^>]*class=["'][^"']*\\bvypis_sekce_toggle\\b|$)`,
      "i"
    )
  );
  return match?.[0] ?? "";
};

const compactHash = (value: string, length = 24): string =>
  createHash("sha256").update(value).digest("hex").slice(0, length);

const parseCommissionPayoutRow = (
  cells: string[],
  source: CommissionStatementPayoutRow["source"],
  layout: CommissionStatementPayoutRowLayout = "commission",
  detailUrl: string | null = null
): CommissionStatementPayoutRow | null => {
  const isManagerRow = source === "manager";
  const isOwnDeductionRow = layout === "own_deduction";
  const minimumCells = isManagerRow || isOwnDeductionRow ? 13 : 14;
  if (cells.length < minimumCells || !/^\d+$/.test(cells[0] ?? "")) return null;

  const rowId = cells[0] ?? "";
  const contractNumber = normalizeContractNumber(cells[1]);
  const commissionIndex = isManagerRow ? 11 : isOwnDeductionRow ? 11 : 12;
  const commission = parseMoneyOrNull(cells[commissionIndex] ?? "");
  if (!contractNumber || commission == null || Math.abs(commission) < 0.005) return null;

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
  layout: CommissionStatementPayoutRowLayout = "commission"
): CommissionStatementPayoutRow[] => {
  const rowMatches = sectionHtml.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? [];
  const rows: CommissionStatementPayoutRow[] = [];

  for (const rowHtml of rowMatches) {
    const cells = (rowHtml.match(/<t[dh]\b[\s\S]*?<\/t[dh]>/gi) ?? []).map(stripHtmlText);
    const row = parseCommissionPayoutRow(
      cells,
      source,
      layout,
      firstCellHrefFromRowHtml(rowHtml)
    );
    if (row) rows.push(row);
  }

  return rows;
};

const extractB36HalfPayoutRowsFromOtherPayments = (
  html: string | null
): CommissionStatementPayoutRow[] => {
  if (!html) return [];
  const otherPaymentsHtml = extractStatementSectionHtml(html, "ostatni_platby");
  const rowMatches = otherPaymentsHtml.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? [];
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
    const cells = (rowHtml.match(/<t[dh]\b[\s\S]*?<\/t[dh]>/gi) ?? []).map(stripHtmlText);
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
  row.source === "own" &&
  deduction.source === "own" &&
  row.contractNumber === deduction.contractNumber &&
  normalizeProductCode(row.productCode) === normalizeProductCode(deduction.productCode) &&
  normalizeCommissionCodeKey(row.commissionCode) ===
    normalizeCommissionCodeKey(deduction.commissionCode) &&
  normalizeText(row.career, 24) === normalizeText(deduction.career, 24) &&
  moneyAmountsMatch(row.baseAmount, deduction.baseAmount) &&
  moneyAmountsMatch(row.commission, Math.abs(deduction.commission)) &&
  moneyAmountsMatch(row.reserveFund, Math.abs(deduction.reserveFund ?? 0));

const payoutRowCanReplaceDeduction = (
  row: CommissionStatementPayoutRow,
  deduction: CommissionStatementPayoutRow
): boolean =>
  row.status === "paid" &&
  row.commission > 0 &&
  deduction.status === "storno" &&
  deduction.commission < 0 &&
  row.source === "own" &&
  deduction.source === "own" &&
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

const extractCommissionPayoutRowsFromStoredHtml = (
  html: string | null
): CommissionStatementPayoutRow[] => {
  if (!html) return [];

  const ownCommissionHtml = extractStatementSectionHtml(html, "provize");
  const ownMainHtml = ownCommissionHtml.replace(/<b>\s*STORNA\s*<\/b>[\s\S]*$/i, "");
  const ownStornoHtml = ownCommissionHtml.match(/<b>\s*STORNA\s*<\/b>[\s\S]*$/i)?.[0] ?? "";
  const ownStornoSectionHtml = extractStatementSectionHtml(html, "storna");
  const ownDeductionSectionHtml = extractStatementSectionHtml(html, "odecty");
  const managerCommissionHtml = extractStatementSectionHtml(html, "manazer");
  const ownRows = splitPayoutRowsOffsetByDeductions(
    extractRowsFromStatementSection(ownMainHtml, "own"),
    extractRowsFromStatementSection(ownDeductionSectionHtml, "own", "own_deduction")
  );
  const rows = [
    ...ownRows.payoutRows,
    ...extractB36HalfPayoutRowsFromOtherPayments(html),
    ...ownRows.deductionRows,
    ...extractRowsFromStatementSection(ownStornoHtml, "own", "own_storno"),
    ...extractRowsFromStatementSection(ownStornoSectionHtml, "own", "own_storno"),
    ...extractRowsFromStatementSection(managerCommissionHtml, "manager"),
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

const commissionCodeAliases = (value: string | null | undefined): string[] => {
  const code = stripHtmlText(value ?? "").toUpperCase().replace(/\s+/g, "");
  if (!code) return [];
  const installmentRangeMatch = code.match(/^([AB])(\d{3})-\1(\d{3})$/);
  if (installmentRangeMatch) {
    const prefix = installmentRangeMatch[1] ?? "";
    const start = Number(installmentRangeMatch[2]);
    const end = Number(installmentRangeMatch[3]);
    if (
      prefix &&
      Number.isInteger(start) &&
      Number.isInteger(end) &&
      end >= start &&
      end - start <= 24
    ) {
      return [
        code,
        ...Array.from({ length: end - start + 1 }, (_, index) =>
          `${prefix}${String(start + index).padStart(3, "0")}`
        ),
      ];
    }
  }
  if (code === "B36_HALF" || code === "B036_HALF" || code === "B3601_HALF") {
    return ["B36_HALF", "B036_HALF", "B3601_HALF"];
  }
  if (code === "B36" || code === "B036" || code === "B3601") {
    return ["B36", "B036", "B3601"];
  }
  if (code === "B48" || code === "B048" || code === "B4801") {
    return ["B48", "B048", "B4801"];
  }
  if (/^A\d+$/.test(code)) return [code];
  if (code === "B101-B104") return ["B101-B104", "B101", "B102", "B103", "B104"];
  if (/^B1(?:0[1-9]|1[0-2])$/.test(code)) return [code];
  if (code === "B201-B206") {
    return ["B201-B206", "B201", "B202", "B203", "B204", "B205", "B206"];
  }
  if (/^B20[1-6]$/.test(code)) return [code, "B201-B206"];
  const closingRoleMatch = code.match(/^(?:APZ|AP|AZ)(\d+)$/);
  if (closingRoleMatch) return [code, `A${closingRoleMatch[1]}`];
  return [code];
};

const commissionCodesFromOtherPaymentText = (value: string): string[] => {
  const hasHalfB36 =
    /\b50\s*%/i.test(value) &&
    /\bB(?:036|36|3601)\b/i.test(value);
  const codeMatches = [
    ...value.matchAll(
      /\b(A1(?:0[1-9]|1[0-2])|B0301|B1(?:0[1-9]|1[0-2])|B20[1-6]|B4801|B48|B048|B3601|B36|B036)\b/gi
    ),
  ];

  return codeMatches.flatMap((match) => {
    const code = match[1]?.toUpperCase().replace(/\s+/g, "") ?? "";
    if ((code === "B36" || code === "B036" || code === "B3601") && hasHalfB36) {
      return ["B36_HALF", "B036_HALF", "B3601_HALF"];
    }
    return commissionCodeAliases(code);
  });
};

const paidCommissionKey = (contractNumber: string, code: string): string | null => {
  const normalizedContract = normalizeContractNumber(contractNumber);
  const normalizedCode = stripHtmlText(code).toUpperCase().replace(/\s+/g, "");
  if (!normalizedContract || !normalizedCode) return null;
  return `${normalizedContract}:${normalizedCode}`;
};

const isPositiveSettledPayoutRow = (row: CommissionStatementPayoutRow): boolean =>
  row.status === "paid" && row.commission > 0;

const extractPaidCommissionKeysFromStoredHtml = (html: string | null): string[] => {
  if (!html) return [];
  const keys = new Set<string>();

  for (const row of extractCommissionPayoutRowsFromStoredHtml(html)) {
    if (!isPositiveSettledPayoutRow(row)) continue;
    for (const code of commissionCodeAliases(row.commissionCode)) {
      const key = paidCommissionKey(row.contractNumber, code);
      if (key) keys.add(key);
    }
  }

  const otherPaymentsHtml = extractStatementSectionHtml(html, "ostatni_platby");
  const rowMatches = otherPaymentsHtml.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? [];
  for (const rowHtml of rowMatches) {
    const rowText = stripHtmlText(rowHtml);
    if (/storn/i.test(rowText)) continue;

    const contractMatches = [...rowText.matchAll(/smlouvy\s+(\d{6,})/gi)]
      .map((match) => normalizeContractNumber(match[1]))
      .filter((value): value is string => Boolean(value));
    if (contractMatches.length === 0) continue;

    const codeMatches = commissionCodesFromOtherPaymentText(rowText);
    if (codeMatches.length === 0) continue;

    for (const contractNumber of contractMatches) {
      for (const code of codeMatches) {
        const key = paidCommissionKey(contractNumber, code);
        if (key) keys.add(key);
      }
    }
  }

  return [...keys].sort((a, b) => a.localeCompare(b, "cs"));
};

const autoPremiumRowFromPayoutRow = (
  row: CommissionStatementPayoutRow
): AutoPremiumStatementRow | null => {
  if (row.status !== "paid" || row.commission < 0) return null;
  const productKey = autoProductKeyFromStatementCode(row.productCode);
  if (!productKey || row.baseAmount == null || row.baseAmount <= 0) return null;

  return {
    premiumKind: "auto_change",
    rowId: row.rowId,
    detailUrl: row.detailUrl,
    contractNumber: row.contractNumber,
    client: row.client,
    productCode: row.productCode,
    productKey,
    commissionCode: row.commissionCode,
    basePremium: row.baseAmount,
    commission: row.commission,
    signedAt: row.signedAt,
    validFrom: row.validFrom,
    source: row.source,
  };
};

const extractAutoPremiumRowsFromStoredHtml = (html: string | null): AutoPremiumStatementRow[] => {
  if (!html) return [];
  const rows = extractCommissionPayoutRowsFromStoredHtml(html)
    .map(autoPremiumRowFromPayoutRow)
    .filter((row): row is AutoPremiumStatementRow => Boolean(row));

  const uniqueRows = new Map<string, AutoPremiumStatementRow>();
  for (const row of rows) {
    const key = [
      row.source,
      row.rowId,
      row.contractNumber,
      row.productCode,
      row.commissionCode,
      row.basePremium,
      row.commission ?? "",
    ].join(":");
    if (!uniqueRows.has(key)) uniqueRows.set(key, row);
  }

  return [...uniqueRows.values()].sort((a, b) => {
    const contractCompare = a.contractNumber.localeCompare(b.contractNumber, "cs");
    if (contractCompare !== 0) return contractCompare;
    return a.commissionCode.localeCompare(b.commissionCode, "cs");
  });
};

const lifePremiumIncreaseRowFromPayoutRow = (
  row: CommissionStatementPayoutRow
): AutoPremiumStatementRow | null => {
  if (row.status !== "paid" || row.commission < 0) return null;
  const productKey = lifeProductKeyFromStatementCode(row.productCode);
  if (!productKey || !isLifePremiumIncreaseCommissionCode(row.commissionCode)) return null;
  if (row.baseAmount == null || row.baseAmount <= 0) return null;

  return {
    premiumKind: "life_increase",
    rowId: row.rowId,
    detailUrl: row.detailUrl,
    contractNumber: row.contractNumber,
    client: row.client,
    productCode: row.productCode,
    productKey,
    commissionCode: row.commissionCode,
    basePremium: row.baseAmount,
    commission: row.commission,
    signedAt: row.signedAt,
    validFrom: row.validFrom,
    source: row.source,
  };
};

const extractLifePremiumIncreaseRowsFromStoredHtml = (
  html: string | null
): AutoPremiumStatementRow[] => {
  if (!html) return [];
  const rows = extractCommissionPayoutRowsFromStoredHtml(html)
    .map(lifePremiumIncreaseRowFromPayoutRow)
    .filter((row): row is AutoPremiumStatementRow => Boolean(row));

  const uniqueRows = new Map<string, AutoPremiumStatementRow>();
  for (const row of rows) {
    const key = [
      row.source,
      row.rowId,
      row.contractNumber,
      row.productCode,
      row.basePremium,
      row.validFrom ?? "",
    ].join(":");
    if (!uniqueRows.has(key)) uniqueRows.set(key, row);
  }

  return [...uniqueRows.values()].sort((a, b) => {
    const contractCompare = a.contractNumber.localeCompare(b.contractNumber, "cs");
    if (contractCompare !== 0) return contractCompare;
    return a.commissionCode.localeCompare(b.commissionCode, "cs");
  });
};

const extractPaidContractNumbersFromStoredHtml = (html: string | null): string[] => {
  if (!html) return [];
  const contractNumbers = new Set<string>();

  for (const row of extractCommissionPayoutRowsFromStoredHtml(html)) {
    if (!isPositiveSettledPayoutRow(row)) continue;
    const contractNumber = normalizeContractNumber(row.contractNumber);
    if (contractNumber) contractNumbers.add(contractNumber);
  }

  const otherPaymentsHtml = extractStatementSectionHtml(html, "ostatni_platby");
  const rowMatches = otherPaymentsHtml.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? [];

  for (const rowHtml of rowMatches) {
    const rowText = stripHtmlText(rowHtml);
    if (/storn/i.test(rowText)) continue;

    for (const match of rowText.matchAll(/smlouvy\s+(\d{6,})/gi)) {
      const contractNumber = normalizeContractNumber(match[1]);
      if (contractNumber) contractNumbers.add(contractNumber);
    }
  }

  return [...contractNumbers].sort((a, b) => a.localeCompare(b, "cs"));
};

const parseLimit = (value: string | null): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_LIST_LIMIT;
  return Math.min(MAX_LIST_LIMIT, Math.max(1, Math.floor(parsed)));
};

const toMillis = (value: unknown): number | null => {
  if (!value) return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value) : null;
  }
  if (typeof value === "string") {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === "object") {
    const ts = value as FirestoreTimestamp;
    if (typeof ts.toDate === "function") {
      const ms = ts.toDate().getTime();
      return Number.isFinite(ms) ? ms : null;
    }
    if (
      typeof ts.seconds === "number" &&
      Number.isFinite(ts.seconds) &&
      typeof ts.nanoseconds === "number" &&
      Number.isFinite(ts.nanoseconds)
    ) {
      return ts.seconds * 1000 + Math.floor(ts.nanoseconds / 1_000_000);
    }
  }
  return null;
};

const parseCzechDate = (value: string | null | undefined): number | null => {
  const match = value?.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return Date.UTC(year, month - 1, day);
};

const parseIsoDayMs = (value: string | null | undefined): number | null => {
  const match = value?.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return Date.UTC(year, month - 1, day);
};

const parsePeriodRange = (period: string | null) => {
  const match = period?.match(
    /(\d{1,2}\.\d{1,2}\.\d{4})\s*-\s*(\d{1,2}\.\d{1,2}\.\d{4})/
  );
  if (!match) return { periodStartMs: null, periodEndMs: null };
  return {
    periodStartMs: parseCzechDate(match[1]),
    periodEndMs: parseCzechDate(match[2]),
  };
};

const parseMonthKey = (yearParam: string | null, monthParam: string | null): string | null => {
  const year = Number(yearParam);
  const month = Number(monthParam);
  if (!Number.isInteger(year) || !Number.isInteger(month)) return null;
  if (year < 2000 || year > 2100 || month < 1 || month > 12) return null;
  return `${year}-${month}`;
};

const monthKeyFromMs = (ms: number | null): string | null => {
  if (ms == null) return null;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}`;
};

const nextMonthKeyFromMs = (ms: number | null): string | null => {
  if (ms == null) return null;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return null;
  const nextMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return `${nextMonth.getUTCFullYear()}-${nextMonth.getUTCMonth() + 1}`;
};

const resolvePayoutMonthKey = ({
  statementDateMs,
  periodEndMs,
  periodStartMs,
}: {
  statementDateMs: number | null;
  periodEndMs: number | null;
  periodStartMs: number | null;
}): string | null =>
  monthKeyFromMs(statementDateMs) ?? nextMonthKeyFromMs(periodEndMs) ?? monthKeyFromMs(periodStartMs);

const safeStatementId = (value: string | null): string | null => {
  const id = normalizeText(value, 80);
  if (!id || !/^[a-zA-Z0-9_-]{12,80}$/.test(id)) return null;
  return id;
};

const entryRefPath = (ownerEmail: string, entryId: string): string =>
  `users/${normalizeEmail(ownerEmail)}/entries/${entryId.trim()}`;

const isFirestoreFailedPrecondition = (error: unknown): boolean => {
  const numericCode =
    typeof (error as { code?: unknown })?.code === "number"
      ? (error as { code?: number }).code
      : null;
  if (numericCode === 9) return true;

  const message =
    typeof (error as { message?: unknown })?.message === "string"
      ? (error as { message?: string }).message ?? ""
      : "";
  return /FAILED_PRECONDITION/i.test(message);
};

const resolveEntryRefsByContractNumber = async (
  contractNumber: string
): Promise<FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>[]> => {
  if (!adminDb) throw new Error("Firebase Admin credentials are not configured.");

  const normalized = normalizeContractNumber(contractNumber);
  if (!normalized) return [];
  const loose = normalizeContractNumberLoose(contractNumber);
  const refsByPath = new Map<
    string,
    FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>
  >();

  const consumeRefSnap = (
    snap: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>
  ) => {
    for (const docSnap of snap.docs) {
      const data = docSnap.data() as {
        ownerEmail?: string | null;
        entryId?: string | null;
        entryPath?: string | null;
      };
      const ownerEmail = normalizeEmail(data.ownerEmail);
      const entryId = (data.entryId ?? "").trim();
      const storedEntryPath = (data.entryPath ?? "").trim();
      const path = storedEntryPath || (ownerEmail && entryId ? entryRefPath(ownerEmail, entryId) : "");
      if (path) refsByPath.set(path, adminDb!.doc(path));
    }
  };

  const queries = [
    adminDb.collection(CONTRACT_REFS_COLLECTION).where("contractNumberNormalized", "==", normalized).get(),
  ];
  if (loose && loose !== normalized) {
    queries.push(
      adminDb.collection(CONTRACT_REFS_COLLECTION).where("contractNumberLoose", "==", loose).get()
    );
  }

  try {
    const snaps = await Promise.all(queries);
    snaps.forEach(consumeRefSnap);
  } catch (error) {
    if (isFirestoreFailedPrecondition(error)) return [...refsByPath.values()];
    throw error;
  }

  if (refsByPath.size === 0) {
    const collectionQueries = [
      adminDb.collectionGroup("entries").where("contractNumber", "==", contractNumber).get(),
    ];
    if (normalized !== contractNumber) {
      collectionQueries.push(
        adminDb.collectionGroup("entries").where("contractNumber", "==", normalized).get()
      );
    }
    if (loose && loose !== normalized && loose !== contractNumber) {
      collectionQueries.push(
        adminDb.collectionGroup("entries").where("contractNumber", "==", loose).get()
      );
    }
    try {
      const snaps = await Promise.all(collectionQueries);
      for (const snap of snaps) {
        for (const docSnap of snap.docs) refsByPath.set(docSnap.ref.path, docSnap.ref);
      }
    } catch (error) {
      if (!isFirestoreFailedPrecondition(error)) throw error;
    }
  }

  return [...refsByPath.values()];
};

const statementCollection = (email: string) =>
  adminDb!.collection("usersPrivate").doc(email).collection("commissionStatements");

const serializeStatementDoc = (
  docSnap: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>,
  includeHtml = false
) => {
  const data = (docSnap.data() ?? {}) as Record<string, unknown>;
  const html = normalizeText(data.html, MAX_HTML_LENGTH);
  const periodStartMs = toMillis(data.periodStartMs);
  const periodEndMs = toMillis(data.periodEndMs);
  const statementDateMs = toMillis(data.statementDateMs);
  const statementChronologyMs =
    toMillis(data.statementChronologyMs) ??
    statementChronologyMsFromParts({
      statementDate: normalizeText(data.statementDate, 32),
      statementDateMs,
      statementPeriod: normalizeText(data.period, 80),
      periodEndMs,
      periodStartMs,
    });
  const payoutMonthKey =
    normalizeText(data.payoutMonthKey, 16) ??
    resolvePayoutMonthKey({ statementDateMs, periodEndMs, periodStartMs });
  const payoutTotal =
    normalizeNullableNumber(data.payoutTotal) ?? extractPayoutTotalFromStoredHtml(html);
  const paidContractNumbers = extractPaidContractNumbersFromStoredHtml(html);
  const paidCommissionKeys = extractPaidCommissionKeysFromStoredHtml(html);
  const autoPremiumRows = extractAutoPremiumRowsFromStoredHtml(html);

  return {
    id: docSnap.id,
    fileName: normalizeText(data.fileName) ?? "Provizní výpis",
    statementNumber: normalizeText(data.statementNumber, 64),
    statementDate: normalizeText(data.statementDate, 32),
    period: normalizeText(data.period, 80),
    advisorNumber: normalizeText(data.advisorNumber, 64),
    periodStartMs,
    periodEndMs,
    statementDateMs,
    statementChronologyMs,
    payoutMonthKey,
    paidContractNumbers,
    paidCommissionKeys,
    autoPremiumRows,
    commissionRowCount: normalizeNumber(data.commissionRowCount),
    commissionTotal: normalizeNumber(data.commissionTotal),
    reserveFundTotal: normalizeNumber(data.reserveFundTotal),
    payoutTotal,
    otherPaymentsCount: normalizeNumber(data.otherPaymentsCount),
    otherPaymentsTotal: normalizeNumber(data.otherPaymentsTotal),
    managerAdvisorCount: normalizeNumber(data.managerAdvisorCount),
    managerRowCount: normalizeNumber(data.managerRowCount),
    managerCommissionTotal: normalizeNumber(data.managerCommissionTotal),
    stornoRowCount: normalizeNumber(data.stornoRowCount),
    stornoTotal: normalizeNumber(data.stornoTotal),
    createdAtMs: toMillis(data.createdAtMs),
    updatedAtMs: toMillis(data.updatedAtMs),
    processedAtMs: toMillis(data.processedAtMs),
    processedBy: normalizeText(data.processedBy, 180),
    processingResult:
      data.processingResult && typeof data.processingResult === "object"
        ? (data.processingResult as Record<string, unknown>)
        : null,
    ...(includeHtml ? { html: html ?? "" } : {}),
  };
};

const emptyProcessingResult = (): ProcessingResult => ({
  payoutRows: 0,
  contractsMatched: 0,
  contractsUpdated: 0,
  contractsWithPayoutChanges: 0,
  payoutRecordsAdded: 0,
  payoutRecordsExisting: 0,
  payoutRecordsUpdated: 0,
  coefficientOverridesApplied: 0,
  duplicatePayoutRowsSkipped: 0,
  premiumUpdates: 0,
  premiumHistoryBackfills: 0,
  olderPremiumUpdatesSkipped: 0,
  accountingRepairDrafts: 0,
  externalUpdateTasks: 0,
  notFoundContracts: [],
  ambiguousContracts: [],
  skippedContracts: [],
  errors: [],
});

const normalizeCommissionTitle = (value: unknown): string =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();

const normalizeCommissionCodeKey = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

const baseCommissionCodeForStatementComparison = (value: unknown): string => {
  const code = normalizeCommissionCodeKey(value);
  const closingRoleMatch = code.match(/^(?:APZ|AP|AZ)(\d+)$/);
  return closingRoleMatch ? `A${closingRoleMatch[1]}` : code;
};

const isNeonInitialCommissionCode = (value: unknown): boolean => {
  const code = baseCommissionCodeForStatementComparison(value);
  return code === "A101" || code === "B0301";
};

const finiteMoneyOrNull = (value: unknown): number | null => {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
};

const contractCurrentPremium = (contract: ContractDoc): number | null =>
  finiteMoneyOrNull(contract.refreshCommissionBase?.calculationMonthlyPremium) ??
  finiteMoneyOrNull(contract.calculationInputAmount) ??
  finiteMoneyOrNull(contract.effectiveInputAmount) ??
  finiteMoneyOrNull(contract.inputAmount);

const contractPaymentPeriodsPerYear = (contract: ContractDoc): number => {
  switch (String(contract.frequencyRaw ?? "").trim().toLowerCase()) {
    case "monthly":
      return 12;
    case "quarterly":
      return 4;
    case "semiannual":
      return 2;
    case "annual":
    default:
      return 1;
  }
};

const contractCurrentAutoAnnualPremium = (contract: ContractDoc): number | null => {
  const paymentPremium = contractCurrentPremium(contract);
  if (paymentPremium == null) return null;
  return Math.round(paymentPremium * contractPaymentPeriodsPerYear(contract) * 100) / 100;
};

const autoPremiumStatementBasePeriod = (
  productKey: Product | null | undefined
): "annual" | "payment" =>
  isAnnualAutoPayoutProduct(productKey) ? "annual" : "payment";

const autoPremiumStatementAnnualBase = (
  row: AutoPremiumStatementRow,
  contract: ContractDoc
): number => {
  const base = Math.round(row.basePremium * 100) / 100;
  const productKey = row.productKey ?? contract.productKey ?? null;
  if (autoPremiumStatementBasePeriod(productKey) === "annual") return base;
  return Math.round(base * contractPaymentPeriodsPerYear(contract) * 100) / 100;
};

const contractPayoutArray = (contract: ContractDoc): ContractCommissionPayoutRecord[] =>
  Array.isArray((contract as { commissionPayouts?: unknown }).commissionPayouts)
    ? ((contract as { commissionPayouts?: ContractCommissionPayoutRecord[] }).commissionPayouts ?? [])
        .filter((item) => item && typeof item === "object" && typeof item.key === "string")
    : [];

const payoutRecordChronologyMs = (payout: ContractCommissionPayoutRecord): number =>
  finiteMoneyOrNull(payout.statementChronologyMs) ??
  parseCzechDate(payout.statementDate) ??
  (typeof payout.writtenAtMs === "number" && Number.isFinite(payout.writtenAtMs)
    ? payout.writtenAtMs
    : 0);

const commissionStornoSummaryFromPayouts = ({
  payouts,
  nowMs,
  writtenBy,
}: {
  payouts: ContractCommissionPayoutRecord[];
  nowMs: number;
  writtenBy: string;
}): ContractCommissionStornoSummaryRecord | null => {
  const stornoPayouts = payouts.filter((payout) => {
    const amount = finiteMoneyOrNull(payout.amount) ?? 0;
    return payout.status === "storno" || amount < 0;
  });
  if (stornoPayouts.length === 0) return null;

  const totalAbsAmount = Math.round(
    stornoPayouts.reduce((sum, payout) => {
      const amount = finiteMoneyOrNull(payout.amount) ?? 0;
      return sum + Math.abs(amount);
    }, 0) * 100
  ) / 100;
  const latest = [...stornoPayouts].sort(
    (a, b) => payoutRecordChronologyMs(a) - payoutRecordChronologyMs(b)
  )[stornoPayouts.length - 1];

  return {
    totalAmount: -totalAbsAmount,
    totalAbsAmount,
    count: stornoPayouts.length,
    latestStatementId: latest?.statementId ?? null,
    latestStatementNumber: latest?.statementNumber ?? null,
    latestStatementPeriod: latest?.statementPeriod ?? null,
    latestStatementDate: latest?.statementDate ?? null,
    latestStatementChronologyMs: latest?.statementChronologyMs ?? null,
    latestPayoutMonthKey: latest?.payoutMonthKey ?? null,
    updatedAtMs: nowMs,
    updatedBy: writtenBy,
  };
};

const contractPremiumHistoryArray = (
  contract: ContractDoc
): ContractPremiumStatementHistoryEntry[] =>
  Array.isArray((contract as { premiumStatementHistory?: unknown }).premiumStatementHistory)
    ? ((
        contract as {
          premiumStatementHistory?: ContractPremiumStatementHistoryEntry[];
        }
      ).premiumStatementHistory ?? []).filter(
        (item) => item && typeof item === "object" && typeof item.key === "string"
      )
    : [];

const statementChronologyMsFromParts = ({
  statementDate,
  statementDateMs,
  statementPeriod,
  periodEndMs,
  periodStartMs,
}: {
  statementDate?: string | null;
  statementDateMs?: number | null;
  statementPeriod?: string | null;
  periodEndMs?: number | null;
  periodStartMs?: number | null;
}): number | null => {
  if (statementDateMs != null) return statementDateMs;
  const parsedStatementDate = parseCzechDate(statementDate);
  if (parsedStatementDate != null) return parsedStatementDate;
  if (periodEndMs != null) return periodEndMs;
  const parsedPeriod = parsePeriodRange(statementPeriod ?? null);
  return parsedPeriod.periodEndMs ?? periodStartMs ?? parsedPeriod.periodStartMs ?? null;
};

const premiumHistoryEntryChronologyMs = (
  entry: ContractPremiumStatementHistoryEntry
): number | null =>
  statementChronologyMsFromParts({
    statementDate: entry.statementDate,
    statementDateMs: toMillis(entry.statementChronologyMs),
    statementPeriod: entry.statementPeriod,
  });

const latestPremiumStatementChronologyMs = (contract: ContractDoc): number | null => {
  const directValue = toMillis(
    (contract as { premiumUpdatedFromStatementChronologyMs?: unknown })
      .premiumUpdatedFromStatementChronologyMs
  );
  if (directValue != null) return directValue;

  return contractPremiumHistoryArray(contract).reduce<number | null>((latest, entry) => {
    const entryChronologyMs = premiumHistoryEntryChronologyMs(entry);
    if (entryChronologyMs == null) return latest;
    return latest == null ? entryChronologyMs : Math.max(latest, entryChronologyMs);
  }, null);
};

const premiumHistoryEntryDateMs = (
  entry: ContractPremiumStatementHistoryEntry
): number | null => {
  const anniversaryMs = parseIsoDayMs(entry.anniversaryDate);
  if (anniversaryMs != null) return anniversaryMs;
  return premiumHistoryEntryChronologyMs(entry);
};

const autoPremiumBeforeStatement = (
  contract: ContractDoc,
  referenceMs: number | null,
  options: { allowCurrentFallback?: boolean } = {}
): number | null => {
  const allowCurrentFallback = options.allowCurrentFallback ?? true;
  const history = contractPremiumHistoryArray(contract)
    .filter(
      (entry) =>
        (entry.premiumKind === "auto_initial" || entry.premiumKind === "auto_change") &&
        finiteMoneyOrNull(entry.newPremium) != null
    )
    .map((entry) => ({
      entry,
      dateMs: premiumHistoryEntryDateMs(entry),
      newPremium: finiteMoneyOrNull(entry.newAnnualPremium) ?? finiteMoneyOrNull(entry.newPremium),
      previousPremium:
        finiteMoneyOrNull(entry.previousAnnualPremium) ?? finiteMoneyOrNull(entry.previousPremium),
    }))
    .sort((a, b) => (a.dateMs ?? 0) - (b.dateMs ?? 0));

  if (history.length === 0) {
    return allowCurrentFallback ? contractCurrentAutoAnnualPremium(contract) : null;
  }

  if (referenceMs != null) {
    const latestBefore = [...history]
      .filter((item) => item.dateMs != null && item.dateMs < referenceMs)
      .at(-1);
    if (latestBefore?.newPremium != null) return latestBefore.newPremium;

    if (allowCurrentFallback) {
      const earliestKnownPrevious = history.find((item) => item.previousPremium != null);
      if (earliestKnownPrevious?.previousPremium != null) {
        return earliestKnownPrevious.previousPremium;
      }
    }

    return null;
  }

  return (
    history.at(-1)?.newPremium ??
    (allowCurrentFallback ? contractCurrentAutoAnnualPremium(contract) : null)
  );
};

const lifePremiumBeforeStatement = (
  contract: ContractDoc,
  referenceMs: number | null,
  options: { allowCurrentFallback?: boolean } = {}
): number | null => {
  const allowCurrentFallback = options.allowCurrentFallback ?? true;
  const history = contractPremiumHistoryArray(contract)
    .filter(
      (entry) =>
        entry.premiumKind === "life_increase" &&
        finiteMoneyOrNull(entry.newPremium) != null
    )
    .map((entry) => ({
      dateMs: premiumHistoryEntryDateMs(entry),
      newPremium: finiteMoneyOrNull(entry.newPremium),
      previousPremium: finiteMoneyOrNull(entry.previousPremium),
    }))
    .sort((a, b) => (a.dateMs ?? 0) - (b.dateMs ?? 0));

  if (history.length === 0) {
    return allowCurrentFallback ? contractCurrentPremium(contract) : null;
  }

  if (referenceMs != null) {
    const latestBefore = [...history]
      .filter((item) => item.dateMs != null && item.dateMs < referenceMs)
      .at(-1);
    if (latestBefore?.newPremium != null) return latestBefore.newPremium;

    if (allowCurrentFallback) {
      const earliestKnownPrevious = history.find((item) => item.previousPremium != null);
      if (earliestKnownPrevious?.previousPremium != null) {
        return earliestKnownPrevious.previousPremium;
      }
    }

    return null;
  }

  return (
    history.at(-1)?.newPremium ??
    (allowCurrentFallback ? contractCurrentPremium(contract) : null)
  );
};

const canApplyPremiumStatementToCurrentContract = (
  contract: ContractDoc,
  statementChronologyMs: number | null
): boolean => {
  if (statementChronologyMs == null) return true;
  const latestChronologyMs = latestPremiumStatementChronologyMs(contract);
  return latestChronologyMs == null || statementChronologyMs >= latestChronologyMs;
};

type StatementRowWithExternalLink = {
  detailUrl?: string | null;
  productCode?: string | null;
};

const statementExternalLinkPatch = (
  rows: StatementRowWithExternalLink[],
  contract: ContractDoc
): Record<string, unknown> => {
  const patch: Record<string, unknown> = {};
  const detailUrl = rows.find((row) => row.detailUrl)?.detailUrl ?? null;

  if (detailUrl && contract.maxxContractDetailUrl !== detailUrl) {
    patch.maxxContractDetailUrl = detailUrl;
  }

  const extranetRow =
    rows.find(
      (row) =>
        row.detailUrl &&
        hasSjednatelExtranetFromProductCode(row.productCode)
    ) ?? null;
  const extranetEntityId = extranetEntityIdFromContractDetailUrl(extranetRow?.detailUrl);
  if (extranetEntityId && String(contract.cppExtranetEntityId ?? "") !== extranetEntityId) {
    patch.cppExtranetEntityId = extranetEntityId;
  }
  if (extranetEntityId && String(contract.cppExtranetEntityTypeId ?? "") !== "43") {
    patch.cppExtranetEntityTypeId = "43";
  }

  return patch;
};

const premiumHistoryMoneyKey = (value: unknown): string => {
  const amount = finiteMoneyOrNull(value);
  return amount == null ? "" : String(Math.round(amount * 100));
};

const premiumHistorySemanticKey = (entry: ContractPremiumStatementHistoryEntry): string =>
  [
    entry.premiumKind,
    entry.source,
    entry.statementId ||
      [entry.statementNumber ?? "", entry.statementPeriod ?? "", entry.statementDate ?? ""].join("|"),
    entry.rowId,
    entry.anniversaryNumber,
    entry.anniversaryDate,
    entry.productCode,
    normalizeCommissionCodeKey(entry.commissionCode),
    premiumHistoryMoneyKey(entry.previousAnnualPremium ?? entry.previousPremium),
    premiumHistoryMoneyKey(entry.newAnnualPremium ?? entry.newPremium),
    premiumHistoryMoneyKey(entry.differenceAnnual ?? entry.difference),
  ].join("::");

const premiumHistoryCompletenessScore = (
  entry: ContractPremiumStatementHistoryEntry
): number => {
  let score = 0;
  if (entry.basePremiumPeriod) score += 20;
  if (entry.previousAnnualPremium != null) score += 10;
  if (entry.newAnnualPremium != null) score += 10;
  if (entry.differenceAnnual != null) score += 10;
  if (entry.statementChronologyMs != null) score += 4;
  if (entry.payoutMonthKey) score += 2;
  return score + (entry.writtenAtMs ?? 0) / 1_000_000_000_000;
};

const premiumHistorySortMs = (entry: ContractPremiumStatementHistoryEntry): number =>
  premiumHistoryEntryDateMs(entry) ??
  premiumHistoryEntryChronologyMs(entry) ??
  (typeof entry.writtenAtMs === "number" && Number.isFinite(entry.writtenAtMs)
    ? entry.writtenAtMs
    : 0);

const mergePremiumHistoryRecords = (
  existing: ContractPremiumStatementHistoryEntry[],
  incoming: ContractPremiumStatementHistoryEntry[],
  maxCount: number
): {
  merged: ContractPremiumStatementHistoryEntry[];
  added: number;
  existingCount: number;
  updatedExisting: number;
} => {
  const recordsBySemanticKey = new Map<string, ContractPremiumStatementHistoryEntry>();
  const order: string[] = [];
  let updatedExisting = 0;

  for (const item of existing) {
    const semanticKey = premiumHistorySemanticKey(item) || item.key;
    const current = recordsBySemanticKey.get(semanticKey);
    if (!current) {
      recordsBySemanticKey.set(semanticKey, item);
      order.push(semanticKey);
      continue;
    }
    updatedExisting += 1;
    if (premiumHistoryCompletenessScore(item) > premiumHistoryCompletenessScore(current)) {
      recordsBySemanticKey.set(semanticKey, item);
    }
  }

  let added = 0;
  let existingCount = 0;
  for (const item of incoming) {
    const semanticKey = premiumHistorySemanticKey(item) || item.key;
    const current = recordsBySemanticKey.get(semanticKey);
    if (!current) {
      recordsBySemanticKey.set(semanticKey, item);
      order.push(semanticKey);
      added += 1;
      continue;
    }

    existingCount += 1;
    if (premiumHistoryCompletenessScore(item) > premiumHistoryCompletenessScore(current)) {
      recordsBySemanticKey.set(semanticKey, item);
      updatedExisting += 1;
    }
  }

  const merged = order
    .map((key) => recordsBySemanticKey.get(key))
    .filter((item): item is ContractPremiumStatementHistoryEntry => Boolean(item))
    .sort(
      (a, b) =>
        premiumHistorySortMs(a) - premiumHistorySortMs(b) ||
        (a.writtenAtMs ?? 0) - (b.writtenAtMs ?? 0)
    )
    .slice(-maxCount);
  return { merged, added, existingCount, updatedExisting };
};

const payoutRecordNeedsRefresh = (
  existing: ContractCommissionPayoutRecord,
  incoming: ContractCommissionPayoutRecord
): boolean =>
  existing.status !== incoming.status ||
  existing.expectedAmount !== incoming.expectedAmount ||
  existing.difference !== incoming.difference ||
  existing.amount !== incoming.amount ||
  existing.code !== incoming.code ||
  (existing.career ?? null) !== (incoming.career ?? null) ||
  (existing.differenceReason ?? null) !== (incoming.differenceReason ?? null) ||
  (existing.detail ?? null) !== (incoming.detail ?? null) ||
  existing.title !== incoming.title;

const payoutRecordMoneyKey = (value: unknown): string => {
  const amount = finiteMoneyOrNull(value);
  return amount == null ? "" : String(Math.round(amount * 100));
};

const payoutRecordCanonicalCommissionCode = (
  value: string | null | undefined
): string => {
  const aliases = commissionCodeAliases(value);
  return aliases[0] ?? normalizeCommissionCodeKey(value);
};

const payoutRecordStatementKey = (record: ContractCommissionPayoutRecord): string =>
  record.statementId ||
  [
    record.statementNumber ?? "",
    record.statementPeriod ?? "",
    record.statementDate ?? "",
  ].join("|");

const payoutRecordSemanticKey = (
  record: ContractCommissionPayoutRecord
): string =>
  [
    payoutRecordStatementKey(record),
    normalizeEmail(record.writtenBy),
    payoutRecordCanonicalCommissionCode(record.code),
    record.status ?? "",
    payoutRecordMoneyKey(record.amount),
    normalizeText(record.career, 24) ?? "",
  ].join("::");

const payoutRecordCompletenessScore = (
  record: ContractCommissionPayoutRecord
): number => {
  let score = 0;
  if (record.statementId) score += 20;
  if (record.statementChronologyMs != null) score += 8;
  if (record.statementNumber) score += 4;
  if (record.statementPeriod) score += 4;
  if (record.statementDate) score += 4;
  if (record.expectedAmount != null) score += 4;
  if (record.difference != null) score += 3;
  if (record.differenceReason) score += 4;
  if (record.career) score += 2;
  if (record.detail) score += 2;
  if (record.title) score += 1;
  return score + (record.writtenAtMs ?? 0) / 1_000_000_000_000;
};

const mergePayoutRecordsByKey = (
  existing: ContractCommissionPayoutRecord[],
  incoming: ContractCommissionPayoutRecord[],
  maxCount: number
): {
  merged: ContractCommissionPayoutRecord[];
  added: number;
  existingCount: number;
  updatedExisting: number;
} => {
  const recordsBySemanticKey = new Map<string, ContractCommissionPayoutRecord>();
  const order: string[] = [];
  let updatedExisting = 0;

  for (const item of existing) {
    const semanticKey = payoutRecordSemanticKey(item) || item.key;
    const current = recordsBySemanticKey.get(semanticKey);
    if (!current) {
      recordsBySemanticKey.set(semanticKey, item);
      order.push(semanticKey);
      continue;
    }
    updatedExisting += 1;
    if (payoutRecordCompletenessScore(item) > payoutRecordCompletenessScore(current)) {
      recordsBySemanticKey.set(semanticKey, item);
    }
  }

  let added = 0;
  let existingCount = 0;
  for (const item of incoming) {
    const semanticKey = payoutRecordSemanticKey(item) || item.key;
    const previous = recordsBySemanticKey.get(semanticKey);
    if (!previous) {
      recordsBySemanticKey.set(semanticKey, item);
      order.push(semanticKey);
      added += 1;
      continue;
    }

    existingCount += 1;
    if (payoutRecordNeedsRefresh(previous, item)) {
      recordsBySemanticKey.set(semanticKey, {
        ...item,
        writtenAtMs: previous.writtenAtMs ?? item.writtenAtMs,
        writtenBy: previous.writtenBy ?? item.writtenBy,
      });
      updatedExisting += 1;
    }
  }

  const merged = order
    .map((key) => recordsBySemanticKey.get(key))
    .filter((item): item is ContractCommissionPayoutRecord => Boolean(item))
    .sort((a, b) => (a.writtenAtMs ?? 0) - (b.writtenAtMs ?? 0))
    .slice(-maxCount);
  return { merged, added, existingCount, updatedExisting };
};

const isTotalCommissionItem = (item: CommissionResultItemDTO): boolean => {
  const code = normalizeCommissionCodeKey(item.code);
  return code === "TOTAL" || normalizeCommissionTitle(item.title).includes("celkem");
};

const commissionItemCodeMatchesStatementCode = (
  itemCode: string | null | undefined,
  rowCode: string
): boolean => {
  const code = baseCommissionCodeForStatementComparison(itemCode);
  const comparableRowCode = baseCommissionCodeForStatementComparison(rowCode);
  if (!code || !comparableRowCode) return false;
  if (code === comparableRowCode) return true;
  const rangeMatch = code.match(/^([A-Z]+)(\d+)-([A-Z]+)(\d+)$/);
  const rowMatch = comparableRowCode.match(/^([A-Z]+)(\d+)$/);
  if (rangeMatch && rowMatch && rangeMatch[1] === rangeMatch[3]) {
    const [, prefix, startRaw, , endRaw] = rangeMatch;
    const [, rowPrefix, rowNumberRaw] = rowMatch;
    const start = Number(startRaw);
    const end = Number(endRaw);
    const rowNumber = Number(rowNumberRaw);
    if (
      prefix === rowPrefix &&
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      Number.isFinite(rowNumber) &&
      rowNumber >= start &&
      rowNumber <= end
    ) {
      return true;
    }
  }
  if (/^[A-Z]+$/.test(code) && rowMatch) {
    return rowMatch[1] === code;
  }
  if (/^B10[1-4]$/.test(comparableRowCode)) return code === "B101-B104";
  if (/^B20[1-6]$/.test(comparableRowCode)) return code === "B201-B206";
  return false;
};

const amountFromCommissionItems = (
  items: CommissionResultItemDTO[],
  rowCode: string,
  predicate: (title: string) => boolean
): number | null => {
  const cleanItems = items.filter((item) => !isTotalCommissionItem(item));
  const exactMatches = cleanItems
    .filter((item) => commissionItemCodeMatchesStatementCode(item.code, rowCode))
    .map((item) => finiteMoneyOrNull(item.amount))
    .filter((amount): amount is number => amount != null);
  if (exactMatches.length > 0) {
    return Math.round(exactMatches.reduce((sum, amount) => sum + amount, 0) * 100) / 100;
  }

  for (const item of cleanItems) {
    const title = normalizeCommissionTitle(item.title);
    if (!predicate(title)) continue;
    const amount = finiteMoneyOrNull(item.amount);
    if (amount != null) return amount;
  }
  return null;
};

const amountFromContractItems = (
  contract: ContractDoc,
  rowCode: string,
  predicate: (title: string) => boolean
): number | null =>
  amountFromCommissionItems(Array.isArray(contract.items) ? contract.items : [], rowCode, predicate);

const managerOverrideForViewer = (
  contract: ContractDoc,
  viewerEmail: string | null | undefined
): {
  email?: string | null;
  position?: Position | null;
  commissionMode?: string | null;
  items?: CommissionResultItemDTO[] | null;
} | null => {
  const overrides = Array.isArray(contract.managerOverrides) ? contract.managerOverrides : [];
  if (overrides.length === 0) return null;

  const normalizedViewerEmail = normalizeEmail(viewerEmail);
  if (normalizedViewerEmail) {
    const exactMatch = overrides.find(
      (override) => normalizeEmail(override?.email) === normalizedViewerEmail
    );
    if (exactMatch) return exactMatch;
  }

  return overrides.length === 1 ? overrides[0] ?? null : null;
};

const managerOverrideItemsForViewer = (
  contract: ContractDoc,
  viewerEmail: string | null | undefined
): CommissionResultItemDTO[] => {
  const override = managerOverrideForViewer(contract, viewerEmail);
  return Array.isArray(override?.items) ? (override.items as CommissionResultItemDTO[]) : [];
};

const expectedAutoSubsequentPayoutAmountForRow = (
  contract: ContractDoc,
  row: CommissionStatementPayoutRow
): number | null => {
  if (row.source !== "own" || !isAutoSubsequentCommissionCode(row.commissionCode)) {
    return null;
  }
  const productKey = contract.productKey;
  if (!productKey || !isAutoProduct(productKey)) return null;
  const rowProductKey = autoProductKeyFromStatementCode(row.productCode);
  if (rowProductKey !== productKey) return null;
  const position = normalizePositionValue(contract.position);
  if (!position) return null;
  const rowBase = finiteMoneyOrNull(row.baseAmount);
  if (rowBase == null || rowBase <= 0) return null;
  const signedDateIso = contractSignedDateIso(contract);
  const coefficientSet = effectiveCoefficientSetForContract(contract, signedDateIso);
  const coefficientSignedDateIso = signedDateForCoefficientSetOverride({
    product: productKey,
    contractSignedDateIso: signedDateIso,
    coefficientSetOverride: coefficientSet,
  });
  const coefficient = autoSubsequentCoefficientForProduct(
    productKey,
    position,
    coefficientSignedDateIso
  );
  return coefficient == null ? null : Math.round(rowBase * coefficient * 100) / 100;
};

const expectedPayoutAmountForRow = (
  contract: ContractDoc,
  row: CommissionStatementPayoutRow,
  viewerEmail: string | null | undefined
): number | null => {
  const code = normalizeCommissionCodeKey(row.commissionCode);
  const comparableCode = baseCommissionCodeForStatementComparison(code);
  const sourceItems =
    row.source === "manager"
      ? managerOverrideItemsForViewer(contract, viewerEmail)
      : Array.isArray(contract.items)
        ? contract.items
        : [];
  if (row.source === "manager" && sourceItems.length === 0) return null;
  const amountFromItems = (predicate: (title: string) => boolean) =>
    row.source === "manager"
      ? amountFromCommissionItems(sourceItems, comparableCode, predicate)
      : amountFromContractItems(contract, comparableCode, predicate);

  const autoSubsequentExpected = expectedAutoSubsequentPayoutAmountForRow(contract, row);
  if (autoSubsequentExpected != null) return autoSubsequentExpected;

  if (/^A\d+$/.test(comparableCode) || /^AC\d+/.test(comparableCode)) {
    return amountFromItems((title) =>
      title === "provize a101" ||
      title.includes("okamzita provize") ||
      title.includes("ziskatelska provize")
    );
  }
  if (/^BC\d+/.test(code)) {
    return amountFromItems(
      (title) => title.includes("nasledna provize") || title.includes("provize za rok")
    );
  }
  if (code === "B0301") {
    return amountFromItems((title) => title === "provize b0301");
  }
  if (code === "B3601_HALF" || code === "B36_HALF" || code === "B036_HALF") {
    return amountFromItems(
      (title) =>
        title.includes("50") &&
        (title.includes("b3601") || title.includes("b036") || title.includes("b36"))
    );
  }
  if (code === "B3601" || code === "B36" || code === "B036") {
    return amountFromItems(
      (title) =>
        title.includes("po 3 letech") ||
        (!title.includes("50") &&
          (title.includes("b3601") || title.includes("b036") || title.includes("b36")))
    );
  }
  if (code === "B4801" || code === "B48" || code === "B048") {
    return amountFromItems((title) => title.includes("po 4 letech"));
  }
  if (/^B10[1-4]$/.test(code)) {
    return amountFromItems(
      (title) =>
        title.includes("nasledna provize") &&
        ((title.includes("2") && title.includes("5")) || !title.includes("od 6"))
    );
  }
  if (/^B20[1-6]$/.test(code)) {
    return amountFromItems(
      (title) =>
        title.includes("pecovatelska provize") ||
        (title.includes("nasledna provize") && title.includes("od 6"))
    );
  }
  if (/^B\d+$/.test(code)) {
    return amountFromItems(
      (title) => title.includes("nasledna provize") || title.includes("provize za rok")
    );
  }

  return null;
};

const normalizePositionValue = (value: unknown): Position | null =>
  typeof value === "string" && POSITION_SET.has(value) ? (value as Position) : null;

const positionLabel = (position: Position | null | undefined): string => {
  if (!position) return "—";
  const advisorMatch = position.match(/^poradce(\d+)$/);
  if (advisorMatch) return `Poradce ${advisorMatch[1]}`;
  const managerMatch = position.match(/^manazer(\d+)$/);
  if (managerMatch) return `Manažer ${managerMatch[1]}`;
  return position;
};

type StatementCareerPosition = {
  raw: string;
  code: number;
  position: Position;
};

const statementCareerPositionFromValue = (
  value: string | null | undefined
): StatementCareerPosition | null => {
  const raw = normalizeText(value, 24);
  if (!raw) return null;
  const match = raw.match(/\d+/);
  if (!match) return null;
  const code = Number(match[0]);
  if (!Number.isFinite(code)) return null;

  const candidate =
    code >= 1 && code <= 10
      ? `poradce${code}`
      : code >= 104 && code <= 110
        ? `manazer${code - 100}`
        : null;
  const position = normalizePositionValue(candidate);
  return position ? { raw, code, position } : null;
};

const statementCareerPositionLabel = (
  career: StatementCareerPosition | null
): string =>
  career ? `${career.raw} (${positionLabel(career.position)})` : "—";

const normalizeCommissionModeValue = (value: unknown): CommissionMode =>
  value === "accelerated" || value === "standard" ? value : "standard";

const normalizePaymentFrequencyValue = (value: unknown): PaymentFrequency =>
  value === "monthly" ||
  value === "quarterly" ||
  value === "semiannual" ||
  value === "annual"
    ? value
    : "annual";

const contractSignedDateIso = (contract: ContractDoc): string | null => {
  const ms = toMillis(contract.contractSignedDate);
  return ms == null ? null : isoDateFromMs(ms);
};

const effectiveCoefficientSetForContract = (
  contract: ContractDoc,
  signedDateIso: string | null
): CommissionCoefficientSet | null =>
  normalizeCommissionCoefficientSet(contract.commissionCoefficientSetOverride) ??
  (contract.productKey === "neon"
    ? normalizeCommissionCoefficientSet(contract.neonCoefficientSetOverride)
    : null) ??
  defaultCoefficientSetForProduct(contract.productKey, signedDateIso);

const expectedNeonAmountFromItems = (
  items: CommissionResultItemDTO[],
  rowCode: string
): number | null => {
  const code = normalizeCommissionCodeKey(rowCode);
  const comparableCode = baseCommissionCodeForStatementComparison(code);
  if (comparableCode === "A101") {
    return amountFromCommissionItems(
      items,
      "A101",
      (title) => title === "provize a101" || title.includes("okamzita provize")
    );
  }
  if (comparableCode === "B0301") {
    return amountFromCommissionItems(items, "B0301", (title) => title === "provize b0301");
  }
  return null;
};

const isNeonRefreshMissingOriginalInSystem = (contract: ContractDoc): boolean =>
  contract.productKey === "neon" &&
  contract.isRefresh === true &&
  contract.commissionBaseSource !== "commission_statement" &&
  contract.commissionCalculationStatus !== "statement_resolved_refresh_missing_original" &&
  (contract.refreshOriginalMissingInSystem === true ||
    contract.requiresStatementRefresh === true ||
    contract.commissionCalculationStatus === "provisional_refresh_missing_original");

type NeonRefreshMissingOriginalStatementUpdate = {
  statementAnnualPremiumBase: number;
  statementMonthlyPremiumBase: number;
  coefficientSet: CommissionCoefficientSet;
  items: CommissionResultItemDTO[];
  total: number;
  managerOverrides: NonNullable<ContractDoc["managerOverrides"]>;
};

const statementAnnualBaseForNeonRefresh = (
  payoutRows: CommissionStatementPayoutRow[]
): number | null => {
  const bases = payoutRows
    .filter((row) => {
      if (row.source !== "own") return false;
      return isNeonInitialCommissionCode(row.commissionCode);
    })
    .map((row) => finiteMoneyOrNull(row.baseAmount))
    .filter((base): base is number => base != null && base > 0);

  if (bases.length === 0) return null;
  const first = bases[0];
  const hasConflictingBase = bases.some(
    (base) => Math.abs(base - first) > PREMIUM_CHANGE_TOLERANCE
  );
  if (hasConflictingBase) return null;
  return first;
};

const buildNeonRefreshMissingOriginalStatementUpdate = ({
  contract,
  payoutRows,
  coefficientSetOverride,
  allowStatementMarkedRefresh = false,
}: {
  contract: ContractDoc;
  payoutRows: CommissionStatementPayoutRow[];
  coefficientSetOverride: CommissionCoefficientSet | null;
  allowStatementMarkedRefresh?: boolean;
}): NeonRefreshMissingOriginalStatementUpdate | null => {
  const productKey = contract.productKey;
  if (productKey !== "neon") return null;

  const hasRefreshStatementRows = payoutRows.some((row) =>
    isNeonRefreshStatementProductCode(row.productCode)
  );
  if (
    !isNeonRefreshMissingOriginalInSystem(contract) &&
    !(allowStatementMarkedRefresh && hasRefreshStatementRows)
  ) {
    return null;
  }

  const statementAnnualPremiumBase = statementAnnualBaseForNeonRefresh(payoutRows);
  if (statementAnnualPremiumBase == null || statementAnnualPremiumBase <= 0) {
    return null;
  }

  const signedDateIso = contractSignedDateIso(contract);
  const coefficientSet =
    coefficientSetOverride ??
    effectiveCoefficientSetForContract(contract, signedDateIso);
  if (coefficientSet !== "historical" && coefficientSet !== "current") {
    return null;
  }

  const statementMonthlyPremiumBase = Math.round((statementAnnualPremiumBase / 12) * 100) / 100;
  const position = normalizePositionValue(contract.position);
  if (!position) return null;
  const commissionMode = normalizeCommissionModeValue(contract.commissionMode);
  const frequencyRaw = normalizePaymentFrequencyValue(contract.frequencyRaw);
  const durationYears =
    typeof contract.durationYears === "number" && Number.isFinite(contract.durationYears)
      ? contract.durationYears
      : null;
  const result = calculateResultForCoefficientSet({
    productKey,
    amount: statementMonthlyPremiumBase,
    frequencyRaw,
    position,
    commissionMode,
    signedDateIso,
    coefficientSet,
    durationYears,
  });
  if (!result) return null;

  return {
    statementAnnualPremiumBase,
    statementMonthlyPremiumBase,
    coefficientSet,
    items: result.items,
    total: result.total,
    managerOverrides: recomputeManagerOverridesForCoefficientSet({
      contract,
      adviserPosition: position,
      adviserMode: commissionMode,
      signedDateIso,
      coefficientSet,
      premium: statementMonthlyPremiumBase,
      frequencyRaw,
      durationYears,
    }),
  };
};

const stripTotalCommissionRows = (
  items: CommissionResultItemDTO[] = []
): CommissionResultItemDTO[] => items.filter((item) => !isTotalCommissionItem(item));

const commissionItemDiffKey = (item: CommissionResultItemDTO): string => {
  const code = normalizeCommissionCodeKey(item.code);
  return code ? `code:${code}` : normalizeCommissionTitle(item.title);
};

const buildCommissionDiffItems = (
  managerItems: CommissionResultItemDTO[],
  baselineItems: CommissionResultItemDTO[]
): CommissionResultItemDTO[] => {
  const managerMap = new Map<
    string,
    {
      title: string;
      amount: number;
      code?: string | null;
      note?: string | null;
      excludeFromTotal?: boolean;
    }
  >();
  stripTotalCommissionRows(managerItems).forEach((item) => {
    const key = commissionItemDiffKey(item);
    const prev = managerMap.get(key);
    managerMap.set(key, {
      title: item.title ?? prev?.title ?? key,
      amount: (prev?.amount ?? 0) + (finiteMoneyOrNull(item.amount) ?? 0),
      code: item.code ?? prev?.code ?? null,
      note: item.note ?? prev?.note ?? null,
      excludeFromTotal: Boolean(prev?.excludeFromTotal || item.excludeFromTotal),
    });
  });

  const diffItems: CommissionResultItemDTO[] = [];
  stripTotalCommissionRows(baselineItems).forEach((item) => {
    const key = commissionItemDiffKey(item);
    const managerValue = managerMap.get(key);
    const remaining =
      (managerValue?.amount ?? 0) - (finiteMoneyOrNull(item.amount) ?? 0);
    if (remaining > 0) {
      diffItems.push({
        title: managerValue?.title ?? item.title,
        amount: Math.round(remaining * 100) / 100,
        code: managerValue?.code ?? item.code ?? null,
        ...(managerValue?.excludeFromTotal || item.excludeFromTotal
          ? { excludeFromTotal: true }
          : {}),
        ...(managerValue?.note || item.note
          ? { note: managerValue?.note ?? item.note }
          : {}),
      });
    }
    managerMap.delete(key);
  });

  managerMap.forEach((value) => {
    if (value.amount > 0) {
      diffItems.push({
        title: value.title,
        amount: Math.round(value.amount * 100) / 100,
        code: value.code ?? null,
        ...(value.excludeFromTotal ? { excludeFromTotal: true } : {}),
        ...(value.note ? { note: value.note } : {}),
      });
    }
  });

  return diffItems;
};

const calculateResultForCoefficientSet = ({
  productKey,
  amount,
  frequencyRaw,
  position,
  commissionMode,
  signedDateIso,
  coefficientSet,
  durationYears,
}: {
  productKey: Product;
  amount: number;
  frequencyRaw: PaymentFrequency;
  position: Position;
  commissionMode: CommissionMode;
  signedDateIso: string | null;
  coefficientSet: CommissionCoefficientSet;
  durationYears: number | null;
}): { items: CommissionResultItemDTO[]; total: number } | null => {
  const coefficientSignedDateIso = signedDateForCoefficientSetOverride({
    product: productKey,
    contractSignedDateIso: signedDateIso,
    coefficientSetOverride: coefficientSet,
  });

  switch (productKey) {
    case "neon": {
      if (coefficientSet !== "historical" && coefficientSet !== "current") return null;
      const years = normalizeNeonDurationYears(durationYears, signedDateIso, coefficientSet);
      return calculateNeon(
        amount,
        position,
        years,
        commissionMode,
        signedDateIso,
        coefficientSet
      );
    }
    case "cppAuto":
      return calculateCppAuto(amount, frequencyRaw, position, coefficientSignedDateIso);
    case "allianzAuto":
      return calculateAllianzAuto(amount, frequencyRaw, position, coefficientSignedDateIso);
    case "csobAuto":
      return calculateCsobAuto(amount, frequencyRaw, position, coefficientSignedDateIso);
    case "uniqaAuto":
      return calculateUniqaAuto(amount, frequencyRaw, position, coefficientSignedDateIso);
    case "uniqaflotila":
      return calculateUniqaFlotila(amount, frequencyRaw, position, coefficientSignedDateIso);
    case "pillowAuto":
      return calculatePillowAuto(amount, frequencyRaw, position, coefficientSignedDateIso);
    case "slaviaauto":
      return calculateSlaviaAuto(amount, frequencyRaw, position);
    case "slaviaflotila":
      return calculateSlaviaFlotila(amount, frequencyRaw, position);
    case "kooperativaAuto":
      return calculateKooperativaAuto(
        amount,
        frequencyRaw,
        position,
        coefficientSignedDateIso
      );
    case "koopflotila":
      return calculateKoopFlotila(amount, frequencyRaw, position);
    default:
      return null;
  }
};

const recomputeManagerOverridesForCoefficientSet = ({
  contract,
  adviserPosition,
  adviserMode,
  signedDateIso,
  coefficientSet,
  premium,
  frequencyRaw,
  durationYears,
}: {
  contract: ContractDoc;
  adviserPosition: Position;
  adviserMode: CommissionMode;
  signedDateIso: string | null;
  coefficientSet: CommissionCoefficientSet;
  premium: number;
  frequencyRaw: PaymentFrequency;
  durationYears: number | null;
}): NonNullable<ContractDoc["managerOverrides"]> => {
  const productKey = contract.productKey;
  if (!productKey) return [];
  const managerChain = Array.isArray(contract.managerChain) ? contract.managerChain : [];
  const overrides: NonNullable<ContractDoc["managerOverrides"]> = [];
  let childPositionForBaseline: Position | null = adviserPosition;

  for (const manager of managerChain) {
    const managerPosition = normalizePositionValue(manager?.position);
    if (!managerPosition) continue;
    const managerMode = normalizeCommissionModeValue(manager?.commissionMode ?? adviserMode);
    const managerResult = calculateResultForCoefficientSet({
      productKey,
      amount: premium,
      frequencyRaw,
      position: managerPosition,
      commissionMode: managerMode,
      signedDateIso,
      coefficientSet,
      durationYears,
    });
    const baselineResult = childPositionForBaseline
      ? calculateResultForCoefficientSet({
          productKey,
          amount: premium,
          frequencyRaw,
          position: childPositionForBaseline,
          commissionMode: managerMode,
          signedDateIso,
          coefficientSet,
          durationYears,
        })
      : null;
    if (!managerResult || !baselineResult) {
      childPositionForBaseline = managerPosition;
      continue;
    }

    const diffItems = buildCommissionDiffItems(managerResult.items, baselineResult.items);
    const total = Math.round(totalWithMultipliers(diffItems) * 100) / 100;
    if (diffItems.length > 0 && total > 0) {
      overrides.push({
        email: normalizeEmail(manager?.email) || null,
        position: managerPosition,
        commissionMode: managerMode,
        items: diffItems,
        total,
      });
    }

    childPositionForBaseline = managerPosition;
  }

  return overrides;
};

type CoefficientSetOverrideDetection = {
  coefficientSet: CommissionCoefficientSet;
  items: CommissionResultItemDTO[];
  total: number;
  managerOverrides: NonNullable<ContractDoc["managerOverrides"]>;
  reason: string;
};

const closestAmount = (amounts: number[], statementAmount: number): number | null => {
  const validAmounts = amounts.filter((amount) => Number.isFinite(amount));
  if (validAmounts.length === 0) return null;
  return validAmounts.reduce((closest, amount) =>
    Math.abs(amount - statementAmount) < Math.abs(closest - statementAmount)
      ? amount
      : closest
  );
};

const expectedAutoAmountFromItems = (
  items: CommissionResultItemDTO[],
  rowCode: string,
  statementAmount: number,
  frequencyRaw: PaymentFrequency
): number | null => {
  const code = normalizeCommissionCodeKey(rowCode);
  const periods = periodsPerYear(frequencyRaw);
  const wantsSubsequent = isAutoSubsequentCommissionCode(code);
  const candidates = stripTotalCommissionRows(items).flatMap((item) => {
    const title = normalizeCommissionTitle(item.title);
    const amount = finiteMoneyOrNull(item.amount);
    if (amount == null) return [];

    const isClosing =
      title.includes("okamzita") ||
      title.includes("ziskatelska") ||
      title.includes("uzavreni");
    const isAnnual =
      title.includes("provize za rok") ||
      title.includes("celkem za rok") ||
      title.includes("za rok");
    const isSubsequent = title.includes("nasledna");

    if (wantsSubsequent) {
      if (!isSubsequent && !isAnnual) return [];
    } else if (!isClosing && !isAnnual) {
      return [];
    }

    return periods > 1 && (isAnnual || isClosing || isSubsequent)
      ? [amount, amount / periods]
      : [amount];
  });

  return closestAmount(candidates, statementAmount);
};

const expectedAmountFromItemsForCoefficientRow = ({
  productKey,
  items,
  row,
  frequencyRaw,
  position,
  signedDateIso,
}: {
  productKey: Product;
  items: CommissionResultItemDTO[];
  row: CommissionStatementPayoutRow;
  frequencyRaw: PaymentFrequency;
  position: Position;
  signedDateIso: string | null;
}): number | null => {
  if (productKey === "neon") return expectedNeonAmountFromItems(items, row.commissionCode);
  if (isAutoProduct(productKey)) {
    const rowBase = finiteMoneyOrNull(row.baseAmount);
    const coefficient = autoSubsequentCoefficientForProduct(
      productKey,
      position,
      signedDateIso
    );
    if (
      rowBase != null &&
      rowBase > 0 &&
      coefficient != null &&
      isAutoSubsequentCommissionCode(row.commissionCode)
    ) {
      return Math.round(rowBase * coefficient * 100) / 100;
    }
    return expectedAutoAmountFromItems(
      items,
      row.commissionCode,
      row.commission,
      frequencyRaw
    );
  }
  return null;
};

const statementRowIsCoefficientCandidate = (
  contract: ContractDoc,
  row: CommissionStatementPayoutRow
): boolean => {
  if (row.source !== "own" || row.status !== "paid" || row.commission <= 0) return false;
  const productKey = contract.productKey;
  if (!productKey || !productSupportsCoefficientSetOverride(productKey)) return false;
  const rowProductKey = isAutoProduct(productKey)
    ? autoProductKeyFromStatementCode(row.productCode)
    : lifeProductKeyFromStatementCode(row.productCode);
  if (rowProductKey !== productKey) return false;
  if (finiteMoneyOrNull(row.baseAmount) == null) return false;

  const code = normalizeCommissionCodeKey(row.commissionCode);
  if (productKey === "neon") return isNeonInitialCommissionCode(code);
  if (isAutoProduct(productKey)) {
    return /^A\d+/.test(code) || /^AC\d+/.test(code) || isAutoSubsequentCommissionCode(code);
  }
  return false;
};

const rowCalculationPremiumForCoefficientSet = (
  productKey: Product,
  row: CommissionStatementPayoutRow
): number | null => {
  const rowBase = finiteMoneyOrNull(row.baseAmount);
  if (rowBase == null || rowBase <= 0) return null;
  return productKey === "neon" ? Math.round((rowBase / 12) * 100) / 100 : rowBase;
};

const contractCalculationPremiumForCoefficientSet = (
  contract: ContractDoc
): number | null => contractCurrentPremium(contract);

const detectCoefficientSetOverrideFromPayoutRows = (
  contract: ContractDoc,
  rows: CommissionStatementPayoutRow[]
): CoefficientSetOverrideDetection | null => {
  const productKey = contract.productKey;
  if (!productKey || !productSupportsCoefficientSetOverride(productKey)) return null;
  const position = normalizePositionValue(contract.position);
  if (!position) return null;
  const contractPremium = contractCalculationPremiumForCoefficientSet(contract);
  if (contractPremium == null || contractPremium <= 0) return null;
  const candidateRows = rows.filter((row) => statementRowIsCoefficientCandidate(contract, row));
  if (candidateRows.length === 0) return null;

  const signedDateIso = contractSignedDateIso(contract);
  const currentSet = effectiveCoefficientSetForContract(contract, signedDateIso);
  if (!currentSet) return null;
  const mode = normalizeCommissionModeValue(contract.commissionMode);
  const frequencyRaw = normalizePaymentFrequencyValue(contract.frequencyRaw);
  const rawDurationYears =
    typeof contract.durationYears === "number" && Number.isFinite(contract.durationYears)
      ? contract.durationYears
      : null;

  const matches = candidateCoefficientSetsForProduct(productKey).filter((set) =>
    candidateRows.every((row) => {
      const rowPremium = rowCalculationPremiumForCoefficientSet(productKey, row);
      if (rowPremium == null) return false;
      const result = calculateResultForCoefficientSet({
        productKey,
        amount: rowPremium,
        frequencyRaw,
        position,
        commissionMode: mode,
        signedDateIso,
        coefficientSet: set,
        durationYears: rawDurationYears,
      });
      if (!result) return false;
      const coefficientSignedDateIso = signedDateForCoefficientSetOverride({
        product: productKey,
        contractSignedDateIso: signedDateIso,
        coefficientSetOverride: set,
      });
      const expected = expectedAmountFromItemsForCoefficientRow({
        productKey,
        items: result.items,
        row,
        frequencyRaw,
        position,
        signedDateIso: coefficientSignedDateIso,
      });
      return (
        expected != null &&
        Math.abs(row.commission - expected) <= COMMISSION_DIFFERENCE_TOLERANCE
      );
    })
  );

  if (matches.length !== 1) return null;
  const coefficientSet = matches[0];
  if (coefficientSet === currentSet) return null;

  const result = calculateResultForCoefficientSet({
    productKey,
    amount: contractPremium,
    frequencyRaw,
    position,
    commissionMode: mode,
    signedDateIso,
    coefficientSet,
    durationYears: rawDurationYears,
  });
  if (!result) return null;
  const managerOverrides = recomputeManagerOverridesForCoefficientSet({
    contract,
    adviserPosition: position,
    adviserMode: mode,
    signedDateIso,
    coefficientSet,
    premium: contractPremium,
    frequencyRaw,
    durationYears: rawDurationYears,
  });

  return {
    coefficientSet,
    items: result.items,
    total: Math.round(result.total * 100) / 100,
    managerOverrides,
    reason: `statement_matched_${coefficientSet}_coefficients`,
  };
};

const payoutDifferenceToleranceForRow = (
  row: CommissionStatementPayoutRow
): number =>
  row.source === "manager"
    ? MANAGER_COMMISSION_DIFFERENCE_TOLERANCE
    : COMMISSION_DIFFERENCE_TOLERANCE;

const payoutDifferenceReasonForRow = ({
  row,
  contract,
  status,
  viewerEmail,
}: {
  row: CommissionStatementPayoutRow;
  contract: ContractDoc;
  status: ContractCommissionPayoutRecord["status"];
  viewerEmail: string | null | undefined;
}): ContractCommissionPayoutDifferenceReason | null => {
  if (status === "storno") return "storno";
  if (status !== "difference") return null;

  const statementCareer = statementCareerPositionFromValue(row.career);
  const referencePosition =
    row.source === "manager"
      ? normalizePositionValue(managerOverrideForViewer(contract, viewerEmail)?.position)
      : normalizePositionValue(contract.position);
  if (statementCareer && referencePosition && statementCareer.position !== referencePosition) {
    return "career_mismatch";
  }

  const productKey = contract.productKey;
  if (productKey === "neon" || (productKey && isAutoProduct(productKey))) {
    const statementPremium = rowCalculationPremiumForCoefficientSet(productKey, row);
    const systemPremium = contractCalculationPremiumForCoefficientSet(contract);
    if (
      statementPremium != null &&
      systemPremium != null &&
      Math.abs(statementPremium - systemPremium) > PREMIUM_CHANGE_TOLERANCE
    ) {
      return "premium_base_mismatch";
    }
  }

  return "commission_amount_mismatch";
};

const formatMoneyDetail = (value: number | null | undefined): string =>
  typeof value === "number" && Number.isFinite(value)
    ? `${value.toLocaleString("cs-CZ", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} Kč`
    : "—";

const formatSignedMoneyDetail = (value: number | null | undefined): string => {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${formatMoneyDetail(value)}`;
};

const buildStatementPayoutCorrectionInfoByRowKey = (
  rows: CommissionStatementPayoutRow[]
): Map<string, StatementPayoutCorrectionInfo> => {
  const corrections = new Map<string, StatementPayoutCorrectionInfo>();
  const deductions = rows.filter(
    (row) => row.status === "storno" && row.source === "own" && row.commission < 0
  );
  const usedReplacementKeys = new Set<string>();

  for (const deduction of deductions) {
    const replacement = rows.find(
      (row) => !usedReplacementKeys.has(row.rowKey) && payoutRowCanReplaceDeduction(row, deduction)
    );
    if (!replacement) continue;

    usedReplacementKeys.add(replacement.rowKey);
    const code =
      normalizeCommissionCodeKey(replacement.commissionCode) ||
      normalizeCommissionCodeKey(deduction.commissionCode) ||
      "položka";
    const careerChanged =
      normalizeText(replacement.career, 24) !== normalizeText(deduction.career, 24);

    corrections.set(deduction.rowKey, {
      detail: careerChanged
        ? `Součást opravného výpisu: odúčtování původní ${code} na Kar. ${deduction.career || "—"} a náhrada novou výplatou na Kar. ${replacement.career || "—"} (${formatMoneyDetail(replacement.commission)}).`
        : `Součást opravného výpisu: odúčtování původní ${code} a náhrada novou výplatou ${formatMoneyDetail(replacement.commission)}.`,
    });
    corrections.set(replacement.rowKey, {
      detail: careerChanged
        ? `Součást opravného výpisu: nová výplata ${code} na Kar. ${replacement.career || "—"} po odúčtování původní položky na Kar. ${deduction.career || "—"} (${formatMoneyDetail(deduction.commission)}).`
        : `Součást opravného výpisu: nová výplata ${code} po odúčtování původní položky ${formatMoneyDetail(deduction.commission)}.`,
    });
  }

  return corrections;
};

const payoutRecordDetail = ({
  row,
  contract,
  expectedAmount,
  signedAmount,
  difference,
  differenceReason,
  status,
  correctionInfo,
  viewerEmail,
}: {
  row: CommissionStatementPayoutRow;
  contract: ContractDoc;
  expectedAmount: number | null;
  signedAmount: number;
  difference: number | null;
  differenceReason: ContractCommissionPayoutDifferenceReason | null;
  status: ContractCommissionPayoutRecord["status"];
  correctionInfo?: StatementPayoutCorrectionInfo | null;
  viewerEmail: string | null | undefined;
}): string => {
  const code = normalizeCommissionCodeKey(row.commissionCode) || "položka";
  const statementCareer = statementCareerPositionFromValue(row.career);
  const referencePosition =
    row.source === "manager"
      ? normalizePositionValue(managerOverrideForViewer(contract, viewerEmail)?.position)
      : normalizePositionValue(contract.position);
  const referenceLabel = row.source === "manager" ? "meziprovize" : "smlouva";
  const parts: string[] = [];

  if (status === "storno") {
    parts.push(
      `${code}: odúčtování ve výpisu, částka ${formatMoneyDetail(-Math.abs(signedAmount))}.`
    );
  } else {
    parts.push(
      `${code}: vyplaceno ${formatMoneyDetail(Math.abs(signedAmount))}, systém ${formatMoneyDetail(expectedAmount)}, rozdíl ${formatSignedMoneyDetail(difference)}.`
    );
  }

  if (differenceReason === "career_mismatch") {
    parts.push("Důvod rozdílu: kariérní stupeň ve výpisu neodpovídá uložené smlouvě.");
  } else if (differenceReason === "premium_base_mismatch") {
    parts.push("Důvod rozdílu: výpis použil jinou základnu pojistného než systém.");
  } else if (differenceReason === "commission_amount_mismatch") {
    parts.push("Důvod rozdílu: nesedí samotná částka provize proti výpočtu systému.");
  }

  if (statementCareer && referencePosition) {
    if (statementCareer.position === referencePosition) {
      parts.push(
        `Kariérní stupeň sedí: výpis Kar. ${statementCareerPositionLabel(statementCareer)}, ${referenceLabel} ${positionLabel(referencePosition)}.`
      );
    } else {
      parts.push(
        `Kariérní nesoulad této položky: výpis Kar. ${statementCareerPositionLabel(statementCareer)}, ${referenceLabel} ${positionLabel(referencePosition)}.`
      );
    }
  } else if (statementCareer) {
    parts.push(
      `Výpis uvádí Kar. ${statementCareerPositionLabel(statementCareer)}, ale na smlouvě není uložený kariérní stupeň.`
    );
  } else if (referencePosition) {
    parts.push(
      `${referenceLabel} je uložená jako ${positionLabel(referencePosition)}, výpis u položky kariérní stupeň neuvádí.`
    );
  }

  const baseAmount = finiteMoneyOrNull(row.baseAmount);
  if (baseAmount != null && baseAmount > 0) {
    parts.push(`Základna výpisu ${formatMoneyDetail(baseAmount)}.`);
  }

  if (
    status === "difference" &&
    statementCareer &&
    referencePosition &&
    statementCareer.position !== referencePosition
  ) {
    parts.push("Priorita kontroly: prověřit kariérní stupeň u této konkrétní položky.");
  } else if (status === "difference") {
    parts.push("Priorita kontroly: prověřit rozdíl vyplacené částky této položky.");
  }

  if (correctionInfo?.detail) {
    parts.push(correctionInfo.detail);
  }

  return parts.join(" ");
};

const duplicatePayoutGroupKey = (
  row: CommissionStatementPayoutRow
): string | null => {
  if (row.status !== "paid" || row.commission <= 0) return null;
  const aliases = commissionCodeAliases(row.commissionCode).sort();
  if (aliases.length === 0) return null;
  return `${row.source}:${aliases.join("|")}`;
};

const filterDuplicateStatementPayoutRowsForContract = (
  rows: CommissionStatementPayoutRow[],
  contract: ContractDoc,
  viewerEmail: string
): CommissionStatementPayoutRow[] => {
  const groupedRows = new Map<string, CommissionStatementPayoutRow[]>();

  for (const row of rows) {
    const groupKey = duplicatePayoutGroupKey(row);
    if (!groupKey) continue;
    groupedRows.set(groupKey, [...(groupedRows.get(groupKey) ?? []), row]);
  }

  const keptRowsByGroupKey = new Map<string, Set<string>>();
  for (const [groupKey, group] of groupedRows.entries()) {
    if (group.length < 2) continue;

    const matchingRows = group.filter((row) => {
      const expectedAmount = expectedPayoutAmountForRow(contract, row, viewerEmail);
      if (expectedAmount == null) return false;
      const difference = Math.round((row.commission - expectedAmount) * 100) / 100;
      return Math.abs(difference) <= payoutDifferenceToleranceForRow(row);
    });

    if (matchingRows.length === 0 || matchingRows.length === group.length) continue;
    keptRowsByGroupKey.set(groupKey, new Set(matchingRows.map((row) => row.rowKey)));
  }

  if (keptRowsByGroupKey.size === 0) return rows;

  return rows.filter((row) => {
    const groupKey = duplicatePayoutGroupKey(row);
    if (!groupKey) return true;
    const keptRows = keptRowsByGroupKey.get(groupKey);
    return keptRows ? keptRows.has(row.rowKey) : true;
  });
};

const payoutRecordFromStatementRow = ({
  row,
  contract,
  statementId,
  statementNumber,
  statementPeriod,
  statementDate,
  statementChronologyMs,
  payoutMonthKey,
  nowMs,
  writtenBy,
  correctionInfo = null,
}: {
  row: CommissionStatementPayoutRow;
  contract: ContractDoc;
  statementId: string;
  statementNumber: string | null;
  statementPeriod: string | null;
  statementDate: string | null;
  statementChronologyMs: number | null;
  payoutMonthKey: string | null;
  nowMs: number;
  writtenBy: string;
  correctionInfo?: StatementPayoutCorrectionInfo | null;
}): ContractCommissionPayoutRecord => {
  const expectedAmount = expectedPayoutAmountForRow(contract, row, writtenBy);
  const signedAmount = Math.round(row.commission * 100) / 100;
  const absAmount = Math.round(Math.abs(signedAmount) * 100) / 100;
  const difference =
    expectedAmount == null
      ? null
      : Math.round((signedAmount - expectedAmount) * 100) / 100;
  const tolerance = payoutDifferenceToleranceForRow(row);
  const status =
    row.status === "storno"
      ? "storno"
      : difference != null && Math.abs(difference) > tolerance
        ? "difference"
        : "paid";
  const differenceReason = payoutDifferenceReasonForRow({
    row,
    contract,
    status,
    viewerEmail: writtenBy,
  });
  const detail = payoutRecordDetail({
    row,
    contract,
    expectedAmount,
    signedAmount,
    difference,
    differenceReason,
    status,
    correctionInfo,
    viewerEmail: writtenBy,
  });

  return {
    key: compactHash(`${statementId}:${row.rowKey}:${row.contractNumber}:${row.commissionCode}`, 32),
    code: row.commissionCode || null,
    title: [row.productCode, row.commissionCode].filter(Boolean).join(" · ") || null,
    amount: status === "storno" ? -absAmount : absAmount,
    expectedAmount,
    difference,
    differenceReason,
    career: row.career,
    detail,
    status,
    statementId,
    statementNumber,
    statementPeriod,
    statementDate,
    statementChronologyMs,
    payoutMonthKey,
    writtenAtMs: nowMs,
    writtenBy,
  };
};

const isoDateFromMs = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

const utcDayEndMs = (ms: number): number => {
  const date = new Date(ms);
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    23,
    59,
    59,
    999
  );
};

const addUtcMonthsClamped = (ms: number, months: number, endOfDay = false): number => {
  const date = new Date(ms);
  const firstOfTargetMonth = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1)
  );
  const lastDayOfTargetMonth = new Date(
    Date.UTC(
      firstOfTargetMonth.getUTCFullYear(),
      firstOfTargetMonth.getUTCMonth() + 1,
      0
    )
  ).getUTCDate();
  return Date.UTC(
    firstOfTargetMonth.getUTCFullYear(),
    firstOfTargetMonth.getUTCMonth(),
    Math.min(date.getUTCDate(), lastDayOfTargetMonth),
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0
  );
};

const anniversaryInStatementToleranceWindow = (
  policyStartMs: number,
  periodEndMs: number | null
): { anniversaryNumber: number; anniversaryDateMs: number } | null => {
  if (periodEndMs == null) return null;
  const policyStart = new Date(policyStartMs);
  if (Number.isNaN(policyStart.getTime())) return null;

  const end = utcDayEndMs(periodEndMs);

  for (let yearOffset = 1; yearOffset <= 80; yearOffset += 1) {
    const anniversaryDateMs = Date.UTC(
      policyStart.getUTCFullYear() + yearOffset,
      policyStart.getUTCMonth(),
      policyStart.getUTCDate()
    );
    const windowStart = addUtcMonthsClamped(
      anniversaryDateMs,
      -AUTO_PREMIUM_ANNIVERSARY_TOLERANCE_MONTHS
    );
    const windowEnd = addUtcMonthsClamped(
      anniversaryDateMs,
      AUTO_PREMIUM_ANNIVERSARY_TOLERANCE_MONTHS,
      true
    );
    if (end >= windowStart && end <= windowEnd) {
      return { anniversaryNumber: yearOffset, anniversaryDateMs };
    }
    if (end < windowStart) return null;
  }
  return null;
};

const premiumHistoryEntryFromStatementRow = ({
  row,
  contract,
  statementId,
  statementNumber,
  statementPeriod,
  statementDate,
  payoutMonthKey,
  periodEndMs,
  statementChronologyMs,
  nowMs,
  writtenBy,
  allowCurrentPremiumFallback = true,
}: {
  row: AutoPremiumStatementRow;
  contract: ContractDoc;
  statementId: string;
  statementNumber: string | null;
  statementPeriod: string | null;
  statementDate: string | null;
  payoutMonthKey: string | null;
  periodEndMs: number | null;
  statementChronologyMs: number | null;
  nowMs: number;
  writtenBy: string;
  allowCurrentPremiumFallback?: boolean;
}): ContractPremiumStatementHistoryEntry | null => {
  if (row.premiumKind === "life_increase") {
    if (contract.productKey !== row.productKey) return null;

    const annualDifference = Math.round(row.basePremium * 100) / 100;
    if (Math.abs(annualDifference) <= PREMIUM_CHANGE_TOLERANCE) return null;
    const monthlyDifference = Math.round((annualDifference / 12) * 100) / 100;

    const effectiveDateMs =
      parseCzechDate(row.validFrom) ??
      parseCzechDate(row.signedAt) ??
      periodEndMs ??
      toMillis(contract.policyStartDate) ??
      nowMs;
    const previousPremium = lifePremiumBeforeStatement(contract, effectiveDateMs, {
      allowCurrentFallback: allowCurrentPremiumFallback,
    });
    if (previousPremium == null || previousPremium <= 0) return null;

    const newPremium = Math.round((previousPremium + monthlyDifference) * 100) / 100;
    if (newPremium <= 0) return null;

    return {
      key: compactHash(
        [
          statementId,
          row.premiumKind,
          row.rowId,
          row.contractNumber,
          row.productCode,
          row.basePremium,
          row.validFrom ?? "",
        ].join(":"),
        32
      ),
      premiumKind: row.premiumKind,
      statementId,
      statementNumber,
      statementPeriod,
      statementDate,
      statementChronologyMs,
      payoutMonthKey,
      anniversaryNumber: 0,
      anniversaryDate: isoDateFromMs(effectiveDateMs),
      previousPremium,
      newPremium,
      difference: monthlyDifference,
      previousAnnualPremium: Math.round(previousPremium * 12 * 100) / 100,
      newAnnualPremium: Math.round(newPremium * 12 * 100) / 100,
      differenceAnnual: annualDifference,
      productCode: row.productCode,
      commissionCode: row.commissionCode || null,
      rowId: row.rowId,
      validFrom: row.validFrom,
      source: row.source,
      writtenAtMs: nowMs,
      writtenBy,
    };
  }

  if (!isAutoProduct(contract.productKey ?? null)) return null;
  if (!isAutoSubsequentCommissionCode(row.commissionCode)) return null;
  if (row.productKey && contract.productKey && row.productKey !== contract.productKey) return null;

  const policyStartMs = parseCzechDate(row.validFrom) ?? toMillis(contract.policyStartDate);
  if (policyStartMs == null) return null;

  const anniversary = anniversaryInStatementToleranceWindow(policyStartMs, periodEndMs);
  if (!anniversary) return null;

  const basePremiumPeriod = autoPremiumStatementBasePeriod(row.productKey ?? contract.productKey);
  const statementAnnualPremium = autoPremiumStatementAnnualBase(row, contract);
  const previousAnnualPremium = autoPremiumBeforeStatement(
    contract,
    anniversary.anniversaryDateMs,
    { allowCurrentFallback: allowCurrentPremiumFallback }
  );
  const annualDifference =
    previousAnnualPremium == null
      ? null
      : Math.round((statementAnnualPremium - previousAnnualPremium) * 100) / 100;
  if (annualDifference != null && Math.abs(annualDifference) <= PREMIUM_CHANGE_TOLERANCE) {
    return null;
  }

  return {
    key: compactHash(
      [
        statementId,
        row.rowId,
        row.contractNumber,
        row.productCode,
        row.commissionCode,
        row.basePremium,
        basePremiumPeriod,
        anniversary.anniversaryNumber,
      ].join(":"),
      32
    ),
    premiumKind: row.premiumKind,
    statementId,
    statementNumber,
    statementPeriod,
    statementDate,
    statementChronologyMs,
    payoutMonthKey,
    anniversaryNumber: anniversary.anniversaryNumber,
    anniversaryDate: isoDateFromMs(anniversary.anniversaryDateMs),
    previousPremium: previousAnnualPremium,
    newPremium: statementAnnualPremium,
    difference: annualDifference,
    previousAnnualPremium,
    newAnnualPremium: statementAnnualPremium,
    differenceAnnual: annualDifference,
    basePremiumPeriod,
    productCode: row.productCode,
    commissionCode: row.commissionCode || null,
    rowId: row.rowId,
    validFrom: row.validFrom,
    source: row.source,
    writtenAtMs: nowMs,
    writtenBy,
  };
};

type AccessibleContractResolution =
  | {
      status: "matched";
      ref: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>;
      ownerEmail: string;
      entryId: string;
      contract: ContractDoc;
    }
  | { status: "not_found" | "ambiguous" | "skipped"; contractNumber: string };

type AccessibleContractMatch = Extract<AccessibleContractResolution, { status: "matched" }>;

const contractEntryType = (contract: ContractDoc): string =>
  normalizeText(contract.entryType, 32)?.toLowerCase() ?? "contract";

const contractIsEndorsementEntry = (contract: ContractDoc): boolean =>
  contractEntryType(contract) === "endorsement" ||
  Boolean(
    normalizeText(contract.rootContractEntryId, 160) &&
      normalizeText(contract.parentContractEntryId, 160)
  );

const accessibleContractFamilyRootId = (match: AccessibleContractMatch): string => {
  const rootId = normalizeText(match.contract.rootContractEntryId, 160);
  if (rootId) return rootId;

  const parentId = normalizeText(match.contract.parentContractEntryId, 160);
  if (contractIsEndorsementEntry(match.contract) && parentId) return parentId;

  return match.entryId;
};

const accessibleContractFamilyKey = (match: AccessibleContractMatch): string =>
  `${normalizeEmail(match.ownerEmail)}::${accessibleContractFamilyRootId(match)}`;

const accessibleMatchesRepresentSingleFamily = (
  matches: AccessibleContractMatch[]
): boolean => {
  if (matches.length <= 1) return true;
  const keys = matches.map(accessibleContractFamilyKey);
  return keys.every(Boolean) && new Set(keys).size === 1;
};

const accessibleContractTimelineMs = (match: AccessibleContractMatch): number =>
  toMillis(match.contract.policyStartDate) ??
  toMillis(match.contract.contractSignedDate) ??
  toMillis(match.contract.createdAt) ??
  Number.POSITIVE_INFINITY;

const sortAccessibleContractTimeline = (
  matches: AccessibleContractMatch[]
): AccessibleContractMatch[] =>
  [...matches].sort((left, right) => {
    const dateDiff = accessibleContractTimelineMs(left) - accessibleContractTimelineMs(right);
    if (dateDiff !== 0) return dateDiff;
    const leftEndorsement = contractIsEndorsementEntry(left.contract) ? 1 : 0;
    const rightEndorsement = contractIsEndorsementEntry(right.contract) ? 1 : 0;
    if (leftEndorsement !== rightEndorsement) return leftEndorsement - rightEndorsement;
    return left.entryId.localeCompare(right.entryId, "cs");
  });

const contractResolutionMonthlyPremium = (contract: ContractDoc): number | null =>
  contractIsEndorsementEntry(contract)
    ? finiteMoneyOrNull(contract.newInputAmount) ??
      finiteMoneyOrNull(contract.effectiveInputAmount) ??
      finiteMoneyOrNull(contract.inputAmount)
    : contractCurrentPremium(contract);

const contractResolutionAnnualPremium = (contract: ContractDoc): number | null => {
  const monthlyPremium = contractResolutionMonthlyPremium(contract);
  return monthlyPremium != null && monthlyPremium > 0
    ? Math.round(monthlyPremium * 12 * 100) / 100
    : null;
};

const contractResolutionAnnualPremiumDelta = (contract: ContractDoc): number | null => {
  const candidates = [
    finiteMoneyOrNull(contract.premiumDelta),
    finiteMoneyOrNull(contract.premiumIncreaseAmount),
  ];

  for (const value of candidates) {
    if (value != null && Math.abs(value) > 0) {
      return Math.round(value * 12 * 100) / 100;
    }
  }

  return null;
};

const annualPremiumMatches = (
  left: number | null | undefined,
  right: number | null | undefined
): boolean => {
  const leftAmount = Number(left);
  const rightAmount = Number(right);
  return (
    Number.isFinite(leftAmount) &&
    Number.isFinite(rightAmount) &&
    Math.abs(leftAmount - rightAmount) <= PREMIUM_CHANGE_TOLERANCE
  );
};

const contractComparableText = (value: unknown): string =>
  normalizeStatementLabel(String(value ?? ""));

const contractDateIsoDay = (value: unknown): string => {
  const ms = toMillis(value);
  return ms == null ? "" : isoDateFromMs(ms);
};

const accessibleMatchEquivalentSignature = (match: AccessibleContractMatch): string => {
  if (contractIsEndorsementEntry(match.contract)) {
    return `${normalizeEmail(match.ownerEmail)}::entry::${match.entryId}`;
  }

  return [
    normalizeEmail(match.ownerEmail),
    normalizeContractNumber(match.contract.contractNumber ?? null) ?? "",
    match.contract.productKey ?? "",
    contractComparableText(match.contract.clientName),
    contractDateIsoDay(match.contract.contractSignedDate),
    contractDateIsoDay(match.contract.policyStartDate),
    contractResolutionAnnualPremium(match.contract) ?? 0,
    normalizePositionValue(match.contract.position) ?? "",
    normalizeCommissionModeValue(match.contract.commissionMode),
  ].join("::");
};

const accessibleMatchCompletenessScore = (match: AccessibleContractMatch): number => {
  const contract = match.contract;
  let score = 0;
  if (normalizeText(contract.entryType, 32)) score += 20;
  if (Number.isFinite(Number(contract.effectiveInputAmount))) score += 10;
  if (Number.isFinite(Number(contract.calculationInputAmount))) score += 8;
  if (contract.maxxContractDetailUrl) score += 5;
  if (contract.cppExtranetEntityId || contract.cppExtranetEntityTypeId) score += 5;
  if (Array.isArray(contract.items) && contract.items.length > 0) score += 3;
  const updatedTime =
    toMillis((contract as { updatedAt?: unknown }).updatedAt) ??
    toMillis(contract.createdAt) ??
    0;
  return score + updatedTime / 1_000_000_000_000;
};

const preferredAccessibleMatch = (
  matches: AccessibleContractMatch[]
): AccessibleContractMatch | null =>
  matches.reduce<AccessibleContractMatch | null>((best, match) => {
    if (!best) return match;
    return accessibleMatchCompletenessScore(match) > accessibleMatchCompletenessScore(best)
      ? match
      : best;
  }, null);

const accessibleMatchTechnicalDuplicateKey = (match: AccessibleContractMatch): string => {
  if (contractIsEndorsementEntry(match.contract)) return "";

  return [
    normalizeEmail(match.ownerEmail),
    normalizeContractNumber(match.contract.contractNumber ?? null) ?? "",
    match.contract.productKey ?? "",
    contractComparableText(match.contract.clientName),
    contractDateIsoDay(match.contract.contractSignedDate),
    contractDateIsoDay(match.contract.policyStartDate),
    contractResolutionAnnualPremium(match.contract) ?? 0,
  ].join("::");
};

const selectPreferredTechnicalDuplicateMatch = (
  matches: AccessibleContractMatch[]
): AccessibleContractMatch | null => {
  if (matches.length <= 1) return matches[0] ?? null;
  if (matches.some((match) => contractIsEndorsementEntry(match.contract))) return null;

  const keys = matches.map(accessibleMatchTechnicalDuplicateKey);
  if (!keys.every(Boolean) || new Set(keys).size !== 1) return null;

  return preferredAccessibleMatch(matches);
};

const dedupeEquivalentAccessibleMatches = (
  matches: AccessibleContractMatch[]
): AccessibleContractMatch[] => {
  const bySignature = new Map<string, AccessibleContractMatch>();
  const order: string[] = [];

  for (const match of matches) {
    const signature = accessibleMatchEquivalentSignature(match) || match.ref.path;
    const existing = bySignature.get(signature);
    if (!existing) {
      bySignature.set(signature, match);
      order.push(signature);
      continue;
    }

    bySignature.set(
      signature,
      accessibleMatchCompletenessScore(match) > accessibleMatchCompletenessScore(existing)
        ? match
        : existing
    );
  }

  return order
    .map((key) => bySignature.get(key))
    .filter((match): match is AccessibleContractMatch => Boolean(match));
};

const selectAccessibleContractFromSingleFamily = ({
  matches,
  payoutRows,
  premiumRows,
}: {
  matches: AccessibleContractMatch[];
  payoutRows: CommissionStatementPayoutRow[];
  premiumRows: AutoPremiumStatementRow[];
}): AccessibleContractMatch | null => {
  const timeline = sortAccessibleContractTimeline(matches);
  const originalMatches = timeline.filter((match) => !contractIsEndorsementEntry(match.contract));
  const endorsementMatches = timeline.filter((match) => contractIsEndorsementEntry(match.contract));

  const lifeIncreaseAnnualBase = premiumRows
    .filter((row) => row.premiumKind === "life_increase")
    .map((row) => row.basePremium)
    .find((base) => base > 0);
  if (lifeIncreaseAnnualBase != null && lifeIncreaseAnnualBase > 0) {
    const matchingEndorsement = endorsementMatches.find((match) =>
      annualPremiumMatches(
        Math.abs(contractResolutionAnnualPremiumDelta(match.contract) ?? 0),
        lifeIncreaseAnnualBase
      )
    );
    return matchingEndorsement ?? endorsementMatches[endorsementMatches.length - 1] ?? originalMatches[0] ?? timeline[0] ?? null;
  }

  const initialLifeAnnualBase = payoutRows
    .filter((row) => {
      const productKey = lifeProductKeyFromStatementCode(row.productCode);
      return productKey === "neon" && isNeonInitialCommissionCode(row.commissionCode);
    })
    .map((row) => row.baseAmount)
    .find((base): base is number => base != null && base > 0);
  if (initialLifeAnnualBase != null && initialLifeAnnualBase > 0) {
    const matchingOriginal = originalMatches.find((match) =>
      annualPremiumMatches(contractResolutionAnnualPremium(match.contract), initialLifeAnnualBase)
    );
    return matchingOriginal ?? originalMatches[0] ?? timeline[0] ?? null;
  }

  return originalMatches[0] ?? timeline[0] ?? null;
};

const resolveAccessibleContract = async ({
  contractNumber,
  viewerEmail,
  teamEmails,
  payoutRows = [],
  premiumRows = [],
}: {
  contractNumber: string;
  viewerEmail: string;
  teamEmails: string[];
  payoutRows?: CommissionStatementPayoutRow[];
  premiumRows?: AutoPremiumStatementRow[];
}): Promise<AccessibleContractResolution> => {
  const normalizedContractNumber = normalizeContractNumber(contractNumber);
  if (!normalizedContractNumber) return { status: "skipped", contractNumber };

  const allowedOwners = new Set([viewerEmail, ...teamEmails].map(normalizeEmail).filter(Boolean));
  const refs = await resolveEntryRefsByContractNumber(normalizedContractNumber);
  const matches: AccessibleContractMatch[] = [];

  for (const ref of refs) {
    const ownerEmail = normalizeEmail(ref.path.split("/")[1] ?? "");
    if (!ownerEmail || !allowedOwners.has(ownerEmail)) continue;

    const snap = await ref.get();
    if (!snap.exists) continue;
    const contract = (snap.data() ?? {}) as ContractDoc;
    if (normalizeContractNumber(contract.contractNumber ?? null) !== normalizedContractNumber) {
      continue;
    }
    if (!hasContractAccess({ viewerEmail, teamEmails, ownerEmail, contract })) continue;

    matches.push({
      status: "matched",
      ref,
      ownerEmail,
      entryId: ref.id,
      contract,
    });
  }

  const uniqueMatches = dedupeEquivalentAccessibleMatches(matches);
  if (uniqueMatches.length === 0) {
    return { status: "not_found", contractNumber: normalizedContractNumber };
  }
  if (uniqueMatches.length > 1) {
    const technicalDuplicateMatch = selectPreferredTechnicalDuplicateMatch(uniqueMatches);
    if (technicalDuplicateMatch) return technicalDuplicateMatch;

    if (!accessibleMatchesRepresentSingleFamily(uniqueMatches)) {
      return { status: "ambiguous", contractNumber: normalizedContractNumber };
    }
    const selectedMatch = selectAccessibleContractFromSingleFamily({
      matches: uniqueMatches,
      payoutRows,
      premiumRows,
    });
    return selectedMatch ?? { status: "ambiguous", contractNumber: normalizedContractNumber };
  }
  return uniqueMatches[0];
};

const processingPrivateCollection = (email: string, collection: string) =>
  adminDb!.collection("usersPrivate").doc(email).collection(collection);

const createProcessingBatchWriter = () => {
  let batch = adminDb!.batch();
  let ops = 0;

  const set = (
    ref: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>,
    data: FirebaseFirestore.DocumentData,
    options?: FirebaseFirestore.SetOptions
  ) => {
    if (options) {
      batch.set(ref, data, options);
    } else {
      batch.set(ref, data);
    }
    ops += 1;
  };

  const commit = async () => {
    if (ops === 0) return;
    await batch.commit();
    batch = adminDb!.batch();
    ops = 0;
  };

  return {
    set,
    commit,
  };
};

const processStatementWrites = async ({
  docId,
  docRef,
  html,
  ctxEmail,
  teamEmails,
  statementNumber,
  statementPeriod,
  statementDate,
  periodEndMs,
  statementChronologyMs,
  payoutMonthKey,
  nowMs,
}: {
  docId: string;
  docRef: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>;
  html: string;
  ctxEmail: string;
  teamEmails: string[];
  statementNumber: string | null;
  statementPeriod: string | null;
  statementDate: string | null;
  periodEndMs: number | null;
  statementChronologyMs: number | null;
  payoutMonthKey: string | null;
  nowMs: number;
}): Promise<ProcessingResult> => {
  const result = emptyProcessingResult();
  const payoutRows = extractCommissionPayoutRowsFromStoredHtml(html);
  const autoPremiumRows = extractAutoPremiumRowsFromStoredHtml(html);
  const lifePremiumIncreaseRows = extractLifePremiumIncreaseRowsFromStoredHtml(html);
  const premiumRows = [...autoPremiumRows, ...lifePremiumIncreaseRows];
  result.payoutRows = payoutRows.length;

  const payoutRowsByContract = new Map<string, CommissionStatementPayoutRow[]>();
  const premiumRowsByContract = new Map<string, AutoPremiumStatementRow[]>();
  for (const row of payoutRows) {
    const key = normalizeContractNumber(row.contractNumber);
    if (!key) continue;
    payoutRowsByContract.set(key, [...(payoutRowsByContract.get(key) ?? []), row]);
  }
  for (const row of premiumRows) {
    const key = normalizeContractNumber(row.contractNumber);
    if (!key) continue;
    premiumRowsByContract.set(key, [...(premiumRowsByContract.get(key) ?? []), row]);
  }

  const allContractNumbers = [...new Set([...payoutRowsByContract.keys(), ...premiumRowsByContract.keys()])];
  const batchWriter = createProcessingBatchWriter();
  const touchedContractPaths = new Set<string>();

  for (const contractNumber of allContractNumbers) {
    const contractPayoutRows = payoutRowsByContract.get(contractNumber) ?? [];
    const contractPremiumRows = premiumRowsByContract.get(contractNumber) ?? [];
    let resolution: AccessibleContractResolution;
    try {
      resolution = await resolveAccessibleContract({
        contractNumber,
        viewerEmail: ctxEmail,
        teamEmails,
        payoutRows: contractPayoutRows,
        premiumRows: contractPremiumRows,
      });
    } catch (error) {
      result.errors.push(`Smlouva ${contractNumber}: nepodařilo se dohledat (${String(error)})`);
      continue;
    }

    if (resolution.status === "not_found") {
      result.notFoundContracts.push(contractNumber);
      continue;
    }
    if (resolution.status === "ambiguous") {
      result.ambiguousContracts.push(contractNumber);
      continue;
    }
    if (resolution.status === "skipped") {
      result.skippedContracts.push(contractNumber);
      continue;
    }
    if (resolution.status !== "matched") continue;

    result.contractsMatched += 1;
    const contract = resolution.contract;
    const externalLinkPatch = statementExternalLinkPatch(
      [...contractPayoutRows, ...contractPremiumRows],
      contract
    );
    const hasExternalLinkPatch = Object.keys(externalLinkPatch).length > 0;
    const coefficientSetOverride = detectCoefficientSetOverrideFromPayoutRows(
      contract,
      contractPayoutRows
    );
    const neonRefreshMissingOriginalUpdate = buildNeonRefreshMissingOriginalStatementUpdate({
      contract,
      payoutRows: contractPayoutRows,
      coefficientSetOverride: coefficientSetOverride?.coefficientSet ?? null,
    });
    const neonRefreshCurrentMonthlyPremium =
      finiteMoneyOrNull(contract.effectiveInputAmount) ??
      finiteMoneyOrNull(contract.inputAmount);
    const neonRefreshPolicyStartMs = toMillis(contract.policyStartDate);
    const contractForPayoutExpectations: ContractDoc = neonRefreshMissingOriginalUpdate
      ? {
          ...contract,
          calculationInputAmount: neonRefreshMissingOriginalUpdate.statementMonthlyPremiumBase,
          refreshCommissionBase: {
            productKey: "neon",
            method: "cpp_neon_statement_refresh_missing_original",
            originalContractNumber: null,
            refreshPolicyStartDateIso:
              neonRefreshPolicyStartMs == null ? null : isoDateFromMs(neonRefreshPolicyStartMs),
            newMonthlyPremium: neonRefreshCurrentMonthlyPremium,
            newAnnualPremium:
              neonRefreshCurrentMonthlyPremium == null
                ? null
                : Math.round(neonRefreshCurrentMonthlyPremium * 12 * 100) / 100,
            calculationMonthlyPremium:
              neonRefreshMissingOriginalUpdate.statementMonthlyPremiumBase,
            calculationAnnualPremium:
              neonRefreshMissingOriginalUpdate.statementAnnualPremiumBase,
          },
          items: neonRefreshMissingOriginalUpdate.items,
          result: {
            items: neonRefreshMissingOriginalUpdate.items,
            total: neonRefreshMissingOriginalUpdate.total,
          },
          total: neonRefreshMissingOriginalUpdate.total,
          managerOverrides: neonRefreshMissingOriginalUpdate.managerOverrides,
        }
      : coefficientSetOverride
      ? {
          ...contract,
          commissionCoefficientSetOverride: coefficientSetOverride.coefficientSet,
          ...(contract.productKey === "neon" &&
          (coefficientSetOverride.coefficientSet === "historical" ||
            coefficientSetOverride.coefficientSet === "current")
            ? { neonCoefficientSetOverride: coefficientSetOverride.coefficientSet }
            : {}),
          items: coefficientSetOverride.items,
          result: {
            items: coefficientSetOverride.items,
            total: coefficientSetOverride.total,
          },
          total: coefficientSetOverride.total,
          managerOverrides: coefficientSetOverride.managerOverrides,
        }
      : contract;
    const filteredContractPayoutRows = filterDuplicateStatementPayoutRowsForContract(
      contractPayoutRows,
      contract,
      ctxEmail
    );
    result.duplicatePayoutRowsSkipped +=
      contractPayoutRows.length - filteredContractPayoutRows.length;
    const payoutRowsForRecords = coefficientSetOverride
      ? contractPayoutRows
      : filteredContractPayoutRows;
    const payoutCorrectionInfoByRowKey =
      buildStatementPayoutCorrectionInfoByRowKey(payoutRowsForRecords);
    const incomingPayouts = payoutRowsForRecords.map((row) =>
      payoutRecordFromStatementRow({
        row,
        contract: contractForPayoutExpectations,
        statementId: docId,
        statementNumber,
        statementPeriod,
        statementDate,
        statementChronologyMs,
        payoutMonthKey,
        nowMs,
        writtenBy: ctxEmail,
        correctionInfo: payoutCorrectionInfoByRowKey.get(row.rowKey) ?? null,
      })
    );
    const payoutMerge = mergePayoutRecordsByKey(
      contractPayoutArray(contract),
      incomingPayouts,
      MAX_STORED_CONTRACT_PAYOUTS
    );

    const existingPremiumHistory = contractPremiumHistoryArray(contract);
    const existingPremiumKeys = new Set(existingPremiumHistory.map((entry) => entry.key));
    const canApplyPremiumToCurrentContract = canApplyPremiumStatementToCurrentContract(
      contract,
      statementChronologyMs
    );
    const detectedPremiumHistoryEntries = contractPremiumRows
      .map((row) =>
        premiumHistoryEntryFromStatementRow({
          row,
          contract: contractForPayoutExpectations,
          statementId: docId,
          statementNumber,
          statementPeriod,
          statementDate,
          payoutMonthKey,
          periodEndMs,
          statementChronologyMs,
          nowMs,
          writtenBy: ctxEmail,
          allowCurrentPremiumFallback: canApplyPremiumToCurrentContract,
        })
      )
      .filter((entry): entry is ContractPremiumStatementHistoryEntry => Boolean(entry));
    const premiumHistoryEntries = detectedPremiumHistoryEntries;
    const premiumHistoryEntriesForMerge = premiumHistoryEntries;
    const premiumMerge = mergePremiumHistoryRecords(
      existingPremiumHistory,
      premiumHistoryEntriesForMerge,
      MAX_STORED_PREMIUM_HISTORY
    );
    const actionablePremiumHistoryEntries =
      canApplyPremiumToCurrentContract ? detectedPremiumHistoryEntries : [];
    const actionablePremiumAddedCount = actionablePremiumHistoryEntries.filter(
      (entry) => !existingPremiumKeys.has(entry.key)
    ).length;
    const backfilledPremiumAddedCount = canApplyPremiumToCurrentContract
      ? 0
      : detectedPremiumHistoryEntries.filter((entry) => !existingPremiumKeys.has(entry.key))
          .length;
    result.premiumHistoryBackfills += backfilledPremiumAddedCount;

    const updatePayload: Record<string, unknown> = {
      commissionPayouts: payoutMerge.merged,
      commissionStatementProcessedAtMs: nowMs,
      updatedAt: new Date(nowMs),
      ...externalLinkPatch,
    };
    if (coefficientSetOverride) {
      updatePayload.commissionCoefficientSetOverride = coefficientSetOverride.coefficientSet;
      updatePayload.commissionCoefficientSetOverrideSource = coefficientSetOverride.reason;
      updatePayload.commissionCoefficientSetOverrideStatementId = docId;
      updatePayload.commissionCoefficientSetOverrideStatementNumber = statementNumber;
      updatePayload.commissionCoefficientSetOverrideStatementPeriod = statementPeriod;
      updatePayload.commissionCoefficientSetOverrideAppliedAtMs = nowMs;
      updatePayload.commissionCoefficientSetOverrideAppliedBy = ctxEmail;
      if (
        contract.productKey === "neon" &&
        (coefficientSetOverride.coefficientSet === "historical" ||
          coefficientSetOverride.coefficientSet === "current")
      ) {
        updatePayload.neonCoefficientSetOverride = coefficientSetOverride.coefficientSet;
        updatePayload.neonCoefficientSetOverrideSource = coefficientSetOverride.reason;
        updatePayload.neonCoefficientSetOverrideStatementId = docId;
        updatePayload.neonCoefficientSetOverrideStatementNumber = statementNumber;
        updatePayload.neonCoefficientSetOverrideStatementPeriod = statementPeriod;
        updatePayload.neonCoefficientSetOverrideAppliedAtMs = nowMs;
        updatePayload.neonCoefficientSetOverrideAppliedBy = ctxEmail;
      }
      updatePayload.items = coefficientSetOverride.items;
      updatePayload.result = {
        items: coefficientSetOverride.items,
        total: coefficientSetOverride.total,
      };
      updatePayload.total = coefficientSetOverride.total;
      updatePayload.managerOverrides = coefficientSetOverride.managerOverrides;
    }
    if (neonRefreshMissingOriginalUpdate) {
      updatePayload.calculationInputAmount =
        neonRefreshMissingOriginalUpdate.statementMonthlyPremiumBase;
      updatePayload.refreshCommissionBase =
        contractForPayoutExpectations.refreshCommissionBase ?? null;
      updatePayload.items = neonRefreshMissingOriginalUpdate.items;
      updatePayload.result = {
        items: neonRefreshMissingOriginalUpdate.items,
        total: neonRefreshMissingOriginalUpdate.total,
      };
      updatePayload.total = neonRefreshMissingOriginalUpdate.total;
      updatePayload.managerOverrides = neonRefreshMissingOriginalUpdate.managerOverrides;
      updatePayload.requiresStatementRefresh = false;
      updatePayload.commissionCalculationStatus = "statement_resolved_refresh_missing_original";
      updatePayload.commissionBaseSource = "commission_statement";
      updatePayload.refreshStatementResolvedAtMs = nowMs;
      updatePayload.refreshStatementResolvedStatementId = docId;
      updatePayload.refreshStatementResolvedStatementNumber = statementNumber;
      updatePayload.refreshStatementResolvedStatementPeriod = statementPeriod;
    }
    const commissionStornoSummary = commissionStornoSummaryFromPayouts({
      payouts: payoutMerge.merged,
      nowMs,
      writtenBy: ctxEmail,
    });
    updatePayload.commissionStornoSummary = commissionStornoSummary;

    if (premiumMerge.added > 0 || premiumMerge.updatedExisting > 0) {
      updatePayload.premiumStatementHistory = premiumMerge.merged;
      const latestPremium = [...actionablePremiumHistoryEntries]
        .sort(
          (a, b) =>
            (premiumHistoryEntryDateMs(a) ?? 0) - (premiumHistoryEntryDateMs(b) ?? 0)
        )
        .at(-1);
      if (latestPremium) {
        updatePayload.premiumUpdatedFromStatementAtMs = nowMs;
        updatePayload.premiumUpdatedFromStatementChronologyMs = statementChronologyMs;
        updatePayload.premiumUpdatedFromStatementId = docId;
      }
    } else if (premiumMerge.merged.length > 0) {
      updatePayload.premiumStatementHistory = premiumMerge.merged;
    }

    const hasPayoutChanges =
      payoutMerge.added > 0 || payoutMerge.updatedExisting > 0;

    if (
      hasPayoutChanges ||
      premiumMerge.added > 0 ||
      premiumMerge.updatedExisting > 0 ||
      hasExternalLinkPatch ||
      coefficientSetOverride ||
      neonRefreshMissingOriginalUpdate
    ) {
      batchWriter.set(resolution.ref, updatePayload, { merge: true });
      touchedContractPaths.add(resolution.ref.path);
      result.contractsUpdated += 1;
      if (hasPayoutChanges) result.contractsWithPayoutChanges += 1;
      result.payoutRecordsAdded += payoutMerge.added;
      result.payoutRecordsExisting += payoutMerge.existingCount;
      result.payoutRecordsUpdated += payoutMerge.updatedExisting;
      if (coefficientSetOverride) result.coefficientOverridesApplied += 1;
      if (canApplyPremiumToCurrentContract) {
        result.premiumUpdates += actionablePremiumAddedCount;
      }
    } else {
      result.payoutRecordsExisting += payoutMerge.existingCount;
      result.payoutRecordsUpdated += payoutMerge.updatedExisting;
    }

    for (const payout of incomingPayouts) {
      if (payout.status !== "difference" || payout.difference == null) continue;
      const repairId = compactHash(`${docId}:commission-difference:${resolution.ref.path}:${payout.key}`, 32);
      batchWriter.set(
        processingPrivateCollection(ctxEmail, "accountingRepairDrafts").doc(repairId),
        {
          kind: "commission_difference",
          status: "draft",
          ownerEmail: resolution.ownerEmail,
          entryId: resolution.entryId,
          entryPath: resolution.ref.path,
          contractNumber,
          clientName: contract.clientName ?? null,
          productKey: contract.productKey ?? null,
          statementId: docId,
          statementNumber,
          statementPeriod,
          statementDate,
          payoutMonthKey,
          commissionCode: payout.code,
          paidAmount: payout.amount,
          expectedAmount: payout.expectedAmount,
          difference: payout.difference,
          correctionAmount: Math.round(((payout.expectedAmount ?? 0) - payout.amount) * 100) / 100,
          detail: payout.detail,
          createdAtMs: nowMs,
          createdBy: ctxEmail,
        },
        { merge: true }
      );
      result.accountingRepairDrafts += 1;
    }

    for (const premium of actionablePremiumHistoryEntries) {
      const isLifeIncrease = premium.premiumKind === "life_increase";
      const repairId = compactHash(`${docId}:premium:${resolution.ref.path}:${premium.key}`, 32);
      batchWriter.set(
        processingPrivateCollection(ctxEmail, "accountingRepairDrafts").doc(repairId),
        {
          kind: isLifeIncrease ? "life_premium_increase" : "auto_premium_change",
          status: "draft",
          ownerEmail: resolution.ownerEmail,
          entryId: resolution.entryId,
          entryPath: resolution.ref.path,
          contractNumber,
          clientName: contract.clientName ?? null,
          productKey: contract.productKey ?? null,
          statementId: docId,
          statementNumber,
          statementPeriod,
          statementDate,
          payoutMonthKey,
          previousPremium: premium.previousPremium,
          newPremium: premium.newPremium,
          difference: premium.difference,
          previousAnnualPremium: premium.previousAnnualPremium ?? null,
          newAnnualPremium: premium.newAnnualPremium ?? null,
          differenceAnnual: premium.differenceAnnual ?? null,
          anniversaryNumber: premium.anniversaryNumber,
          anniversaryDate: premium.anniversaryDate,
          createdAtMs: nowMs,
          createdBy: ctxEmail,
        },
        { merge: true }
      );
      result.accountingRepairDrafts += 1;

      const taskId = compactHash(`${docId}:external-premium:${resolution.ref.path}:${premium.key}`, 32);
      batchWriter.set(
        processingPrivateCollection(ctxEmail, "externalUpdateTasks").doc(taskId),
        {
          kind: isLifeIncrease ? "life_premium_increase_update" : "auto_premium_update",
          status: "pending_manual",
          targetSystems: [
            contract.maxxContractDetailUrl ? "MAXX" : "MAXX/manual",
            contract.cppExtranetEntityId || contract.cppExtranetEntityTypeId
              ? "CPP_EXTRANET"
              : "EXTRANET/manual",
          ],
          ownerEmail: resolution.ownerEmail,
          entryId: resolution.entryId,
          entryPath: resolution.ref.path,
          contractNumber,
          clientName: contract.clientName ?? null,
          productKey: contract.productKey ?? null,
          statementId: docId,
          statementNumber,
          statementPeriod,
          statementDate,
          previousPremium: premium.previousPremium,
          newPremium: premium.newPremium,
          difference: premium.difference,
          previousAnnualPremium: premium.previousAnnualPremium ?? null,
          newAnnualPremium: premium.newAnnualPremium ?? null,
          differenceAnnual: premium.differenceAnnual ?? null,
          maxxContractDetailUrl: contract.maxxContractDetailUrl ?? null,
          cppExtranetEntityTypeId: contract.cppExtranetEntityTypeId ?? null,
          cppExtranetEntityId: contract.cppExtranetEntityId ?? null,
          createdAtMs: nowMs,
          createdBy: ctxEmail,
        },
        { merge: true }
      );
      result.externalUpdateTasks += 1;
    }
  }

  batchWriter.set(
    docRef,
    {
      processedAtMs: nowMs,
      processedBy: ctxEmail,
      processingResult: {
        ...result,
        touchedContracts: touchedContractPaths.size,
      },
    },
    { merge: true }
  );
  await batchWriter.commit();

  return result;
};

const handleManualNeonRefreshConversion = async ({
  body,
  ctxEmail,
  teamEmails,
  withRateLimit,
}: {
  body: Record<string, unknown>;
  ctxEmail: string;
  teamEmails: string[];
  withRateLimit: (response: NextResponse) => NextResponse;
}) => {
  const statementId = safeStatementId(normalizeText(body.statementId, 80));
  const ownerEmail = normalizeEmail(body.ownerEmail);
  const entryId = normalizeText(body.entryId, 180);
  const contractNumber = normalizeContractNumber(normalizeText(body.contractNumber, 80));

  if (!statementId || !ownerEmail || !entryId || entryId.includes("/") || !contractNumber) {
    return withRateLimit(
      NextResponse.json(
        { ok: false, error: "Chybí údaje pro převod smlouvy na REFRESH." },
        { status: 400 }
      )
    );
  }

  const statementSnap = await statementCollection(ctxEmail).doc(statementId).get();
  if (!statementSnap.exists) {
    return withRateLimit(
      NextResponse.json({ ok: false, error: "Zpracovaný výpis nebyl nalezen." }, { status: 404 })
    );
  }

  const statementData = statementSnap.data() ?? {};
  const html = normalizeText(statementData.html, MAX_HTML_LENGTH);
  if (!html) {
    return withRateLimit(
      NextResponse.json(
        { ok: false, error: "U zpracovaného výpisu chybí uložený HTML obsah." },
        { status: 400 }
      )
    );
  }

  const entryRef = adminDb!
    .collection("users")
    .doc(ownerEmail)
    .collection("entries")
    .doc(entryId);
  const entrySnap = await entryRef.get();
  if (!entrySnap.exists) {
    return withRateLimit(
      NextResponse.json({ ok: false, error: "Smlouva v systému nebyla nalezena." }, { status: 404 })
    );
  }

  const contract = (entrySnap.data() ?? {}) as ContractDoc;
  if (!hasContractAccess({ viewerEmail: ctxEmail, teamEmails, ownerEmail, contract })) {
    return withRateLimit(
      NextResponse.json({ ok: false, error: "Nemáš oprávnění upravit tuto smlouvu." }, { status: 403 })
    );
  }

  if (normalizeContractNumber(contract.contractNumber ?? null) !== contractNumber) {
    return withRateLimit(
      NextResponse.json(
        { ok: false, error: "Vybraný záznam neodpovídá číslu smlouvy ve výpisu." },
        { status: 409 }
      )
    );
  }

  if (contract.productKey !== "neon") {
    return withRateLimit(
      NextResponse.json(
        { ok: false, error: "Na REFRESH z výpisu lze převést jen smlouvu ČPP ŽP NEON." },
        { status: 400 }
      )
    );
  }

  const payoutRows = extractCommissionPayoutRowsFromStoredHtml(html).filter(
    (row) =>
      row.status !== "storno" &&
      normalizeContractNumber(row.contractNumber) === contractNumber
  );
  const hasNrfRow = payoutRows.some((row) =>
    isNeonRefreshStatementProductCode(row.productCode)
  );
  if (!hasNrfRow) {
    return withRateLimit(
      NextResponse.json(
        { ok: false, error: "Ve výpisu pro tuto smlouvu není produktový kód REFRESH (CPP_NRF_LF)." },
        { status: 400 }
      )
    );
  }

  const coefficientSetOverride = detectCoefficientSetOverrideFromPayoutRows(contract, payoutRows);
  const refreshUpdate = buildNeonRefreshMissingOriginalStatementUpdate({
    contract,
    payoutRows,
    coefficientSetOverride: coefficientSetOverride?.coefficientSet ?? null,
    allowStatementMarkedRefresh: true,
  });
  if (!refreshUpdate) {
    return withRateLimit(
      NextResponse.json(
        { ok: false, error: "Nepodařilo se přepočítat REFRESH základnu podle výpisu." },
        { status: 400 }
      )
    );
  }

  const nowMs = Date.now();
  const currentMonthlyPremium =
    finiteMoneyOrNull(contract.effectiveInputAmount) ??
    finiteMoneyOrNull(contract.inputAmount);
  const policyStartMs = toMillis(contract.policyStartDate);
  const statementPeriod = normalizeText(statementData.period, 80);
  const statementNumber = normalizeText(statementData.statementNumber, 64);
  const refreshCommissionBase = {
    productKey: "neon",
    method: "cpp_neon_statement_manual_refresh_conversion",
    originalContractNumber: null,
    refreshPolicyStartDateIso: policyStartMs == null ? null : isoDateFromMs(policyStartMs),
    newMonthlyPremium: currentMonthlyPremium,
    newAnnualPremium:
      currentMonthlyPremium == null
        ? null
        : Math.round(currentMonthlyPremium * 12 * 100) / 100,
    calculationMonthlyPremium: refreshUpdate.statementMonthlyPremiumBase,
    calculationAnnualPremium: refreshUpdate.statementAnnualPremiumBase,
  };
  const result = {
    items: refreshUpdate.items,
    total: refreshUpdate.total,
  };
  const contractPatch: Record<string, unknown> = {
    isRefresh: true,
    refreshOriginalContractNumber: null,
    refreshOriginalMissingInSystem: true,
    requiresStatementRefresh: false,
    calculationInputAmount: refreshUpdate.statementMonthlyPremiumBase,
    refreshCommissionBase,
    items: refreshUpdate.items,
    result,
    total: refreshUpdate.total,
    managerOverrides: refreshUpdate.managerOverrides,
    commissionCalculationStatus: "statement_resolved_refresh_missing_original",
    commissionBaseSource: "commission_statement",
    refreshStatementResolvedAtMs: nowMs,
    refreshStatementResolvedStatementId: statementId,
    refreshStatementResolvedStatementNumber: statementNumber,
    refreshStatementResolvedStatementPeriod: statementPeriod,
    updatedAt: new Date(nowMs),
  };

  if (coefficientSetOverride) {
    contractPatch.commissionCoefficientSetOverride = coefficientSetOverride.coefficientSet;
    contractPatch.commissionCoefficientSetOverrideSource = coefficientSetOverride.reason;
    contractPatch.commissionCoefficientSetOverrideStatementId = statementId;
    contractPatch.commissionCoefficientSetOverrideStatementNumber = statementNumber;
    contractPatch.commissionCoefficientSetOverrideStatementPeriod = statementPeriod;
    contractPatch.commissionCoefficientSetOverrideAppliedAtMs = nowMs;
    contractPatch.commissionCoefficientSetOverrideAppliedBy = ctxEmail;
    contractPatch.neonCoefficientSetOverride = coefficientSetOverride.coefficientSet;
    contractPatch.neonCoefficientSetOverrideSource = coefficientSetOverride.reason;
    contractPatch.neonCoefficientSetOverrideStatementId = statementId;
    contractPatch.neonCoefficientSetOverrideStatementNumber = statementNumber;
    contractPatch.neonCoefficientSetOverrideStatementPeriod = statementPeriod;
    contractPatch.neonCoefficientSetOverrideAppliedAtMs = nowMs;
    contractPatch.neonCoefficientSetOverrideAppliedBy = ctxEmail;
  }

  await entryRef.set(contractPatch, { merge: true });

  return withRateLimit(
    NextResponse.json({
      ok: true,
      contract: {
        id: entryId,
        adviserEmail: ownerEmail,
        ...contractPatch,
        updatedAt: nowMs,
      },
    })
  );
};

export async function GET(req: NextRequest) {
  const guard = await requireAuthedRateLimited(req, {
    namespace: "api:commission-statements:get",
    limit: STATEMENTS_RATE_LIMIT,
    windowMs: STATEMENTS_RATE_LIMIT_WINDOW_MS,
    allowImpersonation: true,
  });
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  if (!adminDb) {
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Server není správně nakonfigurován (Firebase Admin)." },
        { status: 500 }
      ),
      ctx
    );
  }

  try {
    const id = safeStatementId(req.nextUrl.searchParams.get("id"));
    const includeHtml = req.nextUrl.searchParams.get("includeHtml") === "1";

    if (id) {
      const docSnap = await statementCollection(ctx.email).doc(id).get();
      if (!docSnap.exists) {
        return withRateLimitHeaders(
          NextResponse.json({ ok: false, error: "Provizní výpis nebyl nalezen." }, { status: 404 }),
          ctx
        );
      }

      return withRateLimitHeaders(
        NextResponse.json({ ok: true, item: serializeStatementDoc(docSnap, includeHtml) }),
        ctx
      );
    }

    const limit = parseLimit(req.nextUrl.searchParams.get("limit"));
    const requestedMonthKey = parseMonthKey(
      req.nextUrl.searchParams.get("year"),
      req.nextUrl.searchParams.get("month")
    );
    const snap = await statementCollection(ctx.email)
      .orderBy("periodStartMs", "desc")
      .limit(limit)
      .get();
    const items = snap.docs
      .map((docSnap) => serializeStatementDoc(docSnap, false))
      .filter((item) => !requestedMonthKey || item.payoutMonthKey === requestedMonthKey);

    return withRateLimitHeaders(NextResponse.json({ ok: true, items }), ctx);
  } catch (error) {
    console.error("Commission statements GET failed:", error);
    return withRateLimitHeaders(
      NextResponse.json(
        { ok: false, error: "Provizní výpisy se nepodařilo načíst." },
        { status: 500 }
      ),
      ctx
    );
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireContractsEntryGuard(req, {
    namespace: "api:commission-statements:post",
    limit: STATEMENTS_RATE_LIMIT,
    windowMs: STATEMENTS_RATE_LIMIT_WINDOW_MS,
  });
  if (!guard.ok) return guard.response;
  const { ctx, withRateLimit } = guard;

  if (!adminDb) {
    return withRateLimit(
      NextResponse.json(
        { ok: false, error: "Server není správně nakonfigurován (Firebase Admin)." },
        { status: 500 }
      )
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return withRateLimit(
      NextResponse.json({ ok: false, error: "Neplatné JSON tělo požadavku." }, { status: 400 })
    );
  }

  const action = normalizeText(body.action, 80);
  if (action === "convert-neon-refresh-from-statement") {
    try {
      return await handleManualNeonRefreshConversion({
        body,
        ctxEmail: ctx.email,
        teamEmails: ctx.teamEmails,
        withRateLimit,
      });
    } catch (error) {
      console.error("Commission statements manual NEON refresh conversion failed:", error);
      return withRateLimit(
        NextResponse.json(
          { ok: false, error: "Smlouvu se nepodařilo převést na REFRESH." },
          { status: 500 }
        )
      );
    }
  }

  const html = normalizeText(body.html, MAX_HTML_LENGTH + 1);
  if (!html) {
    return withRateLimit(
      NextResponse.json({ ok: false, error: "Chybí HTML obsah výpisu." }, { status: 400 })
    );
  }
  if (html.length > MAX_HTML_LENGTH) {
    return withRateLimit(
      NextResponse.json(
        { ok: false, error: "HTML výpis je příliš velký pro přímé uložení." },
        { status: 413 }
      )
    );
  }

  const fileName = normalizeText(body.fileName, 180) ?? "Provizní výpis.html";
  const header = (body.header && typeof body.header === "object"
    ? body.header
    : {}) as StatementHeaderPayload;
  const summary = (body.summary && typeof body.summary === "object"
    ? body.summary
    : {}) as StatementSummaryPayload;
  const period = normalizeText(header.period, 80);
  const statementDate = normalizeText(header.statementDate, 32);
  const { periodStartMs, periodEndMs } = parsePeriodRange(period);
  const statementDateMs = parseCzechDate(statementDate);
  const statementChronologyMs = statementChronologyMsFromParts({
    statementDate,
    statementDateMs,
    periodEndMs,
    periodStartMs,
  });
  const payoutMonthKey = resolvePayoutMonthKey({ statementDateMs, periodEndMs, periodStartMs });
  const hash = createHash("sha256").update(html).digest("hex");
  const docId = hash.slice(0, 32);
  const docRef = statementCollection(ctx.email).doc(docId);
  const nowMs = Date.now();

  try {
    const existing = await docRef.get();
    const createdAtMs = toMillis(existing.data()?.createdAtMs) ?? nowMs;
    const payload = {
      ownerEmail: ctx.email,
      fileName,
      html,
      contentHash: hash,
      advisorNumber: normalizeText(header.advisorNumber, 64),
      period,
      periodStartMs,
      periodEndMs,
      payoutMonthKey,
      statementNumber: normalizeText(header.statementNumber, 64),
      statementDate,
      statementDateMs,
      statementChronologyMs,
      commissionRowCount: normalizeNumber(summary.commissionRowCount),
      commissionTotal: normalizeNumber(summary.commissionTotal),
      reserveFundTotal: normalizeNumber(summary.reserveFundTotal),
      payoutTotal: normalizeNullableNumber(summary.payoutTotal),
      otherPaymentsCount: normalizeNumber(summary.otherPaymentsCount),
      otherPaymentsTotal: normalizeNumber(summary.otherPaymentsTotal),
      managerAdvisorCount: normalizeNumber(summary.managerAdvisorCount),
      managerRowCount: normalizeNumber(summary.managerRowCount),
      managerCommissionTotal: normalizeNumber(summary.managerCommissionTotal),
      stornoRowCount: normalizeNumber(summary.stornoRowCount),
      stornoTotal: normalizeNumber(summary.stornoTotal),
      createdAtMs,
      updatedAtMs: nowMs,
    };

    await docRef.set(payload, { merge: true });
    const processingResult = await processStatementWrites({
      docId,
      docRef,
      html,
      ctxEmail: ctx.email,
      teamEmails: ctx.teamEmails,
      statementNumber: payload.statementNumber,
      statementPeriod: period,
      statementDate,
      periodEndMs,
      statementChronologyMs,
      payoutMonthKey,
      nowMs,
    });

    return withRateLimit(
      NextResponse.json({
        ok: true,
        item: serializeStatementDoc(await docRef.get(), false),
        processingResult,
      })
    );
  } catch (error) {
    console.error("Commission statements POST failed:", error);
    return withRateLimit(
      NextResponse.json(
        { ok: false, error: "Provizní výpis se nepodařilo uložit nebo zpracovat." },
        { status: 500 }
      )
    );
  }
}
