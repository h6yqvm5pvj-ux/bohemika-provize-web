// src/types/domain.ts

// 👉 stejné produkty jako v iOS enum Product
export type Product =
  | "neon"
  | "flexi"
  | "maximaMaxEfekt"
  | "pillowInjury"
  | "zamex"
  | "domex"
  | "maxdomov"
  | "cppAuto"
  | "allianzAuto"
  | "csobAuto"
  | "uniqaAuto"
  | "pillowAuto"
  | "kooperativaAuto"
  | "cppcestovko"
  | "axacestovko"
  | "comfortcc"
  | "cppPPRs"
  | "cppPPRbez";

// 👉 PaymentFrequency (.monthly, .quarterly, …)
export type PaymentFrequency =
  | "monthly"
  | "quarterly"
  | "semiannual"
  | "annual";

// 👉 CommissionMode (.accelerated / .standard)
export type CommissionMode = "accelerated" | "standard";

// 👉 Pozice – stejné názvy jako ve Swiftu
export type Position =
  | "poradce1"
  | "poradce2"
  | "poradce3"
  | "poradce4"
  | "poradce5"
  | "poradce6"
  | "poradce7"
  | "poradce8"
  | "poradce9"
  | "poradce10"
  | "manazer4"
  | "manazer5"
  | "manazer6"
  | "manazer7"
  | "manazer8"
  | "manazer9"
  | "manazer10";

// ---------- Výsledky provize (CommissionResultDTO) ----------

export interface CommissionResultItemDTO {
  title: string;
  amount: number;
  note?: string | null;
}

export interface CommissionResultDTO {
  items: CommissionResultItemDTO[];
  total: number;
}

// ---------- Comfort Commodity pomocné typy ----------

export type ComfortVariant = "lumpSum" | "savings"; // Jednorázový nákup / Spoření
export type ComfortFeeType = "upfront" | "gradual"; // Jednorázový / Postupný poplatek

// ---------- CommissionEntry (to co ukládáš do historie) ----------

export interface CommissionEntry {
  productKey: Product;               // selectedProduct.rawValue
  createdAt: Date;                   // agreementDate
  position: Position;                // Store.shared.position
  inputAmount: number;               // input / fee / payment
  frequencyRaw?: PaymentFrequency | null; // selectedFrequency.rawValue nebo null (comfortcc)
  result: CommissionResultDTO;       // result DTO
  contractNumber?: string | null;
  premiumFrequencyRaw?: string | null;   // zatím neřešíme – může být vždy null
  userEmail?: string | null;             // iOS má zatím nil, na webu doplníme z Firebase
  clientName?: string | null;
  policyStartDate: Date;             // policyStartDate
  durationYears?: number | null;     // u NEON/MaxEfekt, jinak null
}

// ---------- „Store“ – to co je teď Store.shared ----------

export interface StoreState {
  position: Position;               // v appce se bere ze Store.shared.position
  commissionMode: CommissionMode;   // Store.shared.commissionMode
}

// ---------- Stav kalkulačky (TS obdoba CalculatorViewModel) ----------

export interface CalculatorFormState {
  // z UI
  selectedProduct: Product;
  inputText: string;
  selectedFrequency: PaymentFrequency;
  contractNumber: string;
  clientName: string;
  agreementDate: Date;     // Date v JS = podobná jako Swift Date
  policyStartDate: Date;
  durationYears: number;

  // Comfort Commodity
  comfortVariant: ComfortVariant;
  comfortFeeType: ComfortFeeType;
  comfortFeeText: string;
  comfortPaymentText: string;

  // výstupy
  resultItems: CommissionResultItemDTO[];
  total: number;
}
