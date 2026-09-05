import { useState, type CSSProperties } from "react";
import { ArrowUpRight, ChartNoAxesColumnIncreasing } from "lucide-react";

import { formatMoney } from "@/app/lib/formatters";
import { buildYearChart, CHART_MONTH_LABELS, formatChartAmount, isPastCashflowMonth } from "../yearChart";
import type { MonthGroup, YearGroup } from "../types";
import styles from "../yearOverview.module.css";

export function CashflowYearChart({ yearGroup, onSelectMonth }: {
  yearGroup: YearGroup;
  onSelectMonth: (month: MonthGroup) => void;
}) {
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);
  const [focusedMonth, setFocusedMonth] = useState<number | null>(null);
  const chart = buildYearChart(yearGroup);
  const activeIndex = hoveredMonth ?? focusedMonth;
  const active = activeIndex === null ? null : chart.months[activeIndex];
  const highlighted = active ?? chart.strongest;
  const now = new Date();

  return (
    <div className={styles.chart}>
      <div className={styles.chartHeading}>
        <div>
          <h3 className={styles.chartTitle}>
            <ChartNoAxesColumnIncreasing size={19} aria-hidden="true" />
            Vývoj provizí
          </h3>
          <p className={styles.chartSubtitle}>Měsíční částky v Kč</p>
        </div>
        {highlighted && <div className={styles.chartHighlight}>
          <p>{active ? active.totalSource === "paid" ? "Dle výpisu" : "Předpoklad" : "Nejsilnější měsíc"}
            <span aria-hidden="true"> · </span>
            <span className={styles.capitalize}>{highlighted.label.replace(/\s+\d{4}$/, "")}</span>
          </p>
          <strong>{formatMoney(highlighted.total)}</strong>
        </div>}
      </div>

      <div className={styles.chartScroller}>
        <div className={styles.chartCanvas} role="group" aria-label={`Provize po měsících roku ${yearGroup.year}, částky v korunách`}>
          <div className={styles.plotGrid} aria-hidden="true">
            {chart.ticks.map((tick) => <div key={tick.value} className={tick.value === 0 ? styles.zeroLine : styles.gridLine} style={{ top: `${tick.position}%` }}>
              <span>{formatChartAmount(tick.value)}</span>
            </div>)}
          </div>

          <div className={styles.columns}>
            {chart.months.map((month, index) => {
              const isCurrent = yearGroup.year === now.getFullYear() && index === now.getMonth();
              const isPast = isPastCashflowMonth(yearGroup.year, index, now);
              const top = month ? Math.min(chart.position(month.total), chart.zeroPosition) : chart.zeroPosition;
              const height = month ? Math.abs(chart.position(month.total) - chart.zeroPosition) : 0;
              const label = `${CHART_MONTH_LABELS[index]} ${yearGroup.year}`;
              const isNegative = Boolean(month && month.total < 0);
              const valueStyle = {
                "--bar-top": `${top}%`,
                "--bar-height": `${height}%`,
                "--bar-delay": `${index * 25}ms`,
              } as CSSProperties;

              return (
                <button key={index} type="button"
                  className={`${styles.column} ${isPast ? styles.pastColumn : ""} ${isCurrent ? styles.currentColumn : ""} ${month?.totalSource === "paid" ? styles.paidColumn : ""} ${isNegative ? styles.negativeColumn : ""}`}
                  data-month-index={index}
                  data-past-month={isPast || undefined}
                  disabled={!month}
                  aria-label={month ? `${month.label}${isPast ? ", uplynulý měsíc" : ""}: ${formatMoney(month.total)}, ${month.totalSource === "paid" ? "dle výpisu" : "předpoklad"}. Otevřít detail měsíce.` : `${label}${isPast ? ", uplynulý měsíc" : ""}: bez dat v aktuálním výběru`}
                  onClick={() => { if (month) onSelectMonth(month); }}
                  onMouseEnter={() => setHoveredMonth(index)} onMouseLeave={() => setHoveredMonth(null)}
                  onFocus={() => setFocusedMonth(index)} onBlur={() => setFocusedMonth(null)}>
                  <span className={styles.barTrack} aria-hidden="true">
                    {month && month.total !== 0
                      ? <span className={styles.bar} style={valueStyle} />
                      : <span className={month ? styles.zeroMarker : styles.missingMarker} style={{ top: `${chart.zeroPosition}%` }}>{month ? "0" : "—"}</span>}
                  </span>
                  <span className={styles.monthLabel} aria-hidden="true">
                    <span className={styles.fullMonthLabel}>{CHART_MONTH_LABELS[index]}</span>
                    <span className={styles.compactMonthLabel}>{index + 1}</span>
                    {isCurrent && <span className={styles.currentDot} />}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className={styles.chartFooter}>
        <div className={styles.legend} aria-label="Legenda grafu">
          <span><i className={styles.legendPaid} />Dle výpisu</span>
          <span><i className={styles.legendPredicted} />Předpoklad</span>
          {isPastCashflowMonth(yearGroup.year, 0, now) && <span><i className={styles.legendPast} />Uplynulé měsíce</span>}
          {chart.months.some((month) => !month) && <span><i className={styles.legendMissing}>—</i>Bez dat ve výběru</span>}
          {chart.months.some((month) => month && month.total < 0) && <span><i className={styles.legendNegative} />Záporná částka</span>}
        </div>
        <p className={styles.chartHint}><ArrowUpRight size={14} aria-hidden="true" />Kliknutím otevřeš měsíc</p>
      </div>
    </div>
  );
}
