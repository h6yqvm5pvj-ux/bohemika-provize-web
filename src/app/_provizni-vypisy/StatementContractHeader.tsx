"use client";

import type { ReactNode } from "react";
import { CheckCircle2, ChevronDown } from "lucide-react";
import { formatMoney } from "./statementParsing";
import styles from "./statementContractDetail.module.css";

export function StatementContractHeader({
  client, contractNumber, products, badges, commission, reserve,
  expanded, onToggle, verified = false, contentId,
}: {
  client: string;
  contractNumber: string;
  products: ReactNode;
  badges: ReactNode;
  commission: number;
  reserve?: number;
  expanded: boolean;
  onToggle: () => void;
  verified?: boolean;
  contentId?: string;
}) {
  return (
    <button type="button" className={styles.cardToggle} data-compact={!expanded} onClick={onToggle} aria-expanded={expanded} aria-controls={contentId}>
      <span className={styles.identity}>
        <span className={styles.contractNumber}>Smlouva {contractNumber || "—"}</span>
        <span className={styles.clientName}>{client}</span>
        <span className={styles.products}>{products}</span>
      </span>
      <span className={styles.amounts}>
        <span className={styles.amount}>
          <span>Provize celkem</span>
          <strong>{formatMoney(commission)} <small>Kč</small></strong>
        </span>
        {expanded && reserve !== undefined && (
          <span className={styles.amount} data-secondary="true">
            <span>Rezervní fond</span>
            <strong>{formatMoney(reserve)} <small>Kč</small></strong>
          </span>
        )}
      </span>
      <span className={styles.chevron}><ChevronDown size={17} aria-hidden="true" /></span>
      <span className={styles.badges}>
        {!expanded && verified
          ? <span className={styles.badge} data-tone="ok"><CheckCircle2 size={13} aria-hidden="true" />Vše sedí</span>
          : badges}
      </span>
    </button>
  );
}
