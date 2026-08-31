import type { Product } from "@/app/types/domain";

type OriginalContractReplacementCapability = {
  product: Product;
  productLabel: string;
  workflowLabel: "Refresh" | "Náhrada";
  canSaveUnlinkedOriginal: boolean;
  stornoTiming: "policyStart" | "previousDay";
};

export const ORIGINAL_CONTRACT_REPLACEMENT_CAPABILITIES = [
  {
    product: "neon",
    productLabel: "ČPP ŽP NEON",
    workflowLabel: "Refresh",
    canSaveUnlinkedOriginal: false,
    stornoTiming: "policyStart",
  },
  {
    product: "domex",
    productLabel: "DOMEX",
    workflowLabel: "Náhrada",
    canSaveUnlinkedOriginal: true,
    stornoTiming: "policyStart",
  },
  {
    product: "cppAuto",
    productLabel: "ČPP Auto",
    workflowLabel: "Náhrada",
    canSaveUnlinkedOriginal: true,
    stornoTiming: "previousDay",
  },
  {
    product: "allianzAuto",
    productLabel: "Allianz Auto",
    workflowLabel: "Náhrada",
    canSaveUnlinkedOriginal: true,
    stornoTiming: "previousDay",
  },
] as const satisfies readonly OriginalContractReplacementCapability[];

export const ORIGINAL_CONTRACT_REPLACEMENT_PRODUCTS =
  ORIGINAL_CONTRACT_REPLACEMENT_CAPABILITIES.map(({ product }) => product);

export const ORIGINAL_CONTRACT_REPLACEMENT_SUPPORT_LABEL =
  "ČPP ŽP NEON, DOMEX, ČPP Auto a Allianz Auto";

const ORIGINAL_CONTRACT_REPLACEMENT_CAPABILITY_MAP = new Map<
  Product,
  OriginalContractReplacementCapability
>(
  ORIGINAL_CONTRACT_REPLACEMENT_CAPABILITIES.map((capability) => [
    capability.product,
    capability,
  ]),
);

function replacementCapability(
  product: Product | null | undefined,
): OriginalContractReplacementCapability | undefined {
  return product
    ? ORIGINAL_CONTRACT_REPLACEMENT_CAPABILITY_MAP.get(product)
    : undefined;
}

export function supportsOriginalContractReplacement(
  product: Product | null | undefined,
): boolean {
  return Boolean(replacementCapability(product));
}

export function canSaveUnlinkedOriginalReplacement(
  product: Product | null | undefined,
): boolean {
  return replacementCapability(product)?.canSaveUnlinkedOriginal === true;
}

export function usesPreviousDayReplacementStorno(
  product: Product | null | undefined,
): boolean {
  return replacementCapability(product)?.stornoTiming === "previousDay";
}

export function originalReplacementLabel(
  product: Product | null | undefined,
): "Refresh" | "Náhrada" {
  return replacementCapability(product)?.workflowLabel ?? "Náhrada";
}

export function originalReplacementProductLabel(
  product: Product | null | undefined,
): string {
  return replacementCapability(product)?.productLabel ?? "daný produkt";
}

export function originalReplacementStornoDescription(
  product: Product | null | undefined,
): string {
  return usesPreviousDayReplacementStorno(product)
    ? "jeden den před datem počátku nové smlouvy"
    : "ke dni počátku nové smlouvy";
}
