import type { CSSProperties } from "react";
import { ChevronRight } from "lucide-react";

import { formatMoney } from "../helpers";
import introStyles from "../cashflowIntro.module.css";
import type { MonthGroup, YearGroup } from "../types";

type CashflowAccordionProps = {
  yearGroups: YearGroup[];
  expandedYears: Record<number, boolean>;
  onToggleYear: (year: number) => void;
  onSelectMonth: (month: MonthGroup) => void;
  tipsterMode?: boolean;
};

type YearVisual = {
  line: string;
  amount: string;
  progress: string;
  arrow: string;
};

const YEAR_VISUAL: YearVisual = {
  line: "from-[#c878ff] via-[#ac62f8] to-[#8f45e8]",
  amount: "text-[#fbf7ff]",
  progress: "from-[#cb81ff] to-[#a759f8]",
  arrow: "group-hover:border-[#c89bff] group-hover:bg-[#a85aff] group-hover:text-[#160d24]",
};

function staggerDelay(variable: "--cf-card-delay" | "--cf-month-delay", delayMs: number): CSSProperties {
  return {
    [variable]: `${delayMs}ms`,
  } as CSSProperties;
}

function monthLabelShort(label: string): string {
  return label.replace(/\s+\d{4}$/, "");
}

function formatItemCount(count: number, singular: string, few: string, many: string): string {
  if (count === 1) return `1 ${singular}`;
  if (count >= 2 && count <= 4) return `${count} ${few}`;
  return `${count} ${many}`;
}

