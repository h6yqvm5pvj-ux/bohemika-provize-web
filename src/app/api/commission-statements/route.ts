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
import {
  isNeonInvestmentLifeA201Payout,
  isNeonRefreshStatementProductCode,
} from "@/app/lib/commissionPayoutRules";
import { totalWithMultipliers } from "@/app/lib/commissionTotals";
import { applyTipContractAdjustmentToCommissionResult } from "@/app/lib/tipContractCommission";
import {
  isAutoProduct,
  isPropertyProduct,
} from "@/app/lib/productCatalog";
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
import {
  autoContractWasCreatedFromCommissionStatement,
  canApplyPremiumStatementToCurrentContract as canApplyPremiumStatementToCurrentContractRecord,
  mergePremiumHistoryRecords as mergePremiumHistoryRecordsForStatement,
  premiumHistoryEntryDateMs as premiumHistoryEntryDateMsForStatement,
  premiumHistoryEntryFromStatementRow as premiumHistoryEntryFromStatementRowRecord,
} from "./premiumHistory";
import {
  autoPremiumContractNumbersForRows,
  filterAutoPremiumRowsForContract,
  normalizePremiumHistoryContractNumber,
  normalizeStoredAutoPremiumRows,
  type StoredAutoPremiumStatementRow,
} from "./premiumHistoryStatements";
import { statementChronologyCanOverwrite } from "./statementChronologyGuards";
import { commissionStatementIdentityKey } from "./statementIdentity";

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

type AutoPremiumStatementRow = StoredAutoPremiumStatementRow;

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
  premiumKind: AutoPremiumStatementRow["premiumKind"];
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
  filteredContractsSkipped: number;
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
  SOBP_AU_Z: "csobAuto",
  UNIQA_AUTO: "uniqaAuto",
  PIL_AUTOZ: "pillowAuto",
  SLA_AUTO: "slaviaauto",
  SLA_AUTOZ: "slaviaauto",
  KOO_NAMIRU: "kooperativaAuto",
};

const PROPERTY_STATEMENT_PRODUCT_KEYS: Record<string, Product> = {
  CPP_DOMX: "domex",
  "CPP_DOMX+2": "domex",
  "CPP_DOMEX+": "domex",
  CPP_BYTEX: "cppbytex",
  "CPP_BYTEX+": "cppbytex",
  CPP_ZAMEX: "zamex",
  CPP_HAFAN: "cpphafan",
  CPP_SIMPLE: "cppsimplex",
  CPP_PPR: "cppPPRbez",
  KOO_OBCAN: "koopmajetekobcan",
  KOO_OD_ZAM: "koopodzam",
  KOOP_PMOP: "kooppmop",
  KOO_PMOP: "kooppmop",
  MAX_DOM3: "maxdomov",
  MAX_DOM4: "maxdomov",
};

