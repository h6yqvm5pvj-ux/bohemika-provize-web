import { type CommissionMode, type Position, type Product } from "../../types/domain";
import {
  buildNeonImmediateBreakdown,
  hasNeonImmediateCoefficient,
  type NeonImmediateBreakdown,
} from "../../lib/productFormulas/neon";
export { isImmediateCommissionTitle } from "../../lib/commissionTotals";
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
  canTransferContracts?: boolean;
  transferTargets?: {
    email: string;
    name: string | null;
    position: Position | null;
  }[];
  contract?: ContractDoc;
  timeline?: ContractDoc[];
  ownerMeta?: ContractOwnerMetaApi | null;
};

export const toCommissionMode = (value: unknown): CommissionMode | null =>
  value === "accelerated" || value === "standard" ? value : null;
