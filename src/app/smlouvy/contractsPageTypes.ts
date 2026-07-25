import type {
  CommissionResultItemDTO,
  MaxCizinKomplexVariant,
  PaymentFrequency,
  Position,
  Product,
} from "@/app/types/domain";
import type {
  CommissionAuditCodeFilter,
  CommissionAuditMode,
} from "@/app/lib/commissionAudit";
import type { ProductInstitutionId } from "@/app/lib/productCatalog";

export type FirestoreTimestamp = {
  seconds: number;
  nanoseconds: number;
};

export type ContractDoc = {
  id: string;
  paid?: boolean | null;
  status?: "active" | "storno" | string | null;
  stornoDate?: FirestoreTimestamp | Date | string | null;
  isRefresh?: boolean | null;
  refreshOriginalContractNumber?: string | null;
  refreshOriginalMissingInSystem?: boolean | null;
  requiresStatementRefresh?: boolean | null;
  commissionCalculationStatus?: string | null;
  commissionBaseSource?: string | null;
  refreshStatementResolvedAtMs?: number | null;
  refreshStatementResolvedStatementId?: string | null;
  refreshStatementResolvedStatementNumber?: string | null;
  refreshStatementResolvedStatementPeriod?: string | null;
  refreshCommissionBase?: unknown;
  entryType?: "contract" | "endorsement" | string | null;
  rootContractEntryId?: string | null;
  groupedEntryCount?: number;
  groupedEndorsementCount?: number;

  productKey?: Product;
  position?: Position;
  inputAmount?: number;
  previousInputAmount?: number | null;
  newInputAmount?: number | null;
  effectiveInputAmount?: number | null;
  premiumDelta?: number | null;
  changeType?: "increase" | "decrease" | "same" | string | null;
  frequencyRaw?: PaymentFrequency | null;
  total?: number;

  userEmail?: string | null;
  adviserName?: string | null;
  clientName?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  clientAddress?: string | null;
  contractNumber?: string | null;

  createdAt?: FirestoreTimestamp | Date | string | null;
  contractSignedDate?: FirestoreTimestamp | Date | string | null;
  policyStartDate?: FirestoreTimestamp | Date | string | null;
  policyEndDate?: FirestoreTimestamp | Date | string | null;
  durationYears?: number | null;
  durationMonths?: number | null;
  maxCizinKomplexVariant?: MaxCizinKomplexVariant | null;
  items?: CommissionResultItemDTO[] | null;
  result?: {
    items?: CommissionResultItemDTO[] | null;
    total?: number | null;
  } | null;
  commissionPayouts?: {
    key?: string | null;
    code?: string | null;
    title?: string | null;
    amount?: number | null;
    expectedAmount?: number | null;
    difference?: number | null;
    differenceReason?: string | null;
    career?: string | null;
    detail?: string | null;
    status?: "paid" | "difference" | "storno" | string | null;
    statementId?: string | null;
    statementNumber?: string | null;
    statementPeriod?: string | null;
    statementDate?: string | null;
    statementChronologyMs?: number | null;
    payoutMonthKey?: string | null;
    writtenAtMs?: number | null;
    writtenBy?: string | null;
  }[] | null;
};

export type AppUser = {
  id: string;
  email: string | null;
  fullName?: string | null;
  name?: string | null;
  position: Position | null;
  managerEmail?: string | null;
};

export type DisplayedContract = ContractDoc & {
  adviserEmail?: string | null;
  groupedEntryCount?: number;
  groupedEndorsementCount?: number;
  groupedHasRefresh?: boolean;
  groupedLatestSortMs?: number;
  groupedLatestCreatedMs?: number;
  searchClientTokens?: string[];
  searchContractTokens?: string[];
  searchContractCompactTokens?: string[];
};

export type FilterMode = "latest" | "anniversary";
export type ContractListViewMode = "cards" | "compact";
export type CommissionAuditFilterMode = CommissionAuditMode;
export type CommissionAuditFilterCode = CommissionAuditCodeFilter;
export type ProductCategory =
  | "life"
  | "auto"
  | "property"
  | "travel"
  | "comfort"
  | "business"
  | "foreigners";
export type Institution = ProductInstitutionId;

export type ContractsCache = {
  userEmail: string;
  position: Position | null;
  myContracts: ContractDoc[];
  teamContracts: (ContractDoc & { adviserEmail: string | null })[];
  savedAt: number;
  myHasMore?: boolean;
  teamHasMore?: boolean;
  myCursorDate?: string | number | null;
  teamCursorDate?: string | number | null;
  teamEmails?: string[];
};

export type ContractsApiResponse = {
  ok: boolean;
  error?: string;
  position?: Position | null;
  teamEmails?: string[];
  contracts?: (ContractDoc & { adviserEmail: string | null })[];
  hasMore?: boolean;
  nextCursorToken?: string | null;
  nextCursor?: number | null;
  teamContracts?: (ContractDoc & { adviserEmail: string | null })[];
  teamHasMore?: boolean;
  teamNextCursorToken?: string | null;
  teamNextCursor?: number | null;
};

export type ContractsListFilters = {
  query: string;
  filterMode: FilterMode;
  showUnpaidOnly: boolean;
  showRefreshOnly: boolean;
  showStornoOnly: boolean;
  showMaturedOnly: boolean;
  commissionAuditMode: CommissionAuditFilterMode;
  commissionAuditCodeFilter: CommissionAuditFilterCode;
  selectedCategories: ProductCategory[];
  selectedInstitutions: Institution[];
  selectedSubordinates: string[];
};

export type ContractsViewState = {
  userEmail: string;
  showTeam: boolean;
  listViewMode: ContractListViewMode;
  filterMode: FilterMode;
  searchText: string;
  showUnpaidOnly: boolean;
  showRefreshOnly: boolean;
  showStornoOnly: boolean;
  showMaturedOnly: boolean;
  commissionAuditMode: CommissionAuditFilterMode;
  commissionAuditCodeFilter: CommissionAuditFilterCode;
  selectedCategories: ProductCategory[];
  selectedInstitutions: Institution[];
  selectedSubordinates: string[];
  scrollY: number;
};

export type ContractDetailWindowState = {
  href: string;
  pageHref: string;
  title: string;
};
