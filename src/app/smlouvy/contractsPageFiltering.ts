import type { Product } from "@/app/types/domain";
import { commissionAuditSummaryForContract, isCommissionAuditFilterActive } from "@/app/lib/commissionAudit";
import { contractLifecycleStatus } from "@/app/lib/contractLifecycle";
import { getAnniversaryStartDate, isAnniversarySoon, shouldTrackAnniversary } from "@/app/lib/contractAnniversary";
import { productMatchesFilters } from "./contractsPageFilters";
import { normalizeEmail, normalizeSearchValue, normalizeContractNumberForSearch } from "./contractsPageStorage";
import type { ContractDoc, DisplayedContract, ContractsListFilters } from "./contractsPageTypes";
const isContractStorno = (c: ContractDoc) => contractLifecycleStatus(c) === "storno";
const isContractDozita = (c: ContractDoc) => contractLifecycleStatus(c) === "dozita";
export function isRefreshContract(contract: ContractDoc | null | undefined): boolean {
  if (!contract) return false;
  if (contract.isRefresh === true) return true;
  if ((contract as DisplayedContract).groupedHasRefresh === true) return true;
  if (
    typeof contract.refreshOriginalContractNumber === "string" &&
    contract.refreshOriginalContractNumber.trim().length > 0
  ) {
    return true;
  }
  return Boolean(contract.refreshCommissionBase);
}

export function contractOwnerEmail(
  contract: ContractDoc | (ContractDoc & { adviserEmail?: string | null })
): string {
  return normalizeEmail(
    ((contract as { adviserEmail?: string | null }).adviserEmail ??
      contract.userEmail ??
      null) as string | null
  );
}

function contractMatchesSelectedSubordinates(
  contract: ContractDoc | (ContractDoc & { adviserEmail?: string | null }),
  selectedSubordinates: Set<string>
): boolean {
  if (selectedSubordinates.size === 0) return true;
  const ownerEmail = contractOwnerEmail(contract);
  return ownerEmail.length > 0 && selectedSubordinates.has(ownerEmail);
}


export function filterDisplayedContracts(displayedContracts: DisplayedContract[], filters: ContractsListFilters, teamScopeActive: boolean): DisplayedContract[] {
  const { query: searchText, filterMode, showUnpaidOnly, showRefreshOnly, showActiveOnly, showStornoOnly, showMaturedOnly, commissionAuditMode, commissionAuditCodeFilter } = filters;
  const selectedPositions = new Set(filters.selectedPositions);
  const selectedCategories = new Set(filters.selectedCategories);
  const selectedInstitutions = new Set(filters.selectedInstitutions);
  const selectedSubordinates = new Set(filters.selectedSubordinates.map(normalizeEmail));
  const commissionAuditActive = isCommissionAuditFilterActive({mode: commissionAuditMode});
  const q = normalizeSearchValue(searchText);
  const qContract = normalizeContractNumberForSearch(searchText);
  const anniversaryOnly = filterMode === "anniversary";
  let base = selectedPositions.size === 0 ? displayedContracts
    : displayedContracts.filter(contract => contract.position != null && selectedPositions.has(contract.position));

  if (teamScopeActive && selectedSubordinates.size > 0) {
    base = base.filter((c) =>
      contractMatchesSelectedSubordinates(c, selectedSubordinates)
    );
  }

  if (q) {
    base = base.filter((c) => {
      const clientTokens =
        c.searchClientTokens && c.searchClientTokens.length > 0
          ? c.searchClientTokens
          : [normalizeSearchValue(c.clientName)];
      const contractTokens =
        c.searchContractTokens && c.searchContractTokens.length > 0
          ? c.searchContractTokens
          : [normalizeSearchValue(c.contractNumber)];
      const compactContractTokens =
        c.searchContractCompactTokens && c.searchContractCompactTokens.length > 0
          ? c.searchContractCompactTokens
          : [normalizeContractNumberForSearch(c.contractNumber)];
      return (
        clientTokens.some((value) => value.includes(q)) ||
        contractTokens.some((value) => value.includes(q)) ||
        (qContract.length > 0 &&
          compactContractTokens.some((value) => value.includes(qContract)))
      );
    });
  }

  if (showUnpaidOnly) {
    base = base.filter(
      (c) => c.paid !== true && !isContractStorno(c) && !isContractDozita(c)
    );
  }

  if (showRefreshOnly) {
    base = base.filter((c) => isRefreshContract(c));
  }

  if (showActiveOnly) {
    base = base.filter(
      (c) => contractLifecycleStatus(c as ContractDoc) === "active"
    );
  } else if (showStornoOnly || showMaturedOnly) {
    base = base.filter((c) => {
      const lifecycleStatus = contractLifecycleStatus(c as ContractDoc);
      return (
        (showStornoOnly && lifecycleStatus === "storno") ||
        (showMaturedOnly && lifecycleStatus === "dozita")
      );
    });
  }

  if (commissionAuditActive) {
    const now = new Date();
    base = base.filter(
      (c) =>
        commissionAuditSummaryForContract(c, {
          mode: commissionAuditMode,
          codeFilter: commissionAuditCodeFilter,
          viewerEmail: contractOwnerEmail(c),
          now,
        }).items.length > 0
    );
  }

  if (anniversaryOnly) {
    const enriched = base
      .map((c) => {
        const product = (c as any).productKey as Product | undefined;
        if (
          isContractStorno(c as ContractDoc) ||
          isContractDozita(c as ContractDoc) ||
          !product || !shouldTrackAnniversary(product)
        ) {
          return { contract: c, next: undefined, soon: false };
        }
        const start = getAnniversaryStartDate(c);
        const info = isAnniversarySoon(start);
        return { contract: c, next: info.next, soon: info.soon };
      })
      .filter(
        (item) =>
          item.soon &&
          productMatchesFilters(
            (item.contract as any).productKey as Product | undefined,
            selectedCategories,
            selectedInstitutions
          )
      )
      .sort(
        (a, b) =>
          (a.next?.getTime() ?? Number.POSITIVE_INFINITY) -
          (b.next?.getTime() ?? Number.POSITIVE_INFINITY)
      )
      .map((item) => item.contract);

    return enriched;
  }

  return base.filter((c) =>
    productMatchesFilters(
      c.productKey as Product | undefined,
      selectedCategories,
      selectedInstitutions
    )
  );
}
