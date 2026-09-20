"use client";

import Image from "next/image";
import { useState, type CSSProperties } from "react";
import { CalendarDays, CheckCircle2, ChevronDown, CircleMinus, CircleX, Info, Minus, Plus, TriangleAlert } from "lucide-react";
import { getCoverageConditions, getVisibleCriteria, type ComparisonSectionData } from "./comparisonData";
import { getCriterionIcon } from "./comparisonIcons";
import { LIABILITY_PRODUCTS } from "./products";
import styles from "./comparison.module.css";

const TONE_ICONS = { positive: CheckCircle2, warning: TriangleAlert, negative: CircleX, neutral: CircleMinus };
const MISSING_ANSWER = { summary: "Údaj zatím není doplněn", tone: "neutral" as const };

export function ComparisonSection({ section, products, active }: {
  section: ComparisonSectionData;
  products: typeof LIABILITY_PRODUCTS;
  active: boolean;
}) {
  const groupIds = [...new Set(section.criteria.flatMap((criterion) => criterion.parentId ? [criterion.parentId] : []))];
  const [onlyDifferences, setOnlyDifferences] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>(() => groupIds);
  const [expandedDetails, setExpandedDetails] = useState<string[]>([]);
  const detailKeys = section.criteria.flatMap((criterion) => products
    .filter((product) => section.answers[product.id]?.[criterion.id]?.detail)
    .map((product) => `${criterion.id}:${product.id}`));
  const allExpanded = collapsedGroups.length === 0 && detailKeys.every((key) => expandedDetails.includes(key));
  const expandableCriteria = getVisibleCriteria(section, products.map((product) => product.id), onlyDifferences, []);
  const visibleCriteria = getVisibleCriteria(section, products.map((product) => product.id), onlyDifferences, collapsedGroups);
  const contentId = `liability-${section.id}-content`;

  const toggleDetail = (key: string) => setExpandedDetails((current) => current.includes(key)
    ? current.filter((value) => value !== key) : [...current, key]);
  const toggleGroup = (key: string) => setCollapsedGroups((current) => current.includes(key)
    ? current.filter((value) => value !== key) : [...current, key]);

  return (
    <section className={styles.comparisonPanel} id={`liability-${section.id}`} role="tabpanel" aria-labelledby={`liability-tab-${section.id}`} hidden={!active}>
      <div className={styles.sectionToolbar}>
        <span className={styles.criteriaCount}>{visibleCriteria.length} z {section.criteria.length} kritérií</span>
        <div className={styles.actions}>
          <label className={styles.differencesToggle}>
            <input type="checkbox" checked={onlyDifferences} disabled={products.length < 2}
              onChange={(event) => setOnlyDifferences(event.target.checked)} />
            Zobrazit pouze rozdíly
          </label>
          {(groupIds.length > 0 || detailKeys.length > 0) && <button type="button" onClick={() => {
            setCollapsedGroups(allExpanded ? groupIds : []);
            setExpandedDetails(allExpanded ? [] : detailKeys);
          }}>
            <ChevronDown size={15} aria-hidden="true" style={{ transform: allExpanded ? "rotate(180deg)" : undefined }} />
            {allExpanded ? "Sbalit vše" : "Rozbalit vše"}
          </button>}
        </div>
      </div>
      <div id={contentId} className={styles.sectionContent}>
        <div className={styles.tableViewport} role="region" aria-label={`Srovnání: ${section.title}`} tabIndex={0}>
          <table className={styles.comparisonTable} style={{ "--product-count": products.length } as CSSProperties}>
            <caption className={styles.srOnly}>{section.title} – pojištění občanské odpovědnosti</caption>
            <colgroup><col className={styles.criterionColumn} />{products.map((product) => <col key={product.id} />)}</colgroup>
            <thead><tr>
              <th scope="col" className={styles.cornerCell}><strong>Kritérium</strong></th>
              {products.map((product) => (
                <th scope="col" key={product.id} aria-label={`${product.insurerName} – ${product.productName}, ${product.date}`}>
                  <div className={styles.productHeading}>
                    <span className={styles.productLogo}><Image src={product.logoPath} alt="" width={54} height={36} /></span>
                    <div><small>{product.insurerName}</small><strong>{product.productName}</strong><span className={styles.versionBadge}><CalendarDays size={11} aria-hidden="true" />{product.date}</span></div>
                  </div>
                </th>
              ))}
            </tr></thead>
            <tbody>
              {visibleCriteria.map((criterion) => {
                const CriterionIcon = getCriterionIcon(criterion.id, section.id);
                const groupExpanded = !collapsedGroups.includes(criterion.id);
                const childCount = expandableCriteria.filter((row) => row.parentId === criterion.id).length;
                const GroupIcon = groupExpanded ? Minus : Plus;
                return (
                  <tr key={criterion.id} data-criterion={criterion.id}>
                    <th scope="row" className={styles.criterionCell} data-subcriterion={!!criterion.parentId}>
                      {criterion.parentLabel && <small>{criterion.parentLabel}</small>}
                      <span className={styles.criterionTitle}><CriterionIcon size={15} aria-hidden="true" /><span>{criterion.title}</span></span>
                      {childCount > 0 && (
                        <button type="button" className={styles.subcriteriaToggle} aria-expanded={groupExpanded}
                          aria-label={`${groupExpanded ? "Skrýt" : "Zobrazit"} podkritéria: ${criterion.title} (${childCount})`}
                          onClick={() => toggleGroup(criterion.id)}>
                          <GroupIcon size={14} aria-hidden="true" />
                          <span>{groupExpanded ? "Skrýt podkritéria" : "Více kritérií"}</span>
                          <span className={styles.disclosureCount} aria-hidden="true">{childCount}</span>
                        </button>
                      )}
                    </th>
                    {products.map((product) => {
                      const answer = section.answers[product.id]?.[criterion.id] ?? MISSING_ANSWER;
                      const conditions = getCoverageConditions(section, criterion, product.id);
                      const key = `${criterion.id}:${product.id}`;
                      const expanded = expandedDetails.includes(key);
                      const ToneIcon = TONE_ICONS[answer.tone];
                      const DetailIcon = expanded ? Minus : Plus;
                      const detailId = `detail-${section.id}-${key}`;
                      return (
                        <td key={product.id}>
                          <div className={styles.answer} data-tone={answer.tone}>
                            <ToneIcon size={16} aria-hidden="true" className={styles.toneIcon} />
                            <p className={styles.answerSummary}>{answer.summary}</p>
                            {conditions.map((coverage, index) => <p key={index} className={styles.coverageContext} data-tone={coverage.tone}>Podmínky hlavního krytí: {coverage.summary}</p>)}
                            {"detail" in answer && answer.detail && (
                              <>
                                <button type="button" className={styles.detailToggle} aria-expanded={expanded} aria-controls={detailId}
                                  aria-label={`${expanded ? "Skrýt" : "Zobrazit"} podrobnosti: ${criterion.title} – ${product.insurerName} ${product.productName}`}
                                  onClick={() => toggleDetail(key)}>
                                  <DetailIcon size={14} aria-hidden="true" />
                                  {expanded ? "Skrýt podrobnosti" : "Zobrazit více"}
                                </button>
                                <p className={styles.answerDetail} id={detailId} hidden={!expanded}>{answer.detail}</p>
                              </>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {visibleCriteria.length === 0 && (
                <tr><td colSpan={products.length + 1} className={styles.noDifferences}>Vybrané produkty mají ve všech dostupných kritériích stejné údaje.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className={styles.sourceNote}><Info size={14} aria-hidden="true" /> Údaje a barevná hodnocení podle dodaného srovnání. Data verzí jsou uvedená u jednotlivých produktů.</p>
      </div>
    </section>
  );
}
