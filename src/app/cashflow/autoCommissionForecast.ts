import { createAutoCommissionForecast } from "@/app/lib/autoCommissionForecast";
import { baseCommissionCodeForPayoutComparison } from "@/app/lib/commissionPayoutRules";
import { isAutoProduct } from "@/app/lib/productCatalog";
import { installmentCommissionScheduleFromCode } from "@/app/lib/productFormulas/autoCommission";
import { cashflowCommissionPayoutsForViewer } from "./generator";
import type { CashflowItem, EntryDoc } from "./types";

const key = (owner: string | null | undefined, id: string | null | undefined, source: string | undefined) =>
  JSON.stringify([owner?.trim().toLowerCase(), id, source ?? "own"]);

/** Keep contractual A schedules and actual receipts; forecast only the next known annual term. */
export function applyAutoCommissionForecasts(
  items: CashflowItem[], entries: EntryDoc[], viewerEmail?: string | null,
  { keepCoveredForStatementMatching = false }: { keepCoveredForStatementMatching?: boolean } = {},
): CashflowItem[] {
  const groups = new Map<string, CashflowItem[]>();
  for (const item of items) {
    const identity = key(item.ownerEmail, item.entryId, item.source);
    const group = groups.get(identity) ?? [];
    group.push(item); groups.set(identity, group);
  }
  const forecasts = new Map<string, {
    forecast: ReturnType<typeof createAutoCommissionForecast>;
    combinedItemId: string | undefined;
  }>();
  for (const entry of entries) {
    if (!isAutoProduct(entry.productKey)) continue;
    const identity = key(entry.userEmail, entry.originalEntryId ?? entry.id, entry.source);
    const scopedPayouts = cashflowCommissionPayoutsForViewer(entry, viewerEmail) ?? [];
    const byKey = new Map(scopedPayouts.filter(receipt => receipt.key).map(receipt => [receipt.key, receipt]));
    const received = (groups.get(identity) ?? []).filter(item => item.payoutStatus === "paid").map(item => {
      const source = byKey.get(item.commissionPayoutKey);
      return {
        itemId: item.id, code: item.commissionCode, amount: item.amount,
        statementCode: source?.statementCode ?? source?.code,
        statementDate: source?.statementDate, statementPeriod: source?.statementPeriod,
        payoutMonthKey: source?.payoutMonthKey, sourceBaseAmount: source?.sourceBaseAmount,
        statementBaseAmount: source?.statementBaseAmount, expectedAmount: source?.expectedAmount,
        differenceReason: source?.differenceReason,
        status: item.amount < 0 || /storno z výpisu/.test(item.note ?? "") ? "storno" : source?.status ?? "paid",
      };
    });
    const subsequent = entry.items?.find(item => /^B(?:C)?(?:101|1)$/.test(item.code ?? ""));
    const forecast = createAutoCommissionForecast(entry, received, subsequent?.amount);
    const combinedItemId = received.find(receipt => receipt === forecast.coverage.combined)?.itemId;
    forecasts.set(identity, { forecast, combinedItemId });
  }
  return items.flatMap(item => {
    if (!isAutoProduct(item.productKey === "unknown" || item.productKey === "subscription" ? null : item.productKey)) return [item];
    const product = item.productKey as EntryDoc["productKey"];
    const schedule = installmentCommissionScheduleFromCode(baseCommissionCodeForPayoutComparison(item.commissionCode, product), "annual");
    if (!schedule || schedule.phase !== "subsequent") return [item];
    const projection = forecasts.get(key(item.ownerEmail, item.entryId, item.source));
    const period = item.commissionPeriodStart;
    if (!projection || !period) return item.payoutStatus === "paid" ? [item] : [];
    const { forecast, combinedItemId } = projection;
    const estimate = forecast.forPeriod(item.commissionCode!, period);
    const { combinedWithCode, coveredCode } = forecast.coverage;
    if (item.payoutStatus === "paid") return [{ ...item, predictedAmount: item.isStatementOnly ? 0 : estimate?.amount ?? 0,
      ...(item.id === combinedItemId ? {
        installmentCoverageNote: combinedWithCode
          ? `Souhrnná výplata pokrývá období ${combinedWithCode} a ${item.commissionCode}.`
          : "Základna i částka odpovídají dvěma pololetním splátkám.",
      } : {}),
    }];
    if (coveredCode && item.commissionCode === coveredCode && !item.isPartialPayoutBalance) {
      return keepCoveredForStatementMatching ? [{ ...item, coveredByCombinedPayout: true }] : [];
    }
    if (!forecast.inForecastYear(period)) return [];
    if (estimate?.basis === "premiumChange") {
      const fixed = { ...item, amount: estimate.amount, predictedAmount: estimate.amount,
        predictionPosition: estimate.position,
        autoCommissionForecastMinimum: estimate.amount, autoCommissionForecastMaximum: estimate.amount,
        autoCommissionFromSavedPremium: true };
      // The amendment uses the original contract position, including if the payout date is shifted.
      delete fixed.originalPositionAmount;
      delete fixed.repricedAmountIfShifted;
      return [fixed];
    }
    // The historical amount may come from the previous career position.
    if (item.originalPositionAmount != null) return [item];
    if (!estimate) return [];
    return [{ ...item, amount: estimate.amount, predictedAmount: estimate.amount,
      autoCommissionForecastMinimum: estimate.minimum, autoCommissionForecastMaximum: estimate.maximum,
      autoCommissionConfirmedPolicyYear: estimate.isConfirmedPolicyYear }];
  });
}
