"use client";

import { useId } from "react";
import { formatMoney } from "@/app/lib/formatters";
import type { ProjectionResult } from "./projectionModel";
import styles from "./projection.module.css";

export type ChartMetric = "annual" | "cumulative";
export const formatPeriod = (start: Date, end: Date) => `${start.toLocaleDateString("cs-CZ", { month: "2-digit", year: "numeric" })} – ${end.toLocaleDateString("cs-CZ", { month: "2-digit", year: "numeric" })}`;
const compact = new Intl.NumberFormat("cs-CZ", { notation: "compact", maximumFractionDigits: 1 });

export function ProjectionChart({ result, baseline, selected, onSelect, metric, compact: compactLayout = false }: {
  result: ProjectionResult;
  baseline: ProjectionResult | null;
  selected: number;
  onSelect: (index: number) => void;
  metric: ChartMetric;
  compact?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const values = result.years.map(year => metric === "annual" ? year.total : year.cumulative);
  const comparison = baseline?.years.map(year => metric === "annual" ? year.total : year.cumulative);
  const maxValue = Math.max(...values, ...(comparison ?? []), 1) * 1.15;
  const width = 760, height = compactLayout ? 190 : 250, left = 62, right = 16, top = 18, bottom = 28;
  const plotHeight = height - top - bottom;
  const step = (width - left - right) / values.length;
  const x = (index: number) => left + step * (index + 0.5);
  const y = (value: number) => height - bottom - value / maxValue * plotHeight;
  const line = (items: number[]) => items.map((value, index) => `${index ? "L" : "M"} ${x(index)} ${y(value)}`).join(" ");
  const area = `${line(values)} L ${x(values.length - 1)} ${height - bottom} L ${x(0)} ${height - bottom} Z`;
  const yearDescription = (index: number) => {
    const year = result.years[index];
    const annualAndMonthly = `${index + 1}. rok: ${formatMoney(year.total)} za rok · ${formatMoney(year.total / 12)} měsíčně v průměru`;
    return metric === "cumulative" ? `${annualAndMonthly} · ${formatMoney(year.cumulative)} celkem od začátku` : annualAndMonthly;
  };

  return (
    <div className={styles.chartScroll}>
      <div className={styles.chartCanvas}>
        <svg className={styles.chart} viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-title ${id}-description`}>
          <title id={`${id}-title`}>{metric === "annual" ? "Roční provize" : "Kumulativní provize"} na {values.length} let</title>
          <desc id={`${id}-description`}>Vyber rok tlačítky pod grafem. Přesné výplaty jsou v měsíčním přehledu níže.</desc>
          <defs><linearGradient id={`${id}-area`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2ca885" stopOpacity=".22" /><stop offset="100%" stopColor="#2ca885" stopOpacity=".01" /></linearGradient></defs>
          {[0, 1, 2, 3, 4].map(tick => {
            const value = maxValue * tick / 4;
            return <g key={tick}><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} stroke="#e7ece9" strokeDasharray={tick ? "3 5" : undefined} /><text x={left - 12} y={y(value) + 4} textAnchor="end" fill="#7a8780" fontSize="11">{compact.format(value)}</text></g>;
          })}
          <text x={left - 12} y={10} textAnchor="end" fill="#7a8780" fontSize="10">Kč</text>
          {metric === "cumulative" ? <><path d={area} fill={`url(#${id}-area)`} /><path d={line(values)} fill="none" stroke="#16745b" strokeWidth="3" strokeLinejoin="round" /></> : values.map((value, index) => <rect key={index} x={x(index) - Math.min(17, step * .28)} y={y(value)} width={Math.min(34, step * .56)} height={Math.max(0, height - bottom - y(value))} rx="5" fill={index === selected ? "#126e56" : "#b9dccd"} />)}
          {comparison && <path d={line(comparison)} fill="none" stroke="#a08abc" strokeWidth="2.5" strokeDasharray="5 5" strokeLinejoin="round" />}
          <line x1={x(selected)} x2={x(selected)} y1={top} y2={height - bottom} stroke="#126e56" strokeOpacity=".25" strokeDasharray="3 5" />
          <circle cx={x(selected)} cy={y(values[selected])} r="5" fill="#126e56" stroke="white" strokeWidth="3" />
          {values.map((_, index) => <rect key={`hit-${index}`} x={left + index * step} y={top} width={step} height={plotHeight} fill="transparent" className={styles.chartHit} onClick={() => onSelect(index)}><title>{yearDescription(index)}</title></rect>)}
        </svg>
        <div className={styles.chartYears} style={{ gridTemplateColumns: `repeat(${values.length}, minmax(0, 1fr))` }} aria-label="Vybrat rok projekce">
          {result.years.map((year, index) => <button key={index} type="button" aria-pressed={selected === index} aria-label={`${yearDescription(index)} · ${formatPeriod(year.start, year.end)}`} title={yearDescription(index)} onClick={() => onSelect(index)} onKeyDown={event => {
            const next = event.key === "ArrowRight" ? Math.min(values.length - 1, index + 1) : event.key === "ArrowLeft" ? Math.max(0, index - 1) : event.key === "Home" ? 0 : event.key === "End" ? values.length - 1 : null;
            if (next === null) return;
            event.preventDefault(); onSelect(next);
            (event.currentTarget.parentElement?.children[next] as HTMLButtonElement)?.focus();
          }}>{index + 1}<span>. rok</span></button>)}
        </div>
      </div>
    </div>
  );
}
