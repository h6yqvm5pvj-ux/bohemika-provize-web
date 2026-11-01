import { useEffect, useState } from "react";
import { AlertTriangle, Banknote, CalendarDays, ChevronDown, Coins, Eye, FileSearch, FileText, Info, Repeat2, X } from "lucide-react";
import styles from "./contractCommission.module.css";
import { PayoutDifferenceExplanationContent } from "./PayoutDifferenceExplanationContent";
import { acquisitionCommissionInstallments, payoutsForAcquisitionInstallment } from "./contractCommissionInstallments";

import { baseCommissionCodeForPayoutComparison } from "@/app/lib/commissionPayoutRules";
import { createEndorsementCommissionPlan } from "@/app/lib/endorsementCommissionPlan";
import { commissionPeriodAfterMonths, commissionPeriodForCode } from "@/app/lib/commissionPeriodForCode";
import { periodsPerYear } from "@/app/lib/productFormulas/shared";
import { generateCashflow } from "@/app/cashflow/generator";
import {
  type CommissionMode,
  type CommissionResultItemDTO,
  type PaymentFrequency,
  type Position,
  type Product,
} from "../../types/domain";
import {
  cleanResultTitle,
  formatDate,
  formatMoney,
  positionLabel,
} from "./contractDetailHelpers";
import {
  hasNeonImmediateCoefficient,
} from "./contractDetailLogic";
import { type ContractCommissionPayout, type ContractDoc } from "./contractDetailTypes";
import { ContractSectionHeading } from "./ContractDetailUi";

export type MeziprovisionCard = {
  key: string;
  email?: string | null;
  userName: string;
  position: Position | null;
  mode: CommissionMode | null;
  items: CommissionResultItemDTO[];
  totals: { immediate: number; subsequent: number } | null;
  totalDisplay: number;
};

type ContractCommissionSectionProps = {
  product: Product | undefined;
  isOwnContract: boolean;
  isPaymentBasedProduct: boolean;
  hideAnnualAutoTotals: boolean;
  showAnyMeziprovision: boolean;
  meziprovisionCards: MeziprovisionCard[];
  expandedMeziprovisionKeys: string[];
  onToggleMeziprovisionCard: (key: string) => void;
  adviserItems: CommissionResultItemDTO[];
  commissionWarning?: string | null;
  commissionPayouts?: ContractCommissionPayout[] | null;
  viewerEmail?: string | null;
  contractOwnerEmail?: string | null;
  contractDurationYears?: number | null;
  paymentFrequency?: PaymentFrequency | null;
  policyStartDate?: unknown;
  commissionEntry?: ContractDoc | null;
  commissionTimeline?: ContractDoc[];
  onOpenStatement?: (statementId: string) => void;
  statementPreviewLoadingId?: string | null;
  adviserBreakdownPosition: Position | null;
  adviserBreakdownMode: CommissionMode | null;
  paymentBasedAdviserTotals: { immediate: number; subsequent: number } | null;
  adviserTotalDisplay: number;
  contractAuthorName: string;
  showAdvisorDetails: boolean;
  onToggleAdvisorDetails: () => void;
  onOpenNeonImmediateBreakdown: (
    item: CommissionResultItemDTO,
    position: Position | null | undefined,
    commissionMode: CommissionMode | null | undefined
  ) => void;
};

const commissionPanelClass = styles.panel;
const commissionRowClass = styles.row;
const commissionTotalHighlightClass = styles.total;
const commissionTotalLineClass = styles.totalLine;
const commissionTotalLabelClass = styles.totalLabel;
const commissionTotalValueClass = styles.totalValue;
const monoHeadingClass = "font-mono tracking-tight text-slate-900";
const monoChipClass =
  "inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-3 py-1.5 text-sm font-mono tracking-tight text-slate-900";
const collapsibleButtonClass = styles.toggle;
const COMMISSION_PAYOUT_AMOUNT_TOLERANCE = 10;
const FULL_STORNO_OFFSET_TOLERANCE = 0.01;
const AUTO_COMMISSION_PRODUCTS = new Set<Product>([
  "cppAuto",
  "slaviaauto",
  "slaviaflotila",
  "allianzAuto",
  "csobAuto",
  "uniqaAuto",
  "uniqaflotila",
  "pillowAuto",
  "kooperativaAuto",
  "koopflotila",
]);

const isAutoCommissionProduct = (product: Product | undefined): boolean =>
  Boolean(product && AUTO_COMMISSION_PRODUCTS.has(product));

const isLegacyImmediateTotalTitle = (title: string): boolean =>
  cleanResultTitle(title).toLowerCase().includes("okamžitá provize");

const isSplitImmediateProduct = (product: Product | undefined): boolean =>
  product === "neon" || product === "flexi";

const isSplitImmediateComponentTitle = (title: string): boolean => {
  const normalizedTitle = cleanResultTitle(title).toLowerCase();
  return (
    normalizedTitle === "provize a101" ||
    normalizedTitle === "provize b0301" ||
    normalizedTitle === "provize 50% z b3601" ||
    normalizedTitle === "provize 50% z b36"
  );
};

const B0301_IMMEDIATE_NOTE =
  "Pro okamžité vyplacení podmíněno zpracováním karty klienta dle podmínek!";

const isB0301Title = (title: string): boolean =>
  cleanResultTitle(title).toLowerCase() === "provize b0301";

const displayNoteForCommissionItem = (item: CommissionResultItemDTO): string | undefined =>
  isB0301Title(item.title) ? B0301_IMMEDIATE_NOTE : item.note;

export type CommissionPayoutReadStatus = "pending" | "paid" | "partial" | "storno";

type CommissionInstallment = {
  key: string;
  code: string | null;
  label: string;
  amount: number;
  anniversaryYears: number;
  commissionPeriod?: string | null;
  requirePeriodMatch?: boolean;
};

const normalizePayoutCode = (value: string | null | undefined, product?: Product): string =>
  baseCommissionCodeForPayoutComparison(value, product);

const normalizeEmail = (value: string | null | undefined): string =>
  String(value ?? "").trim().toLowerCase();

const validPayoutAmount = (value: number | null | undefined): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

export const isStornoPayoutRecord = (
  record: ContractCommissionPayout
): boolean => {
  const status = String(record.status ?? "").trim().toLowerCase();
  const differenceReason = String(record.differenceReason ?? "")
    .trim()
    .toLowerCase();
  return (
    status === "storno" ||
    differenceReason === "storno" ||
    validPayoutAmount(record.amount) < 0
  );
};

const isAnnualSummaryCommissionTitle = (title: string): boolean => {
  const normalized = cleanResultTitle(title).toLowerCase();
  return normalized === "celkem za rok" || normalized.includes("provize za rok");
};

const payoutCodesForCommissionTitle = (
  title: string,
  product: Product | undefined
): string[] => {
  const cleanTitle = cleanResultTitle(title);
  const normalized = cleanResultTitle(title).toLowerCase();

  if (isAnnualSummaryCommissionTitle(title)) return [];
  if (normalized === "provize a101") return ["A101"];
  if (normalized === "provize b0301") return ["B0301"];
  if (normalized === "provize 50% z b3601") {
    return ["B3601_HALF", "B36_HALF", "B036_HALF"];
  }
  if (normalized === "provize 50% z b36" || normalized === "provize 50% z b036") {
    return ["B36_HALF", "B036_HALF", "B3601_HALF"];
  }
  if (normalized.includes("po 3 letech")) return ["B3601", "B36", "B036"];
  if (normalized.includes("po 4 letech")) return ["B4801", "B48", "B048"];
  if (normalized.startsWith("okamžitá provize") || normalized.startsWith("získatelská provize")) {
    return ["A101", "A102", cleanTitle];
  }
  if (isAutoCommissionProduct(product) && normalized.startsWith("následná provize")) {
    return ["B101", "BC1", "BC101", cleanTitle];
  }
  if (normalized.startsWith("následná provize") && normalized.includes("z platby")) {
    return [cleanTitle];
  }
  return [];
};

