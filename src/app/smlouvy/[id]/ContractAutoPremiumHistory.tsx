import {
  ArrowRight,
  CalendarDays,
  Car,
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
import { ContractSectionHeading } from "./ContractDetailUi";

type ContractAutoPremiumHistoryProps = {
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

const statementBasePeriodForAutoProduct = (
  product: Product | null | undefined
): "annual" | "payment" | null => {
  if (!isAutoProduct(product)) return null;
  return isAnnualAutoPayoutProduct(product) ? "annual" : "payment";
};

const annualPremiumFromStatementBase = (
  basePremium: number,
  product: Product | null | undefined,
  paymentFrequency: PaymentFrequency | null | undefined
): { annualPremium: number; basePremiumPeriod: "annual" | "payment" | null } => {
  const base = Math.round(basePremium * 100) / 100;
  const basePremiumPeriod = statementBasePeriodForAutoProduct(product);
  if (basePremiumPeriod === "payment") {
    return {
      annualPremium: Math.round(base * paymentsPerYear(paymentFrequency) * 100) / 100,
      basePremiumPeriod,
    };
  }
  return {
    annualPremium: base,
    basePremiumPeriod,
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

const statusClass = (status: PremiumChangeStatus): string => {
  switch (status) {
    case "initial":
      return "border-sky-200 bg-sky-50 text-sky-800";
    case "increased":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "decreased":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "same":
      return "border-slate-200 bg-slate-50 text-slate-700";
    default:
      return "border-sky-200 bg-sky-50 text-sky-800";
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
}: {
  contractNumber: string;
  policyStartDate: ContractDoc["policyStartDate"];
  product: Product | undefined;
  paymentFrequency: PaymentFrequency | null | undefined;
  systemAnnualPremium: number;
  statements: ContractCommissionStatementSummary[];
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

      const { annualPremium, basePremiumPeriod } = annualPremiumFromStatementBase(
        row.basePremium,
        statementProduct,
        paymentFrequency
      );
      const { status, difference } = premiumStatus(annualPremium, systemAnnualPremium);
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
        previousAnnualPremium: null,
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
  const showAutoStatementScan = isAutoProduct(product);
  const normalizedContractNumber = normalizeContractNumber(contractNumber);
  const policyStart = toDate(policyStartDate);
  const detectedRows = showAutoStatementScan && normalizedContractNumber
    ? buildPremiumHistoryRows({
        contractNumber: normalizedContractNumber,
        policyStartDate,
        product,
        paymentFrequency: contractPaymentFrequency ?? paymentFrequency,
        systemAnnualPremium,
        statements,
      })
    : [];
  const storedRows = buildStoredPremiumHistoryRows(
    storedHistory,
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
    storedHistory,
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
        history: storedHistory,
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
    <section className="overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-[0_10px_26px_rgba(15,23,42,0.055)]">
      <div className="px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <ContractSectionHeading
            icon={<HeaderIcon size={17} strokeWidth={2.2} aria-hidden="true" />}
          >
            Změny pojistného
          </ContractSectionHeading>
          <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
            {changeCountLabel(rows.length)}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-3 border-t border-slate-200 pt-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_minmax(150px,0.8fr)] sm:gap-x-5">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
              Při sjednání
            </div>
            <div className="mt-0.5 text-base font-black tracking-tight text-slate-950 sm:text-lg">
              {annualPremiumLabel(signedAnnualPremiumValue)}
            </div>
            <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500">
              <CalendarDays size={12} strokeWidth={2.1} aria-hidden="true" />
              od {formatDate(policyStart)}
            </div>
          </div>

          <ArrowRight size={17} strokeWidth={2.2} className="text-slate-300" aria-hidden="true" />

          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
              {rows.length > 0 ? "Aktuálně" : "Stav z výpisů"}
            </div>
            <div className="mt-0.5 text-base font-black tracking-tight text-slate-950 sm:text-lg">
              {rows.length > 0 ? annualPremiumLabel(latestAnnualPremium) : "Beze změn"}
            </div>
            <div className="mt-0.5 text-[11px] font-semibold text-slate-500">
              Poslední známé roční pojistné
            </div>
          </div>

          <div className="col-span-3 mt-2 border-t border-slate-100 pt-2 sm:col-span-1 sm:mt-0 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
              Celková změna
            </div>
            <div
              className={`mt-0.5 text-base font-black tracking-tight ${
                totalAnnualChange == null
                  ? "text-slate-500"
                  : totalAnnualChange >= 0
                    ? "text-emerald-700"
                    : "text-rose-700"
              }`}
            >
              {rows.length > 0 && totalAnnualChange != null
                ? signedAnnualMoneyLabel(totalAnnualChange)
                : "—"}
            </div>
          </div>
        </div>
      </div>

      {showAutoStatementScan && loading ? (
        <div className="m-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-3.5 py-3 text-sm font-medium text-slate-600">
          Načítám provizní výpisy pro kontrolu výročí.
        </div>
      ) : showAutoStatementScan && error ? (
        <div className="m-4 rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm font-semibold text-amber-900">
          {error}
        </div>
      ) : showAutoStatementScan && !normalizedContractNumber ? (
        <div className="m-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-3.5 py-3 text-sm font-medium text-slate-600">
          Smlouva nemá číslo smlouvy, takže ji nejde spárovat s provizním výpisem.
        </div>
      ) : rows.length === 0 ? (
        <div className="m-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-3.5 py-3 text-sm font-medium text-slate-600">
          Zatím žádný provizní výpis neobsahuje změnu pojistného.
        </div>
      ) : (
        <div className="border-t border-slate-200">
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
            const effectiveLabel = isLifeIncrease ? "Účinnost" : "Výročí";
            const changeToneClass =
              rowDifferenceAnnual == null
                ? "text-slate-950"
                : rowDifferenceAnnual >= 0
                  ? "text-emerald-700"
                  : "text-rose-700";
            return (
              <article
                key={row.key}
                className="border-b border-slate-100 px-4 py-3 last:border-b-0"
              >
                <div className="flex flex-col gap-1.5 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
                  <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-bold ${statusClass(displayStatus)}`}
                      >
                        <StatusIcon size={12} strokeWidth={2.3} aria-hidden="true" />
                        {statusLabel(displayStatus)}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                        {isLifeIncrease ? "Změna pojistného" : `${row.anniversaryNumber}. výročí`}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                        <CalendarDays size={12} strokeWidth={2.1} aria-hidden="true" />
                        {effectiveLabel} {formatDate(row.anniversaryDate)}
                      </span>
                  </div>
                  <div className="min-w-0 truncate text-[11px] font-medium text-slate-500" title={statementSourceLabel(row)}>
                    Zdroj: {statementSourceLabel(row)}
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-x-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_minmax(130px,0.75fr)] sm:gap-x-5">
                  <div className="min-w-0">
                    <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                      Původní
                    </div>
                    <div className="mt-0.5 text-sm font-bold text-slate-700 sm:text-base">
                      {annualPremiumLabel(previousAnnualPremium)}
                    </div>
                  </div>
                  <ArrowRight
                    size={16}
                    strokeWidth={2.2}
                    className="mb-0.5 text-slate-300"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                      Nové pojistné
                    </div>
                    <div className="mt-0.5 text-sm font-black text-slate-950 sm:text-base">
                      {annualPremiumLabel(rowAnnualPremium)}
                    </div>
                  </div>
                  <div className="col-span-3 mt-2 flex items-baseline justify-between border-t border-slate-100 pt-2 sm:col-span-1 sm:mt-0 sm:block sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
                    <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                      Rozdíl
                    </div>
                    <div className={`mt-0.5 text-sm font-black sm:text-base ${changeToneClass}`}>
                      {signedAnnualMoneyLabel(rowDifferenceAnnual)}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
