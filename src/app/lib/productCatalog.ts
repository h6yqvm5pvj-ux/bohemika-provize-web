import { type Product } from "@/app/types/domain";

export type ProductInstitutionId =
  | "cpp"
  | "kooperativa"
  | "maxima"
  | "allianz"
  | "slavia"
  | "uniqa"
  | "csob"
  | "pillow"
  | "axa"
  | "comfort";

export type ProductPrimaryCategory =
  | "life"
  | "auto"
  | "property"
  | "travel"
  | "comfort";

export type ProductGroup = ProductPrimaryCategory | "liability";

type ProductInstitutionMeta = {
  id: ProductInstitutionId;
  label: string;
  logoPath: string;
};

type ProductSeed = {
  label: string;
  icon: string;
  institutionId: ProductInstitutionId;
  category: ProductPrimaryCategory;
  extraGroups?: ProductGroup[];
};

export type ProductMetadata = {
  id: Product;
  label: string;
  icon: string;
  institutionId: ProductInstitutionId;
  institutionLabel: string;
  institutionLogo: string;
  category: ProductPrimaryCategory;
  groups: ReadonlyArray<ProductGroup>;
};

const INSTITUTIONS: Record<ProductInstitutionId, ProductInstitutionMeta> = {
  cpp: { id: "cpp", label: "ČPP", logoPath: "/icons/cpp.png" },
  kooperativa: { id: "kooperativa", label: "Kooperativa", logoPath: "/icons/koop-v2.png" },
  maxima: { id: "maxima", label: "Maxima", logoPath: "/icons/maxima.png" },
  allianz: { id: "allianz", label: "Allianz", logoPath: "/icons/allianz.png" },
  slavia: { id: "slavia", label: "SLAVIA", logoPath: "/icons/slavialogo.png" },
  uniqa: { id: "uniqa", label: "UNIQA", logoPath: "/icons/uniqa.png" },
  csob: { id: "csob", label: "ČSOB", logoPath: "/icons/csob.png" },
  pillow: { id: "pillow", label: "Pillow", logoPath: "/icons/pillow.png" },
  axa: { id: "axa", label: "AXA", logoPath: "/icons/axalogo.png" },
  comfort: { id: "comfort", label: "Comfort Commodity", logoPath: "/icons/cclogo.png" },
};

export const INSTITUTION_CATALOG = INSTITUTIONS;

export const PRODUCT_ORDER: Product[] = [
  "neon",
  "flexi",
  "maximaMaxEfekt",
  "pillowInjury",
  "zamex",
  "domex",
  "cpphafan",
  "pillowmajetek",
  "koopmajetekobcan",
  "koopfit",
  "maxdomov",
  "allianzmujdomov",
  "cppsimplex",
  "cppAuto",
  "slaviaauto",
  "cppPPRs",
  "cppPPRbez",
  "allianzAuto",
  "csobAuto",
  "uniqaAuto",
  "uniqaflotila",
  "pillowAuto",
  "kooperativaAuto",
  "koopcestovko",
  "cppcestovko",
  "axacestovko",
  "maxcizinkomplex",
  "comfortcc",
];

