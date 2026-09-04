import { createHash } from "node:crypto";

import type { Product } from "@/app/types/domain";
import {
  isAnnualAutoPayoutProduct,
  isAutoProduct,
  isPropertyProduct,
} from "@/app/lib/productCatalog";
import {
  addUtcYearsClamped,
  anniversaryNumberFromInstallmentCommissionCode,
  installmentPaymentsPerYear,
  isAutoSubsequentCommissionCode,
} from "@/app/lib/productFormulas/autoCommission";
import { commissionStatementIdentityKey } from "./statementIdentity";

const PREMIUM_CHANGE_TOLERANCE = 12;
const LEGACY_STATEMENT_CREATED_CONTRACT_WINDOW_MS = 15 * 60 * 1000;

export type PremiumStatementRow = {
  premiumKind: "auto_initial" | "auto_change" | "life_increase";
  rowId: string;
  contractNumber: string;
  productCode: string;
  productKey: Product | null;
  commissionCode: string;
  basePremium: number;
  signedAt: string | null;
  validFrom: string | null;
  source: "own" | "manager";
};

export type PremiumHistoryContract = {
  productKey?: Product | null;
  frequencyRaw?: string | null;
  inputAmount?: number | null;
  effectiveInputAmount?: number | null;
  calculationInputAmount?: number | null;
  createdAt?: unknown;
  createdFromCommissionStatement?: unknown;
  createdFromCommissionStatementId?: unknown;
  premiumUpdatedFromStatementAtMs?: unknown;
  premiumUpdatedFromStatementId?: unknown;
  policyStartDate?: unknown;
  premiumStatementHistory?: unknown[] | null;
  refreshCommissionBase?: {
    calculationMonthlyPremium?: number | null;
  } | null;
};

export type PremiumStatementHistoryEntry = {
  key: string;
  premiumKind: PremiumStatementRow["premiumKind"];
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
  source: PremiumStatementRow["source"];
  writtenAtMs: number;
  writtenBy: string;
};

const compactHash = (value: string, length = 24): string =>
  createHash("sha256").update(value).digest("hex").slice(0, length);

const finiteMoneyOrNull = (value: unknown): number | null => {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
};

const normalizeCommissionCodeKey = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

const parseCzechDate = (value: unknown): number | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const czech = trimmed.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
  if (czech) {
    const day = Number(czech[1]);
    const month = Number(czech[2]);
    const year = Number(czech[3]);
    const date = Date.UTC(year, month - 1, day);
    return Number.isFinite(date) ? date : null;
  }
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const date = Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isFinite(date) ? date : null;
  }
  return null;
};

const toMillis = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") return parseCzechDate(value);
  if (value instanceof Date) return value.getTime();
  if (
    value &&
    typeof value === "object" &&
    "seconds" in value &&
    typeof (value as { seconds?: unknown }).seconds === "number"
  ) {
    return (value as { seconds: number }).seconds * 1000;
  }
  return null;
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

  const periodParts = String(statementPeriod ?? "").match(
    /(\d{1,2}\.\s*\d{1,2}\.\s*\d{4}).*?(\d{1,2}\.\s*\d{1,2}\.\s*\d{4})/
  );
  const parsedPeriodStart = parseCzechDate(periodParts?.[1]);
  const parsedPeriodEnd = parseCzechDate(periodParts?.[2]);
  return parsedPeriodEnd ?? periodStartMs ?? parsedPeriodStart ?? null;
};

export const premiumHistoryEntryChronologyMs = (
  entry: PremiumStatementHistoryEntry
): number | null =>
  statementChronologyMsFromParts({
    statementDate: entry.statementDate,
    statementDateMs: toMillis(entry.statementChronologyMs),
    statementPeriod: entry.statementPeriod,
  });

export const premiumHistoryEntryDateMs = (
  entry: PremiumStatementHistoryEntry
): number | null => parseCzechDate(entry.anniversaryDate) ?? premiumHistoryEntryChronologyMs(entry);

