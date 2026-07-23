import { contractLifecycleStatus } from "@/app/lib/contractLifecycle";
import {
  contractMatchesCommissionAuditFilter,
  isCommissionAuditFilterActive,
  parseCommissionAuditCodeFilter,
  parseCommissionAuditMode,
} from "@/app/lib/commissionAudit";
import { toDate } from "@/app/lib/formatters";
import {
  AUTO_PRODUCTS,
  COMFORT_PRODUCTS,
  INSTITUTION_CATALOG,
  LIFE_PRODUCTS,
  LIABILITY_PRODUCTS,
  PROPERTY_PRODUCTS,
  TRAVEL_PRODUCTS,
  productInstitutionId,
  type ProductInstitutionId,
} from "@/app/lib/productCatalog";
import type { Product } from "@/app/types/domain";

import type {
  ContractDoc,
  ContractListFilters,
  ContractListProductCategory,
} from "./contractsApi.types";

const CONTRACT_LIST_PROPERTY_PRODUCTS = PROPERTY_PRODUCTS.filter(
  (product) => product !== "zamex"
);
const CONTRACT_LIST_PRODUCT_CATEGORY_MAP: Record<
  ContractListProductCategory,
  Product[]
> = {
  life: LIFE_PRODUCTS,
  auto: AUTO_PRODUCTS,
  property: CONTRACT_LIST_PROPERTY_PRODUCTS,
  travel: TRAVEL_PRODUCTS,
  comfort: COMFORT_PRODUCTS,
  liability: LIABILITY_PRODUCTS,
};
const CONTRACT_LIST_PRODUCT_CATEGORY_SET = new Set<ContractListProductCategory>([
  "life",
  "auto",
  "property",
  "travel",
  "comfort",
  "liability",
]);
const CONTRACT_LIST_INSTITUTION_SET = new Set<ProductInstitutionId>(
  Object.keys(INSTITUTION_CATALOG) as ProductInstitutionId[]
);
const ANNIVERSARY_WINDOW_DAYS = 90;

const stripDiacritics = (value: string): string =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export const normalizeSearchValue = (value?: string | null): string =>
  stripDiacritics((value ?? "").trim().toLowerCase());

export const normalizeContractNumberForSearch = (
  value?: string | null
): string => normalizeSearchValue(value).replace(/[^a-z0-9]/g, "");

const parseCsvSet = <T extends string>(
  value: string | null,
  allowed: Set<T>
): Set<T> => {
  const out = new Set<T>();
  if (!value) return out;
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      if (allowed.has(item as T)) {
        out.add(item as T);
      }
    });
  return out;
};

export const parseContractListFilters = (
  search: URLSearchParams
): ContractListFilters => {
  const rawSignedFrom = (search.get("signedFrom") ?? "").trim();
  let signedFrom: Date | null = null;
  if (rawSignedFrom) {
    const maybeNum = Number(rawSignedFrom);
    if (Number.isFinite(maybeNum)) {
      const parsed = new Date(maybeNum);
      if (!Number.isNaN(parsed.getTime())) {
        signedFrom = parsed;
      }
    } else {
      const parsed = new Date(rawSignedFrom);
      if (!Number.isNaN(parsed.getTime())) {
        signedFrom = parsed;
      }
    }
  }

  return {
    query: (search.get("q") ?? "").trim().slice(0, 120),
    mode: search.get("mode") === "anniversary" ? "anniversary" : "latest",
    unpaidOnly:
      search.get("unpaidOnly") === "1" ||
      search.get("unpaidOnly") === "true",
    refreshOnly:
      search.get("refreshOnly") === "1" ||
      search.get("refreshOnly") === "true",
    commissionAuditMode: parseCommissionAuditMode(search.get("commissionAudit")),
    commissionAuditCodeFilter: parseCommissionAuditCodeFilter(
      search.get("commissionCode")
    ),
    categories: parseCsvSet(
      search.get("categories"),
      CONTRACT_LIST_PRODUCT_CATEGORY_SET
    ),
    institutions: parseCsvSet(
      search.get("institutions"),
      CONTRACT_LIST_INSTITUTION_SET
    ),
    signedFrom,
  };
};

export const hasContractListClientFilters = (
  filters: ContractListFilters
): boolean =>
  normalizeSearchValue(filters.query).length > 0 ||
  filters.mode === "anniversary" ||
  filters.unpaidOnly ||
  filters.refreshOnly ||
  isCommissionAuditFilterActive({
    mode: filters.commissionAuditMode,
    codeFilter: filters.commissionAuditCodeFilter,
  }) ||
  filters.categories.size > 0 ||
  filters.institutions.size > 0;

