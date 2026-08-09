import { contractLifecycleStatus } from "@/app/lib/contractLifecycle";
import { toDate } from "@/app/lib/formatters";
import type { CommissionMode, Position, Product } from "@/app/types/domain";

import { contractMatchKey } from "./statementContractMatching";
import {
  formatLocalDate,
  formatSystemDate,
  normalizeCommissionTitle,
  normalizeContractNumberForMatch,
  normalizeText,
  parseLocalDate,
  toDateInputValue,
} from "./statementParsing";
import type {
  ContractMatchScope,
  ContractMatchState,
  ContractTimelinePositionMismatch,
  MatchedSystemContract,
} from "./statementTypes";

export const contractMatchForNumber = (
  matches: Record<string, ContractMatchState>,
  contractNumber: string | null | undefined,
  scope: ContractMatchScope = "my"
): ContractMatchState | null => {
  const key = contractMatchKey(scope, contractNumber);
  return key ? matches[key] ?? null : null;
};

export const isUnpairedContractMatch = (match: ContractMatchState | null): boolean =>
  match?.status === "not_found" ||
  match?.status === "error" ||
  (match?.status === "matched" && !matchedSystemContract(match));

const POSITION_VALUES: Position[] = [
  "poradce1",
  "poradce2",
  "poradce3",
  "poradce4",
  "poradce5",
  "poradce6",
  "poradce7",
  "poradce8",
  "poradce9",
  "poradce10",
  "manazer4",
  "manazer5",
  "manazer6",
  "manazer7",
  "manazer8",
  "manazer9",
  "manazer10",
];
const POSITION_SET = new Set<string>(POSITION_VALUES);

export const normalizePositionValue = (value: unknown): Position | null =>
  typeof value === "string" && POSITION_SET.has(value) ? (value as Position) : null;

export const normalizeCommissionModeValue = (value: unknown): CommissionMode =>
  value === "accelerated" || value === "standard" ? value : "standard";

export const systemContractPositionRaw = (
  contract: MatchedSystemContract | null | undefined
): string | null => contract?.position ?? null;

export const systemContractPosition = (
  contract: MatchedSystemContract | null | undefined
): Position | null => normalizePositionValue(systemContractPositionRaw(contract));

export const systemContractTimelinePositionMismatch = (
  contract: MatchedSystemContract | null | undefined
): ContractTimelinePositionMismatch | null => {
  if (!contract) return null;
  const storedPosition = normalizePositionValue(contract.position);
  const timelinePosition = normalizePositionValue(contract.timelinePosition);
  if (!timelinePosition || storedPosition === timelinePosition) return null;
  return {
    storedPosition,
    timelinePosition,
    signedDateLabel: formatSystemDate(contract.contractSignedDate),
  };
};

export const systemContractIsStorno = (
  contract: MatchedSystemContract | null | undefined
): boolean => contractLifecycleStatus(contract) === "storno";

export const systemContractStatusLabel = (
  contract: MatchedSystemContract | null | undefined
): string => {
  const status = contractLifecycleStatus(contract);
  if (status === "storno") {
    const date = toDate(contract?.stornoDate);
    return date ? `storno od ${formatLocalDate(date)}` : "storno bez data";
  }
  if (status === "dozita") return "dožitá";
  return "aktivní";
};

export const systemCommissionMonthlyBase = (
  systemContract: MatchedSystemContract | null
): number => {
  const refreshMonthly = Number(
    systemContract?.refreshCommissionBase?.calculationMonthlyPremium
  );
  if (Number.isFinite(refreshMonthly) && refreshMonthly > 0) return refreshMonthly;

  const calculationInputAmount = Number(systemContract?.calculationInputAmount);
  if (Number.isFinite(calculationInputAmount) && calculationInputAmount > 0) {
    return calculationInputAmount;
  }

  return Number(systemContract?.inputAmount);
};