const payoutCodesForCommissionItem = (
  item: CommissionResultItemDTO,
  product: Product | undefined
): string[] => {
  const explicitCode = normalizePayoutCode(item.code, product);
  if (product === "kooperativaAuto" && /^B1\d+$/.test(explicitCode)) return [explicitCode];
  return Array.from(
    new Set(
      [
        explicitCode && explicitCode !== "TOTAL" ? explicitCode : null,
        ...payoutCodesForCommissionTitle(item.title, product),
      ].filter((code): code is string => Boolean(code))
    )
  );
};

const installmentCountFromNote = (note: string | null | undefined): number | null => {
  const match = String(note ?? "").match(/[×x]\s*(\d+)/i);
  if (!match?.[1]) return null;
  const count = Number(match[1]);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : null;
};

const recurringInstallmentsFromStartYear = ({
  amount,
  durationYears,
  keyPrefix,
  note,
  startYear,
}: {
  amount: number;
  durationYears: number | null | undefined;
  keyPrefix: string;
  note?: string | null;
  startYear: number;
}): CommissionInstallment[] => {
  const duration =
    typeof durationYears === "number" && Number.isFinite(durationYears)
      ? Math.floor(durationYears)
      : null;
  const countFromDuration = duration !== null ? Math.max(0, duration - startYear + 1) : null;
  const count = countFromDuration ?? installmentCountFromNote(note) ?? 0;
  if (count <= 0) return [];

  return Array.from({ length: count }, (_, index) => {
    const year = startYear + index;
    return {
      key: `${keyPrefix}-${year}`,
      code: `B${101 + index}`,
      label: `${year}. rok`,
      amount,
      anniversaryYears: year,
    };
  });
};

const recurringInstallmentsForCommissionItem = (
  item: CommissionResultItemDTO,
  product: Product | undefined,
  durationYears: number | null | undefined
): CommissionInstallment[] => {
  const title = cleanResultTitle(item.title).toLowerCase();
  const amount = validPayoutAmount(item.amount);

  if (
    product === "neon" &&
    title.startsWith("následná provize") &&
    title.includes("2.") &&
    title.includes("5.")
  ) {
    return [2, 3, 4, 5].map((year, index) => ({
      key: `subsequent-${year}`,
      code: `B10${index + 1}`,
      label: `${year}. rok`,
      amount,
      anniversaryYears: year - 1,
    }));
  }

  if (
    product === "neon" &&
    (title.startsWith("pečovatelská provize") ||
      title.startsWith("pecovatelska provize") ||
      title.startsWith("následná provize")) &&
    title.includes("5.") &&
    title.includes("10.")
  ) {
    return [5, 6, 7, 8, 9, 10].map((year, index) => ({
      key: `care-${year}`,
      code: `B20${index + 1}`,
      label: `${year}. rok`,
      amount,
      anniversaryYears: year - 1,
    }));
  }

  if (title.startsWith("následná provize") && title.includes("od 6.")) {
    return recurringInstallmentsFromStartYear({
      amount,
      durationYears,
      keyPrefix: "subsequent",
      note: item.note,
      startYear: 6,
    });
  }

  if (title.startsWith("následná provize") && title.includes("od 5.")) {
    return recurringInstallmentsFromStartYear({
      amount,
      durationYears,
      keyPrefix: "subsequent",
      note: item.note,
      startYear: 5,
    });
  }

  return [];
};

const payoutRecordsForCodes = (
  payouts: ContractCommissionPayout[],
  codes: string[],
  product?: Product
): ContractCommissionPayout[] => {
  const normalizedCodes = new Set(codes.map(code => normalizePayoutCode(code, product)).filter(Boolean));
  if (normalizedCodes.size === 0) return [];

  return payouts.filter((payout) => {
    const payoutTargets = [
      normalizePayoutCode(payout.code, product),
      normalizePayoutCode(payout.key, product),
      normalizePayoutCode(payout.title, product),
    ].filter(Boolean);

    return payoutTargets.some((target) => normalizedCodes.has(target));
  });
};

const payoutTargetsForInstallment = (installment: CommissionInstallment): string[] =>
  installment.code ? [installment.code, installment.key] : [installment.key];

const payoutAmountsMatch = (
  left: number | null | undefined,
  right: number | null | undefined
): boolean =>
  Math.abs(validPayoutAmount(left) - validPayoutAmount(right)) <=
  FULL_STORNO_OFFSET_TOLERANCE;

const payoutRecordsCanOffset = (
  payout: ContractCommissionPayout,
  storno: ContractCommissionPayout,
  product?: Product
): boolean => {
  const payoutCode = normalizePayoutCode(payout.code, product);
  const stornoCode = normalizePayoutCode(storno.code, product);
  if (payoutCode && stornoCode && payoutCode !== stornoCode) return false;

  const payoutCareer = normalizePayoutCode(payout.career);
  const stornoCareer = normalizePayoutCode(storno.career);
  return !payoutCareer || !stornoCareer || payoutCareer === stornoCareer;
};

const fullyOffsetPayoutRecordIndexes = (
  records: ContractCommissionPayout[],
  product?: Product
): Set<number> => {
  const pairedIndexes = new Set<number>();

  records.forEach((storno, stornoIndex) => {
    if (!isStornoPayoutRecord(storno) || pairedIndexes.has(stornoIndex)) return;

    const stornoAmount = Math.abs(validPayoutAmount(storno.amount));
    if (stornoAmount <= 0) return;

    const payoutIndex = records.findIndex(
      (payout, index) =>
        !pairedIndexes.has(index) &&
        !isStornoPayoutRecord(payout) &&
        validPayoutAmount(payout.amount) > 0 &&
        payoutAmountsMatch(payout.amount, stornoAmount) &&
        payoutRecordsCanOffset(payout, storno, product)
    );
    if (payoutIndex < 0) return;

    pairedIndexes.add(payoutIndex);
    pairedIndexes.add(stornoIndex);
  });

  return pairedIndexes;
};

const activePayoutRecordsAfterFullStornos = (
  records: ContractCommissionPayout[],
  product?: Product
): ContractCommissionPayout[] => {
  const offsetIndexes = fullyOffsetPayoutRecordIndexes(records, product);
  if (offsetIndexes.size === 0) return records;
  return records.filter((_, index) => !offsetIndexes.has(index));
};

