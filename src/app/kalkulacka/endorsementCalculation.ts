import { calculateCommission } from "@/app/lib/calculateCommission";
import { calculateNeonDecreaseStornoBase } from "@/app/lib/productFormulas/neon";
import { toDate, formatMoney } from "@/app/lib/formatters";
import type {
  CommissionMode,
  CommissionResultDTO,
  CommissionResultItemDTO,
  MaxCizinKomplexVariant,
  PaymentFrequency,
  Position,
  Product,
} from "@/app/types/domain";

import type { ContractsFindApiResponse } from "./calculatorApi";
import {
  POSITION_ORDER,
  compareSourceEntriesByRecency,
  entryPathFromContractOwner,
  isImmediateCommissionTitle,
  isIsoDay,
  normalizeEmailValue,
  normalizedDurationMonths,
  normalizedDurationYears,
  resolveEffectivePremium,
  roundToCents,
  shouldShowDuration,
  shouldShowDurationMonths,
  type EndorsementChangeType,
  type EndorsementDraft,
  type EndorsementSourceEntry,
} from "./calculatorHelpers";

type ContractsFindEntry = NonNullable<ContractsFindApiResponse["contracts"]>[number];

export const contractOwnerEmail = (entry: ContractsFindEntry): string =>
  normalizeEmailValue(entry.userEmail) || normalizeEmailValue(entry.adviserEmail);

