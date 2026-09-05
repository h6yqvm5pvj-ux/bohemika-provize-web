"use client";

import { useEffect, useId, useMemo, useRef, useState, type PointerEvent } from "react";
import { Download, Minus, Plus, RotateCcw } from "lucide-react";
import { goldHistoryCsv, goldMoney, normalizeGoldPoints, summarizeGoldPoints, type GoldPoint } from "./goldModel";
import styles from "./gold.module.css";

const dateLabel = (t: number) => new Date(t).toLocaleDateString("cs-CZ");

export function GoldPriceChart({ points, unitLabel }: { points: GoldPoint[]; unitLabel: string }) {
  const gradientId = useId();
  const hintId = useId();
  const container = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; start: number; count: number } | null>(null);
  const [width, setWidth] = useState(760);
  const [windowRange, setWindowRange] = useState<{ start: number; count: number } | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [panning, setPanning] = useState(false);
  const data = useMemo(() => normalizeGoldPoints(points), [points]);
  const count = Math.min(data.length, windowRange?.count ?? data.length);
  const start = Math.min(Math.max(0, windowRange?.start ?? 0), data.length - count);
  const visible = useMemo(() => data.slice(start, start + count), [data, start, count]);
  const stats = useMemo(() => summarizeGoldPoints(visible), [visible]);
  const minCount = Math.min(20, data.length);
  const height = width < 500 ? 220 : 260;
  const tickCount = width < 500 ? 3 : 5;
  const pad = { left: 66, right: 12, top: 14, bottom: 30 };
  const innerWidth = Math.max(1, width - pad.left - pad.right);
  const bottom = height - pad.bottom;
  const spread = stats ? Math.max(stats.max.v - stats.min.v, stats.max.v * 0.02) : 1;
  const min = stats ? stats.min.v - spread * 0.12 : 0;
  const max = stats ? stats.max.v + spread * 0.12 : 1;
  const xOf = (t: number) => stats ? pad.left + (t - stats.first.t) / Math.max(1, stats.last.t - stats.first.t) * innerWidth : pad.left;
  const yOf = (v: number) => pad.top + (1 - (v - min) / (max - min)) * (bottom - pad.top);
  const path = visible.map((p, i) => `${i ? "L" : "M"}${xOf(p.t).toFixed(2)},${yOf(p.v).toFixed(2)}`).join(" ");
  const active = visible[Math.min(selected ?? count - 1, count - 1)];

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.floor(entry.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const zoom = (factor: number) => {
    const nextCount = Math.max(minCount, Math.min(data.length, Math.round(count * factor)));
    const center = start + (count - 1) / 2;
    setWindowRange({ start: Math.max(0, Math.min(data.length - nextCount, Math.round(center - (nextCount - 1) / 2))), count: nextCount });
    setSelected(null);
  };
  const pointerX = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return (event.clientX - rect.left) / rect.width * width;
  };
  const inspect = (event: PointerEvent<SVGSVGElement>) => {
    const x = pointerX(event);
    if (drag.current) {
      const shifted = drag.current.start - Math.round((x - drag.current.x) / innerWidth * drag.current.count);
      setWindowRange({ start: Math.max(0, Math.min(data.length - count, shifted)), count });
      return;
    }
    let nearest = 0;
    for (let i = 1; i < visible.length; i++) if (Math.abs(xOf(visible[i].t) - x) < Math.abs(xOf(visible[nearest].t) - x)) nearest = i;
    setSelected(nearest);
  };
  const stopPan = () => { drag.current = null; setPanning(false); };
  const download = () => {
    const url = URL.createObjectURL(new Blob([goldHistoryCsv(data, unitLabel)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `zlato-${unitLabel.replace(/\s/g, "")}-${new Date(data[0].t).toISOString().slice(0, 10)}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <div ref={container} className={styles.chart}>
    {!stats || data.length < 2 ? <div className={styles.emptyChart}>Pro toto období zatím není dost cenových bodů. Zkus delší období.</div> : <>
      <div className={styles.chartToolbar}>
        <dl className={styles.chartStats}>
          <div><dt>Minimum</dt><dd>{goldMoney(stats.min.v)}</dd></div>
          <div><dt>Maximum</dt><dd>{goldMoney(stats.max.v)}</dd></div>
          <div><dt>{count < data.length ? "Změna ve výřezu" : "Změna za období"}</dt><dd className={stats.change < 0 ? styles.negative : styles.positive}>{stats.change >= 0 ? "+" : ""}{stats.change.toLocaleString("cs-CZ", { maximumFractionDigits: 2 })} %</dd></div>
        </dl>
        <div className={styles.chartActions}>
          <button type="button" className={styles.iconButton} onClick={() => zoom(0.7)} disabled={count <= minCount} aria-label="Přiblížit graf" title="Přiblížit graf"><Plus size={16} /></button>
          <button type="button" className={styles.iconButton} onClick={() => zoom(1.4)} disabled={count >= data.length} aria-label="Oddálit graf" title="Oddálit graf"><Minus size={16} /></button>
          <button type="button" className={styles.iconButton} onClick={() => { setWindowRange(null); setSelected(null); }} disabled={count >= data.length} aria-label="Zobrazit celé období" title="Zobrazit celé období"><RotateCcw size={15} /></button>
          <button type="button" className={styles.secondaryButton} onClick={download} title="Stáhnout celé vybrané období" aria-label="Exportovat historii vybraného období do CSV"><Download size={15} />CSV</button>
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className={styles.priceGraph} style={{ height, cursor: panning ? "grabbing" : "crosshair" }} role="img" tabIndex={0}
        aria-label={`Vývoj ceny zlata v Kč za ${unitLabel}`} aria-describedby={hintId}
        onPointerMove={inspect} onPointerDown={event => {
          if (event.button !== 0) return;
          inspect(event);
          if (count < data.length) { drag.current = { x: pointerX(event), start, count }; setPanning(true); event.currentTarget.setPointerCapture(event.pointerId); }
        }} onPointerUp={stopPan} onPointerCancel={stopPan} onLostPointerCapture={stopPan}
        onPointerLeave={() => { if (!drag.current) setSelected(null); }} onBlur={() => setSelected(null)}
        onKeyDown={event => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          setSelected(index => event.key === "Home" ? 0 : event.key === "End" ? count - 1 : Math.max(0, Math.min(count - 1, (index ?? count - 1) + (event.key === "ArrowLeft" ? -1 : 1))));
        }}>
        <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#9862cf" stopOpacity="0.2" /><stop offset="100%" stopColor="#9862cf" stopOpacity="0.01" /></linearGradient></defs>
        {Array.from({ length: 5 }, (_, i) => {
          const value = min + (max - min) * i / 4;
          const y = yOf(value);
          return <g key={i}><line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="#ece8f2" strokeDasharray="3 4" /><text x={pad.left - 10} y={y + 4} textAnchor="end" fill="#8490a0" fontSize="10">{value.toLocaleString("cs-CZ", { notation: "compact", maximumFractionDigits: 1 })} Kč</text></g>;
        })}
        {Array.from({ length: tickCount }, (_, i) => {
          const t = stats.first.t + (stats.last.t - stats.first.t) * i / (tickCount - 1);
          return <text key={i} x={xOf(t)} y={height - 7} textAnchor={i === 0 ? "start" : i === tickCount - 1 ? "end" : "middle"} fill="#8490a0" fontSize="10">{new Date(t).toLocaleDateString("cs-CZ", { month: "short", ...(stats.last.t - stats.first.t < 92 * 86400000 ? { day: "numeric" } : { year: "2-digit" }) })}</text>;
        })}
        <path d={`${path} L${xOf(stats.last.t)},${bottom} L${xOf(stats.first.t)},${bottom} Z`} fill={`url(#${gradientId})`} />
        <path data-price-line d={path} stroke="#8550b7" strokeWidth="2.5" fill="none" strokeLinejoin="round" strokeLinecap="round" />
        {active && <g><line x1={xOf(active.t)} x2={xOf(active.t)} y1={pad.top} y2={bottom} stroke="#aa85cd" strokeDasharray="4 4" opacity={selected == null ? 0 : 1} /><circle cx={xOf(active.t)} cy={yOf(active.v)} r="4.5" fill="#8550b7" stroke="#fff" strokeWidth="2" /></g>}
      </svg>
      <div className={styles.chartDetail}>
        <p aria-live="polite"><span>{selected == null ? "Poslední bod" : "Vybraný bod"} · {dateLabel(active.t)}</span><strong>{goldMoney(active.v)}</strong></p>
        <span id={hintId}>Vyber bod myší, dotykem nebo šipkami.{count < data.length ? " Tažením posuneš výřez." : ""}</span>
      </div>
    </>}
  </div>;
}
