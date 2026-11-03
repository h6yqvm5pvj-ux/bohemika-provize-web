import { useEffect, useId, useMemo, useState, type CSSProperties } from "react";
import { ArrowDown, ArrowUpRight, ChartLine, Minus, TrendingDown, TrendingUp } from "lucide-react";

import { formatMoney } from "@/app/lib/formatters";
import { cashflowMonthSourceLabel, paidSubscriptionAmount } from "../cashflowLabels";
import { buildYearChart, cashflowMonthPercentageChange, CHART_MONTH_LABELS, formatChartAmount, isPastCashflowMonth } from "../yearChart";
import { buildCashflowLineSegments, CASHFLOW_PLOT_HEIGHT, CASHFLOW_PLOT_WIDTH } from "../cashflowLineGraph";
import { CASHFLOW_CURVE_REVEAL_MS, useCashflowChartReveal } from "../useCashflowChartReveal";
import type { MonthGroup, YearGroup } from "../types";
import styles from "../yearOverview.module.css";

const POINT_COLORS = { paid: "#398169", predicted: "#9560c8", past: "#9ca8ba", negative: "#cc718e" } as const;
const percentageFormatter = new Intl.NumberFormat("cs-CZ", { style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero" });

function pointTone(month: MonthGroup, past: boolean): keyof typeof POINT_COLORS {
  if (month.total < 0) return "negative";
  if (month.totalSource === "paid") return "paid";
  return past ? "past" : "predicted";
}

export function CashflowYearChart({ yearGroup, previousMonth = null, onSelectMonth }: {
  yearGroup: YearGroup;
  previousMonth?: MonthGroup | null;
  onSelectMonth: (month: MonthGroup) => void;
}) {
  const plotRef = useCashflowChartReveal();
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);
  const [focusedMonth, setFocusedMonth] = useState<number | null>(null);
  const [activeInput, setActiveInput] = useState<"pointer" | "focus">("pointer");
  const chart = useMemo(() => buildYearChart(yearGroup), [yearGroup]);
  const segments = useMemo(() => buildCashflowLineSegments(chart.months, chart.position, chart.zeroPosition), [chart]);
  const graphId = `cashflow-graph-${useId().replace(/:/g, "")}`;
  const tooltipId = `${graphId}-tooltip`;
  const activeIndex = activeInput === "focus" ? focusedMonth ?? hoveredMonth : hoveredMonth ?? focusedMonth;
  const active = activeIndex === null ? null : chart.months[activeIndex];
  const comparisonMonth = activeIndex === null ? null : activeIndex === 0 ? previousMonth : chart.months[activeIndex - 1];
  const percentageChange = cashflowMonthPercentageChange(active, comparisonMonth);
  const trend = percentageChange === null ? null : percentageChange > 0 ? "up" : percentageChange < 0 ? "down" : "flat";
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const highlighted = active ?? chart.strongest;
  const now = new Date();
  const zeroY = chart.zeroPosition / 100 * CASHFLOW_PLOT_HEIGHT;

  useEffect(() => {
    if (!active) return;
    const dismissTooltip = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setHoveredMonth(null);
        setFocusedMonth(null);
      }
    };
    document.addEventListener("keydown", dismissTooltip);
    return () => document.removeEventListener("keydown", dismissTooltip);
  }, [active]);

  return (
    <div className={styles.chart}>
      <div className={styles.chartHeading}>
        <div>
          <h3 className={styles.chartTitle}>
            <ChartLine size={19} aria-hidden="true" />
            Vývoj provizí
          </h3>
          <p className={styles.chartSubtitle}>Měsíční částky v Kč</p>
        </div>
        {highlighted && <div className={styles.chartHighlight}>
          <p>{active ? cashflowMonthSourceLabel(active) : "Nejsilnější měsíc"}
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

          <div ref={plotRef} className={styles.linePlot} style={{ "--curve-reveal-duration": `${CASHFLOW_CURVE_REVEAL_MS}ms` } as CSSProperties}>
            <svg className={styles.lineSvg} viewBox={`0 0 ${CASHFLOW_PLOT_WIDTH} ${CASHFLOW_PLOT_HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id={`${graphId}-line`} gradientUnits="userSpaceOnUse" x1="0" x2={CASHFLOW_PLOT_WIDTH} y1="0" y2="0">
                  {chart.months.map((month, index) => month && <stop key={index} offset={`${(index + .5) / 12 * 100}%`}
                    stopColor={POINT_COLORS[pointTone(month, isPastCashflowMonth(yearGroup.year, index, now))]} />)}
                </linearGradient>
                <linearGradient id={`${graphId}-positive`} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="0" y2={zeroY}>
                  <stop offset="0" stopColor={POINT_COLORS.predicted} stopOpacity=".22" />
                  <stop offset="1" stopColor={POINT_COLORS.predicted} stopOpacity=".015" />
                </linearGradient>
                <linearGradient id={`${graphId}-negative`} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={zeroY} y2={CASHFLOW_PLOT_HEIGHT}>
                  <stop offset="0" stopColor={POINT_COLORS.negative} stopOpacity=".015" />
                  <stop offset="1" stopColor={POINT_COLORS.negative} stopOpacity=".2" />
                </linearGradient>
                <clipPath id={`${graphId}-above-zero`}><rect x="0" y="0" width={CASHFLOW_PLOT_WIDTH} height={zeroY} /></clipPath>
                <clipPath id={`${graphId}-below-zero`}><rect x="0" y={zeroY} width={CASHFLOW_PLOT_WIDTH} height={CASHFLOW_PLOT_HEIGHT - zeroY} /></clipPath>
                <clipPath id={`${graphId}-reveal`} clipPathUnits="userSpaceOnUse">
                  <rect className={styles.lineRevealMask} data-curve-reveal-mask="" x="0" y="-16" width={CASHFLOW_PLOT_WIDTH} height={CASHFLOW_PLOT_HEIGHT + 32} />
                </clipPath>
              </defs>
              <g clipPath={`url(#${graphId}-reveal)`}>
                {segments.map(segment => <g key={segment.linePath}>
                  <path d={segment.fillPath} fill={`url(#${graphId}-positive)`} clipPath={`url(#${graphId}-above-zero)`} />
                  <path d={segment.fillPath} fill={`url(#${graphId}-negative)`} clipPath={`url(#${graphId}-below-zero)`} />
                  <path className={styles.linePath} d={segment.linePath} stroke={`url(#${graphId}-line)`} fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                </g>)}
              </g>
            </svg>

            <div className={styles.lineTargets}>
              {chart.months.map((month, index) => {
                const isCurrent = yearGroup.year === now.getFullYear() && index === now.getMonth();
                const isPast = isPastCashflowMonth(yearGroup.year, index, now);
                const top = month ? chart.position(month.total) : chart.zeroPosition;
                const label = `${CHART_MONTH_LABELS[index]} ${yearGroup.year}`;

                return (
                  <button key={index} type="button"
                    className={`${styles.lineMonthTarget} ${isCurrent ? styles.currentColumn : ""}`}
                    data-month-index={index}
                    data-active={month && activeIndex === index || undefined}
                    data-tone={month ? pointTone(month, isPast) : undefined}
                    data-past-month={isPast || undefined}
                    style={{ "--point-reveal-delay": `${(index + .5) / 12 * CASHFLOW_CURVE_REVEAL_MS}ms` } as CSSProperties}
                    aria-current={isCurrent ? "date" : undefined}
                    aria-describedby={month && activeIndex === index ? tooltipId : undefined}
                    disabled={!month}
                    aria-label={month ? `${month.label}${isCurrent ? ", aktuální měsíc" : isPast ? ", uplynulý měsíc" : ""}: ${formatMoney(month.total)}, ${cashflowMonthSourceLabel(month).toLocaleLowerCase("cs-CZ")}. Otevřít detail měsíce.` : `${label}${isCurrent ? ", aktuální měsíc" : isPast ? ", uplynulý měsíc" : ""}: bez dat v aktuálním výběru`}
                    onClick={() => { if (month) onSelectMonth(month); }}
                    onMouseEnter={() => { setHoveredMonth(index); setActiveInput("pointer"); }} onMouseLeave={() => setHoveredMonth(null)}
                    onFocus={() => { setFocusedMonth(index); setActiveInput("focus"); }} onBlur={() => setFocusedMonth(null)}>
                    <span className={styles.linePointTrack} aria-hidden="true">
                      {isCurrent && <ArrowDown className={styles.currentMonthArrow} size={18} strokeWidth={2.3} style={{ top: `${top}%` }} />}
                      {month
                        ? <span className={styles.linePoint} data-tone={pointTone(month, isPast)} style={{ top: `${top}%` }} />
                        : <span className={styles.missingMarker} style={{ top: `${chart.zeroPosition}%` }}>—</span>}
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
            {active && activeIndex !== null && <div id={tooltipId} role="tooltip" className={styles.lineTooltip}
              data-has-trend={percentageChange !== null || undefined}
              style={{ "--tooltip-x": `${(activeIndex + .5) / 12 * 100}cqw`, "--tooltip-y": `${chart.position(active.total)}%` } as CSSProperties}>
              {percentageChange !== null && <span className={styles.lineTooltipTrend} data-trend={trend}>
                <TrendIcon size={20} aria-hidden="true" />
                <span>{percentageFormatter.format(percentageChange / 100)}</span>
              </span>}
              <span className={styles.lineTooltipDetails}>
                <span className={styles.lineTooltipMonth}>{active.label}</span>
                <strong className={styles.lineTooltipAmount}>{formatMoney(active.total)}</strong>
              </span>
              <span className={styles.lineTooltipSource}>{cashflowMonthSourceLabel(active)}</span>
              {percentageChange !== null && comparisonMonth && <span className={styles.lineTooltipComparison}>
                vs. {comparisonMonth.label.toLocaleLowerCase("cs-CZ")}
                {cashflowMonthSourceLabel(active) !== cashflowMonthSourceLabel(comparisonMonth) && <> · {cashflowMonthSourceLabel(comparisonMonth)}</>}
              </span>}
            </div>}
          </div>
        </div>
      </div>

      <div className={styles.chartFooter}>
        <div className={styles.legend} aria-label="Legenda grafu">
          <span><i className={styles.legendPaid} />{yearGroup.months.some(month => paidSubscriptionAmount(month) !== 0) ? "Výpis a předplatné" : "Dle výpisu"}</span>
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
