import { type CommissionMode, type Position, type Product } from "../../types/domain";
import {
  buildNeonImmediateBreakdown,
  hasNeonImmediateCoefficient,
  type NeonImmediateBreakdown,
} from "../../lib/productFormulas/neon";
import { normalizeTitleForCompare } from "./contractDetailHelpers";
import { type ContractDoc } from "./contractDetailTypes";

export {
  buildNeonImmediateBreakdown,
  hasNeonImmediateCoefficient,
  type NeonImmediateBreakdown,
};

export const LIFE_PRODUCT_KEYS = new Set<Product>([
  "neon",
  "flexi",
  "maximaMaxEfekt",
  "pillowInjury",
]);

export type ContractsApiError = Error & { status?: number };

export type ContractsApiResponseBase = {
  ok?: boolean;
  error?: string;
};

type ContractOwnerMetaApi = {
  position?: Position | null;
  managerEmail?: string | null;
  managerPosition?: Position | null;
  currentChainEmails?: string[];
};

export type ContractDetailApiResponse = ContractsApiResponseBase & {
  mode?: "detail";
  position?: Position | null;
  hasTeam?: boolean;
  teamEmails?: string[];
  canManageContract?: boolean;
  contract?: ContractDoc;
  timeline?: ContractDoc[];
  ownerMeta?: ContractOwnerMetaApi | null;
};

export const toCommissionMode = (value: unknown): CommissionMode | null =>
  value === "accelerated" || value === "standard" ? value : null;

export const isImmediateCommissionTitle = (title: string): boolean => {
  const normalized = normalizeTitleForCompare(title);
  return (
    normalized.includes("okamžitá provize") ||
    normalized.includes("provize a101") ||
    normalized.includes("provize b0301") ||
    normalized.includes("50% z b3601") ||
    normalized.includes("50% z b36")
  );
};