export const hasContractListFilters = (filters: ContractListFilters): boolean =>
  hasContractListClientFilters(filters) || filters.signedFrom != null;

export const contractSortDate = (data: ContractDoc): Date | null =>
  toDate(data.contractSignedDate) ?? toDate(data.createdAt);

export function productMatchesListCategory(
  product: Product | undefined,
  categories: Set<ContractListProductCategory>
): boolean {
  if (!product) return false;
  if (categories.size === 0) return true;
  for (const category of categories) {
    if (CONTRACT_LIST_PRODUCT_CATEGORY_MAP[category].includes(product)) {
      return true;
    }
  }
  return false;
}

export function productMatchesListInstitution(
  product: Product | undefined,
  institutions: Set<ProductInstitutionId>
): boolean {
  if (!product) return false;
  if (institutions.size === 0) return true;
  const institution = productInstitutionId(product);
  return institution != null && institutions.has(institution);
}

function nextAnniversaryDate(start: Date, now: Date): Date {
  const candidate = new Date(
    now.getFullYear(),
    start.getMonth(),
    start.getDate()
  );
  if (candidate.getTime() < now.getTime()) {
    candidate.setFullYear(candidate.getFullYear() + 1);
  }
  return candidate;
}

export function isAnniversarySoonForList(
  date: Date | null,
  nowRaw = new Date()
): boolean {
  if (!date) return false;
  const now = new Date(nowRaw.getFullYear(), nowRaw.getMonth(), nowRaw.getDate());
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const next = nextAnniversaryDate(start, now);
  const diffDays = (next.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  const anniversaryNumber = next.getFullYear() - start.getFullYear();
  return (
    anniversaryNumber >= 1 &&
    diffDays >= 0 &&
    diffDays <= ANNIVERSARY_WINDOW_DAYS
  );
}

export function contractMatchesListSearch(
  contract: ContractDoc,
  query: string
): boolean {
  const q = normalizeSearchValue(query);
  if (!q) return true;
  const qContract = normalizeContractNumberForSearch(query);
  const client = normalizeSearchValue(contract.clientName);
  const contractNumber = normalizeSearchValue(contract.contractNumber);
  const compactContractNumber = normalizeContractNumberForSearch(
    contract.contractNumber
  );
  return (
    client.includes(q) ||
    contractNumber.includes(q) ||
    (qContract.length > 0 && compactContractNumber.includes(qContract))
  );
}

export function contractMatchesRefreshFilter(contract: ContractDoc): boolean {
  if (contract.isRefresh === true) return true;
  if (typeof contract.refreshOriginalContractNumber === "string") {
    if (contract.refreshOriginalContractNumber.trim().length > 0) return true;
  }
  return Boolean(contract.refreshCommissionBase);
}

export function contractMatchesListFilters(
  contract: ContractDoc,
  filters: ContractListFilters,
  ownerEmail?: string | null
): boolean {
  const product = contract.productKey as Product | undefined;
  if (filters.signedFrom) {
    const signed = contractSortDate(contract);
    if (!signed || signed < filters.signedFrom) return false;
  }

  if (!contractMatchesListSearch(contract, filters.query)) return false;

  if (filters.refreshOnly && !contractMatchesRefreshFilter(contract)) {
    return false;
  }

  if (
    !productMatchesListCategory(product, filters.categories) ||
    !productMatchesListInstitution(product, filters.institutions)
  ) {
    return false;
  }

  const lifecycleStatus = contractLifecycleStatus(contract);
  if (filters.unpaidOnly) {
    if (contract.paid === true || lifecycleStatus !== "active") return false;
  }

  if (
    !contractMatchesCommissionAuditFilter(contract, {
      mode: filters.commissionAuditMode,
      codeFilter: filters.commissionAuditCodeFilter,
      viewerEmail: ownerEmail ?? contract.userEmail ?? null,
    })
  ) {
    return false;
  }

  if (filters.mode === "anniversary") {
    if (
      lifecycleStatus !== "active" ||
      !product ||
      TRAVEL_PRODUCTS.includes(product)
    ) {
      return false;
    }
    const startDate = toDate(contract.policyStartDate) ?? contractSortDate(contract);
    if (!isAnniversarySoonForList(startDate)) return false;
  }

  return true;
}
