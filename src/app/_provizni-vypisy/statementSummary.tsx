"use client";

import { useMemo } from "react";
import {
  Banknote,
  HandCoins,
  UsersRound,
  WalletCards,
  type LucideIcon,
} from "lucide-react";

import { formatMoney } from "./statementParsing";
import type { CommissionRow, OtherPayment, ParsedStatement } from "./statementTypes";
import styles from "./statementWorkspace.module.css";

const sumRows = (rows: CommissionRow[]): number =>
  rows.reduce((sum, row) => sum + row.commission, 0);

const sumPayments = (payments: OtherPayment[]): number =>
  payments.reduce((sum, payment) => sum + payment.amount, 0);

function SummaryStatCard({
  icon: Icon,
  label,
  value,
  description,
  primary = false,
}: {
  icon: LucideIcon;
  label: string;
  value: number | null;
  description: string;
  primary?: boolean;
}) {
  return (
    <div className={styles.stat} data-primary={primary}>
      <dt>{label}<Icon aria-hidden="true" /></dt>
      <dd><span>{value == null ? "—" : formatMoney(value)}</span>{value != null && <span className={styles.currency}>Kč</span>}<span className={styles.statDescription}>{description}</span></dd>
    </div>
  );
}

export function StatementSummary({ statement }: { statement: ParsedStatement }) {
  const totalCommission = useMemo(
    () => sumRows(statement.commissionRows),
    [statement.commissionRows]
  );
  const totalOtherPayments = useMemo(
    () => sumPayments(statement.otherPayments),
    [statement.otherPayments]
  );
  const totalManagerCommission = useMemo(
    () =>
      statement.managerCommissions.reduce(
        (sum, advisor) => sum + advisor.commission + advisor.stornos + advisor.deductions,
        0
      ),
    [statement.managerCommissions]
  );

  return (
    <dl className={styles.summary} aria-label="Souhrn výpisu">
        <SummaryStatCard
          icon={Banknote}
          label="Vyplaceno dle výpisu"
          description="Celková částka uvedená ve výpisu."
          value={statement.payoutTotal ?? null}
          primary
        />
        <SummaryStatCard
          icon={HandCoins}
          label="Provize za smlouvy"
          description="Součet provizních řádků za smlouvy."
          value={totalCommission}
        />
        <SummaryStatCard
          icon={WalletCards}
          label="Ostatní platby"
          description="Další platby uvedené ve výpisu."
          value={totalOtherPayments}
        />
        <SummaryStatCard
          icon={UsersRound}
          label="Provize manažera"
          description="Meziprovize ze smluv tvého týmu."
          value={totalManagerCommission}
        />
    </dl>
  );
}