export const contractPremiumHistoryArray = (
  contract: PremiumHistoryContract
): PremiumStatementHistoryEntry[] =>
  Array.isArray(contract.premiumStatementHistory)
    ? contract.premiumStatementHistory.filter(
        (item): item is PremiumStatementHistoryEntry =>
          Boolean(
            item &&
              typeof item === "object" &&
              typeof (item as { key?: unknown }).key === "string"
          )
      )
    : [];

export const autoContractWasCreatedFromCommissionStatement = (
  contract: PremiumHistoryContract
): boolean => {
  if (!isAutoProduct(contract.productKey ?? null)) return false;
  if (contract.createdFromCommissionStatement === true) return true;
  if (String(contract.createdFromCommissionStatementId ?? "").trim()) return true;

  const sourceStatementId = String(contract.premiumUpdatedFromStatementId ?? "").trim();
  if (!sourceStatementId) return false;
  const createdAtMs = toMillis(contract.createdAt);
  const sourceCapturedAtMs = toMillis(contract.premiumUpdatedFromStatementAtMs);
  if (createdAtMs == null || sourceCapturedAtMs == null) return false;

  return (
    Math.abs(sourceCapturedAtMs - createdAtMs) <=
    LEGACY_STATEMENT_CREATED_CONTRACT_WINDOW_MS
  );
};

const latestPremiumStatementChronologyMs = (contract: PremiumHistoryContract): number | null =>
  contractPremiumHistoryArray(contract).reduce<number | null>((latest, entry) => {
    const entryChronologyMs = premiumHistoryEntryChronologyMs(entry);
    if (entryChronologyMs == null) return latest;
    return latest == null ? entryChronologyMs : Math.max(latest, entryChronologyMs);
  }, null);

export const canApplyPremiumStatementToCurrentContract = (
  contract: PremiumHistoryContract & { premiumUpdatedFromStatementChronologyMs?: unknown },
  statementChronologyMs: number | null
): boolean => {
  if (statementChronologyMs == null) return true;
  const directValue = toMillis(contract.premiumUpdatedFromStatementChronologyMs);
  const latestChronologyMs = directValue ?? latestPremiumStatementChronologyMs(contract);
  return latestChronologyMs == null || statementChronologyMs >= latestChronologyMs;
};

const contractCurrentPremium = (contract: PremiumHistoryContract): number | null =>
  finiteMoneyOrNull(contract.refreshCommissionBase?.calculationMonthlyPremium) ??
  (isAutoProduct(contract.productKey ?? null)
    ? finiteMoneyOrNull(contract.effectiveInputAmount) ??
      finiteMoneyOrNull(contract.inputAmount) ??
      finiteMoneyOrNull(contract.calculationInputAmount)
    : finiteMoneyOrNull(contract.calculationInputAmount) ??
      finiteMoneyOrNull(contract.effectiveInputAmount) ??
      finiteMoneyOrNull(contract.inputAmount));

const contractPaymentPeriodsPerYear = (contract: PremiumHistoryContract): number => {
  return installmentPaymentsPerYear(contract.frequencyRaw);
};

const contractCurrentAutoAnnualPremium = (contract: PremiumHistoryContract): number | null => {
  const paymentPremium = contractCurrentPremium(contract);
  if (paymentPremium == null) return null;
  return Math.round(paymentPremium * contractPaymentPeriodsPerYear(contract) * 100) / 100;
};

export const annualPremiumFromStoredHistoryEntry = (
  entry: PremiumStatementHistoryEntry,
  contract: PremiumHistoryContract
): number | null => {
  const annualPremium = finiteMoneyOrNull(entry.newAnnualPremium);
  const premium = finiteMoneyOrNull(entry.newPremium);
  const paymentsPerYear = contractPaymentPeriodsPerYear(contract);
  const statementBaseIsPayment =
    isAutoProduct(contract.productKey ?? null) &&
    !isAnnualAutoPayoutProduct(contract.productKey ?? null);

  if (annualPremium != null) {
    const isLegacyPaymentValueStoredAsAnnual =
      entry.basePremiumPeriod == null &&
      statementBaseIsPayment &&
      paymentsPerYear > 1 &&
      premium != null &&
      Math.abs(annualPremium - premium) <= PREMIUM_CHANGE_TOLERANCE;
    return isLegacyPaymentValueStoredAsAnnual
      ? Math.round(annualPremium * paymentsPerYear * 100) / 100
      : annualPremium;
  }

  if (premium == null) return null;
  return entry.basePremiumPeriod === "payment" ||
    (entry.basePremiumPeriod == null && statementBaseIsPayment)
    ? Math.round(premium * paymentsPerYear * 100) / 100
    : premium;
};

