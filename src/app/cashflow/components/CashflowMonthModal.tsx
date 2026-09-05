import { FileText, Loader2, X } from "lucide-react";

import {
  calculateNetCashflow,
  calculateStornoFund,
  formatMoney,
  sortCashflowItemsForDisplay,
  STORNO_EXEMPT_PRODUCT,
  STORNO_FUND_RATE,
} from "../helpers";
import type { CashflowCommissionStatementSummary, CashflowItem, MonthGroup } from "../types";
import { CashflowMonthSections } from "./CashflowMonthSections";
import { CashflowCommissionCard } from "./CashflowCommissionCard";
import type { CashflowDisplayGroup } from "../commissionPresentation";
import { formatCashflowGroupCount } from "../cashflowLabels";

type CashflowMonthModalProps = {
  month: MonthGroup | null;
  statements?: CashflowCommissionStatementSummary[];
  statementLoadingId?: string | null;
  onClose: () => void;
  onOpenStatement?: (statement: CashflowCommissionStatementSummary) => void;
  tipsterMode?: boolean;
};

function normalizeGroupKeyPart(value?: string | null): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function cashflowGroupKey(item: CashflowItem): string {
  if (item.isTipPayout) return `tip:${item.id}`;
  if (item.isSubscriptionPayment) return `subscription:${item.id}`;
  const contractNumber = normalizeGroupKeyPart(item.contractNumber);
  const clientName = normalizeGroupKeyPart(item.clientName);
  if (!contractNumber || !clientName) return `single:${item.id}`;
  const source = item.source === "manager" || item.isManagerOverride ? "team" : "own";
  return [
    source,
    normalizeGroupKeyPart(item.ownerEmail),
    item.productKey,
    contractNumber,
    clientName,
  ].join("|");
}

function buildCashflowDisplayGroups(items: CashflowItem[]): CashflowDisplayGroup[] {
  const groupsByKey = new Map<string, CashflowItem[]>();
  const order: string[] = [];

  for (const item of items) {
    const key = cashflowGroupKey(item);
    const group = groupsByKey.get(key);
    if (group) {
      group.push(item);
    } else {
      groupsByKey.set(key, [item]);
      order.push(key);
    }
  }

  return order.map((key) => {
    const groupItems = groupsByKey.get(key) ?? [];
    const amount = groupItems.reduce((sum, item) => sum + item.amount, 0);
    const stornoFundAmount = groupItems.reduce(
      (sum, item) =>
        sum +
        (item.isSubscriptionPayment || item.productKey === STORNO_EXEMPT_PRODUCT
          ? 0
          : item.amount * STORNO_FUND_RATE),
      0
    );

    return {
      id: key,
      leadItem: groupItems[0],
      items: groupItems,
      amount,
      stornoFundAmount,
      netAmount: amount - stornoFundAmount,
    };
  }).filter((group): group is CashflowDisplayGroup => Boolean(group.leadItem));
}

