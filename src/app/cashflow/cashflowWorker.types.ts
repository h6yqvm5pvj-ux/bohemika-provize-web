import type { CashflowViewOptions } from "./buildCashflowView";
import type { CashflowSnapshot } from "./computeCashflow";
import type { CashflowCommissionStatementSummary, CashflowItem, MonthGroup } from "./types";

/** Owned by one model version; replace the model when any source data/date changes. */
export type CashflowDataset = {
  snapshot: CashflowSnapshot;
  statements: CashflowCommissionStatementSummary[];
  asOf: Date;
};

export type CashflowMonthOverview = Omit<MonthGroup, "items"> & {
  itemCountLabel: string;
};

export type CashflowContractSearchSummary = {
  productKey: CashflowItem["productKey"];
  clientName: string | null;
  inputAmount: number | null;
  frequency: NonNullable<CashflowItem["frequency"]> | null;
  contractStatus: NonNullable<CashflowItem["contractStatus"]> | null;
};

export type CashflowContractSearchStats = {
  itemCount: number;
  contractCount: number;
  summary: CashflowContractSearchSummary | null;
};

export type CashflowOverview = {
  months: CashflowMonthOverview[];
  contractSearchStats: CashflowContractSearchStats;
};

export type CashflowModel = {
  view(options: CashflowViewOptions): CashflowOverview;
  month(key: string): MonthGroup | null;
  dispose(): void;
};
