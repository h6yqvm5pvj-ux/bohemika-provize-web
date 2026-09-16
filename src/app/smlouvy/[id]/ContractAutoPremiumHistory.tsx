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
import { anniversaryNumberFromInstallmentCommissionCode } from "@/app/lib/productFormulas/autoCommission";
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
import { PremiumBaseReview, type PremiumBaseReviewItem, type ResolvePremiumBase } from "./PremiumBaseReview";

type ContractAutoPremiumHistoryProps = {
  viewerEmail?: string;
  baseResolutions?: PremiumBaseResolution[] | null;
  onResolveBase?: ResolvePremiumBase;
  onOpenStatement?: (id: string) => void;
  product: Product | undefined;
  contractNumber?: string | null;
  policyStartDate?: ContractDoc["policyStartDate"];
  signedAnnualPremium?: number | null;
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
  statementInitialAnnualPremium,
  firstKnownPreviousAnnualPremium,
  systemAnnualPremium,
  preferStatementInitialPremium,
}: {
  signedAnnualPremium?: number | null;
  statementInitialAnnualPremium?: number | null;
  firstKnownPreviousAnnualPremium?: number | null;
  systemAnnualPremium?: number | null;
  preferStatementInitialPremium?: boolean;
}): number | null => {
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

const changeCountLabel = (count: number): string => {
  if (count === 1) return "1 změna";
  if (count >= 2 && count <= 4) return `${count} změny`;
  return `${count} změn`;
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

const buildPremiumHistoryRows = ({
  contractNumber,
  policyStartDate,
  product,
  paymentFrequency,
  systemAnnualPremium,
  statements,
  baseResolutions,
  viewerEmail,
}: {
  contractNumber: string;
  policyStartDate: ContractDoc["policyStartDate"];
  product: Product | undefined;
  paymentFrequency: PaymentFrequency | null | undefined;
  systemAnnualPremium: number;
  statements: ContractCommissionStatementSummary[];
  baseResolutions?: PremiumBaseResolution[] | null;
  viewerEmail?: string;
}): PremiumHistoryRow[] => {
  const systemPolicyStart = toDate(policyStartDate);
  const normalizedContractNumber = normalizeContractNumber(contractNumber);
  if (!normalizedContractNumber) return [];

  const rows = new Map<string, PremiumHistoryRow>();

  for (const statement of statements) {
    for (const row of statement.autoPremiumRows ?? []) {
      if (normalizeContractNumber(row.contractNumber) !== normalizedContractNumber) continue;

      const statementPolicyStart = statementRowDate(row.validFrom);
      const policyStart = statementPolicyStart ?? systemPolicyStart;
      if (!policyStart) continue;

      const statementProduct = row.productKey ?? product ?? null;
      const anniversaryNumber = anniversaryNumberFromInstallmentCommissionCode(
        row.commissionCode,
        scheduleFrequencyForStatementProduct(statementProduct, paymentFrequency)
      );
      if (anniversaryNumber == null) continue;

      const anniversaryDate = addYearsClamped(policyStart, anniversaryNumber);
      if (!anniversaryDate) continue;

      const source = { ...row, statementId: statement.id, statementNumber: statement.statementNumber,
        statementPeriod: statement.period, statementDate: statement.statementDate, statementOwnerEmail: viewerEmail };
      const basisContract = { productKey: statementProduct, frequencyRaw: paymentFrequency, premiumStatementBaseResolutions: baseResolutions };
      const basis = resolveAutoPremiumBasis(source, basisContract);
      if (basis.status !== "resolved") continue;
      const { annualPremium, period: basePremiumPeriod } = basis;
      const previousAnnualPremium = previousConfirmedAutoAnnualPremium(source, basisContract);
      const { status, difference } = premiumStatus(annualPremium, previousAnnualPremium ?? systemAnnualPremium);
      if (status === "same") continue;
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
        premiumKind: "auto_change",
        statementId: statement.id,
        rowId: row.rowId,
        anniversaryNumber,
        anniversaryDate,
        policyStartDate: policyStart,
        policyStartSource: statementPolicyStart ? "statement" : "system",
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
          : premiumStatusFromDifference(differenceAnnual);

      return {
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
  storedRows: PremiumHistoryRow[],
  paymentFrequency: PaymentFrequency | null | undefined
): boolean => {
  if (detectedRow.premiumKind !== "auto_change") return false;
  const storedAutoChanges = storedRows.filter((row) => row.premiumKind === "auto_change");
  if (storedAutoChanges.length === 0) return false;

  if (storedAutoChanges.some((storedRow) => premiumRowsMatchStoredChange(storedRow, detectedRow))) {
    return true;
  }

  const latestStoredChangeTime = Math.max(
    ...storedAutoChanges.map((row) => row.anniversaryDate.getTime())
  );
  if (detectedRow.anniversaryDate.getTime() < latestStoredChangeTime) return true;

  const detectedAnnualPremium = annualPremiumFromRow(detectedRow, paymentFrequency);
  if (detectedAnnualPremium == null) return false;

  const latestStoredBeforeDetected = [...storedAutoChanges]
    .filter((row) => row.anniversaryDate.getTime() <= detectedRow.anniversaryDate.getTime())
    .sort((a, b) => a.anniversaryDate.getTime() - b.anniversaryDate.getTime())
    .at(-1);
  const latestStoredAnnualPremium = latestStoredBeforeDetected
    ? annualPremiumFromRow(latestStoredBeforeDetected, paymentFrequency)
    : null;

  return (
    latestStoredAnnualPremium != null &&
    Math.abs(detectedAnnualPremium - latestStoredAnnualPremium) <= ANNUAL_PREMIUM_TOLERANCE
  );
};

export function ContractAutoPremiumHistory({
  viewerEmail,
  baseResolutions,
  onResolveBase,
  onOpenStatement,
  product,
  contractNumber,
  policyStartDate,
  signedAnnualPremium,
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
  const showAutoStatementScan = isAutoProduct(product);
  const normalizedContractNumber = normalizeContractNumber(contractNumber);
  const policyStart = toDate(policyStartDate);
  const frequency = contractPaymentFrequency ?? paymentFrequency;
  const needsRowConfirmation = showAutoStatementScan && !isAnnualAutoPayoutProduct(product) && frequency !== "annual";
  const reviews: PremiumBaseReviewItem[] = needsRowConfirmation ? statements.flatMap(statement =>
    (statement.autoPremiumRows ?? []).filter(row => normalizeContractNumber(row.contractNumber) === normalizedContractNumber && (!row.productKey || row.productKey === product)).map(row => {
      const source = { ...row, statementId: statement.id, statementNumber: statement.statementNumber,
        statementPeriod: statement.period, statementDate: statement.statementDate, statementOwnerEmail: viewerEmail };
      return { source, basis: resolveAutoPremiumBasis(source, { productKey: product, frequencyRaw: frequency, premiumStatementBaseResolutions: baseResolutions }) };
    })) : [];
  const uniqueReviews = [...new Map(reviews.map(item => [item.basis.status === "invalid" ? `${item.source.statementId}:${item.source.rowId}:${item.source.commissionCode}` : item.basis.key, item])).values()];
  const confirmedKeys = new Set(uniqueReviews.flatMap(item => item.basis.status === "resolved" ? [item.basis.key] : []));
  const activeBaseResolutions = (baseResolutions ?? []).filter(item => confirmedKeys.has(item.key) ||
    (item.statementOwnerEmail && item.statementOwnerEmail !== viewerEmail && item.productKey === product &&
      item.frequencyRaw === frequency && item.key === premiumBaseSourceKey(item, item)));
  const activeKeys = new Set(activeBaseResolutions.map(item => item.key));
  const verifiedHistory = needsRowConfirmation ? (storedHistory ?? []).filter(entry =>
    !entry.statementId || (entry.basePremiumResolutionKey && activeKeys.has(entry.basePremiumResolutionKey))) : storedHistory;
  const hasUnconfirmed = uniqueReviews.some(item => item.basis.status !== "resolved") || (needsRowConfirmation && (verifiedHistory?.length ?? 0) < (storedHistory?.length ?? 0));
  const detectedRows = showAutoStatementScan && normalizedContractNumber
    ? buildPremiumHistoryRows({
        contractNumber: normalizedContractNumber,
        policyStartDate,
        product,
        paymentFrequency: contractPaymentFrequency ?? paymentFrequency,
        systemAnnualPremium,
        statements,
        baseResolutions: activeBaseResolutions,
        viewerEmail,
      })
    : [];
  const storedRows = buildStoredPremiumHistoryRows(
    verifiedHistory,
    paymentFrequency,
    product
  );
  const storedChangeRows = storedRows.filter(
    (row) => row.premiumKind !== "auto_initial" && row.status !== "same"
  );

  if (!showAutoStatementScan && storedChangeRows.length === 0) return null;

  const rowsByKey = new Map<string, PremiumHistoryRow>();
  storedChangeRows.forEach((row) => rowsByKey.set(row.key, row));
  detectedRows.forEach((row) => {
    if (row.status === "same" || row.premiumKind === "auto_initial") {
      return;
    }
    if (shouldSuppressDetectedPremiumRow(row, storedChangeRows, paymentFrequency)) {
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
  const resolvedStatementInitialAnnualPremium =
    storedInitialAnnualPremium ?? positivePremiumOrNull(statementInitialAnnualPremium);
  const firstKnownPreviousAnnualPremium =
    rows
      .map((row) => previousAnnualPremiumFromRow(row, paymentFrequency))
      .find((amount) => amount != null && amount > 0) ?? null;
  const signedAnnualPremiumValue = resolveAutoSignedAnnualPremiumValue({
    signedAnnualPremium,
    statementInitialAnnualPremium: resolvedStatementInitialAnnualPremium,
    firstKnownPreviousAnnualPremium,
    systemAnnualPremium,
    preferStatementInitialPremium:
      preferStatementInitialPremium ||
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
    <section className={styles.panel} aria-label="Změny pojistného">
      <div className={styles.heading}>
        <ContractSectionToggle
          title="Změny pojistného"
          icon={<HeaderIcon size={18} strokeWidth={2} />}
          count={loading ? "Načítám…" : changeCountLabel(rows.length)}
          expanded={isExpanded}
          contentId={contentId}
          onToggle={() => setIsExpanded(value => !value)}
        />
      </div>

      <div id={contentId} hidden={!isExpanded}>
      <div className={styles.summary}>
        <div className={styles.summaryStart}>
          <span className={styles.label}>Při sjednání</span>
          <strong className={styles.startAmount}>{annualPremiumLabel(signedAnnualPremiumValue)}</strong>
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
          <span className={styles.caption}>Poslední známé roční pojistné</span>
        </div>
        <div className={styles.summaryChange}>
          <span className={styles.label}>Celková změna</span>
          <strong className={`${styles.changeAmount} ${totalAnnualChange == null ? "text-slate-500" : totalAnnualChange >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
            {!hasUnconfirmed && rows.length > 0 && totalAnnualChange != null ? signedAnnualMoneyLabel(totalAnnualChange) : "—"}
          </strong>
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
          <span>{hasUnconfirmed ? "Změnu pojistného zobrazíme po ověření období základny." : "Zatím žádný provizní výpis neobsahuje změnu pojistného."}</span>
        </div>
      ) : (
        <ol className={styles.timeline} aria-label="Historie změn pojistného">
          {rows.map((row, index) => {
            const rowAnnualPremium = annualPremiumFromRow(row, paymentFrequency);
            const previousDisplayedAnnualPremium =
              [...rows]
                .slice(0, index)
                .reverse()
                .map((item) => annualPremiumFromRow(item, paymentFrequency))
                .find((amount) => amount != null && amount > 0) ?? null;
            const previousAnnualPremium =
              previousAnnualPremiumFromRow(row, paymentFrequency) ??
              previousDisplayedAnnualPremium ??
              signedAnnualPremiumValue;
            const rowDifferenceAnnual =
              differenceAnnualFromRow(row, paymentFrequency) ??
              (rowAnnualPremium != null && previousAnnualPremium != null
                ? Math.round((rowAnnualPremium - previousAnnualPremium) * 100) / 100
                : null);
            const displayStatus =
              row.status === "detected"
                ? premiumStatusFromDifference(rowDifferenceAnnual)
                : row.status;
            const StatusIcon = statusIcon(displayStatus);
            const isLifeIncrease = row.premiumKind === "life_increase";
            const changeToneClass =
              rowDifferenceAnnual == null
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
                      <h4>{isLifeIncrease ? "Změna pojistného" : `${row.anniversaryNumber}. výročí`}</h4>
                      <span className={styles.eventDate}>
                        <CalendarDays size={13} aria-hidden="true" />
                        {isLifeIncrease ? "Účinnost " : ""}{formatDate(row.anniversaryDate)}
                      </span>
                      <span className={styles.eventStatus} data-status={displayStatus}>{statusLabel(displayStatus)}</span>
                    </div>
                    <button
                      type="button"
                      className={styles.sourceButton}
                      aria-haspopup="dialog"
                      aria-label={`Zdroj změny ${formatDate(row.anniversaryDate)}`}
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
                    </div>
                    <ArrowRight size={16} strokeWidth={1.7} className={styles.amountArrow} aria-hidden="true" />
                    <div>
                      <span className={styles.label}>Nové pojistné</span>
                      <strong className={styles.newAmount}>{annualPremiumLabel(rowAnnualPremium)}</strong>
                    </div>
                    <div className={styles.eventDifference}>
                      <span className={styles.label}>Rozdíl</span>
                      <strong className={`${styles.differenceAmount} ${changeToneClass}`}>{signedAnnualMoneyLabel(rowDifferenceAnnual)}</strong>
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