export function CashflowAccordion({
  yearGroups,
  expandedYears,
  onToggleYear,
  onSelectMonth,
  tipsterMode = false,
}: CashflowAccordionProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:gap-5 lg:grid-cols-2">
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
            data-year={yearGroup.year}
            style={staggerDelay("--cf-card-delay", Math.min(yearIndex * 90, 540))}
            className={`cashflow-card-year ${introStyles.yearCard} ${introStyles.yearGhostCard} group relative isolate overflow-hidden rounded-[24px] border border-[#5a2878] bg-[#150e1f] px-3 pb-3 pt-3 ring-1 ring-[#7a35a7]/35 transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-[#8244b9] sm:rounded-[30px] sm:px-5 sm:pb-5 sm:pt-5 ${
              yearOpen ? "lg:col-span-2" : ""
            }`}
          >
            <span
              className={`pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${visual.line}`}
              aria-hidden="true"
            />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(116deg,rgba(73,32,111,0.62)_0%,rgba(31,18,49,0.78)_42%,rgba(18,12,27,0.98)_100%)]" />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,rgba(190,92,255,0.15)_0%,rgba(190,92,255,0)_36%,rgba(164,82,244,0.13)_100%)]" />
            <div className="pointer-events-none absolute -top-24 left-16 h-72 w-px rotate-[34deg] bg-[#9d61ca]/14" />

            <button
              type="button"
              onClick={() => onToggleYear(yearGroup.year)}
              aria-label={`Otevřít cashflow pro rok ${yearGroup.year}`}
              className="relative z-10 w-full text-left"
            >
              <div className="flex items-end justify-between gap-3 md:gap-5">
                <div className="min-w-0 space-y-2 sm:space-y-3">
                  <span className="inline-flex w-fit items-center rounded-[7px] bg-[linear-gradient(135deg,#b85cff_0%,#9d47ed_100%)] px-2.5 py-1 text-[11px] font-black uppercase leading-none tracking-[0.07em] !text-white shadow-[0_8px_16px_rgba(159,72,237,0.34)] sm:px-3 sm:py-1.5 sm:text-[13px] sm:shadow-[0_10px_20px_rgba(159,72,237,0.4)]">
                    {tipsterMode ? "TIPY" : "CASHFLOW"}
                  </span>
                  <div>
                    <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#c8aee4] sm:text-[10px] sm:tracking-[0.18em]">
                      Rok
                    </div>
                    <div className="mt-0.5 font-mono text-[2.1rem] font-black leading-none tracking-[-0.035em] text-[#fbf7ff] [text-shadow:0_3px_18px_rgba(191,127,255,0.2)] sm:mt-1 sm:text-[3.2rem] sm:tracking-[-0.045em]">
                      {yearGroup.year}
                    </div>
                  </div>
                  <p className="text-xs font-medium text-[#c9a7e7] sm:text-sm">
                    {yearGroup.months.length} aktivních měsíců
                  </p>
                </div>

                <div className="flex shrink-0 items-end justify-end gap-2 sm:gap-3">
                  <div className="grid w-[min(44vw,174px)] grid-cols-1 gap-1 sm:max-w-[260px] sm:gap-2 md:w-full">
                    <dl className="px-1 text-right">
                      <dt className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#c8aee4] sm:text-[10px] sm:tracking-[0.14em]">
                        Celkem
                      </dt>
                      <dd className={`mt-0.5 whitespace-nowrap font-mono text-[1.18rem] font-semibold leading-none sm:mt-1 sm:text-[1.55rem] ${visual.amount}`}>
                        {formatMoney(yearGroup.total)}
                      </dd>
                    </dl>

                    <dl className="px-1 text-right">
                      <dt className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#c8aee4] sm:text-[10px] sm:tracking-[0.14em]">
                        Průměr / měsíc
                      </dt>
                      <dd className={`mt-0.5 whitespace-nowrap font-mono text-[1.18rem] font-semibold leading-none sm:mt-1 sm:text-[1.55rem] ${visual.amount}`}>
                        {formatMoney(averagePerActiveMonth)}
                      </dd>
                    </dl>
                  </div>

                  <span
                    className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#a96bdf] bg-[#27183a]/92 text-[#d6b6f5] transition-all duration-200 sm:h-10 sm:w-10 ${visual.arrow} ${
                      yearOpen ? "rotate-90" : ""
                    }`}
                  >
                    <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2.1} />
                  </span>
                </div>
              </div>
            </button>

            {yearOpen ? (
              <div className="relative z-10 mt-3 border-t border-[#7640a6]/62 pt-3 sm:mt-5 sm:pt-5">
                <div className="grid grid-cols-1 gap-2 sm:gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {yearGroup.months.map((month, monthIndex) => {
                    const isPaidMonth = month.totalSource === "paid";
                    const monthRatio = Math.min(
                      100,
                      Math.round((month.total / maxMonthTotal) * 100)
                    );
                    const monthLabelOnly = monthLabelShort(month.label);
                    const itemCountLabel = tipsterMode
                      ? formatItemCount(month.items.length, "tip", "tipy", "tipů")
                      : formatItemCount(month.items.length, "položka", "položky", "položek");

                    return (
                      <button
                        key={month.key}
                        type="button"
                        onClick={() => onSelectMonth(month)}
                        style={staggerDelay("--cf-month-delay", Math.min(monthIndex * 65, 455))}
                        className={`group cashflow-card-month ${introStyles.monthCard} relative isolate min-h-[178px] overflow-hidden rounded-[22px] border border-[#653493] bg-[#150e1f] px-3 py-3 text-left ring-1 ring-[#7a35a7]/22 transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-[#9756d1] sm:min-h-[258px] sm:rounded-[26px] sm:px-4 sm:py-4`}
                      >
                        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(116deg,rgba(66,30,100,0.54)_0%,rgba(29,18,45,0.8)_44%,rgba(18,12,27,0.99)_100%)]" />
                        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,rgba(190,92,255,0.11)_0%,rgba(190,92,255,0)_40%,rgba(164,82,244,0.11)_100%)]" />
                        <div className="pointer-events-none absolute -top-12 left-10 h-52 w-px rotate-[34deg] bg-[#9d61ca]/13" />

                        <div className="relative z-[1] flex h-full flex-col">
                          <div className="flex items-start justify-between gap-3">
                            <div
                              className={`inline-flex w-fit items-center rounded-[8px] px-2.5 py-1 text-[10px] font-black uppercase leading-none tracking-[0.06em] !text-white shadow-[0_8px_16px_rgba(159,72,237,0.32)] sm:rounded-[9px] sm:px-3 sm:py-1.5 sm:text-[11px] sm:tracking-[0.07em] sm:shadow-[0_10px_20px_rgba(159,72,237,0.36)] ${
                                isPaidMonth
                                  ? "bg-[linear-gradient(135deg,#34d399_0%,#16a34a_100%)]"
                                  : "bg-[linear-gradient(135deg,#b85cff_0%,#9d47ed_100%)]"
                              }`}
                            >
                              {tipsterMode
                                ? "TIP provize"
                                : isPaidMonth
                                ? "VYPLACENO"
                                : "PŘEDPOKLAD"}
                            </div>
                            <div className="rounded-full border border-[#9a67d0]/80 bg-[#2e1c43]/92 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-[#d8bcf3] sm:px-2.5 sm:py-1 sm:text-[10px] sm:tracking-[0.12em]">
                              {itemCountLabel}
                            </div>
                          </div>

                          <div className="mt-3 sm:mt-4">
                            <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#c8aee4] sm:text-[10px] sm:tracking-[0.16em]">
                              Měsíc
                            </div>
                            <h3 className="mt-0.5 text-[1.45rem] font-bold leading-none tracking-tight text-[#fbf7ff] sm:mt-1 sm:text-[2.2rem]">
                              {monthLabelOnly}
                            </h3>
                            <p className="mt-1 line-clamp-2 text-xs font-medium leading-5 text-[#c9a7e7] sm:mt-1.5 sm:text-sm">
                              {tipsterMode
                                ? "Měsíční výplata podle sjednaných tipů"
                                : isPaidMonth
                                ? "Skutečná výplata podle provizního výpisu"
                                : "Měsíční výplata podle aktivních smluv"}
                            </p>
                          </div>

                          <div
                            className="mt-3 flex min-h-[50px] items-center justify-between gap-2 rounded-[16px] bg-[linear-gradient(135deg,#b967ff_0%,#a95cf9_52%,#9350ea_100%)] px-3 shadow-[0_14px_26px_rgba(168,79,240,0.28)] sm:mt-4 sm:min-h-[60px] sm:gap-3 sm:rounded-[18px] sm:px-4 sm:shadow-[0_18px_34px_rgba(168,79,240,0.34)]"
                          >
                            <div className="min-w-0">
                              <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#2a1640]/78 sm:text-[10px] sm:tracking-[0.14em]">
                                {isPaidMonth ? "Vyplaceno" : "Předpoklad"}
                              </div>
                              <div className="mt-0.5 truncate whitespace-nowrap font-mono text-[1.12rem] font-black leading-none text-[#fbf7ff] sm:text-[1.7rem]">
                                {formatMoney(month.total)}
                              </div>
                            </div>

                            <span
                              className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/45 bg-white/25 text-[#160d24] transition duration-200 group-hover:translate-x-0.5 sm:h-10 sm:w-10 ${visual.arrow}`}
                            >
                              <ChevronRight className="h-4 w-4 sm:h-4.5 sm:w-4.5" strokeWidth={2.2} />
                            </span>
                          </div>

                          <div className="mt-3 h-1 overflow-hidden rounded-full bg-[#3b2454]/88 sm:mt-4 sm:h-1.5">
                            <div
                              className={`h-full rounded-full bg-gradient-to-r ${visual.progress}`}
                              style={{ width: `${Math.max(monthRatio, 7)}%` }}
                            />
                          </div>
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
