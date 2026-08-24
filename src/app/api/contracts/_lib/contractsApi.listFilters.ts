import { contractLifecycleStatus } from "@/app/lib/contractLifecycle";
import type { ContractLifecycleStatus } from "@/app/lib/contractLifecycle";
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
const uniqueProducts = (products: Product[]): Product[] =>
  Array.from(new Set(products));

const CONTRACT_LIST_BUSINESS_PRODUCTS: Product[] = [
  "cppsimplex",
  "kooppmop",
  "cppPPRs",
  "cppPPRbez",
];
const CONTRACT_LIST_FOREIGNER_PRODUCTS: Product[] = ["maxcizinkomplex"];
const CONTRACT_LIST_TRAVEL_PRODUCTS = TRAVEL_PRODUCTS.filter(
  (product) => !CONTRACT_LIST_FOREIGNER_PRODUCTS.includes(product)
);
const CONTRACT_LIST_PROPERTY_LIABILITY_PRODUCTS = uniqueProducts([
  ...CONTRACT_LIST_PROPERTY_PRODUCTS,
  ...LIABILITY_PRODUCTS,
]).filter(
  (product) =>
    product !== "zamex" &&
    !CONTRACT_LIST_BUSINESS_PRODUCTS.includes(product) &&
    !CONTRACT_LIST_FOREIGNER_PRODUCTS.includes(product)
);
const CONTRACT_LIST_PRODUCT_CATEGORY_MAP: Record<
  ContractListProductCategory,
  Product[]
> = {
  life: LIFE_PRODUCTS,
  auto: AUTO_PRODUCTS,
  property: CONTRACT_LIST_PROPERTY_LIABILITY_PRODUCTS,
  travel: CONTRACT_LIST_TRAVEL_PRODUCTS,
  comfort: COMFORT_PRODUCTS,
  business: CONTRACT_LIST_BUSINESS_PRODUCTS,
  foreigners: CONTRACT_LIST_FOREIGNER_PRODUCTS,
};
const CONTRACT_LIST_PRODUCT_CATEGORY_SET = new Set<ContractListProductCategory>([
  "life",
  "auto",
  "property",
  "travel",
  "comfort",
  "business",
  "foreigners",
]);
const CONTRACT_LIST_INSTITUTION_SET = new Set<ProductInstitutionId>(
  Object.keys(INSTITUTION_CATALOG) as ProductInstitutionId[]
);
const ANNIVERSARY_WINDOW_DAYS = 90;

export type ContractListIndexedQueryClause =
  | {
      field: "productCategory" | "institutionId" | "lifecycleStatus";
      op: "==";
      value: string;
    }
  | {
      field: "productCategory" | "institutionId" | "lifecycleStatus";
      op: "in";
      values: string[];
    }
  | {
      field: "paid";
      op: "==";
      value: boolean;
    };

const stripDiacritics = (value: string): string =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export const normalizeSearchValue = (value?: string | null): string =>
  stripDiacritics((value ?? "").trim().toLowerCase());

export const normalizeContractNumberForSearch = (
  value?: string | null
): string => normalizeSearchValue(value).replace(/[^a-z0-9]/g, "");

const CONTRACT_SEARCH_KEY_MIN_LENGTH = 2;
const CONTRACT_SEARCH_TOKEN_MAX_LENGTH = 48;
const CONTRACT_SEARCH_KEY_MAX_COUNT = 1_500;

const addPrefixes = (target: Set<string>, value: string): void => {
  for (
    let end = CONTRACT_SEARCH_KEY_MIN_LENGTH;
    end <= value.length && target.size < CONTRACT_SEARCH_KEY_MAX_COUNT;
    end += 1
  ) {
    target.add(value.slice(0, end));
  }
};

const addTokenSubstrings = (target: Set<string>, value: string): void => {
  const bounded = value.slice(0, CONTRACT_SEARCH_TOKEN_MAX_LENGTH);
  for (
    let start = 0;
    start <= bounded.length - CONTRACT_SEARCH_KEY_MIN_LENGTH &&
    target.size < CONTRACT_SEARCH_KEY_MAX_COUNT;
    start += 1
  ) {
    for (
      let end = start + CONTRACT_SEARCH_KEY_MIN_LENGTH;
      end <= bounded.length && target.size < CONTRACT_SEARCH_KEY_MAX_COUNT;
      end += 1
    ) {
      target.add(bounded.slice(start, end));
    }
  }
};

export const contractClientSearchKeys = (
  clientName?: string | null
): string[] => {
  const normalized = normalizeSearchValue(clientName).replace(/\s+/g, " ");
  if (normalized.length < CONTRACT_SEARCH_KEY_MIN_LENGTH) return [];

  const keys = new Set<string>();
  addPrefixes(keys, normalized);
  for (const token of normalized.match(/[a-z0-9]+/g) ?? []) {
    addTokenSubstrings(keys, token);
  }
  return [...keys];
};

