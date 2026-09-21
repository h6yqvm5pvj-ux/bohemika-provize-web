"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight, Search, ShieldCheck, SlidersHorizontal, X } from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { InsurerPicker } from "../srovnavac-trvalych-nasledku/InsurerPicker";
import { LIABILITY_INSURERS } from "./products";
import { HistoricalProductsPicker } from "./HistoricalProductsPicker";
import { LiabilityComparisonResults } from "./LiabilityComparisonResults";
import { ClientNeedsAssistant } from "./ClientNeedsAssistant";
import type { ClientNeedId } from "./clientNeeds";
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
  const [clientNeeds, setClientNeeds] = useState<ClientNeedId[]>([]);
  const [query, setQuery] = useState("");
  const [selectedOnly, setSelectedOnly] = useState(false);
  const pickerHeadingRef = useRef<HTMLHeadingElement>(null);
  const returningToPicker = useRef(false);

  useEffect(() => {
    if (!showResults && returningToPicker.current) {
      pickerHeadingRef.current?.focus();
      returningToPicker.current = false;
    }
  }, [showResults]);

  const allProductsSelected = ALL_PRODUCT_IDS.every((id) => selectedProducts.includes(id));
  const currentSelectedCount = ALL_PRODUCT_IDS.filter((id) => selectedProducts.includes(id)).length;
  const allInsurersExpanded = ALL_INSURER_NAMES.every((name) => expandedInsurers.includes(name));
  const selectedGroups = PRODUCT_GROUPS.filter((group) =>
    group.options.some((option) => selectedProducts.includes(option.value)),
  );

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
          <div className={styles.titleRow}>
            <div className={styles.pageTitle}>
              <span className={styles.titleIcon}><ShieldCheck size={26} aria-hidden="true" /></span>
              <div>
                <p className={styles.eyebrow}>{showResults ? "Výsledky porovnání" : "Srovnávač pojištění"}</p>
                <h1>Odpovědnost občana</h1>
                {!showResults && <p className={styles.pageDescription}>Najděte správné krytí pro každodenní život vašeho klienta.</p>}
              </div>
            </div>
            {!showResults && <div className={styles.catalogCount}>
              <span><strong>{LIABILITY_INSURERS.length}</strong> pojišťoven</span>
              <span><strong>{ALL_PRODUCT_IDS.length}</strong> aktuálních variant</span>
            </div>}
          </div>
        </header>

        <section className={showResults ? styles.resultsControls : styles.controls} aria-label="Nastavení porovnání">
          {!showResults && <div className={styles.searchField}>
            <Search size={18} aria-hidden="true" />
            <input type="search" aria-label="Hledat pojišťovnu nebo produkt" placeholder="Pojišťovna, produkt nebo ročník…" value={query} onChange={(event) => setQuery(event.target.value)} />
            {query && <button type="button" onClick={() => setQuery("")} aria-label="Vymazat hledání"><X size={18} aria-hidden="true" /></button>}
          </div>}

          <ClientNeedsAssistant embedded={!showResults} compact={showResults} applied={clientNeeds} canCompare={selectedProducts.length > 0} onApply={(needs) => {
            setClientNeeds(needs);
            if (needs.length && selectedProducts.length) setShowResults(true);
          }} />

          {!showResults && <div className={styles.controlsFooter}>
            <div className={styles.filters} role="group" aria-label="Filtry pojišťoven">
              <span className={styles.filterLabel}><SlidersHorizontal size={15} aria-hidden="true" />Filtry</span>
              <div className={styles.filterOptions}>
                <button type="button" aria-pressed={!selectedOnly} onClick={() => setSelectedOnly(false)}>Všechny</button>
                <button type="button" aria-pressed={selectedOnly} onClick={() => setSelectedOnly(true)}>Jen vybrané</button>
              </div>
            </div>
            <button type="button" className={styles.compareAction} disabled={selectedProducts.length === 0} onClick={() => setShowResults(true)}>
              Porovnat produkty <span>{selectedProducts.length}</span><ArrowRight size={17} aria-hidden="true" />
            </button>
          </div>}
        </section>

        {showResults ? (
          <LiabilityComparisonResults key={[...clientNeeds].sort().join(":")} needs={clientNeeds} selectedIds={selectedProducts} onEditSelection={() => {
            returningToPicker.current = true;
            setShowResults(false);
          }} />
        ) : (
        <section className={styles.picker} aria-labelledby="liability-products-title">
          <div className={styles.pickerToolbar}>
            <div className={styles.heading}>
              <h2 id="liability-products-title" ref={pickerHeadingRef} tabIndex={-1}>Aktuální produkty</h2>
              <span className={styles.selectionCount} role="status" aria-live="polite" aria-atomic="true">
                <span className={styles.selectionDot} aria-hidden="true" data-empty={currentSelectedCount === 0} />
                Vybráno {currentSelectedCount} z {ALL_PRODUCT_IDS.length} produktů
              </span>
            </div>
            <div className={styles.pickerActions}>
              <button
                type="button"
                onClick={() => toggleInsurerProducts(ALL_PRODUCT_IDS)}
              >
                <Check size={15} aria-hidden="true" />
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
            </div>
          </div>

          {selectedOnly && selectedGroups.length === 0 ? <div className={styles.resultsEmpty}>
            <ShieldCheck size={28} aria-hidden="true" />
            <h3>Zatím nemáte vybrané současné produkty</h3>
            <p>Zobrazte všechny pojišťovny a vyberte produkty, které chcete porovnat.</p>
            <button type="button" className={styles.clearFilter} onClick={() => setSelectedOnly(false)}>Zobrazit všechny pojišťovny <ChevronRight size={15} aria-hidden="true" /></button>
          </div> : <InsurerPicker
            compact
            layout="centered"
            searchQuery={query}
            groups={selectedOnly ? selectedGroups : PRODUCT_GROUPS}
            selected={selectedProducts}
            expanded={expandedInsurers}
            onToggleOption={toggleProduct}
            onToggleGroup={toggleInsurerProducts}
            onToggleExpanded={toggleInsurerExpanded}
            getLogo={getInsurerLogo}
          />}
          <HistoricalProductsPicker selected={selectedProducts} query={query} selectedOnly={selectedOnly}
            onToggleOption={toggleProduct} onToggleGroup={toggleInsurerProducts} />
        </section>
        )}
      </div>
    </AppLayout>
  );
}