export const previousAnnualPremiumFromStoredHistoryEntry = (
  entry: PremiumStatementHistoryEntry,
  contract: PremiumHistoryContract
): number | null => {
  const annualPremium = finiteMoneyOrNull(entry.previousAnnualPremium);
  const premium = finiteMoneyOrNull(entry.previousPremium);
  const paymentsPerYear = contractPaymentPeriodsPerYear(contract);
  const statementBaseIsPayment =
    isAutoProduct(contract.productKey ?? null) &&
    !isAnnualAutoPayoutProduct(contract.productKey ?? null);

  if (annualPremium != null) {
    const nextAnnualPremium = finiteMoneyOrNull(entry.newAnnualPremium);
    const annualizedPreviousPremium =
      Math.round(annualPremium * paymentsPerYear * 100) / 100;
    const annualizedValueFitsNextPremiumBetter =
      entry.basePremiumPeriod === "payment" &&
      nextAnnualPremium != null &&
      Math.abs(nextAnnualPremium - annualizedPreviousPremium) +
        PREMIUM_CHANGE_TOLERANCE <
        Math.abs(nextAnnualPremium - annualPremium);
    const isLegacyPaymentValueStoredAsAnnual =
      statementBaseIsPayment &&
      paymentsPerYear > 1 &&
      premium != null &&
      Math.abs(annualPremium - premium) <= PREMIUM_CHANGE_TOLERANCE &&
      (entry.basePremiumPeriod == null ||
        annualizedValueFitsNextPremiumBetter);
    return isLegacyPaymentValueStoredAsAnnual
      ? annualizedPreviousPremium
      : annualPremium;
  }

  if (premium == null) return null;
  return entry.basePremiumPeriod === "payment" ||
    (entry.basePremiumPeriod == null && statementBaseIsPayment)
    ? Math.round(premium * paymentsPerYear * 100) / 100
    : premium;
};

const autoPremiumStatementBasePeriod = (
  productKey: Product | null | undefined
): "annual" | "payment" =>
  isAnnualAutoPayoutProduct(productKey) ? "annual" : "payment";

const nonLifePremiumStatementBasePeriod = (
  row: PremiumStatementRow,
  contract: PremiumHistoryContract
): "annual" | "payment" => {
  const productKey = row.productKey ?? contract.productKey ?? null;
  if (isAnnualAutoPayoutProduct(productKey)) return "annual";

  const base = Math.round(row.basePremium * 100) / 100;
  const currentPaymentPremium = contractCurrentPremium(contract);
  const paymentsPerYear = contractPaymentPeriodsPerYear(contract);
  if (
    base <= 0 ||
    currentPaymentPremium == null ||
    currentPaymentPremium <= 0 ||
    paymentsPerYear <= 1
  ) {
    return autoPremiumStatementBasePeriod(productKey);
  }

  const paymentDifference = Math.abs(base - currentPaymentPremium);
  const annualDifference = Math.abs(base - currentPaymentPremium * paymentsPerYear);
  return annualDifference <= paymentDifference ? "annual" : "payment";
};

const statementAnnualBase = (
  row: PremiumStatementRow,
  contract: PremiumHistoryContract
): number => {
  const base = Math.round(row.basePremium * 100) / 100;
  if (nonLifePremiumStatementBasePeriod(row, contract) === "annual") return base;
  return Math.round(base * contractPaymentPeriodsPerYear(contract) * 100) / 100;
};

