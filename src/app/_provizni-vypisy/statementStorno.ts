import { isAutoProduct } from "@/app/lib/productCatalog";
import { toDate } from "@/app/lib/formatters";

import { statementDiscrepancyKey } from "./statementDiscrepancies";
import {
  normalizeContractNumberForMatch,
  normalizeText,
  parseLocalDate,
  parsePeriodEndDate,
  parsePeriodStartDate,
  resolveStatementProduct,
} from "./statementParsing";
import {
  isUnpairedContractMatch,
  matchedSystemContract,
  systemContractIsStorno,
} from "./statementSystemContracts";
import { detectFullAutoCommissionStorno } from "./stornoInference";
import type {
  ContractMatchState,
  MatchedSystemContract,
  OtherPayment,
  ParsedStatement,
  StatementHeader,
  StornoCommissionGroup,
  StornoCommissionRow,
  StornoContractGroup,
  StornoStatementInference,
} from "./statementTypes";

export const suggestedStornoDateForStatement = (
  header: StatementHeader
): Date | null =>
  parseLocalDate(header.statementDate) ??
  parsePeriodEndDate(header.period) ??
  new Date();

export const stornoSystemUncertainty = (match: ContractMatchState | null): boolean => {
  const contract = matchedSystemContract(match);
  return isUnpairedContractMatch(match) || Boolean(contract && !systemContractIsStorno(contract));
};

export const fullAutoStornoInferenceForGroup = ({
  statement,
  statementId,
  group,
  systemContract,
  currentUserEmail,
}: {
  statement: ParsedStatement;
  statementId?: string | null;
  group: StornoContractGroup;
  systemContract: MatchedSystemContract | null;
  currentUserEmail?: string | null;
}): StornoStatementInference | null => {
  if (!systemContract || group.rows.length === 0) return null;
  const statementHasAutoProduct = group.rows.some(
    (row) => resolveStatementProduct(row.product).category === "auto"
  );
  const contractHasAutoProduct = Boolean(
    systemContract.productKey && isAutoProduct(systemContract.productKey)
  );
  if (!statementHasAutoProduct && !contractHasAutoProduct) return null;

  const policyStart = toDate(systemContract.policyStartDate);
  if (!policyStart) return null;
  const fallbackStornoDate = suggestedStornoDateForStatement(statement.header);
  const statementPeriodStart = parsePeriodStartDate(statement.header.period);
  const statementPeriodEnd = parsePeriodEndDate(statement.header.period);
  const detection = detectFullAutoCommissionStorno({
    isAutoProduct: true,
    contractStatus: systemContract.status,
    policyStartMs: policyStart.getTime(),
    currentRows: group.rows.map((row) => ({
      rowId: row.id,
      productCode: row.product,
      commissionCode: row.type,
      commission: row.commission,
      signedAt: row.signedAt,
      source: "own",
      status: "storno",
    })),
    existingPayouts: systemContract.commissionPayouts ?? [],
    contractItems: systemContract.items ?? [],
    currentStatementId: statementId || statementDiscrepancyKey(statement),
    statementPeriodStartMs: statementPeriodStart?.getTime() ?? null,
    statementPeriodEndMs: statementPeriodEnd?.getTime() ?? null,
    writtenBy: currentUserEmail ?? systemContract.adviserEmail ?? null,
    fallbackStornoDateMs: fallbackStornoDate?.getTime() ?? null,
  });
  if (!detection) return null;

  return {
    kind: "full_auto_storno_within_2_months",
    suggestedDate: new Date(detection.stornoDateMs),
    policyStartDate: new Date(detection.policyStartMs),
    fullStornoBoundaryDate: new Date(detection.fullStornoBoundaryMs),
    referenceDateSource: detection.referenceDateSource,
    commissionCode: detection.commissionCode,
    stornoAmount: detection.stornoAmount,
    matchedPaidAmount: detection.matchedPaidAmount,
    matchedSource: detection.matchedSource,
    matchedTitle: detection.matchedTitle,
    rowId: detection.rowId,
    productCode: detection.productCode,
    matchedPayoutKey: detection.matchedPayoutKey,
    matchedStatementId: detection.matchedStatementId,
    matchedStatementNumber: detection.matchedStatementNumber,
    matchedStatementPeriod: detection.matchedStatementPeriod,
  };
};