export function CashflowMonthModal({
  month,
  statements = [],
  statementLoadingId = null,
  onClose,
  onOpenStatement,
  tipsterMode = false,
}: CashflowMonthModalProps) {
  if (!month) return null;

  const sortedItems = sortCashflowItemsForDisplay(month.items);
  const displayGroups = buildCashflowDisplayGroups(sortedItems);
  const tipOnlyMonth =
    tipsterMode ||
    (month.items.length > 0 && month.items.every((item) => item.isTipPayout === true));
  const subscriptionOnlyMonth =
    month.items.length > 0 &&
    month.items.every((item) => item.isSubscriptionPayment === true);
  const isPaidMonth = month.totalSource === "paid";
  const predictedTotal = month.predictedTotal ?? month.total;
  const payoutDifference = month.total - predictedTotal;
  const stornoFund = calculateStornoFund(month.items);
  const netTotal = isPaidMonth ? month.total : calculateNetCashflow(month.total, stornoFund);
  const stornoPercent = Math.round(STORNO_FUND_RATE * 100);
  const grossTotalLabel = tipOnlyMonth
    ? "TIP provize"
    : subscriptionOnlyMonth
    ? "Předplatné"
    : "Předpoklad";
  const itemCountLabel = formatCashflowGroupCount(displayGroups);

  return (
    <>
      <div
        className="fixed inset-0 z-30 flex items-end justify-center bg-[#08030f]/78 px-2 py-2 backdrop-blur-[7px] sm:items-center sm:px-3 sm:py-4"
        onClick={onClose}
      >
      <div
        className="relative flex max-h-[calc(100dvh-1rem)] w-full flex-col overflow-hidden rounded-[22px] border border-slate-200 bg-[#fbfdff] p-2 text-slate-900 shadow-[0_34px_82px_rgba(2,6,23,0.36)] sm:max-h-[95vh] sm:w-[min(1520px,96vw)] sm:rounded-[28px] sm:p-4"
        onClick={(event) => event.stopPropagation()}
      >
        <span
          className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-[linear-gradient(90deg,#ca85ff_0%,#aa57f5_46%,#8f44e8_100%)]"
          aria-hidden="true"
        />
        <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(244,239,252,0.96)_0%,rgba(250,248,255,0.98)_44%,rgba(252,251,255,1)_100%)]" />
        <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(146deg,rgba(197,105,255,0.08)_0%,rgba(197,105,255,0)_38%,rgba(166,86,246,0.06)_100%)]" />
        <span className="pointer-events-none absolute -top-20 left-28 h-[21rem] w-px rotate-[35deg] bg-[#9a5dcb]/10" />
        <span className="pointer-events-none absolute -right-16 top-10 hidden h-40 w-40 rounded-full bg-[#ae62ff]/12 blur-3xl sm:block" />

        <button
          type="button"
          onClick={onClose}
          className="ui-focus absolute right-3 top-3 z-[2] inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 shadow-[0_8px_18px_rgba(15,23,42,0.08)] transition hover:border-slate-400 hover:text-slate-900 sm:h-12 sm:w-12"
          aria-label="Zavřít přehled měsíce"
        >
          <X className="h-4 w-4 sm:h-5 sm:w-5" />
        </button>

        <div className="relative z-[1] flex min-h-0 flex-1 flex-col gap-2 sm:gap-3">
          <div className="px-1 pt-1 pr-10 sm:pr-14">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500 sm:text-[11px] sm:tracking-[0.2em]">
                  Přehled měsíce
                </p>
                <h3 className="text-[1.45rem] font-bold leading-tight text-slate-900 sm:text-[2.45rem]">
                  {month.label}
                </h3>
                <p className="text-xs text-slate-600 sm:text-sm">{itemCountLabel}</p>
              </div>

              <div className="flex flex-col items-stretch gap-3 xl:items-end">
                {statements.length > 0 && onOpenStatement && (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {statements.map((statement, index) => {
                      const isLoading = statementLoadingId === statement.id;
                      const label =
                        statements.length === 1
                          ? "Provizní výpis"
                          : `Výpis ${statement.statementNumber ?? index + 1}`;
                      return (
                        <button
                          key={statement.id}
                          type="button"
                          onClick={() => onOpenStatement(statement)}
                          disabled={isLoading}
                          className="ui-focus inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-[0_8px_18px_rgba(15,23,42,0.08)] transition hover:border-slate-500 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-70 sm:gap-2 sm:px-3.5 sm:text-sm"
                        >
                          {isLoading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.2} aria-hidden="true" />
                          ) : (
                            <FileText className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
                          )}
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="block">
                  <div className="grid grid-cols-3 gap-1.5 sm:gap-3 md:grid-cols-3">
                    {isPaidMonth ? (
                      <>
                        <div className="min-w-0 rounded-[13px] border border-emerald-300 bg-emerald-50 px-2 py-2 text-left sm:min-w-[175px] sm:rounded-[16px] sm:px-4 sm:py-2.5 sm:text-right">
                          <div className="text-[8px] font-semibold uppercase tracking-[0.1em] text-emerald-700 sm:text-[10px] sm:tracking-[0.16em]">
                            Vyplaceno
                          </div>
                          <div className="mt-1 whitespace-nowrap font-mono text-[0.98rem] font-bold leading-none tracking-[-0.02em] text-emerald-700 sm:text-[1.7rem]">
                            {formatMoney(month.total)}
                          </div>
                        </div>

                        <div className="min-w-0 rounded-[13px] border border-[#d7c3ed] bg-[#f4ecff] px-2 py-2 text-left sm:min-w-[175px] sm:rounded-[16px] sm:px-4 sm:py-2.5 sm:text-right">
                          <div className="text-[8px] font-semibold uppercase tracking-[0.1em] text-[#71558f] sm:text-[10px] sm:tracking-[0.16em]">
                            Předpoklad systému
                          </div>
                          <div className="mt-1 whitespace-nowrap font-mono text-[0.98rem] font-bold leading-none tracking-[-0.02em] text-[#1a1028] sm:text-[1.7rem]">
                            {formatMoney(predictedTotal)}
                          </div>
                        </div>

                        <div
                          className={`min-w-0 rounded-[13px] border px-2 py-2 text-left sm:min-w-[175px] sm:rounded-[16px] sm:px-4 sm:py-2.5 sm:text-right ${
                            payoutDifference >= 0
                              ? "border-emerald-300 bg-emerald-50"
                              : "border-rose-200 bg-rose-50"
                          }`}
                        >
                          <div
                            className={`text-[8px] font-semibold uppercase tracking-[0.1em] sm:text-[10px] sm:tracking-[0.16em] ${
                              payoutDifference >= 0 ? "text-emerald-700" : "text-rose-700"
                            }`}
                          >
                            Rozdíl
                          </div>
                          <div
                            className={`mt-1 whitespace-nowrap font-mono text-[0.98rem] font-bold leading-none tracking-[-0.02em] sm:text-[1.7rem] ${
                              payoutDifference >= 0 ? "text-emerald-700" : "text-rose-700"
                            }`}
                          >
                            {payoutDifference >= 0 ? "+ " : "- "}
                            {formatMoney(Math.abs(payoutDifference))}
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="min-w-0 rounded-[13px] border border-[#d7c3ed] bg-[#f4ecff] px-2 py-2 text-left sm:min-w-[175px] sm:rounded-[16px] sm:px-4 sm:py-2.5 sm:text-right">
                          <div className="text-[8px] font-semibold uppercase tracking-[0.1em] text-[#71558f] sm:text-[10px] sm:tracking-[0.16em]">
                            {grossTotalLabel}
                          </div>
                          <div className="mt-1 whitespace-nowrap font-mono text-[0.98rem] font-bold leading-none tracking-[-0.02em] text-[#1a1028] sm:text-[1.7rem]">
                            {formatMoney(month.total)}
                          </div>
                        </div>

                        <div className="min-w-0 rounded-[13px] border border-rose-200 bg-rose-50 px-2 py-2 text-left sm:min-w-[175px] sm:rounded-[16px] sm:px-4 sm:py-2.5 sm:text-right">
                          <div className="text-[8px] font-semibold uppercase tracking-[0.1em] text-rose-700 sm:text-[10px] sm:tracking-[0.16em]">
                            STORNO fond ({stornoPercent} %)
                          </div>
                          <div className="mt-1 whitespace-nowrap font-mono text-[0.98rem] font-bold leading-none tracking-[-0.02em] text-rose-700 sm:text-[1.7rem]">
                            - {formatMoney(stornoFund)}
                          </div>
                        </div>

                        <div className="min-w-0 rounded-[13px] border border-emerald-300 bg-emerald-50 px-2 py-2 text-left sm:min-w-[175px] sm:rounded-[16px] sm:px-4 sm:py-2.5 sm:text-right">
                          <div className="text-[8px] font-semibold uppercase tracking-[0.1em] text-emerald-700 sm:text-[10px] sm:tracking-[0.16em]">
                            Čisté cashflow
                          </div>
                          <div className="mt-1 whitespace-nowrap font-mono text-[0.98rem] font-bold leading-none tracking-[-0.02em] text-emerald-700 sm:text-[1.7rem]">
                            {formatMoney(netTotal)}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-[16px] border border-slate-200 bg-[#f7f8fd] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.92)] sm:rounded-[22px] sm:p-3">
            <CashflowMonthSections groups={displayGroups} monthKey={month.key}>
              {(group) => <CashflowCommissionCard group={group} />}
            </CashflowMonthSections>
          </div>
        </div>
      </div>
      </div>
    </>
  );
}
