import { hasPendingFlexiRenovationBase } from "@/app/lib/flexiRenovation";
import { projectConfirmedCommissionCodes } from "@/app/lib/commissionPayoutCodeAdjustment";
import { splitConfirmedOpeningReceipt } from "@/app/lib/confirmedQuarterlyInstallments";
import { coverAcquisitionCashflowInstallments } from "./acquisitionInstallmentCoverage";
import { PAYOUT_EXCEPTION_POSITION, PAYOUT_EXCEPTION_START_YEAR, payoutPositionException, payoutPositionExceptionItems } from "@/app/lib/payoutPositionException";
import { autoFrequencyCommissionPeriods, autoFrequencyCommissionMultiplier, cppKomplexRenewalCommissionMultiplier, paymentFrequencyAtDate } from "@/app/lib/autoPaymentFrequency";
import { estimatePayoutDate } from "../lib/commissionPayoutDate";
import { contractPortalLinks } from "../lib/contractPortalLinks";
import { isInheritedContract, isSubsequentCommissionItem } from "../lib/inheritedContracts";
import { neonCorrectionPayoutAmount, neonExpectedStatementMonth } from "../lib/neonCorrection";
import type { PaymentFrequency } from "../types/domain";
import { cppBytexSubsequentPayoutYears } from "../lib/productFormulas/cppbytex";
import { domexSubsequentPayoutYears } from "../lib/productFormulas/domex";
import { MAX_CIZIN_KOMPLEX_IMMEDIATE_CODE } from "../lib/productFormulas/maxcizinkomplex";
import { toDate } from "./helpers";
import type { CashflowItem, EntryDoc } from "./types";
import { baseCommissionCodeForPayoutComparison } from "../lib/commissionPayoutRules";
import { describeKooperativaCPayout, isKooperativaCPayout } from "../lib/kooperativaCPayoutMeaning";
import { calendarDate } from "../lib/calendarDates";
import { createEndorsementCommissionPlan } from "../lib/endorsementCommissionPlan";
import { commissionPeriodForCode } from "../lib/commissionPeriodForCode";
import { isRetiredProduct } from "../lib/retiredProducts";
import { isRecordOnlyProduct } from "../lib/productCatalog";
import { activePayoutRecordsAfterFullStornos, neonEndorsementForOriginalPayout, uniqueFamilyCommissionReceipts, wasNeonCommissionSettledBefore, type LifeIncreaseReceiptIndex } from "../lib/commissionReceipts";
import { isNeonPremiumIncreaseComponent, lifeIncreaseItemCode, lifeIncreaseCommissionLabel, normalizeLifeCommissionItemCode } from "../lib/lifePremiumIncrease";
import { isNeonRecurringStatementCode } from "../lib/neonRecurringStatementBase";
import { createDomexNeuronPremiumTimeline } from "../lib/domexNeuronPremiumHistory";

export { estimatePayoutDate } from "../lib/commissionPayoutDate";

type ImmediateCashflowPart = {
  title: string;
  amount: number;
  commissionCode: string;
  commissionCodeAliases: string[];
  commissionLabel: string;
};

type EntryCommissionPayout = NonNullable<EntryDoc["commissionPayouts"]>[number];

type IndexedCommissionPayout = {
  payout: EntryCommissionPayout;
  key: string;
  date: Date;
};

export function estimateLifeFirstPayoutDate(
  policyStart: Date,
  agreementDate: Date,
  product: EntryDoc["productKey"],
  payoutDay = 25
): Date {
  // Předstih pro akceptaci počítáme od sjednání: do 25. dne +1 měsíc,
  // později +2 měsíce. NEON sjednaný před měsícem počátku a začínající
  // prvního může mít první výplatu už v měsíci počátku; jinak až v dalším.
  // U ostatních životek výplata nesmí předcházet samotnému počátku.
  const acceptancePayout = estimatePayoutDate(agreementDate, agreementDate, 25, payoutDay);
  const startsOnFirstAfterSigning = policyStart.getDate() === 1 && agreementDate <
    calendarDate(policyStart, policyStart.getFullYear(), policyStart.getMonth(), 1);
  const monthsAfterStart = (product === "neon" && !startsOnFirstAfterSigning) ||
    policyStart.getDate() > payoutDay ? 1 : 0;
  const earliestPayout = calendarDate(policyStart,
    policyStart.getFullYear(),
    policyStart.getMonth() + monthsAfterStart,
    payoutDay
  );
  return acceptancePayout > earliestPayout ? acceptancePayout : earliestPayout;
}

function isSameCalendarMonth(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth()
  );
}

function estimateAutoFirstPayoutDate(
  policyStart: Date,
  agreementDate?: Date | null,
  payoutDay = 25
): Date {
  if (agreementDate && isSameCalendarMonth(policyStart, agreementDate)) {
    return calendarDate(policyStart, policyStart.getFullYear(), policyStart.getMonth() + 1, payoutDay);
  }

  return estimatePayoutDate(policyStart, agreementDate, 25, payoutDay);
}

const AUTO_CASHFLOW_PRODUCTS = new Set<EntryDoc["productKey"]>([
  "allianzAuto",
  "cppAuto",
  "csobAuto",
  "kooperativaAuto",
  "koopflotila",
  "pillowAuto",
  "slaviaauto",
  "slaviaflotila",
  "uniqaAuto",
  "uniqaflotila",
]);

function isAutoCashflowProduct(product: EntryDoc["productKey"]): boolean {
  return AUTO_CASHFLOW_PRODUCTS.has(product);
}

export function monthsBetweenPayments(freq?: PaymentFrequency | null): number {
  switch (freq) {
    case "monthly":
      return 1;
    case "quarterly":
      return 3;
    case "semiannual":
      return 6;
    case "annual":
      return 12;
    default:
      return 12;
  }
}

function normalizeContractStatus(status: unknown): "active" | "storno" | "dozita" {
  if (typeof status !== "string") return "active";
  const normalized = status.trim().toLowerCase();
  if (
    normalized === "storno" ||
    normalized === "stornovana" ||
    normalized === "stornována"
  ) {
    return "storno";
  }
  if (
    normalized === "dozita" ||
    normalized === "dožitá" ||
    normalized === "dozito" ||
    normalized === "dožito"
  ) {
    return "dozita";
  }
  return "active";
}

function monthSerial(value: Date): number {
  return value.getFullYear() * 12 + value.getMonth();
}

function isFromStornoMonth(date: Date, stornoDate: Date): boolean {
  return monthSerial(date) >= monthSerial(stornoDate);
}

function earlierDate(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}

