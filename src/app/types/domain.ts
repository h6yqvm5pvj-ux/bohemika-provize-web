// src/types/domain.ts

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
  | "comfortcc";

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

export type PaymentFrequency =
  | "monthly"
  | "quarterly"
  | "semiannual"
  | "annual";

export type CommissionMode = "accelerated" | "standard";

export interface CommissionResultItemDTO {
  title: string;
  amount: number;
  note?: string;
}

export interface CommissionResultDTO {
  items: CommissionResultItemDTO[];
  total: number;
}