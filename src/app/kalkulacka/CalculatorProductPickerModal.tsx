"use client";

import Image from "next/image";
import { Check, Package, Search, X } from "lucide-react";
import { useEffect, useRef } from "react";

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
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
  }, [isOpen]);

  if (!isOpen) return null;

  const currentProduct = product ? PRODUCT_OPTION_BY_ID.get(product) : null;
  const sectionTotal = isGlobalSearch ? allProducts.length : activeColumn.products.length;

  return (
    <div className="fixed inset-0 z-[120]">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/18 backdrop-blur-[2px]"
        aria-label="Zavřít výběr produktu"
      />
      <div className="pointer-events-none absolute inset-0 z-[121] flex items-center justify-center px-3 py-5">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Výběr produktu"
          className="pointer-events-auto flex h-[min(940px,calc(100vh-3rem))] w-full max-w-[1260px] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.22)]"
        >
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                Vyber produkt
              </p>
              <div className="mt-1 flex min-w-0 items-center gap-2">
                {product ? (
                  <span className="relative h-6 w-10 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-white">
                    <Image
                      src={productInstitutionLogo(product)}
                      alt=""
                      fill
                      className={productLogoScaleClass(product)}
                    />
                  </span>
                ) : (
                  <span className="inline-flex h-6 w-10 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-500">
                    <Package size={14} strokeWidth={2.2} aria-hidden="true" />
                  </span>
                )}
                <span className="truncate text-sm font-bold text-slate-950">
                  {currentProduct?.label ?? "Zatím není vybrán žádný produkt"}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950"
              aria-label="Zavřít výběr produktu"
            >
              <X size={16} strokeWidth={2.2} aria-hidden="true" />
            </button>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)]">
            <aside className="border-b border-slate-200 bg-slate-50/70 p-3 md:border-b-0 md:border-r md:p-4">
              <div className="flex gap-2 overflow-x-auto pb-1 md:block md:space-y-1 md:overflow-visible md:pb-0">
                {columns.map((column) => {
                  const sectionActive = column.key === activeColumn.key && !isGlobalSearch;
                  return (
                    <button
                      key={column.key}
                      type="button"
                      onClick={() => onSectionChange(column.key)}
                      className={`flex h-10 shrink-0 items-center justify-between gap-3 rounded-xl border px-3 text-sm font-semibold transition md:w-full ${
                        sectionActive
                          ? "border-slate-900 bg-slate-900 text-white shadow-[0_8px_18px_rgba(15,23,42,0.14)]"
                          : "border-transparent bg-white text-slate-600 hover:border-slate-200 hover:text-slate-950"
                      }`}
                    >
                      <span>{column.title}</span>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                          sectionActive
                            ? "bg-white text-slate-900"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {column.products.length}
                      </span>
                    </button>
                  );
                })}
              </div>
            </aside>

            <section className="flex min-h-0 flex-col">
              <div className="border-b border-slate-200 px-4 py-3 sm:px-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="truncate text-xl font-bold tracking-tight text-slate-950">
                      {isGlobalSearch ? "Výsledky hledání" : activeColumn.title}
                    </h3>
                    <p className="mt-0.5 text-xs font-medium text-slate-400">
                      {filteredProducts.length} / {sectionTotal}
                    </p>
                  </div>
                  <label className="flex h-10 w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 sm:w-[280px]">
                    <Search size={15} className="text-slate-400" aria-hidden="true" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchText}
                      onChange={(event) => onSearchTextChange(event.target.value)}
                      aria-label="Hledat produkt"
                      placeholder="Hledat produkt"
                      className="w-full bg-transparent text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none"
                    />
                  </label>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pr-2 [scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-3 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-slate-100 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-slate-100 [&::-webkit-scrollbar-thumb]:bg-slate-400 [&::-webkit-scrollbar-thumb:hover]:bg-slate-500 sm:px-5 sm:pr-3">
                {!isGlobalSearch && activeColumn.products.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
                    {activeColumn.emptyText ?? "Zatím bez produktů."}
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
                    Pro tento filtr jsme nic nenašli.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {filteredProducts.map((productId) => {
                      const option = PRODUCT_OPTION_BY_ID.get(productId);
                      if (!option) return null;
                      const isActive = product != null && productId === product;
                      const unsupportedText = SUPPORTED_PRODUCTS.includes(productId)
                        ? null
                        : "zatím bez výpočtu";

                      return (
                        <button
                          key={productId}
                          type="button"
                          onClick={() => onSelectProduct(productId)}
                          className={`group relative w-full rounded-2xl border bg-white px-4 py-3 text-left shadow-[0_8px_22px_rgba(15,23,42,0.045)] transition hover:border-slate-300 hover:bg-slate-50 ${
                            isActive
                              ? "border-slate-900 ring-2 ring-slate-900/15"
                              : "border-slate-200"
                          }`}
                        >
                          <span className="flex items-center justify-between gap-3">
                            <span className="flex min-w-0 items-center gap-3">
                              <span
                                className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white ${productLogoFrameClass(
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
                                <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                                  {productInstitutionLabel(productId)}
                                </span>
                                <span className="mt-0.5 block whitespace-normal break-words text-sm font-bold leading-5 text-slate-950">
                                  {option.label}
                                </span>
                                {unsupportedText && (
                                  <span className="mt-1 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                                    {unsupportedText}
                                  </span>
                                )}
                              </span>
                            </span>
                            <span
                              className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition ${
                                isActive
                                  ? "border-slate-900 bg-slate-900 text-white"
                                  : "border-slate-200 bg-white text-transparent group-hover:border-slate-300"
                              }`}
                            >
                              <Check size={15} strokeWidth={2.4} aria-hidden="true" />
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
