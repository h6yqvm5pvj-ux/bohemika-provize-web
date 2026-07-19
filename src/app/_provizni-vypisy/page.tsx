"use client";

import {
  createContext,
  Fragment,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import Image from "next/image";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import {
  AlertTriangle,
  Banknote,
  CalendarDays,
  CalendarX,
  Car,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  FileUp,
  HandCoins,
  HeartPulse,
  ListChecks,
  Loader2,
  Plus,
  Printer,
  ReceiptText,
  RotateCcw,
  Trash2,
  UsersRound,
  WalletCards,
  X,
  type LucideIcon,
} from "lucide-react";

import {
  PRODUCT_CATALOG,
  isAutoProduct,
  type ProductPrimaryCategory,
} from "@/app/lib/productCatalog";
import { contractLifecycleStatus } from "@/app/lib/contractLifecycle";
import { toDate } from "@/app/lib/formatters";
import {
  type CommissionMode,
  type CommissionCoefficientSet,
  type CommissionResultItemDTO,
  type PaymentFrequency,
  type Position,
  type Product,
} from "@/app/types/domain";
import {
  calculateAllianzAuto,
  calculateCppAuto,
  calculateCsobAuto,
  calculateKooperativaAuto,
  calculatePillowAuto,
  calculateSlaviaFlotila,
  calculateUniqaAuto,
  calculateUniqaFlotila,
  calculateKoopFlotila,
} from "@/app/lib/productFormulas";
import {
  candidateCoefficientSetsForProduct,
  coefficientSetLabel,
  defaultCoefficientSetForProduct,
  normalizeCommissionCoefficientSet,
  productSupportsCoefficientSetOverride,
  signedDateForCoefficientSetOverride,
} from "@/app/lib/productFormulas/coefficientSets";
import {
  calculateNeon,
  normalizeNeonDurationYears,
} from "@/app/lib/productFormulas/neon";
import {
  autoSubsequentCoefficientForProduct,
  isAutoSubsequentCommissionCode,
} from "@/app/lib/productFormulas/autoCommission";
import { periodsPerYear } from "@/app/lib/productFormulas/shared";
import { auth } from "@/app/firebase";
import { AppLayout } from "@/components/AppLayout";

type StatementHeader = {
  advisorNumber: string | null;
  period: string | null;
  statementNumber: string | null;
  statementDate: string | null;
};

type LifeSplitCommissionKind =
  | "a101"
  | "b0301"
  | "b3601"
  | "b4801"
  | "subsequent"
  | "care"
  | "increase"
  | "tip"
  | "unknown";

type GeneralCommissionKind =
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

type StatementProductCategory = ProductPrimaryCategory | "investment" | "unknown";

type StatementProductMeta = {
  rawCode: string;
  label: string;
  productKey: Product | null;
  category: StatementProductCategory;
  usesAnnualPremiumBase: boolean;
  note?: string;
};

type CommissionRow = {
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

type DeductionCommissionRow = {
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

type OtherPayment = {
  description: string;
  contractNumber: string | null;
  amount: number;
  isB36Half: boolean;
  isStorno: boolean;
};

type StornoCommissionRow = {
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

type StornoCommissionGroup = {
  key: string;
  contractNumber: string;
  rows: StornoCommissionRow[];
  totalCommission: number;
  totalReserveFund: number;
};

type StornoOtherPaymentItem = OtherPayment & {
  index: number;
};

type StornoContractGroup = {
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

type ContractStatusCategory =
  | "active"
  | "pending"
  | "matured"
  | "transferred"
  | "storno"
  | "invalid"
  | "unknown";

type ContractStatusRule = {
  code: string;
  label: string;
  category: ContractStatusCategory;
  importDecision: string;
};

type CommissionCodeCategory =
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

type CommissionCodeRule = {
  codes: string;
  label: string;
  category: CommissionCodeCategory;
  note?: string;
  matchers: RegExp[];
};

type LifeSplitContractPreview = {
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

type OtherProductContractPreview = {
  key: string;
  contractNumber: string;
  client: string;
  signedAt: string;
  validFrom: string;
  rows: CommissionRow[];
  b36Payments: OtherPayment[];
};

type ManagerCommissionRow = {
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

type ManagerCommissionAdvisor = {
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

type ParsedStatement = {
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

type StatementCorrectionContext = {
  correctedRowKeys: Set<string>;
  correctedRowLabels: Map<string, string>;
  correctedRowDetails: Map<string, string>;
};

type StatementFileRead = {
  statement: ParsedStatement;
  html: string;
};

type StatementSaveState =
  | { status: "idle"; message: string | null }
  | { status: "ready"; message: string }
  | { status: "saving"; message: string }
  | { status: "saved"; message: string }
  | { status: "error"; message: string };

type StatementProcessingResult = {
  payoutRows?: number;
  contractsMatched?: number;
  contractsWithPayoutChanges?: number;
  payoutRecordsAdded?: number;
  payoutRecordsExisting?: number;
  payoutRecordsUpdated?: number;
  coefficientOverridesApplied?: number;
  duplicatePayoutRowsSkipped?: number;
  premiumUpdates?: number;
  olderPremiumUpdatesSkipped?: number;
  accountingRepairDrafts?: number;
  externalUpdateTasks?: number;
  contractsUpdated?: number;
  notFoundContracts?: string[];
  ambiguousContracts?: string[];
  skippedContracts?: string[];
  errors?: string[];
};

type StatementProcessingSummary = {
  payoutRows: number;
  contractsMatched: number;
  contractsWithPayoutChanges: number;
  payoutRecordsAdded: number;
  payoutRecordsExisting: number;
  payoutRecordsUpdated: number;
  coefficientOverridesApplied: number;
  duplicatePayoutRowsSkipped: number;
  premiumUpdates: number;
  olderPremiumUpdatesSkipped: number;
  accountingRepairDrafts: number;
  externalUpdateTasks: number;
  contractsUpdated: number;
  notFoundContracts: string[];
  ambiguousContracts: string[];
  skippedContracts: string[];
  errors: string[];
};

type SavedCommissionStatement = {
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

type SavedCommissionStatementsResponse = {
  ok?: boolean;
  items?: SavedCommissionStatement[];
  item?: SavedCommissionStatement;
  error?: string;
};

type ContractsMutationResponse = {
  ok?: boolean;
  error?: string;
  updated?: number;
};

type LifePremiumChangeSummary = {
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

type ManagerOverrideSummary = {
  email?: string | null;
  position?: string | null;
  commissionMode?: string | null;
  items?: CommissionResultItemDTO[] | null;
  total?: number | null;
};

type PremiumStatementHistoryEntry = {
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

type ContractCommissionPayoutRecord = {
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

type MatchedSystemContract = {
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

type ManualNeonRefreshConversionTarget = {
  statementId: string;
  contract: MatchedSystemContract;
  contractNumber: string;
};

type ManualNeonRefreshConversionResponse = {
  ok?: boolean;
  error?: string;
  contract?: Partial<MatchedSystemContract> & {
    id?: string;
    adviserEmail?: string | null;
  };
};

type PostProcessingNeonRefreshPromptTarget = ManualNeonRefreshConversionTarget & {
  key: string;
  statementLabel: string;
  client: string;
  productCode: string;
  statementAnnualPremium: number;
  systemAnnualPremium: number | null;
  systemMonthlyPremium: number | null;
};

const systemContractPositionRaw = (
  contract: MatchedSystemContract | null | undefined
): string | null => contract?.position ?? null;

const systemContractPosition = (
  contract: MatchedSystemContract | null | undefined
): Position | null => normalizePositionValue(systemContractPositionRaw(contract));

type ContractTimelinePositionMismatch = {
  storedPosition: Position | null;
  timelinePosition: Position;
  signedDateLabel: string;
};

const systemContractTimelinePositionMismatch = (
  contract: MatchedSystemContract | null | undefined
): ContractTimelinePositionMismatch | null => {
  if (!contract) return null;
  const storedPosition = normalizePositionValue(contract.position);
  const timelinePosition = normalizePositionValue(contract.timelinePosition);
  if (!timelinePosition || storedPosition === timelinePosition) return null;
  return {
    storedPosition,
    timelinePosition,
    signedDateLabel: formatSystemDate(contract.contractSignedDate),
  };
};

type ContractMatchState =
  | { status: "idle"; contracts: MatchedSystemContract[] }
  | { status: "loading"; contracts: MatchedSystemContract[] }
  | { status: "matched"; contracts: MatchedSystemContract[] }
  | { status: "not_found"; contracts: MatchedSystemContract[] }
  | { status: "error"; contracts: MatchedSystemContract[]; error: string };

type ContractMatchScope = "my" | "team" | "tip";

type ContractMatchRequest = {
  contractNumber: string;
  scope: ContractMatchScope;
};

type ContractMatchesByNumber = Record<string, ContractMatchState>;

type ContractMatchStats = {
  total: number;
  matched: number;
  loading: number;
  notFound: number;
  errors: number;
  pending: number;
  completed: number;
  progress: number;
};

type BohemkaContractDetailModalPayload = {
  href: string;
  title: string;
  subtitle: string | null;
};

const BohemkaContractDetailModalContext =
  createContext<Dispatch<SetStateAction<BohemkaContractDetailModalPayload | null>> | null>(
    null
  );

type CommissionAmountComparisonStatus =
  | "ok"
  | "diff"
  | "missing_statement"
  | "missing_expected";

type CommissionAmountComparisonReason =
  | "career_mismatch"
  | "premium_base_mismatch"
  | "commission_amount_mismatch";

type CommissionAmountComparison = {
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

type MissingAcceleratedB36Warning = {
  contractNumber: string;
  client: string;
  productLabels: string;
  detail: string;
};

type CoefficientOverrideInfo = {
  coefficientSet: CommissionCoefficientSet;
  currentSet: CommissionCoefficientSet;
  items: CommissionResultItemDTO[];
  total: number;
};

type StatementDiscrepancySource = "auto" | "manual";
type StatementDiscrepancySeverity = "error" | "warning" | "info";

type StatementDiscrepancyIssue = {
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

type DiscrepancyReviewStateItem = {
  selected?: boolean;
  note?: string;
};

type DiscrepancyReviewState = Record<string, DiscrepancyReviewStateItem>;

type ManualDiscrepancyItem = {
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

type PrintableDiscrepancyItem = StatementDiscrepancyIssue & {
  selected: boolean;
  note: string;
};

type MarkedDiscrepancyItem = {
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

type MarkedDiscrepancies = Record<string, MarkedDiscrepancyItem>;

type MarkingControls = {
  markingMode: boolean;
  markedItems: MarkedDiscrepancies;
  onToggleMarked: (item: MarkedDiscrepancyItem, selected: boolean) => void;
  statementKey: string;
  statementLabel: string;
};

type DiscrepancyPdfItem = MarkedDiscrepancyItem & {
  note: string;
  autoIssues: StatementDiscrepancyIssue[];
};

type StornoStatementActionTarget = {
  contract: MatchedSystemContract;
  contractNumber: string;
  client: string;
  product: string;
  suggestedDate: Date | null;
};

const LIFE_SPLIT_PRODUCT_CODES = new Set([
  "CPP_N_LIFE",
  "CPP_N_RISK",
  "CPP_NEON",
  "CPP_NRF_LF",
  "KOOP_FLEXI",
  "BHMK_PILLOW_UR_NM",
]);

const INVESTMENT_SECTION_PRODUCT_CODES = new Set([
  "INVESTIKA",
  "EFEKTIKA",
  "MONETIKA",
  "CON_INV2_C",
]);

type KnownStatementProduct = {
  product?: Product;
  label?: string;
  category?: StatementProductCategory;
  usesAnnualPremiumBase?: boolean;
  note?: string;
};

const KNOWN_STATEMENT_PRODUCTS: Record<string, KnownStatementProduct> = {
  CPP_N_LIFE: {
    product: "neon",
    usesAnnualPremiumBase: true,
  },
  CPP_NEON: {
    product: "neon",
    label: "ČPP ŽP NEON",
    usesAnnualPremiumBase: true,
  },
  CPP_NRF_LF: {
    product: "neon",
    label: "ČPP ŽP NEON",
    usesAnnualPremiumBase: true,
  },
  KOOP_FLEXI: {
    product: "flexi",
    usesAnnualPremiumBase: true,
    note: "Životní pojištění. Pokud výpis uvádí základnu, bereme ji jako roční pojistné. V testovaném lednu ale KOOP_FLEXI posílá základnu 0, takže měsíční pojistné doplníme až ze spárované smlouvy.",
  },
  BHMK_PILLOW_UR_NM: {
    product: "pillowInjury",
    label: "Pillow Úraz / Nemoc",
    category: "life",
    usesAnnualPremiumBase: true,
  },
  CPP_N_RISK: {
    product: "neon",
    label: "ČPP ŽP NEON RISK",
    usesAnnualPremiumBase: true,
  },
  CPP_DOMX: {
    product: "domex",
  },
  "CPP_DOMX+2": {
    product: "domex",
  },
  CPP_SIMPLE: {
    product: "cppsimplex",
  },
  CPP_HAFAN: {
    product: "cpphafan",
  },
  CPP_ACPIII: {
    product: "cppAuto",
  },
  CPP_ACPIV: {
    product: "cppAuto",
  },
  CPP_ACPIVZ: {
    product: "cppAuto",
  },
  ALLMOJEAUT: {
    product: "allianzAuto",
  },
  "ČSOBP_AU_Z": {
    product: "csobAuto",
  },
  CSOBP_AU_Z: {
    product: "csobAuto",
  },
  UNIQA_AUTO: {
    product: "uniqaAuto",
  },
  PIL_AUTOZ: {
    product: "pillowAuto",
  },
  SLA_AUTOZ: {
    product: "slaviaauto",
  },
  KOO_NAMIRU: {
    product: "kooperativaAuto",
  },
  KOO_OBCAN: {
    product: "koopmajetekobcan",
  },
  KOO_OD_ZAM: {
    product: "koopodzam",
    label: "Kooperativa odpovědnost zaměstnance",
    category: "property",
  },
  KOOP_PMOP: {
    product: "kooppmop",
    label: "Kooperativa PMOP",
    category: "property",
  },
  KOO_PMOP: {
    product: "kooppmop",
    label: "Kooperativa PMOP",
    category: "property",
  },
  MAX_CIZIN: {
    product: "maxcizinkomplex",
  },
  INVESTIKA: {
    label: "Investika",
    category: "investment",
  },
  EFEKTIKA: {
    label: "Efektika",
    category: "investment",
  },
  MONETIKA: {
    label: "Monetika",
    category: "investment",
  },
  CON_INV2_C: {
    label: "Conseq investice",
    category: "investment",
  },
  TU_ZLATO: {
    label: "Troyská unce - zlato",
    category: "investment",
    note: "U Troyské unce se význam kódů A/B liší podle varianty produktu.",
  },
  TU_ESHOPJN: {
    label: "Troyská unce - nákup",
    category: "investment",
    note: "U Troyské unce se význam kódů A/B liší podle varianty produktu.",
  },
};

const normalizeText = (value: string | null | undefined): string =>
  String(value ?? "").replace(/\s+/g, " ").trim();

const normalizeProductCode = (value: string | null | undefined): string =>
  normalizeText(value).toUpperCase();

const normalizeContractNumberForMatch = (value: string | null | undefined): string =>
  normalizeText(value).replace(/\s+/g, "").toUpperCase();

const isLifeSplitProductCode = (product: string | null | undefined): boolean =>
  LIFE_SPLIT_PRODUCT_CODES.has(normalizeProductCode(product));

const hasSjednatelExtranetFromDetailLink = (
  product: string | null | undefined
): boolean => {
  const productCode = normalizeProductCode(product);
  return productCode.startsWith("CPP") || productCode.startsWith("UNIQA");
};

const usesB36CodeForProduct = (product: string | null | undefined): boolean => {
  const productCode = normalizeProductCode(product);
  return (
    productCode === "KOOP_FLEXI" ||
    productCode === "BHMK_PILLOW_UR_NM" ||
    /PILLOW.*(?:UR|NM)/.test(productCode)
  );
};

const b36HalfLabelForProduct = (product: string): string =>
  usesB36CodeForProduct(product) ? "50% z B36" : "50% z B3601";

const b36DeferredCodeForProduct = (product: string): string =>
  usesB36CodeForProduct(product) ? "B36" : "B3601";

const COMMISSION_AMOUNT_TOLERANCE = 10;
const MANAGER_COMMISSION_AMOUNT_TOLERANCE = 10;
const ANNUAL_PREMIUM_TOLERANCE = 12;
const MONEY_MATCH_TOLERANCE = 0.01;
const AUTO_PREMIUM_ANNIVERSARY_TOLERANCE_MONTHS = 2;

const normalizeCommissionTitle = (value: string | null | undefined): string =>
  normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{Letter}\p{Number}%]+/gu, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const inferStatementProductCategory = (rawCode: string): StatementProductCategory => {
  if (/^(?:TU_|INVESTIKA|EFEKTIKA|CON_)/.test(rawCode)) return "investment";
  if (/FLEXI|NEON|N_LIFE|N_RISK|PILLOW.*(?:UR|NM)/.test(rawCode)) return "life";
  if (/AUTO|AU_|ACP|PIL_AUTO|MOJEAUT|AUTOZ|NAMIRU/.test(rawCode)) return "auto";
  if (/DOM|SIMPLE|HAFAN|OBCAN|OD_ZAM/.test(rawCode)) return "property";
  if (/CEST|CIZIN/.test(rawCode)) return "travel";
  if (/COMFORT|CC/.test(rawCode)) return "comfort";
  return "unknown";
};

const statementProductCategoryLabel = (category: StatementProductCategory): string => {
  switch (category) {
    case "life":
      return "Životní";
    case "auto":
      return "Auto";
    case "property":
      return "Majetek / odpovědnost";
    case "travel":
      return "Cestovní";
    case "comfort":
      return "Comfort";
    case "investment":
      return "Investice";
    default:
      return "Nezařazeno";
  }
};

const resolveStatementProduct = (product: string): StatementProductMeta => {
  const rawCode = normalizeProductCode(product) || "NEZNAMY_PRODUKT";
  const known = KNOWN_STATEMENT_PRODUCTS[rawCode];
  const catalogMeta = known?.product ? PRODUCT_CATALOG[known.product] : null;
  const category = known?.category ?? catalogMeta?.category ?? inferStatementProductCategory(rawCode);

  return {
    rawCode,
    label: known?.label ?? catalogMeta?.label ?? rawCode,
    productKey: known?.product ?? null,
    category,
    usesAnnualPremiumBase: known?.usesAnnualPremiumBase ?? category === "life",
    note: known?.note,
  };
};

type StatementProductLogoMeta = {
  src: string;
  alt: string;
};

const statementProductLogoMeta = (
  product: StatementProductMeta
): StatementProductLogoMeta => {
  const catalogMeta = product.productKey ? PRODUCT_CATALOG[product.productKey] : null;
  if (catalogMeta?.institutionLogo) {
    return {
      src: catalogMeta.institutionLogo,
      alt: catalogMeta.institutionLabel,
    };
  }

  const rawCode = normalizeProductCode(product.rawCode);
  if (rawCode.startsWith("TU_")) return { src: "/icons/gold.png", alt: "Troyská unce" };
  if (rawCode.startsWith("CON_")) return { src: "/icons/conseq.png", alt: "Conseq" };
  if (rawCode === "INVESTIKA" || rawCode === "EFEKTIKA" || rawCode === "MONETIKA") {
    return { src: "/icons/invstk.png", alt: product.label };
  }
  if (rawCode.startsWith("CPP")) return { src: "/icons/cpp.png", alt: "ČPP" };
  if (rawCode.startsWith("KOO")) return { src: "/icons/koop-v2.png", alt: "Kooperativa" };
  if (rawCode.startsWith("UNIQA")) return { src: "/icons/uniqa.png", alt: "UNIQA" };
  if (rawCode.startsWith("CSOB") || rawCode.startsWith("ČSOB")) {
    return { src: "/icons/csob.png", alt: "ČSOB" };
  }
  if (rawCode.startsWith("ALL")) return { src: "/icons/allianz.png", alt: "Allianz" };
  if (rawCode.startsWith("PIL")) return { src: "/icons/pillow.png", alt: "Pillow" };
  if (rawCode.startsWith("SLA")) return { src: "/icons/slavialogo.png", alt: "SLAVIA" };
  if (rawCode.includes("COMFORT") || rawCode === "CC") {
    return { src: "/icons/cclogo.png", alt: "Comfort Commodity" };
  }

  switch (product.category) {
    case "life":
      return { src: "/icons/zivot.png", alt: "Životní pojištění" };
    case "auto":
      return { src: "/icons/icon_auto.png", alt: "Auto" };
    case "property":
      return { src: "/icons/icon_domex.png", alt: "Majetek" };
    case "travel":
      return { src: "/icons/icon_cestovko.png", alt: "Cestovní pojištění" };
    default:
      return { src: "/icons/produkt.png", alt: product.label };
  }
};

function StatementProductLogo({
  product,
  size = "sm",
}: {
  product: StatementProductMeta;
  size?: "xs" | "sm";
}) {
  const logo = statementProductLogoMeta(product);
  const boxClass = size === "xs" ? "h-5 w-5" : "h-6 w-6";
  const imageClass = size === "xs" ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <span
      className={`inline-flex ${boxClass} shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white`}
      title={logo.alt}
    >
      <Image
        src={logo.src}
        alt=""
        width={24}
        height={24}
        className={`${imageClass} object-contain`}
      />
    </span>
  );
}

const parseOptionalMoney = (value: string | null | undefined): number | null => {
  const normalized = String(value ?? "")
    .replace(/Kč/gi, "")
    .replace(/[−–]/g, "-")
    .replace(/\s/g, "")
    .replace(",", ".")
    .trim();
  if (!/\d/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseMoney = (value: string | null | undefined): number =>
  parseOptionalMoney(value) ?? 0;

const formatMoney = (value: number): string =>
  value.toLocaleString("cs-CZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatWholeMoney = (value: number): string =>
  value.toLocaleString("cs-CZ", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

const formatSystemDate = (value: number | string | null | undefined): string => {
  if (value == null || value === "") return "—";
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const paymentsPerYearForFrequency = (frequency: string | null | undefined): number => {
  switch (normalizeCommissionTitle(frequency)) {
    case "monthly":
    case "mesicne":
    case "mesicni":
      return 12;
    case "quarterly":
    case "ctvrtletne":
    case "ctvrtletni":
      return 4;
    case "semiannual":
    case "semi annual":
    case "pololetne":
    case "pololetni":
      return 2;
    case "annual":
    case "rocne":
    case "rocni":
    default:
      return 1;
  }
};

const paymentFrequencyLabel = (frequency: string | null | undefined): string => {
  switch (normalizeCommissionTitle(frequency)) {
    case "monthly":
    case "mesicne":
    case "mesicni":
      return "měsíčně";
    case "quarterly":
    case "ctvrtletne":
    case "ctvrtletni":
      return "čtvrtletně";
    case "semiannual":
    case "semi annual":
    case "pololetne":
    case "pololetni":
      return "pololetně";
    case "annual":
    case "rocne":
    case "rocni":
      return "ročně";
    default:
      return "bez frekvence";
  }
};

const paymentAmountWithFrequencyLabel = (
  amount: number,
  frequency: string | null | undefined
): string => {
  const frequencyLabel = paymentFrequencyLabel(frequency);
  return frequencyLabel === "bez frekvence"
    ? `${formatWholeMoney(amount)} Kč`
    : `${formatWholeMoney(amount)} Kč ${frequencyLabel}`;
};

const parseLocalDate = (
  value: number | string | Date | null | undefined
): Date | null => {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const normalized = normalizeText(value);
  const czechDate = normalized.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  if (czechDate) {
    const day = Number(czechDate[1]);
    const month = Number(czechDate[2]);
    const year = Number(czechDate[3]);
    if (day > 0 && month > 0 && month <= 12 && year > 1900) {
      return new Date(year, month - 1, day, 12);
    }
  }

  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
};

const parsePeriodEndDate = (period: string | null | undefined): Date | null => {
  const matches = [...normalizeText(period).matchAll(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/g)];
  const last = matches.at(-1);
  if (!last) return null;
  return parseLocalDate(last[0]);
};

const monthKeyFromDate = (date: Date | null | undefined): string | null => {
  if (!date || Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

const monthKeyFromStatementPeriod = (period: string | null | undefined): string | null =>
  monthKeyFromDate(parsePeriodEndDate(period));

const monthKeyIndex = (monthKey: string | null | undefined): number | null => {
  const match = normalizeText(monthKey).match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null;
  }
  return year * 12 + (month - 1);
};

const monthKeyFromIndex = (index: number): string => {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
};

const addMonthsToMonthKey = (
  monthKey: string | null | undefined,
  delta: number
): string | null => {
  const index = monthKeyIndex(monthKey);
  return index == null ? null : monthKeyFromIndex(index + delta);
};

const formatMonthKey = (monthKey: string | null | undefined): string => {
  const match = normalizeText(monthKey).match(/^(\d{4})-(\d{2})$/);
  return match ? `${match[2]}/${match[1]}` : "—";
};

const addYearsToLocalDate = (date: Date, years: number): Date =>
  new Date(date.getFullYear() + years, date.getMonth(), date.getDate(), 12);

const addMonthsToLocalDate = (date: Date, months: number): Date => {
  const firstOfTargetMonth = new Date(date.getFullYear(), date.getMonth() + months, 1, 12);
  const lastDayOfTargetMonth = new Date(
    firstOfTargetMonth.getFullYear(),
    firstOfTargetMonth.getMonth() + 1,
    0
  ).getDate();
  return new Date(
    firstOfTargetMonth.getFullYear(),
    firstOfTargetMonth.getMonth(),
    Math.min(date.getDate(), lastDayOfTargetMonth),
    12
  );
};

const formatLocalDate = (date: Date | null | undefined): string =>
  date
    ? date.toLocaleDateString("cs-CZ", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "—";

const toDateInputValue = (date: Date | null | undefined): string => {
  if (!date || Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const systemContractIsStorno = (
  contract: MatchedSystemContract | null | undefined
): boolean => contractLifecycleStatus(contract) === "storno";

const systemContractStatusLabel = (
  contract: MatchedSystemContract | null | undefined
): string => {
  const status = contractLifecycleStatus(contract);
  if (status === "storno") {
    const date = toDate(contract?.stornoDate);
    return date ? `storno od ${formatLocalDate(date)}` : "storno bez data";
  }
  if (status === "dozita") return "dožitá";
  return "aktivní";
};

const matchNeedsSystemStorno = (match: ContractMatchState | null): boolean => {
  const contract = matchedSystemContract(match);
  return Boolean(contract && !systemContractIsStorno(contract));
};

const stornoSystemUncertainty = (match: ContractMatchState | null): boolean =>
  isUnpairedContractMatch(match) || matchNeedsSystemStorno(match);

const suggestedStornoDateForStatement = (
  header: StatementHeader
): Date | null =>
  parseLocalDate(header.statementDate) ??
  parsePeriodEndDate(header.period) ??
  new Date();

const stornoUpdateEntryIds = (contract: MatchedSystemContract): string[] =>
  Array.from(
    new Set(
      [
        contract.id,
        ...(contract.lifePremiumChanges ?? []).map((change) => change.id),
      ].filter(Boolean)
    )
  );

const productLabelFromKey = (productKey: Product | null | undefined): string =>
  productKey ? PRODUCT_CATALOG[productKey]?.label ?? productKey : "—";

const normalizeStatementCommissionCode = (value: string | null | undefined): string =>
  String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");

const baseCommissionCodeForStatementComparison = (
  value: string | null | undefined
): string => {
  const code = normalizeStatementCommissionCode(value);
  const closingRoleMatch = code.match(/^(?:APZ|AP|AZ)(\d+)$/);
  return closingRoleMatch ? `A${closingRoleMatch[1]}` : code;
};

const isNeonInitialCommissionCode = (value: string | null | undefined): boolean => {
  const code = baseCommissionCodeForStatementComparison(value);
  return code === "A101" || code === "B0301";
};

const isLifePremiumIncreaseCommissionCode = (
  code: string | null | undefined
): boolean => {
  const cleanCode = normalizeStatementCommissionCode(code);
  return /^(?:NV(?:PZ?|Z)?|NB)\d+/.test(cleanCode);
};

const classifyLifeSplitCommissionCode = (
  code: string
): { kind: LifeSplitCommissionKind; label: string } => {
  const cleanCode = normalizeStatementCommissionCode(code);
  const comparableCode = baseCommissionCodeForStatementComparison(cleanCode);

  if (isLifePremiumIncreaseCommissionCode(cleanCode)) {
    return { kind: "increase", label: "Provize za navýšení smlouvy" };
  }
  if (comparableCode === "A101") {
    return {
      kind: "a101",
      label:
        cleanCode === "A101"
          ? "Provize A101"
          : `Provize ${cleanCode} (A101 - rozdělená role sjednatele)`,
    };
  }
  if (comparableCode === "B0301") return { kind: "b0301", label: "Provize B0301" };
  if (cleanCode === "B3601" || cleanCode === "B36" || cleanCode === "B036") {
    return { kind: "b3601", label: `Provize ${cleanCode}` };
  }
  if (cleanCode === "B4801" || cleanCode === "B48" || cleanCode === "B048") {
    return { kind: "b4801", label: `Provize ${cleanCode}` };
  }
  if (/^B10[1-4]$/.test(cleanCode)) {
    return { kind: "subsequent", label: `Následná provize ${cleanCode}` };
  }
  if (/^B20[1-6]$/.test(cleanCode)) {
    return { kind: "care", label: `Pečovatelská provize ${cleanCode}` };
  }
  if (cleanCode === "ATP101") return { kind: "tip", label: "Provize z TIPU" };
  return { kind: "unknown", label: `Nezařazený kód ${cleanCode || "-"}` };
};

const classifyGeneralCommissionCode = (
  product: string,
  code: string
): { kind: GeneralCommissionKind; label: string } => {
  const cleanCode = code.trim().toUpperCase();
  const cleanProduct = product.trim().toUpperCase();

  if (!cleanCode) return { kind: "unknown", label: "Nezařazený kód" };
  if (cleanCode === "ATP101") return { kind: "tip", label: "Provize z TIPU" };
  if (cleanProduct.startsWith("TU_")) {
    return {
      kind: "troyOunce",
      label: "Troyská unce - význam kódu závisí na variantě produktu",
    };
  }
  if (cleanCode === "KOMP") return { kind: "compensation", label: "Kompenzační provize" };
  if (cleanCode === "PK") return { kind: "office", label: "Prémie na kancelář" };
  if (cleanCode === "POK") return { kind: "penalty", label: "Pokuta" };
  if (/^PVYP[12]$/.test(cleanCode)) {
    return { kind: "gradual", label: "Provize s postupným vyplácením" };
  }
  if (isLifePremiumIncreaseCommissionCode(cleanCode)) {
    return { kind: "increase", label: "Provize za navýšení smlouvy" };
  }
  if (/^(?:APZ|AP|AZ)\d+/.test(cleanCode)) {
    return { kind: "closing", label: "Provize za uzavření - rozdělená role sjednatele" };
  }
  if (/^AC\d+/.test(cleanCode)) {
    return { kind: "closing", label: "Provize za uzavření - auta" };
  }
  if (/^A\d+/.test(cleanCode)) {
    return { kind: "closing", label: "Provize za uzavření smlouvy" };
  }
  if (/^(?:CPZ|CP|CZ)\d+/.test(cleanCode)) {
    return { kind: "unexpected", label: "Neočekávaná provize - rozdělená role sjednatele" };
  }
  if (/^C\d+/.test(cleanCode)) {
    return { kind: "unexpected", label: "Neočekávaná provize" };
  }
  if (/^BC\d+/.test(cleanCode)) {
    return { kind: "subsequent", label: "Následná provize - auta" };
  }
  if (/^(?:B30|B70|B03|B36|B036|B42|B48|B048)\d*$/.test(cleanCode)) {
    return { kind: "installment", label: "Splátka provize" };
  }
  if (/^B\d+/.test(cleanCode)) {
    return { kind: "subsequent", label: "Následná provize" };
  }

  return { kind: "unknown", label: `Nezařazený kód ${cleanCode}` };
};

const COMMISSION_CODE_RULES: CommissionCodeRule[] = [
  {
    codes: "A1-9",
    label: "Provize za uzavření smlouvy",
    category: "closing",
    note: "Ve výpisu se běžně používá i delší tvar, například A101.",
    matchers: [/^A\d+$/],
  },
  {
    codes: "AC1",
    label: "Provize za uzavření smlouvy - auta",
    category: "closing",
    matchers: [/^AC\d+$/],
  },
  {
    codes: "AP1",
    label:
      "Provize za uzavření - výplata pro sjednatele na pozici uzavírající, liší-li se od získatele",
    category: "closingRole",
    matchers: [/^AP\d+$/],
  },
  {
    codes: "APZ1",
    label:
      "Provize za uzavření - výplata pro sjednatele na pozici uzavírající, neliší-li se od získatele",
    category: "closingRole",
    matchers: [/^APZ\d+$/],
  },
  {
    codes: "AZ1",
    label:
      "Provize za uzavření - výplata pro sjednatele na pozici získatele, liší-li se od uzavírajícího",
    category: "closingRole",
    matchers: [/^AZ\d+$/],
  },
  {
    codes: "ATP101",
    label: "Provize z TIPU",
    category: "tip",
    note: "Páruje se přes TIP vazbu, ne jako vlastní sjednaná smlouva.",
    matchers: [/^ATP101$/],
  },
  {
    codes: "B1",
    label: "Následná provize od 2. roku dále nebo splátka 30 % po 2 měsících",
    category: "subsequent",
    matchers: [/^B1$/, /^B10\d*$/],
  },
  {
    codes: "B2",
    label: "Následná provize od dalšího roku dále nebo splátka 70 % po 2 letech",
    category: "subsequent",
    matchers: [/^B2$/, /^B20\d*$/],
  },
  {
    codes: "B3-9",
    label: "Následná provize",
    category: "subsequent",
    matchers: [/^B[3-9]$/, /^B[3-9]01$/],
  },
  {
    codes: "B0301",
    label: "Provize B0301 / karta klienta",
    category: "installment",
    matchers: [/^B0301$/],
  },
  {
    codes: "B30",
    label: "2. splátka provize pro smlouvy od 1.9.2014",
    category: "installment",
    matchers: [/^B30\d*$/],
  },
  {
    codes: "B70",
    label: "3. splátka provize pro smlouvy od 1.9.2014",
    category: "installment",
    matchers: [/^B70\d*$/],
  },
  {
    codes: "B03",
    label: "2. splátka provize pro smlouvy od 1.12.2016",
    category: "installment",
    matchers: [/^B03\d*$/],
  },
  {
    codes: "B36",
    label: "3. splátka provize pro smlouvy od 1.12.2016",
    category: "installment",
    matchers: [/^B36\d*$/, /^B036\d*$/],
  },
  {
    codes: "B42",
    label: "4. splátka provize pro smlouvy od 1.12.2016",
    category: "installment",
    matchers: [/^B42\d*$/],
  },
  {
    codes: "BC1",
    label: "Následná provize - auta",
    category: "subsequent",
    matchers: [/^BC\d+$/],
  },
  {
    codes: "C1",
    label: "Neočekávaná provize",
    category: "unexpected",
    matchers: [/^C\d+$/],
  },
  {
    codes: "CP1",
    label:
      "Neočekávaná provize - výplata pro sjednatele na pozici uzavírající, liší-li se od získatele",
    category: "unexpected",
    matchers: [/^CP\d+$/],
  },
  {
    codes: "CPZ1",
    label:
      "Neočekávaná provize - výplata pro sjednatele na pozici uzavírající, neliší-li se od získatele",
    category: "unexpected",
    matchers: [/^CPZ\d+$/],
  },
  {
    codes: "CZ1",
    label:
      "Neočekávaná provize - výplata pro sjednatele na pozici získatele, liší-li se od uzavírajícího",
    category: "unexpected",
    matchers: [/^CZ\d+$/],
  },
  {
    codes: "KOMP",
    label: "Kompenzační provize - Refresh",
    category: "adjustment",
    matchers: [/^KOMP$/],
  },
  {
    codes: "NV1-3 / NB",
    label: "Provize za navýšení smlouvy",
    category: "increase",
    note: "NB se ve výpisech používá jako varianta kódu navýšení.",
    matchers: [/^NV[1-3]$/, /^NB\d*$/],
  },
  {
    codes: "NVP1-3",
    label:
      "Provize za navýšení - výplata pro sjednatele na pozici uzavírající, liší-li se od získatele",
    category: "increase",
    matchers: [/^NVP[1-3]$/],
  },
  {
    codes: "NVPZ1-3",
    label:
      "Provize za navýšení - výplata pro sjednatele na pozici uzavírající, neliší-li se od získatele",
    category: "increase",
    matchers: [/^NVPZ[1-3]$/],
  },
  {
    codes: "NVZ1-3",
    label:
      "Provize za navýšení - výplata pro sjednatele na pozici získatele, liší-li se od uzavírajícího",
    category: "increase",
    matchers: [/^NVZ[1-3]$/],
  },
  {
    codes: "PK",
    label: "Prémie na kancelář",
    category: "office",
    matchers: [/^PK$/],
  },
  {
    codes: "POK",
    label: "Pokuta",
    category: "office",
    matchers: [/^POK$/],
  },
  {
    codes: "PVYP1",
    label: "Provize s postupným vyplácením",
    category: "other",
    matchers: [/^PVYP1$/],
  },
  {
    codes: "PVYP2",
    label: "Provize s postupným vyplácením - jen produkt Exclusive",
    category: "other",
    matchers: [/^PVYP2$/],
  },
];

const TROY_OUNCE_COMMISSION_CODE_RULES: CommissionCodeRule[] = [
  {
    codes: "A1",
    label: "TU_JN - za nákup; TU_ZP - z poplatku, Přednostní; TU_ZS - z poplatku",
    category: "troyOunce",
    matchers: [/^A1$/],
  },
  {
    codes: "A2",
    label: "TU_JN - přirážka zprostředkovatele; TU_ZP - z měsíční splátky, Poměrně",
    category: "troyOunce",
    matchers: [/^A2$/],
  },
  {
    codes: "A3",
    label:
      "TU_ZP - z poplatku nebo měsíční splátky, Postupně; TU_ZP - přirážka zprostředkovatele",
    category: "troyOunce",
    matchers: [/^A3$/],
  },
  {
    codes: "B1",
    label: "TU_ZS - přirážka zprostředkovatele",
    category: "troyOunce",
    matchers: [/^B1$/],
  },
];

const classifyContractStatusCode = (
  code: string
): Pick<ContractStatusRule, "category" | "importDecision"> => {
  if (code === "A001") {
    return {
      category: "active",
      importDecision: "Lze párovat jako běžnou aktivní smlouvu.",
    };
  }
  if (code.startsWith("C") || code.startsWith("N")) {
    return {
      category: "pending",
      importDecision: "Nová nebo čekající smlouva. Před automatickým uložením ověřit stav.",
    };
  }
  if (code === "H001") {
    return {
      category: "matured",
      importDecision: "Dožitá smlouva. Nepárovat jako novou sjednávací provizi.",
    };
  }
  if (code === "Q001") {
    return {
      category: "transferred",
      importDecision: "Převedená smlouva. Vyžaduje kontrolu vlastníka a původu provize.",
    };
  }
  if (code.startsWith("S")) {
    return {
      category: "storno",
      importDecision: "Storno. Ukládat jako storno/korekci, ne jako běžné vyplacení.",
    };
  }
  if (code.startsWith("X")) {
    return {
      category: "invalid",
      importDecision: "Chybná nebo nerealizovaná smlouva. Blokovat automatické uložení.",
    };
  }
  return {
    category: "unknown",
    importDecision: "Neznámý stav. Ruční kontrola.",
  };
};

const extractHeader = (html: string, doc: Document): StatementHeader => {
  const plainText = normalizeText(doc.body.textContent);

  return {
    advisorNumber: plainText.match(/Číslo poradce:\s*([0-9]+)/i)?.[1] ?? null,
    period:
      plainText.match(
        /Období:\s*([0-9]{2}\.[0-9]{2}\.[0-9]{4}\s*-\s*[0-9]{2}\.[0-9]{2}\.[0-9]{4})/i
      )?.[1] ?? null,
    statementNumber: plainText.match(/Číslo výpisu:\s*([0-9]+)/i)?.[1] ?? null,
    statementDate: html.match(/ze dne\s+([0-9]{2}\.[0-9]{2}\.[0-9]{4})/i)?.[1] ?? null,
  };
};

const rowCells = (row: HTMLTableRowElement): string[] =>
  Array.from(row.cells).map((cell) => normalizeText(cell.textContent));

const isHtmlTableElement = (element: Element): element is HTMLTableElement =>
  element.tagName.toLowerCase() === "table";

const directTableChildren = (section: Element): HTMLTableElement[] =>
  Array.from(section.children).filter(isHtmlTableElement);

const directTableAfterBoldHeading = (
  section: Element,
  heading: string
): HTMLTableElement | null => {
  const normalizedHeading = normalizeText(heading).toUpperCase();
  let seenHeading = false;

  for (const child of Array.from(section.children)) {
    if (
      child.tagName.toLowerCase() === "b" &&
      normalizeText(child.textContent).toUpperCase() === normalizedHeading
    ) {
      seenHeading = true;
      continue;
    }

    if (seenHeading && isHtmlTableElement(child)) return child;
  }

  return null;
};

const normalizeExternalHref = (href: string | null | undefined): string | null => {
  const cleanHref = normalizeText(href);
  if (!cleanHref || cleanHref.toLowerCase().startsWith("javascript:")) return null;

  try {
    return new URL(cleanHref, "https://sjednatel.bohemiaservis.cz/").toString();
  } catch {
    return cleanHref;
  }
};

const contractDetailUrlFromRow = (row: HTMLTableRowElement): string | null =>
  normalizeExternalHref(
    row.cells[0]?.querySelector<HTMLAnchorElement>("a[href]")?.getAttribute("href")
  );

const parseContractStatusRules = (doc: Document): ContractStatusRule[] => {
  const section = doc.getElementById("kody_stavu_smluv");
  if (!section) return [];

  return Array.from(section.querySelectorAll("tr"))
    .map(rowCells)
    .filter((cells) => /^[A-Z][A-Z0-9]{3,5}$/.test((cells[0] ?? "").trim()))
    .map((cells) => {
      const code = (cells[0] ?? "").trim();
      return {
        code,
        label: cells[1] ?? "",
        ...classifyContractStatusCode(code),
      };
    });
};

const parseCommissionRows = (doc: Document): CommissionRow[] => {
  const section = doc.getElementById("provize");
  if (!section) return [];
  const table = directTableChildren(section)[0];
  if (!table) return [];

  return Array.from(table.tBodies[0]?.rows ?? [])
    .map((row) => ({ cells: rowCells(row), detailUrl: contractDetailUrlFromRow(row) }))
    .filter(({ cells }) => /^\d+$/.test(cells[0] ?? "") && cells.length >= 14)
    .map(({ cells, detailUrl }) => {
      const type = (cells[7] ?? "").trim().toUpperCase();
      const lifeSplitClassification = classifyLifeSplitCommissionCode(type);

      return {
        id: cells[0] ?? "",
        detailUrl,
        contractNumber: cells[1] ?? "",
        signedAt: cells[2] ?? "",
        validFrom: cells[3] ?? "",
        client: cells[4] ?? "",
        role: cells[5] ?? "",
        product: (cells[6] ?? "").trim(),
        type,
        base: parseMoney(cells[8]),
        percent: cells[10] ?? "",
        career: cells[11] ?? "",
        commission: parseMoney(cells[12]),
        reserveFund: parseMoney(cells[13]),
        lifeSplitKind: lifeSplitClassification.kind,
        lifeSplitLabel: lifeSplitClassification.label,
      };
    });
};

const parseDeductionRows = (doc: Document): DeductionCommissionRow[] => {
  const section = doc.getElementById("odecty");
  const table = section ? directTableChildren(section)[0] : null;
  if (!table) return [];

  return Array.from(table.tBodies[0]?.rows ?? [])
    .map((row) => ({ cells: rowCells(row), detailUrl: contractDetailUrlFromRow(row) }))
    .filter(({ cells }) => /^\d+$/.test(cells[0] ?? "") && cells.length >= 13)
    .map(({ cells, detailUrl }) => ({
      id: cells[0] ?? "",
      detailUrl,
      contractNumber: cells[1] ?? "",
      signedAt: cells[2] ?? "",
      client: cells[3] ?? "",
      role: cells[4] ?? "",
      product: (cells[5] ?? "").trim(),
      type: (cells[6] ?? "").trim().toUpperCase(),
      base: parseMoney(cells[7]),
      percent: cells[9] ?? "",
      career: cells[10] ?? "",
      commission: parseMoney(cells[11]),
      reserveFund: parseMoney(cells[12]),
    }))
    .filter((row) => row.contractNumber.length > 0);
};

const moneyAmountsMatch = (left: number, right: number): boolean =>
  Math.abs(left - right) <= MONEY_MATCH_TOLERANCE;

const normalizedRowText = (value: string | null | undefined): string =>
  normalizeText(value).toUpperCase().replace(/\s+/g, "");

const deductionOffsetsCommissionRow = (
  row: CommissionRow,
  deduction: DeductionCommissionRow
): boolean =>
  row.commission > 0 &&
  deduction.commission < 0 &&
  normalizedRowText(row.contractNumber) === normalizedRowText(deduction.contractNumber) &&
  normalizedRowText(row.product) === normalizedRowText(deduction.product) &&
  normalizedRowText(row.type) === normalizedRowText(deduction.type) &&
  normalizedRowText(row.career) === normalizedRowText(deduction.career) &&
  normalizedRowText(row.percent) === normalizedRowText(deduction.percent) &&
  moneyAmountsMatch(row.base, deduction.base) &&
  moneyAmountsMatch(row.commission, Math.abs(deduction.commission)) &&
  moneyAmountsMatch(row.reserveFund, Math.abs(deduction.reserveFund));

const filterCommissionRowsOffsetByDeductions = (
  commissionRows: CommissionRow[],
  deductionRows: DeductionCommissionRow[]
): CommissionRow[] => {
  if (deductionRows.length === 0) return commissionRows;

  const usedDeductionIndexes = new Set<number>();
  return commissionRows.filter((row) => {
    const matchIndex = deductionRows.findIndex(
      (deduction, index) =>
        !usedDeductionIndexes.has(index) && deductionOffsetsCommissionRow(row, deduction)
    );
    if (matchIndex < 0) return true;

    usedDeductionIndexes.add(matchIndex);
    return false;
  });
};

const commissionRowCorrectionKey = (
  statementKey: string,
  row: Pick<
    CommissionRow,
    | "id"
    | "contractNumber"
    | "product"
    | "type"
    | "base"
    | "percent"
    | "career"
    | "commission"
    | "reserveFund"
  >
): string =>
  [
    statementKey,
    row.id,
    normalizedRowText(row.contractNumber),
    normalizedRowText(row.product),
    normalizedRowText(row.type),
    row.base,
    normalizedRowText(row.percent),
    normalizedRowText(row.career),
    row.commission,
    row.reserveFund,
  ].join("|");

const commissionRowCanReplaceDeduction = (
  row: CommissionRow,
  deduction: DeductionCommissionRow
): boolean =>
  row.commission > 0 &&
  normalizedRowText(row.contractNumber) === normalizedRowText(deduction.contractNumber) &&
  normalizedRowText(row.product) === normalizedRowText(deduction.product) &&
  normalizedRowText(row.type) === normalizedRowText(deduction.type) &&
  moneyAmountsMatch(row.base, deduction.base) &&
  !deductionOffsetsCommissionRow(row, deduction);

const statementCorrectionSortValue = (
  statement: ParsedStatement,
  index: number
): number => {
  const periodEnd = parsePeriodEndDate(statement.header.period)?.getTime();
  if (periodEnd != null && Number.isFinite(periodEnd)) return periodEnd;
  const statementDate = parseLocalDate(statement.header.statementDate)?.getTime();
  if (statementDate != null && Number.isFinite(statementDate)) return statementDate;
  const statementNumber = Number(statement.header.statementNumber);
  if (Number.isFinite(statementNumber)) return statementNumber;
  return index;
};

const emptyStatementCorrectionContext = (): StatementCorrectionContext => ({
  correctedRowKeys: new Set<string>(),
  correctedRowLabels: new Map<string, string>(),
  correctedRowDetails: new Map<string, string>(),
});

const buildStatementCorrectionContext = (
  statements: ParsedStatement[]
): StatementCorrectionContext => {
  if (statements.length < 2) return emptyStatementCorrectionContext();

  const ordered = statements
    .map((statement, index) => ({
      statement,
      statementKey: statementDiscrepancyKey(statement),
      order: statementCorrectionSortValue(statement, index),
      index,
    }))
    .sort((left, right) => left.order - right.order || left.index - right.index);

  const correctedRowKeys = new Set<string>();
  const correctedRowLabels = new Map<string, string>();
  const correctedRowDetails = new Map<string, string>();

  for (let currentIndex = 1; currentIndex < ordered.length; currentIndex += 1) {
    const current = ordered[currentIndex];
    if (current.statement.deductionRows.length === 0) continue;

    for (const deduction of current.statement.deductionRows) {
      const replacement = current.statement.commissionRows.find((row) =>
        commissionRowCanReplaceDeduction(row, deduction)
      );
      if (!replacement) continue;

      for (let previousIndex = currentIndex - 1; previousIndex >= 0; previousIndex -= 1) {
        const previous = ordered[previousIndex];
        const correctedRow = previous.statement.commissionRows.find(
          (row) =>
            !correctedRowKeys.has(commissionRowCorrectionKey(previous.statementKey, row)) &&
            deductionOffsetsCommissionRow(row, deduction)
        );
        if (!correctedRow) continue;

        const key = commissionRowCorrectionKey(previous.statementKey, correctedRow);
        const correctionTarget =
          current.statement.header.statementNumber ?? current.statement.fileName;
        const careerChanged =
          normalizedRowText(correctedRow.career) !== normalizedRowText(replacement.career);
        correctedRowKeys.add(key);
        correctedRowLabels.set(
          key,
          careerChanged ? "Oprava kariérního stupně" : "Opraveno navazujícím výpisem"
        );
        correctedRowDetails.set(
          key,
          careerChanged
            ? `Původně vyplaceno na Kar. ${correctedRow.career || "—"} (${formatMoney(correctedRow.commission)} Kč), navazující výpis ${correctionTarget} to odečetl a vyplatil na Kar. ${replacement.career || "—"} (${formatMoney(replacement.commission)} Kč).`
            : `Navazující výpis ${correctionTarget} odečetl původní provizi ${formatMoney(correctedRow.commission)} Kč a nahradil ji novou výplatou ${formatMoney(replacement.commission)} Kč.`
        );
        break;
      }
    }
  }

  return { correctedRowKeys, correctedRowLabels, correctedRowDetails };
};

const rowsForStatementReview = <T extends CommissionRow>(
  statementKey: string,
  rows: T[],
  correctionContext?: StatementCorrectionContext
): T[] => {
  if (!correctionContext || correctionContext.correctedRowKeys.size === 0) return rows;
  return rows.filter(
    (row) => !correctionContext.correctedRowKeys.has(commissionRowCorrectionKey(statementKey, row))
  );
};

const correctedStatementRowsForDisplay = <T extends CommissionRow>(
  statementKey: string,
  rows: T[],
  correctionContext?: StatementCorrectionContext
): T[] => {
  if (!correctionContext || correctionContext.correctedRowKeys.size === 0) return [];
  return rows.filter((row) =>
    correctionContext.correctedRowKeys.has(commissionRowCorrectionKey(statementKey, row))
  );
};

const correctedRowsLabel = (
  statementKey: string,
  rows: CommissionRow[],
  correctionContext?: StatementCorrectionContext
): string | null => {
  const corrected = correctedStatementRowsForDisplay(statementKey, rows, correctionContext);
  if (corrected.length === 0) return null;
  const labels = corrected
    .map((row) =>
      correctionContext?.correctedRowLabels.get(commissionRowCorrectionKey(statementKey, row))
    )
    .filter((label): label is string => Boolean(label));
  return labels[0] ?? "Opraveno navazujícím výpisem";
};

const correctedRowsDetails = (
  statementKey: string,
  rows: CommissionRow[],
  correctionContext?: StatementCorrectionContext
): string[] => {
  const corrected = correctedStatementRowsForDisplay(statementKey, rows, correctionContext);
  if (corrected.length === 0) return [];

  const details = corrected
    .map((row) =>
      correctionContext?.correctedRowDetails.get(commissionRowCorrectionKey(statementKey, row))
    )
    .filter((detail): detail is string => Boolean(detail));

  return [...new Set(details)];
};

const parseStatementPayoutTotal = (doc: Document): number | null => {
  for (const table of Array.from(doc.querySelectorAll("table"))) {
    const rows = Array.from(table.rows).map(rowCells);
    const headerCells = rows.find((cells) => {
      const normalizedCells = cells.map(normalizeCommissionTitle);
      return (
        normalizedCells.includes("provizni narok") &&
        normalizedCells.includes("k vyplate")
      );
    });
    if (!headerCells) continue;

    const payoutColumnIndex = headerCells.findIndex(
      (cell) => normalizeCommissionTitle(cell) === "k vyplate"
    );
    if (payoutColumnIndex < 0) continue;

    for (const cells of [...rows].reverse()) {
      const totalLabelIndex = cells.findIndex(
        (cell) => normalizeCommissionTitle(cell) === "celkem"
      );
      if (totalLabelIndex < 0) continue;

      const payoutTotal = parseOptionalMoney(cells[payoutColumnIndex]);
      if (payoutTotal != null) return payoutTotal;

      const fallbackTotal = [...cells]
        .reverse()
        .map((cell) => parseOptionalMoney(cell))
        .find((value) => value != null);
      if (fallbackTotal != null) return fallbackTotal;
    }
  }

  return null;
};

const parseStornoRows = (doc: Document): StornoCommissionRow[] => {
  const explicitSection = doc.getElementById("storna");
  const provizeSection = doc.getElementById("provize");
  const table =
    explicitSection && isHtmlTableElement(explicitSection)
      ? explicitSection
      : explicitSection?.querySelector<HTMLTableElement>("table") ??
        (provizeSection ? directTableAfterBoldHeading(provizeSection, "STORNA") : null);
  if (!table) return [];

  return Array.from(table.tBodies[0]?.rows ?? [])
    .map((row) => ({ cells: rowCells(row), detailUrl: contractDetailUrlFromRow(row) }))
    .filter(({ cells }) => /^\d+$/.test(cells[0] ?? "") && cells.length >= 14)
    .map(({ cells, detailUrl }) => ({
      id: cells[0] ?? "",
      detailUrl,
      contractNumber: cells[1] ?? "",
      signedAt: cells[2] ?? "",
      client: cells[3] ?? "",
      role: cells[4] ?? "",
      product: (cells[5] ?? "").trim(),
      type: (cells[6] ?? "").trim().toUpperCase(),
      statusCode: (cells[7] ?? "").trim().toUpperCase(),
      base: parseMoney(cells[8]),
      percent: cells[10] ?? "",
      career: cells[11] ?? "",
      commission: parseMoney(cells[12]),
      reserveFund: parseMoney(cells[13]),
    }))
    .filter((row) => row.contractNumber.length > 0);
};

const parseOtherPayments = (doc: Document): OtherPayment[] => {
  const section = doc.getElementById("ostatni_platby");
  if (!section) return [];

  return Array.from(section.querySelectorAll("tr"))
    .map(rowCells)
    .filter((cells) => {
      const description = cells[0] ?? "";
      return (
        cells.length >= 2 &&
        !/^Popis$/i.test(description) &&
        !/^Počet položek:/i.test(description)
      );
    })
    .map((cells) => {
      const description = cells[0] ?? "";
      const amount = parseMoney(cells[1]);
      return {
        description,
        contractNumber: description.match(/smlouvy\s+(\d+)/i)?.[1] ?? null,
        amount,
        isB36Half: /50\s*%[\s\S]*(?:provize\s*)?B(?:036|36|3601)\b/i.test(description),
        isStorno: /^Storno/i.test(description),
      };
    });
};

const parseManagerCommissionRows = (
  table: HTMLTableElement,
  isStorno: boolean
): ManagerCommissionRow[] =>
  Array.from(table.tBodies[0]?.rows ?? [])
    .map((row) => ({ cells: rowCells(row), detailUrl: contractDetailUrlFromRow(row) }))
    .filter(({ cells }) => /^\d+$/.test(cells[0] ?? "") && cells.length >= 13)
    .map(({ cells, detailUrl }) => ({
      id: cells[0] ?? "",
      detailUrl,
      contractNumber: cells[1] ?? "",
      signedAt: cells[2] ?? "",
      client: cells[3] ?? "",
      role: cells[4] ?? "",
      product: (cells[5] ?? "").trim(),
      type: (cells[6] ?? "").trim().toUpperCase(),
      base: parseMoney(cells[7]),
      percent: cells[9] ?? "",
      career: cells[10] ?? "",
      commission: parseMoney(cells[11]),
      reserveFund: parseMoney(cells[12]),
      isStorno,
    }))
    .filter((row) => row.contractNumber.length > 0);

const parseManagerCommissions = (doc: Document): ManagerCommissionAdvisor[] => {
  const section = doc.getElementById("manazer");
  const table = section?.querySelector("table");
  const tbody = table?.tBodies[0];
  if (!tbody) return [];

  const directRows = Array.from(tbody.rows);
  const advisors: ManagerCommissionAdvisor[] = [];

  for (const row of directRows) {
    if (row.classList.contains("toggle")) continue;
    const cells = rowCells(row);
    const advisorNumber = cells[0]?.match(/\d{6,}/)?.[0] ?? "";
    if (!advisorNumber || cells.length < 8) continue;

    const detailId = row.querySelector("a")?.getAttribute("href")?.match(/manazer\d+/)?.[0] ?? "";
    const detailRow = detailId
      ? (doc.getElementById(detailId) as HTMLTableRowElement | null)
      : null;
    const detailCell = detailRow?.cells[0];
    const rows: ManagerCommissionRow[] = [];
    let detailTableIsStorno = false;

    for (const child of Array.from(detailCell?.children ?? [])) {
      if (child.tagName === "B") {
        detailTableIsStorno = normalizeText(child.textContent).toUpperCase().includes("STORNA");
      }

      if (child.tagName === "TABLE") {
        rows.push(...parseManagerCommissionRows(child as HTMLTableElement, detailTableIsStorno));
      }
    }

    advisors.push({
      advisorNumber,
      advisorName: cells[1] ?? "",
      position: cells[2] ?? "",
      contractCount: Number.parseInt((cells[3] ?? "0").replace(/\D/g, ""), 10) || 0,
      commission: parseMoney(cells[4]),
      stornos: parseMoney(cells[5]),
      deductions: parseMoney(cells[6]),
      reserveFund: parseMoney(cells[7]),
      rows,
    });
  }

  return advisors;
};

const buildLifeSplitContracts = (
  commissionRows: CommissionRow[],
  otherPayments: OtherPayment[]
): LifeSplitContractPreview[] => {
  const grouped = new Map<string, LifeSplitContractPreview>();
  const splitRows = commissionRows.filter((row) => isLifeSplitProductCode(row.product));

  for (const row of splitRows) {
    const product = resolveStatementProduct(row.product);
    const key = `${product.rawCode}:${row.contractNumber || row.id}`;
    const existing =
      grouped.get(key) ??
      ({
        productCode: product.rawCode,
        productLabel: product.label,
        contractNumber: row.contractNumber,
        client: row.client,
        signedAt: row.signedAt,
        validFrom: row.validFrom,
        annualPremium: row.base,
        rows: [],
        b36Payments: [],
      } satisfies LifeSplitContractPreview);

    existing.rows.push(row);
    if (!existing.annualPremium && row.base) existing.annualPremium = row.base;
    grouped.set(key, existing);
  }

  const keysByContractNumber = [...grouped.entries()].reduce<Record<string, string[]>>(
    (groups, [key, contract]) => {
      if (!contract.contractNumber) return groups;
      groups[contract.contractNumber] = [...(groups[contract.contractNumber] ?? []), key];
      return groups;
    },
    {}
  );

  for (const payment of otherPayments) {
    if (payment.isStorno) continue;
    if (!payment.isB36Half) continue;
    const contractNumber = payment.contractNumber;
    if (!contractNumber) continue;

    for (const key of keysByContractNumber[contractNumber] ?? []) {
      grouped.get(key)?.b36Payments.push(payment);
    }
  }

  return [...grouped.values()].sort((a, b) =>
    a.contractNumber.localeCompare(b.contractNumber, "cs") ||
    a.productLabel.localeCompare(b.productLabel, "cs")
  );
};

const buildOtherProductContracts = (
  commissionRows: CommissionRow[],
  otherPayments: OtherPayment[]
): OtherProductContractPreview[] => {
  const grouped = new Map<string, OtherProductContractPreview>();
  const rows = commissionRows.filter((row) => !isLifeSplitProductCode(row.product));

  for (const row of rows) {
    const key = row.contractNumber || row.id;
    const existing =
      grouped.get(key) ??
      ({
        key,
        contractNumber: row.contractNumber,
        client: row.client,
        signedAt: row.signedAt,
        validFrom: row.validFrom,
        rows: [],
        b36Payments: [],
      } satisfies OtherProductContractPreview);

    existing.rows.push(row);
    grouped.set(key, existing);
  }

  for (const payment of otherPayments) {
    if (payment.isStorno) continue;
    if (!payment.isB36Half || !payment.contractNumber) continue;

    const existing = grouped.get(payment.contractNumber);
    if (!existing) continue;

    existing.b36Payments.push(payment);
  }

  return [...grouped.values()].sort((a, b) => {
    return a.contractNumber.localeCompare(b.contractNumber, "cs");
  });
};

const findUnmatchedB36Payments = (
  commissionRows: CommissionRow[],
  otherPayments: OtherPayment[]
): OtherPayment[] => {
  const contractNumbersInRows = new Set(commissionRows.map((row) => row.contractNumber));
  const pairedB36Indexes = b36OffsetPairIndexes(otherPayments);

  return otherPayments.filter(
    (payment, index) =>
      payment.isB36Half &&
      !payment.isStorno &&
      payment.amount > COMMISSION_AMOUNT_TOLERANCE &&
      !pairedB36Indexes.has(index) &&
      (!payment.contractNumber || !contractNumbersInRows.has(payment.contractNumber))
  );
};

const parseStatementHtml = (html: string, fileName: string): ParsedStatement => {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const payoutTotal = parseStatementPayoutTotal(doc);
  const rawCommissionRows = parseCommissionRows(doc);
  const deductionRows = parseDeductionRows(doc);
  const commissionRows = filterCommissionRowsOffsetByDeductions(
    rawCommissionRows,
    deductionRows
  );
  const stornoRows = parseStornoRows(doc);
  const otherPayments = parseOtherPayments(doc);
  const contractStatusRules = parseContractStatusRules(doc);
  const managerCommissions = parseManagerCommissions(doc);
  const lifeSplitContracts = buildLifeSplitContracts(commissionRows, otherPayments);
  const otherProductContracts = buildOtherProductContracts(commissionRows, otherPayments);
  const unmatchedB36Payments = findUnmatchedB36Payments(commissionRows, otherPayments);
  const parseWarnings: string[] = [];

  if (!doc.getElementById("provize")) {
    parseWarnings.push("Ve výpisu nebyla nalezena sekce Záloha za smlouvy.");
  }
  if (!doc.getElementById("kody_stavu_smluv")) {
    parseWarnings.push("Ve výpisu nebyla nalezena legenda kódů stavů smluv.");
  }

  return {
    fileName,
    header: extractHeader(html, doc),
    payoutTotal,
    commissionRows,
    deductionRows,
    stornoRows,
    otherPayments,
    contractStatusRules,
    managerCommissions,
    lifeSplitContracts,
    otherProductContracts,
    unmatchedB36Payments,
    parseWarnings,
  };
};

const readStatementFile = async (file: File): Promise<StatementFileRead> => {
  const buffer = await file.arrayBuffer();
  const html = new TextDecoder("iso-8859-2").decode(buffer);
  return {
    html,
    statement: parseStatementHtml(html, file.name),
  };
};

const statementFileReadSortValue = (
  file: StatementFileRead,
  index: number
): number => statementCorrectionSortValue(file.statement, index);

const sumAmounts = <T,>(items: T[], pickAmount: (item: T) => number): number =>
  Math.round(
    items.reduce((sum, item) => {
      const amount = pickAmount(item);
      return Number.isFinite(amount) ? sum + amount : sum;
    }, 0) * 100
  ) / 100;

const savedStatementCountLabel = (count: number): string => {
  if (count === 1) return "Výpis uložen pro provizní kalendář.";
  if (count >= 2 && count <= 4) return `${count} výpisy uloženy pro provizní kalendář.`;
  return `${count} výpisů uloženo pro provizní kalendář.`;
};

const isProcessedSavedStatement = (statement: SavedCommissionStatement): boolean =>
  typeof statement.processedAtMs === "number" && Number.isFinite(statement.processedAtMs);

const savedStatementHistorySortValue = (statement: SavedCommissionStatement): number =>
  (typeof statement.statementChronologyMs === "number" && Number.isFinite(statement.statementChronologyMs)
    ? statement.statementChronologyMs
    : null) ??
  (typeof statement.periodStartMs === "number" && Number.isFinite(statement.periodStartMs)
    ? statement.periodStartMs
    : null) ??
  (typeof statement.processedAtMs === "number" && Number.isFinite(statement.processedAtMs)
    ? statement.processedAtMs
    : 0);

const fetchProcessedCommissionStatementHistory = async (
  currentUser: FirebaseUser
): Promise<SavedCommissionStatement[]> => {
  const request = async (forceRefreshToken = false) => {
    const token = await currentUser.getIdToken(forceRefreshToken);
    return fetch("/api/commission-statements?limit=240", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
  };

  let response = await request(false);
  if (response.status === 401) {
    response = await request(true);
  }

  const payload = (await response.json().catch(() => null)) as
    | SavedCommissionStatementsResponse
    | null;

  if (!response.ok || payload?.ok !== true || !Array.isArray(payload.items)) {
    throw new Error(payload?.error || "Historii zpracovaných výpisů se nepodařilo načíst.");
  }

  return payload.items
    .filter(isProcessedSavedStatement)
    .sort((left, right) => savedStatementHistorySortValue(right) - savedStatementHistorySortValue(left));
};

const sumProcessingResults = (
  results: StatementProcessingResult[]
): StatementProcessingSummary =>
  results.reduce<StatementProcessingSummary>(
    (summary, result) => ({
      payoutRows: summary.payoutRows + (result.payoutRows ?? 0),
      contractsMatched: summary.contractsMatched + (result.contractsMatched ?? 0),
      contractsWithPayoutChanges:
        summary.contractsWithPayoutChanges + (result.contractsWithPayoutChanges ?? 0),
      payoutRecordsAdded: summary.payoutRecordsAdded + (result.payoutRecordsAdded ?? 0),
      payoutRecordsExisting:
        summary.payoutRecordsExisting + (result.payoutRecordsExisting ?? 0),
      payoutRecordsUpdated: summary.payoutRecordsUpdated + (result.payoutRecordsUpdated ?? 0),
      coefficientOverridesApplied:
        summary.coefficientOverridesApplied + (result.coefficientOverridesApplied ?? 0),
      duplicatePayoutRowsSkipped:
        summary.duplicatePayoutRowsSkipped + (result.duplicatePayoutRowsSkipped ?? 0),
      premiumUpdates: summary.premiumUpdates + (result.premiumUpdates ?? 0),
      olderPremiumUpdatesSkipped:
        summary.olderPremiumUpdatesSkipped + (result.olderPremiumUpdatesSkipped ?? 0),
      accountingRepairDrafts:
        summary.accountingRepairDrafts + (result.accountingRepairDrafts ?? 0),
      externalUpdateTasks: summary.externalUpdateTasks + (result.externalUpdateTasks ?? 0),
      contractsUpdated: summary.contractsUpdated + (result.contractsUpdated ?? 0),
      notFoundContracts: [
        ...summary.notFoundContracts,
        ...(result.notFoundContracts ?? []),
      ],
      ambiguousContracts: [
        ...summary.ambiguousContracts,
        ...(result.ambiguousContracts ?? []),
      ],
      skippedContracts: [
        ...summary.skippedContracts,
        ...(result.skippedContracts ?? []),
      ],
      errors: [...summary.errors, ...(result.errors ?? [])],
    }),
    {
      payoutRows: 0,
      contractsMatched: 0,
      contractsWithPayoutChanges: 0,
      payoutRecordsAdded: 0,
      payoutRecordsExisting: 0,
      payoutRecordsUpdated: 0,
      coefficientOverridesApplied: 0,
      duplicatePayoutRowsSkipped: 0,
      premiumUpdates: 0,
      olderPremiumUpdatesSkipped: 0,
      accountingRepairDrafts: 0,
      externalUpdateTasks: 0,
      contractsUpdated: 0,
      notFoundContracts: [] as string[],
      ambiguousContracts: [] as string[],
      skippedContracts: [] as string[],
      errors: [] as string[],
    }
  );

const processedStatementLabel = (
  count: number,
  results: StatementProcessingResult[]
): string => {
  const summary = sumProcessingResults(results);
  const base = [
    savedStatementCountLabel(count),
    `Upraveno ${summary.contractsUpdated} smluv.`,
    `Smluvy s výplatou: ${summary.contractsWithPayoutChanges}.`,
    `Zapsáno ${summary.payoutRecordsAdded} provizních položek.`,
    `Aktualizováno existujících provizních položek: ${summary.payoutRecordsUpdated}.`,
    `Koeficientové výjimky: ${summary.coefficientOverridesApplied}.`,
    `Přeskočeno duplicit: ${summary.duplicatePayoutRowsSkipped}.`,
    `Změny pojistného: ${summary.premiumUpdates}.`,
    `Návrhy účetních oprav: ${summary.accountingRepairDrafts}.`,
    `Podklady pro MAXX/extranet: ${summary.externalUpdateTasks}.`,
  ];
  const warnings = [
    summary.notFoundContracts.length > 0
      ? `Nenalezené smlouvy: ${Array.from(new Set(summary.notFoundContracts)).slice(0, 8).join(", ")}.`
      : null,
    summary.ambiguousContracts.length > 0
      ? `Duplicitní shody: ${Array.from(new Set(summary.ambiguousContracts)).slice(0, 8).join(", ")}.`
      : null,
    summary.skippedContracts.length > 0
      ? `Přeskočené smlouvy: ${Array.from(new Set(summary.skippedContracts)).slice(0, 8).join(", ")}.`
      : null,
    summary.olderPremiumUpdatesSkipped > 0
      ? `Starší pojistné změny po novějším výpisu přeskočeny: ${summary.olderPremiumUpdatesSkipped}.`
      : null,
    summary.errors.length > 0 ? `Chyby: ${summary.errors.slice(0, 3).join(" | ")}.` : null,
  ].filter(Boolean);

  return [...base, ...warnings].join(" ");
};

function ProcessingAuditPanel({ summary }: { summary: StatementProcessingSummary }) {
  const uniqueNotFoundContracts = Array.from(new Set(summary.notFoundContracts));
  const uniqueAmbiguousContracts = Array.from(new Set(summary.ambiguousContracts));
  const uniqueSkippedContracts = Array.from(new Set(summary.skippedContracts));
  const payoutChangeRecordCount = summary.payoutRecordsAdded + summary.payoutRecordsUpdated;
  const contractsWithPayoutChanges =
    summary.contractsWithPayoutChanges > 0 || payoutChangeRecordCount === 0
      ? summary.contractsWithPayoutChanges
      : summary.contractsUpdated;
  const skippedTotal =
    summary.duplicatePayoutRowsSkipped +
    summary.olderPremiumUpdatesSkipped +
    uniqueSkippedContracts.length;
  const manualReviewTotal =
    uniqueNotFoundContracts.length +
    uniqueAmbiguousContracts.length +
    uniqueSkippedContracts.length +
    summary.accountingRepairDrafts +
    summary.externalUpdateTasks +
    summary.errors.length;
  const skippedDetail = [
    summary.duplicatePayoutRowsSkipped > 0
      ? `${summary.duplicatePayoutRowsSkipped} duplicitních položek`
      : null,
    summary.olderPremiumUpdatesSkipped > 0
      ? `${summary.olderPremiumUpdatesSkipped} starších změn pojistného`
      : null,
    uniqueSkippedContracts.length > 0
      ? `${uniqueSkippedContracts.length} smluv bez zápisu`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const manualReviewDetail = [
    uniqueNotFoundContracts.length > 0
      ? `${uniqueNotFoundContracts.length} nenalezených`
      : null,
    uniqueAmbiguousContracts.length > 0
      ? `${uniqueAmbiguousContracts.length} duplicitních shod`
      : null,
    summary.accountingRepairDrafts > 0
      ? `${summary.accountingRepairDrafts} účetních oprav`
      : null,
    summary.externalUpdateTasks > 0
      ? `${summary.externalUpdateTasks} MAXX/extranet`
      : null,
    summary.errors.length > 0 ? `${summary.errors.length} chyb` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const auditItems: {
    label: string;
    value: number;
    detail: string;
    tone: string;
    icon: LucideIcon;
  }[] = [
    {
      label: "Smlouvy s výplatou",
      value: contractsWithPayoutChanges,
      detail:
        payoutChangeRecordCount > 0
          ? `${payoutChangeRecordCount} výplatních položek`
          : "Bez nové výplaty",
      tone: "border-emerald-200 bg-emerald-50/80 text-emerald-900",
      icon: WalletCards,
    },
    {
      label: "Zapsané položky",
      value: payoutChangeRecordCount,
      detail: `${summary.payoutRecordsAdded} nových · ${summary.payoutRecordsUpdated} aktualizovaných`,
      tone: "border-sky-200 bg-sky-50/80 text-sky-950",
      icon: CheckCircle2,
    },
    {
      label: "Přeskočeno",
      value: skippedTotal,
      detail: skippedDetail || "Nic nepřeskočeno",
      tone: "border-slate-200 bg-slate-50/90 text-slate-900",
      icon: ListChecks,
    },
    {
      label: "Ruční kontrola",
      value: manualReviewTotal,
      detail: manualReviewDetail || "Bez ruční kontroly",
      tone:
        manualReviewTotal > 0
          ? "border-amber-200 bg-amber-50/80 text-amber-950"
          : "border-emerald-200 bg-emerald-50/80 text-emerald-900",
      icon: AlertTriangle,
    },
  ];

  return (
    <div className="mt-5 overflow-hidden rounded-3xl border border-slate-200 bg-white/90 shadow-[0_18px_42px_rgba(15,23,42,0.06)]">
      <div className="flex flex-col gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-base font-bold tracking-tight text-slate-950">
            Audit po zápisu
          </h3>
          <p className="text-sm font-medium text-slate-600">
            Co se propsalo, co se přeskočilo a co zůstává k ruční kontrole.
          </p>
        </div>
        <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-600">
          Upraveno {summary.contractsUpdated} smluv
        </div>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
        {auditItems.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className={`flex min-h-32 flex-col justify-between rounded-2xl border px-4 py-3 ${item.tone}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-bold uppercase tracking-wide opacity-75">
                  {item.label}
                </div>
                <Icon className="h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
              </div>
              <div className="mt-2 text-3xl font-black tracking-tight">{item.value}</div>
              <div className="mt-2 text-sm font-semibold leading-snug opacity-80">
                {item.detail}
              </div>
            </div>
          );
        })}
      </div>

      {(uniqueNotFoundContracts.length > 0 ||
        uniqueAmbiguousContracts.length > 0 ||
        uniqueSkippedContracts.length > 0 ||
        summary.accountingRepairDrafts > 0 ||
        summary.externalUpdateTasks > 0 ||
        summary.errors.length > 0) && (
        <div className="space-y-2 border-t border-slate-100 px-4 py-4 text-sm font-semibold text-slate-700">
          {uniqueNotFoundContracts.length > 0 && (
            <div>
              Nenalezené smlouvy: {uniqueNotFoundContracts.slice(0, 12).join(", ")}
              {uniqueNotFoundContracts.length > 12 ? "…" : ""}
            </div>
          )}
          {uniqueAmbiguousContracts.length > 0 && (
            <div>
              Duplicitní shody smluv: {uniqueAmbiguousContracts.slice(0, 12).join(", ")}
              {uniqueAmbiguousContracts.length > 12 ? "…" : ""}
            </div>
          )}
          {uniqueSkippedContracts.length > 0 && (
            <div>
              Přeskočené smlouvy: {uniqueSkippedContracts.slice(0, 12).join(", ")}
              {uniqueSkippedContracts.length > 12 ? "…" : ""}
            </div>
          )}
          {summary.accountingRepairDrafts > 0 && (
            <div>Návrhy účetních oprav: {summary.accountingRepairDrafts}</div>
          )}
          {summary.externalUpdateTasks > 0 && (
            <div>Podklady pro MAXX/extranet: {summary.externalUpdateTasks}</div>
          )}
          {summary.errors.length > 0 && (
            <div>Chyby: {summary.errors.slice(0, 3).join(" | ")}</div>
          )}
        </div>
      )}
    </div>
  );
}

type ProcessedStatementHistoryPanelProps = {
  statements: SavedCommissionStatement[];
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  openingId: string | null;
  onRefresh: () => void;
  onOpen: (statementId: string) => void;
};

function ProcessedStatementHistoryPanel({
  statements,
  loading,
  error,
  selectedId,
  openingId,
  onRefresh,
  onOpen,
}: ProcessedStatementHistoryPanelProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-[0_18px_42px_rgba(15,23,42,0.05)] sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
            <CalendarDays className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
            Historie
          </div>
          <h2 className="mt-3 text-lg font-black text-slate-950">
            Zpracované výpisy
          </h2>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Uložené výstupy po zpracování výpisu.
          </p>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} aria-hidden="true" />
          ) : (
            <RotateCcw className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
          )}
          Obnovit
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
          {error}
        </div>
      )}

      {loading && statements.length === 0 ? (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} aria-hidden="true" />
          Načítám historii zpracovaných výpisů…
        </div>
      ) : statements.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-5 text-sm font-semibold text-slate-500">
          Zatím tu není žádný zpracovaný výpis.
        </div>
      ) : (
        <div className="mt-4 max-h-80 space-y-2 overflow-y-auto pr-1">
          {statements.map((statement) => {
            const selected = selectedId === statement.id;
            const opening = openingId === statement.id;
            const title = statement.statementNumber
              ? `Výpis ${statement.statementNumber}`
              : statement.fileName || "Provizní výpis";
            const period = statement.period || statement.payoutMonthKey || "Bez období";

            return (
              <button
                key={statement.id}
                type="button"
                onClick={() => onOpen(statement.id)}
                disabled={opening}
                className={`w-full rounded-xl border px-4 py-3 text-left transition disabled:cursor-wait ${
                  selected
                    ? "border-slate-950 bg-slate-950 text-white shadow-sm"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-black">{title}</span>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                          selected
                            ? "border-white/25 bg-white/10 text-white"
                            : "border-emerald-200 bg-emerald-50 text-emerald-800"
                        }`}
                      >
                        Zpracováno
                      </span>
                    </div>
                    <div
                      className={`mt-1 text-sm font-semibold ${
                        selected ? "text-slate-200" : "text-slate-600"
                      }`}
                    >
                      {period}
                    </div>
                    <div
                      className={`mt-1 text-xs font-semibold ${
                        selected ? "text-slate-300" : "text-slate-500"
                      }`}
                    >
                      Vystaveno {statement.statementDate || "—"} · zpracováno{" "}
                      {formatSystemDate(statement.processedAtMs)}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <div className="text-right">
                      <div
                        className={`text-xs font-bold uppercase ${
                          selected ? "text-slate-300" : "text-slate-500"
                        }`}
                      >
                        Vyplaceno
                      </div>
                      <div className="text-base font-black">
                        {typeof statement.payoutTotal === "number" &&
                        Number.isFinite(statement.payoutTotal)
                          ? `${formatMoney(statement.payoutTotal)} Kč`
                          : "—"}
                      </div>
                    </div>
                    {opening ? (
                      <Loader2 className="h-5 w-5 animate-spin" strokeWidth={2.2} aria-hidden="true" />
                    ) : (
                      <ChevronDown className="-rotate-90 h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

const PROCESSING_CAPTIONS = [
  "Ukládám výpis do provizního kalendáře",
  "Páruju smlouvy podle čísel smluv",
  "Zapisuju vyplacené provizní položky",
  "Kontroluju výročí aut a změny pojistného",
  "Připravuju účetní opravy",
  "Chystám podklady pro MAXX a extranet",
  "Čekám na potvrzení zápisu",
] as const;

const buildStatementSavePayload = ({ statement, html }: StatementFileRead) => {
  const managerRows = statement.managerCommissions.flatMap((advisor) => advisor.rows);

  return {
    fileName: statement.fileName,
    html,
    header: statement.header,
    summary: {
      commissionRowCount: statement.commissionRows.length,
      commissionTotal: sumAmounts(statement.commissionRows, (row) => row.commission),
      reserveFundTotal: sumAmounts(statement.commissionRows, (row) => row.reserveFund),
      payoutTotal: statement.payoutTotal,
      otherPaymentsCount: statement.otherPayments.length,
      otherPaymentsTotal: sumAmounts(statement.otherPayments, (payment) => payment.amount),
      managerAdvisorCount: statement.managerCommissions.length,
      managerRowCount: managerRows.length,
      managerCommissionTotal: sumAmounts(statement.managerCommissions, (advisor) => advisor.commission),
      stornoRowCount: statement.stornoRows.length,
      stornoTotal: sumAmounts(statement.stornoRows, (row) => row.commission),
    },
  };
};

const contractMatchKey = (
  scope: ContractMatchScope,
  contractNumber: string | null | undefined
): string | null => {
  const normalized = normalizeContractNumberForMatch(contractNumber);
  return normalized ? `${scope}:${normalized}` : null;
};

const collectStatementContractMatchRequests = (
  statements: ParsedStatement[]
): ContractMatchRequest[] => {
  const requests = new Map<string, ContractMatchRequest>();

  const addRequest = (
    contractNumber: string | null | undefined,
    scope: ContractMatchScope
  ) => {
    const key = contractMatchKey(scope, contractNumber);
    if (!key || !contractNumber || requests.has(key)) return;
    requests.set(key, { contractNumber, scope });
  };

  for (const statement of statements) {
    for (const row of statement.commissionRows) {
      addRequest(row.contractNumber, row.lifeSplitKind === "tip" ? "tip" : "my");
    }
    for (const row of statement.stornoRows) {
      addRequest(row.contractNumber, "my");
    }
    for (const payment of statement.otherPayments) {
      addRequest(payment.contractNumber, "my");
    }
    for (const advisor of statement.managerCommissions) {
      for (const row of advisor.rows) {
        addRequest(row.contractNumber, "team");
      }
    }
  }

  return [...requests.values()];
};

const contractMatchForNumber = (
  matches: ContractMatchesByNumber,
  contractNumber: string | null | undefined,
  scope: ContractMatchScope = "my"
): ContractMatchState | null => {
  const key = contractMatchKey(scope, contractNumber);
  return key ? matches[key] ?? null : null;
};

const isUnpairedContractMatch = (match: ContractMatchState | null): boolean =>
  match?.status === "not_found" ||
  match?.status === "error" ||
  (match?.status === "matched" && !matchedSystemContract(match));

type ManagerCommissionMatchNotice = {
  title: string;
  lines: string[];
  tone: "amber" | "rose";
};

const managerCommissionMatchNotice = (
  match: ContractMatchState | null
): ManagerCommissionMatchNotice | null => {
  if (!match || match.status === "idle" || match.status === "loading") return null;

  if (match.status === "not_found") {
    return {
      title: "Nenalezeno v týmových smlouvách",
      lines: [
        "Číslo smlouvy z manažerské provize se nenašlo mezi smlouvami podřízených poradců.",
        "Před ostrým zápisem bude potřeba ruční kontrola poradce, čísla smlouvy nebo produktu.",
      ],
      tone: "amber",
    };
  }

  if (match.status === "error") {
    return {
      title: "Chyba párování",
      lines: [
        match.error || "Smlouvu se nepodařilo ověřit vůči systému.",
        "Před ostrým zápisem bude potřeba kontrolu zopakovat nebo smlouvu dohledat ručně.",
      ],
      tone: "rose",
    };
  }

  if (match.status === "matched" && !matchedSystemContract(match)) {
    const examples = match.contracts
      .slice(0, 3)
      .map((contract) =>
        [
          contract.clientName || "klient bez názvu",
          contract.adviserName || contract.adviserEmail || "poradce nezjištěn",
        ].join(" · ")
      );

    return {
      title: `Více shod v systému (${match.contracts.length})`,
      lines: [
        examples.length > 0
          ? `Nalezené shody: ${examples.join("; ")}${match.contracts.length > examples.length ? "…" : ""}`
          : "Systém vrátil více smluv se stejným číslem.",
        "Před zápisem je potřeba určit správnou smlouvu podle klienta a poradce.",
      ],
      tone: "amber",
    };
  }

  return null;
};

const managerCommissionMatchSortRank = (match: ContractMatchState | null): number =>
  match?.status === "matched" && matchedSystemContract(match) ? 0 : 1;

const managerCommissionProductSortRank = (category: StatementProductCategory): number => {
  if (category === "life") return 0;
  if (category === "auto") return 1;
  return 2;
};

type ManagerCommissionRowSectionKey =
  | "unpairedLife"
  | "unpairedAuto"
  | "unpairedTroyOunce"
  | "unpairedInvestment"
  | "unpairedOther"
  | "life"
  | "auto"
  | "troyOunce"
  | "investment"
  | "other";

type ManagerCommissionRowSection = {
  key: ManagerCommissionRowSectionKey;
  label: string;
  description: string;
  className: string;
  rows: Array<{ row: ManagerCommissionRow; index: number }>;
  groups: ManagerCommissionContractGroup[];
  contractCount: number;
  commissionTotal: number;
  manualReviewCount: number;
  differenceCount: number;
};

type ManagerCommissionContractGroup = {
  key: string;
  rows: Array<{ row: ManagerCommissionRow; index: number }>;
  contractNumber: string;
  commissionTotal: number;
  reserveFundTotal: number;
  hasStorno: boolean;
  manualReviewCount: number;
  differenceCount: number;
};

const MANAGER_COMMISSION_ROW_SECTION_ORDER: ManagerCommissionRowSectionKey[] = [
  "life",
  "auto",
  "other",
  "investment",
  "troyOunce",
  "unpairedLife",
  "unpairedAuto",
  "unpairedOther",
  "unpairedInvestment",
  "unpairedTroyOunce",
];

const managerCommissionRowSectionMeta = (
  key: ManagerCommissionRowSectionKey
): Pick<ManagerCommissionRowSection, "label" | "description" | "className"> => {
  switch (key) {
    case "unpairedLife":
      return {
        label: "Nespárované / Životní pojištění",
        description: "Životní řádky bez jednoznačné shody v týmových smlouvách.",
        className: "border-amber-200 bg-amber-50 text-amber-950",
      };
    case "unpairedAuto":
      return {
        label: "Nespárované / Auta",
        description: "Auto řádky bez jednoznačné shody v týmových smlouvách.",
        className: "border-amber-200 bg-amber-50 text-amber-950",
      };
    case "unpairedTroyOunce":
      return {
        label: "Nespárované / Zlato",
        description: "Zlaté položky z produktů TU_* bez jednoznačné shody v týmu.",
        className: "border-amber-200 bg-amber-50 text-amber-950",
      };
    case "unpairedInvestment":
      return {
        label: "Nespárované / Investice",
        description: "Investiční řádky bez jednoznačné shody v týmových smlouvách.",
        className: "border-amber-200 bg-amber-50 text-amber-950",
      };
    case "unpairedOther":
      return {
        label: "Nespárované / ostatní",
        description: "Ostatní řádky bez jednoznačné shody v týmových smlouvách.",
        className: "border-amber-200 bg-amber-50 text-amber-950",
      };
    case "life":
      return {
        label: "Životní pojištění",
        description: "Meziprovize ze životních smluv.",
        className: "border-emerald-200 bg-emerald-50 text-emerald-950",
      };
    case "auto":
      return {
        label: "Auta",
        description: "Meziprovize z autopojištění.",
        className: "border-sky-200 bg-sky-50 text-sky-950",
      };
    case "troyOunce":
      return {
        label: "Troyská unce / zlato",
        description: "Položky z produktů TU_*.",
        className: "border-violet-200 bg-violet-50 text-violet-950",
      };
    case "investment":
      return {
        label: "Investice",
        description: "Investika, Efektika, Monetika, Conseq a další investiční položky.",
        className: "border-teal-200 bg-teal-50 text-teal-950",
      };
    case "other":
      return {
        label: "Ostatní produkty",
        description: "Majetek a další produktové řádky.",
        className: "border-slate-200 bg-slate-50 text-slate-800",
      };
  }
};

const managerCommissionRowSectionIcon = (
  key: ManagerCommissionRowSectionKey
): LucideIcon => {
  switch (key) {
    case "unpairedLife":
    case "life":
      return HeartPulse;
    case "unpairedAuto":
    case "auto":
      return Car;
    case "unpairedOther":
      return AlertTriangle;
    case "unpairedInvestment":
    case "investment":
      return HandCoins;
    case "unpairedTroyOunce":
    case "troyOunce":
      return WalletCards;
    case "other":
      return ListChecks;
  }
};

const czechCountLabel = (
  count: number,
  singular: string,
  few: string,
  many: string
): string => `${count} ${count === 1 ? singular : count >= 2 && count <= 4 ? few : many}`;

const managerCommissionRowSectionKey = (
  row: ManagerCommissionRow,
  matchesByContractNumber: ContractMatchesByNumber
): ManagerCommissionRowSectionKey => {
  const product = resolveStatementProduct(row.product);
  const rawCode = normalizeProductCode(product.rawCode);

  const matchNotice = managerCommissionMatchNotice(
    contractMatchForNumber(matchesByContractNumber, row.contractNumber, "team")
  );
  if (matchNotice) {
    if (product.category === "life") return "unpairedLife";
    if (product.category === "auto") return "unpairedAuto";
    if (rawCode.startsWith("TU_")) return "unpairedTroyOunce";
    if (product.category === "investment") return "unpairedInvestment";
    return "unpairedOther";
  }

  if (product.category === "life") return "life";
  if (product.category === "auto") return "auto";
  if (rawCode.startsWith("TU_")) return "troyOunce";
  if (product.category === "investment") return "investment";

  return "other";
};

const buildManagerCommissionRowSections = ({
  rows,
  matchesByContractNumber,
  advisorRowScope,
  comparisonsByRowKey,
}: {
  rows: ManagerCommissionRow[];
  matchesByContractNumber: ContractMatchesByNumber;
  advisorRowScope: string;
  comparisonsByRowKey: Map<string, CommissionAmountComparison>;
}): ManagerCommissionRowSection[] => {
  const sections = new Map<
    ManagerCommissionRowSectionKey,
    Array<{ row: ManagerCommissionRow; index: number }>
  >();

  rows.forEach((row, index) => {
    const key = managerCommissionRowSectionKey(row, matchesByContractNumber);
    const existingRows = sections.get(key) ?? [];
    existingRows.push({ row, index });
    sections.set(key, existingRows);
  });

  return MANAGER_COMMISSION_ROW_SECTION_ORDER.flatMap((key) => {
    const sectionRows = sections.get(key) ?? [];
    if (sectionRows.length === 0) return [];

    const meta = managerCommissionRowSectionMeta(key);
    const groupsByContract = new Map<string, ManagerCommissionContractGroup>();
    let commissionTotal = 0;

    for (const item of sectionRows) {
      const { row } = item;
      const normalizedContractNumber = normalizeContractNumberForMatch(row.contractNumber);
      const groupKey = normalizedContractNumber || row.contractNumber || row.id;
      commissionTotal += row.commission;

      const matchNotice = managerCommissionMatchNotice(
        contractMatchForNumber(matchesByContractNumber, row.contractNumber, "team")
      );
      const comparison = comparisonsByRowKey.get(managerCommissionRowKey(advisorRowScope, row));
      const existingGroup =
        groupsByContract.get(groupKey) ??
        ({
          key: groupKey,
          rows: [],
          contractNumber: row.contractNumber,
          commissionTotal: 0,
          reserveFundTotal: 0,
          hasStorno: false,
          manualReviewCount: 0,
          differenceCount: 0,
        } satisfies ManagerCommissionContractGroup);

      existingGroup.rows.push(item);
      existingGroup.commissionTotal += row.commission;
      existingGroup.reserveFundTotal += row.reserveFund;
      existingGroup.hasStorno = existingGroup.hasStorno || row.isStorno;
      if (matchNotice) existingGroup.manualReviewCount += 1;
      if (comparison && comparison.status !== "ok") existingGroup.differenceCount += 1;
      groupsByContract.set(groupKey, existingGroup);
    }

    const groups = [...groupsByContract.values()];
    const manualReviewCount = groups.filter((group) => group.manualReviewCount > 0).length;
    const differenceCount = groups.reduce((sum, group) => sum + group.differenceCount, 0);

    return [
      {
        key,
        ...meta,
        rows: sectionRows,
        groups,
        contractCount: groups.length,
        commissionTotal,
        manualReviewCount,
        differenceCount,
      },
    ];
  });
};

const sortManagerCommissionRows = (
  rows: ManagerCommissionRow[],
  matchesByContractNumber: ContractMatchesByNumber
): ManagerCommissionRow[] =>
  rows
    .map((row, index) => ({
      row,
      index,
      matchRank: managerCommissionMatchSortRank(
        contractMatchForNumber(matchesByContractNumber, row.contractNumber, "team")
      ),
      productRank: managerCommissionProductSortRank(resolveStatementProduct(row.product).category),
    }))
    .sort((left, right) => {
      if (left.matchRank !== right.matchRank) return left.matchRank - right.matchRank;
      if (left.productRank !== right.productRank) return left.productRank - right.productRank;
      return left.index - right.index;
    })
    .map((item) => item.row);

const fetchSystemContractMatch = async (
  user: FirebaseUser,
  matchRequest: ContractMatchRequest
): Promise<ContractMatchState> => {
  const params = new URLSearchParams({
    scope: matchRequest.scope,
    q: matchRequest.contractNumber,
  });

  const sendRequest = async (token: string) =>
    fetch(`/api/contracts/find?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

  let token = await user.getIdToken();
  let response = await sendRequest(token);
  if (response.status === 401) {
    token = await user.getIdToken(true);
    response = await sendRequest(token);
  }

  const payload = (await response.json().catch(() => null)) as
    | {
        ok?: boolean;
        error?: string;
        contracts?: MatchedSystemContract[];
      }
    | null;

  if (!response.ok || payload?.ok === false) {
    return {
      status: "error",
      contracts: [],
      error: payload?.error ?? `Nepodařilo se dohledat smlouvu (HTTP ${response.status}).`,
    };
  }

  const contracts = dedupeEquivalentSystemContracts(
    Array.isArray(payload?.contracts) ? payload.contracts : []
  );
  if (contracts.length === 0) return { status: "not_found", contracts: [] };
  return { status: "matched", contracts };
};

const fetchSystemContractMatches = async (
  user: FirebaseUser,
  requests: ContractMatchRequest[],
  onMatch: (request: ContractMatchRequest, match: ContractMatchState) => void
) => {
  const queue = [...requests];
  const workerCount = Math.min(8, Math.max(1, queue.length));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (queue.length > 0) {
        const request = queue.shift();
        if (!request) continue;
        const match = await fetchSystemContractMatch(user, request).catch((err) => ({
          status: "error" as const,
          contracts: [],
          error:
            err instanceof Error
              ? err.message
              : "Nepodařilo se dohledat smlouvu v systému.",
        }));
        onMatch(request, match);
      }
    })
  );
};

const sumRows = (rows: CommissionRow[]): number =>
  rows.reduce((sum, row) => sum + row.commission, 0);

const sumPayments = (payments: OtherPayment[]): number =>
  payments.reduce((sum, payment) => sum + payment.amount, 0);

const b36PaymentPairKey = (payment: OtherPayment): string | null => {
  if (!payment.isB36Half || !payment.contractNumber) return null;
  const amount = Math.round(Math.abs(payment.amount) * 100) / 100;
  if (amount <= COMMISSION_AMOUNT_TOLERANCE) return null;
  return `${payment.contractNumber}:${amount.toFixed(2)}`;
};

const b36OffsetPairIndexes = (payments: OtherPayment[]): Set<number> => {
  const positiveByKey = new Map<string, number[]>();
  const paired = new Set<number>();

  payments.forEach((payment, index) => {
    if (payment.amount <= COMMISSION_AMOUNT_TOLERANCE) return;
    const key = b36PaymentPairKey(payment);
    if (!key) return;
    positiveByKey.set(key, [...(positiveByKey.get(key) ?? []), index]);
  });

  payments.forEach((payment, index) => {
    if (payment.amount >= -COMMISSION_AMOUNT_TOLERANCE) return;
    const key = b36PaymentPairKey(payment);
    if (!key) return;
    const positives = positiveByKey.get(key) ?? [];
    const positiveIndex = positives.find((candidate) => !paired.has(candidate));
    if (positiveIndex == null) return;
    paired.add(positiveIndex);
    paired.add(index);
  });

  return paired;
};

const b36PaidPaymentAmounts = (payments: OtherPayment[]): number[] =>
  payments
    .filter((payment) => payment.isB36Half && payment.amount > COMMISSION_AMOUNT_TOLERANCE)
    .map((payment) => payment.amount);

const closestB36PaidAmount = (
  payments: OtherPayment[],
  expectedAmount: number
): number | null => {
  const amounts = b36PaidPaymentAmounts(payments);
  if (amounts.length === 0) return null;
  return amounts.reduce((closest, amount) =>
    Math.abs(amount - expectedAmount) < Math.abs(closest - expectedAmount)
      ? amount
      : closest
  );
};

const b36StatementAmountForReview = (
  payments: OtherPayment[],
  expectedAmount: number
): number => {
  const closest = closestB36PaidAmount(payments, expectedAmount);
  if (closest != null) return closest;
  return sumPayments(payments);
};

const tipExpectedAmountFromSystemContract = (
  contract: MatchedSystemContract | null | undefined
): number => {
  const amount = Number(contract?.tipContractTipsterAmountFirstYear);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : 0;
};

const hasUnpairedB36Offset = (payments: OtherPayment[]): boolean => {
  const paired = b36OffsetPairIndexes(payments);
  return payments.some(
    (payment, index) =>
      payment.isB36Half &&
      (payment.isStorno || payment.amount < -COMMISSION_AMOUNT_TOLERANCE) &&
      !paired.has(index)
  );
};

const rowsByKind = (
  contract: LifeSplitContractPreview,
  kind: LifeSplitCommissionKind
): CommissionRow[] => contract.rows.filter((row) => row.lifeSplitKind === kind);

const lifeSplitContractHasOnlyTipRows = (contract: LifeSplitContractPreview): boolean =>
  contract.rows.length > 0 &&
  contract.rows.some((row) => row.lifeSplitKind === "tip") &&
  contract.rows.every((row) => row.lifeSplitKind === "tip");

const lifeSplitContractMatchScope = (
  contract: LifeSplitContractPreview
): ContractMatchScope => (lifeSplitContractHasOnlyTipRows(contract) ? "tip" : "my");

const statusForContract = (contract: LifeSplitContractPreview): {
  label: string;
  tone: "ok" | "warn" | "info" | "tip";
} => {
  const hasA101 = rowsByKind(contract, "a101").length > 0;
  const hasB0301 = rowsByKind(contract, "b0301").length > 0;
  const hasTip = rowsByKind(contract, "tip").length > 0;
  const hasIncrease = rowsByKind(contract, "increase").length > 0;
  const hasOnlyLaterItems =
    !hasA101 &&
    !hasTip &&
    !hasIncrease &&
    contract.rows.some((row) =>
      ["b3601", "b4801", "subsequent", "care"].includes(row.lifeSplitKind)
    );
  const hasStornoB36 = hasUnpairedB36Offset(contract.b36Payments);

  if (hasStornoB36) return { label: "Obsahuje storno B36", tone: "warn" };
  if (contract.rows.length === 0 && contract.b36Payments.length > 0) {
    return { label: "Jen B36 z ostatních plateb", tone: "info" };
  }
  if (hasIncrease && !hasA101 && !hasB0301) {
    return { label: "Pojistné navýšeno", tone: "ok" };
  }
  if (hasTip) return { label: "Provize z TIPU", tone: "tip" };
  if (hasOnlyLaterItems) return { label: "Následná provize", tone: "info" };
  if (hasA101 && hasB0301) return { label: "Sjednávací část OK", tone: "ok" };
  if (hasA101 && !hasB0301) return { label: "B0301 nenalezeno v tomto výpisu", tone: "warn" };
  if (!hasA101 && hasB0301) return { label: "Doplacená B0301", tone: "ok" };
  return { label: "Ke kontrole", tone: "warn" };
};

const statusClass = (tone: "ok" | "warn" | "info" | "tip"): string => {
  if (tone === "ok") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (tone === "warn") return "border-amber-200 bg-amber-50 text-amber-900";
  if (tone === "tip") return "border-violet-200 bg-violet-50 text-violet-800";
  return "border-sky-200 bg-sky-50 text-sky-800";
};

const contractStatusCategoryLabel = (category: ContractStatusCategory): string => {
  switch (category) {
    case "active":
      return "Aktivní";
    case "pending":
      return "Nová / čekárna";
    case "matured":
      return "Dožitá";
    case "transferred":
      return "Převedená";
    case "storno":
      return "Storno";
    case "invalid":
      return "Chybná";
    default:
      return "Neznámá";
  }
};

const contractStatusCategoryClass = (category: ContractStatusCategory): string => {
  switch (category) {
    case "active":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "pending":
    case "transferred":
      return "border-sky-200 bg-sky-50 text-sky-800";
    case "matured":
      return "border-slate-200 bg-slate-100 text-slate-700";
    case "storno":
    case "invalid":
      return "border-rose-200 bg-rose-50 text-rose-800";
    default:
      return "border-amber-200 bg-amber-50 text-amber-900";
  }
};

const COMMISSION_CODE_CATEGORY_ORDER: CommissionCodeCategory[] = [
  "closing",
  "closingRole",
  "subsequent",
  "installment",
  "unexpected",
  "increase",
  "tip",
  "adjustment",
  "office",
  "other",
];

const commissionCodeCategoryLabel = (category: CommissionCodeCategory): string => {
  switch (category) {
    case "closing":
      return "Uzavření";
    case "closingRole":
      return "Uzavření / role";
    case "subsequent":
      return "Následné provize";
    case "installment":
      return "Splátky provize";
    case "unexpected":
      return "Neočekávané provize";
    case "increase":
      return "Navýšení";
    case "tip":
      return "TIP";
    case "adjustment":
      return "Korekce";
    case "office":
      return "Ostatní platby";
    case "troyOunce":
      return "Troyská unce";
    default:
      return "Ostatní";
  }
};

const commissionCodeCategoryClass = (category: CommissionCodeCategory): string => {
  switch (category) {
    case "closing":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "closingRole":
      return "border-teal-200 bg-teal-50 text-teal-800";
    case "subsequent":
      return "border-blue-200 bg-blue-50 text-blue-800";
    case "installment":
      return "border-cyan-200 bg-cyan-50 text-cyan-800";
    case "unexpected":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "increase":
      return "border-sky-200 bg-sky-50 text-sky-800";
    case "tip":
      return "border-violet-200 bg-violet-50 text-violet-800";
    case "adjustment":
    case "office":
      return "border-orange-200 bg-orange-50 text-orange-900";
    case "troyOunce":
      return "border-purple-200 bg-purple-50 text-purple-900";
    default:
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
};

const commissionCodeRuleMatches = (
  rule: Pick<CommissionCodeRule, "matchers">,
  code: string
): boolean => rule.matchers.some((matcher) => matcher.test(code));

const generalCommissionKindClass = (kind: GeneralCommissionKind): string => {
  switch (kind) {
    case "closing":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "tip":
      return "border-violet-200 bg-violet-50 text-violet-800";
    case "subsequent":
    case "installment":
      return "border-blue-200 bg-blue-50 text-blue-800";
    case "increase":
      return "border-cyan-200 bg-cyan-50 text-cyan-800";
    case "unexpected":
    case "troyOunce":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "penalty":
      return "border-rose-200 bg-rose-50 text-rose-800";
    case "office":
    case "compensation":
    case "gradual":
      return "border-violet-200 bg-violet-50 text-violet-800";
    default:
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
};

const uniqueProductMetasForRows = (rows: Array<{ product: string }>): StatementProductMeta[] => {
  const seen = new Set<string>();
  const products: StatementProductMeta[] = [];

  for (const row of rows) {
    const product = resolveStatementProduct(row.product);
    if (seen.has(product.rawCode)) continue;
    seen.add(product.rawCode);
    products.push(product);
  }

  return products;
};

const contractHasProductCategory = (
  contract: OtherProductContractPreview,
  category: StatementProductCategory
): boolean =>
  uniqueProductMetasForRows(contract.rows).some((product) => product.category === category);

const contractHasTroyOunceProduct = (contract: OtherProductContractPreview): boolean =>
  uniqueProductMetasForRows(contract.rows).some((product) =>
    normalizeProductCode(product.rawCode).startsWith("TU_")
  );

const contractHasInvestmentSectionProduct = (
  contract: OtherProductContractPreview
): boolean =>
  uniqueProductMetasForRows(contract.rows).some((product) =>
    INVESTMENT_SECTION_PRODUCT_CODES.has(normalizeProductCode(product.rawCode))
  );

const POSITION_VALUES: Position[] = [
  "poradce1",
  "poradce2",
  "poradce3",
  "poradce4",
  "poradce5",
  "poradce6",
  "poradce7",
  "poradce8",
  "poradce9",
  "poradce10",
  "manazer4",
  "manazer5",
  "manazer6",
  "manazer7",
  "manazer8",
  "manazer9",
  "manazer10",
];
const POSITION_SET = new Set<string>(POSITION_VALUES);

const normalizePositionValue = (value: unknown): Position | null =>
  typeof value === "string" && POSITION_SET.has(value) ? (value as Position) : null;

const positionLabel = (position: Position | null | undefined): string => {
  if (!position) return "—";
  const advisorMatch = position.match(/^poradce(\d+)$/);
  if (advisorMatch) return `Poradce ${advisorMatch[1]}`;
  const managerMatch = position.match(/^manazer(\d+)$/);
  if (managerMatch) return `Manažer ${managerMatch[1]}`;
  return position;
};

type StatementCareerPosition = {
  raw: string;
  code: number;
  position: Position;
};

const statementCareerPositionFromValue = (
  value: string | null | undefined
): StatementCareerPosition | null => {
  const raw = normalizeText(value);
  if (!raw) return null;
  const match = raw.match(/\d+/);
  if (!match) return null;
  const code = Number(match[0]);
  if (!Number.isFinite(code)) return null;

  const candidate =
    code >= 1 && code <= 10
      ? `poradce${code}`
      : code >= 104 && code <= 110
        ? `manazer${code - 100}`
        : null;
  const position = normalizePositionValue(candidate);
  return position ? { raw, code, position } : null;
};

const statementCareerPositionsFromRows = (
  rows: Array<{ career: string }>
): StatementCareerPosition[] => {
  const byPosition = new Map<Position, StatementCareerPosition>();
  rows.forEach((row) => {
    const parsed = statementCareerPositionFromValue(row.career);
    if (parsed && !byPosition.has(parsed.position)) {
      byPosition.set(parsed.position, parsed);
    }
  });
  return [...byPosition.values()];
};

const statementCareerPositionLabel = (career: StatementCareerPosition): string =>
  `${career.raw} (${positionLabel(career.position)})`;

const statementCareerPositionsLabel = (careers: StatementCareerPosition[]): string =>
  careers.map(statementCareerPositionLabel).join(", ");

const statementCareerBadgeLabel = (
  careers: StatementCareerPosition[] | null | undefined
): string =>
  careers && careers.length > 0
    ? `Výpis Kar. ${statementCareerPositionsLabel(careers)}`
    : "Kar. výpis nezjištěna";

const statementCareerMismatch = (
  rows: Array<{ career: string }>,
  systemPositionRaw: unknown
): { careers: StatementCareerPosition[]; systemPosition: Position | null; mismatched: boolean } => {
  const careers = statementCareerPositionsFromRows(rows);
  const systemPosition = normalizePositionValue(systemPositionRaw);
  if (careers.length === 0 || !systemPosition) {
    return { careers, systemPosition, mismatched: false };
  }
  return {
    careers,
    systemPosition,
    mismatched: careers.some((career) => career.position !== systemPosition),
  };
};

const statementCareerIssueCount = (
  rows: Array<{ career: string }>,
  systemPositionRaw: unknown
): number => {
  const { careers, systemPosition, mismatched } = statementCareerMismatch(
    rows,
    systemPositionRaw
  );
  return careers.length > 0 && (!systemPosition || mismatched) ? 1 : 0;
};

const normalizeCommissionModeValue = (value: unknown): CommissionMode =>
  value === "accelerated" || value === "standard" ? value : "standard";

const normalizePaymentFrequencyValue = (value: unknown): PaymentFrequency =>
  value === "monthly" ||
  value === "quarterly" ||
  value === "semiannual" ||
  value === "annual"
    ? value
    : "annual";

const hasCommissionType = (rows: CommissionRow[], type: string): boolean =>
  rows.some((row) => row.type.trim().toUpperCase() === type);

const missingAcceleratedB36Warning = (
  rows: CommissionRow[],
  b36Payments: OtherPayment[],
  systemContract: MatchedSystemContract | null
): MissingAcceleratedB36Warning | null => {
  const splitProducts = uniqueProductMetasForRows(rows).filter((product) =>
    isLifeSplitProductCode(product.rawCode)
  );

  if (splitProducts.length === 0) return null;
  if (!systemContractExpectsImmediateB36(systemContract)) return null;
  const hasA101 = hasCommissionType(rows, "A101");
  const hasB0301 = hasCommissionType(rows, "B0301");
  if (!hasA101) return null;
  if (
    b36Payments.some(
      (payment) => payment.isB36Half && payment.amount > COMMISSION_AMOUNT_TOLERANCE
    )
  ) {
    return null;
  }

  return {
    contractNumber: rows[0]?.contractNumber ?? "",
    client: rows[0]?.client ?? "",
    productLabels: splitProducts
      .map((product) => `${product.label} (${product.rawCode})`)
      .join(", "),
    detail: hasB0301
      ? "Ve výpisu je A101 a B0301, ale není nalezená odpovídající 50% z B36 v ostatních platbách."
      : "Ve výpisu je A101. B0301 může přijít později po kartě klienta, ale u zrychleného režimu chybí odpovídající 50% z B36 v ostatních platbách.",
  };
};

const systemContractExpectsImmediateB36 = (
  systemContract: MatchedSystemContract | null
): boolean => {
  const items = systemContract?.items ?? [];
  if (items.length > 0) {
    return items.some((item) => {
      const title = normalizeCommissionTitle(item.title);
      const amount = Number(item.amount);
      return (
        Number.isFinite(amount) &&
        amount > COMMISSION_AMOUNT_TOLERANCE &&
        title.includes("50") &&
        (title.includes("b36") || title.includes("b3601"))
      );
    });
  }

  const mode = normalizeCommissionTitle(systemContract?.commissionMode);
  if (
    mode === "standard" ||
    mode.includes("standard") ||
    mode.includes("bezny") ||
    mode.includes("bez rezimu")
  ) {
    return false;
  }
  if (mode === "accelerated" || mode.includes("accelerated") || mode.includes("zrychlen")) {
    return true;
  }

  return false;
};

const systemContractEntryType = (
  contract: MatchedSystemContract | null | undefined
): string => normalizeText(contract?.entryType).toLowerCase();

const systemContractIsEndorsement = (
  contract: MatchedSystemContract | null | undefined
): boolean =>
  systemContractEntryType(contract) === "endorsement" ||
  Boolean(normalizeText(contract?.rootContractEntryId) && normalizeText(contract?.parentContractEntryId));

const systemContractFamilyRootId = (
  contract: MatchedSystemContract | null | undefined
): string => {
  const rootId = normalizeText(contract?.rootContractEntryId);
  if (rootId) return rootId;

  const parentId = normalizeText(contract?.parentContractEntryId);
  if (systemContractIsEndorsement(contract) && parentId) return parentId;

  return normalizeText(contract?.id);
};

const systemContractFamilyKey = (
  contract: MatchedSystemContract | null | undefined
): string => {
  const owner = normalizeText(contract?.adviserEmail).toLowerCase();
  const rootId = systemContractFamilyRootId(contract);
  return owner && rootId ? `${owner}::${rootId}` : "";
};

const matchContractsRepresentSingleFamily = (
  contracts: MatchedSystemContract[]
): boolean => {
  const uniqueContracts = dedupeEquivalentSystemContracts(contracts);
  if (uniqueContracts.length <= 1) return true;
  const keys = uniqueContracts.map(systemContractFamilyKey);
  return keys.every(Boolean) && new Set(keys).size === 1;
};

const systemContractTimelineTime = (contract: MatchedSystemContract): number => {
  const date =
    parseLocalDate(contract.policyStartDate) ??
    parseLocalDate(contract.contractSignedDate) ??
    parseLocalDate(contract.createdAt);
  return date?.getTime() ?? Number.POSITIVE_INFINITY;
};

const normalizedComparableText = (value: string | null | undefined): string =>
  normalizeCommissionTitle(value);

const systemContractEquivalentSignature = (
  contract: MatchedSystemContract
): string => {
  if (systemContractIsEndorsement(contract)) {
    return `${normalizeText(contract.adviserEmail).toLowerCase()}::entry::${contract.id}`;
  }

  return [
    normalizeText(contract.adviserEmail).toLowerCase(),
    normalizeContractNumberForMatch(contract.contractNumber),
    contract.productKey ?? "",
    normalizedComparableText(contract.clientName),
    toDateInputValue(parseLocalDate(contract.contractSignedDate)),
    toDateInputValue(parseLocalDate(contract.policyStartDate)),
    Math.round((systemContractAnnualPremiumBase(contract) ?? 0) * 100) / 100,
    systemContractPosition(contract) ?? "",
    normalizeCommissionModeValue(contract.commissionMode),
  ].join("::");
};

const systemContractCompletenessScore = (contract: MatchedSystemContract): number => {
  let score = 0;
  if (normalizeText(contract.entryType)) score += 20;
  if (Number.isFinite(Number(contract.effectiveInputAmount))) score += 10;
  if (Number.isFinite(Number(contract.calculationInputAmount))) score += 8;
  if (contract.maxxContractDetailUrl) score += 5;
  if (contract.cppExtranetEntityId || contract.cppExtranetEntityTypeId) score += 5;
  if ((contract.items ?? []).length > 0) score += 3;
  const updatedTime =
    parseLocalDate(contract.updatedAt)?.getTime() ??
    parseLocalDate(contract.createdAt)?.getTime() ??
    0;
  return score + updatedTime / 1_000_000_000_000;
};

const preferredSystemContract = (
  left: MatchedSystemContract,
  right: MatchedSystemContract
): MatchedSystemContract =>
  systemContractCompletenessScore(right) > systemContractCompletenessScore(left) ? right : left;

const dedupeEquivalentSystemContracts = (
  contracts: MatchedSystemContract[]
): MatchedSystemContract[] => {
  const bySignature = new Map<string, MatchedSystemContract>();
  const order: string[] = [];

  for (const contract of contracts) {
    const signature = systemContractEquivalentSignature(contract) || `entry::${contract.id}`;
    const existing = bySignature.get(signature);
    if (!existing) {
      bySignature.set(signature, contract);
      order.push(signature);
      continue;
    }

    bySignature.set(signature, preferredSystemContract(existing, contract));
  }

  return order
    .map((key) => bySignature.get(key))
    .filter((item): item is MatchedSystemContract => Boolean(item));
};

const sortSystemContractTimeline = (
  contracts: MatchedSystemContract[]
): MatchedSystemContract[] =>
  [...contracts].sort((left, right) => {
    const dateDiff = systemContractTimelineTime(left) - systemContractTimelineTime(right);
    if (dateDiff !== 0) return dateDiff;
    const leftEndorsement = systemContractIsEndorsement(left) ? 1 : 0;
    const rightEndorsement = systemContractIsEndorsement(right) ? 1 : 0;
    if (leftEndorsement !== rightEndorsement) return leftEndorsement - rightEndorsement;
    return left.id.localeCompare(right.id, "cs");
  });

const primarySystemContractForFamily = (
  contracts: MatchedSystemContract[]
): MatchedSystemContract | null => {
  const timeline = sortSystemContractTimeline(contracts);
  return timeline.find((contract) => !systemContractIsEndorsement(contract)) ?? timeline[0] ?? null;
};

const matchedSystemContract = (match: ContractMatchState | null): MatchedSystemContract | null => {
  if (match?.status !== "matched") return null;
  const contracts = dedupeEquivalentSystemContracts(match.contracts);
  if (contracts.length === 1) return contracts[0];
  if (!matchContractsRepresentSingleFamily(contracts)) return null;
  return primarySystemContractForFamily(contracts);
};

const systemMatchHasSingleFamilyHistory = (match: ContractMatchState | null): boolean => {
  if (match?.status !== "matched") return false;
  const contracts = dedupeEquivalentSystemContracts(match.contracts);
  return contracts.length > 1 && matchContractsRepresentSingleFamily(contracts);
};

const endorsementCountLabel = (count: number): string => {
  if (count === 1) return "1 dodatek";
  if (count >= 2 && count <= 4) return `${count} dodatky`;
  return `${count} dodatků`;
};

const systemMatchHistoryLabel = (match: ContractMatchState | null): string => {
  if (!systemMatchHasSingleFamilyHistory(match) || match?.status !== "matched") return "";
  const contracts = dedupeEquivalentSystemContracts(match.contracts);
  const endorsementCount =
    contracts.filter(systemContractIsEndorsement).length || Math.max(0, contracts.length - 1);
  return endorsementCountLabel(endorsementCount);
};

const systemContractAnnualPremiumBase = (
  contract: MatchedSystemContract | null | undefined
): number | null => {
  const monthlyPremium = systemCommissionMonthlyBase(contract ?? null);
  return Number.isFinite(monthlyPremium) && monthlyPremium > 0
    ? Math.round(monthlyPremium * 12 * 100) / 100
    : null;
};

const systemContractAnnualPremiumDelta = (
  contract: MatchedSystemContract | null | undefined
): number | null => {
  const timelineChange = (contract?.lifePremiumChanges ?? []).find(
    (change) => change.id === contract?.id
  );
  const candidates = [
    timelineChange?.annualPremiumDelta,
    Number(timelineChange?.premiumDelta) * 12,
    Number(contract?.premiumDelta) * 12,
    Number(contract?.premiumIncreaseAmount) * 12,
  ];

  for (const value of candidates) {
    const amount = Number(value);
    if (Number.isFinite(amount) && Math.abs(amount) > ANNUAL_PREMIUM_TOLERANCE) {
      return Math.round(amount * 100) / 100;
    }
  }

  return null;
};

const annualAmountsMatch = (
  left: number | null | undefined,
  right: number | null | undefined
): boolean => {
  const leftAmount = Number(left);
  const rightAmount = Number(right);
  return (
    Number.isFinite(leftAmount) &&
    Number.isFinite(rightAmount) &&
    Math.abs(leftAmount - rightAmount) <= ANNUAL_PREMIUM_TOLERANCE
  );
};

const matchedSystemContractForLifeSplit = (
  contract: LifeSplitContractPreview,
  match: ContractMatchState | null
): MatchedSystemContract | null => {
  if (match?.status !== "matched") return null;
  const contracts = dedupeEquivalentSystemContracts(match.contracts);
  if (contracts.length === 1) return contracts[0];
  if (!matchContractsRepresentSingleFamily(contracts)) return null;

  const timeline = sortSystemContractTimeline(contracts);
  const originalContracts = timeline.filter((item) => !systemContractIsEndorsement(item));
  const endorsementContracts = timeline.filter(systemContractIsEndorsement);
  const hasInitialCommission =
    rowsByKind(contract, "a101").length > 0 || rowsByKind(contract, "b0301").length > 0;
  const increaseAnnualBase = rowsByKind(contract, "increase")
    .map((row) => row.base)
    .find((base) => base > 0);

  if (hasInitialCommission) {
    const matchingOriginal = originalContracts.find((item) =>
      annualAmountsMatch(systemContractAnnualPremiumBase(item), contract.annualPremium)
    );
    return matchingOriginal ?? originalContracts[0] ?? primarySystemContractForFamily(timeline);
  }

  if (increaseAnnualBase != null && increaseAnnualBase > 0) {
    const matchingEndorsement = endorsementContracts.find((item) =>
      annualAmountsMatch(
        Math.abs(systemContractAnnualPremiumDelta(item) ?? 0),
        increaseAnnualBase
      )
    );
    return (
      matchingEndorsement ??
      endorsementContracts[endorsementContracts.length - 1] ??
      primarySystemContractForFamily(timeline)
    );
  }

  const matchingBase = timeline.find((item) =>
    annualAmountsMatch(systemContractAnnualPremiumBase(item), contract.annualPremium)
  );
  return matchingBase ?? primarySystemContractForFamily(timeline);
};

const KOOPERATIVA_OBCAN_STATEMENT_PRODUCTS = new Set<Product>([
  "koopmajetekobcan",
  "koopfit",
]);

const statementProductMatchesSystemProduct = (
  expectedProductKey: Product | null | undefined,
  systemProductKey: Product | null | undefined
): boolean => {
  if (!expectedProductKey || !systemProductKey) return false;
  if (expectedProductKey === systemProductKey) return true;
  return (
    KOOPERATIVA_OBCAN_STATEMENT_PRODUCTS.has(expectedProductKey) &&
    KOOPERATIVA_OBCAN_STATEMENT_PRODUCTS.has(systemProductKey)
  );
};

const hasProductMismatch = (
  expectedProductKey: Product | null | undefined,
  systemContract: MatchedSystemContract | null
): boolean =>
  Boolean(expectedProductKey && systemContract?.productKey) &&
  !statementProductMatchesSystemProduct(expectedProductKey, systemContract?.productKey);

type AnnualPremiumBaseMismatch = {
  statementAnnualPremium: number;
  systemAnnualPremium: number;
  systemMonthlyPremium: number;
  difference: number;
  explainedByEndorsement: LifePremiumChangeSummary | null;
};

type PremiumBaseMismatch = {
  statementPremiumBase: number;
  statementPaymentBase: number;
  statementBasePeriod: "annual" | "payment";
  systemPremiumBase: number;
  systemPaymentAmount: number;
  systemPaymentFrequency: string | null;
  paymentsPerYear: number;
  statementAnnualPremiumBase: number;
  systemAnnualPremiumBase: number;
  difference: number;
  annualDifference: number;
};

type PremiumBaseComparison = PremiumBaseMismatch & {
  key: string;
  label: string;
  canBeAnniversaryPremiumChange: boolean;
  firstAnniversaryDate: Date | null;
  anniversaryDate: Date | null;
  referenceDate: Date | null;
};

type AutoPremiumChangeDirection = "increase" | "decrease";

type AutoPremiumChangeInfo = PremiumBaseMismatch & {
  direction: AutoPremiumChangeDirection;
  referenceDate: Date | null;
  firstAnniversaryDate: Date | null;
  anniversaryDate: Date | null;
  source: "stored_history" | "statement_period";
};

type AutoPremiumAnniversaryWindow = {
  anniversaryNumber: number;
  anniversaryDate: Date;
  windowStart: Date;
  windowEnd: Date;
  referenceDate: Date;
  firstAnniversaryDate: Date | null;
};

type AutoPremiumBaseReference = {
  annualPremiumBase: number;
  paymentPremiumBase: number;
  paymentsPerYear: number;
  paymentFrequency: string | null;
  referenceDate: Date | null;
  source: "current" | "history";
};

const matchingEndorsementPremiumChange = (
  statementAnnualPremium: number,
  systemContract: MatchedSystemContract | null
): LifePremiumChangeSummary | null => {
  if (statementAnnualPremium <= 0) return null;
  const changes = systemContract?.lifePremiumChanges ?? [];
  return (
    changes.find((change) => {
      if (change.entryType !== "endorsement") return false;
      const annualPremium = Number(change.annualPremium);
      return (
        Number.isFinite(annualPremium) &&
        annualPremium > 0 &&
        Math.abs(statementAnnualPremium - annualPremium) <= ANNUAL_PREMIUM_TOLERANCE
      );
    }) ?? null
  );
};

const systemCommissionMonthlyBase = (
  systemContract: MatchedSystemContract | null
): number => {
  const refreshMonthly = Number(
    systemContract?.refreshCommissionBase?.calculationMonthlyPremium
  );
  if (Number.isFinite(refreshMonthly) && refreshMonthly > 0) return refreshMonthly;

  const calculationInputAmount = Number(systemContract?.calculationInputAmount);
  if (Number.isFinite(calculationInputAmount) && calculationInputAmount > 0) {
    return calculationInputAmount;
  }

  return Number(systemContract?.inputAmount);
};

const isNeonRefreshMissingOriginalInSystem = (
  systemContract: MatchedSystemContract | null
): boolean =>
  systemContract?.productKey === "neon" &&
  systemContract?.isRefresh === true &&
  systemContract.commissionBaseSource !== "commission_statement" &&
  systemContract.commissionCalculationStatus !==
    "statement_resolved_refresh_missing_original" &&
  (systemContract.refreshOriginalMissingInSystem === true ||
    systemContract.requiresStatementRefresh === true ||
    systemContract.commissionCalculationStatus === "provisional_refresh_missing_original");

const isoDayFromSystemDate = (
  value: number | string | Date | null | undefined
): string | null => {
  const date = parseLocalDate(value);
  return date ? toDateInputValue(date) : null;
};

const effectiveCoefficientSetForContract = (
  systemContract: MatchedSystemContract | null,
  signedDateIso: string | null
): CommissionCoefficientSet | null =>
  normalizeCommissionCoefficientSet(systemContract?.commissionCoefficientSetOverride) ??
  (systemContract?.productKey === "neon"
    ? normalizeCommissionCoefficientSet(systemContract?.neonCoefficientSetOverride)
    : null) ??
  defaultCoefficientSetForProduct(systemContract?.productKey, signedDateIso);

const calculateResultForCoefficientSet = ({
  productKey,
  amount,
  frequencyRaw,
  position,
  commissionMode,
  signedDateIso,
  coefficientSet,
  durationYears,
}: {
  productKey: Product;
  amount: number;
  frequencyRaw: PaymentFrequency;
  position: Position;
  commissionMode: CommissionMode;
  signedDateIso: string | null;
  coefficientSet: CommissionCoefficientSet;
  durationYears: number | null;
}): { items: CommissionResultItemDTO[]; total: number } | null => {
  const coefficientSignedDateIso = signedDateForCoefficientSetOverride({
    product: productKey,
    contractSignedDateIso: signedDateIso,
    coefficientSetOverride: coefficientSet,
  });

  switch (productKey) {
    case "neon": {
      if (coefficientSet !== "historical" && coefficientSet !== "current") return null;
      const years = normalizeNeonDurationYears(durationYears, signedDateIso, coefficientSet);
      return calculateNeon(
        amount,
        position,
        years,
        commissionMode,
        signedDateIso,
        coefficientSet
      );
    }
    case "cppAuto":
      return calculateCppAuto(amount, frequencyRaw, position, coefficientSignedDateIso);
    case "allianzAuto":
      return calculateAllianzAuto(amount, frequencyRaw, position, coefficientSignedDateIso);
    case "csobAuto":
      return calculateCsobAuto(amount, frequencyRaw, position, coefficientSignedDateIso);
    case "uniqaAuto":
      return calculateUniqaAuto(amount, frequencyRaw, position, coefficientSignedDateIso);
    case "uniqaflotila":
      return calculateUniqaFlotila(amount, frequencyRaw, position, coefficientSignedDateIso);
    case "pillowAuto":
      return calculatePillowAuto(amount, frequencyRaw, position, coefficientSignedDateIso);
    case "slaviaflotila":
      return calculateSlaviaFlotila(amount, frequencyRaw, position);
    case "kooperativaAuto":
      return calculateKooperativaAuto(
        amount,
        frequencyRaw,
        position,
        coefficientSignedDateIso
      );
    case "koopflotila":
      return calculateKoopFlotila(amount, frequencyRaw, position);
    default:
      return null;
  }
};

const expectedNeonAmountFromItems = (
  items: CommissionResultItemDTO[],
  rowCode: string
): number => {
  const code = baseCommissionCodeForStatementComparison(rowCode);
  if (code === "A101") {
    return expectedAmountFromItems(
      items,
      (title) => title === "provize a101" || title.includes("okamzita provize")
    );
  }
  if (code === "B0301") {
    return expectedAmountFromItems(items, (title) => title === "provize b0301");
  }
  return 0;
};

const expectedAutoAmountFromItems = (
  items: CommissionResultItemDTO[],
  rowCode: string,
  statementAmount: number,
  frequencyRaw: PaymentFrequency
): number => {
  const code = normalizeText(rowCode).toUpperCase().replace(/\s+/g, "");
  const periods = periodsPerYear(frequencyRaw);
  const wantsSubsequent = isAutoSubsequentCommissionCode(code);
  const candidates = items
    .filter((item) => !isTotalCommissionItem(item))
    .flatMap((item) => {
      const title = normalizeCommissionTitle(item.title);
      const amount = Number(item.amount);
      if (!Number.isFinite(amount)) return [];

      const isClosing =
        title.includes("okamzita") ||
        title.includes("ziskatelska") ||
        title.includes("uzavreni");
      const isAnnual =
        title.includes("provize za rok") ||
        title.includes("celkem za rok") ||
        title.includes("za rok");
      const isSubsequent = title.includes("nasledna");

      if (wantsSubsequent) {
        if (!isSubsequent && !isAnnual) return [];
      } else if (!isClosing && !isAnnual) {
        return [];
      }

      return periods > 1 && (isAnnual || isClosing || isSubsequent)
        ? [amount, amount / periods]
        : [amount];
    });

  return closestAmount(candidates, statementAmount) ?? 0;
};

const autoSubsequentExpectedAmountForRow = (
  productKey: Product,
  position: Position,
  signedDateIso: string | null,
  row: CommissionRow
): number | null => {
  if (!isAutoSubsequentCommissionCode(row.type)) return null;
  const rowBase = Number(row.base);
  if (!Number.isFinite(rowBase) || rowBase <= 0) return null;
  const coefficient = autoSubsequentCoefficientForProduct(
    productKey,
    position,
    signedDateIso
  );
  if (coefficient == null) return null;
  return Math.round(rowBase * coefficient * 100) / 100;
};

const autoSubsequentExpectedAmountForRows = (
  productKey: Product,
  systemContract: MatchedSystemContract,
  rows: CommissionRow[]
): number | null => {
  const position = systemContractPosition(systemContract);
  if (!position) return null;
  const signedDateIso = isoDayFromSystemDate(systemContract.contractSignedDate);
  const coefficientSet = effectiveCoefficientSetForContract(systemContract, signedDateIso);
  const coefficientSignedDateIso = signedDateForCoefficientSetOverride({
    product: productKey,
    contractSignedDateIso: signedDateIso,
    coefficientSetOverride: coefficientSet,
  });

  let hasExpected = false;
  const total = rows.reduce((sum, row) => {
    const expected = autoSubsequentExpectedAmountForRow(
      productKey,
      position,
      coefficientSignedDateIso,
      row
    );
    if (expected == null) return sum;
    hasExpected = true;
    return sum + expected;
  }, 0);

  return hasExpected ? Math.round(total * 100) / 100 : null;
};

const lifeCoefficientOverrideInfo = (
  contract: LifeSplitContractPreview,
  systemContract: MatchedSystemContract | null
): CoefficientOverrideInfo | null => {
  if (systemContract?.productKey !== "neon") return null;
  const productKey = resolveStatementProduct(contract.productCode).productKey;
  if (productKey !== "neon") return null;
  const position = systemContractPosition(systemContract);
  if (!position) return null;
  const monthlyPremium = systemCommissionMonthlyBase(systemContract);
  if (!Number.isFinite(monthlyPremium) || monthlyPremium <= 0) return null;

  const immediateRows = contract.rows.filter((row) => {
    return isNeonInitialCommissionCode(row.type) && row.base > 0 && row.commission > 0;
  });
  if (immediateRows.length === 0) return null;

  const signedDateIso = isoDayFromSystemDate(systemContract.contractSignedDate);
  const currentSet = effectiveCoefficientSetForContract(systemContract, signedDateIso);
  if (!currentSet) return null;
  const mode = normalizeCommissionModeValue(systemContract.commissionMode);
  const frequencyRaw = normalizePaymentFrequencyValue(systemContract.frequencyRaw);
  const rawDurationYears =
    typeof systemContract.durationYears === "number" &&
    Number.isFinite(systemContract.durationYears)
      ? systemContract.durationYears
      : null;
  const matches = candidateCoefficientSetsForProduct(productKey).filter((set) => {
    return immediateRows.every((row) => {
      const result = calculateResultForCoefficientSet({
        productKey,
        amount: row.base / 12,
        frequencyRaw,
        position,
        commissionMode: mode,
        signedDateIso,
        coefficientSet: set,
        durationYears: rawDurationYears,
      });
      if (!result) return false;
      const expected = expectedNeonAmountFromItems(result.items, row.type);
      return Math.abs(row.commission - expected) <= COMMISSION_AMOUNT_TOLERANCE;
    });
  });

  if (matches.length !== 1) return null;
  const coefficientSet = matches[0];
  if (coefficientSet === currentSet) return null;

  const result = calculateResultForCoefficientSet({
    productKey,
    amount: monthlyPremium,
    frequencyRaw,
    position,
    commissionMode: mode,
    signedDateIso,
    coefficientSet,
    durationYears: rawDurationYears,
  });
  if (!result) return null;

  return {
    coefficientSet,
    currentSet,
    items: result.items,
    total: result.total,
  };
};

const systemCommissionPaymentBase = (
  systemContract: MatchedSystemContract | null
): number => {
  const calculationInputAmount = Number(systemContract?.calculationInputAmount);
  if (Number.isFinite(calculationInputAmount) && calculationInputAmount > 0) {
    return calculationInputAmount;
  }

  const effectiveInputAmount = Number(systemContract?.effectiveInputAmount);
  if (Number.isFinite(effectiveInputAmount) && effectiveInputAmount > 0) {
    return effectiveInputAmount;
  }

  return Number(systemContract?.inputAmount);
};

const autoCoefficientOverrideInfo = (
  contract: OtherProductContractPreview,
  systemContract: MatchedSystemContract | null
): CoefficientOverrideInfo | null => {
  if (!systemContract) return null;
  const productKey = systemContract.productKey ?? null;
  if (!productKey || !isAutoProduct(productKey) || !productSupportsCoefficientSetOverride(productKey)) {
    return null;
  }
  const productMetas = uniqueProductMetasForRows(contract.rows);
  const statementProductKeys = Array.from(
    new Set(productMetas.map((product) => product.productKey).filter(Boolean))
  );
  if (statementProductKeys.length !== 1 || statementProductKeys[0] !== productKey) return null;

  const position = systemContractPosition(systemContract);
  if (!position) return null;
  const paymentBase = systemCommissionPaymentBase(systemContract);
  if (!Number.isFinite(paymentBase) || paymentBase <= 0) return null;

  const coefficientRows = contract.rows.filter((row) => {
    const rowProductKey = resolveStatementProduct(row.product).productKey;
    const code = normalizeText(row.type).toUpperCase().replace(/\s+/g, "");
    return (
      rowProductKey === productKey &&
      row.base > 0 &&
      row.commission > 0 &&
      (/^A\d+/.test(code) || /^AC\d+/.test(code) || isAutoSubsequentCommissionCode(code))
    );
  });
  if (coefficientRows.length === 0) return null;

  const signedDateIso = isoDayFromSystemDate(systemContract.contractSignedDate);
  const currentSet = effectiveCoefficientSetForContract(systemContract, signedDateIso);
  if (!currentSet) return null;
  const mode = normalizeCommissionModeValue(systemContract.commissionMode);
  const frequencyRaw = normalizePaymentFrequencyValue(systemContract.frequencyRaw);
  const rawDurationYears =
    typeof systemContract.durationYears === "number" &&
    Number.isFinite(systemContract.durationYears)
      ? systemContract.durationYears
      : null;

  const matches = candidateCoefficientSetsForProduct(productKey).filter((set) =>
    coefficientRows.every((row) => {
      const result = calculateResultForCoefficientSet({
        productKey,
        amount: row.base,
        frequencyRaw,
        position,
        commissionMode: mode,
        signedDateIso,
        coefficientSet: set,
        durationYears: rawDurationYears,
      });
      if (!result) return false;
      const coefficientSignedDateIso = signedDateForCoefficientSetOverride({
        product: productKey,
        contractSignedDateIso: signedDateIso,
        coefficientSetOverride: set,
      });
      const expected =
        autoSubsequentExpectedAmountForRow(
          productKey,
          position,
          coefficientSignedDateIso,
          row
        ) ??
        expectedAutoAmountFromItems(result.items, row.type, row.commission, frequencyRaw);
      return Math.abs(row.commission - expected) <= COMMISSION_AMOUNT_TOLERANCE;
    })
  );

  if (matches.length !== 1) return null;
  const coefficientSet = matches[0];
  if (coefficientSet === currentSet) return null;

  const result = calculateResultForCoefficientSet({
    productKey,
    amount: paymentBase,
    frequencyRaw,
    position,
    commissionMode: mode,
    signedDateIso,
    coefficientSet,
    durationYears: rawDurationYears,
  });
  if (!result) return null;

  return {
    coefficientSet,
    currentSet,
    items: result.items,
    total: result.total,
  };
};

const annualPremiumBaseMismatch = (
  statementAnnualPremium: number,
  systemContract: MatchedSystemContract | null
): AnnualPremiumBaseMismatch | null => {
  const systemMonthlyPremium = systemCommissionMonthlyBase(systemContract);
  if (
    statementAnnualPremium <= 0 ||
    !Number.isFinite(systemMonthlyPremium) ||
    systemMonthlyPremium <= 0
  ) {
    return null;
  }

  const systemAnnualPremium = systemMonthlyPremium * 12;
  const difference = statementAnnualPremium - systemAnnualPremium;
  if (Math.abs(difference) <= ANNUAL_PREMIUM_TOLERANCE) return null;
  const explainedByEndorsement = matchingEndorsementPremiumChange(
    statementAnnualPremium,
    systemContract
  );

  return {
    statementAnnualPremium,
    systemAnnualPremium,
    systemMonthlyPremium,
    difference,
    explainedByEndorsement,
  };
};

const premiumBaseComparison = (
  statementPremiumBase: number,
  systemContract: MatchedSystemContract | null,
  statementBasePeriod: "annual" | "payment" = "annual",
  systemPaymentAmountOverride?: number | null
): PremiumBaseMismatch | null => {
  const override = Number(systemPaymentAmountOverride);
  const systemPaymentAmount =
    Number.isFinite(override) && override > 0
      ? override
      : systemCommissionMonthlyBase(systemContract);
  if (
    statementPremiumBase <= 0 ||
    !Number.isFinite(systemPaymentAmount) ||
    systemPaymentAmount <= 0
  ) {
    return null;
  }

  const systemPaymentFrequency = normalizeText(systemContract?.frequencyRaw).toLowerCase();
  const paymentsPerYear = paymentsPerYearForFrequency(systemPaymentFrequency);
  const systemPremiumBase = systemPaymentAmount;
  const statementPaymentBase =
    statementBasePeriod === "annual"
      ? statementPremiumBase / paymentsPerYear
      : statementPremiumBase;
  const statementAnnualPremiumBase =
    statementBasePeriod === "annual"
      ? statementPremiumBase
      : statementPremiumBase * paymentsPerYear;
  const systemAnnualPremiumBase = systemPaymentAmount * paymentsPerYear;
  const difference = statementPaymentBase - systemPremiumBase;
  const annualDifference = statementAnnualPremiumBase - systemAnnualPremiumBase;

  return {
    statementPremiumBase,
    statementPaymentBase,
    statementBasePeriod,
    systemPremiumBase,
    systemPaymentAmount,
    systemPaymentFrequency,
    paymentsPerYear,
    statementAnnualPremiumBase,
    systemAnnualPremiumBase,
    difference,
    annualDifference,
  };
};

const autoPremiumBaseForMismatch = (
  contract: OtherProductContractPreview,
  systemContract: MatchedSystemContract | null
): { base: number; period: "annual" | "payment" } | null => {
  const rowsWithBase = contract.rows.filter((row) => row.base > 0);
  const inferPeriod = (
    base: number,
    fallback: "annual" | "payment"
  ): "annual" | "payment" => {
    const systemPaymentAmount = systemCommissionMonthlyBase(systemContract);
    if (
      base <= 0 ||
      !Number.isFinite(systemPaymentAmount) ||
      systemPaymentAmount <= 0
    ) {
      return fallback;
    }

    const paymentsPerYear = paymentsPerYearForFrequency(systemContract?.frequencyRaw);
    if (paymentsPerYear <= 1) return fallback;

    const paymentDifference = Math.abs(base - systemPaymentAmount);
    const annualDifference = Math.abs(base - systemPaymentAmount * paymentsPerYear);
    return paymentDifference <= annualDifference ? "payment" : "annual";
  };

  const subsequentRow = rowsWithBase.find(
    (row) => classifyGeneralCommissionCode(row.product, row.type).kind === "subsequent"
  );
  if (subsequentRow) {
    return {
      base: subsequentRow.base,
      period: inferPeriod(subsequentRow.base, "payment"),
    };
  }

  const closingRow = rowsWithBase.find(
    (row) => classifyGeneralCommissionCode(row.product, row.type).kind === "closing"
  );
  if (closingRow) {
    return {
      base: closingRow.base,
      period: inferPeriod(closingRow.base, "annual"),
    };
  }

  return null;
};

const autoPremiumReferenceDate = (
  contract: OtherProductContractPreview,
  systemContract: MatchedSystemContract | null,
  statementPeriod?: string | null
): Date | null =>
  parsePeriodEndDate(statementPeriod) ??
  parseLocalDate(contract.validFrom) ??
  parseLocalDate(contract.signedAt) ??
  parseLocalDate(systemContract?.policyStartDate) ??
  parseLocalDate(systemContract?.contractSignedDate);

const autoCurrentPremiumBaseReference = (
  systemContract: MatchedSystemContract | null
): AutoPremiumBaseReference | null => {
  const systemPaymentAmount = systemCommissionMonthlyBase(systemContract);
  if (!Number.isFinite(systemPaymentAmount) || systemPaymentAmount <= 0) return null;

  const paymentFrequency = normalizeText(systemContract?.frequencyRaw).toLowerCase();
  const paymentsPerYear = paymentsPerYearForFrequency(paymentFrequency);
  return {
    annualPremiumBase: systemPaymentAmount * paymentsPerYear,
    paymentPremiumBase: systemPaymentAmount,
    paymentsPerYear,
    paymentFrequency,
    referenceDate: null,
    source: "current",
  };
};

const autoPremiumHistoryEntryDate = (
  entry: PremiumStatementHistoryEntry,
  systemContract: MatchedSystemContract | null
): Date | null =>
  parseLocalDate(entry.anniversaryDate) ??
  parseLocalDate(entry.validFrom) ??
  parsePeriodEndDate(entry.statementPeriod) ??
  parseLocalDate(systemContract?.policyStartDate) ??
  parseLocalDate(systemContract?.contractSignedDate);

const autoPremiumHistoryPoints = (
  systemContract: MatchedSystemContract | null
): Array<{ annualPremiumBase: number; date: Date | null; order: number }> => {
  const entries = systemContract?.premiumStatementHistory ?? [];
  if (entries.length === 0) return [];

  const points: Array<{ annualPremiumBase: number; date: Date | null; order: number }> = [];
  const policyStartDate =
    parseLocalDate(systemContract?.policyStartDate) ??
    parseLocalDate(systemContract?.contractSignedDate);

  entries.forEach((entry, index) => {
    const kind = entry.premiumKind ?? "auto_change";
    if (kind !== "auto_initial") return;
    const annualPremiumBase =
      validPositiveMoney(entry.newAnnualPremium) ??
      validPositiveMoney(entry.newPremium) ??
      validPositiveMoney(entry.previousAnnualPremium) ??
      validPositiveMoney(entry.previousPremium);
    if (!annualPremiumBase) return;
    points.push({
      annualPremiumBase,
      date: autoPremiumHistoryEntryDate(entry, systemContract) ?? policyStartDate,
      order: index,
    });
  });

  const changes = entries
    .map((entry, index) => {
      const kind = entry.premiumKind ?? "auto_change";
      if (kind !== "auto_change") return null;
      return {
        entry,
        index,
        date: autoPremiumHistoryEntryDate(entry, systemContract),
        previousPremium:
          validPositiveMoney(entry.previousAnnualPremium) ?? validPositiveMoney(entry.previousPremium),
        newPremium:
          validPositiveMoney(entry.newAnnualPremium) ?? validPositiveMoney(entry.newPremium),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort((a, b) => {
      const left = a.date?.getTime() ?? Number.POSITIVE_INFINITY;
      const right = b.date?.getTime() ?? Number.POSITIVE_INFINITY;
      return left - right || a.index - b.index;
    });

  if (
    !points.some((point) => point.annualPremiumBase > 0) &&
    changes[0]?.previousPremium
  ) {
    points.push({
      annualPremiumBase: changes[0].previousPremium,
      date: policyStartDate ?? changes[0].date,
      order: -1,
    });
  }

  changes.forEach(({ date, index, newPremium }) => {
    if (!newPremium) return;
    points.push({
      annualPremiumBase: newPremium,
      date,
      order: index,
    });
  });

  return points.sort((a, b) => {
    const left = a.date?.getTime() ?? Number.NEGATIVE_INFINITY;
    const right = b.date?.getTime() ?? Number.NEGATIVE_INFINITY;
    return left - right || a.order - b.order;
  });
};

const autoPremiumBaseReferenceForStatement = (
  contract: OtherProductContractPreview,
  systemContract: MatchedSystemContract | null,
  statementPeriod?: string | null
): AutoPremiumBaseReference | null => {
  const current = autoCurrentPremiumBaseReference(systemContract);
  const paymentsPerYear =
    current?.paymentsPerYear ?? paymentsPerYearForFrequency(systemContract?.frequencyRaw);
  const paymentFrequency =
    current?.paymentFrequency ?? normalizeText(systemContract?.frequencyRaw).toLowerCase();
  const referenceDate = autoPremiumReferenceDate(contract, systemContract, statementPeriod);
  const referenceTime = referenceDate?.getTime() ?? null;
  const historyPoints = autoPremiumHistoryPoints(systemContract);

  if (historyPoints.length > 0) {
    let activePoint: (typeof historyPoints)[number] | null = null;
    if (referenceTime !== null) {
      for (const point of historyPoints) {
        const pointTime = point.date?.getTime() ?? Number.NEGATIVE_INFINITY;
        if (pointTime <= referenceTime) {
          activePoint = point;
        }
      }
      activePoint ??= historyPoints[0];
    } else {
      activePoint = historyPoints.at(-1) ?? null;
    }

    if (activePoint?.annualPremiumBase) {
      return {
        annualPremiumBase: activePoint.annualPremiumBase,
        paymentPremiumBase: activePoint.annualPremiumBase / paymentsPerYear,
        paymentsPerYear,
        paymentFrequency,
        referenceDate,
        source: "history",
      };
    }
  }

  return current ? { ...current, referenceDate } : null;
};

const scaleAutoExpectedAmountForPremiumReference = (
  amount: number,
  systemContract: MatchedSystemContract,
  premiumReference: AutoPremiumBaseReference | null
): number => {
  if (!Number.isFinite(amount) || amount <= 0 || !premiumReference) return amount;
  const current = autoCurrentPremiumBaseReference(systemContract);
  if (!current || current.annualPremiumBase <= 0) return amount;
  const ratio = premiumReference.annualPremiumBase / current.annualPremiumBase;
  if (!Number.isFinite(ratio) || ratio <= 0) return amount;
  if (Math.abs(ratio - 1) <= 0.0001) return amount;
  return amount * ratio;
};

const autoPremiumBaseMismatchForContract = (
  contract: OtherProductContractPreview,
  systemContract: MatchedSystemContract | null,
  statementPeriod?: string | null
): PremiumBaseMismatch | null => {
  const comparison = autoPremiumBaseComparisonForContract(
    contract,
    systemContract,
    statementPeriod
  );
  if (!comparison) return null;
  return Math.abs(comparison.annualDifference) <= ANNUAL_PREMIUM_TOLERANCE
    ? null
    : comparison;
};

const autoPremiumBaseComparisonForContract = (
  contract: OtherProductContractPreview,
  systemContract: MatchedSystemContract | null,
  statementPeriod?: string | null
): PremiumBaseComparison | null => {
  const statementBase = autoPremiumBaseForMismatch(contract, systemContract);
  const premiumReference = autoPremiumBaseReferenceForStatement(
    contract,
    systemContract,
    statementPeriod
  );
  const comparison = statementBase
    ? premiumBaseComparison(
        statementBase.base,
        systemContract,
        statementBase.period,
        premiumReference?.paymentPremiumBase
      )
    : null;
  if (!comparison) return null;

  return {
    ...comparison,
    key: "auto-premium-base",
    label: "Základna pojistného",
    canBeAnniversaryPremiumChange: isAutoInAnniversaryPremiumWindow(
      contract,
      systemContract,
      statementPeriod
    ),
    firstAnniversaryDate: autoFirstAnniversaryDate(contract, systemContract),
    anniversaryDate:
      autoPremiumAnniversaryWindowForStatement(contract, systemContract, statementPeriod)
        ?.anniversaryDate ?? null,
    referenceDate: autoPremiumChangeStatementDate(statementPeriod),
  };
};

const autoStatementPremiumBaseText = (mismatch: PremiumBaseMismatch): string =>
  mismatch.statementBasePeriod === "annual"
    ? `roční základnou ${formatWholeMoney(mismatch.statementPremiumBase)} Kč`
    : `základnou ${formatWholeMoney(mismatch.statementPremiumBase)} Kč za platbu (${formatWholeMoney(mismatch.statementAnnualPremiumBase)} Kč ročně)`;

const autoStatementPremiumBaseDetail = (mismatch: PremiumBaseMismatch): string =>
  mismatch.statementBasePeriod === "annual"
    ? `Výpisová roční základna: ${formatWholeMoney(mismatch.statementPremiumBase)} Kč`
    : `Výpisová základna za platbu: ${formatWholeMoney(mismatch.statementPremiumBase)} Kč (${formatWholeMoney(mismatch.statementAnnualPremiumBase)} Kč ročně)`;

const hasSubsequentAutoCommissionRow = (contract: OtherProductContractPreview): boolean =>
  contract.rows.some(
    (row) => classifyGeneralCommissionCode(row.product, row.type).kind === "subsequent"
  );

const autoPolicyStartDate = (
  contract: OtherProductContractPreview,
  systemContract: MatchedSystemContract | null
): Date | null => {
  return parseLocalDate(contract.validFrom) ?? parseLocalDate(systemContract?.policyStartDate);
};

const autoFirstAnniversaryDate = (
  contract: OtherProductContractPreview,
  systemContract: MatchedSystemContract | null
): Date | null => {
  const policyStartDate = autoPolicyStartDate(contract, systemContract);
  return policyStartDate ? addYearsToLocalDate(policyStartDate, 1) : null;
};

const autoPremiumChangeStatementDate = (statementPeriod?: string | null): Date | null =>
  parsePeriodEndDate(statementPeriod);

const autoPremiumAnniversaryWindowForStatement = (
  contract: OtherProductContractPreview,
  systemContract: MatchedSystemContract | null,
  statementPeriod?: string | null,
  fallbackReferenceDate?: Date | null
): AutoPremiumAnniversaryWindow | null => {
  const policyStartDate = autoPolicyStartDate(contract, systemContract);
  const referenceDate = autoPremiumChangeStatementDate(statementPeriod) ?? fallbackReferenceDate ?? null;
  if (!policyStartDate || !referenceDate) return null;

  const firstAnniversaryDate = addYearsToLocalDate(policyStartDate, 1);
  const referenceTime = referenceDate.getTime();
  for (let yearOffset = 1; yearOffset <= 80; yearOffset += 1) {
    const anniversaryDate = addYearsToLocalDate(policyStartDate, yearOffset);
    const windowStart = addMonthsToLocalDate(
      anniversaryDate,
      -AUTO_PREMIUM_ANNIVERSARY_TOLERANCE_MONTHS
    );
    const windowEnd = addMonthsToLocalDate(
      anniversaryDate,
      AUTO_PREMIUM_ANNIVERSARY_TOLERANCE_MONTHS
    );
    if (referenceTime >= windowStart.getTime() && referenceTime <= windowEnd.getTime()) {
      return {
        anniversaryNumber: yearOffset,
        anniversaryDate,
        windowStart,
        windowEnd,
        referenceDate,
        firstAnniversaryDate,
      };
    }
    if (referenceTime < windowStart.getTime()) return null;
  }
  return null;
};

const hasAutoPremiumAnniversaryDates = (
  contract: OtherProductContractPreview,
  systemContract: MatchedSystemContract | null,
  statementPeriod?: string | null,
  fallbackReferenceDate?: Date | null
): boolean =>
  Boolean(
    autoPolicyStartDate(contract, systemContract) &&
      (autoPremiumChangeStatementDate(statementPeriod) ?? fallbackReferenceDate ?? null)
  );

const isAutoInAnniversaryPremiumWindow = (
  contract: OtherProductContractPreview,
  systemContract: MatchedSystemContract | null,
  statementPeriod?: string | null,
  fallbackReferenceDate?: Date | null
): boolean => {
  if (autoPremiumAnniversaryWindowForStatement(
    contract,
    systemContract,
    statementPeriod,
    fallbackReferenceDate
  )) {
    return true;
  }
  if (hasAutoPremiumAnniversaryDates(contract, systemContract, statementPeriod, fallbackReferenceDate)) {
    return false;
  }
  return hasSubsequentAutoCommissionRow(contract);
};

const moneyNearlyEqual = (
  a: number | null | undefined,
  b: number | null | undefined,
  tolerance = ANNUAL_PREMIUM_TOLERANCE
): boolean => {
  const left = Number(a);
  const right = Number(b);
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= tolerance;
};

const validPositiveMoney = (value: number | null | undefined): number | null => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
};

const storedAutoPremiumChangeInfo = (
  mismatch: PremiumBaseMismatch,
  contract: OtherProductContractPreview,
  systemContract: MatchedSystemContract | null,
  statementPeriod?: string | null
): AutoPremiumChangeInfo | null => {
  const history = (systemContract?.premiumStatementHistory ?? [])
    .filter((entry) => (entry.premiumKind ?? "auto_change") === "auto_change")
    .map((entry) => ({
      entry,
      previousPremium: validPositiveMoney(entry.previousPremium),
      newPremium: validPositiveMoney(entry.newPremium),
      referenceDate:
        parseLocalDate(entry.anniversaryDate) ??
        parsePeriodEndDate(entry.statementPeriod) ??
        parseLocalDate(entry.validFrom),
    }))
    .filter((entry) => entry.previousPremium != null || entry.newPremium != null)
    .sort((a, b) => {
      const left = a.referenceDate?.getTime() ?? 0;
      const right = b.referenceDate?.getTime() ?? 0;
      return left - right;
    });
  if (history.length === 0) return null;

  const statementBase = mismatch.statementAnnualPremiumBase;
  const systemBase = mismatch.systemAnnualPremiumBase;
  const directMatch = history.find(
    ({ previousPremium, newPremium }) =>
      (moneyNearlyEqual(previousPremium, statementBase) &&
        moneyNearlyEqual(newPremium, systemBase)) ||
      (moneyNearlyEqual(newPremium, statementBase) &&
        moneyNearlyEqual(previousPremium, systemBase))
  );
  const statementBaseKnown = history.some(
    ({ previousPremium, newPremium }) =>
      moneyNearlyEqual(previousPremium, statementBase) ||
      moneyNearlyEqual(newPremium, statementBase)
  );
  const systemBaseKnown = history.some(
    ({ previousPremium, newPremium }) =>
      moneyNearlyEqual(previousPremium, systemBase) ||
      moneyNearlyEqual(newPremium, systemBase)
  );
  if (!directMatch && (!statementBaseKnown || !systemBaseKnown)) return null;

  const reference = directMatch ?? history[history.length - 1];
  const anniversaryWindow = autoPremiumAnniversaryWindowForStatement(
    contract,
    systemContract,
    statementPeriod,
    reference.referenceDate
  );
  if (
    !anniversaryWindow &&
    !isAutoInAnniversaryPremiumWindow(
      contract,
      systemContract,
      statementPeriod,
      reference.referenceDate
    )
  ) {
    return null;
  }

  return {
    ...mismatch,
    direction: systemBase > statementBase ? "increase" : "decrease",
    referenceDate: reference.referenceDate ?? anniversaryWindow?.referenceDate ?? null,
    firstAnniversaryDate: autoFirstAnniversaryDate(contract, systemContract),
    anniversaryDate:
      anniversaryWindow?.anniversaryDate ??
      reference.referenceDate ??
      autoFirstAnniversaryDate(contract, systemContract),
    source: "stored_history",
  };
};

const autoPremiumChangeInfo = (
  contract: OtherProductContractPreview,
  systemContract: MatchedSystemContract | null,
  statementPeriod?: string | null
): AutoPremiumChangeInfo | null => {
  if (!contractHasProductCategory(contract, "auto")) return null;
  const mismatch = autoPremiumBaseMismatchForContract(
    contract,
    systemContract,
    statementPeriod
  );
  if (!mismatch || Math.abs(mismatch.annualDifference) <= ANNUAL_PREMIUM_TOLERANCE) return null;
  const anniversaryWindow = autoPremiumAnniversaryWindowForStatement(
    contract,
    systemContract,
    statementPeriod
  );
  if (!anniversaryWindow && !isAutoInAnniversaryPremiumWindow(contract, systemContract, statementPeriod)) {
    return null;
  }
  const storedChange = storedAutoPremiumChangeInfo(
    mismatch,
    contract,
    systemContract,
    statementPeriod
  );
  if (storedChange) return storedChange;
  return {
    ...mismatch,
    direction: mismatch.annualDifference > 0 ? "increase" : "decrease",
    referenceDate: anniversaryWindow?.referenceDate ?? parsePeriodEndDate(statementPeriod),
    firstAnniversaryDate: autoFirstAnniversaryDate(contract, systemContract),
    anniversaryDate:
      anniversaryWindow?.anniversaryDate ?? autoFirstAnniversaryDate(contract, systemContract),
    source: "statement_period",
  };
};

const isAmountComparisonExplainedByAutoPremiumChange = (
  comparison: CommissionAmountComparison,
  premiumChange: AutoPremiumChangeInfo | null
): boolean =>
  Boolean(
    premiumChange &&
      comparison.status === "diff" &&
      ((premiumChange.annualDifference > COMMISSION_AMOUNT_TOLERANCE &&
        comparison.difference > COMMISSION_AMOUNT_TOLERANCE) ||
        (premiumChange.annualDifference < -COMMISSION_AMOUNT_TOLERANCE &&
          comparison.difference < -COMMISSION_AMOUNT_TOLERANCE))
  );

const lifeSplitContractTotal = (contract: LifeSplitContractPreview): number =>
  sumRows(contract.rows) + sumPayments(contract.b36Payments);

const otherProductContractTotal = (contract: OtherProductContractPreview): number =>
  sumRows(contract.rows) + sumPayments(contract.b36Payments);

const lifeSplitContractUncertaintyCount = (
  contract: LifeSplitContractPreview,
  matchesByContractNumber: ContractMatchesByNumber,
  statementPeriod?: string | null,
  statementKey?: string,
  correctionContext?: StatementCorrectionContext
): number => {
  const reviewRows = statementKey
    ? rowsForStatementReview(statementKey, contract.rows, correctionContext)
    : contract.rows;
  const reviewContract =
    reviewRows.length === contract.rows.length
      ? contract
      : {
          ...contract,
          rows: reviewRows,
          annualPremium: reviewRows.find((row) => row.base > 0)?.base ?? contract.annualPremium,
        };
  if (reviewRows.length === 0 && contract.b36Payments.length === 0) return 0;

  const tipOnlyContract = lifeSplitContractHasOnlyTipRows(reviewContract);
  const matchScope = lifeSplitContractMatchScope(reviewContract);
  const match = contractMatchForNumber(matchesByContractNumber, contract.contractNumber, matchScope);
  const systemContract = matchedSystemContractForLifeSplit(reviewContract, match);
  const expectedProductKey = resolveStatementProduct(reviewContract.productCode).productKey;
  let count = 0;

  if (isUnpairedContractMatch(match)) count += 1;
  if (hasProductMismatch(expectedProductKey, systemContract)) count += 1;
  if (systemContract && !tipOnlyContract) {
    count += statementCareerIssueCount(reviewContract.rows, systemContractPositionRaw(systemContract));
    if (systemContractTimelinePositionMismatch(systemContract)) count += 1;
  }
  const annualPremiumMismatch = tipOnlyContract
    ? null
    : annualPremiumBaseMismatch(reviewContract.annualPremium, systemContract);
  const hasLifePremiumIncrease = rowsByKind(reviewContract, "increase").length > 0;
  if (
    annualPremiumMismatch &&
    !annualPremiumMismatch.explainedByEndorsement &&
    !hasLifePremiumIncrease
  ) {
    count += 1;
  }
  if (systemContract) {
    count += buildLifeSplitAmountComparisons(reviewContract, systemContract, statementPeriod).filter(
      (comparison) => comparison.status !== "ok"
    ).length;
  }
  if (
    !tipOnlyContract &&
    missingAcceleratedB36Warning(reviewContract.rows, contract.b36Payments, systemContract)
  ) {
    count += 1;
  }
  if (rowsByKind(reviewContract, "unknown").length > 0) count += 1;

  return count;
};

const otherProductContractUncertaintyCount = (
  contract: OtherProductContractPreview,
  matchesByContractNumber: ContractMatchesByNumber,
  statementPeriod?: string | null,
  statementKey?: string,
  correctionContext?: StatementCorrectionContext
): number => {
  const reviewRows = statementKey
    ? rowsForStatementReview(statementKey, contract.rows, correctionContext)
    : contract.rows;
  const reviewContract =
    reviewRows.length === contract.rows.length
      ? contract
      : { ...contract, rows: reviewRows };
  if (reviewRows.length === 0 && contract.b36Payments.length === 0) return 0;

  const tipOnlyContract = otherProductContractHasOnlyTipRows(reviewContract);
  const matchScope = otherProductContractMatchScope(reviewContract);
  const match = contractMatchForNumber(matchesByContractNumber, contract.contractNumber, matchScope);
  const systemContract = matchedSystemContract(match);
  const productMetas = uniqueProductMetasForRows(reviewContract.rows);
  const expectedProductKey =
    productMetas.length === 1 ? productMetas[0]?.productKey ?? null : null;
  let count = 0;

  if (isUnpairedContractMatch(match)) count += 1;
  if (hasProductMismatch(expectedProductKey, systemContract)) count += 1;
  if (systemContract && !tipOnlyContract) {
    count += statementCareerIssueCount(reviewContract.rows, systemContractPositionRaw(systemContract));
    if (systemContractTimelinePositionMismatch(systemContract)) count += 1;
  }
  const explainedAutoPremiumChange = autoPremiumChangeInfo(
    reviewContract,
    systemContract,
    statementPeriod
  );
  const autoPremiumMismatch =
    !tipOnlyContract && contractHasProductCategory(reviewContract, "auto") && !explainedAutoPremiumChange
      ? autoPremiumBaseMismatchForContract(reviewContract, systemContract, statementPeriod)
      : null;
  if (autoPremiumMismatch) {
    count += 1;
  }
  if (systemContract) {
    count += buildOtherProductAmountComparisons(reviewContract, systemContract, statementPeriod).filter(
      (comparison) =>
        comparison.status !== "ok" &&
        !isAmountComparisonExplainedByAutoPremiumChange(
          comparison,
          explainedAutoPremiumChange
        )
    ).length;
  }
  if (
    !tipOnlyContract &&
    missingAcceleratedB36Warning(reviewContract.rows, contract.b36Payments, systemContract)
  ) {
    count += 1;
  }
  if (
    reviewContract.rows.some(
      (row) => classifyGeneralCommissionCode(row.product, row.type).kind === "unknown"
    )
  ) {
    count += 1;
  }

  return count;
};

const isTotalCommissionItem = (item: CommissionResultItemDTO): boolean =>
  ["celkem", "celkova provize"].includes(normalizeCommissionTitle(item.title));

const expectedAmountFromItems = (
  items: CommissionResultItemDTO[] | null | undefined,
  matcher: (title: string) => boolean
): number =>
  (items ?? [])
    .filter((item) => !isTotalCommissionItem(item))
    .filter((item) => matcher(normalizeCommissionTitle(item.title)))
    .reduce((sum, item) => sum + (Number.isFinite(Number(item.amount)) ? Number(item.amount) : 0), 0);

const expectedClosestAmountFromItems = (
  items: CommissionResultItemDTO[] | null | undefined,
  statementAmount: number,
  matcher: (title: string) => boolean
): number => {
  const candidates = (items ?? [])
    .filter((item) => !isTotalCommissionItem(item))
    .filter((item) => matcher(normalizeCommissionTitle(item.title)))
    .map((item) => Number(item.amount))
    .filter((amount) => Number.isFinite(amount));

  if (candidates.length === 0) return 0;
  const summed = candidates.reduce((sum, amount) => sum + amount, 0);
  const options = candidates.length > 1 ? [...candidates, summed] : candidates;

  return options.reduce((best, amount) =>
    Math.abs(amount - statementAmount) < Math.abs(best - statementAmount) ? amount : best
  );
};

const paymentPeriodsPerYear = (frequency: string | null | undefined): number => {
  const normalized = normalizeCommissionTitle(frequency);
  if (normalized === "monthly" || normalized.includes("mesic")) return 12;
  if (normalized === "quarterly" || normalized.includes("ctvrt")) return 4;
  if (normalized === "semiannual" || normalized.includes("pololet")) return 2;
  return 1;
};

const closestAmount = (amounts: number[], statementAmount: number): number => {
  const candidates = amounts.filter((amount) => Number.isFinite(amount));
  if (candidates.length === 0) return 0;
  return candidates.reduce((best, amount) =>
    Math.abs(amount - statementAmount) < Math.abs(best - statementAmount) ? amount : best
  );
};

const expectedAutoPerPaymentAmountFromItems = (
  items: CommissionResultItemDTO[] | null | undefined,
  statementAmount: number,
  frequency: string | null | undefined
): number => {
  const periods = paymentPeriodsPerYear(frequency);
  const candidates = (items ?? []).flatMap((item) => {
    if (isTotalCommissionItem(item)) return [];
    const title = normalizeCommissionTitle(item.title);
    const amount = Number(item.amount);
    if (!Number.isFinite(amount)) return [];

    const isImmediate =
      title.includes("okamzita") ||
      title.includes("ziskatelska") ||
      title.includes("uzavreni");
    const isAnnual =
      title.includes("provize za rok") ||
      title.includes("celkem za rok") ||
      title.includes("za rok");
    if (!isImmediate && !isAnnual) return [];

    return periods > 1 ? [amount, amount / periods] : [amount];
  });

  return closestAmount(candidates, statementAmount);
};

const expectedAutoAmountForStatementRowBase = (
  row: CommissionRow,
  systemContract: MatchedSystemContract
): number | null => {
  const rowBase = Number(row.base);
  if (!Number.isFinite(rowBase) || rowBase <= 0) return null;

  const productKey =
    resolveStatementProduct(row.product).productKey ?? systemContract.productKey ?? null;
  if (!productKey || !isAutoProduct(productKey)) return null;

  const position = systemContractPosition(systemContract);
  if (!position) return null;

  const signedDateIso = isoDayFromSystemDate(systemContract.contractSignedDate);
  const coefficientSet = effectiveCoefficientSetForContract(systemContract, signedDateIso);
  if (!coefficientSet) return null;

  const frequencyRaw = normalizePaymentFrequencyValue(systemContract.frequencyRaw);
  const commissionMode = normalizeCommissionModeValue(systemContract.commissionMode);
  const durationYears =
    typeof systemContract.durationYears === "number" &&
    Number.isFinite(systemContract.durationYears)
      ? systemContract.durationYears
      : null;
  const result = calculateResultForCoefficientSet({
    productKey,
    amount: rowBase,
    frequencyRaw,
    position,
    commissionMode,
    signedDateIso,
    coefficientSet,
    durationYears,
  });
  if (!result) return null;

  const expected = expectedAutoAmountFromItems(
    result.items,
    row.type,
    row.commission,
    frequencyRaw
  );
  return expected > COMMISSION_AMOUNT_TOLERANCE ? expected : null;
};

const expectedAutoAmountForStatementRowBases = (
  rows: CommissionRow[],
  systemContract: MatchedSystemContract
): number | null => {
  let hasExpected = false;
  const total = rows.reduce((sum, row) => {
    const expected = expectedAutoAmountForStatementRowBase(row, systemContract);
    if (expected == null) return sum;
    hasExpected = true;
    return sum + expected;
  }, 0);

  return hasExpected ? total : null;
};

const comparisonStatus = (
  statementAmount: number,
  expectedAmount: number,
  tolerance = COMMISSION_AMOUNT_TOLERANCE
): CommissionAmountComparisonStatus => {
  const difference = statementAmount - expectedAmount;
  if (Math.abs(difference) <= tolerance) return "ok";
  if (statementAmount <= tolerance && expectedAmount > tolerance) {
    return "missing_statement";
  }
  if (expectedAmount <= tolerance && statementAmount > tolerance) {
    return "missing_expected";
  }
  return "diff";
};

type SubsequentPayoutBundleInfo = {
  periods: number;
  expectedAmount: number;
  difference: number;
  detailLines: string[];
};

const payoutMonthKeyFromRecord = (
  payout: ContractCommissionPayoutRecord
): string | null => {
  const explicit = normalizeText(payout.payoutMonthKey);
  if (/^\d{4}-\d{2}$/.test(explicit)) return explicit;

  return (
    monthKeyFromDate(parsePeriodEndDate(payout.statementPeriod)) ??
    monthKeyFromDate(parseLocalDate(payout.statementDate)) ??
    monthKeyFromDate(parseLocalDate(payout.statementChronologyMs))
  );
};

const payoutRecordMatchesStatementRows = (
  payout: ContractCommissionPayoutRecord,
  rows: CommissionRow[]
): boolean => {
  const payoutCode = normalizeStatementCommissionCode(payout.code);
  if (!payoutCode || rows.length === 0) return false;

  const rowCodes = rows.map((row) => normalizeStatementCommissionCode(row.type));
  if (rowCodes.includes(payoutCode)) return true;

  const allLifeSubsequent = rows.every(
    (row) => classifyLifeSplitCommissionCode(row.type).kind === "subsequent"
  );
  if (allLifeSubsequent && /^B10[1-4]$/.test(payoutCode)) return true;

  return false;
};

const paidPayoutRecordsForRows = (
  systemContract: MatchedSystemContract,
  rows: CommissionRow[]
): ContractCommissionPayoutRecord[] =>
  (systemContract.commissionPayouts ?? []).filter((payout) => {
    const amount = Number(payout.amount);
    return (
      Number.isFinite(amount) &&
      amount > COMMISSION_AMOUNT_TOLERANCE &&
      payout.status !== "storno" &&
      payoutRecordMatchesStatementRows(payout, rows)
    );
  });

const currentRowsLookLikeRepeatedPayout = (
  rows: CommissionRow[],
  expectedPerPeriod: number
): boolean => {
  if (rows.length < 2 || expectedPerPeriod <= COMMISSION_AMOUNT_TOLERANCE) return false;
  const codes = new Set(rows.map((row) => normalizeStatementCommissionCode(row.type)));
  if (codes.size > 1) return false;
  return rows.every(
    (row) => Math.abs(row.commission - expectedPerPeriod) <= COMMISSION_AMOUNT_TOLERANCE
  );
};

const subsequentPayoutBundleInfo = ({
  rows,
  statementAmount,
  expectedPerPeriod,
  systemContract,
  statementPeriod,
}: {
  rows: CommissionRow[];
  statementAmount: number;
  expectedPerPeriod: number;
  systemContract: MatchedSystemContract;
  statementPeriod?: string | null;
}): SubsequentPayoutBundleInfo | null => {
  if (rows.length < 2) return null;
  if (paymentsPerYearForFrequency(systemContract.frequencyRaw) !== 12) return null;
  if (!currentRowsLookLikeRepeatedPayout(rows, expectedPerPeriod)) return null;

  const currentMonthKey = monthKeyFromStatementPeriod(statementPeriod);
  const currentIndex = monthKeyIndex(currentMonthKey);
  if (currentMonthKey == null || currentIndex == null) return null;

  const payouts = paidPayoutRecordsForRows(systemContract, rows);
  const previousMonthKey = addMonthsToMonthKey(currentMonthKey, -1);
  const previousMonthWasPaid = payouts.some(
    (payout) => payoutMonthKeyFromRecord(payout) === previousMonthKey
  );
  if (previousMonthWasPaid) return null;

  const previousPaidIndexes = payouts
    .map((payout) => monthKeyIndex(payoutMonthKeyFromRecord(payout)))
    .filter((index): index is number => index != null && index < currentIndex)
    .sort((left, right) => left - right);

  const lastPaidIndex = previousPaidIndexes.at(-1);
  if (lastPaidIndex == null) return null;

  const periodsSinceLastPaid = currentIndex - lastPaidIndex;
  if (periodsSinceLastPaid !== rows.length) return null;

  const expectedAmount = Math.round(expectedPerPeriod * rows.length * 100) / 100;
  const difference = Math.round((statementAmount - expectedAmount) * 100) / 100;
  if (Math.abs(difference) > COMMISSION_AMOUNT_TOLERANCE) return null;

  const lastPaidMonthKey = monthKeyFromIndex(lastPaidIndex);
  return {
    periods: rows.length,
    expectedAmount,
    difference,
    detailLines: [
      `Výpis obsahuje ${rows.length} stejné následné provize.`,
      `Poslední zapsaná výplata byla ${formatMonthKey(lastPaidMonthKey)} a v ${formatMonthKey(previousMonthKey)} není zapsaná žádná stejná následná provize.`,
      `Beru to jako souhrnnou výplatu za ${rows.length} období, ne jako rozdíl.`,
    ],
  };
};

const buildLifeSplitAmountComparisons = (
  contract: LifeSplitContractPreview,
  systemContract: MatchedSystemContract,
  statementPeriod?: string | null
): CommissionAmountComparison[] => {
  if (isNeonRefreshMissingOriginalInSystem(systemContract)) return [];
  const coefficientOverride = lifeCoefficientOverrideInfo(contract, systemContract);
  const items = coefficientOverride?.items ?? systemContract.items ?? [];
  const tipRows = rowsByKind(contract, "tip");
  const tipStatementAmount = sumRows(tipRows);
  if (items.length === 0 && tipRows.length === 0) return [];
  const hasA101InStatement = rowsByKind(contract, "a101").length > 0;
  const hasB0301InStatement = rowsByKind(contract, "b0301").length > 0;
  const subsequentRows = rowsByKind(contract, "subsequent");
  const subsequentStatementAmount = sumRows(subsequentRows);
  const subsequentExpectedPerPeriod = expectedAmountFromItems(
    items,
    (title) =>
      title.includes("nasledna") &&
      (title.includes("2 5") || title.includes("2 5 rok"))
  );
  const subsequentBundleInfo = subsequentPayoutBundleInfo({
    rows: subsequentRows,
    statementAmount: subsequentStatementAmount,
    expectedPerPeriod: subsequentExpectedPerPeriod,
    systemContract,
    statementPeriod,
  });
  const expectedB36HalfAmount = expectedAmountFromItems(
    items,
    (title) => title.includes("50") && (title.includes("b36") || title.includes("b3601"))
  );
  const statementB36HalfAmount = b36StatementAmountForReview(
    contract.b36Payments,
    expectedB36HalfAmount
  );

  const statementParts = [
    {
      key: "tip",
      label: "ATP101",
      requiredNow: false,
      statementAmount: tipStatementAmount,
      expectedAmount: tipExpectedAmountFromSystemContract(systemContract),
      detailLines: [
        "Očekávanou částku beru z TIP vazby na zdrojové smlouvě.",
      ],
    },
    {
      key: "a101",
      label: "A101",
      requiredNow: false,
      statementAmount: sumRows(rowsByKind(contract, "a101")),
      expectedAmount: expectedAmountFromItems(items, (title) => title.includes("a101")),
    },
    {
      key: "b0301",
      label: "B0301",
      requiredNow: false,
      statementAmount: sumRows(rowsByKind(contract, "b0301")),
      expectedAmount: expectedAmountFromItems(items, (title) => title.includes("b0301")),
    },
    {
      key: "b36-half",
      label: b36HalfLabelForProduct(contract.productCode),
      requiredNow: hasA101InStatement && hasB0301InStatement,
      statementAmount: statementB36HalfAmount,
      expectedAmount: expectedB36HalfAmount,
    },
    {
      key: "b3601",
      label: b36DeferredCodeForProduct(contract.productCode),
      requiredNow: false,
      statementAmount: sumRows(rowsByKind(contract, "b3601")),
      expectedAmount: expectedAmountFromItems(
        items,
        (title) =>
          !title.includes("50") &&
          (title.includes("b3601") || title.includes("b36") || title.includes("po 3 letech"))
      ),
    },
    {
      key: "b4801",
      label: "B4801",
      requiredNow: false,
      statementAmount: sumRows(rowsByKind(contract, "b4801")),
      expectedAmount: expectedAmountFromItems(
        items,
        (title) => title.includes("b4801") || title.includes("b48") || title.includes("po 4 letech")
      ),
    },
    {
      key: "subsequent",
      label: subsequentBundleInfo
        ? `B101-B104 (${subsequentBundleInfo.periods} období)`
        : "B101-B104",
      requiredNow: false,
      statementAmount: subsequentStatementAmount,
      expectedAmount: subsequentBundleInfo?.expectedAmount ?? subsequentExpectedPerPeriod,
      detailLines: subsequentBundleInfo?.detailLines,
    },
    {
      key: "care",
      label: "B201-B206",
      requiredNow: false,
      statementAmount: sumRows(rowsByKind(contract, "care")),
      expectedAmount: expectedAmountFromItems(
        items,
        (title) =>
          title.includes("pecovatelska") ||
          (title.includes("nasledna") && title.includes("5 10"))
      ),
    },
  ];

  return statementParts
    .filter(
      (part) =>
        part.statementAmount > COMMISSION_AMOUNT_TOLERANCE ||
        (part.requiredNow && part.expectedAmount > COMMISSION_AMOUNT_TOLERANCE)
    )
    .map((part) => ({
      ...part,
      difference: part.statementAmount - part.expectedAmount,
      status: comparisonStatus(part.statementAmount, part.expectedAmount),
    }));
};

const rowsByGeneralKinds = (
  contract: OtherProductContractPreview,
  kinds: GeneralCommissionKind[]
): CommissionRow[] =>
  contract.rows.filter((row) =>
    kinds.includes(classifyGeneralCommissionCode(row.product, row.type).kind)
  );

const otherProductContractHasOnlyTipRows = (contract: OtherProductContractPreview): boolean =>
  contract.rows.length > 0 &&
  contract.rows.some((row) => classifyGeneralCommissionCode(row.product, row.type).kind === "tip") &&
  contract.rows.every((row) => classifyGeneralCommissionCode(row.product, row.type).kind === "tip");

const otherProductContractMatchScope = (
  contract: OtherProductContractPreview
): ContractMatchScope => (otherProductContractHasOnlyTipRows(contract) ? "tip" : "my");

const buildOtherProductAmountComparisons = (
  contract: OtherProductContractPreview,
  systemContract: MatchedSystemContract,
  statementPeriod?: string | null
): CommissionAmountComparison[] => {
  if (otherProductContractHasOnlyTipRows(contract)) {
    const statementAmount = sumRows(rowsByGeneralKinds(contract, ["tip"]));
    const expectedAmount = tipExpectedAmountFromSystemContract(systemContract);
    if (statementAmount <= COMMISSION_AMOUNT_TOLERANCE && expectedAmount <= COMMISSION_AMOUNT_TOLERANCE) {
      return [];
    }
    return [
      {
        key: "tip",
        label: "ATP101",
        statementAmount,
        expectedAmount,
        difference: statementAmount - expectedAmount,
        status: comparisonStatus(statementAmount, expectedAmount),
        detailLines: [
          "Očekávanou částku beru z TIP vazby na zdrojové smlouvě.",
        ],
      },
    ];
  }

  const coefficientOverride = autoCoefficientOverrideInfo(contract, systemContract);
  const items = coefficientOverride?.items ?? systemContract.items ?? [];
  if (items.length === 0) return [];
  const isAutoContract = contractHasProductCategory(contract, "auto");

  if (isAutoContract) {
    const immediateRows = rowsByGeneralKinds(contract, ["closing", "installment"]);
    const immediateStatementAmount = sumRows(immediateRows);
    const subsequentRows = rowsByGeneralKinds(contract, ["subsequent"]);
    const subsequentStatementAmount = sumRows(subsequentRows);
    const premiumReference = autoPremiumBaseReferenceForStatement(
      contract,
      systemContract,
      statementPeriod
    );
    const immediateExpectedFromStatementBase = expectedAutoAmountForStatementRowBases(
      immediateRows,
      systemContract
    );
    const immediateExpectedAmount =
      immediateExpectedFromStatementBase ??
      scaleAutoExpectedAmountForPremiumReference(
        expectedAutoPerPaymentAmountFromItems(
          items,
          immediateStatementAmount,
          systemContract.frequencyRaw
        ),
        systemContract,
        premiumReference
      );
    const comparisons: CommissionAmountComparison[] =
      immediateStatementAmount > COMMISSION_AMOUNT_TOLERANCE
        ? [
            {
              key: "auto-immediate",
              label: "Okamžitá provize",
              statementAmount: immediateStatementAmount,
              expectedAmount: immediateExpectedAmount,
              difference: immediateStatementAmount - immediateExpectedAmount,
              status: comparisonStatus(immediateStatementAmount, immediateExpectedAmount),
            },
          ]
        : [];

    if (subsequentStatementAmount > COMMISSION_AMOUNT_TOLERANCE) {
      const productKey = systemContract.productKey;
      const expectedSubsequent =
        productKey && isAutoProduct(productKey)
          ? autoSubsequentExpectedAmountForRows(productKey, systemContract, subsequentRows)
          : null;
      const expectedFromStatementBase = expectedAutoAmountForStatementRowBases(
        subsequentRows,
        systemContract
      );
      const rowSummedExpectedAmount = expectedFromStatementBase ?? expectedSubsequent;
      const fallbackExpectedAmount = scaleAutoExpectedAmountForPremiumReference(
        expectedClosestAmountFromItems(
          items,
          subsequentStatementAmount,
          (title) =>
            title.includes("nasledna") ||
            title.includes("provize za rok") ||
            title.includes("celkem za rok")
        ),
        systemContract,
        premiumReference
      );
      const expectedAmount =
        rowSummedExpectedAmount ?? fallbackExpectedAmount;
      const expectedPerPeriod =
        rowSummedExpectedAmount != null && subsequentRows.length > 0
          ? Math.round((rowSummedExpectedAmount / subsequentRows.length) * 100) / 100
          : fallbackExpectedAmount;
      const subsequentBundleInfo = subsequentPayoutBundleInfo({
        rows: subsequentRows,
        statementAmount: subsequentStatementAmount,
        expectedPerPeriod,
        systemContract,
        statementPeriod,
      });
      const finalExpectedAmount = subsequentBundleInfo?.expectedAmount ?? expectedAmount;
      comparisons.push({
        key: "auto-subsequent",
        label: subsequentBundleInfo
          ? `Následná provize (${subsequentBundleInfo.periods} období)`
          : "Následná provize",
        statementAmount: subsequentStatementAmount,
        expectedAmount: finalExpectedAmount,
        difference: subsequentStatementAmount - finalExpectedAmount,
        status: comparisonStatus(subsequentStatementAmount, finalExpectedAmount),
        detailLines: subsequentBundleInfo?.detailLines,
      });
    }

    const b36GrossAmount = b36PaidPaymentAmounts(contract.b36Payments).reduce(
      (sum, amount) => sum + amount,
      0
    );
    if (b36GrossAmount > COMMISSION_AMOUNT_TOLERANCE) {
      const expectedB36 = expectedClosestAmountFromItems(
        items,
        b36GrossAmount,
        (title) => title.includes("50") && (title.includes("b36") || title.includes("b3601"))
      );
      const b36Amount = b36StatementAmountForReview(contract.b36Payments, expectedB36);
      const scaledExpectedB36 = scaleAutoExpectedAmountForPremiumReference(
        expectedB36,
        systemContract,
        premiumReference
      );
      comparisons.push({
        key: "b36-half",
        label: "50% z B36",
        statementAmount: b36Amount,
        expectedAmount: scaledExpectedB36,
        difference: b36Amount - scaledExpectedB36,
        status: comparisonStatus(b36Amount, scaledExpectedB36),
      });
    }

    return comparisons;
  }

  const groups = [
    {
      key: "closing",
      label: "Sjednávací / okamžitá",
      rows: rowsByGeneralKinds(contract, ["closing", "tip"]),
      matcher: (title: string) =>
        title.includes("okamzita") ||
        title.includes("ziskatelska") ||
        title.includes("uzavreni"),
    },
    {
      key: "subsequent",
      label: "Následná / splátka",
      rows: rowsByGeneralKinds(contract, ["subsequent", "installment"]),
      matcher: (title: string) =>
        title.includes("nasledna") ||
        title.includes("provize za rok") ||
        title.includes("celkem za rok"),
    },
    {
      key: "increase",
      label: "Navýšení",
      rows: rowsByGeneralKinds(contract, ["increase"]),
      matcher: (title: string) => title.includes("navyseni"),
    },
    {
      key: "unexpected",
      label: "Neočekávaná",
      rows: rowsByGeneralKinds(contract, ["unexpected"]),
      matcher: (title: string) => title.includes("neocekavana"),
    },
  ];

  const comparisons: CommissionAmountComparison[] = groups
    .map((group) => {
      const statementAmount = sumRows(group.rows);
      const expectedPerPeriod = expectedClosestAmountFromItems(
        items,
        statementAmount,
        group.matcher
      );
      const subsequentBundleInfo =
        group.key === "subsequent"
          ? subsequentPayoutBundleInfo({
              rows: group.rows,
              statementAmount,
              expectedPerPeriod,
              systemContract,
              statementPeriod,
            })
          : null;
      const expectedAmount = subsequentBundleInfo?.expectedAmount ?? expectedPerPeriod;
      return {
        key: group.key,
        label: subsequentBundleInfo
          ? `${group.label} (${subsequentBundleInfo.periods} období)`
          : group.label,
        statementAmount,
        expectedAmount,
        difference: statementAmount - expectedAmount,
        status: comparisonStatus(statementAmount, expectedAmount),
        detailLines: subsequentBundleInfo?.detailLines,
      };
    })
    .filter((comparison) => comparison.statementAmount > COMMISSION_AMOUNT_TOLERANCE);

  const b36GrossAmount = b36PaidPaymentAmounts(contract.b36Payments).reduce(
    (sum, amount) => sum + amount,
    0
  );
  if (b36GrossAmount > COMMISSION_AMOUNT_TOLERANCE) {
    const expectedB36 = expectedClosestAmountFromItems(
      items,
      b36GrossAmount,
      (title) => title.includes("50") && (title.includes("b36") || title.includes("b3601"))
    );
    const b36Amount = b36StatementAmountForReview(contract.b36Payments, expectedB36);
    comparisons.push({
      key: "b36-half",
      label: "50% z B36",
      statementAmount: b36Amount,
      expectedAmount: expectedB36,
      difference: b36Amount - expectedB36,
      status: comparisonStatus(b36Amount, expectedB36),
    });
  }

  return comparisons;
};

const normalizeEmailForComparison = (value: string | null | undefined): string =>
  String(value ?? "").trim().toLowerCase();

const managerOverrideForViewer = (
  systemContract: MatchedSystemContract | null,
  currentUserEmail: string | null | undefined
): ManagerOverrideSummary | null => {
  const overrides = systemContract?.managerOverrides ?? [];
  if (overrides.length === 0) return null;

  const normalizedEmail = normalizeEmailForComparison(currentUserEmail);
  if (normalizedEmail) {
    const exactMatch = overrides.find(
      (override) => normalizeEmailForComparison(override.email) === normalizedEmail
    );
    if (exactMatch) return exactMatch;
  }

  return overrides.length === 1 ? overrides[0] ?? null : null;
};

const managerCommissionItemMatcher = (row: ManagerCommissionRow): ((title: string) => boolean) => {
  const type = normalizeCommissionTitle(row.type);
  const kind = classifyGeneralCommissionCode(row.product, row.type).kind;

  return (titleRaw: string) => {
    const title = normalizeCommissionTitle(titleRaw);
    const isB36Type = type === "b36" || type === "b036" || type === "b3601";
    const isB36HalfType =
      (type.includes("50") || type.includes("polovina")) &&
      (type.includes("b36") || type.includes("b036"));
    if (type && !isB36Type && !isB36HalfType && title.includes(type)) return true;

    if (type.startsWith("a")) {
      return (
        title.includes("okamzita") ||
        title.includes("ziskatelska") ||
        title.includes("uzavreni")
      );
    }

    if (type.includes("b0301")) return title.includes("b0301");
    if ((type.includes("50") || type.includes("polovina")) && type.includes("b36")) {
      return title.includes("50") && (title.includes("b36") || title.includes("b3601"));
    }
    if (type === "b36" || type === "b3601") {
      return (
        title.includes("po 3") ||
        (!title.includes("50") && (title.includes("b36") || title.includes("b3601")))
      );
    }
    if (type === "b48" || type === "b4801") {
      return title.includes("po 4") || title.includes("b48") || title.includes("b4801");
    }
    if (/^b10[1-4]$/.test(type)) return title.includes("nasledna");
    if (/^b20[1-6]$/.test(type)) {
      return title.includes("pecovatelska") || (title.includes("nasledna") && title.includes("5 10"));
    }
    if (type.startsWith("bc")) {
      return title.includes("provize za rok") || title.includes("celkem za rok") || title.includes("nasledna");
    }

    switch (kind) {
      case "closing":
      case "tip":
        return (
          title.includes("okamzita") ||
          title.includes("ziskatelska") ||
          title.includes("uzavreni")
        );
      case "installment":
      case "subsequent":
        return (
          title.includes("nasledna") ||
          title.includes("provize za rok") ||
          title.includes("celkem za rok")
        );
      case "increase":
        return title.includes("navyseni");
      case "unexpected":
        return title.includes("neocekavana");
      default:
        return false;
    }
  };
};

const normalizeCommissionCode = (value: string | null | undefined): string =>
  normalizeStatementCommissionCode(value);

const commissionItemCodeMatchesStatementCode = (
  itemCode: string | null | undefined,
  rowCode: string
): boolean => {
  const code = baseCommissionCodeForStatementComparison(itemCode);
  const comparableRowCode = baseCommissionCodeForStatementComparison(rowCode);
  if (!code || !comparableRowCode) return false;
  if (code === comparableRowCode) return true;
  const rangeMatch = code.match(/^([A-Z]+)(\d+)-([A-Z]+)(\d+)$/);
  const rowMatch = comparableRowCode.match(/^([A-Z]+)(\d+)$/);
  if (rangeMatch && rowMatch && rangeMatch[1] === rangeMatch[3]) {
    const [, prefix, startRaw, , endRaw] = rangeMatch;
    const [, rowPrefix, rowNumberRaw] = rowMatch;
    const start = Number(startRaw);
    const end = Number(endRaw);
    const rowNumber = Number(rowNumberRaw);
    if (
      prefix === rowPrefix &&
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      Number.isFinite(rowNumber) &&
      rowNumber >= start &&
      rowNumber <= end
    ) {
      return true;
    }
  }
  if (/^[A-Z]+$/.test(code) && rowMatch) {
    return rowMatch[1] === code;
  }
  if (/^B10[1-4]$/.test(comparableRowCode)) return code === "B101-B104";
  if (/^B20[1-6]$/.test(comparableRowCode)) return code === "B201-B206";
  return false;
};

const expectedManagerAmountFromItems = (
  items: CommissionResultItemDTO[],
  row: ManagerCommissionRow
): number => {
  const rowCode = normalizeCommissionCode(row.type);
  const exactCodeMatches = items
    .filter((item) => !isTotalCommissionItem(item))
    .filter((item) => commissionItemCodeMatchesStatementCode(item.code, rowCode))
    .map((item) => Number(item.amount))
    .filter((amount) => Number.isFinite(amount));

  if (exactCodeMatches.length > 0) {
    return exactCodeMatches.reduce((sum, amount) => sum + amount, 0);
  }

  return expectedClosestAmountFromItems(
    items,
    Math.abs(row.commission),
    managerCommissionItemMatcher(row)
  );
};

const managerCommissionPremiumBaseMismatch = (
  row: ManagerCommissionRow,
  systemContract: MatchedSystemContract | null
): {
  statementLabel: string;
  systemLabel: string;
  differenceLabel: string;
} | null => {
  const statementBase = Number(row.base);
  if (!Number.isFinite(statementBase) || statementBase <= ANNUAL_PREMIUM_TOLERANCE) {
    return null;
  }

  const product = resolveStatementProduct(row.product);
  if (product.usesAnnualPremiumBase) {
    const mismatch = annualPremiumBaseMismatch(statementBase, systemContract);
    if (!mismatch) return null;
    return {
      statementLabel: `${formatWholeMoney(mismatch.statementAnnualPremium)} Kč ročně`,
      systemLabel: `${formatWholeMoney(mismatch.systemAnnualPremium)} Kč ročně`,
      differenceLabel: `${formatWholeMoney(mismatch.difference)} Kč ročně`,
    };
  }

  const mismatch = premiumBaseComparison(statementBase, systemContract, "payment");
  if (!mismatch) return null;
  if (
    Math.abs(mismatch.difference) <= ANNUAL_PREMIUM_TOLERANCE ||
    Math.round(mismatch.difference) === 0
  ) {
    return null;
  }
  return {
    statementLabel: `${formatWholeMoney(mismatch.statementPremiumBase)} Kč`,
    systemLabel: `${formatWholeMoney(mismatch.systemPremiumBase)} Kč`,
    differenceLabel: `${formatWholeMoney(mismatch.difference)} Kč`,
  };
};

const managerCommissionDifferenceReason = (
  row: ManagerCommissionRow,
  systemContract: MatchedSystemContract | null,
  currentUserEmail: string | null | undefined,
  status: CommissionAmountComparisonStatus
): Pick<CommissionAmountComparison, "reason" | "reasonTitle" | "reasonLines"> => {
  if (status === "ok") return {};

  const override = managerOverrideForViewer(systemContract, currentUserEmail);
  const careerCheck = statementCareerMismatch([row], override?.position);
  if (
    careerCheck.careers.length > 0 &&
    careerCheck.systemPosition &&
    careerCheck.mismatched
  ) {
    return {
      reason: "career_mismatch",
      reasonTitle: "Důvod: kariérní stupeň meziprovize",
      reasonLines: [
        `Výpis uvádí Kar. ${statementCareerPositionsLabel(careerCheck.careers)}, systém počítá meziprovizi jako ${positionLabel(careerCheck.systemPosition)}.`,
      ],
    };
  }

  const baseMismatch = managerCommissionPremiumBaseMismatch(row, systemContract);
  if (baseMismatch) {
    return {
      reason: "premium_base_mismatch",
      reasonTitle: "Důvod: jiná základna",
      reasonLines: [
        `Výpisová základna: ${baseMismatch.statementLabel}. Systémová základna: ${baseMismatch.systemLabel}. Rozdíl základny: ${baseMismatch.differenceLabel}.`,
      ],
    };
  }

  return {
    reason: "commission_amount_mismatch",
    reasonTitle: "Důvod: rozdíl v částce provize",
    reasonLines: [
      "Kariérní stupeň ani základna nevysvětlují rozdíl. Prověř konkrétní koeficient nebo výpočet této položky.",
    ],
  };
};

const buildManagerCommissionAmountComparison = (
  row: ManagerCommissionRow,
  systemContract: MatchedSystemContract | null,
  currentUserEmail: string | null | undefined
): CommissionAmountComparison | null => {
  if (row.isStorno || row.commission < 0) return null;
  if (!systemContract) return null;

  const override = managerOverrideForViewer(systemContract, currentUserEmail);
  const items = override?.items ?? [];
  if (items.length === 0) return null;

  const expectedAbsAmount = expectedManagerAmountFromItems(items, row);
  const expectedAmount = expectedAbsAmount;
  const status = comparisonStatus(
    row.commission,
    expectedAmount,
    MANAGER_COMMISSION_AMOUNT_TOLERANCE
  );

  return {
    key: `manager-${row.id}-${row.contractNumber}-${row.type}-commission`,
    label: `Meziprovize ${row.type || "—"}`,
    statementAmount: row.commission,
    expectedAmount,
    difference: row.commission - expectedAmount,
    status,
    ...managerCommissionDifferenceReason(row, systemContract, currentUserEmail, status),
  };
};

const managerCommissionRowKey = (advisorNumber: string, row: ManagerCommissionRow): string =>
  `${advisorNumber}-${row.id}-${row.contractNumber}-${row.type}-${row.isStorno ? "storno" : "commission"}`;

const amountComparisonStatusLabel = (status: CommissionAmountComparisonStatus): string => {
  switch (status) {
    case "ok":
      return "Sedí";
    case "missing_statement":
      return "Chybí ve výpisu";
    case "missing_expected":
      return "Chybí v systému";
    default:
      return "Rozdíl";
  }
};

const amountComparisonStatusClass = (status: CommissionAmountComparisonStatus): string => {
  switch (status) {
    case "ok":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "missing_statement":
    case "missing_expected":
    case "diff":
      return "border-rose-200 bg-rose-50 text-rose-800";
  }
};

const amountIssueCountLabel = (count: number): string => {
  if (count === 1) return "1 rozdíl";
  if (count >= 2 && count <= 4) return `${count} rozdíly`;
  return `${count} rozdílů`;
};

const groupStornoRowsByContract = (
  rows: StornoCommissionRow[]
): StornoCommissionGroup[] => {
  const groups = new Map<string, StornoCommissionGroup>();

  rows.forEach((row, index) => {
    const normalizedContractNumber = normalizeContractNumberForMatch(row.contractNumber);
    const key = normalizedContractNumber || `bez-cisla-${index}`;
    const previous = groups.get(key);
    if (previous) {
      previous.rows.push(row);
      previous.totalCommission += row.commission;
      previous.totalReserveFund += row.reserveFund;
      return;
    }

    groups.set(key, {
      key,
      contractNumber: row.contractNumber,
      rows: [row],
      totalCommission: row.commission,
      totalReserveFund: row.reserveFund,
    });
  });

  return [...groups.values()].map((group) => ({
    ...group,
    totalCommission: Math.round(group.totalCommission * 100) / 100,
    totalReserveFund: Math.round(group.totalReserveFund * 100) / 100,
  }));
};

const stornoContractGroupKey = (
  contractNumber: string | null | undefined,
  client: string | null | undefined,
  fallback: string
): string => {
  const normalizedContractNumber = normalizeContractNumberForMatch(contractNumber);
  if (normalizedContractNumber) return `contract-${normalizedContractNumber}`;

  const normalizedClient = normalizeText(client).toLocaleLowerCase("cs-CZ");
  if (normalizedClient) return `client-${normalizedClient}-${fallback}`;

  return `without-contract-${fallback}`;
};

const groupStornoItemsByContract = (
  rows: StornoCommissionRow[],
  payments: OtherPayment[]
): StornoContractGroup[] => {
  const groups = new Map<string, StornoContractGroup>();

  const ensureGroup = ({
    key,
    contractNumber,
    client,
  }: {
    key: string;
    contractNumber: string | null;
    client: string;
  }): StornoContractGroup => {
    const existing = groups.get(key);
    if (existing) {
      if (!existing.contractNumber && contractNumber) existing.contractNumber = contractNumber;
      if (!existing.client && client) existing.client = client;
      return existing;
    }

    const group: StornoContractGroup = {
      key,
      contractNumber,
      client,
      rows: [],
      payments: [],
      totalCommission: 0,
      totalReserveFund: 0,
      totalOtherPayments: 0,
      totalAmount: 0,
    };
    groups.set(key, group);
    return group;
  };

  rows.forEach((row, index) => {
    const key = stornoContractGroupKey(row.contractNumber, row.client, `row-${index}`);
    const group = ensureGroup({
      key,
      contractNumber: row.contractNumber || null,
      client: row.client || "",
    });
    group.rows.push(row);
    group.totalCommission += row.commission;
    group.totalReserveFund += row.reserveFund;
  });

  payments.forEach((payment, index) => {
    const key = stornoContractGroupKey(payment.contractNumber, null, `payment-${index}`);
    const group = ensureGroup({
      key,
      contractNumber: payment.contractNumber,
      client: "",
    });
    group.payments.push({ ...payment, index });
    group.totalOtherPayments += payment.amount;
  });

  return [...groups.values()].map((group) => {
    const totalCommission = Math.round(group.totalCommission * 100) / 100;
    const totalReserveFund = Math.round(group.totalReserveFund * 100) / 100;
    const totalOtherPayments = Math.round(group.totalOtherPayments * 100) / 100;
    return {
      ...group,
      totalCommission,
      totalReserveFund,
      totalOtherPayments,
      totalAmount: Math.round((totalCommission + totalOtherPayments) * 100) / 100,
    };
  });
};

const uncertaintyCountLabel = (count: number): string => {
  if (count === 1) return "1 nejasnost";
  if (count >= 2 && count <= 4) return `${count} nejasnosti`;
  return `${count} nejasností`;
};

const statementDiscrepancyKey = (statement: ParsedStatement): string => {
  const parts = [
    statement.header.statementNumber ? `vypis-${statement.header.statementNumber}` : null,
    statement.header.statementDate,
    statement.header.period,
    statement.fileName,
  ]
    .map((part) => normalizeText(part))
    .filter(Boolean);

  return parts.join("::") || statement.fileName || "provizni-vypis";
};

const discrepancyIssueKey = (
  ...parts: Array<string | number | null | undefined>
): string =>
  parts
    .map((part) => normalizeText(String(part ?? "")))
    .filter(Boolean)
    .join("::");

const hasFiniteNumber = (value: number | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);

const discrepancySeverityLabel = (severity: StatementDiscrepancySeverity): string => {
  switch (severity) {
    case "error":
      return "K opravě";
    case "warning":
      return "Ke kontrole";
    default:
      return "Poznámka";
  }
};

const discrepancySeverityClass = (severity: StatementDiscrepancySeverity): string => {
  switch (severity) {
    case "error":
      return "border-rose-200 bg-rose-50 text-rose-800";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-900";
    default:
      return "border-sky-200 bg-sky-50 text-sky-800";
  }
};

const discrepancyScopeLabel = (scope: ContractMatchScope | null): string => {
  if (scope === "team") return "Týmová smlouva";
  if (scope === "tip") return "TIP provize";
  if (scope === "my") return "Vlastní smlouva";
  return "Výpis";
};

const HTML_ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const escapeHtml = (value: unknown): string =>
  String(value ?? "").replace(/[&<>"']/g, (char) => HTML_ESCAPE[char] ?? char);

const manualDiscrepancyToIssue = (
  item: ManualDiscrepancyItem
): StatementDiscrepancyIssue => ({
  key: item.key,
  statementKey: item.statementKey,
  source: "manual",
  severity: "warning",
  category: "Ručně označeno",
  scope: null,
  contractNumber: normalizeText(item.contractNumber) || null,
  client: normalizeText(item.client) || "—",
  product: normalizeText(item.product) || "—",
  title: normalizeText(item.title) || "Ručně označená nesrovnalost",
  details: normalizeText(item.amountText) ? [`Částka / rozdíl: ${normalizeText(item.amountText)}`] : [],
  manualAmountText: normalizeText(item.amountText) || undefined,
});

const contractMatchDiscrepancyIssue = ({
  statementKey,
  category,
  keyPrefix,
  scope,
  contractNumber,
  client,
  product,
  match,
}: {
  statementKey: string;
  category: string;
  keyPrefix: string;
  scope: ContractMatchScope;
  contractNumber: string | null | undefined;
  client: string;
  product: string;
  match: ContractMatchState | null;
}): StatementDiscrepancyIssue | null => {
  if (!isUnpairedContractMatch(match)) return null;

  if (match?.status === "not_found") {
    return {
      key: discrepancyIssueKey(statementKey, keyPrefix, scope, contractNumber, "not-found"),
      statementKey,
      source: "auto",
      severity: "warning",
      category,
      scope,
      contractNumber: normalizeText(contractNumber) || null,
      client: normalizeText(client) || "—",
      product: normalizeText(product) || "—",
      title: "Smlouva není nalezená v systému",
      details: ["Ověřit číslo smlouvy, poradce nebo ruční dopárování před opravou výpisu."],
    };
  }

  if (match?.status === "error") {
    return {
      key: discrepancyIssueKey(statementKey, keyPrefix, scope, contractNumber, "match-error"),
      statementKey,
      source: "auto",
      severity: "warning",
      category,
      scope,
      contractNumber: normalizeText(contractNumber) || null,
      client: normalizeText(client) || "—",
      product: normalizeText(product) || "—",
      title: "Smlouvu se nepodařilo ověřit vůči systému",
      details: [match.error || "Párování smlouvy v systému skončilo chybou."],
    };
  }

  if (match?.status === "matched" && !matchedSystemContract(match)) {
    const examples = match.contracts
      .slice(0, 3)
      .map((contract) => contract.clientName || contract.contractNumber || contract.id)
      .filter(Boolean);
    return {
      key: discrepancyIssueKey(statementKey, keyPrefix, scope, contractNumber, "multiple"),
      statementKey,
      source: "auto",
      severity: "warning",
      category,
      scope,
      contractNumber: normalizeText(contractNumber) || null,
      client: normalizeText(client) || "—",
      product: normalizeText(product) || "—",
      title: `Více shod v systému (${match.contracts.length})`,
      details: examples.length > 0 ? [`Nalezené shody: ${examples.join("; ")}`] : [],
    };
  }

  return null;
};

const careerPositionDiscrepancyIssue = ({
  statementKey,
  category,
  keyPrefix,
  scope,
  contractNumber,
  client,
  product,
  rows,
  systemPositionRaw,
}: {
  statementKey: string;
  category: string;
  keyPrefix: string;
  scope: ContractMatchScope;
  contractNumber: string | null | undefined;
  client: string;
  product: string;
  rows: Array<{ career: string }>;
  systemPositionRaw: unknown;
}): StatementDiscrepancyIssue | null => {
  const { careers, systemPosition, mismatched } = statementCareerMismatch(
    rows,
    systemPositionRaw
  );
  if (careers.length === 0) return null;

  const careerLabel = statementCareerPositionsLabel(careers);
  if (!systemPosition) {
    return {
      key: discrepancyIssueKey(statementKey, keyPrefix, scope, contractNumber, "missing-system-position"),
      statementKey,
      source: "auto",
      severity: "warning",
      category,
      scope,
      contractNumber: normalizeText(contractNumber) || null,
      client: normalizeText(client) || "—",
      product: normalizeText(product) || "—",
      title: "Kar. z výpisu nelze ověřit",
      details: [
        `Výpis Kar.: ${careerLabel}`,
        "Systém nemá u smlouvy uloženou pozici pro porovnání.",
      ],
    };
  }

  if (!mismatched) return null;

  return {
    key: discrepancyIssueKey(
      statementKey,
      keyPrefix,
      scope,
      contractNumber,
      careers.map((career) => career.raw).join("-"),
      systemPosition
    ),
    statementKey,
    source: "auto",
    severity: "error",
    category,
    scope,
    contractNumber: normalizeText(contractNumber) || null,
    client: normalizeText(client) || "—",
    product: normalizeText(product) || "—",
    title: "Kar. ve výpisu nesedí s pozicí smlouvy",
    details: [
      `Výpis Kar.: ${careerLabel}`,
      `Systém: ${positionLabel(systemPosition)} (${systemPosition})`,
    ],
  };
};

const managerCareerPositionDiscrepancyIssue = ({
  statementKey,
  advisor,
  row,
  systemContract,
  currentUserEmail,
}: {
  statementKey: string;
  advisor: ManagerCommissionAdvisor;
  row: ManagerCommissionRow;
  systemContract: MatchedSystemContract | null;
  currentUserEmail: string | null | undefined;
}): StatementDiscrepancyIssue | null => {
  if (!systemContract) return null;

  const career = statementCareerPositionFromValue(row.career);
  if (!career) return null;

  const override = managerOverrideForViewer(systemContract, currentUserEmail);
  const overridePosition = normalizePositionValue(override?.position);
  const product = `${resolveStatementProduct(row.product).label} · ${row.product}`;
  const advisorLabel = advisor.advisorName || advisor.advisorNumber || "—";

  if (!overridePosition) {
    return {
      key: discrepancyIssueKey(
        statementKey,
        "manager-career",
        advisor.advisorNumber,
        row.contractNumber,
        row.id,
        "missing-system-position"
      ),
      statementKey,
      source: "auto",
      severity: "warning",
      category: "Provize manažera",
      scope: "team",
      contractNumber: row.contractNumber || null,
      client: row.client || systemContract.clientName || "—",
      product,
      title: "Kar. meziprovize nelze ověřit",
      details: [
        `Poradce: ${advisorLabel}`,
        `Výpis Kar.: ${statementCareerPositionLabel(career)}`,
        "Systém nemá uloženou odpovídající manažerskou pozici v meziprovizi.",
      ],
      statementAmount: row.commission,
    };
  }

  if (career.position === overridePosition) return null;

  return {
    key: discrepancyIssueKey(
      statementKey,
      "manager-career",
      advisor.advisorNumber,
      row.contractNumber,
      row.id,
      career.raw,
      overridePosition
    ),
    statementKey,
    source: "auto",
    severity: "error",
    category: "Provize manažera",
    scope: "team",
    contractNumber: row.contractNumber || null,
    client: row.client || systemContract.clientName || "—",
    product,
    title: "Kar. meziprovize nesedí s pozicí manažera",
    details: [
      `Poradce: ${advisorLabel}`,
      `Výpis Kar.: ${statementCareerPositionLabel(career)}`,
      `Systém: ${positionLabel(overridePosition)} (${overridePosition})`,
    ],
    statementAmount: row.commission,
  };
};

const buildStatementDiscrepancyIssues = (
  statement: ParsedStatement,
  matchesByContractNumber: ContractMatchesByNumber,
  currentUserEmail?: string | null,
  correctionContext?: StatementCorrectionContext
): StatementDiscrepancyIssue[] => {
  const statementKey = statementDiscrepancyKey(statement);
  const issues: StatementDiscrepancyIssue[] = [];
  const managerMatchIssueKeys = new Set<string>();

  const addIssue = (issue: StatementDiscrepancyIssue | null) => {
    if (!issue || issues.some((existing) => existing.key === issue.key)) return;
    issues.push(issue);
  };

  const addStornoSystemStatusIssue = ({
    contractNumber,
    client,
    product,
    match,
    statementAmount,
    scope = "my",
  }: {
    contractNumber: string | null | undefined;
    client: string;
    product: string;
    match: ContractMatchState | null;
    statementAmount?: number;
    scope?: ContractMatchScope;
  }) => {
    const systemContract = matchedSystemContract(match);
    if (!systemContract || systemContractIsStorno(systemContract)) return;

    addIssue({
      key: discrepancyIssueKey(statementKey, "storno-system-status", contractNumber),
      statementKey,
      source: "auto",
      severity: "warning",
      category: "Storna",
      scope,
      contractNumber: contractNumber || null,
      client,
      product,
      title: "Storno z výpisu není označené v systému",
      details: [
        `Výpis: storno`,
        `Systém: ${systemContractStatusLabel(systemContract)}`,
      ],
      statementAmount,
    });
  };

  statement.parseWarnings.forEach((warning, index) => {
    addIssue({
      key: discrepancyIssueKey(statementKey, "parse-warning", index, warning),
      statementKey,
      source: "auto",
      severity: "info",
      category: "Import výpisu",
      scope: null,
      contractNumber: null,
      client: "—",
      product: "—",
      title: "Výpis nebyl načten kompletně",
      details: [warning],
    });
  });

  for (const contract of statement.lifeSplitContracts) {
    const reviewRows = rowsForStatementReview(statementKey, contract.rows, correctionContext);
    const reviewContract =
      reviewRows.length === contract.rows.length
        ? contract
        : {
            ...contract,
            rows: reviewRows,
            annualPremium: reviewRows.find((row) => row.base > 0)?.base ?? contract.annualPremium,
          };
    if (reviewRows.length === 0 && contract.b36Payments.length === 0) continue;
    const productMeta = resolveStatementProduct(contract.productCode);
    const productLabel = `${productMeta.label} · ${productMeta.rawCode}`;
    const category = "Životní pojištění";
    const tipOnlyContract = lifeSplitContractHasOnlyTipRows(reviewContract);
    const matchScope = lifeSplitContractMatchScope(reviewContract);
    const match = contractMatchForNumber(matchesByContractNumber, contract.contractNumber, matchScope);
    const systemContract = matchedSystemContractForLifeSplit(reviewContract, match);
    const expectedProductKey = productMeta.productKey;

    addIssue(
      contractMatchDiscrepancyIssue({
        statementKey,
        category,
        keyPrefix: "life-match",
        scope: matchScope,
        contractNumber: contract.contractNumber,
        client: contract.client,
        product: productLabel,
        match,
      })
    );

    if (hasProductMismatch(expectedProductKey, systemContract)) {
      addIssue({
        key: discrepancyIssueKey(statementKey, "life-product", contract.contractNumber),
        statementKey,
        source: "auto",
        severity: "error",
        category,
        scope: matchScope,
        contractNumber: contract.contractNumber,
        client: contract.client || systemContract?.clientName || "—",
        product: productLabel,
        title: "Produkt ve výpisu nesedí se systémem",
        details: [
          `Výpis: ${productMeta.label}`,
          `Systém: ${productLabelFromKey(systemContract?.productKey)}`,
        ],
      });
    }

    if (systemContract && !tipOnlyContract) {
      addIssue(
        careerPositionDiscrepancyIssue({
          statementKey,
          category,
          keyPrefix: "life-career",
          scope: matchScope,
          contractNumber: contract.contractNumber,
          client: contract.client || systemContract.clientName || "—",
          product: productLabel,
          rows: reviewContract.rows,
          systemPositionRaw: systemContractPositionRaw(systemContract),
        })
      );
    }

    const hasLifePremiumIncrease = rowsByKind(reviewContract, "increase").length > 0;
    const premiumMismatch = !tipOnlyContract && reviewContract.rows.length > 0
      ? annualPremiumBaseMismatch(reviewContract.annualPremium, systemContract)
      : null;
    const isRefreshMissingOriginal = isNeonRefreshMissingOriginalInSystem(systemContract);
    if (
      premiumMismatch &&
      !premiumMismatch.explainedByEndorsement &&
      !hasLifePremiumIncrease &&
      isRefreshMissingOriginal
    ) {
      const statementMonthlyPremium = premiumMismatch.statementAnnualPremium / 12;
      addIssue({
        key: discrepancyIssueKey(statementKey, "life-refresh-missing-original", contract.contractNumber),
        statementKey,
        source: "auto",
        severity: "info",
        category,
        scope: matchScope,
        contractNumber: contract.contractNumber,
        client: contract.client || systemContract?.clientName || "—",
        product: productLabel,
        title: "REFRESH bez původní smlouvy v systému",
        details: [
          `Výpis počítá se základnou ${formatWholeMoney(premiumMismatch.statementAnnualPremium)} Kč ročně (${formatWholeMoney(statementMonthlyPremium)} Kč měsíčně).`,
          `Smlouva je uložená jako REFRESH bez původní smlouvy v systému, takže základna v kalkulačce je jen orientační.`,
          "Při zápisu výpisu je potřeba použít základnu a schéma z výpisu jako autoritu.",
        ],
        statementAmount: premiumMismatch.statementAnnualPremium,
        expectedAmount: premiumMismatch.systemAnnualPremium,
        difference: premiumMismatch.difference,
      });
    } else if (premiumMismatch && !premiumMismatch.explainedByEndorsement && !hasLifePremiumIncrease) {
      const statementMonthlyPremium = premiumMismatch.statementAnnualPremium / 12;
      const monthlyDifference = statementMonthlyPremium - premiumMismatch.systemMonthlyPremium;
      addIssue({
        key: discrepancyIssueKey(statementKey, "life-premium", contract.contractNumber),
        statementKey,
        source: "auto",
        severity: "warning",
        category,
        scope: matchScope,
        contractNumber: contract.contractNumber,
        client: contract.client || systemContract?.clientName || "—",
        product: productLabel,
        title: "Nesoulad ročního pojistného",
        details: [
          `Výpis: ${formatWholeMoney(premiumMismatch.statementAnnualPremium)} Kč ročně (${formatWholeMoney(statementMonthlyPremium)} Kč měsíčně)`,
          `Systém: ${formatWholeMoney(premiumMismatch.systemAnnualPremium)} Kč ročně (${formatWholeMoney(premiumMismatch.systemMonthlyPremium)} Kč měsíčně)`,
          `Rozdíl pojistného: ${formatWholeMoney(premiumMismatch.difference)} Kč ročně (${formatWholeMoney(monthlyDifference)} Kč měsíčně)`,
        ],
        statementAmount: premiumMismatch.statementAnnualPremium,
        expectedAmount: premiumMismatch.systemAnnualPremium,
        difference: premiumMismatch.difference,
      });
    }

    if (systemContract) {
      for (const comparison of buildLifeSplitAmountComparisons(
        reviewContract,
        systemContract,
        statement.header.period
      )) {
        if (comparison.status === "ok") continue;
        addIssue({
          key: discrepancyIssueKey(statementKey, "life-amount", contract.contractNumber, comparison.key),
          statementKey,
          source: "auto",
          severity: "error",
          category,
          scope: matchScope,
          contractNumber: contract.contractNumber,
          client: contract.client || systemContract.clientName || "—",
          product: productLabel,
          title: `${comparison.label}: ${amountComparisonStatusLabel(comparison.status).toLowerCase()}`,
          details: [
            `Výpis: ${formatMoney(comparison.statementAmount)} Kč`,
            `Systém: ${formatMoney(comparison.expectedAmount)} Kč`,
            `Rozdíl: ${formatMoney(comparison.difference)} Kč`,
          ],
          statementAmount: comparison.statementAmount,
          expectedAmount: comparison.expectedAmount,
          difference: comparison.difference,
        });
      }
    }

    const missingB36Warning = tipOnlyContract
      ? null
      : missingAcceleratedB36Warning(
          reviewContract.rows,
          contract.b36Payments,
          systemContract
        );
    if (missingB36Warning) {
      addIssue({
        key: discrepancyIssueKey(statementKey, "life-missing-b36", contract.contractNumber),
        statementKey,
        source: "auto",
        severity: "error",
        category,
        scope: matchScope,
        contractNumber: contract.contractNumber,
        client: contract.client || "—",
        product: productLabel,
        title: "Chybí 50% z B36 ve zrychleném režimu",
        details: [missingB36Warning.detail],
      });
    }

    const unknownRows = rowsByKind(reviewContract, "unknown");
    if (unknownRows.length > 0) {
      const unknownCodes = [...new Set(unknownRows.map((row) => row.type || "bez kódu"))];
      addIssue({
        key: discrepancyIssueKey(statementKey, "life-unknown-code", contract.contractNumber, unknownCodes.join("-")),
        statementKey,
        source: "auto",
        severity: "info",
        category,
        scope: matchScope,
        contractNumber: contract.contractNumber,
        client: contract.client || "—",
        product: productLabel,
        title: "Neznámý kód provize ve výpisu",
        details: [`Kódy: ${unknownCodes.join(", ")}`],
      });
    }

    if (rowsByKind(reviewContract, "a101").length > 0 && rowsByKind(reviewContract, "b0301").length === 0) {
      addIssue({
        key: discrepancyIssueKey(statementKey, "life-missing-b0301", contract.contractNumber),
        statementKey,
        source: "auto",
        severity: "info",
        category,
        scope: matchScope,
        contractNumber: contract.contractNumber,
        client: contract.client || "—",
        product: productLabel,
        title: "Chybí B0301 karta klienta",
        details: [
          "Ve výpisu je A101, ale B0301 zde není. Může jít o odloženou výplatu po zpracování karty klienta.",
        ],
      });
    }
  }

  for (const contract of statement.otherProductContracts) {
    const reviewRows = rowsForStatementReview(statementKey, contract.rows, correctionContext);
    const reviewContract =
      reviewRows.length === contract.rows.length
        ? contract
        : { ...contract, rows: reviewRows };
    if (reviewRows.length === 0 && contract.b36Payments.length === 0) continue;
    const productMetas = uniqueProductMetasForRows(reviewContract.rows);
    const productLabel =
      productMetas.length > 0
        ? productMetas.map((product) => `${product.label} · ${product.rawCode}`).join("; ")
        : "Produkt nezjištěn";
    const category = contractHasProductCategory(contract, "auto") ? "Auta" : "Ostatní smlouvy";
    const tipOnlyContract = otherProductContractHasOnlyTipRows(reviewContract);
    const matchScope = otherProductContractMatchScope(reviewContract);
    const match = contractMatchForNumber(matchesByContractNumber, contract.contractNumber, matchScope);
    const systemContract = matchedSystemContract(match);
    const expectedProductKey =
      productMetas.length === 1 ? productMetas[0]?.productKey ?? null : null;

    addIssue(
      contractMatchDiscrepancyIssue({
        statementKey,
        category,
        keyPrefix: "other-match",
        scope: matchScope,
        contractNumber: contract.contractNumber,
        client: contract.client,
        product: productLabel,
        match,
      })
    );

    if (hasProductMismatch(expectedProductKey, systemContract)) {
      addIssue({
        key: discrepancyIssueKey(statementKey, "other-product", contract.contractNumber),
        statementKey,
        source: "auto",
        severity: "error",
        category,
        scope: matchScope,
        contractNumber: contract.contractNumber,
        client: contract.client || systemContract?.clientName || "—",
        product: productLabel,
        title: "Produkt ve výpisu nesedí se systémem",
        details: [
          `Výpis: ${productMetas[0]?.label ?? "—"}`,
          `Systém: ${productLabelFromKey(systemContract?.productKey)}`,
        ],
      });
    }

    if (systemContract && !tipOnlyContract) {
      addIssue(
        careerPositionDiscrepancyIssue({
          statementKey,
          category,
          keyPrefix: "other-career",
          scope: matchScope,
          contractNumber: contract.contractNumber,
          client: contract.client || systemContract.clientName || "—",
          product: productLabel,
          rows: reviewContract.rows,
          systemPositionRaw: systemContractPositionRaw(systemContract),
        })
      );
    }

    if (!tipOnlyContract && contractHasProductCategory(reviewContract, "auto")) {
      const explainedPremiumChange = autoPremiumChangeInfo(
        reviewContract,
        systemContract,
        statement.header.period
      );
      const premiumMismatch = autoPremiumBaseMismatchForContract(
        reviewContract,
        systemContract,
        statement.header.period
      );
      if (premiumMismatch && !explainedPremiumChange) {
        addIssue({
          key: discrepancyIssueKey(statementKey, "other-premium", contract.contractNumber),
          statementKey,
          source: "auto",
          severity: "warning",
          category,
          scope: matchScope,
          contractNumber: contract.contractNumber,
          client: contract.client || systemContract?.clientName || "—",
          product: productLabel,
          title: "Rozdíl pojistného ve výpisu a systému",
          details: [
            autoStatementPremiumBaseDetail(premiumMismatch),
            `Systém: ${paymentAmountWithFrequencyLabel(premiumMismatch.systemPremiumBase, premiumMismatch.systemPaymentFrequency)} (${formatWholeMoney(premiumMismatch.systemAnnualPremiumBase)} Kč ročně)`,
            `Rozdíl pojistného: ${formatWholeMoney(premiumMismatch.difference)} Kč za platbu (${formatWholeMoney(premiumMismatch.annualDifference)} Kč ročně)`,
          ],
          statementAmount: premiumMismatch.statementAnnualPremiumBase,
          expectedAmount: premiumMismatch.systemAnnualPremiumBase,
          difference: premiumMismatch.annualDifference,
        });
      }
    }

    if (systemContract) {
      const explainedPremiumChange = autoPremiumChangeInfo(
        reviewContract,
        systemContract,
        statement.header.period
      );
      for (const comparison of buildOtherProductAmountComparisons(
        reviewContract,
        systemContract,
        statement.header.period
      )) {
        if (
          comparison.status === "ok" ||
          isAmountComparisonExplainedByAutoPremiumChange(
            comparison,
            explainedPremiumChange
          )
        ) {
          continue;
        }
        addIssue({
          key: discrepancyIssueKey(statementKey, "other-amount", contract.contractNumber, comparison.key),
          statementKey,
          source: "auto",
          severity: "error",
          category,
          scope: matchScope,
          contractNumber: contract.contractNumber,
          client: contract.client || systemContract.clientName || "—",
          product: productLabel,
          title: `${comparison.label}: ${amountComparisonStatusLabel(comparison.status).toLowerCase()}`,
          details: [
            `Výpis: ${formatMoney(comparison.statementAmount)} Kč`,
            `Systém: ${formatMoney(comparison.expectedAmount)} Kč`,
            `Rozdíl: ${formatMoney(comparison.difference)} Kč`,
          ],
          statementAmount: comparison.statementAmount,
          expectedAmount: comparison.expectedAmount,
          difference: comparison.difference,
        });
      }
    }

    const missingB36Warning = tipOnlyContract
      ? null
      : missingAcceleratedB36Warning(
          reviewContract.rows,
          contract.b36Payments,
          systemContract
        );
    if (missingB36Warning) {
      addIssue({
        key: discrepancyIssueKey(statementKey, "other-missing-b36", contract.contractNumber),
        statementKey,
        source: "auto",
        severity: "error",
        category,
        scope: matchScope,
        contractNumber: contract.contractNumber,
        client: contract.client || "—",
        product: productLabel,
        title: "Chybí 50% z B36 ve zrychleném režimu",
        details: [missingB36Warning.detail],
      });
    }

    const unknownRows = reviewContract.rows.filter(
      (row) => classifyGeneralCommissionCode(row.product, row.type).kind === "unknown"
    );
    if (unknownRows.length > 0) {
      const unknownCodes = [...new Set(unknownRows.map((row) => `${row.product} ${row.type}`.trim()))];
      addIssue({
        key: discrepancyIssueKey(statementKey, "other-unknown-code", contract.contractNumber, unknownCodes.join("-")),
        statementKey,
        source: "auto",
        severity: "info",
        category,
        scope: matchScope,
        contractNumber: contract.contractNumber,
        client: contract.client || "—",
        product: productLabel,
        title: "Neznámý kód provize ve výpisu",
        details: [`Kódy: ${unknownCodes.join(", ")}`],
      });
    }
  }

  for (const advisor of statement.managerCommissions) {
    for (const row of advisor.rows) {
      const match = contractMatchForNumber(matchesByContractNumber, row.contractNumber, "team");
      const systemContract = matchedSystemContract(match);
      addIssue(
        managerCareerPositionDiscrepancyIssue({
          statementKey,
          advisor,
          row,
          systemContract,
          currentUserEmail,
        })
      );
      if (row.isStorno) {
        const productMeta = resolveStatementProduct(row.product);
        addStornoSystemStatusIssue({
          contractNumber: row.contractNumber,
          client: row.client || systemContract?.clientName || "—",
          product: `${productMeta.label} · ${productMeta.rawCode}`,
          match,
          statementAmount: row.commission,
          scope: "team",
        });
      }

      const matchNotice = managerCommissionMatchNotice(match);
      if (!matchNotice) continue;

      const key = discrepancyIssueKey(statementKey, "manager-match", advisor.advisorNumber, row.contractNumber);
      if (managerMatchIssueKeys.has(key)) continue;
      managerMatchIssueKeys.add(key);

      addIssue({
        key,
        statementKey,
        source: "auto",
        severity: matchNotice.tone === "rose" ? "error" : "warning",
        category: "Provize manažera",
        scope: "team",
        contractNumber: row.contractNumber || null,
        client: row.client || "—",
        product: `${resolveStatementProduct(row.product).label} · ${row.product}`,
        title: matchNotice.title,
        details: [
          `Poradce: ${advisor.advisorName || advisor.advisorNumber}`,
          ...matchNotice.lines,
        ],
        statementAmount: row.commission,
      });
    }
  }

  statement.unmatchedB36Payments.forEach((payment, index) => {
    addIssue({
      key: discrepancyIssueKey(statementKey, "unmatched-b36", payment.contractNumber, index),
      statementKey,
      source: "auto",
      severity: "warning",
      category: "Ostatní platby",
      scope: "my",
      contractNumber: payment.contractNumber,
      client: "—",
      product: "B36 / ostatní platby",
      title: "B36 bez detailního řádku ve výpisu",
      details: [payment.description],
      statementAmount: payment.amount,
    });
  });

  for (const row of statement.stornoRows) {
    const match = contractMatchForNumber(matchesByContractNumber, row.contractNumber);
    const product = `${resolveStatementProduct(row.product).label} · ${row.product}`;
    addIssue(
      contractMatchDiscrepancyIssue({
        statementKey,
        category: "Storna",
        keyPrefix: "storno-match",
        scope: "my",
        contractNumber: row.contractNumber,
        client: row.client,
        product,
        match,
      })
    );
    addStornoSystemStatusIssue({
      contractNumber: row.contractNumber,
      client: row.client || "—",
      product,
      match,
      statementAmount: row.commission,
    });
  }

  statement.otherPayments
    .filter((payment) => payment.isStorno)
    .forEach((payment, index) => {
      const match = contractMatchForNumber(matchesByContractNumber, payment.contractNumber);
      addIssue(
        contractMatchDiscrepancyIssue({
          statementKey,
          category: "Storna",
          keyPrefix: `storno-payment-match-${index}`,
          scope: "my",
          contractNumber: payment.contractNumber,
          client: "—",
          product: "Ostatní platby",
          match,
        })
      );
      addStornoSystemStatusIssue({
        contractNumber: payment.contractNumber,
        client: matchedSystemContract(match)?.clientName || "—",
        product: "Ostatní platby",
        match,
        statementAmount: payment.amount,
      });
    });

  const severityOrder: Record<StatementDiscrepancySeverity, number> = {
    error: 0,
    warning: 1,
    info: 2,
  };

  return issues.sort((left, right) => {
    const severityDiff = severityOrder[left.severity] - severityOrder[right.severity];
    if (severityDiff !== 0) return severityDiff;
    return left.category.localeCompare(right.category, "cs");
  });
};

const buildPrintableDiscrepancyItems = (
  autoIssues: StatementDiscrepancyIssue[],
  reviewState: DiscrepancyReviewState,
  manualItems: ManualDiscrepancyItem[]
): PrintableDiscrepancyItem[] => [
  ...autoIssues
    .map((issue) => ({
      ...issue,
      selected: reviewState[issue.key]?.selected ?? true,
      note: normalizeText(reviewState[issue.key]?.note),
    }))
    .filter((issue) => issue.selected),
  ...manualItems
    .filter((item) => item.selected)
    .map((item) => ({
      ...manualDiscrepancyToIssue(item),
      selected: true,
      note: normalizeText(item.note),
    })),
];

const markedDiscrepancyKey = ({
  statementKey,
  scope,
  category,
  contractNumber,
  fallback,
}: {
  statementKey: string;
  scope: ContractMatchScope | null;
  category: string;
  contractNumber: string | null | undefined;
  fallback: string;
}): string =>
  discrepancyIssueKey(
    statementKey,
    "marked",
    scope ?? "statement",
    category,
    normalizeContractNumberForMatch(contractNumber) || fallback
  );

const statementDiscrepancyLabel = (statement: ParsedStatement): string =>
  [
    statement.header.statementNumber ? `Výpis ${statement.header.statementNumber}` : "Provizní výpis",
    statement.header.period,
  ]
    .filter(Boolean)
    .join(" · ");

const collectPostProcessingNeonRefreshPromptTargets = ({
  statements,
  matchesByContractNumber,
  processedStatementIdsByKey,
}: {
  statements: ParsedStatement[];
  matchesByContractNumber: ContractMatchesByNumber;
  processedStatementIdsByKey: Record<string, string>;
}): PostProcessingNeonRefreshPromptTarget[] => {
  const targets: PostProcessingNeonRefreshPromptTarget[] = [];
  const seen = new Set<string>();

  for (const statement of statements) {
    const statementId = processedStatementIdsByKey[statementDiscrepancyKey(statement)];
    if (!statementId) continue;

    const statementLabel = statementDiscrepancyLabel(statement);
    for (const contract of statement.lifeSplitContracts) {
      if (normalizeProductCode(contract.productCode) !== "CPP_NRF_LF") continue;

      const match = contractMatchForNumber(matchesByContractNumber, contract.contractNumber);
      const systemContract = matchedSystemContractForLifeSplit(contract, match);
      if (
        !systemContract ||
        systemContract.productKey !== "neon" ||
        systemContract.isRefresh === true
      ) {
        continue;
      }

      const ownerEmail = normalizeEmailForComparison(systemContract.adviserEmail);
      const entryId = normalizeText(systemContract.id);
      if (!ownerEmail || !entryId) continue;

      const key = `${statementId}:${ownerEmail}:${entryId}:${contract.contractNumber}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const systemAnnualPremium = systemContractAnnualPremiumBase(systemContract);
      targets.push({
        key,
        statementId,
        contract: systemContract,
        contractNumber: contract.contractNumber,
        statementLabel,
        client: contract.client || systemContract.clientName || "—",
        productCode: contract.productCode,
        statementAnnualPremium: contract.annualPremium,
        systemAnnualPremium,
        systemMonthlyPremium:
          systemAnnualPremium == null ? null : Math.round((systemAnnualPremium / 12) * 100) / 100,
      });
    }
  }

  return targets;
};

const matchingAutoIssuesForMarkedItem = (
  item: MarkedDiscrepancyItem,
  autoIssues: StatementDiscrepancyIssue[]
): StatementDiscrepancyIssue[] => {
  const itemContract = normalizeContractNumberForMatch(item.contractNumber);
  if (!itemContract) return [];

  return autoIssues.filter((issue) => {
    if (issue.statementKey !== item.statementKey) return false;
    if (normalizeContractNumberForMatch(issue.contractNumber) !== itemContract) return false;
    if (item.scope && issue.scope && item.scope !== issue.scope) return false;
    return true;
  });
};

const safePdfFileNamePart = (value: string): string =>
  normalizeCommissionTitle(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "provizni-vypis";

const DISCREPANCY_PDF_FONT_NAME = "LiberationSans";
const DISCREPANCY_PDF_FONTS = {
  regular: {
    fileName: "LiberationSans-Regular.ttf",
    path: "/fonts/LiberationSans-Regular.ttf",
    style: "normal",
  },
  bold: {
    fileName: "LiberationSans-Bold.ttf",
    path: "/fonts/LiberationSans-Bold.ttf",
    style: "bold",
  },
} as const;

type JsPdfFontRegistrar = {
  addFileToVFS: (fileName: string, fileData: string) => void;
  addFont: (postScriptName: string, id: string, fontStyle: string) => void;
};

let discrepancyPdfFontDataPromise: Promise<Record<keyof typeof DISCREPANCY_PDF_FONTS, string>> | null =
  null;

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return window.btoa(binary);
};

const loadDiscrepancyPdfFontData = async () => {
  if (!discrepancyPdfFontDataPromise) {
    discrepancyPdfFontDataPromise = Promise.all(
      Object.entries(DISCREPANCY_PDF_FONTS).map(async ([key, font]) => {
        const response = await fetch(font.path);
        if (!response.ok) {
          throw new Error(`PDF font ${font.fileName} se nepodařilo načíst.`);
        }

        return [key, arrayBufferToBase64(await response.arrayBuffer())] as const;
      })
    ).then((entries) => Object.fromEntries(entries) as Record<keyof typeof DISCREPANCY_PDF_FONTS, string>);
  }

  return discrepancyPdfFontDataPromise;
};

const registerDiscrepancyPdfFonts = async (doc: JsPdfFontRegistrar) => {
  const fontData = await loadDiscrepancyPdfFontData();

  for (const [key, font] of Object.entries(DISCREPANCY_PDF_FONTS) as Array<
    [keyof typeof DISCREPANCY_PDF_FONTS, (typeof DISCREPANCY_PDF_FONTS)[keyof typeof DISCREPANCY_PDF_FONTS]]
  >) {
    doc.addFileToVFS(font.fileName, fontData[key]);
    doc.addFont(font.fileName, DISCREPANCY_PDF_FONT_NAME, font.style);
  }
};

const isPremiumDiscrepancyIssue = (issue: StatementDiscrepancyIssue): boolean =>
  normalizeCommissionTitle(issue.title).includes("pojist");

const isCommissionAmountDiscrepancyIssue = (issue: StatementDiscrepancyIssue): boolean =>
  !isPremiumDiscrepancyIssue(issue) &&
  hasFiniteNumber(issue.statementAmount) &&
  hasFiniteNumber(issue.expectedAmount) &&
  hasFiniteNumber(issue.difference);

const formatSignedWholeMoney = (value: number): string => {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatWholeMoney(Math.abs(value))} Kč`;
};

const formatSettlementMoney = (value: number): string =>
  `${formatMoney(Math.abs(value))} Kč`;

const issueCommissionCodeLabel = (issue: StatementDiscrepancyIssue): string => {
  const [code] = issue.title.split(":");
  return normalizeText(code) || issue.title;
};

type DiscrepancyPdfIcon =
  | "alert"
  | "check"
  | "file"
  | "info"
  | "list"
  | "money";

type DiscrepancyPdfTone = "amber" | "blue" | "emerald" | "rose" | "slate";

const downloadDiscrepancySummaryPdf = async (items: DiscrepancyPdfItem[]) => {
  if (items.length === 0) return;

  const statementLabels = [...new Set(items.map((item) => item.statementLabel))];
  const title =
    statementLabels.length === 1
      ? `Souhrn nesrovnalostí - ${statementLabels[0]}`
      : "Souhrn nesrovnalostí";
  const totalAdditionalCommission = items.reduce(
    (sum, item) =>
      sum +
      item.autoIssues
        .filter(isCommissionAmountDiscrepancyIssue)
        .reduce((itemSum, issue) => {
          const additional = (issue.expectedAmount ?? 0) - (issue.statementAmount ?? 0);
          return additional > 0 ? itemSum + additional : itemSum;
        }, 0),
    0
  );
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  await registerDiscrepancyPdfFonts(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  const lineHeight = 4.45;
  let y = 16;

  const addPageIfNeeded = (height: number) => {
    if (y + height <= pageHeight - margin) return;
    doc.addPage();
    y = margin;
  };

  const setText = (
    size: number,
    style: "normal" | "bold" = "normal",
    color: [number, number, number] = [17, 24, 39]
  ) => {
    doc.setFont(DISCREPANCY_PDF_FONT_NAME, style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.setCharSpace(0);
  };

  const setStroke = (color: [number, number, number], width = 0.2) => {
    doc.setDrawColor(...color);
    doc.setLineWidth(width);
  };

  const iconTone = (tone: DiscrepancyPdfTone): {
    fill: [number, number, number];
    stroke: [number, number, number];
  } => {
    switch (tone) {
      case "amber":
        return { fill: [255, 251, 235], stroke: [217, 119, 6] };
      case "blue":
        return { fill: [239, 246, 255], stroke: [37, 99, 235] };
      case "emerald":
        return { fill: [236, 253, 245], stroke: [5, 150, 105] };
      case "rose":
        return { fill: [255, 241, 242], stroke: [225, 29, 72] };
      default:
        return { fill: [248, 250, 252], stroke: [71, 85, 105] };
    }
  };

  const drawPdfIcon = (
    icon: DiscrepancyPdfIcon,
    x: number,
    y: number,
    size: number,
    color: [number, number, number]
  ) => {
    const px = (value: number) => x + size * value;
    const py = (value: number) => y + size * value;
    setStroke(color, 0.42);
    doc.setFillColor(...color);
    const cx = x + size / 2;
    const cy = y + size / 2;

    switch (icon) {
      case "alert":
        doc.line(px(0.5), py(0.14), px(0.84), py(0.82));
        doc.line(px(0.84), py(0.82), px(0.16), py(0.82));
        doc.line(px(0.16), py(0.82), px(0.5), py(0.14));
        doc.line(px(0.5), py(0.38), px(0.5), py(0.61));
        doc.circle(px(0.5), py(0.71), size * 0.035, "F");
        break;
      case "check":
        doc.circle(cx, cy, size * 0.36, "S");
        doc.line(px(0.29), py(0.52), px(0.43), py(0.66));
        doc.line(px(0.43), py(0.66), px(0.72), py(0.34));
        break;
      case "file":
        doc.roundedRect(px(0.25), py(0.14), size * 0.5, size * 0.72, size * 0.08, size * 0.08, "S");
        doc.line(px(0.59), py(0.14), px(0.75), py(0.3));
        doc.line(px(0.34), py(0.39), px(0.66), py(0.39));
        doc.line(px(0.34), py(0.55), px(0.66), py(0.55));
        doc.line(px(0.34), py(0.71), px(0.58), py(0.71));
        break;
      case "info":
        doc.circle(cx, cy, size * 0.36, "S");
        doc.circle(cx, py(0.34), size * 0.035, "F");
        doc.line(cx, py(0.45), cx, py(0.69));
        break;
      case "list":
        [0.28, 0.5, 0.72].forEach((lineY) => {
          doc.line(px(0.17), py(lineY), px(0.22), py(lineY + 0.05));
          doc.line(px(0.22), py(lineY + 0.05), px(0.31), py(lineY - 0.06));
          doc.line(px(0.43), py(lineY), px(0.83), py(lineY));
        });
        break;
      case "money":
        setText(size * 1.25, "bold", color);
        doc.text("Kč", cx, py(0.68), { align: "center" });
        break;
    }
  };

  const drawIconBadge = (
    x: number,
    y: number,
    icon: DiscrepancyPdfIcon,
    tone: DiscrepancyPdfTone = "slate",
    size = 9
  ) => {
    const palette = iconTone(tone);
    doc.setFillColor(...palette.fill);
    setStroke([226, 232, 240]);
    doc.roundedRect(x, y, size, size, 2, 2, "FD");
    drawPdfIcon(icon, x + 1.2, y + 1.2, size - 2.4, palette.stroke);
  };

  const addWrappedText = (
    text: string,
    x: number,
    width: number,
    options: {
      size?: number;
      style?: "normal" | "bold";
      color?: [number, number, number];
      gapAfter?: number;
    } = {}
  ) => {
    setText(options.size ?? 9, options.style ?? "normal", options.color);
    const lines = doc.splitTextToSize(normalizeText(text) || "—", width) as string[];
    const height = Math.max(lineHeight, lines.length * lineHeight) + (options.gapAfter ?? 0);
    addPageIfNeeded(height);
    doc.text(lines, x, y);
    y += height;
  };

  const drawMetricCard = ({
    x,
    y: cardY,
    width,
    label,
    value,
    icon,
    tone = "slate",
  }: {
    x: number;
    y: number;
    width: number;
    label: string;
    value: string;
    icon: DiscrepancyPdfIcon;
    tone?: DiscrepancyPdfTone;
  }) => {
    setStroke([226, 232, 240]);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, cardY, width, 18, 2.3, 2.3, "FD");
    drawIconBadge(x + 3, cardY + 4.5, icon, tone, 9);
    setText(7.2, "bold", [71, 85, 105]);
    doc.text(label, x + 15, cardY + 6);
    setText(11, "bold", [15, 23, 42]);
    doc.text(value, x + 15, cardY + 13);
  };

  const addLabelValue = (label: string, value: string, x: number, width: number): number => {
    setText(7.5, "bold", [100, 116, 139]);
    doc.text(label, x, y);
    setText(8.7, "normal", [15, 23, 42]);
    const lines = doc.splitTextToSize(normalizeText(value) || "—", width) as string[];
    doc.text(lines, x, y + 4.3);
    return Math.max(9, 4.3 + lines.length * lineHeight);
  };

  doc.setFillColor(255, 255, 255);
  setStroke([226, 232, 240]);
  doc.roundedRect(margin, y, contentWidth, 30, 3, 3, "FD");
  drawIconBadge(margin + 5, y + 6, "file", "blue", 11);
  setText(16.5, "bold", [15, 23, 42]);
  doc.text(title, margin + 19, y + 11);
  setText(8.8, "normal", [71, 85, 105]);
  doc.text(
    "Podklad pro účetní opravu: provize vyplacená z jiného pojistného, než má smlouva v systému.",
    margin + 19,
    y + 19
  );
  setText(8, "normal", [100, 116, 139]);
  doc.text(`Vygenerováno ${new Date().toLocaleDateString("cs-CZ")}`, margin + 19, y + 25);
  y += 38;

  const summaryCardGap = 4;
  const summaryCardWidth = (contentWidth - summaryCardGap * 2) / 3;
  drawMetricCard({
    x: margin,
    y,
    width: summaryCardWidth,
    label: "Označeno",
    value: `${items.length} smluv`,
    icon: "list",
    tone: "blue",
  });
  drawMetricCard({
    x: margin + summaryCardWidth + summaryCardGap,
    y,
    width: summaryCardWidth,
    label: "Výpisů",
    value: String(statementLabels.length),
    icon: "file",
    tone: "slate",
  });
  drawMetricCard({
    x: margin + (summaryCardWidth + summaryCardGap) * 2,
    y,
    width: summaryCardWidth,
    label: "Celkem k doplacení",
    value: `${formatMoney(totalAdditionalCommission)} Kč`,
    icon: "money",
    tone: "emerald",
  });
  y += 27;

  items.forEach((item, index) => {
    const premiumIssue = item.autoIssues.find(isPremiumDiscrepancyIssue) ?? null;
    const commissionIssues = item.autoIssues.filter(isCommissionAmountDiscrepancyIssue);
    const manualIssues = item.autoIssues.filter(
      (issue) => !isPremiumDiscrepancyIssue(issue) && !isCommissionAmountDiscrepancyIssue(issue)
    );
    const statementPremium = premiumIssue?.statementAmount;
    const systemPremium = premiumIssue?.expectedAmount;
    const premiumDifference =
      hasFiniteNumber(statementPremium) && hasFiniteNumber(systemPremium)
        ? systemPremium - statementPremium
        : null;
    const itemAdditionalCommission = commissionIssues.reduce((sum, issue) => {
      const additional = (issue.expectedAmount ?? 0) - (issue.statementAmount ?? 0);
      return additional > 0 ? sum + additional : sum;
    }, 0);

    addPageIfNeeded(80);

    doc.setFillColor(255, 255, 255);
    setStroke([203, 213, 225]);
    doc.roundedRect(margin, y, contentWidth, 14, 2.5, 2.5, "FD");
    drawIconBadge(margin + 3, y + 2.5, "file", "blue", 9);
    setText(10.5, "bold", [15, 23, 42]);
    doc.text(`${index + 1}. Smlouva ${item.contractNumber || "—"}`, margin + 15, y + 8.8);
    setText(8, "normal", [71, 85, 105]);
    doc.text(item.statementLabel, margin + contentWidth - 4, y + 8.8, { align: "right" });
    y += 19;

    const infoColumnWidth = (contentWidth - 8) / 3;
    const infoTop = y;
    const infoHeight1 = addLabelValue("Klient", item.client || "—", margin + 2, infoColumnWidth);
    const infoHeight2 = addLabelValue("Produkt", item.product || "—", margin + 2 + infoColumnWidth + 4, infoColumnWidth);
    const infoHeight3 = addLabelValue(
      "Typ smlouvy",
      `${item.category} · ${discrepancyScopeLabel(item.scope)}`,
      margin + 2 + (infoColumnWidth + 4) * 2,
      infoColumnWidth
    );
    y = infoTop + Math.max(infoHeight1, infoHeight2, infoHeight3) + 4;

    if (premiumIssue && premiumDifference !== null) {
      doc.setFillColor(248, 250, 252);
      setStroke([226, 232, 240]);
      doc.roundedRect(margin, y, contentWidth, 20, 2.5, 2.5, "FD");
      drawIconBadge(margin + 4, y + 5, "alert", "amber", 9);
      setText(8.5, "bold", [15, 23, 42]);
      doc.text("Vysvětlení pro účetní", margin + 15, y + 6.2);
      setText(8.4, "normal", [71, 85, 105]);
      const explanation = doc.splitTextToSize(
        "Provize byla ve výpisu vyplacena z jiného pojistného, než má smlouva aktuálně v systému. Níže je rozdíl pojistného a částka provize, kterou je potřeba doplatit.",
        contentWidth - 20
      ) as string[];
      doc.text(explanation, margin + 15, y + 11);
      y += 26;

      const premiumCardWidth = (contentWidth - 8) / 3;
      drawMetricCard({
        x: margin,
        y,
        width: premiumCardWidth,
        label: "Pojistné ve výpisu",
        value: `${formatWholeMoney(statementPremium ?? 0)} Kč`,
        icon: "money",
        tone: "slate",
      });
      drawMetricCard({
        x: margin + premiumCardWidth + 4,
        y,
        width: premiumCardWidth,
        label: "Skutečné pojistné",
        value: `${formatWholeMoney(systemPremium ?? 0)} Kč`,
        icon: "check",
        tone: "blue",
      });
      drawMetricCard({
        x: margin + (premiumCardWidth + 4) * 2,
        y,
        width: premiumCardWidth,
        label: "Rozdíl pojistného",
        value: formatSignedWholeMoney(premiumDifference),
        icon: "alert",
        tone: "amber",
      });
      y += 25;
    } else {
      addWrappedText(
        "Smlouva je označená ke kontrole. Automatický rozdíl pojistného nebyl k této položce jednoznačně dopočtený.",
        margin + 2,
        contentWidth - 4,
        {
          size: 8.5,
          color: [71, 85, 105],
          gapAfter: 3,
        }
      );
    }

    if (commissionIssues.length > 0) {
      doc.setFillColor(255, 255, 255);
      setStroke([187, 247, 208]);
      doc.roundedRect(margin, y, contentWidth, 12, 2.5, 2.5, "FD");
      drawIconBadge(margin + 3, y + 1.5, "money", "emerald", 9);
      setText(9.3, "bold", [15, 23, 42]);
      doc.text("Doplatek provize podle správného pojistného", margin + 15, y + 7.8);
      setText(10, "bold", [5, 150, 105]);
      doc.text(`${formatMoney(itemAdditionalCommission)} Kč`, margin + contentWidth - 4, y + 7.8, {
        align: "right",
      });
      y += 17;

      const tableX = margin;
      const codeWidth = 34;
      const amountWidth = 36;
      const rowHeight = 8.5;
      doc.setFillColor(241, 245, 249);
      setStroke([226, 232, 240]);
      doc.roundedRect(tableX, y, contentWidth, rowHeight, 1.8, 1.8, "FD");
      setText(7.5, "bold", [71, 85, 105]);
      doc.text("Položka", tableX + 3, y + 5.6);
      doc.text("Vyplaceno", tableX + codeWidth + amountWidth, y + 5.6, { align: "right" });
      doc.text("Má být", tableX + codeWidth + amountWidth * 2, y + 5.6, { align: "right" });
      doc.text("Doplatek", tableX + contentWidth - 3, y + 5.6, { align: "right" });
      y += rowHeight;

      commissionIssues.forEach((issue, issueIndex) => {
        const paid = issue.statementAmount ?? 0;
        const expected = issue.expectedAmount ?? 0;
        const additional = expected - paid;
        const isPositive = additional > 0;
        if (issueIndex % 2 === 0) {
          doc.setFillColor(255, 255, 255);
        } else {
          doc.setFillColor(248, 250, 252);
        }
        setStroke([226, 232, 240]);
        doc.rect(tableX, y, contentWidth, rowHeight, "FD");
        setText(8.2, "bold", [30, 41, 59]);
        doc.text(issueCommissionCodeLabel(issue), tableX + 3, y + 5.8);
        setText(8.2, "normal", [51, 65, 85]);
        doc.text(`${formatMoney(paid)} Kč`, tableX + codeWidth + amountWidth, y + 5.8, {
          align: "right",
        });
        doc.text(`${formatMoney(expected)} Kč`, tableX + codeWidth + amountWidth * 2, y + 5.8, {
          align: "right",
        });
        setText(8.4, "bold", isPositive ? [21, 128, 61] : [190, 18, 60]);
        doc.text(
          isPositive ? formatSettlementMoney(additional) : `-${formatSettlementMoney(additional)}`,
          tableX + contentWidth - 3,
          y + 5.8,
          { align: "right" }
        );
        y += rowHeight;
      });
      y += 5;
    } else if (premiumIssue) {
      doc.setFillColor(255, 255, 255);
      setStroke([253, 230, 138]);
      doc.roundedRect(margin, y, contentWidth, 12, 2.5, 2.5, "FD");
      drawIconBadge(margin + 3, y + 1.5, "alert", "amber", 9);
      setText(8.5, "bold", [146, 64, 14]);
      doc.text("Doplatek provize není automaticky dopočtený. Prosím zkontrolovat ručně.", margin + 15, y + 7.8);
      y += 17;
    }

    if (manualIssues.length > 0) {
      addWrappedText("Další kontrolní body", margin + 2, contentWidth - 4, {
        size: 8.8,
        style: "bold",
        color: [30, 41, 59],
        gapAfter: 0.8,
      });
      manualIssues.forEach((issue) => {
        addWrappedText(`- ${issue.title}`, margin + 6, contentWidth - 10, {
          size: 8,
          color: [71, 85, 105],
          gapAfter: 0,
        });
      });
    }

    if (normalizeText(item.note)) {
      addWrappedText("Poznámka pro účetní", margin + 2, contentWidth - 4, {
        size: 8.8,
        style: "bold",
        color: [30, 41, 59],
        gapAfter: 0.8,
      });
      addWrappedText(item.note, margin + 6, contentWidth - 10, {
        size: 8,
        color: [71, 85, 105],
        gapAfter: 1,
      });
    }

    y += 7;
  });

  addPageIfNeeded(8);
  setText(8, "normal", [107, 114, 128]);
  doc.text("Vygenerováno z kontroly provizního výpisu v Bohemika provize.", margin, y);

  const fileBase =
    statementLabels.length === 1 ? safePdfFileNamePart(statementLabels[0]) : "vice-vypisu";
  doc.save(`souhrn-nesrovnalosti-${fileBase}.pdf`);
};

const printDiscrepancyReport = (
  statement: ParsedStatement,
  items: PrintableDiscrepancyItem[]
) => {
  if (items.length === 0 || typeof window === "undefined") return;

  const totalDifference = items.reduce(
    (sum, item) => sum + (hasFiniteNumber(item.difference) ? item.difference : 0),
    0
  );
  const title = `Souhrn nesrovnalostí - výpis ${statement.header.statementNumber ?? "bez čísla"}`;
  const metaRows = [
    ["Soubor", statement.fileName],
    ["Číslo výpisu", statement.header.statementNumber ?? "—"],
    ["Období", statement.header.period ?? "—"],
    ["Vystaveno", statement.header.statementDate ?? "—"],
    ["Číslo poradce", statement.header.advisorNumber ?? "—"],
  ];
  const tableRows = items
    .map((item, index) => {
      const amountLines = [
        hasFiniteNumber(item.statementAmount) ? `Výpis: ${formatMoney(item.statementAmount)} Kč` : null,
        hasFiniteNumber(item.expectedAmount) ? `Systém: ${formatMoney(item.expectedAmount)} Kč` : null,
        hasFiniteNumber(item.difference) ? `Rozdíl: ${formatMoney(item.difference)} Kč` : null,
        item.manualAmountText ? item.manualAmountText : null,
      ].filter(Boolean);

      return `
        <tr>
          <td>${index + 1}</td>
          <td>
            <strong>${escapeHtml(item.contractNumber || "—")}</strong><br>
            <span>${escapeHtml(discrepancyScopeLabel(item.scope))}</span>
          </td>
          <td>${escapeHtml(item.client || "—")}</td>
          <td>
            <strong>${escapeHtml(item.category)}</strong><br>
            <span>${escapeHtml(item.product || "—")}</span>
          </td>
          <td>
            <strong>${escapeHtml(item.title)}</strong>
            ${
              item.details.length > 0
                ? `<ul>${item.details.map((detail) => `<li>${escapeHtml(detail)}</li>`).join("")}</ul>`
                : ""
            }
          </td>
          <td>${amountLines.map((line) => escapeHtml(line)).join("<br>") || "—"}</td>
          <td>${escapeHtml(item.note || "—")}</td>
          <td>${item.source === "manual" ? "Ručně" : "Automaticky"}</td>
        </tr>`;
    })
    .join("");
  const metaHtml = metaRows
    .map(
      ([label, value]) =>
        `<div class="meta-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`
    )
    .join("");
  const reportHtml = `<!doctype html>
<html lang="cs">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #111827;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11px;
      line-height: 1.4;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .report { padding: 8px; }
    h1 { margin: 0 0 8px; font-size: 22px; }
    .subtitle { margin: 0 0 16px; color: #4b5563; }
    .meta {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
      margin-bottom: 14px;
    }
    .meta-item {
      border: 1px solid #d1d5db;
      border-radius: 8px;
      padding: 7px 9px;
      break-inside: avoid;
    }
    .meta-item span {
      display: block;
      color: #6b7280;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: .04em;
      text-transform: uppercase;
    }
    .meta-item strong { display: block; margin-top: 2px; }
    .summary {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 6px;
      margin-bottom: 16px;
    }
    .summary div {
      border: 1px solid #d1d5db;
      border-radius: 8px;
      padding: 8px 9px;
      background: #f9fafb;
    }
    .summary span {
      display: block;
      color: #6b7280;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: .04em;
      text-transform: uppercase;
    }
    .summary strong { display: block; margin-top: 3px; font-size: 15px; }
    table { width: 100%; border-collapse: collapse; }
    th, td {
      border: 1px solid #d1d5db;
      padding: 6px;
      vertical-align: top;
      text-align: left;
    }
    th { background: #f3f4f6; font-size: 9px; text-transform: uppercase; letter-spacing: .04em; }
    td ul { margin: 4px 0 0 16px; padding: 0; }
    td span { color: #4b5563; }
    tr { break-inside: avoid; }
    .footer { margin-top: 14px; color: #6b7280; font-size: 10px; }
  </style>
</head>
<body>
  <main class="report">
    <h1>${escapeHtml(title)}</h1>
    <p class="subtitle">Podklad pro kontrolu a opravu provizního výpisu.</p>
    <section class="meta">${metaHtml}</section>
    <section class="summary">
      <div><span>Vybrané položky</span><strong>${items.length}</strong></div>
      <div><span>Ručně označeno</span><strong>${items.filter((item) => item.source === "manual").length}</strong></div>
      <div><span>Součet rozdílů</span><strong>${formatMoney(totalDifference)} Kč</strong></div>
    </section>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Smlouva</th>
          <th>Klient</th>
          <th>Oblast</th>
          <th>Nález</th>
          <th>Částka</th>
          <th>Poznámka</th>
          <th>Zdroj</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
    <p class="footer">Vygenerováno z kontroly provizního výpisu v Bohemika provize.</p>
  </main>
</body>
</html>`;

  const printWindow = window.open("", "_blank", "width=980,height=1200");
  if (!printWindow) return;

  printWindow.document.open();
  printWindow.document.write(reportHtml);
  printWindow.document.close();
  printWindow.focus();
  printWindow.setTimeout(() => {
    printWindow.print();
  }, 250);
};

const SJEDNATEL_EXTRANET_REDIRECT_URL =
  "https://sjednatel.bohemiaservis.cz/redirect_extranet.aspx";
const SJEDNATEL_EXTRANET_DEFAULT_ENTITY_TYPE_ID = "43";

const firstContractDetailUrl = (
  rows: Array<{ detailUrl?: string | null }>
): string | null => rows.find((row) => row.detailUrl)?.detailUrl ?? null;

const normalizeSjednatelExtranetParam = (
  value: string | number | null | undefined
): string | null => {
  const normalized = String(value ?? "").trim();
  return /^\d+$/.test(normalized) ? normalized : null;
};

const buildSjednatelExtranetDetailUrl = (
  entityId: string | number | null | undefined,
  entityTypeId: string | number | null | undefined = SJEDNATEL_EXTRANET_DEFAULT_ENTITY_TYPE_ID
): string | null => {
  const normalizedEntityId = normalizeSjednatelExtranetParam(entityId);
  const normalizedEntityTypeId =
    normalizeSjednatelExtranetParam(entityTypeId) ?? SJEDNATEL_EXTRANET_DEFAULT_ENTITY_TYPE_ID;
  if (!normalizedEntityId || !normalizedEntityTypeId) return null;

  const params = new URLSearchParams({
    type: "detail",
    p_EntityTypeID: normalizedEntityTypeId,
    p_EntityID: normalizedEntityId,
  });
  return `${SJEDNATEL_EXTRANET_REDIRECT_URL}?${params.toString()}`;
};

const extranetEntityIdFromContractDetailUrl = (
  detailUrl: string | null | undefined
): string | null => {
  const normalizedUrl = normalizeExternalHref(detailUrl);
  if (!normalizedUrl) return null;

  try {
    return normalizeSjednatelExtranetParam(
      new URL(normalizedUrl).searchParams.get("sml")
    );
  } catch {
    return null;
  }
};

const firstSjednatelExtranetUrl = (
  rows: Array<{ detailUrl?: string | null; product?: string | null }>,
  systemContract: MatchedSystemContract | null = null
): string | null => {
  const statementRow = rows.find((row) => hasSjednatelExtranetFromDetailLink(row.product));
  const statementUrl = buildSjednatelExtranetDetailUrl(
    extranetEntityIdFromContractDetailUrl(statementRow?.detailUrl)
  );
  if (statementUrl) return statementUrl;

  return buildSjednatelExtranetDetailUrl(
    systemContract?.cppExtranetEntityId,
    systemContract?.cppExtranetEntityTypeId
  );
};

function ContractDetailLink({
  href,
  compact = false,
}: {
  href: string | null | undefined;
  compact?: boolean;
}) {
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={
        compact
          ? "inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50"
          : "inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:border-slate-300 hover:bg-slate-50"
      }
    >
      <ExternalLink className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} strokeWidth={2.2} aria-hidden="true" />
      {compact ? "MAXX" : "Otevřít smlouvu v MAXX"}
    </a>
  );
}

const bohemkaContractDetailHref = (
  contract: MatchedSystemContract | null | undefined
): string | null => {
  const ownerEmail = normalizeText(contract?.adviserEmail);
  const entryId = normalizeText(contract?.id);
  if (!ownerEmail || !entryId) return null;
  return `/smlouvy/${encodeURIComponent(`${ownerEmail}___${entryId}`)}?from=commission-statements`;
};

function BohemkaContractDetailLink({
  contract,
  compact = false,
}: {
  contract: MatchedSystemContract | null | undefined;
  compact?: boolean;
}) {
  const href = bohemkaContractDetailHref(contract);
  const openDetailModal = useContext(BohemkaContractDetailModalContext);
  if (!href) return null;

  const contractNumber = normalizeText(contract?.contractNumber);
  const clientName = normalizeText(contract?.clientName);
  const openModal = () => {
    openDetailModal?.({
      href,
      title: contractNumber ? `Smlouva ${contractNumber}` : "Detail smlouvy",
      subtitle: clientName || null,
    });
  };

  return (
    <button
      type="button"
      onClick={openModal}
      className={
        compact
          ? "inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-800 hover:border-violet-300 hover:bg-violet-100"
          : "inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-900 hover:border-violet-300 hover:bg-violet-100"
      }
    >
      <ExternalLink className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} strokeWidth={2.2} aria-hidden="true" />
      {compact ? "Detail" : "Detail smlouvy"}
    </button>
  );
}

function BohemkaContractDetailModal({
  detail,
  onClose,
}: {
  detail: BohemkaContractDetailModalPayload;
  onClose: () => void;
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[90] bg-slate-950/55 px-3 py-4 backdrop-blur-sm sm:px-6 sm:py-8"
      role="dialog"
      aria-modal="true"
      aria-label={detail.title}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="mx-auto flex h-full max-h-[92vh] max-w-7xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.35)]">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <div className="truncate text-base font-black text-slate-950">
              {detail.title}
            </div>
            {detail.subtitle && (
              <div className="mt-0.5 truncate text-sm font-semibold text-slate-500">
                {detail.subtitle}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            aria-label="Zavřít detail smlouvy"
          >
            <X className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>
        <iframe
          title={detail.title}
          src={detail.href}
          className="min-h-0 flex-1 border-0"
        />
      </div>
    </div>
  );
}

function SjednatelExtranetLink({
  href,
  compact = false,
}: {
  href: string | null | undefined;
  compact?: boolean;
}) {
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={
        compact
          ? "inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-800 hover:border-sky-300 hover:bg-sky-100"
          : "inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-900 hover:border-sky-300 hover:bg-sky-100"
      }
    >
      <ExternalLink className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} strokeWidth={2.2} aria-hidden="true" />
      {compact ? "Extranet" : "Otevřít extranet"}
    </a>
  );
}

function AmountComparisonPanel({
  comparisons,
  baseComparisons = [],
}: {
  comparisons: CommissionAmountComparison[];
  baseComparisons?: PremiumBaseComparison[];
}) {
  if (comparisons.length === 0 && baseComparisons.length === 0) return null;

  const issueCount = comparisons.filter((comparison) => comparison.status !== "ok").length;
  const baseChangeCount = baseComparisons.filter(
    (comparison) =>
      comparison.canBeAnniversaryPremiumChange &&
      Math.abs(comparison.annualDifference) > ANNUAL_PREMIUM_TOLERANCE
  ).length;
  const baseMismatchCount = baseComparisons.filter(
    (comparison) =>
      !comparison.canBeAnniversaryPremiumChange &&
      Math.abs(comparison.annualDifference) > ANNUAL_PREMIUM_TOLERANCE
  ).length;
  const panelTone =
    issueCount > 0 ? "rose" : baseMismatchCount > 0 ? "amber" : baseChangeCount > 0 ? "sky" : "emerald";
  const panelClass =
    panelTone === "rose"
      ? "border-rose-200 bg-rose-50"
      : panelTone === "amber"
        ? "border-amber-200 bg-amber-50"
      : panelTone === "sky"
        ? "border-sky-200 bg-sky-50"
        : "border-emerald-200 bg-emerald-50";
  const badgeClass =
    panelTone === "rose"
      ? "border-rose-200 bg-white text-rose-800"
      : panelTone === "amber"
        ? "border-amber-200 bg-white text-amber-900"
      : panelTone === "sky"
        ? "border-sky-200 bg-white text-sky-800"
        : "border-emerald-200 bg-white text-emerald-800";
  const badgeLabel =
    issueCount > 0
      ? amountIssueCountLabel(issueCount)
      : baseMismatchCount > 0
        ? "Rozdíl základny"
      : baseChangeCount > 0
        ? "Změna pojistného"
        : "Vše sedí";
  const baseStatusLabel = (comparison: PremiumBaseComparison): string => {
    if (Math.abs(comparison.annualDifference) <= ANNUAL_PREMIUM_TOLERANCE) {
      return "Sedí";
    }
    if (!comparison.canBeAnniversaryPremiumChange) return "Nesedí";
    return comparison.annualDifference > 0
      ? "Pojistné navýšeno"
      : "Pojistné poníženo";
  };
  const baseStatusClass = (comparison: PremiumBaseComparison): string => {
    if (Math.abs(comparison.annualDifference) <= ANNUAL_PREMIUM_TOLERANCE) {
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    }
    if (!comparison.canBeAnniversaryPremiumChange) {
      return "border-amber-200 bg-amber-50 text-amber-900";
    }
    return comparison.annualDifference > 0
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-sky-200 bg-sky-50 text-sky-800";
  };

  return (
    <div className={`mt-3 rounded-xl border px-3 py-3 ${panelClass}`}>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="font-bold text-slate-950">
          Kontrola vyplacených částek
        </div>
        <div className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass}`}>
          {badgeLabel}
        </div>
      </div>

      <div className="mt-3 overflow-x-auto rounded-lg border border-white/70 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Položka</th>
              <th className="px-3 py-2 text-right">Bohemka.app</th>
              <th className="px-3 py-2 text-right">Provizní výpis</th>
              <th className="px-3 py-2 text-right">Rozdíl ve výpise</th>
              <th className="px-3 py-2 text-right">Stav</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {baseComparisons.map((comparison) => (
              <tr key={comparison.key}>
                <td className="px-3 py-2 font-semibold text-slate-900">
                  {comparison.label}
                </td>
                <td className="px-3 py-2 text-right text-slate-700">
                  {formatWholeMoney(comparison.systemAnnualPremiumBase)} Kč ročně
                </td>
                <td className="px-3 py-2 text-right text-slate-700">
                  {formatWholeMoney(comparison.statementAnnualPremiumBase)} Kč ročně
                </td>
                <td
                  className={`px-3 py-2 text-right font-semibold ${
                    Math.abs(comparison.annualDifference) <= ANNUAL_PREMIUM_TOLERANCE
                      ? "text-slate-700"
                      : !comparison.canBeAnniversaryPremiumChange
                        ? "text-amber-900"
                      : comparison.annualDifference > 0
                        ? "text-emerald-800"
                        : "text-sky-800"
                  }`}
                >
                  {formatSignedWholeMoney(comparison.annualDifference)}
                </td>
                <td className="px-3 py-2 text-right">
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${baseStatusClass(comparison)}`}
                  >
                    {baseStatusLabel(comparison)}
                  </span>
                </td>
              </tr>
            ))}
            {comparisons.map((comparison) => (
              <tr key={comparison.key}>
                <td className="px-3 py-2 font-semibold text-slate-900">
                  <div>{comparison.label}</div>
                  {comparison.detailLines && comparison.detailLines.length > 0 && (
                    <div className="mt-1 space-y-0.5 text-xs font-medium leading-5 text-slate-500">
                      {comparison.detailLines.map((line) => (
                        <div key={line}>{line}</div>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-right text-slate-700">
                  {formatMoney(comparison.expectedAmount)} Kč
                </td>
                <td className="px-3 py-2 text-right text-slate-700">
                  {formatMoney(comparison.statementAmount)} Kč
                </td>
                <td
                  className={`px-3 py-2 text-right font-semibold ${
                    Math.abs(comparison.difference) <= COMMISSION_AMOUNT_TOLERANCE
                      ? "text-slate-700"
                      : "text-rose-800"
                  }`}
                >
                  {comparison.difference > 0 ? "+" : ""}
                  {formatMoney(comparison.difference)} Kč
                </td>
                <td className="px-3 py-2 text-right">
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${amountComparisonStatusClass(comparison.status)}`}
                  >
                    {amountComparisonStatusLabel(comparison.status)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatementCorrectionWarning({
  details,
  label,
}: {
  details: string[];
  label: string | null;
}) {
  if (details.length === 0) return null;

  const title =
    label === "Oprava kariérního stupně"
      ? "Pozor: smlouva byla zprovizována na jiném kariérním stupni, než by měla"
      : "Pozor: provize byla opravena navazujícím výpisem";

  return (
    <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
      <div>
        <div className="font-bold">{title}</div>
        <div className="mt-0.5 space-y-1 font-medium text-amber-900">
          {details.map((detail) => (
            <div key={detail}>{detail}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CareerMismatchWarning({
  careerCheck,
  hasAmountDifference,
}: {
  careerCheck: ReturnType<typeof statementCareerMismatch> | null;
  hasAmountDifference: boolean;
}) {
  if (
    !careerCheck ||
    careerCheck.careers.length === 0 ||
    !careerCheck.systemPosition ||
    !careerCheck.mismatched
  ) {
    return null;
  }

  return (
    <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-950">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
      <div>
        <div className="font-bold">Nesoulad kariérního stupně</div>
        <div className="mt-0.5 font-medium text-rose-900">
          Firma zprovizovala smlouvu na Kar. {statementCareerPositionsLabel(careerCheck.careers)}, ale podle systému má být {positionLabel(careerCheck.systemPosition)}.{" "}
          {hasAmountDifference
            ? "Kvůli tomu vznikl rozdíl v provizi."
            : "To může způsobit rozdíl v provizi."}{" "}
          Doporučuju prověřit výpis, případně zkontrolovat další výpis, jestli proběhlo odúčtování a nová výplata ve správném stupni.
        </div>
      </div>
    </div>
  );
}

function ContractTimelinePositionWarning({
  mismatch,
}: {
  mismatch: ContractTimelinePositionMismatch | null;
}) {
  if (!mismatch) return null;

  return (
    <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
      <div>
        <div className="font-bold">Pozice smlouvy nesedí s historií kariéry</div>
        <div className="mt-0.5 font-medium text-amber-900">
          Na smlouvě je uložená pozice {positionLabel(mismatch.storedPosition)}, ale podle historie kariéry k datu sjednání {mismatch.signedDateLabel} má být {positionLabel(mismatch.timelinePosition)}. Nejdřív zkontroluj a případně oprav uloženou smlouvu; teprve potom má smysl řešit rozdíl proti proviznímu výpisu.
        </div>
      </div>
    </div>
  );
}

function SystemMatchBadge({
  match,
  scope = "my",
}: {
  match: ContractMatchState | null;
  scope?: ContractMatchScope;
}) {
  if (!match || match.status === "idle") return null;
  const resolvedContract = matchedSystemContract(match);
  const historyLabel = systemMatchHistoryLabel(match);

  const badgeClass =
    match.status === "matched"
      ? resolvedContract
        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
        : "border-amber-200 bg-amber-50 text-amber-900"
      : match.status === "loading"
        ? "border-sky-200 bg-sky-50 text-sky-800"
        : match.status === "not_found"
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : "border-rose-200 bg-rose-50 text-rose-800";

  const label =
    match.status === "matched"
      ? resolvedContract
        ? historyLabel
          ? `Spárováno s historií (${historyLabel})`
          : "Spárováno v systému"
        : `Více shod v systému (${match.contracts.length})`
      : match.status === "loading"
        ? scope === "team"
          ? "Páruji v týmu"
          : scope === "tip"
            ? "Páruji TIP"
          : "Páruji se systémem"
        : match.status === "not_found"
          ? scope === "team"
            ? "Nenalezeno v týmu"
            : scope === "tip"
              ? "Nenalezeno přes TIP"
            : "Nenalezeno v mých smlouvách"
          : "Chyba párování";

  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass}`}>
      {label}
    </span>
  );
}

function SystemMatchPanel({
  match,
  expectedProductKey,
  selectedContract,
  scope = "my",
}: {
  match: ContractMatchState | null;
  expectedProductKey?: Product | null;
  selectedContract?: MatchedSystemContract | null;
  scope?: ContractMatchScope;
}) {
  if (!match || match.status === "idle") return null;

  if (match.status === "loading") {
    return (
      <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-900">
        {scope === "team"
          ? "Páruji číslo smlouvy s týmovými smlouvami."
          : scope === "tip"
            ? "Páruji číslo smlouvy přes uloženou TIP vazbu."
            : "Páruji číslo smlouvy s mými uloženými smlouvami."}
      </div>
    );
  }

  if (match.status === "not_found") {
    return (
      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
        {scope === "team"
          ? "Smlouva nebyla nalezena mezi týmovými smlouvami. Náhled výpisu je zatím bez zápisu."
          : scope === "tip"
            ? "Zdrojová smlouva nebyla nalezena přes TIP vazbu. Náhled výpisu je zatím bez zápisu."
            : "Smlouva nebyla nalezena mezi mými uloženými smlouvami. Náhled výpisu je zatím bez zápisu."}
      </div>
    );
  }

  if (match.status === "error") {
    return (
      <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-900">
        Párování se systémem selhalo: {match.error}
      </div>
    );
  }

  const resolvedContract = selectedContract ?? matchedSystemContract(match);
  const uniqueContracts =
    match.status === "matched" ? dedupeEquivalentSystemContracts(match.contracts) : [];
  const hasFamilyHistory = systemMatchHasSingleFamilyHistory(match);
  const displayContracts =
    hasFamilyHistory && resolvedContract
      ? [
          resolvedContract,
          ...sortSystemContractTimeline(uniqueContracts).filter(
            (contract) => contract.id !== resolvedContract.id
          ),
        ]
      : uniqueContracts.length > 0
        ? uniqueContracts
        : match.contracts;

  return (
    <div className="mt-3 space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
      {displayContracts.map((contract) => {
        const productMismatch =
          Boolean(expectedProductKey && contract.productKey) &&
          !statementProductMatchesSystemProduct(expectedProductKey, contract.productKey);
        const timelinePositionMismatch = systemContractTimelinePositionMismatch(contract);
        const inputAmount = Number(
          systemContractIsEndorsement(contract)
            ? contract.newInputAmount ?? contract.effectiveInputAmount ?? contract.inputAmount
            : contract.inputAmount
        );
        const isSelected = resolvedContract?.id === contract.id;
        const contractLabel = hasFamilyHistory
          ? isSelected
            ? "Použitý záznam"
            : systemContractIsEndorsement(contract)
              ? "Dodatek v historii"
              : "Původní záznam v historii"
          : "Shoda v systému";

        return (
          <div key={`${contract.adviserEmail ?? "owner"}-${contract.id}`}>
            <div className="font-bold">
              {contractLabel}: {contract.clientName || "klient bez názvu"}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-emerald-900">
              <span>{productLabelFromKey(contract.productKey)}</span>
              <span>Poradce: {contract.adviserName || contract.adviserEmail || "—"}</span>
              <span>Pozice: {positionLabel(systemContractPosition(contract))}</span>
              <span>
                Pojistné:{" "}
                {Number.isFinite(inputAmount)
                  ? paymentAmountWithFrequencyLabel(inputAmount, contract.frequencyRaw)
                  : "—"}
              </span>
              <span>Sjednáno: {formatSystemDate(contract.contractSignedDate)}</span>
              <span>Počátek: {formatSystemDate(contract.policyStartDate)}</span>
            </div>
            {productMismatch && (
              <div className="mt-1 font-semibold text-amber-900">
                Pozor: produkt ve výpisu nesedí s produktem uložené smlouvy.
              </div>
            )}
            {timelinePositionMismatch && (
              <div className="mt-1 font-semibold text-amber-900">
                Pozor: uložená pozice {positionLabel(timelinePositionMismatch.storedPosition)} nesedí s historií kariéry ({positionLabel(timelinePositionMismatch.timelinePosition)} k datu sjednání).
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StornoSystemStatusBadge({
  contract,
}: {
  contract: MatchedSystemContract | null;
}) {
  if (!contract) return null;

  if (systemContractIsStorno(contract)) {
    const stornoDate = toDate(contract.stornoDate);
    return (
      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
        Storno v systému
        {stornoDate ? ` · ${formatLocalDate(stornoDate)}` : ""}
      </span>
    );
  }

  return (
    <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
      V systému není storno
    </span>
  );
}

function StornoSystemActionPanel({
  target,
  onRequestStorno,
}: {
  target: StornoStatementActionTarget | null;
  onRequestStorno?: (target: StornoStatementActionTarget) => void;
}) {
  if (!target || systemContractIsStorno(target.contract)) return null;

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
        <div>
          <div className="font-bold">Výpis hlásí storno, systém ne</div>
          <div className="mt-0.5 font-medium text-amber-900">
            Smlouva je v systému vedená jako {systemContractStatusLabel(target.contract)}.
          </div>
          <div className="mt-1 text-xs font-medium text-amber-800">
            Datum storna před uložením ověř proklikem do MAXXu nebo Extranetu.
          </div>
        </div>
      </div>
      {onRequestStorno && (
        <button
          type="button"
          onClick={() => onRequestStorno(target)}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-900 transition hover:border-amber-400 hover:bg-amber-100"
        >
          <CalendarX className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
          Označit jako stornovanou
        </button>
      )}
    </div>
  );
}

function StornoStatementActionModal({
  target,
  dateInput,
  saving,
  error,
  onDateChange,
  onClose,
  onConfirm,
}: {
  target: StornoStatementActionTarget;
  dateInput: string;
  saving: boolean;
  error: string | null;
  onDateChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const extranetUrl = firstSjednatelExtranetUrl([], target.contract);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <button
        type="button"
        className="absolute inset-0 h-full w-full bg-black/70 backdrop-blur-sm"
        aria-label="Zavřít označení storna"
        onClick={onClose}
        disabled={saving}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Označit smlouvu jako stornovanou"
        className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-300 bg-white p-6 shadow-2xl shadow-slate-300/40"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold tracking-tight text-slate-900">
              Označit jako stornovanou
            </h3>
            <p className="mt-1 text-sm font-medium text-slate-600">
              Smlouva {target.contractNumber || "—"} · {target.client}
            </p>
            <p className="mt-0.5 text-sm text-slate-500">{target.product}</p>
            <p className="mt-2 text-sm font-medium text-slate-600">
              Datum storna ověř v MAXXu nebo Extranetu a pak ho ulož do systému.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-full px-2 text-slate-700 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:opacity-60"
            aria-label="Zavřít"
          >
            ×
          </button>
        </div>

        {(target.contract.maxxContractDetailUrl || extranetUrl) && (
          <div className="mt-4 flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
            <ContractDetailLink href={target.contract.maxxContractDetailUrl} compact />
            <SjednatelExtranetLink href={extranetUrl} compact />
          </div>
        )}

        <label className="mt-5 block text-sm font-semibold text-slate-700">
          Datum storna
          <input
            type="date"
            value={dateInput}
            onChange={(event) => onDateChange(event.target.value)}
            disabled={saving}
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-mono text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-300 disabled:opacity-60"
          />
        </label>

        {error && (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-900">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
          >
            Zrušit
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl border border-amber-700 bg-amber-600 px-5 py-2 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(180,83,9,0.25)] transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving && (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} aria-hidden="true" />
            )}
            Uložit storno
          </button>
        </div>
      </div>
    </div>
  );
}

function NeonRefreshConversionPromptModal({
  target,
  totalCount,
  saving,
  error,
  onClose,
  onConfirm,
}: {
  target: PostProcessingNeonRefreshPromptTarget;
  totalCount: number;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <button
        type="button"
        className="absolute inset-0 h-full w-full bg-black/70 backdrop-blur-sm"
        aria-label="Zavřít převod smlouvy na REFRESH"
        onClick={onClose}
        disabled={saving}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Označit smlouvu jako REFRESH"
        className="relative z-10 w-full max-w-xl rounded-2xl border border-slate-300 bg-white p-6 shadow-2xl shadow-slate-300/40"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-sky-800">
              <RotateCcw className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
              REFRESH z výpisu
            </div>
            <h3 className="mt-3 text-xl font-semibold tracking-tight text-slate-900">
              Označit smlouvu jako REFRESH?
            </h3>
            <p className="mt-1 text-sm font-medium text-slate-600">
              Smlouva {target.contractNumber} · {target.client}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-full p-1.5 text-slate-700 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:opacity-60"
            aria-label="Zavřít"
          >
            <X className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
          <div className="font-bold">Výpis uvádí produkt {target.productCode}</div>
          <p className="mt-1 font-medium text-sky-900">
            V systému smlouva zatím není vedená jako REFRESH. Převod nastaví REFRESH režim a
            převezme základnu z výpisu, aby očekávané provize odpovídaly výpisu.
          </p>
        </div>

        <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Výpis
            </div>
            <div className="mt-1 font-semibold text-slate-900">{target.statementLabel}</div>
            <div className="mt-1 text-slate-600">
              Základna {formatWholeMoney(target.statementAnnualPremium)} Kč ročně
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Systém teď
            </div>
            <div className="mt-1 font-semibold text-slate-900">
              {productLabelFromKey(target.contract.productKey)}
            </div>
            <div className="mt-1 text-slate-600">
              {target.systemAnnualPremium == null
                ? "Základna není jistá"
                : `${formatWholeMoney(target.systemAnnualPremium)} Kč ročně (${formatWholeMoney(
                    target.systemMonthlyPremium ?? target.systemAnnualPremium / 12
                  )} Kč měsíčně)`}
            </div>
          </div>
        </div>

        {totalCount > 1 && (
          <p className="mt-3 text-sm font-medium text-slate-500">
            Po potvrzení se zobrazí další nalezená REFRESH smlouva.
          </p>
        )}

        {error && (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-900">
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
          >
            Teď ne
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-950 bg-slate-950 px-5 py-2 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(15,23,42,0.2)] transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} aria-hidden="true" />
            ) : (
              <RotateCcw className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
            )}
            Označit jako REFRESH
          </button>
        </div>
      </div>
    </div>
  );
}

function MatchingProgressBar({
  stats,
  hasUser,
}: {
  stats: ContractMatchStats;
  hasUser: boolean;
}) {
  if (stats.total === 0) return null;

  const isComplete = stats.completed >= stats.total;
  const activeCount = stats.loading + stats.pending;
  const fillClass =
    stats.errors > 0 && isComplete
      ? "bg-rose-500"
      : isComplete
        ? "bg-emerald-500"
        : "bg-slate-950";
  const statusText = !hasUser
    ? "Čekám na přihlášení"
    : isComplete
      ? "Párování dokončeno"
      : `Páruji ${activeCount} smluv`;

  return (
    <section className="h-full rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
            isComplete
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-slate-200 bg-slate-50 text-slate-700"
          }`}>
            {isComplete ? (
              <CheckCircle2 className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
            ) : (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} aria-hidden="true" />
            )}
          </span>
          <div>
            <h2 className="text-sm font-bold text-slate-950">Párování smluv</h2>
            <p className="text-xs font-medium text-slate-500">
              {statusText} · {stats.completed}/{stats.total} hotovo
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold tabular-nums text-slate-950">
            {stats.progress} %
          </div>
          <div className="text-xs font-semibold text-slate-500">
            {stats.matched} shod · {stats.notFound} nenalezeno · {stats.errors} chyby
          </div>
        </div>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${fillClass}`}
          style={{
            width: `${stats.progress}%`,
            minWidth: stats.progress > 0 ? "1.25rem" : undefined,
          }}
        >
          {!isComplete && stats.progress > 0 && (
            <div className="h-full w-full animate-pulse rounded-full bg-white/25" />
          )}
        </div>
      </div>
    </section>
  );
}

const summaryIconToneClass: Record<"slate" | "emerald" | "sky" | "indigo", string> = {
  slate: "border-slate-200 bg-slate-50 text-slate-600",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  sky: "border-sky-200 bg-sky-50 text-sky-700",
  indigo: "border-indigo-200 bg-indigo-50 text-indigo-700",
};

function SummaryStatCard({
  icon: Icon,
  label,
  value,
  tone = "slate",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone?: keyof typeof summaryIconToneClass;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5">
      <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${summaryIconToneClass[tone]}`}>
        <Icon className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <div className="text-[11px] font-bold uppercase text-slate-500">
          {label}
        </div>
        <div className="mt-0.5 truncate text-base font-bold text-slate-950">
          {value}
        </div>
      </div>
    </div>
  );
}

function StatementSummary({ statement }: { statement: ParsedStatement }) {
  const totalCommission = useMemo(
    () => sumRows(statement.commissionRows),
    [statement.commissionRows]
  );
  const totalOtherPayments = useMemo(
    () => sumPayments(statement.otherPayments),
    [statement.otherPayments]
  );
  const totalManagerCommission = useMemo(
    () =>
      statement.managerCommissions.reduce(
        (sum, advisor) => sum + advisor.commission + advisor.stornos + advisor.deductions,
        0
      ),
    [statement.managerCommissions]
  );

  return (
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
      <SummaryStatCard
        icon={CalendarDays}
        label="Období"
        value={statement.header.period ?? "—"}
        tone="slate"
      />
      <SummaryStatCard
        icon={Banknote}
        label="Vyplaceno"
        value={
          statement.payoutTotal != null
            ? `${formatMoney(statement.payoutTotal)} Kč`
            : "—"
        }
        tone="emerald"
      />
      <SummaryStatCard
        icon={HandCoins}
        label="Záloha za smlouvy"
        value={`${formatMoney(totalCommission)} Kč`}
        tone="emerald"
      />
      <SummaryStatCard
        icon={WalletCards}
        label="Ostatní platby"
        value={`${formatMoney(totalOtherPayments)} Kč`}
        tone="sky"
      />
      <SummaryStatCard
        icon={UsersRound}
        label="Provize manažera"
        value={`${formatMoney(totalManagerCommission)} Kč`}
        tone="indigo"
      />
    </div>
  );
}

function LifeSplitContractCard({
  contract,
  match,
  statementId,
  statementPeriod,
  statementKey,
  correctionContext,
  markingControls,
  onConvertNeonRefresh,
}: {
  contract: LifeSplitContractPreview;
  match: ContractMatchState | null;
  statementId?: string | null;
  statementPeriod?: string | null;
  statementKey?: string;
  correctionContext?: StatementCorrectionContext;
  markingControls?: MarkingControls;
  onConvertNeonRefresh?: (
    target: ManualNeonRefreshConversionTarget
  ) => Promise<ManualNeonRefreshConversionResponse>;
}) {
  const status = statusForContract(contract);
  const a101Rows = rowsByKind(contract, "a101");
  const b0301Rows = rowsByKind(contract, "b0301");
  const a101 = sumRows(a101Rows);
  const b0301 = sumRows(b0301Rows);
  const b3601 = sumRows(rowsByKind(contract, "b3601"));
  const b4801 = sumRows(rowsByKind(contract, "b4801"));
  const subsequent = sumRows(rowsByKind(contract, "subsequent"));
  const care = sumRows(rowsByKind(contract, "care"));
  const increaseRows = rowsByKind(contract, "increase");
  const increase = sumRows(increaseRows);
  const tip = sumRows(rowsByKind(contract, "tip"));
  const b36Half = sumPayments(contract.b36Payments);
  const total = a101 + b0301 + b3601 + b4801 + subsequent + care + increase + tip + b36Half;
  const monthlyPremium = contract.annualPremium > 0 ? contract.annualPremium / 12 : null;
  const hasLifePremiumIncrease = increaseRows.length > 0;
  const lifeIncreaseAnnualPremium = increaseRows
    .map((row) => row.base)
    .find((base) => base > 0) ?? 0;
  const missingClientCardCommissionWarning = a101Rows.length > 0 && b0301Rows.length === 0;
  const deferredClientCardCommission = a101Rows.length === 0 && b0301Rows.length > 0;
  const b36HalfLabel = b36HalfLabelForProduct(contract.productCode);
  const pairedB36PaymentIndexes = b36OffsetPairIndexes(contract.b36Payments);
  const expectedProductKey = resolveStatementProduct(contract.productCode).productKey;
  const reviewRows = statementKey
    ? rowsForStatementReview(statementKey, contract.rows, correctionContext)
    : contract.rows;
  const reviewContract =
    reviewRows.length === contract.rows.length
      ? contract
      : {
          ...contract,
          rows: reviewRows,
          annualPremium: reviewRows.find((row) => row.base > 0)?.base ?? contract.annualPremium,
        };
  const tipOnlyContract = lifeSplitContractHasOnlyTipRows(reviewContract);
  const matchScope = lifeSplitContractMatchScope(reviewContract);
  const correctionLabel = statementKey
    ? correctedRowsLabel(statementKey, contract.rows, correctionContext)
    : null;
  const correctionDetails = statementKey
    ? correctedRowsDetails(statementKey, contract.rows, correctionContext)
    : [];
  const systemContract = matchedSystemContractForLifeSplit(reviewContract, match);
  const missingB36Warning = tipOnlyContract
    ? null
    : missingAcceleratedB36Warning(
        reviewContract.rows,
        contract.b36Payments,
        systemContract
      );
  const amountComparisons = systemContract
    ? buildLifeSplitAmountComparisons(reviewContract, systemContract, statementPeriod)
    : [];
  const coefficientOverride = systemContract
    ? lifeCoefficientOverrideInfo(reviewContract, systemContract)
    : null;
  const amountIssueCount = amountComparisons.filter((comparison) => comparison.status !== "ok").length;
  const careerCheck = systemContract && !tipOnlyContract
    ? statementCareerMismatch(reviewContract.rows, systemContractPositionRaw(systemContract))
    : null;
  const timelinePositionMismatch = tipOnlyContract
    ? null
    : systemContractTimelinePositionMismatch(systemContract);
  const hasCareerIssue = Boolean(
    careerCheck &&
      careerCheck.careers.length > 0 &&
      (!careerCheck.systemPosition || careerCheck.mismatched)
  );
  const premiumBaseMismatch = !tipOnlyContract && reviewContract.rows.length > 0
    ? annualPremiumBaseMismatch(reviewContract.annualPremium, systemContract)
    : null;
  const isRefreshMissingOriginal = isNeonRefreshMissingOriginalInSystem(systemContract);
  const premiumBaseExplainedByEndorsement =
    premiumBaseMismatch?.explainedByEndorsement ?? null;
  const premiumMonthlyDifference = premiumBaseMismatch
    ? premiumBaseMismatch.statementAnnualPremium / 12 - premiumBaseMismatch.systemMonthlyPremium
    : null;
  const premiumEndorsementDate = premiumBaseExplainedByEndorsement
    ? formatSystemDate(
        premiumBaseExplainedByEndorsement.policyStartDate ??
          premiumBaseExplainedByEndorsement.contractSignedDate ??
          premiumBaseExplainedByEndorsement.createdAt
      )
    : "—";
  const premiumEndorsementMonthly = Number(
    premiumBaseExplainedByEndorsement?.premiumAmount
  );
  const premiumEndorsementAnnual = Number(
    premiumBaseExplainedByEndorsement?.annualPremium
  );
  const premiumEndorsementAnnualDelta = Number(
    premiumBaseExplainedByEndorsement?.annualPremiumDelta
  );
  const detailUrl = firstContractDetailUrl(contract.rows);
  const extranetUrl = firstSjednatelExtranetUrl(contract.rows, systemContract);
  const [expanded, setExpanded] = useState(false);
  const [refreshConversionState, setRefreshConversionState] = useState<{
    status: "idle" | "saving" | "success" | "error";
    message: string | null;
  }>({ status: "idle", message: null });
  const isStatementNrfRefresh = normalizeProductCode(reviewContract.productCode) === "CPP_NRF_LF";
  const shouldShowStatementRefreshConversion = Boolean(
    isStatementNrfRefresh &&
      systemContract &&
      systemContract.productKey === "neon" &&
      systemContract.isRefresh !== true &&
      onConvertNeonRefresh
  );
  const canConvertStatementRefresh = Boolean(
    shouldShowStatementRefreshConversion && statementId
  );
  const handleConvertStatementRefresh = async () => {
    if (!statementId || !systemContract || !onConvertNeonRefresh) return;
    setRefreshConversionState({ status: "saving", message: null });

    try {
      await onConvertNeonRefresh({
        statementId,
        contract: systemContract,
        contractNumber: contract.contractNumber,
      });
      setRefreshConversionState({
        status: "success",
        message: "Smlouva byla převedena na REFRESH podle výpisu.",
      });
    } catch (conversionError) {
      setRefreshConversionState({
        status: "error",
        message:
          conversionError instanceof Error
            ? conversionError.message
            : "Převod na REFRESH se nepodařil.",
      });
    }
  };
  const markedItem: MarkedDiscrepancyItem | null = markingControls
    ? {
        key: markedDiscrepancyKey({
          statementKey: markingControls.statementKey,
          scope: matchScope,
          category: "Životní pojištění",
          contractNumber: contract.contractNumber,
          fallback: `${contract.productCode}-${contract.client}`,
        }),
        statementKey: markingControls.statementKey,
        statementLabel: markingControls.statementLabel,
        category: "Životní pojištění",
        scope: matchScope,
        contractNumber: contract.contractNumber,
        client: contract.client || "—",
        product: `${contract.productLabel} · ${contract.productCode}`,
        title: "Ručně označená smlouva k opravě",
        amount: total,
        details: [
          `Uzavřeno: ${contract.signedAt || "—"}`,
          `Počátek: ${contract.validFrom || "—"}`,
        ],
      }
    : null;
  const contractProductMeta = resolveStatementProduct(contract.productCode);

  return (
    <article className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      {markedItem && (
        <div className="mb-3 flex justify-end">
          <MarkedDiscrepancyToggle item={markedItem} markingControls={markingControls} />
        </div>
      )}
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full flex-col gap-3 text-left lg:flex-row lg:items-start lg:justify-between"
        aria-expanded={expanded}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-slate-950">
              Smlouva {contract.contractNumber}
            </h3>
            <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(status.tone)}`}>
              {status.label}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-2.5 text-xs font-semibold text-slate-700">
              <StatementProductLogo product={contractProductMeta} size="xs" />
              {contract.productLabel} · {contract.productCode}
            </span>
            <SystemMatchBadge match={match} scope={matchScope} />
            {correctionLabel && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                {correctionLabel}
              </span>
            )}
            {hasCareerIssue && (
              <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800">
                {statementCareerBadgeLabel(careerCheck?.careers)}
              </span>
            )}
            {timelinePositionMismatch && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                Pozice mimo timeline
              </span>
            )}
            {amountComparisons.length > 0 && (
              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                  amountIssueCount === 0
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-rose-200 bg-rose-50 text-rose-800"
                }`}
              >
                {amountIssueCount === 0 ? "Provize sedí" : amountIssueCountLabel(amountIssueCount)}
              </span>
            )}
            {coefficientOverride && (
              <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-800">
                Výpis použil {coefficientSetLabel(coefficientOverride.coefficientSet)}
              </span>
            )}
            {premiumBaseExplainedByEndorsement && (
              <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800">
                Základna z dodatku
              </span>
            )}
            {hasLifePremiumIncrease && (
              <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-800">
                Navýšení pojistného
              </span>
            )}
            {missingB36Warning && (
              <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800">
                Chybí 50% z B36
              </span>
            )}
          </div>
          <div className="mt-1 text-[15px] font-semibold text-slate-800">
            {contract.client || "Klient se doplní po spárování se systémem"}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <span>Uzavřeno: {contract.signedAt || "—"}</span>
            <span>Počátek: {contract.validFrom || "—"}</span>
            <span>
              Roční základna: {contract.annualPremium > 0 ? `${formatWholeMoney(contract.annualPremium)} Kč` : "—"}
            </span>
            <span>
              Měsíčně: {monthlyPremium === null ? "—" : `${formatWholeMoney(monthlyPremium)} Kč`}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 self-start lg:self-auto">
          <div className="rounded-xl bg-slate-950 px-3 py-2 text-right text-white ring-1 ring-slate-800">
            <div className="text-[11px] font-black uppercase tracking-wide !text-white opacity-100">
              Nalezeno celkem
            </div>
            <div className="mt-1 whitespace-nowrap text-lg font-bold text-emerald-200">
              {formatMoney(total)} Kč
            </div>
          </div>
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600">
            <ChevronDown
              className={`h-5 w-5 transition-transform ${expanded ? "rotate-180" : ""}`}
              strokeWidth={2.2}
              aria-hidden="true"
            />
          </span>
        </div>
      </button>

      {expanded && (
        <div className="mt-3">
          {tip > 0 && (
            <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-900">
              ATP101: provize z TIPU. Párovat přes TIP vazbu, ne jako vlastní sjednání smlouvy.
            </div>
          )}

          <SystemMatchPanel
            match={match}
            expectedProductKey={expectedProductKey}
            selectedContract={systemContract}
            scope={matchScope}
          />
          {(systemContract || detailUrl || extranetUrl) && (
            <div className="mt-3 flex flex-wrap gap-2">
              <BohemkaContractDetailLink contract={systemContract} />
              <ContractDetailLink href={detailUrl} />
              <SjednatelExtranetLink href={extranetUrl} />
            </div>
          )}

          {(shouldShowStatementRefreshConversion || refreshConversionState.message) && (
            <div
              className={`mt-3 flex flex-col gap-3 rounded-xl border px-3 py-3 text-sm sm:flex-row sm:items-start sm:justify-between ${
                refreshConversionState.status === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                  : refreshConversionState.status === "error"
                    ? "border-rose-200 bg-rose-50 text-rose-950"
                    : "border-sky-200 bg-sky-50 text-sky-950"
              }`}
            >
              <div className="flex min-w-0 items-start gap-2">
                {refreshConversionState.status === "error" ? (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
                )}
                <div>
                  <div className="font-bold">Výpis označuje smlouvu jako REFRESH</div>
                  <div
                    className={`mt-0.5 font-medium ${
                      refreshConversionState.status === "error"
                        ? "text-rose-900"
                        : refreshConversionState.status === "success"
                          ? "text-emerald-900"
                          : "text-sky-900"
                    }`}
                  >
                    {refreshConversionState.message ??
                      (statementId
                        ? "V systému zatím není vedená jako REFRESH. Ruční převod nastaví REFRESH režim a převezme výpisovou základnu z řádku NRF, aby očekávané provize odpovídaly výpisu."
                        : "V systému zatím není vedená jako REFRESH. Nejdřív zpracuj výpis, aby měl uložené ID, potom půjde smlouvu ručně převést podle řádku NRF.")}
                  </div>
                </div>
              </div>
              {shouldShowStatementRefreshConversion && refreshConversionState.status !== "success" && (
                <button
                  type="button"
                  onClick={() => {
                    void handleConvertStatementRefresh();
                  }}
                  disabled={!canConvertStatementRefresh || refreshConversionState.status === "saving"}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {refreshConversionState.status === "saving" ? (
                    <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} aria-hidden="true" />
                  ) : (
                    <RotateCcw className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                  )}
                  {statementId ? "Převést na REFRESH" : "Nejdřív zpracovat výpis"}
                </button>
              )}
            </div>
          )}

          <StatementCorrectionWarning details={correctionDetails} label={correctionLabel} />
          <ContractTimelinePositionWarning mismatch={timelinePositionMismatch} />
          <CareerMismatchWarning
            careerCheck={careerCheck}
            hasAmountDifference={amountIssueCount > 0}
          />

          {hasLifePremiumIncrease && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-950">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
              <div>
                <div className="font-bold">Pojistné navýšeno</div>
                <div className="mt-0.5 font-medium text-cyan-900">
                  Řádek výpisu je provize za navýšení smlouvy. Základna {formatWholeMoney(lifeIncreaseAnnualPremium)} Kč znamená navýšení pojistného o {formatWholeMoney(lifeIncreaseAnnualPremium)} Kč ročně ({formatWholeMoney(lifeIncreaseAnnualPremium / 12)} Kč měsíčně), ne celé nové pojistné.
                </div>
              </div>
            </div>
          )}

          {coefficientOverride && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-950">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
              <div>
                <div className="font-bold">
                  Výpis sedí na {coefficientSetLabel(coefficientOverride.coefficientSet)}
                </div>
                <div className="mt-0.5 font-medium text-violet-900">
                  Smlouva podle data používá {coefficientSetLabel(coefficientOverride.currentSet)}, ale vyplacené částky ve výpisu jednoznačně odpovídají sadě {coefficientSetLabel(coefficientOverride.coefficientSet)}. Při zápisu výpisu uložím ke smlouvě výjimku a přepočítám položky podle výpisu.
                </div>
              </div>
            </div>
          )}

          {premiumBaseMismatch && isRefreshMissingOriginal && !hasLifePremiumIncrease && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
              <div>
                <div className="font-bold">REFRESH bez původní smlouvy v systému</div>
                <div className="mt-0.5 font-medium text-sky-900">
                  Výpis počítá se základnou {formatWholeMoney(premiumBaseMismatch.statementAnnualPremium)} Kč ročně ({formatWholeMoney(premiumBaseMismatch.statementAnnualPremium / 12)} Kč měsíčně). Smlouva je uložená jako REFRESH bez původní smlouvy v systému, takže kalkulační základna je jen orientační a musí se převzít z výpisu.
                </div>
              </div>
            </div>
          )}

          {premiumBaseMismatch && !isRefreshMissingOriginal && !premiumBaseExplainedByEndorsement && !hasLifePremiumIncrease && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
              <div>
                <div className="font-bold">Nesoulad ročního pojistného</div>
                <div className="mt-0.5 font-medium text-amber-900">
                  Výpis počítá se základnou {formatWholeMoney(premiumBaseMismatch.statementAnnualPremium)} Kč ročně ({formatWholeMoney(premiumBaseMismatch.statementAnnualPremium / 12)} Kč měsíčně), ale systém eviduje {formatWholeMoney(premiumBaseMismatch.systemAnnualPremium)} Kč ročně ({formatWholeMoney(premiumBaseMismatch.systemMonthlyPremium)} Kč měsíčně). Rozdíl pojistného je {formatWholeMoney(premiumBaseMismatch.difference)} Kč ročně ({formatWholeMoney(premiumMonthlyDifference ?? 0)} Kč měsíčně).
                </div>
              </div>
            </div>
          )}

          {premiumBaseMismatch && premiumBaseExplainedByEndorsement && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
              <div>
                <div className="font-bold">Základna odpovídá dodatku smlouvy</div>
                <div className="mt-0.5 font-medium text-sky-900">
                  Výpis počítá se základnou {formatWholeMoney(premiumBaseMismatch.statementAnnualPremium)} Kč ročně ({formatWholeMoney(premiumBaseMismatch.statementAnnualPremium / 12)} Kč měsíčně). Aktuální hlavní záznam má {formatWholeMoney(premiumBaseMismatch.systemAnnualPremium)} Kč ročně, ale dohledaný dodatek od {premiumEndorsementDate} eviduje {Number.isFinite(premiumEndorsementAnnual) ? formatWholeMoney(premiumEndorsementAnnual) : "—"} Kč ročně{Number.isFinite(premiumEndorsementMonthly) ? ` (${formatWholeMoney(premiumEndorsementMonthly)} Kč měsíčně)` : ""}{Number.isFinite(premiumEndorsementAnnualDelta) && premiumEndorsementAnnualDelta !== 0 ? `, změna ${formatWholeMoney(premiumEndorsementAnnualDelta)} Kč ročně` : ""}.
                </div>
              </div>
            </div>
          )}

          {missingClientCardCommissionWarning && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
              <div>
                <div className="font-bold">Chybí provize B0301 (karta klienta)</div>
                <div className="mt-0.5 font-medium text-amber-900">
                  Ve výpisu je A101, ale B0301 zde není. Pokud karta klienta nebyla zpracována do výplatního termínu, očekáváme B0301 obvykle po 3 měsících.
                </div>
              </div>
            </div>
          )}

          {deferredClientCardCommission && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
              <div>
                <div className="font-bold">Doplacená B0301 po kartě klienta</div>
                <div className="mt-0.5 font-medium text-emerald-900">
                  Ve výpisu je pouze B0301 bez A101. Beru ji jako pozdější doplacení provize po zpracování karty klienta; částka se pořád kontroluje proti Bohemka.App.
                </div>
              </div>
            </div>
          )}

          <AmountComparisonPanel comparisons={amountComparisons} />

          {missingB36Warning && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
              <span>Zrychlený režim: {missingB36Warning.detail}</span>
            </div>
          )}

          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Kód</th>
                  <th className="px-3 py-2">Význam</th>
                  <th className="px-3 py-2 text-right">Základna</th>
                  <th className="px-3 py-2 text-right">Procento</th>
                  <th className="px-3 py-2 text-right">Provize</th>
                  <th className="px-3 py-2 text-right">Rez. fond</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {contract.rows.map((row) => (
                  <tr key={`${row.id}-${row.type}-${row.commission}`}>
                    <td className="px-3 py-2 font-semibold text-slate-900">{row.type}</td>
                    <td className="px-3 py-2 text-slate-700">{row.lifeSplitLabel}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{formatMoney(row.base)}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{row.percent || "—"}</td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-950">
                      {formatMoney(row.commission)}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-700">
                      {formatMoney(row.reserveFund)}
                    </td>
                  </tr>
                ))}
                {contract.b36Payments.map((payment, index) => {
                  const isOffsetPair = pairedB36PaymentIndexes.has(index);
                  return (
                    <tr key={`${payment.contractNumber}-b36-${index}`} className="bg-emerald-50/60">
                      <td className="px-3 py-2 font-semibold text-slate-900">B36</td>
                      <td className="px-3 py-2 text-slate-700">
                        {b36HalfLabel} z ostatních plateb
                        {payment.isStorno ? " / storno" : ""}
                        {isOffsetPair ? " / vyplaceno a odečteno ve stejném výpisu" : ""}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-700">—</td>
                      <td className="px-3 py-2 text-right text-slate-700">—</td>
                      <td className="px-3 py-2 text-right font-semibold text-slate-950">
                        {formatMoney(payment.amount)}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-700">—</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </article>
  );
}

function OtherProductContractCard({
  contract,
  match,
  statementPeriod,
  statementKey,
  correctionContext,
  markingControls,
}: {
  contract: OtherProductContractPreview;
  match: ContractMatchState | null;
  statementPeriod?: string | null;
  statementKey?: string;
  correctionContext?: StatementCorrectionContext;
  markingControls?: MarkingControls;
}) {
  const productMetas = uniqueProductMetasForRows(contract.rows);
  const notes = productMetas.map((product) => product.note).filter(Boolean);
  const totalCommission = sumRows(contract.rows) + sumPayments(contract.b36Payments);
  const pairedB36PaymentIndexes = b36OffsetPairIndexes(contract.b36Payments);
  const totalReserve = contract.rows.reduce((sum, row) => sum + row.reserveFund, 0);
  const hasUnknown = contract.rows.some(
    (row) => classifyGeneralCommissionCode(row.product, row.type).kind === "unknown"
  );
  const isAutoContract = contractHasProductCategory(contract, "auto");
  const annualBaseRow = contract.rows.find(
    (row) => resolveStatementProduct(row.product).usesAnnualPremiumBase && row.base > 0
  );
  const annualBase = annualBaseRow?.base ?? 0;
  const monthlyBase = annualBase > 0 ? annualBase / 12 : null;
  const expectedProductKey =
    productMetas.length === 1 ? productMetas[0]?.productKey ?? null : null;
  const systemContract = matchedSystemContract(match);
  const reviewRows = statementKey
    ? rowsForStatementReview(statementKey, contract.rows, correctionContext)
    : contract.rows;
  const reviewContract =
    reviewRows.length === contract.rows.length
      ? contract
      : { ...contract, rows: reviewRows };
  const tipOnlyContract = otherProductContractHasOnlyTipRows(reviewContract);
  const matchScope = otherProductContractMatchScope(reviewContract);
  const correctionLabel = statementKey
    ? correctedRowsLabel(statementKey, contract.rows, correctionContext)
    : null;
  const correctionDetails = statementKey
    ? correctedRowsDetails(statementKey, contract.rows, correctionContext)
    : [];
  const missingB36Warning = tipOnlyContract
    ? null
    : missingAcceleratedB36Warning(
        reviewContract.rows,
        contract.b36Payments,
        systemContract
      );
  const amountComparisons = systemContract
    ? buildOtherProductAmountComparisons(reviewContract, systemContract, statementPeriod)
    : [];
  const coefficientOverride =
    isAutoContract && systemContract && !tipOnlyContract
      ? autoCoefficientOverrideInfo(reviewContract, systemContract)
      : null;
  const autoPremiumBaseComparison = isAutoContract && !tipOnlyContract
    ? autoPremiumBaseComparisonForContract(reviewContract, systemContract, statementPeriod)
    : null;
  const autoPremiumChange = tipOnlyContract
    ? null
    : autoPremiumChangeInfo(
        reviewContract,
        systemContract,
        statementPeriod
      );
  const amountComparisonsForReview = amountComparisons.filter(
    (comparison) =>
      !isAmountComparisonExplainedByAutoPremiumChange(comparison, autoPremiumChange)
  );
  const amountIssueCount = amountComparisonsForReview.filter(
    (comparison) => comparison.status !== "ok"
  ).length;
  const careerCheck = systemContract && !tipOnlyContract
    ? statementCareerMismatch(reviewContract.rows, systemContractPositionRaw(systemContract))
    : null;
  const timelinePositionMismatch = tipOnlyContract
    ? null
    : systemContractTimelinePositionMismatch(systemContract);
  const hasCareerIssue = Boolean(
    careerCheck &&
      careerCheck.careers.length > 0 &&
      (!careerCheck.systemPosition || careerCheck.mismatched)
  );
  const autoPremiumBaseMismatch =
    tipOnlyContract ||
    autoPremiumChange ||
    !autoPremiumBaseComparison ||
    Math.abs(autoPremiumBaseComparison.annualDifference) <= ANNUAL_PREMIUM_TOLERANCE
      ? null
      : autoPremiumBaseComparison;
  const autoPremiumBaseMismatchBeforeAnniversary = Boolean(
    autoPremiumBaseMismatch &&
      autoPremiumBaseComparison &&
      !autoPremiumBaseComparison.canBeAnniversaryPremiumChange
  );
  const detailUrl = firstContractDetailUrl(contract.rows);
  const extranetUrl = firstSjednatelExtranetUrl(contract.rows, systemContract);
  const [expanded, setExpanded] = useState(false);
  const markedItem: MarkedDiscrepancyItem | null = markingControls
    ? {
        key: markedDiscrepancyKey({
          statementKey: markingControls.statementKey,
          scope: matchScope,
          category: isAutoContract ? "Auta" : "Ostatní smlouvy",
          contractNumber: contract.contractNumber,
          fallback: `${contract.key}-${contract.client}`,
        }),
        statementKey: markingControls.statementKey,
        statementLabel: markingControls.statementLabel,
        category: isAutoContract ? "Auta" : "Ostatní smlouvy",
        scope: matchScope,
        contractNumber: contract.contractNumber,
        client: contract.client || "—",
        product:
          productMetas.length > 0
            ? productMetas.map((product) => `${product.label} · ${product.rawCode}`).join("; ")
            : "Produkt nezjištěn",
        title: "Ručně označená smlouva k opravě",
        amount: totalCommission,
        details: [
          `Uzavřeno: ${contract.signedAt || "—"}`,
          `Platnost: ${contract.validFrom || "—"}`,
        ],
      }
    : null;

  return (
    <article className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      {markedItem && (
        <div className="mb-3 flex justify-end">
          <MarkedDiscrepancyToggle item={markedItem} markingControls={markingControls} />
        </div>
      )}
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full flex-col gap-3 text-left lg:flex-row lg:items-start lg:justify-between"
        aria-expanded={expanded}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-base font-bold text-slate-950">
              Smlouva {contract.contractNumber || "—"}
            </h4>
            {productMetas.map((product) => (
              <span
                key={product.rawCode}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-2.5 text-xs font-semibold text-slate-700"
              >
                <StatementProductLogo product={product} size="xs" />
                {product.label} · {product.rawCode} · {statementProductCategoryLabel(product.category)}
              </span>
            ))}
            {hasUnknown && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                Neznámý kód
              </span>
            )}
            <SystemMatchBadge match={match} scope={matchScope} />
            {correctionLabel && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                {correctionLabel}
              </span>
            )}
            {hasCareerIssue && (
              <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800">
                {statementCareerBadgeLabel(careerCheck?.careers)}
              </span>
            )}
            {timelinePositionMismatch && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                Pozice mimo timeline
              </span>
            )}
            {autoPremiumChange && (
              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                  autoPremiumChange.direction === "increase"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-sky-200 bg-sky-50 text-sky-800"
                }`}
              >
                {autoPremiumChange.direction === "increase"
                  ? "Pojistné navýšeno"
                  : "Pojistné poníženo"}
              </span>
            )}
            {amountComparisonsForReview.length > 0 && (
              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                  amountIssueCount === 0
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-rose-200 bg-rose-50 text-rose-800"
                }`}
              >
                {amountIssueCount === 0 ? "Provize sedí" : amountIssueCountLabel(amountIssueCount)}
              </span>
            )}
            {coefficientOverride && (
              <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-800">
                Výpis použil {coefficientSetLabel(coefficientOverride.coefficientSet)}
              </span>
            )}
            {missingB36Warning && (
              <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800">
                Chybí 50% z B36
              </span>
            )}
          </div>
          <div className="mt-1 text-[15px] font-semibold text-slate-800">
            {contract.client || "Klient nezjištěn"}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <span>Uzavřeno: {contract.signedAt || "—"}</span>
            <span>Platnost: {contract.validFrom || "—"}</span>
            <span>{contract.rows.length} řádků</span>
            {contract.b36Payments.length > 0 && (
              <span>{contract.b36Payments.length} B36 z ostatních plateb</span>
            )}
            {productMetas.some((product) => product.usesAnnualPremiumBase) && (
              <>
                <span>
                  Roční základna: {annualBase > 0 ? `${formatWholeMoney(annualBase)} Kč` : "—"}
                </span>
                <span>
                  Měsíčně: {monthlyBase === null ? "—" : `${formatWholeMoney(monthlyBase)} Kč`}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 self-start lg:self-auto">
          <div className="grid grid-cols-2 gap-2 text-right">
            <div className="rounded-xl bg-slate-950 px-3 py-2 text-white ring-1 ring-slate-800">
              <div className="text-[11px] font-black uppercase tracking-wide !text-white opacity-100">
                Provize
              </div>
              <div className="mt-1 whitespace-nowrap text-lg font-bold text-emerald-200">
                {formatMoney(totalCommission)} Kč
              </div>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-rose-950">
              <div className="text-[11px] font-bold uppercase tracking-wide text-rose-700">
                Rez. fond
              </div>
              <div className="mt-1 whitespace-nowrap text-lg font-bold text-rose-900">
                {formatMoney(totalReserve)} Kč
              </div>
            </div>
          </div>
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600">
            <ChevronDown
              className={`h-5 w-5 transition-transform ${expanded ? "rotate-180" : ""}`}
              strokeWidth={2.2}
              aria-hidden="true"
            />
          </span>
        </div>
      </button>

      {expanded && (
        <div className="mt-3">
          {notes.length > 0 && (
            <div className="space-y-1 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-900">
              {notes.map((note) => (
                <div key={note}>{note}</div>
              ))}
            </div>
          )}

          <SystemMatchPanel
            match={match}
            expectedProductKey={expectedProductKey}
            scope={matchScope}
          />
          {(systemContract || detailUrl || extranetUrl) && (
            <div className="mt-3 flex flex-wrap gap-2">
              <BohemkaContractDetailLink contract={systemContract} />
              <ContractDetailLink href={detailUrl} />
              <SjednatelExtranetLink href={extranetUrl} />
            </div>
          )}

          <StatementCorrectionWarning details={correctionDetails} label={correctionLabel} />
          <ContractTimelinePositionWarning mismatch={timelinePositionMismatch} />
          <CareerMismatchWarning
            careerCheck={careerCheck}
            hasAmountDifference={amountIssueCount > 0}
          />

          {autoPremiumChange && (
            <div
              className={`mt-3 flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${
                autoPremiumChange.direction === "increase"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                  : "border-sky-200 bg-sky-50 text-sky-950"
              }`}
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
              <div>
                <div className="font-bold">
                  Pojistné {autoPremiumChange.direction === "increase" ? "navýšeno" : "poníženo"} u výročí smlouvy
                </div>
                <div
                  className={`mt-0.5 font-medium ${
                    autoPremiumChange.direction === "increase"
                      ? "text-emerald-900"
                      : "text-sky-900"
                  }`}
                >
                  Výpis počítá s {autoStatementPremiumBaseText(autoPremiumChange)} pro tuto provizní položku. Systém eviduje {paymentAmountWithFrequencyLabel(autoPremiumChange.systemPremiumBase, autoPremiumChange.systemPaymentFrequency)} ({formatWholeMoney(autoPremiumChange.systemAnnualPremiumBase)} Kč ročně). Rozdíl {formatSignedWholeMoney(autoPremiumChange.difference)} za platbu ({formatSignedWholeMoney(autoPremiumChange.annualDifference)} ročně) odpovídá {autoPremiumChange.source === "stored_history" ? "uložené historii změny pojistného" : "změně pojistného v toleranci kolem výročí"}{autoPremiumChange.anniversaryDate ? ` ${formatLocalDate(autoPremiumChange.anniversaryDate)}` : ""}{autoPremiumChange.referenceDate ? ` (výpis do ${formatLocalDate(autoPremiumChange.referenceDate)})` : ""}. Změna se zapisuje k výročnímu dni, proto ji neberu jako chybu výpisu.
                </div>
              </div>
            </div>
          )}

          {autoPremiumBaseMismatch && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
              <div>
                <div className="font-bold">
                  {autoPremiumBaseMismatchBeforeAnniversary
                    ? "Nesedí základna ve výpisu"
                    : "Rozdíl pojistného ve výpisu a systému"}
                </div>
                <div className="mt-0.5 font-medium text-amber-900">
                  {autoPremiumBaseMismatchBeforeAnniversary
                    ? `Pojišťovna ve výpisu použila základnu ${formatWholeMoney(autoPremiumBaseMismatch.statementPremiumBase)} Kč za platbu, ale v systému je ${paymentAmountWithFrequencyLabel(autoPremiumBaseMismatch.systemPremiumBase, autoPremiumBaseMismatch.systemPaymentFrequency)}. Výpis je do ${formatLocalDate(autoPremiumBaseComparison?.referenceDate)} a výročí je ${formatLocalDate(autoPremiumBaseComparison?.anniversaryDate ?? autoPremiumBaseComparison?.firstAnniversaryDate)}, takže rozdíl není v toleranci ${AUTO_PREMIUM_ANNIVERSARY_TOLERANCE_MONTHS} měsíců kolem výročí.`
                    : "U aut to může být důsledek změny pojistného kolem výročí smlouvy, tedy zdražení nebo zlevnění, a vysvětlovat rozdíl ve vyplacené provizi."}
                </div>
              </div>
            </div>
          )}

          {coefficientOverride && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-950">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
              <div>
                <div className="font-bold">
                  Výpis sedí na {coefficientSetLabel(coefficientOverride.coefficientSet)}
                </div>
                <div className="mt-0.5 font-medium text-violet-900">
                  Smlouva podle data používá {coefficientSetLabel(coefficientOverride.currentSet)}, ale vyplacené částky ve výpisu jednoznačně odpovídají sadě {coefficientSetLabel(coefficientOverride.coefficientSet)}. Při zápisu výpisu uložím ke smlouvě výjimku a přepočítám položky podle výpisu.
                </div>
              </div>
            </div>
          )}

          <AmountComparisonPanel
            comparisons={amountComparisonsForReview}
            baseComparisons={
              autoPremiumChange || !autoPremiumBaseComparison ? [] : [autoPremiumBaseComparison]
            }
          />

          {missingB36Warning && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
              <span>Zrychlený režim: {missingB36Warning.detail}</span>
            </div>
          )}

          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Produkt</th>
                  <th className="px-3 py-2">Kód</th>
                  <th className="px-3 py-2">Význam</th>
                  <th className="px-3 py-2 text-right">Základna</th>
                  <th className="px-3 py-2 text-right">Procento</th>
                  <th className="px-3 py-2 text-right">Provize</th>
                  <th className="px-3 py-2 text-right">Rez. fond</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {contract.rows.map((row) => {
                  const classification = classifyGeneralCommissionCode(row.product, row.type);
                  const rowProductMeta = resolveStatementProduct(row.product);
                  return (
                    <tr key={`${row.id}-${row.type}-${row.commission}`}>
                      <td className="px-3 py-2 text-slate-700">
                        <div className="font-semibold text-slate-900">{rowProductMeta.label}</div>
                        <div className="text-xs text-slate-500">{rowProductMeta.rawCode}</div>
                      </td>
                      <td className="px-3 py-2 font-semibold text-slate-900">{row.type || "—"}</td>
                      <td className="px-3 py-2 text-slate-700">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${generalCommissionKindClass(classification.kind)}`}>
                          {classification.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-slate-700">
                        <div>{formatMoney(row.base)}</div>
                        {rowProductMeta.usesAnnualPremiumBase && row.base > 0 && (
                          <div className="text-xs text-slate-500">
                            měs. {formatWholeMoney(row.base / 12)} Kč
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-700">{row.percent || "—"}</td>
                      <td className="px-3 py-2 text-right font-semibold text-slate-950">
                        {formatMoney(row.commission)}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-700">
                        {formatMoney(row.reserveFund)}
                      </td>
                    </tr>
                  );
                })}
                {contract.b36Payments.map((payment, index) => {
                  const isOffsetPair = pairedB36PaymentIndexes.has(index);
                  return (
                    <tr key={`${payment.contractNumber}-b36-${index}`} className="bg-emerald-50/60">
                      <td className="px-3 py-2 text-slate-700">
                        <div className="font-semibold text-slate-900">Ostatní platby</div>
                        <div className="text-xs text-slate-500">bez produktového kódu</div>
                      </td>
                      <td className="px-3 py-2 font-semibold text-slate-900">B36</td>
                      <td className="px-3 py-2 text-slate-700">
                        <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-800">
                          50% z B36 z ostatních plateb
                        </span>
                        {isOffsetPair && (
                          <div className="mt-1 text-xs font-medium text-emerald-800">
                            Vyplaceno a odečteno ve stejném výpisu
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-700">—</td>
                      <td className="px-3 py-2 text-right text-slate-700">—</td>
                      <td className="px-3 py-2 text-right font-semibold text-slate-950">
                        {formatMoney(payment.amount)}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-700">—</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </article>
  );
}

function LifeSplitProductsSection({
  contracts,
  matchesByContractNumber,
  statementId,
  statementPeriod,
  statementKey,
  correctionContext,
  markingControls,
  onConvertNeonRefresh,
}: {
  contracts: LifeSplitContractPreview[];
  matchesByContractNumber: ContractMatchesByNumber;
  statementId?: string | null;
  statementPeriod?: string | null;
  statementKey: string;
  correctionContext?: StatementCorrectionContext;
  markingControls?: MarkingControls;
  onConvertNeonRefresh?: (
    target: ManualNeonRefreshConversionTarget
  ) => Promise<ManualNeonRefreshConversionResponse>;
}) {
  const [expanded, setExpanded] = useState(false);
  if (contracts.length === 0) return null;
  const totalPayout = contracts.reduce((sum, contract) => sum + lifeSplitContractTotal(contract), 0);
  const uncertaintyCount = contracts.reduce(
    (sum, contract) =>
      sum +
      lifeSplitContractUncertaintyCount(
        contract,
        matchesByContractNumber,
        statementPeriod,
        statementKey,
        correctionContext
      ),
    0
  );

  return (
    <div className="relative overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50/35 shadow-[0_14px_32px_rgba(15,23,42,0.04)]">
      <span className="pointer-events-none absolute inset-y-0 left-0 w-3 bg-emerald-500" />
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full flex-col gap-2 py-4 pl-7 pr-4 text-left sm:flex-row sm:items-center sm:justify-between"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700">
            <HeartPulse className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
          </span>
          <h3 className="text-lg font-bold text-slate-950">Životní pojištění</h3>
        </div>
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
          <span>{contracts.length} smluv · {formatMoney(totalPayout)} Kč</span>
          {uncertaintyCount > 0 && (
            <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800">
              {uncertaintyCountLabel(uncertaintyCount)}
            </span>
          )}
          <ChevronDown
            className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            strokeWidth={2.2}
            aria-hidden="true"
          />
        </span>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-emerald-100 py-4 pl-7 pr-4">
          {contracts.map((contract) => (
            <LifeSplitContractCard
              key={`${contract.productCode}-${contract.contractNumber}`}
              contract={contract}
              match={contractMatchForNumber(
                matchesByContractNumber,
                contract.contractNumber,
                lifeSplitContractMatchScope(contract)
              )}
              statementId={statementId}
              statementPeriod={statementPeriod}
              statementKey={statementKey}
              correctionContext={correctionContext}
              markingControls={markingControls}
              onConvertNeonRefresh={onConvertNeonRefresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function UnpairedContractsSection({
  lifeContracts,
  otherContracts,
  matchesByContractNumber,
  markingControls,
}: {
  lifeContracts: LifeSplitContractPreview[];
  otherContracts: OtherProductContractPreview[];
  matchesByContractNumber: ContractMatchesByNumber;
  markingControls?: MarkingControls;
}) {
  const [expanded, setExpanded] = useState(false);
  const [troyOunceExpanded, setTroyOunceExpanded] = useState(false);
  const [investmentExpanded, setInvestmentExpanded] = useState(false);
  const totalContracts = lifeContracts.length + otherContracts.length;
  if (totalContracts === 0) return null;

  const troyOunceContracts = otherContracts.filter(contractHasTroyOunceProduct);
  const investmentContracts = otherContracts.filter(
    (contract) =>
      !contractHasTroyOunceProduct(contract) && contractHasInvestmentSectionProduct(contract)
  );
  const remainingOtherContracts = otherContracts.filter(
    (contract) =>
      !contractHasTroyOunceProduct(contract) && !contractHasInvestmentSectionProduct(contract)
  );
  const troyOunceCommission = troyOunceContracts.reduce(
    (sum, contract) => sum + otherProductContractTotal(contract),
    0
  );
  const investmentCommission = investmentContracts.reduce(
    (sum, contract) => sum + otherProductContractTotal(contract),
    0
  );

  const totalCommission =
    lifeContracts.reduce((sum, contract) => sum + lifeSplitContractTotal(contract), 0) +
    otherContracts.reduce((sum, contract) => sum + otherProductContractTotal(contract), 0);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/70 shadow-[0_14px_32px_rgba(120,53,15,0.05)]">
      <span className="pointer-events-none absolute inset-y-0 left-0 w-3 bg-amber-500" />
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full flex-col gap-2 py-4 pl-7 pr-4 text-left sm:flex-row sm:items-center sm:justify-between"
        aria-expanded={expanded}
      >
        <div className="flex items-start gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-200 bg-white text-amber-700">
            <AlertTriangle className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-lg font-bold text-amber-950">Nespárované smlouvy</h3>
            <p className="text-sm text-amber-900">
              Smlouvy bez jednoznačné shody v systému. Před zápisem budou vyžadovat ruční kontrolu.
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-amber-950">
          <span>{totalContracts} smluv · {formatMoney(totalCommission)} Kč</span>
          <span className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-xs font-semibold text-amber-900">
            {uncertaintyCountLabel(totalContracts)}
          </span>
          <ChevronDown
            className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            strokeWidth={2.2}
            aria-hidden="true"
          />
        </span>
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-amber-200 py-4 pl-7 pr-4">
          {lifeContracts.map((contract) => (
            <LifeSplitContractCard
              key={`unpaired-life-${contract.productCode}-${contract.contractNumber}`}
              contract={contract}
              match={contractMatchForNumber(
                matchesByContractNumber,
                contract.contractNumber,
                lifeSplitContractMatchScope(contract)
              )}
              markingControls={markingControls}
            />
          ))}
          {troyOunceContracts.length > 0 && (
            <div className="rounded-2xl border border-violet-200 bg-violet-50/60">
              <button
                type="button"
                onClick={() => setTroyOunceExpanded((value) => !value)}
                className="flex w-full flex-col gap-2 px-4 py-3 text-left sm:flex-row sm:items-center sm:justify-between"
                aria-expanded={troyOunceExpanded}
              >
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-violet-200 bg-white text-violet-700">
                    <WalletCards className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
                  </span>
                  <div>
                    <h4 className="text-base font-bold text-violet-950">Troyská unce</h4>
                    <p className="text-sm text-violet-900">
                      Investiční položky z kódů TU_* jsou oddělené od ostatních nespárovaných smluv.
                    </p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-violet-950">
                  <span>
                    {troyOunceContracts.length} smluv · {formatMoney(troyOunceCommission)} Kč
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${
                      troyOunceExpanded ? "rotate-180" : ""
                    }`}
                    strokeWidth={2.2}
                    aria-hidden="true"
                  />
                </span>
              </button>
              {troyOunceExpanded && (
                <div className="space-y-3 border-t border-violet-200 px-4 py-4">
                  {troyOunceContracts.map((contract) => (
                    <OtherProductContractCard
                      key={`unpaired-troy-${contract.key}`}
                      contract={contract}
                      match={contractMatchForNumber(
                        matchesByContractNumber,
                        contract.contractNumber,
                        otherProductContractMatchScope(contract)
                      )}
                      markingControls={markingControls}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
          {investmentContracts.length > 0 && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60">
              <button
                type="button"
                onClick={() => setInvestmentExpanded((value) => !value)}
                className="flex w-full flex-col gap-2 px-4 py-3 text-left sm:flex-row sm:items-center sm:justify-between"
                aria-expanded={investmentExpanded}
              >
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-200 bg-white text-emerald-700">
                    <HandCoins className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
                  </span>
                  <div>
                    <h4 className="text-base font-bold text-emerald-950">Investice</h4>
                    <p className="text-sm text-emerald-900">
                      Nespárované smlouvy Investika, Efektika, Monetika a Conseq jsou oddělené od ostatních smluv.
                    </p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-950">
                  <span>
                    {investmentContracts.length} smluv · {formatMoney(investmentCommission)} Kč
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${
                      investmentExpanded ? "rotate-180" : ""
                    }`}
                    strokeWidth={2.2}
                    aria-hidden="true"
                  />
                </span>
              </button>
              {investmentExpanded && (
                <div className="space-y-3 border-t border-emerald-200 px-4 py-4">
                  {investmentContracts.map((contract) => (
                    <OtherProductContractCard
                      key={`unpaired-investment-${contract.key}`}
                      contract={contract}
                      match={contractMatchForNumber(
                        matchesByContractNumber,
                        contract.contractNumber,
                        otherProductContractMatchScope(contract)
                      )}
                      markingControls={markingControls}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
          {remainingOtherContracts.map((contract) => (
            <OtherProductContractCard
              key={`unpaired-other-${contract.key}`}
              contract={contract}
              match={contractMatchForNumber(
                matchesByContractNumber,
                contract.contractNumber,
                otherProductContractMatchScope(contract)
              )}
              markingControls={markingControls}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ManagerCommissionRowCard({
  advisor,
  advisorRowScope,
  group,
  matchesByContractNumber,
  currentUserEmail,
  managerAmountComparisonsByRowKey,
  suggestedStornoDate,
  markingControls,
  onRequestSystemStorno,
}: {
  advisor: ManagerCommissionAdvisor;
  advisorRowScope: string;
  group: ManagerCommissionContractGroup;
  matchesByContractNumber: ContractMatchesByNumber;
  currentUserEmail?: string | null;
  managerAmountComparisonsByRowKey: Map<string, CommissionAmountComparison>;
  suggestedStornoDate: Date | null;
  markingControls?: MarkingControls;
  onRequestSystemStorno?: (target: StornoStatementActionTarget) => void;
}) {
  const row = group.rows[0]?.row;
  if (!row) return null;
  const rowKey = group.key;
  const rowItems = group.rows.map((item) => item.row);
  const displayContractNumber = group.contractNumber || row.contractNumber || "—";
  const groupedItemsLabel = czechCountLabel(
    group.rows.length,
    "provizní položka",
    "provizní položky",
    "provizních položek"
  );
  const product = resolveStatementProduct(row.product);
  const products = uniqueProductMetasForRows(rowItems);
  const productLabel =
    products.length === 1
      ? `${products[0].label} · ${products[0].rawCode}`
      : `${products.length} produktů`;
  const codeLabels = [...new Set(rowItems.map((item) => item.type).filter(Boolean))];
  const hasStorno = rowItems.some((item) => item.isStorno);
  const uniqueBases = [...new Set(rowItems.map((item) => formatMoney(item.base)))];
  const uniqueCareers = [...new Set(rowItems.map((item) => item.career).filter(Boolean))];
  const rowComparisons = group.rows
    .map((item) =>
      managerAmountComparisonsByRowKey.get(managerCommissionRowKey(advisorRowScope, item.row))
    )
    .filter((comparison): comparison is CommissionAmountComparison => Boolean(comparison));
  const rowComparisonIssueCount = rowComparisons.filter(
    (comparison) => comparison.status !== "ok"
  ).length;
  const classification = classifyGeneralCommissionCode(row.product, row.type);
  const match = contractMatchForNumber(matchesByContractNumber, row.contractNumber, "team");
  const matchedContract = matchedSystemContract(match);
  const extranetUrl = firstSjednatelExtranetUrl(rowItems, matchedContract);
  const stornoActionTarget: StornoStatementActionTarget | null =
    hasStorno && matchedContract
      ? {
          contract: matchedContract,
          contractNumber: row.contractNumber || matchedContract.contractNumber || "",
          client: row.client || matchedContract.clientName || "—",
          product: productLabel,
          suggestedDate: suggestedStornoDate,
        }
      : null;
  const matchNotice = managerCommissionMatchNotice(match);
  const managerCareerCheck = matchedContract
    ? statementCareerMismatch(
        rowItems,
        managerOverrideForViewer(matchedContract, currentUserEmail)?.position
      )
    : null;
  const hasManagerCareerIssue = Boolean(
    managerCareerCheck &&
      managerCareerCheck.careers.length > 0 &&
      (!managerCareerCheck.systemPosition || managerCareerCheck.mismatched)
  );
  const markedItem: MarkedDiscrepancyItem | null = markingControls
    ? {
        key: markedDiscrepancyKey({
          statementKey: markingControls.statementKey,
          scope: "team",
          category: "Provize manažera",
          contractNumber: row.contractNumber,
          fallback: rowKey,
        }),
        statementKey: markingControls.statementKey,
        statementLabel: markingControls.statementLabel,
        category: "Provize manažera",
        scope: "team",
        contractNumber: row.contractNumber,
        client: row.client || "—",
        product: productLabel,
        title: "Ručně označená manažerská provize k opravě",
        amount: group.commissionTotal,
        details: [
          `Poradce: ${advisor.advisorName || advisor.advisorNumber}`,
          `Uzavřeno: ${row.signedAt || "—"}`,
          hasStorno ? "Storno" : "Provize",
          `${czechCountLabel(group.rows.length, "řádek", "řádky", "řádků")}: ${
            codeLabels.join(", ") || "—"
          }`,
        ],
      }
    : null;

  return (
    <article
      className={`rounded-2xl border px-4 py-4 ${
        hasStorno ? "border-rose-200 bg-rose-50/70" : "border-slate-200 bg-slate-50"
      }`}
    >
      {markedItem && (
        <div className="mb-3 flex justify-end">
          <MarkedDiscrepancyToggle item={markedItem} markingControls={markingControls} />
        </div>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h5 className="text-base font-bold text-slate-950">
              Smlouva {displayContractNumber}
            </h5>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-2.5 text-xs font-semibold text-slate-700">
              <StatementProductLogo product={product} size="xs" />
              {productLabel}
            </span>
            {codeLabels.map((code) => (
              <span
                key={code}
                className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${generalCommissionKindClass(
                  classifyGeneralCommissionCode(row.product, code).kind
                )}`}
              >
                {code}
              </span>
            ))}
            {group.rows.length > 1 && (
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                {groupedItemsLabel}
              </span>
            )}
            {hasStorno && (
              <span className="rounded-full border border-rose-200 bg-white px-2.5 py-1 text-xs font-semibold text-rose-800">
                Storno
              </span>
            )}
            {hasStorno && <StornoSystemStatusBadge contract={matchedContract} />}
            <SystemMatchBadge match={match} scope="team" />
            {rowComparisons.length > 0 && (
              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                  rowComparisonIssueCount === 0
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-rose-200 bg-rose-50 text-rose-800"
                }`}
              >
                {rowComparisonIssueCount === 0
                  ? "Meziprovize sedí"
                  : `${rowComparisonIssueCount} rozdílů meziprovize`}
              </span>
            )}
            {hasManagerCareerIssue && (
              <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800">
                {statementCareerBadgeLabel(managerCareerCheck?.careers)}
              </span>
            )}
          </div>

          <div className="mt-1 text-[15px] font-semibold text-slate-800">
            {row.client || "Klient nezjištěn"}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <span>Uzavřeno: {row.signedAt || "—"}</span>
            <span>
              Typ:{" "}
              {group.rows.length > 1 ? groupedItemsLabel : classification.label}
            </span>
            {row.role && <span>Role: {row.role}</span>}
            <span>Kariéra ve výpisu: {row.career || "—"}</span>
          </div>
          {matchedContract && (
            <div className="mt-1 text-xs font-medium text-emerald-800">
              Systém: {matchedContract.clientName || "klient bez názvu"} ·{" "}
              {matchedContract.adviserName || matchedContract.adviserEmail || "poradce nezjištěn"}
            </div>
          )}
          {(matchedContract || row.detailUrl || extranetUrl) && (
            <div className="mt-3 flex flex-wrap gap-2">
              <BohemkaContractDetailLink contract={matchedContract} compact />
              <ContractDetailLink href={row.detailUrl} compact />
              <SjednatelExtranetLink href={extranetUrl} compact />
            </div>
          )}
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-2 text-right">
          <div className="rounded-xl bg-slate-950 px-3 py-2 text-white ring-1 ring-slate-800">
            <div className="text-[11px] font-black uppercase tracking-wide !text-white opacity-100">
              Provize
            </div>
            <div className="mt-1 whitespace-nowrap text-lg font-bold text-emerald-200">
              {formatMoney(group.commissionTotal)} Kč
            </div>
          </div>
          <div className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-rose-950">
            <div className="text-[11px] font-bold uppercase tracking-wide text-rose-700">
              Rez. fond
            </div>
            <div className="mt-1 whitespace-nowrap text-lg font-bold text-rose-900">
              {formatMoney(group.reserveFundTotal)} Kč
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Základna
          </div>
          <div className="mt-1 text-sm font-bold text-slate-950">
            {uniqueBases.length === 1 ? `${uniqueBases[0]} Kč` : `${uniqueBases.length} hodnot`}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Kódy
          </div>
          <div className="mt-1 text-sm font-bold text-slate-950">
            {codeLabels.join(" · ") || "—"}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Výpisový stupeň
          </div>
          <div className="mt-1 text-sm font-bold text-slate-950">
            {uniqueCareers.length === 1
              ? uniqueCareers[0]
              : uniqueCareers.length > 1
                ? `${uniqueCareers.length} stupně`
                : "—"}
          </div>
        </div>
      </div>

      {group.rows.length > 1 && (
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <div className="grid min-w-[620px] grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] gap-3 bg-slate-50 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            <span>Položka</span>
            <span className="text-right">Základna</span>
            <span className="text-right">Procento</span>
            <span className="text-right">Provize</span>
            <span className="text-right">Rez. fond</span>
          </div>
          <div className="min-w-[620px] divide-y divide-slate-100">
            {group.rows.map(({ row: item }) => {
              const itemClassification = classifyGeneralCommissionCode(item.product, item.type);

              return (
                <div
                  key={`${item.id}-${item.type}-${item.commission}-${item.reserveFund}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] items-center gap-3 px-3 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 font-semibold ${generalCommissionKindClass(itemClassification.kind)}`}
                    >
                      {item.type || "—"}
                    </span>
                    <span className="ml-2 font-medium text-slate-500">
                      {itemClassification.label}
                    </span>
                  </div>
                  <span className="whitespace-nowrap text-right font-medium text-slate-600">
                    {formatMoney(item.base)} Kč
                  </span>
                  <span className="whitespace-nowrap text-right font-medium text-slate-600">
                    {item.percent || "—"}
                  </span>
                  <span className="whitespace-nowrap text-right font-bold text-slate-950">
                    {formatMoney(item.commission)} Kč
                  </span>
                  <span className="whitespace-nowrap text-right font-medium text-rose-900">
                    {formatMoney(item.reserveFund)} Kč
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {matchNotice && (
        <div
          className={`mt-3 flex items-start gap-2 rounded-xl border px-3 py-2 text-xs ${
            matchNotice.tone === "rose"
              ? "border-rose-200 bg-rose-50 text-rose-900"
              : "border-amber-200 bg-amber-50 text-amber-950"
          }`}
        >
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0"
            strokeWidth={2.2}
            aria-hidden="true"
          />
          <div>
            <div className="font-bold">{matchNotice.title}</div>
            {matchNotice.lines.map((line) => (
              <div key={line} className="mt-0.5 font-medium">
                {line}
              </div>
            ))}
          </div>
        </div>
      )}

      {rowComparisonIssueCount > 0 && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0"
            strokeWidth={2.2}
            aria-hidden="true"
          />
          <div>
            <div className="font-bold">
              {rowComparisonIssueCount === 1
                ? "Meziprovize nesedí se systémem"
                : `${rowComparisonIssueCount} položky meziprovize nesedí se systémem`}
            </div>
            {rowComparisons
              .filter((comparison) => comparison.status !== "ok")
              .map((comparison) => (
                <div key={comparison.key} className="mt-1">
                  <div className="font-medium">
                    {comparison.label}: výpis {formatMoney(comparison.statementAmount)} Kč ·
                    systém {formatMoney(comparison.expectedAmount)} Kč · rozdíl{" "}
                    {comparison.difference > 0 ? "+" : ""}
                    {formatMoney(comparison.difference)} Kč
                  </div>
                  {comparison.reasonTitle && (
                    <div className="mt-0.5 font-bold">{comparison.reasonTitle}</div>
                  )}
                  {comparison.reasonLines?.map((line) => (
                    <div key={`${comparison.key}-${line}`} className="mt-0.5 font-medium">
                      {line}
                    </div>
                  ))}
                </div>
              ))}
          </div>
        </div>
      )}

      {hasStorno && (
        <StornoSystemActionPanel
          target={stornoActionTarget}
          onRequestStorno={onRequestSystemStorno}
        />
      )}
    </article>
  );
}

function ManagerCommissionsSection({
  advisors = [],
  matchesByContractNumber,
  currentUserEmail,
  suggestedStornoDate,
  markingControls,
  onRequestSystemStorno,
}: {
  advisors?: ManagerCommissionAdvisor[];
  matchesByContractNumber: ContractMatchesByNumber;
  currentUserEmail?: string | null;
  suggestedStornoDate: Date | null;
  markingControls?: MarkingControls;
  onRequestSystemStorno?: (target: StornoStatementActionTarget) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [expandedAdvisors, setExpandedAdvisors] = useState<Record<string, boolean>>({});
  const [expandedAdvisorRowSections, setExpandedAdvisorRowSections] = useState<
    Record<string, boolean>
  >({});
  if (advisors.length === 0) return null;

  const totalCommission = advisors.reduce(
    (sum, advisor) => sum + advisor.commission + advisor.stornos + advisor.deductions,
    0
  );
  const totalReserveFund = advisors.reduce((sum, advisor) => sum + advisor.reserveFund, 0);
  const uniqueContractNumberMap = new Map<string, string>();
  for (const row of advisors.flatMap((advisor) => advisor.rows)) {
    const key = normalizeContractNumberForMatch(row.contractNumber);
    if (key && !uniqueContractNumberMap.has(key)) {
      uniqueContractNumberMap.set(key, row.contractNumber);
    }
  }
  const uniqueContractNumbers = [...uniqueContractNumberMap.values()];
  const unpairedContractCount = uniqueContractNumbers.filter((contractNumber) =>
    Boolean(
      managerCommissionMatchNotice(
        contractMatchForNumber(matchesByContractNumber, contractNumber, "team")
      )
    )
  ).length;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-indigo-200 bg-indigo-50/70 shadow-[0_14px_32px_rgba(67,56,202,0.05)]">
      <span className="pointer-events-none absolute inset-y-0 left-0 w-3 bg-indigo-500" />
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full flex-col gap-2 py-4 pl-7 pr-4 text-left sm:flex-row sm:items-center sm:justify-between"
        aria-expanded={expanded}
      >
        <div className="flex items-start gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-indigo-200 bg-white text-indigo-700">
            <UsersRound className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-lg font-bold text-indigo-950">Provize manažera</h3>
            <p className="text-sm text-indigo-900">
              Meziprovize ze smluv podřízených poradců. Nejde o vlastní sjednané smlouvy.
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-950">
          <span>{uniqueContractNumbers.length} smluv · {formatMoney(totalCommission)} Kč</span>
          {unpairedContractCount > 0 && (
            <span className="rounded-full border border-rose-200 bg-white px-2.5 py-1 text-xs font-semibold text-rose-800">
              {uncertaintyCountLabel(unpairedContractCount)}
            </span>
          )}
          <ChevronDown
            className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            strokeWidth={2.2}
            aria-hidden="true"
          />
        </span>
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-indigo-200 py-4 pl-7 pr-4">
          <div className="grid gap-2 md:grid-cols-2">
            <div className="rounded-xl border border-indigo-200 bg-white px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Manažerská provize
              </div>
              <div className="mt-1 text-lg font-bold text-slate-950">
                {formatMoney(totalCommission)} Kč
              </div>
            </div>
            <div className="rounded-xl border border-indigo-200 bg-white px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Rez. fond
              </div>
              <div className="mt-1 text-lg font-bold text-slate-950">
                {formatMoney(totalReserveFund)} Kč
              </div>
            </div>
          </div>

          {advisors.map((advisor, advisorIndex) => {
            const advisorKey =
              advisor.advisorNumber || `${advisor.advisorName || "poradce"}-${advisorIndex}`;
            const advisorRowScope = advisor.advisorNumber || advisorKey;
            const advisorTotal = advisor.commission + advisor.stornos + advisor.deductions;
            const sortedRows = sortManagerCommissionRows(
              advisor.rows,
              matchesByContractNumber
            );
            const advisorContractNumberMap = new Map<string, string>();
            for (const row of sortedRows) {
              const key = normalizeContractNumberForMatch(row.contractNumber);
              if (key && !advisorContractNumberMap.has(key)) {
                advisorContractNumberMap.set(key, row.contractNumber);
              }
            }
            const advisorContractNumbers = [...advisorContractNumberMap.values()];
            const advisorMatchedContractCount = advisorContractNumbers.filter((contractNumber) => {
              const match = contractMatchForNumber(matchesByContractNumber, contractNumber, "team");
              return Boolean(match?.status === "matched" && matchedSystemContract(match));
            }).length;
            const advisorUnpairedContractCount = advisorContractNumbers.filter((contractNumber) =>
              Boolean(
                managerCommissionMatchNotice(
                  contractMatchForNumber(matchesByContractNumber, contractNumber, "team")
                )
              )
            ).length;
            const managerAmountComparisonsByRowKey = new Map<string, CommissionAmountComparison>();
            for (const row of sortedRows) {
              const match = contractMatchForNumber(
                matchesByContractNumber,
                row.contractNumber,
                "team"
              );
              const matchedContract = matchedSystemContract(match);
              const comparison = buildManagerCommissionAmountComparison(
                row,
                matchedContract,
                currentUserEmail
              );
              if (!comparison) continue;
              managerAmountComparisonsByRowKey.set(
                managerCommissionRowKey(advisorRowScope, row),
                comparison
              );
            }
            const advisorManagerAmountComparisons = [
              ...new Map(
                [...managerAmountComparisonsByRowKey.values()].map((comparison) => [
                  comparison.key,
                  comparison,
                ])
              ).values(),
            ];
            const advisorManagerAmountIssueCount = advisorManagerAmountComparisons.filter(
              (comparison) => comparison.status !== "ok"
            ).length;
            const advisorRowSections = buildManagerCommissionRowSections({
              rows: sortedRows,
              matchesByContractNumber,
              advisorRowScope,
              comparisonsByRowKey: managerAmountComparisonsByRowKey,
            });
            const advisorExpanded = Boolean(expandedAdvisors[advisorKey]);

            return (
              <article
                key={advisorKey}
                className="overflow-hidden rounded-2xl border border-indigo-200 bg-white"
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpandedAdvisors((previous) => ({
                      ...previous,
                      [advisorKey]: !previous[advisorKey],
                    }))
                  }
                  className="flex w-full flex-col gap-3 px-4 py-4 text-left transition hover:bg-indigo-50/40 lg:flex-row lg:items-start lg:justify-between"
                  aria-expanded={advisorExpanded}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-base font-bold text-slate-950">
                        {advisor.advisorName || "Poradce bez jména"}
                      </h4>
                      <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-800">
                        {advisor.advisorNumber}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {advisor.position || "Pozice nezjištěna"}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span>{advisor.contractCount} smluv dle výpisu</span>
                      <span>{advisor.rows.length} detailních řádků</span>
                      <span>
                        Spárováno {advisorMatchedContractCount}/{advisorContractNumbers.length}
                      </span>
                      <span>Storna {formatMoney(advisor.stornos)} Kč</span>
                      <span>Odpočty {formatMoney(advisor.deductions)} Kč</span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2 self-start lg:self-auto">
                    {advisorManagerAmountComparisons.length > 0 && (
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                          advisorManagerAmountIssueCount === 0
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : "border-rose-200 bg-rose-50 text-rose-800"
                        }`}
                      >
                        {advisorManagerAmountIssueCount === 0
                          ? "Meziprovize sedí"
                          : `${advisorManagerAmountIssueCount} rozdílů meziprovize`}
                      </span>
                    )}
                    {advisorUnpairedContractCount > 0 && (
                      <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800">
                        {advisorUnpairedContractCount} k ruční kontrole
                      </span>
                    )}
                    <div className="rounded-xl bg-slate-950 px-3 py-2 text-right text-white ring-1 ring-slate-800">
                      <div className="text-[11px] font-black uppercase tracking-wide !text-white opacity-100">
                        Celkem
                      </div>
                      <div className="mt-1 whitespace-nowrap text-lg font-bold text-emerald-200">
                        {formatMoney(advisorTotal)} Kč
                      </div>
                    </div>
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-200 bg-white text-indigo-700">
                      <ChevronDown
                        className={`h-5 w-5 transition-transform ${advisorExpanded ? "rotate-180" : ""}`}
                        strokeWidth={2.2}
                        aria-hidden="true"
                      />
                    </span>
                  </div>
                </button>

                {advisorExpanded && advisorRowSections.length > 0 && (
                  <div className="space-y-3 border-t border-slate-200 bg-slate-50/70 px-4 py-4">
                    {advisorRowSections.map((section) => {
                      const sectionToggleKey = `${advisorKey}-${section.key}`;
                      const sectionExpanded = Boolean(
                        expandedAdvisorRowSections[sectionToggleKey]
                      );
                      const SectionIcon = managerCommissionRowSectionIcon(section.key);

                      return (
                        <div
                          key={`manager-section-${advisorKey}-${section.key}`}
                          className={`overflow-hidden rounded-2xl border ${section.className}`}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedAdvisorRowSections((previous) => ({
                                ...previous,
                                [sectionToggleKey]: !previous[sectionToggleKey],
                              }))
                            }
                            className="flex w-full flex-col gap-2 px-4 py-3 text-left sm:flex-row sm:items-center sm:justify-between"
                            aria-expanded={sectionExpanded}
                          >
                            <div className="flex min-w-0 items-start gap-3">
                              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/70 bg-white/85">
                                <SectionIcon
                                  className="h-5 w-5"
                                  strokeWidth={2.2}
                                  aria-hidden="true"
                                />
                              </span>
                              <div className="min-w-0">
                                <div className="text-base font-bold">{section.label}</div>
                                <div className="text-sm font-medium opacity-80">
                                  {section.description}
                                </div>
                              </div>
                            </div>
                            <span className="inline-flex flex-wrap items-center justify-end gap-2 text-sm font-semibold">
                              <span>{section.contractCount} smluv</span>
                              <span>{section.rows.length} řádků</span>
                              <span>{formatMoney(section.commissionTotal)} Kč</span>
                              {section.differenceCount > 0 && (
                                <span className="rounded-full border border-rose-200 bg-white px-2.5 py-1 text-xs text-rose-800">
                                  {section.differenceCount} rozdílů
                                </span>
                              )}
                              {section.manualReviewCount > 0 && (
                                <span className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-xs text-amber-900">
                                  {section.manualReviewCount} k ruční kontrole
                                </span>
                              )}
                              <ChevronDown
                                className={`h-4 w-4 transition-transform ${
                                  sectionExpanded ? "rotate-180" : ""
                                }`}
                                strokeWidth={2.2}
                                aria-hidden="true"
                              />
                            </span>
                          </button>
                          {sectionExpanded && (
                            <div className="space-y-3 border-t border-white/70 bg-white px-3 py-3">
                              {section.groups.map((group) => (
                                <ManagerCommissionRowCard
                                  key={`${advisorKey}-${section.key}-${group.key}`}
                                  advisor={advisor}
                                  advisorRowScope={advisorRowScope}
                                  group={group}
                                  matchesByContractNumber={matchesByContractNumber}
                                  currentUserEmail={currentUserEmail}
                                  managerAmountComparisonsByRowKey={
                                    managerAmountComparisonsByRowKey
                                  }
                                  suggestedStornoDate={suggestedStornoDate}
                                  markingControls={markingControls}
                                  onRequestSystemStorno={onRequestSystemStorno}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StornoContractsSection({
  statement,
  matchesByContractNumber,
  markingControls,
  onRequestSystemStorno,
}: {
  statement: ParsedStatement;
  matchesByContractNumber: ContractMatchesByNumber;
  markingControls?: MarkingControls;
  onRequestSystemStorno?: (target: StornoStatementActionTarget) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const otherPaymentStornos = statement.otherPayments.filter((payment) => payment.isStorno);
  const stornoStatementGroups = groupStornoRowsByContract(statement.stornoRows);
  const combinedStornoGroups = groupStornoItemsByContract(
    statement.stornoRows,
    otherPaymentStornos
  );
  const itemCount = statement.stornoRows.length + otherPaymentStornos.length;
  if (itemCount === 0) return null;

  const statusRuleByCode = new Map(
    statement.contractStatusRules.map((rule) => [rule.code.trim().toUpperCase(), rule])
  );
  const contractNumbers = new Set<string>();
  for (const row of statement.stornoRows) {
    const key = normalizeContractNumberForMatch(row.contractNumber);
    if (key) contractNumbers.add(key);
  }
  for (const payment of otherPaymentStornos) {
    const key = normalizeContractNumberForMatch(payment.contractNumber);
    if (key) contractNumbers.add(key);
  }

  const totalStorno =
    statement.stornoRows.reduce((sum, row) => sum + row.commission, 0) +
    otherPaymentStornos.reduce((sum, payment) => sum + payment.amount, 0);
  const statementStornoTotal = statement.stornoRows.reduce(
    (sum, row) => sum + row.commission,
    0
  );
  const otherPaymentStornoTotal = otherPaymentStornos.reduce(
    (sum, payment) => sum + payment.amount,
    0
  );
  const stornoUncertaintyCount = [...contractNumbers].filter((contractNumber) =>
    stornoSystemUncertainty(contractMatchForNumber(matchesByContractNumber, contractNumber))
  ).length;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-rose-200 bg-rose-50/70 shadow-[0_14px_32px_rgba(159,18,57,0.05)]">
      <span className="pointer-events-none absolute inset-y-0 left-0 w-3 bg-rose-500" />
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full flex-col gap-2 py-4 pl-7 pr-4 text-left sm:flex-row sm:items-center sm:justify-between"
        aria-expanded={expanded}
      >
        <div className="flex items-start gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-rose-200 bg-white text-rose-700">
            <AlertTriangle className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-lg font-bold text-rose-950">Stornované smlouvy</h3>
            <p className="text-sm text-rose-900">
              Storna z výpisu a vratky provizí z ostatních plateb.
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-rose-950">
          <span>{combinedStornoGroups.length} smluv · {formatMoney(totalStorno)} Kč</span>
          {stornoUncertaintyCount > 0 && (
            <span className="rounded-full border border-rose-200 bg-white px-2.5 py-1 text-xs font-semibold text-rose-800">
              {uncertaintyCountLabel(stornoUncertaintyCount)}
            </span>
          )}
          <ChevronDown
            className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            strokeWidth={2.2}
            aria-hidden="true"
          />
        </span>
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-rose-200 py-4 pl-7 pr-4">
          <div className="grid gap-2 md:grid-cols-3">
            <div className="rounded-xl border border-rose-200 bg-white px-3 py-2">
              <div className="text-[11px] font-bold uppercase tracking-wide text-rose-700">
                Storna z výpisu
              </div>
              <div className="mt-1 text-sm font-semibold text-rose-950">
                {stornoStatementGroups.length} smluv · {statement.stornoRows.length} položek ·{" "}
                {formatMoney(statementStornoTotal)} Kč
              </div>
            </div>
            <div className="rounded-xl border border-rose-200 bg-white px-3 py-2">
              <div className="text-[11px] font-bold uppercase tracking-wide text-rose-700">
                Ostatní platby
              </div>
              <div className="mt-1 text-sm font-semibold text-rose-950">
                {otherPaymentStornos.length} položek · {formatMoney(otherPaymentStornoTotal)} Kč
              </div>
            </div>
            <div className="rounded-xl border border-rose-900 bg-rose-950 px-3 py-2 shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-wide !text-rose-100">
                Celkem
              </div>
              <div className="mt-1 text-sm font-semibold !text-white">
                {combinedStornoGroups.length} smluv · {formatMoney(totalStorno)} Kč
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-bold text-rose-950">Storna podle smlouvy</h4>
            {combinedStornoGroups.map((group, groupIndex) => {
              const row = group.rows[0] ?? null;
              const match = contractMatchForNumber(matchesByContractNumber, group.contractNumber);
              const systemContract = matchedSystemContract(match);
              const extranetUrl = firstSjednatelExtranetUrl(group.rows, systemContract);
              const uniqueProducts = uniqueProductMetasForRows(group.rows);
              const statementProductLabel =
                group.rows.length > 0
                  ? uniqueProducts.length === 1
                    ? `${uniqueProducts[0].label} · ${uniqueProducts[0].rawCode}`
                    : `${uniqueProducts.length} produktů`
                  : null;
              const productLabel =
                statementProductLabel && group.payments.length > 0
                  ? `${statementProductLabel} + ostatní platby`
                  : statementProductLabel ?? "Ostatní platby";
              const displayClient =
                group.client || row?.client || systemContract?.clientName || "Klient nezjištěn";
              const statusRules = [
                ...new Map(
                  group.rows
                    .map((item) => statusRuleByCode.get(item.statusCode))
                    .filter((rule): rule is ContractStatusRule => Boolean(rule))
                    .map((rule) => [rule.code, rule])
                ).values(),
              ];
              const statusCodes = [
                ...new Set(group.rows.map((item) => item.statusCode).filter(Boolean)),
              ];
              const hasB36Payment = group.payments.some((payment) => payment.isB36Half);
              const rowItemsLabel = czechCountLabel(
                group.rows.length,
                "položka storna",
                "položky storna",
                "položek storna"
              );
              const paymentItemsLabel = czechCountLabel(
                group.payments.length,
                "ostatní platba",
                "ostatní platby",
                "ostatních plateb"
              );
              const actionTarget: StornoStatementActionTarget | null = systemContract
                ? {
                    contract: systemContract,
                    contractNumber: group.contractNumber || systemContract.contractNumber || "",
                    client: displayClient,
                    product: productLabel,
                    suggestedDate: suggestedStornoDateForStatement(statement.header),
                  }
                : null;
              const markedItem: MarkedDiscrepancyItem | null = markingControls
                ? {
                    key: markedDiscrepancyKey({
                      statementKey: markingControls.statementKey,
                      scope: "my",
                      category: "Storna",
                      contractNumber: group.contractNumber,
                      fallback: `${group.key}-${groupIndex}`,
                    }),
                    statementKey: markingControls.statementKey,
                    statementLabel: markingControls.statementLabel,
                    category: "Storna",
                    scope: "my",
                    contractNumber: group.contractNumber,
                    client: displayClient,
                    product: productLabel,
                    title: "Ručně označené storno k opravě",
                    amount: group.totalAmount,
                    details: [
                      group.rows.length > 0 ? rowItemsLabel : null,
                      group.payments.length > 0 ? paymentItemsLabel : null,
                      row ? `Uzavřeno: ${row.signedAt || "—"}` : null,
                      group.rows.length > 0
                        ? group.rows
                            .map((item) =>
                              `${item.type || "—"} ${item.statusCode || ""}: ${formatMoney(
                                item.commission
                              )} Kč`
                            )
                            .join(" · ")
                        : null,
                      ...group.payments.map((payment) => payment.description),
                    ].filter((detail): detail is string => Boolean(detail)),
                  }
                : null;

              return (
                <article
                  key={`storno-contract-group-${group.key}-${groupIndex}`}
                  className="rounded-xl border border-rose-200 bg-white px-3 py-3 text-sm"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-slate-950">
                          Smlouva {group.contractNumber || "—"}
                        </span>
                        <BohemkaContractDetailLink contract={systemContract} compact />
                        <ContractDetailLink href={row?.detailUrl} compact />
                        <SjednatelExtranetLink href={extranetUrl} compact />
                        <SystemMatchBadge match={match} />
                        {group.rows.length > 0 && (
                          <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800">
                            Storno z výpisu
                          </span>
                        )}
                        {group.payments.length > 0 && (
                          <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800">
                            Ostatní platby
                          </span>
                        )}
                        <StornoSystemStatusBadge contract={systemContract} />
                        {hasB36Payment && (
                          <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800">
                            B36
                          </span>
                        )}
                      </div>
                      {markedItem && (
                        <div className="mt-2">
                          <MarkedDiscrepancyToggle
                            item={markedItem}
                            markingControls={markingControls}
                          />
                        </div>
                      )}
                      <div className="mt-1 text-[15px] font-semibold text-slate-800">
                        {displayClient}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-slate-600">
                        <span>{productLabel}</span>
                        {row && <span>Uzavřeno: {row.signedAt || "—"}</span>}
                        {group.rows.length > 0 && (
                          <span>Rez. fond celkem: {formatMoney(group.totalReserveFund)} Kč</span>
                        )}
                        {group.rows.length > 0 && <span>{rowItemsLabel}</span>}
                        {group.payments.length > 0 && <span>{paymentItemsLabel}</span>}
                      </div>
                      {statusCodes.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {statusCodes.map((statusCode) => (
                            <span
                              key={statusCode}
                              className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-800"
                            >
                              {statusCode}
                            </span>
                          ))}
                          {statusRules.map((rule) => (
                            <span
                              key={rule.code}
                              className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700"
                            >
                              {rule.label}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-right text-rose-950 lg:min-w-[178px]">
                      <div className="text-[11px] font-bold uppercase tracking-wide text-rose-700">
                        Celkem
                      </div>
                      <div className="mt-1 whitespace-nowrap text-lg font-bold text-rose-900">
                        {formatMoney(group.totalAmount)} Kč
                      </div>
                      {group.rows.length > 0 && group.payments.length > 0 && (
                        <div className="mt-1 text-[11px] font-semibold text-rose-700">
                          Výpis {formatMoney(group.totalCommission)} Kč · platby{" "}
                          {formatMoney(group.totalOtherPayments)} Kč
                        </div>
                      )}
                    </div>
                  </div>

                  {group.rows.length > 0 && (
                    <div className="mt-3 overflow-x-auto rounded-xl border border-rose-100">
                      <div className="grid min-w-[560px] grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-3 bg-rose-50/70 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-rose-700">
                        <span>Storna z výpisu</span>
                        <span className="text-right">Základna</span>
                        <span className="text-right">Provize</span>
                        <span className="text-right">Rez. fond</span>
                      </div>
                      <div className="min-w-[560px] divide-y divide-rose-100 bg-white">
                        {group.rows.map((item) => {
                          const itemProduct = resolveStatementProduct(item.product);
                          const itemClassification = classifyGeneralCommissionCode(
                            item.product,
                            item.type
                          );
                          const showProduct = uniqueProducts.length > 1;

                          return (
                            <div
                              key={`${item.id}-${item.type}-${item.statusCode}-${item.commission}`}
                              className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-3 px-3 py-2 text-xs"
                            >
                              <div className="min-w-0">
                                <span
                                  className={`inline-flex rounded-full border px-2 py-0.5 font-semibold ${generalCommissionKindClass(itemClassification.kind)}`}
                                >
                                  {item.type || "—"}
                                </span>
                                {showProduct && (
                                  <span className="ml-2 font-medium text-slate-500">
                                    {itemProduct.rawCode}
                                  </span>
                                )}
                              </div>
                              <span className="whitespace-nowrap text-right font-medium text-slate-600">
                                {formatMoney(item.base)} Kč
                              </span>
                              <span className="whitespace-nowrap text-right font-bold text-rose-900">
                                {formatMoney(item.commission)} Kč
                              </span>
                              <span className="whitespace-nowrap text-right font-medium text-slate-600">
                                {formatMoney(item.reserveFund)} Kč
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {group.payments.length > 0 && (
                    <div className="mt-3 overflow-x-auto rounded-xl border border-rose-100">
                      <div className="grid min-w-[560px] grid-cols-[minmax(0,1fr)_auto] gap-3 bg-rose-50/70 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-rose-700">
                        <span>Storna z ostatních plateb</span>
                        <span className="text-right">Částka</span>
                      </div>
                      <div className="min-w-[560px] divide-y divide-rose-100 bg-white">
                        {group.payments.map((payment) => (
                          <div
                            key={`payment-${payment.index}-${
                              payment.contractNumber ?? "bez-cisla"
                            }`}
                            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-xs"
                          >
                            <div className="min-w-0 font-medium text-slate-600">
                              {payment.description}
                              {payment.isB36Half && (
                                <span className="ml-2 inline-flex rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-800">
                                  B36
                                </span>
                              )}
                            </div>
                            <span className="whitespace-nowrap text-right font-bold text-rose-900">
                              {formatMoney(payment.amount)} Kč
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <SystemMatchPanel
                    match={match}
                    expectedProductKey={
                      row ? resolveStatementProduct(row.product).productKey : null
                    }
                  />
                  <StornoSystemActionPanel
                    target={actionTarget}
                    onRequestStorno={onRequestSystemStorno}
                  />
                </article>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function OtherProductsSection({
  title = "Ostatní smlouvy",
  description = "Primárně seskupeno podle čísla smlouvy. Produkt je doplňující kontrola z výpisu.",
  showTitle = true,
  showDescription = false,
  contracts,
  matchesByContractNumber,
  statementPeriod,
  statementKey,
  correctionContext,
  markingControls,
}: {
  title?: string;
  description?: string;
  showTitle?: boolean;
  showDescription?: boolean;
  contracts?: OtherProductContractPreview[];
  matchesByContractNumber: ContractMatchesByNumber;
  statementPeriod?: string | null;
  statementKey: string;
  correctionContext?: StatementCorrectionContext;
  markingControls?: MarkingControls;
}) {
  const [expanded, setExpanded] = useState(false);
  const safeContracts = contracts ?? [];
  if (safeContracts.length === 0) return null;

  const totalCommission = safeContracts.reduce(
    (sum, contract) => sum + otherProductContractTotal(contract),
    0
  );
  const uncertaintyCount = safeContracts.reduce(
    (sum, contract) =>
      sum +
      otherProductContractUncertaintyCount(
        contract,
        matchesByContractNumber,
        statementPeriod,
        statementKey,
        correctionContext
      ),
    0
  );
  const isAutoSection = title.toLowerCase().includes("auta");
  const HeaderIcon = isAutoSection ? Car : ReceiptText;
  const headerIconClass = isAutoSection
    ? "border-sky-200 bg-sky-50 text-sky-700"
    : "border-slate-200 bg-slate-50 text-slate-600";
  const sectionContainerClass = isAutoSection
    ? "border-sky-200 bg-sky-50/35 shadow-[0_14px_32px_rgba(2,132,199,0.05)]"
    : "border-slate-200 bg-slate-50/45 shadow-[0_14px_32px_rgba(15,23,42,0.04)]";
  const sectionAccentClass = isAutoSection ? "bg-sky-500" : "bg-slate-500";
  const sectionDividerClass = isAutoSection ? "border-sky-100" : "border-slate-200";

  return (
    <div className={`relative overflow-hidden rounded-2xl border ${sectionContainerClass}`}>
      <span className={`pointer-events-none absolute inset-y-0 left-0 w-3 ${sectionAccentClass}`} />
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className={`flex w-full py-4 pl-7 pr-4 text-left ${
          showTitle
            ? "flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
            : "justify-end"
        }`}
        aria-expanded={expanded}
      >
        {showTitle && (
          <div className="flex items-start gap-3">
            <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${headerIconClass}`}>
              <HeaderIcon className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-lg font-bold text-slate-950">{title}</h3>
              {showDescription && (
                <p className="text-sm text-slate-600">
                  {description}
                </p>
              )}
            </div>
          </div>
        )}
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
          <span>{safeContracts.length} smluv · {formatMoney(totalCommission)} Kč</span>
          {uncertaintyCount > 0 && (
            <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800">
              {uncertaintyCountLabel(uncertaintyCount)}
            </span>
          )}
          <ChevronDown
            className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            strokeWidth={2.2}
            aria-hidden="true"
          />
        </span>
      </button>

      {expanded && (
        <div className={`space-y-4 border-t ${sectionDividerClass} py-4 pl-7 pr-4`}>
          {safeContracts.map((contract) => (
            <OtherProductContractCard
              key={contract.key}
              contract={contract}
              match={contractMatchForNumber(
                matchesByContractNumber,
                contract.contractNumber,
                otherProductContractMatchScope(contract)
              )}
              statementPeriod={statementPeriod}
              statementKey={statementKey}
              correctionContext={correctionContext}
              markingControls={markingControls}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const statementCommissionCodeSet = (statement: ParsedStatement): string[] => {
  const codes = new Set<string>();
  const addCode = (value: string | null | undefined) => {
    const code = normalizedRowText(value);
    if (code) codes.add(code);
  };

  statement.commissionRows.forEach((row) => addCode(row.type));
  statement.deductionRows.forEach((row) => addCode(row.type));
  statement.stornoRows.forEach((row) => addCode(row.type));
  statement.managerCommissions.forEach((advisor) => {
    advisor.rows.forEach((row) => addCode(row.type));
  });

  return [...codes].sort((left, right) => left.localeCompare(right, "cs"));
};

const commissionCodeRuleUsedCodes = (
  rule: CommissionCodeRule,
  usedCodes: string[]
): string[] => usedCodes.filter((code) => commissionCodeRuleMatches(rule, code));

function CommissionCodeRulesPanel({ statement }: { statement: ParsedStatement }) {
  const [expanded, setExpanded] = useState(false);
  const usedCodes = statementCommissionCodeSet(statement);
  const groupedRules = COMMISSION_CODE_CATEGORY_ORDER.flatMap((category) => {
    const rules = COMMISSION_CODE_RULES.filter((rule) => rule.category === category);
    return rules.length > 0 ? [{ category, rules }] : [];
  });
  const usedRuleCount = COMMISSION_CODE_RULES.filter(
    (rule) => commissionCodeRuleUsedCodes(rule, usedCodes).length > 0
  ).length;
  const unknownUsedCodes = usedCodes.filter((code) => {
    const knownInGeneral = COMMISSION_CODE_RULES.some((rule) =>
      commissionCodeRuleMatches(rule, code)
    );
    const knownInTroyOunce = TROY_OUNCE_COMMISSION_CODE_RULES.some((rule) =>
      commissionCodeRuleMatches(rule, code)
    );
    return !knownInGeneral && !knownInTroyOunce;
  });

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full flex-col gap-2 px-4 py-4 text-left sm:flex-row sm:items-center sm:justify-between"
        aria-expanded={expanded}
      >
        <div>
          <h3 className="text-base font-bold text-slate-950">Kódy provizí</h3>
          <p className="text-sm text-slate-600">
            Legenda provizních položek. Kódy použité v tomto výpisu jsou zvýrazněné.
          </p>
        </div>
        <span className="inline-flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-700">
          <span>{COMMISSION_CODE_RULES.length + TROY_OUNCE_COMMISSION_CODE_RULES.length} pravidel</span>
          {usedCodes.length > 0 && <span>{usedCodes.length} ve výpisu</span>}
          {usedRuleCount > 0 && (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs text-emerald-800">
              {usedRuleCount} nalezeno
            </span>
          )}
          <ChevronDown
            className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            strokeWidth={2.2}
            aria-hidden="true"
          />
        </span>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-slate-200 px-4 py-4">
          <div className="grid gap-3 xl:grid-cols-2">
            {groupedRules.map(({ category, rules }) => (
              <div key={category} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${commissionCodeCategoryClass(category)}`}>
                    {commissionCodeCategoryLabel(category)}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">
                    {rules.length} pravidel
                  </span>
                </div>
                <div className="space-y-2">
                  {rules.map((rule) => {
                    const usedRuleCodes = commissionCodeRuleUsedCodes(rule, usedCodes);

                    return (
                      <div key={`${category}-${rule.codes}`} className="grid gap-1 border-t border-slate-200 pt-2 first:border-t-0 first:pt-0">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="font-mono text-sm font-bold text-slate-950">
                            {rule.codes}
                          </span>
                          {usedRuleCodes.length > 0 && (
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                              ve výpisu: {usedRuleCodes.join(", ")}
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-slate-700">{rule.label}</div>
                        {rule.note && <div className="text-xs text-slate-500">{rule.note}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-purple-200 bg-purple-50 px-3 py-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${commissionCodeCategoryClass("troyOunce")}`}>
                Troyská unce - odlišnosti významu kódů
              </span>
              <span className="text-xs font-semibold text-purple-900">
                Produkty TU_*
              </span>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {TROY_OUNCE_COMMISSION_CODE_RULES.map((rule) => {
                const usedRuleCodes = commissionCodeRuleUsedCodes(rule, usedCodes);

                return (
                  <div key={`troy-${rule.codes}`} className="rounded-lg border border-purple-200 bg-white px-3 py-2">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-mono text-sm font-bold text-slate-950">
                        {rule.codes}
                      </span>
                      {usedRuleCodes.length > 0 && (
                        <span className="rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-900">
                          ve výpisu
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-sm text-slate-700">{rule.label}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {unknownUsedCodes.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              <span className="font-bold">Nezařazené kódy ve výpisu: </span>
              {unknownUsedCodes.join(", ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ContractStatusRulesPanel({ rules }: { rules?: ContractStatusRule[] }) {
  const [expanded, setExpanded] = useState(false);
  const safeRules = rules ?? [];
  if (safeRules.length === 0) return null;

  const groupedRules = safeRules.reduce<Record<ContractStatusCategory, ContractStatusRule[]>>(
    (groups, rule) => {
      groups[rule.category].push(rule);
      return groups;
    },
    {
      active: [],
      pending: [],
      matured: [],
      transferred: [],
      storno: [],
      invalid: [],
      unknown: [],
    }
  );
  const visibleGroups = Object.entries(groupedRules).filter(([, groupRules]) => groupRules.length > 0) as [
    ContractStatusCategory,
    ContractStatusRule[],
  ][];

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full flex-col gap-2 px-4 py-4 text-left sm:flex-row sm:items-center sm:justify-between"
        aria-expanded={expanded}
      >
        <div>
          <h3 className="text-base font-bold text-slate-950">Kódy stavů smluv</h3>
          <p className="text-sm text-slate-600">
            Obecná pravidla pro všechny produkty. Konkrétní stav smlouvy se při ostrém importu vezme z našeho systému nebo ČPP synchronizace.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
          {safeRules.length} kódů
          <ChevronDown
            className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            strokeWidth={2.2}
            aria-hidden="true"
          />
        </span>
      </button>

      {expanded && (
        <div className="grid gap-3 border-t border-slate-200 px-4 py-4 xl:grid-cols-2">
        {visibleGroups.map(([category, groupRules]) => (
          <div key={category} className="rounded-xl border border-slate-200 bg-white px-3 py-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${contractStatusCategoryClass(category)}`}>
                {contractStatusCategoryLabel(category)}
              </span>
              <span className="text-xs font-semibold text-slate-500">
                {groupRules.length} kódů
              </span>
            </div>
            <div className="space-y-2">
              {groupRules.map((rule) => (
                <div key={rule.code} className="grid gap-1 border-t border-slate-100 pt-2 first:border-t-0 first:pt-0">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-mono text-sm font-bold text-slate-950">{rule.code}</span>
                    <span className="text-sm text-slate-700">{rule.label}</span>
                  </div>
                  <div className="text-xs text-slate-500">{rule.importDecision}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
        </div>
      )}
    </div>
  );
}

function MarkedDiscrepancyToggle({
  item,
  markingControls,
}: {
  item: MarkedDiscrepancyItem;
  markingControls?: MarkingControls;
}) {
  if (!markingControls?.markingMode) return null;

  const checked = Boolean(markingControls.markedItems[item.key]);

  return (
    <label
      onClick={(event) => event.stopPropagation()}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
        checked
          ? "border-rose-200 bg-rose-50 text-rose-800"
          : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => markingControls.onToggleMarked(item, event.target.checked)}
        className="h-4 w-4 accent-rose-700"
      />
      Označit nesrovnalost
    </label>
  );
}

function DiscrepancyPdfNotesModal({
  items,
  notes,
  downloading,
  onNoteChange,
  onClose,
  onDownload,
}: {
  items: DiscrepancyPdfItem[];
  notes: Record<string, string>;
  downloading: boolean;
  onNoteChange: (key: string, note: string) => void;
  onClose: () => void;
  onDownload: () => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-950">
              Souhrn nesrovnalostí
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Doplň poznámky pro účetní a stáhni PDF.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={downloading}
            className="rounded-full border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Zavřít
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {items.map((item) => (
            <article key={item.key} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-950">
                      Smlouva {item.contractNumber || "—"}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                      {item.category}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                      {discrepancyScopeLabel(item.scope)}
                    </span>
                  </div>
                  <div className="mt-2 font-semibold text-slate-800">
                    {item.client || "—"} · {item.product || "—"}
                  </div>
                  <div className="mt-1 text-xs font-medium text-slate-500">
                    {item.statementLabel}
                    {hasFiniteNumber(item.amount ?? undefined)
                      ? ` · ${formatMoney(item.amount ?? 0)} Kč`
                      : ""}
                  </div>
                  {item.autoIssues.length > 0 && (
                    <ul className="mt-2 space-y-2 text-xs text-slate-600">
                      {item.autoIssues.map((issue) => (
                        <li key={issue.key}>
                          <div className="font-semibold text-slate-700">{issue.title}</div>
                          {issue.details.length > 0 && (
                            <div className="mt-1 space-y-0.5 text-slate-500">
                              {issue.details.map((detail) => (
                                <div key={detail}>{detail}</div>
                              ))}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <textarea
                  value={notes[item.key] ?? ""}
                  onChange={(event) => onNoteChange(item.key, event.target.value)}
                  placeholder="Poznámka pro účetní"
                  className="min-h-24 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 lg:w-96"
                />
              </div>
            </article>
          ))}
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-semibold text-slate-600">
            {items.length} označených položek
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={downloading}
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Zpět
            </button>
            <button
              type="button"
              onClick={onDownload}
              disabled={downloading}
              className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {downloading ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} aria-hidden="true" />
              ) : (
                <Printer className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
              )}
              Stáhnout PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DiscrepancyIssueAmountBlock({ issue }: { issue: StatementDiscrepancyIssue }) {
  const amountLines = [
    hasFiniteNumber(issue.statementAmount) ? `Výpis ${formatMoney(issue.statementAmount)} Kč` : null,
    hasFiniteNumber(issue.expectedAmount) ? `Systém ${formatMoney(issue.expectedAmount)} Kč` : null,
    hasFiniteNumber(issue.difference) ? `Rozdíl ${formatMoney(issue.difference)} Kč` : null,
    issue.manualAmountText || null,
  ].filter(Boolean);

  if (amountLines.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {amountLines.map((line) => (
        <span
          key={line}
          className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700"
        >
          {line}
        </span>
      ))}
    </div>
  );
}

// Legacy inline report panel kept out of render while the marking modal flow is active.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function DiscrepancyReportPanel({
  statement,
  matchesByContractNumber,
  reviewState,
  manualItems,
  onReviewStateChange,
  onManualItemsChange,
}: {
  statement: ParsedStatement;
  matchesByContractNumber: ContractMatchesByNumber;
  reviewState: DiscrepancyReviewState;
  manualItems: ManualDiscrepancyItem[];
  onReviewStateChange: Dispatch<SetStateAction<DiscrepancyReviewState>>;
  onManualItemsChange: Dispatch<SetStateAction<ManualDiscrepancyItem[]>>;
}) {
  const statementKey = statementDiscrepancyKey(statement);
  const autoIssues = useMemo(
    () => buildStatementDiscrepancyIssues(statement, matchesByContractNumber),
    [matchesByContractNumber, statement]
  );
  const statementManualItems = useMemo(
    () => manualItems.filter((item) => item.statementKey === statementKey),
    [manualItems, statementKey]
  );
  const selectedReportItems = useMemo(
    () => buildPrintableDiscrepancyItems(autoIssues, reviewState, statementManualItems),
    [autoIssues, reviewState, statementManualItems]
  );
  const [manualDraft, setManualDraft] = useState({
    contractNumber: "",
    client: "",
    product: "",
    title: "",
    note: "",
    amountText: "",
  });

  const selectedAutoCount = autoIssues.filter(
    (issue) => reviewState[issue.key]?.selected ?? true
  ).length;
  const selectedManualCount = statementManualItems.filter((item) => item.selected).length;
  const allItemCount = autoIssues.length + statementManualItems.length;
  const allItemsSelected = allItemCount > 0 && selectedReportItems.length === allItemCount;
  const selectedDifference = selectedReportItems.reduce(
    (sum, issue) => sum + (hasFiniteNumber(issue.difference) ? issue.difference : 0),
    0
  );

  const updateIssueReview = (
    issueKey: string,
    patch: DiscrepancyReviewStateItem
  ) => {
    onReviewStateChange((previous) => ({
      ...previous,
      [issueKey]: {
        selected: previous[issueKey]?.selected ?? true,
        note: previous[issueKey]?.note ?? "",
        ...patch,
      },
    }));
  };

  const updateManualItem = (
    itemKey: string,
    patch: Partial<ManualDiscrepancyItem>
  ) => {
    onManualItemsChange((previous) =>
      previous.map((item) => (item.key === itemKey ? { ...item, ...patch } : item))
    );
  };

  const toggleAllItems = (selected: boolean) => {
    onReviewStateChange((previous) => {
      const next = { ...previous };
      for (const issue of autoIssues) {
        next[issue.key] = {
          selected,
          note: previous[issue.key]?.note ?? "",
        };
      }
      return next;
    });
    onManualItemsChange((previous) =>
      previous.map((item) =>
        item.statementKey === statementKey ? { ...item, selected } : item
      )
    );
  };

  const addManualItem = () => {
    const normalizedDraft = {
      contractNumber: normalizeText(manualDraft.contractNumber),
      client: normalizeText(manualDraft.client),
      product: normalizeText(manualDraft.product),
      title: normalizeText(manualDraft.title),
      note: normalizeText(manualDraft.note),
      amountText: normalizeText(manualDraft.amountText),
    };
    const hasContent = Object.values(normalizedDraft).some(Boolean);
    if (!hasContent) return;

    const key = discrepancyIssueKey(
      statementKey,
      "manual",
      Date.now(),
      Math.random().toString(36).slice(2, 8)
    );
    onManualItemsChange((previous) => [
      ...previous,
      {
        key,
        statementKey,
        selected: true,
        ...normalizedDraft,
      },
    ]);
    setManualDraft({
      contractNumber: "",
      client: "",
      product: "",
      title: "",
      note: "",
      amountText: "",
    });
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50">
      <div className="flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700">
            <ListChecks className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-lg font-bold text-slate-950">
              Souhrn nesrovnalostí pro účetní
            </h3>
            <p className="text-sm text-slate-600">
              Vybrané položky se otevřou jako tisková sestava pro uložení do PDF.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => toggleAllItems(!allItemsSelected)}
            disabled={allItemCount === 0}
            className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {allItemsSelected ? "Odznačit vše" : "Označit vše"}
          </button>
          <button
            type="button"
            onClick={() => printDiscrepancyReport(statement, selectedReportItems)}
            disabled={selectedReportItems.length === 0}
            className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Printer className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
            Tisk / PDF
          </button>
        </div>
      </div>

      <div className="grid gap-2 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Detekováno
          </div>
          <div className="mt-1 text-lg font-bold text-slate-950">{autoIssues.length}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Ručně
          </div>
          <div className="mt-1 text-lg font-bold text-slate-950">{statementManualItems.length}</div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
            Do PDF
          </div>
          <div className="mt-1 text-lg font-bold text-emerald-950">
            {selectedReportItems.length}
          </div>
          <div className="mt-0.5 text-xs font-medium text-emerald-800">
            {selectedAutoCount} auto · {selectedManualCount} ručně
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Součet rozdílů
          </div>
          <div className="mt-1 text-lg font-bold text-slate-950">
            {formatMoney(selectedDifference)} Kč
          </div>
        </div>
      </div>

      <div className="border-t border-slate-200 px-4 py-4">
        <div className="grid gap-2 lg:grid-cols-[1fr_1fr_1fr_1.3fr_auto]">
          <input
            value={manualDraft.contractNumber}
            onChange={(event) =>
              setManualDraft((previous) => ({ ...previous, contractNumber: event.target.value }))
            }
            placeholder="Číslo smlouvy"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
          />
          <input
            value={manualDraft.client}
            onChange={(event) =>
              setManualDraft((previous) => ({ ...previous, client: event.target.value }))
            }
            placeholder="Klient"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
          />
          <input
            value={manualDraft.product}
            onChange={(event) =>
              setManualDraft((previous) => ({ ...previous, product: event.target.value }))
            }
            placeholder="Produkt / oblast"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
          />
          <input
            value={manualDraft.title}
            onChange={(event) =>
              setManualDraft((previous) => ({ ...previous, title: event.target.value }))
            }
            placeholder="Nesrovnalost"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
          />
          <button
            type="button"
            onClick={addManualItem}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
            Přidat
          </button>
        </div>
        <div className="mt-2 grid gap-2 lg:grid-cols-[1fr_2fr]">
          <input
            value={manualDraft.amountText}
            onChange={(event) =>
              setManualDraft((previous) => ({ ...previous, amountText: event.target.value }))
            }
            placeholder="Částka / rozdíl"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
          />
          <textarea
            value={manualDraft.note}
            onChange={(event) =>
              setManualDraft((previous) => ({ ...previous, note: event.target.value }))
            }
            placeholder="Poznámka pro účetní"
            className="min-h-10 resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
          />
        </div>

        {allItemCount === 0 ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-600">
            Zatím není označená žádná nesrovnalost.
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {autoIssues.map((issue) => {
              const selected = reviewState[issue.key]?.selected ?? true;
              const note = reviewState[issue.key]?.note ?? "";

              return (
                <article
                  key={issue.key}
                  className={`rounded-xl border px-3 py-3 text-sm ${
                    selected
                      ? "border-slate-200 bg-white"
                      : "border-slate-200 bg-slate-100 opacity-75"
                  }`}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={(event) =>
                              updateIssueReview(issue.key, { selected: event.target.checked })
                            }
                            className="h-4 w-4 accent-slate-950"
                          />
                          Do PDF
                        </label>
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${discrepancySeverityClass(issue.severity)}`}>
                          {discrepancySeverityLabel(issue.severity)}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                          {issue.category}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                          {discrepancyScopeLabel(issue.scope)}
                        </span>
                      </div>
                      <div className="mt-2 font-bold text-slate-950">{issue.title}</div>
                      <div className="mt-1 text-slate-700">
                        Smlouva {issue.contractNumber || "—"} · {issue.client || "—"} · {issue.product || "—"}
                      </div>
                      {issue.details.length > 0 && (
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600">
                          {issue.details.map((detail) => (
                            <li key={detail}>{detail}</li>
                          ))}
                        </ul>
                      )}
                      <DiscrepancyIssueAmountBlock issue={issue} />
                    </div>
                    <textarea
                      value={note}
                      onChange={(event) =>
                        updateIssueReview(issue.key, { note: event.target.value })
                      }
                      placeholder="Poznámka k opravě"
                      className="min-h-20 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 lg:w-80"
                    />
                  </div>
                </article>
              );
            })}

            {statementManualItems.map((item) => {
              const issue = manualDiscrepancyToIssue(item);

              return (
                <article
                  key={item.key}
                  className={`rounded-xl border px-3 py-3 text-sm ${
                    item.selected
                      ? "border-slate-200 bg-white"
                      : "border-slate-200 bg-slate-100 opacity-75"
                  }`}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                          <input
                            type="checkbox"
                            checked={item.selected}
                            onChange={(event) =>
                              updateManualItem(item.key, { selected: event.target.checked })
                            }
                            className="h-4 w-4 accent-slate-950"
                          />
                          Do PDF
                        </label>
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${discrepancySeverityClass(issue.severity)}`}>
                          Ručně
                        </span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                          {issue.category}
                        </span>
                      </div>
                      <div className="mt-2 font-bold text-slate-950">{issue.title}</div>
                      <div className="mt-1 text-slate-700">
                        Smlouva {issue.contractNumber || "—"} · {issue.client || "—"} · {issue.product || "—"}
                      </div>
                      <DiscrepancyIssueAmountBlock issue={issue} />
                    </div>
                    <div className="flex w-full flex-col gap-2 lg:w-80">
                      <textarea
                        value={item.note}
                        onChange={(event) =>
                          updateManualItem(item.key, { note: event.target.value })
                        }
                        placeholder="Poznámka k opravě"
                        className="min-h-20 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          onManualItemsChange((previous) =>
                            previous.filter((previousItem) => previousItem.key !== item.key)
                          )
                        }
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800 transition hover:bg-rose-100"
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                        Odebrat
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatementPreview({
  statement,
  matchesByContractNumber,
  currentUserEmail,
  selectedStatementId,
  correctionContext,
  markingControls,
  onRequestSystemStorno,
  onConvertNeonRefresh,
}: {
  statement: ParsedStatement;
  matchesByContractNumber: ContractMatchesByNumber;
  currentUserEmail?: string | null;
  selectedStatementId?: string | null;
  correctionContext?: StatementCorrectionContext;
  markingControls?: MarkingControls;
  onRequestSystemStorno?: (target: StornoStatementActionTarget) => void;
  onConvertNeonRefresh?: (
    target: ManualNeonRefreshConversionTarget
  ) => Promise<ManualNeonRefreshConversionResponse>;
}) {
  const statementKey = statementDiscrepancyKey(statement);
  const unpairedOtherProductContracts = statement.otherProductContracts.filter((contract) =>
    isUnpairedContractMatch(
      contractMatchForNumber(
        matchesByContractNumber,
        contract.contractNumber,
        otherProductContractMatchScope(contract)
      )
    )
  );
  const pairedOtherProductContracts = statement.otherProductContracts.filter(
    (contract) =>
      !isUnpairedContractMatch(
        contractMatchForNumber(
          matchesByContractNumber,
          contract.contractNumber,
          otherProductContractMatchScope(contract)
        )
      )
  );
  const autoProductContracts = pairedOtherProductContracts.filter((contract) =>
    contractHasProductCategory(contract, "auto")
  );
  const remainingOtherProductContracts = pairedOtherProductContracts.filter(
    (contract) => !contractHasProductCategory(contract, "auto")
  );
  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white px-4 py-4">
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
            <ReceiptText className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
            <span className="truncate">{statement.fileName}</span>
          </div>
          <h2 className="mt-1 text-lg font-bold text-slate-950">
            Výpis {statement.header.statementNumber ?? "bez čísla"}
          </h2>
          {statement.header.statementDate && (
            <p className="mt-1 text-sm font-medium text-slate-500">
              Vystaveno {statement.header.statementDate}
            </p>
          )}
        </div>
        <span className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
          <CheckCircle2 className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
          Bez zápisu provizí
        </span>
      </div>

      {statement.parseWarnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {statement.parseWarnings.map((warning) => (
            <div key={warning} className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
              <span>{warning}</span>
            </div>
          ))}
        </div>
      )}

      <StatementSummary statement={statement} />

      <LifeSplitProductsSection
        contracts={statement.lifeSplitContracts}
        matchesByContractNumber={matchesByContractNumber}
        statementId={selectedStatementId}
        statementPeriod={statement.header.period}
        statementKey={statementKey}
        correctionContext={correctionContext}
        markingControls={markingControls}
        onConvertNeonRefresh={onConvertNeonRefresh}
      />

      <OtherProductsSection
        title="Auta"
        description="Auto produkty se párují primárně podle čísla smlouvy. Produkt z výpisu je doplňující kontrola."
        contracts={autoProductContracts}
        matchesByContractNumber={matchesByContractNumber}
        statementPeriod={statement.header.period}
        statementKey={statementKey}
        correctionContext={correctionContext}
        markingControls={markingControls}
      />

      <OtherProductsSection
        contracts={remainingOtherProductContracts}
        matchesByContractNumber={matchesByContractNumber}
        statementPeriod={statement.header.period}
        statementKey={statementKey}
        correctionContext={correctionContext}
        markingControls={markingControls}
      />

      <UnpairedContractsSection
        lifeContracts={[]}
        otherContracts={unpairedOtherProductContracts}
        matchesByContractNumber={matchesByContractNumber}
        markingControls={markingControls}
      />

      {statement.unmatchedB36Payments.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
          <h3 className="text-base font-bold text-amber-950">
            B36 bez detailního řádku ve výpisu
          </h3>
          <p className="mt-1 text-sm text-amber-900">
            Tyto položky se mají při ostrém importu dopárovat podle čísla smlouvy v našem systému.
          </p>
          <div className="mt-3 space-y-2">
            {statement.unmatchedB36Payments.map((payment, index) => {
              const match = contractMatchForNumber(matchesByContractNumber, payment.contractNumber);
              const systemContract = matchedSystemContract(match);
              const markedItem: MarkedDiscrepancyItem | null = markingControls
                ? {
                    key: markedDiscrepancyKey({
                      statementKey: markingControls.statementKey,
                      scope: "my",
                      category: "Ostatní platby",
                      contractNumber: payment.contractNumber,
                      fallback: `unmatched-b36-${index}`,
                    }),
                    statementKey: markingControls.statementKey,
                    statementLabel: markingControls.statementLabel,
                    category: "Ostatní platby",
                    scope: "my",
                    contractNumber: payment.contractNumber,
                    client: "—",
                    product: "B36 / ostatní platby",
                    title: "Ručně označená B36 položka k opravě",
                    amount: payment.amount,
                    details: [payment.description],
                  }
                : null;

              return (
                <div
                  key={`${payment.contractNumber}-${index}`}
                  className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm"
                >
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 font-semibold text-slate-950">
                        <span>Smlouva {payment.contractNumber ?? "—"}</span>
                        <BohemkaContractDetailLink contract={systemContract} compact />
                        <SystemMatchBadge match={match} />
                      </div>
                      {markedItem && (
                        <div className="mt-2">
                          <MarkedDiscrepancyToggle
                            item={markedItem}
                            markingControls={markingControls}
                          />
                        </div>
                      )}
                      <div className="text-slate-600">{payment.description}</div>
                    </div>
                    <div className="whitespace-nowrap font-bold text-slate-950">
                      {formatMoney(payment.amount)} Kč
                    </div>
                  </div>
                  <SystemMatchPanel match={match} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      <StornoContractsSection
        statement={statement}
        matchesByContractNumber={matchesByContractNumber}
        markingControls={markingControls}
        onRequestSystemStorno={onRequestSystemStorno}
      />

      <ManagerCommissionsSection
        advisors={statement.managerCommissions}
        matchesByContractNumber={matchesByContractNumber}
        currentUserEmail={currentUserEmail}
        suggestedStornoDate={suggestedStornoDateForStatement(statement.header)}
        markingControls={markingControls}
        onRequestSystemStorno={onRequestSystemStorno}
      />

      <CommissionCodeRulesPanel statement={statement} />

      <ContractStatusRulesPanel rules={statement.contractStatusRules} />
    </section>
  );
}

export default function CommissionStatementsPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [statements, setStatements] = useState<ParsedStatement[]>([]);
  const [statementFilesForProcessing, setStatementFilesForProcessing] = useState<
    StatementFileRead[]
  >([]);
  const [matchesByContractNumber, setMatchesByContractNumber] =
    useState<ContractMatchesByNumber>({});
  const [markingMode, setMarkingMode] = useState(false);
  const [markedDiscrepancies, setMarkedDiscrepancies] = useState<MarkedDiscrepancies>({});
  const [discrepancyNotes, setDiscrepancyNotes] = useState<Record<string, string>>({});
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [contractDetailModal, setContractDetailModal] =
    useState<BohemkaContractDetailModalPayload | null>(null);
  const [pdfDownloading, setPdfDownloading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [matchingError, setMatchingError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [statementSaveState, setStatementSaveState] = useState<StatementSaveState>({
    status: "idle",
    message: null,
  });
  const [processingAuditSummary, setProcessingAuditSummary] =
    useState<StatementProcessingSummary | null>(null);
  const [stornoActionTarget, setStornoActionTarget] =
    useState<StornoStatementActionTarget | null>(null);
  const [stornoActionDateInput, setStornoActionDateInput] = useState("");
  const [stornoActionSaving, setStornoActionSaving] = useState(false);
  const [stornoActionError, setStornoActionError] = useState<string | null>(null);
  const statementRecordsProcessing = statementSaveState.status === "saving";
  const statementRecordsProcessed = statementSaveState.status === "saved";
  const [processingStepIndex, setProcessingStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [processedStatementHistory, setProcessedStatementHistory] = useState<
    SavedCommissionStatement[]
  >([]);
  const [processedStatementHistoryLoading, setProcessedStatementHistoryLoading] =
    useState(false);
  const [processedStatementHistoryError, setProcessedStatementHistoryError] =
    useState<string | null>(null);
  const [processedStatementHistoryVisible, setProcessedStatementHistoryVisible] =
    useState(false);
  const [selectedHistoryStatementId, setSelectedHistoryStatementId] = useState<string | null>(null);
  const [processedStatementIdsByKey, setProcessedStatementIdsByKey] =
    useState<Record<string, string>>({});
  const [openingHistoryStatementId, setOpeningHistoryStatementId] = useState<string | null>(null);
  const [neonRefreshPromptTargets, setNeonRefreshPromptTargets] = useState<
    PostProcessingNeonRefreshPromptTarget[]
  >([]);
  const [neonRefreshPromptSaving, setNeonRefreshPromptSaving] = useState(false);
  const [neonRefreshPromptError, setNeonRefreshPromptError] = useState<string | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
  }, []);

  const refreshProcessedStatementHistory = async () => {
    if (!user) {
      setProcessedStatementHistory([]);
      setProcessedStatementHistoryError(null);
      setProcessedStatementHistoryLoading(false);
      return;
    }

    setProcessedStatementHistoryLoading(true);
    setProcessedStatementHistoryError(null);

    try {
      const items = await fetchProcessedCommissionStatementHistory(user);
      setProcessedStatementHistory(items);
    } catch (historyError) {
      console.warn("Provizní výpisy: historii zpracovaných výpisů se nepodařilo načíst.", historyError);
      setProcessedStatementHistoryError(
        historyError instanceof Error
          ? historyError.message
          : "Historii zpracovaných výpisů se nepodařilo načíst."
      );
    } finally {
      setProcessedStatementHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (!user) {
      setProcessedStatementHistory([]);
      setProcessedStatementHistoryError(null);
      setProcessedStatementHistoryLoading(false);
      setProcessedStatementHistoryVisible(false);
      setSelectedHistoryStatementId(null);
      setProcessedStatementIdsByKey({});
      setNeonRefreshPromptTargets([]);
      setNeonRefreshPromptError(null);
      return;
    }

    let cancelled = false;

    const loadHistory = async () => {
      setProcessedStatementHistoryLoading(true);
      setProcessedStatementHistoryError(null);

      try {
        const items = await fetchProcessedCommissionStatementHistory(user);
        if (!cancelled) {
          setProcessedStatementHistory(items);
        }
      } catch (historyError) {
        if (cancelled) return;
        console.warn("Provizní výpisy: historii zpracovaných výpisů se nepodařilo načíst.", historyError);
        setProcessedStatementHistory([]);
        setProcessedStatementHistoryError(
          historyError instanceof Error
            ? historyError.message
            : "Historii zpracovaných výpisů se nepodařilo načíst."
        );
      } finally {
        if (!cancelled) {
          setProcessedStatementHistoryLoading(false);
        }
      }
    };

    void loadHistory();

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!statementRecordsProcessing) {
      setProcessingStepIndex(0);
      return;
    }

    const intervalId = window.setInterval(() => {
      setProcessingStepIndex((previous) => (previous + 1) % PROCESSING_CAPTIONS.length);
    }, 1700);

    return () => window.clearInterval(intervalId);
  }, [statementRecordsProcessing]);

  const openStornoActionModal = (target: StornoStatementActionTarget) => {
    setStornoActionTarget(target);
    setStornoActionDateInput("");
    setStornoActionError(null);
  };

  const closeStornoActionModal = () => {
    if (stornoActionSaving) return;
    setStornoActionTarget(null);
    setStornoActionError(null);
  };

  const updateMatchedContractStornoState = (
    ownerEmail: string,
    entryIds: string[],
    stornoDate: Date
  ) => {
    const normalizedOwner = normalizeEmailForComparison(ownerEmail);
    const entryIdSet = new Set(entryIds);
    const stornoDateMs = stornoDate.getTime();

    setMatchesByContractNumber((previous) => {
      let touched = false;
      const nextEntries = Object.entries(previous).map(([key, match]) => {
        const contracts = match.contracts.map((contract) => {
          if (
            normalizeEmailForComparison(contract.adviserEmail) !== normalizedOwner ||
            !entryIdSet.has(contract.id)
          ) {
            return contract;
          }

          touched = true;
          return {
            ...contract,
            status: "storno",
            stornoDate: stornoDateMs,
          };
        });

        const matchChanged = contracts.some(
          (contract, index) => contract !== match.contracts[index]
        );
        return [key, matchChanged ? { ...match, contracts } : match] as const;
      });

      return touched ? Object.fromEntries(nextEntries) : previous;
    });
  };

  const updateMatchedContractRefreshState = (
    ownerEmail: string,
    entryId: string,
    patch: Partial<MatchedSystemContract>
  ) => {
    const normalizedOwner = normalizeEmailForComparison(ownerEmail);

    setMatchesByContractNumber((previous) => {
      let touched = false;
      const nextEntries = Object.entries(previous).map(([key, match]) => {
        const contracts = match.contracts.map((contract) => {
          if (
            normalizeEmailForComparison(contract.adviserEmail) !== normalizedOwner ||
            contract.id !== entryId
          ) {
            return contract;
          }

          touched = true;
          return {
            ...contract,
            ...patch,
            id: contract.id,
            adviserEmail: contract.adviserEmail,
          };
        });

        const matchChanged = contracts.some(
          (contract, index) => contract !== match.contracts[index]
        );
        return [key, matchChanged ? { ...match, contracts } : match] as const;
      });

      return touched ? Object.fromEntries(nextEntries) : previous;
    });
  };

  const convertNeonRefreshFromStatement = async ({
    statementId,
    contract,
    contractNumber,
  }: ManualNeonRefreshConversionTarget): Promise<ManualNeonRefreshConversionResponse> => {
    if (!user) {
      throw new Error("Pro převod smlouvy na REFRESH musíš být přihlášený.");
    }

    const ownerEmail = normalizeEmailForComparison(contract.adviserEmail);
    const entryId = normalizeText(contract.id);
    if (!ownerEmail || !entryId || !statementId) {
      throw new Error("Spárovaná smlouva nemá dostatek údajů pro převod na REFRESH.");
    }

    const sendRequest = async (token: string) =>
      fetch("/api/commission-statements", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "convert-neon-refresh-from-statement",
          statementId,
          ownerEmail,
          entryId,
          contractNumber,
        }),
      });

    let token = await user.getIdToken();
    let response = await sendRequest(token);
    if (response.status === 401) {
      token = await user.getIdToken(true);
      response = await sendRequest(token);
    }

    const payload = (await response.json().catch(() => null)) as
      | ManualNeonRefreshConversionResponse
      | null;
    if (!response.ok || payload?.ok !== true) {
      throw new Error(payload?.error || "Převod na REFRESH se nepodařilo uložit.");
    }

    if (payload.contract) {
      updateMatchedContractRefreshState(ownerEmail, entryId, payload.contract);
    }

    if (typeof window !== "undefined") {
      try {
        sessionStorage.removeItem("contracts_cache_v3");
        localStorage.setItem("contracts_last_updated", String(Date.now()));
        window.dispatchEvent(new Event("contracts:updated"));
      } catch {
        // best effort cache invalidation
      }
    }

    void refreshProcessedStatementHistory();
    return payload;
  };

  const activeNeonRefreshPromptTarget = neonRefreshPromptTargets[0] ?? null;

  const closeNeonRefreshPrompt = () => {
    if (neonRefreshPromptSaving) return;
    setNeonRefreshPromptTargets([]);
    setNeonRefreshPromptError(null);
  };

  const confirmNeonRefreshPrompt = async () => {
    if (!activeNeonRefreshPromptTarget) return;
    setNeonRefreshPromptSaving(true);
    setNeonRefreshPromptError(null);

    try {
      await convertNeonRefreshFromStatement(activeNeonRefreshPromptTarget);
      setNeonRefreshPromptTargets((previous) =>
        previous.filter((target) => target.key !== activeNeonRefreshPromptTarget.key)
      );
    } catch (conversionError) {
      setNeonRefreshPromptError(
        conversionError instanceof Error
          ? conversionError.message
          : "Převod smlouvy na REFRESH se nepodařil."
      );
    } finally {
      setNeonRefreshPromptSaving(false);
    }
  };

  const confirmStornoAction = async () => {
    if (!stornoActionTarget) return;

    if (!user) {
      setStornoActionError("Pro úpravu smlouvy musíš být přihlášený.");
      return;
    }

    const parsedDate = stornoActionDateInput ? new Date(stornoActionDateInput) : null;
    if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
      setStornoActionError("Zadej platné datum storna.");
      return;
    }

    const ownerEmail = normalizeEmailForComparison(stornoActionTarget.contract.adviserEmail);
    const entryIds = stornoUpdateEntryIds(stornoActionTarget.contract);
    if (!ownerEmail || entryIds.length === 0) {
      setStornoActionError("Spárovaná smlouva nemá dostatek údajů pro úpravu.");
      return;
    }

    setStornoActionSaving(true);
    setStornoActionError(null);

    try {
      const sendRequest = async (token: string) =>
        fetch("/api/contracts/update-fields", {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ownerEmail,
            entryIds,
            updates: {
              status: "storno",
              stornoDate: parsedDate,
            },
          }),
        });

      let token = await user.getIdToken();
      let response = await sendRequest(token);
      if (response.status === 401) {
        token = await user.getIdToken(true);
        response = await sendRequest(token);
      }

      const payload = (await response.json().catch(() => null)) as
        | ContractsMutationResponse
        | null;
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || "Storno se nepodařilo uložit.");
      }

      updateMatchedContractStornoState(ownerEmail, entryIds, parsedDate);
      setStornoActionTarget(null);

      if (typeof window !== "undefined") {
        try {
          sessionStorage.removeItem("contracts_cache_v3");
          localStorage.setItem("contracts_last_updated", String(Date.now()));
          window.dispatchEvent(new Event("contracts:updated"));
        } catch {
          // best effort cache invalidation
        }
      }
    } catch (saveError) {
      console.error("Provizní výpisy: označení smlouvy jako storno selhalo.", saveError);
      setStornoActionError(
        saveError instanceof Error
          ? saveError.message
          : "Storno se nepodařilo uložit."
      );
    } finally {
      setStornoActionSaving(false);
    }
  };

  const statementContractMatchRequests = useMemo(
    () => collectStatementContractMatchRequests(statements),
    [statements]
  );

  useEffect(() => {
    let cancelled = false;

    setMatchingError(null);

    if (statements.length === 0 || statementContractMatchRequests.length === 0) {
      setMatchesByContractNumber({});
      return () => {
        cancelled = true;
      };
    }

    if (!user) {
      setMatchesByContractNumber({});
      return () => {
        cancelled = true;
      };
    }

    setMatchesByContractNumber((previous) => {
      const next: ContractMatchesByNumber = {};
      for (const request of statementContractMatchRequests) {
        const key = contractMatchKey(request.scope, request.contractNumber);
        if (!key) continue;
        next[key] = previous[key]?.status === "matched" ? previous[key] : { status: "loading", contracts: [] };
      }
      return next;
    });

    void fetchSystemContractMatches(user, statementContractMatchRequests, (request, match) => {
      if (cancelled) return;
      const key = contractMatchKey(request.scope, request.contractNumber);
      if (!key) return;
      setMatchesByContractNumber((previous) => ({
        ...previous,
        [key]: match,
      }));
    }).catch((err) => {
      if (cancelled) return;
      setMatchingError(
        err instanceof Error
          ? err.message
          : "Nepodařilo se spustit párování smluv se systémem."
      );
    });

    return () => {
      cancelled = true;
    };
  }, [statementContractMatchRequests, statements.length, user]);

  const matchStats = useMemo<ContractMatchStats>(() => {
    let matched = 0;
    let loading = 0;
    let notFound = 0;
    let errors = 0;

    for (const request of statementContractMatchRequests) {
      const match = contractMatchForNumber(
        matchesByContractNumber,
        request.contractNumber,
        request.scope
      );
      if (match?.status === "matched") matched += 1;
      else if (match?.status === "loading") loading += 1;
      else if (match?.status === "not_found") notFound += 1;
      else if (match?.status === "error") errors += 1;
    }

    const total = statementContractMatchRequests.length;
    const completed = matched + notFound + errors;
    const pending = Math.max(0, total - completed - loading);
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      total,
      matched,
      loading,
      notFound,
      errors,
      pending,
      completed,
      progress,
    };
  }, [matchesByContractNumber, statementContractMatchRequests]);

  const statementCorrectionContext = useMemo(
    () => buildStatementCorrectionContext(statements),
    [statements]
  );

  const overviewTotals = useMemo(() => {
    const unpairedContractNumbers = new Set<string>();
    const issueContractNumbers = new Set<string>();

    for (const request of statementContractMatchRequests) {
      const key = contractMatchKey(request.scope, request.contractNumber);
      if (!key) continue;
      if (
        isUnpairedContractMatch(
          contractMatchForNumber(matchesByContractNumber, request.contractNumber, request.scope)
        )
      ) {
        unpairedContractNumbers.add(key);
      }
    }

    const markIssue = (
      contractNumber: string | null | undefined,
      hasIssue: boolean,
      scope: ContractMatchScope = "my"
    ) => {
      if (!hasIssue) return;
      const key = contractMatchKey(scope, contractNumber);
      if (!key || unpairedContractNumbers.has(key)) return;
      issueContractNumbers.add(key);
    };

    for (const statement of statements) {
      const statementKey = statementDiscrepancyKey(statement);
      for (const contract of statement.lifeSplitContracts) {
        markIssue(
          contract.contractNumber,
          lifeSplitContractUncertaintyCount(
            contract,
            matchesByContractNumber,
            statement.header.period,
            statementKey,
            statementCorrectionContext
          ) > 0,
          lifeSplitContractMatchScope(contract)
        );
      }

      for (const contract of statement.otherProductContracts) {
        markIssue(
          contract.contractNumber,
          otherProductContractUncertaintyCount(
            contract,
            matchesByContractNumber,
            statement.header.period,
            statementKey,
            statementCorrectionContext
          ) > 0,
          otherProductContractMatchScope(contract)
        );
      }

      for (const advisor of statement.managerCommissions) {
        for (const row of advisor.rows) {
          const match = contractMatchForNumber(
            matchesByContractNumber,
            row.contractNumber,
            "team"
          );
          markIssue(row.contractNumber, match?.status === "matched" && !matchedSystemContract(match), "team");
        }
      }

      for (const row of statement.stornoRows) {
        markIssue(
          row.contractNumber,
          matchNeedsSystemStorno(
            contractMatchForNumber(matchesByContractNumber, row.contractNumber)
          )
        );
      }

      for (const payment of statement.otherPayments.filter((item) => item.isStorno)) {
        markIssue(
          payment.contractNumber,
          matchNeedsSystemStorno(
            contractMatchForNumber(matchesByContractNumber, payment.contractNumber)
          )
        );
      }
    }

    return {
      contractCount: statementContractMatchRequests.length,
      issueContractCount: issueContractNumbers.size,
      unpairedContractCount: unpairedContractNumbers.size,
    };
  }, [
    matchesByContractNumber,
    statementContractMatchRequests,
    statementCorrectionContext,
    statements,
  ]);

  const markedDiscrepancyItems = useMemo(
    () => Object.values(markedDiscrepancies),
    [markedDiscrepancies]
  );

  const allAutoDiscrepancyIssues = useMemo(
    () =>
      statements.flatMap((statement) =>
        buildStatementDiscrepancyIssues(
          statement,
          matchesByContractNumber,
          user?.email ?? null,
          statementCorrectionContext
        )
      ),
    [matchesByContractNumber, statementCorrectionContext, statements, user?.email]
  );

  const selectedPdfItems = useMemo<DiscrepancyPdfItem[]>(
    () =>
      markedDiscrepancyItems.map((item) => ({
        ...item,
        note: normalizeText(discrepancyNotes[item.key]),
        autoIssues: matchingAutoIssuesForMarkedItem(item, allAutoDiscrepancyIssues),
      })),
    [allAutoDiscrepancyIssues, discrepancyNotes, markedDiscrepancyItems]
  );
  const activeProcessingCaption =
    PROCESSING_CAPTIONS[processingStepIndex % PROCESSING_CAPTIONS.length];
  const processingProgressPercent = Math.round(
    ((processingStepIndex + 1) / PROCESSING_CAPTIONS.length) * 100
  );

  const toggleMarkedDiscrepancy = (item: MarkedDiscrepancyItem, selected: boolean) => {
    setMarkedDiscrepancies((previous) => {
      if (selected) {
        return {
          ...previous,
          [item.key]: item,
        };
      }

      const next = { ...previous };
      delete next[item.key];
      return next;
    });

    if (!selected) {
      setDiscrepancyNotes((previous) => {
        if (!(item.key in previous)) return previous;
        const next = { ...previous };
        delete next[item.key];
        return next;
      });
    }
  };

  const downloadSelectedDiscrepancies = async () => {
    if (selectedPdfItems.length === 0) return;
    setPdfError(null);
    setPdfDownloading(true);
    try {
      await downloadDiscrepancySummaryPdf(selectedPdfItems);
      setReportModalOpen(false);
    } catch (downloadError) {
      console.error("Provizní výpisy: stažení souhrnu nesrovnalostí selhalo.", downloadError);
      setPdfError(
        downloadError instanceof Error
          ? downloadError.message
          : "Souhrn nesrovnalostí se nepodařilo stáhnout."
      );
    } finally {
      setPdfDownloading(false);
    }
  };

  const resetStatementWorkspace = () => {
    setStatements([]);
    setStatementFilesForProcessing([]);
    setError(null);
    setMatchingError(null);
    setStatementSaveState({ status: "idle", message: null });
    setProcessingAuditSummary(null);
    setMatchesByContractNumber({});
    setMarkingMode(false);
    setMarkedDiscrepancies({});
    setDiscrepancyNotes({});
    setReportModalOpen(false);
    setContractDetailModal(null);
    setPdfError(null);
    setStornoActionTarget(null);
    setStornoActionError(null);
    setStornoActionSaving(false);
    setSelectedHistoryStatementId(null);
    setProcessedStatementIdsByKey({});
    setNeonRefreshPromptTargets([]);
    setNeonRefreshPromptError(null);
    setNeonRefreshPromptSaving(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const parseFiles = async (files: FileList | File[]) => {
    const htmlFiles = Array.from(files).filter((file) =>
      /\.html?$/i.test(file.name)
    );
    if (htmlFiles.length === 0) {
      setError("Vyber HTML soubor provizního výpisu.");
      return;
    }

    setParsing(true);
    setError(null);
    setMatchingError(null);
    setStatementSaveState({ status: "idle", message: null });
    setProcessingAuditSummary(null);
    setStatementFilesForProcessing([]);
    setMatchesByContractNumber({});
    setMarkingMode(false);
    setMarkedDiscrepancies({});
    setDiscrepancyNotes({});
    setReportModalOpen(false);
    setContractDetailModal(null);
    setPdfError(null);
    setStornoActionTarget(null);
    setStornoActionError(null);
    setStornoActionSaving(false);
    setSelectedHistoryStatementId(null);
    setProcessedStatementIdsByKey({});
    setNeonRefreshPromptTargets([]);
    setNeonRefreshPromptError(null);
    setNeonRefreshPromptSaving(false);

    let parsedFiles: StatementFileRead[];
    try {
      parsedFiles = await Promise.all(htmlFiles.map(readStatementFile));
    } catch (parseError) {
      console.error("Provizní výpisy: importní náhled selhal.", parseError);
      setError("Soubor se nepodařilo přečíst. Zkontroluj, že jde o uložený HTML výpis.");
      setParsing(false);
      return;
    }

    setStatements(parsedFiles.map((file) => file.statement));
    setStatementFilesForProcessing(parsedFiles);

    if (!user) {
      setStatementSaveState({
        status: "error",
        message: "Výpis je jen připravený. Pro zpracování záznamu musíš být přihlášený.",
      });
      setParsing(false);
      return;
    }

    setStatementSaveState({
      status: "ready",
      message: "Výpis je připravený ke kontrole. Zápis proběhne až po kliknutí na Zpracovat záznam.",
    });
    setParsing(false);
  };

  const openProcessedStatementFromHistory = async (statementId: string) => {
    const normalizedStatementId = statementId.trim();
    if (!normalizedStatementId) return;

    if (!user) {
      setError("Pro otevření historie musíš být přihlášený.");
      return;
    }

    setOpeningHistoryStatementId(normalizedStatementId);
    setError(null);
    setMatchingError(null);

    try {
      const request = async (forceRefreshToken = false) => {
        const token = await user.getIdToken(forceRefreshToken);
        return fetch(
          `/api/commission-statements?id=${encodeURIComponent(normalizedStatementId)}&includeHtml=1`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
          }
        );
      };

      let response = await request(false);
      if (response.status === 401) {
        response = await request(true);
      }

      const payload = (await response.json().catch(() => null)) as
        | SavedCommissionStatementsResponse
        | null;

      if (!response.ok || payload?.ok !== true || !payload.item?.html) {
        throw new Error(payload?.error || "Zpracovaný výpis se nepodařilo otevřít.");
      }

      if (!isProcessedSavedStatement(payload.item)) {
        throw new Error("Tento výpis není označený jako zpracovaný.");
      }

      const statementFile: StatementFileRead = {
        html: payload.item.html,
        statement: parseStatementHtml(
          payload.item.html,
          payload.item.fileName || "Provizní výpis.html"
        ),
      };

      setStatements([statementFile.statement]);
      setStatementFilesForProcessing([]);
      setStatementSaveState({
        status: "saved",
        message: "Načteno ze zpracované historie.",
      });
      setProcessingAuditSummary(
        payload.item.processingResult ? sumProcessingResults([payload.item.processingResult]) : null
      );
      setMatchesByContractNumber({});
      setMarkingMode(false);
      setMarkedDiscrepancies({});
      setDiscrepancyNotes({});
      setReportModalOpen(false);
      setContractDetailModal(null);
      setPdfError(null);
      setStornoActionTarget(null);
      setStornoActionError(null);
      setStornoActionSaving(false);
      setSelectedHistoryStatementId(normalizedStatementId);
      setProcessedStatementIdsByKey({
        [statementDiscrepancyKey(statementFile.statement)]: normalizedStatementId,
      });
      setProcessedStatementHistoryVisible(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (historyOpenError) {
      console.error("Provizní výpisy: otevření zpracovaného výpisu z historie selhalo.", historyOpenError);
      setError(
        historyOpenError instanceof Error
          ? historyOpenError.message
          : "Zpracovaný výpis se nepodařilo otevřít."
      );
    } finally {
      setOpeningHistoryStatementId(null);
    }
  };

  const processStatementRecords = async () => {
    if (statementFilesForProcessing.length === 0) {
      setStatementSaveState({
        status: "error",
        message: "Nejdřív nahraj HTML výpis.",
      });
      return;
    }

    if (!user) {
      setStatementSaveState({
        status: "error",
        message: "Pro zpracování záznamu musíš být přihlášený.",
      });
      return;
    }

    setStatementSaveState({
      status: "saving",
      message: "Zpracovávám záznam a ukládám výpis pro provizní kalendář…",
    });
    setProcessingAuditSummary(null);

    try {
      const token = await user.getIdToken();
      const filesForProcessing = [...statementFilesForProcessing].sort(
        (left, right) =>
          statementFileReadSortValue(left, statementFilesForProcessing.indexOf(left)) -
          statementFileReadSortValue(right, statementFilesForProcessing.indexOf(right))
      );
      const processingResults: StatementProcessingResult[] = [];
      const nextProcessedStatementIdsByKey: Record<string, string> = {};
      for (const parsedFile of filesForProcessing) {
        const response = await fetch("/api/commission-statements", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(buildStatementSavePayload(parsedFile)),
        });
        const payload = (await response.json().catch(() => null)) as
          | {
              ok?: boolean;
              error?: string;
              item?: SavedCommissionStatement;
              processingResult?: StatementProcessingResult;
            }
          | null;
        if (!response.ok || payload?.ok !== true) {
          throw new Error(payload?.error || "Provizní výpis se nepodařilo uložit.");
        }
        processingResults.push(payload.processingResult ?? {});
        if (payload.item?.id) {
          nextProcessedStatementIdsByKey[statementDiscrepancyKey(parsedFile.statement)] =
            payload.item.id;
        }
      }
      const processingSummary = sumProcessingResults(processingResults);
      const processedStatementIds = Object.values(nextProcessedStatementIdsByKey);

      setStatementSaveState({
        status: "saved",
        message: processedStatementLabel(statementFilesForProcessing.length, processingResults),
      });
      setProcessingAuditSummary(processingSummary);
      setProcessedStatementIdsByKey((previous) => ({
        ...previous,
        ...nextProcessedStatementIdsByKey,
      }));
      if (processedStatementIds.length === 1) {
        setSelectedHistoryStatementId(processedStatementIds[0]);
      }
      const neonRefreshTargets = collectPostProcessingNeonRefreshPromptTargets({
        statements: filesForProcessing.map((parsedFile) => parsedFile.statement),
        matchesByContractNumber,
        processedStatementIdsByKey: nextProcessedStatementIdsByKey,
      });
      setNeonRefreshPromptTargets(neonRefreshTargets);
      setNeonRefreshPromptError(null);
      setNeonRefreshPromptSaving(false);
      void refreshProcessedStatementHistory();
    } catch (saveError) {
      console.error("Provizní výpisy: zpracování záznamu selhalo.", saveError);
      setStatementSaveState({
        status: "error",
        message:
          saveError instanceof Error
            ? saveError.message
            : "Záznam se nepodařilo zpracovat.",
      });
      setProcessingAuditSummary(null);
    }
  };

  const freshUploadPairingInProgress =
    statements.length > 0 &&
    statementFilesForProcessing.length > 0 &&
    matchStats.total > 0 &&
    matchStats.completed < matchStats.total &&
    !matchingError;
  const visibleStatementSaveMessage =
    freshUploadPairingInProgress && statementSaveState.status === "ready"
      ? null
      : statementSaveState.message;

  return (
    <BohemkaContractDetailModalContext.Provider value={setContractDetailModal}>
      <AppLayout active="statements">
      <div className="w-full max-w-7xl space-y-4">
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div
            className={`grid gap-4 p-4 sm:p-5 ${
              freshUploadPairingInProgress
                ? ""
                : "lg:grid-cols-[minmax(0,1fr)_minmax(32rem,0.9fr)] lg:items-center"
            }`}
          >
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 text-xs font-bold uppercase text-slate-500">
                <ReceiptText className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                Provizní výpisy
              </div>
              <h1 className="mt-3 max-w-3xl text-2xl font-black text-slate-950 sm:text-3xl">
                Kontrola provizního výpisu
              </h1>
              <div className="mt-2 flex flex-wrap gap-2 text-sm font-semibold text-slate-500">
                {freshUploadPairingInProgress ? (
                  <>
                    <span>Páruji smlouvy</span>
                    <span aria-hidden="true">·</span>
                    <span>{matchStats.completed}/{matchStats.total} hotovo</span>
                  </>
                ) : (
                  <>
                    <span>{statements.length > 0 ? `${statements.length} výpisů v kontrole` : "Čeká na HTML výpis"}</span>
                    <span aria-hidden="true">·</span>
                    <span>{overviewTotals.contractCount} smluv v náhledu</span>
                  </>
                )}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setProcessedStatementHistoryVisible((value) => !value)}
                  className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    processedStatementHistoryVisible
                      ? "border border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
                      : "bg-slate-950 text-white hover:bg-slate-800"
                  }`}
                >
                  <CalendarDays className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                  {processedStatementHistoryVisible ? "Skrýt historii" : "Zobrazit historii"}
                  {processedStatementHistory.length > 0 && !processedStatementHistoryVisible && (
                    <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs">
                      {processedStatementHistory.length}
                    </span>
                  )}
                </button>

                {statements.length > 0 && !freshUploadPairingInProgress && (
                  <>
                  <button
                    type="button"
                    onClick={() => setMarkingMode((value) => !value)}
                    className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                      markingMode
                        ? "border border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100"
                        : "bg-slate-950 text-white hover:bg-slate-800"
                    }`}
                  >
                    <ListChecks className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                    {markingMode ? "Dokončit označení" : "Označit"}
                  </button>
                  {markedDiscrepancyItems.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setPdfError(null);
                        setReportModalOpen(true);
                      }}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-100"
                    >
                      <Printer className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                      Stáhnout souhrn nesrovnalostí
                    </button>
                  )}
                  {markedDiscrepancyItems.length > 0 && (
                    <span className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800">
                      Označeno {markedDiscrepancyItems.length}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={resetStatementWorkspace}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-100"
                  >
                    <RotateCcw className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                    Vymazat
                  </button>
                  </>
                )}
                {statements.length > 0 && freshUploadPairingInProgress && (
                  <button
                    type="button"
                    onClick={resetStatementWorkspace}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-100"
                  >
                    <RotateCcw className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                    Vymazat
                  </button>
                )}
              </div>
            </div>

            {!freshUploadPairingInProgress && (
            <div className="grid min-w-0 gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-3">
                <div className="flex items-center justify-between gap-3 text-xs font-bold uppercase text-slate-500">
                  <span>Celkem smluv</span>
                  <ReceiptText className="h-4 w-4 text-slate-400" strokeWidth={2.2} aria-hidden="true" />
                </div>
                <div className="mt-2 text-2xl font-black text-slate-950">
                  {overviewTotals.contractCount}
                </div>
                <div className="mt-1 text-xs text-slate-600">
                  {statements.length > 0 ? `${statements.length} výpisů` : "Bez nahraného výpisu"}
                </div>
              </div>
              <div
                className={`rounded-lg border bg-white px-3 py-3 ${
                  overviewTotals.issueContractCount > 0
                    ? "border-rose-200"
                    : "border-emerald-200"
                }`}
              >
                <div
                  className={`flex items-center justify-between gap-3 text-xs font-bold uppercase ${
                    overviewTotals.issueContractCount > 0 ? "text-rose-700" : "text-emerald-700"
                  }`}
                >
                  <span>Něco nesedí</span>
                  <AlertTriangle className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                </div>
                <div
                  className={`mt-2 text-2xl font-black ${
                    overviewTotals.issueContractCount > 0 ? "text-rose-950" : "text-emerald-950"
                  }`}
                >
                  {overviewTotals.issueContractCount}
                </div>
                <div
                  className={`mt-1 text-xs ${
                    overviewTotals.issueContractCount > 0 ? "text-rose-700" : "text-emerald-700"
                  }`}
                >
                  Rozdíly nebo varování
                </div>
              </div>
              <div
                className={`rounded-lg border bg-white px-3 py-3 ${
                  overviewTotals.unpairedContractCount > 0
                    ? "border-amber-200"
                    : "border-slate-200"
                }`}
              >
                <div
                  className={`flex items-center justify-between gap-3 text-xs font-bold uppercase ${
                    overviewTotals.unpairedContractCount > 0 ? "text-amber-700" : "text-slate-500"
                  }`}
                >
                  <span>Nespárované</span>
                  <UsersRound className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                </div>
                <div
                  className={`mt-2 text-2xl font-black ${
                    overviewTotals.unpairedContractCount > 0 ? "text-amber-950" : "text-slate-950"
                  }`}
                >
                  {overviewTotals.unpairedContractCount}
                </div>
                <div
                  className={`mt-1 text-xs ${
                    overviewTotals.unpairedContractCount > 0 ? "text-amber-700" : "text-slate-600"
                  }`}
                >
                  Nenalezeno / více shod / chyba
                </div>
              </div>
            </div>
            )}
          </div>
        </section>

        <input
          ref={fileInputRef}
          type="file"
          accept=".html,.htm,text/html"
          multiple
          className="hidden"
          onChange={(event) => {
            if (event.target.files) {
              void parseFiles(event.target.files);
            }
          }}
        />

        {processedStatementHistoryVisible && (
          <ProcessedStatementHistoryPanel
            statements={processedStatementHistory}
            loading={processedStatementHistoryLoading}
            error={processedStatementHistoryError}
            selectedId={selectedHistoryStatementId}
            openingId={openingHistoryStatementId}
            onRefresh={refreshProcessedStatementHistory}
            onOpen={(statementId) => {
              void openProcessedStatementFromHistory(statementId);
            }}
          />
        )}

        {(error || matchingError || pdfError || visibleStatementSaveMessage) && (
          <div className="space-y-3">
            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
                {error}
              </div>
            )}
            {matchingError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
                {matchingError}
              </div>
            )}
            {pdfError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
                {pdfError}
              </div>
            )}
            {visibleStatementSaveMessage && (
              <div
                className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-semibold ${
                  statementSaveState.status === "saved"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : statementSaveState.status === "saving"
                      ? "border-sky-200 bg-sky-50 text-sky-800"
                      : statementSaveState.status === "ready"
                        ? "border-slate-200 bg-white text-slate-800"
                        : "border-amber-200 bg-amber-50 text-amber-900"
                }`}
              >
                {statementSaveState.status === "saving" ? (
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} aria-hidden="true" />
                ) : statementSaveState.status === "saved" ? (
                  <CheckCircle2 className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                ) : statementSaveState.status === "ready" ? (
                  <ListChecks className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                ) : (
                  <AlertTriangle className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                )}
                {visibleStatementSaveMessage}
              </div>
            )}
          </div>
        )}

        {statementSaveState.status === "saved" && processingAuditSummary && (
          <ProcessingAuditPanel summary={processingAuditSummary} />
        )}

        {statements.length === 0 ? (
          <section
            className="group rounded-xl border border-dashed border-slate-300 bg-white px-5 py-9 text-center transition hover:border-slate-400"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              void parseFiles(event.dataTransfer.files);
            }}
          >
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 transition group-hover:bg-slate-100">
              <FileUp className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
            </div>
            <h2 className="mt-4 text-base font-black text-slate-950">
              Vyber HTML výpis
            </h2>
            <p className="mx-auto mt-1 max-w-md text-sm font-medium text-slate-500">
              Po nahrání se zobrazí přehled smluv, párování a nesrovnalosti.
            </p>
            <div className="mt-5 flex justify-center">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={parsing}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {parsing ? (
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} aria-hidden="true" />
                ) : (
                  <FileUp className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                )}
                Vybrat HTML
              </button>
            </div>
          </section>
        ) : freshUploadPairingInProgress ? (
          <section
            className="rounded-xl border border-slate-200 bg-white px-4 py-4 sm:px-5"
            aria-live="polite"
          >
            <MatchingProgressBar stats={matchStats} hasUser={Boolean(user)} />
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700">
              Výsledky kontroly zobrazím až po dokončení párování všech smluv.
            </div>
          </section>
        ) : (
          <div className="space-y-4">
            {statements.map((statement) => {
              const statementKey = statementDiscrepancyKey(statement);
              const statementLabel = statementDiscrepancyLabel(statement);
              const statementIdForActions =
                processedStatementIdsByKey[statementKey] ??
                (statements.length === 1 ? selectedHistoryStatementId : null);

              return (
                <StatementPreview
                  key={`${statement.fileName}-${statement.header.statementNumber ?? "bez-cisla"}`}
                  statement={statement}
                  matchesByContractNumber={matchesByContractNumber}
                  currentUserEmail={user?.email ?? null}
                  selectedStatementId={statementIdForActions}
                  onRequestSystemStorno={openStornoActionModal}
                  onConvertNeonRefresh={convertNeonRefreshFromStatement}
                  correctionContext={statementCorrectionContext}
                  markingControls={{
                    markingMode,
                    markedItems: markedDiscrepancies,
                    onToggleMarked: toggleMarkedDiscrepancy,
                    statementKey,
                    statementLabel,
                  }}
                />
              );
            })}

            <section className="rounded-xl border border-slate-200 bg-white px-4 py-4 sm:px-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="inline-flex items-center gap-2 text-xs font-bold uppercase text-slate-500">
                    <ReceiptText className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                    Zápis výpisu
                  </div>
                  <h2 className="mt-2 text-lg font-bold tracking-tight text-slate-950">
                    Zpracování výpisu
                  </h2>
                  <p className="mt-1 text-sm font-medium text-slate-600">
                    {statementRecordsProcessed
                      ? "Výpis byl zpracovaný."
                      : `${statements.length} ${
                          statements.length === 1 ? "výpis připravený" : "výpisů připraveno"
                        } ke zpracování.`}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    void processStatementRecords();
                  }}
                  disabled={
                    statementRecordsProcessing ||
                    statementRecordsProcessed ||
                    statementFilesForProcessing.length === 0
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {statementRecordsProcessing ? (
                    <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} aria-hidden="true" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                  )}
                  {statementRecordsProcessing
                    ? "Zpracovávám…"
                    : statementRecordsProcessed
                      ? "Výpis zpracován"
                      : "Zpracovat výpis"}
                </button>
              </div>

              {statementRecordsProcessing && (
                <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-4 text-sky-950">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-sky-700">
                      <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.3} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold">Zpracování běží</div>
                      <div className="mt-1 min-h-5 text-sm font-semibold text-sky-800">
                        {activeProcessingCaption}
                      </div>
                    </div>
                  </div>

                  <div
                    className="mt-4 h-2 overflow-hidden rounded-full bg-white"
                    role="progressbar"
                    aria-label="Průběh zpracování záznamu"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={processingProgressPercent}
                  >
                    <div
                      className="h-full rounded-full bg-slate-950 transition-all duration-700 ease-out"
                      style={{ width: `${processingProgressPercent}%` }}
                    />
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {PROCESSING_CAPTIONS.map((caption, index) => (
                      <span
                        key={caption}
                        className={`h-1.5 rounded-full transition-all duration-300 ${
                          index <= processingStepIndex
                            ? "w-8 bg-slate-950"
                            : "w-3 bg-white"
                        }`}
                        aria-hidden="true"
                      />
                    ))}
                  </div>
                </div>
              )}

            </section>
          </div>
        )}
      </div>

      {reportModalOpen && (
        <DiscrepancyPdfNotesModal
          items={selectedPdfItems}
          notes={discrepancyNotes}
          downloading={pdfDownloading}
          onNoteChange={(key, note) =>
            setDiscrepancyNotes((previous) => ({
              ...previous,
              [key]: note,
            }))
          }
          onClose={() => {
            if (!pdfDownloading) setReportModalOpen(false);
          }}
          onDownload={() => {
            void downloadSelectedDiscrepancies();
          }}
        />
      )}

      {contractDetailModal && (
        <BohemkaContractDetailModal
          detail={contractDetailModal}
          onClose={() => setContractDetailModal(null)}
        />
      )}

      {stornoActionTarget && (
        <StornoStatementActionModal
          target={stornoActionTarget}
          dateInput={stornoActionDateInput}
          saving={stornoActionSaving}
          error={stornoActionError}
          onDateChange={setStornoActionDateInput}
          onClose={closeStornoActionModal}
          onConfirm={() => {
            void confirmStornoAction();
          }}
        />
      )}

      {activeNeonRefreshPromptTarget && (
        <NeonRefreshConversionPromptModal
          target={activeNeonRefreshPromptTarget}
          totalCount={neonRefreshPromptTargets.length}
          saving={neonRefreshPromptSaving}
          error={neonRefreshPromptError}
          onClose={closeNeonRefreshPrompt}
          onConfirm={() => {
            void confirmNeonRefreshPrompt();
          }}
        />
      )}
      </AppLayout>
    </BohemkaContractDetailModalContext.Provider>
  );
}
