import { PRODUCT_CATALOG, type ProductPrimaryCategory } from "@/app/lib/productCatalog";
import type { Product } from "@/app/types/domain";
import type { ClientContractItem } from "./clientCardHelpers";

export const CLIENT_PRODUCT_GROUPS = [
  { value: "auto", label: "Auto" },
  { value: "propertyLiability", label: "Majetek a odpovědnost" },
  { value: "life", label: "Život" },
  { value: "entrepreneurs", label: "Podnikatelé" },
  { value: "travel", label: "Cestování" },
  { value: "pension", label: "Penze" },
  { value: "investment", label: "Investice" },
  { value: "other", label: "Ostatní" },
] as const;

export type ClientProductGroup = typeof CLIENT_PRODUCT_GROUPS[number]["value"];
export type ClientProductFilter = "all" | ClientProductGroup;

const CATEGORY_GROUPS: Record<ProductPrimaryCategory, ClientProductGroup> = {
  auto: "auto",
  property: "propertyLiability",
  life: "life",
  travel: "travel",
  pension: "pension",
  comfort: "investment",
};

// Keep the business portfolio consistent with Contracts and the anniversary radar.
const ENTREPRENEUR_PRODUCTS = new Set<string>([
  "cppsimplex",
  "kooppmop",
  "cppPPRs",
  "cppPPRbez",
]);

export function clientProductGroup(product: ClientContractItem["productKey"]): ClientProductGroup {
  if (!product || !Object.prototype.hasOwnProperty.call(PRODUCT_CATALOG, product)) return "other";
  if (ENTREPRENEUR_PRODUCTS.has(product)) return "entrepreneurs";
  return CATEGORY_GROUPS[PRODUCT_CATALOG[product as Product].category];
}