export const systemContractAnnualPremiumBase = (
  contract: MatchedSystemContract | null | undefined
): number | null => {
  const monthlyPremium = systemCommissionMonthlyBase(contract ?? null);
  return Number.isFinite(monthlyPremium) && monthlyPremium > 0
    ? Math.round(monthlyPremium * 12 * 100) / 100
    : null;
};

const systemContractEntryType = (
  contract: MatchedSystemContract | null | undefined
): string => normalizeText(contract?.entryType).toLowerCase();

export const systemContractIsEndorsement = (
  contract: MatchedSystemContract | null | undefined
): boolean =>
  systemContractEntryType(contract) === "endorsement" ||
  Boolean(
    normalizeText(contract?.rootContractEntryId) &&
      normalizeText(contract?.parentContractEntryId)
  );

const systemContractFamilyRootId = (
  contract: MatchedSystemContract | null | undefined
): string => {
  const rootId = normalizeText(contract?.rootContractEntryId);
  if (rootId) return rootId;

  const parentId = normalizeText(contract?.parentContractEntryId);
  if (systemContractIsEndorsement(contract) && parentId) return parentId;

  return normalizeText(contract?.id);
};

const systemContractFamilyKey = (
  contract: MatchedSystemContract | null | undefined
): string => {
  const owner = normalizeText(contract?.adviserEmail).toLowerCase();
  const rootId = systemContractFamilyRootId(contract);
  return owner && rootId ? `${owner}::${rootId}` : "";
};

export const matchContractsRepresentSingleFamily = (
  contracts: MatchedSystemContract[]
): boolean => {
  const uniqueContracts = dedupeEquivalentSystemContracts(contracts);
  if (uniqueContracts.length <= 1) return true;
  const keys = uniqueContracts.map(systemContractFamilyKey);
  return keys.every(Boolean) && new Set(keys).size === 1;
};

const systemContractTimelineTime = (contract: MatchedSystemContract): number => {
  const date =
    parseLocalDate(contract.policyStartDate) ??
    parseLocalDate(contract.contractSignedDate) ??
    parseLocalDate(contract.createdAt);
  return date?.getTime() ?? Number.POSITIVE_INFINITY;
};

const normalizedComparableText = (value: string | null | undefined): string =>
  normalizeCommissionTitle(value);

const systemContractEquivalentSignature = (
  contract: MatchedSystemContract
): string => {
  if (systemContractIsEndorsement(contract)) {
    return `${normalizeText(contract.adviserEmail).toLowerCase()}::entry::${contract.id}`;
  }

  return [
    normalizeText(contract.adviserEmail).toLowerCase(),
    normalizeContractNumberForMatch(contract.contractNumber),
    contract.productKey ?? "",
    normalizedComparableText(contract.clientName),
    toDateInputValue(parseLocalDate(contract.contractSignedDate)),
    toDateInputValue(parseLocalDate(contract.policyStartDate)),
    Math.round((systemContractAnnualPremiumBase(contract) ?? 0) * 100) / 100,
    systemContractPosition(contract) ?? "",
    normalizeCommissionModeValue(contract.commissionMode),
  ].join("::");
};

const systemContractCompletenessScore = (contract: MatchedSystemContract): number => {
  let score = 0;
  if (normalizeText(contract.entryType)) score += 20;
  if (Number.isFinite(Number(contract.effectiveInputAmount))) score += 10;
  if (Number.isFinite(Number(contract.calculationInputAmount))) score += 8;
  if (contract.maxxContractDetailUrl) score += 5;
  if (contract.cppExtranetEntityId || contract.cppExtranetEntityTypeId) score += 5;
  if ((contract.items ?? []).length > 0) score += 3;
  const updatedTime =
    parseLocalDate(contract.updatedAt)?.getTime() ??
    parseLocalDate(contract.createdAt)?.getTime() ??
    0;
  return score + updatedTime / 1_000_000_000_000;
};

