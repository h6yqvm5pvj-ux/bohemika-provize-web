"use client";

import { useId, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { ToolFeature } from "./ToolIntro";
import styles from "./toolLoader.module.css";

export function ToolLoader({ name, title, description, query, queryLabel, queryIcon: QueryIcon, status, features, scene }: {
  name: string;
  title: ReactNode;
  description: string;
  query: string;
  queryLabel: string;
  queryIcon: LucideIcon;
  status: string;
  features: readonly ToolFeature[];
  scene: ReactNode;
}) {
  const titleId = useId();
  return (
    <section className={styles.loader} aria-labelledby={titleId}>
      <div className={styles.main}>
        <div className={styles.content}>
          <div className={styles.eyebrow}><span className={styles.statusDot} />{name}</div>
          <h2 id={titleId}>{title}</h2>
          <p className={styles.description}>{description}</p>
          <div className={styles.address}>
            <span className={styles.addressIcon}><QueryIcon size={19} strokeWidth={1.7} aria-hidden="true" /></span>
            <div><span className={styles.addressLabel}>{queryLabel}</span><p>{query}</p></div>
          </div>
          <div className={styles.progressArea}>
            <div className={styles.track} role="progressbar" aria-label={status}><span /></div>
            <p className={styles.status} role="status" aria-live="polite" aria-atomic="true"><span className={styles.dots} aria-hidden="true"><i /><i /><i /></span>{status}</p>
          </div>
        </div>
        {scene}
      </div>
      <div className={styles.details} aria-hidden="true">
        {features.map(({ title: label, icon: Icon }) => <div className={styles.detail} key={label}><Icon size={19} strokeWidth={1.6} /><span>{label}</span><span className={styles.detailTrack}><i /></span></div>)}
      </div>
    </section>
  );
}
