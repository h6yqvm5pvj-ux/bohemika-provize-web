import { isInheritedContract } from "@/app/lib/inheritedContracts";

import {
  type CommissionMode,
  type PaymentFrequency,
  type Position,
  type Product,
} from "../types/domain";
import { totalWithMultipliers } from "../lib/commissionTotals";
import { computeLegacyFrequencyOverrideTotal } from "../lib/managerOverrideTotals";
import { generateCashflow } from "./generator";
import {
  CASHFLOW_FORECAST_YEARS,
  matchesProductFilter,
  stripTotalRows,
} from "./helpers";
import {
  addSubscriptionMonths,
  formatSubscriptionIsoDay,
  isCashflowSubscriptionPlan,
  isSubscriptionCashflowOwner,
  parseSubscriptionIsoDay,
  subscriptionIntervalMonths,
  subscriptionPeriodUntilIso,
  subscriptionPlanLabel,
  type CashflowSubscriptionPlan,
} from "./subscriptionCashflow";
import type {
  CashflowItem,
  EntryDoc,
  ProductFilter,
  ScopeFilter,
} from "./types";

export type TipPayoutApiItem = {
  id?: string;
  payoutDate?: number | null;
  amount?: number;
  note?: string | null;
  productKey?: Product | null;
  frequencyRaw?: PaymentFrequency | null;
  tipsterPercent?: number | null;
  clientName?: string | null;
  sourceOwnerName?: string | null;
  sourceOwnerEmail?: string | null;
  adviserEmail?: string | null;
};

export type SubscriptionPaymentApiItem = {
  id?: string;
  userEmail?: string | null;
  userName?: string | null;
  plan?: CashflowSubscriptionPlan | string | null;
  amountCzk?: number | null;
  periodFrom?: string | null;
  periodUntil?: string | null;
  createdAtMs?: number | null;
  paymentDateMs?: number | null;
  note?: string | null;
};

export type CashflowSnapshot = {
  email: string;
  myPosition: Position | null;
  myCommissionMode: CommissionMode | null;
  hasAnyTeam: boolean;
  ownEntries: EntryDoc[];
  teamEntriesRaw: EntryDoc[];
  tipPayouts: TipPayoutApiItem[];
  subscriptionPayments: SubscriptionPaymentApiItem[];
};

export type CashflowComputationOptions = {
  scopeFilter: ScopeFilter;
  productFilter: ProductFilter;
  tipsterMode?: boolean;
  asOf?: Date;
};

const SUBSCRIPTION_FORECAST_YEARS = 10;

const normalizeEmail = (value: string | null | undefined): string =>
  (value ?? "").trim().toLowerCase();

const nameFromEmail = (email: string | null | undefined): string | null => {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const local = normalized.split("@")[0] ?? "";
  const parts = local.split(/[.\-_]+/).filter(Boolean);
  if (parts.length === 0) return null;
  return parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
};

type NormalizedSubscriptionPayment = {
  sourceId: string;
  plan: CashflowSubscriptionPlan;
  amount: number;
  paymentDate: Date;
  anchorDate: Date;
  userEmail: string | null;
  userName: string;
  periodFrom: string | null;
  periodUntil: string | null;
  note: string | null;
};

const subscriptionOccurrenceKey = (
  userKey: string,
  plan: CashflowSubscriptionPlan,
  periodFrom: string
): string => `${userKey}|${plan}|${periodFrom}`;

const validTimestampDate = (value: unknown): Date | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const normalizeSubscriptionPaymentForCashflow = (
  payment: SubscriptionPaymentApiItem,
  index: number
): NormalizedSubscriptionPayment | null => {
  const plan = isCashflowSubscriptionPlan(payment.plan) ? payment.plan : null;
  if (!plan) return null;

  const amount =
    typeof payment.amountCzk === "number" && Number.isFinite(payment.amountCzk)
      ? payment.amountCzk
      : 0;
  if (!(amount > 0)) return null;

  const periodFromDate = parseSubscriptionIsoDay(payment.periodFrom);
  const paymentDate =
    validTimestampDate(payment.paymentDateMs) ??
    validTimestampDate(payment.createdAtMs) ??
    periodFromDate;
  if (!paymentDate) return null;

  const anchorDate = periodFromDate ?? paymentDate;
  const periodFrom = periodFromDate ? formatSubscriptionIsoDay(periodFromDate) : null;
  const periodUntil =
    typeof payment.periodUntil === "string" && payment.periodUntil.trim()
      ? payment.periodUntil.trim()
      : null;
  const userEmail = normalizeEmail(payment.userEmail) || null;
  const userName =
    typeof payment.userName === "string" && payment.userName.trim()
      ? payment.userName.trim()
      : nameFromEmail(userEmail) ?? userEmail ?? "Uživatel";
  const sourceId =
    String(payment.id ?? "").trim() ||
    `subscription-${userEmail ?? "user"}-${anchorDate.getTime()}-${index}`;
  const note =
    typeof payment.note === "string" && payment.note.trim()
      ? payment.note.trim()
      : null;

  return {
    sourceId,
    plan,
    amount,
    paymentDate,
    anchorDate,
    userEmail,
    userName,
    periodFrom,
    periodUntil,
    note,
  };
};