function dateToIsoDay(value: Date | null | undefined): string | null {
  if (!value || Number.isNaN(value.getTime())) return null;
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isSplitImmediateProduct(product: EntryDoc["productKey"]): boolean {
  return (
    product === "neon" ||
    product === "flexi" ||
    product === "maximaMaxEfekt" ||
    product === "pillowInjury"
  );
}

const normalizeCommissionCode = (code: string | null | undefined): string =>
  String(code ?? "").trim().toUpperCase().replace(/\s+/g, "");

const normalizeEmail = (value: string | null | undefined): string =>
  String(value ?? "").trim().toLowerCase();

const firstYearInstallmentCommissionCode = (
  prefix: "A" | "B",
  installmentIndex: number
): string | null => {
  if (!Number.isInteger(installmentIndex) || installmentIndex < 1) {
    return null;
  }
  if (prefix === "A" && installmentIndex > 12) return null;
  return `${prefix}${String(100 + installmentIndex)}`;
};

const commissionCodeAliasesForCashflow = (code: string): string[] => {
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
  const closingRoleMatch = code.match(/^(?:APZ|AP|AZ)(\d+)$/);
  if (closingRoleMatch) return [code, `A${closingRoleMatch[1]}`];
  if (/^A\d+$/.test(code)) return [code];
  if (code === "B301") return ["B0301", "B301"];
  if (code === "B101-B104") return ["B101-B104", "B101", "B102", "B103", "B104"];
  if (/^B1\d+$/.test(code)) return [code];
  if (code === "B201-B206") {
    return ["B201-B206", "B201", "B202", "B203", "B204", "B205", "B206"];
  }
  if (/^B20[1-6]$/.test(code)) return [code, "B201-B206"];
  if (code === "B36_HALF" || code === "B036_HALF" || code === "B3601_HALF") {
    return ["B36_HALF", "B036_HALF", "B3601_HALF"];
  }
  if (code === "B36" || code === "B036" || code === "B3601") {
    return ["B36", "B036", "B3601"];
  }
  if (code === "B48" || code === "B048" || code === "B4801") {
    return ["B48", "B048", "B4801"];
  }
  return [code];
};

const SETTLED_COMMISSION_PAYOUT_STATUSES = new Set(["", "paid", "difference"]);
const STATEMENT_ONLY_COMMISSION_PAYOUT_STATUSES = new Set([
  "",
  "paid",
  "difference",
  "storno",
]);

function uniqueCommissionCodes(codes: Array<string | null | undefined>, product?: EntryDoc["productKey"]): string[] {
  const result = new Set<string>();

  for (const code of codes) {
    const normalizedCode = normalizeCommissionCode(code);
    if (!normalizedCode || normalizedCode === "TOTAL") continue;
    const comparableCode = isKooperativaCPayout(product, normalizedCode)
      ? baseCommissionCodeForPayoutComparison(normalizedCode, product) : normalizedCode;
    if (comparableCode !== normalizedCode) result.add(normalizedCode);
    for (const alias of commissionCodeAliasesForCashflow(comparableCode)) {
      const normalizedAlias = normalizeCommissionCode(alias);
      if (normalizedAlias && normalizedAlias !== "TOTAL") {
        result.add(normalizedAlias);
      }
    }
  }

  return [...result];
}

function amountsMatchExpectedPayout(
  expectedAmount: number,
  candidateAmount: number | null | undefined
): boolean {
  const expected = Math.abs(Number(expectedAmount));
  const candidate = Math.abs(Number(candidateAmount));
  if (!Number.isFinite(expected) || !Number.isFinite(candidate)) return false;

  const tolerance = Math.max(10, expected * 0.03);
  return Math.abs(candidate - expected) <= tolerance;
}

function payoutMonthDateFromKey(value: string | null | undefined, calendar?: Date): Date | null {
  const match = String(value ?? "").match(/^(\d{4})-(\d{1,2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month)) return null;
  if (month < 1 || month > 12) return null;
  return calendarDate(calendar, year, month - 1, 25);
}

function payoutSortValue(payout: IndexedCommissionPayout): number {
  const chronology = Number(payout.payout.statementChronologyMs);
  if (Number.isFinite(chronology)) return chronology;
  return payout.date.getTime();
}

function isSettledCommissionPayout(payout: EntryCommissionPayout): boolean {
  const status = String(payout.status ?? "").trim().toLowerCase();
  if (!SETTLED_COMMISSION_PAYOUT_STATUSES.has(status)) return false;
  const amount = Number(payout.amount);
  return Number.isFinite(amount) && amount > 0;
}

function isStatementOnlyCommissionPayout(payout: EntryCommissionPayout): boolean {
  const status = String(payout.status ?? "").trim().toLowerCase();
  if (!STATEMENT_ONLY_COMMISSION_PAYOUT_STATUSES.has(status)) return false;
  const amount = Number(payout.amount);
  return Number.isFinite(amount) && amount !== 0;
}

function indexSettledCommissionPayouts(
  payouts: EntryDoc["commissionPayouts"] | undefined | null,
  calendar?: Date
): IndexedCommissionPayout[] {
  return (payouts ?? [])
    .map((payout, index): IndexedCommissionPayout | null => {
      if (!isSettledCommissionPayout(payout)) return null;
      const date = payoutMonthDateFromKey(payout.payoutMonthKey, calendar);
      if (!date) return null;
      return {
        payout,
        key:
          payout.key ??
          [
            payout.code ?? "commission",
            payout.payoutMonthKey ?? "month",
            payout.amount ?? index,
            index,
          ].join(":"),
        date,
      };
    })
    .filter((payout): payout is IndexedCommissionPayout => Boolean(payout))
    .sort((a, b) => payoutSortValue(a) - payoutSortValue(b));
}

function indexStatementOnlyCommissionPayouts(
  payouts: EntryDoc["commissionPayouts"] | undefined | null,
  calendar?: Date
): IndexedCommissionPayout[] {
  return (payouts ?? [])
    .map((payout, index): IndexedCommissionPayout | null => {
      if (!isStatementOnlyCommissionPayout(payout)) return null;
      const date = payoutMonthDateFromKey(payout.payoutMonthKey, calendar);
      if (!date) return null;
      return {
        payout,
        key:
          payout.key ??
          [
            payout.code ?? "commission",
            payout.payoutMonthKey ?? "month",
            payout.amount ?? index,
            index,
          ].join(":"),
        date,
      };
    })
    .filter((payout): payout is IndexedCommissionPayout => Boolean(payout))
    .sort((a, b) => payoutSortValue(a) - payoutSortValue(b));
}

export function cashflowCommissionPayoutsForViewer(
  entry: EntryDoc,
  viewerEmail?: string | null
): EntryDoc["commissionPayouts"] {
  const payouts = entry.commissionPayouts ?? [];
  const normalizedViewerEmail = normalizeEmail(viewerEmail);

  return payouts.filter((payout) => {
    const writtenBy = normalizeEmail(payout.writtenBy);
    if (writtenBy) return writtenBy === normalizedViewerEmail;

    return entry.source !== "manager";
  });
}

function findSettledCommissionPayout(
  payouts: IndexedCommissionPayout[],
  consumedPayoutKeys: Set<string>,
  amount: number | null,
  metadata: Partial<
    Pick<CashflowItem, "commissionCode" | "commissionCodeAliases" | "commissionLabel">
  >,
  expectedDate: Date,
  product?: EntryDoc["productKey"],
  lifeEndorsement = false
): IndexedCommissionPayout | null {
  const itemCodes = uniqueCommissionCodes([
    metadata.commissionCode,
    ...(metadata.commissionCodeAliases ?? []),
  ], product);
  if (itemCodes.length === 0) return null;

  const itemCodeSet = new Set(itemCodes);
  const matchingPayouts = payouts.filter((indexedPayout) => {
    if (consumedPayoutKeys.has(indexedPayout.key)) return false;

    const payoutCode = lifeEndorsement ? lifeIncreaseItemCode(indexedPayout.payout.code) ?? indexedPayout.payout.code : indexedPayout.payout.code;
    const payoutCodes = uniqueCommissionCodes([payoutCode], product);
    return payoutCodes.some((code) => itemCodeSet.has(code));
  });
  if (matchingPayouts.length === 0) return null;

  const expectedMonth = monthSerial(expectedDate);
  return matchingPayouts
    .sort((a, b) => {
      const aDistance = Math.abs(monthSerial(a.date) - expectedMonth);
      const bDistance = Math.abs(monthSerial(b.date) - expectedMonth);
      if (aDistance !== bDistance) return aDistance - bDistance;
      const aAmountMatches = amount != null && (
        amountsMatchExpectedPayout(amount, a.payout.expectedAmount) ||
        amountsMatchExpectedPayout(amount, a.payout.amount));
      const bAmountMatches = amount != null && (
        amountsMatchExpectedPayout(amount, b.payout.expectedAmount) ||
        amountsMatchExpectedPayout(amount, b.payout.amount));
      if (aAmountMatches !== bAmountMatches) return aAmountMatches ? -1 : 1;
      return payoutSortValue(a) - payoutSortValue(b);
    })[0] ?? null;
}

function commissionLabelFromCode(code: string | null | undefined): string | null {
  const normalizedCode = normalizeCommissionCode(code);
  if (!normalizedCode) return null;
  const increaseLabel = lifeIncreaseCommissionLabel(normalizedCode);
  if (increaseLabel) return increaseLabel;
  if (/^A\d+$/.test(normalizedCode)) return `Provize ${normalizedCode}`;
  if (normalizedCode === "B0301") return "Provize B0301";
  if (normalizedCode === "B101-B104" || /^B1\d+$/.test(normalizedCode)) {
    return "Následná provize";
  }
  if (normalizedCode === "B201-B206" || /^B20[1-6]$/.test(normalizedCode)) {
    return "Pečovatelská provize";
  }
  if (
    normalizedCode === "B36_HALF" ||
    normalizedCode === "B036_HALF" ||
    normalizedCode === "B3601_HALF"
  ) {
    return "Provize 50% z B3601";
  }
  if (
    normalizedCode === "B36" ||
    normalizedCode === "B036" ||
    normalizedCode === "B3601"
  ) return "Provize po 3 letech";
  if (
    normalizedCode === "B48" ||
    normalizedCode === "B048" ||
    normalizedCode === "B4801"
  ) return "Provize po 4 letech";
  return `Provize ${normalizedCode}`;
}

const commissionMetadataFromCode = (
  code: string | null | undefined,
  label: string
):
  | Pick<CashflowItem, "commissionCode" | "commissionCodeAliases" | "commissionLabel">
  | Record<string, never> => {
  const normalizedCode = normalizeCommissionCode(code);
  if (!normalizedCode || normalizedCode === "TOTAL") return {};
  return {
    commissionCode: normalizedCode,
    commissionCodeAliases: commissionCodeAliasesForCashflow(normalizedCode),
    commissionLabel: label,
  };
};

function splitImmediatePartFromTitle(
  title: string,
  amount: number,
  product: EntryDoc["productKey"],
  code?: string | null,
  allowUnknownAmount = false
): ImmediateCashflowPart | null {
  if (!isSplitImmediateProduct(product)) return null;
  if (!Number.isFinite(amount) || (amount === 0 && !allowUnknownAmount)) return null;
  const normalizedCode = normalizeCommissionCode(code);

  if (normalizedCode === "A101" || title.includes("provize a101")) {
    return {
      title,
      amount,
      commissionCode: "A101",
      commissionCodeAliases: ["A101", "A102"],
      commissionLabel: "Provize A101",
    };
  }

  if (normalizedCode === "B0301" || title.includes("provize b0301")) {
    return {
      title,
      amount,
      commissionCode: "B0301",
      commissionCodeAliases: ["B0301"],
      commissionLabel: "Provize B0301",
    };
  }

  if (
    normalizedCode === "B3601_HALF" ||
    normalizedCode === "B036_HALF" ||
    normalizedCode === "B36_HALF" ||
    title.includes("50% z b3601") ||
    title.includes("50% z b036") ||
    title.includes("50% z b36")
  ) {
    const useB36Code = product === "flexi" || product === "pillowInjury";
    const label = useB36Code ? "Provize 50% z B36" : "Provize 50% z B3601";
    const halfCode = useB36Code ? "B36_HALF" : "B3601_HALF";
    return {
      title,
      amount,
      commissionCode: halfCode,
      commissionCodeAliases: ["B36_HALF", "B036_HALF", "B3601_HALF"],
      commissionLabel: label,
    };
  }

  return null;
}

const plannedPayoutIdentity = (item: CashflowItem) =>
  JSON.stringify([item.ownerEmail, item.entryId, item.date.getTime(), item.commissionCode, item.commissionLabel, item.note]);

export function generateCashflow(
  entries: EntryDoc[],
  horizonYears = 10,
  viewerEmail?: string | null,
  asOf: Date = new Date(),
  timelineEntries: EntryDoc[] = entries,
  lifeReceiptEvidence?: LifeIncreaseReceiptIndex,
): CashflowItem[] {
  const base = generateCashflowSchedule(entries, horizonYears, viewerEmail, asOf, timelineEntries, lifeReceiptEvidence);
  const revisedEntries = entries.flatMap(entry => {
    if (entry.source === "manager" || hasPendingFlexiRenovationBase(entry) || !payoutPositionException(entry, "2026-01")) return [];
    const items = payoutPositionExceptionItems(entry);
    return items ? [{ ...entry, items, commissionPayouts: [], cashflowPayoutMatches: [] }] : [];
  });
  if (!revisedEntries.length) return base;

  const revised = new Map(generateCashflowSchedule(revisedEntries, horizonYears, viewerEmail, asOf, timelineEntries)
    .map(item => [plannedPayoutIdentity(item), item]));
  return base.map(item => {
    if (item.source === "manager" || item.payoutStatus === "paid" || item.isPartialPayoutBalance) return item;
    const repriced = revised.get(plannedPayoutIdentity(item));
    if (!repriced || repriced.amount === item.amount) return item;
    if (item.date.getFullYear() < PAYOUT_EXCEPTION_START_YEAR) {
      return { ...item, repricedAmountIfShifted: repriced.amount };
    }
    return {
      ...item,
      amount: repriced.amount,
      originalPositionAmount: item.amount,
      predictionPosition: PAYOUT_EXCEPTION_POSITION,
      premiumChangeOriginalAmount: repriced.premiumChangeOriginalAmount,
    };
  });
}

function generateCashflowSchedule(
  entries: EntryDoc[],
  horizonYears = 10,
  viewerEmail?: string | null,
  asOf: Date = new Date(),
  timelineEntries: EntryDoc[] = entries,
  lifeReceiptEvidence?: LifeIncreaseReceiptIndex,
): CashflowItem[] {
  const out: CashflowItem[] = [];
  const endorsementPlan = createEndorsementCommissionPlan(timelineEntries.filter(entry => !isRetiredProduct(entry.productKey)));
  const scheduleEntries = uniqueFamilyCommissionReceipts(entries, lifeReceiptEvidence);
  const scheduleIdentity = (owner?: string | null, source?: string, id?: string | null) =>
    JSON.stringify([normalizeEmail(owner), source ?? "own", id]);
  const scheduleKey = (entry: EntryDoc, id = entry.originalEntryId ?? entry.id) =>
    scheduleIdentity(entry.userEmail, entry.source, id);
  const neonSchedules = new Map(scheduleEntries.filter(entry => entry.productKey === "neon")
    .map(entry => [scheduleKey(entry), entry.items ?? []]));
  const neonIncreasesByRoot = new Map<string, EntryDoc[]>();
  for (const entry of scheduleEntries) {
    if (entry.productKey !== "neon" || entry.entryType !== "endorsement") continue;
    const rootId = endorsementPlan.neonRecurringRootId(entry);
    if (!rootId) continue;
    const key = scheduleKey(entry, rootId);
    const increases = neonIncreasesByRoot.get(key) ?? [];
    increases.push(entry);
    neonIncreasesByRoot.set(key, increases);
  }
  const projectedNeonReceipts = new Map<EntryDoc, EntryCommissionPayout[]>();
  for (const root of scheduleEntries) {
    if (root.productKey !== "neon" || root.entryType === "endorsement") continue;
    const increases = (neonIncreasesByRoot.get(scheduleKey(root)) ?? []).filter(entry =>
      !root.contractNumber || !entry.contractNumber || root.contractNumber.trim() === entry.contractNumber.trim());
    if (!increases.length) continue;
    const remaining: EntryCommissionPayout[] = [];
    for (const receipt of cashflowCommissionPayoutsForViewer(root, viewerEmail) ?? []) {
      const target = neonEndorsementForOriginalPayout(receipt, increases);
      if (!target) {
        remaining.push(receipt);
        continue;
      }
      const targetReceipts = projectedNeonReceipts.get(target) ?? cashflowCommissionPayoutsForViewer(target, viewerEmail) ?? [];
      targetReceipts.push(receipt);
      projectedNeonReceipts.set(target, targetReceipts);
    }
    projectedNeonReceipts.set(root, remaining);
  }
  const absorbedNeonComponents = new Map<string, Set<string>>();
  let globalItemSequence = 0;
  const now = calendarDate(asOf, asOf);
  const today = dateToIsoDay(now) ?? "";
  const horizonEnd = calendarDate(now,
    now.getFullYear() + horizonYears,
    now.getMonth(),
    now.getDate()
  );

  for (const entry of scheduleEntries) {
    const entryOutputStart = out.length;
    if (isRetiredProduct(entry.productKey) || isRecordOnlyProduct(entry.productKey)) continue;
    const portalLinks = contractPortalLinks(entry);
    const baseEntryId = entry.originalEntryId ?? entry.id;
    const ownerEmail = entry.userEmail ?? null;
    const normalizedOwnerEmail = ownerEmail
      ? ownerEmail.toLowerCase()
      : null;
    const status = normalizeContractStatus(entry.status);
    const isStorno = status === "storno";
    const parsedStornoDate = toDate(entry.stornoDate, { calendar: now });
    const stornoCutoffDate = isStorno ? parsedStornoDate ?? now : null;
    const scopedPayouts = splitConfirmedOpeningReceipt(projectConfirmedCommissionCodes(entry,
      projectedNeonReceipts.get(entry) ?? cashflowCommissionPayoutsForViewer(entry, viewerEmail) ?? []));
    const settledPayouts = indexSettledCommissionPayouts(scopedPayouts, now);
    const statementOnlyPayouts = indexStatementOnlyCommissionPayouts(scopedPayouts, now);
    const lifeEndorsement = entry.entryType === "endorsement" && ["neon", "flexi", "maximaMaxEfekt"].includes(entry.productKey ?? "");
    const activeNeonRecurringPayouts = entry.productKey === "neon" ? new Set(
      activePayoutRecordsAfterFullStornos(scopedPayouts.filter(payout => isNeonRecurringStatementCode(payout.code)), "neon")
    ) : null;
    const payoutPeriods = new Map([...settledPayouts, ...statementOnlyPayouts].map(record =>
      [record.key, commissionPeriodForCode(entry, lifeEndorsement ? lifeIncreaseItemCode(record.payout.code) ?? record.payout.code : record.payout.code)]
    ));
    const consumedPayoutKeys = new Set<string>();

    const start =
      toDate(entry.policyStartDate, { calendar: now }) ??
      toDate(entry.contractSignedDate, { calendar: now }) ??
      toDate(entry.createdAt, { calendar: now }) ??
      calendarDate(now, now);
    const agreement =
      toDate(entry.contractSignedDate, { calendar: now }) ??
      toDate(entry.createdAt, { calendar: now }) ??
      toDate(entry.policyStartDate, { calendar: now }) ??
      start;
    const contractSignedDateIso = dateToIsoDay(toDate(entry.contractSignedDate, { calendar: now }));
    const policyEnd = toDate(entry.policyEndDate, { calendar: now });
    const policyEndPayoutDate = policyEnd ? estimatePayoutDate(policyEnd) : null;
    const entryHorizonEnd = earlierDate(
      horizonEnd,
      policyEndPayoutDate ?? (status === "dozita" ? now : horizonEnd)
    );
    const product = entry.productKey;
    const flexiWithoutBase = hasPendingFlexiRenovationBase(entry);
    const pendingFlexiSchedule = flexiWithoutBase && entry.source !== "manager";
    const neuronPremiumTimeline = product === "domexneuron" ? createDomexNeuronPremiumTimeline(entry) : null;
    const currentMonthlyPremiumRaw =
      neuronPremiumTimeline?.premiumAtDate(dateToIsoDay(now)) ??
      endorsementPlan.currentPremium(entry, dateToIsoDay(now)) ??
      entry.effectiveInputAmount ??
      entry.newInputAmount ??
      entry.inputAmount ??
      null;
    const currentMonthlyPremium =
      typeof currentMonthlyPremiumRaw === "number" &&
      Number.isFinite(currentMonthlyPremiumRaw)
        ? currentMonthlyPremiumRaw
        : null;
    const storedRefreshBaseMonthlyRaw =
      entry.refreshCommissionBase?.calculationMonthlyPremium ??
      (typeof entry.refreshCommissionBase?.calculationAnnualPremium === "number"
        ? entry.refreshCommissionBase.calculationAnnualPremium / 12
        : null);
    const lifeStornoBaseMonthlyPremium = flexiWithoutBase ? null :
      typeof storedRefreshBaseMonthlyRaw === "number" &&
      Number.isFinite(storedRefreshBaseMonthlyRaw) &&
      storedRefreshBaseMonthlyRaw >= 0
        ? storedRefreshBaseMonthlyRaw
        : currentMonthlyPremium;
    const lifeRevisionBaseDate =
      toDate(entry.contractSignedDate, { calendar: now }) ??
      toDate(entry.policyStartDate, { calendar: now }) ??
      toDate(entry.createdAt, { calendar: now }) ??
      start;

    const inherited = isInheritedContract(entry);
    const inheritedFrom = entry.transferEffectiveDate;
    // Entitlement follows the premium period, not the later statement/payout date.
    const commissionPeriods = new Map<number, Date>();
    const periodAfterMonths = (months: number) => {
      const monthStart = calendarDate(start, start.getFullYear(), start.getMonth() + months, 1);
      const lastDay = calendarDate(start, monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
      return calendarDate(start, monthStart.getFullYear(), monthStart.getMonth(), Math.min(start.getDate(), lastDay));
    };
    const rememberRecurringPeriod = (payout: Date, firstPayout: Date) => {
      const period = periodAfterMonths(monthSerial(payout) - monthSerial(firstPayout));
      commissionPeriods.set(payout.getTime(), period);
      return period;
    };
    const items = (pendingFlexiSchedule ? [] : entry.items ?? [])
      .filter((item) => !inherited || isSubsequentCommissionItem(item))
      .map((it) => ({
      title: (it.title ?? "").toLowerCase(),
      amount: it.amount ?? 0,
      code: it.code ?? null,
    }));

    const immediateItems = items.filter(
      (item) =>
        item.title.includes("okamžitá provize") ||
        item.title.includes("provize a101") ||
        item.title.includes("provize b0301") ||
        item.title.includes("50% z b3601") ||
        item.title.includes("50% z b36")
    );
    const immediate =
      immediateItems.length > 0
        ? {
            title: "okamžitá provize",
            amount: immediateItems.reduce((sum, item) => sum + item.amount, 0),
          }
        : null;
    const immediateCodes = uniqueCommissionCodes(
      immediateItems.map((item) => item.code)
    );
    const immediateMetadata: Partial<
      Pick<CashflowItem, "commissionCode" | "commissionCodeAliases" | "commissionLabel">
    > =
      immediateCodes.length > 0
        ? {
            commissionCode: immediateCodes[0],
            commissionCodeAliases: immediateCodes,
            commissionLabel: "Okamžitá provize",
          }
        : {
            commissionLabel: "Okamžitá provize",
          };
    const splitImmediateParts = (pendingFlexiSchedule
      ? ["A101", "B0301", ...((entry.commissionMode ?? entry.mode) === "accelerated" ? ["B36_HALF"] : [])]
        .map(code => splitImmediatePartFromTitle("", 0, product, code, true))
      : items.map(item => splitImmediatePartFromTitle(item.title, item.amount, product, item.code)))
      .filter((item): item is ImmediateCashflowPart => Boolean(item));
    const po3 = items.find((item) => item.title.includes("po 3 letech"));
    const po4 = items.find((item) => item.title.includes("po 4 letech"));
    const nasl25 = items.find((item) =>
      item.title.includes("následná provize (2.–5. rok)")
    );
    const nasl510 = items.find((item) => item.title.includes("5.–10."));
    const naslOd6 = items.find((item) =>
      item.title.includes("následná provize (od 6. roku)")
    );
    const naslOd5 = items.find((item) =>
      item.title.includes("následná provize (od 5. roku)")
    );
    const naslMaxdomov = items.find((item) =>
      item.title.includes("následná provize (z platby)")
    );
    const naslGeneric = items.find(
      (item) =>
        item.title.includes("následná provize") &&
        !item.title.includes("(2.–5. rok)") &&
        !item.title.includes("(5.–10. rok)") &&
        !item.title.includes("(od 6. roku)") &&
        !item.title.includes("(od 5. roku)") &&
        !item.title.includes("(z platby)")
    );
    const nasl25Metadata = nasl25
      ? commissionMetadataFromCode(nasl25.code, "Následná provize")
      : {};
    const nasl510Metadata = nasl510
      ? commissionMetadataFromCode(nasl510.code, "Následná provize")
      : {};
    const naslOd5Metadata = naslOd5
      ? commissionMetadataFromCode(naslOd5.code, "Následná provize")
      : {};
    const naslOd6Metadata = naslOd6
      ? commissionMetadataFromCode(naslOd6.code, "Následná provize")
      : {};

    const pushItem = (
      amount: number,
      date: Date,
      note?: string,
      horizonLimit: Date = entryHorizonEnd,
      metadata: Partial<
        Pick<CashflowItem, "commissionCode" | "commissionCodeAliases" | "commissionLabel">
      > = {},
      neonInstallmentCode?: string,
    ) => {
      if (!Number.isFinite(amount) || (amount === 0 && !pendingFlexiSchedule)) return;
      if (inherited) {
        const period = commissionPeriods.get(date.getTime());
        const periodDay = dateToIsoDay(period);
        if (!inheritedFrom || !periodDay || periodDay < inheritedFrom) return;
      }
      if (date > horizonLimit) return;
      if (stornoCutoffDate && isFromStornoMonth(date, stornoCutoffDate)) return;

      // The premium belongs to the insured period, including when the statement
      // arrives later. Initial commissions use the original start, not payday.
      const commissionPeriod = commissionPeriods.get(date.getTime()) ?? start;
      const commissionPeriodStart = dateToIsoDay(commissionPeriod);
      const amountAtPayoutDate = entry.neonCorrection
        ? neonCorrectionPayoutAmount(entry, amount, neonExpectedStatementMonth(date)) : amount;
      const neonComponent = product === "neon" && !lifeEndorsement
        ? normalizeLifeCommissionItemCode(neonInstallmentCode ?? metadata.commissionCode) : "";
      const neonAdjustments = neonComponent && isNeonPremiumIncreaseComponent(neonComponent)
        ? (() => {
          const codes = new Set((neonInstallmentCode ? [neonInstallmentCode] : [neonComponent, ...(metadata.commissionCodeAliases ?? [])])
            .map(normalizeLifeCommissionItemCode));
          const receipts = scopedPayouts.filter(payout =>
            codes.has(normalizeLifeCommissionItemCode(baseCommissionCodeForPayoutComparison(payout.code, product))));
          const through = commissionPeriodStart && commissionPeriodStart > today ? commissionPeriodStart : today;
          return endorsementPlan.neonOpenCommissionAdjustments(entry, amountAtPayoutDate, through,
            day => wasNeonCommissionSettledBefore(receipts, day, commissionPeriodStart));
        })() : [];
      for (const adjustment of neonAdjustments) {
        const key = scheduleKey(entry, adjustment.endorsementEntryId);
        const absorbed = absorbedNeonComponents.get(key) ?? new Set<string>();
        absorbed.add(neonComponent);
        absorbedNeonComponents.set(key, absorbed);
      }
      const neonAdjustment = neonAdjustments.at(-1);
      const premiumChange = neonAdjustment ?? (pendingFlexiSchedule ? null : endorsementPlan.adjust(entry, amountAtPayoutDate, commissionPeriodStart));
      const plannedAmount = premiumChange?.amount ?? amountAtPayoutDate;

      const settledPayout = findSettledCommissionPayout(
        settledPayouts.filter(record => {
          if (neonInstallmentCode && activeNeonRecurringPayouts) {
            return activeNeonRecurringPayouts.has(record.payout) &&
              baseCommissionCodeForPayoutComparison(record.payout.code, product) === neonInstallmentCode;
          }
          if (!isSplitImmediateProduct(product)) return true;
          const period = payoutPeriods.get(record.key);
          return !period || period === commissionPeriodStart;
        }),
        consumedPayoutKeys,
        pendingFlexiSchedule ? null : neonAdjustment ? plannedAmount : amountAtPayoutDate,
        metadata,
        date,
        product,
        lifeEndorsement
      );
      if (settledPayout) {
        consumedPayoutKeys.add(settledPayout.key);
      }
      if (!settledPayout && plannedAmount === 0 && !pendingFlexiSchedule) return;
      const outputDate = settledPayout?.date ?? date;
      const outputAmount =
        settledPayout && Number.isFinite(Number(settledPayout.payout.amount))
          ? Number(settledPayout.payout.amount)
          : plannedAmount;

      const projectedItem: CashflowItem = {
        id: `${entry.id}-${outputDate.getTime()}-${metadata.commissionCode ?? ""}-${settledPayout?.key ?? note ?? ""}-${globalItemSequence++}`,
        date: outputDate,
        amount: outputAmount,
        productKey: product ?? "unknown",
        frequency: entry.paymentFrequencyChanges?.length && commissionPeriodStart &&
          !(product === "cppPPRs" && metadata.commissionCode?.startsWith("A"))
          ? paymentFrequencyAtDate(entry, commissionPeriodStart) : entry.frequencyRaw ?? null,
        note:
          entry.source === "manager"
            ? note
              ? `Manažerská · ${note}`
              : "Manažerská"
            : note
            ? `Vlastní · ${note}`
            : "Vlastní",
        source: entry.source,
        contractNumber: entry.contractNumber ?? null,
        clientName: entry.clientName ?? null,
        ...portalLinks,
        inputAmount: Number.isFinite(Number(entry.inputAmount)) ? Number(entry.inputAmount) : null,
        currentMonthlyPremium,
        lifeStornoBaseMonthlyPremium,
        policyStartDate: start,
        contractSignedDate: toDate(entry.contractSignedDate, { calendar: now }),
        lifeRevisionBaseDate,
        contractStatus: status,
        stornoDate: stornoCutoffDate,
        ownerEmail: normalizedOwnerEmail,
        entryId: baseEntryId ?? null,
        entryType: entry.entryType ?? null,
        rootContractEntryId: entry.rootContractEntryId ?? null,
        parentContractEntryId: entry.parentContractEntryId ?? null,
        isManagerOverride: entry.source === "manager",
        predictionPosition: entry.predictionPosition ?? null,
        predictionBaselinePosition: entry.predictionBaselinePosition ?? null,
        predictionCommissionMode: entry.predictionCommissionMode ?? null,
        durationYears: entry.durationYears ?? null,
        payoutStatus: settledPayout ? "paid" : pendingFlexiSchedule ? "predicted" : undefined,
        predictedAmount: settledPayout && !pendingFlexiSchedule
          ? !neonAdjustment && entry.neonCorrection
            ? neonCorrectionPayoutAmount(entry, amount, settledPayout.payout.statementPeriod ?? neonExpectedStatementMonth(outputDate))
            : plannedAmount
          : null,
        ...(pendingFlexiSchedule && (settledPayout ? { isStatementOnly: true } : { amountUnknown: true })),
        ...(!settledPayout && premiumChange ? {
          premiumChangeOriginalAmount: premiumChange.originalAmount,
          premiumChangeEffectiveDate: premiumChange.effectiveDate,
          premiumChangeEntryId: premiumChange.endorsementEntryId,
        } : {}),
        originalDate:
          settledPayout && monthSerial(outputDate) !== monthSerial(date)
            ? date
            : null,
        commissionCodeCorrectionNote: settledPayout?.payout.commissionCodeCorrectionNote,
        commissionPayoutKey: settledPayout?.key ?? null,
        commissionPeriodStart,
        commissionStatementNumber: settledPayout?.payout.statementNumber ?? null,
        commissionStatementPeriod: settledPayout?.payout.statementPeriod ?? null,
        ...metadata,
        ...(pendingFlexiSchedule && settledPayout?.payout.code ? {
          commissionCode: settledPayout.payout.code,
          commissionCodeAliases: uniqueCommissionCodes([settledPayout.payout.code, metadata.commissionCode], product),
        } : {}),
        ...(lifeEndorsement && settledPayout && lifeIncreaseItemCode(settledPayout.payout.code) ? {
          commissionCode: settledPayout.payout.code,
          commissionLabel: lifeIncreaseCommissionLabel(settledPayout.payout.code) ?? "Provize za navýšení smlouvy",
          commissionCodeAliases: [settledPayout.payout.code!, metadata.commissionCode!].filter(Boolean),
        } : {}),
        ...(settledPayout && isKooperativaCPayout(product, settledPayout.payout.code) ? {
          // A C payout settles the B installment with the same suffix. Keep the
          // original statement code and receipt; old manual links are irrelevant.
          commissionCode: normalizeCommissionCode(settledPayout.payout.code),
          commissionCodeAliases: uniqueCommissionCodes([settledPayout.payout.code, metadata.commissionCode], product),
          commissionLabel: "Následná provize",
          payoutPlanStatus: "matched" as const,
          matchedPlannedCode: metadata.commissionCode,
          isStatementOnly: false,
        } : {}),
      };
      out.push(projectedItem);
    };

    const pushUnmatchedStatementPayouts = () => {
      for (const indexedPayout of statementOnlyPayouts) {
        if (consumedPayoutKeys.has(indexedPayout.key)) continue;
        if (indexedPayout.date > horizonEnd) continue;

        const amount = Number(indexedPayout.payout.amount);
        if (!Number.isFinite(amount) || amount === 0) continue;

        consumedPayoutKeys.add(indexedPayout.key);
        const code = normalizeCommissionCode(indexedPayout.payout.code);
        const meaning = describeKooperativaCPayout({ product, policyStartDate: entry.policyStartDate, payout: indexedPayout.payout, payouts: scopedPayouts ?? [], calendar: now });
        const commissionLabel = meaning?.label ?? commissionLabelFromCode(code);
        const aliases = uniqueCommissionCodes([code], product);
        const payoutStatus = String(indexedPayout.payout.status ?? "").trim().toLowerCase();
        const isStatementStorno = payoutStatus === "storno" || amount < 0;

        out.push({
          id: `${entry.id}-${indexedPayout.date.getTime()}-${code || "statement"}-${indexedPayout.key}-${globalItemSequence++}`,
          date: indexedPayout.date,
          amount,
          productKey: product ?? "unknown",
          frequency: entry.frequencyRaw ?? null,
          note:
            entry.source === "manager"
              ? isStatementStorno
                ? "Manažerská · storno z výpisu"
                : "Manažerská · vyplaceno z výpisu"
              : isStatementStorno
                ? "Vlastní · storno z výpisu"
                : "Vlastní · vyplaceno z výpisu",
          source: entry.source,
          contractNumber: entry.contractNumber ?? null,
          clientName: entry.clientName ?? null,
          ...portalLinks,
          inputAmount: Number.isFinite(Number(entry.inputAmount)) ? Number(entry.inputAmount) : null,
          currentMonthlyPremium,
          lifeStornoBaseMonthlyPremium,
          policyStartDate: start,
          contractSignedDate: toDate(entry.contractSignedDate, { calendar: now }),
          lifeRevisionBaseDate,
          contractStatus: status,
          stornoDate: stornoCutoffDate,
          ownerEmail: normalizedOwnerEmail,
          entryId: baseEntryId ?? null,
          entryType: entry.entryType ?? null,
          rootContractEntryId: entry.rootContractEntryId ?? null,
          parentContractEntryId: entry.parentContractEntryId ?? null,
          isManagerOverride: entry.source === "manager",
          predictionPosition: entry.predictionPosition ?? null,
          predictionBaselinePosition: entry.predictionBaselinePosition ?? null,
          predictionCommissionMode: entry.predictionCommissionMode ?? null,
          durationYears: entry.durationYears ?? null,
          commissionCode: code || null,
          commissionCodeAliases: aliases,
          commissionLabel,
          payoutStatus: "paid",
          predictedAmount: flexiWithoutBase ? null : 0,
          isStatementOnly: true,
          ...(meaning?.kind === "correction" ? { payoutPlanStatus: "correction" as const } : {}),
          commissionPeriodStart: payoutPeriods.get(indexedPayout.key) ?? null,
          originalDate: null,
          commissionCodeCorrectionNote: indexedPayout.payout.commissionCodeCorrectionNote,
          commissionPayoutKey: indexedPayout.key,
          commissionStatementNumber: indexedPayout.payout.statementNumber ?? null,
          commissionStatementPeriod: indexedPayout.payout.statementPeriod ?? null,
        });
      }
    };

    if (flexiWithoutBase && !pendingFlexiSchedule) {
      pushUnmatchedStatementPayouts();
      continue;
    }

    // Bez známého data sjednání zachováme dosavadní konzervativní odhad.
    const lifeFirstPayoutDate = toDate(entry.contractSignedDate, { calendar: now })
      ? estimateLifeFirstPayoutDate(start, agreement, product)
      : estimatePayoutDate(start, agreement);

    const pushImmediateCashflowItems = (
      horizonLimit: Date = entryHorizonEnd
    ) => {
      const payoutDate = lifeFirstPayoutDate;
      if (splitImmediateParts.length > 0) {
        for (const part of splitImmediateParts) {
          pushItem(part.amount, payoutDate, part.commissionLabel, horizonLimit, {
            commissionCode: part.commissionCode,
            commissionCodeAliases: part.commissionCodeAliases,
            commissionLabel: part.commissionLabel,
          });
        }
        return;
      }

      if (immediate) {
        pushItem(immediate.amount, payoutDate, undefined, horizonLimit, immediateMetadata);
      }
    };

    const annPlusYears = (years: number, entitlementStartYear = years) => {
      const period = periodAfterMonths(entitlementStartYear * 12);
      const payoutPeriod = inherited ? periodAfterMonths(years * 12)
        : calendarDate(start, start.getFullYear() + years, start.getMonth(), start.getDate());
      const payout = estimatePayoutDate(payoutPeriod);
      commissionPeriods.set(payout.getTime(), period);
      return payout;
    };

    switch (product) {
      case "neon":
      {
        pushImmediateCashflowItems();
        if (po3) {
          pushItem(
            po3.amount,
            annPlusYears(3),
            "Provize po 3 letech",
            entryHorizonEnd,
            commissionMetadataFromCode(po3.code ?? "B3601", "Provize po 3 letech")
          );
        }
        if (po4) {
          pushItem(
            po4.amount,
            annPlusYears(4),
            "Provize po 4 letech",
            entryHorizonEnd,
            commissionMetadataFromCode(po4.code ?? "B4801", "Provize po 4 letech")
          );
        }

        const maxYears = Math.max(1, entry.durationYears ?? 10);
        const recurringRootId = endorsementPlan.neonRecurringRootId(entry);
        const rootItems = recurringRootId ? neonSchedules.get(scheduleKey(entry, recurringRootId)) : null;
        if (nasl25 && !rootItems?.some(item => item.amount > 0 && item.title.toLowerCase().includes("následná provize (2.–5. rok)"))) {
          // ČPP Životní pojištění NEON: položka "2.–5. rok" se v praxi vyplácí už od 1. výročí.
          for (let year = 1; year <= 4 && year <= maxYears; year++) {
            pushItem(
              nasl25.amount,
              annPlusYears(year),
              "ročně",
              entryHorizonEnd,
              Object.keys(nasl25Metadata).length > 0
                ? nasl25Metadata
                : commissionMetadataFromCode("B101-B104", "Následná provize"),
              `B${100 + year}`
            );
          }
        }
        if (nasl510 && !rootItems?.some(item => item.amount > 0 && item.title.toLowerCase().includes("5.–10."))) {
          // Care commission accrues in policy years 5–10 and is paid after
          // each of those years ends. Keep the insured period for repricing.
          for (let year = 5; year <= 10 && year - 1 <= maxYears; year++) {
            const code = `B${196 + year}`;
            pushItem(
              nasl510.amount,
              annPlusYears(year, year - 1),
              "ročně",
              entryHorizonEnd,
              Object.keys(nasl510Metadata).length > 0
                ? nasl510Metadata
                : commissionMetadataFromCode("B201-B206", "Pečovatelská provize"),
              code
            );
          }
        }
        break;
      }

      case "maximaMaxEfekt": {
        if (immediate) {
          pushItem(
            immediate.amount,
            lifeFirstPayoutDate,
            undefined,
            entryHorizonEnd,
            immediateCodes.length > 0
              ? immediateMetadata
              : commissionMetadataFromCode("A101", "Okamžitá provize")
          );
        }
        if (po3) {
          pushItem(
            po3.amount,
            annPlusYears(3),
            "Provize po 3 letech",
            entryHorizonEnd,
            commissionMetadataFromCode(po3.code ?? "B3601", "Provize po 3 letech")
          );
        }
        if (po4) {
          pushItem(
            po4.amount,
            annPlusYears(4),
            "Provize po 4 letech",
            entryHorizonEnd,
            commissionMetadataFromCode(po4.code ?? "B4801", "Provize po 4 letech")
          );
        }

        const maxYears = Math.max(1, entry.durationYears ?? 30);
        if (naslOd5) {
          for (let year = 5; year <= maxYears; year++) {
            const date = annPlusYears(year);
            if (date > entryHorizonEnd) break;
            const code = firstYearInstallmentCommissionCode("B", year - 4);
            pushItem(
              naslOd5.amount,
              date,
              "ročně",
              entryHorizonEnd,
              code
                ? commissionMetadataFromCode(code, "Následná provize")
                : Object.keys(naslOd5Metadata).length > 0
                  ? naslOd5Metadata
                  : commissionMetadataFromCode("B101-B104", "Následná provize")
            );
          }
        }
        break;
      }

      case "flexi": {
        const hasDuration =
          typeof entry.durationYears === "number" &&
          Number.isFinite(entry.durationYears);
        const maxYears = hasDuration
          ? Math.max(1, Math.floor(entry.durationYears as number))
          : null;
        const flexiContractEnd =
          maxYears != null ? annPlusYears(maxYears) : entryHorizonEnd;
        const flexiHorizonEnd = earlierDate(flexiContractEnd, entryHorizonEnd);

        pushImmediateCashflowItems(flexiHorizonEnd);
        if (po3 || pendingFlexiSchedule) {
          pushItem(
            po3?.amount ?? 0,
            annPlusYears(3),
            "Provize po 3 letech",
            flexiHorizonEnd,
            commissionMetadataFromCode(po3 ? po3.code : "B36", "Provize po 3 letech")
          );
        }
        if (po4 || pendingFlexiSchedule) {
          pushItem(
            po4?.amount ?? 0,
            annPlusYears(4),
            "Provize po 4 letech",
            flexiHorizonEnd,
            commissionMetadataFromCode(po4 ? po4.code : "B48", "Provize po 4 letech")
          );
        }

        if (naslOd6 || pendingFlexiSchedule) {
          let year = 6;
          while (true) {
            const date = annPlusYears(year);
            if (date > flexiHorizonEnd) break;
            const code = firstYearInstallmentCommissionCode("B", year - 5);
            pushItem(
              naslOd6?.amount ?? 0,
              date,
              "ročně",
              flexiHorizonEnd,
              code
                ? commissionMetadataFromCode(code, "Následná provize")
                : Object.keys(naslOd6Metadata).length > 0
                  ? naslOd6Metadata
                  : commissionMetadataFromCode("B201-B206", "Následná provize")
            );
            year += 1;
          }
        }
        break;
      }

      case "domex":
      case "domexneuron":
      case "cppbytex":
      case "cpphafan":
      case "koopmajetekobcan":
      case "koopfit":
      case "koopodzam":
      case "kooppmop":
      case "cppPPRbez":
      case "cppsimplex":
      case "cppPPRs":
      case "zamex": {
        const immediateDomexItem = items.find((item) =>
          item.title.includes("okamžitá") && item.title.includes("(z platby)")
        );
        const immediateDomexAmount = immediateDomexItem?.amount ?? immediate?.amount;
        const subsequentDomex = items.find((item) =>
          item.title.includes("následná provize (z platby)")
        );
        const immediateDomexMetadata =
          normalizeCommissionCode(immediateDomexItem?.code)
            ? commissionMetadataFromCode(immediateDomexItem?.code, "Okamžitá provize")
            : immediateMetadata;
        const subsequentDomexMetadata =
          normalizeCommissionCode(subsequentDomex?.code)
            ? commissionMetadataFromCode(subsequentDomex?.code, "Následná provize")
            : {};

        const stepMonths = monthsBetweenPayments(entry.frequencyRaw);
        const firstPayout = estimatePayoutDate(start, agreement);
        if (product === "cppPPRs" && entry.paymentFrequencyChanges?.length) {
          const payoutOffset = monthSerial(firstPayout) - monthSerial(start);
          for (const scheduled of autoFrequencyCommissionPeriods(entry, dateToIsoDay(entryHorizonEnd)!)) {
            const [year, month, day] = scheduled.period.split("-").map(Number);
            const payoutDate = calendarDate(now, year, month - 1 + payoutOffset, firstPayout.getDate());
            commissionPeriods.set(payoutDate.getTime(), calendarDate(now, year, month - 1, day));
            const subsequent = scheduled.code.startsWith("B");
            const amount = subsequent
              ? Math.round((subsequentDomex?.amount ?? 0) * cppKomplexRenewalCommissionMultiplier(entry, scheduled.period) * 100) / 100
              : immediateDomexAmount ?? 0;
            pushItem(amount, payoutDate, "ČPP KOMPLEX – ÚPIS", entryHorizonEnd,
              commissionMetadataFromCode(scheduled.code, subsequent ? "Následná provize" : `Provize ${scheduled.code}`));
          }
          break;
        }
        // Kódy A/B se řídí pojistným obdobím, ne měsícem výplaty.
        // Cutoff první výplaty se může lišit od termínu výplaty k výročí.
        const subsequentStartPeriod = periodAfterMonths(12);
        const domexHistoricalSubsequentYears =
          product === "domex" ? domexSubsequentPayoutYears(contractSignedDateIso) : null;
        const cppBytexSubsequentYears =
          product === "cppbytex" ? cppBytexSubsequentPayoutYears() : null;
        const limitedSubsequentYears =
          domexHistoricalSubsequentYears ?? cppBytexSubsequentYears;
        const subsequentEndPeriod =
          limitedSubsequentYears != null
            ? periodAfterMonths((1 + limitedSubsequentYears) * 12)
            : null;

        let payout = firstPayout;
        let immediateDomexInstallmentIndex = 0;
        let subsequentDomexInstallmentIndex = 0;
        while (payout <= entryHorizonEnd) {
          const commissionPeriod = rememberRecurringPeriod(payout, firstPayout);
          const isImmediatePayout = commissionPeriod < subsequentStartPeriod;
          const isWithinSubsequentWindow =
            subsequentEndPeriod == null || commissionPeriod < subsequentEndPeriod;
          if (isImmediatePayout) {
            immediateDomexInstallmentIndex += 1;
          } else if (isWithinSubsequentWindow) {
            subsequentDomexInstallmentIndex += 1;
          }
          const baseAmount =
            isImmediatePayout
              ? immediateDomexAmount
              : isWithinSubsequentWindow
              ? subsequentDomex?.amount ?? (product === "zamex" ? immediateDomexAmount : undefined)
              : undefined;
          const indexationRatio = !isImmediatePayout && neuronPremiumTimeline
            ? neuronPremiumTimeline.ratioAtDate(dateToIsoDay(commissionPeriod)) : 1;
          const amount = baseAmount != null && indexationRatio !== 1
            ? Math.round(baseAmount * indexationRatio * 100) / 100 : baseAmount;
          if (amount && Number.isFinite(amount) && amount !== 0) {
            pushItem(
              amount,
              payout,
              `${
                product === "domexneuron"
                  ? "DOMEX NEURON"
                  : product === "domex"
                  ? "DOMEX"
                  : product === "cppbytex"
                  ? "BYTEX PLUS"
                  : product === "cpphafan"
                  ? "HAFAN"
                  : product === "koopmajetekobcan"
                  ? "Kooperativa majetek/odpovědnost"
                  : product === "koopfit"
                  ? "Kooperativa Sportovní výbava FIT"
                  : product === "koopodzam"
                  ? "Kooperativa odpovědnost zaměstnance"
                  : product === "kooppmop"
                  ? "Kooperativa PMOP"
                  : product === "zamex"
                  ? "ZAMEX"
                  : product === "cppsimplex"
                  ? "ČPP Simplex"
                  : product === "cppPPRs"
                  ? "ČPP KOMPLEX – ÚPIS"
                  : "ČPP KOMPLEX"
              }, ${
                stepMonths === 1 ? "měsíčně" : `každých ${stepMonths} měsíců`
              }`,
              entryHorizonEnd,
              isImmediatePayout
                ? firstYearInstallmentCommissionCode("A", immediateDomexInstallmentIndex)
                  ? commissionMetadataFromCode(
                      firstYearInstallmentCommissionCode(
                        "A",
                        immediateDomexInstallmentIndex
                      ),
                      `Provize ${firstYearInstallmentCommissionCode(
                        "A",
                        immediateDomexInstallmentIndex
                      )}`
                    )
                  : immediateDomexMetadata
                : firstYearInstallmentCommissionCode("B", subsequentDomexInstallmentIndex)
                  ? commissionMetadataFromCode(
                      firstYearInstallmentCommissionCode(
                        "B",
                        subsequentDomexInstallmentIndex
                      ),
                      "Následná provize"
                    )
                  : subsequentDomexMetadata
            );
          }
          payout = calendarDate(payout,
            payout.getFullYear(),
            payout.getMonth() + stepMonths,
            payout.getDate()
          );
        }
        break;
      }

      case "pillowInjury": {
        pushImmediateCashflowItems();
        if (po3) {
          pushItem(
            po3.amount,
            annPlusYears(3),
            "Provize po 3 letech",
            entryHorizonEnd,
            commissionMetadataFromCode(po3.code ?? "B36", "Provize po 3 letech")
          );
        }
        if (po4) {
          pushItem(
            po4.amount,
            annPlusYears(4),
            "Provize po 4 letech",
            entryHorizonEnd,
            commissionMetadataFromCode(po4.code ?? "B48", "Provize po 4 letech")
          );
        }
        break;
      }

      case "maxdomov": {
        if (!immediate && !naslMaxdomov) break;

        const perPaymentImmediate = immediate?.amount ?? 0;
        const perPaymentSub = naslMaxdomov?.amount;
        const subsequentMaxdomovMetadata = naslMaxdomov
          ? commissionMetadataFromCode(naslMaxdomov.code, "Následná provize")
          : {};
        const stepMonths = monthsBetweenPayments(entry.frequencyRaw);
        const firstSubsequentPeriod = periodAfterMonths(12);

        const firstPayout = estimatePayoutDate(start, agreement);
        let payout = firstPayout;
        let renewal = 0;
        while (payout <= entryHorizonEnd) {
          const commissionPeriod = rememberRecurringPeriod(payout, firstPayout);
          if (commissionPeriod < firstSubsequentPeriod) {
            pushItem(
              perPaymentImmediate,
              payout,
              "získatelská z platby",
              entryHorizonEnd,
              immediateMetadata
            );
          } else if (perPaymentSub != null) {
            const code = entry.frequencyRaw === "annual" ? firstYearInstallmentCommissionCode("B", ++renewal) : null;
            pushItem(
              perPaymentSub,
              payout,
              "následná z platby",
              entryHorizonEnd,
              code ? commissionMetadataFromCode(code, "Následná provize") : subsequentMaxdomovMetadata
            );
          } else {
            pushItem(perPaymentImmediate, payout, undefined, entryHorizonEnd, immediateMetadata);
          }

          payout = calendarDate(payout,
            payout.getFullYear(),
            payout.getMonth() + stepMonths,
            payout.getDate()
          );
        }
        break;
      }

      case "pillowmajetek":
      case "allianzmujdomov": {
        if (immediate) {
          pushItem(
            immediate.amount,
            estimatePayoutDate(start, agreement),
            "roční provize",
            entryHorizonEnd,
            immediateMetadata
          );
        }

        if (naslGeneric) {
          let year = 1;
          while (true) {
            const date = annPlusYears(year);
            if (date > entryHorizonEnd) break;
            const code = firstYearInstallmentCommissionCode("B", year);
            pushItem(
              naslGeneric.amount,
              date,
              "roční následná provize",
              entryHorizonEnd,
              code
                ? commissionMetadataFromCode(code, "Následná provize")
                : commissionMetadataFromCode(naslGeneric.code, "Následná provize")
            );
            year += 1;
          }
        }
        break;
      }

      case "allianzAuto":
      case "pillowAuto":
      case "uniqaAuto":
      case "uniqaflotila": {
        if (!immediate && !naslGeneric) break;
        const anniversaryAmount = naslGeneric?.amount ?? immediate?.amount ?? 0;
        const anniversaryNote = naslGeneric
          ? "roční následná provize"
          : "ročně k výročí";
        const anniversaryMetadata = naslGeneric
          ? commissionMetadataFromCode(naslGeneric.code, "Následná provize")
          : {};

        const first = isAutoCashflowProduct(product)
          ? estimateAutoFirstPayoutDate(start, agreement)
          : estimatePayoutDate(start, agreement);
        if (immediate && first <= entryHorizonEnd) {
          pushItem(
            immediate.amount,
            first,
            "okamžitá provize",
            entryHorizonEnd,
            immediateMetadata
          );
        }

        let year = 1;
        while (true) {
          const date = annPlusYears(year);
          if (date > entryHorizonEnd) break;
          const subsequentCode = firstYearInstallmentCommissionCode("B", year);
          pushItem(
            anniversaryAmount,
            date,
            anniversaryNote,
            entryHorizonEnd,
            naslGeneric && subsequentCode
              ? commissionMetadataFromCode(subsequentCode, "Následná provize")
              : anniversaryMetadata
          );
          year += 1;
        }
        break;
      }

      case "cppAuto":
      case "slaviaauto":
      case "slaviaflotila":
      case "csobAuto":
      case "kooperativaAuto":
      case "koopflotila": {
        if (!immediate && !naslGeneric) break;

        if (entry.paymentFrequencyChanges?.length) {
          const first = estimateAutoFirstPayoutDate(start, agreement);
          const payoutOffset = monthSerial(first) - monthSerial(start);
          const endDay = dateToIsoDay(entryHorizonEnd)!;
          for (const scheduled of autoFrequencyCommissionPeriods(entry, endDay)) {
            const [year, month, day] = scheduled.period.split("-").map(Number);
            const period = calendarDate(now, year, month - 1, day);
            const payout = calendarDate(now, year, month - 1 + payoutOffset, first.getDate());
            commissionPeriods.set(payout.getTime(), period);
            const subsequent = scheduled.code.startsWith("B");
            const originalAmount = subsequent ? naslGeneric?.amount ?? immediate?.amount ?? 0 : immediate?.amount ?? 0;
            const amount = originalAmount * autoFrequencyCommissionMultiplier(entry, scheduled.period);
            pushItem(amount, payout, subsequent ? "následná provize" : "okamžitá provize", entryHorizonEnd,
              commissionMetadataFromCode(scheduled.code, `Provize ${scheduled.code}`));
          }
          break;
        }

        const subsequentMetadata = naslGeneric
          ? commissionMetadataFromCode(naslGeneric.code, "Následná provize")
          : {};
        const firstSubsequentPeriod = periodAfterMonths(12);
        const stepMonths = monthsBetweenPayments(entry.frequencyRaw);
        const firstPayout = isAutoCashflowProduct(product)
          ? estimateAutoFirstPayoutDate(start, agreement)
          : estimatePayoutDate(start, agreement);
        let payout = firstPayout;
        let firstYearInstallmentIndex = 0;
        let subsequentInstallmentIndex = 0;

        while (payout <= entryHorizonEnd) {
          const period = rememberRecurringPeriod(payout, firstPayout);
          const isSubsequent = period >= firstSubsequentPeriod;
          if (isSubsequent) {
            subsequentInstallmentIndex += 1;
          } else {
            firstYearInstallmentIndex += 1;
          }
          const amount = isSubsequent ? naslGeneric?.amount ?? immediate?.amount ?? 0 : immediate?.amount ?? 0;
          const immediateInstallmentCode = isSubsequent
            ? null
            : firstYearInstallmentCommissionCode("A", firstYearInstallmentIndex);
          const subsequentInstallmentCode = isSubsequent
            ? firstYearInstallmentCommissionCode("B", subsequentInstallmentIndex)
            : null;
          pushItem(
            amount,
            payout,
            isSubsequent ? "následná provize" : "okamžitá provize",
            entryHorizonEnd,
            isSubsequent
              ? subsequentInstallmentCode
                ? commissionMetadataFromCode(
                    subsequentInstallmentCode,
                    `Provize ${subsequentInstallmentCode}`
                  )
                : subsequentMetadata
              : immediateInstallmentCode
                ? commissionMetadataFromCode(
                    immediateInstallmentCode,
                    `Provize ${immediateInstallmentCode}`
                  )
                : immediateMetadata
          );
          payout = calendarDate(payout,
            payout.getFullYear(),
            payout.getMonth() + stepMonths,
            payout.getDate()
          );
        }
        break;
      }

      default: {
        if (immediate) {
          pushItem(
            immediate.amount,
            estimatePayoutDate(start, agreement),
            undefined,
            entryHorizonEnd,
            product === "maxcizinkomplex" && immediateCodes.length === 0
              ? commissionMetadataFromCode(MAX_CIZIN_KOMPLEX_IMMEDIATE_CODE, "Okamžitá provize")
              : immediateMetadata
          );
        }
        break;
      }
    }

    pushUnmatchedStatementPayouts();
    const entryOutput = out.slice(entryOutputStart);
    const covered = coverAcquisitionCashflowInstallments(entryOutput, { ...entry, commissionPayouts: scopedPayouts });
    if (covered !== entryOutput) out.splice(entryOutputStart, out.length - entryOutputStart, ...covered);
  }

  const consolidated = absorbedNeonComponents.size === 0 ? out : out.flatMap(item => {
    const absorbed = item.entryType === "endorsement" && absorbedNeonComponents.get(
      scheduleIdentity(item.ownerEmail, item.source, item.entryId));
    if (!absorbed) return [item];
    const component = normalizeLifeCommissionItemCode(lifeIncreaseItemCode(item.commissionCode) ?? item.commissionCode);
    if (!absorbed.has(component)) return [item];
    return item.payoutStatus === "paid" ? [{ ...item, predictedAmount: 0, isStatementOnly: true }] : [];
  });
  return consolidated.sort((a, b) => a.date.getTime() - b.date.getTime());
}