export const payoutStatusForCodes = (
  payouts: ContractCommissionPayout[],
  codes: string[],
  expectedAmount: number,
  product?: Product
): {
  status: CommissionPayoutReadStatus;
  paidAmount: number;
  records: ContractCommissionPayout[];
} => {
  const records = payoutRecordsForCodes(payouts, codes, product);
  const activeRecords = activePayoutRecordsAfterFullStornos(records, product);
  const nonStornoRecords = activeRecords.filter((record) => !isStornoPayoutRecord(record));
  const paidAmount = nonStornoRecords.reduce(
    (sum, record) => sum + validPayoutAmount(record.amount),
    0
  );
  const hasStorno = records.some(isStornoPayoutRecord);
  const displayRecords = nonStornoRecords.length > 0 ? activeRecords : records;

  if (
    paidAmount > 0 &&
    paidAmount >= Math.max(0, expectedAmount - COMMISSION_PAYOUT_AMOUNT_TOLERANCE)
  ) {
    return { status: "paid", paidAmount, records: displayRecords };
  }
  if (paidAmount > 0) return { status: "partial", paidAmount, records: displayRecords };
  if (hasStorno) return { status: "storno", paidAmount, records };
  return { status: "pending", paidAmount, records };
};

const payoutStatusLabel = (
  status: CommissionPayoutReadStatus,
  paidAmount: number
): string => {
  switch (status) {
    case "paid":
      return "Vyplaceno";
    case "partial":
      return `Částečně ${formatMoney(paidAmount)}`;
    case "storno":
      return "Storno";
    default:
      return "Čeká na zápis";
  }
};

const payoutStatusClass = (status: CommissionPayoutReadStatus): string => {
  switch (status) {
    case "paid":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "partial":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "storno":
      return "border-rose-200 bg-rose-50 text-rose-800";
    default:
      return "border-slate-200 bg-slate-50 text-slate-500";
  }
};

const formatSignedMoney = (value: number): string =>
  `${value >= 0 ? "+" : "-"}${formatMoney(Math.abs(value))}`;

export const stornoPayoutAmountFromRecords = (
  records: ContractCommissionPayout[]
): number | null => {
  const stornoAmount = records.filter(isStornoPayoutRecord).reduce((sum, record) => {
    const amount = validPayoutAmount(record.amount);
    return sum + (amount < 0 ? amount : -Math.abs(amount));
  }, 0);
  if (Math.abs(stornoAmount) <= COMMISSION_PAYOUT_AMOUNT_TOLERANCE) return null;
  return Math.round(stornoAmount * 100) / 100;
};

export const payoutDifferenceAmountFromRecords = ({
  expectedAmount,
  paidAmount,
  records,
}: {
  expectedAmount: number;
  paidAmount: number;
  records: ContractCommissionPayout[];
}): number | null => {
  if (records.length === 0) return null;

  const activeRecords = activePayoutRecordsAfterFullStornos(records);
  const nonStornoRecords = activeRecords.filter(
    (record) => !isStornoPayoutRecord(record)
  );
  if (nonStornoRecords.length === 0) return null;

  // One commission card can represent several payment-frequency rows
  // (for example A101 + A102 on a quarterly contract). Their stored
  // differences are already calculated against the correct amount for each
  // installment, so do not compare their aggregate with one installment.
  const storedDifferences = nonStornoRecords.map((record) =>
    Number(record.difference)
  );
  if (storedDifferences.every(Number.isFinite)) {
    const storedDifferenceTotal = storedDifferences.reduce(
      (sum, difference) => sum + difference,
      0
    );
    if (
      Math.abs(storedDifferenceTotal) <= COMMISSION_PAYOUT_AMOUNT_TOLERANCE
    ) {
      return null;
    }
    return Math.round(storedDifferenceTotal * 100) / 100;
  }

  const storedExpectedAmounts = nonStornoRecords.map((record) =>
    Number(record.expectedAmount)
  );
  const comparableExpectedAmount = storedExpectedAmounts.every(Number.isFinite)
    ? storedExpectedAmounts.reduce((sum, amount) => sum + amount, 0)
    : expectedAmount;
  const calculatedDifference = paidAmount - comparableExpectedAmount;
  if (Math.abs(calculatedDifference) <= COMMISSION_PAYOUT_AMOUNT_TOLERANCE) {
    return null;
  }

  return Math.round(calculatedDifference * 100) / 100;
};

const payoutDifferenceAmountClass = (difference: number): string =>
  difference < 0
    ? "border-rose-200 bg-rose-50 text-rose-800"
    : "border-amber-200 bg-amber-50 text-amber-900";

const payoutRowClass = (status: CommissionPayoutReadStatus): string =>
  status === "paid"
    ? "border-emerald-200 bg-emerald-50/80"
    : status === "partial"
      ? "border-amber-200 bg-amber-50/70"
      : status === "storno"
        ? "border-rose-200 bg-rose-50/70"
        : "border-slate-200 bg-white";

const payoutRecordLabel = (record: ContractCommissionPayout | null): string | null => {
  if (!record) return null;
  return [
    record.statementNumber ? `výpis ${record.statementNumber}` : null,
    record.statementPeriod ?? record.statementDate ?? null,
  ]
    .filter(Boolean)
    .join(" · ");
};

const latestPayoutRecordLabel = (records: ContractCommissionPayout[]): string | null => {
  const record = [...records]
    .sort((a, b) => payoutRecordSortValue(b) - payoutRecordSortValue(a))
    .find((item) => item.statementNumber || item.statementPeriod || item.statementDate);
  return payoutRecordLabel(record ?? null);
};

type PayoutDifferenceReason =
  | "career_mismatch"
  | "premium_base_mismatch"
  | "commission_amount_mismatch"
  | "storno";

type PayoutDifferenceExplanation = {
  detail: string;
  reasonLabel: string;
  sourceLabel: string | null;
};

const payoutRecordSortValue = (record: ContractCommissionPayout): number => {
  const chronology = Number(record.statementChronologyMs);
  if (Number.isFinite(chronology)) return chronology;
  const writtenAt = Number(record.writtenAtMs);
  return Number.isFinite(writtenAt) ? writtenAt : 0;
};

const payoutDifferenceReasonFromRecord = (
  record: ContractCommissionPayout
): PayoutDifferenceReason | null => {
  const storedReason = String(record.differenceReason ?? "").trim();
  if (
    storedReason === "career_mismatch" ||
    storedReason === "premium_base_mismatch" ||
    storedReason === "commission_amount_mismatch" ||
    storedReason === "storno"
  ) {
    return storedReason;
  }

  const detail = String(record.detail ?? "").toLowerCase();
  if (detail.includes("kariérní nesoulad")) return "career_mismatch";
  if (
    detail.includes("důvod rozdílu: výpis použil jinou základnu") ||
    detail.includes("rozdíl pojistného") ||
    detail.includes("nesoulad ročního pojistného")
  ) {
    return "premium_base_mismatch";
  }
  if (isStornoPayoutRecord(record)) return "storno";
  const difference = Number(record.difference);
  if (
    record.status === "difference" ||
    (Number.isFinite(difference) && Math.abs(difference) > COMMISSION_PAYOUT_AMOUNT_TOLERANCE)
  ) {
    return "commission_amount_mismatch";
  }
  return null;
};

const payoutDifferenceReasonLabel = (reason: PayoutDifferenceReason): string => {
  switch (reason) {
    case "career_mismatch":
      return "Příčina rozdílu: kariérní stupeň";
    case "premium_base_mismatch":
      return "Příčina rozdílu: základna pojistného";
    case "commission_amount_mismatch":
      return "Příčina rozdílu: částka provize";
    case "storno":
      return "Odúčtování ve výpisu";
  }
};

const payoutDifferenceReasonClass = (reason: PayoutDifferenceReason): string =>
  reason === "career_mismatch"
    ? "border-rose-200 bg-rose-50 text-rose-800"
    : reason === "premium_base_mismatch"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : reason === "storno"
        ? "border-rose-200 bg-rose-50 text-rose-800"
        : "border-slate-200 bg-slate-50 text-slate-700";

