"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown, ChevronLeft, Info } from "lucide-react";
import { hasSectionComparison } from "./comparisonData";
import { ComparisonSection } from "./ComparisonSection";
import { ComparisonExport } from "./ComparisonExport";
import { SECTION_ICONS } from "./comparisonIcons";
import { LIABILITY_PRODUCTS } from "./products";
import { LIABILITY_SECTIONS } from "./sections";
import styles from "./comparison.module.css";

export function LiabilityComparisonResults({ selectedIds, onEditSelection }: {
  selectedIds: string[];
  onEditSelection: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [activeSection, setActiveSection] = useState(LIABILITY_SECTIONS[0].id);
  useEffect(() => { headingRef.current?.focus(); }, []);
  const selectedProducts = LIABILITY_PRODUCTS.filter((product) => selectedIds.includes(product.id));
  const hasData = (id: string) => LIABILITY_SECTIONS.some((section) => hasSectionComparison(section, id));
  const products = selectedProducts.filter((product) => hasData(product.id));
  const missingProducts = selectedProducts.filter((product) => !hasData(product.id));
  const sections = LIABILITY_SECTIONS.filter((section) => products.some((product) => hasSectionComparison(section, product.id)));

  const handleTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const targetIndex = event.key === "ArrowRight" ? (index + 1) % sections.length
      : event.key === "ArrowLeft" ? (index - 1 + sections.length) % sections.length
      : event.key === "Home" ? 0 : event.key === "End" ? sections.length - 1 : -1;
    if (targetIndex < 0) return;
    event.preventDefault();
    setActiveSection(sections[targetIndex].id);
    const target = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role=tab]")[targetIndex];
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "nearest", inline: "nearest" });
  };

  return (
    <section className={styles.results} aria-labelledby="liability-results-title">
      <h2 className={styles.srOnly} id="liability-results-title" ref={headingRef} tabIndex={-1}>Srovnání produktů</h2>
      <div className={styles.resultsToolbar}>
        <div className={styles.resultsMeta}>
          <span>Srovnáváme <strong>{products.length}</strong> z {selectedProducts.length} vybraných produktů</span>
          {missingProducts.length > 0 && (
            <details className={styles.missingNotice}>
              <summary><Info size={13} aria-hidden="true" /> {missingProducts.length} bez údajů · zobrazit <ChevronDown size={14} aria-hidden="true" /></summary>
              <div className={styles.missingList}>
                <p>Tyto produkty zatím nejsou zahrnuté ve výsledcích.</p>
                <ul>{missingProducts.map((product) => <li key={product.id}>{product.insurerName} · {product.productName} · {product.date}</li>)}</ul>
              </div>
            </details>
          )}
        </div>
        <div className={styles.actions}>
          {products.length > 0 && <ComparisonExport sections={sections} products={products} activeSection={activeSection} />}
          <button type="button" onClick={onEditSelection}><ChevronLeft size={14} aria-hidden="true" /> Upravit výběr</button>
        </div>
      </div>
      {products.length === 0 ? (
        <div className={styles.resultsEmpty}>
          <Info size={24} aria-hidden="true" />
          <h3>Pro vybrané produkty zatím nejsou doplněné údaje.</h3>
          <p>Srovnání je dostupné pro produkty pojišťoven: {[...new Set(LIABILITY_PRODUCTS.filter((product) => hasData(product.id)).map((product) => product.insurerName))].join(", ")}.</p>
          <div className={styles.actions}><button type="button" onClick={onEditSelection}>Změnit výběr produktů</button></div>
        </div>
      ) : (
        <>
          <div className={styles.sectionNav} role="tablist" aria-label="Sekce srovnání">
            {sections.map((section, index) => {
              const Icon = SECTION_ICONS[section.id];
              return <button key={section.id} type="button" role="tab" id={`liability-tab-${section.id}`}
                aria-selected={activeSection === section.id} aria-controls={`liability-${section.id}`} tabIndex={activeSection === section.id ? 0 : -1}
                onKeyDown={(event) => handleTabKey(event, index)}
                onClick={(event) => { setActiveSection(section.id); event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" }); }}>
                <Icon size={15} aria-hidden="true" /><span>{section.title}</span><small>{section.criteria.length}</small>
              </button>;
            })}
          </div>
          {sections.map((section) => <ComparisonSection key={section.id} section={section} products={products} active={activeSection === section.id} />)}
        </>
      )}
    </section>
  );
}
