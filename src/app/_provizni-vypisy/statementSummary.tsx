"use client";

import { useMemo } from "react";
import {
  Banknote,
  CalendarDays,
  HandCoins,
  UsersRound,
  WalletCards,
  type LucideIcon,
} from "lucide-react";

import { formatMoney } from "./statementParsing";
import type { CommissionRow, OtherPayment, ParsedStatement } from "./statementTypes";

const summaryIconToneClass: Record<"slate" | "emerald" | "sky" | "indigo", string> = {
  slate: "text-slate-500",
  emerald: "text-violet-700",
  sky: "text-violet-700",
  indigo: "text-violet-700",
};

const sumRows = (rows: CommissionRow[]): number =>
  rows.reduce((sum, row) => sum + row.commission, 0);

const sumPayments = (payments: OtherPayment[]): number =>
  payments.reduce((sum, payment) => sum + payment.amount, 0);

function SummaryStatCard({
  icon: Icon,
  label,
  value,
  tone = "slate",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone?: keyof typeof summaryIconToneClass;
}) {
  return (
    <div className="flex min-h-20 items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">
          {label}
        </div>
        <div className="mt-1 truncate text-base font-black text-slate-950">{value}</div>
      </div>
      <Icon className={`h-5 w-5 shrink-0 ${summaryIconToneClass[tone]}`} strokeWidth={2.2} aria-hidden="true" />
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
    <div className="overflow-hidden border-y border-violet-100 bg-white/35">
      <div className="grid divide-y divide-violet-100 md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-5">
        <SummaryStatCard
          icon={CalendarDays}
          label="Období"
          value={statement.header.period ?? "—"}
          tone="slate"
        />
        <SummaryStatCard
          icon={Banknote}
          label="Vyplaceno"
          value={statement.payoutTotal != null ? `${formatMoney(statement.payoutTotal)} Kč` : "—"}
          tone="emerald"
        />
        <SummaryStatCard
          icon={HandCoins}
          label="Záloha za smlouvy"
          value={`${formatMoney(totalCommission)} Kč`}
          tone="emerald"
        />
        <SummaryStatCard
          icon={WalletCards}
          label="Ostatní platby"
          value={`${formatMoney(totalOtherPayments)} Kč`}
          tone="sky"
        />
        <SummaryStatCard
          icon={UsersRound}
          label="Provize manažera"
          value={`${formatMoney(totalManagerCommission)} Kč`}
          tone="indigo"
        />
      </div>
    </div>
  );
}
