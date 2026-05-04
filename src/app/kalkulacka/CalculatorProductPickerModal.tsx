"use client";

import Image from "next/image";
import { Search, X } from "lucide-react";

import { type Product } from "../types/domain";
import { SUPPORTED_PRODUCTS } from "../lib/productFormulas";
import { PRODUCT_OPTIONS } from "@/app/lib/productCatalog";
import {
  productInstitutionLabel,
  productInstitutionLogo,
  productLogoFrameClass,
  productLogoScaleClass,
} from "./calculatorHelpers";
import {
  type ProductPickerColumn,
  type ProductPickerSectionKey,
} from "./useCalculatorProductPicker";

const PRODUCT_OPTION_BY_ID = new Map<Product, { id: Product; label: string }>(
  PRODUCT_OPTIONS.map((option) => [option.id, option] as const)
);

type CalculatorProductPickerModalProps = {
  isOpen: boolean;
  product: Product;
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
  if (!isOpen) return null;

  const currentProduct = PRODUCT_OPTION_BY_ID.get(product);

  return (
    <div className="fixed inset-0 z-[120]">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 bg-transparent"
        aria-label="Zavřít výběr produktu"
      />
      <div className="pointer-events-none absolute inset-x-0 top-1/2 z-[121] -translate-y-1/2">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Výběr produktu"
          className="pointer-events-auto w-full border-y border-slate-300 bg-white shadow-[0_22px_70px_rgba(2,6,23,0.22)]"
        >
          <div className="space-y-4 border-b border-slate-200 bg-white px-5 py-5 sm:px-10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="inline-flex rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-700">
                {currentProduct?.label ?? product}
              </span>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 transition hover:bg-slate-100"
              >
                <X size={14} strokeWidth={2} aria-hidden="true" />
                Zavřít
              </button>
            </div>

            <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
              <label className="flex w-full items-center gap-2 rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 lg:w-[230px] lg:flex-none">
                <Search size={13} className="text-slate-400" aria-hidden="true" />
                <input
                  type="text"
                  value={searchText}
                  onChange={(event) => onSearchTextChange(event.target.value)}
                  aria-label="Hledat produkt"
                  placeholder="Hledat produkt"
                  className="w-full bg-transparent text-xs text-slate-900 placeholder:text-slate-400 outline-none"
                />
              </label>

              <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-gutter:stable_both-edges] [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar-track]:bg-slate-100 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-thumb:hover]:bg-slate-400">
                <div className="flex min-w-max items-center gap-2 pb-1">
                  {columns.map((column) => {
                    const sectionActive = column.key === activeColumn.key;
                    return (
                      <button
                        key={column.key}
                        type="button"
                        onClick={() => onSectionChange(column.key)}
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                          sectionActive
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        <span>{column.title}</span>
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                            sectionActive
                              ? "bg-white text-slate-900"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {column.products.length}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="px-5 pb-6 pt-5 sm:px-10">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
                {isGlobalSearch
                  ? "Výsledky hledání (všechny kategorie)"
                  : activeColumn.title}
              </h3>
              <span className="text-xs font-medium text-slate-500">
                {filteredProducts.length} /{" "}
                {isGlobalSearch ? allProducts.length : activeColumn.products.length}
              </span>
            </div>

            {!isGlobalSearch && activeColumn.products.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
                {activeColumn.emptyText ?? "Zatím bez produktů."}
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
                Pro tento filtr jsme nic nenašli.
              </div>
            ) : (
              <div className="max-h-[46vh] overflow-y-auto pr-1">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {filteredProducts.map((productId) => {
                    const option = PRODUCT_OPTION_BY_ID.get(productId);
                    if (!option) return null;
                    const isActive = productId === product;
                    const unsupportedText = SUPPORTED_PRODUCTS.includes(productId)
                      ? null
                      : "zatím bez výpočtu";

                    return (
                      <button
                        key={productId}
                        type="button"
                        onClick={() => onSelectProduct(productId)}
                        className={`relative rounded-2xl border bg-white px-4 py-3 text-left font-mono shadow-[0_8px_20px_rgba(15,23,42,0.08)] transition hover:border-slate-400 hover:bg-slate-50 ${
                          isActive
                            ? "border-slate-900 ring-2 ring-slate-900/25"
                            : "border-slate-200"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="flex min-w-0 items-center gap-3">
                            <span
                              className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white ${productLogoFrameClass(
                                productId
                              )}`}
                            >
                              <Image
                                src={productInstitutionLogo(productId)}
                                alt=""
                                fill
                                className={productLogoScaleClass(productId)}
                              />
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                {productInstitutionLabel(productId)}
                              </span>
                              <span className="block whitespace-normal break-words text-sm font-semibold leading-5 text-slate-900">
                                {option.label}
                              </span>
                            </span>
                          </span>
                          <span
                            className={`inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border text-xs ${
                              isActive
                                ? "border-slate-900 bg-slate-900 text-white"
                                : "border-slate-300 bg-white text-transparent"
                            }`}
                          >
                            ✓
                          </span>
                        </div>
                        {unsupportedText && (
                          <div className="mt-2">
                            <span className="inline-flex rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800">
                              {unsupportedText}
                            </span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