export const groupStornoRowsByContract = (
  rows: StornoCommissionRow[]
): StornoCommissionGroup[] => {
  const groups = new Map<string, StornoCommissionGroup>();

  rows.forEach((row, index) => {
    const normalizedContractNumber = normalizeContractNumberForMatch(row.contractNumber);
    const key = normalizedContractNumber || `bez-cisla-${index}`;
    const previous = groups.get(key);
    if (previous) {
      previous.rows.push(row);
      previous.totalCommission += row.commission;
      previous.totalReserveFund += row.reserveFund;
      return;
    }

    groups.set(key, {
      key,
      contractNumber: row.contractNumber,
      rows: [row],
      totalCommission: row.commission,
      totalReserveFund: row.reserveFund,
    });
  });

  return [...groups.values()].map((group) => ({
    ...group,
    totalCommission: Math.round(group.totalCommission * 100) / 100,
    totalReserveFund: Math.round(group.totalReserveFund * 100) / 100,
  }));
};

const stornoContractGroupKey = (
  contractNumber: string | null | undefined,
  client: string | null | undefined,
  fallback: string
): string => {
  const normalizedContractNumber = normalizeContractNumberForMatch(contractNumber);
  if (normalizedContractNumber) return `contract-${normalizedContractNumber}`;

  const normalizedClient = normalizeText(client).toLocaleLowerCase("cs-CZ");
  if (normalizedClient) return `client-${normalizedClient}-${fallback}`;

  return `without-contract-${fallback}`;
};

export const groupStornoItemsByContract = (
  rows: StornoCommissionRow[],
  payments: OtherPayment[]
): StornoContractGroup[] => {
  const groups = new Map<string, StornoContractGroup>();

  const ensureGroup = ({
    key,
    contractNumber,
    client,
  }: {
    key: string;
    contractNumber: string | null;
    client: string;
  }): StornoContractGroup => {
    const existing = groups.get(key);
    if (existing) {
      if (!existing.contractNumber && contractNumber) existing.contractNumber = contractNumber;
      if (!existing.client && client) existing.client = client;
      return existing;
    }

    const group: StornoContractGroup = {
      key,
      contractNumber,
      client,
      rows: [],
      payments: [],
      totalCommission: 0,
      totalReserveFund: 0,
      totalOtherPayments: 0,
      totalAmount: 0,
    };
    groups.set(key, group);
    return group;
  };

  rows.forEach((row, index) => {
    const key = stornoContractGroupKey(row.contractNumber, row.client, `row-${index}`);
    const group = ensureGroup({
      key,
      contractNumber: row.contractNumber || null,
      client: row.client || "",
    });
    group.rows.push(row);
    group.totalCommission += row.commission;
    group.totalReserveFund += row.reserveFund;
  });

  payments.forEach((payment, index) => {
    const key = stornoContractGroupKey(payment.contractNumber, null, `payment-${index}`);
    const group = ensureGroup({
      key,
      contractNumber: payment.contractNumber,
      client: "",
    });
    group.payments.push({ ...payment, index });
    group.totalOtherPayments += payment.amount;
  });

  return [...groups.values()].map((group) => {
    const totalCommission = Math.round(group.totalCommission * 100) / 100;
    const totalReserveFund = Math.round(group.totalReserveFund * 100) / 100;
    const totalOtherPayments = Math.round(group.totalOtherPayments * 100) / 100;
    return {
      ...group,
      totalCommission,
      totalReserveFund,
      totalOtherPayments,
      totalAmount: Math.round((totalCommission + totalOtherPayments) * 100) / 100,
    };
  });
};
