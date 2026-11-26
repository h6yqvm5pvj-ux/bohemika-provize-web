import type { ReactNode } from "react";
import { Check, ChevronDown, CircleAlert, Clock3, CornerDownRight, Minus } from "lucide-react";
import { COMMISSION_PAYOUT_AMOUNT_TOLERANCE } from "@/app/lib/commissionReceipts";
import { formatMoney } from "./contractDetailHelpers";
import styles from "./contractCommission.module.css";

type Props = {
  title: string;
  statementCode?: string;
  expected: number;
  paid: number | null;
  cancellationStatus?: string;
  flagged?: boolean;
  storno?: boolean;
  supplement?: boolean;
  includedIn?: string;
  children: ReactNode;
};

export function CommissionComparisonRow({
  title, statementCode, expected, paid, cancellationStatus, flagged, storno, supplement, includedIn, children,
}: Props) {
  const difference = Math.round(((paid ?? 0) - expected) * 100) / 100;
  const differs = Math.abs(difference) > COMMISSION_PAYOUT_AMOUNT_TOLERANCE;
  const tone = storno || includedIn || flagged ? "difference"
    : paid === null ? "pending" : differs ? "difference" : "matched";
  const status = cancellationStatus ?? (storno ? "Storno"
    : includedIn ? "Výplata nad plán"
    : paid === null ? (expected === 0 ? "Bez očekávané výplaty" : "Čeká na výplatu")
    : differs ? `${difference < 0 ? "Vyplaceno méně o" : "Vyplaceno více o"} ${formatMoney(Math.abs(difference))}`
    : flagged ? "Nesrovnalost ve výpisu" : "Vyplaceno dle očekávání");
  const StatusIcon = cancellationStatus ? Minus : tone === "matched" ? Check : tone === "pending" ? Clock3 : CircleAlert;

  return (
    <details className={styles.comparisonRow} data-tone={tone} data-supplement={supplement || undefined}>
      <summary>
        <span className={styles.comparisonIdentity}>
          <span className={styles.comparisonTitle}>
            {supplement && <CornerDownRight size={14} aria-hidden="true" />}
            {title}
          </span>
          <span className={styles.comparisonStatus}><StatusIcon size={13} aria-hidden="true" />{status}</span>
          {includedIn && <span className={styles.comparisonHint}>Navýšení zahrnuto v {includedIn}</span>}
        </span>
        {!cancellationStatus && <>
          <span className={styles.comparisonMetric}>
            <small>{includedIn ? "Samostatně očekáváno" : "Očekáváno"} </small>
            <strong>{formatMoney(expected)}</strong>
          </span>
          <span className={styles.comparisonMetric}>
            <small>{storno ? "Odúčtováno" : "Vyplaceno"} </small>
            <strong>{paid === null ? "—" : formatMoney(paid)}</strong>
          </span>
        </>}
        <span className={styles.comparisonToggle}>Detail <ChevronDown size={14} aria-hidden="true" /></span>
      </summary>
      <div className={styles.comparisonDetail}>
        {statementCode && <span>Kód ve výpisu <strong>{statementCode}</strong></span>}
        {children}
      </div>
    </details>
  );
}
