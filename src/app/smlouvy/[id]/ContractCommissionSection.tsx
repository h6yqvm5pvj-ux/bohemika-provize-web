import { applyAutoCommissionForecasts } from "@/app/cashflow/autoCommissionForecast";
import { PAYOUT_EXCEPTION_POSITION, payoutExceptionStatementMonth, payoutPositionException } from "@/app/lib/payoutPositionException";
import { autoCommissionPolicyYear, createAutoCommissionForecast, type AutoCommissionForecast } from "@/app/lib/autoCommissionForecast";
import { projectConfirmedCommissionCodes } from "@/app/lib/commissionPayoutCodeAdjustment";
import { autoFrequencyCommissionMultiplier, cppPaymentCommissionMultiplier } from "@/app/lib/autoPaymentFrequency";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, Banknote, ChartNoAxesColumnIncreasing, CalendarDays, ChevronDown, Coins, Eye, FileSearch, FileText, Info, Repeat2, X } from "lucide-react";
import styles from "./contractCommission.module.css";
import { CommissionPayoutSummaryDialog } from "./CommissionPayoutSummaryDialog";
import { payoutCents, summarizeCommissionPayouts, type CommissionPayoutComparison } from "./commissionPayoutComparison";
import { CommissionComparisonRow } from "./CommissionComparisonRow";
import { PayoutDifferenceExplanationContent } from "./PayoutDifferenceExplanationContent";
import { acquisitionCommissionInstallments, payoutsForAcquisitionInstallment } from "./contractCommissionInstallments";
import { projectAcquisitionInstallmentReceipts } from "@/app/lib/acquisitionInstallmentCoverage";
import { splitConfirmedOpeningReceipt } from "@/app/lib/confirmedQuarterlyInstallments";

import { baseCommissionCodeForPayoutComparison } from "@/app/lib/commissionPayoutRules";
import { isNeonRecurringStatementCode } from "@/app/lib/neonRecurringStatementBase";
import { neonCareInstallments } from "@/app/lib/neonCarePayoutCodes";
import {
  activePayoutRecordsAfterFullStornos, commissionStatementDay, COMMISSION_PAYOUT_AMOUNT_TOLERANCE, contractStornoDeductionKind, isStornoPayoutRecord,
  neonEndorsementForOriginalPayout, uniqueFamilyCommissionReceipts, validPayoutAmount, wasNeonCommissionSettledBefore,
} from "@/app/lib/commissionReceipts";
import { createEndorsementCommissionPlan, endorsementCommissionDay } from "@/app/lib/endorsementCommissionPlan";
import { commissionPeriodAfterMonths, commissionPeriodForCode } from "@/app/lib/commissionPeriodForCode";
import { contractLifecycleStatus } from "@/app/lib/contractLifecycle";
import {
  installmentCommissionScheduleFromCode,
  isAutoSubsequentCommissionCode,
} from "@/app/lib/productFormulas/autoCommission";
import { periodsPerYear } from "@/app/lib/productFormulas/shared";
import { MAX_CIZIN_KOMPLEX_IMMEDIATE_CODE } from "@/app/lib/productFormulas/maxcizinkomplex";
import { estimateLifeFirstPayoutDate, estimatePayoutDate, generateCashflow } from "@/app/cashflow/generator";
import { neonCorrectionPayoutAmount, neonExpectedStatementMonth } from "@/app/lib/neonCorrection";
import { toDate } from "@/app/lib/formatters";
import {
  type CommissionMode,
  type CommissionResultItemDTO,
  type PaymentFrequency,
  type Position,
  type Product,
} from "../../types/domain";
import {
  cleanResultTitle,
  computeTotalWithMultipliers,
  formatDate,
  formatMoney,
  nameFromEmail,
  positionLabel,
  stripTotalRows,
} from "./contractDetailHelpers";
import { isAnnualAutoPayoutProduct, isLifeProduct } from "@/app/lib/productCatalog";
import {
  hasNeonImmediateCoefficient,
} from "./contractDetailLogic";
import { type ContractCommissionPayout, type ContractDoc } from "./contractDetailTypes";
import { isLifeIncreaseCode, isNeonPremiumIncreaseComponent, lifeIncreaseExpectedAmount, lifeIncreaseItemCode, normalizeLifeCommissionItemCode } from "@/app/lib/lifePremiumIncrease";
import { ContractSectionHeading } from "./ContractDetailUi";
import { neonCommissionFamily } from "./contractTimelineDetails";

export { isStornoPayoutRecord } from "@/app/lib/commissionReceipts";

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
  consolidateNeonAmendments?: boolean;
  onOpenStatement?: (statementId: string, commissionCodes?: string[]) => void;
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
    commissionMode: CommissionMode | null | undefined,
    source?: ContractDoc,
  ) => void;
};

const CommissionPositionBadge = ({ position }: { position: Position }) => (
  <span
    className={styles.positionBadge}
    data-current={position === PAYOUT_EXCEPTION_POSITION}
  >{positionLabel(position)}</span>
);

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

export type CommissionPayoutReadStatus = "pending" | "paid" | "partial" | "difference" | "storno" | "cancelled";

const cancelledCommissionLabel = "Po stornu se neočekává";

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
    if (product === "maxcizinkomplex") return [MAX_CIZIN_KOMPLEX_IMMEDIATE_CODE, cleanTitle];
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

const policyYearForAutoInstallment = (
  installment: CommissionInstallment,
  product: Product | undefined,
  frequency: PaymentFrequency | null | undefined,
  start?: unknown,
): number | null => {
  if (!isAutoCommissionProduct(product)) return null;
  const datedYear = installment.commissionPeriod && autoCommissionPolicyYear({ policyStartDate: start }, installment.commissionPeriod);
  if (datedYear) return datedYear;
  const annualSchedule = isAnnualAutoPayoutProduct(product) ||
    product === "uniqaAuto" || product === "uniqaflotila";
  const schedule = installment.code
    ? installmentCommissionScheduleFromCode(
      normalizePayoutCode(installment.code, product), annualSchedule ? "annual" : frequency
    )
    : null;
  if (schedule?.phase === "subsequent") return schedule.policyYearNumber;
  return installment.anniversaryYears > 0 ? installment.anniversaryYears : null;
};

const payoutRecordsForCodes = (
  payouts: ContractCommissionPayout[],
  codes: string[],
  product?: Product,
  lifeEndorsement = false
): ContractCommissionPayout[] => {
  const normalizeTarget = (value: string | null | undefined) => {
    const code = normalizePayoutCode(value, product);
    return lifeEndorsement ? normalizeLifeCommissionItemCode(code) : code;
  };
  const normalizedCodes = new Set(codes.map(normalizeTarget).filter(Boolean));
  if (normalizedCodes.size === 0) return [];

  return payouts.filter((payout) => {
    const payoutTargets = [
      normalizeTarget(lifeEndorsement ? lifeIncreaseItemCode(payout.code) ?? payout.code : payout.code),
      ...(!payout.statementCode ? [normalizePayoutCode(payout.key, product), normalizePayoutCode(payout.title, product)] : []),
    ].filter(Boolean);

    return payoutTargets.some((target) => normalizedCodes.has(target));
  });
};

const payoutTargetsForInstallment = (installment: CommissionInstallment): string[] =>
  installment.code ? [installment.code, installment.key] : [installment.key];

const expectedAmountFromPayoutRecords = (
  records: ContractCommissionPayout[],
  product: Product | undefined,
  codes: string[]
): number | null => {
  const neonRecurring = product === "neon" && codes.some(isNeonRecurringStatementCode);
  if (!neonRecurring && !isAutoCommissionProduct(product)) return null;

  const activeRecords = activePayoutRecordsAfterFullStornos(records, product);
  const nonStornoRecords = activeRecords.filter((record) => !isStornoPayoutRecord(record));
  const subsequent = codes.some((code) => isAutoSubsequentCommissionCode(normalizePayoutCode(code, product)));
  const reassignedAcquisition = product === "cppAuto" && nonStornoRecords.every((record) =>
    (record.installmentSourceCode === "A101" && record.statementCode === "A101") ||
    (/^A10[2-4]$/.test(normalizePayoutCode(record.code, product)) &&
      /^B10[1-3]$/.test(normalizePayoutCode(record.statementCode, product)))
  );
  if (
    (!neonRecurring && !subsequent && !reassignedAcquisition) || nonStornoRecords.length === 0 ||
    nonStornoRecords.some((record) =>
      typeof record.expectedAmount !== "number" || !Number.isFinite(record.expectedAmount) || record.expectedAmount < 0
    )
  ) {
    return null;
  }

  const latestRecord = [...nonStornoRecords].sort(
    (left, right) => payoutRecordSortValue(right) - payoutRecordSortValue(left)
  )[0];
  return latestRecord ? Math.round(latestRecord.expectedAmount! * 100) / 100 : null;
};

