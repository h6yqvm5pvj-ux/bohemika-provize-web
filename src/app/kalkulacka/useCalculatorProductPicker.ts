import { useCallback, useEffect, useMemo, useState } from "react";

import { type Product } from "../types/domain";
import { productLabel as productLabelFromCatalog } from "@/app/lib/productCatalog";
import { productInstitutionLabel } from "./calculatorHelpers";

export type ProductPickerSectionKey =
  | "life"
  | "property"
  | "auto"
  | "entrepreneurs"
  | "travel"
  | "foreigners"
  | "investments"
  | "gold";

export type ProductPickerColumn = {
  key: ProductPickerSectionKey;
  title: string;
  products: Product[];
  emptyText?: string;
};

export const PRODUCT_PICKER_COLUMNS: ProductPickerColumn[] = [
  {
    key: "life",
    title: "Život",
    products: ["neon", "flexi", "maximaMaxEfekt", "pillowInjury"],
  },
  {
    key: "property",
    title: "Majetek",
    products: [
      "domexneuron",
      "domex",
      "cppbytex",
      "cpphafan",
      "pillowmajetek",
      "koopmajetekobcan",
      "koopfit",
      "koopodzam",
      "maxdomov",
      "allianzmujdomov",
    ],
  },
  {
    key: "auto",
    title: "Auto",
    products: [
      "cppAuto",
      "slaviaauto",
      "slaviaflotila",
      "allianzAuto",
      "csobAuto",
      "uniqaAuto",
      "uniqaflotila",
      "pillowAuto",
      "kooperativaAuto",
      "koopflotila",
    ],
  },
  {
    key: "entrepreneurs",
    title: "Podnikatele",
    products: ["zamex", "cppPPRbez", "cppPPRs", "cppsimplex", "kooppmop"],
  },
  {
    key: "travel",
    title: "Cestovko",
    products: ["cppcestovko", "axacestovko", "koopcestovko"],
  },
  {
    key: "foreigners",
    title: "Cizinci",
    products: ["maxcizinkomplex"],
  },
  {
    key: "investments",
    title: "Investice",
    products: [],
    emptyText: "Zatím bez produktů.",
  },
  {
    key: "gold",
    title: "Zlato",
    products: ["comfortcc"],
  },
];

const PRODUCT_PICKER_COLUMN_BY_KEY = new Map<ProductPickerSectionKey, ProductPickerColumn>(
  PRODUCT_PICKER_COLUMNS.map((column) => [column.key, column] as const)
);

function productPickerSectionForProduct(product: Product | null): ProductPickerSectionKey {
  if (!product) return "life";
  for (const column of PRODUCT_PICKER_COLUMNS) {
    if (column.products.includes(product)) return column.key;
  }
  return "life";
}

function normalizeProductPickerSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

type UseCalculatorProductPickerArgs = {
  product: Product | null;
  onProductSelect: (nextProduct: Product) => void;
};

export function useCalculatorProductPicker({
  product,
  onProductSelect,
}: UseCalculatorProductPickerArgs) {
  const [isOpen, setIsOpen] = useState(false);
  const [sectionKey, setSectionKey] = useState<ProductPickerSectionKey>(() =>
    productPickerSectionForProduct(product)
  );
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  const allProducts = useMemo(
    () => PRODUCT_PICKER_COLUMNS.flatMap((column) => column.products),
    []
  );
  const activeColumn =
    PRODUCT_PICKER_COLUMN_BY_KEY.get(sectionKey) ?? PRODUCT_PICKER_COLUMNS[0];
  const searchQuery = normalizeProductPickerSearch(searchText);
  const isGlobalSearch = searchQuery.length > 0;
  const filteredProducts = useMemo(() => {
    const sourceProducts = isGlobalSearch ? allProducts : activeColumn.products;
    if (!searchQuery) return sourceProducts;

    return sourceProducts.filter((productId) => {
      const haystack = normalizeProductPickerSearch(
        [
          productLabelFromCatalog(productId, productId),
          productInstitutionLabel(productId),
        ].join(" ")
      );
      return haystack.includes(searchQuery);
    });
  }, [activeColumn.products, allProducts, isGlobalSearch, searchQuery]);

  const open = useCallback(() => {
    setSectionKey(productPickerSectionForProduct(product));
    setSearchText("");
    setIsOpen(true);
  }, [product]);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggle = useCallback(() => {
    if (isOpen) {
      setIsOpen(false);
      return;
    }
    setSectionKey(productPickerSectionForProduct(product));
    setSearchText("");
    setIsOpen(true);
  }, [isOpen, product]);

  const selectProduct = useCallback(
    (nextProduct: Product) => {
      onProductSelect(nextProduct);
      setIsOpen(false);
    },
    [onProductSelect]
  );

  const setSectionForProduct = useCallback((nextProduct: Product) => {
    setSectionKey(productPickerSectionForProduct(nextProduct));
    setSearchText("");
  }, []);

  return {
    isOpen,
    open,
    close,
    toggle,
    sectionKey,
    setSectionKey,
    setSectionForProduct,
    searchText,
    setSearchText,
    columns: PRODUCT_PICKER_COLUMNS,
    activeColumn,
    allProducts,
    isGlobalSearch,
    filteredProducts,
    selectProduct,
  };
}
