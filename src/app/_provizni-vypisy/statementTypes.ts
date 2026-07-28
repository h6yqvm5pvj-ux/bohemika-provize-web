import type { ProductPrimaryCategory } from "@/app/lib/productCatalog";
import type {
  CommissionCoefficientSet,
  CommissionResultItemDTO,
  Position,
  Product,
} from "@/app/types/domain";

export type StatementHeader = {
  advisorNumber: string | null;
  period: string | null;
  statementNumber: string | null;
  statementDate: string | null;
};

export type LifeSplitCommissionKind =
  | "a101"
  | "b0301"
  | "b3601"
  | "b4801"
  | "subsequent"
  | "care"
  | "increase"
  | "tip"
  | "unknown";

export type GeneralCommissionKind =
  | "closing"
  | "tip"
  | "subsequent"
  | "installment"
  | "unexpected"
  | "increase"
  | "office"
  | "penalty"
  | "compensation"
  | "gradual"
  | "troyOunce"
  | "unknown";

export type StatementProductCategory =
  | ProductPrimaryCategory
  | "business"
  | "investment"
  | "unknown";

export type StatementProductMeta = {
  rawCode: string;
  label: string;
  productKey: Product | null;
  category: StatementProductCategory;
  usesAnnualPremiumBase: boolean;
  note?: string;
};

export type CommissionRow = {
  id: string;
  detailUrl: string | null;
  contractNumber: string;
  signedAt: string;
  validFrom: string;
  client: string;
  role: string;
  product: string;
  type: string;
  base: number;
  percent: string;
  career: string;
  commission: number;
  reserveFund: number;
  lifeSplitKind: LifeSplitCommissionKind;
  lifeSplitLabel: string;
};

export type DeductionCommissionRow = {
  id: string;
  detailUrl: string | null;
  contractNumber: string;
  signedAt: string;
  client: string;
  role: string;
  product: string;
  type: string;
  base: number;
  percent: string;
  career: string;
  commission: number;
  reserveFund: number;
};

export type OtherPayment = {
  description: string;
  contractNumber: string | null;
  amount: number;
  isB36Half: boolean;
  isStorno: boolean;
};

export type StornoCommissionRow = {
  id: string;
  detailUrl: string | null;
  contractNumber: string;
  signedAt: string;
  client: string;
  role: string;
  product: string;
  type: string;
  statusCode: string;
  base: number;
  percent: string;
  career: string;
  commission: number;
  reserveFund: number;
};

export type StornoCommissionGroup = {
  key: string;
  contractNumber: string;
  rows: StornoCommissionRow[];
  totalCommission: number;
  totalReserveFund: number;
};

export type StornoOtherPaymentItem = OtherPayment & {
  index: number;
};

export type StornoContractGroup = {
  key: string;
  contractNumber: string | null;
  client: string;
  rows: StornoCommissionRow[];
  payments: StornoOtherPaymentItem[];
  totalCommission: number;
  totalReserveFund: number;
  totalOtherPayments: number;
  totalAmount: number;
};

export type ContractStatusCategory =
  | "active"
  | "pending"
  | "matured"
  | "transferred"
  | "storno"
  | "invalid"
  | "unknown";

export type ContractStatusRule = {
  code: string;
  label: string;
  category: ContractStatusCategory;
  importDecision: string;
};

export type CommissionCodeCategory =
  | "closing"
  | "closingRole"
  | "subsequent"
  | "installment"
  | "unexpected"
  | "increase"
  | "tip"
  | "adjustment"
  | "office"
  | "troyOunce"
  | "other";

export type CommissionCodeRule = {
  codes: string;
  label: string;
  category: CommissionCodeCategory;
  note?: string;
  matchers: RegExp[];
};

export type LifeSplitContractPreview = {
  productCode: string;
  productLabel: string;
  contractNumber: string;
  client: string;
  signedAt: string;
  validFrom: string;
  annualPremium: number;
  rows: CommissionRow[];
  b36Payments: OtherPayment[];
};

export type OtherProductContractPreview = {
  key: string;
  contractNumber: string;
  client: string;
  signedAt: string;
  validFrom: string;
  rows: CommissionRow[];
  b36Payments: OtherPayment[];
};

export type ManagerCommissionRow = {
  id: string;
  detailUrl: string | null;
  contractNumber: string;
  signedAt: string;
  client: string;
  role: string;
  product: string;
  type: string;
  base: number;
  percent: string;
  career: string;
  commission: number;
  reserveFund: number;
  isStorno: boolean;
};

