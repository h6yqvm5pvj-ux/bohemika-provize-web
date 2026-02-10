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
    <div className="space-y-4">
      {yearGroups.map((yearGroup) => {
        const yearOpen = expandedYears[yearGroup.year] ?? false;
        const averageMonthly = yearGroup.total / 12;

        return (
          <section
            key={yearGroup.year}
            className="cashflow-card-year rounded-2xl bg-slate-950/80 border border-white/12 backdrop-blur-2xl px-4 py-4 sm:px-5 sm:py-5 shadow-[0_18px_60px_rgba(0,0,0,0.85)] simple-bg-white:bg-white simple-bg-white:border-slate-200 simple-bg-white:shadow-[0_12px_36px_rgba(15,23,42,0.12)]"
          >
            <button
              type="button"
              onClick={() => onToggleYear(yearGroup.year)}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400 simple-bg-white:text-slate-500">
                  Rok výplat
                </p>
                <h2 className="text-lg sm:text-xl font-semibold text-slate-50 simple-bg-white:text-slate-900">
                  Rok {yearGroup.year}
                </h2>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-emerald-300/80 simple-bg-white:text-slate-500">
                    Celkem na odměnách
                  </p>
                  <p className="text-base sm:text-lg font-semibold text-emerald-300 simple-bg-white:text-slate-900">
                    {formatMoney(yearGroup.total)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-emerald-300/80 simple-bg-white:text-slate-500">
                    Průměrná měsíční odměna
                  </p>
                  <p className="text-base sm:text-lg font-semibold text-emerald-300 simple-bg-white:text-slate-900">
                    {formatMoney(averageMonthly)}
                  </p>
                </div>

                <span
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-white/5 text-xs transition-transform simple-bg-white:border-slate-300 simple-bg-white:bg-white ${
                    yearOpen ? "rotate-90" : ""
                  }`}
                >
                  ▶
                </span>
              </div>
            </button>

            {yearOpen && (
              <div className="mt-4 space-y-3 border-t border-white/10 pt-3">
                {yearGroup.months.map((month) => {
                  const isOpen = expandedMonths[month.key] ?? false;

                  return (
                    <div
                      key={month.key}
                      className="cashflow-card-month rounded-2xl bg-slate-950/70 border border-white/10 backdrop-blur-xl px-3 py-3 sm:px-4 sm:py-4 shadow-[0_12px_40px_rgba(0,0,0,0.7)] simple-bg-white:bg-white simple-bg-white:border-slate-200 simple-bg-white:text-slate-900 simple-bg-white:shadow-[0_10px_28px_rgba(15,23,42,0.1)]"
                    >
                      <button
                        type="button"
                        onClick={() => onToggleMonth(month.key)}
                        className="flex w-full items-center justify-between gap-3 text-left"
                      >
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400 simple-bg-white:text-slate-500">
                            Měsíc výplaty
                          </p>
                          <h3 className="text-base sm:text-lg font-semibold text-slate-50 simple-bg-white:text-slate-900">
                            {month.label}
                          </h3>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-[10px] uppercase tracking-[0.16em] text-emerald-300/80 simple-bg-white:text-slate-500">
                              Součet
                            </p>
                            <p className="text-sm sm:text-base font-semibold text-emerald-300 simple-bg-white:text-slate-900">
                              {formatMoney(month.total)}
                            </p>
                          </div>

                          <span
                            className={`inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/20 bg-white/5 text-[11px] transition-transform simple-bg-white:border-slate-300 simple-bg-white:bg-white ${
                              isOpen ? "rotate-90" : ""
                            }`}
                          >
                            ▶
                          </span>
                        </div>
                      </button>

                      {isOpen && (
                        <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
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
                              "flex items-center justify-between gap-3 rounded-xl bg-white/4 border border-white/10 px-3 py-2.5 text-xs sm:text-sm transition hover:border-emerald-300/30 hover:bg-white/6";

                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => onSelectItem(item)}
                                className={`${containerClasses} text-left w-full`}
                              >
                                <div className="flex flex-col">
                                  <span className="text-[11px] text-slate-400">{dateLabel}</span>
                                  <span className="text-slate-100 font-medium">
                                    {productLabel(item.productKey)}
                                    {contractNo && (
                                      <span className="text-slate-300 font-normal">
                                        {" "}· {contractNo}
                                      </span>
                                    )}
                                  </span>
                                  {clientName && (
                                    <span className="text-[11px] text-slate-300">
                                      Klient: {clientName}
                                    </span>
                                  )}
                                  {item.note && (
                                    <span className="text-[11px] text-slate-400">{item.note}</span>
                                  )}
                                </div>

                                <div className="flex items-center gap-2">
                                  <div className="text-right text-sm font-semibold text-slate-50">
                                    {formatMoney(item.amount)}
                                  </div>
                                  {href && (
                                    <Link
                                      href={href}
                                      onClick={(event) => event.stopPropagation()}
                                      className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-slate-200 hover:border-emerald-300/40 hover:text-emerald-100"
                                    >
                                      Otevřít smlouvu
                                    </Link>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
