"use client";

import { useId, type ReactNode } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import styles from "./toolIntro.module.css";

export type ToolFeature = { icon: LucideIcon; title: string; text: string };

export function ToolIntro({ name, icon: Icon, title, titleId, description, source, features, scene, children }: {
  name: string;
  icon: LucideIcon;
  title: ReactNode;
  titleId?: string;
  description: string;
  source?: string;
  features: readonly ToolFeature[];
  scene: ReactNode;
  children: ReactNode;
}) {
  const generatedId = useId();
  const headingId = titleId ?? generatedId;
  return (
    <section className={styles.intro} aria-labelledby={headingId}>
      <div className={styles.hero}>
        <div className={styles.content}>
          <div className={styles.eyebrow}><span><Icon size={18} strokeWidth={1.7} aria-hidden="true" /></span>{name}</div>
          <h1 id={headingId}>{title}</h1>
          <p className={styles.description}>{description}</p>
          <div className={styles.searchArea}>{children}</div>
          {source && <p className={styles.source}><span />{source}</p>}
        </div>
        {scene}
      </div>
      <details className={styles.detailsPanel}>
        <summary>Co najdeš v přehledu <ChevronDown size={16} aria-hidden="true" /></summary>
        <div className={styles.details}>
        {features.map(({ icon: FeatureIcon, title: label, text }) => (
          <div key={label} className={styles.detail}>
            <span className={styles.detailIcon}><FeatureIcon size={20} strokeWidth={1.6} aria-hidden="true" /></span>
            <div><h2>{label}</h2><p>{text}</p></div>
          </div>
        ))}
        </div>
      </details>
    </section>
  );
}