export type ManagerCommissionAdvisor = {
  advisorNumber: string;
  advisorName: string;
  position: string;
  contractCount: number;
  commission: number;
  stornos: number;
  deductions: number;
  reserveFund: number;
  rows: ManagerCommissionRow[];
};

export type ParsedStatement = {
  fileName: string;
  header: StatementHeader;
  payoutTotal: number | null;
  commissionRows: CommissionRow[];
  deductionRows: DeductionCommissionRow[];
  stornoRows: StornoCommissionRow[];
  otherPayments: OtherPayment[];
  contractStatusRules: ContractStatusRule[];
  managerCommissions: ManagerCommissionAdvisor[];
  lifeSplitContracts: LifeSplitContractPreview[];
  otherProductContracts: OtherProductContractPreview[];
  unmatchedB36Payments: OtherPayment[];
  parseWarnings: string[];
};

export type StatementCorrectionContext = {
  correctedRowKeys: Set<string>;
  correctedRowLabels: Map<string, string>;
  correctedRowDetails: Map<string, string>;
};

export type StatementFileRead = {
  statement: ParsedStatement;
  html: string;
};

export type StatementSaveState =
  | { status: "idle"; message: string | null }
  | { status: "ready"; message: string }
  | { status: "saving"; message: string }
  | { status: "saved"; message: string }
  | { status: "error"; message: string };

export type StatementProcessingResult = {
  payoutRows?: number;
  contractsMatched?: number;
  contractsWithPayoutChanges?: number;
  payoutRecordsAdded?: number;
  payoutRecordsExisting?: number;
  payoutRecordsUpdated?: number;
  coefficientOverridesApplied?: number;
  duplicatePayoutRowsSkipped?: number;
  premiumUpdates?: number;
  premiumHistoryBackfills?: number;
  olderPremiumUpdatesSkipped?: number;
  accountingRepairDrafts?: number;
  externalUpdateTasks?: number;
  contractsUpdated?: number;
  notFoundContracts?: string[];
  ambiguousContracts?: string[];
  skippedContracts?: string[];
  errors?: string[];
};

export type StatementProcessingSummary = {
  payoutRows: number;
  contractsMatched: number;
  contractsWithPayoutChanges: number;
  payoutRecordsAdded: number;
  payoutRecordsExisting: number;
  payoutRecordsUpdated: number;
  coefficientOverridesApplied: number;
  duplicatePayoutRowsSkipped: number;
  premiumUpdates: number;
  premiumHistoryBackfills: number;
  olderPremiumUpdatesSkipped: number;
  accountingRepairDrafts: number;
  externalUpdateTasks: number;
  contractsUpdated: number;
  notFoundContracts: string[];
  ambiguousContracts: string[];
  skippedContracts: string[];
  errors: string[];
};

export type SavedCommissionStatement = {
  id: string;
  fileName: string;
  statementNumber?: string | null;
  statementDate?: string | null;
  period?: string | null;
  periodStartMs?: number | null;
  periodEndMs?: number | null;
  statementChronologyMs?: number | null;
  payoutMonthKey?: string | null;
  payoutTotal?: number | null;
  processedAtMs?: number | null;
  processedBy?: string | null;
  processingResult?: StatementProcessingResult | null;
  html?: string | null;
};

export type SavedCommissionStatementsResponse = {
  ok?: boolean;
  items?: SavedCommissionStatement[];
  item?: SavedCommissionStatement;
  error?: string;
};

export type ContractsMutationResponse = {
  ok?: boolean;
  error?: string;
  updated?: number;
};

export type LifePremiumChangeSummary = {
  id: string;
  entryType?: "contract" | "endorsement" | string | null;
  step?: number | null;
  premiumAmount?: number | null;
  annualPremium?: number | null;
  previousPremium?: number | null;
  previousAnnualPremium?: number | null;
  premiumDelta?: number | null;
  annualPremiumDelta?: number | null;
  policyStartDate?: number | string | null;
  contractSignedDate?: number | string | null;
  createdAt?: number | string | null;
};

export type ManagerOverrideSummary = {
  email?: string | null;
  position?: string | null;
  commissionMode?: string | null;
  items?: CommissionResultItemDTO[] | null;
  total?: number | null;
};

export type PremiumStatementHistoryEntry = {
  premiumKind?: string | null;
  statementPeriod?: string | null;
  anniversaryDate?: string | null;
  validFrom?: string | null;
  previousPremium?: number | null;
  newPremium?: number | null;
  difference?: number | null;
  previousAnnualPremium?: number | null;
  newAnnualPremium?: number | null;
  differenceAnnual?: number | null;
  basePremiumPeriod?: "annual" | "payment" | string | null;
  productCode?: string | null;
  commissionCode?: string | null;
};