/** Shared by the browser and server; the supplied snapshot is never mutated. */
export function computeCashflow(
  snapshot: CashflowSnapshot,
  { scopeFilter, productFilter, tipsterMode = false, asOf = new Date() }: CashflowComputationOptions
): CashflowItem[] {
  const email = snapshot.email;
  const entryWasTransferred = (entry: EntryDoc): boolean => {
    if (isInheritedContract(entry)) return true;
    const originalOwner = normalizeEmail(entry.originalAdviserEmail);
    const currentOwner = normalizeEmail(
      entry.servicingOwnerEmail ?? entry.commissionOwnerEmail ?? entry.userEmail
    );
    return Boolean(
      originalOwner && currentOwner && originalOwner !== currentOwner
    );
  };
  const transferredContractPosition = (entry: EntryDoc): Position | null =>
    (entry.originalPosition as Position | null | undefined) ??
    (entry.position as Position | null | undefined) ??
    null;
  const predictionModeForEntry = (
    entry: EntryDoc,
    source: "own" | "manager"
  ): CommissionMode =>
    source === "manager" && matchesProductFilter(entry.productKey, "life")
      ? "standard"
      : (entryWasTransferred(entry)
          ? (entry.commissionMode as CommissionMode | null | undefined) ??
            (entry.mode as CommissionMode | null | undefined)
          : snapshot.myCommissionMode) ??
        (entry.commissionMode as CommissionMode | null | undefined) ??
        (entry.mode as CommissionMode | null | undefined) ??
        "standard";
  const currentOwnerPosition = (entry: EntryDoc): Position | null =>
    (entry.ownerCurrentPosition as Position | null | undefined) ??
    (entry.effectivePosition as Position | null | undefined) ??
    (entry.timelinePosition as Position | null | undefined) ??
    (entry.position as Position | null | undefined) ??
    null;
  const allEntriesByKey = new Map<string, EntryDoc>();
  const pushEntry = (entry: EntryDoc) => {
    const ownerEmail = normalizeEmail(entry.userEmail);
    const docId = String(entry.id ?? "").trim();
    if (!ownerEmail || !docId) return;
    const key = `${ownerEmail}___${docId}`;
    if (allEntriesByKey.has(key)) return;
    allEntriesByKey.set(key, {
      ...(entry as any),
      id: docId,
      userEmail: ownerEmail,
    });
  };

  snapshot.ownEntries.forEach(pushEntry);
  snapshot.teamEntriesRaw.forEach(pushEntry);

  const allEntries = Array.from(allEntriesByKey.values());
  const ownEntries = allEntries
    .filter((entry) => (entry.userEmail ?? "").toLowerCase() === email)
    .map((entry) => ({
      ...entry,
      source: "own" as const,
      predictionPosition:
        (entryWasTransferred(entry)
          ? transferredContractPosition(entry)
          : snapshot.myPosition) ??
        (entry.effectivePosition as Position | null | undefined) ??
        (entry.timelinePosition as Position | null | undefined) ??
        (entry.position as Position | null | undefined) ??
        null,
      predictionBaselinePosition: null,
      predictionCommissionMode: predictionModeForEntry(entry, "own"),
    }));
  const teamRaw = snapshot.teamEntriesRaw;

  const overrides: EntryDoc[] = [];
  if (teamRaw.length > 0) {
    for (const entry of teamRaw) {
      const storedOverride =
        (entry.managerOverrides as EntryDoc["managerOverrides"])?.find(
          (override) => (override.email ?? "").toLowerCase() === email
        ) ?? null;

      if (!storedOverride) continue;

      const storedOverrideItems = stripTotalRows(storedOverride.items ?? []);
      const storedOverrideTotal = computeLegacyFrequencyOverrideTotal({
        productKey: (entry.productKey as Product | null | undefined) ?? null,
        frequencyRaw: (entry.frequencyRaw as PaymentFrequency | null | undefined) ?? null,
        items: storedOverrideItems,
        fallbackTotal: totalWithMultipliers(storedOverrideItems),
      });
      if (storedOverrideItems.length === 0 || storedOverrideTotal <= 0) continue;

      const storedOverridePosition =
        (storedOverride.position as Position | null | undefined) ??
        (entry.managerPositionSnapshot as Position | null | undefined) ??
        null;

      overrides.push({
        ...entry,
        originalEntryId: entry.id,
        id: `${entry.id}-override`,
        items: storedOverrideItems,
        total: storedOverrideTotal,
        source: "manager",
        position: storedOverridePosition ?? null,
        predictionPosition: snapshot.myPosition ?? storedOverridePosition ?? null,
        predictionBaselinePosition: currentOwnerPosition(entry),
        predictionCommissionMode: predictionModeForEntry(entry, "manager"),
        managerPositionSnapshot: storedOverridePosition ?? null,
        managerModeSnapshot:
          (storedOverride.commissionMode as EntryDoc["managerModeSnapshot"]) ??
          (entry.managerModeSnapshot as EntryDoc["managerModeSnapshot"]) ??
          null,
        clientName: entry.clientName ?? null,
      });
    }
  }

  let entriesForCashflow: EntryDoc[] = [];
  if (scopeFilter === "own") {
    entriesForCashflow = ownEntries;
  } else if (scopeFilter === "team") {
    entriesForCashflow = overrides;
  } else {
    entriesForCashflow = [...ownEntries, ...overrides];
  }

  if (tipsterMode || productFilter === "tip") {
    entriesForCashflow = [];
  } else if (productFilter !== "all") {
    entriesForCashflow = entriesForCashflow.filter((entry) => {
      return matchesProductFilter(entry.productKey, productFilter);
    });
  }

  const generatedCashflow = generateCashflow(
    entriesForCashflow,
    CASHFLOW_FORECAST_YEARS,
    email,
    asOf
  );
  const includeTipPayouts =
    tipsterMode ||
    productFilter === "tip" ||
    (productFilter === "all" && scopeFilter !== "team");
  const tipCashflowItems: CashflowItem[] = includeTipPayouts
    ? snapshot.tipPayouts.reduce<CashflowItem[]>((acc, payout, index) => {
        const payoutTs =
          typeof payout.payoutDate === "number" && Number.isFinite(payout.payoutDate)
            ? payout.payoutDate
            : null;
        if (payoutTs == null) return acc;
        const payoutDate = new Date(payoutTs);
        if (Number.isNaN(payoutDate.getTime())) return acc;

        const amount =
          typeof payout.amount === "number" && Number.isFinite(payout.amount)
            ? payout.amount
            : 0;
        if (!(amount > 0)) return acc;

        const productKey =
          typeof payout.productKey === "string" && payout.productKey.trim()
            ? (payout.productKey as Product)
            : "unknown";
        const tipSourceAdviserEmail =
          normalizeEmail(payout.sourceOwnerEmail ?? payout.adviserEmail) || null;
        const tipSourceAdviserName =
          typeof payout.sourceOwnerName === "string" && payout.sourceOwnerName.trim()
            ? payout.sourceOwnerName.trim()
            : nameFromEmail(tipSourceAdviserEmail);
        const clientName =
          typeof payout.clientName === "string" && payout.clientName.trim()
            ? payout.clientName.trim()
            : null;
        const note =
          typeof payout.note === "string" && payout.note.trim()
            ? payout.note.trim()
            : "TIP provize";
        const id = String(payout.id ?? "").trim() || `tip-${payoutTs}-${index}`;

        acc.push({
          id: `tip-${id}`,
          date: payoutDate,
          amount,
          productKey,
          note,
          frequency: (payout.frequencyRaw as PaymentFrequency | null | undefined) ?? null,
          source: "own",
          contractNumber: null,
          clientName,
          ownerEmail: null,
          entryId: null,
          isTipPayout: true,
          tipSourceAdviserEmail,
          tipSourceAdviserName,
        });
        return acc;
      }, [])
    : [];
  const includeSubscriptionPayments =
    isSubscriptionCashflowOwner(email) &&
    !tipsterMode &&
    scopeFilter !== "team" &&
    (productFilter === "all" || productFilter === "subscription");
  const subscriptionCashflowItems: CashflowItem[] = includeSubscriptionPayments
    ? (() => {
        const normalizedPayments = snapshot.subscriptionPayments
          .map((payment, index) =>
            normalizeSubscriptionPaymentForCashflow(payment, index)
          )
          .filter((payment): payment is NormalizedSubscriptionPayment =>
            Boolean(payment)
          );

        const actualOccurrenceKeys = new Set<string>();
        const latestPaymentByUser = new Map<string, NormalizedSubscriptionPayment>();
        const items: CashflowItem[] = [];

        normalizedPayments.forEach((payment) => {
          const userKey = payment.userEmail ?? payment.sourceId;
          const actualPeriodFrom =
            payment.periodFrom ?? formatSubscriptionIsoDay(payment.anchorDate);
          actualOccurrenceKeys.add(
            subscriptionOccurrenceKey(userKey, payment.plan, actualPeriodFrom)
          );

          const existingLatest = latestPaymentByUser.get(userKey);
          if (
            !existingLatest ||
            payment.anchorDate.getTime() > existingLatest.anchorDate.getTime() ||
            (
              payment.anchorDate.getTime() === existingLatest.anchorDate.getTime() &&
              payment.paymentDate.getTime() > existingLatest.paymentDate.getTime()
            )
          ) {
            latestPaymentByUser.set(userKey, payment);
          }

          const periodLabel =
            payment.periodFrom && payment.periodUntil
              ? ` (${payment.periodFrom} - ${payment.periodUntil})`
              : "";
          const note =
            payment.note ??
            `${subscriptionPlanLabel(payment.plan)} předplatné${periodLabel}`;

          items.push({
            id: `subscription-${payment.sourceId}`,
            date: payment.paymentDate,
            amount: payment.amount,
            productKey: "subscription",
            note,
            frequency: null,
            source: "own",
            contractNumber: null,
            clientName: payment.userName,
            ownerEmail: null,
            entryId: null,
            commissionLabel: "Platba předplatného",
            isSubscriptionPayment: true,
            subscriptionPlan: payment.plan,
            subscriptionUserEmail: payment.userEmail,
            subscriptionUserName: payment.userName,
            subscriptionPeriodFrom: payment.periodFrom,
            subscriptionPeriodUntil: payment.periodUntil,
            payoutStatus: "paid",
          });
        });

        const forecastHorizonEnd = new Date(asOf);
        forecastHorizonEnd.setFullYear(
          forecastHorizonEnd.getFullYear() + SUBSCRIPTION_FORECAST_YEARS
        );

        latestPaymentByUser.forEach((payment, userKey) => {
          const intervalMonths = subscriptionIntervalMonths(payment.plan);
          let occurrenceDate = addSubscriptionMonths(payment.anchorDate, intervalMonths);

          for (let guard = 0; guard < SUBSCRIPTION_FORECAST_YEARS * 12; guard += 1) {
            if (occurrenceDate > forecastHorizonEnd) break;

            const periodFrom = formatSubscriptionIsoDay(occurrenceDate);
            const occurrenceKey = subscriptionOccurrenceKey(
              userKey,
              payment.plan,
              periodFrom
            );
            const periodUntil = subscriptionPeriodUntilIso(
              occurrenceDate,
              payment.plan
            );

            if (!actualOccurrenceKeys.has(occurrenceKey)) {
              items.push({
                id: `subscription-${payment.sourceId}-forecast-${periodFrom}`,
                date: occurrenceDate,
                amount: payment.amount,
                productKey: "subscription",
                note: `${subscriptionPlanLabel(payment.plan)} předplatné (${periodFrom} - ${periodUntil})`,
                frequency: null,
                source: "own",
                contractNumber: null,
                clientName: payment.userName,
                ownerEmail: null,
                entryId: null,
                commissionLabel: "Platba předplatného",
                isSubscriptionPayment: true,
                subscriptionPlan: payment.plan,
                subscriptionUserEmail: payment.userEmail,
                subscriptionUserName: payment.userName,
                subscriptionPeriodFrom: periodFrom,
                subscriptionPeriodUntil: periodUntil,
                payoutStatus: "predicted",
              });
            }

            occurrenceDate = addSubscriptionMonths(occurrenceDate, intervalMonths);
          }
        });

        return items;
      })()
    : [];
  const cashflow = [...generatedCashflow, ...tipCashflowItems, ...subscriptionCashflowItems].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );
  return cashflow;
}
