import {
  classifyGeneralCommissionCode,
  resolveStatementProduct,
} from "./statementParsing";
import type {
  CommissionRow,
  LifeSplitContractPreview,
  OtherPayment,
  OtherProductContractPreview,
} from "./statementTypes";

const sumRows = (rows: CommissionRow[]): number =>
  rows.reduce((sum, row) => sum + row.commission, 0);

const sumPayments = (payments: OtherPayment[]): number =>
  payments.reduce((sum, payment) => sum + payment.amount, 0);

const rowsByKind = (
  contract: LifeSplitContractPreview,
  kind: CommissionRow["lifeSplitKind"]
): CommissionRow[] => contract.rows.filter((row) => row.lifeSplitKind === kind);

export type LifeSplitCardSummary = {
  total: number;
  monthlyPremium: number | null;
  tipCommission: number;
  hasPremiumIncrease: boolean;
  premiumIncreaseAnnualBase: number;
};

export const lifeSplitCardSummary = (
  contract: LifeSplitContractPreview
): LifeSplitCardSummary => {
  const increaseRows = rowsByKind(contract, "increase");
  return {
    total: sumRows(contract.rows) + sumPayments(contract.b36Payments),
    monthlyPremium: contract.annualPremium > 0 ? contract.annualPremium / 12 : null,
    tipCommission: sumRows(rowsByKind(contract, "tip")),
    hasPremiumIncrease: increaseRows.length > 0,
    premiumIncreaseAnnualBase:
      increaseRows.map((row) => row.base).find((base) => base > 0) ?? 0,
  };
};

export type OtherProductCardSummary = {
  totalCommission: number;
  totalReserve: number;
  hasUnknownCommissionCode: boolean;
  annualBase: number;
  monthlyBase: number | null;
};

export const otherProductCardSummary = (
  contract: OtherProductContractPreview
): OtherProductCardSummary => {
  const annualBase =
    contract.rows.find(
      (row) => resolveStatementProduct(row.product).usesAnnualPremiumBase && row.base > 0
    )?.base ?? 0;

  return {
    totalCommission: sumRows(contract.rows) + sumPayments(contract.b36Payments),
    totalReserve: contract.rows.reduce((sum, row) => sum + row.reserveFund, 0),
    hasUnknownCommissionCode: contract.rows.some(
      (row) => classifyGeneralCommissionCode(row.product, row.type).kind === "unknown"
    ),
    annualBase,
    monthlyBase: annualBase > 0 ? annualBase / 12 : null,
  };
};