export type ContractCommissionPayoutRecord = {
  key?: string | null;
  code?: string | null;
  title?: string | null;
  amount?: number | null;
  expectedAmount?: number | null;
  difference?: number | null;
  differenceReason?: string | null;
  career?: string | null;
  detail?: string | null;
  status?: string | null;
  statementId?: string | null;
  statementNumber?: string | null;
  statementPeriod?: string | null;
  statementDate?: string | null;
  statementChronologyMs?: number | null;
  payoutMonthKey?: string | null;
  writtenAtMs?: number | null;
  writtenBy?: string | null;
};

export type MatchedSystemContract = {
  id: string;
  adviserEmail: string | null;
  adviserName?: string | null;
  entryType?: "contract" | "endorsement" | string | null;
  rootContractEntryId?: string | null;
  parentContractEntryId?: string | null;
  productKey?: Product | null;
  clientName?: string | null;
  contractNumber?: string | null;
  position?: string | null;
  effectivePosition?: string | null;
  timelinePosition?: string | null;
  commissionMode?: string | null;
  commissionCoefficientSetOverride?: string | null;
  commissionCoefficientSetOverrideSource?: string | null;
  commissionCoefficientSetOverrideStatementId?: string | null;
  commissionCoefficientSetOverrideStatementNumber?: string | null;
  commissionCoefficientSetOverrideStatementPeriod?: string | null;
  commissionCoefficientSetOverrideAppliedAtMs?: number | null;
  commissionCoefficientSetOverrideAppliedBy?: string | null;
  neonCoefficientSetOverride?: string | null;
  neonCoefficientSetOverrideSource?: string | null;
  neonCoefficientSetOverrideStatementId?: string | null;
  neonCoefficientSetOverrideStatementNumber?: string | null;
  neonCoefficientSetOverrideStatementPeriod?: string | null;
  neonCoefficientSetOverrideAppliedAtMs?: number | null;
  neonCoefficientSetOverrideAppliedBy?: string | null;
  isRefresh?: boolean | null;
  refreshOriginalContractNumber?: string | null;
  refreshOriginalMissingInSystem?: boolean | null;
  requiresStatementRefresh?: boolean | null;
  commissionCalculationStatus?: string | null;
  commissionBaseSource?: string | null;
  inputAmount?: number | null;
  calculationInputAmount?: number | null;
  effectiveInputAmount?: number | null;
  previousInputAmount?: number | null;
  newInputAmount?: number | null;
  premiumDelta?: number | null;
  premiumIncreaseAmount?: number | null;
  changeType?: string | null;
  refreshCommissionBase?: {
    calculationMonthlyPremium?: number | null;
    calculationAnnualPremium?: number | null;
    originalAnnualPremium?: number | null;
    newAnnualPremium?: number | null;
    motivationalAnnualPremium?: number | null;
    elapsedMonths?: number | null;
    remainingMonths?: number | null;
    stornoMonths?: number | null;
    calculationMethod?: string | null;
    method?: string | null;
  } | null;
  frequencyRaw?: string | null;
  items?: CommissionResultItemDTO[] | null;
  createdAt?: number | string | null;
  updatedAt?: number | string | null;
  contractSignedDate?: number | string | null;
  policyStartDate?: number | string | null;
  policyEndDate?: number | string | null;
  durationYears?: number | null;
  durationMonths?: number | null;
  status?: string | null;
  stornoDate?: number | string | null;
  paid?: boolean | null;
  maxxContractDetailUrl?: string | null;
  cppExtranetEntityTypeId?: string | number | null;
  cppExtranetEntityId?: string | number | null;
  lifePremiumChanges?: LifePremiumChangeSummary[] | null;
  premiumStatementHistory?: PremiumStatementHistoryEntry[] | null;
  commissionPayouts?: ContractCommissionPayoutRecord[] | null;
  managerOverrides?: ManagerOverrideSummary[] | null;
  tipContractTipsterEmail?: string | null;
  tipContractTipsterName?: string | null;
  tipContractTipsterPercent?: number | null;
  tipContractImmediateFirstYearGross?: number | null;
  tipContractImmediateFirstYearNet?: number | null;
  tipContractTipsterAmountFirstYear?: number | null;
  tipContractSourceTipId?: string | null;
  tipContractSourceTipTitle?: string | null;
  tipContractSourceTipProductLabel?: string | null;
  tipContractSourceTipClientName?: string | null;
  tipContractSourceTipCreatedAtMs?: number | string | null;
};

export type ManualNeonRefreshConversionTarget = {
  statementId: string;
  contract: MatchedSystemContract;
  contractNumber: string;
};