const PRODUCT_SEEDS: Record<Product, ProductSeed> = {
  neon: {
    label: "ČPP ŽP NEON",
    icon: "/icons/zivot.png",
    institutionId: "cpp",
    category: "life",
  },
  flexi: {
    label: "Kooperativa ŽP FLEXI",
    icon: "/icons/zivot.png",
    institutionId: "kooperativa",
    category: "life",
  },
  maximaMaxEfekt: {
    label: "MAXIMA ŽP MaxEfekt",
    icon: "/icons/zivot.png",
    institutionId: "maxima",
    category: "life",
  },
  pillowInjury: {
    label: "Pillow Úraz / Nemoc",
    icon: "/icons/zivot.png",
    institutionId: "pillow",
    category: "life",
  },
  zamex: {
    label: "ČPP ZAMEX",
    icon: "/icons/icon_zamex.png",
    institutionId: "cpp",
    category: "property",
    extraGroups: ["liability"],
  },
  domex: {
    label: "ČPP DOMEX",
    icon: "/icons/icon_domex.png",
    institutionId: "cpp",
    category: "property",
    extraGroups: ["liability"],
  },
  cpphafan: {
    label: "ČPP HAFAN",
    icon: "/icons/icon_domex.png",
    institutionId: "cpp",
    category: "property",
  },
  pillowmajetek: {
    label: "Pillow Majetek",
    icon: "/icons/icon_domex.png",
    institutionId: "pillow",
    category: "property",
  },
  koopmajetekobcan: {
    label: "Kooperativa Pojištění majetku a odpovědnosti občanů a právní ochrany",
    icon: "/icons/icon_domex.png",
    institutionId: "kooperativa",
    category: "property",
  },
  koopfit: {
    label: "Kooperativa Sportovní výbava FIT",
    icon: "/icons/icon_domex.png",
    institutionId: "kooperativa",
    category: "property",
  },
  maxdomov: {
    label: "Maxima MAXDOMOV",
    icon: "/icons/icon_domex.png",
    institutionId: "maxima",
    category: "property",
  },
  allianzmujdomov: {
    label: "Allianz MůjDomov",
    icon: "/icons/icon_domex.png",
    institutionId: "allianz",
    category: "property",
  },
  cppsimplex: {
    label: "ČPP Simplex",
    icon: "/icons/icon_domex.png",
    institutionId: "cpp",
    category: "property",
  },
  cppAuto: {
    label: "ČPP Auto",
    icon: "/icons/icon_auto.png",
    institutionId: "cpp",
    category: "auto",
  },
  slaviaauto: {
    label: "SLAVIA Auto",
    icon: "/icons/icon_auto.png",
    institutionId: "slavia",
    category: "auto",
  },
  cppPPRs: {
    label: "ČPP Pojištění majetku a odpovědnosti podnikatelů – ÚPIS",
    icon: "/icons/icon_domex.png",
    institutionId: "cpp",
    category: "property",
    extraGroups: ["liability"],
  },
  cppPPRbez: {
    label: "ČPP Pojištění majetku a odpovědnosti podnikatelů",
    icon: "/icons/icon_domex.png",
    institutionId: "cpp",
    category: "property",
    extraGroups: ["liability"],
  },
  allianzAuto: {
    label: "Allianz Auto",
    icon: "/icons/icon_auto.png",
    institutionId: "allianz",
    category: "auto",
  },
  csobAuto: {
    label: "ČSOB Auto",
    icon: "/icons/icon_auto.png",
    institutionId: "csob",
    category: "auto",
  },
  uniqaAuto: {
    label: "UNIQA Auto",
    icon: "/icons/icon_auto.png",
    institutionId: "uniqa",
    category: "auto",
  },
  uniqaflotila: {
    label: "UNIQA Auto Flotila",
    icon: "/icons/icon_auto.png",
    institutionId: "uniqa",
    category: "auto",
  },
  pillowAuto: {
    label: "Pillow Auto",
    icon: "/icons/icon_auto.png",
    institutionId: "pillow",
    category: "auto",
  },
  kooperativaAuto: {
    label: "Kooperativa Auto",
    icon: "/icons/icon_auto.png",
    institutionId: "kooperativa",
    category: "auto",
  },
  koopcestovko: {
    label: "Kooperativa Cestovko",
    icon: "/icons/icon_cestovko.png",
    institutionId: "kooperativa",
    category: "travel",
  },
  cppcestovko: {
    label: "ČPP Cestovko",
    icon: "/icons/icon_cestovko.png",
    institutionId: "cpp",
    category: "travel",
  },
  axacestovko: {
    label: "AXA Cestovko",
    icon: "/icons/icon_cestovko.png",
    institutionId: "axa",
    category: "travel",
  },
  maxcizinkomplex: {
    label: "MAXIMA Komplexní zdravotní pojištění cizinců",
    icon: "/icons/icon_cestovko.png",
    institutionId: "maxima",
    category: "travel",
  },
  comfortcc: {
    label: "Comfort Commodity",
    icon: "/icons/trezor.png",
    institutionId: "comfort",
    category: "comfort",
  },
};

