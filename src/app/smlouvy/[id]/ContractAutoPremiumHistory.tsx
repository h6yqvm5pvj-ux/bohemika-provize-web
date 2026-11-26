import { hasAnnualCommissionCodeSchedule } from "@/app/lib/commissionPayoutCodeAdjustment";
import { premiumCodeProjectionFromReceipts } from "@/app/lib/commissionPremiumCodeAdjustment";
import type { ContractCommissionPayout } from "./contractDetailTypes";
import { useId, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Car,
  FileText,
  Loader2,
  Minus,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { type PaymentFrequency, type Product } from "../../types/domain";
import {
  formatMoney,
  isAnnualAutoPayoutProduct,
  isAutoProduct,
  paymentsPerYear,
  toDate,
} from "./contractDetailHelpers";
import { anniversaryNumberFromInstallmentCommissionCode, installmentCommissionScheduleFromCode } from "@/app/lib/productFormulas/autoCommission";
import {
  type ContractAutoPremiumStatementHistoryEntry,
  type ContractAutoPremiumStatementRow,
  type ContractCommissionStatementSummary,
  type ContractDoc,
} from "./contractDetailTypes";
import { ContractSectionToggle } from "./ContractSectionToggle";
import { PremiumHistorySourceDialog } from "./PremiumHistorySourceDialog";
import styles from "./autoPremiumHistory.module.css";
import { resolveAutoPremiumBasis, premiumBaseSourceKey, previousConfirmedAutoAnnualPremium, type PremiumBaseResolution } from "@/app/lib/autoPremiumBasis";
import { isKooperativaAutoRenewalPayout } from "@/app/lib/kooperativaCPayoutMeaning";
import { PremiumBaseReview, type PremiumBaseReviewItem, type ResolvePremiumBase } from "./PremiumBaseReview";
import type { DomexNeuronPremiumHistoryChange } from "@/app/lib/domexNeuronPremiumHistory";

type ContractAutoPremiumHistoryProps = {
  commissionPayouts?: ContractCommissionPayout[];
  premiumIndexationEnabled?: boolean | null;
  premiumIndexationHistory?: readonly DomexNeuronPremiumHistoryChange[] | null;
  viewerEmail?: string;
  baseResolutions?: PremiumBaseResolution[] | null;
  onResolveBase?: ResolvePremiumBase;
  onOpenStatement?: (id: string) => void;
  product: Product | undefined;
  contractNumber?: string | null;
  policyStartDate?: ContractDoc["policyStartDate"];
  signedAnnualPremium?: number | null;
  signedAnnualPremiumOverride?: number | null;
  statementInitialAnnualPremium?: number | null;
  preferStatementInitialPremium?: boolean;
  systemAnnualPremium: number;
  paymentFrequency?: PaymentFrequency | null;
  contractPaymentFrequency?: PaymentFrequency | null;
  statements: ContractCommissionStatementSummary[];
  storedHistory?: ContractAutoPremiumStatementHistoryEntry[] | null;
  loading?: boolean;
  error?: string | null;
};

type PremiumChangeStatus = "initial" | "increased" | "decreased" | "same" | "detected";

type PremiumHistoryRow = {
  commissionCodeCorrectionNote?: string;
  changeReason?: "indexation";
  premiumDerivedFromCommission?: boolean;
  key: string;
  premiumKind: ContractAutoPremiumStatementHistoryEntry["premiumKind"];
  statementId: string | null;
  rowId: string | null;
  anniversaryNumber: number;
  anniversaryDate: Date;
  policyStartDate: Date;
  policyStartSource: "statement" | "system";
  statementPeriod: string | null;
  statementDate: string | null;
  statementNumber: string | null;
  productCode: string;
  productKey: Product | null;
  previousPremium: number | null;
  basePremium: number;
  difference: number | null;
  previousAnnualPremium: number | null;
  newAnnualPremium: number | null;
  differenceAnnual: number | null;
  basePremiumPeriod: "annual" | "payment" | null;
  status: PremiumChangeStatus;
  commissionCodes: string[];
  source: ContractAutoPremiumStatementRow["source"];
};

const ANNUAL_PREMIUM_TOLERANCE = 12;

const normalizeContractNumber = (value: string | null | undefined): string =>
  String(value ?? "").replace(/\D+/g, "").trim();

const formatDate = (date: Date | null | undefined): string =>
  date ? date.toLocaleDateString("cs-CZ") : "—";

const validNumber = (value: number | null | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const moneyKey = (value: number | null | undefined): string => {
  const amount = validNumber(value);
  return amount == null ? "" : String(Math.round(amount * 100));
};

const premiumHistorySemanticKey = (row: PremiumHistoryRow): string =>
  [
    row.premiumKind ?? "",
    row.source,
    row.statementId ||
      [row.statementNumber ?? "", row.statementPeriod ?? "", row.statementDate ?? ""].join("|"),
    row.rowId ?? "",
    row.anniversaryNumber,
    row.anniversaryDate.toISOString().slice(0, 10),
    row.productCode,
    row.commissionCodes.join("+"),
    moneyKey(row.previousAnnualPremium ?? row.previousPremium),
    moneyKey(row.newAnnualPremium ?? row.basePremium),
    moneyKey(row.differenceAnnual ?? row.difference),
  ].join("::");

const premiumHistoryCompletenessScore = (row: PremiumHistoryRow): number => {
  let score = 0;
  if (row.changeReason) score += 1;
  if (row.basePremiumPeriod) score += 20;
  if (row.previousAnnualPremium != null) score += 10;
  if (row.newAnnualPremium != null) score += 10;
  if (row.differenceAnnual != null) score += 10;
  if (row.statementNumber) score += 2;
  if (row.statementPeriod) score += 2;
  return score;
};

const dedupePremiumHistoryRows = (rows: PremiumHistoryRow[]): PremiumHistoryRow[] => {
  const bySemanticKey = new Map<string, PremiumHistoryRow>();
  const order: string[] = [];

  for (const row of rows) {
    const semanticKey = premiumHistorySemanticKey(row) || row.key;
    const existing = bySemanticKey.get(semanticKey);
    if (!existing) {
      bySemanticKey.set(semanticKey, row);
      order.push(semanticKey);
      continue;
    }
    if (premiumHistoryCompletenessScore(row) > premiumHistoryCompletenessScore(existing)) {
      bySemanticKey.set(semanticKey, row);
    }
  }

  return order
    .map((key) => bySemanticKey.get(key))
    .filter((row): row is PremiumHistoryRow => Boolean(row));
};

const signedMoneyLabel = (value: number | null | undefined): string =>
  value == null
    ? "—"
    : `${value >= 0 ? "+" : "-"}${formatMoney(Math.abs(value))}`;

const signedAnnualMoneyLabel = (value: number | null | undefined): string =>
  value == null ? "—" : `${signedMoneyLabel(value)} ročně`;

const annualPremiumLabel = (value: number | null | undefined): string =>
  value == null || !Number.isFinite(value) || value <= 0
    ? "—"
    : `${formatMoney(value)} ročně`;

const paymentFrequencyLabel = (frequency: PaymentFrequency | null | undefined): string => {
  switch (frequency) {
    case "monthly": return "měsíční platba";
    case "quarterly": return "čtvrtletní platba";
    case "semiannual": return "pololetní platba";
    case "annual": return "roční platba";
    default: return "";
  }
};

const paymentPremiumLabel = (
  annualPremium: number | null | undefined,
  frequency: PaymentFrequency | null | undefined
): string | null => {
  if (annualPremium == null || !Number.isFinite(annualPremium) || !frequency) return null;
  const paymentPremium = Math.round((annualPremium / paymentsPerYear(frequency)) * 100) / 100;
  return `${formatMoney(paymentPremium)} / ${paymentFrequencyLabel(frequency)}`;
};

const signedPaymentDifferenceLabel = (
  annualDifference: number | null | undefined,
  frequency: PaymentFrequency | null | undefined
): string | null => {
  if (annualDifference == null || !Number.isFinite(annualDifference) || !frequency) return null;
  const paymentDifference = Math.round((annualDifference / paymentsPerYear(frequency)) * 100) / 100;
  return `${signedMoneyLabel(paymentDifference)} / ${paymentFrequencyLabel(frequency)}`;
};

const positivePremiumOrNull = (value: number | null | undefined): number | null => {
  const amount = validNumber(value);
  return amount != null && amount > 0 ? amount : null;
};

const annualPremiumFromStoredHistoryEntry = (
  entry: ContractAutoPremiumStatementHistoryEntry,
  paymentFrequency: PaymentFrequency | null | undefined,
  product: Product | null | undefined
): number | null => {
  const annualPremium = positivePremiumOrNull(entry.newAnnualPremium);
  const premium = positivePremiumOrNull(entry.newPremium);
  const paymentCount = paymentsPerYear(paymentFrequency);
  const statementBaseIsPayment =
    isAutoProduct(product) && !isAnnualAutoPayoutProduct(product);

  if (annualPremium != null) {
    const isLegacyPaymentValueStoredAsAnnual =
      entry.basePremiumPeriod == null &&
      statementBaseIsPayment &&
      paymentCount > 1 &&
      premium != null &&
      Math.abs(annualPremium - premium) <= ANNUAL_PREMIUM_TOLERANCE;
    return isLegacyPaymentValueStoredAsAnnual
      ? Math.round(annualPremium * paymentCount * 100) / 100
      : annualPremium;
  }

  if (premium == null) return null;
  return entry.basePremiumPeriod === "payment" ||
    (entry.basePremiumPeriod == null && statementBaseIsPayment)
    ? Math.round(premium * paymentCount * 100) / 100
    : premium;
};

const previousAnnualPremiumFromStoredHistoryEntry = (
  entry: ContractAutoPremiumStatementHistoryEntry,
  paymentFrequency: PaymentFrequency | null | undefined,
  product: Product | null | undefined
): number | null => {
  const annualPremium = positivePremiumOrNull(entry.previousAnnualPremium);
  const premium = positivePremiumOrNull(entry.previousPremium);
  const paymentCount = paymentsPerYear(paymentFrequency);
  const statementBaseIsPayment =
    isAutoProduct(product) && !isAnnualAutoPayoutProduct(product);

  if (annualPremium != null) {
    const nextAnnualPremium = positivePremiumOrNull(entry.newAnnualPremium);
    const annualizedPreviousPremium =
      Math.round(annualPremium * paymentCount * 100) / 100;
    const annualizedValueFitsNextPremiumBetter =
      entry.basePremiumPeriod === "payment" &&
      nextAnnualPremium != null &&
      Math.abs(nextAnnualPremium - annualizedPreviousPremium) +
        ANNUAL_PREMIUM_TOLERANCE <
        Math.abs(nextAnnualPremium - annualPremium);
    const isLegacyPaymentValueStoredAsAnnual =
      statementBaseIsPayment &&
      paymentCount > 1 &&
      premium != null &&
      Math.abs(annualPremium - premium) <= ANNUAL_PREMIUM_TOLERANCE &&
      (entry.basePremiumPeriod == null ||
        annualizedValueFitsNextPremiumBetter);
    return isLegacyPaymentValueStoredAsAnnual
      ? annualizedPreviousPremium
      : annualPremium;
  }

  if (premium == null) return null;
  return entry.basePremiumPeriod === "payment" ||
    (entry.basePremiumPeriod == null && statementBaseIsPayment)
    ? Math.round(premium * paymentCount * 100) / 100
    : premium;
};

export const initialAnnualPremiumFromStatementHistory = (
  history: ContractAutoPremiumStatementHistoryEntry[] | null | undefined,
  paymentFrequency: PaymentFrequency | null | undefined,
  product?: Product | null
): number | null => {
  const candidates = (history ?? [])
    .map((entry, index) => ({
      entry,
      index,
      annualPremium: annualPremiumFromStoredHistoryEntry(
        entry,
        paymentFrequency,
        product
      ),
      chronology:
        positivePremiumOrNull(entry.statementChronologyMs) ??
        positivePremiumOrNull(entry.writtenAtMs) ??
        Number.MAX_SAFE_INTEGER,
      capturedAt:
        positivePremiumOrNull(entry.writtenAtMs) ??
        positivePremiumOrNull(entry.statementChronologyMs) ??
        Number.MAX_SAFE_INTEGER,
    }))
    .filter(
      (candidate) =>
        candidate.entry.premiumKind === "auto_initial" &&
        candidate.entry.source !== "manager" &&
        candidate.annualPremium != null
    )
    .sort(
      (left, right) =>
        left.capturedAt - right.capturedAt ||
        left.chronology - right.chronology ||
        left.index - right.index
    );

  return candidates[0]?.annualPremium ?? null;
};

export const signedAnnualPremiumMatchesStatementChange = ({
  signedAnnualPremium,
  statementInitialAnnualPremium,
  history,
  paymentFrequency,
  product,
}: {
  signedAnnualPremium: number | null | undefined;
  statementInitialAnnualPremium?: number | null;
  history: ContractAutoPremiumStatementHistoryEntry[] | null | undefined;
  paymentFrequency: PaymentFrequency | null | undefined;
  product?: Product | null;
}): boolean => {
  const signedPremium = positivePremiumOrNull(signedAnnualPremium);
  if (signedPremium == null) return false;
  const initialPremium = positivePremiumOrNull(statementInitialAnnualPremium);
  if (
    initialPremium != null &&
    Math.abs(initialPremium - signedPremium) <= ANNUAL_PREMIUM_TOLERANCE
  ) {
    return false;
  }

  return (history ?? []).some((entry) => {
    if (entry.premiumKind !== "auto_change" || entry.source === "manager") return false;
    const changedPremium = annualPremiumFromStoredHistoryEntry(
      entry,
      paymentFrequency,
      product
    );
    return (
      changedPremium != null &&
      Math.abs(changedPremium - signedPremium) <= ANNUAL_PREMIUM_TOLERANCE
    );
  });
};

export const resolveAutoSignedAnnualPremiumValue = ({
  signedAnnualPremium,
  signedAnnualPremiumOverride,
  statementInitialAnnualPremium,
  firstKnownPreviousAnnualPremium,
  systemAnnualPremium,
  preferStatementInitialPremium,
}: {
  signedAnnualPremium?: number | null;
  signedAnnualPremiumOverride?: number | null;
  statementInitialAnnualPremium?: number | null;
  firstKnownPreviousAnnualPremium?: number | null;
  systemAnnualPremium?: number | null;
  preferStatementInitialPremium?: boolean;
}): number | null => {
  const confirmedPremium = positivePremiumOrNull(signedAnnualPremiumOverride);
  if (confirmedPremium != null) return confirmedPremium;
  const signedPremium = positivePremiumOrNull(signedAnnualPremium);
  const statementPremium = positivePremiumOrNull(statementInitialAnnualPremium);
  const previousPremium = positivePremiumOrNull(firstKnownPreviousAnnualPremium);
  const systemPremium = positivePremiumOrNull(systemAnnualPremium);

  if (preferStatementInitialPremium) {
    return statementPremium ?? signedPremium ?? previousPremium ?? systemPremium;
  }

  return signedPremium ?? statementPremium ?? previousPremium ?? systemPremium;
};

const annualPremiumFromRow = (
  row: PremiumHistoryRow,
  paymentFrequency: PaymentFrequency | null | undefined
): number | null => {
  const annualPremium = validNumber(row.newAnnualPremium);
  if (annualPremium != null) return annualPremium;
  if (row.basePremiumPeriod === "payment") {
    return Math.round(row.basePremium * paymentsPerYear(paymentFrequency) * 100) / 100;
  }
  return validNumber(row.basePremium);
};

const previousAnnualPremiumFromRow = (
  row: PremiumHistoryRow,
  paymentFrequency: PaymentFrequency | null | undefined
): number | null => {
  const annualPremium = validNumber(row.previousAnnualPremium);
  if (annualPremium != null) return annualPremium;
  const previousPremium = validNumber(row.previousPremium);
  if (previousPremium == null) return null;
  if (row.basePremiumPeriod === "payment") {
    return Math.round(previousPremium * paymentsPerYear(paymentFrequency) * 100) / 100;
  }
  return previousPremium;
};

const differenceAnnualFromRow = (
  row: PremiumHistoryRow,
  paymentFrequency: PaymentFrequency | null | undefined
): number | null => {
  const annualDifference = validNumber(row.differenceAnnual);
  if (annualDifference != null) return annualDifference;
  const difference = validNumber(row.difference);
  if (difference == null) return null;
  if (row.basePremiumPeriod === "payment") {
    return Math.round(difference * paymentsPerYear(paymentFrequency) * 100) / 100;
  }
  return difference;
};

const historyCountLabel = (count: number): string => {
  if (count === 1) return "1 záznam";
  if (count >= 2 && count <= 4) return `${count} záznamy`;
  return `${count} záznamů`;
};

const statementRowDate = (value: string | null | undefined): Date | null => {
  const match = String(value ?? "")
    .trim()
    .match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
};

export const initialAnnualPremiumFromStatementRows = ({
  contractNumber,
  product,
  frequency,
  statements,
  baseResolutions,
  viewerEmail,
  commissionPayouts = [],
}: {
  contractNumber: string;
  product: Product | undefined;
  frequency: PaymentFrequency | null;
  statements: ContractCommissionStatementSummary[];
  baseResolutions?: PremiumBaseResolution[] | null;
  viewerEmail?: string;
  commissionPayouts?: ContractCommissionPayout[];
}): number | null => {
  const normalizedContractNumber = normalizeContractNumber(contractNumber);
  if (!normalizedContractNumber || !frequency || (!isAutoProduct(product) && !hasAnnualCommissionCodeSchedule({ productKey: product, frequencyRaw: frequency }))) return null;

  const candidates = statements.flatMap(statement =>
    (statement.autoPremiumRows ?? []).flatMap(row => {
      if (normalizeContractNumber(row.contractNumber) !== normalizedContractNumber ||
        (row.productKey && row.productKey !== product) || row.source !== "own") return [];
      const projection = premiumCodeProjectionFromReceipts({ ...row, statementId: statement.id }, viewerEmail, commissionPayouts);
      const schedule = installmentCommissionScheduleFromCode(projection.resolvedCommissionCode ?? row.commissionCode, frequency);
      if (!schedule || schedule.phase !== "initial") return [];
      const source = { ...row, productKey: row.productKey ?? product, frequencyRaw: frequency,
        statementId: statement.id, statementNumber: statement.statementNumber,
        statementPeriod: statement.period, statementDate: statement.statementDate, statementOwnerEmail: viewerEmail };
      const basis = resolveAutoPremiumBasis(source, { productKey: product, frequencyRaw: frequency,
        premiumStatementBaseResolutions: baseResolutions });
      if (basis.status !== "resolved") return [];
      return [{ annualPremium: basis.annualPremium,
        chronology: statement.periodEndMs ?? statementRowDate(statement.statementDate)?.getTime() ?? Number.MAX_SAFE_INTEGER,
        paymentIndex: schedule.paymentIndex }];
    })
  );

  candidates.sort((left, right) => left.chronology - right.chronology || left.paymentIndex - right.paymentIndex);
  return candidates[0]?.annualPremium ?? null;
};

const storedHistoryDate = (value: string | null | undefined): Date | null => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  const czechDate = statementRowDate(normalized);
  if (czechDate) return czechDate;

  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
};

const addYearsClamped = (date: Date, years: number): Date | null => {
  if (!Number.isInteger(years) || years < 0) return null;
  const targetYear = date.getFullYear() + years;
  const targetMonth = date.getMonth();
  const targetDay = date.getDate();
  const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
  const result = new Date(targetYear, targetMonth, Math.min(targetDay, lastDay));
  return Number.isNaN(result.getTime()) ? null : result;
};

const scheduleFrequencyForStatementProduct = (
  product: Product | null | undefined,
  paymentFrequency: PaymentFrequency | null | undefined
): PaymentFrequency | null | undefined =>
  isAnnualAutoPayoutProduct(product) ? "annual" : paymentFrequency;

const premiumStatus = (
  basePremium: number,
  systemAnnualPremium: number
): { status: PremiumChangeStatus; difference: number | null } => {
  if (!Number.isFinite(systemAnnualPremium) || systemAnnualPremium <= 0) {
    return { status: "detected", difference: null };
  }

  const difference = Math.round((basePremium - systemAnnualPremium) * 100) / 100;
  if (Math.abs(difference) <= ANNUAL_PREMIUM_TOLERANCE) {
    return { status: "same", difference };
  }
  return {
    status: difference > 0 ? "increased" : "decreased",
    difference,
  };
};

const statusLabel = (status: PremiumChangeStatus): string => {
  switch (status) {
    case "initial":
      return "Základna při sjednání";
    case "increased":
      return "Pojistné zvýšeno";
    case "decreased":
      return "Pojistné poníženo";
    case "same":
      return "Beze změny";
    default:
      return "Pojistné z výpisu";
  }
};

const statusIcon = (status: PremiumChangeStatus) => {
  switch (status) {
    case "increased":
      return TrendingUp;
    case "decreased":
      return TrendingDown;
    case "initial":
    default:
      return Minus;
  }
};

const statementSourceLabel = (row: PremiumHistoryRow): string => {
  if (row.statementPeriod) {
    return `Provizní výpis z období ${row.statementPeriod}`;
  }
  if (row.statementNumber) {
    return `Provizní výpis ${row.statementNumber}`;
  }
  return row.status === "initial" ? "Sjednání smlouvy" : "Provizní výpis";
};

const premiumStatusFromDifference = (
  difference: number | null,
  tolerance = ANNUAL_PREMIUM_TOLERANCE
): PremiumChangeStatus => {
  if (difference == null) return "detected";
  if (Math.abs(difference) <= tolerance) return "same";
  return difference > 0 ? "increased" : "decreased";
};

export const buildPremiumHistoryRows = ({
  contractNumber,
  policyStartDate,
  product,
  paymentFrequency,
  systemAnnualPremium,
  statements,
  baseResolutions,
  combinedAnnualBaseKeys,
  viewerEmail,
  commissionPayouts = [],
}: {
  contractNumber: string;
  policyStartDate: ContractDoc["policyStartDate"];
  product: Product | undefined;
  paymentFrequency: PaymentFrequency | null | undefined;
  systemAnnualPremium: number;
  statements: ContractCommissionStatementSummary[];
  baseResolutions?: PremiumBaseResolution[] | null;
  combinedAnnualBaseKeys?: ReadonlySet<string>;
  viewerEmail?: string;
  commissionPayouts?: ContractCommissionPayout[];
}): PremiumHistoryRow[] => {
  const systemPolicyStart = toDate(policyStartDate);
  const normalizedContractNumber = normalizeContractNumber(contractNumber);
  if (!normalizedContractNumber) return [];

  const rows = new Map<string, PremiumHistoryRow>();
  const statementSources = statements.flatMap(statement =>
    (statement.autoPremiumRows ?? [])
      .filter(row => normalizeContractNumber(row.contractNumber) === normalizedContractNumber &&
        (!row.productKey || !product || row.productKey === product))
      .map(row => ({ ...row, ...premiumCodeProjectionFromReceipts({ ...row, statementId: statement.id }, viewerEmail, commissionPayouts), productKey: row.productKey ?? product, frequencyRaw: paymentFrequency,
        statementId: statement.id, statementNumber: statement.statementNumber,
        statementPeriod: statement.period, statementDate: statement.statementDate, statementOwnerEmail: viewerEmail }))
  );

  for (const statement of statements) {
    for (const row of statement.autoPremiumRows ?? []) {
      if (normalizeContractNumber(row.contractNumber) !== normalizedContractNumber) continue;

      const projection = premiumCodeProjectionFromReceipts({ ...row, statementId: statement.id }, viewerEmail, commissionPayouts);
      const statementPolicyStart = statementRowDate(row.validFrom);
      const policyStart = projection.resolvedCommissionCode
        ? systemPolicyStart ?? statementPolicyStart
        : statementPolicyStart ?? systemPolicyStart;
      if (!policyStart) continue;

      const statementProduct = row.productKey ?? product ?? null;
      const anniversaryNumber = anniversaryNumberFromInstallmentCommissionCode(
        projection.resolvedCommissionCode ?? row.commissionCode,
        scheduleFrequencyForStatementProduct(statementProduct, paymentFrequency)
      );
      if (anniversaryNumber == null) continue;

      const anniversaryDate = addYearsClamped(policyStart, anniversaryNumber);
      if (!anniversaryDate) continue;

      const source = statementSources.find(item => item.statementId === statement.id && item.rowId === row.rowId && item.commissionCode === row.commissionCode && item.source === row.source);
      if (!source) continue;
      const basisContract = { productKey: statementProduct, frequencyRaw: paymentFrequency, premiumStatementBaseResolutions: baseResolutions };
      const basis = resolveAutoPremiumBasis(source, basisContract, combinedAnnualBaseKeys?.has(premiumBaseSourceKey(source, basisContract)));
      if (basis.status !== "resolved") continue;
      const { annualPremium, period: basePremiumPeriod } = basis;
      const previousAnnualPremium = previousConfirmedAutoAnnualPremium(source, basisContract, statementSources, combinedAnnualBaseKeys);
      const { status, difference } = premiumStatus(annualPremium, previousAnnualPremium ?? (projection.resolvedCommissionCode ? Number.NaN : systemAnnualPremium));
      const key = [
        statement.id,
        anniversaryNumber,
        normalizedContractNumber,
        row.productCode,
        annualPremium,
        basePremiumPeriod ?? "unknown",
        policyStart.toISOString().slice(0, 10),
      ].join(":");
      const existing = rows.get(key);
      if (existing) {
        if (row.commissionCode && !existing.commissionCodes.includes(row.commissionCode)) {
          existing.commissionCodes.push(row.commissionCode);
        }
        continue;
      }

      rows.set(key, {
        key,
        commissionCodeCorrectionNote: projection.commissionCodeCorrectionNote,
        premiumKind: "auto_change",
        statementId: statement.id,
        rowId: row.rowId,
        anniversaryNumber,
        anniversaryDate,
        policyStartDate: policyStart,
        policyStartSource: policyStart === statementPolicyStart ? "statement" : "system",
        statementPeriod: statement.period,
        statementDate: statement.statementDate,
        statementNumber: statement.statementNumber,
        productCode: row.productCode,
        productKey: row.productKey,
        previousPremium: null,
        basePremium: annualPremium,
        difference,
        previousAnnualPremium,
        newAnnualPremium: annualPremium,
        differenceAnnual: difference,
        basePremiumPeriod,
        status,
        commissionCodes: row.commissionCode ? [row.commissionCode] : [],
        source: row.source,
      });
    }
  }

  return [...rows.values()].sort((a, b) => {
    const dateCompare = a.anniversaryDate.getTime() - b.anniversaryDate.getTime();
    if (dateCompare !== 0) return dateCompare;
    return a.basePremium - b.basePremium;
  });
};

export const buildStoredPremiumHistoryRows = (
  history: ContractAutoPremiumStatementHistoryEntry[] | null | undefined,
  paymentFrequency: PaymentFrequency | null | undefined,
  product: Product | null | undefined
): PremiumHistoryRow[] => {
  const rows = (history ?? [])
    .map((entry): PremiumHistoryRow | null => {
      const premiumKind = entry.premiumKind ?? "auto_change";
      const annualNewPremium = annualPremiumFromStoredHistoryEntry(
        entry,
        paymentFrequency,
        product
      );
      if (annualNewPremium == null) return null;
      const annualPreviousPremium = previousAnnualPremiumFromStoredHistoryEntry(
        entry,
        paymentFrequency,
        product
      );

      const anniversaryDate = storedHistoryDate(entry.anniversaryDate);
      const validFromDate = statementRowDate(entry.validFrom);
      const differenceAnnual =
        annualPreviousPremium != null
          ? Math.round((annualNewPremium - annualPreviousPremium) * 100) / 100
          : validNumber(entry.differenceAnnual) ?? validNumber(entry.difference);
      const status =
        premiumKind === "auto_initial"
          ? "initial"
          : premiumStatusFromDifference(differenceAnnual, entry.changeReason === "indexation" ? 0.01 : ANNUAL_PREMIUM_TOLERANCE);

      return {
        commissionCodeCorrectionNote: entry.commissionCodeCorrectionNote,
        changeReason: entry.changeReason === "indexation" ? "indexation" : undefined,
        premiumDerivedFromCommission: entry.premiumDerivedFromCommission,
        key:
          entry.key ??
          `${entry.statementId ?? "statement"}-${entry.rowId ?? annualNewPremium}`,
        premiumKind,
        statementId: entry.statementId ?? null,
        rowId: entry.rowId ?? null,
        anniversaryNumber:
          typeof entry.anniversaryNumber === "number" && Number.isFinite(entry.anniversaryNumber)
            ? entry.anniversaryNumber
            : 0,
        anniversaryDate: anniversaryDate ?? validFromDate ?? new Date(0),
        policyStartDate: validFromDate ?? anniversaryDate ?? new Date(0),
        policyStartSource: entry.validFrom ? "statement" : "system",
        statementPeriod: entry.statementPeriod ?? null,
        statementDate: entry.statementDate ?? null,
        statementNumber: entry.statementNumber ?? null,
        productCode: entry.productCode ?? "AUTO",
        productKey: product ?? null,
        previousPremium: annualPreviousPremium,
        basePremium: annualNewPremium,
        difference: differenceAnnual,
        previousAnnualPremium: annualPreviousPremium,
        newAnnualPremium: annualNewPremium,
        differenceAnnual,
        basePremiumPeriod: "annual",
        status,
        commissionCodes: entry.commissionCode ? [entry.commissionCode] : [],
        source: entry.source === "manager" ? "manager" : "own",
      };
    })
    .filter((row): row is PremiumHistoryRow => Boolean(row));

  return dedupePremiumHistoryRows(rows)
    .sort((a, b) => a.anniversaryDate.getTime() - b.anniversaryDate.getTime());
};

const premiumRowsMatchStoredChange = (
  storedRow: PremiumHistoryRow,
  detectedRow: PremiumHistoryRow
): boolean => {
  if (storedRow.premiumKind !== detectedRow.premiumKind) return false;
  if (storedRow.anniversaryNumber !== detectedRow.anniversaryNumber) return false;
  if (storedRow.productCode !== detectedRow.productCode) return false;
  if (Math.abs(storedRow.basePremium - detectedRow.basePremium) > ANNUAL_PREMIUM_TOLERANCE) {
    return false;
  }

  const sameStatementNumber =
    !storedRow.statementNumber ||
    !detectedRow.statementNumber ||
    storedRow.statementNumber === detectedRow.statementNumber;
  const sameStatementPeriod =
    !storedRow.statementPeriod ||
    !detectedRow.statementPeriod ||
    storedRow.statementPeriod === detectedRow.statementPeriod;

  return sameStatementNumber && sameStatementPeriod;
};

const shouldSuppressDetectedPremiumRow = (
  detectedRow: PremiumHistoryRow,
  storedRows: PremiumHistoryRow[]
): boolean => {
  if (detectedRow.premiumKind !== "auto_change") return false;
  // A saved later anniversary does not replace earlier evidence, nor a later
  // anniversary with the same premium. Only suppress the matching source row.
  return storedRows.some(row => row.premiumKind === "auto_change" && premiumRowsMatchStoredChange(row, detectedRow));
};

export function ContractAutoPremiumHistory({
  commissionPayouts = [],
  premiumIndexationEnabled,
  premiumIndexationHistory,
  viewerEmail,
  baseResolutions,
  onResolveBase,
  onOpenStatement,
  product,
  contractNumber,
  policyStartDate,
  signedAnnualPremium,
  signedAnnualPremiumOverride,
  statementInitialAnnualPremium,
  preferStatementInitialPremium = false,
  systemAnnualPremium,
  paymentFrequency = null,
  contractPaymentFrequency = null,
  statements,
  storedHistory,
  loading = false,
  error = null,
}: ContractAutoPremiumHistoryProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const contentId = useId();
  const [selectedSource, setSelectedSource] = useState<PremiumHistoryRow | null>(null);
  const frequency = contractPaymentFrequency ?? paymentFrequency;
  const showAutoStatementScan = isAutoProduct(product) || (
    product !== "domexneuron" && hasAnnualCommissionCodeSchedule({ productKey: product, frequencyRaw: frequency }) &&
    commissionPayouts.some(payout => payout.statementCode)
  );
  const normalizedContractNumber = normalizeContractNumber(contractNumber);
  const policyStart = toDate(policyStartDate);
  const needsRowConfirmation = showAutoStatementScan && !isAnnualAutoPayoutProduct(product) && frequency !== "annual";
  const isCombinedAnnualEntry = (entry: ContractAutoPremiumStatementHistoryEntry) =>
    entry.basePremiumPeriod === "annual" && Boolean(entry.combinedInstallmentCode && entry.basePremiumResolutionKey);
  const combinedAnnualBaseKeys = new Set((storedHistory ?? []).flatMap(entry =>
    isCombinedAnnualEntry(entry) ? [entry.basePremiumResolutionKey!] : []));
  const viewer = viewerEmail?.trim().toLowerCase();
  const combinedPayouts = viewer ? commissionPayouts.filter(payout =>
    payout.basePremiumPeriod === "annual" && payout.writtenBy?.trim().toLowerCase() === viewer) : [];
  const reviews: PremiumBaseReviewItem[] = needsRowConfirmation ? statements.flatMap(statement =>
    (statement.autoPremiumRows ?? []).filter(row => normalizeContractNumber(row.contractNumber) === normalizedContractNumber &&
      (!row.productKey || row.productKey === product) && !isKooperativaAutoRenewalPayout(product, row.commissionCode)).map(row => {
      const source = { ...row, productKey: row.productKey ?? product, frequencyRaw: frequency,
        statementId: statement.id, statementNumber: statement.statementNumber,
        statementPeriod: statement.period, statementDate: statement.statementDate, statementOwnerEmail: viewerEmail };
      const basisContract = { productKey: product, frequencyRaw: frequency, premiumStatementBaseResolutions: baseResolutions };
      const key = premiumBaseSourceKey(source, basisContract);
      if (combinedPayouts.some(payout => payout.statementId === statement.id && (payout.statementCode ?? payout.code) === row.commissionCode &&
        (payout.sourceBaseAmount ?? payout.statementBaseAmount) === row.basePremium && (row.commission == null || payout.amount === row.commission))) {
        combinedAnnualBaseKeys.add(key);
      }
      return { source, basis: resolveAutoPremiumBasis(source, basisContract, combinedAnnualBaseKeys.has(key)) };
    })) : [];
  const uniqueReviews = [...new Map(reviews.map(item => [item.basis.status === "invalid" ? `${item.source.statementId}:${item.source.rowId}:${item.source.commissionCode}` : item.basis.key, item])).values()];
  const resolvedSourceKeys = new Set(uniqueReviews.flatMap(item => item.basis.status === "resolved" ? [item.basis.key] : []));
  const activeBaseResolutions = (baseResolutions ?? []).filter(item => resolvedSourceKeys.has(item.key) ||
    (item.statementOwnerEmail && item.statementOwnerEmail !== viewerEmail && item.productKey === product &&
      item.frequencyRaw === frequency && item.key === premiumBaseSourceKey(item, item)));
  const sourceReviewForEntry = (entry: ContractAutoPremiumStatementHistoryEntry) => uniqueReviews.find(item =>
    item.source.statementId === entry.statementId && item.source.rowId === entry.rowId);
  const canRebuildStoredEntry = (entry: ContractAutoPremiumStatementHistoryEntry) =>
    sourceReviewForEntry(entry)?.basis.status === "resolved";
  const verifiedHistory = needsRowConfirmation ? (storedHistory ?? []).filter(entry => {
    if (!entry.statementId) return true;
    if (isKooperativaAutoRenewalPayout(product, entry.commissionCode)) return true;
    const review = sourceReviewForEntry(entry);
    if (!review && isCombinedAnnualEntry(entry)) return true;
    if (!review || review.basis.status !== "resolved") return false;
    const storedAnnualPremium = annualPremiumFromStoredHistoryEntry(entry, paymentFrequency, product);
    return entry.basePremiumResolutionKey === review.basis.key &&
      entry.basePremiumPeriod === review.basis.period && storedAnnualPremium != null &&
      Math.abs(storedAnnualPremium - review.basis.annualPremium) <= 0.01;
  }) : storedHistory;
  const hasUnrebuildableStoredHistory = needsRowConfirmation && (storedHistory ?? []).some(entry =>
    Boolean(entry.statementId && !verifiedHistory?.includes(entry) && !canRebuildStoredEntry(entry)));
  const hasUnconfirmed = uniqueReviews.some(item => item.basis.status !== "resolved") || hasUnrebuildableStoredHistory;
  const detectedRows = showAutoStatementScan && normalizedContractNumber
    ? buildPremiumHistoryRows({
        contractNumber: normalizedContractNumber,
        policyStartDate,
        product,
        paymentFrequency: contractPaymentFrequency ?? paymentFrequency,
        systemAnnualPremium,
        statements,
        baseResolutions: activeBaseResolutions,
        combinedAnnualBaseKeys,
        viewerEmail,
        commissionPayouts,
      })
    : [];
  const storedRows = buildStoredPremiumHistoryRows(
    verifiedHistory,
    paymentFrequency,
    product
  );
  if (product === "domexneuron") {
    // Premium facts are shared with authorized contract readers. Private
    // statement identities remain visible only through verifiedHistory.
    const publicHistory = (premiumIndexationHistory ?? []).map(change => {
      const day = toDate(change.effectiveDate);
      return {
        key: `indexation-${change.effectiveDate}-${change.paymentPremium}`,
        premiumKind: "auto_change" as const, changeReason: "indexation" as const,
        anniversaryDate: change.effectiveDate,
        anniversaryNumber: day && policyStart ? Math.max(1, day.getFullYear() - policyStart.getFullYear()) : 1,
        newPremium: change.paymentPremium,
        newAnnualPremium: Math.round(change.paymentPremium * paymentsPerYear(frequency) * 100) / 100,
        basePremiumPeriod: "payment" as const,
      };
    });
    for (const row of buildStoredPremiumHistoryRows(publicHistory, frequency, product)) {
      if (!storedRows.some(existing => existing.anniversaryDate.getTime() === row.anniversaryDate.getTime() &&
        existing.newAnnualPremium === row.newAnnualPremium)) storedRows.push(row);
    }
  }
  const storedChangeRows = storedRows.filter(row => row.premiumKind !== "auto_initial" && !detectedRows.some(detected =>
    detected.commissionCodeCorrectionNote && detected.statementId === row.statementId && detected.source === row.source &&
    detected.anniversaryDate.getTime() === row.anniversaryDate.getTime() && detected.commissionCodes.some(code => row.commissionCodes.includes(code))));

  if (!showAutoStatementScan && product !== "domexneuron" && storedChangeRows.length === 0) return null;

  const rowsByKey = new Map<string, PremiumHistoryRow>();
  storedChangeRows.forEach((row) => rowsByKey.set(row.key, row));
  detectedRows.forEach((row) => {
    if (row.premiumKind === "auto_initial") {
      return;
    }
    if (shouldSuppressDetectedPremiumRow(row, storedChangeRows)) {
      return;
    }
    if (!rowsByKey.has(row.key)) rowsByKey.set(row.key, row);
  });
  const rows = dedupePremiumHistoryRows([...rowsByKey.values()]).sort(
    (a, b) => a.anniversaryDate.getTime() - b.anniversaryDate.getTime()
  );
  const storedInitialAnnualPremium = initialAnnualPremiumFromStatementHistory(
    verifiedHistory,
    paymentFrequency,
    product
  );
  const detectedInitialAnnualPremium = showAutoStatementScan && normalizedContractNumber
    ? initialAnnualPremiumFromStatementRows({
        contractNumber: normalizedContractNumber,
        product,
        frequency: contractPaymentFrequency ?? paymentFrequency,
        statements,
        baseResolutions: activeBaseResolutions,
        viewerEmail,
        commissionPayouts,
      })
    : null;
  const resolvedStatementInitialAnnualPremium =
    detectedInitialAnnualPremium ?? storedInitialAnnualPremium ?? positivePremiumOrNull(statementInitialAnnualPremium);
  const firstKnownPreviousAnnualPremium =
    rows
      .map((row) => previousAnnualPremiumFromRow(row, paymentFrequency))
      .find((amount) => amount != null && amount > 0) ?? null;
  const signedAnnualPremiumValue = resolveAutoSignedAnnualPremiumValue({
    signedAnnualPremium,
    signedAnnualPremiumOverride,
    statementInitialAnnualPremium: resolvedStatementInitialAnnualPremium,
    firstKnownPreviousAnnualPremium,
    systemAnnualPremium,
    preferStatementInitialPremium:
      preferStatementInitialPremium || detectedInitialAnnualPremium != null ||
      signedAnnualPremiumMatchesStatementChange({
        signedAnnualPremium,
        statementInitialAnnualPremium: resolvedStatementInitialAnnualPremium,
        history: verifiedHistory,
        paymentFrequency,
        product,
      }),
  });
  const latestAnnualPremium =
    rows.length > 0
      ? annualPremiumFromRow(rows[rows.length - 1], paymentFrequency)
      : signedAnnualPremiumValue ?? positivePremiumOrNull(systemAnnualPremium);
  const totalAnnualChange =
    signedAnnualPremiumValue != null && latestAnnualPremium != null
      ? Math.round((latestAnnualPremium - signedAnnualPremiumValue) * 100) / 100
      : null;
  const HeaderIcon = showAutoStatementScan ? Car : TrendingUp;

  return (
    <section className={styles.panel} aria-label="Historie pojistného">
      <div className={styles.heading}>
        <ContractSectionToggle
          title="Historie pojistného"
          icon={<HeaderIcon size={18} strokeWidth={2} />}
          count={loading ? "Načítám…" : historyCountLabel(rows.length)}
          expanded={isExpanded}
          contentId={contentId}
          onToggle={() => setIsExpanded(value => !value)}
        />
      </div>

      <div id={contentId} hidden={!isExpanded}>
      {product === "domexneuron" && (
        <p className={styles.message}>
          {premiumIndexationEnabled === true
            ? "Valorizace: ANO. Pojistné se může při výročí zvýšit. Historie zachycuje skutečné změny z provizních výpisů; budoucí výpočty vycházejí z posledního potvrzeného pojistného."
            : premiumIndexationEnabled === false
              ? "Valorizace: NE. Pojistné se automaticky nezvyšuje."
              : "Valorizace: neurčena. Automatické zvýšení pojistného se neuplatňuje, dokud není valorizace potvrzena."}
        </p>
      )}
      <div className={styles.summary}>
        <div className={styles.summaryStart}>
          <span className={styles.label}>Při sjednání</span>
          <strong className={styles.startAmount}>{annualPremiumLabel(signedAnnualPremiumValue)}</strong>
          {paymentPremiumLabel(signedAnnualPremiumValue, frequency) && (
            <span className={styles.paymentAmount}>{paymentPremiumLabel(signedAnnualPremiumValue, frequency)}</span>
          )}
          <span className={styles.caption}>
            <CalendarDays size={13} aria-hidden="true" />
            od {formatDate(policyStart)}
          </span>
        </div>
        <span className={styles.connector} aria-hidden="true"><ArrowRight size={19} strokeWidth={1.7} /></span>
        <div className={styles.summaryCurrent}>
          <span className={styles.label}>{rows.length > 0 ? "Aktuálně" : "Stav z výpisů"}</span>
          <strong className={styles.currentAmount}>
            {hasUnconfirmed ? "Čeká na ověření" : rows.length > 0 ? annualPremiumLabel(latestAnnualPremium) : "Beze změn"}
          </strong>
          {!hasUnconfirmed && rows.length > 0 && paymentPremiumLabel(latestAnnualPremium, frequency) && (
            <span className={styles.paymentAmount}>{paymentPremiumLabel(latestAnnualPremium, frequency)}</span>
          )}
          <span className={styles.caption}>Poslední známé roční pojistné</span>
        </div>
        <div className={styles.summaryChange}>
          <span className={styles.label}>Celková změna</span>
          <strong className={`${styles.changeAmount} ${totalAnnualChange == null ? "text-slate-500" : totalAnnualChange >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
            {!hasUnconfirmed && rows.length > 0 && totalAnnualChange != null ? signedAnnualMoneyLabel(totalAnnualChange) : "—"}
          </strong>
          {!hasUnconfirmed && rows.length > 0 && frequency !== "annual" && signedPaymentDifferenceLabel(totalAnnualChange, frequency) && (
            <span className={styles.paymentAmount}>{signedPaymentDifferenceLabel(totalAnnualChange, frequency)}</span>
          )}
        </div>
      </div>

      {!loading && <PremiumBaseReview items={uniqueReviews} onResolve={onResolveBase} onOpenStatement={onOpenStatement} />}

      {showAutoStatementScan && loading ? (
        <div className={styles.message} role="status">
          <Loader2 size={20} className={styles.spinner} aria-hidden="true" />
          <span>Načítám provizní výpisy pro kontrolu výročí.</span>
        </div>
      ) : showAutoStatementScan && error ? (
        <div className={styles.message} role="alert" data-error="true">{error}</div>
      ) : showAutoStatementScan && !normalizedContractNumber ? (
        <div className={styles.message}>Smlouva nemá číslo smlouvy, takže ji nejde spárovat s provizním výpisem.</div>
      ) : rows.length === 0 ? (
        <div className={styles.message}>
          <span className={styles.emptyIcon}><CalendarDays size={22} strokeWidth={1.6} aria-hidden="true" /></span>
          <span>{hasUnconfirmed ? "Historii pojistného zobrazíme po ověření období základny." : "Zatím nemáme doložené pojistné k žádnému výročí."}</span>
        </div>
      ) : (
        <ol className={styles.timeline} aria-label="Pojistné při jednotlivých výročích">
          {rows.map((row, index) => {
            const rowAnnualPremium = annualPremiumFromRow(row, paymentFrequency);
            const previousDisplayedAnnualPremium =
              [...rows]
                .slice(0, index)
                .reverse()
                .map((item) => annualPremiumFromRow(item, paymentFrequency))
                .find((amount) => amount != null && amount > 0) ?? null;
            const previousCorrectedYearPremium = [...rows].slice(0, index).reverse().find(previous =>
              previous.source === row.source && previous.anniversaryNumber === row.anniversaryNumber - 1);
            const correctedFallback = previousCorrectedYearPremium
              ? annualPremiumFromRow(previousCorrectedYearPremium, paymentFrequency)
              : row.anniversaryNumber === 1 ? resolvedStatementInitialAnnualPremium : null;
            const previousAnnualPremium = previousAnnualPremiumFromRow(row, paymentFrequency) ??
              (row.commissionCodeCorrectionNote ? correctedFallback : previousDisplayedAnnualPremium ?? signedAnnualPremiumValue);
            const rowDifferenceAnnual =
              differenceAnnualFromRow(row, paymentFrequency) ??
              (rowAnnualPremium != null && previousAnnualPremium != null
                ? Math.round((rowAnnualPremium - previousAnnualPremium) * 100) / 100
                : null);
            const displayStatus =
              row.status === "detected"
                ? premiumStatusFromDifference(rowDifferenceAnnual, row.changeReason === "indexation" ? 0.01 : ANNUAL_PREMIUM_TOLERANCE)
                : row.status;
            const StatusIcon = statusIcon(displayStatus);
            const isLifeIncrease = row.premiumKind === "life_increase";
            const changePercent = previousAnnualPremium != null && previousAnnualPremium > 0 &&
              rowAnnualPremium != null && Number.isFinite(previousAnnualPremium) && Number.isFinite(rowAnnualPremium)
              ? Math.round(((rowAnnualPremium - previousAnnualPremium) / previousAnnualPremium) * 10_000) / 100
              : null;
            const trend = changePercent == null || changePercent === 0 ? "same" : changePercent > 0 ? "increased" : "decreased";
            const TrendIcon = trend === "increased" ? TrendingUp : trend === "decreased" ? TrendingDown : Minus;
            const percentLabel = changePercent == null ? null : `${changePercent.toLocaleString("cs-CZ", {
              minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero",
            })} %`;
            const changeToneClass =
              rowDifferenceAnnual == null || displayStatus === "same"
                ? "text-slate-950"
                : rowDifferenceAnnual >= 0
                  ? "text-emerald-700"
                  : "text-rose-700";
            return (
              <li key={row.key} className={styles.event}>
                <span className={styles.marker} data-status={displayStatus} aria-hidden="true">
                  <StatusIcon size={18} strokeWidth={1.8} />
                </span>
                <article className={styles.eventContent}>
                  <div className={styles.eventTop}>
                    <div className={styles.eventHeading}>
                      {row.commissionCodeCorrectionNote && <span className={styles.eventDate}>{row.commissionCodeCorrectionNote}</span>}
                      <h4>{isLifeIncrease ? "Změna pojistného" : `${row.changeReason === "indexation" ? "Valorizace · " : ""}${row.anniversaryNumber}. výročí`}</h4>
                      {row.premiumDerivedFromCommission && <span className={styles.eventDate}>Odvozeno z provize</span>}
                      <span className={styles.eventDate}>
                        <CalendarDays size={13} aria-hidden="true" />
                        {isLifeIncrease ? "Účinnost " : ""}{formatDate(row.anniversaryDate)}
                      </span>
                      <span className={styles.eventStatus} data-status={displayStatus}>{statusLabel(displayStatus)}</span>
                      {percentLabel && (
                        <span className={styles.trend} data-trend={trend}
                          title="Změna oproti předchozímu ročnímu pojistnému"
                          aria-label={`Změna oproti předchozímu ročnímu pojistnému: ${percentLabel}`}>
                          <TrendIcon size={14} strokeWidth={2} aria-hidden="true" />
                          {percentLabel}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      className={styles.sourceButton}
                      aria-haspopup="dialog"
                      aria-label={`Zdroj pojistného ${formatDate(row.anniversaryDate)}`}
                      onClick={() => setSelectedSource(row)}
                    >
                      <FileText size={14} strokeWidth={1.8} aria-hidden="true" />
                      Zdroj
                    </button>
                  </div>
                  <div className={styles.eventAmounts}>
                    <div>
                      <span className={styles.label}>Původní</span>
                      <span className={styles.previousAmount}>{annualPremiumLabel(previousAnnualPremium)}</span>
                      {paymentPremiumLabel(previousAnnualPremium, frequency) && (
                        <span className={styles.paymentAmount}>{paymentPremiumLabel(previousAnnualPremium, frequency)}</span>
                      )}
                    </div>
                    <ArrowRight size={16} strokeWidth={1.7} className={styles.amountArrow} aria-hidden="true" />
                    <div>
                      <span className={styles.label}>{displayStatus === "same" ? "Pojistné při výročí" : "Nové pojistné"}</span>
                      <strong className={styles.newAmount}>{annualPremiumLabel(rowAnnualPremium)}</strong>
                      {paymentPremiumLabel(rowAnnualPremium, frequency) && (
                        <span className={styles.paymentAmount}>{paymentPremiumLabel(rowAnnualPremium, frequency)}</span>
                      )}
                    </div>
                    <div className={styles.eventDifference}>
                      <span className={styles.label}>Rozdíl</span>
                      <strong className={`${styles.differenceAmount} ${changeToneClass}`}>{signedAnnualMoneyLabel(rowDifferenceAnnual)}</strong>
                      {frequency !== "annual" && signedPaymentDifferenceLabel(rowDifferenceAnnual, frequency) && (
                        <span className={styles.paymentAmount}>{signedPaymentDifferenceLabel(rowDifferenceAnnual, frequency)}</span>
                      )}
                    </div>
                  </div>
                </article>
              </li>
            );
          })}
        </ol>
      )}

      </div>

      {selectedSource && (
        <PremiumHistorySourceDialog
          source={selectedSource}
          sourceLabel={statementSourceLabel(selectedSource)}
          contractNumber={contractNumber}
          onOpenStatement={onOpenStatement}
          onClose={() => setSelectedSource(null)}
        />
      )}
    </section>
  );
}