export const dateToIsoDay = (date: Date | null | undefined): string | null => {
  if (!date || Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const isoDayToLocalDate = (value: string | null | undefined): Date | null => {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
};

const completedCalendarMonthsBetween = (
  startDate: Date | null | undefined,
  endDate: Date | null | undefined
): number | null => {
  if (
    !startDate ||
    !endDate ||
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(endDate.getTime()) ||
    endDate.getTime() <= startDate.getTime()
  ) {
    return null;
  }
  let months =
    (endDate.getFullYear() - startDate.getFullYear()) * 12 +
    (endDate.getMonth() - startDate.getMonth());
  if (endDate.getDate() < startDate.getDate()) {
    months -= 1;
  }
  return Math.max(0, months);
};

export const durationYearsFromDates = (
  startDate: Date | null | undefined,
  endDate: Date | null | undefined
): number | null => {
  if (
    !startDate ||
    !endDate ||
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(endDate.getTime()) ||
    endDate.getTime() <= startDate.getTime()
  ) {
    return null;
  }
  const diffYears =
    (endDate.getTime() - startDate.getTime()) / (365.2425 * 24 * 60 * 60 * 1000);
  if (!Number.isFinite(diffYears) || diffYears <= 0) return null;
  return Math.max(1, Math.ceil(diffYears));
};

export const finitePositiveDuration = (value: unknown): number | null => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.floor(num);
};

export const durationYearsLabel = (years: number | null | undefined): string | null => {
  if (years == null) return null;
  if (years === 1) return "1 rok";
  if (years >= 2 && years <= 4) return `${years} roky`;
  return `${years} let`;
};

export const buildEndorsementSourceEntries = (
  contracts: ContractsFindEntry[],
  targetProduct: Product
): EndorsementSourceEntry[] =>
  contracts
    .map((entry) => {
      const entryId = typeof entry.id === "string" ? entry.id.trim() : "";
      if (!entryId) return null;
      const ownerEmail = contractOwnerEmail(entry);
      const policyStartDate = toDate(entry?.policyStartDate);
      const policyEndDate = toDate(entry?.policyEndDate);
      const storedDurationYears = finitePositiveDuration(entry?.durationYears);
      return {
        id: entryId,
        path: entryPathFromContractOwner(ownerEmail, entryId),
        productKey: (entry?.productKey as Product | undefined) ?? null,
        position: POSITION_ORDER.includes(entry?.position as Position)
          ? (entry?.position as Position)
          : null,
        commissionMode:
          entry?.commissionMode === "standard" || entry?.commissionMode === "accelerated"
            ? entry.commissionMode
            : null,
        rootContractEntryId:
          (typeof entry?.rootContractEntryId === "string"
            ? entry.rootContractEntryId
            : null) ?? null,
        effectiveInputAmount: resolveEffectivePremium(entry),
        durationYears:
          storedDurationYears ?? durationYearsFromDates(policyStartDate, policyEndDate),
        durationMonths: finitePositiveDuration(entry?.durationMonths),
        policyStartDate,
        policyEndDate,
        contractSignedDate: toDate(entry?.contractSignedDate),
        createdAt: toDate(entry?.createdAt),
        items: Array.isArray(entry?.result?.items)
          ? entry.result.items
          : Array.isArray(entry?.items)
            ? entry.items
            : [],
      };
    })
    .filter((entry): entry is EndorsementSourceEntry => Boolean(entry))
    .filter((entry) => entry.productKey === targetProduct)
    .sort(compareSourceEntriesByRecency);

export const resolveRemainingEndorsementDurationYears = (
  source: EndorsementSourceEntry | null,
  targetProduct: Product,
  endorsementPolicyStartDateIso: string
): number | null => {
  if (!source || !shouldShowDuration(targetProduct)) return null;
  const effectiveDate =
    isoDayToLocalDate(endorsementPolicyStartDateIso) ??
    toDate(endorsementPolicyStartDateIso);
  if (!effectiveDate) return null;

  const remainingByEndDate = durationYearsFromDates(effectiveDate, source.policyEndDate);
  if (remainingByEndDate != null) {
    return normalizedDurationYears(targetProduct, remainingByEndDate);
  }

  const sourceDurationYears = finitePositiveDuration(source.durationYears);
  const sourceStartDate = source.policyStartDate ?? source.contractSignedDate;
  const elapsedMonths = completedCalendarMonthsBetween(sourceStartDate, effectiveDate);
  if (sourceDurationYears != null && elapsedMonths != null) {
    const remainingMonths = sourceDurationYears * 12 - elapsedMonths;
    if (remainingMonths > 0) {
      return normalizedDurationYears(
        targetProduct,
        Math.max(1, Math.ceil(remainingMonths / 12))
      );
    }
    return null;
  }

  return sourceDurationYears == null
    ? null
    : normalizedDurationYears(targetProduct, sourceDurationYears);
};

export const resolveRemainingEndorsementDurationMonths = (
  source: EndorsementSourceEntry | null,
  targetProduct: Product,
  endorsementPolicyStartDateIso: string
): number | null => {
  if (!source || !shouldShowDurationMonths(targetProduct)) return null;
  const sourceDurationMonths = finitePositiveDuration(source.durationMonths);
  const effectiveDate =
    isoDayToLocalDate(endorsementPolicyStartDateIso) ??
    toDate(endorsementPolicyStartDateIso);
  if (!effectiveDate) return null;
  const sourceStartDate = source.policyStartDate ?? source.contractSignedDate;
  const elapsedMonths = completedCalendarMonthsBetween(sourceStartDate, effectiveDate);
  if (sourceDurationMonths != null && elapsedMonths != null) {
    const remainingMonths = sourceDurationMonths - elapsedMonths;
    if (remainingMonths > 0) {
      return normalizedDurationMonths(targetProduct, remainingMonths);
    }
    return null;
  }
  return sourceDurationMonths == null
    ? null
    : normalizedDurationMonths(targetProduct, sourceDurationMonths);
};

export const negativeImmediateCommissionResult = (
  result: CommissionResultDTO | null
): CommissionResultDTO | null => {
  if (!result) return null;
  const items = result.items
    .filter((item) => isImmediateCommissionTitle(item.title ?? ""))
    .map((item) => ({
      ...item,
      amount: -Math.abs(roundToCents(item.amount ?? 0)),
    }))
    .filter((item) => Math.abs(item.amount ?? 0) > 0);
  return {
    items,
    total: roundToCents(items.reduce((sum, item) => sum + (item.amount ?? 0), 0)),
  };
};

export const negativeImmediateCommissionResultFromSourceItems = ({
  sourceItems,
  previousPremiumAmount,
  calculationAmount,
}: {
  sourceItems: CommissionResultItemDTO[];
  previousPremiumAmount: number;
  calculationAmount: number;
}): CommissionResultDTO | null => {
  if (
    sourceItems.length === 0 ||
    previousPremiumAmount <= 0 ||
    calculationAmount <= 0
  ) {
    return null;
  }

  const ratio = calculationAmount / previousPremiumAmount;
  if (!Number.isFinite(ratio) || ratio <= 0) return null;

  const items = sourceItems
    .filter((item) => isImmediateCommissionTitle(item.title ?? ""))
    .map((item) => ({
      ...item,
      amount: -Math.abs(roundToCents((item.amount ?? 0) * ratio)),
    }))
    .filter((item) => Math.abs(item.amount ?? 0) > 0);
  if (items.length === 0) return null;

  return {
    items,
    total: roundToCents(items.reduce((sum, item) => sum + (item.amount ?? 0), 0)),
  };
};

type CommissionCalculationContext = {
  productKey: Product;
  position: Position | null;
  commissionMode: CommissionMode;
  contractSignedDateIso: string;
  inputAmount: number;
  frequency: PaymentFrequency;
  durationYears: number | null;
  durationMonths: number | null;
  maxCizinKomplexVariant: MaxCizinKomplexVariant | null;
  comfortPayment: number;
  comfortGradual: boolean;
  comfortTargetAmount: number;
};

const calculateEndorsementCommission = ({
  frequency,
  ...input
}: CommissionCalculationContext): CommissionResultDTO | null =>
  calculateCommission({
    ...input,
    frequencyRaw: frequency,
  });

export type PrepareEndorsementDraftInput = {
  source: EndorsementSourceEntry;
  targetProduct: Product;
  contractNumber: string;
  contractSignedDateIso: string;
  policyStartDateIso: string;
  newPremiumAmount: number;
  position: Position;
  commissionMode: CommissionMode;
  durationYears: number | null;
  durationMonths: number | null;
  durationManualOverride: boolean;
  frequency: PaymentFrequency;
  maxCizinKomplexVariant: MaxCizinKomplexVariant | null;
  comfortPayment: number;
  comfortGradual: boolean;
  comfortTargetAmount: number;
};

export type PrepareEndorsementDraftResult =
  | {
      ok: true;
      draft: EndorsementDraft;
      sourceDurationYears: number | null;
      sourceDurationMonths: number | null;
    }
  | {
      ok: false;
      message: string;
      showSaveMessage: boolean;
      sourceDurationYears: number | null;
      sourceDurationMonths: number | null;
    };

/**
 * Builds an endorsement draft without UI or network dependencies. Keeping this
 * calculation separate lets the preview and save workflow share the exact
 * same commission, duration and NEON-storno rules.
 */
export const prepareEndorsementDraft = ({
  source,
  targetProduct,
  contractNumber,
  contractSignedDateIso,
  policyStartDateIso,
  newPremiumAmount,
  position,
  commissionMode,
  durationYears,
  durationMonths,
  durationManualOverride,
  frequency,
  maxCizinKomplexVariant,
  comfortPayment,
  comfortGradual,
  comfortTargetAmount,
}: PrepareEndorsementDraftInput): PrepareEndorsementDraftResult => {
  const previousPremiumAmount = source.effectiveInputAmount;
  const deltaAmount = newPremiumAmount - previousPremiumAmount;
  const sourceDurationYears = resolveRemainingEndorsementDurationYears(
    source,
    targetProduct,
    policyStartDateIso
  );
  const sourceDurationMonths = resolveRemainingEndorsementDurationMonths(
    source,
    targetProduct,
    policyStartDateIso
  );
  const endorsementDurationYears =
    shouldShowDuration(targetProduct) && !durationManualOverride
      ? sourceDurationYears ?? durationYears ?? null
      : durationYears ?? null;
  const endorsementDurationMonths =
    shouldShowDurationMonths(targetProduct) && !durationManualOverride
      ? sourceDurationMonths ?? durationMonths ?? null
      : durationMonths ?? null;

  if (targetProduct === "maximaMaxEfekt" && endorsementDurationYears == null) {
    return {
      ok: false,
      showSaveMessage: true,
      sourceDurationYears,
      sourceDurationMonths,
      message:
        "Původní smlouva nemá uloženou dobu trvání. Klikni u doby trvání na Upravit a doplň ji ručně.",
    };
  }

  if (Math.abs(deltaAmount) < 0.01) {
    return {
      ok: false,
      showSaveMessage: false,
      sourceDurationYears,
      sourceDurationMonths,
      message: `Nové pojistné je stejné jako poslední uložená hodnota (${formatMoney(
        previousPremiumAmount
      )}).`,
    };
  }

  const changeType: EndorsementChangeType =
    deltaAmount > 0 ? "increase" : deltaAmount < 0 ? "decrease" : "same";
  let calculationAmount = Math.abs(deltaAmount);
  let items: CommissionResultItemDTO[] = [];
  let total = 0;

  if (changeType === "decrease" && targetProduct === "neon") {
    const originalStornoStartDateIso =
      dateToIsoDay(source.policyStartDate) ?? dateToIsoDay(source.contractSignedDate);
    const decreaseBase = calculateNeonDecreaseStornoBase({
      previousMonthlyPremium: previousPremiumAmount,
      newMonthlyPremium: newPremiumAmount,
      originalStornoStartDateIso,
      endorsementPolicyStartDateIso: policyStartDateIso,
    });
    if (!decreaseBase || !originalStornoStartDateIso || !isIsoDay(policyStartDateIso)) {
      return {
        ok: false,
        showSaveMessage: true,
        sourceDurationYears,
        sourceDurationMonths,
        message:
          "Nepodařilo se spočítat storno základnu pro snížení NEON dodatku. Zkontroluj počátek původní smlouvy a účinnost dodatku.",
      };
    }
    calculationAmount = decreaseBase.calculationMonthlyPremium;
    if (calculationAmount > 0) {
      const sourceResult = negativeImmediateCommissionResultFromSourceItems({
        sourceItems: source.items,
        previousPremiumAmount,
        calculationAmount,
      });
      const fallbackResult = calculateEndorsementCommission({
        productKey: targetProduct,
        position: source.position ?? position,
        commissionMode: source.commissionMode ?? commissionMode,
        contractSignedDateIso:
          dateToIsoDay(source.contractSignedDate) ?? contractSignedDateIso,
        inputAmount: calculationAmount,
        frequency,
        durationYears: endorsementDurationYears,
        durationMonths,
        maxCizinKomplexVariant,
        comfortPayment,
        comfortGradual,
        comfortTargetAmount,
      });
      const result = sourceResult ?? negativeImmediateCommissionResult(fallbackResult);
      items = result?.items ?? [];
      total = result?.total ?? 0;
    }
  } else if (changeType === "decrease") {
    calculationAmount = 0;
  } else if (calculationAmount > 0) {
    const result = calculateEndorsementCommission({
      productKey: targetProduct,
      position,
      commissionMode,
      contractSignedDateIso,
      inputAmount: calculationAmount,
      frequency,
      durationYears: endorsementDurationYears,
      durationMonths,
      maxCizinKomplexVariant,
      comfortPayment,
      comfortGradual,
      comfortTargetAmount,
    });
    items = result?.items ?? [];
    total = result?.total ?? 0;
  }

  return {
    ok: true,
    sourceDurationYears,
    sourceDurationMonths,
    draft: {
      productKey: targetProduct,
      contractNumber,
      contractSignedDate: contractSignedDateIso,
      sourceEntryId: source.id,
      sourceEntryPath: source.path,
      rootContractEntryId: source.rootContractEntryId ?? source.id,
      position,
      commissionMode,
      durationYears: endorsementDurationYears,
      durationMonths: endorsementDurationMonths,
      previousPremiumAmount,
      newPremiumAmount,
      deltaAmount,
      calculationAmount,
      changeType,
      items,
      total,
    },
  };
};
