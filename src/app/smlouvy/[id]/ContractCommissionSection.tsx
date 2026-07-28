import Image from "next/image";
import { ChevronDown } from "lucide-react";

import {
  type CommissionMode,
  type CommissionResultItemDTO,
  type Position,
  type Product,
} from "../../types/domain";
import {
  cleanResultTitle,
  formatMoney,
  positionLabel,
  resultIconForTitle,
} from "./contractDetailHelpers";
import {
  hasNeonImmediateCoefficient,
} from "./contractDetailLogic";
import { type ContractCommissionPayout } from "./contractDetailTypes";

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
  commissionPayouts?: ContractCommissionPayout[] | null;
  viewerEmail?: string | null;
  contractOwnerEmail?: string | null;
  contractDurationYears?: number | null;
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

const commissionPanelClass =
  "rounded-[20px] border border-slate-300/90 bg-[linear-gradient(165deg,#ffffff_0%,#f8fafc_58%,#eef4ff_100%)] px-4 py-3 shadow-[0_12px_28px_rgba(15,23,42,0.08)]";
const commissionRowClass =
  "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 rounded-xl border border-slate-200/90 bg-white/88 px-3 py-2.5 shadow-[0_6px_16px_rgba(15,23,42,0.035)] backdrop-blur-sm sm:items-center";
const commissionTotalHighlightClass =
  "mt-3 overflow-hidden rounded-2xl border border-slate-800/90 bg-[linear-gradient(135deg,#0b1328_0%,#0e1a3a_54%,#081124_100%)] px-3.5 py-2.5 text-white shadow-[0_16px_36px_rgba(2,6,23,0.38)]";
const commissionTotalLineDarkClass =
  "flex items-center justify-between gap-3";
const commissionTotalLabelDarkClass =
  "text-xs font-semibold uppercase tracking-[0.1em] text-slate-200/90";
const commissionTotalValueDarkClass =
  "text-xl font-bold tracking-tight text-emerald-300 sm:text-2xl";
const monoHeadingClass = "font-mono tracking-tight text-slate-900";
const monoChipClass =
  "inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-3 py-1.5 text-sm font-mono tracking-tight text-slate-900";
const monoChipDarkClass =
  "inline-flex items-center rounded-full border border-slate-900 bg-slate-900 px-3 py-1.5 text-sm font-mono tracking-tight text-white";
const collapsibleButtonClass =
  "flex h-10 w-full items-center justify-between gap-3 rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-semibold font-mono tracking-tight text-slate-900 transition hover:border-slate-400 hover:bg-slate-50";
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

const sumCommissionItems = (commissionItems: CommissionResultItemDTO[]): number =>
  commissionItems.reduce((sum, item) => sum + (Number.isFinite(item.amount) ? item.amount : 0), 0);

export type CommissionPayoutReadStatus = "pending" | "paid" | "partial" | "storno";

type CommissionInstallment = {
  key: string;
  code: string | null;
  label: string;
  amount: number;
};

