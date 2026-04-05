import { formatMoney } from "../helpers";
import type { MonthGroup, YearGroup } from "../types";

type CashflowAccordionProps = {
  yearGroups: YearGroup[];
  expandedYears: Record<number, boolean>;
  onToggleYear: (year: number) => void;
  onSelectMonth: (month: MonthGroup) => void;
};

export function CashflowAccordion({
  yearGroups,
  expandedYears,
  onToggleYear,
  onSelectMonth,
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
            className="cashflow-card-year relative overflow-hidden rounded-3xl border border-slate-900 bg-slate-900 p-4 sm:p-5 shadow-[0_12px_24px_rgba(15,23,42,0.28)]"
          >

            <button
              type="button"
              onClick={() => onToggleYear(yearGroup.year)}
              className="relative z-10 flex w-full items-center justify-between gap-4 text-left"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold uppercase tracking-[0.08em] text-white">
                  Cashflow rok
                </p>
                <h2 className="text-xl sm:text-2xl font-semibold text-white">
                  {yearGroup.year}
                </h2>
              </div>

              <div className="flex items-center gap-3 sm:gap-4">
                <div className="text-right">
                  <p className="text-sm font-semibold uppercase tracking-[0.08em] text-white">
                    Celkem
                  </p>
                  <p className="text-2xl sm:text-3xl font-semibold leading-none text-emerald-400">
                    {formatMoney(yearGroup.total)}
                  </p>
                </div>
                <div className="ml-3 text-right sm:ml-6">
                  <p className="text-sm font-semibold uppercase tracking-[0.08em] text-white">
                    Průměr / měsíc
                  </p>
                  <p className="text-2xl sm:text-3xl font-semibold leading-none text-emerald-400">
                    {formatMoney(averagePerActiveMonth)}
                  </p>
                </div>

                <span
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/30 bg-black text-xs text-white transition-transform ${
                    yearOpen ? "rotate-90" : ""
                  }`}
                >
                  ▶
                </span>
              </div>
            </button>

            {yearOpen && (
              <div className="relative z-10 mt-4 border-t border-slate-700 pt-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {yearGroup.months.map((month) => {
                    const monthRatio = Math.min(
                      100,
                      Math.round((month.total / maxMonthTotal) * 100)
                    );

                    return (
                      <div
                        key={month.key}
                        className="cashflow-card-month relative overflow-hidden rounded-2xl border border-slate-900 bg-white p-3 shadow-[0_8px_18px_rgba(15,23,42,0.08)]"
                      >
                        <button
                          type="button"
                          onClick={() => onSelectMonth(month)}
                          className="flex w-full items-center justify-between gap-3 text-left"
                        >
                          <div className="min-w-0">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                              Měsíc
                            </p>
                            <h3 className="text-lg font-semibold text-slate-900">
                              {month.label}
                            </h3>
                            <p className="mt-1 text-sm text-slate-600">
                              {month.items.length} Smluv
                            </p>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                                Součet
                              </p>
                              <p className="text-base sm:text-lg font-semibold text-slate-950">
                                {formatMoney(month.total)}
                              </p>
                            </div>

                            <span
                              className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/30 bg-black text-[11px] text-white"
                            >
                              ▶
                            </span>
                          </div>
                        </button>

                        <div className="mt-2 h-1.5 rounded-full bg-slate-200">
                          <div
                            className="h-full rounded-full bg-slate-900"
                            style={{ width: `${Math.max(monthRatio, 6)}%` }}
                          />
                        </div>
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
