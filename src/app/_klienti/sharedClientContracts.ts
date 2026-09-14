import type { ClientContractItem } from "./clientCardHelpers";

// Intentionally separate from ClientContractItem: a summary carries no source
// entry ID, owner address, contract number, dates, contact data or detail URL.
export type SharedContractSummary = {
  shareId: string;
  productKey: string | null;
  adviserName: string;
};
export type SharedClientContractsResponse = {
  ok: true;
  contracts: ClientContractItem[];
  summaries: SharedContractSummary[];
  matchingAvailable: boolean;
  indexing: boolean;
};
