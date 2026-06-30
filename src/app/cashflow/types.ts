import type {
  CommissionMode,
  CommissionResultItemDTO,
  PaymentFrequency,
  Position,
  Product,
} from "../types/domain";

export type FirestoreTimestamp = {
  seconds: number;
  nanoseconds: number;
};

export type EntryDoc = {
  id: string;
  originalEntryId?: string | null;
  status?: "active" | "storno" | string | null;
  stornoDate?: unknown;

  productKey?: Product;
  frequencyRaw?: PaymentFrequency | null;
  total?: number;
  items?: CommissionResultItemDTO[];

  userEmail?: string | null;
  contractSignedDate?: unknown;
  position?: Position | null;
  mode?: CommissionMode | null;
  commissionMode?: CommissionMode | null;
  managerEmailSnapshot?: string | null;
  managerPositionSnapshot?: Position | null;
  managerModeSnapshot?: CommissionMode | null;
  managerChain?: {
    email: string | null;
    position: Position | null;
    commissionMode: CommissionMode | null;
  }[];
  managerOverrides?: {
    email: string | null;
    position: Position | null;
    commissionMode: CommissionMode | null;
    items: CommissionResultItemDTO[];
    total: number;
  }[];
  inputAmount?: number | null;
  contractNumber?: string | null;
  clientName?: string | null;
  comfortPayment?: number | null;
  comfortGradual?: boolean | null;
  comfortTargetAmount?: number | null;

  policyStartDate?: unknown;
  policyEndDate?: unknown;
  createdAt?: unknown;
  durationYears?: number | null;
  durationMonths?: number | null;
  maxCizinKomplexVariant?: "exclusiveStandard" | "premium" | null;
  source?: "own" | "manager";
};

export type CashflowItem = {
  id: string;
  date: Date;
  amount: number;
  productKey: Product | "unknown";
  note?: string | null;
  frequency?: PaymentFrequency | null;
  source?: "own" | "manager";
  contractNumber?: string | null;
  clientName?: string | null;
  inputAmount?: number | null;
  policyStartDate?: Date | null;
  contractStatus?: "active" | "storno" | "dozita" | string | null;
  ownerEmail: string | null;
  entryId: string | null;
  isManagerOverride?: boolean;
  commissionCode?: string | null;
  commissionCodeAliases?: string[];
  commissionLabel?: string | null;
  isTipPayout?: boolean;
  tipSourceAdviserEmail?: string | null;
  tipSourceAdviserName?: string | null;
  payoutStatus?: "predicted" | "paid" | "shifted";
  originalDate?: Date | null;
  missedStatementPeriods?: string[];
};

export type MonthGroup = {
  key: string;
  year: number;
  monthIndex: number;
  label: string;
  total: number;
  predictedTotal: number;
  totalSource: "predicted" | "paid";
  statementPayoutTotal: number | null;
  items: CashflowItem[];
};

export type CashflowCommissionStatementSummary = {
  id: string;
  fileName: string;
  statementNumber: string | null;
  statementDate: string | null;
  period: string | null;
  advisorNumber: string | null;
  periodStartMs: number | null;
  periodEndMs: number | null;
  statementDateMs: number | null;
  payoutMonthKey: string | null;
  paidContractNumbers: string[];
  paidCommissionKeys: string[];
  commissionTotal: number;
  payoutTotal: number | null;
  otherPaymentsTotal: number;
  managerCommissionTotal: number;
  createdAtMs: number | null;
  updatedAtMs: number | null;
};

export type CashflowCommissionStatementDetail = CashflowCommissionStatementSummary & {
  html: string;
};

export type YearGroup = {
  year: number;
  total: number;
  months: MonthGroup[];
};

export type ProductFilter =
  | "all"
  | "tip"
  | "life"
  | "auto"
  | "property"
  | "entrepreneurs"
  | "travel"
  | "foreigners"
  | "gold";

export type ScopeFilter = "combined" | "own" | "team";
