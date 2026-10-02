import type { ContractDoc, ContractResponseItem } from "./contractsApi.types";

// TIP matching needs policy/premium inputs and the recipient's payout. It must
// never inherit private fields added to the full contract response in future.
const TIP_MATCH_FIELDS = [
  "entryType", "rootContractEntryId", "parentContractEntryId", "productKey",
  "clientName", "contractNumber", "position", "commissionMode",
  "contractSignedDate", "createdAt", "policyStartDate", "policyEndDate",
  "status", "stornoDate", "paid", "durationYears", "durationMonths", "frequencyRaw",
  "inputAmount", "calculationInputAmount", "effectiveInputAmount", "previousInputAmount",
  "newInputAmount", "premiumDelta", "premiumIncreaseAmount", "premiumDecreaseAmount", "changeType",
  "isRefresh", "refreshOriginalContractNumber", "refreshOriginalMissingInSystem",
  "requiresStatementRefresh", "commissionCalculationStatus", "commissionBaseSource",
  "refreshCommissionBase", "items", "total",
  "tipContractTipsterEmail", "tipContractTipsterName", "tipContractTipsterPercent",
  "tipContractImmediateFirstYearGross", "tipContractTipsterAmountFirstYear",
  "commissionPayouts", "cashflowPayoutMatches", "premiumStatementHistory", "premiumStatementBaseResolutions",
] as const satisfies readonly (keyof ContractDoc)[];

function pick<T extends object>(value: T, fields: readonly PropertyKey[]): Partial<T> {
  return Object.fromEntries(fields.filter(key => Object.hasOwn(value, key))
    .map(key => [key, value[key as keyof T]])) as Partial<T>;
}

// Apply before the full serializer, so unauthorized notes are never decrypted.
export const projectTipMatchData = (data: ContractDoc): ContractDoc => pick(data, TIP_MATCH_FIELDS);

// The serializer also adds metadata; keep the outward contract equally narrow.
export const projectTipMatchResponse = (item: ContractResponseItem): ContractResponseItem => ({
  ...pick(item, TIP_MATCH_FIELDS),
  id: item.id, adviserEmail: item.adviserEmail, adviserName: item.adviserName,
  userEmail: item.userEmail, effectivePosition: item.effectivePosition, timelinePosition: item.timelinePosition,
});
