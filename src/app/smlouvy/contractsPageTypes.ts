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
import type { StornoEstimateIssue } from "@/app/lib/commissionStornoAudit";

export type FirestoreTimestamp = {
  seconds: number;
  nanoseconds: number;
};

export type ContractDoc = {
  isDip?: boolean | null;
  id: string;
  stornoEstimateIssue?: StornoEstimateIssue;
  hasContractPdfAttachment?: boolean;
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
  refreshStatementResolvedStatementDate?: string | null;
  refreshStatementResolvedStatementChronologyMs?: number | null;
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
  acquisitionType?: "inherited" | null;
  originalAdviserEmail?: string | null;
  originalAdviserName?: string | null;
  originalPosition?: Position | null;
  servicingOwnerEmail?: string | null;
  servicingOwnerName?: string | null;
  commissionOwnerEmail?: string | null;
  transferReason?: "manual" | "career_end" | string | null;
  transferAt?: FirestoreTimestamp | Date | string | number | null;
  transferEffectiveDate?: string | null;
  clientName?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  clientAddress?: string | null;
  contractNumber?: string | null;
  carPlate?: string | null;

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

export type DisplayedContract = ContractDoc & {
  adviserEmail?: string | null;
  groupedEndorsementCount?: number;
  groupedHasRefresh?: boolean;
  groupedLatestSortMs?: number;
  groupedLatestCreatedMs?: number;
  searchClientTokens?: string[];
  searchContractTokens?: string[];
  searchContractCompactTokens?: string[];
};

export type FilterMode = "latest" | "anniversary";
export type CommissionAuditFilterMode = CommissionAuditMode;
export type CommissionAuditFilterCode = CommissionAuditCodeFilter;
export type ProductCategory =
  | "investments"
  | "pension"
  | "life"
  | "auto"
  | "property"
  | "travel"
  | "business"
  | "foreigners";
export type Institution = ProductInstitutionId;

export type ContractsCache = {
  availablePositions?: Position[];
  userEmail: string;
  position: Position | null;
  myContracts: ContractDoc[];
  savedAt: number;
  myHasMore?: boolean;
  myCursorDate?: string | number | null;
  teamAdvisers?: { email: string; name: string | null }[];
};

export type ContractsApiResponse = {
  availablePositions?: Position[];
  ok: boolean;
  error?: string;
  position?: Position | null;
  teamAdvisers?: { email: string; name: string | null }[];
  canTransferContracts?: boolean;
  transferTargets?: {
    email: string;
    name: string | null;
    position: Position | null;
  }[];
  contracts?: (ContractDoc & { adviserEmail: string | null })[];
  totalCount?: number | null;
  hasMore?: boolean;
  nextCursorToken?: string | null;
  nextCursor?: number | null;
};

export type ContractsListFilters = {
  query: string;
  filterMode: FilterMode;
  showUnpaidOnly: boolean;
  showWithoutPdfOnly: boolean;
  showRefreshOnly: boolean;
  showActiveOnly: boolean;
  showStornoOnly: boolean;
  showMaturedOnly: boolean;
  showCommissionEndedOnly: boolean;
  commissionAuditMode: CommissionAuditFilterMode;
  commissionAuditCodeFilter: CommissionAuditFilterCode;
  selectedCategories: ProductCategory[];
  selectedInstitutions: Institution[];
  selectedPositions: Position[];
  selectedSubordinates: string[];
};

export type ContractsViewState = {
  userEmail: string;
  showTeam: boolean;
  filterMode: FilterMode;
  searchText: string;
  showUnpaidOnly: boolean;
  showWithoutPdfOnly: boolean;
  showRefreshOnly: boolean;
  showActiveOnly: boolean;
  showStornoOnly: boolean;
  showMaturedOnly: boolean;
  showCommissionEndedOnly: boolean;
  commissionAuditMode: CommissionAuditFilterMode;
  commissionAuditCodeFilter: CommissionAuditFilterCode;
  selectedCategories: ProductCategory[];
  selectedInstitutions: Institution[];
  selectedPositions: Position[];
  selectedSubordinates: string[];
  scrollY: number;
};

export type ContractDetailWindowState = {
  href: string;
  pageHref: string;
  title: string;
};
