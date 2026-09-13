import type { ContractsListFilters, CommissionAuditFilterMode } from "./contractsPageTypes";

export type ContractFilterSelection = Omit<ContractsListFilters, "query">;
export type ContractStatusFilter = "showActiveOnly" | "showStornoOnly" | "showMaturedOnly";

export const emptyContractFilterSelection = (): ContractFilterSelection => ({
  filterMode: "latest",
  showUnpaidOnly: false,
  showRefreshOnly: false,
  showActiveOnly: false,
  showStornoOnly: false,
  showMaturedOnly: false,
  commissionAuditMode: "off",
  commissionAuditCodeFilter: "all",
  selectedCategories: [],
  selectedInstitutions: [],
  selectedPositions: [],
  selectedSubordinates: [],
});

export function contractFilterCount(value: ContractFilterSelection): number {
  return Number(value.filterMode === "anniversary") +
    Number(value.showUnpaidOnly) + Number(value.showRefreshOnly) +
    Number(value.showActiveOnly) + Number(value.showStornoOnly) + Number(value.showMaturedOnly) +
    (value.commissionAuditMode === "off" ? 0 : 1 + Number(value.commissionAuditCodeFilter !== "all")) +
    value.selectedCategories.length + value.selectedInstitutions.length + value.selectedPositions.length + value.selectedSubordinates.length;
}

export function toggleContractStatus(value: ContractFilterSelection, key: ContractStatusFilter): ContractFilterSelection {
  const enabled = !value[key];
  if (!enabled) return { ...value, [key]: false };
  if (key === "showActiveOnly") {
    return { ...value, showActiveOnly: true, showStornoOnly: false, showMaturedOnly: false };
  }
  return { ...value, [key]: true, showActiveOnly: false, showUnpaidOnly: false, filterMode: "latest" };
}

export function setContractFilterMode(value: ContractFilterSelection, filterMode: ContractFilterSelection["filterMode"]): ContractFilterSelection {
  return filterMode === "anniversary"
    ? { ...value, filterMode, showStornoOnly: false, showMaturedOnly: false }
    : { ...value, filterMode };
}

export function toggleUnpaidFilter(value: ContractFilterSelection): ContractFilterSelection {
  return value.showUnpaidOnly
    ? { ...value, showUnpaidOnly: false }
    : { ...value, showUnpaidOnly: true, showStornoOnly: false, showMaturedOnly: false };
}

export function setCommissionFilterMode(value: ContractFilterSelection, mode: CommissionAuditFilterMode): ContractFilterSelection {
  return { ...value, commissionAuditMode: mode, commissionAuditCodeFilter: mode === "off" ? "all" : value.commissionAuditCodeFilter };
}

export function toggleFilterValue<T extends string>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter(item => item !== value) : [...values, value];
}