const importantPayoutRecord = (
  records: ContractCommissionPayout[]
): ContractCommissionPayout | null => {
  const sortedRecords = [...records].sort(
    (a, b) => payoutRecordSortValue(b) - payoutRecordSortValue(a)
  );
  return (
    sortedRecords.find((record) => {
      const reason = payoutDifferenceReasonFromRecord(record);
      return reason != null && reason !== "storno";
    }) ??
    sortedRecords.find((record) => Boolean(record.detail) && isStornoPayoutRecord(record)) ??
    null
  );
};

export const payoutExplanationForRecords = (
  records: ContractCommissionPayout[]
): PayoutDifferenceExplanation | null => {
  const record = importantPayoutRecord(records);
  if (!record) return null;
  const reason = payoutDifferenceReasonFromRecord(record);
  const detail = String(record.detail ?? "").trim();
  if (!reason || !detail) return null;

  return {
    detail,
    reasonLabel: payoutDifferenceReasonLabel(reason),
    sourceLabel: payoutRecordLabel(record) ?? latestPayoutRecordLabel(records),
  };
};

const anniversaryYearsForCommissionItem = (item: CommissionResultItemDTO): number => {
  const title = cleanResultTitle(item.title).toLowerCase();
  if (title.includes("po 3 letech")) return 3;
  if (title.includes("po 4 letech")) return 4;
  return 0;
};

type CommissionRowPlan = {
  amount: number;
  state: ReturnType<typeof payoutStatusForCodes>;
  adjustment: ReturnType<ReturnType<typeof createEndorsementCommissionPlan>["adjust"]>;
};

const installmentAmountLabel = (installments: { amount: number }[], fallback: number): string => {
  const amounts = installments.map((installment) => installment.amount);
  const minimum = Math.min(...amounts);
  const maximum = Math.max(...amounts);
  return amounts.length === 0 ? formatMoney(fallback)
    : minimum === maximum ? formatMoney(minimum)
      : `${formatMoney(minimum)} – ${formatMoney(maximum)}`;
};