export type ManualNeonRefreshConversionResponse = {
  ok?: boolean;
  error?: string;
  contract?: Partial<MatchedSystemContract> & {
    id?: string;
    adviserEmail?: string | null;
  };
};

export type PostProcessingNeonRefreshPromptTarget =
  ManualNeonRefreshConversionTarget & {
    key: string;
    statementLabel: string;
    client: string;
    productCode: string;
    statementAnnualPremium: number;
    systemAnnualPremium: number | null;
    systemMonthlyPremium: number | null;
  };

export type ContractTimelinePositionMismatch = {
  storedPosition: Position | null;
  timelinePosition: Position;
  signedDateLabel: string;
};

export type ContractMatchState =
  | { status: "idle"; contracts: MatchedSystemContract[] }
  | { status: "loading"; contracts: MatchedSystemContract[] }
  | { status: "matched"; contracts: MatchedSystemContract[] }
  | { status: "not_found"; contracts: MatchedSystemContract[] }
  | { status: "error"; contracts: MatchedSystemContract[]; error: string };

export type ContractMatchScope = "my" | "team" | "tip";

export type ContractMatchRequest = {
  contractNumber: string;
  scope: ContractMatchScope;
};

export type ContractMatchesByNumber = Record<string, ContractMatchState>;

export type ContractMatchStats = {
  total: number;
  matched: number;
  loading: number;
  notFound: number;
  errors: number;
  pending: number;
  completed: number;
  progress: number;
};

export type BohemkaContractDetailModalPayload = {
  href: string;
  title: string;
  subtitle: string | null;
};

export type CommissionAmountComparisonStatus =
  | "ok"
  | "diff"
  | "missing_statement"
  | "missing_expected";

export type CommissionAmountComparisonReason =
  | "career_mismatch"
  | "premium_base_mismatch"
  | "commission_amount_mismatch";

export type CommissionAmountComparison = {
  key: string;
  label: string;
  statementAmount: number;
  expectedAmount: number;
  difference: number;
  status: CommissionAmountComparisonStatus;
  reason?: CommissionAmountComparisonReason | null;
  reasonTitle?: string | null;
  reasonLines?: string[];
  detailLines?: string[];
};

export type MissingAcceleratedB36Warning = {
  contractNumber: string;
  client: string;
  productLabels: string;
  detail: string;
};

export type CoefficientOverrideInfo = {
  coefficientSet: CommissionCoefficientSet;
  currentSet: CommissionCoefficientSet;
  items: CommissionResultItemDTO[];
  total: number;
};

export type StatementDiscrepancySource = "auto" | "manual";
export type StatementDiscrepancySeverity = "error" | "warning" | "info";

export type StatementDiscrepancyIssue = {
  key: string;
  statementKey: string;
  source: StatementDiscrepancySource;
  severity: StatementDiscrepancySeverity;
  category: string;
  scope: ContractMatchScope | null;
  contractNumber: string | null;
  client: string;
  product: string;
  title: string;
  details: string[];
  statementAmount?: number;
  expectedAmount?: number;
  difference?: number;
  manualAmountText?: string;
};

export type DiscrepancyReviewStateItem = {
  selected?: boolean;
  note?: string;
};

export type DiscrepancyReviewState = Record<string, DiscrepancyReviewStateItem>;

export type ManualDiscrepancyItem = {
  key: string;
  statementKey: string;
  selected: boolean;
  contractNumber: string;
  client: string;
  product: string;
  title: string;
  note: string;
  amountText: string;
};

export type PrintableDiscrepancyItem = StatementDiscrepancyIssue & {
  selected: boolean;
  note: string;
};

export type MarkedDiscrepancyItem = {
  key: string;
  statementKey: string;
  statementLabel: string;
  category: string;
  scope: ContractMatchScope | null;
  contractNumber: string | null;
  client: string;
  product: string;
  title: string;
  amount: number | null;
  details: string[];
};

export type MarkedDiscrepancies = Record<string, MarkedDiscrepancyItem>;

export type MarkingControls = {
  markingMode: boolean;
  markedItems: MarkedDiscrepancies;
  onToggleMarked: (item: MarkedDiscrepancyItem, selected: boolean) => void;
  statementKey: string;
  statementLabel: string;
};

export type DiscrepancyPdfItem = MarkedDiscrepancyItem & {
  note: string;
  autoIssues: StatementDiscrepancyIssue[];
};

export type StornoStatementActionTarget = {
  contract: MatchedSystemContract;
  contractNumber: string;
  client: string;
  product: string;
  suggestedDate: Date | null;
};
