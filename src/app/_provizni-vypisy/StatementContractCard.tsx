"use client";

import { useId, useState, type ComponentProps, type ReactNode } from "react";
import { StatementContractHeader } from "./StatementContractHeader";
import styles from "./statementContractDetail.module.css";

type Props = Omit<ComponentProps<typeof StatementContractHeader>, "expanded" | "onToggle" | "contentId"> & {
  marking?: ReactNode;
  children: ReactNode;
};

export function StatementContractCard({ verified = false, marking, children, ...header }: Props) {
  const contentId = useId();
  const [expanded, setExpanded] = useState(false);

  return (
    <article className={styles.card} data-expanded={expanded} data-verified={verified}>
      {marking && <div className={styles.marking}>{marking}</div>}
      <StatementContractHeader
        {...header}
        verified={verified}
        contentId={contentId}
        expanded={expanded}
        onToggle={() => setExpanded((previous) => !previous)}
      />
      <div id={contentId} hidden={!expanded}>
        {expanded && <div className={styles.cardBody}>{children}</div>}
      </div>
    </article>
  );
}
