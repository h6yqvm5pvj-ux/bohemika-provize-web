import { ArrowUpRight, CalendarDays, Check, ChevronDown, History } from "lucide-react";

import { formatMoney } from "@/app/lib/formatters";
import type { MonthGroup, YearGroup } from "../types";
import { formatCashflowItemCount } from "../cashflowLabels";
import { buildYearMonthSlots } from "../yearChart";
import { CashflowYearChart } from "./CashflowYearChart";
import styles from "../yearOverview.module.css";

type CashflowAccordionProps = {
  yearGroups: YearGroup[];
  expandedYears: Record<number, boolean>;
  onToggleYear: (year: number) => void;
  onSelectMonth: (month: MonthGroup) => void;
  tipsterMode?: boolean;
};

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
  const now = new Date();

  return (
    <div className={styles.years}>
      {yearGroups.map((yearGroup) => {
        const yearOpen = expandedYears[yearGroup.year] ?? false;
        const average = yearGroup.total / Math.max(yearGroup.months.length, 1);
        const currentYear = yearGroup.year === now.getFullYear();
        const monthSlots = buildYearMonthSlots(yearGroup, now);
        const hasData = yearGroup.months.length > 0;
        const contentId = `cashflow-year-${yearGroup.year}`;

        return (
          <section key={yearGroup.year} data-year={yearGroup.year}
            className={`${styles.year} ${yearOpen ? styles.yearOpen : ""}`}>
            <button type="button" onClick={() => onToggleYear(yearGroup.year)}
              aria-expanded={yearOpen} aria-controls={contentId}
              aria-label={`${yearOpen ? "Sbalit" : "Rozbalit"} provizní kalendář pro rok ${yearGroup.year}`}
              className={styles.yearToggle}>
              <span className={styles.yearIdentity}>
                <span className={styles.yearIcon}><CalendarDays size={22} strokeWidth={1.7} aria-hidden="true" /></span>
                <span>
                  <span className={styles.yearEyebrow}>
                    {tipsterMode ? "Provize z tipů" : "Roční přehled"}
                    <ChevronDown className={styles.yearCompactChevron} size={13} aria-hidden="true" />
                  </span>
                  <span className={styles.yearNumber}>{yearGroup.year}{currentYear && <span className={styles.currentYear}>Letos</span>}</span>
                  <span className={styles.yearMonths}>{formatItemCount(monthSlots.length, "zobrazený měsíc", "zobrazené měsíce", "zobrazených měsíců")}</span>
                </span>
              </span>

              <span className={styles.yearPayout}>
                <span className={styles.yearFigures}>
                  <span className={styles.yearTotalLabel}>Celkem za zobrazené měsíce</span>
                  <span className={styles.yearTotal}>{hasData ? formatMoney(yearGroup.total) : "—"}</span>
                  <span className={styles.yearAverage}>{hasData
                    ? <>Průměr <strong>{formatMoney(average)}</strong> / měs. s daty</>
                    : "Bez dat v aktuálním výběru"}</span>
                </span>
                <span className={styles.yearChevron}><ChevronDown size={18} aria-hidden="true" /></span>
              </span>
            </button>

            <div id={contentId} hidden={!yearOpen}>
              {yearOpen && <div className={styles.yearContent}>
                <CashflowYearChart yearGroup={yearGroup} onSelectMonth={onSelectMonth} />
                <details className={styles.monthsDisclosure} data-months-disclosure={yearGroup.year}>
                  <summary className={styles.monthsHeading}>
                    <span className={styles.monthsTitle}><CalendarDays size={16} aria-hidden="true" />Měsíční přehled</span>
                    <span className={styles.monthsHint}>Částky a jejich podklady</span>
                    <span className={styles.monthsChevron}><ChevronDown size={16} aria-hidden="true" /></span>
                  </summary>
                  <div className={styles.months}>
                    {monthSlots.map(({ key, month, monthIndex, label, current, past }) => {
                      const paid = month?.totalSource === "paid";
                      return (
                        <button key={key} type="button" disabled={!month}
                          onClick={() => { if (month) onSelectMonth(month); }}
                          data-calendar-month={monthIndex}
                          data-past-month={past || undefined}
                          className={`${styles.monthCard} ${past ? styles.pastMonthCard : ""} ${current ? styles.currentMonthCard : ""}`}
                          aria-label={`${label}${past ? ", uplynulý měsíc" : ""}: ${month ? `${formatMoney(month.total)}. Otevřít detail měsíce.` : "bez dat v aktuálním výběru."}`}>
                          <span className={styles.monthCardTop}>
                            <span className={styles.monthName}>{label.replace(/\s+\d{4}$/, "")}</span>
                            {month ? <span className={paid ? styles.paidBadge : styles.predictedBadge}>
                              {paid ? <Check size={12} strokeWidth={2.5} aria-hidden="true" /> : <span className={styles.predictedDot} />}
                              {paid ? "Dle výpisu" : "Předpoklad"}
                            </span> : past && <span className={styles.pastBadge}><History size={11} aria-hidden="true" />Uplynulý</span>}
                          </span>
                          <span className={`${styles.monthAmount} ${month && month.total < 0 ? styles.negativeAmount : ""}`}>{month ? formatMoney(month.total) : "—"}</span>
                          <span className={styles.monthCardBottom}>
                            <span>{month ? formatCashflowItemCount(month.items) : "Bez dat ve výběru"}
                              {past && month && <span> · Uplynulý</span>}
                              {current && <span className={styles.currentMonthText}> · Tento měsíc</span>}
                            </span>
                            {month && <ArrowUpRight size={17} aria-hidden="true" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </details>
              </div>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