const LIFE_STATEMENT_PRODUCT_KEYS: Record<string, Product> = {
  CPP_N_LIFE: "neon",
  CPP_N_RISK: "neon",
  CPP_NEON: "neon",
  CPP_NEONRF: "neon",
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

const nonLifePremiumProductKeyFromStatementCode = (
  value: string | null | undefined
): Product | null => {
  const code = normalizeProductCode(value);
  return (
    autoProductKeyFromStatementCode(code) ??
    PROPERTY_STATEMENT_PRODUCT_KEYS[code] ??
    null
  );
};

const lifeProductKeyFromStatementCode = (value: string | null | undefined): Product | null => {
  const code = normalizeProductCode(value);
  if (LIFE_STATEMENT_PRODUCT_KEYS[code]) return LIFE_STATEMENT_PRODUCT_KEYS[code];
  if (/NEON|N_LIFE|N_RISK/.test(code)) return "neon";
  if (/FLEXI/.test(code)) return "flexi";
  if (/PILLOW.*(?:UR|NM)/.test(code)) return "pillowInjury";
  return null;
};

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
  row.source === deduction.source &&
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
  const productKey = nonLifePremiumProductKeyFromStatementCode(row.productCode);
  if (!productKey || row.baseAmount == null || row.baseAmount <= 0) return null;
  if (!isAutoProduct(productKey) && !isPropertyProduct(productKey)) return null;

  const premiumKind = nonLifePremiumKindFromCommissionCode(row.commissionCode, productKey);
  if (!premiumKind) return null;

  return {
    premiumKind,
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

const nonLifePremiumKindFromCommissionCode = (
  value: string | null | undefined,
  productKey: Product
): "auto_initial" | "auto_change" | null => {
  const comparableCode = baseCommissionCodeForStatementComparison(value);
  const aliases = commissionCodeAliases(comparableCode);
  const isInitial = aliases.some((code) => /^A\d+$/.test(code) || /^AC\d+$/.test(code));
  if (isInitial) return "auto_initial";

  if (isAutoProduct(productKey)) {
    return isAutoSubsequentCommissionCode(comparableCode) ? "auto_change" : null;
  }

  const isSubsequent = aliases.some((code) => /^B\d+$/.test(code) || /^BC\d+$/.test(code));
  return isSubsequent ? "auto_change" : null;
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

const autoPremiumRowsFromStatementData = (
  data: Record<string, unknown>,
  html: string | null
): AutoPremiumStatementRow[] => {
  const storedRows = normalizeStoredAutoPremiumRows(data.autoPremiumRows);
  return storedRows ?? extractAutoPremiumRowsFromStoredHtml(html);
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

const safeEntryId = (value: string | null): string | null => {
  const id = normalizeText(value, 180);
  if (!id || id.includes("/") || id.includes("..")) return null;
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

const statementSnapshotIdentity = (
  docSnap: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>
): string => {
  const data = docSnap.data() ?? {};
  return commissionStatementIdentityKey({
    statementId: docSnap.id,
    statementNumber: data.statementNumber,
    statementPeriod: data.period,
    statementDate: data.statementDate,
    advisorNumber: data.advisorNumber,
  });
};

const statementSnapshotRecency = (
  docSnap: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>
): number =>
  toMillis(docSnap.data()?.updatedAtMs) ??
  toMillis(docSnap.data()?.processedAtMs) ??
  toMillis(docSnap.data()?.createdAtMs) ??
  0;

const dedupeStatementSnapshots = (
  docs: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[]
): FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[] => {
  const byIdentity = new Map<
    string,
    FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>
  >();
  const order: string[] = [];

  for (const docSnap of docs) {
    const identity = statementSnapshotIdentity(docSnap);
    const current = byIdentity.get(identity);
    if (!current) {
      byIdentity.set(identity, docSnap);
      order.push(identity);
      continue;
    }
    if (statementSnapshotRecency(docSnap) > statementSnapshotRecency(current)) {
      byIdentity.set(identity, docSnap);
    }
  }

  return order
    .map((identity) => byIdentity.get(identity))
    .filter(
      (
        docSnap
      ): docSnap is FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData> =>
        Boolean(docSnap)
    );
};

const findExistingStatementByBusinessIdentity = async ({
  email,
  statementIdentity,
  statementNumber,
}: {
  email: string;
  statementIdentity: string;
  statementNumber: string | null;
}) => {
  if (!statementIdentity.startsWith("statement:") || !statementNumber) return null;

  const snapshot = await statementCollection(email)
    .where("statementNumber", "==", statementNumber)
    .limit(40)
    .get();
  const matches = snapshot.docs
    .filter((docSnap) => {
      const data = docSnap.data() ?? {};
      return (
        commissionStatementIdentityKey({
          statementId: docSnap.id,
          statementNumber: data.statementNumber,
          statementPeriod: data.period,
          statementDate: data.statementDate,
          advisorNumber: data.advisorNumber,
        }) === statementIdentity
      );
    })
    .sort(
      (a, b) =>
        (toMillis(b.data()?.updatedAtMs) ?? toMillis(b.data()?.createdAtMs) ?? 0) -
        (toMillis(a.data()?.updatedAtMs) ?? toMillis(a.data()?.createdAtMs) ?? 0)
    );

  return matches[0]?.ref ?? null;
};

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
  const autoPremiumRows = autoPremiumRowsFromStatementData(data, html);

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

// The history dialog only renders these metadata fields.  Keep this serializer
// separate from the regular list response: the latter derives contract rows
// from the stored HTML, which is unnecessarily expensive for every item in a
// history list.
const serializeStatementHistoryDoc = (
  docSnap: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>
) => {
  const data = (docSnap.data() ?? {}) as Record<string, unknown>;
  const periodStartMs = toMillis(data.periodStartMs);
  const periodEndMs = toMillis(data.periodEndMs);
  const statementDateMs = toMillis(data.statementDateMs);

  return {
    id: docSnap.id,
    fileName: normalizeText(data.fileName) ?? "Provizní výpis",
    statementNumber: normalizeText(data.statementNumber, 64),
    statementDate: normalizeText(data.statementDate, 32),
    period: normalizeText(data.period, 80),
    periodStartMs,
    periodEndMs,
    statementChronologyMs:
      toMillis(data.statementChronologyMs) ??
      statementChronologyMsFromParts({
        statementDate: normalizeText(data.statementDate, 32),
        statementDateMs,
        statementPeriod: normalizeText(data.period, 80),
        periodEndMs,
        periodStartMs,
      }),
    payoutMonthKey:
      normalizeText(data.payoutMonthKey, 16) ??
      resolvePayoutMonthKey({ statementDateMs, periodEndMs, periodStartMs }),
    payoutTotal: normalizeNullableNumber(data.payoutTotal),
    processedAtMs: toMillis(data.processedAtMs),
    processedBy: normalizeText(data.processedBy, 180),
  };
};

const serializePremiumHistoryStatementDoc = (
  docSnap: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>,
  contractNumber: string
) => {
  const data = (docSnap.data() ?? {}) as Record<string, unknown>;
  const html = normalizeText(data.html, MAX_HTML_LENGTH);
  const autoPremiumRows = filterAutoPremiumRowsForContract(
    autoPremiumRowsFromStatementData(data, html),
    contractNumber
  );
  if (autoPremiumRows.length === 0) return null;

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

  return {
    id: docSnap.id,
    fileName: normalizeText(data.fileName) ?? "Provizní výpis",
    statementNumber: normalizeText(data.statementNumber, 64),
    statementDate: normalizeText(data.statementDate, 32),
    period: normalizeText(data.period, 80),
    periodStartMs,
    periodEndMs,
    payoutMonthKey,
    autoPremiumRows,
    statementChronologyMs,
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
  filteredContractsSkipped: 0,
  accountingRepairDrafts: 0,
  externalUpdateTasks: 0,
  notFoundContracts: [],
  ambiguousContracts: [],
  skippedContracts: [],
  errors: [],
});

const addProcessingResult = (target: ProcessingResult, source: ProcessingResult): void => {
  target.payoutRows += source.payoutRows;
  target.contractsMatched += source.contractsMatched;
  target.contractsUpdated += source.contractsUpdated;
  target.contractsWithPayoutChanges += source.contractsWithPayoutChanges;
  target.payoutRecordsAdded += source.payoutRecordsAdded;
  target.payoutRecordsExisting += source.payoutRecordsExisting;
  target.payoutRecordsUpdated += source.payoutRecordsUpdated;
  target.coefficientOverridesApplied += source.coefficientOverridesApplied;
  target.duplicatePayoutRowsSkipped += source.duplicatePayoutRowsSkipped;
  target.premiumUpdates += source.premiumUpdates;
  target.premiumHistoryBackfills += source.premiumHistoryBackfills;
  target.olderPremiumUpdatesSkipped += source.olderPremiumUpdatesSkipped;
  target.filteredContractsSkipped += source.filteredContractsSkipped;
  target.accountingRepairDrafts += source.accountingRepairDrafts;
  target.externalUpdateTasks += source.externalUpdateTasks;
  target.notFoundContracts.push(...source.notFoundContracts);
  target.ambiguousContracts.push(...source.ambiguousContracts);
  target.skippedContracts.push(...source.skippedContracts);
  target.errors.push(...source.errors);
};

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
  (isAutoProduct(contract.productKey ?? null)
    ? finiteMoneyOrNull(contract.effectiveInputAmount) ??
      finiteMoneyOrNull(contract.inputAmount) ??
      finiteMoneyOrNull(contract.calculationInputAmount)
    : finiteMoneyOrNull(contract.calculationInputAmount) ??
      finiteMoneyOrNull(contract.effectiveInputAmount) ??
      finiteMoneyOrNull(contract.inputAmount));

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

type ContractStatementRebuildResetSummary = {
  payoutRecordsRemoved: number;
  payoutRecordsKept: number;
  premiumHistoryRemoved: number;
  premiumHistoryKept: number;
  initialCommissionBaseCleared: boolean;
  statementPremiumPointerCleared: boolean;
  statementCreatedFlagPersisted: boolean;
};

const resetContractStatementDerivedFields = async ({
  ref,
  contract,
  ctxEmail,
  nowMs,
}: {
  ref: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>;
  contract: ContractDoc;
  ctxEmail: string;
  nowMs: number;
}): Promise<ContractStatementRebuildResetSummary> => {
  const existingPayouts = contractPayoutArray(contract);
  const keptPayouts = existingPayouts.filter((payout) => !normalizeText(payout.statementId, 80));
  const existingPremiumHistory = contractPremiumHistoryArray(contract);
  const keptPremiumHistory = existingPremiumHistory.filter(
    (entry) => !normalizeText(entry.statementId, 80)
  );
  const initialCommissionBase =
    (contract as { initialCommissionBase?: { statementId?: unknown } | null })
      .initialCommissionBase ?? null;
  const initialCommissionBaseCleared = Boolean(
    initialCommissionBase && normalizeText(initialCommissionBase.statementId, 80)
  );
  const statementPremiumPointerCleared = Boolean(
    normalizeText(
      (contract as { premiumUpdatedFromStatementId?: unknown }).premiumUpdatedFromStatementId,
      80
    ) ||
      toMillis(
        (contract as { premiumUpdatedFromStatementChronologyMs?: unknown })
          .premiumUpdatedFromStatementChronologyMs
      ) != null ||
      toMillis(
        (contract as { premiumUpdatedFromStatementAtMs?: unknown }).premiumUpdatedFromStatementAtMs
      ) != null
  );
  const wasCreatedFromStatement = autoContractWasCreatedFromCommissionStatement(contract);
  const statementCreatedFlagPersisted =
    wasCreatedFromStatement && contract.createdFromCommissionStatement !== true;
  const patch: Record<string, unknown> = {
    commissionPayouts: keptPayouts,
    commissionStornoSummary: commissionStornoSummaryFromPayouts({
      payouts: keptPayouts,
      nowMs,
      writtenBy: ctxEmail,
    }),
    premiumStatementHistory: keptPremiumHistory,
    premiumUpdatedFromStatementAtMs: null,
    premiumUpdatedFromStatementChronologyMs: null,
    premiumUpdatedFromStatementId: null,
    commissionStatementRebuiltAtMs: nowMs,
    commissionStatementRebuiltBy: ctxEmail,
    updatedAt: new Date(nowMs),
  };

  if (initialCommissionBaseCleared) {
    patch.initialCommissionBase = null;
  }
  if (statementCreatedFlagPersisted) {
    patch.createdFromCommissionStatement = true;
  }

  await ref.set(patch, { merge: true });

  return {
    payoutRecordsRemoved: existingPayouts.length - keptPayouts.length,
    payoutRecordsKept: keptPayouts.length,
    premiumHistoryRemoved: existingPremiumHistory.length - keptPremiumHistory.length,
    premiumHistoryKept: keptPremiumHistory.length,
    initialCommissionBaseCleared,
    statementPremiumPointerCleared,
    statementCreatedFlagPersisted,
  };
};

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

type SavedStatementReprocessItem = {
  id: string;
  ref: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>;
  html: string;
  statementNumber: string | null;
  statementPeriod: string | null;
  statementDate: string | null;
  periodEndMs: number | null;
  statementChronologyMs: number | null;
  payoutMonthKey: string | null;
};

const savedStatementReprocessItemFromDoc = (
  docSnap: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>
): SavedStatementReprocessItem | null => {
  const data = (docSnap.data() ?? {}) as Record<string, unknown>;
  const html = normalizeText(data.html, MAX_HTML_LENGTH);
  if (!html) return null;

  const statementDate = normalizeText(data.statementDate, 32);
  const statementDateMs = toMillis(data.statementDateMs) ?? parseCzechDate(statementDate);
  const statementPeriod = normalizeText(data.period, 80);
  const storedPeriodStartMs = toMillis(data.periodStartMs);
  const storedPeriodEndMs = toMillis(data.periodEndMs);
  const parsedPeriod = parsePeriodRange(statementPeriod);
  const periodStartMs = storedPeriodStartMs ?? parsedPeriod.periodStartMs;
  const periodEndMs = storedPeriodEndMs ?? parsedPeriod.periodEndMs;
  const statementChronologyMs =
    toMillis(data.statementChronologyMs) ??
    statementChronologyMsFromParts({
      statementDate,
      statementDateMs,
      statementPeriod,
      periodEndMs,
      periodStartMs,
    });
  const payoutMonthKey =
    normalizeText(data.payoutMonthKey, 16) ??
    resolvePayoutMonthKey({ statementDateMs, periodEndMs, periodStartMs });

  return {
    id: docSnap.id,
    ref: docSnap.ref,
    html,
    statementNumber: normalizeText(data.statementNumber, 64),
    statementPeriod,
    statementDate,
    periodEndMs,
    statementChronologyMs,
    payoutMonthKey,
  };
};

const refreshStatementResolvedChronologyMs = (contract: ContractDoc): number | null =>
  toMillis(
    (contract as { refreshStatementResolvedStatementChronologyMs?: unknown })
      .refreshStatementResolvedStatementChronologyMs
  ) ??
  statementChronologyMsFromParts({
    statementDate: (contract as { refreshStatementResolvedStatementDate?: string | null })
      .refreshStatementResolvedStatementDate,
    statementPeriod: contract.refreshStatementResolvedStatementPeriod,
  });

const coefficientSetOverrideStatementChronologyMs = (contract: ContractDoc): number | null =>
  toMillis(
    (contract as { commissionCoefficientSetOverrideStatementChronologyMs?: unknown })
      .commissionCoefficientSetOverrideStatementChronologyMs
  ) ??
  statementChronologyMsFromParts({
    statementDate: contract.commissionCoefficientSetOverrideStatementDate,
    statementPeriod: contract.commissionCoefficientSetOverrideStatementPeriod,
  });

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
  commissionStatementIdentityKey(record);

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

const payoutRecordRowIdentityKey = (
  record: ContractCommissionPayoutRecord
): string =>
  [
    payoutRecordStatementKey(record),
    normalizeEmail(record.writtenBy),
    payoutRecordCanonicalCommissionCode(record.code),
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

const preferredPayoutRecordForSameRow = (
  current: ContractCommissionPayoutRecord,
  candidate: ContractCommissionPayoutRecord
): ContractCommissionPayoutRecord =>
  (candidate.writtenAtMs ?? 0) > (current.writtenAtMs ?? 0) ||
  ((candidate.writtenAtMs ?? 0) === (current.writtenAtMs ?? 0) &&
    payoutRecordCompletenessScore(candidate) > payoutRecordCompletenessScore(current))
    ? candidate
    : current;

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
  const semanticKeyByRecordKey = new Map<string, string>();
  const semanticKeyByRowIdentity = new Map<string, string>();
  const order: string[] = [];
  let updatedExisting = 0;

  for (const item of existing) {
    const semanticKey = payoutRecordSemanticKey(item) || item.key;
    const rowIdentityKey = payoutRecordRowIdentityKey(item);
    const lookupKey = semanticKeyByRowIdentity.get(rowIdentityKey) ?? semanticKey;
    const current = recordsBySemanticKey.get(lookupKey);
    if (!current) {
      recordsBySemanticKey.set(semanticKey, item);
      order.push(semanticKey);
      semanticKeyByRecordKey.set(item.key, semanticKey);
      semanticKeyByRowIdentity.set(rowIdentityKey, semanticKey);
      continue;
    }

    updatedExisting += 1;
    const preferred = preferredPayoutRecordForSameRow(current, item);
    if (preferred === item) {
      if (lookupKey !== semanticKey) {
        recordsBySemanticKey.delete(lookupKey);
        const orderIndex = order.indexOf(lookupKey);
        if (orderIndex >= 0) order[orderIndex] = semanticKey;
      }
      recordsBySemanticKey.set(semanticKey, item);
      semanticKeyByRecordKey.set(item.key, semanticKey);
      semanticKeyByRowIdentity.set(rowIdentityKey, semanticKey);
    }
  }

  let added = 0;
  let existingCount = 0;
  for (const item of incoming) {
    const semanticKey = payoutRecordSemanticKey(item) || item.key;
    const rowIdentityKey = payoutRecordRowIdentityKey(item);
    const existingSemanticKey =
      semanticKeyByRecordKey.get(item.key) ?? semanticKeyByRowIdentity.get(rowIdentityKey);
    const lookupKey = existingSemanticKey ?? semanticKey;
    const previous = recordsBySemanticKey.get(lookupKey);
    if (!previous) {
      recordsBySemanticKey.set(semanticKey, item);
      order.push(semanticKey);
      semanticKeyByRecordKey.set(item.key, semanticKey);
      semanticKeyByRowIdentity.set(rowIdentityKey, semanticKey);
      added += 1;
      continue;
    }

    existingCount += 1;
    if (payoutRecordNeedsRefresh(previous, item)) {
      const nextRecord = {
        ...item,
        writtenAtMs: previous.writtenAtMs ?? item.writtenAtMs,
        writtenBy: previous.writtenBy ?? item.writtenBy,
      };
      if (lookupKey !== semanticKey) {
        recordsBySemanticKey.delete(lookupKey);
        const orderIndex = order.indexOf(lookupKey);
        if (orderIndex >= 0) order[orderIndex] = semanticKey;
      }
      recordsBySemanticKey.set(semanticKey, nextRecord);
      semanticKeyByRecordKey.set(item.key, semanticKey);
      semanticKeyByRowIdentity.set(rowIdentityKey, semanticKey);
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
  // A201 in ČPP ŽP NEON is the investment-life component. It intentionally
  // uses a different premium base than A101, so it must not be compared with
  // the regular immediate commission calculated for the contract.
  if (
    isNeonInvestmentLifeA201Payout({
      product: contract.productKey,
      commissionCode: row.commissionCode,
    })
  ) {
    return null;
  }

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

type NeonRefreshStatementBaseUpdate = {
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

const buildNeonRefreshStatementBaseUpdate = ({
  contract,
  payoutRows,
  coefficientSetOverride,
  allowStatementMarkedRefresh = false,
}: {
  contract: ContractDoc;
  payoutRows: CommissionStatementPayoutRow[];
  coefficientSetOverride: CommissionCoefficientSet | null;
  allowStatementMarkedRefresh?: boolean;
}): NeonRefreshStatementBaseUpdate | null => {
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
  const comparableResult = applyTipContractAdjustmentToCommissionResult({
    product: productKey,
    items: result.items,
    total: result.total,
    tipsterPercent: contract.tipContractTipsterPercent,
  });

  return {
    statementAnnualPremiumBase,
    statementMonthlyPremiumBase,
    coefficientSet,
    items: comparableResult.items,
    total: comparableResult.total,
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

const buildNeonRefreshStatementCommissionBase = ({
  contract,
  statementUpdate,
  method,
}: {
  contract: ContractDoc;
  statementUpdate: NeonRefreshStatementBaseUpdate;
  method: string;
}): NonNullable<ContractDoc["refreshCommissionBase"]> => {
  const existing = contract.refreshCommissionBase ?? {};
  const currentMonthlyPremium =
    finiteMoneyOrNull(contract.effectiveInputAmount) ??
    finiteMoneyOrNull(contract.inputAmount);
  const newMonthlyPremium =
    finiteMoneyOrNull(existing.newMonthlyPremium) ?? currentMonthlyPremium;
  const policyStartMs = toMillis(contract.policyStartDate);

  return {
    ...existing,
    productKey: "neon",
    method,
    originalContractNumber:
      existing.originalContractNumber ?? contract.refreshOriginalContractNumber ?? null,
    refreshPolicyStartDateIso:
      existing.refreshPolicyStartDateIso ??
      (policyStartMs == null ? null : isoDateFromMs(policyStartMs)),
    newMonthlyPremium,
    newAnnualPremium:
      finiteMoneyOrNull(existing.newAnnualPremium) ??
      (newMonthlyPremium == null
        ? null
        : Math.round(newMonthlyPremium * 12 * 100) / 100),
    calculationMonthlyPremium: statementUpdate.statementMonthlyPremiumBase,
    calculationAnnualPremium: statementUpdate.statementAnnualPremiumBase,
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

type AutoInitialCommissionBaseUpdate = {
  statementAnnualPremiumBase: number;
  statementPaymentPremiumBase: number;
  statementHistoryEntry: ContractPremiumStatementHistoryEntry;
  coefficientSet: CommissionCoefficientSet;
  items: CommissionResultItemDTO[];
  total: number;
  managerOverrides: NonNullable<ContractDoc["managerOverrides"]>;
};

const earliestOwnAutoInitialHistoryEntry = (
  history: ContractPremiumStatementHistoryEntry[]
): ContractPremiumStatementHistoryEntry | null => {
  const entries = history
    .filter(
      (entry) =>
        entry.premiumKind === "auto_initial" &&
        entry.source === "own" &&
        (finiteMoneyOrNull(entry.newPremium) ?? 0) > 0
    )
    .sort(
      (left, right) =>
        (premiumHistoryEntryDateMsForStatement(left) ?? 0) -
          (premiumHistoryEntryDateMsForStatement(right) ?? 0) ||
        (left.statementChronologyMs ?? 0) - (right.statementChronologyMs ?? 0) ||
        (left.writtenAtMs ?? 0) - (right.writtenAtMs ?? 0)
    );

  return entries[0] ?? null;
};

const buildAutoInitialCommissionBaseUpdate = ({
  contract,
  premiumHistory,
  coefficientSetOverride,
}: {
  contract: ContractDoc;
  premiumHistory: ContractPremiumStatementHistoryEntry[];
  coefficientSetOverride: CommissionCoefficientSet | null;
}): AutoInitialCommissionBaseUpdate | null => {
  const productKey = contract.productKey;
  if (!productKey || !isAutoProduct(productKey)) return null;
  if (!autoContractWasCreatedFromCommissionStatement(contract)) return null;

  const initialEntry = earliestOwnAutoInitialHistoryEntry(premiumHistory);
  if (!initialEntry) return null;

  const statementPaymentPremiumBase = finiteMoneyOrNull(initialEntry.newPremium);
  if (statementPaymentPremiumBase == null || statementPaymentPremiumBase <= 0) return null;
  const frequencyRaw = normalizePaymentFrequencyValue(contract.frequencyRaw);
  const paymentsPerYearValue = periodsPerYear(frequencyRaw);
  const statementAnnualPremiumBase =
    finiteMoneyOrNull(initialEntry.newAnnualPremium) ??
    Math.round(statementPaymentPremiumBase * paymentsPerYearValue * 100) / 100;
  if (statementAnnualPremiumBase <= 0) return null;

  const signedDateIso = contractSignedDateIso(contract);
  const coefficientSet =
    coefficientSetOverride ??
    effectiveCoefficientSetForContract(contract, signedDateIso);
  if (!coefficientSet) return null;
  const position = normalizePositionValue(contract.position);
  if (!position) return null;
  const commissionMode = normalizeCommissionModeValue(contract.commissionMode);
  const durationYears =
    typeof contract.durationYears === "number" && Number.isFinite(contract.durationYears)
      ? contract.durationYears
      : null;
  const result = calculateResultForCoefficientSet({
    productKey,
    amount: statementPaymentPremiumBase,
    frequencyRaw,
    position,
    commissionMode,
    signedDateIso,
    coefficientSet,
    durationYears,
  });
  if (!result) return null;
  const comparableResult = applyTipContractAdjustmentToCommissionResult({
    product: productKey,
    items: result.items,
    total: result.total,
    tipsterPercent: contract.tipContractTipsterPercent,
  });

  return {
    statementAnnualPremiumBase,
    statementPaymentPremiumBase,
    statementHistoryEntry: initialEntry,
    coefficientSet,
    items: comparableResult.items,
    total: comparableResult.total,
    managerOverrides: recomputeManagerOverridesForCoefficientSet({
      contract,
      adviserPosition: position,
      adviserMode: commissionMode,
      signedDateIso,
      coefficientSet,
      premium: statementPaymentPremiumBase,
      frequencyRaw,
      durationYears,
    }),
  };
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
      const comparableResult = applyTipContractAdjustmentToCommissionResult({
        product: productKey,
        items: result.items,
        total: result.total,
        tipsterPercent: contract.tipContractTipsterPercent,
      });
      const coefficientSignedDateIso = signedDateForCoefficientSetOverride({
        product: productKey,
        contractSignedDateIso: signedDateIso,
        coefficientSetOverride: set,
      });
      const expected = expectedAmountFromItemsForCoefficientRow({
        productKey,
        items: comparableResult.items,
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
  const comparableResult = applyTipContractAdjustmentToCommissionResult({
    product: productKey,
    items: result.items,
    total: result.total,
    tipsterPercent: contract.tipContractTipsterPercent,
  });
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
    items: comparableResult.items,
    total: comparableResult.total,
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
  onlyContractNumber,
  onlyContractNumbers,
  forcedContractRef,
  forcedContractOwnerEmail,
  forcedContractEntryId,
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
  onlyContractNumber?: string | null;
  onlyContractNumbers?: string[] | null;
  forcedContractRef?: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData> | null;
  forcedContractOwnerEmail?: string | null;
  forcedContractEntryId?: string | null;
}): Promise<ProcessingResult> => {
  const result = emptyProcessingResult();
  const normalizedOnlyContractNumber = normalizeContractNumber(onlyContractNumber);
  const normalizedOnlyContractNumbers = [
    normalizedOnlyContractNumber,
    ...(onlyContractNumbers ?? []).map((value) => normalizeContractNumber(value)),
  ].filter((value): value is string => Boolean(value));
  const onlyContractNumberSet = new Set(normalizedOnlyContractNumbers);
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

  const allContractNumbersFromStatement = [
    ...new Set([...payoutRowsByContract.keys(), ...premiumRowsByContract.keys()]),
  ];
  const allContractNumbers = onlyContractNumberSet.size > 0
    ? allContractNumbersFromStatement.filter(
        (contractNumber) => onlyContractNumberSet.has(contractNumber)
      )
    : allContractNumbersFromStatement;
  if (onlyContractNumberSet.size > 0) {
    result.filteredContractsSkipped =
      allContractNumbersFromStatement.length - allContractNumbers.length;
    const matchedContractNumbers = new Set(allContractNumbers);
    onlyContractNumberSet.forEach((contractNumber) => {
      if (!matchedContractNumbers.has(contractNumber)) result.skippedContracts.push(contractNumber);
    });
  }
  const batchWriter = createProcessingBatchWriter();
  const touchedContractPaths = new Set<string>();

  for (const contractNumber of allContractNumbers) {
    const contractPayoutRows = payoutRowsByContract.get(contractNumber) ?? [];
    const contractPremiumRows = premiumRowsByContract.get(contractNumber) ?? [];
    let resolution: AccessibleContractResolution;
    try {
      if (
        forcedContractRef &&
        forcedContractOwnerEmail &&
        normalizeContractNumber(onlyContractNumber) === contractNumber
      ) {
        const forcedSnap = await forcedContractRef.get();
        if (!forcedSnap.exists) {
          resolution = { status: "not_found", contractNumber };
        } else {
          const forcedContract = (forcedSnap.data() ?? {}) as ContractDoc;
          const forcedContractNumber = normalizeContractNumber(
            forcedContract.contractNumber ?? null
          );
          if (forcedContractNumber !== contractNumber) {
            resolution = { status: "skipped", contractNumber };
          } else if (
            !hasContractAccess({
              viewerEmail: ctxEmail,
              teamEmails,
              ownerEmail: forcedContractOwnerEmail,
              contract: forcedContract,
            })
          ) {
            resolution = { status: "skipped", contractNumber };
          } else {
            resolution = {
              status: "matched",
              ref: forcedContractRef,
              ownerEmail: forcedContractOwnerEmail,
              entryId: forcedContractEntryId ?? forcedContractRef.id,
              contract: forcedContract,
            };
          }
        }
      } else {
        resolution = await resolveAccessibleContract({
          contractNumber,
          viewerEmail: ctxEmail,
          teamEmails,
          payoutRows: contractPayoutRows,
          premiumRows: contractPremiumRows,
        });
      }
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
    const canApplyCoefficientSetOverride =
      coefficientSetOverride != null &&
      statementChronologyCanOverwrite(
        statementChronologyMs,
        coefficientSetOverrideStatementChronologyMs(contract)
      );
    const neonRefreshStatementUpdate = buildNeonRefreshStatementBaseUpdate({
      contract,
      payoutRows: contractPayoutRows,
      coefficientSetOverride: coefficientSetOverride?.coefficientSet ?? null,
      allowStatementMarkedRefresh: contract.isRefresh === true,
    });
    const neonRefreshMissingOriginal = isNeonRefreshMissingOriginalInSystem(contract);
    const neonRefreshStatementCommissionBase = neonRefreshStatementUpdate
      ? buildNeonRefreshStatementCommissionBase({
          contract,
          statementUpdate: neonRefreshStatementUpdate,
          method: neonRefreshMissingOriginal
            ? "cpp_neon_statement_refresh_missing_original"
            : "cpp_neon_statement_refresh_base",
        })
      : null;
    const existingNeonRefreshCalculationMonthlyBase = finiteMoneyOrNull(
      contract.calculationInputAmount
    );
    const existingNeonRefreshStatementAnnualBase =
      finiteMoneyOrNull(contract.refreshCommissionBase?.calculationAnnualPremium) ??
      (existingNeonRefreshCalculationMonthlyBase != null
        ? Math.round(existingNeonRefreshCalculationMonthlyBase * 12 * 100) / 100
        : null);
    const shouldApplyNeonRefreshStatementUpdate =
      neonRefreshStatementUpdate != null &&
      statementChronologyCanOverwrite(
        statementChronologyMs,
        refreshStatementResolvedChronologyMs(contract)
      ) &&
      (contract.commissionBaseSource !== "commission_statement" ||
        existingNeonRefreshStatementAnnualBase == null ||
        Math.abs(
          existingNeonRefreshStatementAnnualBase -
            neonRefreshStatementUpdate.statementAnnualPremiumBase
        ) > MONEY_MATCH_TOLERANCE);
    const existingPremiumHistory = contractPremiumHistoryArray(contract);
    const existingPremiumKeys = new Set(existingPremiumHistory.map((entry) => entry.key));
    const canApplyPremiumToCurrentContract = canApplyPremiumStatementToCurrentContractRecord(
      contract,
      statementChronologyMs
    );
    const detectedPremiumHistoryEntries = contractPremiumRows
      .map((row) =>
        premiumHistoryEntryFromStatementRowRecord({
          row,
          contract,
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
    const premiumMerge = mergePremiumHistoryRecordsForStatement(
      existingPremiumHistory,
      premiumHistoryEntriesForMerge,
      MAX_STORED_PREMIUM_HISTORY
    );
    const actionablePremiumHistoryEntries = canApplyPremiumToCurrentContract
      ? detectedPremiumHistoryEntries.filter((entry) => entry.premiumKind !== "auto_initial")
      : [];
    const actionablePremiumAddedCount = actionablePremiumHistoryEntries.filter(
      (entry) => !existingPremiumKeys.has(entry.key)
    ).length;
    const backfilledPremiumAddedCount = canApplyPremiumToCurrentContract
      ? 0
      : detectedPremiumHistoryEntries.filter((entry) => !existingPremiumKeys.has(entry.key))
          .length;
    result.premiumHistoryBackfills += backfilledPremiumAddedCount;
    if (!canApplyPremiumToCurrentContract && contractPremiumRows.length > 0) {
      result.olderPremiumUpdatesSkipped += Math.max(
        0,
        contractPremiumRows.length - backfilledPremiumAddedCount
      );
    }
    const autoInitialCommissionBaseUpdate = buildAutoInitialCommissionBaseUpdate({
      contract,
      premiumHistory: premiumMerge.merged,
      coefficientSetOverride: canApplyCoefficientSetOverride
        ? coefficientSetOverride?.coefficientSet ?? null
        : null,
    });
    const shouldApplyAutoInitialCommissionBaseUpdate =
      autoInitialCommissionBaseUpdate != null &&
      (contract.commissionBaseSource !== "commission_statement_auto_initial" ||
        Math.abs(
          (finiteMoneyOrNull(contract.calculationInputAmount) ?? 0) -
            autoInitialCommissionBaseUpdate.statementPaymentPremiumBase
        ) > MONEY_MATCH_TOLERANCE ||
        Math.abs(
          (finiteMoneyOrNull(contract.total) ?? 0) -
            autoInitialCommissionBaseUpdate.total
        ) > MONEY_MATCH_TOLERANCE ||
        contract.commissionCalculationStatus !== "statement_resolved_auto_initial_base");
    const contractForPayoutExpectations: ContractDoc = neonRefreshStatementUpdate
      ? {
          ...contract,
          calculationInputAmount: neonRefreshStatementUpdate.statementMonthlyPremiumBase,
          refreshCommissionBase: neonRefreshStatementCommissionBase,
          items: neonRefreshStatementUpdate.items,
          result: {
            items: neonRefreshStatementUpdate.items,
            total: neonRefreshStatementUpdate.total,
          },
          total: neonRefreshStatementUpdate.total,
          managerOverrides: neonRefreshStatementUpdate.managerOverrides,
        }
      : autoInitialCommissionBaseUpdate
      ? {
          ...contract,
          ...(coefficientSetOverride && canApplyCoefficientSetOverride
            ? { commissionCoefficientSetOverride: coefficientSetOverride.coefficientSet }
            : {}),
          calculationInputAmount:
            autoInitialCommissionBaseUpdate.statementPaymentPremiumBase,
          items: autoInitialCommissionBaseUpdate.items,
          result: {
            items: autoInitialCommissionBaseUpdate.items,
            total: autoInitialCommissionBaseUpdate.total,
          },
          total: autoInitialCommissionBaseUpdate.total,
          managerOverrides: autoInitialCommissionBaseUpdate.managerOverrides,
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

    const updatePayload: Record<string, unknown> = {
      commissionPayouts: payoutMerge.merged,
      commissionStatementProcessedAtMs: nowMs,
      updatedAt: new Date(nowMs),
      ...externalLinkPatch,
    };
    if (coefficientSetOverride && canApplyCoefficientSetOverride) {
      updatePayload.commissionCoefficientSetOverride = coefficientSetOverride.coefficientSet;
      updatePayload.commissionCoefficientSetOverrideSource = coefficientSetOverride.reason;
      updatePayload.commissionCoefficientSetOverrideStatementId = docId;
      updatePayload.commissionCoefficientSetOverrideStatementNumber = statementNumber;
      updatePayload.commissionCoefficientSetOverrideStatementPeriod = statementPeriod;
      updatePayload.commissionCoefficientSetOverrideStatementDate = statementDate;
      updatePayload.commissionCoefficientSetOverrideStatementChronologyMs = statementChronologyMs;
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
        updatePayload.neonCoefficientSetOverrideStatementDate = statementDate;
        updatePayload.neonCoefficientSetOverrideStatementChronologyMs = statementChronologyMs;
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
    if (autoInitialCommissionBaseUpdate && shouldApplyAutoInitialCommissionBaseUpdate) {
      updatePayload.calculationInputAmount =
        autoInitialCommissionBaseUpdate.statementPaymentPremiumBase;
      updatePayload.items = autoInitialCommissionBaseUpdate.items;
      updatePayload.result = {
        items: autoInitialCommissionBaseUpdate.items,
        total: autoInitialCommissionBaseUpdate.total,
      };
      updatePayload.total = autoInitialCommissionBaseUpdate.total;
      updatePayload.managerOverrides = autoInitialCommissionBaseUpdate.managerOverrides;
      updatePayload.commissionCalculationStatus = "statement_resolved_auto_initial_base";
      updatePayload.commissionBaseSource = "commission_statement_auto_initial";
      updatePayload.initialCommissionBase = {
        paymentPremium: autoInitialCommissionBaseUpdate.statementPaymentPremiumBase,
        annualPremium: autoInitialCommissionBaseUpdate.statementAnnualPremiumBase,
        statementId: autoInitialCommissionBaseUpdate.statementHistoryEntry.statementId,
        statementNumber: autoInitialCommissionBaseUpdate.statementHistoryEntry.statementNumber,
        statementPeriod: autoInitialCommissionBaseUpdate.statementHistoryEntry.statementPeriod,
        statementDate: autoInitialCommissionBaseUpdate.statementHistoryEntry.statementDate,
        statementChronologyMs:
          autoInitialCommissionBaseUpdate.statementHistoryEntry.statementChronologyMs,
        commissionCode: autoInitialCommissionBaseUpdate.statementHistoryEntry.commissionCode,
        productCode: autoInitialCommissionBaseUpdate.statementHistoryEntry.productCode,
        rowId: autoInitialCommissionBaseUpdate.statementHistoryEntry.rowId,
        resolvedAtMs: nowMs,
        resolvedBy: ctxEmail,
      };
    }
    if (neonRefreshStatementUpdate && shouldApplyNeonRefreshStatementUpdate) {
      updatePayload.calculationInputAmount =
        neonRefreshStatementUpdate.statementMonthlyPremiumBase;
      updatePayload.refreshCommissionBase =
        neonRefreshStatementCommissionBase ?? null;
      updatePayload.items = neonRefreshStatementUpdate.items;
      updatePayload.result = {
        items: neonRefreshStatementUpdate.items,
        total: neonRefreshStatementUpdate.total,
      };
      updatePayload.total = neonRefreshStatementUpdate.total;
      updatePayload.managerOverrides = neonRefreshStatementUpdate.managerOverrides;
      updatePayload.requiresStatementRefresh = false;
      updatePayload.commissionCalculationStatus = neonRefreshMissingOriginal
        ? "statement_resolved_refresh_missing_original"
        : "statement_resolved_refresh_base";
      updatePayload.commissionBaseSource = "commission_statement";
      updatePayload.refreshStatementResolvedAtMs = nowMs;
      updatePayload.refreshStatementResolvedStatementId = docId;
      updatePayload.refreshStatementResolvedStatementNumber = statementNumber;
      updatePayload.refreshStatementResolvedStatementPeriod = statementPeriod;
      updatePayload.refreshStatementResolvedStatementDate = statementDate;
      updatePayload.refreshStatementResolvedStatementChronologyMs = statementChronologyMs;
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
            (premiumHistoryEntryDateMsForStatement(a) ?? 0) -
            (premiumHistoryEntryDateMsForStatement(b) ?? 0)
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
      canApplyCoefficientSetOverride ||
      shouldApplyNeonRefreshStatementUpdate ||
      shouldApplyAutoInitialCommissionBaseUpdate
    ) {
      batchWriter.set(resolution.ref, updatePayload, { merge: true });
      touchedContractPaths.add(resolution.ref.path);
      result.contractsUpdated += 1;
      if (hasPayoutChanges) result.contractsWithPayoutChanges += 1;
      result.payoutRecordsAdded += payoutMerge.added;
      result.payoutRecordsExisting += payoutMerge.existingCount;
      result.payoutRecordsUpdated += payoutMerge.updatedExisting;
      if (canApplyCoefficientSetOverride) result.coefficientOverridesApplied += 1;
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
      autoPremiumRows,
      autoPremiumContractNumbers: autoPremiumContractNumbersForRows(autoPremiumRows),
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
        {
          ok: false,
          error:
            "Ve výpisu pro tuto smlouvu není produktový kód REFRESH (CPP_NRF_LF nebo CPP_NEONRF).",
        },
        { status: 400 }
      )
    );
  }

  const coefficientSetOverride = detectCoefficientSetOverrideFromPayoutRows(contract, payoutRows);
  const refreshUpdate = buildNeonRefreshStatementBaseUpdate({
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
    refreshStatementResolvedStatementDate: normalizeText(statementData.statementDate, 32),
    refreshStatementResolvedStatementChronologyMs: statementChronologyMsFromParts({
      statementDate: normalizeText(statementData.statementDate, 32),
      statementPeriod,
      periodEndMs: toMillis(statementData.periodEndMs),
      periodStartMs: toMillis(statementData.periodStartMs),
    }),
    updatedAt: new Date(nowMs),
  };

  if (coefficientSetOverride) {
    contractPatch.commissionCoefficientSetOverride = coefficientSetOverride.coefficientSet;
    contractPatch.commissionCoefficientSetOverrideSource = coefficientSetOverride.reason;
    contractPatch.commissionCoefficientSetOverrideStatementId = statementId;
    contractPatch.commissionCoefficientSetOverrideStatementNumber = statementNumber;
    contractPatch.commissionCoefficientSetOverrideStatementPeriod = statementPeriod;
    contractPatch.commissionCoefficientSetOverrideStatementDate = normalizeText(
      statementData.statementDate,
      32
    );
    contractPatch.commissionCoefficientSetOverrideStatementChronologyMs =
      contractPatch.refreshStatementResolvedStatementChronologyMs;
    contractPatch.commissionCoefficientSetOverrideAppliedAtMs = nowMs;
    contractPatch.commissionCoefficientSetOverrideAppliedBy = ctxEmail;
    contractPatch.neonCoefficientSetOverride = coefficientSetOverride.coefficientSet;
    contractPatch.neonCoefficientSetOverrideSource = coefficientSetOverride.reason;
    contractPatch.neonCoefficientSetOverrideStatementId = statementId;
    contractPatch.neonCoefficientSetOverrideStatementNumber = statementNumber;
    contractPatch.neonCoefficientSetOverrideStatementPeriod = statementPeriod;
    contractPatch.neonCoefficientSetOverrideStatementDate = normalizeText(
      statementData.statementDate,
      32
    );
    contractPatch.neonCoefficientSetOverrideStatementChronologyMs =
      contractPatch.refreshStatementResolvedStatementChronologyMs;
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

const handleSavedStatementReprocess = async ({
  body,
  ctxEmail,
  teamEmails,
  withRateLimit,
}: {
  body: Record<string, unknown>;
  ctxEmail: string;
  teamEmails: string[];
  withRateLimit: (response: NextResponse) => NextResponse;
}): Promise<NextResponse> => {
  const statementId = safeStatementId(normalizeText(body.statementId, 80));
  if (!statementId) {
    return withRateLimit(
      NextResponse.json({ ok: false, error: "Chybí ID zpracovaného výpisu." }, { status: 400 })
    );
  }
  const requestedContractNumber = normalizeText(body.contractNumber, 80);
  const onlyContractNumber = requestedContractNumber
    ? normalizeContractNumber(requestedContractNumber)
    : null;
  const requestedContractNumbers = Array.isArray(body.contractNumbers)
    ? body.contractNumbers
        .map((value) => normalizeText(value, 80))
        .filter((value): value is string => Boolean(value))
    : [];
  const onlyContractNumbers = requestedContractNumbers
    .map((value) => normalizeContractNumber(value))
    .filter((value): value is string => Boolean(value));
  if (requestedContractNumber && !onlyContractNumber) {
    return withRateLimit(
      NextResponse.json(
        { ok: false, error: "Číslo smlouvy pro testovací zpracování je neplatné." },
        { status: 400 }
      )
    );
  }
  if (requestedContractNumbers.length !== onlyContractNumbers.length) {
    return withRateLimit(
      NextResponse.json(
        { ok: false, error: "Seznam čísel smluv pro testovací zpracování je neplatný." },
        { status: 400 }
      )
    );
  }

  const docRef = statementCollection(ctxEmail).doc(statementId);
  const docSnap = await docRef.get();
  if (!docSnap.exists) {
    return withRateLimit(
      NextResponse.json({ ok: false, error: "Provizní výpis nebyl nalezen." }, { status: 404 })
    );
  }

  const data = (docSnap.data() ?? {}) as Record<string, unknown>;
  const html = normalizeText(data.html, MAX_HTML_LENGTH);
  if (!html) {
    return withRateLimit(
      NextResponse.json(
        { ok: false, error: "Uložený výpis nemá HTML obsah pro opětovné zpracování." },
        { status: 400 }
      )
    );
  }

  const statementDate = normalizeText(data.statementDate, 32);
  const statementDateMs = toMillis(data.statementDateMs) ?? parseCzechDate(statementDate);
  const statementPeriod = normalizeText(data.period, 80);
  const storedPeriodStartMs = toMillis(data.periodStartMs);
  const storedPeriodEndMs = toMillis(data.periodEndMs);
  const parsedPeriod = parsePeriodRange(statementPeriod);
  const periodStartMs = storedPeriodStartMs ?? parsedPeriod.periodStartMs;
  const periodEndMs = storedPeriodEndMs ?? parsedPeriod.periodEndMs;
  const statementChronologyMs =
    toMillis(data.statementChronologyMs) ??
    statementChronologyMsFromParts({
      statementDate,
      statementDateMs,
      statementPeriod,
      periodEndMs,
      periodStartMs,
    });
  const payoutMonthKey =
    normalizeText(data.payoutMonthKey, 16) ??
    resolvePayoutMonthKey({ statementDateMs, periodEndMs, periodStartMs });
  const nowMs = Date.now();

  const processingResult = await processStatementWrites({
    docId: statementId,
    docRef,
    html,
    ctxEmail,
    teamEmails,
    statementNumber: normalizeText(data.statementNumber, 64),
    statementPeriod,
    statementDate,
    periodEndMs,
    statementChronologyMs,
    payoutMonthKey,
    nowMs,
    onlyContractNumber,
    onlyContractNumbers,
  });

  return withRateLimit(
    NextResponse.json({
      ok: true,
      item: serializeStatementDoc(await docRef.get(), false),
      processingResult,
    })
  );
};

const handleContractStatementRebuild = async ({
  body,
  ctxEmail,
  teamEmails,
  withRateLimit,
}: {
  body: Record<string, unknown>;
  ctxEmail: string;
  teamEmails: string[];
  withRateLimit: (response: NextResponse) => NextResponse;
}): Promise<NextResponse> => {
  const ownerEmail = normalizeEmail(body.ownerEmail);
  const entryId = safeEntryId(normalizeText(body.entryId, 180));
  const contractNumber = normalizeContractNumber(normalizeText(body.contractNumber, 80));

  if (!ownerEmail || !entryId || !contractNumber) {
    return withRateLimit(
      NextResponse.json(
        { ok: false, error: "Chybí smlouva pro přepočet z výpisů." },
        { status: 400 }
      )
    );
  }

  const entryRef = adminDb!.doc(entryRefPath(ownerEmail, entryId));
  const entrySnap = await entryRef.get();
  if (!entrySnap.exists) {
    return withRateLimit(
      NextResponse.json({ ok: false, error: "Smlouva nebyla nalezena." }, { status: 404 })
    );
  }

  const contract = (entrySnap.data() ?? {}) as ContractDoc;
  const storedContractNumber = normalizeContractNumber(contract.contractNumber ?? null);
  if (storedContractNumber !== contractNumber) {
    return withRateLimit(
      NextResponse.json(
        { ok: false, error: "Číslo smlouvy neodpovídá uloženému záznamu." },
        { status: 400 }
      )
    );
  }
  if (!hasContractAccess({ viewerEmail: ctxEmail, teamEmails, ownerEmail, contract })) {
    return withRateLimit(
      NextResponse.json(
        { ok: false, error: "Nemáš oprávnění přepočítat tuto smlouvu." },
        { status: 403 }
      )
    );
  }

  const statementsSnap = await statementCollection(ctxEmail).get();
  const statementItems = dedupeStatementSnapshots(statementsSnap.docs)
    .map(savedStatementReprocessItemFromDoc)
    .filter((item): item is SavedStatementReprocessItem => {
      if (!item) return false;
      const rows = [
        ...extractCommissionPayoutRowsFromStoredHtml(item.html),
        ...extractAutoPremiumRowsFromStoredHtml(item.html),
        ...extractLifePremiumIncreaseRowsFromStoredHtml(item.html),
      ];
      return rows.some((row) => normalizeContractNumber(row.contractNumber) === contractNumber);
    })
    .sort(
      (a, b) =>
        (a.statementChronologyMs ?? 0) - (b.statementChronologyMs ?? 0) ||
        String(a.statementNumber ?? "").localeCompare(String(b.statementNumber ?? ""), "cs") ||
        a.id.localeCompare(b.id, "cs")
    );

  if (statementItems.length === 0) {
    return withRateLimit(
      NextResponse.json({
        ok: true,
        contractNumber,
        matchedStatements: 0,
        processedStatements: 0,
        reset: null,
        processingResult: emptyProcessingResult(),
      })
    );
  }

  const nowMs = Date.now();
  const reset = await resetContractStatementDerivedFields({
    ref: entryRef,
    contract,
    ctxEmail,
    nowMs,
  });
  const processingResult = emptyProcessingResult();
  let processedStatements = 0;

  for (const statement of statementItems) {
    const result = await processStatementWrites({
      docId: statement.id,
      docRef: statement.ref,
      html: statement.html,
      ctxEmail,
      teamEmails,
      statementNumber: statement.statementNumber,
      statementPeriod: statement.statementPeriod,
      statementDate: statement.statementDate,
      periodEndMs: statement.periodEndMs,
      statementChronologyMs: statement.statementChronologyMs,
      payoutMonthKey: statement.payoutMonthKey,
      nowMs,
      onlyContractNumber: contractNumber,
      forcedContractRef: entryRef,
      forcedContractOwnerEmail: ownerEmail,
      forcedContractEntryId: entryId,
    });
    addProcessingResult(processingResult, result);
    processedStatements += 1;
  }

  return withRateLimit(
    NextResponse.json({
      ok: true,
      contractNumber,
      matchedStatements: statementItems.length,
      processedStatements,
      reset,
      processingResult,
    })
  );
};

const listPremiumHistoryStatementsForContract = async ({
  email,
  contractNumber,
  limit,
}: {
  email: string;
  contractNumber: string;
  limit: number;
}) => {
  const byId = new Map<string, ReturnType<typeof serializePremiumHistoryStatementDoc>>();
  let source: "indexed" | "fallback" = "indexed";

  const addDocs = (
    docs: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[]
  ) => {
    for (const docSnap of docs) {
      const item = serializePremiumHistoryStatementDoc(docSnap, contractNumber);
      if (item) byId.set(docSnap.id, item);
    }
  };

  try {
    const indexedSnap = await statementCollection(email)
      .where("autoPremiumContractNumbers", "array-contains", contractNumber)
      .limit(limit)
      .get();
    addDocs(indexedSnap.docs);
  } catch (error) {
    console.warn(
      "commission-statements premium history indexed query failed, falling back to recent scan",
      error
    );
  }

  if (byId.size === 0) {
    source = "fallback";
    const fallbackSnap = await statementCollection(email)
      .orderBy("periodStartMs", "desc")
      .limit(limit)
      .get();
    addDocs(fallbackSnap.docs);
  }

  const items = [...byId.values()]
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort(
      (a, b) =>
        (b.statementChronologyMs ?? b.periodStartMs ?? 0) -
          (a.statementChronologyMs ?? a.periodStartMs ?? 0) ||
        String(b.statementNumber ?? "").localeCompare(String(a.statementNumber ?? ""), "cs") ||
        b.id.localeCompare(a.id, "cs")
    );

  return { items, source };
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
    const requestedShape = normalizeText(req.nextUrl.searchParams.get("shape"), 40);
    const requestedContractNumber = normalizePremiumHistoryContractNumber(
      req.nextUrl.searchParams.get("contractNumber")
    );
    if (
      requestedContractNumber &&
      (requestedShape === "premiumHistory" || requestedShape === "premium-history")
    ) {
      const limit = parseLimit(req.nextUrl.searchParams.get("limit"));
      const { items, source } = await listPremiumHistoryStatementsForContract({
        email: ctx.email,
        contractNumber: requestedContractNumber,
        limit,
      });

      return withRateLimitHeaders(
        NextResponse.json({
          ok: true,
          contractNumber: requestedContractNumber,
          items,
          source,
        }),
        ctx
      );
    }

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
    if (requestedShape === "history") {
      const snap = await statementCollection(ctx.email)
        .where("processedAtMs", ">", 0)
        .orderBy("processedAtMs", "desc")
        .limit(limit)
        .select(
          "fileName",
          "statementNumber",
          "statementDate",
          "statementDateMs",
          "period",
          "periodStartMs",
          "periodEndMs",
          "statementChronologyMs",
          "payoutMonthKey",
          "payoutTotal",
          "processedAtMs",
          "processedBy"
        )
        .get();

      return withRateLimitHeaders(
        NextResponse.json({
          ok: true,
          items: dedupeStatementSnapshots(snap.docs).map(serializeStatementHistoryDoc),
        }),
        ctx
      );
    }

    const requestedMonthKey = parseMonthKey(
      req.nextUrl.searchParams.get("year"),
      req.nextUrl.searchParams.get("month")
    );
    const snap = await statementCollection(ctx.email)
      .orderBy("periodStartMs", "desc")
      .limit(limit)
      .get();
    const items = dedupeStatementSnapshots(snap.docs)
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
  if (action === "reprocess-saved-statement") {
    try {
      return await handleSavedStatementReprocess({
        body,
        ctxEmail: ctx.email,
        teamEmails: ctx.teamEmails,
        withRateLimit,
      });
    } catch (error) {
      console.error("Commission statements saved reprocess failed:", error);
      return withRateLimit(
        NextResponse.json(
          { ok: false, error: "Zpracovaný výpis se nepodařilo spustit znovu." },
          { status: 500 }
        )
      );
    }
  }
  if (action === "rebuild-contract-from-statements") {
    try {
      return await handleContractStatementRebuild({
        body,
        ctxEmail: ctx.email,
        teamEmails: ctx.teamEmails,
        withRateLimit,
      });
    } catch (error) {
      console.error("Commission statements contract rebuild failed:", error);
      return withRateLimit(
        NextResponse.json(
          { ok: false, error: "Smlouvu se nepodařilo přepočítat z výpisů." },
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
  const statementNumber = normalizeText(header.statementNumber, 64);
  const advisorNumber = normalizeText(header.advisorNumber, 64);
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
  const statementIdentity = commissionStatementIdentityKey({
    statementId: hash.slice(0, 32),
    statementNumber,
    statementPeriod: period,
    statementDate,
    advisorNumber,
  });
  const stableDocId = statementIdentity.startsWith("statement:")
    ? compactHash(`${ctx.email}:${statementIdentity}`, 32)
    : hash.slice(0, 32);
  const nowMs = Date.now();

  try {
    const existingBusinessStatementRef = await findExistingStatementByBusinessIdentity({
      email: ctx.email,
      statementIdentity,
      statementNumber,
    });
    const docRef =
      existingBusinessStatementRef ?? statementCollection(ctx.email).doc(stableDocId);
    const docId = docRef.id;
    const existing = await docRef.get();
    const createdAtMs = toMillis(existing.data()?.createdAtMs) ?? nowMs;
    const payload = {
      ownerEmail: ctx.email,
      fileName,
      html,
      contentHash: hash,
      advisorNumber,
      period,
      periodStartMs,
      periodEndMs,
      payoutMonthKey,
      statementNumber,
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
