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
  ownerEmail: string | null;
  entryId: string | null;
  isManagerOverride?: boolean;
  isTipPayout?: boolean;
  tipSourceAdviserEmail?: string | null;
};

export type MonthGroup = {
  key: string;
  year: number;
  monthIndex: number;
  label: string;
  total: number;
  items: CashflowItem[];
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
  | "other"
  | "gold";

export type ScopeFilter = "combined" | "own" | "team";
