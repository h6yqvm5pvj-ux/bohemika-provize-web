import type {
  CommissionMode,
  CommissionResultItemDTO,
  PaymentFrequency,
  Position,
  Product,
} from "../types/domain";
import type { CashflowSubscriptionPlan } from "./subscriptionCashflow";

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

export type CashflowProductKey = Product | "unknown" | "subscription";

export type CashflowItem = {
  id: string;
  date: Date;
  amount: number;
  productKey: CashflowProductKey;
  note?: string | null;
  frequency?: PaymentFrequency | null;
  source?: "own" | "manager";
  contractNumber?: string | null;
  clientName?: string | null;
  inputAmount?: number | null;
  policyStartDate?: Date | null;
  contractStatus?: "active" | "storno" | "dozita" | string | null;
  stornoDate?: Date | null;
  ownerEmail: string | null;
  entryId: string | null;
  isManagerOverride?: boolean;
  commissionCode?: string | null;
  commissionCodeAliases?: string[];
  commissionLabel?: string | null;
  isTipPayout?: boolean;
  tipSourceAdviserEmail?: string | null;
  tipSourceAdviserName?: string | null;
  isSubscriptionPayment?: boolean;
  subscriptionPlan?: CashflowSubscriptionPlan | null;
  subscriptionUserEmail?: string | null;
  subscriptionUserName?: string | null;
  subscriptionPeriodFrom?: string | null;
  subscriptionPeriodUntil?: string | null;
  payoutStatus?: "predicted" | "paid" | "shifted";
  predictedAmount?: number | null;
  isStatementOnly?: boolean;
  commissionPayoutKey?: string | null;
  commissionStatementNumber?: string | null;
  commissionStatementPeriod?: string | null;
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
  | "subscription"
  | "life"
  | "auto"
  | "property"
  | "entrepreneurs"
  | "travel"
  | "foreigners"
  | "gold";

export type ScopeFilter = "combined" | "own" | "team";
