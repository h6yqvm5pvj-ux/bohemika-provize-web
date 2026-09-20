"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ShieldCheck } from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { InsurerPicker } from "../srovnavac-trvalych-nasledku/InsurerPicker";
import { LIABILITY_INSURERS } from "./products";
import { LiabilityComparisonResults } from "./LiabilityComparisonResults";
import styles from "./comparison.module.css";

const PRODUCT_GROUPS = LIABILITY_INSURERS.map((insurer) => ({
  insurerName: insurer.name,
  options: insurer.products.map((product) => ({
    value: `${insurer.id}:${product.id}`,
    productName: product.name,
    badges: [product.date],
  })),
}));
const ALL_PRODUCT_IDS = PRODUCT_GROUPS.flatMap((group) =>
  group.options.map((option) => option.value),
);
const ALL_INSURER_NAMES = PRODUCT_GROUPS.map((group) => group.insurerName);
const LOGOS = new Map(LIABILITY_INSURERS.map((insurer) => [insurer.name, insurer.logoPath]));
const getInsurerLogo = (name: string) => LOGOS.get(name) ?? null;

export default function LiabilityComparisonPage() {
  const [selectedProducts, setSelectedProducts] = useState<string[]>(ALL_PRODUCT_IDS);
  const [expandedInsurers, setExpandedInsurers] = useState<string[]>([]);
  const [showResults, setShowResults] = useState(false);
  const pickerHeadingRef = useRef<HTMLHeadingElement>(null);
  const returningToPicker = useRef(false);

  useEffect(() => {
    if (!showResults && returningToPicker.current) {
      pickerHeadingRef.current?.focus();
      returningToPicker.current = false;
    }
  }, [showResults]);

  const allProductsSelected = ALL_PRODUCT_IDS.every((id) => selectedProducts.includes(id));
  const allInsurersExpanded = ALL_INSURER_NAMES.every((name) => expandedInsurers.includes(name));

  const toggleProduct = (id: string) => {
    setSelectedProducts((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  };

  const toggleInsurerProducts = (ids: string[]) => {
    setSelectedProducts((current) =>
      ids.every((id) => current.includes(id))
        ? current.filter((id) => !ids.includes(id))
        : Array.from(new Set([...current, ...ids])),
    );
  };

  const toggleInsurerExpanded = (name: string) => {
    setExpandedInsurers((current) =>
      current.includes(name)
        ? current.filter((value) => value !== name)
        : [...current, name],
    );
  };

  return (
    <AppLayout active="tools" embedded>
      <div className={styles.page} data-view={showResults ? "results" : "picker"}>
        <header className={styles.pageHeader}>
          <Link href="/pomucky" className={styles.backLink} aria-label="Zpět na pomůcky">
            <ChevronLeft size={17} aria-hidden="true" /><span>Pomůcky</span>
          </Link>
          <div className={styles.pageTitle}><ShieldCheck size={21} aria-hidden="true" /><h1>Srovnávač odpovědnosti občana</h1></div>
          {!showResults && <span className={styles.catalogCount}>{LIABILITY_INSURERS.length} pojišťoven · {ALL_PRODUCT_IDS.length} variant</span>}
        </header>

        {showResults ? (
          <LiabilityComparisonResults selectedIds={selectedProducts} onEditSelection={() => {
            returningToPicker.current = true;
            setShowResults(false);
          }} />
        ) : (
        <section className={styles.picker} aria-labelledby="liability-products-title">
          <div className={styles.toolbar}>
            <div className={styles.heading}>
              <h2 id="liability-products-title" ref={pickerHeadingRef} tabIndex={-1}>Výběr produktů</h2>
            </div>
            <div className={styles.actions}>
              <span className={styles.selectionCount} role="status" aria-live="polite" aria-atomic="true">
                Vybrané produkty: {selectedProducts.length} / {ALL_PRODUCT_IDS.length}
              </span>
              <button
                type="button"
                onClick={() => setSelectedProducts(allProductsSelected ? [] : ALL_PRODUCT_IDS)}
              >
                {allProductsSelected ? "Zrušit výběr" : "Vybrat vše"}
              </button>
              <button
                type="button"
                onClick={() => setExpandedInsurers(allInsurersExpanded ? [] : ALL_INSURER_NAMES)}
              >
                <ChevronDown
                  size={15}
                  aria-hidden="true"
                  style={{ transform: allInsurersExpanded ? "rotate(180deg)" : undefined }}
                />
                {allInsurersExpanded ? "Sbalit vše" : "Rozbalit vše"}
              </button>
              <button
                type="button"
                className={styles.primaryAction}
                disabled={selectedProducts.length === 0}
                onClick={() => setShowResults(true)}
              >
                Porovnat produkty <ChevronRight size={15} aria-hidden="true" />
              </button>
            </div>
          </div>

          <InsurerPicker
            compact
            groups={PRODUCT_GROUPS}
            selected={selectedProducts}
            expanded={expandedInsurers}
            onToggleOption={toggleProduct}
            onToggleGroup={toggleInsurerProducts}
            onToggleExpanded={toggleInsurerExpanded}
            getLogo={getInsurerLogo}
          />
        </section>
        )}
      </div>
    </AppLayout>
  );
}