const preferredSystemContract = (
  left: MatchedSystemContract,
  right: MatchedSystemContract
): MatchedSystemContract =>
  systemContractCompletenessScore(right) > systemContractCompletenessScore(left) ? right : left;

export const dedupeEquivalentSystemContracts = (
  contracts: MatchedSystemContract[]
): MatchedSystemContract[] => {
  const bySignature = new Map<string, MatchedSystemContract>();
  const order: string[] = [];

  for (const contract of contracts) {
    const signature = systemContractEquivalentSignature(contract) || `entry::${contract.id}`;
    const existing = bySignature.get(signature);
    if (!existing) {
      bySignature.set(signature, contract);
      order.push(signature);
      continue;
    }

    bySignature.set(signature, preferredSystemContract(existing, contract));
  }

  return order
    .map((key) => bySignature.get(key))
    .filter((item): item is MatchedSystemContract => Boolean(item));
};

export const sortSystemContractTimeline = (
  contracts: MatchedSystemContract[]
): MatchedSystemContract[] =>
  [...contracts].sort((left, right) => {
    const dateDiff = systemContractTimelineTime(left) - systemContractTimelineTime(right);
    if (dateDiff !== 0) return dateDiff;
    const leftEndorsement = systemContractIsEndorsement(left) ? 1 : 0;
    const rightEndorsement = systemContractIsEndorsement(right) ? 1 : 0;
    if (leftEndorsement !== rightEndorsement) return leftEndorsement - rightEndorsement;
    return left.id.localeCompare(right.id, "cs");
  });

export const primarySystemContractForFamily = (
  contracts: MatchedSystemContract[]
): MatchedSystemContract | null => {
  const timeline = sortSystemContractTimeline(contracts);
  return timeline.find((contract) => !systemContractIsEndorsement(contract)) ?? timeline[0] ?? null;
};

export const matchedSystemContract = (
  match: ContractMatchState | null
): MatchedSystemContract | null => {
  if (match?.status !== "matched") return null;
  const contracts = dedupeEquivalentSystemContracts(match.contracts);
  if (contracts.length === 1) return contracts[0];
  if (!matchContractsRepresentSingleFamily(contracts)) return null;
  return primarySystemContractForFamily(contracts);
};

export const systemMatchHasSingleFamilyHistory = (
  match: ContractMatchState | null
): boolean => {
  if (match?.status !== "matched") return false;
  const contracts = dedupeEquivalentSystemContracts(match.contracts);
  return contracts.length > 1 && matchContractsRepresentSingleFamily(contracts);
};

const endorsementCountLabel = (count: number): string => {
  if (count === 1) return "1 dodatek";
  if (count >= 2 && count <= 4) return `${count} dodatky`;
  return `${count} dodatků`;
};

export const systemMatchHistoryLabel = (match: ContractMatchState | null): string => {
  if (!systemMatchHasSingleFamilyHistory(match) || match?.status !== "matched") return "";
  const contracts = dedupeEquivalentSystemContracts(match.contracts);
  const endorsementCount =
    contracts.filter(systemContractIsEndorsement).length || Math.max(0, contracts.length - 1);
  return endorsementCountLabel(endorsementCount);
};

const KOOPERATIVA_OBCAN_STATEMENT_PRODUCTS = new Set<Product>([
  "koopmajetekobcan",
  "koopfit",
]);

export const statementProductMatchesSystemProduct = (
  expectedProductKey: Product | null | undefined,
  systemProductKey: Product | null | undefined
): boolean => {
  if (!expectedProductKey || !systemProductKey) return false;
  if (expectedProductKey === systemProductKey) return true;
  return (
    KOOPERATIVA_OBCAN_STATEMENT_PRODUCTS.has(expectedProductKey) &&
    KOOPERATIVA_OBCAN_STATEMENT_PRODUCTS.has(systemProductKey)
  );
};
