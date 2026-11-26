import { TipDialog } from "@/app/tipy/TipDialog";
import { matchesContractSearch, prepareContractSearch } from "@/app/lib/contractSearch";
import { useRef, useState } from "react";
import tipsterStyles from "../tipsterRewards.module.css";
import styles from "../monthModal.module.css";
import toolbarStyles from "../cashflowToolbar.module.css";
import { FileText, Loader2, Search, X } from "lucide-react";

import {
  calculateNetCashflow,
  calculateStornoFund,
  formatMoney,
  sortCashflowItemsForDisplay,
  STORNO_FUND_RATE,
} from "../helpers";
import type { CashflowCommissionStatementSummary, CashflowItem, MonthGroup } from "../types";
import { CashflowMonthSections } from "./CashflowMonthSections";
import { CashflowCommissionCard } from "./CashflowCommissionCard";
import { cashflowItemDisplayStatus, isCashflowCancellation, isShiftedCashflowPayout, type CashflowDisplayGroup } from "../commissionPresentation";
import { formatCashflowAmount, formatCashflowGroupCount, paidSubscriptionAmount } from "../cashflowLabels";
import { CashflowMonthFilterPicker, type CashflowMonthFilter } from "./CashflowMonthFilterPicker";

type CashflowMonthModalProps = {
  month: MonthGroup | null;
  loading?: boolean;
  loadingLabel?: string;
  loadingError?: string | null;
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
  if (item.isExtraPayout) return `extra:${item.id}`;
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
    const key = `${cashflowGroupKey(item)}|${isCashflowCancellation(item) ? "cancelled" : "commission"}`;
    const group = groupsByKey.get(key);
    if (group) {
      group.push(item);
    } else {
      groupsByKey.set(key, [item]);
      order.push(key);
    }
  }

  return order.map((key): CashflowDisplayGroup => {
    const groupItems = groupsByKey.get(key) ?? [];
    const amount = groupItems.reduce((sum, item) => sum + item.amount, 0);
    const stornoFundAmount = groupItems.reduce(
      (sum, item) =>
        sum +
        (item.isExtraPayout || item.isSubscriptionPayment
          ? 0
          : item.amount * STORNO_FUND_RATE),
      0
    );

    return {
      id: key,
      contractGroupId: cashflowGroupKey(groupItems[0]),
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
  loading = false,
  loadingLabel,
  loadingError,
  statements = [],
  statementLoadingId = null,
  onClose,
  onOpenStatement,
  tipsterMode = false,
}: CashflowMonthModalProps) {
  if (!month) {
    if (!loading && !loadingError) return null;
    if (tipsterMode) return <TipDialog title="Detail odměn" subtitle={loadingLabel} onClose={onClose}><div className={tipsterStyles.loading} role={loadingError ? "alert" : "status"}>{loadingError || "Načítám odměny za vybraný měsíc…"}</div></TipDialog>;
    return <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#08030f]/78 px-4 backdrop-blur-[7px]" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-busy={loading} aria-label={loadingLabel ?? "Detail měsíce"} className="w-full max-w-md rounded-2xl bg-white p-6 text-slate-900 shadow-xl" onClick={event => event.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-4"><h2 className="font-semibold">{loadingLabel ?? "Detail měsíce"}</h2>
          <button type="button" onClick={onClose} aria-label="Zavřít detail měsíce" className="rounded-lg p-2"><X size={20} /></button></div>
        {loadingError ? <p role="alert">{loadingError}</p> : <p role="status" className="flex items-center gap-2"><Loader2 size={18} className="animate-spin" />Načítám detail měsíce…</p>}
      </div>
    </div>;
  }

  return <CashflowMonthDetail key={month.key} month={month} statements={statements}
    statementLoadingId={statementLoadingId} onClose={onClose}
    onOpenStatement={onOpenStatement} tipsterMode={tipsterMode} />;
}

function CashflowMonthDetail({
  month, statements = [], statementLoadingId = null, onClose, onOpenStatement, tipsterMode = false,
}: Omit<CashflowMonthModalProps, "month"> & { month: MonthGroup }) {
  const [filter, setFilter] = useState<CashflowMonthFilter>("all");
  const [searchInput, setSearchInput] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const search = prepareContractSearch(searchInput);
  const hasSearch = search.text.length > 0;
  const filteredItems = month.items.filter(item =>
    (filter === "all" || cashflowItemDisplayStatus(item) === filter) &&
    matchesContractSearch(item, search)
  );
  const sortedItems = sortCashflowItemsForDisplay(filteredItems).sort((a, b) =>
    Number(isShiftedCashflowPayout(a)) - Number(isShiftedCashflowPayout(b))
  );
  const displayGroups = buildCashflowDisplayGroups(sortedItems).sort((a, b) =>
    Number(a.items.some(isShiftedCashflowPayout)) - Number(b.items.some(isShiftedCashflowPayout))
  );
  const tipOnlyMonth =
    tipsterMode ||
    (month.items.length > 0 && month.items.every((item) => item.isTipPayout === true));
  const subscriptionOnlyMonth =
    month.items.length > 0 &&
    month.items.every((item) => item.isSubscriptionPayment === true);
  const isPaidMonth = month.totalSource === "paid";
  const subscriptionReceipts = paidSubscriptionAmount(month);
  const extraPayoutReceipts = month.extraPayoutTotal ?? month.items.reduce(
    (sum, item) => sum + (item.isExtraPayout && !item.isOfficeContribution && item.payoutStatus === "paid" ? item.amount : 0), 0
  );
  const hasAdditionalReceipts = subscriptionReceipts !== 0 || extraPayoutReceipts !== 0;
  const otherPaidCommissions = month.statementPayoutTotal == null
    ? Math.round((month.total - subscriptionReceipts - extraPayoutReceipts) * 100) / 100
    : 0;
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

  if (tipsterMode) return <TipDialog title="Detail odměn" subtitle={month.label} onClose={onClose}>
    <div className={tipsterStyles.monthDetail}>
      <div className={tipsterStyles.monthSummary}>
        {isPaidMonth ? <>
          <div><span>Vyplaceno</span><strong>{formatMoney(month.total)}</strong></div>
          <div><span>Předpoklad systému</span><strong>{formatMoney(predictedTotal)}</strong></div>
          <div><span>Rozdíl proti předpokladu</span><strong>{formatMoney(payoutDifference)}</strong></div>
        </> : <>
          <div><span>Očekávané provize</span><strong>{formatMoney(month.total)}</strong></div>
          <div><span>Stornofond ({stornoPercent} %)</span><strong>{formatMoney(stornoFund)}</strong></div>
          <div><span>Po odpočtu</span><strong>{formatMoney(netTotal)}</strong></div>
        </>}
      </div>
      <div className={tipsterStyles.monthItems}>{displayGroups.map((group) => <CashflowCommissionCard key={group.id} group={group} />)}</div>
    </div>
  </TipDialog>;

  return (
    <>
      <div
        className="fixed inset-0 z-30 flex items-end justify-center bg-[#08030f]/78 px-2 py-2 backdrop-blur-[7px] sm:items-center sm:px-3 sm:py-4"
        onClick={onClose}
      >
      <div
        className="relative flex max-h-[calc(100dvh-1rem)] w-full flex-col overflow-hidden rounded-[22px] border border-slate-200 bg-white p-2 text-slate-900 shadow-[0_34px_82px_rgba(2,6,23,0.36)] sm:max-h-[95vh] sm:w-[min(1520px,96vw)] sm:rounded-[28px] sm:p-4"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className={`ui-focus ${styles.closeButton}`}
          aria-label="Zavřít přehled měsíce"
        >
          <X className="h-4 w-4 sm:h-5 sm:w-5" />
        </button>

        <div className="relative z-[1] flex min-h-0 flex-1 flex-col gap-2 sm:gap-3">
          <div className={styles.header}>
            <div className={styles.headerLayout}>
              <div className={styles.identity}>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500 sm:text-[11px] sm:tracking-[0.2em]">
                      Přehled měsíce
                    </p>
                    <h3 className="text-[1.45rem] font-bold leading-tight text-slate-900 sm:text-[2rem]">
                      {month.label}
                    </h3>
                    <p aria-live="polite" className="text-xs text-slate-600 sm:text-sm">{itemCountLabel}</p>
                  </div>
                  <div className="flex min-w-0 max-w-sm flex-[1_1_22rem] items-center gap-2">
                    <div className="shrink-0">
                      <CashflowMonthFilterPicker value={filter} onChange={setFilter} />
                    </div>
                    <div className={toolbarStyles.search}>
                      <Search className={toolbarStyles.searchIcon} size={16} aria-hidden="true" />
                      <input
                        ref={searchRef}
                        type="search"
                        aria-label="Hledat podle čísla smlouvy nebo jména klienta"
                        placeholder="Číslo smlouvy / klient"
                        autoComplete="off"
                        spellCheck={false}
                        value={searchInput}
                        onChange={(event) => setSearchInput(event.target.value)}
                      />
                      {searchInput && (
                        <button
                          type="button"
                          className={toolbarStyles.clearSearch}
                          aria-label="Vymazat hledání"
                          onClick={() => {
                            setSearchInput("");
                            searchRef.current?.focus();
                          }}
                        >
                          <X size={14} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                {(filter !== "all" || hasSearch) && <p className="mt-1 text-xs text-slate-500">Souhrn částek je za celý měsíc.</p>}
              </div>

              <div className={styles.summary}>
                {statements.length > 0 && onOpenStatement && (
                  <div className={styles.statements}>
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

                <div className={styles.metrics}>
                  {isPaidMonth ? (
                    <>
                      <div className={`${styles.metric} ${styles.green}`}>
                        <div className={styles.metricLabel}>
                          {hasAdditionalReceipts ? "Přijato celkem" : "Vyplaceno"}
                        </div>
                        <div className={styles.metricAmount}>
                          {formatMoney(month.total)}
                        </div>
                        {hasAdditionalReceipts && <div className={styles.receipts}>
                          {month.statementPayoutTotal != null && <p>Výpis: {formatMoney(month.statementPayoutTotal)}</p>}
                          {otherPaidCommissions !== 0 && <p>Vyplacené provize: {formatMoney(otherPaidCommissions)}</p>}
                          {subscriptionReceipts !== 0 && <p>Předplatné: {formatMoney(subscriptionReceipts)}</p>}
                          {extraPayoutReceipts !== 0 && <p>Mimořádné odměny: {formatMoney(extraPayoutReceipts)}</p>}
                        </div>}
                      </div>

                      <div className={`${styles.metric} ${styles.purple}`}>
                        <div className={styles.metricLabel}>
                          Předpoklad systému
                        </div>
                        <div className={styles.metricAmount}>
                          {formatCashflowAmount(predictedTotal, month.hasUnknownAmounts)}
                        </div>
                      </div>

                      <div
                        className={`${styles.metric} ${payoutDifference >= 0 ? styles.green : styles.red}`}
                      >
                        <div className={styles.metricLabel}>
                          Rozdíl
                        </div>
                        <div className={styles.metricAmount}>
                          {month.hasUnknownAmounts ? "???" :
                            `${payoutDifference >= 0 ? "+ " : "- "}${formatMoney(Math.abs(payoutDifference))}`}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className={`${styles.metric} ${styles.purple}`}>
                        <div className={styles.metricLabel}>
                          {grossTotalLabel}
                        </div>
                        <div className={styles.metricAmount}>
                          {formatCashflowAmount(month.total, month.hasUnknownAmounts)}
                        </div>
                      </div>

                      <div className={`${styles.metric} ${styles.red}`}>
                        <div className={styles.metricLabel}>
                          STORNO fond ({stornoPercent} %)
                        </div>
                        <div className={styles.metricAmount}>
                          {(!month.hasUnknownAmounts || stornoFund !== 0) && "- "}{formatCashflowAmount(stornoFund, month.hasUnknownAmounts)}
                        </div>
                      </div>

                      <div className={`${styles.metric} ${styles.green}`}>
                        <div className={styles.metricLabel}>
                          Čisté cashflow
                        </div>
                        <div className={styles.metricAmount}>
                          {formatCashflowAmount(netTotal, month.hasUnknownAmounts)}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className={styles.list}>
            {displayGroups.length === 0 ? <p role="status" className="px-4 py-10 text-center text-sm text-slate-500">
              {hasSearch ? "Hledání v tomto měsíci nenašlo žádné položky." : "Pro vybraný filtr nejsou v tomto měsíci žádné položky."}
            </p> : <CashflowMonthSections groups={displayGroups} monthKey={month.key} expandSections={hasSearch}>
              {(group) => <CashflowCommissionCard group={group} />}
            </CashflowMonthSections>}
          </div>
        </div>
      </div>
      </div>
    </>
  );
}
