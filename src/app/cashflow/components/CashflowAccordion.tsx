import type { CSSProperties } from "react";
import { CalendarRange, ChevronRight } from "lucide-react";

import { formatMoney } from "../helpers";
import introStyles from "../cashflowIntro.module.css";
import type { MonthGroup, YearGroup } from "../types";

type CashflowAccordionProps = {
  yearGroups: YearGroup[];
  expandedYears: Record<number, boolean>;
  onToggleYear: (year: number) => void;
  onSelectMonth: (month: MonthGroup) => void;
};

type YearVisual = {
  line: string;
  iconWrap: string;
  iconText: string;
  amount: string;
  progress: string;
  glow: string;
  arrow: string;
};

const YEAR_VISUAL: YearVisual = {
  line: "from-blue-500 to-blue-500",
  iconWrap: "border-blue-200 bg-blue-50",
  iconText: "text-blue-700",
  amount: "text-blue-800",
  progress: "from-blue-500 to-blue-500",
  glow: "bg-blue-300/35",
  arrow: "group-hover:border-blue-300 group-hover:bg-blue-700 group-hover:text-white",
};

function staggerDelay(variable: "--cf-card-delay" | "--cf-month-delay", delayMs: number): CSSProperties {
  return {
    [variable]: `${delayMs}ms`,
  } as CSSProperties;
}

function monthLabelShort(label: string): string {
  return label.replace(/\s+\d{4}$/, "");
}

export function CashflowAccordion({
  yearGroups,
  expandedYears,
  onToggleYear,
  onSelectMonth,
}: CashflowAccordionProps) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      {yearGroups.map((yearGroup, yearIndex) => {
        const yearOpen = expandedYears[yearGroup.year] ?? false;
        const averagePerActiveMonth =
          yearGroup.total / Math.max(yearGroup.months.length, 1);
        const maxMonthTotal = Math.max(
          ...yearGroup.months.map((month) => month.total),
          1
        );
        const visual = YEAR_VISUAL;

        return (
          <section
            key={yearGroup.year}
            style={staggerDelay("--cf-card-delay", Math.min(yearIndex * 90, 540))}
            className={`cashflow-card-year ${introStyles.yearCard} group relative overflow-hidden rounded-[30px] border border-white/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.96)_0%,rgba(248,250,252,0.95)_56%,rgba(241,245,249,0.93)_100%)] px-4 pb-4 pt-4 shadow-[0_22px_58px_rgba(15,23,42,0.14)] backdrop-blur-[1px] transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-slate-200 hover:shadow-[0_30px_80px_rgba(15,23,42,0.17)] sm:px-5 sm:pb-5 sm:pt-5 ${
              yearOpen ? "lg:col-span-2" : ""
            }`}
          >
            <span
              className={`pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${visual.line}`}
              aria-hidden="true"
            />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,rgba(255,255,255,0.34)_0%,rgba(255,255,255,0)_45%)]" />
            <div
              className={`pointer-events-none absolute -right-16 top-8 h-36 w-36 rounded-full blur-3xl ${visual.glow}`}
              aria-hidden="true"
            />

            <button
              type="button"
              onClick={() => onToggleYear(yearGroup.year)}
              className="relative z-10 flex w-full flex-col gap-4 text-left md:flex-row md:items-center md:justify-between"
            >
              <div className="min-w-0 flex items-center gap-3 sm:gap-4">
                <span
                  className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border shadow-[0_10px_24px_rgba(15,23,42,0.08)] sm:h-14 sm:w-14 ${visual.iconWrap}`}
                >
                  <CalendarRange className={`h-6 w-6 ${visual.iconText}`} strokeWidth={1.9} />
                </span>

                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Cashflow rok
                  </p>
                  <h2 className="mt-0.5 font-mono text-[2rem] font-bold leading-none tracking-tight text-slate-900 sm:text-[2.2rem]">
                    {yearGroup.year}
                  </h2>
                </div>
              </div>

              <div className="flex w-full items-end justify-between gap-3 md:w-auto">
                <div className="grid w-full max-w-[240px] grid-cols-1 gap-2 sm:max-w-[260px]">
                  <dl className="px-1 text-right">
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Celkem
                    </dt>
                    <dd className={`mt-1 whitespace-nowrap font-mono text-[1.55rem] font-semibold leading-none ${visual.amount}`}>
                      {formatMoney(yearGroup.total)}
                    </dd>
                  </dl>

                  <dl className="px-1 text-right">
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Průměr / měsíc
                    </dt>
                    <dd className={`mt-1 whitespace-nowrap font-mono text-[1.55rem] font-semibold leading-none ${visual.amount}`}>
                      {formatMoney(averagePerActiveMonth)}
                    </dd>
                  </dl>
                </div>

                <span
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-all duration-200 ${visual.arrow} ${
                    yearOpen ? "rotate-90" : ""
                  }`}
                >
                  <ChevronRight className="h-5 w-5" strokeWidth={2.1} />
                </span>
              </div>
            </button>

            {yearOpen ? (
              <div className="relative z-10 mt-4 border-t border-slate-200/80 pt-4 sm:mt-5 sm:pt-5">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {yearGroup.months.map((month, monthIndex) => {
                    const monthRatio = Math.min(
                      100,
                      Math.round((month.total / maxMonthTotal) * 100)
                    );
                    const monthLabelOnly = monthLabelShort(month.label);

                    return (
                      <button
                        key={month.key}
                        type="button"
                        onClick={() => onSelectMonth(month)}
                        style={staggerDelay("--cf-month-delay", Math.min(monthIndex * 65, 455))}
                        className={`group cashflow-card-month ${introStyles.monthCard} relative overflow-hidden rounded-2xl border border-slate-200/90 bg-[linear-gradient(145deg,rgba(248,250,252,0.99)_0%,rgba(241,245,249,0.96)_62%,rgba(255,255,255,0.98)_100%)] px-4 py-3 text-left shadow-[0_12px_24px_rgba(15,23,42,0.08)] transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_16px_32px_rgba(15,23,42,0.12)]`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                              Měsíc
                            </div>
                            <h3 className="mt-1 text-[1.6rem] font-bold leading-none tracking-tight text-slate-900 sm:text-[1.75rem]">
                              {monthLabelOnly}
                            </h3>
                            <p className="mt-1.5 text-sm text-slate-600">
                              {month.items.length} smluv
                            </p>
                          </div>

                          <span
                            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 transition ${visual.arrow}`}
                          >
                            <ChevronRight className="h-4 w-4" strokeWidth={2.1} />
                          </span>
                        </div>

                        <div className="mt-3 flex items-end justify-between gap-3">
                          <div>
                            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                              Součet
                            </div>
                            <div className="mt-1 whitespace-nowrap font-mono text-[1.55rem] font-semibold leading-none text-slate-900">
                              {formatMoney(month.total)}
                            </div>
                          </div>

                          <span className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-600 transition group-hover:border-slate-900 group-hover:bg-slate-900 group-hover:text-white">
                            Otevřít
                          </span>
                        </div>

                        <div className="mt-3 h-1.5 rounded-full bg-slate-200/90">
                          <div
                            className={`h-full rounded-full bg-gradient-to-r ${visual.progress}`}
                            style={{ width: `${Math.max(monthRatio, 7)}%` }}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