const normalizePayoutCode = (value: string | null | undefined): string =>
  String(value ?? "").trim().toUpperCase();

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
  const explicitCode = normalizePayoutCode(item.code);
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
      code: null,
      label: `${year}. rok`,
      amount,
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
  codes: string[]
): ContractCommissionPayout[] => {
  const normalizedCodes = new Set(codes.map(normalizePayoutCode).filter(Boolean));
  if (normalizedCodes.size === 0) return [];

  return payouts.filter((payout) => {
    const payoutTargets = [
      normalizePayoutCode(payout.code),
      normalizePayoutCode(payout.key),
      normalizePayoutCode(payout.title),
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
  storno: ContractCommissionPayout
): boolean => {
  const payoutCode = normalizePayoutCode(payout.code);
  const stornoCode = normalizePayoutCode(storno.code);
  if (payoutCode && stornoCode && payoutCode !== stornoCode) return false;

  const payoutCareer = normalizePayoutCode(payout.career);
  const stornoCareer = normalizePayoutCode(storno.career);
  return !payoutCareer || !stornoCareer || payoutCareer === stornoCareer;
};

const fullyOffsetPayoutRecordIndexes = (
  records: ContractCommissionPayout[]
): Set<number> => {
  const pairedIndexes = new Set<number>();

  records.forEach((storno, stornoIndex) => {
    if (!isStornoPayoutRecord(storno) || pairedIndexes.has(stornoIndex)) return;

    const stornoAmount = Math.abs(validPayoutAmount(storno.amount));
    if (stornoAmount <= COMMISSION_PAYOUT_AMOUNT_TOLERANCE) return;

    const payoutIndex = records.findIndex(
      (payout, index) =>
        !pairedIndexes.has(index) &&
        !isStornoPayoutRecord(payout) &&
        validPayoutAmount(payout.amount) > COMMISSION_PAYOUT_AMOUNT_TOLERANCE &&
        payoutAmountsMatch(payout.amount, stornoAmount) &&
        payoutRecordsCanOffset(payout, storno)
    );
    if (payoutIndex < 0) return;

    pairedIndexes.add(payoutIndex);
    pairedIndexes.add(stornoIndex);
  });

  return pairedIndexes;
};

const activePayoutRecordsAfterFullStornos = (
  records: ContractCommissionPayout[]
): ContractCommissionPayout[] => {
  const offsetIndexes = fullyOffsetPayoutRecordIndexes(records);
  if (offsetIndexes.size === 0) return records;
  return records.filter((_, index) => !offsetIndexes.has(index));
};

export const payoutStatusForCodes = (
  payouts: ContractCommissionPayout[],
  codes: string[],
  expectedAmount: number
): {
  status: CommissionPayoutReadStatus;
  paidAmount: number;
  records: ContractCommissionPayout[];
} => {
  const records = payoutRecordsForCodes(payouts, codes);
  const activeRecords = activePayoutRecordsAfterFullStornos(records);
  const nonStornoRecords = activeRecords.filter((record) => !isStornoPayoutRecord(record));
  const paidAmount = nonStornoRecords.reduce(
    (sum, record) => sum + validPayoutAmount(record.amount),
    0
  );
  const hasStorno = records.some(isStornoPayoutRecord);
  const displayRecords = nonStornoRecords.length > 0 ? activeRecords : records;

  if (paidAmount >= Math.max(0, expectedAmount - COMMISSION_PAYOUT_AMOUNT_TOLERANCE)) {
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
  const hasNonStornoRecord = activeRecords.some((record) => !isStornoPayoutRecord(record));
  if (!hasNonStornoRecord) return null;

  const importantRecord = importantPayoutRecord(activeRecords);
  if (!importantRecord || !isStornoPayoutRecord(importantRecord)) {
    const storedDifference = Number(importantRecord?.difference);
    if (
      Number.isFinite(storedDifference) &&
      Math.abs(storedDifference) > COMMISSION_PAYOUT_AMOUNT_TOLERANCE
    ) {
      return Math.round(storedDifference * 100) / 100;
    }
  }

  const calculatedDifference = paidAmount - expectedAmount;
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
  commissionPayouts = [],
  viewerEmail = null,
  contractOwnerEmail = null,
  contractDurationYears = null,
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

  const renderPayoutStatusChip = (
    status: CommissionPayoutReadStatus,
    paidAmount: number,
    expectedAmount: number,
    records: ContractCommissionPayout[]
  ) => {
    const differenceAmount = payoutDifferenceAmountFromRecords({
      expectedAmount,
      paidAmount,
      records,
    });
    const stornoAmount = stornoPayoutAmountFromRecords(records);

    return (
      <>
        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${payoutStatusClass(status)}`}>
          {payoutStatusLabel(status, paidAmount)}
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
    const detail = String(importantRecord?.detail ?? "").trim();
    if (!label && !reason && !detail) return null;

    return (
      <span className="mt-1 block">
        {label && (
          <span className="block text-[11px] font-medium text-slate-500">
            Zapsáno z {label}
          </span>
        )}
        {reason && (
          <span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${payoutDifferenceReasonClass(reason)}`}>
            {payoutDifferenceReasonLabel(reason)}
          </span>
        )}
        {detail && (
          <span className="mt-1 block max-w-[46rem] text-[11px] font-medium leading-relaxed text-amber-900">
            {detail}
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
    const total = sumCommissionItems(commissionItems);

    return (
      <details key={key} className="group">
        <summary
          className={`${commissionRowClass} cursor-pointer list-none transition hover:border-slate-400 hover:bg-slate-100 [&::-webkit-details-marker]:hidden`}
        >
          <span className="flex min-w-0 items-start gap-2.5 text-sm font-medium text-slate-900 sm:items-center sm:text-base">
            <span className="relative h-[22px] w-[22px] flex-shrink-0">
              <Image src="/icons/penize2.webp" alt="" fill className="object-contain" />
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

        <div className="mt-2 space-y-2 rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-3">
          {commissionItems.map((part) => {
            const partNote = displayNoteForCommissionItem(part);
            const codes = payoutCodesForCommissionItem(part, product);
            const payoutState = payoutStatusForCodes(
              payoutsForRows,
              codes,
              validPayoutAmount(part.amount)
            );

            return (
              <div
                key={part.title}
                className={`flex items-start justify-between gap-3 rounded-xl border px-3 py-2 ${payoutRowClass(payoutState.status)}`}
              >
                <span className="min-w-0 text-sm font-medium text-slate-800">
                  <span>{cleanResultTitle(part.title)}</span>
                  {partNote && (
                    <span className="mt-1 block text-xs font-semibold text-red-600">
                      {partNote}
                    </span>
                  )}
                  {renderPayoutRecordHint(payoutState.records)}
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1 whitespace-nowrap pt-0.5 text-sm font-semibold text-slate-950">
                  <span>{formatMoney(part.amount)}</span>
                  {renderPayoutStatusChip(
                    payoutState.status,
                    payoutState.paidAmount,
                    validPayoutAmount(part.amount),
                    payoutState.records
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
    const icon = resultIconForTitle(item.title);
    const clickable =
      product === "neon" &&
      isLegacyImmediateTotalTitle(item.title) &&
      hasNeonImmediateCoefficient(position);
    const rowClass = clickable
      ? `${commissionRowClass} w-full text-left transition hover:border-slate-400 hover:bg-slate-100`
      : commissionRowClass;
    const itemNote = displayNoteForCommissionItem(item);
    const payoutCodes = payoutCodesForCommissionItem(item, product);
    const payoutState = payoutStatusForCodes(
      payoutsForRows,
      payoutCodes,
      validPayoutAmount(item.amount)
    );
    const recurringInstallments = recurringInstallmentsForCommissionItem(
      item,
      product,
      contractDurationYears
    );

    if (recurringInstallments.length > 0) {
      const paidInstallments = recurringInstallments.filter(
        (installment) => {
          const installmentTargets = payoutTargetsForInstallment(installment);
          return (
            payoutStatusForCodes(
              payoutsForRows,
              installmentTargets,
              installment.amount
            ).status === "paid"
          );
        }
      ).length;
      const recurringTotal = recurringInstallments.reduce((sum, installment) => sum + installment.amount, 0);

      return (
        <details key={key} className="group">
          <summary
            className={`${commissionRowClass} cursor-pointer list-none transition hover:border-slate-400 hover:bg-slate-100 [&::-webkit-details-marker]:hidden`}
          >
            <span className="flex min-w-0 items-start gap-2.5 text-sm font-medium text-slate-900 sm:items-center sm:text-base">
              {icon && (
                <span className="relative h-[22px] w-[22px] flex-shrink-0">
                  <Image src={icon} alt="" fill className="object-contain" />
                </span>
              )}
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
              {formatMoney(item.amount)}
              <ChevronDown
                size={18}
                strokeWidth={2.2}
                className="shrink-0 text-slate-500 transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
            </span>
          </summary>

          <div className="mt-2 space-y-2 rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-3">
            {recurringInstallments.map((installment) => {
              const installmentTargets = payoutTargetsForInstallment(installment);
              const installmentState = payoutStatusForCodes(
                payoutsForRows,
                installmentTargets,
                installment.amount
              );

              return (
                <div
                  key={installment.key}
                  className={`flex items-start justify-between gap-3 rounded-xl border px-3 py-2 ${payoutRowClass(installmentState.status)}`}
                >
                  <span className="min-w-0 text-sm font-medium text-slate-800">
                    <span>
                      {installment.label}
                      {installment.code ? ` · ${installment.code}` : ""}
                    </span>
                    {renderPayoutRecordHint(installmentState.records)}
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1 whitespace-nowrap pt-0.5 text-sm font-semibold text-slate-950">
                    <span>{formatMoney(installment.amount)}</span>
                    {renderPayoutStatusChip(
                      installmentState.status,
                      installmentState.paidAmount,
                      validPayoutAmount(installment.amount),
                      installmentState.records
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
          {icon && (
            <span className="relative h-[22px] w-[22px] flex-shrink-0">
              <Image src={icon} alt="" fill className="object-contain" />
            </span>
          )}
          <span className="min-w-0 leading-tight [overflow-wrap:anywhere]">
            <span>{cleanResultTitle(item.title)}</span>
            {itemNote && (
              <span className="mt-1 block text-xs font-semibold text-red-600">
                {itemNote}
              </span>
            )}
            {payoutCodes.length > 0 && renderPayoutRecordHint(payoutState.records)}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1 whitespace-nowrap text-right text-base font-semibold text-slate-900">
          <span>{formatMoney(item.amount)}</span>
          {payoutCodes.length > 0 &&
            renderPayoutStatusChip(
              payoutState.status,
              payoutState.paidAmount,
              validPayoutAmount(item.amount),
              payoutState.records
            )}
        </span>
      </>
    );

    if (!clickable) {
      return (
        <div key={key} className={rowClass}>
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

  return (
    <div className="space-y-4">
      {showAnyMeziprovision && (
        <section className="space-y-3">
          {meziprovisionCards.map((card) => {
            const isExpanded = expandedMeziprovisionKeys.includes(card.key);
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
                      <div className="space-y-1">
                        {renderCommissionRows(
                          card.items,
                          card.position,
                          card.mode,
                          card.key,
                          payoutsForWriter(card.email ?? normalizedViewerEmail)
                        )}
                      </div>

                      {!hideAnnualAutoTotals && (
                        <div className={commissionTotalHighlightClass}>
                          {isPaymentBasedProduct && card.totals ? (
                            <div className="w-full space-y-2">
                              <div className={commissionTotalLineDarkClass}>
                                <span className={commissionTotalLabelDarkClass}>Celkem v 1. roce</span>
                                <span className={commissionTotalValueDarkClass}>
                                  {formatMoney(card.totals.immediate)}
                                </span>
                              </div>
                              <div className={commissionTotalLineDarkClass}>
                                <span className={commissionTotalLabelDarkClass}>Celkem následně ročně</span>
                                <span className={commissionTotalValueDarkClass}>
                                  {formatMoney(card.totals.subsequent)}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className={`${commissionTotalLineDarkClass} w-full`}>
                              <span className={commissionTotalLabelDarkClass}>Celkem meziprovize</span>
                              <span className={commissionTotalValueDarkClass}>
                                {formatMoney(card.totalDisplay)}
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
          <h3 className={`flex items-center gap-2 text-lg font-semibold ${monoHeadingClass}`}>
            <span className={monoChipDarkClass}>Provize</span>
            Výpočet provizí
          </h3>
          <div className={commissionPanelClass}>
            <div className="space-y-1">
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
                    <div className={commissionTotalLineDarkClass}>
                      <span className={commissionTotalLabelDarkClass}>Celkem v 1. roce</span>
                      <span className={commissionTotalValueDarkClass}>
                        {formatMoney(paymentBasedAdviserTotals.immediate)}
                      </span>
                    </div>
                    <div className={commissionTotalLineDarkClass}>
                      <span className={commissionTotalLabelDarkClass}>Celkem následně ročně</span>
                      <span className={commissionTotalValueDarkClass}>
                        {formatMoney(paymentBasedAdviserTotals.subsequent)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className={`${commissionTotalLineDarkClass} w-full`}>
                    <span className={commissionTotalLabelDarkClass}>Celkem</span>
                    <span className={commissionTotalValueDarkClass}>
                      {formatMoney(adviserTotalDisplay)}
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
              <div className="space-y-1">
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
                      <div className={commissionTotalLineDarkClass}>
                        <span className={commissionTotalLabelDarkClass}>Celkem v 1. roce</span>
                        <span className={commissionTotalValueDarkClass}>
                          {formatMoney(paymentBasedAdviserTotals.immediate)}
                        </span>
                      </div>
                      <div className={commissionTotalLineDarkClass}>
                        <span className={commissionTotalLabelDarkClass}>Celkem následně ročně</span>
                        <span className={commissionTotalValueDarkClass}>
                          {formatMoney(paymentBasedAdviserTotals.subsequent)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className={`${commissionTotalLineDarkClass} w-full`}>
                      <span className={commissionTotalLabelDarkClass}>Celkem</span>
                      <span className={commissionTotalValueDarkClass}>
                        {formatMoney(adviserTotalDisplay)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
