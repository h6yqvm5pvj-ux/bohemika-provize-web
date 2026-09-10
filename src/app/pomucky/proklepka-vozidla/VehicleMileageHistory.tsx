import { useId, useState } from "react";
import { ChevronDown, Gauge } from "lucide-react";
import { VehicleReportIllustration } from "./VehicleReportIllustrations";
import styles from "./vehicleReport.module.css";

type Point = { date: Date | null; label: string; km: number };
const number = (value: number) => Math.round(value).toLocaleString("cs-CZ");
const date = (point: Point) => point.date?.toLocaleDateString("cs-CZ") ?? point.label;

export function VehicleMileageHistory({ points }: { points: Point[] }) {
  const id = useId().replace(/:/g, "");
  const [selected, setSelected] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const active = points[selected ?? points.length - 1];
  const firstTime = points[0]?.date?.getTime();
  const lastTime = points.at(-1)?.date?.getTime();
  const max = Math.max(50_000, Math.ceil(Math.max(0, ...points.map(p => p.km)) / 50_000) * 50_000);
  const mapped = points.map((point, index) => {
    const time = point.date?.getTime();
    const ratio = firstTime != null && lastTime != null && lastTime > firstTime && time != null
      ? (time - firstTime) / (lastTime - firstTime) : points.length > 1 ? index / (points.length - 1) : .5;
    return { x: 48 + ratio * 590, y: 174 - point.km / max * 150 };
  });
  const line = mapped.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ");
  const area = mapped.length > 1 ? `${line} L${mapped.at(-1)!.x},174 L${mapped[0].x},174Z` : "";
  return <section id="vehicle-odometer" className={`${styles.panel} ${styles.mileagePanel}`} aria-label="Historie tachometru">
    <div className={styles.mileageAside}>
      <span className={styles.eyebrow}>Kilometry v čase</span><h3>Historie tachometru</h3>
      {active ? <><div className={styles.mileageNumber}>{number(active.km)} <span>km</span></div><p className={styles.muted}>{selected == null ? "Poslední záznam" : "Vybraný záznam"} · {date(active)}</p><span className={styles.recordCount}>{points.length} záznamů nájezdu</span></> : <p className={styles.empty}>Historie tachometru zatím není dostupná.</p>}
      <VehicleReportIllustration kind="journey" className={styles.journeyArt} />
    </div>
    <div className={styles.mileageContent}>
      {points.length > 0 ? <>
        <svg className={styles.mileageChart} viewBox="0 0 680 210" aria-label="Záznamy nájezdu vozidla">
          <defs><linearGradient id={`${id}-area`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#c5afe4" stopOpacity=".38" /><stop offset="1" stopColor="#c5afe4" stopOpacity=".03" /></linearGradient></defs>
          {[0, .5, 1].map(tick => <g key={tick}><line x1="48" x2="638" y1={174 - tick * 150} y2={174 - tick * 150} stroke="#ede8f2" strokeDasharray="3 6" /><text x="35" y={178 - tick * 150} textAnchor="end" fill="#95899f" fontSize="10">{Math.round(max * tick / 1000)} tis.</text></g>)}
          {area && <path d={area} fill={`url(#${id}-area)`} />}
          {line && <path d={line} stroke="#9570c6" strokeWidth="2.5" fill="none" strokeLinejoin="round" strokeLinecap="round" />}
          {mapped.map((p, i) => <g key={`${points[i].label}-${i}`} role="button" tabIndex={0} aria-label={`${date(points[i])}: ${number(points[i].km)} km`}
            className={styles.chartPoint} onMouseEnter={() => setSelected(i)} onFocus={() => setSelected(i)} onClick={() => setSelected(i)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(i); } }}>
            <circle cx={p.x} cy={p.y} r="13" fill="transparent" />
            {i === (selected ?? points.length - 1) && <circle cx={p.x} cy={p.y} r="10" fill="#e8dcf7" />}
            <circle cx={p.x} cy={p.y} r="4.5" fill={i === (selected ?? points.length - 1) ? "#8050bc" : "white"} stroke="#9570c6" strokeWidth="2" />
          </g>)}
          <text x="48" y="201" fill="#95899f" fontSize="11">{date(points[0])}</text>
          {points.length > 1 && <text x="638" y="201" fill="#95899f" fontSize="11" textAnchor="end">{date(points.at(-1)!)}</text>}
        </svg>
        <div className={styles.chartFooter}><span><Gauge size={14} />Údaje z evidovaných kontrol</span><button type="button" className={styles.textButton} aria-expanded={expanded} aria-controls={`${id}-records`} onClick={() => setExpanded(!expanded)}>{expanded ? "Skrýt záznamy" : "Všechny záznamy"}<ChevronDown size={14} className={expanded ? styles.rotated : ""} /></button></div>
        {expanded && <div id={`${id}-records`} className={styles.mileageRecords}>{[...points].reverse().map((point, i) => <div key={`${point.label}-${i}`}><span>{date(point)}</span><strong>{number(point.km)} km</strong></div>)}</div>}
      </> : <div className={styles.chartEmpty}><Gauge size={35} strokeWidth={1.2} /><span>Jakmile bude dostupný záznam,<br />zobrazí se tady.</span></div>}
    </div>
  </section>;
}
