"use client";

import { useId, type ReactNode } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { formatMoney } from "./statementParsing";
import styles from "./statementWorkspace.module.css";

export const statementContractCount = (count: number) =>
  `${count} ${count === 1 ? "smlouva" : count >= 2 && count <= 4 ? "smlouvy" : "smluv"}`;

export function StatementSection({
  title, icon: Icon, tone = "neutral", count, amount, description, badge,
  expanded, onToggle, children, showTitle = true,
}: {
  title: string;
  icon: LucideIcon;
  tone?: "neutral" | "life" | "auto" | "property" | "travel" | "warning" | "storno" | "manager";
  count: number;
  amount: number;
  description?: string;
  badge?: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
  showTitle?: boolean;
}) {
  const contentId = useId();
  return (
    <section className={styles.contractSection} data-tone={tone} data-expanded={expanded} aria-label={title}>
      <button type="button" className={styles.sectionToggle} onClick={onToggle} aria-expanded={expanded} aria-controls={contentId}>
        <span className={styles.sectionIcon}><Icon size={21} strokeWidth={1.7} aria-hidden="true" /></span>
        <span className={styles.sectionIdentity}>
          {showTitle && <span className={styles.sectionTitle}>{title}</span>}
          <span className={styles.sectionMeta}>{statementContractCount(count)}{description && <span className={styles.sectionDescription}>{description}</span>}</span>
        </span>
        <span className={styles.sectionNumbers}>
          {badge && <span className={styles.sectionBadge}>{badge}</span>}
          <span className={styles.sectionAmount}>{formatMoney(amount)} <span>Kč</span></span>
        </span>
        <span className={styles.sectionChevron}><ChevronDown size={16} aria-hidden="true" /></span>
      </button>
      <div id={contentId} hidden={!expanded}>
        {expanded && <div className={styles.sectionContent}>{children}</div>}
      </div>
    </section>
  );
}