export const contractNumberSearchKeys = (
  contractNumber?: string | null
): string[] => {
  const normalized = normalizeContractNumberForSearch(contractNumber).slice(
    0,
    CONTRACT_SEARCH_TOKEN_MAX_LENGTH
  );
  if (normalized.length < CONTRACT_SEARCH_KEY_MIN_LENGTH) return [];

  const keys = new Set<string>();
  addTokenSubstrings(keys, normalized);
  return [...keys];
};

export const contractSearchIndexFieldsForContract = (
  contract: Pick<ContractDoc, "clientName" | "contractNumber">
): {
  clientSearchKeys: string[];
  contractNumberSearchKeys: string[];
} => ({
  clientSearchKeys: contractClientSearchKeys(contract.clientName),
  contractNumberSearchKeys: contractNumberSearchKeys(contract.contractNumber),
});

export const contractSearchLookupKeys = (
  query?: string | null
): { client: string; contractNumber: string | null } | null => {
  const client = normalizeSearchValue(query).replace(/\s+/g, " ");
  if (client.length < CONTRACT_SEARCH_KEY_MIN_LENGTH) return null;
  const contractNumber = normalizeContractNumberForSearch(query);
  const looksLikeContractNumber = /\d/.test(contractNumber);
  return {
    client,
    contractNumber:
      looksLikeContractNumber &&
      contractNumber.length >= CONTRACT_SEARCH_KEY_MIN_LENGTH
        ? contractNumber
        : null,
  };
};

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
    stornoOnly:
      search.get("stornoOnly") === "1" ||
      search.get("stornoOnly") === "true",
    maturedOnly:
      search.get("maturedOnly") === "1" ||
      search.get("maturedOnly") === "true",
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
  filters.stornoOnly ||
  filters.maturedOnly ||
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

export function contractListProductCategoryForProduct(
  product: Product | undefined | null
): ContractListProductCategory | null {
  if (!product) return null;
  for (const category of CONTRACT_LIST_PRODUCT_CATEGORY_SET) {
    if (CONTRACT_LIST_PRODUCT_CATEGORY_MAP[category].includes(product)) {
      return category;
    }
  }
  return null;
}

export function contractListIndexFieldsForContract(
  contract: Pick<
    ContractDoc,
    | "productKey"
    | "status"
    | "stornoDate"
    | "policyStartDate"
    | "policyEndDate"
    | "durationYears"
    | "durationMonths"
  >,
  now?: Date
): {
  productCategory: ContractListProductCategory | null;
  institutionId: ProductInstitutionId | null;
  lifecycleStatus: ContractLifecycleStatus;
} {
  const product = contract.productKey as Product | undefined;
  return {
    productCategory: contractListProductCategoryForProduct(product),
    institutionId: productInstitutionId(product),
    lifecycleStatus: contractLifecycleStatus(contract, now),
  };
}

const selectedLifecycleStatusesForFilters = (
  filters: ContractListFilters
): ContractLifecycleStatus[] => {
  if (filters.unpaidOnly) return ["active"];
  const statuses: ContractLifecycleStatus[] = [];
  if (filters.stornoOnly) statuses.push("storno");
  if (filters.maturedOnly) statuses.push("dozita");
  return statuses;
};

const pushStringClause = ({
  clauses,
  field,
  values,
  allowIn,
  multiValueUsed,
}: {
  clauses: ContractListIndexedQueryClause[];
  field: "productCategory" | "institutionId" | "lifecycleStatus";
  values: string[];
  allowIn: boolean;
  multiValueUsed: boolean;
}): boolean => {
  const uniqueValues = Array.from(new Set(values.filter(Boolean)));
  if (uniqueValues.length === 0) return multiValueUsed;
  if (uniqueValues.length === 1) {
    clauses.push({ field, op: "==", value: uniqueValues[0]! });
    return multiValueUsed;
  }
  if (!allowIn || multiValueUsed) return multiValueUsed;
  clauses.push({ field, op: "in", values: uniqueValues });
  return true;
};

export function buildContractListIndexedQueryClauses(
  filters: ContractListFilters,
  { allowIn }: { allowIn: boolean }
): ContractListIndexedQueryClause[] {
  const clauses: ContractListIndexedQueryClause[] = [];
  let multiValueUsed = false;

  multiValueUsed = pushStringClause({
    clauses,
    field: "lifecycleStatus",
    values: selectedLifecycleStatusesForFilters(filters),
    allowIn,
    multiValueUsed,
  });

  if (filters.unpaidOnly) {
    clauses.push({ field: "paid", op: "==", value: false });
  }

  multiValueUsed = pushStringClause({
    clauses,
    field: "productCategory",
    values: Array.from(filters.categories),
    allowIn,
    multiValueUsed,
  });

  pushStringClause({
    clauses,
    field: "institutionId",
    values: Array.from(filters.institutions),
    allowIn,
    multiValueUsed,
  });

  return clauses;
}

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
  if (filters.stornoOnly || filters.maturedOnly) {
    if (
      !(
        (filters.stornoOnly && lifecycleStatus === "storno") ||
        (filters.maturedOnly && lifecycleStatus === "dozita")
      )
    ) {
      return false;
    }
  }

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
