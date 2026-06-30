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

export const ALLIANZ_PAYMENT_CHECK_URL =
  "https://www.allianz.cz/cs_CZ/apps/zaplacenost-pojistky.html";
export const SLAVIA_PAYMENT_CHECK_URL = "https://www.slavia-pojistovna.cz/over-ps/";
export const CPP_PAYMENT_CHECK_URL =
  "https://insure.cpp.cz/GolemWEB/B2C/www/mobily/m_smlv_login.xhtml#kotva";
export const KOOPERATIVA_PAYMENT_CHECK_URL =
  "https://insure.koop.cz/GolemWEB/B2C/www/mobily/m_smlv_login.xhtml";
export const CPP_PAYMENT_CHECK_PRODUCTS = new Set<Product>([
  "neon",
  "zamex",
  "domex",
  "cpphafan",
  "cppsimplex",
  "cppAuto",
  "cppPPRs",
  "cppPPRbez",
  "cppcestovko",
]);
export const KOOPERATIVA_PAYMENT_CHECK_PRODUCTS = new Set<Product>([
  "flexi",
  "koopmajetekobcan",
  "koopfit",
  "kooperativaAuto",
  "koopcestovko",
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
