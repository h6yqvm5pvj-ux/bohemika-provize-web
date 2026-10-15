"use client";

import { createContext, useContext, type ReactNode } from "react";
import styles from "./lifeRecordForm.module.css";

export const LifeBenefitFilter = createContext({ query: "", selectedOnly: false });

export function useBenefitHidden(title: string, enabled: boolean): boolean {
  const { query, selectedOnly } = useContext(LifeBenefitFilter);
  const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return (selectedOnly && !enabled) || !normalize(title).includes(normalize(query.trim()));
}

export function LifeBenefitGroup({ id, title, description, selected, total, children }: {
  id: string;
  title: string;
  description: string;
  selected: number;
  total: number;
  children: ReactNode;
}) {
  return (
    <section id={id} className={styles.benefitGroup} aria-labelledby={`${id}-title`}>
      <header className={styles.groupHeader}>
        <div><h3 id={`${id}-title`}>{title}</h3><p>{description}</p></div>
        <span aria-label={`${selected} z ${total} krytí vybráno`}>{selected}<span> / {total}</span></span>
      </header>
      <div className={styles.benefitGrid}>{children}</div>
    </section>
  );
}
