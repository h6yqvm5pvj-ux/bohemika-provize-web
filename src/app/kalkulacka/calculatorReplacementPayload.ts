import type { Product } from "../types/domain";

export function calculatorReplacementCommissionMetadata(product: Product, missingOriginal: boolean) {
  const provisional = missingOriginal && product !== "domexneuron";
  return {
    requiresStatementRefresh: provisional,
    commissionCalculationStatus: provisional ? "provisional_refresh_missing_original" : null,
    commissionBaseSource: provisional ? "calculator_provisional" : null,
  };
}

export function calculatorReplacementPayload({
  product,
  active,
  originalMissingInSystem,
  originalContractNumber,
}: {
  product: Product;
  active: boolean;
  originalMissingInSystem: boolean;
  originalContractNumber: string;
}) {
  const missing = active && (product === "neon" || product === "domexneuron") && originalMissingInSystem;
  return {
    ...calculatorReplacementCommissionMetadata(product, missing),
    isRefresh: active,
    refreshOriginalMissingInSystem: missing,
    refreshOriginalContractNumber: active && !(missing && product === "neon")
      ? originalContractNumber.trim() || null
      : null,
  };
}
