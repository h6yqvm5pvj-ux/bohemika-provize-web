import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import styles from "./contractSectionToggle.module.css";

export function ContractSectionToggle({
  title, icon, count, expanded, contentId, onToggle,
}: {
  title: string;
  icon: ReactNode;
  count: string;
  expanded: boolean;
  contentId: string;
  onToggle: () => void;
}) {
  return (
    <h3 className={styles.heading}>
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={expanded}
        aria-controls={contentId}
        aria-label={`${expanded ? "Sbalit" : "Rozbalit"} ${title.toLocaleLowerCase("cs-CZ")}`}
        aria-describedby={`${contentId}-count`}
        onClick={onToggle}
      >
        <span className={styles.icon} aria-hidden="true">{icon}</span>
        <span className={styles.label}>
          <span className={styles.title}>{title}</span>
          <span id={`${contentId}-count`} className={styles.count}>{count}</span>
        </span>
        <span className={styles.chevron} aria-hidden="true"><ChevronDown size={16} strokeWidth={1.8} /></span>
      </button>
    </h3>
  );
}
