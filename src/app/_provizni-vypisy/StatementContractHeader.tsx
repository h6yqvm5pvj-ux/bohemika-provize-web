"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { formatMoney } from "./statementParsing";
import styles from "./statementContractDetail.module.css";

export function StatementContractHeader({
  client, contractNumber, products, badges, commission, reserve,
  expanded, onToggle,
}: {
  client: string;
  contractNumber: string;
  products: ReactNode;
  badges: ReactNode;
  commission: number;
  reserve?: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button type="button" className={styles.cardToggle} onClick={onToggle} aria-expanded={expanded}>
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
        {reserve !== undefined && (
          <span className={styles.amount} data-secondary="true">
            <span>Rezervní fond</span>
            <strong>{formatMoney(reserve)} <small>Kč</small></strong>
          </span>
        )}
      </span>
      <span className={styles.chevron}><ChevronDown size={17} aria-hidden="true" /></span>
      <span className={styles.badges}>{badges}</span>
    </button>
  );
}
