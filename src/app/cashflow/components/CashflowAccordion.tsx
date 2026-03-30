import Link from "next/link";

import { formatMoney, productLabel } from "../helpers";
import type { CashflowItem, YearGroup } from "../types";

type CashflowAccordionProps = {
  yearGroups: YearGroup[];
  expandedYears: Record<number, boolean>;
  expandedMonths: Record<string, boolean>;
  onToggleYear: (year: number) => void;
  onToggleMonth: (monthKey: string) => void;
  onSelectItem: (item: CashflowItem) => void;
};

export function CashflowAccordion({
  yearGroups,
  expandedYears,
  expandedMonths,
  onToggleYear,
  onToggleMonth,
  onSelectItem,
}: CashflowAccordionProps) {
  return (
    <div className="space-y-5">
      {yearGroups.map((yearGroup) => {
        const yearOpen = expandedYears[yearGroup.year] ?? false;
        const activeMonths = yearGroup.months.length;
        const averagePerActiveMonth =
          yearGroup.total / Math.max(activeMonths, 1);
        const maxMonthTotal = Math.max(
          ...yearGroup.months.map((month) => month.total),
          1
        );

        return (
          <section
            key={yearGroup.year}
            className="cashflow-card-year relative overflow-hidden rounded-3xl border border-white/20 bg-white/[0.06] p-4 sm:p-5 backdrop-blur-3xl shadow-[0_18px_55px_rgba(0,0,0,0.5)]"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-cyan-300/18 blur-3xl"
            />

            <button
              type="button"
              onClick={() => onToggleYear(yearGroup.year)}
              className="relative z-10 flex w-full items-center justify-between gap-4 text-left"
            >
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-300/80">
                  Cashflow rok
                </p>
                <h2 className="text-xl sm:text-2xl font-semibold text-slate-50 drop-shadow-[0_8px_18px_rgba(0,0,0,0.45)]">
                  Rok {yearGroup.year}
                </h2>
                <p className="mt-1 text-sm text-slate-200/85">
                  {activeMonths} aktivních měsíců
                </p>
              </div>

              <div className="flex items-center gap-3 sm:gap-4">
                <div className="text-right">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-200/80">
                    Celkem
                  </p>
                  <p className="text-lg sm:text-2xl font-semibold leading-none text-emerald-100">
                    {formatMoney(yearGroup.total)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-200/80">
                    Průměr / měsíc
                  </p>
                  <p className="text-lg sm:text-2xl font-semibold leading-none text-emerald-100">
                    {formatMoney(averagePerActiveMonth)}
                  </p>
                </div>

                <span
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/30 bg-white/12 text-xs text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] transition-transform ${
                    yearOpen ? "rotate-90" : ""
                  }`}
                >
                  ▶
                </span>
              </div>
            </button>

            {yearOpen && (
              <div className="relative z-10 mt-4 border-t border-white/15 pt-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {yearGroup.months.map((month) => {
                    const isOpen = expandedMonths[month.key] ?? false;
                    const monthRatio = Math.min(
                      100,
                      Math.round((month.total / maxMonthTotal) * 100)
                    );

                    return (
                      <div
                        key={month.key}
                        className="cashflow-card-month relative overflow-hidden rounded-2xl border border-white/18 bg-white/[0.06] p-3 backdrop-blur-2xl shadow-[0_12px_30px_rgba(0,0,0,0.4)]"
                      >
                        <div
                          aria-hidden
                          className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent"
                        />

                        <button
                          type="button"
                          onClick={() => onToggleMonth(month.key)}
                          className="flex w-full items-center justify-between gap-3 text-left"
                        >
                          <div className="min-w-0">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-300/75">
                              Měsíc
                            </p>
                            <h3 className="text-lg font-semibold text-slate-50">
                              {month.label}
                            </h3>
                            <p className="mt-1 text-sm text-slate-200/80">
                              {month.items.length} položek
                            </p>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-200/80">
                                Součet
                              </p>
                              <p className="text-base sm:text-lg font-semibold text-emerald-100">
                                {formatMoney(month.total)}
                              </p>
                            </div>

                            <span
                              className={`inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/30 bg-white/10 text-[11px] text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] transition-transform ${
                                isOpen ? "rotate-90" : ""
                              }`}
                            >
                              ▶
                            </span>
                          </div>
                        </button>

                        <div className="mt-2 h-1.5 rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-emerald-300 shadow-[0_0_14px_rgba(52,211,153,0.55)]"
                            style={{ width: `${Math.max(monthRatio, 6)}%` }}
                          />
                        </div>

                        {isOpen && (
                          <div className="mt-3 space-y-2 border-t border-white/15 pt-3">
                            {month.items.map((item) => {
                              const dateLabel = item.date.toLocaleDateString("cs-CZ");
                              const contractNo =
                                item.contractNumber && item.contractNumber.trim() !== ""
                                  ? item.contractNumber
                                  : null;
                              const clientName =
                                item.clientName && item.clientName.trim() !== ""
                                  ? item.clientName.trim()
                                  : null;
                              const ownerEmail =
                                item.ownerEmail && item.ownerEmail.trim() !== ""
                                  ? item.ownerEmail.trim().toLowerCase()
                                  : null;
                              const baseEntryId =
                                item.entryId && item.entryId.trim() !== ""
                                  ? item.entryId.trim()
                                  : null;
                              const contractSlug =
                                ownerEmail && baseEntryId
                                  ? `${ownerEmail}___${baseEntryId}`
                                  : null;
                              const href = contractSlug
                                ? `/smlouvy/${encodeURIComponent(contractSlug)}`
                                : null;
                              const containerClasses =
                                "flex items-start justify-between gap-3 rounded-xl border border-white/15 bg-white/[0.07] px-3 py-2.5 text-xs sm:text-sm backdrop-blur-xl transition hover:border-cyan-200/40 hover:bg-white/[0.11]";

                              return (
                                <div key={item.id} className={containerClasses}>
                                  <button
                                    type="button"
                                    onClick={() => onSelectItem(item)}
                                    className="min-w-0 flex-1 text-left"
                                  >
                                    <span className="text-[11px] text-slate-300/80">
                                      {dateLabel}
                                    </span>
                                    <div className="text-slate-100 font-medium">
                                      {productLabel(item.productKey)}
                                      {contractNo && (
                                        <span className="text-slate-300/95 font-normal">
                                          {" "}
                                          · {contractNo}
                                        </span>
                                      )}
                                    </div>
                                    {clientName && (
                                      <div className="text-[11px] text-slate-200/80">
                                        Klient: {clientName}
                                      </div>
                                    )}
                                    {item.note && (
                                      <div className="text-[11px] text-slate-300/75">
                                        {item.note}
                                      </div>
                                    )}
                                  </button>

                                  <div className="flex shrink-0 items-center gap-2">
                                    <div className="text-right text-sm font-semibold text-emerald-100">
                                      {formatMoney(item.amount)}
                                    </div>
                                    {href && (
                                      <Link
                                        href={href}
                                        className="inline-flex items-center gap-1 rounded-full border border-white/25 bg-white/10 px-2 py-1 text-[11px] text-slate-100 transition hover:border-cyan-200/45 hover:bg-white/16"
                                      >
                                        Otevřít
                                      </Link>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
