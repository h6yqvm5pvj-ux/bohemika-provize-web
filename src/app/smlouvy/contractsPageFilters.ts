import type { Product } from "@/app/types/domain";
import {
  AUTO_PRODUCTS,
  COMFORT_PRODUCTS,
  INSTITUTION_CATALOG,
  LIFE_PRODUCTS as LIFE_PRODUCTS_LIST,
  LIABILITY_PRODUCTS,
  PRODUCT_CATALOG,
  PRODUCT_ORDER,
  PROPERTY_PRODUCTS,
  TRAVEL_PRODUCTS,
  productInstitutionId,
} from "@/app/lib/productCatalog";
import type { Institution, ProductCategory } from "./contractsPageTypes";

export const CONTRACT_PROPERTY_PRODUCTS: Product[] = PROPERTY_PRODUCTS.filter(
  (product) => product !== "zamex"
);

export const PRODUCT_CATEGORY_MAP: Record<ProductCategory, Product[]> = {
  life: LIFE_PRODUCTS_LIST,
  auto: AUTO_PRODUCTS,
  property: CONTRACT_PROPERTY_PRODUCTS,
  travel: TRAVEL_PRODUCTS,
  comfort: COMFORT_PRODUCTS,
  liability: LIABILITY_PRODUCTS,
};

export const CATEGORY_DEFS: { id: ProductCategory; label: string }[] = [
  { id: "life", label: "Životní pojištění" },
  { id: "auto", label: "Auto" },
  { id: "property", label: "Majetek" },
  { id: "travel", label: "Cestovko" },
  { id: "comfort", label: "Comfort Commodity" },
  { id: "liability", label: "Odpovědnost" },
];

export const INSTITUTION_DEFS: { id: Institution; label: string }[] = Array.from(
  new Map(
    PRODUCT_ORDER.map((product) => {
      const meta = PRODUCT_CATALOG[product];
      return [meta.institutionId, meta.institutionLabel] as const;
    })
  ).entries()
).map(([id, label]) => ({
  id,
  label,
}));

export const INSTITUTION_LOGO_BY_ID: Partial<Record<Institution, string>> = Object.fromEntries(
  INSTITUTION_DEFS.map((inst) => [
    inst.id,
    INSTITUTION_CATALOG[inst.id].logoPath,
  ])
) as Partial<Record<Institution, string>>;

function productMatchesCategory(
  product: Product | undefined,
  categories: Set<ProductCategory>
): boolean {
  if (!product) return false;
  if (categories.size === 0) return true;
  for (const cat of categories) {
    const list = PRODUCT_CATEGORY_MAP[cat];
    if (list.includes(product)) return true;
  }
  return false;
}

function productMatchesInstitution(
  product: Product | undefined,
  institutions: Set<Institution>
): boolean {
  if (!product) return false;
  if (institutions.size === 0) return true;
  const inst = productInstitutionId(product);
  if (!inst) return false;
  return institutions.has(inst);
}

export function productMatchesFilters(
  product: Product | undefined,
  categories: Set<ProductCategory>,
  institutions: Set<Institution>
): boolean {
  return (
    productMatchesCategory(product, categories) &&
    productMatchesInstitution(product, institutions)
  );
}