const catalogEntries = PRODUCT_ORDER.map((id) => {
  const seed = PRODUCT_SEEDS[id];
  const institution = INSTITUTIONS[seed.institutionId];
  const groups = Array.from(
    new Set<ProductGroup>([seed.category, ...(seed.extraGroups ?? [])])
  );
  const entry: ProductMetadata = {
    id,
    label: seed.label,
    icon: seed.icon,
    institutionId: seed.institutionId,
    institutionLabel: institution.label,
    institutionLogo: institution.logoPath,
    category: seed.category,
    groups,
  };
  return entry;
});

export const PRODUCT_CATALOG: Record<Product, ProductMetadata> =
  Object.fromEntries(catalogEntries.map((entry) => [entry.id, entry])) as Record<
    Product,
    ProductMetadata
  >;

function byCategory(category: ProductPrimaryCategory): Product[] {
  return PRODUCT_ORDER.filter((product) => PRODUCT_CATALOG[product].category === category);
}

export const LIFE_PRODUCTS = byCategory("life");
export const AUTO_PRODUCTS = byCategory("auto");
export const PROPERTY_PRODUCTS = byCategory("property");
export const TRAVEL_PRODUCTS = byCategory("travel");
export const COMFORT_PRODUCTS = byCategory("comfort");
export const LIABILITY_PRODUCTS = PRODUCT_ORDER.filter((product) =>
  PRODUCT_CATALOG[product].groups.includes("liability")
);

export const PRODUCT_OPTIONS: { id: Product; label: string }[] = PRODUCT_ORDER.map(
  (id) => ({
    id,
    label: PRODUCT_CATALOG[id].label,
  })
);

export function getProductMetadata(product?: Product | null): ProductMetadata | null {
  if (!product) return null;
  return PRODUCT_CATALOG[product] ?? null;
}

export function productLabel(
  product?: Product | null,
  fallback = "Neznámý produkt"
): string {
  return getProductMetadata(product)?.label ?? fallback;
}

export function productIcon(
  product?: Product | null,
  fallback = "/icons/produkt.png"
): string {
  return getProductMetadata(product)?.icon ?? fallback;
}

export function productInstitutionId(
  product?: Product | null
): ProductInstitutionId | null {
  return getProductMetadata(product)?.institutionId ?? null;
}

export function productInstitutionLabel(
  product?: Product | null,
  fallback: string | null = null
): string | null {
  return getProductMetadata(product)?.institutionLabel ?? fallback;
}

export function productInstitutionLogo(
  product?: Product | null,
  fallback: string | null = null
): string | null {
  return getProductMetadata(product)?.institutionLogo ?? fallback;
}

export function productCategory(product?: Product | null): ProductPrimaryCategory | null {
  return getProductMetadata(product)?.category ?? null;
}

export function hasProductGroup(
  product: Product | null | undefined,
  group: ProductGroup
): boolean {
  const meta = getProductMetadata(product);
  return meta ? meta.groups.includes(group) : false;
}

export function isLifeProduct(product?: Product | null): boolean {
  return productCategory(product) === "life";
}

export function isAutoProduct(product?: Product | null): boolean {
  return productCategory(product) === "auto";
}

export function isPropertyProduct(product?: Product | null): boolean {
  return productCategory(product) === "property";
}

export function isTravelProduct(product?: Product | null): boolean {
  return productCategory(product) === "travel";
}

export function isComfortProduct(product?: Product | null): boolean {
  return productCategory(product) === "comfort";
}