const autoPremiumBeforeStatement = (
  contract: PremiumHistoryContract,
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
      dateMs: premiumHistoryEntryDateMs(entry),
      newPremium: annualPremiumFromStoredHistoryEntry(entry, contract),
      previousPremium: previousAnnualPremiumFromStoredHistoryEntry(entry, contract),
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

    const earliestKnownPrevious = history.find((item) => item.previousPremium != null);
    if (earliestKnownPrevious?.previousPremium != null) {
      return earliestKnownPrevious.previousPremium;
    }

    return null;
  }

  return (
    history.at(-1)?.newPremium ??
    (allowCurrentFallback ? contractCurrentAutoAnnualPremium(contract) : null)
  );
};

const isoDateFromMs = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

export const premiumHistoryEntryFromStatementRow = ({
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
  row: PremiumStatementRow;
  contract: PremiumHistoryContract;
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
}): PremiumStatementHistoryEntry | null => {
  if (row.premiumKind === "life_increase") {
    // U životních produktů je základna NV/NB řádku pouze podklad pro
    // výpočet provize. Není to nové pojistné a nesmí vytvářet změnu smlouvy.
    return null;
  }

  if (!isAutoProduct(contract.productKey ?? null) && !isPropertyProduct(contract.productKey ?? null)) {
    return null;
  }
  if (row.productKey && contract.productKey && row.productKey !== contract.productKey) return null;

  if (row.premiumKind === "auto_initial") {
    const policyStartMs =
      toMillis(contract.policyStartDate) ??
      parseCzechDate(row.validFrom) ??
      parseCzechDate(row.signedAt) ??
      periodEndMs ??
      statementChronologyMs ??
      nowMs;
    const basePremiumPeriod = nonLifePremiumStatementBasePeriod(row, contract);
    const annualPremium = statementAnnualBase(row, contract);
    const paymentPremium =
      basePremiumPeriod === "annual"
        ? Math.round((annualPremium / contractPaymentPeriodsPerYear(contract)) * 100) / 100
        : Math.round(row.basePremium * 100) / 100;
    if (annualPremium <= 0 || paymentPremium <= 0) return null;

    return {
      key: compactHash(
        [
          statementId,
          row.premiumKind,
          row.rowId,
          row.contractNumber,
          row.productCode,
          row.commissionCode,
          row.basePremium,
          basePremiumPeriod,
          isoDateFromMs(policyStartMs),
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
      anniversaryDate: isoDateFromMs(policyStartMs),
      previousPremium: null,
      newPremium: paymentPremium,
      difference: null,
      previousAnnualPremium: null,
      newAnnualPremium: annualPremium,
      differenceAnnual: null,
      basePremiumPeriod,
      productCode: row.productCode,
      commissionCode: row.commissionCode || null,
      rowId: row.rowId,
      validFrom: row.validFrom,
      source: row.source,
      writtenAtMs: nowMs,
      writtenBy,
    };
  }

  if (
    isAutoProduct(contract.productKey ?? null) &&
    !isAutoSubsequentCommissionCode(row.commissionCode)
  ) {
    return null;
  }

  const policyStartMs = parseCzechDate(row.validFrom) ?? toMillis(contract.policyStartDate);
  if (policyStartMs == null) return null;

  const scheduleFrequency = isAnnualAutoPayoutProduct(row.productKey ?? contract.productKey ?? null)
    ? "annual"
    : contract.frequencyRaw;
  const anniversaryNumber = anniversaryNumberFromInstallmentCommissionCode(
    row.commissionCode,
    scheduleFrequency
  );
  if (anniversaryNumber == null) return null;

  const anniversaryDateMs = addUtcYearsClamped(policyStartMs, anniversaryNumber);
  if (anniversaryDateMs == null) return null;

  const basePremiumPeriod = nonLifePremiumStatementBasePeriod(row, contract);
  const annualPremium = statementAnnualBase(row, contract);
  const previousAnnualPremium = autoPremiumBeforeStatement(
    contract,
    anniversaryDateMs,
    { allowCurrentFallback: allowCurrentPremiumFallback }
  );
  const annualDifference =
    previousAnnualPremium == null
      ? null
      : Math.round((annualPremium - previousAnnualPremium) * 100) / 100;
  if (annualDifference != null && Math.abs(annualDifference) <= PREMIUM_CHANGE_TOLERANCE) {
    return null;
  }
  const paymentsPerYearValue = contractPaymentPeriodsPerYear(contract);
  const paymentPremium = Math.round((annualPremium / paymentsPerYearValue) * 100) / 100;
  const previousPaymentPremium =
    previousAnnualPremium == null
      ? null
      : Math.round((previousAnnualPremium / paymentsPerYearValue) * 100) / 100;
  const paymentDifference =
    previousPaymentPremium == null
      ? null
      : Math.round((paymentPremium - previousPaymentPremium) * 100) / 100;

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
        anniversaryNumber,
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
    anniversaryNumber,
    anniversaryDate: isoDateFromMs(anniversaryDateMs),
    previousPremium: previousPaymentPremium,
    newPremium: paymentPremium,
    difference: paymentDifference,
    previousAnnualPremium,
    newAnnualPremium: annualPremium,
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

const premiumHistoryMoneyKey = (value: unknown): string => {
  const amount = finiteMoneyOrNull(value);
  return amount == null ? "" : String(Math.round(amount * 100));
};

const premiumHistorySemanticKey = (entry: PremiumStatementHistoryEntry): string =>
  [
    entry.premiumKind,
    entry.source,
    commissionStatementIdentityKey(entry),
    entry.rowId,
    entry.anniversaryNumber,
    entry.anniversaryDate,
    entry.productCode,
    normalizeCommissionCodeKey(entry.commissionCode),
    premiumHistoryMoneyKey(entry.previousAnnualPremium ?? entry.previousPremium),
    premiumHistoryMoneyKey(entry.newAnnualPremium ?? entry.newPremium),
    premiumHistoryMoneyKey(entry.differenceAnnual ?? entry.difference),
  ].join("::");

const premiumHistoryRowIdentityKey = (entry: PremiumStatementHistoryEntry): string =>
  [
    entry.premiumKind,
    entry.source,
    commissionStatementIdentityKey(entry),
    entry.rowId,
    entry.anniversaryNumber,
    entry.anniversaryDate,
    entry.productCode,
    normalizeCommissionCodeKey(entry.commissionCode),
  ].join("::");

const premiumHistoryCompletenessScore = (
  entry: PremiumStatementHistoryEntry
): number => {
  let score = 0;
  if (entry.basePremiumPeriod) score += 20;
  if (entry.previousAnnualPremium != null) score += 10;
  if (entry.newAnnualPremium != null) score += 10;
  if (entry.differenceAnnual != null) score += 10;
  if (entry.statementChronologyMs != null) score += 4;
  if (entry.payoutMonthKey) score += 2;
  return score;
};

const preferPremiumHistoryCandidate = (
  candidate: PremiumStatementHistoryEntry,
  current: PremiumStatementHistoryEntry
): boolean => {
  if (
    candidate.premiumKind === "auto_initial" &&
    current.premiumKind === "auto_initial"
  ) {
    const candidateInitial = finiteMoneyOrNull(candidate.newPremium);
    const currentInitial = finiteMoneyOrNull(current.newPremium);
    if (
      candidateInitial != null &&
      currentInitial != null &&
      Math.abs(candidateInitial - currentInitial) > PREMIUM_CHANGE_TOLERANCE
    ) {
      return (candidate.writtenAtMs ?? 0) < (current.writtenAtMs ?? 0);
    }
  }

  const candidateScore = premiumHistoryCompletenessScore(candidate);
  const currentScore = premiumHistoryCompletenessScore(current);
  if (candidateScore !== currentScore) return candidateScore > currentScore;
  return (candidate.writtenAtMs ?? 0) > (current.writtenAtMs ?? 0);
};

const premiumHistorySortMs = (entry: PremiumStatementHistoryEntry): number =>
  premiumHistoryEntryDateMs(entry) ??
  premiumHistoryEntryChronologyMs(entry) ??
  (typeof entry.writtenAtMs === "number" && Number.isFinite(entry.writtenAtMs)
    ? entry.writtenAtMs
    : 0);

export const mergePremiumHistoryRecords = (
  existing: PremiumStatementHistoryEntry[],
  incoming: PremiumStatementHistoryEntry[],
  maxCount: number
): {
  merged: PremiumStatementHistoryEntry[];
  added: number;
  existingCount: number;
  updatedExisting: number;
} => {
  const recordsBySemanticKey = new Map<string, PremiumStatementHistoryEntry>();
  const semanticKeyByRecordKey = new Map<string, string>();
  const semanticKeyByRowIdentity = new Map<string, string>();
  const order: string[] = [];
  let updatedExisting = 0;

  for (const item of existing) {
    const semanticKey = premiumHistorySemanticKey(item) || item.key;
    const rowIdentityKey = premiumHistoryRowIdentityKey(item);
    const existingSemanticKey = semanticKeyByRowIdentity.get(rowIdentityKey);
    const lookupKey = existingSemanticKey ?? semanticKey;
    const current = recordsBySemanticKey.get(lookupKey);
    if (!current) {
      recordsBySemanticKey.set(semanticKey, item);
      order.push(semanticKey);
      semanticKeyByRecordKey.set(item.key, semanticKey);
      semanticKeyByRowIdentity.set(rowIdentityKey, semanticKey);
      continue;
    }
    updatedExisting += 1;
    if (preferPremiumHistoryCandidate(item, current)) {
      if (lookupKey !== semanticKey) {
        recordsBySemanticKey.delete(lookupKey);
        const orderIndex = order.indexOf(lookupKey);
        if (orderIndex >= 0) order[orderIndex] = semanticKey;
      }
      recordsBySemanticKey.set(semanticKey, item);
      semanticKeyByRecordKey.set(current.key, semanticKey);
      semanticKeyByRecordKey.set(item.key, semanticKey);
      semanticKeyByRowIdentity.set(rowIdentityKey, semanticKey);
    } else {
      semanticKeyByRecordKey.set(item.key, lookupKey);
      semanticKeyByRowIdentity.set(rowIdentityKey, lookupKey);
    }
  }

  let added = 0;
  let existingCount = 0;
  for (const item of incoming) {
    const semanticKey = premiumHistorySemanticKey(item) || item.key;
    const rowIdentityKey = premiumHistoryRowIdentityKey(item);
    const existingSemanticKey =
      semanticKeyByRecordKey.get(item.key) ?? semanticKeyByRowIdentity.get(rowIdentityKey);
    const lookupKey = existingSemanticKey ?? semanticKey;
    const current = recordsBySemanticKey.get(lookupKey);
    if (!current) {
      recordsBySemanticKey.set(semanticKey, item);
      order.push(semanticKey);
      semanticKeyByRecordKey.set(item.key, semanticKey);
      semanticKeyByRowIdentity.set(rowIdentityKey, semanticKey);
      added += 1;
      continue;
    }

    existingCount += 1;
    if (preferPremiumHistoryCandidate(item, current)) {
      if (lookupKey !== semanticKey) {
        recordsBySemanticKey.delete(lookupKey);
        const orderIndex = order.indexOf(lookupKey);
        if (orderIndex >= 0) order[orderIndex] = semanticKey;
      }
      recordsBySemanticKey.set(semanticKey, item);
      semanticKeyByRecordKey.set(current.key, semanticKey);
      semanticKeyByRecordKey.set(item.key, semanticKey);
      semanticKeyByRowIdentity.set(rowIdentityKey, semanticKey);
      updatedExisting += 1;
    }
  }

  const merged = order
    .map((key) => recordsBySemanticKey.get(key))
    .filter((item): item is PremiumStatementHistoryEntry => Boolean(item))
    .sort(
      (a, b) =>
        premiumHistorySortMs(a) - premiumHistorySortMs(b) ||
        (a.writtenAtMs ?? 0) - (b.writtenAtMs ?? 0)
    )
    .slice(-maxCount);
  return { merged, added, existingCount, updatedExisting };
};