export function ContractCommissionSection({
  product,
  isOwnContract,
  isPaymentBasedProduct,
  hideAnnualAutoTotals,
  showAnyMeziprovision,
  meziprovisionCards,
  expandedMeziprovisionKeys,
  onToggleMeziprovisionCard,
  adviserItems,
  commissionWarning = null,
  commissionPayouts = [],
  viewerEmail = null,
  contractOwnerEmail = null,
  contractDurationYears = null,
  paymentFrequency = null,
  policyStartDate = null,
  commissionEntry = null,
  commissionTimeline = [],
  onOpenStatement,
  statementPreviewLoadingId = null,
  adviserBreakdownPosition,
  adviserBreakdownMode,
  paymentBasedAdviserTotals,
  adviserTotalDisplay,
  contractAuthorName,
  showAdvisorDetails,
  onToggleAdvisorDetails,
  onOpenNeonImmediateBreakdown,
}: ContractCommissionSectionProps) {
  const normalizedCommissionPayouts = commissionPayouts ?? [];
  const normalizedViewerEmail = normalizeEmail(viewerEmail);
  const normalizedOwnerEmail = normalizeEmail(contractOwnerEmail);
  const trimmedCommissionWarning = commissionWarning?.trim() || null;
  const premiumPlan = createEndorsementCommissionPlan(commissionTimeline);
  const planEntry = commissionEntry
    ? { ...commissionEntry, userEmail: commissionEntry.userEmail ?? normalizedOwnerEmail }
    : null;
  const commissionStart = policyStartDate ?? commissionEntry?.policyStartDate ?? commissionEntry?.contractSignedDate;
  const projectCommissionRow = (
    amount: number,
    payouts: ContractCommissionPayout[],
    codes: string[],
    anniversaryYears = 0,
    commissionPeriod?: string | null
  ): CommissionRowPlan => {
    const state = payoutStatusForCodes(payouts, codes, amount, product);
    const period = commissionPeriod === undefined
      ? commissionPeriodAfterMonths(commissionStart, anniversaryYears * 12)
      : commissionPeriod;
    const adjustment = planEntry && period && state.status !== "paid"
      ? premiumPlan.adjust(planEntry, amount, period)
      : null;
    const expectedAmount = adjustment?.amount ?? amount;
    return {
      amount: expectedAmount,
      state: adjustment ? payoutStatusForCodes(payouts, codes, expectedAmount, product) : state,
      adjustment,
    };
  };
  const renderPremiumAdjustment = (plan: CommissionRowPlan) => {
    if (!plan.adjustment) return null;
    const href = `#contract-entry-${plan.adjustment.endorsementEntryId}`;
    return (
      <span className="mt-1 block text-xs font-medium text-sky-800" data-premium-adjustment="true">
        <span>Původně {formatMoney(plan.adjustment.originalAmount)} · </span>
        <a className="underline underline-offset-2" href={href}>dle dodatku od {formatDate(plan.adjustment.effectiveDate)}</a>
      </span>
    );
  };
  const renderPaidRemainder = (plan: CommissionRowPlan) => plan.adjustment && plan.state.paidAmount > 0 ? (
    <span className="block text-xs font-medium text-slate-500">
      Z výpisů {formatMoney(plan.state.paidAmount)}
      {plan.state.status === "partial" ? ` · zbývá ${formatMoney(Math.max(0, plan.amount - plan.state.paidAmount))}` : ""}
    </span>
  ) : null;
  const payoutsForRecurringInstallment = (payouts: ContractCommissionPayout[], installment: CommissionInstallment) =>
    !installment.requirePeriodMatch ? payouts : payouts.filter((record) => planEntry &&
      commissionPeriodForCode(planEntry, record.code || record.key || record.title) === installment.commissionPeriod);
  const recurringInstallmentsForItem = (
    item: CommissionResultItemDTO,
    payouts: ContractCommissionPayout[]
  ): CommissionInstallment[] => {
    const existing = recurringInstallmentsForCommissionItem(item, product, contractDurationYears);
    if (existing.length > 0 || !planEntry || !commissionTimeline.some((entry) => entry.changeType === "decrease" ||
      (typeof entry.premiumDelta === "number" && entry.premiumDelta < 0)) ||
      !/následná|pečovatelská/i.test(item.title)) return existing;
    // Reuse the original schedule so payment intervals and policy ages agree
    // with cashflow; the projection below applies the premium change once.
    const schedule = generateCashflow([{
      ...planEntry, items: [item], commissionPayouts: [], cashflowPayoutMatches: [], source: "own",
    }], Math.min(80, Math.max(10, contractDurationYears ?? 10)), normalizedOwnerEmail, new Date(), []);
    const installments = schedule.flatMap((scheduled): CommissionInstallment[] => {
      const period = scheduled.commissionPeriodStart ?? commissionPeriodForCode(planEntry, scheduled.commissionCode);
      return !period ? [] : [{
        key: `period-${period}-${scheduled.commissionCode ?? ""}`,
        code: scheduled.commissionCode ?? null,
        label: formatDate(period), amount: scheduled.amount, anniversaryYears: 0, commissionPeriod: period,
      }];
    });
    const codeCounts = new Map<string, number>();
    installments.forEach((installment) => {
      const code = normalizePayoutCode(installment.code);
      codeCounts.set(code, (codeCounts.get(code) ?? 0) + 1);
    });
    installments.forEach((installment) => {
      installment.requirePeriodMatch = (codeCounts.get(normalizePayoutCode(installment.code)) ?? 0) > 1;
    });
    return installments.some((installment) => projectCommissionRow(
      installment.amount, payoutsForRecurringInstallment(payouts, installment), payoutTargetsForInstallment(installment), 0, installment.commissionPeriod
    ).adjustment) ? installments : existing;
  };
  const commissionSummary = (
    items: CommissionResultItemDTO[], payouts: ContractCommissionPayout[],
    originalTotal: number, paymentTotals: { immediate: number; subsequent: number } | null
  ) => {
    const hasSplitImmediate = isSplitImmediateProduct(product) && items.some((item) => isSplitImmediateComponentTitle(item.title));
    let totalDelta = 0;
    let immediateDelta = 0;
    const annualSubsequentDeltas = new Map<number, number>();
    const annualSubsequentCounts = new Map<number, number>();
    for (const item of items) {
      const isSubsequent = /následná|pečovatelská/i.test(item.title);
      if ((item.excludeFromTotal && !(paymentTotals && isSubsequent)) ||
        (hasSplitImmediate && isLegacyImmediateTotalTitle(item.title))) continue;
      const amount = validPayoutAmount(item.amount);
      const acquisition = acquisitionCommissionInstallments({ item, product, frequency: paymentFrequency, policyStartDate });
      if (acquisition.length > 0) {
        const delta = acquisition.reduce((sum, installment, index) => sum + projectCommissionRow(
          installment.amount, payoutsForAcquisitionInstallment(payouts, installment), installment.codes, 0,
          commissionPeriodAfterMonths(commissionStart, index * (12 / periodsPerYear(paymentFrequency ?? "annual")))
        ).amount - installment.amount, 0);
        immediateDelta += delta;
        totalDelta += delta;
        continue;
      }
      const recurring = recurringInstallmentsForItem(item, payouts);
      if (recurring.length > 0) {
        recurring.forEach((installment) => {
          const delta = projectCommissionRow(installment.amount, payoutsForRecurringInstallment(payouts, installment), payoutTargetsForInstallment(installment),
            installment.anniversaryYears, installment.commissionPeriod).amount - installment.amount;
          if (paymentTotals && installment.commissionPeriod) {
            const start = commissionPeriodAfterMonths(commissionStart, 0);
            if (start) {
              const months = (Number(installment.commissionPeriod.slice(0, 4)) - Number(start.slice(0, 4))) * 12 +
                Number(installment.commissionPeriod.slice(5, 7)) - Number(start.slice(5, 7));
              const year = Math.floor(months / 12);
              annualSubsequentDeltas.set(year, (annualSubsequentDeltas.get(year) ?? 0) + delta);
              annualSubsequentCounts.set(year, (annualSubsequentCounts.get(year) ?? 0) + 1);
            }
          } else totalDelta += delta;
        });
        continue;
      }
      const delta = projectCommissionRow(amount, payouts, payoutCodesForCommissionItem(item, product), anniversaryYearsForCommissionItem(item)).amount - amount;
      totalDelta += delta;
      if (!isSubsequent) immediateDelta += delta;
    }
    const annualAmounts = paymentTotals && annualSubsequentDeltas.size > 0
      ? [...annualSubsequentDeltas].filter(([year]) =>
        annualSubsequentCounts.get(year) === periodsPerYear(paymentFrequency ?? "annual")
      ).map(([, delta]) => ({ amount: paymentTotals.subsequent + delta }))
      : [];
    return {
      total: originalTotal + totalDelta,
      immediate: (paymentTotals?.immediate ?? 0) + immediateDelta,
      subsequent: installmentAmountLabel(annualAmounts, paymentTotals?.subsequent ?? 0),
    };
  };
  const [payoutDifferenceExplanation, setPayoutDifferenceExplanation] =
    useState<PayoutDifferenceExplanation | null>(null);

  useEffect(() => {
    if (!payoutDifferenceExplanation) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPayoutDifferenceExplanation(null);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [payoutDifferenceExplanation]);

  const payoutsForWriter = (
    writerEmail: string | null | undefined,
    includeLegacyWithoutWriter = false
  ): ContractCommissionPayout[] => {
    const normalizedWriter = normalizeEmail(writerEmail);
    return normalizedCommissionPayouts.filter((payout) => {
      const writtenBy = normalizeEmail(payout.writtenBy);
      if (writtenBy) return normalizedWriter ? writtenBy === normalizedWriter : false;
      return includeLegacyWithoutWriter;
    });
  };

  const adviserPayouts = payoutsForWriter(
    normalizedOwnerEmail,
    isOwnContract
  );
  const adviserSummary = commissionSummary(adviserItems, adviserPayouts, adviserTotalDisplay, paymentBasedAdviserTotals);

  const renderPayoutStatusChip = (
    status: CommissionPayoutReadStatus,
    paidAmount: number,
    expectedAmount: number,
    records: ContractCommissionPayout[],
    adjusted = false
  ) => {
    const adjustedDifference = paidAmount - expectedAmount;
    const differenceAmount = adjusted
      ? paidAmount > expectedAmount + COMMISSION_PAYOUT_AMOUNT_TOLERANCE
        ? Math.round(adjustedDifference * 100) / 100
        : null
      : payoutDifferenceAmountFromRecords({
      expectedAmount,
      paidAmount,
      records,
    });
    const stornoAmount = stornoPayoutAmountFromRecords(records);

    return (
      <>
        <span className={`${styles.status} ${payoutStatusClass(status)}`}>
          {adjusted && expectedAmount === 0 && paidAmount === 0 ? "Bez nároku" : payoutStatusLabel(status, paidAmount)}
        </span>
        {stornoAmount !== null && (
          <span className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-800">
            Storno {formatSignedMoney(stornoAmount)}
          </span>
        )}
        {differenceAmount !== null && (
          <span
            className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${payoutDifferenceAmountClass(differenceAmount)}`}
          >
            Rozdíl {formatSignedMoney(differenceAmount)}
          </span>
        )}
      </>
    );
  };

  const renderPayoutRecordHint = (records: ContractCommissionPayout[]) => {
    const importantRecord = importantPayoutRecord(records);
    const label = payoutRecordLabel(importantRecord) ?? latestPayoutRecordLabel(records);
    const reason = importantRecord ? payoutDifferenceReasonFromRecord(importantRecord) : null;
    const explanation = payoutExplanationForRecords(records);
    if (!label && !reason) return null;

    return (
      <span className="mt-1 block">
        {label && (
          <span className="block text-[11px] font-medium text-slate-500">
            Zapsáno z {label}
          </span>
        )}
        {reason && (
          <span className="mt-1 inline-flex flex-wrap items-center gap-1.5">
            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${payoutDifferenceReasonClass(reason)}`}>
              {payoutDifferenceReasonLabel(reason)}
            </span>
            {explanation ? (
              <span
                role="button"
                tabIndex={0}
                aria-label="Zobrazit vysvětlení nesrovnalosti"
                aria-haspopup="dialog"
                title="Vysvětlení nesrovnalosti"
                className={`ui-focus inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border bg-white shadow-sm transition ${
                  reason === "storno" || reason === "career_mismatch"
                    ? "border-rose-300 text-rose-800 hover:border-rose-400 hover:bg-rose-50"
                    : "border-amber-300 text-amber-800 hover:border-amber-400 hover:bg-amber-50"
                }`}
                onClick={(event) => {
                  event.stopPropagation();
                  setPayoutDifferenceExplanation(explanation);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  event.stopPropagation();
                  setPayoutDifferenceExplanation(explanation);
                }}
              >
                <Info size={13} strokeWidth={2.5} aria-hidden="true" />
              </span>
            ) : null}
          </span>
        )}
      </span>
    );
  };

  const renderSplitImmediateGroup = (
    commissionItems: CommissionResultItemDTO[],
    key: string,
    payoutsForRows: ContractCommissionPayout[]
  ) => {
    const parts = commissionItems.map((part) => ({
      part,
      plan: projectCommissionRow(validPayoutAmount(part.amount), payoutsForRows, payoutCodesForCommissionItem(part, product)),
    }));
    const total = parts.reduce((sum, { plan }) => sum + plan.amount, 0);

    return (
      <details key={key} className="group">
        <summary
          className={`${commissionRowClass} cursor-pointer list-none transition hover:border-slate-400 hover:bg-slate-100 [&::-webkit-details-marker]:hidden`}
        >
          <span className="flex min-w-0 items-start gap-2.5 text-sm font-medium text-slate-900 sm:items-center sm:text-base">
            <span className={styles.icon}>
              <Banknote size={18} strokeWidth={1.8} aria-hidden="true" />
            </span>
            <span className="min-w-0 leading-tight [overflow-wrap:anywhere]">
              <span>Okamžitá provize</span>
              <span className="ml-2 inline-flex align-middle rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                rozpis
              </span>
            </span>
          </span>
          <span className="flex items-center justify-end gap-2 whitespace-nowrap text-right text-base font-semibold text-slate-900">
            {formatMoney(total)}
            <ChevronDown
              size={18}
              strokeWidth={2.2}
              className="shrink-0 text-slate-500 transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </span>
        </summary>

        <div className={styles.breakdown}>
          {parts.map(({ part, plan }) => {
            const partNote = displayNoteForCommissionItem(part);
            const payoutState = plan.state;

            return (
              <div
                key={part.title}
                className={`${styles.breakdownRow} ${payoutRowClass(payoutState.status)}`}
              >
                <span className="min-w-0 text-sm font-medium text-slate-800">
                  <span>{cleanResultTitle(part.title)}</span>
                  {renderPremiumAdjustment(plan)}
                  {partNote && (
                    <span className="mt-1 block text-xs font-semibold text-red-600">
                      {partNote}
                    </span>
                  )}
                  {renderPayoutRecordHint(payoutState.records)}
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1 whitespace-nowrap pt-0.5 text-sm font-semibold text-slate-950">
                  <span>{formatMoney(plan.amount)}</span>
                  {renderPaidRemainder(plan)}
                  {renderPayoutStatusChip(
                    payoutState.status,
                    payoutState.paidAmount,
                    plan.amount,
                    payoutState.records,
                    Boolean(plan.adjustment)
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </details>
    );
  };

  const renderCommissionRow = (
    item: CommissionResultItemDTO,
    position: Position | null | undefined,
    commissionMode: CommissionMode | null | undefined,
    key: string,
    payoutsForRows: ContractCommissionPayout[]
  ) => {
    const normalizedTitle = cleanResultTitle(item.title).toLowerCase();
    const RowIcon = normalizedTitle.includes("následná")
      ? Repeat2
      : normalizedTitle.includes("po ") || normalizedTitle.includes("rok")
        ? CalendarDays
        : Banknote;
    const clickable =
      product === "neon" &&
      isLegacyImmediateTotalTitle(item.title) &&
      hasNeonImmediateCoefficient(position);
    const rowClass = clickable
      ? `${commissionRowClass} w-full text-left transition hover:border-slate-400 hover:bg-slate-100`
      : commissionRowClass;
    const itemNote = displayNoteForCommissionItem(item);
    const payoutCodes = payoutCodesForCommissionItem(item, product);
    const plan = projectCommissionRow(
      validPayoutAmount(item.amount), payoutsForRows, payoutCodes, anniversaryYearsForCommissionItem(item)
    );
    const payoutState = plan.state;
    const recurringInstallments = recurringInstallmentsForItem(item, payoutsForRows);

    const acquisitionInstallments = acquisitionCommissionInstallments({
      item, product, frequency: paymentFrequency, policyStartDate,
    });
    if (acquisitionInstallments.length > 0) {
      const installments = acquisitionInstallments.map((installment, index) => {
        const records = payoutsForAcquisitionInstallment(payoutsForRows, installment);
        const installmentPlan = projectCommissionRow(
          installment.amount, records, installment.codes, 0,
          commissionPeriodAfterMonths(commissionStart, index * (12 / periodsPerYear(paymentFrequency ?? "annual")))
        );
        return { ...installment, amount: installmentPlan.amount, state: installmentPlan.state, records, plan: installmentPlan };
      });
      const paidCount = installments.filter(({ state }) => state.status === "paid").length;
      const total = installments.reduce((sum, installment) => sum + installment.amount, 0);
      const hasPayment = installments.some(({ state }) => state.paidAmount > 0);
      const status = paidCount === installments.length ? "paid" : hasPayment ? "partial" : installments.some(({ state }) => state.status === "storno") ? "storno" : "pending";
      const frequencyLabel = paymentFrequency === "monthly" ? "měsíčně" : paymentFrequency === "quarterly" ? "čtvrtletně" : "pololetně";

      return (
        <details key={key} className={`group ${styles.installmentGroup}`}>
          <summary className={`${commissionRowClass} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
            <span className="flex min-w-0 gap-3">
              <span className={styles.icon}><Banknote size={18} strokeWidth={1.8} aria-hidden="true" /></span>
              <span className="min-w-0">
                <span className={styles.installmentTitle}>Získatelská provize <span className={styles.frequency}>{frequencyLabel}</span></span>
                <span className={styles.installmentMeta}>Vyplaceno {paidCount}/{installments.length} · první rok {formatMoney(total)}</span>
                {itemNote && <span className="mt-1 block text-xs font-semibold text-red-600">{itemNote}</span>}
                <span className={styles.installmentProgress} aria-hidden="true">
                  {installments.map((installment) => <span key={installment.code} data-status={installment.state.status} />)}
                </span>
              </span>
            </span>
            <span className={styles.installmentSummaryAmount}>
              <span className="flex flex-col items-end gap-1">
                <span>{installmentAmountLabel(installments, item.amount)} <span className={styles.perInstallment}>/ splátka</span></span>
                <span className={`${styles.status} ${payoutStatusClass(status)}`}>
                  {status === "partial" ? "Částečně vyplaceno" : payoutStatusLabel(status, 0)}
                </span>
              </span>
              <ChevronDown size={18} className="text-violet-500 transition-transform group-open:rotate-180" aria-hidden="true" />
            </span>
          </summary>
          <div className={styles.breakdown}>
            {installments.map((installment) => {
              const sources = Array.from(new Map(installment.records
                .filter((record) => record.statementId && (!normalizeEmail(record.writtenBy) || normalizeEmail(record.writtenBy) === normalizedViewerEmail))
                .map((record) => [record.statementId!, record])).values());
              return (
                <div key={installment.code} className={`${styles.breakdownRow} ${payoutRowClass(installment.state.status)}`}>
                  <span className="min-w-0 text-sm font-medium text-slate-800">
                    <span>{installment.label} <span className={styles.installmentCode}>{installment.code}</span></span>
                    {installment.period && <span className={styles.installmentMeta}>Období splátky · {installment.period}</span>}
                    {renderPremiumAdjustment(installment.plan)}
                    {renderPayoutRecordHint(installment.state.records)}
                    {onOpenStatement && sources.length > 0 && (
                      <span className={styles.installmentSources}>
                        {sources.map((record) => (
                          <button key={record.statementId} type="button" className={styles.sourceButton}
                            disabled={statementPreviewLoadingId === record.statementId}
                            onClick={() => onOpenStatement(record.statementId!)}
                            aria-label={`Otevřít zdrojový výpis ${record.statementNumber || ""} pro ${installment.label}`}>
                            <Eye size={13} aria-hidden="true" />
                            {statementPreviewLoadingId === record.statementId ? "Načítám…" : `Výpis ${record.statementNumber || "– náhled"}`}
                          </button>
                        ))}
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1 text-sm font-semibold text-slate-950">
                    <span>{formatMoney(installment.amount)}</span>
                    {installment.plan.adjustment ? renderPaidRemainder(installment.plan)
                      : installment.state.paidAmount > 0 && <span className={styles.installmentMeta}>Z výpisů {formatMoney(installment.state.paidAmount)}</span>}
                    {renderPayoutStatusChip(installment.state.status, installment.state.paidAmount, installment.amount, installment.state.records, Boolean(installment.plan.adjustment))}
                  </span>
                </div>
              );
            })}
          </div>
        </details>
      );
    }

    if (recurringInstallments.length > 0) {
      const installments = recurringInstallments.map((installment) => {
        const installmentPlan = projectCommissionRow(
          installment.amount, payoutsForRecurringInstallment(payoutsForRows, installment), payoutTargetsForInstallment(installment), installment.anniversaryYears,
          installment.commissionPeriod
        );
        return { ...installment, amount: installmentPlan.amount, plan: installmentPlan };
      });
      const paidInstallments = installments.filter(({ plan }) => plan.state.status === "paid").length;
      const recurringTotal = installments.reduce((sum, installment) => sum + installment.amount, 0);

      return (
        <details key={key} className="group">
          <summary
            className={`${commissionRowClass} cursor-pointer list-none transition hover:border-slate-400 hover:bg-slate-100 [&::-webkit-details-marker]:hidden`}
          >
            <span className="flex min-w-0 items-start gap-2.5 text-sm font-medium text-slate-900 sm:items-center sm:text-base">
              <span className={styles.icon}>
                <RowIcon size={18} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <span className="min-w-0 leading-tight [overflow-wrap:anywhere]">
                <span>{cleanResultTitle(item.title)}</span>
                <span className="ml-2 inline-flex align-middle rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                  {recurringInstallments.length}x
                </span>
                <span className="mt-1 block text-xs font-medium text-slate-500">
                  Vyplaceno {paidInstallments}/{recurringInstallments.length} · celkem {formatMoney(recurringTotal)}
                </span>
              </span>
            </span>
            <span className="flex items-center justify-end gap-2 whitespace-nowrap text-right text-base font-semibold text-slate-900">
              {installmentAmountLabel(installments, item.amount)}
              <ChevronDown
                size={18}
                strokeWidth={2.2}
                className="shrink-0 text-slate-500 transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
            </span>
          </summary>

          <div className={styles.breakdown}>
            {installments.map((installment) => {
              const installmentState = installment.plan.state;

              return (
                <div
                  key={installment.key}
                  className={`${styles.breakdownRow} ${payoutRowClass(installmentState.status)}`}
                >
                  <span className="min-w-0 text-sm font-medium text-slate-800">
                    <span>
                      {installment.label}
                      {installment.code ? ` · ${installment.code}` : ""}
                    </span>
                    {renderPremiumAdjustment(installment.plan)}
                    {renderPayoutRecordHint(installmentState.records)}
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1 whitespace-nowrap pt-0.5 text-sm font-semibold text-slate-950">
                    <span>{formatMoney(installment.amount)}</span>
                    {renderPaidRemainder(installment.plan)}
                    {renderPayoutStatusChip(
                      installmentState.status,
                      installmentState.paidAmount,
                      validPayoutAmount(installment.amount),
                      installmentState.records,
                      Boolean(installment.plan.adjustment)
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </details>
      );
    }

    const content = (
      <>
        <span className="flex min-w-0 items-start gap-2.5 text-sm font-medium text-slate-900 sm:items-center sm:text-base">
          <span className={styles.icon}>
            <RowIcon size={18} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <span className="min-w-0 leading-tight [overflow-wrap:anywhere]">
            <span>{cleanResultTitle(item.title)}</span>
            {renderPremiumAdjustment(plan)}
            {itemNote && (
              <span className="mt-1 block text-xs font-semibold text-red-600">
                {itemNote}
              </span>
            )}
            {payoutCodes.length > 0 && renderPayoutRecordHint(payoutState.records)}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1 whitespace-nowrap text-right text-base font-semibold text-slate-900">
          <span>{formatMoney(plan.amount)}</span>
          {renderPaidRemainder(plan)}
          {payoutCodes.length > 0 &&
            renderPayoutStatusChip(
              payoutState.status,
              payoutState.paidAmount,
              plan.amount,
              payoutState.records,
              Boolean(plan.adjustment)
            )}
        </span>
      </>
    );

    if (!clickable || plan.adjustment) {
      return (
        <div key={key} className={plan.adjustment ? commissionRowClass : rowClass}>
          {content}
        </div>
      );
    }

    return (
      <button
        key={key}
        type="button"
        className={rowClass}
        onClick={() => onOpenNeonImmediateBreakdown(item, position, commissionMode)}
      >
        {content}
      </button>
    );
  };

  const renderCommissionRows = (
    commissionItems: CommissionResultItemDTO[],
    position: Position | null | undefined,
    commissionMode: CommissionMode | null | undefined,
    keyPrefix: string,
    payoutsForRows: ContractCommissionPayout[]
  ) => {
    const splitImmediateItems =
      isSplitImmediateProduct(product)
        ? commissionItems.filter((item) => isSplitImmediateComponentTitle(item.title))
        : [];
    const hasSplitImmediate = splitImmediateItems.length > 0;
    const regularCommissionItems = hasSplitImmediate
      ? commissionItems.filter(
          (item) =>
            !isSplitImmediateComponentTitle(item.title) &&
            !isLegacyImmediateTotalTitle(item.title)
        )
      : commissionItems;

    return (
      <>
        <div className={styles.tableHeading} aria-hidden="true">
          <span>Složka provize</span>
          <span>Částka / stav</span>
        </div>
        {hasSplitImmediate &&
          renderSplitImmediateGroup(
            splitImmediateItems,
            `${keyPrefix}-split-immediate`,
            payoutsForRows
          )}
        {regularCommissionItems.map((item, idx) =>
          renderCommissionRow(
            item,
            position,
            commissionMode,
            `${keyPrefix}-${idx}-${item.title}`,
            payoutsForRows
          )
        )}
      </>
    );
  };

  const renderCommissionWarning = () =>
    trimmedCommissionWarning ? (
      <div className="mb-3 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-semibold leading-relaxed text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} />
        <span>{trimmedCommissionWarning}</span>
      </div>
    ) : null;

  return (
    <div className="space-y-4">
      {showAnyMeziprovision && (
        <section className="space-y-3">
          {meziprovisionCards.map((card) => {
            const isExpanded = expandedMeziprovisionKeys.includes(card.key);
            const cardPayouts = payoutsForWriter(card.email ?? normalizedViewerEmail);
            const cardSummary = isExpanded ? commissionSummary(card.items, cardPayouts, card.totalDisplay, card.totals) : null;
            return (
              <div key={card.key} className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => onToggleMeziprovisionCard(card.key)}
                  aria-expanded={isExpanded}
                  className={`${collapsibleButtonClass} ${
                    isExpanded ? "border-slate-900 bg-slate-50" : ""
                  }`}
                >
                  <span className="truncate text-left">Meziprovize: {card.userName}</span>
                  <ChevronDown
                    size={16}
                    className={`shrink-0 text-slate-500 transition-transform ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                    aria-hidden="true"
                  />
                </button>

                {isExpanded && (
                  <div className="space-y-2.5">
                    <h4
                      className={`flex flex-wrap items-center gap-2 text-base font-semibold ${monoHeadingClass}`}
                    >
                      <span className={monoChipClass}>Meziprovize</span>
                      Meziprovize: {card.userName}
                      {card.position && (
                        <span className="ml-1 text-sm text-slate-700">
                          ({positionLabel(card.position)})
                        </span>
                      )}
                    </h4>

                    <div className={commissionPanelClass}>
                      <div className={styles.rows}>
                        {renderCommissionRows(
                          card.items,
                          card.position,
                          card.mode,
                          card.key,
                          cardPayouts
                        )}
                      </div>

                      {!hideAnnualAutoTotals && (
                        <div className={commissionTotalHighlightClass}>
                          {isPaymentBasedProduct && card.totals ? (
                            <div className="w-full space-y-2">
                              <div className={commissionTotalLineClass}>
                                <span className={commissionTotalLabelClass}>Celkem v 1. roce</span>
                                <span className={commissionTotalValueClass}>
                                  {formatMoney(cardSummary?.immediate ?? card.totals.immediate)}
                                </span>
                              </div>
                              <div className={commissionTotalLineClass}>
                                <span className={commissionTotalLabelClass}>Celkem následně ročně</span>
                                <span className={commissionTotalValueClass}>
                                  {cardSummary?.subsequent ?? formatMoney(card.totals.subsequent)}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className={`${commissionTotalLineClass} w-full`}>
                              <span className={commissionTotalLabelClass}>Celkem meziprovize</span>
                              <span className={commissionTotalValueClass}>
                                {formatMoney(cardSummary?.total ?? card.totalDisplay)}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      {isOwnContract ? (
        <section className="space-y-3">
          <ContractSectionHeading
            icon={<Coins size={17} strokeWidth={2.2} aria-hidden="true" />}
          >
            Výpočet provizí
          </ContractSectionHeading>
          <div className={commissionPanelClass}>
            {renderCommissionWarning()}
            <div className={styles.rows}>
              {renderCommissionRows(
                adviserItems,
                adviserBreakdownPosition,
                adviserBreakdownMode,
                "adviser-own",
                adviserPayouts
              )}
            </div>

            {!hideAnnualAutoTotals && (
              <div className={commissionTotalHighlightClass}>
                {isPaymentBasedProduct && paymentBasedAdviserTotals ? (
                  <div className="w-full space-y-2">
                    <div className={commissionTotalLineClass}>
                      <span className={commissionTotalLabelClass}>Celkem v 1. roce</span>
                      <span className={commissionTotalValueClass}>
                        {formatMoney(adviserSummary.immediate)}
                      </span>
                    </div>
                    <div className={commissionTotalLineClass}>
                      <span className={commissionTotalLabelClass}>Celkem následně ročně</span>
                      <span className={commissionTotalValueClass}>
                        {adviserSummary.subsequent}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className={`${commissionTotalLineClass} w-full`}>
                    <span className={commissionTotalLabelClass}>Celkem</span>
                    <span className={commissionTotalValueClass}>
                      {formatMoney(adviserSummary.total)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      ) : (
        <section className="space-y-3">
          <button
            type="button"
            onClick={onToggleAdvisorDetails}
            aria-expanded={showAdvisorDetails}
            className={`${collapsibleButtonClass} ${
              showAdvisorDetails ? "border-slate-900 bg-slate-50" : ""
            }`}
          >
            <span className="truncate text-left">Provize sjednatele: {contractAuthorName}</span>
            <ChevronDown
              size={16}
              className={`shrink-0 text-slate-500 transition-transform ${
                showAdvisorDetails ? "rotate-180" : ""
              }`}
              aria-hidden="true"
            />
          </button>

          {showAdvisorDetails && (
            <div className={commissionPanelClass}>
              {renderCommissionWarning()}
              <div className={styles.rows}>
                {renderCommissionRows(
                  adviserItems,
                  adviserBreakdownPosition,
                  adviserBreakdownMode,
                  "adviser-team",
                  adviserPayouts
                )}
              </div>

              {!hideAnnualAutoTotals && (
                <div className={commissionTotalHighlightClass}>
                  {isPaymentBasedProduct && paymentBasedAdviserTotals ? (
                    <div className="w-full space-y-2">
                      <div className={commissionTotalLineClass}>
                        <span className={commissionTotalLabelClass}>Celkem v 1. roce</span>
                        <span className={commissionTotalValueClass}>
                          {formatMoney(adviserSummary.immediate)}
                        </span>
                      </div>
                      <div className={commissionTotalLineClass}>
                        <span className={commissionTotalLabelClass}>Celkem následně ročně</span>
                        <span className={commissionTotalValueClass}>
                          {adviserSummary.subsequent}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className={`${commissionTotalLineClass} w-full`}>
                      <span className={commissionTotalLabelClass}>Celkem</span>
                      <span className={commissionTotalValueClass}>
                        {formatMoney(adviserSummary.total)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {payoutDifferenceExplanation ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setPayoutDifferenceExplanation(null);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="payout-difference-explanation-title"
            className="flex max-h-[calc(100dvh-3rem)] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.32)]"
          >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 bg-linear-to-br from-violet-50/80 via-white to-white px-5 py-5 sm:px-6">
              <div className="flex min-w-0 items-start gap-3">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-violet-200/70 bg-white text-violet-600 shadow-sm">
                  <FileSearch size={21} strokeWidth={1.8} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h3
                    id="payout-difference-explanation-title"
                    className="text-lg font-bold tracking-tight text-slate-950"
                  >
                    Vysvětlení nesrovnalosti
                  </h3>
                  {payoutDifferenceExplanation.sourceLabel ? (
                    <p className="mt-1 flex items-start gap-1.5 text-xs leading-5 text-slate-500">
                      <FileText size={13} className="mt-1 shrink-0" aria-hidden="true" />
                      Zapsáno z {payoutDifferenceExplanation.sourceLabel}
                    </p>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPayoutDifferenceExplanation(null)}
                className="ui-focus inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
                aria-label="Zavřít vysvětlení nesrovnalosti"
              >
                <X size={17} strokeWidth={2.4} aria-hidden="true" />
              </button>
            </div>

            <div className="min-h-0 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
              <PayoutDifferenceExplanationContent
                detail={payoutDifferenceExplanation.detail}
                reasonLabel={payoutDifferenceExplanation.reasonLabel}
              />
            </div>

            <div className="flex shrink-0 justify-end border-t border-slate-100 bg-slate-50/70 px-5 py-3.5 sm:px-6">
              <button
                type="button"
                onClick={() => setPayoutDifferenceExplanation(null)}
                className="ui-focus inline-flex h-10 items-center justify-center rounded-xl bg-violet-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700"
              >
                Zavřít
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
