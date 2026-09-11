"use client";

import Image from "next/image";
import {
  ArrowRight, BriefcaseBusiness, CarFront, Check, ChartNoAxesCombined,
  Coins, Globe2, HeartPulse, House, Package, PiggyBank, Plane, Search, SearchX, X,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import { type Product } from "../types/domain";
import { SUPPORTED_PRODUCTS } from "../lib/productFormulas";
import { PRODUCT_OPTIONS } from "@/app/lib/productCatalog";
import {
  productInstitutionLabel,
  productInstitutionLogo,
  productLogoScaleClass,
} from "./calculatorHelpers";
import {
  type ProductPickerColumn,
  type ProductPickerSectionKey,
} from "./useCalculatorProductPicker";
import styles from "./calculatorProductPicker.module.css";

const PRODUCT_OPTION_BY_ID = new Map<Product, { id: Product; label: string }>(
  PRODUCT_OPTIONS.map((option) => [option.id, option] as const)
);

const SECTION_ICONS = {
  pension: PiggyBank,
  life: HeartPulse,
  property: House,
  auto: CarFront,
  entrepreneurs: BriefcaseBusiness,
  travel: Plane,
  foreigners: Globe2,
  investments: ChartNoAxesCombined,
  gold: Coins,
};

function productCount(count: number) {
  return `${count} ${count === 1 ? "produkt" : count >= 2 && count <= 4 ? "produkty" : "produktů"}`;
}

type CalculatorProductPickerModalProps = {
  isOpen: boolean;
  product: Product | null;
  columns: ProductPickerColumn[];
  activeColumn: ProductPickerColumn;
  allProducts: Product[];
  filteredProducts: Product[];
  isGlobalSearch: boolean;
  searchText: string;
  onClose: () => void;
  onSectionChange: (key: ProductPickerSectionKey) => void;
  onSearchTextChange: (value: string) => void;
  onSelectProduct: (product: Product) => void;
};

export function CalculatorProductPickerModal({
  isOpen,
  product,
  columns,
  activeColumn,
  allProducts,
  filteredProducts,
  isGlobalSearch,
  searchText,
  onClose,
  onSectionChange,
  onSearchTextChange,
  onSelectProduct,
}: CalculatorProductPickerModalProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    searchInputRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (resultsRef.current) resultsRef.current.scrollTop = 0;
  }, [isOpen, activeColumn.key, searchText]);

  if (!isOpen || typeof document === "undefined") return null;

  const currentProduct = product ? PRODUCT_OPTION_BY_ID.get(product) : null;
  const SectionIcon = isGlobalSearch ? Search : SECTION_ICONS[activeColumn.key];
  const emptyCategory = !isGlobalSearch && activeColumn.products.length === 0;
  const clearSearch = () => {
    onSearchTextChange("");
    searchInputRef.current?.focus();
  };

  return createPortal(
    <div className={styles.overlay}>
      <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Výběr produktu"
        className={styles.panel}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }
          if (event.key !== "Tab") return;
          const controls = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), [tabindex="0"]'
          ) ?? []).filter((element) => element.getClientRects().length > 0);
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
      >
        <header className={styles.header}>
          <div className={styles.headingRow}>
            <span className={styles.headerIcon}><Package size={23} strokeWidth={1.7} aria-hidden="true" /></span>
            <div className={styles.heading}>
              <h2>Vyber produkt</h2>
              <p>Najdi ten správný pro svou smlouvu.</p>
            </div>
            <button type="button" onClick={onClose} className={styles.closeButton} aria-label="Zavřít výběr produktu">
              <X size={19} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </div>
          <div className={styles.searchField}>
            <Search size={19} strokeWidth={1.8} aria-hidden="true" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchText}
              onChange={(event) => onSearchTextChange(event.target.value)}
              aria-label="Hledat produkt"
              placeholder="Hledat produkt nebo pojišťovnu…"
              autoComplete="off"
              spellCheck={false}
            />
            {searchText ? (
              <button type="button" onClick={clearSearch} className={styles.clearButton} aria-label="Vymazat hledání">
                <X size={16} aria-hidden="true" />
              </button>
            ) : <span className={styles.searchHint}>Ve všech kategoriích</span>}
          </div>
        </header>

        <div className={styles.body}>
          <nav className={styles.sidebar} aria-label="Kategorie produktů">
            <p className={styles.sidebarLabel}>Kategorie <span>{allProducts.length}</span></p>
            <div className={styles.categories}>
              {columns.map((column) => {
                const Icon = SECTION_ICONS[column.key];
                const sectionActive = column.key === activeColumn.key && !isGlobalSearch;
                return (
                  <button
                    key={column.key}
                    type="button"
                    onClick={() => {
                      onSearchTextChange("");
                      onSectionChange(column.key);
                    }}
                    className={styles.category}
                    aria-pressed={sectionActive}
                  >
                    <Icon size={18} strokeWidth={1.7} aria-hidden="true" />
                    <span className={styles.categoryName}>{column.title}</span>
                    <span className={styles.categoryCount}>{column.products.length}</span>
                  </button>
                );
              })}
            </div>
          </nav>

          <section className={styles.content} aria-label="Nabídka produktů">
            <div className={styles.sectionHeading}>
              <div className={styles.sectionTitle}>
                <SectionIcon size={18} strokeWidth={1.8} aria-hidden="true" />
                <h3>{isGlobalSearch ? "Výsledky hledání" : activeColumn.title}</h3>
              </div>
              <span className={styles.resultCount} role="status" aria-live="polite" aria-atomic="true">
                {productCount(filteredProducts.length)}
              </span>
            </div>
            <div className={styles.results} ref={resultsRef}>
              {emptyCategory || filteredProducts.length === 0 ? (
                <div className={styles.empty}>
                  <span className={styles.emptyIcon}>{emptyCategory
                    ? <SectionIcon size={30} strokeWidth={1.5} aria-hidden="true" />
                    : <SearchX size={30} strokeWidth={1.5} aria-hidden="true" />}</span>
                  <h4>{emptyCategory ? "Tady zatím nic není" : "Žádný produkt nenalezen"}</h4>
                  <p>{emptyCategory ? (activeColumn.emptyText ?? "Zatím bez produktů.") : "Zkus jiný název produktu nebo pojišťovny."}</p>
                  {isGlobalSearch && <button type="button" className={styles.emptyAction} onClick={clearSearch}>Vymazat hledání</button>}
                </div>
              ) : (
                <ul className={styles.products}>
                  {filteredProducts.map((productId) => {
                    const option = PRODUCT_OPTION_BY_ID.get(productId);
                    if (!option) return null;
                    const isActive = productId === product;
                    return (
                      <li key={productId}>
                        <button
                          type="button"
                          onClick={() => onSelectProduct(productId)}
                          className={styles.product}
                          aria-pressed={isActive}
                        >
                          <span className={styles.logo}>
                            <Image
                              src={productInstitutionLogo(productId)}
                              alt=""
                              fill
                              sizes="64px"
                              className={productLogoScaleClass(productId)}
                            />
                          </span>
                          <span className={styles.productText}>
                            <span className={styles.institution}>{productInstitutionLabel(productId)}</span>
                            <span className={styles.productName}>{option.label}</span>
                            {!SUPPORTED_PRODUCTS.includes(productId) && <span className={styles.unsupported}>Zatím bez výpočtu</span>}
                          </span>
                          <span className={styles.selectIcon} aria-hidden="true">
                            {isActive ? <Check size={16} strokeWidth={2.3} /> : <ArrowRight size={16} strokeWidth={1.8} />}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        </div>

        <footer className={styles.footer}>
          {currentProduct ? (
            <span className={styles.currentProduct} title={currentProduct.label}>
              <Check size={15} strokeWidth={2} aria-hidden="true" />
              <span>Vybráno: <strong>{currentProduct.label}</strong></span>
            </span>
          ) : <span>Kliknutím na produkt pokračuješ.</span>}
          <span className={styles.keyboardHint}><kbd>Esc</kbd> zavřít</span>
        </footer>
      </div>
    </div>,
    document.body
  );
}