export const payoutStatusForCodes = (
  payouts: ContractCommissionPayout[],
  codes: string[],
  expectedAmount: number,
  product?: Product,
  lifeEndorsement = false
): {
  status: CommissionPayoutReadStatus;
  paidAmount: number;
  records: ContractCommissionPayout[];
} => {
  const records = payoutRecordsForCodes(payouts, codes, product, lifeEndorsement);
  const activeRecords = activePayoutRecordsAfterFullStornos(records, product);
  const nonStornoRecords = activeRecords.filter((record) => !isStornoPayoutRecord(record));
  const paidAmount = nonStornoRecords.reduce(
    (sum, record) => sum + validPayoutAmount(record.amount),
    0
  );
  const hasStorno = records.some(isStornoPayoutRecord);
  const displayRecords = nonStornoRecords.length > 0 ? activeRecords : records;
  const recordedExpectedAmount = expectedAmountFromPayoutRecords(displayRecords, product, codes);
  const comparisonExpectedAmount = recordedExpectedAmount ?? expectedAmount;
  const hasRecordedDifference = nonStornoRecords.some((record) => record.status === "difference");

  if (hasRecordedDifference) {
    return { status: "difference", paidAmount, records: displayRecords };
  }

  if (
    paidAmount > 0 &&
    paidAmount >= Math.max(0, comparisonExpectedAmount - COMMISSION_PAYOUT_AMOUNT_TOLERANCE)
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
    case "difference":
      return "Rozdíl";
    case "storno":
      return "Storno";
    case "cancelled":
      return cancelledCommissionLabel;
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
    case "difference":
      return "border-rose-200 bg-rose-50 text-rose-800";
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
    : status === "difference"
      ? "border-rose-200 bg-rose-50/70"
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

type CommissionForecastRange = { minimum: number; maximum: number };

const combinedForecastRange = (
  ranges: CommissionForecastRange[]
): CommissionForecastRange | null => ranges.length === 0
  ? null
  : {
      minimum: Math.round(ranges.reduce((sum, range) => sum + range.minimum, 0) * 100) / 100,
      maximum: Math.round(ranges.reduce((sum, range) => sum + range.maximum, 0) * 100) / 100,
    };

const formatCommissionForecastRange = (range: CommissionForecastRange): string =>
  range.minimum === range.maximum ? formatMoney(range.minimum)
    : `${formatMoney(range.minimum).replace(/\s*Kč$/, "")}–${formatMoney(range.maximum)}`;

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
  originalPositionAmount?: number;
  estimatedLatePayout?: boolean;
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
  consolidateNeonAmendments = false,
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
  const [showPayoutSummary, setShowPayoutSummary] = useState(false);
  const normalizedViewerEmail = normalizeEmail(viewerEmail);
  const normalizedOwnerEmail = normalizeEmail(contractOwnerEmail);
  const trimmedCommissionWarning = commissionWarning?.trim() || null;
  const premiumPlan = createEndorsementCommissionPlan(commissionTimeline);
  const planEntry = commissionEntry
    ? { ...commissionEntry, userEmail: commissionEntry.userEmail ?? normalizedOwnerEmail }
    : null;
  const commissionStart = policyStartDate ?? commissionEntry?.policyStartDate ?? commissionEntry?.contractSignedDate;
  const plannedPayoutLabel = (codes: string[], source?: ContractDoc): string => {
    if (!isLifeProduct(product)) return "";
    const code = codes.map(code => lifeIncreaseItemCode(code) ?? normalizeLifeCommissionItemCode(code))
      .find(code => /^(?:B3601|B4801|B(?:36|036|3601)_HALF|B[12]\d{2})$/.test(code));
    if (!code) return "";
    const entry = source ?? commissionEntry;
    const startDay = endorsementCommissionDay(source ? source.policyStartDate : commissionStart);
    if (!startDay) return "";
    const start = new Date(`${startDay}T12:00:00`);
    let payout: Date | undefined;
    if (product === "neon" && /^B20[1-6]$/.test(code)) {
      payout = neonCareInstallments(start, entry?.durationYears ?? contractDurationYears, entry?.acquisitionType === "inherited")
        .find(installment => installment.code === code)?.due;
    } else if (code.endsWith("_HALF")) {
      const signed = endorsementCommissionDay(entry?.contractSignedDate);
      const created = endorsementCommissionDay(entry?.createdAt);
      payout = signed ? estimateLifeFirstPayoutDate(start, new Date(`${signed}T12:00:00`), product)
        : estimatePayoutDate(start, created ? new Date(`${created}T12:00:00`) : null);
    } else {
      const period = commissionPeriodForCode({ productKey: product, policyStartDate: startDay }, code);
      if (period) payout = estimatePayoutDate(new Date(`${period}T12:00:00`));
    }
    return payout ? ` · plánovaná výplata ${payout.getFullYear()}` : "";
  };
  const today = new Date();
  const todayDay = endorsementCommissionDay(today) ?? "";
  const cancellation = contractLifecycleStatus(commissionEntry, today) === "storno"
    ? { effectiveDate: endorsementCommissionDay(commissionEntry?.stornoDate) } : undefined;
  const cancellationCutoff = cancellation && (cancellation.effectiveDate ?? todayDay);
  const currentPolicyYear = isAutoCommissionProduct(product)
    ? autoCommissionPolicyYear({ policyStartDate: commissionStart }, todayDay) : null;
  const nextPolicyYear = currentPolicyYear === null ? null : currentPolicyYear + 1;
  const normalizedCommissionPayouts = planEntry && (paymentFrequency === "semiannual" || product === "neon")
    ? projectConfirmedCommissionCodes({ ...planEntry, productKey: product, frequencyRaw: paymentFrequency,
      policyStartDate: product === "neon" ? policyStartDate ?? planEntry.policyStartDate : commissionStart,
      items: adviserItems }, commissionPayouts ?? []) : commissionPayouts ?? [];
  const amendmentEntries = consolidateNeonAmendments && planEntry ? uniqueFamilyCommissionReceipts(neonCommissionFamily(
    { ...planEntry, commissionPayouts: normalizedCommissionPayouts }, commissionTimeline, normalizedOwnerEmail,
  )) : [];
  const hasNeonAmendments = amendmentEntries.length > 1;
  const panelClass = hasNeonAmendments ? `${commissionPanelClass} ${styles.neonCommissionPanel}` : commissionPanelClass;
  const neonAdjustments = (entry: ContractDoc, amount: number, payouts: ContractCommissionPayout[],
    codes: string[], period: string | null) => {
    if (product !== "neon" || entry.entryType === "endorsement" || !codes.some(code => isNeonPremiumIncreaseComponent(normalizePayoutCode(code, product)))) return [];
    const receipts = payoutRecordsForCodes(payouts, codes, product);
    const through = period && period > todayDay ? period : todayDay;
    return premiumPlan.neonOpenCommissionAdjustments(entry, amount, through,
      day => wasNeonCommissionSettledBefore(receipts, day, period));
  };
  const projectCommissionRow = (
    amount: number,
    payouts: ContractCommissionPayout[],
    codes: string[],
    anniversaryYears = 0,
    commissionPeriod?: string | null,
    own = false,
    source?: ContractDoc,
  ): CommissionRowPlan => {
    const sourceEntry = source ?? planEntry;
    const sourceStart = source?.policyStartDate ?? commissionStart;
    const lifeEndorsement = sourceEntry?.entryType === "endorsement" &&
      ["neon", "flexi", "maximaMaxEfekt"].includes(product ?? "");
    const normalizedCodes = new Set(codes.map(code => normalizePayoutCode(code, product)).filter(Boolean));
    const autoSubsequent = isAutoCommissionProduct(product) &&
      [...normalizedCodes].some(isAutoSubsequentCommissionCode);
    const period = commissionPeriod === undefined
      ? commissionPeriodAfterMonths(sourceStart, anniversaryYears * 12)
      : commissionPeriod;
    const frequencyRepriced = product !== "cppPPRs" && !autoSubsequent && Boolean(planEntry && period &&
      (product === "domex" ? cppPaymentCommissionMultiplier : autoFrequencyCommissionMultiplier)(planEntry, period) !== 1);
    const correction = sourceEntry?.productKey === "neon" && sourceEntry.neonCorrection;
    if (correction && sourceEntry && period) {
      const settled = payoutStatusForCodes(payouts, codes, 0, product, lifeEndorsement).records
        .find(record => !isStornoPayoutRecord(record) && validPayoutAmount(record.amount) > 0);
      const policyPeriod = toDate(period);
      const start = commissionPeriodAfterMonths(sourceStart, 0);
      const signed = toDate(sourceEntry.contractSignedDate);
      const planned = policyPeriod && (period === start && signed
        ? estimateLifeFirstPayoutDate(policyPeriod, signed, "neon") : estimatePayoutDate(policyPeriod));
      const reportPeriod = settled?.statementPeriod ?? (planned ? neonExpectedStatementMonth(planned) : null);
      amount = neonCorrectionPayoutAmount(sourceEntry, amount, reportPeriod);
    }
    const neonAdjustment = sourceEntry ? neonAdjustments(sourceEntry, amount, payouts, codes, period).at(-1) : undefined;
    // Compare with the corrected plan while retaining the original receipts.
    const comparablePayouts = frequencyRepriced || correction || neonAdjustment
      ? payoutRecordsForCodes(payouts, codes, product, lifeEndorsement).map(record => {
        const staleAmountComparison = record.status === "difference" &&
          (!record.differenceReason || record.differenceReason === "commission_amount_mismatch");
        const rebasedComparison = neonAdjustment && !isStornoPayoutRecord(record) && record.differenceReason !== "career_mismatch";
        return { ...record, expectedAmount: undefined, difference: undefined,
          ...(staleAmountComparison || rebasedComparison ? { status: undefined, differenceReason: null, detail: null } : {}) };
      }) : payouts;
    const state = payoutStatusForCodes(comparablePayouts, codes, autoSubsequent ? 0 : neonAdjustment?.amount ?? amount, product, lifeEndorsement);
    if (cancellationCutoff && state.status === "pending" && state.records.length === 0) {
      const scheduledPeriod = commissionPeriod === undefined && anniversaryYears === 0
        ? codes.map(code => commissionPeriodForCode({ ...sourceEntry, productKey: product,
          frequencyRaw: sourceEntry?.frequencyRaw ?? paymentFrequency, policyStartDate: sourceStart }, code)).find(Boolean) ?? period
        : period;
      if (scheduledPeriod && scheduledPeriod >= cancellationCutoff) {
        return { amount, state: { ...state, status: "cancelled" }, adjustment: null };
      }
    }
    if (neonAdjustment) return { amount: neonAdjustment.amount, state, adjustment: neonAdjustment };
    if (autoSubsequent) {
      state.status = state.paidAmount > 0 ? "paid" : state.status === "storno" ? "storno" : "pending";
    }
    const recordedExpectedAmount = autoSubsequent ? null : expectedAmountFromPayoutRecords(state.records, product, codes);
    if (recordedExpectedAmount != null) {
      return { amount: recordedExpectedAmount, state, adjustment: null };
    }

    const adjustment = state.status !== "paid" && !autoSubsequent && sourceEntry && period
      ? premiumPlan.adjust(sourceEntry, amount, period)
      : null;
    const revised = own && !source && period && state.status === "pending" && state.records.length === 0
      ? revisedPayouts.filter(payout => payout.commissionPeriodStart === period &&
        [payout.commissionCode, ...(payout.commissionCodeAliases ?? [])]
          .some(code => normalizedCodes.has(normalizePayoutCode(code, product))))
      : [];
    if (revised.length === 1) {
      const payout = revised[0];
      return { amount: payout.amount, originalPositionAmount: payout.originalPositionAmount,
        estimatedLatePayout: payout.repricedAmountIfShifted != null, state, adjustment };
    }
    const expectedAmount = adjustment?.amount ?? amount;
    return {
      amount: expectedAmount,
      state: adjustment ? payoutStatusForCodes(comparablePayouts, codes, expectedAmount, product, lifeEndorsement) : state,
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
  const renderPositionBadges = (records: ContractCommissionPayout[], own: boolean) => {
    if (!own || !planEntry || !payoutPositionException(planEntry, "2026-01")) return null;
    const original = planEntry.originalPosition ?? planEntry.position;
    const positions = new Set<Position>();
    for (const record of records) {
      const level = Number(record.career?.match(/\d+/)?.[0]);
      if (level >= 1 && level <= 10) {
        positions.add(`poradce${level}` as Position);
      } else {
        const month = payoutExceptionStatementMonth(record.statementPeriod, record.payoutMonthKey ?? null);
        if (month && original) positions.add(payoutPositionException(planEntry, month) ?? original);
      }
    }
    if (!records.length && original) positions.add(original);
    return [...positions].map(position => <CommissionPositionBadge key={position} position={position} />);
  };
  const renderCommissionAmounts = (plan: CommissionRowPlan, own: boolean) => {
    if (plan.state.status === "cancelled") return null;
    const hasRecordedPayment = plan.state.status !== "storno" && plan.state.records.some((record) =>
      !isStornoPayoutRecord(record) && typeof record.amount === "number" && Number.isFinite(record.amount)
    );
    const remainingAmount = plan.state.status === "partial" ? formatMoney(Math.max(0, plan.amount - plan.state.paidAmount)) : null;
    return (
      <>
        <span>{hasRecordedPayment || hasNeonAmendments ? "Očekáváno " : ""}{formatMoney(plan.amount)}</span>
        {plan.originalPositionAmount == null ? renderPositionBadges(plan.state.records, own) : (
          <>
            <CommissionPositionBadge position={PAYOUT_EXCEPTION_POSITION} />
            {plan.estimatedLatePayout && (
              <span className="whitespace-normal text-xs font-medium text-slate-600">Odhad při výplatě od ledna 2026</span>
            )}
            <details className="max-w-full whitespace-normal text-xs font-medium text-slate-600">
              <summary className="inline-flex cursor-pointer items-center gap-1">
                <Info size={13} aria-hidden="true" /> Porovnat výpočet
              </summary>
              <div>Původní výpočet · {positionLabel(planEntry?.originalPosition ?? planEntry?.position)} · {formatMoney(plan.originalPositionAmount)}</div>
              <div>Aktuální výpočet · Poradce 10 · {formatMoney(plan.amount)}</div>
            </details>
          </>
        )}
        {hasRecordedPayment && (
          <>
            <span className="block text-xs font-medium text-slate-600">
              {plan.adjustment && !hasNeonAmendments ? "Z výpisů" : "Vyplaceno"} {formatMoney(plan.state.paidAmount)}
              {plan.adjustment && !hasNeonAmendments && remainingAmount
                ? ` · zbývá ${remainingAmount}`
                : ""}
            </span>
            {hasNeonAmendments && remainingAmount && (
              <span className="text-xs font-medium text-amber-800">
                Zbývá {remainingAmount}
              </span>
            )}
          </>
        )}
      </>
    );
  };
  const payoutsForRecurringInstallment = (payouts: ContractCommissionPayout[], installment: CommissionInstallment, entry: ContractDoc | null = planEntry) =>
    !installment.requirePeriodMatch ? payouts : payouts.filter((record) => entry &&
      commissionPeriodForCode(entry, record.code || record.key || record.title) === installment.commissionPeriod);
  const recurringInstallmentsForItem = (item: CommissionResultItemDTO, source?: ContractDoc): CommissionInstallment[] => {
    const entry = source ?? planEntry;
    const duration = source?.durationYears ?? contractDurationYears;
    const existing = recurringInstallmentsForCommissionItem(item, product, duration);
    if (existing.length > 0 || !entry || !/následná|pečovatelská/i.test(item.title)) return existing;
    // Use the cashflow schedule so generic subsequent commissions expose the
    // same B codes and payment periods as the forecast. The projection below
    // applies premium changes to each installment exactly once.
    const schedule = generateCashflow([{
      ...entry, payoutPositionOverride: null, neonCorrection: null, items: [item], commissionPayouts: [], cashflowPayoutMatches: [], source: "own",
    }], Math.min(80, Math.max(10, duration ?? 10)), normalizedOwnerEmail, new Date(), []);
    let subsequentIndex = 0;
    const installments = schedule.flatMap((scheduled): CommissionInstallment[] => {
      const code = normalizePayoutCode(scheduled.commissionCode, product);
      if (!/^B(?:C)?\d+$/.test(code)) return [];
      const period = scheduled.commissionPeriodStart ?? commissionPeriodForCode(entry, scheduled.commissionCode);
      return !period ? [] : [{
        key: `period-${period}-${code}`,
        code,
        label: `${++subsequentIndex}. splátka`, amount: scheduled.amount, anniversaryYears: 0, commissionPeriod: period,
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
    return installments;
  };
  const isAutoSubsequentInstallment = (installment: CommissionInstallment): boolean =>
    isAutoCommissionProduct(product) &&
    Boolean(installment.code && isAutoSubsequentCommissionCode(normalizePayoutCode(installment.code, product)));
  const autoForecastCache = new WeakMap<ContractCommissionPayout[], WeakMap<CommissionResultItemDTO[], ReturnType<typeof createAutoCommissionForecast>>>();
  const autoProjection = (payouts: ContractCommissionPayout[], items: CommissionResultItemDTO[]) => {
    let byItems = autoForecastCache.get(payouts);
    if (!byItems) { byItems = new WeakMap(); autoForecastCache.set(payouts, byItems); }
    let forecast = byItems.get(items);
    if (!forecast) {
      const subsequent = items.find(item => /následná|pečovatelská/i.test(item.title));
      forecast = createAutoCommissionForecast({ ...planEntry, productKey: product, frequencyRaw: paymentFrequency,
        policyStartDate: commissionStart, items, source: items === adviserItems ? "own" : "manager" }, payouts, subsequent?.amount);
      byItems.set(items, forecast);
    }
    return forecast;
  };
  const forecastForInstallment = (
    installment: CommissionInstallment,
    payouts: ContractCommissionPayout[],
    state: ReturnType<typeof payoutStatusForCodes>,
    items: CommissionResultItemDTO[],
  ): AutoCommissionForecast | null => {
    if (!installment.code || state.status !== "pending" || !installment.commissionPeriod) return null;
    const projection = autoProjection(payouts, items);
    const estimate = projection.forPeriod(installment.code, installment.commissionPeriod);
    return estimate?.basis === "premiumChange" || projection.inForecastYear(installment.commissionPeriod)
      ? estimate : null;
  };

  function acquisitionReceipts(payouts: ContractCommissionPayout[], installments: ReturnType<typeof acquisitionCommissionInstallments>) {
    const confirmed = splitConfirmedOpeningReceipt(payouts);
    if (confirmed !== payouts || commissionEntry?.paymentFrequencyChanges?.length) return confirmed;
    return projectAcquisitionInstallmentReceipts(payouts, installments);
  }

  const commissionSummary = (
    items: CommissionResultItemDTO[], payouts: ContractCommissionPayout[],
    originalTotal: number, paymentTotals: { immediate: number; subsequent: number } | null,
    own = false, source?: ContractDoc, comparison?: { plans: CommissionPayoutComparison[]; records: Set<ContractCommissionPayout> },
  ) => {
    const recordPlan = (title: string, codes: string[], amount: number | null, records: ContractCommissionPayout[]) => {
      if (!comparison) return;
      const code = codes.map(code => normalizePayoutCode(code, product)).find(Boolean) ?? "";
      const position = source?.position ?? adviserBreakdownPosition ?? planEntry?.position;
      const supplement = code && source && premiumPlan.neonRecurringRootId(source);
      const deduction = source?.productKey === "neon" && amount != null && amount < 0;
      const planTitle = deduction ? `Odpočet ${code} za snížení pojistného`
        : supplement ? `Doplatek za navýšení ${code}` : title;
      comparison.plans.push({ title: planTitle, code, expected: amount,
        position: position ? positionLabel(position) : null,
        records, note: source ? `Dodatek od ${formatDate(source.policyStartDate)}` : undefined });
    };
    const hasSplitImmediate = isSplitImmediateProduct(product) && items.some((item) => isSplitImmediateComponentTitle(item.title));
    let totalDelta = 0;
    let immediateDelta = 0;
    const annualSubsequentDeltas = new Map<number, number>();
    const annualSubsequentCounts = new Map<number, number>();
    const domexYearTotals = new Map<number, number>();
    const datedDomex = product === "domex" && Boolean(planEntry?.paymentFrequencyChanges?.length);
    const autoForecastRanges: CommissionForecastRange[] = [];
    let hasCurrentAutoInstallment = false;
    let hasUnforecastableCurrentInstallment = false;
    for (const item of items) {
      const isSubsequent = /následná|pečovatelská/i.test(item.title);
      if ((item.excludeFromTotal && !(paymentTotals && isSubsequent)) ||
        (hasSplitImmediate && isLegacyImmediateTotalTitle(item.title))) continue;
      const amount = validPayoutAmount(item.amount);
      const acquisition = acquisitionCommissionInstallments({ item, product, frequency: source?.frequencyRaw ?? paymentFrequency,
        policyStartDate: source?.policyStartDate ?? policyStartDate, paymentFrequencyChanges: (source ?? commissionEntry)?.paymentFrequencyChanges, payouts });
      if (acquisition.length > 0) {
        const projected = acquisitionReceipts(payouts, acquisition);
        if (comparison && projected !== payouts) {
          for (const record of payouts) comparison.records.delete(record);
          for (const record of projected) comparison.records.add(record);
        }
        const plannedAcquisition = acquisition.reduce((sum, installment, index) => {
          const records = payoutsForAcquisitionInstallment(projected, installment);
          const plan = projectCommissionRow(installment.amount, records, installment.codes, 0,
            installment.commissionPeriod ?? commissionPeriodAfterMonths(commissionStart, index * (12 / periodsPerYear(paymentFrequency ?? "annual"))),
            own);
          recordPlan(`Získatelská provize · ${installment.label}`, [installment.code], plan.amount, records);
          return sum + plan.amount;
        }, 0);
        const originalAcquisition = datedDomex ? amount * periodsPerYear(paymentFrequency ?? "annual")
          : acquisition.reduce((sum, installment) => sum + (installment.openingCollection ? 0 : installment.amount), 0);
        const delta = plannedAcquisition - originalAcquisition;
        immediateDelta += delta;
        totalDelta += delta;
        continue;
      }
      const recurring = recurringInstallmentsForItem(item, source);
      if (recurring.length > 0) {
        // A forecast can end mid-year. Only include complete DOMEX years in the annual comparison.
        const lastCode = recurring.at(-1)?.code;
        const nextPeriod = datedDomex && planEntry && lastCode && /^B\d+$/.test(lastCode)
          ? commissionPeriodForCode(planEntry, `B${Number(lastCode.slice(1)) + 1}`) : null;
        const truncatedYear = nextPeriod ? autoCommissionPolicyYear({ policyStartDate: commissionStart }, nextPeriod) : null;
        recurring.forEach((installment) => {
          const installmentPayouts = payoutsForRecurringInstallment(payouts, installment, source ?? planEntry);
          const installmentPlan = projectCommissionRow(
            installment.amount, installmentPayouts, payoutTargetsForInstallment(installment),
            installment.anniversaryYears, installment.commissionPeriod, own, source
          );
          if (comparison) {
            const codes = payoutTargetsForInstallment(installment);
            const records = payoutRecordsForCodes(installmentPayouts, codes, product, source?.entryType === "endorsement");
            const recordsBeforeStorno = cancellation
              ? records.filter(record => !contractStornoDeductionKind(record, cancellation.effectiveDate)) : records;
            const expected = isAutoSubsequentInstallment(installment)
              ? expectedAmountFromPayoutRecords(recordsBeforeStorno, product, codes) : installmentPlan.amount;
            recordPlan(`${cleanResultTitle(item.title)} · ${installment.label}`, codes, expected, records);
          }
          const delta = installmentPlan.amount - installment.amount;
          const installmentState = installmentPlan.state;
          const isCurrent = currentPolicyYear !== null && isAutoSubsequentInstallment(installment) &&
            policyYearForAutoInstallment(installment, product, paymentFrequency, commissionStart) === currentPolicyYear;
          hasCurrentAutoInstallment ||= isCurrent;
          if (
            isCurrent &&
            installmentState.status === "pending" &&
            installment.code !== autoProjection(payouts, items).coverage.coveredCode
          ) {
            const range = installmentPlan.originalPositionAmount != null
              ? { minimum: installmentPlan.amount, maximum: installmentPlan.amount }
              : forecastForInstallment(installment, payouts, installmentState, items);
            if (range) autoForecastRanges.push(range);
            else hasUnforecastableCurrentInstallment = true;
          }
          if (paymentTotals && installment.commissionPeriod) {
            if (datedDomex) {
              const year = autoCommissionPolicyYear({ policyStartDate: commissionStart }, installment.commissionPeriod);
              if (year != null && year !== truncatedYear) domexYearTotals.set(year, (domexYearTotals.get(year) ?? 0) + installmentPlan.amount);
              return;
            }
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
      const codes = payoutCodesForCommissionItem(item, product);
      const plan = projectCommissionRow(amount, payouts, codes, anniversaryYearsForCommissionItem(item), undefined, own, source);
      if (comparison) {
        const lifeEndorsement = (source ?? planEntry)?.entryType === "endorsement" &&
          ["neon", "flexi", "maximaMaxEfekt"].includes(product ?? "");
        recordPlan(cleanResultTitle(item.title), codes, plan.amount, payoutRecordsForCodes(payouts, codes, product, lifeEndorsement));
      }
      const delta = plan.amount - amount;
      totalDelta += delta;
      if (!isSubsequent) immediateDelta += delta;
    }
    const annualAmounts = datedDomex ? Array.from(domexYearTotals.values(), amount => ({ amount })) : paymentTotals && annualSubsequentDeltas.size > 0
      ? [...annualSubsequentDeltas].filter(([year]) =>
        annualSubsequentCounts.get(year) === periodsPerYear(paymentFrequency ?? "annual")
      ).map(([, delta]) => ({ amount: paymentTotals.subsequent + delta }))
      : [];
    const autoForecastTotal = combinedForecastRange(autoForecastRanges);
    return {
      total: originalTotal + totalDelta,
      immediate: (paymentTotals?.immediate ?? 0) + immediateDelta,
      subsequent: isAutoCommissionProduct(product)
        ? hasCurrentAutoInstallment && !hasUnforecastableCurrentInstallment
          ? autoForecastTotal ? formatCommissionForecastRange(autoForecastTotal) : formatMoney(0)
          : "— Kč"
        : installmentAmountLabel(annualAmounts, paymentTotals?.subsequent ?? 0),
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
    includeLegacyWithoutWriter = false,
    payouts = amendmentEntries[0]?.commissionPayouts ?? normalizedCommissionPayouts,
  ): ContractCommissionPayout[] => {
    const normalizedWriter = normalizeEmail(writerEmail);
    return payouts.filter((payout) => {
      const writtenBy = normalizeEmail(payout.writtenBy);
      if (writtenBy) return normalizedWriter ? writtenBy === normalizedWriter : false;
      return includeLegacyWithoutWriter;
    });
  };

  const adviserPayouts = payoutsForWriter(
    normalizedOwnerEmail,
    isOwnContract
  );
  const exceptionEntry = isOwnContract && planEntry && payoutPositionException(planEntry, "2026-01")
    ? { ...planEntry, source: "own" as const, items: adviserItems, commissionPayouts: adviserPayouts }
    : null;
  const currentPayoutPosition = exceptionEntry && payoutPositionException(exceptionEntry, endorsementCommissionDay(today)?.slice(0, 7) ?? null);
  const scheduleHorizon = Math.min(80, Math.max(10, contractDurationYears ?? 10));
  const revisedPayouts = exceptionEntry
    ? applyAutoCommissionForecasts(
      generateCashflow([exceptionEntry], scheduleHorizon, normalizedViewerEmail, today, commissionTimeline), [exceptionEntry], normalizedViewerEmail
    )
      .flatMap(payout => {
        if (payout.originalPositionAmount != null) return [payout];
        // The position for an overdue payout follows its expected payment date.
        if (currentPayoutPosition && payout.repricedAmountIfShifted != null) {
          return [{ ...payout, originalPositionAmount: payout.amount, amount: payout.repricedAmountIfShifted }];
        }
        return [];
      })
      .sort((first, second) => first.date.getTime() - second.date.getTime())
    : [];
  const amendmentsFor = (writer: string, rootItems: CommissionResultItemDTO[], adviser: boolean) => {
    if (!planEntry || !hasNeonAmendments || (!adviser && writer !== normalizedViewerEmail)) return [];
    const canReadReceipts = writer === normalizedViewerEmail;
    const includeLegacyReceipts = adviser && isOwnContract;
    const rootPayouts = payoutsForWriter(writer, includeLegacyReceipts);
    const adjustmentsByAmendment = new Map<string, Set<string>>();
    for (const item of rootItems) {
      const codes = payoutCodesForCommissionItem(item, product);
      const period = commissionPeriodAfterMonths(commissionStart, anniversaryYearsForCommissionItem(item) * 12);
      for (const adjustment of neonAdjustments(planEntry, item.amount, rootPayouts, codes, period)) {
        const rebased = adjustmentsByAmendment.get(adjustment.endorsementEntryId) ?? new Set<string>();
        for (const code of codes) rebased.add(normalizeLifeCommissionItemCode(code));
        adjustmentsByAmendment.set(adjustment.endorsementEntryId, rebased);
      }
    }
    const rootRecurringCodes = new Set(rootItems.filter(item => item.amount > 0).flatMap(item =>
      recurringInstallmentsForCommissionItem(item, "neon", contractDurationYears).map(installment => installment.code)));
    const amendments = amendmentEntries.slice(1);
    const increases = amendments.filter(entry => premiumPlan.neonRecurringRootId(entry));
    return amendments.flatMap(entry => {
      const override = adviser ? null : entry.managerOverrides?.find(row => normalizeEmail(row.email) === writer);
      const payoutRows = canReadReceipts ? payoutsForWriter(writer, includeLegacyReceipts, entry.commissionPayouts ?? []) : [];
      const isIncrease = increases.includes(entry);
      if (canReadReceipts && isIncrease) {
        payoutRows.push(...rootPayouts.filter(payout => neonEndorsementForOriginalPayout(payout, increases) === entry));
      }
      const sourceItems = stripTotalRows((adviser ? entry.items : override?.items) ?? []);
      const hasSplitImmediate = sourceItems.some(item => isSplitImmediateComponentTitle(item.title));
      const rebased = adjustmentsByAmendment.get(entry.id);
      const items = sourceItems.filter(item => {
        if (hasSplitImmediate && isLegacyImmediateTotalTitle(item.title)) return false;
        if (rebased && payoutCodesForCommissionItem(item, product).some(code => rebased.has(normalizeLifeCommissionItemCode(code)))) return false;
        if (!isIncrease) return true;
        const installments = recurringInstallmentsForCommissionItem(item, "neon", entry.durationYears);
        return installments.length === 0 || !installments.every(installment => rootRecurringCodes.has(installment.code));
      });
      const paidRebased = rebased ? payoutRows.filter(payout => {
        const code = lifeIncreaseItemCode(payout.statementCode ?? payout.code);
        return code != null && rebased.has(code);
      }).sort((a, b) => (commissionStatementDay(a) ?? "").localeCompare(commissionStatementDay(b) ?? "")) : [];
      if (!items.length && !payoutRows.length) return [];
      const position = adviser ? entry.position : override?.position;
      const mode = adviser ? entry.commissionMode : override?.commissionMode;
      return [{ entry, items, sourceItems, payoutRows, paidRebased, position, mode }];
    });
  };
  const adviserAmendments = amendmentsFor(normalizedOwnerEmail, adviserItems, true);
  type CommissionAmendment = (typeof adviserAmendments)[number];
  type AmendmentLine = { key: string; source: CommissionAmendment } & (
    { kind: "planned"; item: CommissionResultItemDTO } | { kind: "receipt"; payout: ContractCommissionPayout }
  );
  const subsequentTotalLabel = isAutoCommissionProduct(product)
    ? "Zbývá v aktuálním pojistném roce"
    : "Celkem následně ročně";

  const renderPayoutStatusChip = (
    status: CommissionPayoutReadStatus,
    paidAmount: number,
    expectedAmount: number,
    records: ContractCommissionPayout[],
    adjusted = false,
    showStatus = true
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
    const showsSameShortfall = hasNeonAmendments && status === "partial" &&
      differenceAmount === Math.round(adjustedDifference * 100) / 100;

    return (
      <>
        {showStatus && !(hasNeonAmendments && (status === "partial" || status === "paid")) && <span className={`${styles.status} ${payoutStatusClass(status)}`}>
          {adjusted && expectedAmount === 0 && paidAmount === 0 ? "Bez nároku" : payoutStatusLabel(status, paidAmount)}
        </span>}
        {stornoAmount !== null && (
          <span className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-800">
            Storno {formatSignedMoney(stornoAmount)}
          </span>
        )}
        {differenceAmount !== null && !showsSameShortfall && (
          <span
            className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${payoutDifferenceAmountClass(differenceAmount)}`}
          >
            Rozdíl {formatSignedMoney(differenceAmount)}
          </span>
        )}
      </>
    );
  };

  const renderPayoutRecordHint = (sourceRecords: ContractCommissionPayout[], autoRenewal = false, showSourceLabel = true) => {
    const records = autoRenewal ? sourceRecords.map(record => record.differenceReason === "career_mismatch" || isStornoPayoutRecord(record)
      ? record : { ...record, expectedAmount: undefined, difference: undefined, differenceReason: null, detail: null, status: "paid" }) : sourceRecords;
    const importantRecord = importantPayoutRecord(records);
    const label = payoutRecordLabel(importantRecord) ?? latestPayoutRecordLabel(records);
    const reason = importantRecord ? payoutDifferenceReasonFromRecord(importantRecord) : null;
    const explanation = payoutExplanationForRecords(records);
    if (!(showSourceLabel && label) && !reason) return null;

    return (
      <span className="mt-1 block">
        {showSourceLabel && label && (
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

  const renderCodeCorrectionNotes = (records: ContractCommissionPayout[]) => {
    const notes = new Set(records.flatMap(record => record.commissionCodeCorrectionNote ? [record.commissionCodeCorrectionNote] : []));
    return [...notes].map(note => <span key={note} className="mt-1 block text-xs font-medium text-sky-700">{note}</span>);
  };
  const renderInstallmentSources = (records: ContractCommissionPayout[], codes: string[], label: string) => {
    const sources = Array.from(new Map(records
      .filter(record => record.statementId || payoutRecordLabel(record))
      .map(record => [record.statementId || payoutRecordLabel(record)!, record])).values());
    if (!sources.length) return null;
    return (
      <span className={styles.installmentSources}>
        {sources.map(record => {
          const canOpen = onOpenStatement && record.statementId &&
            (!normalizeEmail(record.writtenBy) || normalizeEmail(record.writtenBy) === normalizedViewerEmail);
          const sourceLabel = `Výpis ${record.statementNumber || "– náhled"}`;
          return (
            <span key={record.statementId || payoutRecordLabel(record)} className={styles.installmentSource}>
              {canOpen ? (
                <button type="button" className={styles.sourceButton}
                  disabled={statementPreviewLoadingId === record.statementId}
                  onClick={() => onOpenStatement(record.statementId!, record.statementCode ? [record.statementCode] : record.installmentSourceCode ? [record.installmentSourceCode] : record.code ? [record.code] : codes)}
                  aria-label={`Otevřít zdrojový výpis ${record.statementNumber || ""} pro ${label}`}>
                  <Eye size={12} aria-hidden="true" />
                  {statementPreviewLoadingId === record.statementId ? "Načítám…" : sourceLabel}
                </button>
              ) : <span className={styles.sourceReference}>{sourceLabel}</span>}
              {(record.statementPeriod || record.statementDate) && (
                <span className={styles.sourcePeriod}>{record.statementPeriod || record.statementDate}</span>
              )}
            </span>
          );
        })}
      </span>
    );
  };

  const renderAmendmentOrigin = (entry: ContractDoc) => (
    <a className={styles.amendmentOrigin} href={`#contract-entry-${entry.id}`}>Dodatek od {formatDate(entry.policyStartDate)}</a>
  );

  const renderAmendmentReceipt = (line: Extract<AmendmentLine, { kind: "receipt" }>) => {
    const { payout, source } = line;
    const code = payout.statementCode ?? payout.code ?? "";
    const component = lifeIncreaseItemCode(code) ?? code;
    const storno = isStornoPayoutRecord(payout);
    const includedAmount = lifeIncreaseExpectedAmount(source.sourceItems, [code]);
    return (
      <CommissionComparisonRow key={line.key} title={`Doplatek za navýšení ${component}`} statementCode={code}
        supplement includedIn={component} expected={0} paid={validPayoutAmount(payout.amount)} storno={storno}>
        {includedAmount !== null && <span>Část provize {component} za navýšení pojistného činí <strong>{formatMoney(includedAmount)}</strong>.</span>}
        <span>Očekávaná provize {component} už zahrnuje celé nové pojistné. Samostatný doplatek má proto v plánu hodnotu 0 Kč.</span>
        {renderAmendmentOrigin(source.entry)}
        {renderInstallmentSources([payout], [code], code)}
      </CommissionComparisonRow>
    );
  };

  const renderNeonComparison = (
    item: CommissionResultItemDTO, plan: CommissionRowPlan, key: string, codes: string[],
    source?: ContractDoc, installmentTitle?: string, extraDetail?: ReactNode,
  ) => {
    const { state } = plan;
    const increaseCodes = [...new Set(state.records.map(row => row.statementCode ?? row.code ?? "").filter(isLifeIncreaseCode))];
    const component = lifeIncreaseItemCode(increaseCodes[0]) ?? item.code ?? codes[0];
    const supplement = Boolean(source && premiumPlan.neonRecurringRootId(source) && component);
    const baseTitle = installmentTitle ?? cleanResultTitle(item.title);
    const deduction = plan.amount < 0;
    const title = deduction ? `Odpočet ${component ?? baseTitle} za snížení pojistného`
      : supplement ? `Doplatek za navýšení ${component}${/po \d+ letech/i.test(baseTitle) ? ` · ${baseTitle}` : ""}`
      : component && !baseTitle.includes(component) ? `${baseTitle} · ${component}` : baseTitle;
    const storno = state.status === "storno";
    const hasPayment = state.records.some(record => !isStornoPayoutRecord(record) && Number.isFinite(record.amount));
    const note = displayNoteForCommissionItem(item);
    const reversedAmount = stornoPayoutAmountFromRecords(state.records);
    const paid = deduction && state.records.length ? state.records.reduce((sum, row) => sum + payoutCents(row), 0) / 100
      : storno ? reversedAmount ?? 0 : hasPayment ? state.paidAmount : null;
    return (
      <CommissionComparisonRow key={key} title={title + plannedPayoutLabel(codes, source)} statementCode={increaseCodes.join(", ")} expected={plan.amount}
        paid={paid}
        cancellationStatus={state.status === "cancelled" ? cancelledCommissionLabel : undefined}
        storno={storno && !deduction} flagged={state.status === "difference"} supplement={supplement}>
        {source && renderAmendmentOrigin(source)}
        {supplement && source?.premiumDelta != null && <span>Navýšení pojistného o {formatMoney(source.premiumDelta)} měsíčně.</span>}
        {renderPremiumAdjustment(plan)}
        {plan.adjustment && <span>Po přepočtu podle pojistného činí očekávaná provize {formatMoney(plan.amount)}.</span>}
        {state.status === "paid" && hasPayment && Math.abs(state.paidAmount - plan.amount) > 0.005 &&
          Math.abs(state.paidAmount - plan.amount) <= COMMISSION_PAYOUT_AMOUNT_TOLERANCE && (
          <span>Výplata je v toleranci {formatMoney(COMMISSION_PAYOUT_AMOUNT_TOLERANCE)}.</span>
        )}
        {reversedAmount !== null && !storno && <span>Storno {formatSignedMoney(reversedAmount)}</span>}
        {paid !== null && deduction && <span>Rozdíl mezi odpočtem a plánem <strong>{formatSignedMoney(paid - plan.amount)}</strong></span>}
        {hasPayment && !deduction && !storno && <span>Rozdíl mezi výplatou a plánem <strong>{formatSignedMoney(state.paidAmount - plan.amount)}</strong></span>}
        {renderInstallmentSources(state.records, codes, title)}
        {renderPayoutRecordHint(state.records, false, false)}
        {note && <span>{note}</span>}
        {state.status === "pending" && !state.records.length && <span>{deduction ? "Odpočet zatím není spárovaný s výpisem." : "Výplata zatím není zapsaná ve výpisu."}</span>}
        {extraDetail}
      </CommissionComparisonRow>
    );
  };

  const renderImmediatePart = (
    item: CommissionResultItemDTO, plan: CommissionRowPlan, key: string, own: boolean, source?: CommissionAmendment,
  ) => {
    if (hasNeonAmendments) {
      const calculation = source && isLegacyImmediateTotalTitle(item.title) && hasNeonImmediateCoefficient(source.position) && (
        <button type="button" className={styles.sourceButton} onClick={() => onOpenNeonImmediateBreakdown(item, source.position, source.mode, source.entry)}>
          Zobrazit výpočet
        </button>
      );
      return renderNeonComparison(item, plan, key, payoutCodesForCommissionItem(item, product), source?.entry, undefined, calculation);
    }
    const note = displayNoteForCommissionItem(item);
    const { state } = plan;
    return (
      <div key={key} className={`${styles.breakdownRow} ${payoutRowClass(state.status)}`}>
        <span className="min-w-0 text-sm font-medium text-slate-800">
          <span>{cleanResultTitle(item.title)}</span>{plannedPayoutLabel(payoutCodesForCommissionItem(item, product), source?.entry)}
          {renderPremiumAdjustment(plan)}
          {note && <span className="mt-1 block text-xs font-semibold text-red-600">{note}</span>}
          {renderPayoutRecordHint(state.records)}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1 whitespace-nowrap pt-0.5 text-sm font-semibold text-slate-950">
          {renderCommissionAmounts(plan, own)}
          {renderPayoutStatusChip(state.status, state.paidAmount, plan.amount, state.records, Boolean(plan.adjustment))}
        </span>
      </div>
    );
  };

  const renderSplitImmediateGroup = (
    commissionItems: CommissionResultItemDTO[],
    key: string,
    payoutsForRows: ContractCommissionPayout[],
    own: boolean,
    related: Map<CommissionResultItemDTO, AmendmentLine[]>,
  ) => {
    let total = 0;
    const rows = commissionItems.flatMap((part, index) => {
      const plan = projectCommissionRow(validPayoutAmount(part.amount), payoutsForRows, payoutCodesForCommissionItem(part, product), 0, undefined, own);
      total += plan.amount;
      return [
        renderImmediatePart(part, plan, `${key}-${index}`, own),
        ...(related.get(part) ?? []).map(line => {
          if (line.kind === "receipt") return renderAmendmentReceipt(line);
          const plan = projectCommissionRow(validPayoutAmount(line.item.amount), line.source.payoutRows,
            payoutCodesForCommissionItem(line.item, product), 0, undefined, false, line.source.entry);
          total += plan.amount;
          return renderImmediatePart(line.item, plan, line.key, false, line.source);
        }),
      ];
    });

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
              {!hasNeonAmendments && <span className="ml-2 inline-flex align-middle rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                rozpis
              </span>}
            </span>
          </span>
          <span className="flex items-center justify-end gap-2 whitespace-nowrap text-right text-base font-semibold text-slate-900">
            <span>
              {hasNeonAmendments && <span className="block text-xs font-medium text-slate-500">Očekáváno celkem</span>}
              {formatMoney(total)}
            </span>
            <ChevronDown
              size={18}
              strokeWidth={2.2}
              className="shrink-0 text-slate-500 transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </span>
        </summary>

        <div className={styles.breakdown}>{rows}</div>
      </details>
    );
  };

  const renderCommissionRow = (
    item: CommissionResultItemDTO,
    position: Position | null | undefined,
    commissionMode: CommissionMode | null | undefined,
    key: string,
    payoutsForRows: ContractCommissionPayout[],
    allCommissionItems: CommissionResultItemDTO[],
    own: boolean,
    source?: ContractDoc,
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
      validPayoutAmount(item.amount), payoutsForRows, payoutCodes, anniversaryYearsForCommissionItem(item), undefined, own, source
    );
    const payoutState = plan.state;
    const recurringInstallments = recurringInstallmentsForItem(item, source);

    const acquisitionInstallments = acquisitionCommissionInstallments({
      item, product, frequency: source?.frequencyRaw ?? paymentFrequency,
      policyStartDate: source?.policyStartDate ?? policyStartDate, paymentFrequencyChanges: (source ?? commissionEntry)?.paymentFrequencyChanges, payouts: payoutsForRows,
    });
    if (acquisitionInstallments.length > 0) {
      const projected = acquisitionReceipts(payoutsForRows, acquisitionInstallments);
      const installments = acquisitionInstallments.map((installment, index) => {
        const records = payoutsForAcquisitionInstallment(projected, installment);
        const installmentPlan = projectCommissionRow(
          installment.amount, records, installment.codes, 0,
          installment.commissionPeriod ?? commissionPeriodAfterMonths(commissionStart, index * (12 / periodsPerYear(paymentFrequency ?? "annual"))),
          own
        );
        return { ...installment, amount: installmentPlan.amount, state: installmentPlan.state, records, plan: installmentPlan };
      });
      const payableInstallments = installments.filter(({ state }) => state.status !== "cancelled");
      const paidCount = payableInstallments.filter(({ state }) => state.status === "paid").length;
      const receivedCount = installments.filter(({ state }) => state.paidAmount > 0).length;
      const total = payableInstallments.reduce((sum, installment) => sum + installment.amount, 0);
      const hasPayment = installments.some(({ state }) => state.paidAmount > 0);
      const hasDifference = installments.some(({ state }) => state.status === "difference");
      const status = hasDifference ? "difference" : payableInstallments.length === 0 ? "cancelled"
        : paidCount === payableInstallments.length ? "paid" : hasPayment ? "partial"
          : installments.some(({ state }) => state.status === "storno") ? "storno" : "pending";
      const frequencyLabel = product === "domex" && commissionEntry?.paymentFrequencyChanges?.length ? "dle plateb"
        : paymentFrequency === "monthly" ? "měsíčně" : paymentFrequency === "quarterly" ? "čtvrtletně" : "pololetně";

      return (
        <details key={key} className={`group ${styles.installmentGroup}`}>
          <summary className={`${commissionRowClass} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
            <span className="flex min-w-0 gap-3">
              <span className={styles.icon}><Banknote size={18} strokeWidth={1.8} aria-hidden="true" /></span>
              <span className="min-w-0">
                <span className={styles.installmentTitle}>Získatelská provize <span className={styles.frequency}>{frequencyLabel}</span></span>
                {payableInstallments.length > 0 && <span className={styles.installmentMeta} title="Počet splátek se zapsanou výplatou. Rozdíly v částkách jsou uvedeny samostatně.">Zapsané výplaty {receivedCount}/{payableInstallments.length} · první rok {formatMoney(total)}</span>}
                {itemNote && <span className="mt-1 block text-xs font-semibold text-red-600">{itemNote}</span>}
                <span className={styles.installmentProgress} aria-hidden="true">
                  {installments.map((installment) => <span key={installment.openingCollection ? "opening" : installment.code} data-status={installment.state.status} data-received={installment.state.paidAmount > 0 ? "true" : undefined} />)}
                </span>
              </span>
            </span>
            <span className={styles.installmentSummaryAmount}>
              <span className="flex flex-col items-end gap-1">
                {payableInstallments.length > 0 && <span>{installmentAmountLabel(payableInstallments, item.amount)} <span className={styles.perInstallment}>/ splátka</span></span>}
                <span className={`${styles.status} ${payoutStatusClass(status)}`}>
                  {status === "partial" ? "Částečně vyplaceno" : payoutStatusLabel(status, 0)}
                </span>
              </span>
              <ChevronDown size={18} className="text-violet-500 transition-transform group-open:rotate-180" aria-hidden="true" />
            </span>
          </summary>
          <div className={styles.breakdown}>
            {installments.map((installment) => {
              return (
                <div key={installment.openingCollection ? "opening" : installment.code} className={`${styles.breakdownRow} ${styles.compactInstallmentRow} ${payoutRowClass(installment.state.status)}`}>
                  <span className={styles.installmentDetails}>
                    <span className={styles.installmentHeading}>
                      <span>{installment.label}</span> <span className={styles.installmentCode}>{installment.statementCode ?? installment.code}</span>
                      {installment.period && <span className={styles.installmentDate}><CalendarDays size={12} aria-hidden="true" /><span><span className="sr-only">Období splátky · </span>{installment.period}</span></span>}
                    </span>
                    {renderInstallmentSources(installment.records, installment.codes, installment.label)}
                    {renderCodeCorrectionNotes(installment.state.records)}
                    {[...new Set(installment.records.flatMap(record => record.installmentCoverageNote ? [record.installmentCoverageNote] : []))].map(note => <span key={note} className="mt-1 block text-xs font-medium text-emerald-700">{note}</span>)}
                    {renderPremiumAdjustment(installment.plan)}
                    {renderPayoutRecordHint(installment.state.records, false, false)}
                  </span>
                  <span className={styles.installmentAmounts}>
                    {renderCommissionAmounts(installment.plan, own)}
                    {renderPayoutStatusChip(installment.state.status, installment.state.paidAmount, installment.amount, installment.state.records, Boolean(installment.plan.adjustment), installment.state.status !== "paid")}
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
        const installmentPayouts = payoutsForRecurringInstallment(payoutsForRows, installment, source ?? planEntry);
        const installmentPlan = projectCommissionRow(
          installment.amount, installmentPayouts, payoutTargetsForInstallment(installment), installment.anniversaryYears,
          installment.commissionPeriod, own, source
        );
        const isAutoSubsequent = isAutoSubsequentInstallment(installment);
        const policyYear = policyYearForAutoInstallment(installment, product, paymentFrequency, commissionStart);
        const current = isAutoSubsequent && policyYear !== null && policyYear === currentPolicyYear;
        const next = isAutoSubsequent && policyYear !== null && policyYear === nextPolicyYear;
        const coverage = isAutoSubsequent ? autoProjection(payoutsForRows, allCommissionItems).coverage : null;
        const covered = Boolean(coverage?.coveredCode && installment.code === coverage.coveredCode &&
          (installmentPlan.state.status === "pending" || installmentPlan.state.status === "storno" || installmentPlan.state.status === "cancelled"));
        const combined = Boolean(coverage?.combined && installment.code === normalizePayoutCode(coverage.combined.code, product));
        const coveringPayment = covered && coverage?.combinedWithCode === installment.code
          ? payoutsForRows.find(record => record === coverage.combined) : undefined;
        const autoForecast = (current || next) && !covered && installmentPlan.originalPositionAmount == null
          ? forecastForInstallment(installment, payoutsForRows, installmentPlan.state, allCommissionItems) : null;
        return {
          ...installment,
          amount: installmentPlan.amount,
          plan: installmentPlan,
          autoForecast,
          policyYear,
          current,
          next,
          covered,
          combined,
          combinedWithCode: coverage?.combinedWithCode,
          coveringPayment,
        };
      });
      const isAutoSubsequentItem = installments.some(({ code }) =>
        isAutoCommissionProduct(product) && Boolean(code && isAutoSubsequentCommissionCode(normalizePayoutCode(code, product)))
      );
      const isVisibleInstallment = (installment: typeof installments[number]) =>
        !isAutoSubsequentInstallment(installment) ||
        installment.covered ||
        installment.plan.state.records.length > 0 ||
        installment.current ||
        installment.next;
      const visibleInstallments = installments.filter(isVisibleInstallment);
      const payableInstallments = installments.filter(({ plan, covered }) => covered || plan.state.status !== "cancelled");
      const currentInstallments = payableInstallments.filter(({ current }) => current);
      const isSettled = ({ plan, covered }: typeof installments[number]) => plan.state.status === "paid" || covered;
      const countedInstallments = isAutoSubsequentItem ? currentInstallments : payableInstallments;
      const paidInstallments = countedInstallments.filter(isSettled).length;
      const receivedInstallments = hasNeonAmendments
        ? visibleInstallments.filter(({ plan }) => plan.state.paidAmount > 0).length : 0;
      const unpaidNextInstallments = payableInstallments.filter(installment => installment.next && !isSettled(installment));
      const showNextYear = paidInstallments === currentInstallments.length && unpaidNextInstallments.length > 0;
      const forecastInstallments = showNextYear ? unpaidNextInstallments
        : currentInstallments.filter(({ plan, covered }) => !covered && plan.state.status === "pending");
      const forecastRanges = forecastInstallments.map(({ plan, autoForecast }) => {
        if (plan.state.status !== "pending") return null;
        return plan.originalPositionAmount != null ? { minimum: plan.amount, maximum: plan.amount } : autoForecast;
      });
      const forecastSummary = forecastRanges.every(range => range != null)
        ? combinedForecastRange(forecastRanges) : null;
      const autoSummaryAmount = forecastSummary ? formatCommissionForecastRange(forecastSummary)
        : currentInstallments.length > 0 && forecastRanges.length === 0 ? formatMoney(0) : "— Kč";
      const settlementLabel = countedInstallments.some(installment => installment.covered) ? "Pokryto" : "Vyplaceno";
      const recurringTotal = payableInstallments.reduce((sum, installment) => sum + installment.amount, 0);
      const allCancelled = payableInstallments.length === 0;
      const renderInstallmentRow = (installment: typeof installments[number]) => {
        const autoSubsequentPending = isAutoSubsequentInstallment(installment) &&
          installment.plan.state.status === "pending";
        const installmentState = installment.plan.state;
        const sourceRecords = installment.coveringPayment
          ? [...installmentState.records, installment.coveringPayment] : installmentState.records;

        if (hasNeonAmendments) {
          const code = installment.code ?? "";
          return renderNeonComparison({ ...item, code }, installment.plan, installment.key,
            code ? [code] : [], source, installment.label,
            <>{installment.commissionPeriod && <span>Období provize {formatDate(installment.commissionPeriod)}</span>}
              {renderCodeCorrectionNotes(installmentState.records)}</>);
        }

        return (
          <div
            key={installment.key}
            className={`${styles.breakdownRow} ${styles.compactInstallmentRow} ${payoutRowClass(installment.covered ? "paid" : installmentState.status)}`}
          >
            <span className={styles.installmentDetails}>
              <span className={styles.installmentHeading}>
                <span>{installment.label}</span>
                {installment.code && <> <span className={styles.installmentCode}>{installment.code}</span></>}
                {installment.code && plannedPayoutLabel([installment.code], source)}
                {installment.commissionPeriod && (
                  <span className={styles.installmentDate}>
                    <CalendarDays size={12} aria-hidden="true" />
                    <span><span className="sr-only">Období provize · </span>{formatDate(installment.commissionPeriod)}</span>
                  </span>
                )}
              </span>
              {renderInstallmentSources(sourceRecords, installment.code ? [installment.code] : [], installment.code || installment.label)}
              {installment.combined && <span className={styles.forecastNote}>{installment.combinedWithCode
                ? `Souhrnná výplata pokrývá období ${installment.combinedWithCode} a ${installment.code}.`
                : "Základna i částka odpovídají dvěma pololetním splátkám."}</span>}
              {renderCodeCorrectionNotes(installmentState.records)}
              {!autoSubsequentPending && renderPremiumAdjustment(installment.plan)}
              {renderPayoutRecordHint(installmentState.records, isAutoSubsequentInstallment(installment), false)}
            </span>
            <span className={styles.installmentAmounts} data-status={installment.covered ? "paid" : installmentState.status}>
              {installment.covered ? <span>{installment.coveringPayment?.code
                ? `Pokryto výplatou ${installment.coveringPayment.code}` : "Pokryto souhrnem výplat"}</span>
                : installmentState.status === "cancelled" || installment.plan.originalPositionAmount != null ? renderCommissionAmounts(installment.plan, own) : autoSubsequentPending ? (
                <span>{installment.autoForecast
                  ? `${installment.autoForecast.basis === "premiumChange" || installment.autoForecast.isConfirmedPolicyYear ? "Očekáváno" : "Odhad"} ${formatCommissionForecastRange(installment.autoForecast)}`
                  : "— Kč"}</span>
              ) : isAutoSubsequentInstallment(installment) ? (
                <span>{installmentState.status === "storno" ? "Odúčtováno " : "Vyplaceno "}{formatMoney(installmentState.status === "storno" ? stornoPayoutAmountFromRecords(installmentState.records) ?? 0 : installmentState.paidAmount)}</span>
              ) : renderCommissionAmounts(installment.plan, own)}
              {isAutoSubsequentInstallment(installment) && installmentState.status !== "cancelled" && installment.plan.originalPositionAmount == null && renderPositionBadges(installmentState.records, own)}
              {isAutoSubsequentInstallment(installment) && installment.autoForecast && (
                <span className={styles.forecastNote}>
                  {installment.autoForecast.basis === "premiumChange"
                    ? `Roční pojistné ${formatMoney(installment.autoForecast.basisAmount)} · ${positionLabel(installment.autoForecast.position)} při sjednání`
                    : installment.autoForecast.isConfirmedPolicyYear
                    ? "Podle vyplacené provize ve stejném pojistném roce"
                    : installment.autoForecast.basis === "initial" ? "Orientačně ±8 % podle provize v prvním roce" : "Orientačně ±8 % podle poslední vyplacené provize"}
                </span>
              )}
              {isAutoSubsequentInstallment(installment) ? (
                !installment.covered && installmentState.status !== "paid" && <span className={`${styles.status} ${payoutStatusClass(installmentState.status)}`}>{payoutStatusLabel(installmentState.status, installmentState.paidAmount)}</span>
              ) : renderPayoutStatusChip(
                installmentState.status,
                installmentState.paidAmount,
                validPayoutAmount(installment.amount),
                installmentState.records,
                Boolean(installment.plan.adjustment),
                installmentState.status !== "paid"
              )}
            </span>
          </div>
        );
      };
      const autoAnnualGroups = (() => {
        if (!isAutoSubsequentItem) return [];
        const annualSchedule = isAnnualAutoPayoutProduct(product) ||
          product === "uniqaAuto" || product === "uniqaflotila";
        const installmentsPerPolicyYear = annualSchedule ? 1 : periodsPerYear(paymentFrequency ?? "annual");
        const grouped = new Map<number, typeof installments>();

        installments.forEach((installment, index) => {
          if (!isVisibleInstallment(installment)) return;
          const policyYear = installment.policyYear ?? 2 + Math.floor(index / installmentsPerPolicyYear);
          const group = grouped.get(policyYear) ?? [];
          group.push(installment);
          grouped.set(policyYear, group);
        });

        return Array.from(grouped, ([policyYear, groupedInstallments]) => ({ policyYear, installments: groupedInstallments }))
          .sort((left, right) => left.policyYear - right.policyYear);
      })();

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
                {!hasNeonAmendments && !allCancelled && <span className="ml-2 inline-flex align-middle rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                  {visibleInstallments.length}x
                </span>}
                {!allCancelled && <span className="mt-1 block text-xs font-medium text-slate-500">
                  {isAutoSubsequentItem
                    ? currentInstallments.length > 0
                      ? `Aktuální pojistný rok · ${settlementLabel} ${paidInstallments}/${currentInstallments.length}`
                      : "V aktuálním pojistném roce bez následných provizí"
                    : hasNeonAmendments
                      ? `Zapsané výplaty ${receivedInstallments}/${payableInstallments.length}`
                      : `Vyplaceno ${paidInstallments}/${payableInstallments.length} · celkem ${formatMoney(recurringTotal)}`}
                </span>}
              </span>
            </span>
            <span className="flex items-center justify-end gap-2 whitespace-nowrap text-right text-base font-semibold text-slate-900">
              {allCancelled ? renderPayoutStatusChip("cancelled", 0, 0, []) : <span>
                {showNextYear && (
                  <span className="block text-xs font-medium text-slate-500">
                    {forecastSummary ? "Odhad na další pojistný rok" : "Další pojistný rok"}
                  </span>
                )}
                {hasNeonAmendments && <span className="block text-xs font-medium text-slate-500">Očekáváno celkem</span>}
                {isAutoSubsequentItem ? autoSummaryAmount : hasNeonAmendments
                  ? formatMoney(recurringTotal) : installmentAmountLabel(payableInstallments, item.amount)}
              </span>}
              {installments.every(installment => installment.plan.originalPositionAmount != null) && (
                <CommissionPositionBadge position={PAYOUT_EXCEPTION_POSITION} />
              )}
              <ChevronDown
                size={18}
                strokeWidth={2.2}
                className="shrink-0 text-slate-500 transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
            </span>
          </summary>

          {isAutoSubsequentItem ? (
            <div className="space-y-3 px-2 pb-3 sm:px-3">
              {autoAnnualGroups.length === 0 && (
                <p className="px-4 py-3 text-sm text-slate-500">
                  Pro aktuální ani následující pojistný rok není naplánovaná žádná následná provize.
                </p>
              )}
              {autoAnnualGroups.map(({ policyYear, installments: annualInstallments }) => {
                const paidCount = annualInstallments.filter(isSettled).length;
                const hasDifference = annualInstallments.some(({ plan }) =>
                  plan.state.status === "difference" || plan.state.status === "partial"
                );
                const countLabel = annualInstallments.length === 1
                  ? "provize"
                  : annualInstallments.length >= 2 && annualInstallments.length <= 4
                    ? "provize"
                    : "provizí";

                return (
                  <section
                    key={policyYear}
                    data-commission-policy-year={policyYear}
                    className="overflow-hidden rounded-xl border border-violet-100 bg-white shadow-sm shadow-violet-950/[0.025]"
                    aria-label={`${policyYear}. rok smlouvy, ${annualInstallments.length} ${countLabel}`}
                  >
                    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-violet-100 bg-violet-50/65 px-4 py-3">
                      <div>
                        <h5 className="text-sm font-semibold text-slate-900">{policyYear}. rok smlouvy</h5>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {annualInstallments.length} {countLabel} v ročním období
                        </p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${hasDifference
                        ? "bg-amber-100 text-amber-800"
                        : paidCount === annualInstallments.length
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-100 text-slate-600"
                      }`}>
                        {paidCount}/{annualInstallments.length} {annualInstallments.some(installment => installment.covered) ? "pokryto" : "vyplaceno"}
                      </span>
                    </header>
                    <div className="px-3 pb-2">
                      {annualInstallments.map(renderInstallmentRow)}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            <div className={styles.breakdown}>
              {installments.map(renderInstallmentRow)}
            </div>
          )}
        </details>
      );
    }

    if (hasNeonAmendments) {
      const calculation = clickable && <button type="button" className={styles.sourceButton}
        onClick={() => onOpenNeonImmediateBreakdown(item, position, commissionMode, source)}>Zobrazit výpočet</button>;
      return renderNeonComparison(item, plan, key, payoutCodes, source, undefined, calculation);
    }

    const content = (
      <>
        <span className="flex min-w-0 items-start gap-2.5 text-sm font-medium text-slate-900 sm:items-center sm:text-base">
          <span className={styles.icon}>
            <RowIcon size={18} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <span className="min-w-0 leading-tight [overflow-wrap:anywhere]">
            <span>{cleanResultTitle(item.title)}</span>{plannedPayoutLabel(payoutCodes, source)}
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
          {renderCommissionAmounts(plan, own)}
          {(payoutCodes.length > 0 || payoutState.status === "cancelled") &&
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
        onClick={() => source
          ? onOpenNeonImmediateBreakdown(item, position, commissionMode, source)
          : onOpenNeonImmediateBreakdown(item, position, commissionMode)}
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
    payoutsForRows: ContractCommissionPayout[],
    amendments: CommissionAmendment[] = [],
  ) => {
    const splitImmediateItems = isSplitImmediateProduct(product)
      ? commissionItems.filter(item => isSplitImmediateComponentTitle(item.title)) : [];
    const regularCommissionItems = splitImmediateItems.length
      ? commissionItems.filter(item => !isSplitImmediateComponentTitle(item.title) && !isLegacyImmediateTotalTitle(item.title))
      : commissionItems;

    const related = new Map<CommissionResultItemDTO, AmendmentLine[]>();
    const otherLines: AmendmentLine[] = [];
    if (amendments.length > 0) {
      const displayCode = (code: string) => normalizeLifeCommissionItemCode(lifeIncreaseItemCode(code) ?? code);
      const itemCodes = (item: CommissionResultItemDTO) => [
        ...payoutCodesForCommissionItem(item, product).map(displayCode),
        ...recurringInstallmentsForCommissionItem(item, product, contractDurationYears).flatMap(installment =>
          installment.code ? [displayCode(installment.code)] : []),
      ];
      const originals = [...splitImmediateItems, ...regularCommissionItems].map(item => ({
        item, codes: new Set(itemCodes(item)), title: cleanResultTitle(item.title).toLowerCase(),
      }));
      const orderedAmendments = [...amendments].sort((a, b) =>
        (endorsementCommissionDay(a.entry.policyStartDate) ?? "").localeCompare(endorsementCommissionDay(b.entry.policyStartDate) ?? ""));
      for (const amendment of orderedAmendments) {
        const lines: AmendmentLine[] = [
          ...amendment.items.map((item, index) => ({
            kind: "planned" as const, item, key: `${amendment.entry.id}-planned-${index}`, source: amendment,
          })),
          ...amendment.paidRebased.map((payout, index) => ({
            kind: "receipt" as const, payout, key: `${amendment.entry.id}-receipt-${index}`, source: amendment,
          })),
        ];
        for (const line of lines) {
          const codes = line.kind === "planned" ? itemCodes(line.item) : [displayCode(line.payout.statementCode ?? line.payout.code ?? "")];
          const matches = originals.filter(original => codes.some(code => original.codes.has(code)));
          const sameTitle = line.kind === "planned"
            ? (matches.length > 0 ? matches : originals).filter(original => original.title === cleanResultTitle(line.item.title).toLowerCase())
            : [];
          const original = matches.length === 1 ? matches[0] : sameTitle.length === 1 ? sameTitle[0] : null;
          if (!original) {
            otherLines.push(line);
            continue;
          }
          const siblings = related.get(original.item) ?? [];
          siblings.push(line);
          related.set(original.item, siblings);
        }
      }
    }

    const renderRelatedLine = (line: AmendmentLine) => {
      if (line.kind === "receipt") return renderAmendmentReceipt(line);
      const { source } = line;
      return renderCommissionRow(line.item, source.position, source.mode, line.key, source.payoutRows, source.items, false, source.entry);
    };

    const own = keyPrefix === "adviser-own";
    return (
      <>
        <div className={styles.tableHeading} aria-hidden="true">
          <span>Složka provize</span>
          <span>Částka / stav</span>
        </div>
        {splitImmediateItems.length > 0 &&
          renderSplitImmediateGroup(splitImmediateItems, `${keyPrefix}-split-immediate`, payoutsForRows, own, related)}
        {regularCommissionItems.map((item, index) => {
          const key = `${keyPrefix}-${index}-${item.title}`;
          return (
            <Fragment key={key}>
              {renderCommissionRow(item, position, commissionMode, key, payoutsForRows, commissionItems, own)}
              {related.get(item)?.map(renderRelatedLine)}
            </Fragment>
          );
        })}
        {otherLines.map(renderRelatedLine)}
      </>
    );
  };

  const comparison = showPayoutSummary && isOwnContract ? {
    plans: [] as CommissionPayoutComparison[],
    records: new Set([...adviserPayouts, ...adviserAmendments.flatMap(source => source.payoutRows)]),
  } : undefined;
  const adviserSummary = commissionSummary(adviserItems, adviserPayouts, adviserTotalDisplay, paymentBasedAdviserTotals, true, undefined, comparison);
  const amendmentsTotal = (amendments: typeof adviserAmendments, capture?: typeof comparison) => amendments.reduce((sum, source) =>
    sum + commissionSummary(source.items, source.payoutRows, computeTotalWithMultipliers(source.items), null, false, source.entry, capture).total, 0);

  if (comparison) {
    for (const source of adviserAmendments) {
      for (const payout of source.paidRebased) {
        const code = lifeIncreaseItemCode(payout.statementCode ?? payout.code);
        if (!code) continue;
        const matches = comparison.plans.filter(plan => normalizeLifeCommissionItemCode(plan.code) === code);
        if (matches.length !== 1) continue;
        // The root plan already uses the full premium. Compare both receipts
        // against that single amount and keep their statement rows separate.
        const plan = matches[0];
        plan.records.push(payout);
        plan.note = "Plán zahrnuje celé nové pojistné včetně navýšení.";
      }
    }
  }
  const adviserAmendmentsTotal = !hideAnnualAutoTotals || comparison ? amendmentsTotal(adviserAmendments, comparison) : 0;
  const payoutSummary = comparison ? summarizeCommissionPayouts(comparison.plans, comparison.records, product, cancellation) : null;
  const viewerHasAmendmentOverride = !isOwnContract && Boolean(normalizedViewerEmail) && amendmentEntries.slice(1).some(entry =>
    entry.managerOverrides?.some(row => normalizeEmail(row.email) === normalizedViewerEmail && row.items?.length));
  const managerCards = viewerHasAmendmentOverride && !meziprovisionCards.some(card => normalizeEmail(card.email) === normalizedViewerEmail)
    ? [...meziprovisionCards, { key: "neon-amendment-manager", email: normalizedViewerEmail, userName: nameFromEmail(normalizedViewerEmail),
      position: null, mode: null, items: [], totals: null, totalDisplay: 0 } satisfies MeziprovisionCard]
    : meziprovisionCards;

  const renderCommissionWarning = () =>
    trimmedCommissionWarning ? (
      <div className="mb-3 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-semibold leading-relaxed text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} />
        <span>{trimmedCommissionWarning}</span>
      </div>
    ) : null;

  return (
    <div className="space-y-4">
      {(showAnyMeziprovision || viewerHasAmendmentOverride) && (
        <section className="space-y-3">
          {managerCards.map((card) => {
            const isExpanded = expandedMeziprovisionKeys.includes(card.key);
            const cardPayouts = payoutsForWriter(card.email ?? normalizedViewerEmail);
            const cardSummary = isExpanded ? commissionSummary(card.items, cardPayouts, card.totalDisplay, card.totals) : null;
            const amendments = isExpanded ? amendmentsFor(normalizeEmail(card.email ?? normalizedViewerEmail), card.items, false) : [];
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

                    <div className={panelClass}>
                      <div className={styles.rows}>
                        {renderCommissionRows(
                          card.items,
                          card.position,
                          card.mode,
                          card.key,
                          cardPayouts,
                          amendments
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
                                <span className={commissionTotalLabelClass}>{subsequentTotalLabel}</span>
                                <span className={commissionTotalValueClass}>
                                  {cardSummary?.subsequent ?? formatMoney(card.totals.subsequent)}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className={`${commissionTotalLineClass} w-full`}>
                              <span className={commissionTotalLabelClass}>{hasNeonAmendments ? "Očekávaná meziprovize celkem" : "Celkem meziprovize"}</span>
                              <span className={commissionTotalValueClass}>
                                {formatMoney((cardSummary?.total ?? card.totalDisplay) + amendmentsTotal(amendments))}
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ContractSectionHeading icon={<Coins size={17} strokeWidth={2.2} aria-hidden="true" />}>
              Výpočet provizí
            </ContractSectionHeading>
            <button type="button" aria-haspopup="dialog" className={styles.summaryTrigger} onClick={() => setShowPayoutSummary(true)}>
              <ChartNoAxesColumnIncreasing size={16} aria-hidden="true" /> Zobrazit souhrn
            </button>
          </div>
          <div className={panelClass}>
            {renderCommissionWarning()}
            <div className={styles.rows}>
              {renderCommissionRows(
                adviserItems,
                adviserBreakdownPosition,
                adviserBreakdownMode,
                "adviser-own",
                adviserPayouts,
                adviserAmendments
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
                      <span className={commissionTotalLabelClass}>{subsequentTotalLabel}</span>
                      <span className={commissionTotalValueClass}>
                        {adviserSummary.subsequent}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className={`${commissionTotalLineClass} w-full`}>
                    <span className={commissionTotalLabelClass}>{hasNeonAmendments ? "Očekávaná provize celkem" : "Celkem"}</span>
                    <span className={commissionTotalValueClass}>
                      {formatMoney(adviserSummary.total + adviserAmendmentsTotal)}
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
            <div className={panelClass}>
              {renderCommissionWarning()}
              <div className={styles.rows}>
                {renderCommissionRows(
                  adviserItems,
                  adviserBreakdownPosition,
                  adviserBreakdownMode,
                  "adviser-team",
                  adviserPayouts,
                  adviserAmendments
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
                        <span className={commissionTotalLabelClass}>{subsequentTotalLabel}</span>
                        <span className={commissionTotalValueClass}>
                          {adviserSummary.subsequent}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className={`${commissionTotalLineClass} w-full`}>
                      <span className={commissionTotalLabelClass}>{hasNeonAmendments ? "Očekávaná provize celkem" : "Celkem"}</span>
                      <span className={commissionTotalValueClass}>
                        {formatMoney(adviserSummary.total + adviserAmendmentsTotal)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {payoutSummary && <CommissionPayoutSummaryDialog summary={payoutSummary}
        onClose={() => setShowPayoutSummary(false)}
        onOpenStatement={onOpenStatement ? (id, codes) => {
          setShowPayoutSummary(false);
          onOpenStatement(id, codes);
        } : undefined} />}

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
