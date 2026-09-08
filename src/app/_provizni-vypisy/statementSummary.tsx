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
  primary = false,
}: {
  icon: LucideIcon;
  label: string;
  value: number | null;
  primary?: boolean;
}) {
  return (
    <div className={styles.stat} data-primary={primary}>
      <dt>{label}<Icon aria-hidden="true" /></dt>
      <dd><span>{value == null ? "—" : formatMoney(value)}</span>{value != null && <span className={styles.currency}>Kč</span>}</dd>
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
          label="Vyplaceno"
          value={statement.payoutTotal ?? null}
          primary
        />
        <SummaryStatCard
          icon={HandCoins}
          label="Záloha za smlouvy"
          value={totalCommission}
        />
        <SummaryStatCard
          icon={WalletCards}
          label="Ostatní platby"
          value={totalOtherPayments}
        />
        <SummaryStatCard
          icon={UsersRound}
          label="Provize manažera"
          value={totalManagerCommission}
        />
    </dl>
  );
}
